import { create } from "zustand";
import { applyAction } from "../game/engine";
import { createInitialBattleState } from "../game/initialState";
import type { BattleAction, BattleState } from "../game/types";

type BattleStore = {
  battle: BattleState;
  selectedCardInstanceId: string | null;
  selectedAttacker:
    | {
        type: "unit" | "headquarters";
        id: string;
      }
    | null;

  selectCard: (cardInstanceId: string | null) => void;
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

  dispatch: (action) => {
    const current = get().battle;
    const next = applyAction(current, action);

    set({
      battle: next,
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },

  reset: () => {
    set({
      battle: createInitialBattleState(),
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },
}));