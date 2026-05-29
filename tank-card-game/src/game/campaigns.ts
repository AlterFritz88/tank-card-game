import type { BattleBackgroundId } from "./battleBackgrounds";
import type { HeadquartersId } from "./types";

export type CampaignMission = {
  id: string;
  title: string;
  description: string;
  botHeadquartersId: HeadquartersId;
  backgroundId?: BattleBackgroundId;
};

export type Campaign = {
  id: string;
  title: string;
  description: string;
  missions: CampaignMission[];
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "training-front",
    title: "Учебный фронт",
    description: "Первые одиночные операции против Trainingslager.",
    missions: [
      {
        id: "training-front-1",
        title: "Первый контакт",
        description: "Разведка боем против учебного немецкого штаба.",
        botHeadquartersId: "trainingslager",
        backgroundId: "base_1",
      },
      {
        id: "training-front-2",
        title: "Песчаный рубеж",
        description: "Удержи темп и не дай врагу разогнать экономику.",
        botHeadquartersId: "trainingslager",
        backgroundId: "desert_1",
      },
      {
        id: "training-front-3",
        title: "Городская дуэль",
        description: "Финальный учебный бой среди развалин.",
        botHeadquartersId: "trainingslager",
        backgroundId: "german_city",
      },
    ],
  },
];

export function getCampaignMission(
  missionId: string
): { campaign: Campaign; mission: CampaignMission; index: number } | null {
  for (const campaign of CAMPAIGNS) {
    const index = campaign.missions.findIndex((mission) => mission.id === missionId);

    if (index >= 0) {
      return {
        campaign,
        mission: campaign.missions[index],
        index,
      };
    }
  }

  return null;
}

export function isCampaignMissionUnlocked(
  campaign: Campaign,
  missionId: string,
  completedMissionIds: string[]
): boolean {
  const missionIndex = campaign.missions.findIndex(
    (mission) => mission.id === missionId
  );

  if (missionIndex <= 0) return missionIndex === 0;

  const previousMission = campaign.missions[missionIndex - 1];
  return completedMissionIds.includes(previousMission.id);
}
