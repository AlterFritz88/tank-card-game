import type { BattleBackgroundId } from "./battleBackgrounds";
import type { HeadquartersId } from "./types";

export type CampaignMission = {
  id: string;
  chapter: string;
  title: string;
  description: string;
  botHeadquartersId?: HeadquartersId;
  botDeckId?: string;
  playerDeckId?: string; // allows progressive player decks per mission
  backgroundId?: BattleBackgroundId;
  illustrationId?: string;
  available?: boolean;
};

export type Campaign = {
  id: string;
  title: string;
  description: string;
  playerHeadquartersId: HeadquartersId;
  playerDeckId: string;
  missions: CampaignMission[];
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "training-front",
    title: "1. Panzer Div.",
    description:
      "Польская кампания 1939 года. Проведи 1-ю танковую дивизию через четыре последовательных боя.",
    playerHeadquartersId: "first_panzer_division",
    playerDeckId: "first_panzer_division_campaign",
    missions: [
      {
        id: "training-front-1",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Прорыв польской границы у Розпши",
        description:
          "1–3 сентября 1939. Прорвать укрепления и выйти к реке Варта. Противник: части 7-й польской пехотной дивизии и кавалерийские бригады.",
        botHeadquartersId: "polish_border_guard",
        botDeckId: "polish_border_guard_campaign",
        playerDeckId: "first_panzer_m1",
        backgroundId: "base_1",
        illustrationId: "panzer_div1_m1",
      },
      {
        id: "training-front-2",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Бои за Радом",
        description:
          "5–8 сентября 1939. Окружить польскую армию «Прусы». Противник: 25-я польской пехотной дивизии и остатки кавалерии.",
        botHeadquartersId: "polish_army_lodz",
        botDeckId: "polish_army_lodz_campaign",
        playerDeckId: "first_panzer_m2",
        backgroundId: "german_1",
        illustrationId: "panzer_div1_m2",
      },
      {
        id: "training-front-3",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Битва на Бзуре",
        description:
          "16–20 сентября 1939. Форсировать реку и уничтожить польскую группировку. Противник: части армии «Поможе».",
        botHeadquartersId: "polish_army_prusy",
        botDeckId: "polish_army_prusy_campaign",
        playerDeckId: "first_panzer_m3",
        backgroundId: "german_city",
        illustrationId: "panzer_div1_m3",
      },
      {
        id: "training-front-4",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Наступление на окраины Варшавы",
        description:
          "20–28 сентября 1939. Захватить пригороды и поддержать 18-ю пехотную дивизию. Противник: 1-я и 13-я польские пехотные дивизии.",
        botHeadquartersId: "polish_warsaw_defense",
        botDeckId: "polish_warsaw_defense_campaign",
        playerDeckId: "first_panzer_m4",
        backgroundId: "german_city",
        illustrationId: "panzer_div1_m4",
      },
      {
        id: "training-front-5",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Марш через Арденны",
        description:
          "10–12 мая 1940. Быстрый бросок через леса к Маасу. Противник: бельгийские Chasseurs Ardennais и лёгкие французские части.",
        available: false,
      },
      {
        id: "training-front-6",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Штурм Седана",
        description:
          "13–14 мая 1940. Форсировать Маас и захватить высоты Ла-Марфе. Противник: 55-я французская пехотная дивизия.",
        available: false,
      },
      {
        id: "training-front-7",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Рывок к Ла-Маншу",
        description:
          "15–20 мая 1940. Провести глубокий прорыв и отсечь союзников. Противник: части 1re DCR и британские арьергарды.",
        available: false,
      },
      {
        id: "training-front-8",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Бои у Дюнкерка",
        description:
          "25–31 мая 1940. Блокировать эвакуацию BEF. Противник: британские и французские части у Дюнкерка.",
        available: false,
      },
      {
        id: "training-front-9",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Прорыв линии Вейгана",
        description:
          "5–10 июня 1940. Прорвать вторую французскую линию обороны. Противник: колониальные и пехотные дивизии.",
        available: false,
      },
      {
        id: "training-front-10",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Захват Бельфора",
        description:
          "17–22 июня 1940. Окружить остатки французской армии у линии Мажино. Противник: крепостные дивизии и остатки 2-й армии.",
        available: false,
      },
      {
        id: "training-front-11",
        chapter: "Восточный фронт 1941–1942",
        title: "Переход границы СССР",
        description:
          "22 июня 1941, Литва. Начать операцию «Барбаросса». Противник: 5-я советская танковая дивизия и пограничные части.",
        available: false,
      },
      {
        id: "training-front-12",
        chapter: "Восточный фронт 1941–1942",
        title: "Бои у Даугавпилса и Пскова",
        description:
          "Июль 1941. Захватить переправы и продвинуться к Луге. Противник: 24-я танковая и 90-я стрелковая дивизии.",
        available: false,
      },
      {
        id: "training-front-13",
        chapter: "Восточный фронт 1941–1942",
        title: "Наступление на Ленинград",
        description:
          "Август–сентябрь 1941. Прорваться через район Луги. Противник: части 3-го мехкорпуса и стрелковые дивизии.",
        available: false,
      },
      {
        id: "training-front-14",
        chapter: "Восточный фронт 1941–1942",
        title: "Бои под Москвой",
        description:
          "Октябрь–декабрь 1941. Продолжить прорыв к Москве. Противник: сибирские дивизии 20-й и 16-й советских армий.",
        available: false,
      },
      {
        id: "training-front-15",
        chapter: "Восточный фронт 1941–1942",
        title: "Оборона Ржевского выступа",
        description:
          "Январь–март 1942. Удержать позиции после потерь в технике. Противник: 29-я и 39-я советские армии.",
        available: false,
      },
      {
        id: "training-front-16",
        chapter: "Южный сектор 1943–1945",
        title: "Контратаки западнее Киева",
        description:
          "Ноябрь–декабрь 1943. Стабилизировать фронт после переброски из Греции. Противник: 1-я советская танковая армия.",
        available: false,
      },
      {
        id: "training-front-17",
        chapter: "Южный сектор 1943–1945",
        title: "Деблокирование Корсунь-Черкасского котла",
        description:
          "Январь–февраль 1944. Прорваться к окружённым войскам. Противник: 5-я гвардейская танковая армия.",
        available: false,
      },
      {
        id: "training-front-18",
        chapter: "Южный сектор 1943–1945",
        title: "Выход из котла Хубе",
        description:
          "Март 1944. Выйти из окружения в Западной Украине. Противник: танковые и механизированные корпуса двух Украинских фронтов.",
        available: false,
      },
      {
        id: "training-front-19",
        chapter: "Южный сектор 1943–1945",
        title: "Бои за Будапешт",
        description:
          "Октябрь 1944 – январь 1945. Контратаковать у Дебрецена и деблокировать город. Противник: 3-й Украинский фронт.",
        available: false,
      },
      {
        id: "training-front-20",
        chapter: "Южный сектор 1943–1945",
        title: "Последние бои у Балатона",
        description:
          "Март–май 1945. Организовать оборону и отход в Австрию. Противник: части 6-й гвардейской танковой армии.",
        available: false,
      },
    ],
  },
];

/**
 * Cards granted for completing a fixed set of campaign missions. Shared between
 * the client (which detects completion and requests the claim) and the server
 * (which actually grants the copies and guards against double-claiming). The
 * grant is idempotent server-side, keyed by the reward `id`.
 */
export type CampaignCompletionReward = {
  id: string;
  /** Every listed mission must be completed before the reward unlocks. */
  missionIds: string[];
  cardId: string;
  copies: number;
};

export const CAMPAIGN_COMPLETION_REWARDS: CampaignCompletionReward[] = [
  {
    id: "first_panzer_poland",
    missionIds: [
      "training-front-1",
      "training-front-2",
      "training-front-3",
      "training-front-4",
    ],
    cardId: "pzbef_i",
    copies: 2,
  },
];

export function getCampaignCompletionReward(
  rewardId: string
): CampaignCompletionReward | null {
  return (
    CAMPAIGN_COMPLETION_REWARDS.find((reward) => reward.id === rewardId) ?? null
  );
}

/** Stable id used to mark a campaign reward as claimed in the player profile. */
export function getCampaignRewardClaimKey(rewardId: string): string {
  return `campaign-reward:${rewardId}`;
}

export function isCampaignRewardClaimed(
  claimedRewardIds: string[],
  rewardId: string
): boolean {
  return claimedRewardIds.includes(getCampaignRewardClaimKey(rewardId));
}

/** Campaign-completion rewards that belong to (are earned within) a campaign. */
export function getCampaignCompletionRewardsForCampaign(
  campaign: Campaign
): CampaignCompletionReward[] {
  const missionIds = new Set(campaign.missions.map((mission) => mission.id));

  return CAMPAIGN_COMPLETION_REWARDS.filter((reward) =>
    reward.missionIds.every((missionId) => missionIds.has(missionId))
  );
}

/**
 * Returns the rewards whose required missions are all present in the completed
 * set — i.e. the campaign rewards the player is now entitled to claim.
 */
export function getEarnedCampaignCompletionRewards(
  completedMissionIds: string[]
): CampaignCompletionReward[] {
  const completed = new Set(completedMissionIds);

  return CAMPAIGN_COMPLETION_REWARDS.filter((reward) =>
    reward.missionIds.every((missionId) => completed.has(missionId))
  );
}

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

  if (campaign.missions[missionIndex]?.available === false) return false;
  if (missionIndex <= 0) return missionIndex === 0;

  const previousMission = campaign.missions[missionIndex - 1];
  return completedMissionIds.includes(previousMission.id);
}
