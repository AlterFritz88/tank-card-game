import { create } from "zustand";
import { applyAction } from "../game/engine";
import { createInitialBattleState } from "../game/initialState";
import type { BattleAction, BattleState } from "../game/types";

type SelectedAttacker = {
  type: "unit" | "headquarters";
  id: string;
} | null;

type BattleStore = {
  battle: BattleState;
  selectedCardInstanceId: string | null;
  selectedAttacker: SelectedAttacker;

  selectCard: (cardInstanceId: string | null) => void;
  selectAttacker: (attacker: SelectedAttacker) => void;
  dispatch: (action: BattleAction) => void;
  reset: () => void;
};

function shouldClearSelection(action: BattleAction): boolean {
  return (
    action.type === "PLAY_CARD" ||
    action.type === "MOVE_UNIT" ||
    action.type === "ATTACK" ||
    action.type === "END_TURN"
  );
}

export const useBattleStore = create<BattleStore>()((set, get) => ({
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
    const nextBattle = applyAction(get().battle, action);

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
    set({
      battle: createInitialBattleState(),
      selectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },
}));