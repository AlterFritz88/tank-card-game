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

export function getHeadquartersAvatarAsset(
  headquartersId: HeadquartersId
): string | null {
  return headquartersAvatarAssets[headquartersId] ?? null;
}
