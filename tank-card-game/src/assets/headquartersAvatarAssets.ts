import type { HeadquartersId } from "../game/types";

const avatarModules = import.meta.glob(
  "./headquarters/avatars/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default" }
) as Record<string, string>;

function getAssetId(path: string): string {
  const fileName = path.split(/[\\/]/).pop() ?? "";
  return fileName.replace(/\.(png|jpe?g|webp)$/i, "");
}

const headquartersAvatarAssets = Object.entries(avatarModules).reduce(
  (assets, [path, source]) => {
    assets[getAssetId(path)] = source;
    return assets;
  },
  {} as Record<string, string>
);

/**
 * Headquarters whose portrait differs from the file named after their id.
 * After the campaign rework the 4th tank brigade uses Lavrinenko's new portrait
 * both in the campaign briefings and in the player's regular battles. The 1st
 * Guards brigade is the same формирование later in the campaign, so it carries
 * Lavrinenko's portrait too.
 */
const AVATAR_OVERRIDES: Partial<Record<HeadquartersId, string>> = {
  lavrinenko_tank_brigade: "lavrinenko_tank_brigade_2",
  first_guards_tank_brigade: "lavrinenko_tank_brigade_2",
};

/** Look up an avatar by its raw asset id (filename without extension). */
export function getAvatarAssetById(assetId: string): string | null {
  return headquartersAvatarAssets[assetId] ?? null;
}

export function getHeadquartersAvatarAsset(
  headquartersId: HeadquartersId
): string | null {
  const overrideId = AVATAR_OVERRIDES[headquartersId];

  if (overrideId && headquartersAvatarAssets[overrideId]) {
    return headquartersAvatarAssets[overrideId];
  }

  return headquartersAvatarAssets[headquartersId] ?? null;
}
