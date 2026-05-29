import { create } from "zustand";

import { applyAction } from "../game/engine";
import { createInitialBattleState } from "../game/initialState";
import type { GameMode, MatchEndReason, PvpConnectionState } from "../game/modes";
import type {
  BattleAction,
  BattleState,
  BattleStateView,
  ClientBattleState,
  PlayerId,
} from "../game/types";
import { pvpClient } from "../network/pvpClient";

type SelectedAttacker = {
  type: "unit" | "headquarters";
  id: string;
} | null;

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

type BattleStore = {
  battle: ClientBattleState | null;
  mode: GameMode;
  localPlayerId: PlayerId;
  pvpRoomId: string | null;
  pvpStatus: PvpConnectionState;
  pvpError: string | null;
  matchEndReason: MatchEndReason | null;
  pvpTimer: PvpTimerState;
  firstTurnRoll: FirstTurnRollState;

  selectedCardInstanceId: string | null;
  selectedAttacker: SelectedAttacker;

  selectCard: (cardInstanceId: string | null) => void;
  selectAttacker: (attacker: SelectedAttacker) => void;

  setMode: (mode: GameMode) => void;
  startAiBattle: () => void;
  findPvpMatch: () => void;
  createPvpRoom: () => void;
  joinPvpRoom: (roomId: string) => void;
  startPvpBattle: (roomId?: string) => void;
  applyRemoteBattleState: (battle: BattleStateView) => void;
  applyMatchEnded: (winner: PlayerId, reason: MatchEndReason) => void;
  applyPvpTimer: (timer: {
    activePlayer: PlayerId;
    remainingMs: number;
    endsAt: number;
    durationMs: number;
  }) => void;
  surrenderPvpMatch: () => void;
  leavePvpMatch: () => void;
  cancelMatchmaking: () => void;
  setPvpError: (message: string | null) => void;
  hideFirstTurnRoll: () => void;

  dispatch: (action: BattleAction) => void;
  reset: () => void;
};

const PVP_SERVER_URL =
  import.meta.env.VITE_PVP_SERVER_URL ?? "ws://localhost:8787";

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

function shouldClearSelection(action: BattleAction): boolean {
  return (
    action.type === "PLAY_CARD" ||
    action.type === "MOVE_UNIT" ||
    action.type === "ATTACK" ||
    action.type === "END_TURN"
  );
}

function createFreshBattle() {
  return createInitialBattleState();
}

function getStartRollFinalRotation(firstPlayer: PlayerId): number {
  const targetAngle = firstPlayer === "player" ? 135 : -45;
  return 360 * 8 + targetAngle;
}

function getCleanMenuState() {
  return {
    battle: null,
    mode: "ai" as GameMode,
    localPlayerId: "player" as PlayerId,
    pvpRoomId: null,
    pvpStatus: "idle" as PvpConnectionState,
    pvpError: null,
    matchEndReason: null,
    pvpTimer: emptyPvpTimer,
    selectedCardInstanceId: null,
    selectedAttacker: null,
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
          pvpRoomId: null,
          pvpStatus: "searching",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          selectedCardInstanceId: null,
          selectedAttacker: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "ROOM_CREATED":
      case "ROOM_JOINED":
        clearFirstTurnRollTimers();
        useBattleStore.setState({
          battle: null,
          mode: "pvp",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: message.type === "ROOM_JOINED" ? "matched" : "waiting",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "WAITING_FOR_OPPONENT":
        useBattleStore.setState({
          battle: null,
          pvpRoomId: message.roomId,
          pvpStatus: "waiting",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
        });
        break;

      case "FIRST_TURN_ROLL": {
        clearFirstTurnRollTimers();

        const now = Date.now();
        const revealDelay = Math.max(0, message.revealAt - now);
        const hideDelay = revealDelay + 900;

        useBattleStore.setState({
          battle: message.battle,
          mode: "pvp",
          pvpRoomId: message.roomId,
          pvpStatus: "rolling",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          selectedCardInstanceId: null,
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
        useBattleStore.setState({
          battle: message.battle,
          mode: "pvp",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: "inBattle",
          pvpError: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          selectedCardInstanceId: null,
          selectedAttacker: null,
        });
        break;

      case "GAME_STATE":
        store.applyRemoteBattleState(message.battle);
        break;

      case "TURN_TIMER":
        store.applyPvpTimer(message);
        break;

      case "MATCH_ENDED":
        store.applyMatchEnded(message.winner, message.reason);
        break;

      case "MATCHMAKING_CANCELLED":
        clearFirstTurnRollTimers();
        useBattleStore.setState(getCleanMenuState());
        break;

      case "OPPONENT_LEFT":
        useBattleStore.setState({
          pvpStatus: "finished",
          matchEndReason: message.reason,
          pvpError: null,
          pvpTimer: emptyPvpTimer,
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

    useBattleStore.setState({
      pvpStatus: "error",
      pvpError: "Соединение с PVP-сервером закрыто",
      pvpTimer: emptyPvpTimer,
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
  localPlayerId: "player",
  pvpRoomId: null,
  pvpStatus: "idle",
  pvpError: null,
  matchEndReason: null,
  pvpTimer: emptyPvpTimer,
  firstTurnRoll: emptyFirstTurnRoll,

  selectedCardInstanceId: null,
  selectedAttacker: null,

  selectCard: (cardInstanceId) => {
    set({
      selectedCardInstanceId: cardInstanceId,
      selectedAttacker: null,
    });
  },

  selectAttacker: (attacker) => {
    set({
      selectedAttacker: attacker,
      selectedCardInstanceId: null,
    });
  },

  setMode: (mode) => {
    set({ mode });
  },

  hideFirstTurnRoll: () => {
    set({ firstTurnRoll: emptyFirstTurnRoll });
  },

  startAiBattle: () => {
    clearFirstTurnRollTimers();
    pvpClient.disconnect();

    set({
      battle: createFreshBattle(),
      mode: "ai",
      localPlayerId: "player",
      pvpRoomId: null,
      pvpStatus: "idle",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },

  findPvpMatch: () => {
    clearFirstTurnRollTimers();

    set({
      battle: null,
      mode: "pvp",
      pvpRoomId: null,
      pvpStatus: "connecting",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() => pvpClient.findMatch());
  },

  createPvpRoom: () => {
    clearFirstTurnRollTimers();

    set({
      battle: null,
      mode: "pvp",
      pvpRoomId: null,
      pvpStatus: "connecting",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() => pvpClient.createRoom());
  },

  joinPvpRoom: (roomId) => {
    const normalizedRoomId = roomId.trim().toUpperCase();

    if (!normalizedRoomId) {
      set({ pvpError: "Введите код комнаты" });
      return;
    }

    clearFirstTurnRollTimers();

    set({
      battle: null,
      mode: "pvp",
      pvpRoomId: normalizedRoomId,
      pvpStatus: "connecting",
      pvpError: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() => pvpClient.joinRoom(normalizedRoomId));
  },

  startPvpBattle: (roomId) => {
    if (roomId) {
      get().joinPvpRoom(roomId);
      return;
    }

    get().findPvpMatch();
  },

  applyRemoteBattleState: (battle) => {
    set({
      battle,
      pvpStatus: battle.status === "active" ? "inBattle" : "finished",
      pvpError: null,
      ...(battle.status === "active" ? {} : { pvpTimer: emptyPvpTimer }),
    });
  },

  applyMatchEnded: (_winner, reason) => {
    clearFirstTurnRollTimers();

    set({
      pvpStatus: "finished",
      pvpError: null,
      matchEndReason: reason,
      pvpTimer: emptyPvpTimer,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      selectedAttacker: null,
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
    pvpClient.disconnect();
    set(getCleanMenuState());
  },

  cancelMatchmaking: () => {
    if (get().mode !== "pvp") return;

    pvpClient.cancelMatchmaking();
    clearFirstTurnRollTimers();
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
    const { mode } = get();

    if (mode === "pvp") {
      set({
        selectedCardInstanceId: null,
        selectedAttacker: null,
      });
      return;
    }

    set({
      battle: createFreshBattle(),
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },
}));
