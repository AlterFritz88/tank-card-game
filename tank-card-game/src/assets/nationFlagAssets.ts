import type { Nation } from "../game/types";

const nationFlagModules = import.meta.glob(
  "./flags/*.{png,jpg,jpeg,webp,svg}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const flagFileKeys: Record<Nation, string> = {
  ussr: "ussr",
  germany: "third-reich",
  usa: "usa",
  uk: "uk",
  poland: "poland",
  france: "france",
};

export function getNationFlagAsset(nation: Nation): string | null {
  const expectedFilePrefix = `flag-${flagFileKeys[nation]}.`;

  for (const [path, imageUrl] of Object.entries(nationFlagModules)) {
    const fileName = path.split("/").pop();

    if (fileName?.startsWith(expectedFilePrefix)) {
      return imageUrl;
    }
  }

  return null;
}
