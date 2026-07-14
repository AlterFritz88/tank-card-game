import { loadPlayerProgress } from "./playerProgress";

export const FIRST_PLAYER_PACK_REMINDER_BATTLE_INTERVAL = 7;
const BATTLE_COUNT_KEY = "panzershrek.firstPlayerPackBattleCount";

export function recordBattleForFirstPlayerPackReminder(): boolean {
  if (loadPlayerProgress().cardBackId === "first_player") return false;

  try {
    const current = Number.parseInt(window.localStorage.getItem(BATTLE_COUNT_KEY) ?? "0", 10);
    const next = (Number.isFinite(current) && current > 0 ? current : 0) + 1;
    window.localStorage.setItem(BATTLE_COUNT_KEY, String(next));
    return next % FIRST_PLAYER_PACK_REMINDER_BATTLE_INTERVAL === 0;
  } catch {
    return false;
  }
}
