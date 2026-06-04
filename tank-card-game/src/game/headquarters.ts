import type { HeadquartersId, Nation } from "./types";

export type HeadquartersDefinition = {
  id: HeadquartersId;
  title: string;
  subtitle: string;
  description: string;
  faction: string;
  nation: Nation;
  /** Тип/класс штаба, который отображается под названием на карточке. */
  type: string;
  hp: number;
  attack: number;
  range: number;
  fuelGeneration: number;
  level: number;
  defaultDeckId: string;
  availableInMainMenu?: boolean;
};

export function getMainMenuHeadquarters(): HeadquartersDefinition[] {
  return Object.values(HEADQUARTERS).filter(
    (headquarters) => headquarters.availableInMainMenu !== false
  );
}

export function getTrainingHeadquartersIds(): HeadquartersId[] {
  return getMainMenuHeadquarters()
    .filter((headquarters) => headquarters.type === "Учебная часть")
    .map((headquarters) => headquarters.id);
}

export const HEADQUARTERS: Record<HeadquartersId, HeadquartersDefinition> = {
  training_unit: {
    id: "training_unit",
    title: "Учебная часть",
    subtitle: "Советский учебный штаб",
    type: "Учебная часть",
    description:
      "Советская учебная часть со средними характеристиками: ровная атака, здоровье и снабжение.",
    faction: "Учебные войска",
    nation: "ussr",
    hp: 15,
    attack: 1,
    range: 99,
    fuelGeneration: 3,
    level: 1,
    defaultDeckId: "training_unit_default",
    availableInMainMenu: true,
  },

  trainingslager: {
    id: "trainingslager",
    title: "Trainingslager",
    subtitle: "Немецкий учебный лагерь",
    type: "Учебная часть",
    description:
      "Немецкий учебный лагерь с сильной атакой штаба, средним здоровьем и скромным снабжением.",
    faction: "Trainingslager",
    nation: "germany",
    hp: 15,
    attack: 2,
    range: 99,
    fuelGeneration: 2,
    level: 1,
    defaultDeckId: "trainingslager_default",
    availableInMainMenu: true,
  },

  training_camp: {
    id: "training_camp",
    title: "Training Camp",
    subtitle: "Американский учебный лагерь",
    type: "Учебная часть",
    description: "Слабый штаб с мощным снабжением и быстрым ростом ресурсов.",
    faction: "U.S. Armored Forces",
    nation: "usa",
    hp: 12,
    attack: 1,
    range: 99,
    fuelGeneration: 4,
    level: 1,
    defaultDeckId: "training_camp_default",
    availableInMainMenu: true,
  },

  first_panzer_division: {
    id: "first_panzer_division",
    title: "1. Panzer-Div.",
    subtitle: "Передовое танковое соединение",
    type: "Танковая дивизия",
    description:
      "Высокая мобильность и мощная поддержка бронетехники.",
    faction: "Wehrmacht",
    nation: "germany",
    hp: 16,
    attack: 2,
    range: 99,
    fuelGeneration: 4,
    level: 4,
    defaultDeckId: "first_panzer_division_default",
    availableInMainMenu: false,
  },

  polish_border_guard: {
    id: "polish_border_guard",
    title: "Пограничники",
    subtitle: "Передовой польский гарнизон",
    type: "Полевой штаб",
    description:
      "Передовая позиция польской армии. Лёгкая техника и танкетки быстро занимают ключевые клетки.",
    faction: "Wojsko Polskie",
    nation: "poland",
    hp: 13,
    attack: 1,
    range: 99,
    fuelGeneration: 3,
    level: 2,
    defaultDeckId: "polish_border_guard_campaign",
    availableInMainMenu: false,
  },

  polish_army_lodz: {
    id: "polish_army_lodz",
    title: "Armia Łódź",
    subtitle: "Штаб армии «Лодзь»",
    type: "Армейский штаб",
    description:
      "Укреплённый штаб с поддержкой 7TP и противотанковых танкеток. Сильнее держит оборонительный рубеж.",
    faction: "Wojsko Polskie",
    nation: "poland",
    hp: 15,
    attack: 1,
    range: 99,
    fuelGeneration: 3,
    level: 3,
    defaultDeckId: "polish_army_lodz_campaign",
    availableInMainMenu: false,
  },

  polish_army_prusy: {
    id: "polish_army_prusy",
    title: "Armia Prusy",
    subtitle: "Резервная армия «Прусы»",
    type: "Резервный штаб",
    description:
      "Резервное соединение с усиленными танками и самоходной артиллерией. Наращивает давление в затяжном бою.",
    faction: "Wojsko Polskie",
    nation: "poland",
    hp: 16,
    attack: 1,
    range: 99,
    fuelGeneration: 4,
    level: 3,
    defaultDeckId: "polish_army_prusy_campaign",
    availableInMainMenu: false,
  },

  polish_warsaw_defense: {
    id: "polish_warsaw_defense",
    title: "Оборона Варшавы",
    subtitle: "Варшавский оборонительный штаб",
    type: "Укреплённый штаб",
    description:
      "Последний рубеж обороны. Бронепоезда, резервные танки и повышенная генерация топлива делают его самым опасным польским штабом.",
    faction: "Wojsko Polskie",
    nation: "poland",
    hp: 18,
    attack: 2,
    range: 99,
    fuelGeneration: 4,
    level: 4,
    defaultDeckId: "polish_warsaw_defense_campaign",
    availableInMainMenu: false,
  },
};

export const DEFAULT_PLAYER_HEADQUARTERS_ID: HeadquartersId = "training_unit";
export const DEFAULT_BOT_HEADQUARTERS_ID: HeadquartersId = "trainingslager";

export function getHeadquartersDefinition(
  headquartersId: HeadquartersId
): HeadquartersDefinition {
  return HEADQUARTERS[headquartersId] ?? HEADQUARTERS[DEFAULT_PLAYER_HEADQUARTERS_ID];
}
