import { create } from "zustand";

import { applyAction } from "../game/engine";
import { createInitialBattleState } from "../game/initialState";
import type { GameMode, PvpConnectionState } from "../game/modes";
import type { BattleAction, BattleState, PlayerId } from "../game/types";
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

type BattleStore = {
  battle: BattleState | null;
  mode: GameMode;
  localPlayerId: PlayerId;
  pvpRoomId: string | null;
  pvpStatus: PvpConnectionState;
  pvpError: string | null;
  firstTurnRoll: FirstTurnRollState;

  selectedCardInstanceId: string | null;
  selectedAttacker: SelectedAttacker;

  selectCard: (cardInstanceId: string | null) => void;
  selectAttacker: (attacker: SelectedAttacker) => void;

  setMode: (mode: GameMode) => void;
  startAiBattle: () => void;
  createPvpRoom: () => void;
  joinPvpRoom: (roomId: string) => void;
  startPvpBattle: (roomId?: string) => void;
  applyRemoteBattleState: (battle: BattleState) => void;
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

function setupPvpSubscriptions() {
  if (pvpSubscriptionsReady) return;
  pvpSubscriptionsReady = true;

  pvpClient.onMessage((message) => {
    const store = useBattleStore.getState();

    switch (message.type) {
      case "ROOM_CREATED":
      case "ROOM_JOINED":
        clearFirstTurnRollTimers();
        useBattleStore.setState({
          battle: null,
          mode: "pvp",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: "waiting",
          pvpError: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "WAITING_FOR_OPPONENT":
        useBattleStore.setState({
          battle: null,
          pvpRoomId: message.roomId,
          pvpStatus: "waiting",
          pvpError: null,
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
          pvpStatus: "connected",
          pvpError: null,
          selectedCardInstanceId: null,
          selectedAttacker: null,
        });
        break;

      case "GAME_STATE":
        store.applyRemoteBattleState(message.battle);
        break;

      case "OPPONENT_DISCONNECTED":
        clearFirstTurnRollTimers();
        useBattleStore.setState({
          pvpStatus: "waiting",
          pvpError: "Противник отключился",
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

    clearFirstTurnRollTimers();

    useBattleStore.setState({
      pvpStatus: "offline",
      pvpError: "Соединение с PVP-сервером закрыто",
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
  pvpStatus: "offline",
  pvpError: null,
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
      pvpStatus: "offline",
      pvpError: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },

  createPvpRoom: () => {
    clearFirstTurnRollTimers();

    set({
      battle: null,
      mode: "pvp",
      pvpRoomId: null,
      pvpStatus: "connecting",
      pvpError: null,
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

    get().createPvpRoom();
  },

  applyRemoteBattleState: (battle) => {
    set({
      battle,
      pvpStatus: "connected",
      pvpError: null,
    });
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

    const currentBattle = get().battle;

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
