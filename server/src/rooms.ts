import { randomInt } from "node:crypto";
import type { WebSocket } from "ws";
import {
  applyAction,
  getAttackAnimationSequence,
} from "../../tank-card-game/src/game/engine";
import { getCard } from "../../tank-card-game/src/game/cards";
import {
  DEFAULT_BOT_HEADQUARTERS_ID,
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  HEADQUARTERS,
  getHeadquartersDefinition,
} from "../../tank-card-game/src/game/headquarters";
import { getRandomBattleBackgroundId } from "./battleBackgrounds";
import {
  createInitialBattleState,
  STEP_TIME_MS,
} from "../../tank-card-game/src/game/initialState";
import type {
  BattleAction,
  BattleState,
  HeadquartersId,
  PlayerId,
} from "../../tank-card-game/src/game/types";
import { createBattleViewForPlayer } from "./battleView";
import type { MatchEndReason, PvpClientMessage, PvpServerMessage } from "./protocol";

type RoomPlayer = {
  id: PlayerId;
  headquartersId: HeadquartersId;
  deckCardIds: string[] | null;
  sessionId: string;
  socket: WebSocket | null;
  disconnectTimer: NodeJS.Timeout | null;
  disconnectedAt: number | null;
};

type PendingStartRoll = {
  firstPlayer: PlayerId;
  startsAt: number;
  revealAt: number;
  startTimer: NodeJS.Timeout;
};

type PvpTurnTimer = {
  activePlayer: PlayerId;
  startedAt: number;
  endsAt: number;
  durationMs: number;
  timeoutId: NodeJS.Timeout | null;
  intervalId: NodeJS.Timeout | null;
};

type PendingMovement = {
  intentId: string;
  playerId: PlayerId;
  action: Extract<BattleAction, { type: "MOVE_UNIT" }>;
  queuedActions: Extract<BattleAction, { type: "MOVE_UNIT" }>[];
  timeoutId: NodeJS.Timeout;
};

type PendingAttack = {
  intentId: string;
  playerId: PlayerId;
  action: Extract<BattleAction, { type: "ATTACK" }>;
  timeoutId: NodeJS.Timeout;
};

type Room = {
  id: string;
  players: Partial<Record<PlayerId, RoomPlayer>>;
  battle: BattleState | null;
  pendingStartRoll: PendingStartRoll | null;
  pendingMovement: PendingMovement | null;
  pendingAttack: PendingAttack | null;
  turnTimer: PvpTurnTimer | null;
  ended: boolean;
  winner: PlayerId | null;
  endReason: MatchEndReason | null;
  cleanupTimer: NodeJS.Timeout | null;
};

const START_ROLL_DURATION_MS = 2800;
const START_ROLL_RESULT_DELAY_MS = 350;
const START_ROLL_FINISH_DELAY_MS = 900;
const PVP_TURN_DURATION_MS = STEP_TIME_MS;
const PVP_TURN_TIMER_BROADCAST_INTERVAL_MS = 500;
const PVP_MOVE_INTENT_DURATION_MS = 520;
const PVP_ATTACK_STRIKE_DURATION_MS = 960;
const PVP_DESTROYED_CARD_ANIMATION_MS = 920;
const ROOM_CLEANUP_DELAY_MS = 30_000;
const RECONNECT_GRACE_MS = Number(process.env.PVP_RECONNECT_GRACE_MS ?? 15_000);
const CUSTOM_DECK_CARD_LIMIT = 40;
const CUSTOM_DECK_COPY_LIMIT = 4;

function getStraightTwoCellIntermediate(
  from: { row: number; col: number },
  to: { row: number; col: number }
): { row: number; col: number } | null {
  const rowDistance = Math.abs(from.row - to.row);
  const colDistance = Math.abs(from.col - to.col);

  if (rowDistance + colDistance !== 2) return null;
  if (rowDistance > 0 && colDistance > 0) return null;

  return {
    row: from.row + Math.sign(to.row - from.row),
    col: from.col + Math.sign(to.col - from.col),
  };
}

function createRoomId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let index = 0; index < 5; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return result;
}

function safeSend(socket: WebSocket | null | undefined, message: PvpServerMessage) {
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function overwritePlayerId(action: BattleAction, playerId: PlayerId): BattleAction {
  if (action.type === "TIMER_TICK") {
    return action;
  }

  if (action.type === "BEGIN_BATTLE") {
    return action;
  }

  return {
    ...action,
    playerId,
  } as BattleAction;
}

function getRandomStartingPlayer(): PlayerId {
  return randomInt(0, 2) === 0 ? "player" : "bot";
}

function createStartedBattle(
  startingPlayer: PlayerId,
  playerHeadquartersId: HeadquartersId,
  botHeadquartersId: HeadquartersId,
  playerDeckCardIds?: string[] | null,
  botDeckCardIds?: string[] | null
): BattleState {
  const battle = createInitialBattleState({
    playerHeadquartersId,
    botHeadquartersId,
    playerDeckCardIds: playerDeckCardIds ?? undefined,
    botDeckCardIds: botDeckCardIds ?? undefined,
    backgroundId: getRandomBattleBackgroundId(),
  });

  return applyAction(battle, {
    type: "BEGIN_BATTLE",
    startingPlayer,
  } as BattleAction);
}

function normalizeHeadquartersId(
  headquartersId: HeadquartersId | undefined,
  fallback: HeadquartersId
): HeadquartersId {
  return headquartersId && headquartersId in HEADQUARTERS ? headquartersId : fallback;
}

function normalizeCustomDeckCardIds(
  headquartersId: HeadquartersId,
  deckCardIds: unknown
): string[] | null {
  if (!Array.isArray(deckCardIds)) return null;
  if (deckCardIds.length !== CUSTOM_DECK_CARD_LIMIT) return null;

  const headquarters = getHeadquartersDefinition(headquartersId);
  const trainingHeadquarters = headquarters.type === "Учебная часть";
  const copies = new Map<string, number>();
  const result: string[] = [];

  for (const cardId of deckCardIds) {
    if (typeof cardId !== "string") return null;

    let card;
    try {
      card = getCard(cardId);
    } catch {
      return null;
    }

    if (!trainingHeadquarters && card.nation !== headquarters.nation) {
      return null;
    }

    const nextCopies = (copies.get(cardId) ?? 0) + 1;
    copies.set(cardId, nextCopies);

    if (nextCopies > CUSTOM_DECK_COPY_LIMIT) {
      return null;
    }

    result.push(cardId);
  }

  return result;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sessionToRoom = new Map<string, { roomId: string; playerId: PlayerId }>();
  private socketToRoom = new WeakMap<WebSocket, string>();
  private socketToPlayer = new WeakMap<WebSocket, PlayerId>();
  private waitingRoomId: string | null = null;
  private movementIntentSequence = 0;
  private attackIntentSequence = 0;

  handleMessage(socket: WebSocket, rawData: WebSocket.RawData) {
    let message: PvpClientMessage;

    try {
      message = JSON.parse(rawData.toString()) as PvpClientMessage;
    } catch {
      safeSend(socket, { type: "ERROR", message: "Некорректное JSON-сообщение" });
      return;
    }

    switch (message.type) {
      case "FIND_MATCH":
        this.findMatch(
          socket,
          message.sessionId,
          message.headquartersId,
          message.deckCardIds
        );
        break;
      case "CREATE_ROOM":
        this.createRoom(socket, message.sessionId, {
          headquartersId: message.headquartersId,
          deckCardIds: message.deckCardIds,
        });
        break;
      case "JOIN_ROOM":
        this.joinRoom(
          socket,
          message.roomId,
          message.sessionId,
          message.headquartersId,
          message.deckCardIds
        );
        break;
      case "RECONNECT":
        this.reconnect(socket, message.sessionId, message.roomId);
        break;
      case "GAME_ACTION":
        this.applyGameAction(socket, message.action);
        break;
      case "SELECT_CARD":
        this.updateCardSelection(socket, message.cardInstanceId);
        break;
      case "SURRENDER":
        this.surrenderMatch(socket);
        break;
      case "LEAVE_MATCH":
        this.leaveMatch(socket);
        break;
      case "CANCEL_MATCHMAKING":
        this.cancelMatchmaking(socket);
        break;
      default:
        safeSend(socket, { type: "ERROR", message: "Неизвестное сообщение" });
    }
  }

  handleClose(socket: WebSocket) {
    const roomId = this.socketToRoom.get(socket);
    const playerId = this.socketToPlayer.get(socket);
    if (!roomId || !playerId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    console.log(`[PVP:${room.id}] player ${playerId} disconnected`);
    const wasWaitingForOpponent = this.isWaitingForOpponent(room);
    this.detachSocket(socket, room, playerId);

    if (room.ended) {
      this.deleteRoomIfEmpty(room);
      return;
    }

    if (wasWaitingForOpponent || room.battle?.status === "active") {
      this.schedulePlayerDisconnect(room, playerId, wasWaitingForOpponent);
      return;
    }

    this.deleteRoomIfEmpty(room);
  }

  private findMatch(
    socket: WebSocket,
    sessionId: string,
    headquartersId: HeadquartersId,
    deckCardIds?: string[]
  ) {
    safeSend(socket, { type: "MATCHMAKING_STARTED" });

    const waitingRoom = this.getWaitingRoom();

    if (waitingRoom) {
      this.joinExistingWaitingRoom(
        socket,
        waitingRoom,
        sessionId,
        headquartersId,
        deckCardIds
      );
      return;
    }

    this.createRoom(socket, sessionId, {
      makePublicWaiting: true,
      headquartersId,
      deckCardIds,
    });
  }

  private getWaitingRoom(): Room | null {
    if (!this.waitingRoomId) return null;

    const room = this.rooms.get(this.waitingRoomId);
    if (!room || !room.players.player || room.players.bot || room.battle) {
      this.waitingRoomId = null;
      return null;
    }

    const socket = room.players.player.socket;
    if (!socket || socket.readyState !== socket.OPEN) {
      this.waitingRoomId = null;
      return null;
    }

    return room;
  }

  private createRoom(
    socket: WebSocket,
    sessionId: string,
    options?: {
      makePublicWaiting?: boolean;
      headquartersId?: HeadquartersId;
      deckCardIds?: string[];
    }
  ) {
    let roomId = createRoomId();
    while (this.rooms.has(roomId)) {
      roomId = createRoomId();
    }

    const playerHeadquartersId = normalizeHeadquartersId(
      options?.headquartersId,
      DEFAULT_PLAYER_HEADQUARTERS_ID
    );

    const room: Room = {
      id: roomId,
      players: {
        player: this.createRoomPlayer(
          "player",
          socket,
          sessionId,
          playerHeadquartersId,
          normalizeCustomDeckCardIds(playerHeadquartersId, options?.deckCardIds)
        ),
      },
      battle: null,
      pendingStartRoll: null,
      pendingMovement: null,
      pendingAttack: null,
      turnTimer: null,
      ended: false,
      winner: null,
      endReason: null,
      cleanupTimer: null,
    };

    this.rooms.set(roomId, room);
    this.bindSocket(socket, room, "player");
    this.sessionToRoom.set(sessionId, { roomId, playerId: "player" });

    if (options?.makePublicWaiting) {
      this.waitingRoomId = roomId;
    }

    safeSend(socket, { type: "ROOM_CREATED", roomId, playerId: "player" });
    safeSend(socket, { type: "WAITING_FOR_OPPONENT", roomId });
  }

  private joinExistingWaitingRoom(
    socket: WebSocket,
    room: Room,
    sessionId: string,
    headquartersId: HeadquartersId,
    deckCardIds?: string[]
  ) {
    this.waitingRoomId = null;
    const botHeadquartersId = normalizeHeadquartersId(
      headquartersId,
      DEFAULT_BOT_HEADQUARTERS_ID
    );

    room.players.bot = this.createRoomPlayer(
      "bot",
      socket,
      sessionId,
      botHeadquartersId,
      normalizeCustomDeckCardIds(botHeadquartersId, deckCardIds)
    );
    this.bindSocket(socket, room, "bot");
    this.sessionToRoom.set(sessionId, { roomId: room.id, playerId: "bot" });

    safeSend(socket, { type: "ROOM_JOINED", roomId: room.id, playerId: "bot" });

    this.startFirstTurnRoll(room);
  }

  private joinRoom(
    socket: WebSocket,
    unsafeRoomId: string,
    sessionId: string,
    headquartersId: HeadquartersId,
    deckCardIds?: string[]
  ) {
    const roomId = unsafeRoomId.trim().toUpperCase();
    const room = this.rooms.get(roomId);

    if (!room) {
      safeSend(socket, { type: "ERROR", message: "Комната не найдена" });
      return;
    }

    if (room.players.bot) {
      safeSend(socket, { type: "ERROR", message: "Комната уже заполнена" });
      return;
    }

    if (this.waitingRoomId === roomId) {
      this.waitingRoomId = null;
    }

    const botHeadquartersId = normalizeHeadquartersId(
      headquartersId,
      DEFAULT_BOT_HEADQUARTERS_ID
    );

    room.players.bot = this.createRoomPlayer(
      "bot",
      socket,
      sessionId,
      botHeadquartersId,
      normalizeCustomDeckCardIds(botHeadquartersId, deckCardIds)
    );
    this.bindSocket(socket, room, "bot");
    this.sessionToRoom.set(sessionId, { roomId, playerId: "bot" });

    safeSend(socket, { type: "ROOM_JOINED", roomId, playerId: "bot" });

    this.startFirstTurnRoll(room);
  }

  private startFirstTurnRoll(room: Room) {
    if (room.ended) return;
    if (!room.players.player || !room.players.bot) return;
    if (!room.players.player.socket || !room.players.bot.socket) return;

    const firstPlayer = getRandomStartingPlayer();
    const startsAt = Date.now();
    const revealAt = startsAt + START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS;
    const gameStartDelay = START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS + START_ROLL_FINISH_DELAY_MS;

    console.log(
      `[PVP:${room.id}] match found; first turn roll: ${firstPlayer === "player" ? "player 1" : "player 2"}`,
    );

    room.battle = createStartedBattle(
      firstPlayer,
      room.players.player.headquartersId,
      room.players.bot.headquartersId,
      room.players.player.deckCardIds,
      room.players.bot.deckCardIds
    );

    room.pendingStartRoll = {
      firstPlayer,
      startsAt,
      revealAt,
      startTimer: setTimeout(() => {
        this.finishFirstTurnRoll(room.id);
      }, gameStartDelay),
    };

    this.broadcastFirstTurnRoll(room, firstPlayer, startsAt, revealAt);
  }

  private finishFirstTurnRoll(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || !room.pendingStartRoll) return;
    if (room.ended) return;
    if (!room.players.player || !room.players.bot) return;

    if (!room.battle) {
      room.battle = createStartedBattle(
        room.pendingStartRoll.firstPlayer,
        room.players.player.headquartersId,
        room.players.bot.headquartersId,
        room.players.player.deckCardIds,
        room.players.bot.deckCardIds
      );
    }
    room.pendingStartRoll = null;

    this.sendGameStarted(room, "player");
    this.sendGameStarted(room, "bot");

    this.restartTurnTimer(room);
  }

  private applyGameAction(socket: WebSocket, action: BattleAction) {
    const roomId = this.socketToRoom.get(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!roomId || !playerId) {
      safeSend(socket, { type: "ERROR", message: "Сначала найди PVP-матч" });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room || !room.battle) {
      safeSend(socket, { type: "ERROR", message: "Бой еще не начался" });
      return;
    }

    if (room.ended) {
      safeSend(socket, { type: "ERROR", message: "Бой уже завершен" });
      return;
    }

    if (room.battle.status !== "active") {
      safeSend(socket, { type: "ERROR", message: "Бой уже завершен" });
      return;
    }

    if (action.type === "TIMER_TICK" || action.type === "BEGIN_BATTLE") {
      safeSend(socket, { type: "ERROR", message: "Клиент не управляет PVP-таймером" });
      return;
    }

    if (room.battle.activePlayer !== playerId) {
      safeSend(socket, { type: "ERROR", message: "Сейчас ход противника" });
      return;
    }

    const safeAction = overwritePlayerId(action, playerId);

    if (room.pendingMovement || room.pendingAttack) {
      safeSend(socket, { type: "ERROR", message: "Дождитесь завершения текущей анимации" });
      return;
    }

    if (safeAction.type === "MOVE_UNIT") {
      this.scheduleMovement(room, playerId, safeAction);
      return;
    }

    if (safeAction.type === "ATTACK") {
      this.scheduleAttack(room, playerId, safeAction);
      return;
    }

    this.commitGameAction(room, playerId, safeAction);
  }

  private commitGameAction(room: Room, playerId: PlayerId, action: BattleAction) {
    if (!room.battle) return;

    const previousActivePlayer = room.battle.activePlayer;
    this.broadcastCardSelection(room, playerId, null);

    room.battle = applyAction(room.battle, action);

    this.broadcastBattleState(room);

    if (room.battle.status !== "active") {
      this.clearTurnTimer(room);
      return;
    }

    if (
      action.type === "END_TURN" ||
      room.battle.activePlayer !== previousActivePlayer
    ) {
      this.restartTurnTimer(room);
    }
  }

  private scheduleMovement(
    room: Room,
    playerId: PlayerId,
    action: Extract<BattleAction, { type: "MOVE_UNIT" }>,
    queuedActions: Extract<BattleAction, { type: "MOVE_UNIT" }>[] = []
  ) {
    if (!room.battle) return;

    const unitBeforeMove = room.battle.units.find(
      (unit) => unit.instanceId === action.unitId
    );
    const validatedBattle = applyAction(room.battle, action);
    const validatedUnitAfterMove = validatedBattle.units.find(
      (unit) => unit.instanceId === action.unitId
    );

    if (!unitBeforeMove || !validatedUnitAfterMove) return;
    if (
      unitBeforeMove.position.row === validatedUnitAfterMove.position.row &&
      unitBeforeMove.position.col === validatedUnitAfterMove.position.col
    ) {
      return;
    }

    const intermediate =
      getCard(unitBeforeMove.cardId).class === "light"
        ? getStraightTwoCellIntermediate(
            unitBeforeMove.position,
            action.position
          )
        : null;
    const stepAction = intermediate
      ? {
          ...action,
          position: intermediate,
        }
      : action;
    const remainingActions = intermediate
      ? [action, ...queuedActions]
      : queuedActions;
    const nextBattle = applyAction(room.battle, stepAction);
    const unitAfterStep = nextBattle.units.find(
      (unit) => unit.instanceId === action.unitId
    );

    if (!unitAfterStep) return;
    if (
      unitBeforeMove.position.row === unitAfterStep.position.row &&
      unitBeforeMove.position.col === unitAfterStep.position.col
    ) {
      return;
    }

    this.broadcastCardSelection(room, playerId, null);

    this.movementIntentSequence += 1;
    const intentId = `${room.id}-${this.movementIntentSequence}`;

    room.pendingMovement = {
      intentId,
      playerId,
      action: stepAction,
      queuedActions: remainingActions,
      timeoutId: setTimeout(() => {
        this.commitMovement(room.id, intentId);
      }, PVP_MOVE_INTENT_DURATION_MS),
    };

    this.broadcastSame(room, {
      type: "MOVE_INTENT",
      intentId,
      playerId,
      unitId: action.unitId,
      position: stepAction.position,
      durationMs: PVP_MOVE_INTENT_DURATION_MS,
    });
  }

  private commitMovement(roomId: string, intentId: string) {
    const room = this.rooms.get(roomId);

    if (!room || !room.battle) return;
    if (!room.pendingMovement || room.pendingMovement.intentId !== intentId) return;

    const { playerId, action, queuedActions } = room.pendingMovement;
    room.pendingMovement = null;

    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== playerId) return;

    this.commitGameAction(room, playerId, action);

    const nextAction = queuedActions[0];

    if (nextAction && room.battle?.status === "active") {
      this.scheduleMovement(room, playerId, nextAction, queuedActions.slice(1));
    }
  }

  private scheduleAttack(
    room: Room,
    playerId: PlayerId,
    action: Extract<BattleAction, { type: "ATTACK" }>
  ) {
    if (!room.battle) return;

    const strikes = getAttackAnimationSequence(room.battle, action);

    if (strikes.length === 0) return;

    const nextBattle = applyAction(room.battle, action);
    const unitWasDestroyed = room.battle.units.some(
      (unit) =>
        !nextBattle.units.some(
          (nextUnit) => nextUnit.instanceId === unit.instanceId
        )
    );
    const headquartersWasDestroyed =
      room.battle.status === "active" && nextBattle.status !== "active";

    this.broadcastCardSelection(room, playerId, null);

    this.attackIntentSequence += 1;
    const intentId = `${room.id}-attack-${this.attackIntentSequence}`;
    const durationMs =
      strikes.length * PVP_ATTACK_STRIKE_DURATION_MS +
      (unitWasDestroyed || headquartersWasDestroyed
        ? PVP_DESTROYED_CARD_ANIMATION_MS
        : 0);

    room.pendingAttack = {
      intentId,
      playerId,
      action,
      timeoutId: setTimeout(() => {
        this.commitAttack(room.id, intentId);
      }, durationMs),
    };

    this.broadcastSame(room, {
      type: "ATTACK_INTENT",
      intentId,
      playerId,
      strikes,
      durationMs,
    });
  }

  private commitAttack(roomId: string, intentId: string) {
    const room = this.rooms.get(roomId);

    if (!room || !room.battle) return;
    if (!room.pendingAttack || room.pendingAttack.intentId !== intentId) return;

    const { playerId, action } = room.pendingAttack;
    room.pendingAttack = null;

    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== playerId) return;

    this.commitGameAction(room, playerId, action);
  }

  private updateCardSelection(socket: WebSocket, cardInstanceId: string | null) {
    const room = this.getRoomBySocket(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!room || !playerId || !room.battle) return;
    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== playerId) return;

    if (
      cardInstanceId !== null &&
      !room.battle[playerId].hand.some((card) => card.instanceId === cardInstanceId)
    ) {
      return;
    }

    this.broadcastCardSelection(room, playerId, cardInstanceId);
  }

  private surrenderMatch(socket: WebSocket) {
    const room = this.getRoomBySocket(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!room || !playerId) {
      safeSend(socket, { type: "ERROR", message: "Сначала найди PVP-матч" });
      return;
    }

    if (room.ended) return;

    if (!room.battle || room.battle.status !== "active") {
      safeSend(socket, { type: "ERROR", message: "Сдаться можно только во время боя" });
      return;
    }

    console.log(`[PVP:${room.id}] player ${playerId} surrendered`);
    this.finishMatchByPlayerExit(room, playerId, "surrender");
  }

  private leaveMatch(socket: WebSocket) {
    const room = this.getRoomBySocket(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!room || !playerId) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      return;
    }

    if (room.ended) {
      this.releaseSocket(socket, room, playerId);
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      this.deleteRoomIfEmpty(room);
      return;
    }

    if (this.isWaitingForOpponent(room)) {
      this.cancelWaitingRoom(room, socket);
      return;
    }

    if (room.battle?.status === "active") {
      console.log(`[PVP:${room.id}] player ${playerId} left`);
      this.finishMatchByPlayerExit(room, playerId, "leave");
      return;
    }

    this.releaseSocket(socket, room, playerId);
    safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
    this.deleteRoomIfEmpty(room);
  }

  private cancelMatchmaking(socket: WebSocket) {
    const room = this.getRoomBySocket(socket);

    if (!room) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      return;
    }

    if (room.ended) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      return;
    }

    if (!this.isWaitingForOpponent(room)) {
      this.leaveMatch(socket);
      return;
    }

    this.cancelWaitingRoom(room, socket);
  }

  private reconnect(socket: WebSocket, sessionId: string, requestedRoomId?: string | null) {
    const match = this.findRoomBySession(sessionId, requestedRoomId);

    if (!match) {
      safeSend(socket, {
        type: "RECONNECT_FAILED",
        message: "PVP-матч для восстановления не найден",
      });
      return;
    }

    const { room, playerId } = match;
    const player = room.players[playerId];

    if (!player) {
      safeSend(socket, {
        type: "RECONNECT_FAILED",
        message: "Игрок в PVP-комнате не найден",
      });
      return;
    }

    if (player.socket && player.socket !== socket) {
      this.socketToRoom.delete(player.socket);
      this.socketToPlayer.delete(player.socket);
      player.socket.close();
    }

    player.socket = socket;
    player.disconnectedAt = null;

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }

    this.bindSocket(socket, room, playerId);
    this.sessionToRoom.set(sessionId, { roomId: room.id, playerId });

    console.log(`[PVP:${room.id}] player ${playerId} reconnected`);

    if (this.isWaitingForOpponent(room)) {
      this.waitingRoomId = room.id;
      safeSend(socket, { type: "ROOM_CREATED", roomId: room.id, playerId });
      safeSend(socket, { type: "WAITING_FOR_OPPONENT", roomId: room.id });
      return;
    }

    if (room.pendingStartRoll && room.battle) {
      safeSend(socket, {
        type: playerId === "player" ? "ROOM_CREATED" : "ROOM_JOINED",
        roomId: room.id,
        playerId,
      });
      this.sendFirstTurnRoll(
        room,
        playerId,
        room.pendingStartRoll.firstPlayer,
        room.pendingStartRoll.startsAt,
        room.pendingStartRoll.revealAt,
      );
      return;
    }

    if (!room.battle) {
      safeSend(socket, {
        type: "RECONNECT_FAILED",
        message: "Бой еще не начался",
      });
      return;
    }

    safeSend(socket, {
      type: "RECONNECTED",
      roomId: room.id,
      playerId,
      battle: createBattleViewForPlayer(room.battle, playerId),
    });

    this.sendTurnTimer(room, playerId);

    if (room.ended && room.winner && room.endReason) {
      safeSend(socket, {
        type: "MATCH_ENDED",
        winner: room.winner,
        reason: room.endReason,
      });
    }
  }

  private getRoomBySocket(socket: WebSocket): Room | null {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) return null;

    return this.rooms.get(roomId) ?? null;
  }

  private findRoomBySession(
    sessionId: string,
    requestedRoomId?: string | null
  ): { room: Room; playerId: PlayerId } | null {
    const binding = this.sessionToRoom.get(sessionId);
    const roomId = requestedRoomId?.trim().toUpperCase() || binding?.roomId;
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.sessionToRoom.delete(sessionId);
      return null;
    }

    const playerId = binding?.roomId === roomId ? binding.playerId : null;

    if (playerId && room.players[playerId]?.sessionId === sessionId) {
      return { room, playerId };
    }

    for (const candidateId of ["player", "bot"] as const) {
      if (room.players[candidateId]?.sessionId === sessionId) {
        return { room, playerId: candidateId };
      }
    }

    return null;
  }

  private createRoomPlayer(
    id: PlayerId,
    socket: WebSocket,
    sessionId: string,
    headquartersId: HeadquartersId,
    deckCardIds: string[] | null
  ): RoomPlayer {
    return {
      id,
      headquartersId,
      deckCardIds,
      socket,
      sessionId,
      disconnectTimer: null,
      disconnectedAt: null,
    };
  }

  private bindSocket(socket: WebSocket, room: Room, playerId: PlayerId) {
    this.socketToRoom.set(socket, room.id);
    this.socketToPlayer.set(socket, playerId);
  }

  private getOpponent(playerId: PlayerId): PlayerId {
    return playerId === "player" ? "bot" : "player";
  }

  private isWaitingForOpponent(room: Room): boolean {
    return !room.battle && !room.pendingStartRoll && Boolean(room.players.player) && !room.players.bot;
  }

  private detachSocket(socket: WebSocket, room: Room, playerId: PlayerId) {
    const player = room.players[playerId];

    if (player?.socket === socket) {
      player.socket = null;
      player.disconnectedAt = Date.now();
    }

    this.socketToRoom.delete(socket);
    this.socketToPlayer.delete(socket);
  }

  private releaseSocket(socket: WebSocket, room: Room, playerId: PlayerId) {
    const player = room.players[playerId];

    if (player?.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
    }

    if (player) {
      this.sessionToRoom.delete(player.sessionId);
    }

    delete room.players[playerId];
    this.socketToRoom.delete(socket);
    this.socketToPlayer.delete(socket);
  }

  private schedulePlayerDisconnect(
    room: Room,
    playerId: PlayerId,
    wasWaitingForOpponent: boolean
  ) {
    const player = room.players[playerId];
    if (!player) return;

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
    }

    player.disconnectTimer = setTimeout(() => {
      this.handlePlayerDisconnectTimeout(room.id, playerId, wasWaitingForOpponent);
    }, RECONNECT_GRACE_MS);
  }

  private handlePlayerDisconnectTimeout(
    roomId: string,
    playerId: PlayerId,
    wasWaitingForOpponent: boolean
  ) {
    const room = this.rooms.get(roomId);
    const player = room?.players[playerId];

    if (!room || !player || player.socket) return;

    player.disconnectTimer = null;

    if (room.ended) {
      this.deleteRoomIfEmpty(room);
      return;
    }

    if (wasWaitingForOpponent || this.isWaitingForOpponent(room)) {
      this.cancelWaitingRoom(room);
      return;
    }

    if (room.battle?.status === "active") {
      this.finishMatchByPlayerExit(room, playerId, "disconnect");
      return;
    }

    this.sessionToRoom.delete(player.sessionId);
    delete room.players[playerId];
    this.deleteRoomIfEmpty(room);
  }

  private clearRoomSessions(room: Room) {
    for (const player of Object.values(room.players)) {
      if (!player) continue;

      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
      }

      if (player.socket) {
        this.socketToRoom.delete(player.socket);
        this.socketToPlayer.delete(player.socket);
      }

      this.sessionToRoom.delete(player.sessionId);
    }
  }

  private cancelWaitingRoom(room: Room, notifySocket?: WebSocket) {
    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);
    this.clearPendingMovement(room);
    this.clearPendingAttack(room);

    if (this.waitingRoomId === room.id) {
      this.waitingRoomId = null;
    }

    console.log(`[PVP:${room.id}] matchmaking cancelled`);

    const sockets = Object.values(room.players).flatMap((player) =>
      player?.socket ? [player.socket] : [],
    );

    this.clearRoomSessions(room);
    this.rooms.delete(room.id);

    for (const socket of sockets) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      this.socketToRoom.delete(socket);
      this.socketToPlayer.delete(socket);
    }

    if (notifySocket && !sockets.includes(notifySocket)) {
      safeSend(notifySocket, { type: "MATCHMAKING_CANCELLED" });
    }
  }

  private finishMatchByPlayerExit(room: Room, loser: PlayerId, reason: MatchEndReason) {
    if (room.ended) return;
    if (!room.battle) return;

    const winner = this.getOpponent(loser);
    const status = winner === "player" ? "player_won" : "bot_won";
    const reasonText =
      reason === "surrender"
        ? `${loser === "player" ? "Игрок" : "Противник"} сдался.`
        : reason === "disconnect"
          ? `${loser === "player" ? "Игрок" : "Противник"} покинул бой.`
          : `${loser === "player" ? "Игрок" : "Противник"} вышел из боя.`;

    room.ended = true;
    room.winner = winner;
    room.endReason = reason;
    room.battle = {
      ...room.battle,
      status,
      log: [...room.battle.log, reasonText],
    };

    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);
    this.clearPendingMovement(room);
    this.clearPendingAttack(room);
    this.broadcastBattleState(room);
    this.broadcastMatchEnded(room, winner, reason);
    this.scheduleRoomCleanup(room.id);

    console.log(`[PVP:${room.id}] winner is ${winner}`);
  }

  private broadcastMatchEnded(room: Room, winner: PlayerId, reason: MatchEndReason) {
    this.broadcastSame(room, {
      type: "MATCH_ENDED",
      winner,
      reason,
    });
  }

  private clearPendingStartRoll(room: Room) {
    if (!room.pendingStartRoll) return;

    clearTimeout(room.pendingStartRoll.startTimer);
    room.pendingStartRoll = null;
  }

  private clearPendingMovement(room: Room) {
    if (!room.pendingMovement) return;

    clearTimeout(room.pendingMovement.timeoutId);
    room.pendingMovement = null;
  }

  private clearPendingAttack(room: Room) {
    if (!room.pendingAttack) return;

    clearTimeout(room.pendingAttack.timeoutId);
    room.pendingAttack = null;
  }

  private scheduleRoomCleanup(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.cleanupTimer) return;

    room.cleanupTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomId);
      if (!currentRoom) return;

      this.clearTurnTimer(currentRoom);
      this.clearPendingStartRoll(currentRoom);
      this.clearPendingMovement(currentRoom);
      this.clearPendingAttack(currentRoom);
      this.clearRoomSessions(currentRoom);
      this.rooms.delete(roomId);
      console.log(`[PVP:${roomId}] room cleaned`);
    }, ROOM_CLEANUP_DELAY_MS);
  }

  private deleteRoomIfEmpty(room: Room) {
    if (room.players.player || room.players.bot) return;

    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);
    this.clearPendingMovement(room);
    this.clearPendingAttack(room);

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }

    if (this.waitingRoomId === room.id) {
      this.waitingRoomId = null;
    }

    this.clearRoomSessions(room);
    this.rooms.delete(room.id);
    console.log(`[PVP:${room.id}] room cleaned`);
  }

  private restartTurnTimer(room: Room) {
    this.clearTurnTimer(room);

    if (room.ended || !room.battle || room.battle.status !== "active") {
      return;
    }

    const activePlayer = room.battle.activePlayer;
    const startedAt = Date.now();
    const timer: PvpTurnTimer = {
      activePlayer,
      startedAt,
      endsAt: startedAt + PVP_TURN_DURATION_MS,
      durationMs: PVP_TURN_DURATION_MS,
      timeoutId: null,
      intervalId: null,
    };

    room.turnTimer = timer;

    timer.timeoutId = setTimeout(() => {
      this.handleTurnTimeout(room.id, activePlayer);
    }, PVP_TURN_DURATION_MS);

    timer.intervalId = setInterval(() => {
      this.broadcastTurnTimer(room);
    }, PVP_TURN_TIMER_BROADCAST_INTERVAL_MS);

    console.log(`[PVP:${room.id}] timer started for ${activePlayer}`);
    this.broadcastTurnTimer(room);
  }

  private clearTurnTimer(room: Room) {
    if (!room.turnTimer) return;

    if (room.turnTimer.timeoutId) {
      clearTimeout(room.turnTimer.timeoutId);
    }

    if (room.turnTimer.intervalId) {
      clearInterval(room.turnTimer.intervalId);
    }

    room.turnTimer = null;
    console.log(`[PVP:${room.id}] timer cleared`);
  }

  private broadcastTurnTimer(room: Room) {
    if (room.ended) return;
    if (!room.turnTimer) return;

    this.sendTurnTimer(room, "player");
    this.sendTurnTimer(room, "bot");
  }

  private sendTurnTimer(room: Room, playerId: PlayerId) {
    if (room.ended) return;
    if (!room.turnTimer) return;

    safeSend(room.players[playerId]?.socket, {
      type: "TURN_TIMER",
      activePlayer: room.turnTimer.activePlayer,
      remainingMs: Math.max(0, room.turnTimer.endsAt - Date.now()),
      endsAt: room.turnTimer.endsAt,
      durationMs: room.turnTimer.durationMs,
    });
  }

  private handleTurnTimeout(roomId: string, expectedPlayer: PlayerId) {
    const room = this.rooms.get(roomId);

    if (!room || !room.battle) return;
    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== expectedPlayer) return;

    if (room.pendingAttack) {
      if (room.turnTimer) {
        room.turnTimer.timeoutId = setTimeout(() => {
          this.handleTurnTimeout(room.id, expectedPlayer);
        }, 100);
      }

      return;
    }

    console.log(`[PVP:${room.id}] timer timeout for ${expectedPlayer}`);

    this.clearPendingMovement(room);
    this.clearPendingAttack(room);
    this.broadcastCardSelection(room, expectedPlayer, null);

    room.battle = applyAction(room.battle, {
      type: "END_TURN",
      playerId: expectedPlayer,
    });

    this.broadcastBattleState(room);

    if (room.battle.status === "active") {
      this.restartTurnTimer(room);
    } else {
      this.clearTurnTimer(room);
    }
  }

  private broadcastBattleState(room: Room) {
    if (!room.battle) return;

    this.sendBattleState(room, "player");
    this.sendBattleState(room, "bot");
  }

  private broadcastFirstTurnRoll(
    room: Room,
    firstPlayer: PlayerId,
    startsAt: number,
    revealAt: number
  ) {
    this.sendFirstTurnRoll(room, "player", firstPlayer, startsAt, revealAt);
    this.sendFirstTurnRoll(room, "bot", firstPlayer, startsAt, revealAt);
  }

  private sendFirstTurnRoll(
    room: Room,
    playerId: PlayerId,
    firstPlayer: PlayerId,
    startsAt: number,
    revealAt: number
  ) {
    const player = room.players[playerId];
    if (!player || !room.battle) return;

    safeSend(player.socket, {
      type: "FIRST_TURN_ROLL",
      roomId: room.id,
      firstPlayer,
      startsAt,
      revealAt,
      battle: createBattleViewForPlayer(room.battle, playerId),
    });
  }

  private sendGameStarted(room: Room, playerId: PlayerId) {
    const player = room.players[playerId];
    if (!player || !room.battle) return;

    safeSend(player.socket, {
      type: "GAME_STARTED",
      roomId: room.id,
      battle: createBattleViewForPlayer(room.battle, playerId),
      playerId,
    });
  }

  private sendBattleState(room: Room, playerId: PlayerId) {
    const player = room.players[playerId];
    if (!player || !room.battle) return;

    safeSend(player.socket, {
      type: "GAME_STATE",
      roomId: room.id,
      battle: createBattleViewForPlayer(room.battle, playerId),
    });
  }

  private broadcastCardSelection(
    room: Room,
    playerId: PlayerId,
    cardInstanceId: string | null
  ) {
    const opponentId = this.getOpponent(playerId);
    const opponent = room.players[opponentId];

    safeSend(opponent?.socket, {
      type: "OPPONENT_CARD_SELECTION",
      playerId,
      cardInstanceId,
    });
  }

  private broadcastSame(room: Room, message: PvpServerMessage) {
    for (const player of Object.values(room.players)) {
      if (player) safeSend(player.socket, message);
    }
  }

}
