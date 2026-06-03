const missionIllustrationModules = import.meta.glob(
  "./backgrounds/missions/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const missionIllustrationsByKey: Record<string, string> = {};

for (const [path, imageUrl] of Object.entries(missionIllustrationModules)) {
  const fileName = path.split("/").pop();
  if (!fileName) continue;

  const key = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "");
  missionIllustrationsByKey[key] = imageUrl;
}

export function getMissionIllustrationAsset(
  illustrationId: string | undefined
): string | null {
  if (!illustrationId) return null;

  return missionIllustrationsByKey[illustrationId] ?? null;
}
