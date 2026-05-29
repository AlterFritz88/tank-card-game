export type BattleBackgroundId = string;

export const DEFAULT_BATTLE_BACKGROUND_ID: BattleBackgroundId = "base_1";

export function createBattleBackgroundIdFromFilename(
  filename: string
): BattleBackgroundId {
  const lastPathPart = filename.split(/[\\/]/).pop() ?? filename;
  return lastPathPart.replace(/\.[^.]+$/, "");
}

export function normalizeBattleBackgroundId(
  value: string | null | undefined
): BattleBackgroundId {
  const normalized = value?.trim();
  return normalized ? normalized : DEFAULT_BATTLE_BACKGROUND_ID;
}
