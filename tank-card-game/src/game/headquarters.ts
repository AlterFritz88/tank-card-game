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

export function getDeckBuildingHeadquarters(): HeadquartersDefinition[] {
  return Object.values(HEADQUARTERS);
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
      "Танковый клин: первый танк, выставленный за ход, получает +1 движение.",
    faction: "Wehrmacht",
    nation: "germany",
    hp: 20,
    attack: 2,
    range: 99,
    fuelGeneration: 4,
    level: 4,
    defaultDeckId: "first_panzer_division_default",
    availableInMainMenu: false,
  },

  german_motorized_division: {
    id: "german_motorized_division",
    title: "29. Inf. mot.",
    subtitle: "29. Infanterie-Division (motorisiert)",
    type: "Мотопехотный штаб",
    description:
      "Моторизованный марш: первый юнит за ход стоит на 1 топливо дешевле.",
    faction: "Wehrmacht",
    nation: "germany",
    hp: 19,
    attack: 1,
    range: 99,
    fuelGeneration: 5,
    level: 4,
    defaultDeckId: "german_motorized_division_default",
    availableInMainMenu: false,
  },

  german_artillery_division: {
    id: "german_artillery_division",
    title: "45. InfDiv",
    subtitle: "45. Infanterie-Division",
    type: "Артиллерийский штаб",
    description:
      "Артиллерийская подготовка: первый удар штаба за ход наносит +1 урон.",
    faction: "Wehrmacht",
    nation: "germany",
    hp: 18,
    attack: 2,
    range: 99,
    fuelGeneration: 4,
    level: 4,
    defaultDeckId: "german_artillery_division_default",
    availableInMainMenu: false,
  },

  german_rear_corps: {
    id: "german_rear_corps",
    title: "XIX. AK",
    subtitle: "XIX. Armeekorps",
    type: "Тыловой штаб",
    description:
      "Организованный тыл: штаб имеет повышенное здоровье и стабильный прирост топлива.",
    faction: "Wehrmacht",
    nation: "germany",
    hp: 22,
    attack: 1,
    range: 99,
    fuelGeneration: 5,
    level: 4,
    defaultDeckId: "german_rear_corps_default",
    availableInMainMenu: false,
  },

  soviet_tank_brigade: {
    id: "soviet_tank_brigade",
    title: "4-я танковая",
    subtitle: "4-я танковая бригада",
    type: "Танковый штаб",
    description:
      "Массовый натиск: танковые части получают преимущество в живучести и удержании линии.",
    faction: "Красная армия",
    nation: "ussr",
    hp: 22,
    attack: 1,
    range: 99,
    fuelGeneration: 4,
    level: 4,
    defaultDeckId: "soviet_tank_brigade_default",
    availableInMainMenu: false,
  },

  soviet_motor_rifle_division: {
    id: "soviet_motor_rifle_division",
    title: "1-я Московская мсд",
    subtitle: "1-я Московская мотострелковая дивизия",
    type: "Мотопехотный штаб",
    description:
      "Быстрая переброска: лёгкие части быстрее занимают ключевые клетки.",
    faction: "Красная армия",
    nation: "ussr",
    hp: 21,
    attack: 1,
    range: 99,
    fuelGeneration: 5,
    level: 4,
    defaultDeckId: "soviet_motor_rifle_division_default",
    availableInMainMenu: false,
  },

  soviet_guards_mortar_regiment: {
    id: "soviet_guards_mortar_regiment",
    title: "13-й гв. миномётный",
    subtitle: "13-й гвардейский миномётный полк",
    type: "Артиллерийский штаб",
    description:
      "Залп миномётов: артиллерийский штаб сильнее наказывает уже повреждённые цели.",
    faction: "Красная армия",
    nation: "ussr",
    hp: 19,
    attack: 2,
    range: 99,
    fuelGeneration: 4,
    level: 4,
    defaultDeckId: "soviet_guards_mortar_regiment_default",
    availableInMainMenu: false,
  },

  soviet_auto_battalion: {
    id: "soviet_auto_battalion",
    title: "389-й автобат",
    subtitle: "389-й автомобильный батальон",
    type: "Тыловой штаб",
    description:
      "Ремонтные колонны: ставка на восстановление техники и долгую игру.",
    faction: "Красная армия",
    nation: "ussr",
    hp: 23,
    attack: 1,
    range: 99,
    fuelGeneration: 4,
    level: 4,
    defaultDeckId: "soviet_auto_battalion_default",
    availableInMainMenu: false,
  },

  usa_old_ironsides: {
    id: "usa_old_ironsides",
    title: "Old Ironsides",
    subtitle: "1st Armored Division",
    type: "Танковый штаб",
    description:
      "Combined Arms: бронетанковая ветка США делает ставку на сочетание танков и снабжения.",
    faction: "U.S. Army",
    nation: "usa",
    hp: 20,
    attack: 1,
    range: 99,
    fuelGeneration: 5,
    level: 4,
    defaultDeckId: "usa_old_ironsides_default",
    availableInMainMenu: false,
  },

  usa_armored_infantry_regiment: {
    id: "usa_armored_infantry_regiment",
    title: "6th Armored Infantry",
    subtitle: "6th Armored Infantry Regiment",
    type: "Мотопехотный штаб",
    description:
      "Motor Pool: высокий прирост топлива поддерживает плотное развёртывание юнитов.",
    faction: "U.S. Army",
    nation: "usa",
    hp: 19,
    attack: 1,
    range: 99,
    fuelGeneration: 6,
    level: 4,
    defaultDeckId: "usa_armored_infantry_regiment_default",
    availableInMainMenu: false,
  },

  usa_armored_artillery_battalion: {
    id: "usa_armored_artillery_battalion",
    title: "27th Armored Artillery",
    subtitle: "27th Armored Field Artillery Battalion",
    type: "Артиллерийский штаб",
    description:
      "Fire Mission: артиллерийский штаб эффективнее добивает повреждённые цели.",
    faction: "U.S. Army",
    nation: "usa",
    hp: 18,
    attack: 2,
    range: 99,
    fuelGeneration: 5,
    level: 4,
    defaultDeckId: "usa_armored_artillery_battalion_default",
    availableInMainMenu: false,
  },

  usa_maintenance_battalion: {
    id: "usa_maintenance_battalion",
    title: "123rd Maintenance",
    subtitle: "123rd Armored Ordnance Maintenance Battalion",
    type: "Тыловой штаб",
    description:
      "Field Maintenance: тыловой штаб США силён экономикой и устойчивым снабжением.",
    faction: "U.S. Army",
    nation: "usa",
    hp: 21,
    attack: 1,
    range: 99,
    fuelGeneration: 6,
    level: 4,
    defaultDeckId: "usa_maintenance_battalion_default",
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
