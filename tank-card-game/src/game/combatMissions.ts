import { getHeadquartersDefinition } from "./headquarters";
import type { BattleRewardSource } from "./economy";
import type { HeadquartersId, Nation, PlayerId } from "./types";

export type CombatMissionPeriod = "daily" | "weekly";
export type CombatMissionSlot = "general" | "destruction" | "deployment";
export type CombatMissionMetric =
  | "battles"
  | "wins"
  | "kills_total"
  | "kills_tanks"
  | "kills_td"
  | "kills_spg"
  | "played_tanks"
  | "played_light"
  | "played_heavy"
  | "played_support"
  | "played_transport"
  | "wins_nation"
  | "radio_turns_completed"
  | "radio_cards_played"
  | "radio_units_destroyed"
  | "radio_turns_without_timeout"
  | "radio_duels_completed"
  | "radio_duels_won";

export type RadioDuelMissionEvent = {
  turnsCompleted?: number;
  cardsPlayed?: number;
  unitsDestroyed?: number;
  turnsWithoutTimeout?: number;
  duelsCompleted?: number;
  duelsWon?: number;
};

export type CombatMissionDefinition = {
  id: string;
  period: CombatMissionPeriod;
  slot: CombatMissionSlot;
  metric: CombatMissionMetric;
  target: number;
  reward: number;
  nation?: Nation;
  title: { ru: string; en: string };
  description: { ru: string; en: string };
};

export type CombatMissionProgress = {
  id: string;
  progress: number;
  completedAt: number | null;
};

export type CombatMissionSet = {
  periodKey: string;
  expiresAt: number;
  missions: CombatMissionProgress[];
};

export type CombatMissionsState = {
  daily: CombatMissionSet | null;
  weekly: CombatMissionSet | null;
};

export const COMBAT_MISSION_TARGET_MULTIPLIER = 1.5;
export const COMBAT_MISSION_REWARD_MULTIPLIER = 10;

function pluralRu(count: number, one: string, few: string, many: string): string {
  const lastTwoDigits = Math.abs(count) % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return many;
  const lastDigit = lastTwoDigits % 10;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

function formatRussianMissionDescription(
  metric: CombatMissionMetric,
  target: number,
  nation?: Nation
): string {
  switch (metric) {
    case "battles":
      return `Проведите ${target} ${pluralRu(target, "бой", "боя", "боёв")}`;
    case "wins":
      return `Одержите ${target} ${pluralRu(target, "победу", "победы", "побед")}`;
    case "kills_total":
      return `Уничтожьте ${target} ${pluralRu(target, "вражеский юнит", "вражеских юнита", "вражеских юнитов")}`;
    case "kills_tanks":
      return `Уничтожьте ${target} ${pluralRu(target, "вражеский танк", "вражеских танка", "вражеских танков")}`;
    case "kills_td":
      return `Уничтожьте ${target} ПТ-САУ`;
    case "kills_spg":
      return `Уничтожьте ${target} САУ`;
    case "played_tanks":
      return `Разыграйте ${target} ${pluralRu(target, "танк", "танка", "танков")}`;
    case "played_light":
      return `Разыграйте ${target} ${pluralRu(
        target,
        "лёгкий танк или бронеавтомобиль",
        "лёгких танка или бронеавтомобиля",
        "лёгких танков или бронеавтомобилей"
      )}`;
    case "played_heavy":
      return `Разыграйте ${target} ${pluralRu(target, "тяжёлый танк", "тяжёлых танка", "тяжёлых танков")}`;
    case "played_support":
      return `Разыграйте ${target} ${pluralRu(target, "юнит поддержки", "юнита поддержки", "юнитов поддержки")}`;
    case "played_transport":
      return `Разыграйте ${target} ${pluralRu(target, "грузовик снабжения", "грузовика снабжения", "грузовиков снабжения")}`;
    case "wins_nation": {
      const headquartersByNation: Record<Nation, string> = {
        ussr: "советский штаб",
        germany: "немецкий штаб",
        usa: "американский штаб",
        uk: "британский штаб",
        poland: "польский штаб",
        france: "французский штаб",
      };
      const headquarters = nation ? headquartersByNation[nation] : "выбранный штаб";
      return `Одержите ${target} ${pluralRu(target, "победу", "победы", "побед")}, играя за ${headquarters}`;
    }
    case "radio_turns_completed":
      return `Завершите ${target} ${pluralRu(target, "свой ход", "своих хода", "своих ходов")} в радиодуэлях`;
    case "radio_cards_played":
      return `Разыграйте ${target} ${pluralRu(target, "карту", "карты", "карт")} в радиодуэлях`;
    case "radio_units_destroyed":
      return `Уничтожьте ${target} ${pluralRu(target, "вражеский юнит", "вражеских юнита", "вражеских юнитов")} в радиодуэлях`;
    case "radio_turns_without_timeout":
      return `Завершите ${target} ${pluralRu(target, "ход", "хода", "ходов")} в радиодуэлях без штрафа за время`;
    case "radio_duels_completed":
      return `Завершите ${target} ${pluralRu(target, "радиодуэль", "радиодуэли", "радиодуэлей")}`;
    case "radio_duels_won":
      return `Победите в ${target} ${pluralRu(target, "радиодуэли", "радиодуэлях", "радиодуэлях")}`;
  }
}

function formatEnglishMissionDescription(
  metric: CombatMissionMetric,
  target: number,
  nation?: Nation
): string {
  const plural = (one: string, many = `${one}s`) => target === 1 ? one : many;
  switch (metric) {
    case "battles": return `Play ${target} ${plural("battle")}`;
    case "wins": return `Win ${target} ${plural("battle")}`;
    case "kills_total": return `Destroy ${target} enemy ${plural("unit")}`;
    case "kills_tanks": return `Destroy ${target} enemy ${plural("tank")}`;
    case "kills_td": return `Destroy ${target} ${plural("tank destroyer")}`;
    case "kills_spg": return `Destroy ${target} ${plural("SPG")}`;
    case "played_tanks": return `Play ${target} ${plural("tank")}`;
    case "played_light": return `Play ${target} light ${plural("tank or armored car", "tanks or armored cars")}`;
    case "played_heavy": return `Play ${target} heavy ${plural("tank")}`;
    case "played_support": return `Play ${target} support ${plural("unit")}`;
    case "played_transport": return `Play ${target} supply ${plural("transport")}`;
    case "wins_nation": {
      const headquartersByNation: Record<Nation, string> = {
        ussr: "Soviet",
        germany: "German",
        usa: "US",
        uk: "British",
        poland: "Polish",
        france: "French",
      };
      const headquarters = nation ? headquartersByNation[nation] : "selected";
      return `Win ${target} ${plural("battle")} with a ${headquarters} headquarters`;
    }
    case "radio_turns_completed": return `Complete ${target} of your turns in radio duels`;
    case "radio_cards_played": return `Play ${target} ${plural("card")} in radio duels`;
    case "radio_units_destroyed": return `Destroy ${target} enemy ${plural("unit")} in radio duels`;
    case "radio_turns_without_timeout": return `Complete ${target} ${plural("turn")} in radio duels without a timeout penalty`;
    case "radio_duels_completed": return `Complete ${target} radio ${plural("duel")}`;
    case "radio_duels_won": return `Win ${target} radio ${plural("duel")}`;
  }
}

const definition = (
  value: CombatMissionDefinition
): CombatMissionDefinition => {
  const target = Math.ceil(value.target * COMBAT_MISSION_TARGET_MULTIPLIER);
  return {
    ...value,
    target,
    reward: value.reward * COMBAT_MISSION_REWARD_MULTIPLIER,
    description: {
      ru: formatRussianMissionDescription(value.metric, target, value.nation),
      en: formatEnglishMissionDescription(value.metric, target, value.nation),
    },
  };
};

const radioDefinition = (
  value: Omit<CombatMissionDefinition, "description">
): CombatMissionDefinition => ({
  ...value,
  description: {
    ru: formatRussianMissionDescription(value.metric, value.target, value.nation),
    en: formatEnglishMissionDescription(value.metric, value.target, value.nation),
  },
});

export const COMBAT_MISSION_DEFINITIONS: CombatMissionDefinition[] = [
  definition({ id: "daily_battle_shift", period: "daily", slot: "general", metric: "battles", target: 3, reward: 10, title: { ru: "Боевая смена", en: "Combat Shift" }, description: { ru: "Проведите 3 боя", en: "Play 3 battles" } }),
  definition({ id: "daily_first_victory", period: "daily", slot: "general", metric: "wins", target: 1, reward: 15, title: { ru: "Первая победа", en: "First Victory" }, description: { ru: "Победите в 1 бою", en: "Win 1 battle" } }),
  definition({ id: "daily_no_mistakes", period: "daily", slot: "general", metric: "wins", target: 2, reward: 20, title: { ru: "Без права на ошибку", en: "No Room for Error" }, description: { ru: "Победите в 2 боях", en: "Win 2 battles" } }),
  definition({ id: "daily_armor_hunter", period: "daily", slot: "destruction", metric: "kills_total", target: 8, reward: 15, title: { ru: "Охотник на броню", en: "Armor Hunter" }, description: { ru: "Уничтожьте 8 вражеских юнитов", en: "Destroy 8 enemy units" } }),
  definition({ id: "daily_tank_breaker", period: "daily", slot: "destruction", metric: "kills_tanks", target: 5, reward: 15, title: { ru: "Истребитель танков", en: "Tank Breaker" }, description: { ru: "Уничтожьте 5 вражеских танков", en: "Destroy 5 enemy tanks" } }),
  definition({ id: "daily_ambush_ready", period: "daily", slot: "destruction", metric: "kills_td", target: 3, reward: 20, title: { ru: "Засада раскрыта", en: "Ambush Broken" }, description: { ru: "Уничтожьте 3 ПТ-САУ", en: "Destroy 3 tank destroyers" } }),
  definition({ id: "daily_counter_battery", period: "daily", slot: "destruction", metric: "kills_spg", target: 3, reward: 20, title: { ru: "Контрбатарейная борьба", en: "Counter-battery Fire" }, description: { ru: "Уничтожьте 3 САУ", en: "Destroy 3 SPGs" } }),
  definition({ id: "daily_steel_fist", period: "daily", slot: "deployment", metric: "played_tanks", target: 6, reward: 15, title: { ru: "Стальной кулак", en: "Steel Fist" }, description: { ru: "Разыграйте 6 танков", en: "Play 6 tanks" } }),
  definition({ id: "daily_recon", period: "daily", slot: "deployment", metric: "played_light", target: 5, reward: 15, title: { ru: "Разведка боем", en: "Reconnaissance in Force" }, description: { ru: "Разыграйте 5 лёгких танков или бронеавтомобилей", en: "Play 5 light tanks or armored cars" } }),
  definition({ id: "daily_heavy_reserve", period: "daily", slot: "deployment", metric: "played_heavy", target: 3, reward: 20, title: { ru: "Тяжёлый резерв", en: "Heavy Reserve" }, description: { ru: "Разыграйте 3 тяжёлых танка", en: "Play 3 heavy tanks" } }),
  definition({ id: "daily_rear_at_work", period: "daily", slot: "deployment", metric: "played_transport", target: 4, reward: 20, title: { ru: "Тыл работает", en: "The Rear Delivers" }, description: { ru: "Разыграйте 4 грузовика снабжения", en: "Play 4 supply transports" } }),
  definition({ id: "daily_reliable_rear", period: "daily", slot: "deployment", metric: "played_support", target: 5, reward: 15, title: { ru: "Надёжный тыл", en: "Reliable Rear" }, description: { ru: "Разыграйте 5 юнитов поддержки", en: "Play 5 support units" } }),

  definition({ id: "weekly_front_veteran", period: "weekly", slot: "general", metric: "battles", target: 20, reward: 60, title: { ru: "Ветеран фронта", en: "Frontline Veteran" }, description: { ru: "Проведите 20 боёв", en: "Play 20 battles" } }),
  definition({ id: "weekly_victory_streak", period: "weekly", slot: "general", metric: "wins", target: 10, reward: 90, title: { ru: "Победная серия", en: "Victory Streak" }, description: { ru: "Победите в 10 боях", en: "Win 10 battles" } }),
  definition({ id: "weekly_red_banner", period: "weekly", slot: "general", metric: "wins_nation", target: 10, reward: 120, nation: "ussr", title: { ru: "Красное знамя", en: "Red Banner" }, description: { ru: "Победите в 10 боях за советский штаб", en: "Win 10 battles with a Soviet headquarters" } }),
  definition({ id: "weekly_steel_blitz", period: "weekly", slot: "general", metric: "wins_nation", target: 10, reward: 120, nation: "germany", title: { ru: "Стальной блиц", en: "Steel Blitz" }, description: { ru: "Победите в 10 боях за немецкий штаб", en: "Win 10 battles with a German headquarters" } }),
  definition({ id: "weekly_democracy_arsenal", period: "weekly", slot: "general", metric: "wins_nation", target: 10, reward: 120, nation: "usa", title: { ru: "Арсенал демократии", en: "Arsenal of Democracy" }, description: { ru: "Победите в 10 боях за американский штаб", en: "Win 10 battles with a US headquarters" } }),
  definition({ id: "weekly_island_resolve", period: "weekly", slot: "general", metric: "wins_nation", target: 10, reward: 120, nation: "uk", title: { ru: "Островная стойкость", en: "Island Resolve" }, description: { ru: "Победите в 10 боях за британский штаб", en: "Win 10 battles with a British headquarters" } }),
  definition({ id: "weekly_shared_freedom", period: "weekly", slot: "general", metric: "wins_nation", target: 10, reward: 120, nation: "poland", title: { ru: "За вашу и нашу свободу", en: "For Our Freedom and Yours" }, description: { ru: "Победите в 10 боях за польский штаб", en: "Win 10 battles with a Polish headquarters" } }),
  definition({ id: "weekly_great_hunt", period: "weekly", slot: "destruction", metric: "kills_total", target: 60, reward: 90, title: { ru: "Большая охота", en: "The Great Hunt" }, description: { ru: "Уничтожьте 60 вражеских юнитов", en: "Destroy 60 enemy units" } }),
  definition({ id: "weekly_tank_massacre", period: "weekly", slot: "destruction", metric: "kills_tanks", target: 30, reward: 90, title: { ru: "Танковый погром", en: "Tank Rout" }, description: { ru: "Уничтожьте 30 вражеских танков", en: "Destroy 30 enemy tanks" } }),
  definition({ id: "weekly_spg_hunter", period: "weekly", slot: "destruction", metric: "kills_td", target: 15, reward: 120, title: { ru: "Гроза самоходок", en: "Destroyer of Tank Hunters" }, description: { ru: "Уничтожьте 15 ПТ-САУ", en: "Destroy 15 tank destroyers" } }),
  definition({ id: "weekly_clear_rear", period: "weekly", slot: "destruction", metric: "kills_spg", target: 15, reward: 120, title: { ru: "Огонь по батареям", en: "Fire on the Batteries" }, description: { ru: "Уничтожьте 15 САУ", en: "Destroy 15 SPGs" } }),
  definition({ id: "weekly_tank_army", period: "weekly", slot: "deployment", metric: "played_tanks", target: 40, reward: 90, title: { ru: "Танковая армия", en: "Tank Army" }, description: { ru: "Разыграйте 40 танков", en: "Play 40 tanks" } }),
  definition({ id: "weekly_mechanized_corps", period: "weekly", slot: "deployment", metric: "played_light", target: 25, reward: 90, title: { ru: "Механизированный корпус", en: "Mechanized Corps" }, description: { ru: "Разыграйте 25 лёгких танков или бронеавтомобилей", en: "Play 25 light tanks or armored cars" } }),
  definition({ id: "weekly_heavy_echelon", period: "weekly", slot: "deployment", metric: "played_heavy", target: 20, reward: 120, title: { ru: "Тяжёлый эшелон", en: "Heavy Echelon" }, description: { ru: "Разыграйте 20 тяжёлых танков", en: "Play 20 heavy tanks" } }),
  definition({ id: "weekly_lifeline", period: "weekly", slot: "deployment", metric: "played_transport", target: 20, reward: 120, title: { ru: "Дорога жизни", en: "Lifeline" }, description: { ru: "Разыграйте 20 грузовиков снабжения", en: "Play 20 supply transports" } }),
  definition({ id: "weekly_logistics", period: "weekly", slot: "deployment", metric: "played_support", target: 30, reward: 90, title: { ru: "Военная логистика", en: "Military Logistics" }, description: { ru: "Разыграйте 30 юнитов поддержки", en: "Play 30 support units" } }),

  radioDefinition({ id: "daily_radio_contact", period: "daily", slot: "general", metric: "radio_turns_completed", target: 2, reward: 150, title: { ru: "Сеанс связи", en: "Radio Contact" } }),
  radioDefinition({ id: "daily_radio_received", period: "daily", slot: "deployment", metric: "radio_cards_played", target: 5, reward: 150, title: { ru: "Передача принята", en: "Message Received" } }),
  radioDefinition({ id: "daily_radio_return_fire", period: "daily", slot: "destruction", metric: "radio_units_destroyed", target: 3, reward: 200, title: { ru: "Ответный огонь", en: "Return Fire" } }),
  radioDefinition({ id: "daily_radio_clear_signal", period: "daily", slot: "general", metric: "radio_turns_without_timeout", target: 2, reward: 200, title: { ru: "Без помех", en: "Clear Signal" } }),

  radioDefinition({ id: "weekly_radio_watch", period: "weekly", slot: "general", metric: "radio_turns_completed", target: 12, reward: 900, title: { ru: "Радиовахта", en: "Radio Watch" } }),
  radioDefinition({ id: "weekly_radio_duel_complete", period: "weekly", slot: "general", metric: "radio_duels_completed", target: 2, reward: 1000, title: { ru: "Дуэль окончена", en: "Duel Complete" } }),
  radioDefinition({ id: "weekly_radio_victory", period: "weekly", slot: "general", metric: "radio_duels_won", target: 1, reward: 1200, title: { ru: "Победа в эфире", en: "Victory on the Air" } }),
  radioDefinition({ id: "weekly_radio_suppression", period: "weekly", slot: "destruction", metric: "radio_units_destroyed", target: 15, reward: 900, title: { ru: "Подавление противника", en: "Enemy Suppression" } }),
];

const DEFINITIONS_BY_ID = new Map(COMBAT_MISSION_DEFINITIONS.map((item) => [item.id, item]));

export function getCombatMissionDefinition(id: string): CombatMissionDefinition | null {
  return DEFINITIONS_BY_ID.get(id) ?? null;
}

function isRadioMissionDefinition(
  mission: CombatMissionDefinition
): boolean {
  return mission.metric.startsWith("radio_");
}

function combatMissionSetHasRadioMission(set: CombatMissionSet | null): boolean {
  return Boolean(
    set?.missions.some((mission) => {
      const definition = getCombatMissionDefinition(mission.id);
      return definition ? isRadioMissionDefinition(definition) : false;
    })
  );
}

export function getCombatMissionPeriodKey(period: CombatMissionPeriod, now = Date.now()): string {
  const date = new Date(now);
  if (period === "daily") return date.toISOString().slice(0, 10);

  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function getCombatMissionExpiry(period: CombatMissionPeriod, now = Date.now()): number {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  if (period === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 8);
  }
  return date.getTime();
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickDefinition(
  candidates: CombatMissionDefinition[],
  seed: string
): CombatMissionDefinition {
  return candidates[hashText(seed) % candidates.length];
}

export function createCombatMissionSet(input: {
  period: CombatMissionPeriod;
  playerKey: string;
  unlockedHeadquartersIds: HeadquartersId[];
  includeRadioMission?: boolean;
  now?: number;
}): CombatMissionSet {
  const now = input.now ?? Date.now();
  const periodKey = getCombatMissionPeriodKey(input.period, now);
  const unlockedNations = new Set(
    input.unlockedHeadquartersIds.map((id) => getHeadquartersDefinition(id).nation)
  );
  const missions = (["general", "destruction", "deployment"] as const).map((slot) => {
    const candidates = COMBAT_MISSION_DEFINITIONS.filter(
      (item) =>
        item.period === input.period &&
        item.slot === slot &&
        !isRadioMissionDefinition(item) &&
        (!item.nation || unlockedNations.has(item.nation))
    );
    const selected = pickDefinition(candidates, `${input.playerKey}:${periodKey}:${slot}`);
    return { id: selected.id, progress: 0, completedAt: null };
  });

  if (input.includeRadioMission) {
    const radioCandidates = COMBAT_MISSION_DEFINITIONS.filter(
      (item) => item.period === input.period && isRadioMissionDefinition(item)
    );
    if (radioCandidates.length > 0) {
      const selected = pickDefinition(
        radioCandidates,
        `${input.playerKey}:${periodKey}:radio`
      );
      const slotIndex = (["general", "destruction", "deployment"] as const)
        .indexOf(selected.slot);
      missions[slotIndex] = {
        id: selected.id,
        progress: 0,
        completedAt: null,
      };
    }
  }

  return { periodKey, expiresAt: getCombatMissionExpiry(input.period, now), missions };
}

export function createEmptyCombatMissionsState(): CombatMissionsState {
  return { daily: null, weekly: null };
}

export function normalizeCombatMissionsState(value: unknown): CombatMissionsState {
  if (!value || typeof value !== "object") return createEmptyCombatMissionsState();
  const candidate = value as Partial<CombatMissionsState>;
  const normalizeSet = (set: unknown): CombatMissionSet | null => {
    if (!set || typeof set !== "object") return null;
    const item = set as Partial<CombatMissionSet>;
    if (typeof item.periodKey !== "string" || !Array.isArray(item.missions)) return null;
    const missions = item.missions.flatMap((mission): CombatMissionProgress[] => {
      if (!mission || typeof mission !== "object") return [];
      const progress = mission as Partial<CombatMissionProgress>;
      if (typeof progress.id !== "string" || !getCombatMissionDefinition(progress.id)) return [];
      return [{
        id: progress.id,
        progress: typeof progress.progress === "number" && Number.isFinite(progress.progress)
          ? Math.max(0, Math.floor(progress.progress)) : 0,
        completedAt: typeof progress.completedAt === "number" && Number.isFinite(progress.completedAt)
          ? Math.max(0, Math.floor(progress.completedAt)) : null,
      }];
    });
    if (missions.length !== 3) return null;
    return {
      periodKey: item.periodKey.slice(0, 16),
      expiresAt: typeof item.expiresAt === "number" && Number.isFinite(item.expiresAt)
        ? Math.max(0, Math.floor(item.expiresAt)) : 0,
      missions,
    };
  };
  return { daily: normalizeSet(candidate.daily), weekly: normalizeSet(candidate.weekly) };
}

export function refreshCombatMissions<T extends {
  tutorialCompleted: boolean;
  unlockedHeadquartersIds: HeadquartersId[];
  combatMissions: CombatMissionsState;
}>(profile: T, playerKey: string, now = Date.now()): T {
  if (!profile.tutorialCompleted) return profile;
  const dailyPeriodKey = getCombatMissionPeriodKey("daily", now);
  const weeklyPeriodKey = getCombatMissionPeriodKey("weekly", now);
  let daily = profile.combatMissions.daily?.periodKey === dailyPeriodKey
    ? profile.combatMissions.daily
    : null;
  let weekly = profile.combatMissions.weekly?.periodKey === weeklyPeriodKey
    ? profile.combatMissions.weekly
    : null;

  const registeredPlayer = playerKey.startsWith("user:");
  const radioMissionAlreadyActive =
    combatMissionSetHasRadioMission(daily) ||
    combatMissionSetHasRadioMission(weekly);
  let radioMissionPeriod: CombatMissionPeriod | null = null;

  if (registeredPlayer && !radioMissionAlreadyActive) {
    if (!daily && !weekly) {
      radioMissionPeriod =
        hashText(`${playerKey}:${weeklyPeriodKey}:radio-period`) % 2 === 0
          ? "daily"
          : "weekly";
    } else if (!daily) {
      radioMissionPeriod = "daily";
    } else if (!weekly) {
      radioMissionPeriod = "weekly";
    }
  }

  if (!daily) {
    daily = createCombatMissionSet({
      period: "daily",
      playerKey,
      unlockedHeadquartersIds: profile.unlockedHeadquartersIds,
      includeRadioMission: radioMissionPeriod === "daily",
      now,
    });
  }
  if (!weekly) {
    weekly = createCombatMissionSet({
      period: "weekly",
      playerKey,
      unlockedHeadquartersIds: profile.unlockedHeadquartersIds,
      includeRadioMission: radioMissionPeriod === "weekly",
      now,
    });
  }
  return { ...profile, combatMissions: { daily, weekly } };
}

function totalKills(stats: Record<string, number>): number {
  return Object.values(stats).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function missionDelta(
  mission: CombatMissionDefinition,
  battle: BattleRewardSource,
  localPlayerId: PlayerId,
  won: boolean
): number {
  const kills = localPlayerId === "player" ? battle.stats.destroyedByPlayer : battle.stats.destroyedByBot;
  const played = localPlayerId === "player" ? battle.stats.playedByPlayer : battle.stats.playedByBot;
  switch (mission.metric) {
    case "battles": return 1;
    case "wins": return won ? 1 : 0;
    case "wins_nation": {
      const hqId = battle.headquarters[localPlayerId].headquartersId ?? battle[localPlayerId].headquartersId;
      return won && getHeadquartersDefinition(hqId).nation === mission.nation ? 1 : 0;
    }
    case "kills_total": return totalKills(kills);
    case "kills_tanks": return (kills.light ?? 0) + (kills.medium ?? 0) + (kills.heavy ?? 0) + (kills.td ?? 0);
    case "kills_td": return kills.td ?? 0;
    case "kills_spg": return kills.spg ?? 0;
    case "played_tanks": return (played?.light ?? 0) + (played?.medium ?? 0) + (played?.heavy ?? 0) + (played?.td ?? 0);
    case "played_light": return (played?.light ?? 0) + (played?.armored_car ?? 0);
    case "played_heavy": return played?.heavy ?? 0;
    case "played_support": return played?.support ?? 0;
    case "played_transport": return played?.transport ?? 0;
    case "radio_turns_completed":
    case "radio_cards_played":
    case "radio_units_destroyed":
    case "radio_turns_without_timeout":
    case "radio_duels_completed":
    case "radio_duels_won":
      return 0;
  }
}

function radioMissionDelta(
  mission: CombatMissionDefinition,
  event: RadioDuelMissionEvent
): number {
  switch (mission.metric) {
    case "radio_turns_completed": return event.turnsCompleted ?? 0;
    case "radio_cards_played": return event.cardsPlayed ?? 0;
    case "radio_units_destroyed": return event.unitsDestroyed ?? 0;
    case "radio_turns_without_timeout": return event.turnsWithoutTimeout ?? 0;
    case "radio_duels_completed": return event.duelsCompleted ?? 0;
    case "radio_duels_won": return event.duelsWon ?? 0;
    default: return 0;
  }
}

export function applyRadioDuelToCombatMissions<T extends {
  tutorialCompleted: boolean;
  unlockedHeadquartersIds: HeadquartersId[];
  combatMissions: CombatMissionsState;
  ironTracks: number;
}>(
  profile: T,
  playerKey: string,
  event: RadioDuelMissionEvent,
  now = Date.now()
): T {
  if (!profile.tutorialCompleted || !playerKey.startsWith("user:")) {
    return profile;
  }

  const refreshed = refreshCombatMissions(profile, playerKey, now);
  let earnedTracks = 0;
  const updateSet = (set: CombatMissionSet | null): CombatMissionSet | null =>
    set
      ? {
          ...set,
          missions: set.missions.map((mission) => {
            if (mission.completedAt) return mission;
            const task = getCombatMissionDefinition(mission.id);
            if (!task || !isRadioMissionDefinition(task)) return mission;
            const progress = Math.min(
              task.target,
              mission.progress + radioMissionDelta(task, event)
            );
            if (progress < task.target) return { ...mission, progress };
            earnedTracks += task.reward;
            return { ...mission, progress, completedAt: now };
          }),
        }
      : null;

  const daily = updateSet(refreshed.combatMissions.daily);
  const weekly = updateSet(refreshed.combatMissions.weekly);

  return {
    ...refreshed,
    ironTracks: refreshed.ironTracks + earnedTracks,
    combatMissions: { daily, weekly },
  };
}

export function applyBattleToCombatMissions<T extends {
  tutorialCompleted: boolean;
  unlockedHeadquartersIds: HeadquartersId[];
  combatMissions: CombatMissionsState;
  ironTracks: number;
}>(profile: T, playerKey: string, battle: BattleRewardSource, localPlayerId: PlayerId, now = Date.now()): T {
  if (!profile.tutorialCompleted) return profile;
  const refreshed = refreshCombatMissions(profile, playerKey, now);
  const won = (localPlayerId === "player" && battle.status === "player_won") || (localPlayerId === "bot" && battle.status === "bot_won");
  let earnedTracks = 0;

  const updateSet = (set: CombatMissionSet | null): CombatMissionSet | null => set ? {
    ...set,
    missions: set.missions.map((mission) => {
      if (mission.completedAt) return mission;
      const task = getCombatMissionDefinition(mission.id);
      if (!task) return mission;
      const progress = Math.min(task.target, mission.progress + missionDelta(task, battle, localPlayerId, won));
      if (progress < task.target) return { ...mission, progress };
      earnedTracks += task.reward;
      return { ...mission, progress, completedAt: now };
    }),
  } : null;

  const daily = updateSet(refreshed.combatMissions.daily);
  const weekly = updateSet(refreshed.combatMissions.weekly);

  return {
    ...refreshed,
    ironTracks: refreshed.ironTracks + earnedTracks,
    combatMissions: { daily, weekly },
  };
}
