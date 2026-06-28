import type { Nation } from "./types";

// National flags planted behind each headquarters on the battlefield. They peek
// out from under the HQ card art (see BattleScreen renderRearHqCell).
const battleFlagModules = import.meta.glob(
  "../assets/flags/flags-for-battle/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const battleFlagsByFileKey: Record<string, string> = {};

for (const [path, imageUrl] of Object.entries(battleFlagModules)) {
  const fileName = path.split("/").pop();

  if (!fileName) continue;

  const fileKey = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "").toLowerCase();

  battleFlagsByFileKey[fileKey] = imageUrl;
}

// Some flag files use spelling that differs from the canonical Nation id
// (e.g. "polland" for Poland). Map each nation to the file keys to try in order.
const fileKeysByNation: Record<Nation, string[]> = {
  ussr: ["ussr"],
  germany: ["germany"],
  usa: ["usa"],
  poland: ["polland", "poland"],
  uk: ["uk"],
  france: ["france"],
};

export function getBattleFlagAsset(nation: Nation): string | null {
  for (const fileKey of fileKeysByNation[nation] ?? [nation]) {
    const image = battleFlagsByFileKey[fileKey];

    if (image) {
      return image;
    }
  }

  return null;
}
