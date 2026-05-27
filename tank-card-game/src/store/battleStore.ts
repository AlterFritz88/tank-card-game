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

type BattleStore = {
  battle: BattleState | null;
  mode: GameMode;
  localPlayerId: PlayerId;
  pvpRoomId: string | null;
  pvpStatus: PvpConnectionState;
  pvpError: string | null;

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

  dispatch: (action: BattleAction) => void;
  reset: () => void;
};

const PVP_SERVER_URL =
  import.meta.env.VITE_PVP_SERVER_URL ?? "ws://localhost:8787";

let pvpSubscriptionsReady = false;

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

function setupPvpSubscriptions() {
  if (pvpSubscriptionsReady) return;
  pvpSubscriptionsReady = true;

  pvpClient.onMessage((message) => {
    const store = useBattleStore.getState();

    switch (message.type) {
      case "ROOM_CREATED":
      case "ROOM_JOINED":
        useBattleStore.setState({
          battle: null,
          mode: "pvp",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: "waiting",
          pvpError: null,
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
        useBattleStore.setState({
          pvpStatus: "waiting",
          pvpError: "Противник отключился",
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

    useBattleStore.setState({
      pvpStatus: "offline",
      pvpError: "Соединение с PVP-сервером закрыто",
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

  startAiBattle: () => {
    pvpClient.disconnect();

    set({
      battle: createFreshBattle(),
      mode: "ai",
      localPlayerId: "player",
      pvpRoomId: null,
      pvpStatus: "offline",
      pvpError: null,
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },

  createPvpRoom: () => {
    set({
      battle: null,
      mode: "pvp",
      pvpRoomId: null,
      pvpStatus: "connecting",
      pvpError: null,
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

    set({
      battle: null,
      mode: "pvp",
      pvpRoomId: normalizedRoomId,
      pvpStatus: "connecting",
      pvpError: null,
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
