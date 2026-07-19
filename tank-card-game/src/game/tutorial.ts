import { getCard } from "./cards";
import {
  getAvailableMoveCells,
  getFreeSpawnCells,
  getFreeSupportSlots,
  getTargetsInRange,
  isBattlefieldUnit,
  isSupportUnit,
} from "./engine";
import type { BattleReward } from "./economy";
import type {
  BattleAction,
  BattleState,
  BoardUnit,
  Position,
  SupportSlot,
} from "./types";
import { getSettings, type Language } from "./settings";

export const TUTORIAL_PLAYER_HEADQUARTERS_ID = "training_unit" as const;
export const TUTORIAL_BOT_HEADQUARTERS_ID = "trainingslager" as const;

/**
 * Scripted decks. Order matters: decks are NOT shuffled in the tutorial, so
 * the opening hand is deterministic (player draws 5 first). The player deck
 * is 5 cards bigger than the bot's, so it never runs dry first.
 */
export const TUTORIAL_PLAYER_DECK: string[] = [
  "t-12", // первый танк для учебного розыгрыша
  "bt_7", // БТ с блицем
  "su_5_2", // САУ: добивает артиллерию, потом уничтожает ПТ-САУ (победа)
  "t26_1931",
  "ms_1_t18",
  "bt_5",
  "t34_76",
  "su76",
  "t26_1933",
  "gaz_55_ambulance",
  "bt_2",
  "t26_1938",
  "t37a",
  "t28",
  "t46_1",
];

export const TUTORIAL_BOT_DECK: string[] = [
  "pzkpfw_i_ausf_b", // лёгкий танк (3 здоровья), добивает средний танк игрока
  "leig_18", // артиллерия поддержки
  "panzerjaeger_i", // ПТ-САУ
  "pzkpfw_i_ausf_a",
  "pzkpfw_ii_ausf_c",
  "mercedes_g3a",
  "adler_type_10_n",
  "panzer_35t",
  "pzkpfw_i_ausf_a",
  "leig_18",
];

/** Tutorial reward; profile logic removes gold tracks on repeat completions. */
export const TUTORIAL_REWARD: BattleReward = {
  headquartersId: TUTORIAL_PLAYER_HEADQUARTERS_ID,
  rawHeadquartersXp: 120,
  headquartersXp: 120,
  freeXp: 40,
  rawIronTracks: 600,
  repairCost: 0,
  ironTracks: 600,
  goldTracks: 5,
  destructionProgress: 1,
  modeMultiplier: 1,
  resultMultiplier: 1,
  reasonMultiplier: 1,
  opponentStrengthMultiplier: 1,
  fullyResearchedConversion: false,
  insufficientActions: false,
};

/** Центральная клетка переднего столбца спавна — сюда обучение просит выставить Т-12. */
export const MEDIUM_SPAWN_CELL: Position = { row: 1, col: 0 };
/** Первое короткое перемещение Т-12 вперёд после выхода на плацдарм. */
export const T12_FIRST_MOVE_CELL: Position = { row: 1, col: 1 };
/** Нижняя клетка спавна — отсюда БТ-7 гарантированно доходит до линии штаба. */
export const BT_SPAWN_CELL: Position = { row: 2, col: 0 };
/** Верхняя клетка переднего столбца — сюда обучение просит выставить СУ-5-2. */
export const SPG_SPAWN_CELL: Position = { row: 0, col: 0 };
/**
 * Первый ход БТ-7: со спавна {2,0} он проходит ровно две клетки вправо до {2,2}.
 * Только эта клетка подсвечивается, и только сюда обучение разрешает ход.
 */
export const BT_FIRST_MOVE_CELL: Position = { row: 2, col: 2 };
/**
 * Второй ход БТ-7: с {2,2} он доходит до переднего столбца врага (col 4) —
 * клетки спавна противника, откуда бьёт по артиллерии поддержки в тылу.
 */
export const BT_FRONT_LINE_CELL: Position = { row: 2, col: 4 };
/** Лёгкий танк бота, которого игрок добивает выстрелом штаба. */
export const TUTORIAL_BOT_LIGHT_TANK_ID = "pzkpfw_i_ausf_b";

/**
 * Which scripted battle is active. The four standalone tutorial missions form
 * the «школа боя» campaign (each unlocks the next); `welcome_kursk` is the
 * auto-launched trailer mission «Поныри», run as a fully guided,
 * guaranteed-win demo (highlights, gated actions, passive scripted bot).
 */
export type TutorialScriptId =
  | "training"
  | "light_tanks"
  | "medium_tanks"
  | "heavy_tanks"
  | "tank_destroyers"
  | "self_propelled_guns"
  | "armored_cars"
  | "welcome_kursk";

/** The standalone tutorial missions selectable from the main-menu tutorial screen. */
export type TutorialMissionId = Exclude<TutorialScriptId, "welcome_kursk">;

export type TutorialMissionDefinition = {
  id: TutorialMissionId;
  /** Button label on the tutorial mission-select screen. */
  title: string;
  titleEn: string;
  /** One-line pitch shown under the title. */
  description: string;
  descriptionEn: string;
  /** Scripted decks; order matters — decks are not shuffled (player draws 5 first). */
  playerDeck: string[];
  botDeck: string[];
};

/**
 * The tutorial campaign. Order defines unlocking: a mission opens once every
 * mission before it is completed. The first mission is the original tutorial.
 */
export const TUTORIAL_MISSIONS: TutorialMissionDefinition[] = [
  {
    id: "training",
    title: "Основы боя",
    titleEn: "Combat Basics",
    description: "Штаб, топливо, юниты и первая победа.",
    descriptionEn: "Headquarters, fuel, units and your first victory.",
    playerDeck: [], // заполняется ниже — это исходные TUTORIAL_*_DECK
    botDeck: [],
  },
  {
    id: "light_tanks",
    title: "Лёгкие танки",
    titleEn: "Light Tanks",
    description: "Скорость, Блиц и рейд по тылам.",
    descriptionEn: "Speed, Blitz and a raid behind enemy lines.",
    playerDeck: [
      "bt_5", // первый разыгрываемый лёгкий танк
      "ms_1_t18", // второй дешёвый танк для «волны»
      "bt_7", // Блиц-рейдер
      "t26_1938",
      "bt_2",
      "t26_1933",
      "t40",
      "t46_1",
      "t60",
      "bt_5",
      "t26_1931",
      "bt_7",
      "ms_1_t18",
      "t37a",
      "t26_1938",
    ],
    botDeck: [
      "panzer_35t", // гарнизон первого хода
      "pzkpfw_i_ausf_b", // подкрепление второго хода
      "leichttraktor",
      "pzkpfw_i_ausf_a",
      "mercedes_g3a",
      "panzer_35t",
      "pzkpfw_i_ausf_b",
      "adler_type_10_n",
      "leichttraktor",
      "pzkpfw_i_ausf_a",
    ],
  },
  {
    id: "medium_tanks",
    title: "Средние танки",
    titleEn: "Medium Tanks",
    description: "Манёвр, удар с хода и сосредоточение огня.",
    descriptionEn: "Maneuver, move-and-fire and focused fire.",
    playerDeck: [
      "t34_76", // главный герой урока
      "t-12", // подкрепление второго хода
      "t34_stz",
      "t24",
      "t34_76",
      "t34_stz",
      "t-12",
      "t34_76",
      "t24",
      "t34_1940",
      "t-12",
      "t34_76",
      "t34_stz",
      "t28",
      "t34_76",
    ],
    botDeck: [
      "pzkpfw_i_ausf_b", // лёгкий, лезет вперёд под удар Т-34
      "panzer_35t", // цель для сосредоточения огня
      "pzkpfw_i_ausf_a",
      "leichttraktor",
      "mercedes_g3a",
      "pzkpfw_i_ausf_b",
      "panzer_35t",
      "leichttraktor",
      "pzkpfw_i_ausf_a",
      "adler_type_10_n",
    ],
  },
  {
    id: "heavy_tanks",
    title: "Тяжёлые танки",
    titleEn: "Heavy Tanks",
    description: "Снабжение, лобовая броня и стальной кулак.",
    descriptionEn: "Supply lines, frontal armor and the iron fist.",
    playerDeck: [
      "amo_f15", // грузовик снабжения: +1 топлива в ход
      "zis_5_ammo", // второй грузовик: вместе дают КВ уже на 2-й ход
      "kv1_1940", // герой урока: «Лобовая броня» −2 урона в лоб
      "t26_1938",
      "t26_1933",
      "kv1",
      "gaz_55_ambulance",
      "t26_1938",
      "kv1",
      "t26_1931",
      "ms_1_t18",
      "kv1_1940",
      "t26_1933",
      "bt_5",
      "t26_1938",
    ],
    botDeck: [
      "panzer_35t", // первый лоб-атакующий: выживает после ответного огня КВ
      "pzkpfw_i_ausf_b", // второй лёгкий: подкрадывается под пушку КВ
      "leichttraktor",
      "pzkpfw_i_ausf_a",
      "mercedes_g3a",
      "panzer_35t",
      "pzkpfw_i_ausf_b",
      "leichttraktor",
      "pzkpfw_i_ausf_a",
      "pzkpfw_i_ausf_b",
    ],
  },
  {
    id: "tank_destroyers",
    title: "ПТ-САУ",
    titleEn: "Tank Destroyers",
    description: "Первый выстрел, слабый тыл и охота на истребители танков.",
    descriptionEn: "First strike, a weak rear and hunting tank destroyers.",
    playerDeck: [
      "at1", // герой урока: ПТ-САУ АТ-1
      "bt_7", // быстрый БТ-7 для обхода вражеской ПТ-САУ с тыла
      "su76", // подкрепление-ПТ-САУ
      "zis_30",
      "t26_1933",
      "at1",
      "bt_7",
      "su76",
      "t26_1938",
      "t34_76",
      "bt_5",
      "at1",
      "su76",
      "t26_1933",
      "bt_7",
    ],
    botDeck: [
      "leichttraktor", // жертва «чистого» удара: гибнет с одного выстрела
      "panzer_35t", // толстая цель: переживает выстрел и бьёт в ответ
      "panzerjaeger_i", // вражеская ПТ-САУ: обходим её с тыла
      "pzkpfw_i_ausf_a",
      "leichttraktor",
      "panzer_35t",
      "marder_iii",
      "pzkpfw_i_ausf_b",
      "leichttraktor",
      "panzer_35t",
    ],
  },
  {
    id: "self_propelled_guns",
    title: "САУ",
    titleEn: "Self-Propelled Guns",
    description: "Огонь по любой клетке, удар по тылам и прикрытие танками.",
    descriptionEn: "Fire at any cell, hit the rear and screen it with tanks.",
    playerDeck: [
      "su_122", // герой урока: САУ СУ-122
      "su_122", // вторая САУ — добить тыловую артиллерию
      "t34_76", // танк прикрытия
      "su_5_2",
      "t-12",
      "su_122",
      "t34_76",
      "su_5_2",
      "t26_1933",
      "bt_5",
      "su_122",
      "t34_76",
      "su_5_2",
      "t-12",
      "bt_7",
    ],
    botDeck: [
      "leig_18", // тыловая артиллерия — цель для удара САУ по тылам
      "pzkpfw_i_ausf_b", // прорывается к САУ вплотную — угроза, от которой её прикрывают
      "panzer_35t",
      "pzkpfw_i_ausf_a",
      "leichttraktor",
      "leig_18",
      "pzkpfw_i_ausf_b",
      "panzer_35t",
      "leichttraktor",
      "pzkpfw_i_ausf_a",
    ],
  },
  {
    id: "armored_cars",
    title: "Бронеавтомобили",
    titleEn: "Armored Cars",
    description: "Рейд по тылам, двойной удар и охота на ПТ-САУ с тыла.",
    descriptionEn: "Rear raids, the double strike and hunting TDs from behind.",
    playerDeck: [
      "ba_6_ac", // герой урока: бронеавтомобиль БА-6
      "ba_10_ac",
      "t34_76",
      "ba_11_ac",
      "bt_7",
      "ba_6_ac",
      "ba_20_ac",
      "t34_76",
      "ba_10_ac",
      "t-12",
      "ba_6_ac",
      "ba_11_ac",
      "su_122",
      "ba_20_ac",
      "bt_5",
    ],
    botDeck: [
      "panzerjaeger_i", // ПТ-САУ: заходим ей в тыл и уничтожаем безнаказанно
      "leig_18", // тыловая артиллерия: бьём по ней дважды за ход
      "pzkpfw_i_ausf_b",
      "panzer_35t",
      "leichttraktor",
      "panzerjaeger_i",
      "leig_18",
      "pzkpfw_i_ausf_a",
      "panzer_35t",
      "leichttraktor",
    ],
  },
];

export function getTutorialMission(
  missionId: string
): TutorialMissionDefinition | null {
  return TUTORIAL_MISSIONS.find((mission) => mission.id === missionId) ?? null;
}

/** A standalone tutorial mission (not the campaign-driven «Поныри» demo). */
export function isStandaloneTutorialScript(
  scriptId: TutorialScriptId
): scriptId is TutorialMissionId {
  return scriptId !== "welcome_kursk";
}

/** Missions unlock strictly in order: every earlier mission must be completed. */
export function isTutorialMissionUnlocked(
  missionId: TutorialMissionId,
  completedMissionIds: readonly string[]
): boolean {
  const index = TUTORIAL_MISSIONS.findIndex(
    (mission) => mission.id === missionId
  );

  if (index < 0) return false;

  return TUTORIAL_MISSIONS.slice(0, index).every((mission) =>
    completedMissionIds.includes(mission.id)
  );
}

/** Scripted decks of a mission (mission 1 reuses the original tutorial decks). */
export function getTutorialMissionDecks(missionId: TutorialMissionId): {
  playerDeck: string[];
  botDeck: string[];
} {
  if (missionId === "training") {
    return {
      playerDeck: [...TUTORIAL_PLAYER_DECK],
      botDeck: [...TUTORIAL_BOT_DECK],
    };
  }

  const mission = getTutorialMission(missionId);

  return {
    playerDeck: [...(mission?.playerDeck ?? TUTORIAL_PLAYER_DECK)],
    botDeck: [...(mission?.botDeck ?? TUTORIAL_BOT_DECK)],
  };
}

// ===== Демо-миссия «Поныри» (гид по трейлеру) =====
// Юниты, уже стоящие на поле в welcome-kursk-1 (см. campaigns.ts).
const WK_SPG_CARD_ID = "su_122";
const WK_TANK_CARD_ID = "t34_76";
const WK_TIGER_ID = "tiger_i";
const WK_FERDINAND_ID = "ferdinand";
const WK_PANZER_ID = "pzkpfw_iii_ausf_f";

export type TutorialStep = {
  id: string;
  kind: "dialogue" | "task";
  /** Speech of the instructor avatar (dialogue) or the task instruction. */
  text: string;
  textEn?: string;
  /** Returns true when a dispatched player action completes this task step. */
  completes?: (action: BattleAction, battle: BattleState) => boolean;
  /** Additional player actions tolerated while the task is active. */
  allows?: (action: BattleAction, battle: BattleState) => boolean;
};

function getUnit(battle: BattleState, unitId: string): BoardUnit | null {
  return battle.units.find((unit) => unit.instanceId === unitId) ?? null;
}

function isPlayerUnitMove(action: BattleAction, battle: BattleState): boolean {
  if (action.type !== "MOVE_UNIT") return false;

  const unit = getUnit(battle, action.unitId);

  return unit?.ownerId === "player";
}

function isValidPlayerUnitMove(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "MOVE_UNIT") return false;
  if (!isPlayerUnitMove(action, battle)) return false;

  return getAvailableMoveCells(battle, "player", action.unitId).some(
    (cell) =>
      cell.row === action.position.row && cell.col === action.position.col
  );
}

/**
 * A scripted advance of a specific player card: a legal move straight along
 * its row, strictly forward (toward the enemy) and no further than `target`.
 * This is what the tutorial allows — every other destination is blocked — and
 * it also permits the intermediate cell of a two-cell move so the full
 * advance lands.
 */
function isCardAdvanceTowardCell(
  action: BattleAction,
  battle: BattleState,
  cardId: string,
  target: Position
): boolean {
  if (action.type !== "MOVE_UNIT") return false;

  const unit = getUnit(battle, action.unitId);
  if (!unit || unit.ownerId !== "player" || unit.cardId !== cardId) return false;
  if (!isValidPlayerUnitMove(action, battle)) return false;

  return (
    action.position.row === target.row &&
    action.position.col > unit.position.col &&
    action.position.col <= target.col
  );
}

function isBtAdvanceTowardCell(
  action: BattleAction,
  battle: BattleState,
  target: Position
): boolean {
  return isCardAdvanceTowardCell(action, battle, "bt_7", target);
}

/** Рывок БТ-5 в уроке лёгких танков: две клетки вперёд одной командой. */
export const LT_DASH_CELL: Position = { row: 1, col: 2 };
/** Диагональный манёвр Т-34 в уроке средних танков: обход Panzer I сбоку. */
export const MD_FLANK_CELL: Position = { row: 2, col: 1 };
/**
 * Урок «ПТ-САУ». АТ-1 выходит на плацдарм {1,0} и делает один шаг вперёд к
 * контактной клетке, откуда бьёт по вражеской технике на {1,2}. Вражеская
 * ПТ-САУ выдвигается на {1,3}, а рейдер БТ-7 (со спавна {2,0}) обходит её по
 * нижнему ряду до {2,4} — клетки в тылу истребителя танков.
 */
export const TD_HERO_CONTACT_CELL: Position = { row: 1, col: 1 };
/**
 * Урок «Бронеавтомобили». БА-6 со спавна {2,0} рвётся на три клетки вперёд до
 * {2,3} (запас хода 6: три прямые клетки по 2), затем шагом заходит на {2,4} —
 * в тыл ПТ-САУ на {1,3} и вплотную к вражескому штабу/тыловой артиллерии.
 */
export const AC_DASH_CELL: Position = { row: 2, col: 3 };

/**
 * Scripted move destinations, keyed by step id: which player card moves to
 * which fixed cell while the step is active.
 */
const SCRIPTED_MOVE_TARGETS: Record<
  string,
  { cardId: string; target: Position }
> = {
  // «Основы боя»
  "move-t12": { cardId: "t-12", target: T12_FIRST_MOVE_CELL },
  "move-bt": { cardId: "bt_7", target: BT_FIRST_MOVE_CELL },
  "raid-bt": { cardId: "bt_7", target: BT_FRONT_LINE_CELL },
  "kill-artillery": { cardId: "bt_7", target: BT_FRONT_LINE_CELL },
  // «Лёгкие танки»
  "lt-dash-bt5": { cardId: "bt_5", target: LT_DASH_CELL },
  "lt-raid-1": { cardId: "bt_7", target: BT_FIRST_MOVE_CELL },
  "lt-raid-2": { cardId: "bt_7", target: BT_FRONT_LINE_CELL },
  // «Средние танки»
  "md-flank": { cardId: "t34_76", target: MD_FLANK_CELL },
  // «ПТ-САУ»
  "td2-advance-at1": { cardId: "at1", target: TD_HERO_CONTACT_CELL },
  "td2-raid-1": { cardId: "bt_7", target: BT_FIRST_MOVE_CELL },
  "td2-raid-2": { cardId: "bt_7", target: BT_FRONT_LINE_CELL },
  // «Бронеавтомобили»
  "ac-dash": { cardId: "ba_6_ac", target: AC_DASH_CELL },
  "ac-flank-td": { cardId: "ba_6_ac", target: BT_FRONT_LINE_CELL },
};

/**
 * The single destination cell the tutorial highlights for a scripted move.
 * Intermediate route cells are intentionally not highlighted: the player sees
 * only the final cell of the current movement command.
 */
export function getTutorialMoveTargetCell(
  scriptId: TutorialScriptId,
  stepIndex: number,
  battle: BattleState
): Position | null {
  const step = getTutorialStep(scriptId, stepIndex);
  if (!step || step.kind !== "task") return null;

  if (scriptId === "welcome_kursk") {
    return getWelcomeKurskMoveTargetCell(step, battle);
  }

  const scripted = SCRIPTED_MOVE_TARGETS[step.id];
  if (!scripted) return null;

  const { cardId, target } = scripted;
  const unit = battle.units.find(
    (item) =>
      item.ownerId === "player" &&
      item.cardId === cardId &&
      isBattlefieldUnit(item)
  );
  if (!unit) return null;

  const targetIsReachable = getAvailableMoveCells(
    battle,
    "player",
    unit.instanceId
  ).some(
    (cell) =>
      cell.row === target.row &&
      cell.col === target.col &&
      cell.col > unit.position.col
  );

  return targetIsReachable ? target : null;
}

/**
 * Completion predicates must only fire for actions the engine will actually
 * execute — otherwise a rejected action would advance the tutorial.
 */
function isValidPlayerPlay(
  action: Extract<BattleAction, { type: "PLAY_CARD" }>,
  battle: BattleState
): boolean {
  const cardInstance = battle.player.hand.find(
    (item) => item.instanceId === action.cardInstanceId
  );

  if (!cardInstance) return false;

  const card = getCard(cardInstance.cardId);

  return (
    battle.player.resources >= card.cost &&
    getFreeSpawnCells(battle, "player").some(
      (cell) =>
        cell.row === action.position.row && cell.col === action.position.col
    )
  );
}

function canPlayerUnitAttackTarget(
  battle: BattleState,
  attackerId: string,
  targetId: string
): boolean {
  const attacker = getUnit(battle, attackerId);

  if (!attacker || attacker.alreadyAttacked) return false;

  return getTargetsInRange(battle, "player", "unit", attackerId).some(
    (target) => target.type === "unit" && target.id === targetId
  );
}

function isAttackOnSupport(action: BattleAction, battle: BattleState): boolean {
  if (action.type !== "ATTACK") return false;
  if (action.attackerType !== "unit" || action.targetType !== "unit") return false;

  const target = getUnit(battle, action.targetId);

  return Boolean(
    target &&
      target.ownerId === "bot" &&
      isSupportUnit(target) &&
      canPlayerUnitAttackTarget(battle, action.attackerId, action.targetId)
  );
}

function isHqAttackOnBotLightTank(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "ATTACK") return false;
  if (action.attackerType !== "headquarters") return false;
  if (action.targetType !== "unit") return false;
  if (battle.headquarters.player.alreadyAttacked) return false;

  const target = getUnit(battle, action.targetId);

  return Boolean(
    target &&
      target.ownerId === "bot" &&
      target.cardId === TUTORIAL_BOT_LIGHT_TANK_ID
  );
}

/** Добивающий удар САУ игрока по тыловому юниту бота (артиллерии). */
function isSpgAttackOnSupport(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "ATTACK") return false;

  const attacker = getUnit(battle, action.attackerId);

  return Boolean(
    attacker &&
      attacker.ownerId === "player" &&
      getCard(attacker.cardId).class === "spg" &&
      isAttackOnSupport(action, battle)
  );
}

function isSpgAttackOnTd(action: BattleAction, battle: BattleState): boolean {
  if (action.type !== "ATTACK") return false;
  if (action.attackerType !== "unit" || action.targetType !== "unit") return false;

  const attacker = getUnit(battle, action.attackerId);
  const target = getUnit(battle, action.targetId);

  return Boolean(
    attacker &&
      attacker.ownerId === "player" &&
      getCard(attacker.cardId).class === "spg" &&
      target &&
      target.ownerId === "bot" &&
      getCard(target.cardId).class === "td" &&
      canPlayerUnitAttackTarget(battle, action.attackerId, action.targetId)
  );
}

/** Валидный розыгрыш конкретной карты игрока на конкретную клетку спавна. */
function isPlayOfCardAt(
  action: BattleAction,
  battle: BattleState,
  cardId: string,
  position?: Position
): boolean {
  if (action.type !== "PLAY_CARD") return false;
  if (action.playerId !== "player") return false;

  const matchesCard = battle.player.hand.some(
    (item) =>
      item.instanceId === action.cardInstanceId && item.cardId === cardId
  );

  if (!matchesCard) return false;
  if (
    position &&
    (action.position.row !== position.row ||
      action.position.col !== position.col)
  ) {
    return false;
  }

  return isValidPlayerPlay(action, battle);
}

/** Валидный розыгрыш тыловой карты игрока в свободный слот снабжения. */
function isSupportPlayOfCard(
  action: BattleAction,
  battle: BattleState,
  cardId: string
): boolean {
  if (action.type !== "PLAY_SUPPORT_CARD") return false;
  if (action.playerId !== "player") return false;

  const cardInstance = battle.player.hand.find(
    (item) => item.instanceId === action.cardInstanceId
  );

  if (!cardInstance || cardInstance.cardId !== cardId) return false;

  return (
    battle.player.resources >= getCard(cardInstance.cardId).cost &&
    getFreeSupportSlots(battle, "player").includes(action.supportSlot)
  );
}

/** Любой валидный розыгрыш карты игрока (поле или тыл) — для свободных шагов. */
function isAnyValidPlayerPlay(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type === "PLAY_CARD" && action.playerId === "player") {
    return isValidPlayerPlay(action, battle);
  }

  if (action.type === "PLAY_SUPPORT_CARD" && action.playerId === "player") {
    const cardInstance = battle.player.hand.find(
      (item) => item.instanceId === action.cardInstanceId
    );

    return Boolean(
      cardInstance &&
        battle.player.resources >= getCard(cardInstance.cardId).cost &&
        getFreeSupportSlots(battle, "player").includes(action.supportSlot)
    );
  }

  return false;
}

/** Атака юнитом игрока (карта `cardId`, если задана) по штабу противника. */
function isUnitAttackOnEnemyHq(
  action: BattleAction,
  battle: BattleState,
  cardId?: string
): boolean {
  if (action.type !== "ATTACK") return false;
  if (action.playerId !== "player") return false;
  if (action.attackerType !== "unit") return false;
  if (action.targetType !== "headquarters") return false;

  const attacker = getUnit(battle, action.attackerId);
  if (!attacker || attacker.ownerId !== "player") return false;
  if (cardId && attacker.cardId !== cardId) return false;
  if (attacker.alreadyAttacked) return false;

  return getTargetsInRange(battle, "player", "unit", attacker.instanceId).some(
    (target) => target.type === "headquarters"
  );
}

/** Атака юнитом игрока по юниту бота (опционально — конкретной карте бота). */
function isUnitAttackOnBotUnit(
  action: BattleAction,
  battle: BattleState,
  targetCardId?: string
): boolean {
  if (action.type !== "ATTACK") return false;
  if (action.attackerType !== "unit" || action.targetType !== "unit") return false;

  const attacker = getUnit(battle, action.attackerId);
  const target = getUnit(battle, action.targetId);

  return Boolean(
    attacker &&
      attacker.ownerId === "player" &&
      target &&
      target.ownerId === "bot" &&
      (!targetCardId || target.cardId === targetCardId) &&
      canPlayerUnitAttackTarget(battle, action.attackerId, action.targetId)
  );
}

/**
 * Выстрел КВ-1 обр. 1940 по юниту бота (урок «Лобовой брони»). Цель нарочно
 * не фиксируется: если скриптовая жертва погибла от ответного огня раньше
 * времени, шаг завершается ударом по любому достижимому танку — без тупика.
 */
function isKvStrikeOnBotUnit(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "ATTACK") return false;
  if (!isUnitAttackOnBotUnit(action, battle)) return false;

  return getUnit(battle, action.attackerId)?.cardId === "kv1_1940";
}

/**
 * Удар по вражеской ПТ-САУ (PzJäger I) строго с тыла. Тыл юнита бота — сторона
 * бо́льших столбцов (к вражескому штабу): истребитель танков стоит на {1,3}, а
 * рейдер бьёт из {2,4}, то есть из клетки с бо́льшим столбцом. С тыла ПТ-САУ не
 * может ответить огнём, поэтому такой удар безнаказан.
 */
function isRearAttackOnEnemyTd(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "ATTACK") return false;
  if (!isUnitAttackOnBotUnit(action, battle, "panzerjaeger_i")) return false;

  const attacker = getUnit(battle, action.attackerId);
  const target = getUnit(battle, action.targetId);
  if (!attacker || !target) return false;

  return attacker.position.col > target.position.col;
}

/** Обстрел вражеского штаба самоходкой игрока (САУ бьёт по любой клетке). */
function isSpgAttackOnEnemyHq(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "ATTACK") return false;
  if (!isUnitAttackOnEnemyHq(action, battle)) return false;

  const attacker = getUnit(battle, action.attackerId);

  return Boolean(attacker && getCard(attacker.cardId).class === "spg");
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "intro-hq",
    kind: "dialogue",
    text:
      "Добро пожаловать, командир! Это твой штаб — сердце армии. У штаба есть очки атаки и здоровья. " +
      "Если здоровье штаба упадёт до нуля, он уничтожен. Твоя задача — уничтожить штаб противника раньше, чем он уничтожит твой.",
    textEn:
      "Welcome, commander! This is your headquarters: the heart of your army. It has attack and health. " +
      "If headquarters health drops to zero, it is destroyed. Your objective is to destroy the enemy headquarters before it destroys yours.",
  },
  {
    id: "shoot-hq",
    kind: "task",
    text:
      "Штаб умеет стрелять! Выбери свой штаб и выстрели по вражескому штабу.",
    textEn:
      "The headquarters can fire! Select your headquarters and shoot the enemy headquarters.",
    completes: (action, battle) =>
      action.type === "ATTACK" &&
      action.playerId === "player" &&
      action.attackerType === "headquarters" &&
      action.targetType === "headquarters" &&
      !battle.headquarters.player.alreadyAttacked,
  },
  {
    id: "hand-fuel",
    kind: "dialogue",
    text:
      "Отлично! Внизу — твоя рука с картами. Топливо каждый ход генерируют штаб и тыловые юниты снабжения. " +
      "За топливо ты разыгрываешь новые юниты на клетки спавна рядом со штабом.",
    textEn:
      "Good. Your hand of cards is at the bottom. Fuel is generated each turn by your headquarters and rear supply units. " +
      "Spend fuel to deploy new units onto the spawn cells next to your headquarters.",
  },
  {
    id: "play-medium",
    kind: "task",
    text: "Разыграй танк Т-12 на среднюю клетку плацдарма (подсвечена).",
    textEn: "Deploy the T-12 tank to the middle bridgehead cell (highlighted).",
    completes: (action, battle) =>
      action.type === "PLAY_CARD" &&
      action.playerId === "player" &&
      battle.player.hand.some(
        (item) =>
          item.instanceId === action.cardInstanceId && item.cardId === "t-12"
      ) &&
      action.position.row === MEDIUM_SPAWN_CELL.row &&
      action.position.col === MEDIUM_SPAWN_CELL.col &&
      isValidPlayerPlay(action, battle),
  },
  {
    id: "move-t12",
    kind: "task",
    text:
      "Т-12 занял плацдарм. Выбери его и сделай первое перемещение вперёд на подсвеченную клетку.",
    textEn:
      "The T-12 has taken the bridgehead. Select it and make its first move forward to the highlighted cell.",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "t-12" &&
      action.position.row === T12_FIRST_MOVE_CELL.row &&
      action.position.col === T12_FIRST_MOVE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
  },
  {
    id: "unit-types",
    kind: "dialogue",
    text:
      "В армии пять типов техники. Лёгкие танки быстры и могут действовать сразу после выхода. " +
      "Средние — универсалы. Тяжёлые — мощные, но за ход либо движутся, либо стреляют. " +
      "ПТ-САУ опасны в ближнем бою, САУ бьют издалека без ответного огня, а бронеавтомобили делают ставку на скорость и манёвр. " +
      "Подробнее о способностях юнита можно узнать правой кнопкой мыши или долгим тапом по карте.",
    textEn:
      "Your army has several vehicle roles. Light tanks are fast and can act immediately after deployment. " +
      "Medium tanks are versatile. Heavy tanks are powerful, but each turn they either move or fire. " +
      "Tank destroyers are dangerous in close combat, SPGs fire from range without return fire, and armored cars rely on speed and maneuver. " +
      "Right-click a unit, or long-press it on a phone, to inspect its abilities.",
  },
  {
    id: "end-turn-1",
    kind: "task",
    text: "Теперь нажми кнопку «Конец хода» и посмотри, что сделает противник.",
    textEn: "Now press End Turn and watch what the enemy does.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "support-line",
    kind: "dialogue",
    text:
      "Смотри: противник выставил артиллерию в тыл рядом со своим штабом " +
      "и обстрелял твой танк. Тыловые юниты — артиллерия, транспорт, медицина — усиливают " +
      "штаб, не выходя на поле. Их можно уничтожить, если твой юнит прорвётся в передний " +
      "столбец врага. САУ бьют по ним из любой точки.",
    textEn:
      "Look: the enemy deployed artillery into the rear line next to its headquarters and shelled your tank. " +
      "Rear units - artillery, transport, and medical support - strengthen the army without entering the main battlefield. " +
      "They can be destroyed if your unit breaks into the enemy front column. SPGs can hit them from anywhere.",
  },
  {
    id: "bt-blitz",
    kind: "dialogue",
    text:
      "Твой Т-12 повреждён, но держится. Усилим натиск! Любой юнит может двигаться и " +
      "атаковать в тот же ход, когда выходит на поле. А у быстрых БТ есть ещё и «Блиц» — " +
      "в ход выхода они успевают сделать два перемещения. Попробуем рейд по тылам: БТ может дойти до линии тыла врага за две команды перемещения.",
    textEn:
      "Your T-12 is damaged, but holding. Let's press the attack. Any unit can move and attack on the turn it enters the battlefield. " +
      "Fast BT tanks also have Blitz: on the deployment turn they can make two moves. Let's raid the rear: a BT can reach the enemy rear line in two movement commands.",
  },
  {
    id: "play-bt",
    kind: "task",
    text: "Разыграй БТ-7 на нижнюю клетку спавна (подсвечена).",
    textEn: "Deploy the BT-7 to the lower spawn cell (highlighted).",
    completes: (action, battle) =>
      action.type === "PLAY_CARD" &&
      action.playerId === "player" &&
      battle.player.hand.some(
        (item) =>
          item.instanceId === action.cardInstanceId && item.cardId === "bt_7"
      ) &&
      action.position.row === BT_SPAWN_CELL.row &&
      action.position.col === BT_SPAWN_CELL.col &&
      isValidPlayerPlay(action, battle),
  },
  {
    id: "move-bt",
    kind: "task",
    text: "БТ-7 готов действовать сразу. Сделай первую команду перемещения: продвинь его к противнику на подсвеченную клетку.",
    textEn:
      "The BT-7 can act immediately. Give the first movement command: push it toward the enemy onto the highlighted cell.",
    // Завершаем шаг только когда БТ доходит до конечной клетки. Промежуточную
    // клетку двухклеточного хода пропускаем через allows, иначе шаг сменился бы
    // после первой клетки и второй ход движка был бы заблокирован.
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_7" &&
      action.position.row === BT_FIRST_MOVE_CELL.row &&
      action.position.col === BT_FIRST_MOVE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FIRST_MOVE_CELL),
  },
  {
    id: "raid-bt",
    kind: "task",
    text: "Теперь используй вторую команду Блиц: доведи БТ-7 до линии тыла врага на подсвеченную клетку.",
    textEn:
      "Now use the second Blitz command: move the BT-7 to the enemy rear line on the highlighted cell.",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_7" &&
      action.position.row === BT_FRONT_LINE_CELL.row &&
      action.position.col === BT_FRONT_LINE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FRONT_LINE_CELL),
  },
  {
    id: "kill-artillery",
    kind: "task",
    text:
      "БТ-7 прорвался к спавну врага. Выбери его и ударь по артиллерии leIG 18 на тыловой линии.",
    textEn:
      "The BT-7 has broken into the enemy bridgehead. Select it and strike the leIG 18 artillery on the rear line.",
    completes: isAttackOnSupport,
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FRONT_LINE_CELL),
  },
  {
    id: "end-turn-2",
    kind: "task",
    text: "Заверши ход.",
    textEn: "End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "medium-lost",
    kind: "dialogue",
    text:
      "Противник вывел лёгкий танк и добил твой Т-12. А артиллерия подбита, но ещё жива. " +
      "Покажем, как добивают такие цели: дальнобойная САУ уничтожает их без ответного огня.",
    textEn:
      "The enemy deployed a light tank and finished off your T-12. And the artillery is damaged but still alive. " +
      "Time to show how such targets are finished: a long-range SPG destroys them without taking return fire.",
  },
  {
    id: "play-spg",
    kind: "task",
    text:
      "Начался следующий ход, и топлива хватает на СУ-5-2. Разыграй САУ на верхнюю клетку спавна (подсвечена).",
    textEn:
      "The next turn has begun, and you have enough fuel for the SU-5-2. Deploy the SPG to the upper spawn cell (highlighted).",
    completes: (action, battle) =>
      action.type === "PLAY_CARD" &&
      action.playerId === "player" &&
      battle.player.hand.some(
        (item) =>
          item.instanceId === action.cardInstanceId && item.cardId === "su_5_2"
      ) &&
      action.position.row === SPG_SPAWN_CELL.row &&
      action.position.col === SPG_SPAWN_CELL.col &&
      isValidPlayerPlay(action, battle),
  },
  {
    id: "spg-finish-artillery",
    kind: "task",
    text:
      "САУ бьют по тылам врага из любой точки поля. Добей повреждённую артиллерию leIG 18 своей СУ-5-2!",
    textEn:
      "SPGs can shell the enemy rear from anywhere on the field. Finish the damaged leIG 18 artillery with your SU-5-2!",
    completes: isSpgAttackOnSupport,
  },
  {
    id: "hq-finish-light",
    kind: "task",
    text:
      "Артиллерия уничтожена! Лёгкий танк врага ослаблен ответным огнём — " +
      "добей его выстрелом своего штаба.",
    textEn:
      "The artillery is destroyed. The enemy light tank was weakened by return fire: finish it with a shot from your headquarters.",
    completes: isHqAttackOnBotLightTank,
  },
  {
    id: "end-turn-3",
    kind: "task",
    text: "Отличная работа! Заверши ход.",
    textEn: "Excellent work. End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "td-rules",
    kind: "dialogue",
    text:
      "Противник вывел ПТ-САУ! Запомни правило: в ближнем бою ПТ-САУ стреляет первой — " +
      "атаковать её вплотную опасно. Зато САУ бьют по любой цели издалека, и ответного огня не будет.",
    textEn:
      "The enemy deployed a tank destroyer. Remember the rule: in close combat, a tank destroyer fires first, so attacking it up close is dangerous. " +
      "But SPGs can hit any target from range and take no return fire.",
  },
  {
    id: "kill-td",
    kind: "task",
    text:
      "Твоя СУ-5-2 уже на позиции. САУ бьют по любой цели издалека и не получают " +
      "ответного огня — уничтожь вражескую ПТ-САУ, и бой выигран!",
    textEn:
      "Your SU-5-2 is in position. SPGs can hit any target from range and take no return fire: destroy the enemy tank destroyer and the battle is won!",
    completes: isSpgAttackOnTd,
    allows: isPlayerUnitMove,
  },
];

// ============================================================
// Миссия «Лёгкие танки»: скорость, Блиц и рейд по тылам
// ============================================================

export const LIGHT_TANKS_STEPS: TutorialStep[] = [
  {
    id: "lt-intro",
    kind: "dialogue",
    text:
      "С возвращением, командир! Сегодня — лёгкие танки: дешёвые, быстрые и дерзкие. " +
      "Они проходят до двух клеток за ход и, как любой юнит, могут действовать сразу после выхода на поле. " +
      "Их стихия — разведка, фланги и рейды по тылам.",
    textEn:
      "Welcome back, commander! Today: light tanks — cheap, fast and daring. " +
      "They cover up to two cells per turn and, like any unit, can act right after deployment. " +
      "Their element is scouting, flanking and raids behind enemy lines.",
  },
  {
    id: "lt-play-bt5",
    kind: "task",
    text: "Разыграй БТ-5 на среднюю клетку плацдарма (подсвечена).",
    textEn: "Deploy the BT-5 to the middle bridgehead cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "bt_5", MEDIUM_SPAWN_CELL),
  },
  {
    id: "lt-dash-bt5",
    kind: "task",
    text:
      "Смотри, как он быстр: перемести БТ-5 сразу на две клетки вперёд — одной командой (клетка подсвечена).",
    textEn:
      "See how fast it is: move the BT-5 two cells forward in a single command (the cell is highlighted).",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_5" &&
      action.position.row === LT_DASH_CELL.row &&
      action.position.col === LT_DASH_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isCardAdvanceTowardCell(action, battle, "bt_5", LT_DASH_CELL),
  },
  {
    id: "lt-speed",
    kind: "dialogue",
    text:
      "Две клетки одной командой! Средние и тяжёлые так не умеют. " +
      "Скорость — это выгодные позиции, занятые раньше врага, и удары там, где тебя не ждут.",
    textEn:
      "Two cells in one command! Medium and heavy tanks can't do that. " +
      "Speed means taking key positions before the enemy — and striking where you're not expected.",
  },
  {
    id: "lt-end-1",
    kind: "task",
    text: "Заверши ход — посмотрим, чем ответит противник.",
    textEn: "End your turn — let's see the enemy's answer.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "lt-enemy",
    kind: "dialogue",
    text:
      "Враг выставил Panzer 35(t) и обстрелял наш БТ из штаба. Лёгкая броня долго под огнём не живёт — " +
      "но мы и не собираемся стоять. Наши козыри — скорость и численность.",
    textEn:
      "The enemy deployed a Panzer 35(t) and shelled our BT with its headquarters. Light armor doesn't survive long under fire — " +
      "but we're not going to stand still. Our trump cards are speed and numbers.",
  },
  {
    id: "lt-play-bt7",
    kind: "task",
    text:
      "Лёгкие танки дёшевы — за один ход можно вывести несколько. Разыграй БТ-7 на нижнюю клетку (подсвечена).",
    textEn:
      "Light tanks are cheap — you can field several per turn. Deploy the BT-7 to the lower cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "bt_7", BT_SPAWN_CELL),
  },
  {
    id: "lt-play-ms1",
    kind: "task",
    text: "И сразу второй: разыграй МС-1 на верхнюю клетку (подсвечена).",
    textEn: "And a second one right away: deploy the MS-1 to the upper cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "ms_1_t18", SPG_SPAWN_CELL),
  },
  {
    id: "lt-blitz",
    kind: "dialogue",
    text:
      "У БТ-7 есть «Блиц»: две команды перемещения за ход. Проведём рейд — " +
      "прорвёмся к переднему столбцу врага, к самому его штабу.",
    textEn:
      "The BT-7 has Blitz: two movement commands per turn. Time for a raid — " +
      "we'll break through to the enemy front column, right next to its headquarters.",
  },
  {
    id: "lt-raid-1",
    kind: "task",
    text: "Первая команда: продвинь БТ-7 вперёд на подсвеченную клетку.",
    textEn: "First command: push the BT-7 forward onto the highlighted cell.",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_7" &&
      action.position.row === BT_FIRST_MOVE_CELL.row &&
      action.position.col === BT_FIRST_MOVE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FIRST_MOVE_CELL),
  },
  {
    id: "lt-raid-2",
    kind: "task",
    text: "Вторая команда Блица: доведи БТ-7 до линии врага (клетка подсвечена).",
    textEn: "Second Blitz command: take the BT-7 to the enemy line (highlighted cell).",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_7" &&
      action.position.row === BT_FRONT_LINE_CELL.row &&
      action.position.col === BT_FRONT_LINE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FRONT_LINE_CELL),
  },
  {
    id: "lt-strike-hq",
    kind: "task",
    text: "БТ-7 у самого штаба врага! Атакуй им вражеский штаб!",
    textEn: "The BT-7 is right at the enemy headquarters! Strike the enemy HQ with it!",
    completes: (action, battle) =>
      isUnitAttackOnEnemyHq(action, battle, "bt_7"),
  },
  {
    id: "lt-end-2",
    kind: "task",
    text: "Отличный рейд! Заверши ход.",
    textEn: "Excellent raid! End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "lt-pressure",
    kind: "dialogue",
    text:
      "Видишь? Штаб врага вынужден стрелять по нашему рейдеру — а значит, наш штаб в безопасности. " +
      "Осталось разбить его броню: уничтожь оба лёгких танка противника — и бой выигран.",
    textEn:
      "See? The enemy headquarters has to shoot at our raider — which means our own HQ is safe. " +
      "Now break his armor: destroy both enemy light tanks and the battle is won.",
  },
  {
    id: "lt-kill-tank",
    kind: "task",
    text: "Атакуй свежий Panzer I у вражеского спавна — любым танком, который дотянется.",
    textEn: "Attack the fresh Panzer I at the enemy spawn — with any tank in reach.",
    completes: (action, battle) => isUnitAttackOnBotUnit(action, battle),
    allows: (action, battle) =>
      isPlayerUnitMove(action, battle) ||
      isAnyValidPlayerPlay(action, battle),
  },
  {
    id: "lt-final",
    kind: "dialogue",
    text:
      "Вот это натиск! Дальше — сам: добей оба лёгких танка врага. " +
      "Помни: две клетки за ход, дешёвые подкрепления каждый ход — и никакой жалости. " +
      "Уничтожь их — и победа твоя!",
    textEn:
      "Now that's pressure! The rest is yours: finish off both enemy light tanks. " +
      "Remember: two cells per turn, cheap reinforcements every turn — and no mercy. " +
      "Destroy them and victory is yours!",
  },
];

// ============================================================
// Миссия «Средние танки»: манёвр, удар с хода и фокус огня
// ============================================================

export const MEDIUM_TANKS_STEPS: TutorialStep[] = [
  {
    id: "md-intro",
    kind: "dialogue",
    text:
      "Командир, сегодня — средние танки, рабочая лошадка любой армии. " +
      "Только они ходят в любом направлении, даже по диагонали, и в один ход успевают и переместиться, и выстрелить.",
    textEn:
      "Commander, today it's medium tanks — the workhorse of any army. " +
      "They alone move in any direction, even diagonally, and in a single turn they both move and fire.",
  },
  {
    id: "md-play-t34",
    kind: "task",
    text: "Разыграй легендарный Т-34/76 на среднюю клетку плацдарма (подсвечена).",
    textEn: "Deploy the legendary T-34/76 to the middle bridgehead cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "t34_76", MEDIUM_SPAWN_CELL),
  },
  {
    id: "md-end-1",
    kind: "task",
    text: "Заверши ход — противник уже что-то задумал.",
    textEn: "End your turn — the enemy is up to something.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "md-threat",
    kind: "dialogue",
    text:
      "Panzer I рвётся к нам, а штаб врага уже обстрелял наш Т-34. " +
      "Ответим как учили: средний танк подходит и стреляет в один и тот же ход.",
    textEn:
      "A Panzer I is rushing toward us, and the enemy headquarters has already shelled our T-34. " +
      "Let's answer by the book: a medium tank closes in and fires in the very same turn.",
  },
  {
    id: "md-flank",
    kind: "task",
    text:
      "Средние умеют ходить по диагонали. Перейди Т-34 на подсвеченную клетку — зайди врагу сбоку.",
    textEn:
      "Medium tanks move diagonally. Shift the T-34 to the highlighted cell — come at the enemy from the side.",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "t34_76" &&
      action.position.row === MD_FLANK_CELL.row &&
      action.position.col === MD_FLANK_CELL.col &&
      isValidPlayerUnitMove(action, battle),
  },
  {
    id: "md-kill-1",
    kind: "task",
    text: "А теперь — огонь! Атакуй Panzer I.",
    textEn: "And now — fire! Attack the Panzer I.",
    completes: (action, battle) =>
      isUnitAttackOnBotUnit(action, battle, "pzkpfw_i_ausf_b"),
  },
  {
    id: "md-clean",
    kind: "dialogue",
    text:
      "Одним выстрелом! Враг даже не успел ответить. Подошёл, выстрелил, уничтожил — " +
      "и всё это за один ход. Именно за эту гибкость командиры любят средние танки.",
    textEn:
      "One shot! The enemy didn't even get to answer. Close in, fire, destroy — " +
      "all in a single turn. That flexibility is exactly why commanders love medium tanks.",
  },
  {
    id: "md-play-t12",
    kind: "task",
    text: "Подтяни подкрепление: разыграй Т-12 на любую подсвеченную клетку.",
    textEn: "Bring up reinforcements: deploy the T-12 to any highlighted cell.",
    completes: (action, battle) => isPlayOfCardAt(action, battle, "t-12"),
  },
  {
    id: "md-end-2",
    kind: "task",
    text: "Заверши ход.",
    textEn: "End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "md-focus",
    kind: "dialogue",
    text:
      "Ещё один гость — Panzer 35(t). Запомни главное правило опытных танкистов: сосредоточение огня. " +
      "Повреждённый танк стреляет так же больно, как целый, — поэтому лучше добить одну цель, чем поцарапать две.",
    textEn:
      "Another guest — a Panzer 35(t). Remember the golden rule of veteran tankers: focus your fire. " +
      "A damaged tank shoots just as hard as a fresh one — better to finish one target than scratch two.",
  },
  {
    id: "md-focus-1",
    kind: "task",
    text: "Атакуй Panzer 35(t) первым танком. Если нужно — сперва подведи его ближе.",
    textEn: "Attack the Panzer 35(t) with your first tank. Move it closer first if you need to.",
    completes: (action, battle) =>
      isUnitAttackOnBotUnit(action, battle, "panzer_35t"),
    allows: isPlayerUnitMove,
  },
  {
    id: "md-focus-2",
    kind: "task",
    text: "Теперь добей его вторым танком!",
    textEn: "Now finish it off with your second tank!",
    completes: (action, battle) =>
      isUnitAttackOnBotUnit(action, battle, "panzer_35t"),
    allows: isPlayerUnitMove,
  },
  {
    id: "md-end-3",
    kind: "task",
    text: "Чистая работа. Заверши ход.",
    textEn: "Clean work. End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "md-march",
    kind: "dialogue",
    text:
      "Поле — наше! Теперь марш на штаб: средние идут волной, по клетке за ход, и стреляют на ходу. " +
      "Сноси всё, что встретишь, дойди до линии врага и разбей его штаб!",
    textEn:
      "The field is ours! Now march on the headquarters: mediums advance in a wave, a cell per turn, firing as they go. " +
      "Crush everything you meet, reach the enemy line and smash their HQ!",
  },
];

// ============================================================
// Миссия «Тяжёлые танки»: снабжение, лобовая броня и стальной кулак
// ============================================================

export const HEAVY_TANKS_STEPS: TutorialStep[] = [
  {
    id: "hv-intro",
    kind: "dialogue",
    text:
      "Финальный урок, командир, — тяжёлые танки. Сегодняшний герой — КВ-1 обр. 1940 с «Лобовой бронёй»: " +
      "удары строго в лоб он держит, почти не замечая. Но он дорог — одного штабного топлива не хватит. Начнём со снабжения.",
    textEn:
      "The final lesson, commander — heavy tanks. Today's hero is the KV-1 mod. 1940 with Frontal Armor: " +
      "it shrugs off head-on hits almost without noticing. But it's expensive — headquarters fuel alone won't cover it. Let's start with supply.",
  },
  {
    id: "hv-play-truck",
    kind: "task",
    text:
      "Разыграй грузовик АМО Ф15 в свободный тыловой слот рядом со штабом.",
    textEn:
      "Deploy the AMO F15 truck into a free rear slot next to your headquarters.",
    completes: (action, battle) =>
      isSupportPlayOfCard(action, battle, "amo_f15"),
  },
  {
    id: "hv-play-truck-2",
    kind: "task",
    text: "И сразу второй: разыграй ЗИС-5 в соседний тыловой слот.",
    textEn: "And a second one right away: deploy the ZIS-5 into the next rear slot.",
    completes: (action, battle) =>
      isSupportPlayOfCard(action, battle, "zis_5_ammo"),
  },
  {
    id: "hv-fuel",
    kind: "dialogue",
    text:
      "Теперь тыл приносит +2 топлива каждый ход. " +
      "Уже на следующий ход мы сможем позволить себе КВ-1 обр. 1940.",
    textEn:
      "Now the rear brings +2 fuel every turn. " +
      "By next turn we'll be able to afford the KV-1 mod. 1940.",
  },
  {
    id: "hv-end-1",
    kind: "task",
    text: "Заверши ход. Враг не заставит себя ждать.",
    textEn: "End your turn. The enemy won't keep us waiting.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "hv-play-kv",
    kind: "task",
    text:
      "Враг уже наступает. Топлива накопилось — разыграй КВ-1 обр. 1940 на центральную клетку плацдарма (подсвечена)!",
    textEn:
      "The enemy is already advancing. The fuel is in — deploy the KV-1 mod. 1940 to the middle bridgehead cell (highlighted)!",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "kv1_1940", MEDIUM_SPAWN_CELL),
  },
  {
    id: "hv-frontal",
    kind: "dialogue",
    text:
      "Запомни: «Лобовая броня» гасит 2 урона от ударов строго спереди — с клетки прямо перед танком, со стороны вражеского штаба. " +
      "Пушки лёгких танков его лоб вообще не пробивают. Фланг и тыл — другое дело, но здесь враг идёт прямо в лоб.",
    textEn:
      "Remember: Frontal Armor soaks 2 damage from strikes coming straight ahead — from the cell right in front, on the enemy-HQ side. " +
      "Light-tank guns can't punch through its front plate at all. Flanks and rear are another story — but here the enemy comes head-on.",
  },
  {
    id: "hv-end-2",
    kind: "task",
    text: "Заверши ход и смотри, как снаряды отскакивают от лба КВ.",
    textEn: "End your turn and watch the shells bounce off the KV's front plate.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "hv-bounce",
    kind: "dialogue",
    text:
      "Видел? Panzer 35(t) ударил в лоб — ноль урона! А ответный огонь КВ почти разорвал его. " +
      "Запомни правило тяжёлых: за ход — либо ход, либо выстрел. КВ стоит удачно, так что просто стреляй.",
    textEn:
      "See that? The Panzer 35(t) hit the front plate — zero damage! And the KV's return fire nearly tore it apart. " +
      "Remember the heavy rule: each turn — move OR fire. The KV is well placed, so just fire.",
  },
  {
    id: "hv-kill-1",
    kind: "task",
    text: "Добей Panzer 35(t) выстрелом КВ-1!",
    textEn: "Finish the Panzer 35(t) with the KV-1's gun!",
    completes: isKvStrikeOnBotUnit,
    allows: isPlayerUnitMove,
  },
  {
    id: "hv-end-3",
    kind: "task",
    text: "Один выстрел — одним танком меньше. Заверши ход.",
    textEn: "One shot — one tank fewer. End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "hv-kill-2",
    kind: "task",
    text:
      "Второй лёгкий танк подобрался вплотную — но его пушка лоб КВ тоже не берёт. Уничтожь его — и бой выигран!",
    textEn:
      "The second light tank has crept right up — but its gun can't crack the KV's front either. Destroy it and the battle is won!",
    completes: isKvStrikeOnBotUnit,
    allows: isPlayerUnitMove,
  },
];

// ============================================================
// Миссия «ПТ-САУ»: первый выстрел, слабый тыл и охота на истребителей танков
// ============================================================

export const TANK_DESTROYERS_STEPS: TutorialStep[] = [
  {
    id: "td2-intro",
    kind: "dialogue",
    text:
      "Командир, сегодня — ПТ-САУ, истребители танков. Орудие стоит в неподвижной рубке: " +
      "ПТ-САУ бьёт только вплотную, зато в ближнем бою стреляет ПЕРВОЙ — «Танковая засада». " +
      "Лезть на неё в лоб — самоубийство. Но её орудие смотрит только вперёд: с тыла она беззащитна. Начнём с нашей АТ-1.",
    textEn:
      "Commander, today it's tank destroyers. Their gun sits in a fixed casemate: " +
      "a TD strikes only at point-blank range, but in close combat it fires FIRST — an ambush shot. " +
      "Attacking one head-on is suicide. Yet its gun faces only forward: from behind it's defenceless. Let's start with our AT-1.",
  },
  {
    id: "td2-play-at1",
    kind: "task",
    text: "Разыграй ПТ-САУ АТ-1 на среднюю клетку плацдарма (подсвечена).",
    textEn: "Deploy the AT-1 tank destroyer to the middle bridgehead cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "at1", MEDIUM_SPAWN_CELL),
  },
  {
    id: "td2-advance-at1",
    kind: "task",
    text:
      "ПТ-САУ бьёт только вплотную, поэтому сразу выдвини АТ-1 на шаг вперёд, " +
      "на линию соприкосновения (клетка подсвечена).",
    textEn:
      "A TD only strikes at point-blank range, so push the AT-1 one step forward right away, " +
      "up to the line of contact (highlighted cell).",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "at1" &&
      action.position.row === TD_HERO_CONTACT_CELL.row &&
      action.position.col === TD_HERO_CONTACT_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isCardAdvanceTowardCell(action, battle, "at1", TD_HERO_CONTACT_CELL),
  },
  {
    id: "td2-end-1",
    kind: "task",
    text: "Заверши ход — посмотрим, что предпримет враг.",
    textEn: "End your turn — let's see what the enemy does.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "td2-enemy-1",
    kind: "dialogue",
    text:
      "Враг подвёл лёгкий Leichttraktor вплотную к твоей ПТ-САУ. Самое время для удара: " +
      "в ближнем бою ПТ-САУ стреляет первой.",
    textEn:
      "The enemy brought a Leichttraktor right up to your TD. Time to strike: " +
      "in close combat a tank destroyer fires first.",
  },
  {
    id: "td2-kill-clean",
    kind: "task",
    text:
      "АТ-1 у цели. Атакуй Leichttraktor! ПТ-САУ бьёт первой — цель гибнет и не успевает ответить.",
    textEn:
      "The AT-1 is in position. Attack the Leichttraktor! A TD fires first — the target dies before it can shoot back.",
    completes: (action, battle) =>
      isUnitAttackOnBotUnit(action, battle, "leichttraktor"),
  },
  {
    id: "td2-clean-note",
    kind: "dialogue",
    text:
      "Чисто! Когда ПТ-САУ убивает цель с одного выстрела, урона она не получает: " +
      "враг просто не успевает выстрелить в ответ. В этом её сила в упор.",
    textEn:
      "Clean! When a TD kills its target in a single shot, it takes no damage: " +
      "the enemy never gets to fire back. That's its strength up close.",
  },
  {
    id: "td2-end-2",
    kind: "task",
    text: "Заверши ход.",
    textEn: "End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "td2-enemy-2",
    kind: "dialogue",
    text:
      "А вот и Panzer 35(t) — у него четыре здоровья, лёгкая пушка АТ-1 его с одного удара не возьмёт. " +
      "Атакуй — и увидишь обратную сторону ПТ-САУ.",
    textEn:
      "Here comes a Panzer 35(t) — it has four health, and the AT-1's light gun won't destroy it in one hit. " +
      "Attack it and you'll see the TD's other side.",
  },
  {
    id: "td2-take-damage",
    kind: "task",
    text: "Атакуй Panzer 35(t) своей АТ-1.",
    textEn: "Attack the Panzer 35(t) with your AT-1.",
    completes: (action, battle) =>
      isUnitAttackOnBotUnit(action, battle, "panzer_35t"),
    allows: isPlayerUnitMove,
  },
  {
    id: "td2-damage-note",
    kind: "dialogue",
    text:
      "Видишь? Цель пережила выстрел — и врезала в ответ. Вот когда ПТ-САУ получает урон: " +
      "если не может убить с одного удара. Поэтому выбирай цели по зубам и не подставляй тонкую броню.",
    textEn:
      "See that? The target survived the shot and hit back. That's when a TD takes damage: " +
      "when it can't kill in one blow. So pick targets you can crack and don't expose that thin armor.",
  },
  {
    id: "td2-end-3",
    kind: "task",
    text: "Заверши ход.",
    textEn: "End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "td2-enemy-td",
    kind: "dialogue",
    text:
      "Теперь у врага своя ПТ-САУ — PzJäger I. В лоб не подходи: она выстрелит первой и сожжёт любого. " +
      "Но у ПТ-САУ есть слабое место — тыл. Обойдём её быстрым БТ-7 и ударим в спину.",
    textEn:
      "Now the enemy has a TD of its own — a PzJäger I. Don't approach head-on: it fires first and burns anything. " +
      "But a TD has a weak spot — its rear. Let's flank it with a fast BT-7 and strike from behind.",
  },
  {
    id: "td2-play-bt7",
    kind: "task",
    text: "Разыграй БТ-7 на нижнюю клетку спавна (подсвечена).",
    textEn: "Deploy the BT-7 to the lower spawn cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "bt_7", BT_SPAWN_CELL),
  },
  {
    id: "td2-raid-1",
    kind: "task",
    text: "У БТ-7 есть «Блиц». Первая команда: продвинь его по нижнему ряду на подсвеченную клетку.",
    textEn: "The BT-7 has Blitz. First command: push it along the bottom row to the highlighted cell.",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_7" &&
      action.position.row === BT_FIRST_MOVE_CELL.row &&
      action.position.col === BT_FIRST_MOVE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FIRST_MOVE_CELL),
  },
  {
    id: "td2-raid-2",
    kind: "task",
    text: "Вторая команда Блица: заведи БТ-7 в тыл вражеской ПТ-САУ (клетка подсвечена).",
    textEn: "Second Blitz command: take the BT-7 into the enemy TD's rear (highlighted cell).",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_7" &&
      action.position.row === BT_FRONT_LINE_CELL.row &&
      action.position.col === BT_FRONT_LINE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FRONT_LINE_CELL),
  },
  {
    id: "td2-rear-kill",
    kind: "task",
    text:
      "БТ-7 зашёл в тыл истребителю танков. Бей! С тыла ПТ-САУ не может выстрелить в ответ — " +
      "уничтожь её, и бой выигран!",
    textEn:
      "The BT-7 is behind the tank destroyer. Strike! From the rear a TD can't fire back — " +
      "destroy it and the battle is won!",
    completes: isRearAttackOnEnemyTd,
    allows: (action, battle) =>
      isBtAdvanceTowardCell(action, battle, BT_FRONT_LINE_CELL),
  },
];

// ============================================================
// Миссия «САУ»: огонь по любой клетке, удар по тылам и прикрытие танками
// ============================================================

export const SELF_PROPELLED_GUNS_STEPS: TutorialStep[] = [
  {
    id: "spg-intro",
    kind: "dialogue",
    text:
      "Командир, сегодня — САУ, самоходная артиллерия. Её главный козырь — дальность: " +
      "САУ бьёт по ЛЮБОЙ клетке поля, хоть по переднему краю, хоть по тыловым юнитам врага, " +
      "и сама не получает ответного огня. Но вблизи она беспомощна и на прямые атаки не отвечает — " +
      "держи её за спинами танков. Начнём с нашей СУ-122.",
    textEn:
      "Commander, today it's self-propelled guns — mobile artillery. Their key strength is range: " +
      "an SPG fires at ANY cell on the field — the front line or the enemy's rear units alike — " +
      "and takes no return fire itself. But up close it's helpless and never answers direct attacks — " +
      "keep it behind your tanks. Let's start with our SU-122.",
  },
  {
    id: "spg-play-su122",
    kind: "task",
    text: "Разыграй САУ СУ-122 на среднюю клетку плацдарма (подсвечена).",
    textEn: "Deploy the SU-122 self-propelled gun to the middle bridgehead cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "su_122", MEDIUM_SPAWN_CELL),
  },
  {
    id: "spg-end-1",
    kind: "task",
    text: "Заверши ход — посмотрим, что предпримет враг.",
    textEn: "End your turn — let's see what the enemy does.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "spg-rear-intro",
    kind: "dialogue",
    text:
      "Враг поставил в тыл артиллерию leIG 18 — она усиливает его штаб, но сама на поле не выходит. " +
      "Обычному танку до неё не дотянуться, а вот САУ бьёт по любой клетке. Накрой её прямо со своей позиции!",
    textEn:
      "The enemy placed leIG 18 artillery in its rear — it boosts their headquarters but never enters the field. " +
      "An ordinary tank can't reach it, but an SPG fires at any cell. Shell it right from where you stand!",
  },
  {
    id: "spg-strike-rear",
    kind: "task",
    text: "Выбери СУ-122 и ударь по тыловой артиллерии leIG 18.",
    textEn: "Select the SU-122 and strike the leIG 18 artillery in the rear.",
    completes: isSpgAttackOnSupport,
  },
  {
    id: "spg-play-su122-2",
    kind: "task",
    text:
      "Артиллерия повреждена, но ещё жива. Выведи вторую СУ-122 на верхнюю клетку спавна (подсвечена).",
    textEn:
      "The artillery is damaged but still alive. Deploy a second SU-122 to the upper spawn cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "su_122", SPG_SPAWN_CELL),
  },
  {
    id: "spg-finish-rear",
    kind: "task",
    text: "Добей артиллерию leIG 18 второй СУ-122.",
    textEn: "Finish off the leIG 18 artillery with the second SU-122.",
    completes: isSpgAttackOnSupport,
  },
  {
    id: "spg-rear-note",
    kind: "dialogue",
    text:
      "Вот так! Вражеская артиллерия уничтожена из глубины поля, и ответного огня САУ не получили. " +
      "Ни один другой юнит не достаёт до вражеского тыла — это и есть сила самоходок.",
    textEn:
      "There we go! The enemy artillery is destroyed from across the field, and the SPGs took no return fire. " +
      "No other unit can reach the enemy rear — that's the power of self-propelled guns.",
  },
  {
    id: "spg-end-2",
    kind: "task",
    text: "Заверши ход.",
    textEn: "End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "spg-hq-intro",
    kind: "dialogue",
    text:
      "Раз САУ бьёт по любой цели — достанем и вражеский штаб. Выстрели по нему прямо со своей позиции.",
    textEn:
      "Since an SPG can hit any target, let's reach the enemy headquarters too. Fire at it right from your position.",
  },
  {
    id: "spg-hq-strike",
    kind: "task",
    text: "Выбери СУ-122 и обстреляй вражеский штаб.",
    textEn: "Select an SU-122 and shell the enemy headquarters.",
    completes: isSpgAttackOnEnemyHq,
  },
  {
    id: "spg-end-3",
    kind: "task",
    text: "Заверши ход.",
    textEn: "End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "spg-defend-intro",
    kind: "dialogue",
    text:
      "Видишь? Panzer прорвался к твоей СУ-122 и ударил в упор — а САУ даже не выстрелила в ответ. " +
      "Запомни: на прямые атаки САУ никогда не отвечает, вблизи она беззащитна. Её нужно прикрывать. " +
      "Выстави танк и уничтожь наглеца!",
    textEn:
      "See that? A Panzer broke through to your SU-122 and hit it point-blank — and the SPG didn't even fire back. " +
      "Remember: an SPG never answers direct attacks; up close it's defenceless. It must be screened. " +
      "Deploy a tank and destroy that intruder!",
  },
  {
    id: "spg-play-tank",
    kind: "task",
    text: "Разыграй танк Т-34/76 на нижнюю клетку спавна (подсвечена).",
    textEn: "Deploy a T-34/76 tank to the lower spawn cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "t34_76", BT_SPAWN_CELL),
  },
  {
    id: "spg-protect-kill",
    kind: "task",
    text: "Прикрой САУ: атакуй Panzer I своим Т-34 и уничтожь его. Бой выигран!",
    textEn: "Screen the SPG: attack the Panzer I with your T-34 and destroy it. The battle is won!",
    completes: (action, battle) =>
      isUnitAttackOnBotUnit(action, battle, "pzkpfw_i_ausf_b"),
    allows: isPlayerUnitMove,
  },
];

// ============================================================
// Миссия «Бронеавтомобили»: рейд по тылам, двойной удар и охота на ПТ-САУ
// ============================================================

export const ARMORED_CARS_STEPS: TutorialStep[] = [
  {
    id: "ac-intro",
    kind: "dialogue",
    text:
      "Командир, сегодня — бронеавтомобили, стремительные рейдеры. Огромный запас хода: " +
      "до трёх клеток по прямой за один ход. Они созданы для ударов по штабам и тылам, " +
      "а по целям в тылу бьют дважды за ход. В честном бою они хрупки — их стихия рейд, а не таран. Начнём с БА-6.",
    textEn:
      "Commander, today it's armored cars — swift raiders. A huge movement range: " +
      "up to three cells in a straight line per turn. They're built for striking headquarters and rear lines, " +
      "and they hit rear targets twice per turn. In a fair fight they're fragile — their element is the raid, not the ram. Let's start with the BA-6.",
  },
  {
    id: "ac-play-ba6",
    kind: "task",
    text: "Разыграй бронеавтомобиль БА-6 на нижнюю клетку спавна (подсвечена).",
    textEn: "Deploy the BA-6 armored car to the lower spawn cell (highlighted).",
    completes: (action, battle) =>
      isPlayOfCardAt(action, battle, "ba_6_ac", BT_SPAWN_CELL),
  },
  {
    id: "ac-dash",
    kind: "task",
    text:
      "Смотри, как он быстр: одной командой рвани БА-6 сразу на три клетки вперёд, вглубь поля (клетка подсвечена).",
    textEn:
      "See how fast it is: in a single command dash the BA-6 three cells forward, deep into the field (highlighted cell).",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "ba_6_ac" &&
      action.position.row === AC_DASH_CELL.row &&
      action.position.col === AC_DASH_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isCardAdvanceTowardCell(action, battle, "ba_6_ac", AC_DASH_CELL),
  },
  {
    id: "ac-end-1",
    kind: "task",
    text: "Заверши ход — посмотрим, что предпримет враг.",
    textEn: "End your turn — let's see what the enemy does.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "ac-td-intro",
    kind: "dialogue",
    text:
      "Враг выставил ПТ-САУ. В лоб её не бей — она стреляет первой. Но твой рейдер уже почти у неё за спиной! " +
      "Зайди ей в тыл — оттуда ПТ-САУ не может ответить, и ты уничтожишь её безнаказанно.",
    textEn:
      "The enemy deployed a tank destroyer. Don't hit it head-on — it fires first. But your raider is almost behind it already! " +
      "Get into its rear — from there the TD can't fire back, and you'll destroy it with impunity.",
  },
  {
    id: "ac-flank-td",
    kind: "task",
    text: "Заведи БА-6 в тыл вражеской ПТ-САУ — на подсвеченную клетку.",
    textEn: "Move the BA-6 into the enemy TD's rear — onto the highlighted cell.",
    completes: (action, battle) =>
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "ba_6_ac" &&
      action.position.row === BT_FRONT_LINE_CELL.row &&
      action.position.col === BT_FRONT_LINE_CELL.col &&
      isValidPlayerUnitMove(action, battle),
    allows: (action, battle) =>
      isCardAdvanceTowardCell(action, battle, "ba_6_ac", BT_FRONT_LINE_CELL),
  },
  {
    id: "ac-kill-td",
    kind: "task",
    text: "Бей! С тыла ПТ-САУ беззащитна — уничтожь её без ответного огня.",
    textEn: "Strike! From the rear the TD is defenceless — destroy it without any return fire.",
    completes: isRearAttackOnEnemyTd,
    allows: (action, battle) =>
      isCardAdvanceTowardCell(action, battle, "ba_6_ac", BT_FRONT_LINE_CELL),
  },
  {
    id: "ac-raid-hq",
    kind: "dialogue",
    text:
      "ПТ-САУ уничтожена, и ни одного ответного выстрела! А рейд ещё не окончен: по тыловым целям и штабам " +
      "бронеавтомобиль бьёт ДВАЖДЫ за ход. Ты стои́шь у самого вражеского штаба — врежь по нему вторым ударом!",
    textEn:
      "The TD is destroyed, and not a single shot in reply! And the raid isn't over: against rear targets and headquarters " +
      "an armored car strikes TWICE per turn. You're right next to the enemy headquarters — hit it with your second strike!",
  },
  {
    id: "ac-hq-strike",
    kind: "task",
    text: "Обстреляй вражеский штаб своим БА-6.",
    textEn: "Shell the enemy headquarters with your BA-6.",
    completes: (action, battle) =>
      isUnitAttackOnEnemyHq(action, battle, "ba_6_ac"),
  },
  {
    id: "ac-end-2",
    kind: "task",
    text: "Отличный рейд! Заверши ход.",
    textEn: "Excellent raid! End your turn.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "ac-rear-intro",
    kind: "dialogue",
    text:
      "Враг подтянул в тыл артиллерию leIG 18. Самое время показать главный трюк: по тыловым юнитам " +
      "бронеавтомобиль бьёт ДВАЖДЫ за один ход. Накрой артиллерию двумя ударами — и бой выигран!",
    textEn:
      "The enemy brought up leIG 18 artillery in the rear. Time for the signature trick: against rear units " +
      "an armored car strikes TWICE in one turn. Hit the artillery with both strikes — and the battle is won!",
  },
  {
    id: "ac-double-1",
    kind: "task",
    text: "Первый удар: атакуй тыловую артиллерию leIG 18.",
    textEn: "First strike: attack the leIG 18 artillery in the rear.",
    completes: isAttackOnSupport,
  },
  {
    id: "ac-double-2",
    kind: "task",
    text: "Второй удар за тот же ход: добей артиллерию leIG 18!",
    textEn: "Second strike in the same turn: finish the leIG 18 artillery!",
    completes: isAttackOnSupport,
  },
];

export const TUTORIAL_EPILOGUE_TEXT =
  "Победа, командир! Дальше тебя ждёт дерево исследований: открывай новые юниты и штабы, " +
  "покупай технику за железные траки и собирай собственные колоды под свой стиль. " +
  "Развивай армию после каждого боя — и удача всегда будет на твоей стороне!";

export const TUTORIAL_EPILOGUE_TEXT_EN =
  "Victory, commander! Next comes the research tree: unlock new units and headquarters, " +
  "buy vehicles with iron tracks, and build custom decks for your own style. " +
  "Develop your army after every battle, and fortune will stay on your side.";

/** Победные эпилоги миссий: чему научились и что открывается дальше. */
const TUTORIAL_EPILOGUES: Record<TutorialMissionId, { ru: string; en: string }> = {
  training: {
    ru: TUTORIAL_EPILOGUE_TEXT,
    en: TUTORIAL_EPILOGUE_TEXT_EN,
  },
  light_tanks: {
    ru:
      "Блестящий рейд, командир! Лёгкие танки — глаза и когти армии: они первыми занимают позиции, " +
      "рвут тылы и заставляют штаб врага стрелять не туда. Следующий урок — средние танки, " +
      "универсалы, которые бьют с хода.",
    en:
      "A brilliant raid, commander! Light tanks are the eyes and claws of your army: first to take positions, " +
      "first into the enemy rear, forcing the enemy HQ to waste its shots. Next lesson — medium tanks, " +
      "the all-rounders that fire on the move.",
  },
  medium_tanks: {
    ru:
      "Победа! Ты освоил главное оружие войны: манёвр, удар с хода и сосредоточение огня. " +
      "Средние танки выигрывают бои, но ломать оборону лучше тяжёлым кулаком. " +
      "Последний урок — тяжёлые танки — уже открыт!",
    en:
      "Victory! You've mastered the main weapon of the war: maneuver, move-and-fire and focused fire. " +
      "Medium tanks win battles, but breaking a defense calls for a heavier fist. " +
      "The final lesson — heavy tanks — is now open!",
  },
  heavy_tanks: {
    ru:
      "Школа боя пройдена, командир! Снабжение, лобовая броня, стальной кулак — теперь ты владеешь всем арсеналом. " +
      "Впереди — дерево исследований, собственные колоды, кампании и живые противники. " +
      "Армия ждёт приказа. Удачи!",
    en:
      "Combat school complete, commander! Supply, frontal armor, the iron fist — the whole arsenal is yours now. " +
      "Ahead lie the research tree, custom decks, campaigns and live opponents. " +
      "The army awaits your orders. Good luck!",
  },
  tank_destroyers: {
    ru:
      "Отличная работа, командир! Теперь ты знаешь ПТ-САУ насквозь: в упор она бьёт первой и остаётся цела, " +
      "получает урон, лишь когда не может убить с одного удара, и беззащитна с тыла. " +
      "Держи её за спинами танков, бей по целям по зубам — а вражеские ПТ-САУ обходи с фланга и тыла.",
    en:
      "Excellent work, commander! Now you know tank destroyers inside out: up close they fire first and stay unscathed, " +
      "they take damage only when they can't kill in one blow, and they're defenceless from behind. " +
      "Keep yours behind your tanks, strike targets you can crack — and flank enemy TDs from the side and rear.",
  },
  self_propelled_guns: {
    ru:
      "Отличная стрельба, командир! САУ — твоя дальнобойная рука: она достаёт любую клетку, включая тылы врага, " +
      "и бьёт без ответного огня. Но в ближнем бою она не отвечает на удары и беззащитна — " +
      "всегда прикрывай самоходки танками, и они выкосят врага задолго до того, как он подойдёт.",
    en:
      "Fine shooting, commander! The SPG is your long reach: it strikes any cell, the enemy rear included, " +
      "and fires without return fire. But in close combat it doesn't answer blows and is defenceless — " +
      "always screen your SPGs with tanks, and they'll mow the enemy down long before it closes in.",
  },
  armored_cars: {
    ru:
      "Молниеносный рейд, командир! Бронеавтомобили — твой скальпель для тылов: огромный запас хода, " +
      "двойной удар по тыловым целям и штабам и безнаказанный заход в тыл ПТ-САУ. " +
      "Не бросай их в лобовые схватки — обходи, рви линии снабжения и добивай штаб врага, пока он не опомнился.",
    en:
      "A lightning raid, commander! Armored cars are your scalpel for the rear: a huge movement range, " +
      "a double strike on rear targets and headquarters, and an unpunished flank into a tank destroyer's rear. " +
      "Don't throw them into head-on fights — go around, cut supply lines and finish the enemy HQ before it recovers.",
  },
};

export function getTutorialEpilogueText(
  scriptId: TutorialScriptId = "training",
  language: Language = getSettings().language
): string {
  const epilogue = isStandaloneTutorialScript(scriptId)
    ? TUTORIAL_EPILOGUES[scriptId]
    : TUTORIAL_EPILOGUES.training;

  return language === "en" ? epilogue.en : epilogue.ru;
}

// ============================================================
// Демо-миссия «Поныри»: пошаговый гид с гарантированной победой
// ============================================================

/** Battlefield SPG (СУ-122) of the player strikes a specific enemy unit. */
function isWkSpgStrikeOn(
  action: BattleAction,
  battle: BattleState,
  targetCardId: string
): boolean {
  if (action.type !== "ATTACK") return false;
  if (action.attackerType !== "unit" || action.targetType !== "unit") return false;

  const attacker = getUnit(battle, action.attackerId);
  const target = getUnit(battle, action.targetId);

  return Boolean(
    attacker &&
      attacker.ownerId === "player" &&
      attacker.cardId === WK_SPG_CARD_ID &&
      target &&
      target.ownerId === "bot" &&
      target.cardId === targetCardId &&
      canPlayerUnitAttackTarget(battle, action.attackerId, action.targetId)
  );
}

function isWkHqStrikeOnEnemyHq(
  action: BattleAction,
  battle: BattleState
): boolean {
  return (
    action.type === "ATTACK" &&
    action.playerId === "player" &&
    action.attackerType === "headquarters" &&
    action.targetType === "headquarters" &&
    !battle.headquarters.player.alreadyAttacked
  );
}

/** A straight forward move (toward the enemy) of the preplaced Т-34. */
function isWkTankForwardMove(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "MOVE_UNIT") return false;

  const unit = getUnit(battle, action.unitId);
  if (!unit || unit.ownerId !== "player" || unit.cardId !== WK_TANK_CARD_ID) {
    return false;
  }
  if (!isValidPlayerUnitMove(action, battle)) return false;

  return action.position.row === unit.position.row &&
    action.position.col > unit.position.col;
}

function isWkTankStrikeOnPanzer(
  action: BattleAction,
  battle: BattleState
): boolean {
  if (action.type !== "ATTACK") return false;
  if (action.attackerType !== "unit" || action.targetType !== "unit") return false;

  const attacker = getUnit(battle, action.attackerId);
  const target = getUnit(battle, action.targetId);

  return Boolean(
    attacker &&
      attacker.ownerId === "player" &&
      attacker.cardId === WK_TANK_CARD_ID &&
      target &&
      target.ownerId === "bot" &&
      target.cardId === WK_PANZER_ID &&
      canPlayerUnitAttackTarget(battle, action.attackerId, action.targetId)
  );
}

/** Deploy a Т-34/76 from hand onto any free spawn cell. */
function isWkPlayTank(action: BattleAction, battle: BattleState): boolean {
  if (action.type !== "PLAY_CARD") return false;
  if (action.playerId !== "player") return false;

  const cardInstance = battle.player.hand.find(
    (item) => item.instanceId === action.cardInstanceId
  );
  if (!cardInstance || cardInstance.cardId !== WK_TANK_CARD_ID) return false;

  return isValidPlayerPlay(action, battle);
}

export const WELCOME_KURSK_STEPS: TutorialStep[] = [
  {
    id: "wk-spg-intro",
    kind: "dialogue",
    text:
      "Тигр и Фердинанд подбиты, но их лобовая броня ещё держит удар. Не лезь на них в лоб! " +
      "Наши СУ-122 — самоходные гаубицы: они бьют с закрытых позиций по любой цели и не получают ответного огня. С них и начнём.",
    textEn:
      "The Tiger and Ferdinand are damaged, but their frontal armor still holds. Don't attack them head-on. " +
      "Our SU-122 self-propelled howitzers fire from cover at any target and take no return fire. Let's start with them.",
  },
  {
    id: "wk-spg-tiger",
    kind: "task",
    text: "Выбери СУ-122 и ударь по подбитому «Тигру».",
    textEn: "Select an SU-122 and strike the damaged Tiger.",
    completes: (action, battle) => isWkSpgStrikeOn(action, battle, WK_TIGER_ID),
  },
  {
    id: "wk-spg-ferdinand",
    kind: "task",
    text: "Второй СУ-122 накрой «Фердинанд».",
    textEn: "With the second SU-122, hit the Ferdinand.",
    completes: (action, battle) =>
      isWkSpgStrikeOn(action, battle, WK_FERDINAND_ID),
  },
  {
    id: "wk-hq-intro",
    kind: "dialogue",
    text:
      "Штаб фронта тоже ведёт огонь — прямо по вражескому штабу. Каждое попадание приближает победу.",
    textEn:
      "Your headquarters can fire too — straight at the enemy headquarters. Every hit brings victory closer.",
  },
  {
    id: "wk-hq-strike",
    kind: "task",
    text: "Выбери свой штаб и выстрели по штабу противника.",
    textEn: "Select your headquarters and fire at the enemy headquarters.",
    completes: isWkHqStrikeOnEnemyHq,
  },
  {
    id: "wk-tank-intro",
    kind: "dialogue",
    text:
      "Теперь в дело идут танки — они добьют подранков. Т-34 может за ход и переместиться, и выстрелить. Двинь его вперёд.",
    textEn:
      "Now the tanks finish the cripples. A T-34 can both move and fire in one turn. Push it forward.",
  },
  {
    id: "wk-move-t34",
    kind: "task",
    text: "Выбери Т-34 и продвинь его вперёд на подсвеченную клетку.",
    textEn: "Select the T-34 and advance it to the highlighted cell.",
    completes: isWkTankForwardMove,
    allows: isWkTankForwardMove,
  },
  {
    id: "wk-t34-strike",
    kind: "task",
    text: "Т-34 вышел на дистанцию. Ударь им по немецкому Panzer III.",
    textEn: "The T-34 is in range. Strike the German Panzer III with it.",
    completes: isWkTankStrikeOnPanzer,
    allows: isWkTankForwardMove,
  },
  {
    id: "wk-end-turn",
    kind: "task",
    text: "Заверши ход — посмотрим, что предпримет враг.",
    textEn: "End your turn and see what the enemy does.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "wk-deploy-intro",
    kind: "dialogue",
    text:
      "Враг завяз и не рискует контратаковать. Нарасти удар: за топливо, что копит штаб, разыгрывай с руки свежие Т-34 на клетки плацдарма.",
    textEn:
      "The enemy is bogged down and won't counterattack. Press the assault: spend the fuel your headquarters stores to deploy fresh T-34s from hand onto the bridgehead cells.",
  },
  {
    id: "wk-play-t34",
    kind: "task",
    text: "Разыграй Т-34/76 с руки на любую подсвеченную клетку спавна.",
    textEn: "Deploy a T-34/76 from hand to any highlighted spawn cell.",
    completes: isWkPlayTank,
  },
  {
    id: "wk-finish",
    kind: "dialogue",
    text:
      "Дальше — свобода действий, командир. Добивай штаб противника: бей штабом, СУ-122 и танками, разыгрывай карты. Удержи рубеж у Понырей и заслужи «Зверобой»!",
    textEn:
      "From here you're on your own, commander. Finish the enemy headquarters: fire with your headquarters, SU-122s and tanks, and deploy your cards. Hold the line at Ponyri and earn the SU-152!",
  },
];

function getWelcomeKurskHighlights(
  step: TutorialStep,
  battle?: BattleState
): TutorialHighlights | null {
  // Highlight exactly one СУ-122 at a time: the next one that can still fire.
  // On the Ferdinand step the first (already-fired) SPG stays dark.
  const freshSpg = battle?.units.find(
    (unit) =>
      unit.ownerId === "player" &&
      unit.cardId === WK_SPG_CARD_ID &&
      isBattlefieldUnit(unit) &&
      !unit.alreadyAttacked
  );
  const spgHighlight: Pick<TutorialHighlights, "unitCardIds" | "unitInstanceIds"> =
    freshSpg
      ? { unitInstanceIds: [freshSpg.instanceId] }
      : { unitCardIds: [WK_SPG_CARD_ID] };

  switch (step.id) {
    case "wk-spg-tiger":
      return { ...spgHighlight, enemyUnitCardIds: [WK_TIGER_ID] };
    case "wk-spg-ferdinand":
      return { ...spgHighlight, enemyUnitCardIds: [WK_FERDINAND_ID] };
    case "wk-hq-strike":
      return { playerHq: true, enemyHq: true, hqAttackSequence: true };
    case "wk-move-t34":
      return { unitCardIds: [WK_TANK_CARD_ID] };
    case "wk-t34-strike":
      return {
        unitCardIds: [WK_TANK_CARD_ID],
        enemyUnitCardIds: [WK_PANZER_ID],
      };
    case "wk-end-turn":
      return { endTurn: true };
    case "wk-play-t34":
      return {
        handCardIds: [WK_TANK_CARD_ID],
        cells: battle ? getFreeSpawnCells(battle, "player") : undefined,
      };
    default:
      return null;
  }
}

/** Forward cell the demo highlights for the scripted Т-34 advance. */
function getWelcomeKurskMoveTargetCell(
  step: TutorialStep,
  battle: BattleState
): Position | null {
  if (step.id !== "wk-move-t34") return null;

  const unit = battle.units.find(
    (item) =>
      item.ownerId === "player" &&
      item.cardId === WK_TANK_CARD_ID &&
      isBattlefieldUnit(item)
  );
  if (!unit) return null;

  const moveCells = getAvailableMoveCells(battle, "player", unit.instanceId);
  const forwardCells = moveCells.filter(
    (cell) => cell.row === unit.position.row && cell.col > unit.position.col
  );
  if (forwardCells.length === 0) return null;

  // The single cell straight ahead (max reach along the row).
  return forwardCells.reduce((furthest, cell) =>
    cell.col > furthest.col ? cell : furthest
  );
}

/** The ordered step list for a given scripted battle. */
function getScriptSteps(scriptId: TutorialScriptId): TutorialStep[] {
  switch (scriptId) {
    case "welcome_kursk":
      return WELCOME_KURSK_STEPS;
    case "light_tanks":
      return LIGHT_TANKS_STEPS;
    case "medium_tanks":
      return MEDIUM_TANKS_STEPS;
    case "heavy_tanks":
      return HEAVY_TANKS_STEPS;
    case "tank_destroyers":
      return TANK_DESTROYERS_STEPS;
    case "self_propelled_guns":
      return SELF_PROPELLED_GUNS_STEPS;
    case "armored_cars":
      return ARMORED_CARS_STEPS;
    default:
      return TUTORIAL_STEPS;
  }
}

export function isTutorialFreePlay(
  scriptId: TutorialScriptId,
  stepIndex: number
): boolean {
  return stepIndex >= getScriptSteps(scriptId).length;
}

/**
 * Досрочные условия победы учебных миссий: бой заканчивается победой, как
 * только выполнена боевая задача урока, не дожидаясь уничтожения штаба.
 * Возвращает строку для боевого лога или null, если условие ещё не выполнено.
 */
export function getTutorialEarlyVictoryLog(
  scriptId: TutorialScriptId,
  battle: BattleState
): string | null {
  const destroyed = battle.stats?.destroyedByPlayer;
  if (!destroyed) return null;

  switch (scriptId) {
    case "training":
      // «Основы боя»: миссия выиграна уничтожением ПТ-САУ PzJäger I.
      return destroyed.td >= 1
        ? "ПТ-САУ уничтожена. Учебный бой выигран!"
        : null;
    case "light_tanks":
      // «Лёгкие танки»: уничтожить оба лёгких танка противника.
      return destroyed.light >= 2
        ? "Оба лёгких танка противника уничтожены. Учебный бой выигран!"
        : null;
    case "heavy_tanks":
      // «Тяжёлые танки»: КВ перемолол оба лёгких танка врага.
      return destroyed.light >= 2
        ? "Лёгкие танки противника уничтожены. Учебный бой выигран!"
        : null;
    case "tank_destroyers":
      // «ПТ-САУ»: бой выигран ударом с тыла по вражескому истребителю танков.
      return destroyed.td >= 1
        ? "Вражеская ПТ-САУ уничтожена ударом с тыла. Учебный бой выигран!"
        : null;
    case "self_propelled_guns":
      // «САУ»: тыловая артиллерия выбита самоходками, а прорвавшийся танк — прикрытием.
      return destroyed.support >= 1 && destroyed.light >= 1
        ? "Тыл врага выжжен, а прорыв отражён. Учебный бой выигран!"
        : null;
    case "armored_cars":
      // «Бронеавтомобили»: ПТ-САУ уничтожена с тыла, тыловая артиллерия — двойным ударом.
      return destroyed.td >= 1 && destroyed.support >= 1
        ? "Тыл врага разгромлен рейдом. Учебный бой выигран!"
        : null;
    default:
      return null;
  }
}

/**
 * Declarative UI hints for the active task step: what to highlight and that
 * everything else should be dimmed. Null when no task is active (dialogue or
 * free play) — the battle UI then renders as usual.
 */
export type TutorialHighlights = {
  playerHq?: boolean;
  enemyHq?: boolean;
  /** Card ids to highlight in the player's hand. */
  handCardIds?: string[];
  /** Board cells to highlight (spawn targets). */
  cells?: Position[];
  /** Player units to highlight, by card id. */
  unitCardIds?: string[];
  /**
   * Player units to highlight by exact instance id. Use when several units
   * share a card id but only one is the scripted actor (e.g. the second, still
   * unfired СУ-122). Takes precedence over `unitCardIds` for matching.
   */
  unitInstanceIds?: string[];
  /** Highlight enemy support-line units. */
  enemySupport?: boolean;
  /** Highlight the player's free rear (support) slots as deploy targets. */
  playerSupportSlots?: boolean;
  /** Enemy battlefield units to highlight, by card id. */
  enemyUnitCardIds?: string[];
  /** Highlight the end-turn button. */
  endTurn?: boolean;
  /**
   * Two-stage headquarters attack: until the player's HQ is selected only it
   * blinks; once selected, only the target (enemy HQ or enemy units) blinks.
   */
  hqAttackSequence?: boolean;
};

/** Подсветки задач миссии «Лёгкие танки». */
function getLightTanksHighlights(
  step: TutorialStep
): TutorialHighlights | null {
  switch (step.id) {
    case "lt-play-bt5":
      return { handCardIds: ["bt_5"], cells: [MEDIUM_SPAWN_CELL] };
    case "lt-dash-bt5":
      return { unitCardIds: ["bt_5"] };
    case "lt-end-1":
    case "lt-end-2":
      return { endTurn: true };
    case "lt-play-bt7":
      return { handCardIds: ["bt_7"], cells: [BT_SPAWN_CELL] };
    case "lt-play-ms1":
      return { handCardIds: ["ms_1_t18"], cells: [SPG_SPAWN_CELL] };
    case "lt-raid-1":
    case "lt-raid-2":
      return { unitCardIds: ["bt_7"] };
    case "lt-strike-hq":
      return { unitCardIds: ["bt_7"], enemyHq: true };
    case "lt-kill-tank":
      return {
        unitCardIds: ["bt_7"],
        enemyUnitCardIds: ["pzkpfw_i_ausf_b"],
      };
    default:
      return null;
  }
}

/** Подсветки задач миссии «Средние танки». */
function getMediumTanksHighlights(
  step: TutorialStep,
  battle?: BattleState
): TutorialHighlights | null {
  switch (step.id) {
    case "md-play-t34":
      return { handCardIds: ["t34_76"], cells: [MEDIUM_SPAWN_CELL] };
    case "md-end-1":
    case "md-end-2":
    case "md-end-3":
      return { endTurn: true };
    case "md-flank":
      return { unitCardIds: ["t34_76"] };
    case "md-kill-1":
      return {
        unitCardIds: ["t34_76"],
        enemyUnitCardIds: ["pzkpfw_i_ausf_b"],
      };
    case "md-play-t12":
      return {
        handCardIds: ["t-12"],
        cells: battle ? getFreeSpawnCells(battle, "player") : undefined,
      };
    case "md-focus-1":
    case "md-focus-2":
      return {
        unitCardIds: ["t34_76", "t-12"],
        enemyUnitCardIds: ["panzer_35t"],
      };
    default:
      return null;
  }
}

/** Подсветки задач миссии «Тяжёлые танки». */
function getHeavyTanksHighlights(
  step: TutorialStep
): TutorialHighlights | null {
  switch (step.id) {
    case "hv-play-truck":
      return { handCardIds: ["amo_f15"], playerSupportSlots: true };
    case "hv-play-truck-2":
      return { handCardIds: ["zis_5_ammo"], playerSupportSlots: true };
    case "hv-end-1":
    case "hv-end-2":
    case "hv-end-3":
      return { endTurn: true };
    case "hv-play-kv":
      return { handCardIds: ["kv1_1940"], cells: [MEDIUM_SPAWN_CELL] };
    case "hv-kill-1":
      return { unitCardIds: ["kv1_1940"], enemyUnitCardIds: ["panzer_35t"] };
    case "hv-kill-2":
      return {
        unitCardIds: ["kv1_1940"],
        enemyUnitCardIds: ["pzkpfw_i_ausf_b"],
      };
    default:
      return null;
  }
}

/** Подсветки задач миссии «ПТ-САУ». */
function getTankDestroyersHighlights(
  step: TutorialStep
): TutorialHighlights | null {
  switch (step.id) {
    case "td2-play-at1":
      return { handCardIds: ["at1"], cells: [MEDIUM_SPAWN_CELL] };
    case "td2-end-1":
    case "td2-end-2":
    case "td2-end-3":
      return { endTurn: true };
    case "td2-advance-at1":
      return { unitCardIds: ["at1"] };
    case "td2-kill-clean":
      return { unitCardIds: ["at1"], enemyUnitCardIds: ["leichttraktor"] };
    case "td2-take-damage":
      return { unitCardIds: ["at1"], enemyUnitCardIds: ["panzer_35t"] };
    case "td2-play-bt7":
      return { handCardIds: ["bt_7"], cells: [BT_SPAWN_CELL] };
    case "td2-raid-1":
    case "td2-raid-2":
      return { unitCardIds: ["bt_7"] };
    case "td2-rear-kill":
      return { unitCardIds: ["bt_7"], enemyUnitCardIds: ["panzerjaeger_i"] };
    default:
      return null;
  }
}

/** Подсветки задач миссии «САУ». */
function getSelfPropelledGunsHighlights(
  step: TutorialStep
): TutorialHighlights | null {
  switch (step.id) {
    case "spg-play-su122":
      return { handCardIds: ["su_122"], cells: [MEDIUM_SPAWN_CELL] };
    case "spg-end-1":
    case "spg-end-2":
    case "spg-end-3":
      return { endTurn: true };
    case "spg-strike-rear":
    case "spg-finish-rear":
      return { unitCardIds: ["su_122"], enemySupport: true };
    case "spg-play-su122-2":
      return { handCardIds: ["su_122"], cells: [SPG_SPAWN_CELL] };
    case "spg-hq-strike":
      return { unitCardIds: ["su_122"], enemyHq: true };
    case "spg-play-tank":
      return { handCardIds: ["t34_76"], cells: [BT_SPAWN_CELL] };
    case "spg-protect-kill":
      return {
        unitCardIds: ["t34_76"],
        enemyUnitCardIds: ["pzkpfw_i_ausf_b"],
      };
    default:
      return null;
  }
}

/** Подсветки задач миссии «Бронеавтомобили». */
function getArmoredCarsHighlights(
  step: TutorialStep
): TutorialHighlights | null {
  switch (step.id) {
    case "ac-play-ba6":
      return { handCardIds: ["ba_6_ac"], cells: [BT_SPAWN_CELL] };
    case "ac-dash":
    case "ac-flank-td":
      return { unitCardIds: ["ba_6_ac"] };
    case "ac-end-1":
    case "ac-end-2":
      return { endTurn: true };
    case "ac-kill-td":
      return {
        unitCardIds: ["ba_6_ac"],
        enemyUnitCardIds: ["panzerjaeger_i"],
      };
    case "ac-hq-strike":
      return { unitCardIds: ["ba_6_ac"], enemyHq: true };
    case "ac-double-1":
    case "ac-double-2":
      return { unitCardIds: ["ba_6_ac"], enemySupport: true };
    default:
      return null;
  }
}

export function getTutorialHighlights(
  scriptId: TutorialScriptId,
  stepIndex: number,
  battle?: BattleState
): TutorialHighlights | null {
  const step = getTutorialStep(scriptId, stepIndex);

  if (!step || step.kind !== "task") return null;

  if (scriptId === "welcome_kursk") {
    return getWelcomeKurskHighlights(step, battle);
  }
  if (scriptId === "light_tanks") {
    return getLightTanksHighlights(step);
  }
  if (scriptId === "medium_tanks") {
    return getMediumTanksHighlights(step, battle);
  }
  if (scriptId === "heavy_tanks") {
    return getHeavyTanksHighlights(step);
  }
  if (scriptId === "tank_destroyers") {
    return getTankDestroyersHighlights(step);
  }
  if (scriptId === "self_propelled_guns") {
    return getSelfPropelledGunsHighlights(step);
  }
  if (scriptId === "armored_cars") {
    return getArmoredCarsHighlights(step);
  }

  switch (step.id) {
    case "shoot-hq":
      return { playerHq: true, enemyHq: true, hqAttackSequence: true };
    case "play-medium":
      return { handCardIds: ["t-12"], cells: [MEDIUM_SPAWN_CELL] };
    case "move-t12":
      return { unitCardIds: ["t-12"] };
    case "end-turn-1":
    case "end-turn-2":
    case "end-turn-3":
      return { endTurn: true };
    case "play-bt":
      return { handCardIds: ["bt_7"], cells: [BT_SPAWN_CELL] };
    case "move-bt":
      return { unitCardIds: ["bt_7"] };
    case "raid-bt":
      return { unitCardIds: ["bt_7"] };
    case "play-spg":
      return { handCardIds: ["su_5_2"], cells: [SPG_SPAWN_CELL] };
    case "spg-finish-artillery":
      return { unitCardIds: ["su_5_2"], enemySupport: true };
    case "kill-artillery":
      return { unitCardIds: ["bt_7"], enemySupport: true };
    case "hq-finish-light":
      return {
        playerHq: true,
        enemyUnitCardIds: [TUTORIAL_BOT_LIGHT_TANK_ID],
        hqAttackSequence: true,
      };
    case "kill-td":
      return {
        unitCardIds: ["su_5_2"],
        enemyUnitCardIds: ["panzerjaeger_i"],
      };
    default:
      return null;
  }
}

export function getTutorialStep(
  scriptId: TutorialScriptId,
  stepIndex: number,
  language: Language = getSettings().language
): TutorialStep | null {
  const step = getScriptSteps(scriptId)[stepIndex];
  if (!step) return null;

  return {
    ...step,
    text: language === "en" ? step.textEn ?? step.text : step.text,
  };
}

/**
 * Player action gate. During dialogue steps every player action is blocked;
 * during task steps the expected action, explicitly allowed helpers and
 * END_TURN (deadlock protection) pass through.
 */
export function isTutorialActionAllowed(
  scriptId: TutorialScriptId,
  stepIndex: number,
  action: BattleAction,
  battle: BattleState
): boolean {
  if (isTutorialFreePlay(scriptId, stepIndex)) return true;
  if (action.type === "BEGIN_BATTLE" || action.type === "TIMER_TICK") return true;
  if ("playerId" in action && action.playerId === "bot") return true;

  const step = getTutorialStep(scriptId, stepIndex);
  if (!step) return true;

  if (step.kind === "dialogue") return false;

  if (step.completes?.(action, battle)) return true;
  if (step.allows?.(action, battle)) return true;

  // Deadlock protection: the player can always pass the turn.
  return action.type === "END_TURN";
}

/** Returns the next step index after the player performed `action`. */
export function getNextTutorialStepIndex(
  scriptId: TutorialScriptId,
  stepIndex: number,
  action: BattleAction,
  battle: BattleState
): number {
  const step = getTutorialStep(scriptId, stepIndex);

  if (!step || step.kind !== "task") return stepIndex;

  return step.completes?.(action, battle) ? stepIndex + 1 : stepIndex;
}

// === Scripted bot ===

function findBotHandCard(battle: BattleState, cardId: string) {
  return battle.bot.hand.find((item) => item.cardId === cardId) ?? null;
}

function findBotUnit(battle: BattleState, cardId: string): BoardUnit | null {
  return (
    battle.units.find(
      (unit) =>
        unit.ownerId === "bot" &&
        unit.cardId === cardId &&
        isBattlefieldUnit(unit)
    ) ?? null
  );
}

function findPlayerUnitByClass(
  battle: BattleState,
  unitClass: string
): BoardUnit | null {
  return (
    battle.units.find(
      (unit) =>
        unit.ownerId === "player" &&
        isBattlefieldUnit(unit) &&
        getCard(unit.cardId).class === unitClass
    ) ?? null
  );
}

function canBotAfford(battle: BattleState, cardId: string): boolean {
  return battle.bot.resources >= getCard(cardId).cost;
}

function botHeadquartersAttack(
  battle: BattleState,
  target: { type: "unit" | "headquarters"; id: string }
): BattleAction | null {
  if (battle.headquarters.bot.alreadyAttacked) return null;

  const targets = getTargetsInRange(battle, "bot", "headquarters", "bot_hq");
  const found = targets.find(
    (item) => item.type === target.type && item.id === target.id
  );

  if (!found) return null;

  return {
    type: "ATTACK",
    playerId: "bot",
    attackerType: "headquarters",
    attackerId: "bot_hq",
    targetType: target.type,
    targetId: target.id,
  };
}

function botPlayCard(battle: BattleState, cardId: string): BattleAction | null {
  const cardInstance = findBotHandCard(battle, cardId);

  if (!cardInstance || !canBotAfford(battle, cardId)) return null;

  const freeCells = getFreeSpawnCells(battle, "bot");
  if (freeCells.length === 0) return null;

  return {
    type: "PLAY_CARD",
    playerId: "bot",
    cardInstanceId: cardInstance.instanceId,
    position: freeCells[0],
  };
}

function botPlaySupportCard(
  battle: BattleState,
  cardId: string,
  preferredSlot?: SupportSlot
): BattleAction | null {
  const cardInstance = findBotHandCard(battle, cardId);

  if (!cardInstance || !canBotAfford(battle, cardId)) return null;

  const freeSlots = getFreeSupportSlots(battle, "bot");
  if (freeSlots.length === 0) return null;
  const supportSlot =
    preferredSlot !== undefined && freeSlots.includes(preferredSlot)
      ? preferredSlot
      : freeSlots[0];

  return {
    type: "PLAY_SUPPORT_CARD",
    playerId: "bot",
    cardInstanceId: cardInstance.instanceId,
    supportSlot,
  };
}

function isAdjacent(a: Position, b: Position): boolean {
  return (
    Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) === 1
  );
}

/** Moves a bot unit toward adjacency with the target unit, if possible. */
function botMoveTowards(
  battle: BattleState,
  unit: BoardUnit,
  target: BoardUnit
): BattleAction | null {
  if (unit.alreadyMoved) return null;
  if (isAdjacent(unit.position, target.position)) return null;

  const cells = getAvailableMoveCells(battle, "bot", unit.instanceId);
  const adjacentCell = cells.find((cell) => isAdjacent(cell, target.position));
  const towardCell = adjacentCell
    ?? cells
      .slice()
      .sort(
        (left, right) =>
          Math.abs(left.col - target.position.col) +
          Math.abs(left.row - target.position.row) -
          (Math.abs(right.col - target.position.col) +
            Math.abs(right.row - target.position.row))
      )[0];

  if (!towardCell) return null;

  return {
    type: "MOVE_UNIT",
    playerId: "bot",
    unitId: unit.instanceId,
    position: towardCell,
  };
}

function botUnitAttack(
  battle: BattleState,
  unit: BoardUnit,
  target: BoardUnit
): BattleAction | null {
  if (unit.alreadyAttacked) return null;

  const targets = getTargetsInRange(battle, "bot", "unit", unit.instanceId);
  const found = targets.find(
    (item) => item.type === "unit" && item.id === target.instanceId
  );

  if (!found) return null;

  return {
    type: "ATTACK",
    playerId: "bot",
    attackerType: "unit",
    attackerId: unit.instanceId,
    targetType: "unit",
    targetId: target.instanceId,
  };
}

const BOT_END_TURN: BattleAction = { type: "END_TURN", playerId: "bot" };

function findPlayerUnitByCardId(
  battle: BattleState,
  cardId: string
): BoardUnit | null {
  return (
    battle.units.find(
      (unit) =>
        unit.ownerId === "player" &&
        unit.cardId === cardId &&
        isBattlefieldUnit(unit)
    ) ?? null
  );
}

/** Самый продвинувшийся к боту юнит игрока на поле (максимальный столбец). */
function findMostAdvancedPlayerUnit(battle: BattleState): BoardUnit | null {
  return (
    battle.units
      .filter(
        (unit) =>
          unit.ownerId === "player" &&
          isBattlefieldUnit(unit) &&
          unit.currentHp > 0
      )
      .sort((left, right) => right.position.col - left.position.col)[0] ?? null
  );
}

/** Как botPlayCard, но с предпочтительной клеткой спавна (если свободна). */
function botPlayCardAtCell(
  battle: BattleState,
  cardId: string,
  preferredCell: Position
): BattleAction | null {
  const cardInstance = findBotHandCard(battle, cardId);

  if (!cardInstance || !canBotAfford(battle, cardId)) return null;

  const freeCells = getFreeSpawnCells(battle, "bot");
  if (freeCells.length === 0) return null;

  const cell =
    freeCells.find(
      (item) =>
        item.row === preferredCell.row && item.col === preferredCell.col
    ) ?? freeCells[0];

  return {
    type: "PLAY_CARD",
    playerId: "bot",
    cardInstanceId: cardInstance.instanceId,
    position: cell,
  };
}

/** Скриптованный ход юнита бота ровно в заданную клетку (если достижима). */
function botMoveUnitToCell(
  battle: BattleState,
  cardId: string,
  target: Position
): BattleAction | null {
  const unit = findBotUnit(battle, cardId);

  if (!unit || unit.alreadyMoved) return null;
  if (unit.position.row === target.row && unit.position.col === target.col) {
    return null;
  }

  const reachable = getAvailableMoveCells(battle, "bot", unit.instanceId).some(
    (cell) => cell.row === target.row && cell.col === target.col
  );

  if (!reachable) return null;

  return {
    type: "MOVE_UNIT",
    playerId: "bot",
    unitId: unit.instanceId,
    position: target,
  };
}

/** Атака юнита бота по любому достижимому юниту игрока. */
function botUnitAttackAnyReachable(
  battle: BattleState,
  unit: BoardUnit
): BattleAction | null {
  if (unit.alreadyAttacked) return null;

  const target = getTargetsInRange(battle, "bot", "unit", unit.instanceId).find(
    (item) => item.type === "unit"
  );

  if (!target) return null;

  return {
    type: "ATTACK",
    playerId: "bot",
    attackerType: "unit",
    attackerId: unit.instanceId,
    targetType: "unit",
    targetId: target.id,
  };
}

/**
 * Штаб бота бьёт по прорвавшемуся юниту игрока (столбцы 3–4), а если рейдеров
 * нет — по штабу игрока. Так рейды действительно «оттягивают» огонь на себя.
 */
function botHqShootRaiderOrPlayerHq(battle: BattleState): BattleAction | null {
  const raider = findMostAdvancedPlayerUnit(battle);

  if (raider && raider.position.col >= 3) {
    const shot = botHeadquartersAttack(battle, {
      type: "unit",
      id: raider.instanceId,
    });
    if (shot) return shot;
  }

  return botHeadquartersAttack(battle, {
    type: "headquarters",
    id: "player_hq",
  });
}

// ===== Скриптованный противник миссии «Лёгкие танки» =====
// Пассивный гарнизон: техника сторожит спавн, весь урон — только огонь штаба,
// который честно отвлекается на рейдеров. Игрок гарантированно побеждает роем.
function getLightTanksBotAction(battle: BattleState): BattleAction | null {
  const turn = battle.turn;

  if (turn === 1) {
    const playGarrison = botPlayCardAtCell(battle, "panzer_35t", {
      row: 0,
      col: 4,
    });
    if (playGarrison) return playGarrison;

    const light = findPlayerUnitByClass(battle, "light");
    if (light) {
      const hqShot = botHeadquartersAttack(battle, {
        type: "unit",
        id: light.instanceId,
      });
      if (hqShot) return hqShot;
    }

    return BOT_END_TURN;
  }

  if (turn === 2) {
    const playSecond = botPlayCardAtCell(battle, "pzkpfw_i_ausf_b", {
      row: 1,
      col: 4,
    });
    if (playSecond) return playSecond;
  }

  const hqShot = botHqShootRaiderOrPlayerHq(battle);
  if (hqShot) return hqShot;

  return BOT_END_TURN;
}

// ===== Скриптованный противник миссии «Средние танки» =====
// Первые два хода строго по сценарию (жертва под удар с хода, затем цель для
// сосредоточения огня), дальше — дешёвый гарнизон у спавна.
function getMediumTanksBotAction(battle: BattleState): BattleAction | null {
  const turn = battle.turn;

  if (turn === 1) {
    if (!findBotUnit(battle, "pzkpfw_i_ausf_b")) {
      const play = botPlayCardAtCell(battle, "pzkpfw_i_ausf_b", {
        row: 1,
        col: 4,
      });
      if (play) return play;
    }

    // Рывок ровно на {1,2}: клетку, до которой Т-34 дотянется манёвром с хода.
    const advance = botMoveUnitToCell(battle, "pzkpfw_i_ausf_b", {
      row: 1,
      col: 2,
    });
    if (advance) return advance;

    const medium = findPlayerUnitByClass(battle, "medium");
    if (medium) {
      const hqShot = botHeadquartersAttack(battle, {
        type: "unit",
        id: medium.instanceId,
      });
      if (hqShot) return hqShot;
    }

    return BOT_END_TURN;
  }

  if (turn === 2) {
    if (!findBotUnit(battle, "panzer_35t")) {
      const play = botPlayCardAtCell(battle, "panzer_35t", { row: 0, col: 4 });
      if (play) return play;
    }

    // Выходит на {0,2} — вне досягаемости Т-34, чтобы у игрока был целый ход
    // на урок «сосредоточение огня» без ответной атаки.
    const advance = botMoveUnitToCell(battle, "panzer_35t", {
      row: 0,
      col: 2,
    });
    if (advance) return advance;

    const hqShot = botHeadquartersAttack(battle, {
      type: "headquarters",
      id: "player_hq",
    });
    if (hqShot) return hqShot;

    return BOT_END_TURN;
  }

  // Ход 3+: дешёвый гарнизон у спавна, юниты бьют только то, что рядом.
  const reinforcement =
    botPlayCard(battle, "pzkpfw_i_ausf_a") ??
    botPlayCard(battle, "leichttraktor");
  if (reinforcement) return reinforcement;

  for (const unit of battle.units) {
    if (unit.ownerId !== "bot" || !isBattlefieldUnit(unit)) continue;

    const strike = botUnitAttackAnyReachable(battle, unit);
    if (strike) return strike;
  }

  const hqShot = botHqShootRaiderOrPlayerHq(battle);
  if (hqShot) return hqShot;

  return BOT_END_TURN;
}

// ===== Скриптованный противник миссии «Тяжёлые танки» =====
// Урок «Лобовой брони»: Panzer 35(t) бьёт КВ строго в лоб (0 урона, ответный
// огонь оставляет ему 1 здоровья), второй лёгкий подкрадывается вплотную, но
// не стреляет — обоих добивает КВ игрока, и миссия завершается победой.
function getHeavyTanksBotAction(battle: BattleState): BattleAction | null {
  const turn = battle.turn;

  if (turn === 1) {
    if (!findBotUnit(battle, "panzer_35t")) {
      const play = botPlayCardAtCell(battle, "panzer_35t", { row: 1, col: 4 });
      if (play) return play;
    }

    const advance = botMoveUnitToCell(battle, "panzer_35t", {
      row: 1,
      col: 2,
    });
    if (advance) return advance;

    const hqShot = botHeadquartersAttack(battle, {
      type: "headquarters",
      id: "player_hq",
    });
    if (hqShot) return hqShot;

    return BOT_END_TURN;
  }

  if (turn === 2) {
    // Panzer 35(t) встаёт прямо перед КВ на {1,1} и стреляет в лоб: лобовая
    // броня гасит удар в ноль, а ответный огонь КВ оставляет ему 1 здоровья.
    const rusher = findBotUnit(battle, "panzer_35t");
    const kv = findPlayerUnitByCardId(battle, "kv1_1940");

    if (rusher && kv) {
      const approach = botMoveUnitToCell(battle, "panzer_35t", {
        row: 1,
        col: 1,
      });
      if (approach) return approach;

      const strike = botUnitAttack(battle, rusher, kv);
      if (strike) return strike;
    }

    if (!findBotUnit(battle, "pzkpfw_i_ausf_b")) {
      const play = botPlayCardAtCell(battle, "pzkpfw_i_ausf_b", {
        row: 1,
        col: 4,
      });
      if (play) return play;
    }

    const advance = botMoveUnitToCell(battle, "pzkpfw_i_ausf_b", {
      row: 1,
      col: 2,
    });
    if (advance) return advance;

    const hqShot = botHeadquartersAttack(battle, {
      type: "headquarters",
      id: "player_hq",
    });
    if (hqShot) return hqShot;

    return BOT_END_TURN;
  }

  // Ход 3+: если Panzer 35(t) ещё жив (игрок отклонился от сценария), он
  // продолжает давить в лоб; второй лёгкий подкрадывается вплотную к КВ, но
  // не стреляет — добить его должен игрок (после гибели двух лёгких бой выигран).
  const rusher = findBotUnit(battle, "panzer_35t");
  const kv = findPlayerUnitByCardId(battle, "kv1_1940");

  if (rusher && kv) {
    const approach = botMoveUnitToCell(battle, "panzer_35t", {
      row: 1,
      col: 1,
    });
    if (approach) return approach;

    const strike = botUnitAttack(battle, rusher, kv);
    if (strike) return strike;
  }

  const creepUnit = findBotUnit(battle, "pzkpfw_i_ausf_b");
  if (creepUnit && creepUnit.position.col > 1) {
    // Промежуточная клетка {1,2} — только пока танк дальше неё, иначе он
    // «отползал» бы назад после выхода на позицию.
    const creep =
      botMoveUnitToCell(battle, "pzkpfw_i_ausf_b", { row: 1, col: 1 }) ??
      (creepUnit.position.col > 2
        ? botMoveUnitToCell(battle, "pzkpfw_i_ausf_b", { row: 1, col: 2 })
        : null);
    if (creep) return creep;
  }

  const hqShot = botHeadquartersAttack(battle, {
    type: "headquarters",
    id: "player_hq",
  });
  if (hqShot) return hqShot;

  return BOT_END_TURN;
}

// ===== Скриптованный противник миссии «ПТ-САУ» =====
// Три волны, каждая — отдельный урок про ПТ-САУ игрока:
//   ход 1 — Leichttraktor (2 HP) идёт под «чистый» выстрел АТ-1;
//   ход 2 — Panzer 35(t) (4 HP) переживает выстрел и бьёт в ответ;
//   ход 3 — вражеская ПТ-САУ PzJäger I выходит на {1,3}, её обходят с тыла.
// Техника только выдвигается на контактную линию и не атакует, чтобы уроки шли
// строго по сценарию; АТ-1 игрока не рискует погибнуть.
function getTankDestroyersBotAction(battle: BattleState): BattleAction | null {
  const turn = battle.turn;

  if (turn === 1) {
    if (!findBotUnit(battle, "leichttraktor")) {
      const play = botPlayCardAtCell(battle, "leichttraktor", { row: 1, col: 4 });
      if (play) return play;
    }

    const advance = botMoveUnitToCell(battle, "leichttraktor", { row: 1, col: 2 });
    if (advance) return advance;

    return BOT_END_TURN;
  }

  if (turn === 2) {
    if (!findBotUnit(battle, "panzer_35t")) {
      const play = botPlayCardAtCell(battle, "panzer_35t", { row: 1, col: 4 });
      if (play) return play;
    }

    const advance = botMoveUnitToCell(battle, "panzer_35t", { row: 1, col: 2 });
    if (advance) return advance;

    return BOT_END_TURN;
  }

  if (turn === 3) {
    if (!findBotUnit(battle, "panzerjaeger_i")) {
      const play = botPlayCardAtCell(battle, "panzerjaeger_i", { row: 1, col: 4 });
      if (play) return play;
    }

    // Истребитель танков выходит на {1,3}: перед ним остаётся клетка {1,4} в
    // тылу — именно туда обходит его рейдер БТ-7.
    const advance = botMoveUnitToCell(battle, "panzerjaeger_i", { row: 1, col: 3 });
    if (advance) return advance;

    return BOT_END_TURN;
  }

  // Свободная игра: бот пассивно обстреливает штаб игрока, давая победить.
  const hqShot = botHeadquartersAttack(battle, {
    type: "headquarters",
    id: "player_hq",
  });
  if (hqShot) return hqShot;

  return BOT_END_TURN;
}

// ===== Скриптованный противник миссии «САУ» =====
// Ход 1 — тыловая артиллерия leIG 18 (цель для удара САУ по тылам);
// ход 2 — Panzer I выходит на {1,2} и катится к самоходкам;
// ход 3 — Panzer встаёт вплотную на {1,1} и бьёт СУ-122 (та не отвечает — урок
// про беззащитность САУ в упор), после чего его добивает танк прикрытия игрока.
function getSelfPropelledGunsBotAction(
  battle: BattleState
): BattleAction | null {
  const turn = battle.turn;

  if (turn === 1) {
    const playArtillery = botPlaySupportCard(battle, "leig_18", 2);
    if (playArtillery) return playArtillery;

    return BOT_END_TURN;
  }

  if (turn === 2) {
    if (!findBotUnit(battle, "pzkpfw_i_ausf_b")) {
      const play = botPlayCardAtCell(battle, "pzkpfw_i_ausf_b", { row: 1, col: 4 });
      if (play) return play;
    }

    const advance = botMoveUnitToCell(battle, "pzkpfw_i_ausf_b", { row: 1, col: 2 });
    if (advance) return advance;

    return BOT_END_TURN;
  }

  if (turn === 3) {
    const panzer = findBotUnit(battle, "pzkpfw_i_ausf_b");
    const spg = findPlayerUnitByCardId(battle, "su_122");

    if (panzer && spg) {
      const approach = botMoveUnitToCell(battle, "pzkpfw_i_ausf_b", { row: 1, col: 1 });
      if (approach) return approach;

      const strike = botUnitAttack(battle, panzer, spg);
      if (strike) return strike;
    }

    return BOT_END_TURN;
  }

  // Свободная игра: бот пассивно обстреливает штаб игрока, давая победить.
  const hqShot = botHeadquartersAttack(battle, {
    type: "headquarters",
    id: "player_hq",
  });
  if (hqShot) return hqShot;

  return BOT_END_TURN;
}

// ===== Скриптованный противник миссии «Бронеавтомобили» =====
// Ход 1 — ПТ-САУ PzJäger I выходит на {1,3} (её обходят с тыла и уничтожают);
// ход 2 — тыловая артиллерия leIG 18 (цель для двойного удара), штаб бьёт по
// штабу игрока. Противник не атакует рейдер: урок про безнаказанный рейд.
function getArmoredCarsBotAction(battle: BattleState): BattleAction | null {
  const turn = battle.turn;

  if (turn === 1) {
    if (!findBotUnit(battle, "panzerjaeger_i")) {
      const play = botPlayCardAtCell(battle, "panzerjaeger_i", { row: 1, col: 4 });
      if (play) return play;
    }

    // ПТ-САУ выходит на {1,3}: перед ней остаётся клетка {2,4} в тылу, куда
    // заходит бронеавтомобиль. Атаковать рейдер она не пытается.
    const advance = botMoveUnitToCell(battle, "panzerjaeger_i", { row: 1, col: 3 });
    if (advance) return advance;

    return BOT_END_TURN;
  }

  if (turn === 2) {
    const playArtillery = botPlaySupportCard(battle, "leig_18", 2);
    if (playArtillery) return playArtillery;

    const hqShot = botHeadquartersAttack(battle, {
      type: "headquarters",
      id: "player_hq",
    });
    if (hqShot) return hqShot;

    return BOT_END_TURN;
  }

  // Свободная игра: бот пассивно обстреливает штаб игрока, давая победить.
  const hqShot = botHeadquartersAttack(battle, {
    type: "headquarters",
    id: "player_hq",
  });
  if (hqShot) return hqShot;

  return BOT_END_TURN;
}

/**
 * Scripted tutorial opponent. Returns one action per call, mirroring the
 * getNextBotAction contract; every scripted intent is validated against the
 * current state and silently skipped when impossible.
 */
export function getTutorialBotAction(
  scriptId: TutorialScriptId,
  battle: BattleState
): BattleAction | null {
  if (battle.status !== "active") return null;
  if (battle.activePlayer !== "bot") return null;

  // Демо-миссия «Поныри»: противник полностью пассивен — подбитые Тигр,
  // Фердинанд и свежий Panzer III стоят на месте, а игрок гарантированно
  // добивает штаб. Бот просто передаёт ход.
  if (scriptId === "welcome_kursk") {
    return BOT_END_TURN;
  }

  if (scriptId === "light_tanks") return getLightTanksBotAction(battle);
  if (scriptId === "medium_tanks") return getMediumTanksBotAction(battle);
  if (scriptId === "heavy_tanks") return getHeavyTanksBotAction(battle);
  if (scriptId === "tank_destroyers") return getTankDestroyersBotAction(battle);
  if (scriptId === "self_propelled_guns")
    return getSelfPropelledGunsBotAction(battle);
  if (scriptId === "armored_cars") return getArmoredCarsBotAction(battle);

  const turn = battle.turn;

  if (turn === 1) {
    // Сначала артиллерия на линию поддержки, и только потом обстрел юнита игрока.
    const playArtillery = botPlaySupportCard(battle, "leig_18", 2);
    if (playArtillery) return playArtillery;

    const mediumTank = findPlayerUnitByClass(battle, "medium");

    if (mediumTank) {
      const hqShot = botHeadquartersAttack(battle, {
        type: "unit",
        id: mediumTank.instanceId,
      });
      if (hqShot) return hqShot;
    }

    return BOT_END_TURN;
  }

  if (turn === 2) {
    // Вывести лёгкий танк и добить им средний танк игрока.
    const mediumTank = findPlayerUnitByClass(battle, "medium");
    const lightTank = findBotUnit(battle, TUTORIAL_BOT_LIGHT_TANK_ID);

    if (!lightTank) {
      const playLight = botPlayCard(battle, TUTORIAL_BOT_LIGHT_TANK_ID);
      if (playLight) return playLight;
    }

    if (lightTank && mediumTank) {
      const approach = botMoveTowards(battle, lightTank, mediumTank);
      if (approach) return approach;

      const strike = botUnitAttack(battle, lightTank, mediumTank);
      if (strike) return strike;
    }

    const hqShot = botHeadquartersAttack(battle, {
      type: "headquarters",
      id: "player_hq",
    });
    if (hqShot) return hqShot;

    return BOT_END_TURN;
  }

  if (turn === 3) {
    // Вывести ПТ-САУ и обстрелять штаб игрока.
    const tankDestroyer = findBotUnit(battle, "panzerjaeger_i");

    if (!tankDestroyer) {
      const playTd = botPlayCard(battle, "panzerjaeger_i");
      if (playTd) return playTd;
    }

    const hqShot = botHeadquartersAttack(battle, {
      type: "headquarters",
      id: "player_hq",
    });
    if (hqShot) return hqShot;

    return BOT_END_TURN;
  }

  // Свободная игра: бот пассивно обстреливает штаб игрока, давая победить.
  const hqShot = botHeadquartersAttack(battle, {
    type: "headquarters",
    id: "player_hq",
  });
  if (hqShot) return hqShot;

  return BOT_END_TURN;
}
