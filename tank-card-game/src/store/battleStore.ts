import { create } from "zustand";
import { runBotTurn } from "../game/bot";
import { applyAction } from "../game/engine";
import { createInitialBattleState } from "../game/initialState";
import type { BattleAction, BattleState } from "../game/types";

type SelectedMode = "attack" | "move";

type BattleStore = {
  battle: BattleState;
  selectedCardInstanceId: string | null;
  selectedMode: SelectedMode;
  selectedAttacker:
    | {
        type: "unit" | "headquarters";
        id: string;
      }
    | null;

  selectCard: (cardInstanceId: string | null) => void;
  selectMode: (mode: SelectedMode) => void;
  selectAttacker: (
    attacker: {
      type: "unit" | "headquarters";
      id: string;
    } | null
  ) => void;
  dispatch: (action: BattleAction) => void;
  reset: () => void;
};

export const useBattleStore = create<BattleStore>((set, get) => ({
  battle: createInitialBattleState(),
  selectedCardInstanceId: null,
  selectedMode: "attack",
  selectedAttacker: null,

  selectCard: (cardInstanceId) => {
    set({
      selectedCardInstanceId: cardInstanceId,
      selectedAttacker: null,
      selectedMode: "attack",
    });
  },

  selectMode: (mode) => {
    set({
      selectedMode: mode,
    });
  },

  selectAttacker: (attacker) => {
    set({
      selectedAttacker: attacker,
      selectedCardInstanceId: null,
    });
  },

  dispatch: (action) => {
    const current = get().battle;
    let next = applyAction(current, action);

    if (next.activePlayer === "bot" && next.status === "active") {
      next = runBotTurn(next);
    }

    set({
      battle: next,
      selectedCardInstanceId: null,
      selectedAttacker: null,
      selectedMode: "attack",
    });
  },

  reset: () => {
    set({
      battle: createInitialBattleState(),
      selectedCardInstanceId: null,
      selectedAttacker: null,
      selectedMode: "attack",
    });
  },
}));