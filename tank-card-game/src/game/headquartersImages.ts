import type { HeadquartersId, PlayerId } from "./types";

const headquartersImageModules = import.meta.glob(
  "../assets/headquarters/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const headquartersImagesByFileKey: Record<string, string> = {};

for (const [path, imageUrl] of Object.entries(headquartersImageModules)) {
  const fileName = path.split("/").pop();

  if (!fileName) continue;

  const fileKey = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "");

  headquartersImagesByFileKey[fileKey] = imageUrl;
}

const legacyFileKeysByHeadquartersId: Partial<Record<HeadquartersId, string[]>> = {
  training_unit: ["headquarters-player", "hq-player"],
  trainingslager: ["headquarters-enemy", "hq-enemy"],
  training_camp: ["usa-training-camp", "training-camp"],
  first_panzer_division: ["headquarters-enemy", "hq-enemy", "trainingslager"],
  german_motorized_division: ["trainingslager", "headquarters-enemy", "hq-enemy"],
  german_artillery_division: ["trainingslager", "headquarters-enemy", "hq-enemy"],
  german_rear_corps: ["trainingslager", "headquarters-enemy", "hq-enemy"],
  soviet_tank_brigade: ["training_unit", "headquarters-player", "hq-player"],
  soviet_motor_rifle_division: ["training_unit", "headquarters-player", "hq-player"],
  soviet_guards_mortar_regiment: ["training_unit", "headquarters-player", "hq-player"],
  soviet_auto_battalion: ["training_unit", "headquarters-player", "hq-player"],
  usa_old_ironsides: ["training_camp", "usa-training-camp", "training-camp"],
  usa_armored_infantry_regiment: ["training_camp", "usa-training-camp", "training-camp"],
  usa_armored_artillery_battalion: ["training_camp", "usa-training-camp", "training-camp"],
  usa_maintenance_battalion: ["training_camp", "usa-training-camp", "training-camp"],
};

function getFirstHeadquartersImage(fileKeys: string[]): string | null {
  for (const fileKey of fileKeys) {
    const image = headquartersImagesByFileKey[fileKey];

    if (image) {
      return image;
    }
  }

  return null;
}

export function getHeadquartersImageAsset(
  headquartersId: HeadquartersId
): string | null {
  return getFirstHeadquartersImage([
    headquartersId,
    ...(legacyFileKeysByHeadquartersId[headquartersId] ?? []),
  ]);
}

export function getLegacyHeadquartersImageAsset(
  ownerId: PlayerId
): string | null {
  return getFirstHeadquartersImage(
    ownerId === "player"
      ? ["headquarters-player", "hq-player", "headquarters-friendly", "hq-friendly"]
      : ["headquarters-enemy", "hq-enemy", "headquarters-bot", "hq-bot"]
  );
}
