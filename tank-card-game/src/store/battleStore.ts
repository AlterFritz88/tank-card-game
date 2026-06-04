import { create } from "zustand";

import { applyAction } from "../game/engine";
import type { AttackAnimationStrike } from "../game/engine";
import {
  DEFAULT_BOT_HEADQUARTERS_ID,
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  getHeadquartersDefinition,
  getTrainingHeadquartersIds,
} from "../game/headquarters";
import { getRandomBattleBackgroundId } from "../assets/battleBackgroundAssets";
import { getCampaignMission, isCampaignMissionUnlocked } from "../game/campaigns";
import { calculateDeckWeight } from "../game/deckWeight";
import { createInitialBattleState, getDeckCardIds } from "../game/initialState";
import type {
  GameMode,
  MainMenuView,
  MatchEndReason,
  PvpConnectionState,
} from "../game/modes";
import type {
  BattleAction,
  BattleState,
  HeadquartersId,
  BattleStateView,
  ClientBattleState,
  PlayerId,
} from "../game/types";
import { pvpClient } from "../network/pvpClient";

type SelectedAttacker = {
  type: "unit" | "headquarters";
  id: string;
} | null;

const AI_CUSTOM_OPPONENT_DECK_CARD_COUNT = 40;

export type FirstTurnRollState = {
  visible: boolean;
  resultVisible: boolean;
  firstPlayer: PlayerId | null;
  startsAt: number | null;
  revealAt: number | null;
  finalRotation: number;
};

export type PvpTimerState = {
  activePlayer: PlayerId | null;
  remainingMs: number | null;
  endsAt: number | null;
  durationMs: number | null;
};

export type PvpMovementIntent = {
  intentId: string;
  playerId: PlayerId;
  unitId: string;
  position: {
    row: number;
    col: number;
  };
  durationMs: number;
};

export type PvpAttackIntent = {
  intentId: string;
  playerId: PlayerId;
  strikes: AttackAnimationStrike[];
  durationMs: number;
};

type BattleStore = {
  battle: ClientBattleState | null;
  mode: GameMode;
  menuView: MainMenuView;
  localPlayerId: PlayerId;
  pvpRoomId: string | null;
  pvpStatus: PvpConnectionState;
  pvpError: string | null;
  matchEndReason: MatchEndReason | null;
  pvpTimer: PvpTimerState;
  pvpMovementIntent: PvpMovementIntent | null;
  pvpAttackIntent: PvpAttackIntent | null;
  firstTurnRoll: FirstTurnRollState;
  selectedHeadquartersId: HeadquartersId;
  completedCampaignMissionIds: string[];
  selectedCampaignId: string | null;
  currentCampaignMissionId: string | null;

  selectedCardInstanceId: string | null;
  opponentSelectedCardInstanceId: string | null;
  selectedAttacker: SelectedAttacker;

  selectCard: (cardInstanceId: string | null) => void;
  selectAttacker: (attacker: SelectedAttacker) => void;

  setMode: (mode: GameMode) => void;
  openHeadquartersMenu: (mode: "ai" | "pvp") => void;
  closeHeadquartersMenu: () => void;
  openDeckBuilderMenu: () => void;
  closeDeckBuilderMenu: () => void;
  openResearchMenu: () => void;
  closeResearchMenu: () => void;
  openCampaignMenu: () => void;
  openCampaignMissions: (campaignId: string) => void;
  closeCampaignMissions: () => void;
  closeCampaignMenu: () => void;
  exitBattleToMenu: () => void;
  startAiBattle: (deckCardIds?: string[]) => void;
  startCampaignMission: (missionId: string) => void;
  findPvpMatch: (deckCardIds?: string[]) => void;
  createPvpRoom: (deckCardIds?: string[]) => void;
  joinPvpRoom: (roomId: string, deckCardIds?: string[]) => void;
  startPvpBattle: (roomId?: string, deckCardIds?: string[]) => void;
  restorePvpSession: () => void;
  applyRemoteBattleState: (battle: BattleStateView) => void;
  applyMatchEnded: (winner: PlayerId, reason: MatchEndReason) => void;
  applyOpponentCardSelection: (
    playerId: PlayerId,
    cardInstanceId: string | null
  ) => void;
  applyPvpTimer: (timer: {
    activePlayer: PlayerId;
    remainingMs: number;
    endsAt: number;
    durationMs: number;
  }) => void;
  applyPvpMovementIntent: (intent: PvpMovementIntent) => void;
  applyPvpAttackIntent: (intent: PvpAttackIntent) => void;
  surrenderPvpMatch: () => void;
  leavePvpMatch: () => void;
  cancelMatchmaking: () => void;
  setPvpError: (message: string | null) => void;
  hideFirstTurnRoll: () => void;
  setSelectedHeadquartersId: (headquartersId: HeadquartersId) => void;

  dispatch: (action: BattleAction) => void;
  reset: () => void;
};

const PVP_SERVER_URL =
  import.meta.env.VITE_PVP_SERVER_URL ?? "ws://localhost:8787";
const CAMPAIGN_PROGRESS_KEY = "tank-card-game:campaign-progress";

const emptyFirstTurnRoll: FirstTurnRollState = {
  visible: false,
  resultVisible: false,
  firstPlayer: null,
  startsAt: null,
  revealAt: null,
  finalRotation: 0,
};

const emptyPvpTimer: PvpTimerState = {
  activePlayer: null,
  remainingMs: null,
  endsAt: null,
  durationMs: null,
};

let pvpSubscriptionsReady = false;
let firstTurnRollResultTimer: number | null = null;
let firstTurnRollHideTimer: number | null = null;
let reconnectTimer: number | null = null;

function loadCompletedCampaignMissionIds(): string[] {
  try {
    const rawValue = window.localStorage.getItem(CAMPAIGN_PROGRESS_KEY);
    if (!rawValue) return [];

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function saveCompletedCampaignMissionIds(missionIds: string[]) {
  window.localStorage.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify(missionIds));
}

function clearFirstTurnRollTimers() {
  if (firstTurnRollResultTimer !== null) {
    window.clearTimeout(firstTurnRollResultTimer);
    firstTurnRollResultTimer = null;
  }

  if (firstTurnRollHideTimer !== null) {
    window.clearTimeout(firstTurnRollHideTimer);
    firstTurnRollHideTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer === null) return;

  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function shouldClearSelection(action: BattleAction): boolean {
  return (
    action.type === "PLAY_CARD" ||
    action.type === "PLAY_SUPPORT_CARD" ||
    action.type === "MOVE_UNIT" ||
    action.type === "ATTACK" ||
    action.type === "END_TURN"
  );
}

function createFreshBattle(
  playerHeadquartersId: HeadquartersId = DEFAULT_PLAYER_HEADQUARTERS_ID,
  botHeadquartersId?: HeadquartersId,
  playerDeckCardIds?: string[]
) {
  const aiOpponent = botHeadquartersId
    ? { headquartersId: botHeadquartersId, deckCardIds: undefined }
    : getAiOpponentSetup(playerHeadquartersId, playerDeckCardIds);

  return createInitialBattleState({
    playerHeadquartersId,
    botHeadquartersId: aiOpponent.headquartersId,
    playerDeckCardIds,
    botDeckCardIds: aiOpponent.deckCardIds,
    backgroundId: getRandomBattleBackgroundId(),
  });
}

function getAiOpponentSetup(
  playerHeadquartersId: HeadquartersId,
  playerDeckCardIds?: string[]
): { headquartersId: HeadquartersId; deckCardIds?: string[] } {
  if (!playerDeckCardIds) {
    return {
      headquartersId: getRandomTrainingOpponentHeadquartersId(
        playerHeadquartersId
      ),
    };
  }

  const candidates = getTrainingHeadquartersIds();

  if (candidates.length === 0) {
    return {
      headquartersId: DEFAULT_BOT_HEADQUARTERS_ID,
      deckCardIds: getExpandedDefaultDeckCardIds(DEFAULT_BOT_HEADQUARTERS_ID),
    };
  }

  const playerWeight = calculateDeckWeight(
    playerHeadquartersId,
    playerDeckCardIds
  ).totalWeight;

  const opponent =
    candidates
      .map((headquartersId) => {
        const deckCardIds = getExpandedDefaultDeckCardIds(headquartersId);

        return {
          headquartersId,
          deckCardIds,
          distance: Math.abs(
            calculateDeckWeight(headquartersId, deckCardIds).totalWeight -
              playerWeight
          ),
        };
      })
      .sort((left, right) => left.distance - right.distance)[0] ?? null;

  return opponent
    ? {
        headquartersId: opponent.headquartersId,
        deckCardIds: opponent.deckCardIds,
      }
    : {
        headquartersId: DEFAULT_BOT_HEADQUARTERS_ID,
        deckCardIds: getExpandedDefaultDeckCardIds(DEFAULT_BOT_HEADQUARTERS_ID),
      };
}

function getRandomTrainingOpponentHeadquartersId(
  playerHeadquartersId: HeadquartersId
): HeadquartersId {
  const candidates = getTrainingHeadquartersIds().filter(
    (headquartersId) => headquartersId !== playerHeadquartersId
  );
  const availableCandidates =
    candidates.length > 0 ? candidates : getTrainingHeadquartersIds();

  if (availableCandidates.length === 0) {
    return DEFAULT_BOT_HEADQUARTERS_ID;
  }

  const randomIndex = Math.floor(Math.random() * availableCandidates.length);

  return availableCandidates[randomIndex];
}

function getExpandedDefaultDeckCardIds(headquartersId: HeadquartersId): string[] {
  const defaultDeckId = getHeadquartersDefinition(headquartersId).defaultDeckId;
  const defaultCardIds = getDeckCardIds(defaultDeckId);

  if (defaultCardIds.length === 0) return [];

  return Array.from(
    { length: AI_CUSTOM_OPPONENT_DECK_CARD_COUNT },
    (_, index) => defaultCardIds[index % defaultCardIds.length]
  );
}

function createCampaignBattle(missionId: string): BattleState | null {
  const campaignMission = getCampaignMission(missionId);

  if (!campaignMission) return null;
  if (campaignMission.mission.available === false) return null;
  if (!campaignMission.mission.botHeadquartersId) return null;
  if (!campaignMission.mission.botDeckId) return null;

  return createInitialBattleState({
    playerHeadquartersId: campaignMission.campaign.playerHeadquartersId,
    botHeadquartersId: campaignMission.mission.botHeadquartersId,
    playerDeckId:
      campaignMission.mission.playerDeckId ?? campaignMission.campaign.playerDeckId,
    botDeckId: campaignMission.mission.botDeckId,
    backgroundId: campaignMission.mission.backgroundId ?? getRandomBattleBackgroundId(),
  });
}

function getStartRollFinalRotation(firstPlayer: PlayerId): number {
  const targetAngle = firstPlayer === "player" ? 135 : -45;
  return 360 * 8 + targetAngle;
}

function getCleanMenuState() {
  return {
    battle: null,
    mode: "ai" as GameMode,
    menuView: "main" as MainMenuView,
    localPlayerId: "player" as PlayerId,
    pvpRoomId: null,
    pvpStatus: "idle" as PvpConnectionState,
    pvpError: null,
    matchEndReason: null,
    pvpTimer: emptyPvpTimer,
    pvpMovementIntent: null,
    pvpAttackIntent: null,
    selectedCardInstanceId: null,
    opponentSelectedCardInstanceId: null,
    selectedAttacker: null,
    selectedCampaignId: null,
    currentCampaignMissionId: null,
    firstTurnRoll: emptyFirstTurnRoll,
  };
}

function setupPvpSubscriptions() {
  if (pvpSubscriptionsReady) return;
  pvpSubscriptionsReady = true;

  pvpClient.onMessage((message) => {
    const store = useBattleStore.getState();

    switch (message.type) {
      case "MATCHMAKING_STARTED":
        useBattleStore.setState({
          battle: null,
          mode: "pvp",
          menuView: "headquarters",
          pvpRoomId: null,
          pvpStatus: "searching",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "ROOM_CREATED":
      case "ROOM_JOINED":
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        pvpClient.rememberRoom(message.roomId);
        useBattleStore.setState({
          battle: null,
          mode: "pvp",
          menuView: "headquarters",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: message.type === "ROOM_JOINED" ? "matched" : "waiting",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          firstTurnRoll: emptyFirstTurnRoll,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
        });
        break;

      case "WAITING_FOR_OPPONENT":
        pvpClient.rememberRoom(message.roomId);
        useBattleStore.setState({
          battle: null,
          pvpRoomId: message.roomId,
          pvpStatus: "waiting",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
        });
        break;

      case "FIRST_TURN_ROLL": {
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        pvpClient.rememberRoom(message.roomId);

        const now = Date.now();
        const revealDelay = Math.max(0, message.revealAt - now);
        const hideDelay = revealDelay + 900;

        useBattleStore.setState({
          battle: message.battle,
          mode: "pvp",
          menuView: "main",
          pvpRoomId: message.roomId,
          pvpStatus: "rolling",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
          firstTurnRoll: {
            visible: true,
            resultVisible: false,
            firstPlayer: message.firstPlayer,
            startsAt: message.startsAt,
            revealAt: message.revealAt,
            finalRotation: getStartRollFinalRotation(message.firstPlayer),
          },
        });

        firstTurnRollResultTimer = window.setTimeout(() => {
          useBattleStore.setState((state) => ({
            firstTurnRoll: {
              ...state.firstTurnRoll,
              resultVisible: true,
            },
          }));
        }, revealDelay);

        firstTurnRollHideTimer = window.setTimeout(() => {
          useBattleStore.getState().hideFirstTurnRoll();
        }, hideDelay);

        break;
      }

      case "GAME_STARTED":
        clearReconnectTimer();
        pvpClient.rememberRoom(message.roomId);
        useBattleStore.setState({
          battle: message.battle,
          mode: "pvp",
          menuView: "main",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: "inBattle",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
        });
        break;

      case "GAME_STATE":
        store.applyRemoteBattleState(message.battle);
        break;

      case "RECONNECTED":
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        pvpClient.rememberRoom(message.roomId);
        useBattleStore.setState({
          battle: message.battle,
          mode: "pvp",
          menuView: "main",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: message.battle.status === "active" ? "inBattle" : "finished",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "RECONNECT_FAILED":
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        pvpClient.clearSession();
        useBattleStore.setState({
          ...getCleanMenuState(),
          pvpError: message.message,
        });
        break;

      case "TURN_TIMER":
        store.applyPvpTimer(message);
        break;

      case "MOVE_INTENT":
        store.applyPvpMovementIntent(message);
        break;

      case "ATTACK_INTENT":
        store.applyPvpAttackIntent(message);
        break;

      case "MATCH_ENDED":
        store.applyMatchEnded(message.winner, message.reason);
        break;

      case "OPPONENT_CARD_SELECTION":
        store.applyOpponentCardSelection(message.playerId, message.cardInstanceId);
        break;

      case "MATCHMAKING_CANCELLED":
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        pvpClient.clearSession();
        useBattleStore.setState(getCleanMenuState());
        break;

      case "OPPONENT_LEFT":
        useBattleStore.setState({
          pvpStatus: "finished",
          matchEndReason: message.reason,
          pvpError: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          opponentSelectedCardInstanceId: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "OPPONENT_DISCONNECTED":
        clearFirstTurnRollTimers();
        useBattleStore.setState({
          pvpStatus: "finished",
          pvpError: null,
          matchEndReason: "disconnect",
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          opponentSelectedCardInstanceId: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "ERROR":
        store.setPvpError(message.message);
        break;
    }
  });

  pvpClient.onClose(() => {
    const state = useBattleStore.getState();
    if (state.mode !== "pvp") return;
    if (state.pvpStatus === "finished") return;

    clearFirstTurnRollTimers();

    if (pvpClient.getStoredRoomId()) {
      useBattleStore.setState({
        pvpStatus: "connecting",
        pvpError: "Соединение потеряно, восстанавливаю PVP-матч...",
        pvpTimer: emptyPvpTimer,
        pvpMovementIntent: null,
        pvpAttackIntent: null,
        firstTurnRoll: emptyFirstTurnRoll,
      });

      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectAndRun(() => pvpClient.reconnect());
      }, 300);
      return;
    }

    useBattleStore.setState({
      pvpStatus: "error",
      pvpError: "Соединение с PVP-сервером закрыто",
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
    });
  });

  pvpClient.onError((message) => {
    useBattleStore.getState().setPvpError(message);
  });
}

function connectAndRun(onOpen: () => void) {
  setupPvpSubscriptions();

  const unsubscribe = pvpClient.onOpen(() => {
    unsubscribe();
    onOpen();
  });

  pvpClient.connect(PVP_SERVER_URL);
}

export const useBattleStore = create<BattleStore>()((set, get) => ({
  battle: null,
  mode: "ai",
  menuView: "main",
  localPlayerId: "player",
  pvpRoomId: null,
  pvpStatus: "idle",
  pvpError: null,
  matchEndReason: null,
  pvpTimer: emptyPvpTimer,
  pvpMovementIntent: null,
  pvpAttackIntent: null,
  firstTurnRoll: emptyFirstTurnRoll,
  selectedHeadquartersId: DEFAULT_PLAYER_HEADQUARTERS_ID,
  completedCampaignMissionIds: loadCompletedCampaignMissionIds(),
  selectedCampaignId: null,
  currentCampaignMissionId: null,

  selectedCardInstanceId: null,
  opponentSelectedCardInstanceId: null,
  selectedAttacker: null,

  selectCard: (cardInstanceId) => {
    if (get().mode === "pvp") {
      pvpClient.selectCard(cardInstanceId);
    }

    set({
      selectedCardInstanceId: cardInstanceId,
      selectedAttacker: null,
    });
  },

  selectAttacker: (attacker) => {
    if (get().mode === "pvp") {
      pvpClient.selectCard(null);
    }

    set({
      selectedAttacker: attacker,
      selectedCardInstanceId: null,
    });
  },

  setMode: (mode) => {
    set({ mode });
  },

  openHeadquartersMenu: (mode) => {
    set({
      menuView: "headquarters",
      mode,
      pvpError: null,
    });
  },

  closeHeadquartersMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openDeckBuilderMenu: () => {
    set({
      menuView: "deckBuilder",
      pvpError: null,
    });
  },

  closeDeckBuilderMenu: () => {
    set({
      menuView: "headquarters",
      pvpError: null,
    });
  },

  openResearchMenu: () => {
    set({
      menuView: "research",
      mode: "ai",
      pvpError: null,
    });
  },

  closeResearchMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openCampaignMenu: () => {
    set({
      menuView: "campaign",
      mode: "campaign",
      pvpError: null,
    });
  },

  openCampaignMissions: (campaignId) => {
    set({
      menuView: "missions",
      mode: "campaign",
      selectedCampaignId: campaignId,
      pvpError: null,
    });
  },

  closeCampaignMissions: () => {
    set({
      menuView: "campaign",
      mode: "campaign",
      currentCampaignMissionId: null,
    });
  },

  closeCampaignMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      selectedCampaignId: null,
      currentCampaignMissionId: null,
    });
  },

  exitBattleToMenu: () => {
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.selectCard(null);
    pvpClient.clearSession();

    set(getCleanMenuState());
    pvpClient.disconnect();
  },

  hideFirstTurnRoll: () => {
    set({ firstTurnRoll: emptyFirstTurnRoll });
  },

  setSelectedHeadquartersId: (headquartersId) => {
    set({ selectedHeadquartersId: headquartersId });
  },

  startAiBattle: (deckCardIds) => {
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.clearSession();

    set({
      battle: createFreshBattle(
        get().selectedHeadquartersId,
        undefined,
        deckCardIds
      ),
      mode: "ai",
      menuView: "main",
      localPlayerId: "player",
      pvpRoomId: null,
      pvpStatus: "idle",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
      currentCampaignMissionId: null,
    });

    pvpClient.disconnect();
  },

  startCampaignMission: (missionId) => {
    const campaignMission = getCampaignMission(missionId);
    if (!campaignMission) return;

    const state = get();
    const unlocked = isCampaignMissionUnlocked(
      campaignMission.campaign,
      missionId,
      state.completedCampaignMissionIds
    );

    if (!unlocked) return;

    const battle = createCampaignBattle(missionId);
    if (!battle) return;

    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.clearSession();

    set({
      battle,
      mode: "campaign",
      menuView: "campaign",
      localPlayerId: "player",
      pvpRoomId: null,
      pvpStatus: "idle",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
      currentCampaignMissionId: missionId,
      selectedCampaignId: campaignMission.campaign.id,
    });

    pvpClient.disconnect();
  },

  findPvpMatch: (deckCardIds) => {
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.clearSession();

    set({
      battle: null,
      mode: "pvp",
      menuView: "headquarters",
      pvpRoomId: null,
      pvpStatus: "connecting",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() =>
      pvpClient.findMatch(get().selectedHeadquartersId, deckCardIds)
    );
  },

  createPvpRoom: (deckCardIds) => {
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.clearSession();

    set({
      battle: null,
      mode: "pvp",
      menuView: "headquarters",
      pvpRoomId: null,
      pvpStatus: "connecting",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() =>
      pvpClient.createRoom(get().selectedHeadquartersId, deckCardIds)
    );
  },

  joinPvpRoom: (roomId, deckCardIds) => {
    const normalizedRoomId = roomId.trim().toUpperCase();

    if (!normalizedRoomId) {
      set({ pvpError: "Введите код комнаты" });
      return;
    }

    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.clearSession();

    set({
      battle: null,
      mode: "pvp",
      menuView: "headquarters",
      pvpRoomId: normalizedRoomId,
      pvpStatus: "connecting",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() =>
      pvpClient.joinRoom(
        normalizedRoomId,
        get().selectedHeadquartersId,
        deckCardIds
      )
    );
  },

  startPvpBattle: (roomId, deckCardIds) => {
    if (roomId) {
      get().joinPvpRoom(roomId, deckCardIds);
      return;
    }

    get().findPvpMatch(deckCardIds);
  },

  restorePvpSession: () => {
    const roomId = pvpClient.getStoredRoomId();
    if (!roomId) return;

    clearFirstTurnRollTimers();
    clearReconnectTimer();

    set({
      battle: null,
      mode: "pvp",
      menuView: "headquarters",
      pvpRoomId: roomId,
      pvpStatus: "connecting",
      pvpError: "Восстанавливаю PVP-матч...",
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() => pvpClient.reconnect());
  },

  applyRemoteBattleState: (battle) => {
    const state = get();
    const opponentIsActive =
      battle.status === "active" && battle.activePlayer !== state.localPlayerId;

    set({
      battle,
      pvpStatus: battle.status === "active" ? "inBattle" : "finished",
      pvpError: null,
      ...(battle.status === "active" ? {} : { pvpTimer: emptyPvpTimer }),
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      ...(opponentIsActive ? {} : { opponentSelectedCardInstanceId: null }),
    });
  },

  applyMatchEnded: (_winner, reason) => {
    clearFirstTurnRollTimers();
    clearReconnectTimer();

    set({
      pvpStatus: "finished",
      pvpError: null,
      matchEndReason: reason,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },

  applyOpponentCardSelection: (playerId, cardInstanceId) => {
    const state = get();

    if (state.mode !== "pvp") return;
    if (playerId === state.localPlayerId) return;
    if (!state.battle || state.battle.activePlayer !== playerId) {
      set({ opponentSelectedCardInstanceId: null });
      return;
    }

    if (
      cardInstanceId !== null &&
      !state.battle[playerId].hand.some((card) => card.instanceId === cardInstanceId)
    ) {
      return;
    }

    set({
      opponentSelectedCardInstanceId: cardInstanceId,
    });
  },

  applyPvpTimer: (timer) => {
    set({
      pvpTimer: {
        activePlayer: timer.activePlayer,
        remainingMs: timer.remainingMs,
        endsAt: timer.endsAt,
        durationMs: timer.durationMs,
      },
    });
  },

  applyPvpMovementIntent: (intent) => {
    set({ pvpMovementIntent: intent });
  },

  applyPvpAttackIntent: (intent) => {
    set({ pvpAttackIntent: intent });

    window.setTimeout(() => {
      set((state) => ({
        pvpAttackIntent:
          state.pvpAttackIntent?.intentId === intent.intentId
            ? null
            : state.pvpAttackIntent,
      }));
    }, intent.durationMs);
  },

  surrenderPvpMatch: () => {
    if (get().mode !== "pvp") return;

    pvpClient.surrender();
  },

  leavePvpMatch: () => {
    const state = get();
    if (state.mode !== "pvp") return;

    pvpClient.leaveMatch();

    if (state.battle?.status === "active") {
      return;
    }

    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.clearSession();
    set(getCleanMenuState());
    pvpClient.disconnect();
  },

  cancelMatchmaking: () => {
    if (get().mode !== "pvp") return;

    pvpClient.cancelMatchmaking();
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    pvpClient.clearSession();
    set(getCleanMenuState());
  },

  setPvpError: (message) => {
    set({
      pvpError: message,
      pvpStatus: message ? "error" : get().pvpStatus,
    });
  },

  dispatch: (action) => {
    const { mode } = get();

    if (mode === "pvp") {
      pvpClient.sendAction(action);

      if (shouldClearSelection(action)) {
        pvpClient.selectCard(null);
        set({
          selectedCardInstanceId: null,
          selectedAttacker: null,
        });
      }

      return;
    }

    const currentBattle = get().battle as BattleState | null;

    if (!currentBattle) {
      return;
    }

    const nextBattle = applyAction(currentBattle, action);

    set({
      battle: nextBattle,
      ...(shouldClearSelection(action)
        ? {
            selectedCardInstanceId: null,
            selectedAttacker: null,
          }
        : {}),
    });
  },

  reset: () => {
    const { battle, currentCampaignMissionId, mode } = get();

    if (mode === "pvp") {
      pvpClient.selectCard(null);
      set({
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
      });
      return;
    }

    if (mode === "campaign") {
      let completedCampaignMissionIds = get().completedCampaignMissionIds;

      if (
        battle?.status === "player_won" &&
        currentCampaignMissionId &&
        !completedCampaignMissionIds.includes(currentCampaignMissionId)
      ) {
        completedCampaignMissionIds = [
          ...completedCampaignMissionIds,
          currentCampaignMissionId,
        ];
        saveCompletedCampaignMissionIds(completedCampaignMissionIds);
      }

      set({
        battle: null,
        mode: "campaign",
        menuView: "missions",
        pvpRoomId: null,
        pvpStatus: "idle",
        pvpError: null,
        matchEndReason: null,
        pvpTimer: emptyPvpTimer,
        firstTurnRoll: emptyFirstTurnRoll,
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
        currentCampaignMissionId: null,
        completedCampaignMissionIds,
      });
      return;
    }

    set({
      battle: createFreshBattle(get().selectedHeadquartersId),
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },
}));
