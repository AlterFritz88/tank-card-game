import {
  DEFAULT_BATTLE_BACKGROUND_ID,
  createBattleBackgroundIdFromFilename,
  normalizeBattleBackgroundId,
} from "../game/battleBackgrounds";
import type { BattleBackgroundId } from "../game/battleBackgrounds";

export type BattleBackgroundAsset = {
  id: BattleBackgroundId;
  image: string;
  size: string;
  position: string;
  color: string;
};

const battleBackgroundModules = import.meta.glob(
  "./backgrounds/battle/*.{png,jpg,jpeg,webp,avif}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const BATTLE_BACKGROUND_ASSETS = Object.fromEntries(
  Object.entries(battleBackgroundModules)
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([path, image]) => {
      const id = createBattleBackgroundIdFromFilename(path);

      return [
        id,
        {
          id,
          image,
          size: "cover",
          position: "center center",
          color: "#11120f",
        },
      ];
    })
) as Record<BattleBackgroundId, BattleBackgroundAsset>;

const fallbackBackgroundAsset: BattleBackgroundAsset = {
  id: DEFAULT_BATTLE_BACKGROUND_ID,
  image: "",
  size: "cover",
  position: "center center",
  color: "#11120f",
};

export function getBattleBackgroundIds(): BattleBackgroundId[] {
  return Object.keys(BATTLE_BACKGROUND_ASSETS);
}

export function getRandomBattleBackgroundId(): BattleBackgroundId {
  const backgroundIds = getBattleBackgroundIds();
  const index = Math.floor(Math.random() * backgroundIds.length);

  return backgroundIds[index] ?? DEFAULT_BATTLE_BACKGROUND_ID;
}

export function getBattleBackgroundAsset(
  backgroundId: BattleBackgroundId | string | null | undefined
): BattleBackgroundAsset {
  const normalizedBackgroundId = normalizeBattleBackgroundId(backgroundId);

  return (
    BATTLE_BACKGROUND_ASSETS[normalizedBackgroundId] ??
    BATTLE_BACKGROUND_ASSETS[DEFAULT_BATTLE_BACKGROUND_ID] ??
    Object.values(BATTLE_BACKGROUND_ASSETS)[0] ??
    fallbackBackgroundAsset
  );
}
