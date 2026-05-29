import { readdirSync } from "node:fs";
import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BATTLE_BACKGROUND_ID,
  createBattleBackgroundIdFromFilename,
} from "../../tank-card-game/src/game/battleBackgrounds";
import type { BattleBackgroundId } from "../../tank-card-game/src/game/battleBackgrounds";

const BATTLE_BACKGROUND_DIRECTORY = fileURLToPath(
  new URL("../../tank-card-game/src/assets/backgrounds/battle/", import.meta.url)
);
const BATTLE_BACKGROUND_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
]);

export function getBattleBackgroundIds(): BattleBackgroundId[] {
  try {
    return readdirSync(BATTLE_BACKGROUND_DIRECTORY, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((filename) =>
        BATTLE_BACKGROUND_EXTENSIONS.has(extname(filename).toLowerCase())
      )
      .sort((left, right) => left.localeCompare(right))
      .map((filename) =>
        createBattleBackgroundIdFromFilename(basename(filename))
      );
  } catch {
    return [];
  }
}

export function getRandomBattleBackgroundId(): BattleBackgroundId {
  const backgroundIds = getBattleBackgroundIds();
  const index = Math.floor(Math.random() * backgroundIds.length);

  return backgroundIds[index] ?? DEFAULT_BATTLE_BACKGROUND_ID;
}
