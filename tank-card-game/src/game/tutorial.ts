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
  PlayerId,
  Position,
} from "./types";

export const TUTORIAL_PLAYER_HEADQUARTERS_ID = "training_unit" as const;
export const TUTORIAL_BOT_HEADQUARTERS_ID = "trainingslager" as const;

/**
 * Scripted decks. Order matters: decks are NOT shuffled in the tutorial, so
 * the opening hand is deterministic (player draws 5 first). The player deck
 * is 5 cards bigger than the bot's, so it never runs dry first.
 */
export const TUTORIAL_PLAYER_DECK: string[] = [
  "t24", // средний танк для первого розыгрыша
  "bt_7", // БТ с блицем
  "su_5_2", // САУ против ПТ-САУ
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

/** Fixed reward for finishing the tutorial: first XP, iron and a few gold tracks. */
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
  fullyResearchedConversion: false,
};

/** Верхняя правая клетка спавна игрока — сюда обучение просит выставить Т-24. */
export const MEDIUM_SPAWN_CELL: Position = { row: 1, col: 1 };
/** Нижняя клетка спавна — отсюда БТ-7 гарантированно доходит до линии штаба. */
export const BT_SPAWN_CELL: Position = { row: 2, col: 1 };
/** Крайняя левая клетка спавна — сюда обучение просит выставить СУ-5-2. */
export const SPG_SPAWN_CELL: Position = { row: 1, col: 0 };
/** Лёгкий танк бота, которого игрок добивает выстрелом штаба. */
export const TUTORIAL_BOT_LIGHT_TANK_ID = "pzkpfw_i_ausf_b";

export type TutorialStep = {
  id: string;
  kind: "dialogue" | "task";
  /** Speech of the instructor avatar (dialogue) or the task instruction. */
  text: string;
  /** Returns true when a dispatched player action completes this task step. */
  completes?: (action: BattleAction, battle: BattleState) => boolean;
  /** Additional player actions tolerated while the task is active. */
  allows?: (action: BattleAction, battle: BattleState) => boolean;
};

function getHandCardClass(
  battle: BattleState,
  playerId: PlayerId,
  cardInstanceId: string
): string | null {
  const cardInstance = battle[playerId].hand.find(
    (item) => item.instanceId === cardInstanceId
  );

  return cardInstance ? getCard(cardInstance.cardId).class : null;
}

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

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "intro-hq",
    kind: "dialogue",
    text:
      "Добро пожаловать, командир! Это твой штаб — сердце армии. У штаба есть очки атаки и здоровья. " +
      "Если здоровье штаба упадёт до нуля, он уничтожен. Твоя задача — уничтожить штаб противника раньше, чем он уничтожит твой.",
  },
  {
    id: "shoot-hq",
    kind: "task",
    text:
      "Штаб умеет стрелять! Выбери свой штаб и выстрели по вражескому штабу.",
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
      "Отлично! Внизу — твоя рука с картами. Штаб и техника генерируют топливо каждый ход. " +
      "За топливо ты разыгрываешь новые юниты на клетки спавна рядом со штабом.",
  },
  {
    id: "play-medium",
    kind: "task",
    text: "Разыграй средний танк Т-24 на верхнюю правую клетку спавна (подсвечена).",
    completes: (action, battle) =>
      action.type === "PLAY_CARD" &&
      action.playerId === "player" &&
      getHandCardClass(battle, "player", action.cardInstanceId) === "medium" &&
      action.position.row === MEDIUM_SPAWN_CELL.row &&
      action.position.col === MEDIUM_SPAWN_CELL.col &&
      isValidPlayerPlay(action, battle),
  },
  {
    id: "unit-types",
    kind: "dialogue",
    text:
      "В армии пять типов техники. Лёгкие танки быстры и могут действовать сразу после выхода. " +
      "Средние — универсалы. Тяжёлые — мощные, но за ход либо движутся, либо стреляют. " +
      "ПТ-САУ опасны в ближнем бою, а САУ бьют издалека без ответного огня.",
  },
  {
    id: "end-turn-1",
    kind: "task",
    text: "Теперь нажми кнопку «Конец хода» и посмотри, что сделает противник.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "support-line",
    kind: "dialogue",
    text:
      "Смотри: противник выставил артиллерию на линию поддержки рядом со своим штабом " +
      "и обстрелял твой танк. Тыловые юниты — артиллерия, транспорт, медицина — усиливают " +
      "штаб, не выходя на поле. Их можно уничтожить, если твой юнит дойдёт до колонки " +
      "вражеского штаба. САУ бьют по ним из любой точки.",
  },
  {
    id: "bt-blitz",
    kind: "dialogue",
    text:
      "Твой Т-24 повреждён, но держится. Усилим натиск! У танков БТ есть «Блиц» — " +
      "они могут двигаться и атаковать сразу после выхода на поле.",
  },
  {
    id: "play-bt",
    kind: "task",
    text: "Разыграй БТ-7 на нижнюю клетку спавна (подсвечена).",
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
    text: "Благодаря «Блицу» БТ-7 готов действовать. Продвинь его вперёд, к противнику.",
    completes: (action, battle) =>
      isValidPlayerUnitMove(action, battle) &&
      action.type === "MOVE_UNIT" &&
      getUnit(battle, action.unitId)?.cardId === "bt_7",
  },
  {
    id: "play-spg",
    kind: "task",
    text:
      "Топлива хватает ещё на одну карту! Разыграй САУ СУ-5-2 на крайнюю левую клетку спавна (подсвечена).",
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
    id: "end-turn-2",
    kind: "task",
    text: "Заверши ход.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "medium-lost",
    kind: "dialogue",
    text:
      "Противник вывел лёгкий танк и добил твой Т-24. Пора отплатить той же монетой: " +
      "артиллерия поддержки усиливает вражеский штаб — уничтожь её!",
  },
  {
    id: "kill-artillery",
    kind: "task",
    text:
      "Доведи БТ-7 до линии вражеского штаба (крайняя колонка) и атакуй артиллерию поддержки. " +
      "Если хода не хватает — заверши ход и продолжай в следующем.",
    completes: isAttackOnSupport,
    allows: isPlayerUnitMove,
  },
  {
    id: "hq-finish-light",
    kind: "task",
    text:
      "Артиллерия уничтожена! Лёгкий танк врага ослаблен ответным огнём — " +
      "добей его выстрелом своего штаба.",
    completes: isHqAttackOnBotLightTank,
  },
  {
    id: "end-turn-3",
    kind: "task",
    text: "Отличная работа! Заверши ход.",
    completes: (action) =>
      action.type === "END_TURN" && action.playerId === "player",
  },
  {
    id: "td-rules",
    kind: "dialogue",
    text:
      "Противник вывел ПТ-САУ! Запомни правило: в ближнем бою ПТ-САУ стреляет первой — " +
      "атаковать её вплотную опасно. Зато САУ бьют по любой цели издалека, и ответного огня не будет.",
  },
  {
    id: "kill-td",
    kind: "task",
    text:
      "Твоя СУ-5-2 уже на позиции. САУ бьют по любой цели издалека и не получают " +
      "ответного огня — уничтожь вражескую ПТ-САУ.",
    completes: isSpgAttackOnTd,
    allows: isPlayerUnitMove,
  },
  {
    id: "finish-him",
    kind: "dialogue",
    text:
      "Ты освоил основы! Теперь добей штаб противника: стреляй штабом, юнитами и разыгрывай " +
      "оставшиеся карты. Вперёд, к победе!",
  },
];

export const TUTORIAL_EPILOGUE_TEXT =
  "Победа, командир! Дальше тебя ждёт дерево исследований: открывай новые юниты и штабы, " +
  "покупай технику за железные траки и собирай собственные колоды под свой стиль. " +
  "Развивай армию после каждого боя — и удача всегда будет на твоей стороне!";

export function isTutorialFreePlay(stepIndex: number): boolean {
  return stepIndex >= TUTORIAL_STEPS.length;
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
  /** Highlight enemy support-line units. */
  enemySupport?: boolean;
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

export function getTutorialHighlights(
  stepIndex: number
): TutorialHighlights | null {
  const step = getTutorialStep(stepIndex);

  if (!step || step.kind !== "task") return null;

  switch (step.id) {
    case "shoot-hq":
      return { playerHq: true, enemyHq: true, hqAttackSequence: true };
    case "play-medium":
      return { handCardIds: ["t24"], cells: [MEDIUM_SPAWN_CELL] };
    case "end-turn-1":
    case "end-turn-2":
    case "end-turn-3":
      return { endTurn: true };
    case "play-bt":
      return { handCardIds: ["bt_7"], cells: [BT_SPAWN_CELL] };
    case "move-bt":
      return { unitCardIds: ["bt_7"] };
    case "play-spg":
      return { handCardIds: ["su_5_2"], cells: [SPG_SPAWN_CELL] };
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

export function getTutorialStep(stepIndex: number): TutorialStep | null {
  return TUTORIAL_STEPS[stepIndex] ?? null;
}

/**
 * Player action gate. During dialogue steps every player action is blocked;
 * during task steps the expected action, explicitly allowed helpers and
 * END_TURN (deadlock protection) pass through.
 */
export function isTutorialActionAllowed(
  stepIndex: number,
  action: BattleAction,
  battle: BattleState
): boolean {
  if (isTutorialFreePlay(stepIndex)) return true;
  if (action.type === "BEGIN_BATTLE" || action.type === "TIMER_TICK") return true;
  if ("playerId" in action && action.playerId === "bot") return true;

  const step = getTutorialStep(stepIndex);
  if (!step) return true;

  if (step.kind === "dialogue") return false;

  if (step.completes?.(action, battle)) return true;
  if (step.allows?.(action, battle)) return true;

  // Deadlock protection: the player can always pass the turn.
  return action.type === "END_TURN";
}

/** Returns the next step index after the player performed `action`. */
export function getNextTutorialStepIndex(
  stepIndex: number,
  action: BattleAction,
  battle: BattleState
): number {
  const step = getTutorialStep(stepIndex);

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
  cardId: string
): BattleAction | null {
  const cardInstance = findBotHandCard(battle, cardId);

  if (!cardInstance || !canBotAfford(battle, cardId)) return null;

  const freeSlots = getFreeSupportSlots(battle, "bot");
  if (freeSlots.length === 0) return null;

  return {
    type: "PLAY_SUPPORT_CARD",
    playerId: "bot",
    cardInstanceId: cardInstance.instanceId,
    supportSlot: freeSlots[0],
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

/**
 * Scripted tutorial opponent. Returns one action per call, mirroring the
 * getNextBotAction contract; every scripted intent is validated against the
 * current state and silently skipped when impossible.
 */
export function getTutorialBotAction(battle: BattleState): BattleAction | null {
  if (battle.status !== "active") return null;
  if (battle.activePlayer !== "bot") return null;

  const turn = battle.turn;

  if (turn === 1) {
    // Сначала артиллерия на линию поддержки, и только потом обстрел юнита игрока.
    const playArtillery = botPlaySupportCard(battle, "leig_18");
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
