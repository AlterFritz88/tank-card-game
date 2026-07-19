import { randomUUID } from "node:crypto";
import { applyAction } from "../../tank-card-game/src/game/engine";
import { createInitialBattleState } from "../../tank-card-game/src/game/initialState";
import {
  calculateDeckWeight,
  getDefaultDeckWeight,
} from "../../tank-card-game/src/game/deckWeight";
import {
  RADIO_DUEL_MAX_ACTIVE,
  RADIO_DUEL_ENTRY_MS,
  RADIO_DUEL_ENTRY_WARNING_MS,
  RADIO_DUEL_TIMEOUT_DAMAGE,
  RADIO_DUEL_TURN_MS,
  type RadioDuelEvent,
  type RadioDuelLiveUpdate,
  type RadioDuelListResult,
  type RadioDuelOpenResult,
  type RadioDuelSummary,
} from "../../tank-card-game/src/game/radioDuel";
import type {
  BattleAction,
  BattleState,
  HeadquartersId,
  PlayerId,
} from "../../tank-card-game/src/game/types";
import type { MatchEndReason } from "../../tank-card-game/src/game/modes";
import { getRandomBattleBackgroundId } from "./battleBackgrounds";
import { createBattleViewForPlayer } from "./battleView";
import type { PlayerProfileManager } from "./playerProfiles";
import { JsonDocumentStore } from "./sqliteStore";
import { getOpponentRewardMultiplier } from "./specialBattleRewards";

const DEFAULT_RATING = 1000;
const ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1_000;
const RECENT_OPPONENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const RADIO_DUEL_MAX_DECK_WEIGHT_DIFFERENCE = 50;

type RadioPlayer = {
  accountId: string;
  nickname: string;
  headquartersId: HeadquartersId;
  deckCardIds: string[] | null;
  ratingAtStart: number;
};

type StoredTurn = {
  version: number;
  turn: number;
  playerId: PlayerId;
  baseBattle: BattleState;
  actions: BattleAction[];
};

type RadioReplayAction = Extract<
  BattleAction,
  { type: "MOVE_UNIT" | "ATTACK" | "PLAY_CARD" | "PLAY_SUPPORT_CARD" }
>;

type StoredDuel = {
  id: string;
  players: Record<PlayerId, RadioPlayer>;
  battle: BattleState;
  createdAt: number;
  updatedAt: number;
  deadlineAt: number | null;
  activeTurnOpenedAt?: number | null;
  entryWarningSent?: boolean;
  currentTurnBaseBattle: BattleState;
  currentTurnActions: BattleAction[];
  lastTurn: StoredTurn | null;
  seenTurnVersion: Record<PlayerId, number>;
  rated: boolean;
  endReason?: MatchEndReason | null;
  resultSeen?: Record<PlayerId, boolean>;
  rewardsGranted?: Record<PlayerId, boolean>;
};

type QueueEntry = RadioPlayer & {
  queuedAt: number;
};

type RadioDuelDb = {
  ratings: Record<string, number>;
  queue: QueueEntry[];
  duels: Record<string, StoredDuel>;
};

const EMPTY_DB: RadioDuelDb = { ratings: {}, queue: [], duels: {} };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "player" ? "bot" : "player";
}

function isRadioReplayAction(action: BattleAction): action is RadioReplayAction {
  return action.type === "MOVE_UNIT" ||
    action.type === "ATTACK" ||
    action.type === "PLAY_CARD" ||
    action.type === "PLAY_SUPPORT_CARD";
}

function winnerOf(battle: BattleState): PlayerId | null {
  if (battle.status === "player_won") return "player";
  if (battle.status === "bot_won") return "bot";
  return null;
}

function destroyedUnitCount(battle: BattleState, playerId: PlayerId): number {
  const destroyed = playerId === "player"
    ? battle.stats.destroyedByPlayer
    : battle.stats.destroyedByBot;
  return Object.values(destroyed).reduce(
    (total, value) => total + (Number.isFinite(value) ? value : 0),
    0
  );
}

export class RadioDuelManager {
  private readonly store = new JsonDocumentStore<RadioDuelDb>(
    "radio-duels",
    EMPTY_DB
  );
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly profiles: PlayerProfileManager,
    private readonly notify: (accountId: string, event: RadioDuelEvent) => boolean,
    private readonly pushLiveUpdate: (
      accountId: string,
      update: RadioDuelLiveUpdate
    ) => boolean
  ) {
    this.sweepTimer = setInterval(() => this.sweepTimeouts(), 60_000);
    this.sweepTimer.unref?.();
  }

  getAdminStats(): { activeRadioDuels: number; completedRadioDuels: number } {
    const db = this.store.read();
    this.processTimeouts(db);

    let activeRadioDuels = 0;
    let completedRadioDuels = 0;
    for (const duel of Object.values(db.duels)) {
      if (duel.battle.status === "active") activeRadioDuels += 1;
      else completedRadioDuels += 1;
    }

    this.store.write(db);
    return { activeRadioDuels, completedRadioDuels };
  }

  hasAccess(accountId: string, duelId: string): boolean {
    const duel = this.store.read().duels[duelId];
    return Boolean(duel && this.getPlayerId(duel, accountId));
  }

  list(accountId: string): RadioDuelListResult {
    const db = this.store.read();
    this.processTimeouts(db);
    const games = Object.values(db.duels)
      .filter(
        (duel) => {
          const localPlayerId = this.getPlayerId(duel, accountId);
          const unseenLegacyResult = Boolean(
            localPlayerId &&
            duel.lastTurn &&
            duel.lastTurn.playerId !== localPlayerId &&
            duel.seenTurnVersion[localPlayerId] < duel.lastTurn.version
          );
          return Boolean(
            localPlayerId &&
            (duel.battle.status === "active" ||
              (duel.resultSeen
                ? !duel.resultSeen[localPlayerId]
                : unseenLegacyResult))
          );
        }
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((duel) => this.toSummary(db, duel, accountId));
    const queued = db.queue.find((entry) => entry.accountId === accountId);
    this.store.write(db);

    return {
      games,
      queue: {
        queued: Boolean(queued),
        queuedAt: queued?.queuedAt ?? null,
        headquartersId: queued?.headquartersId ?? null,
        deckWeight: queued ? this.getDeckWeight(queued) : null,
      },
      rating: this.getRating(db, accountId),
      maxActiveGames: RADIO_DUEL_MAX_ACTIVE,
    };
  }

  queue(
    accountId: string,
    headquartersId: HeadquartersId,
    deckCardIds: unknown
  ): RadioDuelListResult {
    const db = this.store.read();
    this.processTimeouts(db);
    const activeCount = Object.values(db.duels).filter(
      (duel) =>
        duel.battle.status === "active" &&
        this.getPlayerId(duel, accountId) !== null
    ).length;
    if (activeCount >= RADIO_DUEL_MAX_ACTIVE) {
      throw new Error(`Одновременно можно вести не более ${RADIO_DUEL_MAX_ACTIVE} радиодуэлей`);
    }
    if (db.queue.some((entry) => entry.accountId === accountId)) {
      throw new Error("Вы уже ожидаете соперника");
    }

    const validDeck = Array.isArray(deckCardIds)
      ? this.profiles.validatePlayableDeck(accountId, headquartersId, deckCardIds)
      : null;
    const profile = this.profiles.getProfile(accountId, { touchActivity: false });
    const entry: QueueEntry = {
      accountId,
      nickname: profile.nickname || "Commander",
      headquartersId,
      deckCardIds: validDeck,
      ratingAtStart: this.getRating(db, accountId),
      queuedAt: Date.now(),
    };

    const candidate = this.findCandidate(db, entry);
    if (candidate) {
      db.queue = db.queue.filter((item) => item.accountId !== candidate.accountId);
      const duel = this.createDuel(candidate, entry);
      db.duels[duel.id] = duel;
      this.notify(candidate.accountId, {
        kind: "match_found",
        duelId: duel.id,
        title: "Соперник найден",
        message: `Радиодуэль с ${entry.nickname} началась.`,
      });
    } else {
      db.queue.push(entry);
    }
    this.store.write(db);
    return this.list(accountId);
  }

  cancelQueue(accountId: string): RadioDuelListResult {
    const db = this.store.read();
    db.queue = db.queue.filter((entry) => entry.accountId !== accountId);
    this.store.write(db);
    return this.list(accountId);
  }

  open(accountId: string, duelId: string): RadioDuelOpenResult {
    const db = this.store.read();
    this.processTimeouts(db);
    const duel = db.duels[duelId];
    if (!duel) throw new Error("Радиодуэль не найдена");
    const localPlayerId = this.getPlayerId(duel, accountId);
    if (!localPlayerId) throw new Error("Нет доступа к этой радиодуэли");

    const lastTurn = duel.lastTurn;
    const hasUnseenOpponentTurn = Boolean(
      lastTurn &&
      lastTurn.playerId !== localPlayerId &&
      duel.seenTurnVersion[localPlayerId] < lastTurn.version
    );
    const hasPendingReplay = Boolean(
      hasUnseenOpponentTurn &&
      lastTurn?.actions.some(isRadioReplayAction)
    );

    // A turn containing only END_TURN (or other non-visual bookkeeping
    // actions) has nothing useful to replay. Mark it as seen immediately so
    // the client receives the current battle instead of the stale base frame,
    // and so opening the duel starts the active player's short turn timer.
    if (lastTurn && hasUnseenOpponentTurn && !hasPendingReplay) {
      duel.seenTurnVersion[localPlayerId] = Math.max(
        duel.seenTurnVersion[localPlayerId] ?? 0,
        lastTurn.version
      );
    }

    // До открытия партии действует длинное окно ожидания. Первый вход игрока,
    // чей сейчас ход, запускает короткий трёхминутный таймер самого хода.
    if (
      duel.battle.status === "active" &&
      duel.battle.activePlayer === localPlayerId &&
      duel.activeTurnOpenedAt == null &&
      !hasPendingReplay
    ) {
      const now = Date.now();
      duel.activeTurnOpenedAt = now;
      duel.deadlineAt = now + RADIO_DUEL_TURN_MS;
      duel.updatedAt = now;
    }

    let replay: RadioDuelOpenResult["replay"] = null;
    if (lastTurn && hasPendingReplay) {
      let replayBattle = clone(lastTurn.baseBattle);
      const frames = [createBattleViewForPlayer(replayBattle, localPlayerId)];
      const actions: RadioReplayAction[] = [];
      for (const action of lastTurn.actions) {
        replayBattle = applyAction(replayBattle, action);
        if (!isRadioReplayAction(action)) continue;
        actions.push(clone(action));
        frames.push(createBattleViewForPlayer(replayBattle, localPlayerId));
      }
      replay = { version: lastTurn.version, turn: lastTurn.turn, actions, frames };
    }
    this.store.write(db);

    return {
      duel: this.toSummary(db, duel, accountId),
      battle: createBattleViewForPlayer(duel.battle, localPlayerId),
      replay,
    };
  }

  markReplaySeen(accountId: string, duelId: string, version: number): void {
    const db = this.store.read();
    const duel = db.duels[duelId];
    if (!duel) throw new Error("Радиодуэль не найдена");
    const localPlayerId = this.getPlayerId(duel, accountId);
    if (!localPlayerId) throw new Error("Нет доступа к этой радиодуэли");
    if (!Number.isInteger(version) || version <= 0) return;

    const availableVersion = duel.lastTurn?.version ?? 0;
    duel.seenTurnVersion[localPlayerId] = Math.max(
      duel.seenTurnVersion[localPlayerId] ?? 0,
      Math.min(version, availableVersion)
    );
    this.store.write(db);
  }

  surrender(accountId: string, duelId: string): RadioDuelOpenResult {
    const db = this.store.read();
    this.processTimeouts(db);
    const duel = db.duels[duelId];
    if (!duel) throw new Error("Радиодуэль не найдена");
    const localPlayerId = this.getPlayerId(duel, accountId);
    if (!localPlayerId) throw new Error("Нет доступа к этой радиодуэли");
    if (duel.battle.status !== "active") {
      throw new Error("Радиодуэль уже завершена");
    }

    const previousBattle = clone(duel.battle);
    duel.battle.status = localPlayerId === "player" ? "bot_won" : "player_won";
    duel.battle.log.push(`${duel.players[localPlayerId].nickname} сдался.`);
    duel.updatedAt = Date.now();
    duel.deadlineAt = null;
    duel.activeTurnOpenedAt = null;
    duel.endReason = "surrender";
    this.finalizeRating(db, duel);

    const opponentId = opponentOf(localPlayerId);
    const opponent = duel.players[opponentId];
    this.notify(opponent.accountId, {
      kind: "opponent_surrendered",
      duelId: duel.id,
      title: "Победа в радиодуэли",
      message: `${duel.players[localPlayerId].nickname} сдался.`,
    });
    // A player who is currently watching this duel needs the terminal battle
    // state immediately. The general notification above remains the fallback
    // for the duel list and closed/background tabs. END_TURN is only a neutral
    // transport marker here: the client uses the supplied before/after frames
    // and therefore shows no fake battle animation before the victory screen.
    this.pushLiveUpdate(opponent.accountId, {
      duelId: duel.id,
      duel: this.toSummary(db, duel, opponent.accountId),
      action: { type: "END_TURN", playerId: localPlayerId },
      before: createBattleViewForPlayer(previousBattle, opponentId),
      after: createBattleViewForPlayer(duel.battle, opponentId),
    });
    this.store.write(db);
    return this.open(accountId, duelId);
  }

  claimReward(accountId: string, duelId: string) {
    const db = this.store.read();
    this.processTimeouts(db);
    const duel = db.duels[duelId];
    if (!duel) throw new Error("Радиодуэль не найдена");
    const localPlayerId = this.getPlayerId(duel, accountId);
    if (!localPlayerId) throw new Error("Нет доступа к этой радиодуэли");
    if (duel.battle.status === "active") {
      throw new Error("Радиодуэль ещё не завершена");
    }

    const opponentId = opponentOf(localPlayerId);
    const result = this.profiles.claimBattleReward(accountId, {
      claimId: `radio:${duel.id}:${localPlayerId}`,
      battle: duel.battle,
      mode: "radio",
      localPlayerId,
      matchEndReason: duel.endReason ?? null,
      localDeckWeight: this.getDeckWeight(duel.players[localPlayerId]),
      opponentDeckWeight: this.getDeckWeight(duel.players[opponentId]),
      specialRewardMultiplier: getOpponentRewardMultiplier(
        duel.players[opponentId].nickname
      ),
    });
    duel.resultSeen = duel.resultSeen ?? { player: false, bot: false };
    duel.resultSeen[localPlayerId] = true;
    this.store.write(db);
    return result;
  }

  act(accountId: string, duelId: string, requestedAction: BattleAction): RadioDuelOpenResult {
    const db = this.store.read();
    this.processTimeouts(db);
    const duel = db.duels[duelId];
    if (!duel) throw new Error("Радиодуэль не найдена");
    const localPlayerId = this.getPlayerId(duel, accountId);
    if (!localPlayerId) throw new Error("Нет доступа к этой радиодуэли");
    if (duel.battle.status !== "active") throw new Error("Радиодуэль уже завершена");
    if (duel.battle.activePlayer !== localPlayerId) throw new Error("Сейчас ход соперника");
    if (requestedAction.type === "BEGIN_BATTLE" || requestedAction.type === "TIMER_TICK") {
      throw new Error("Недопустимое действие");
    }

    const action = { ...requestedAction, playerId: localPlayerId } as BattleAction;
    const previousBattle = clone(duel.battle);
    const before = JSON.stringify(duel.battle);
    const previousActive = duel.battle.activePlayer;
    const next = applyAction(duel.battle, action);
    if (JSON.stringify(next) === before) throw new Error("Действие невозможно");

    duel.battle = next;
    duel.currentTurnActions.push(action);
    duel.updatedAt = Date.now();
    const turnCompleted = next.activePlayer !== previousActive || next.status !== "active";
    let completedVersion: number | null = null;
    if (turnCompleted) {
      const version = (duel.lastTurn?.version ?? 0) + 1;
      completedVersion = version;
      duel.lastTurn = {
        version,
        turn: duel.currentTurnBaseBattle.turn,
        playerId: localPlayerId,
        baseBattle: duel.currentTurnBaseBattle,
        actions: duel.currentTurnActions,
      };
      duel.currentTurnBaseBattle = clone(next);
      duel.currentTurnActions = [];
      duel.activeTurnOpenedAt = null;
      duel.entryWarningSent = false;
      duel.deadlineAt = next.status === "active" ? Date.now() + RADIO_DUEL_ENTRY_MS : null;
      this.finalizeRating(db, duel);

      const opponent = duel.players[opponentOf(localPlayerId)];
      this.notify(opponent.accountId, {
        kind: "opponent_moved",
        duelId: duel.id,
        title: "Соперник сделал ход",
        message: next.status === "active"
          ? `В радиодуэли с ${duel.players[localPlayerId].nickname} теперь ваш ход.`
          : `Радиодуэль с ${duel.players[localPlayerId].nickname} завершена.`,
      });
    }

    const cardsPlayed =
      action.type === "PLAY_CARD" || action.type === "PLAY_SUPPORT_CARD"
        ? 1
        : 0;
    const unitsDestroyed = Math.max(
      0,
      destroyedUnitCount(next, localPlayerId) -
        destroyedUnitCount(previousBattle, localPlayerId)
    );
    if (cardsPlayed > 0 || unitsDestroyed > 0 || turnCompleted) {
      this.recordMissionProgress(duel.players[localPlayerId].accountId, {
        cardsPlayed,
        unitsDestroyed,
        turnsCompleted: turnCompleted ? 1 : 0,
        turnsWithoutTimeout: turnCompleted ? 1 : 0,
      });
    }

    const opponentId = opponentOf(localPlayerId);
    const opponentAccountId = duel.players[opponentId].accountId;
    const liveDelivered = this.pushLiveUpdate(opponentAccountId, {
      duelId: duel.id,
      duel: this.toSummary(db, duel, opponentAccountId),
      action: clone(action),
      before: createBattleViewForPlayer(previousBattle, opponentId),
      after: createBattleViewForPlayer(duel.battle, opponentId),
    });
    if (liveDelivered && completedVersion !== null) {
      duel.seenTurnVersion[opponentId] = completedVersion;
    }
    this.store.write(db);
    return this.open(accountId, duelId);
  }

  private createDuel(waiting: QueueEntry, joining: QueueEntry): StoredDuel {
    const battle = applyAction(
      createInitialBattleState({
        playerHeadquartersId: waiting.headquartersId,
        botHeadquartersId: joining.headquartersId,
        playerDeckCardIds: waiting.deckCardIds ?? undefined,
        botDeckCardIds: joining.deckCardIds ?? undefined,
        backgroundId: getRandomBattleBackgroundId(),
        overheatMovementDamage: true,
      }),
      { type: "BEGIN_BATTLE", startingPlayer: "bot" }
    );
    const now = Date.now();
    return {
      id: randomUUID(),
      players: { player: waiting, bot: joining },
      battle,
      createdAt: now,
      updatedAt: now,
      deadlineAt: now + RADIO_DUEL_ENTRY_MS,
      activeTurnOpenedAt: null,
      entryWarningSent: false,
      currentTurnBaseBattle: clone(battle),
      currentTurnActions: [],
      lastTurn: null,
      seenTurnVersion: { player: 0, bot: 0 },
      rated: false,
      endReason: null,
      resultSeen: { player: false, bot: false },
      rewardsGranted: { player: false, bot: false },
    };
  }

  private findCandidate(db: RadioDuelDb, joining: QueueEntry): QueueEntry | null {
    const now = Date.now();
    const joiningDeckWeight = this.getDeckWeight(joining);
    const activeOpponentAccountIds = new Set(
      Object.values(db.duels)
        .filter(
          (duel) =>
            duel.battle.status === "active" &&
            this.getPlayerId(duel, joining.accountId) !== null
        )
        .flatMap((duel) =>
          Object.values(duel.players)
            .map((player) => player.accountId)
            .filter((accountId) => accountId !== joining.accountId)
        )
    );
    const recentOpponents = new Set(
      Object.values(db.duels)
        .filter(
          (duel) =>
            now - duel.updatedAt < RECENT_OPPONENT_WINDOW_MS &&
            this.getPlayerId(duel, joining.accountId) !== null
        )
        .flatMap((duel) => Object.values(duel.players).map((player) => player.accountId))
    );
    const candidates = db.queue.filter((candidate) => {
      if (candidate.accountId === joining.accountId) return false;
      if (
        Math.abs(this.getDeckWeight(candidate) - joiningDeckWeight) >
        RADIO_DUEL_MAX_DECK_WEIGHT_DIFFERENCE
      ) {
        return false;
      }
      // One pair of accounts may have only one active radio duel. Their new
      // queue entries remain available for other opponents and may match each
      // other again only after the current duel has finished.
      if (activeOpponentAccountIds.has(candidate.accountId)) return false;
      const profile = this.profiles.getProfile(candidate.accountId, { touchActivity: false });
      if (now - Math.max(profile.lastActivityAt, candidate.queuedAt) > ACTIVE_WINDOW_MS) return false;
      const activeGames = Object.values(db.duels).filter(
        (duel) => duel.battle.status === "active" && this.getPlayerId(duel, candidate.accountId)
      ).length;
      return activeGames < RADIO_DUEL_MAX_ACTIVE;
    });
    candidates.sort((a, b) => {
      const aPenalty = recentOpponents.has(a.accountId) ? 10_000 : 0;
      const bPenalty = recentOpponents.has(b.accountId) ? 10_000 : 0;
      return aPenalty + Math.abs(a.ratingAtStart - joining.ratingAtStart)
        - (bPenalty + Math.abs(b.ratingAtStart - joining.ratingAtStart));
    });
    return candidates[0] ?? null;
  }

  private processTimeouts(db: RadioDuelDb) {
    const now = Date.now();
    for (const duel of Object.values(db.duels)) {
      // Duels saved before the two-stage timer was introduced have no phase
      // marker and used the short deadline. Give those games the full entry
      // window from their last activity instead of penalising them at deploy.
      if (duel.activeTurnOpenedAt === undefined) {
        duel.activeTurnOpenedAt = null;
        duel.entryWarningSent = false;
        if (duel.battle.status === "active") {
          duel.deadlineAt = duel.updatedAt + RADIO_DUEL_ENTRY_MS;
        }
      }

      if (
        duel.battle.status === "active" &&
        duel.activeTurnOpenedAt == null &&
        duel.deadlineAt !== null &&
        duel.deadlineAt > now &&
        duel.deadlineAt - now <= RADIO_DUEL_ENTRY_WARNING_MS &&
        !duel.entryWarningSent
      ) {
        const activeAccount = duel.players[duel.battle.activePlayer].accountId;
        const opponent = duel.players[opponentOf(duel.battle.activePlayer)].nickname;
        duel.entryWarningSent = this.notify(activeAccount, {
          kind: "turn_warning",
          duelId: duel.id,
          title: "Радиодуэль ожидает вашего хода",
          message: `До штрафа в партии с ${opponent} осталось меньше 30 минут.`,
        });
      }

      while (
        duel.battle.status === "active" &&
        duel.deadlineAt !== null &&
        now >= duel.deadlineAt
      ) {
        const latePlayer = duel.battle.activePlayer;
        const turnWasOpened = duel.activeTurnOpenedAt != null;

        if (turnWasOpened) {
          const expiredAt = duel.deadlineAt;
          const noActionsTaken = duel.currentTurnActions.length === 0;
          if (noActionsTaken) {
            duel.battle.headquarters[latePlayer].hp -= RADIO_DUEL_TIMEOUT_DAMAGE;
            duel.battle.log.push(
              `${duel.players[latePlayer].nickname} не совершил ни одного действия за 3 минуты. Штаб теряет ${RADIO_DUEL_TIMEOUT_DAMAGE} HP.`
            );
            if (duel.battle.headquarters[latePlayer].hp <= 0) {
              duel.battle.status = latePlayer === "player" ? "bot_won" : "player_won";
            }
          }

          const replayBaseBattle = noActionsTaken
            ? clone(duel.battle)
            : duel.currentTurnBaseBattle;
          const action: BattleAction | null = duel.battle.status === "active"
            ? { type: "END_TURN", playerId: latePlayer }
            : null;
          const next = action ? applyAction(duel.battle, action) : clone(duel.battle);
          const version = (duel.lastTurn?.version ?? 0) + 1;
          const completedActions = action
            ? [...duel.currentTurnActions, action]
            : [...duel.currentTurnActions];

          next.log.push(
            noActionsTaken
              ? `${duel.players[latePlayer].nickname} оштрафован за бездействие.`
              : `${duel.players[latePlayer].nickname} не завершил ход за 3 минуты. Ход автоматически передан сопернику.`
          );
          duel.battle = next;
          duel.lastTurn = {
            version,
            turn: replayBaseBattle.turn,
            playerId: latePlayer,
            baseBattle: replayBaseBattle,
            actions: completedActions,
          };
          duel.currentTurnBaseBattle = clone(next);
          duel.currentTurnActions = [];
          duel.activeTurnOpenedAt = null;
          duel.entryWarningSent = false;
          duel.updatedAt = expiredAt;
          duel.deadlineAt = next.status === "active"
            ? expiredAt + RADIO_DUEL_ENTRY_MS
            : null;
          this.finalizeRating(db, duel);

          this.notify(duel.players[latePlayer].accountId, {
            kind: noActionsTaken ? "idle_turn_penalty" : "turn_timeout",
            duelId: duel.id,
            title: noActionsTaken ? "Штраф за бездействие" : "Время хода истекло",
            message: noActionsTaken
              ? `За три минуты не совершено ни одного действия. Штаб потерял ${RADIO_DUEL_TIMEOUT_DAMAGE} здоровья.`
              : "Три минуты истекли. Ход автоматически передан сопернику.",
          });
          const opponent = duel.players[opponentOf(latePlayer)];
          this.notify(opponent.accountId, {
            kind: "opponent_moved",
            duelId: duel.id,
            title: next.status === "active" ? "Теперь ваш ход" : "Радиодуэль завершена",
            message: next.status === "active"
              ? `Время игрока ${duel.players[latePlayer].nickname} истекло.`
              : `Штаб игрока ${duel.players[latePlayer].nickname} уничтожен штрафом за бездействие.`,
          });
          continue;
        }

        duel.battle.headquarters[latePlayer].hp -= RADIO_DUEL_TIMEOUT_DAMAGE;
        duel.battle.log.push(
          `${duel.players[latePlayer].nickname} не вошёл в бой за 12 часов. Штаб теряет ${RADIO_DUEL_TIMEOUT_DAMAGE} HP.`
        );
        duel.updatedAt = duel.deadlineAt;
        duel.deadlineAt += RADIO_DUEL_ENTRY_MS;
        if (duel.battle.headquarters[latePlayer].hp <= 0) {
          duel.battle.status = latePlayer === "player" ? "bot_won" : "player_won";
          duel.deadlineAt = null;
          this.finalizeRating(db, duel);
        }
        const lateAccount = duel.players[latePlayer].accountId;
        this.notify(lateAccount, {
          kind: "timeout_damage",
          duelId: duel.id,
          title: "Время хода истекло",
          message: `Штаб потерял ${RADIO_DUEL_TIMEOUT_DAMAGE} здоровья.`,
        });
      }
    }
  }

  private sweepTimeouts() {
    const db = this.store.read();
    this.processTimeouts(db);
    this.store.write(db);
  }

  private finalizeRating(db: RadioDuelDb, duel: StoredDuel) {
    const winner = winnerOf(duel.battle);
    if (!winner) return;

    if (!duel.rated) {
      const loser = opponentOf(winner);
      const winnerRating = this.getRating(db, duel.players[winner].accountId);
      const loserRating = this.getRating(db, duel.players[loser].accountId);
      const expected = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
      const delta = Math.max(1, Math.round(24 * (1 - expected)));
      db.ratings[duel.players[winner].accountId] = winnerRating + delta;
      db.ratings[duel.players[loser].accountId] = Math.max(0, loserRating - delta);
      duel.rated = true;

      this.recordMissionProgress(duel.players[winner].accountId, {
        duelsCompleted: 1,
        duelsWon: 1,
      });
      this.recordMissionProgress(duel.players[loser].accountId, {
        duelsCompleted: 1,
      });
    }

    this.grantBattleRewards(duel);
  }

  private grantBattleRewards(duel: StoredDuel) {
    duel.rewardsGranted = duel.rewardsGranted ?? {
      player: false,
      bot: false,
    };

    for (const localPlayerId of ["player", "bot"] as const) {
      if (duel.rewardsGranted[localPlayerId]) continue;
      const opponentId = opponentOf(localPlayerId);
      try {
        this.profiles.claimBattleReward(
          duel.players[localPlayerId].accountId,
          {
            claimId: `radio:${duel.id}:${localPlayerId}`,
            battle: duel.battle,
            mode: "radio",
            localPlayerId,
            matchEndReason: duel.endReason ?? null,
            localDeckWeight: this.getDeckWeight(duel.players[localPlayerId]),
            opponentDeckWeight: this.getDeckWeight(duel.players[opponentId]),
            specialRewardMultiplier: getOpponentRewardMultiplier(
              duel.players[opponentId].nickname
            ),
          }
        );
        duel.rewardsGranted[localPlayerId] = true;
      } catch (error) {
        console.error(
          `[RADIO] Failed to grant battle reward for ${duel.players[localPlayerId].accountId}:`,
          error
        );
      }
    }
  }

  private recordMissionProgress(
    accountId: string,
    event: Parameters<PlayerProfileManager["applyRadioDuelMissionProgress"]>[1]
  ) {
    try {
      this.profiles.applyRadioDuelMissionProgress(accountId, event);
    } catch (error) {
      console.error(
        `[RADIO] Failed to update combat missions for ${accountId}:`,
        error
      );
    }
  }

  private getRating(db: RadioDuelDb, accountId: string): number {
    return db.ratings[accountId] ?? DEFAULT_RATING;
  }

  private getPlayerId(duel: StoredDuel, accountId: string): PlayerId | null {
    if (duel.players.player.accountId === accountId) return "player";
    if (duel.players.bot.accountId === accountId) return "bot";
    return null;
  }

  private toSummary(db: RadioDuelDb, duel: StoredDuel, accountId: string): RadioDuelSummary {
    const localPlayerId = this.getPlayerId(duel, accountId);
    if (!localPlayerId) throw new Error("Нет доступа к радиодуэли");
    const opponentId = opponentOf(localPlayerId);
    const lastTurn = duel.lastTurn;
    return {
      id: duel.id,
      status: duel.battle.status === "active" ? "active" : "finished",
      localPlayerId,
      myNickname: duel.players[localPlayerId].nickname,
      myHeadquartersId: duel.players[localPlayerId].headquartersId,
      opponentHeadquartersId: duel.players[opponentId].headquartersId,
      myDeckWeight: this.getDeckWeight(duel.players[localPlayerId]),
      opponentDeckWeight: this.getDeckWeight(duel.players[opponentId]),
      opponentNickname: duel.players[opponentId].nickname,
      opponentRating: this.getRating(db, duel.players[opponentId].accountId),
      rating: this.getRating(db, accountId),
      ratingDelta:
        this.getRating(db, accountId) - duel.players[localPlayerId].ratingAtStart,
      battleStatus: duel.battle.status,
      backgroundId: duel.battle.backgroundId,
      activePlayer: duel.battle.activePlayer,
      isMyTurn: duel.battle.status === "active" && duel.battle.activePlayer === localPlayerId,
      timerPhase: duel.activeTurnOpenedAt == null ? "entry" : "turn",
      deadlineAt: duel.deadlineAt,
      updatedAt: duel.updatedAt,
      turn: duel.battle.turn,
      myHeadquartersHp: duel.battle.headquarters[localPlayerId].hp,
      opponentHeadquartersHp: duel.battle.headquarters[opponentId].hp,
      unread: Boolean(
        lastTurn &&
        lastTurn.playerId !== localPlayerId &&
        duel.seenTurnVersion[localPlayerId] < lastTurn.version
      ),
      endReason: duel.endReason ?? null,
    };
  }

  private getDeckWeight(player: RadioPlayer): number {
    return player.deckCardIds
      ? calculateDeckWeight(player.headquartersId, player.deckCardIds).totalWeight
      : getDefaultDeckWeight(player.headquartersId).totalWeight;
  }
}
