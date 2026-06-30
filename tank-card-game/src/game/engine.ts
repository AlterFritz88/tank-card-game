import { getCard } from "./cards";
import { getHeadquartersAbility, getHeadquartersDefinition } from "./headquarters";
import { getNationalAbility } from "./nationalAbilities";
import type { NationalAbility } from "./nationalAbilities";
import type {
  AttackAction,
  BattleAction,
  BattleState,
  BoardUnit,
  HeadquartersAbility,
  HeadquartersAbilityTracking,
  HeadquartersState,
  Nation,
  PlayerId,
  Position,
  SupportSlot,
  TankCard,
  TankClass,
} from "./types";

const STEP_TIME_MS = 60 * 1000;
const STARTING_HAND_SIZE = 4;
const SECOND_PLAYER_EXTRA_STARTING_CARDS = 1;

export const SUPPORT_SLOTS: SupportSlot[] = [0, 1, 2, 3];

// Spawn cells are now the three battlefield cells directly in front of the
// headquarters — the player's front column (col 0) and the bot's front column
// (col 4). The headquarters itself sits in the rear, one cell further out (see
// createHeadquarters / PLAYER_HQ_POSITION).
export const PLAYER_SPAWN_CELLS: Position[] = [
  { row: 0, col: 0 },
  { row: 1, col: 0 },
  { row: 2, col: 0 },
];

export const BOT_SPAWN_CELLS: Position[] = [
  { row: 0, col: 4 },
  { row: 1, col: 4 },
  { row: 2, col: 4 },
];

// The headquarters lives off the battlefield in the central rear cell, one
// column behind its own spawn column. Chebyshev distance keeps every front-row
// spawn cell adjacent to it, so a unit that breaks through to the enemy front
// column can still melee the enemy headquarters.
export const PLAYER_HQ_POSITION: Position = { row: 1, col: -1 };
export const BOT_HQ_POSITION: Position = { row: 1, col: 5 };

/** The battlefield's front column for a side — the column of its spawn cells. */
export function getFrontColumn(playerId: PlayerId): number {
  return playerId === "player" ? 0 : 4;
}

// Виртуальный ряд тыловой ячейки в «тыловой» колонке штаба (см. PLAYER/BOT_HQ_
// POSITION). Полоса тыла читается сверху вниз: слот0, слот1, штаб (ряд 1),
// слот2, слот3 — поэтому слоты ложатся на ряды −1, 0, 2, 3. Это даёт каждой
// тыловой ячейке собственную позицию, чтобы атаковать тыл можно было только по
// соседству/дальности — как обычные клетки поля боя.
const SUPPORT_SLOT_ROW: Record<SupportSlot, number> = {
  0: -1,
  1: 0,
  2: 2,
  3: 3,
};

export function getSupportSlotPosition(
  playerId: PlayerId,
  supportSlot: SupportSlot
): Position {
  const col =
    playerId === "player" ? PLAYER_HQ_POSITION.col : BOT_HQ_POSITION.col;

  return { row: SUPPORT_SLOT_ROW[supportSlot], col };
}

/** The four corner cells of the 3×5 battlefield (see «Огневая позиция»). */
export const BOARD_CORNER_CELLS: Position[] = [
  { row: 0, col: 0 },
  { row: 0, col: 4 },
  { row: 2, col: 0 },
  { row: 2, col: 4 },
];

function cloneState(state: BattleState): BattleState {
  return structuredClone(state);
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isSpawnCell(playerId: PlayerId, position: Position): boolean {
  const spawnCells =
    playerId === "player" ? PLAYER_SPAWN_CELLS : BOT_SPAWN_CELLS;

  return spawnCells.some((cell) => samePosition(cell, position));
}

function isCornerCell(position: Position): boolean {
  return BOARD_CORNER_CELLS.some((cell) => samePosition(cell, position));
}

/**
 * Whether a cell lies in the opponent's half of the 5-wide battlefield (cols
 * 0–4). The player advances toward higher columns, so its enemy half is cols
 * 3–4; the bot advances toward lower columns, so its enemy half is cols 0–1.
 * The central column (2) is no-man's-land that belongs to neither side. Used by
 * the «Остриё прорыва» headquarters ability to detect a breakthrough.
 */
function isEnemyHalf(playerId: PlayerId, position: Position): boolean {
  return playerId === "player" ? position.col >= 3 : position.col <= 1;
}

function isCellOccupied(state: BattleState, position: Position): boolean {
  const unitOnCell = state.units.some((unit) =>
    isBattlefieldUnit(unit) &&
    samePosition(unit.position, position)
  );

  const playerHq = samePosition(state.headquarters.player.position, position);
  const botHq = samePosition(state.headquarters.bot.position, position);

  return unitOnCell || playerHq || botHq;
}

export function isSupportUnit(unit: BoardUnit): boolean {
  return unit.zone === "support";
}

export function isBattlefieldUnit(unit: BoardUnit): boolean {
  return !isSupportUnit(unit);
}

function isSupportSlotOccupied(
  state: BattleState,
  playerId: PlayerId,
  supportSlot: SupportSlot
): boolean {
  return state.units.some(
    (unit) =>
      unit.ownerId === playerId &&
      isSupportUnit(unit) &&
      unit.supportSlot === supportSlot
  );
}

function getOpponent(playerId: PlayerId): PlayerId {
  return playerId === "player" ? "bot" : "player";
}

function getPlayerLabel(playerId: PlayerId): string {
  return playerId === "player" ? "Игрок" : "Бот";
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function rowDiff(a: Position, b: Position): number {
  return Math.abs(a.row - b.row);
}

function colDiff(a: Position, b: Position): number {
  return Math.abs(a.col - b.col);
}

function isDiagonalMove(from: Position, to: Position): boolean {
  return rowDiff(from, to) === 1 && colDiff(from, to) === 1;
}

function isStraightMove(from: Position, to: Position): boolean {
  return (
    (rowDiff(from, to) > 0 && colDiff(from, to) === 0) ||
    (rowDiff(from, to) === 0 && colDiff(from, to) > 0)
  );
}

function isAdjacentAnyDirection(from: Position, to: Position): boolean {
  return chebyshevDistance(from, to) === 1;
}

function getIntermediateCell(from: Position, to: Position): Position | null {
  const manhattan = manhattanDistance(from, to);
  if (manhattan !== 2) return null;

  if (!isStraightMove(from, to)) return null;

  const dRow = Math.sign(to.row - from.row);
  const dCol = Math.sign(to.col - from.col);

  return {
    row: from.row + dRow,
    col: from.col + dCol,
  };
}

function isPathClear(state: BattleState, from: Position, to: Position): boolean {
  const intermediate = getIntermediateCell(from, to);
  if (!intermediate) return true;

  return !isCellOccupied(state, intermediate);
}

function addLog(state: BattleState, message: string) {
  state.log = [message, ...state.log].slice(0, 12);
}

function ensureBattleStats(state: BattleState) {
  state.stats ??= {
    destroyedByPlayer: {
      light: 0,
      medium: 0,
      heavy: 0,
      td: 0,
      spg: 0,
      armored_car: 0,
      support: 0,
    },
    destroyedByBot: {
      light: 0,
      medium: 0,
      heavy: 0,
      td: 0,
      spg: 0,
      armored_car: 0,
      support: 0,
    },
    actionsByPlayer: 0,
    actionsByBot: 0,
  };

  state.stats.destroyedByPlayer.support ??= 0;
  state.stats.destroyedByBot.support ??= 0;
  state.stats.destroyedByPlayer.armored_car ??= 0;
  state.stats.destroyedByBot.armored_car ??= 0;
  state.stats.actionsByPlayer ??= 0;
  state.stats.actionsByBot ??= 0;
}

function recordDestroyedUnit(
  state: BattleState,
  destroyedBy: PlayerId,
  unit: BoardUnit
) {
  ensureBattleStats(state);

  const card = getCard(unit.cardId);
  const stats =
    destroyedBy === "player"
      ? state.stats.destroyedByPlayer
      : state.stats.destroyedByBot;

  const statKey = isSupportUnit(unit) ? "support" : card.class;

  stats[statKey] += 1;
}

function getAbility(
  state: BattleState,
  playerId: PlayerId
): HeadquartersAbility | null {
  return getHeadquartersAbility(state[playerId].headquartersId);
}

/** Nation of a side, taken from its headquarters definition. */
function getPlayerNation(state: BattleState, playerId: PlayerId): Nation {
  const headquartersId =
    state.headquarters[playerId]?.headquartersId ?? state[playerId].headquartersId;

  return getHeadquartersDefinition(headquartersId).nation;
}

/** National ability (общая для всех штабов нации) for a side, if any. */
export function getNationalAbilityForPlayer(
  state: BattleState,
  playerId: PlayerId
): NationalAbility | null {
  return getNationalAbility(getPlayerNation(state, playerId));
}

const BOARD_COLUMNS = [0, 1, 2, 3, 4] as const;

/**
 * «Сплочение» (СССР): instanceIds of a side's battlefield units that share a
 * fully-occupied vertical line — a column holding all three of the side's units
 * (rows 0–2). Each such unit gains the national defensive bonus.
 *
 * Only a single cohesion line can be active at a time: if several columns are
 * fully occupied, the bonus is granted only to the line closest to the enemy
 * headquarters (the most advanced column in the side's direction of attack).
 */
export function getCohesionUnitIds(
  state: BattleState,
  playerId: PlayerId
): Set<string> {
  const ids = new Set<string>();

  if (getNationalAbilityForPlayer(state, playerId)?.id !== "cohesion") {
    return ids;
  }

  // The side attacks toward the enemy HQ: the player advances to higher columns,
  // the bot to lower ones. Scan columns from the most-advanced one first so the
  // first fully-occupied line we find is the one closest to the enemy HQ.
  const columnsByAdvance =
    playerId === "player"
      ? [...BOARD_COLUMNS].sort((a, b) => b - a)
      : [...BOARD_COLUMNS].sort((a, b) => a - b);

  for (const col of columnsByAdvance) {
    const columnUnits = state.units.filter(
      (unit) =>
        unit.ownerId === playerId &&
        isBattlefieldUnit(unit) &&
        unit.currentHp > 0 &&
        unit.position.col === col
    );

    if (columnUnits.length >= 3) {
      for (const unit of columnUnits) ids.add(unit.instanceId);
      // Only the most advanced line counts — stop at the first one found.
      break;
    }
  }

  return ids;
}

/** «Сплочение» defensive bonus (−урон) currently applied to a unit. */
function getCohesionDefenseBonus(state: BattleState, unit: BoardUnit): number {
  const ability = getNationalAbilityForPlayer(state, unit.ownerId);

  if (ability?.id !== "cohesion") return 0;
  if (!isBattlefieldUnit(unit)) return 0;

  return getCohesionUnitIds(state, unit.ownerId).has(unit.instanceId)
    ? ability.bonus
    : 0;
}

/**
 * «Линия снабжения» (США): instanceIds of a side's battlefield units forming a
 * horizontal line of three in consecutive columns of one row, whose rear edge
 * abuts the front (spawn) column AND is fed by a rear support unit standing
 * directly behind that rear edge. Each such unit gains the national health bonus.
 *
 * The supply must flow without a break: a support unit feeds the line only if it
 * sits in a rear-strip cell adjacent to the line's rear-most unit (the one in the
 * front column). If the support unit is off to the side — leaving an empty cell
 * between it and the line — the chain is broken and no bonus is granted.
 */
export function getSupplyLineUnitIds(
  state: BattleState,
  playerId: PlayerId
): Set<string> {
  const ids = new Set<string>();

  if (getNationalAbilityForPlayer(state, playerId)?.id !== "supply_line") {
    return ids;
  }

  // Living supply sources, resolved to their actual rear-strip cell positions
  // (support units share the HQ position, so the real cell comes from the slot).
  const supplyCells = state.units
    .filter(
      (unit) =>
        unit.ownerId === playerId &&
        isSupportUnit(unit) &&
        unit.currentHp > 0 &&
        unit.supportSlot !== undefined
    )
    .map((unit) => getSupportSlotPosition(playerId, unit.supportSlot!));

  if (supplyCells.length === 0) return ids;

  // The line must reach back to the rear: its rear-most cell sits in the side's
  // front (spawn) column, so supply can flow from the rear into the formation.
  const frontColumn = getFrontColumn(playerId);

  for (const row of [0, 1, 2]) {
    const rowUnits = state.units.filter(
      (unit) =>
        unit.ownerId === playerId &&
        isBattlefieldUnit(unit) &&
        unit.currentHp > 0 &&
        unit.position.row === row
    );

    if (rowUnits.length < 3) continue;

    const occupiedCols = new Set(rowUnits.map((unit) => unit.position.col));

    // Find a run of three consecutive occupied columns that abuts the front
    // column — the only run whose rear edge can be fed by the rear/spawn area.
    for (let startCol = 0; startCol <= 2; startCol += 1) {
      const touchesRear =
        startCol <= frontColumn && frontColumn <= startCol + 2;

      if (
        !touchesRear ||
        !occupiedCols.has(startCol) ||
        !occupiedCols.has(startCol + 1) ||
        !occupiedCols.has(startCol + 2)
      ) {
        continue;
      }

      // Supply enters through the line's rear-most cell (in the front column).
      // A support unit feeds the line only if it stands in an adjacent rear cell;
      // otherwise the supply chain is broken and the formation gets no bonus.
      const rearCell: Position = { row, col: frontColumn };
      const isFed = supplyCells.some((cell) =>
        isAdjacentAnyDirection(cell, rearCell)
      );

      if (!isFed) continue;

      for (const unit of rowUnits) {
        if (unit.position.col >= startCol && unit.position.col <= startCol + 2) {
          ids.add(unit.instanceId);
        }
      }
    }
  }

  return ids;
}

/**
 * Keeps every unit's «Линия снабжения» health bonus in sync with the live
 * formation, mirroring {@link applyCornerHpBonus}: entering the line raises the
 * unit's current (and effective max) HP by the national bonus, leaving it lowers
 * the HP again, never below 1. Idempotent — safe to call after any board change.
 */
function syncSupplyLineHpBonus(state: BattleState) {
  const buffedByOwner: Record<PlayerId, Set<string>> = {
    player: getSupplyLineUnitIds(state, "player"),
    bot: getSupplyLineUnitIds(state, "bot"),
  };
  const bonusByOwner: Record<PlayerId, number> = {
    player: getNationalAbilityForPlayer(state, "player")?.bonus ?? 0,
    bot: getNationalAbilityForPlayer(state, "bot")?.bonus ?? 0,
  };

  for (const unit of state.units) {
    if (!isBattlefieldUnit(unit)) continue;

    const desired = buffedByOwner[unit.ownerId].has(unit.instanceId)
      ? bonusByOwner[unit.ownerId]
      : 0;
    const applied = unit.supplyHpApplied ?? 0;

    if (desired === applied) continue;

    const delta = desired - applied;
    unit.currentHp =
      delta > 0 ? unit.currentHp + delta : Math.max(1, unit.currentHp + delta);
    unit.supplyHpApplied = desired;
  }
}

export type NationalCombination = {
  ownerId: PlayerId;
  abilityId: NationalAbility["id"];
  orientation: "vertical" | "horizontal";
  unitIds: string[];
};

/**
 * Active battlefield formations that currently trigger a national ability — used
 * by the UI to paint the shimmering link between the units in a combination.
 */
export function getActiveCombinations(
  state: BattleState
): NationalCombination[] {
  const combinations: NationalCombination[] = [];

  for (const ownerId of ["player", "bot"] as const) {
    const ability = getNationalAbilityForPlayer(state, ownerId);
    if (!ability) continue;

    if (ability.id === "cohesion") {
      const ids = getCohesionUnitIds(state, ownerId);
      if (ids.size > 0) {
        combinations.push({
          ownerId,
          abilityId: ability.id,
          orientation: "vertical",
          unitIds: [...ids],
        });
      }
    }

    if (ability.id === "supply_line") {
      const ids = getSupplyLineUnitIds(state, ownerId);
      if (ids.size > 0) {
        combinations.push({
          ownerId,
          abilityId: ability.id,
          orientation: "horizontal",
          unitIds: [...ids],
        });
      }
    }
  }

  return combinations;
}

/**
 * «Сплочение» defensive reduction exposed for the UI's stat-change animation
 * (the diff that flashes the shield indicator when a unit joins/leaves a line).
 */
export function getNationalDefenseBonus(
  state: BattleState,
  unit: BoardUnit
): number {
  return getCohesionDefenseBonus(state, unit);
}

function getAbilityTracking(
  state: BattleState,
  playerId: PlayerId
): HeadquartersAbilityTracking {
  const player = state[playerId];

  if (!player.abilityTracking) {
    player.abilityTracking = {
      unitsPlayedThisTurn: 0,
      tanksPlayedThisTurn: 0,
      lightUnitsPlayedThisTurn: 0,
      destroyedUnitReturnedThisBattle: false,
    };
  }

  return player.abilityTracking;
}

function resetAbilityTurnCounters(state: BattleState, playerId: PlayerId) {
  const tracking = getAbilityTracking(state, playerId);

  tracking.unitsPlayedThisTurn = 0;
  tracking.tanksPlayedThisTurn = 0;
  tracking.lightUnitsPlayedThisTurn = 0;
}

/**
 * Effective fuel cost of playing a card, including headquarters ability
 * discounts (e.g. «Моторизованный марш»: the first unit each turn is cheaper).
 * Used by the engine when charging fuel and by the bot AI when planning.
 */
export function getEffectiveCardCost(
  state: BattleState,
  playerId: PlayerId,
  cardId: string
): number {
  const card = getCard(cardId);
  const ability = getAbility(state, playerId);
  const unitsPlayedThisTurn =
    state[playerId].abilityTracking?.unitsPlayedThisTurn ?? 0;
  const discount =
    ability?.firstUnitFuelDiscount && unitsPlayedThisTurn === 0
      ? ability.firstUnitFuelDiscount
      : 0;

  // «Слаженность»: cheaper while a battlefield unit of the required class is present.
  let classDiscount = 0;
  const costMod = card.costModifiers;

  if (costMod) {
    const hasClassOnField = state.units.some(
      (unit) =>
        unit.ownerId === playerId &&
        isBattlefieldUnit(unit) &&
        getCard(unit.cardId).class === costMod.ifClassPresent
    );

    if (hasClassOnField) classDiscount = costMod.discount;
  }

  return Math.max(0, card.cost - discount - classDiscount);
}

function isTankClassCard(card: TankCard): boolean {
  return (
    card.deploymentZone !== "support" &&
    (card.class === "light" || card.class === "medium" || card.class === "heavy")
  );
}

/** A battlefield unit of the armored-car class («бронеавтомобиль»). */
function isArmoredCarUnit(unit: BoardUnit): boolean {
  return isBattlefieldUnit(unit) && getCard(unit.cardId).class === "armored_car";
}

export function calculateFuelGeneration(
  state: BattleState,
  playerId: PlayerId
): number {
  const headquartersFuel = state.headquarters[playerId].fuelGeneration;

  // Топливо генерируют только тыловые (support) юниты и штаб. Юниты на поле боя
  // больше не дают топлива.
  const unitsFuel = state.units
    .filter((unit) => unit.ownerId === playerId)
    .reduce((total, unit) => {
      if (!isSupportUnit(unit)) return total;

      const card = getCard(unit.cardId);
      return total + (card.supportEffects?.fuelPerTurn ?? 0);
    }, 0);

  // Combined Arms: extra fuel while controlling both a tank and a support unit.
  const ability = getAbility(state, playerId);
  let abilityFuel = 0;

  if (ability?.combinedArmsFuelBonus) {
    const ownUnits = state.units.filter((unit) => unit.ownerId === playerId);
    const hasTank = ownUnits.some(
      (unit) => isBattlefieldUnit(unit) && isTankClassCard(getCard(unit.cardId))
    );
    const hasSupport = ownUnits.some((unit) => isSupportUnit(unit));

    if (hasTank && hasSupport) {
      abilityFuel = ability.combinedArmsFuelBonus;
    }
  }

  // «Система» (Германия): full rear line (all four support slots) feeds the HQ.
  let nationalFuel = 0;
  const nationalAbility = getNationalAbilityForPlayer(state, playerId);

  if (nationalAbility?.id === "system") {
    const allRearSlotsOccupied = SUPPORT_SLOTS.every((slot) =>
      isSupportSlotOccupied(state, playerId, slot)
    );

    if (allRearSlotsOccupied) nationalFuel = nationalAbility.bonus;
  }

  return headquartersFuel + unitsFuel + abilityFuel + nationalFuel;
}

function getSupportUnits(state: BattleState, playerId: PlayerId): BoardUnit[] {
  return state.units.filter(
    (unit) => unit.ownerId === playerId && isSupportUnit(unit)
  );
}

/**
 * Unit that screens friendly tanks: redirects the first strike per turn aimed
 * at a protected tank into itself. Supports both battlefield screens
 * (combatAbilities.lightScreen) and rear-line screens (supportEffects).
 */
function findTankScreenUnit(
  state: BattleState,
  target: BoardUnit
): BoardUnit | null {
  const targetCard = getCard(target.cardId);
  if (targetCard.combatAbilities?.lightScreen) return null;

  return (
    state.units.find(
      (unit) => {
        if (
          unit.ownerId !== target.ownerId ||
          unit.instanceId === target.instanceId ||
          unit.currentHp <= 0 ||
          unit.coverFiredThisTurn
        ) {
          return false;
        }

        const screenCard = getCard(unit.cardId);

        if (isBattlefieldUnit(unit)) {
          return (
            targetCard.class === "light" &&
            screenCard.combatAbilities?.lightScreen === true
          );
        }

        if (!isSupportUnit(unit)) return false;

        return Boolean(
          screenCard.supportEffects?.tankScreenClasses?.includes(targetCard.class)
        );
      }
    ) ?? null
  );
}

/** Live anti-tank gun screening this side's support line, if any. */
function getSupportCoverUnit(
  state: BattleState,
  ownerId: PlayerId
): BoardUnit | null {
  return (
    getSupportUnits(state, ownerId).find(
      (unit) =>
        unit.currentHp > 0 &&
        (getCard(unit.cardId).supportEffects?.supportLineCover ?? 0) > 0
    ) ?? null
  );
}

/**
 * A melee attacker is an enemy unit fighting at close quarters — anything that
 * is not the headquarters and not an SPG (whose fire is indirect/ranged). Only
 * melee attackers provoke «Противотанковый заслон» return fire and «Самооборона».
 */
function isMeleeUnitAttacker(
  attacker: NonNullable<ReturnType<typeof getAttacker>>
): attacker is BoardUnit {
  return "cardId" in attacker && getCard(attacker.cardId).class !== "spg";
}

/**
 * «Самооборона»: damage an armed rear unit fires back when a melee unit strikes
 * it directly. Ranged (SPG) and headquarters strikes draw no answer.
 */
function getSupportReturnFire(
  attacker: NonNullable<ReturnType<typeof getAttacker>>,
  target: BoardUnit
): number {
  if (!isSupportUnit(target)) return 0;
  if (!isMeleeUnitAttacker(attacker)) return 0;

  return getCard(target.cardId).supportEffects?.returnFire ?? 0;
}

function applySupportTurnEffects(state: BattleState, playerId: PlayerId) {
  const supportUnits = getSupportUnits(state, playerId);
  const battlefieldUnits = state.units.filter(
    (unit) => unit.ownerId === playerId && isBattlefieldUnit(unit)
  );

  for (const supportUnit of supportUnits) {
    const card = getCard(supportUnit.cardId);
    const effects = card.supportEffects;

    if (!effects) continue;

    if (effects.drawEveryTurns && state.turn % effects.drawEveryTurns === 0) {
      drawCardsWithEmptyDeckPenalty(state, playerId, 1);

      if (state.status !== "active") return;
    }

    if (
      effects.fetchSupportCardEveryTurns &&
      state.turn % effects.fetchSupportCardEveryTurns === 0
    ) {
      const player = state[playerId];
      const supportCardsInDeck = player.deck.filter(
        (item) => getCard(item.cardId).deploymentZone === "support"
      );
      const fetched =
        supportCardsInDeck[
          Math.floor(Math.random() * supportCardsInDeck.length)
        ];

      if (fetched) {
        player.hand.push(fetched);
        player.deck = player.deck.filter(
          (item) => item.instanceId !== fetched.instanceId
        );

        addLog(
          state,
          `${getCard(supportUnit.cardId).name}: ${getCard(fetched.cardId).name} доставлена в руку.`
        );
      }
    }

    if (effects.hqHealPerTurn) {
      state.headquarters[playerId].hp += effects.hqHealPerTurn;
      addLog(
        state,
        `${card.name}: штаб восстанавливает +${effects.hqHealPerTurn} прочности.`
      );
    }

    if (effects.healRandomUnitPerTurn) {
      const damagedUnits = battlefieldUnits.filter((unit) => {
        const unitCard = getCard(unit.cardId);

        return (
          unit.currentHp < unitCard.hp &&
          (!effects.healClass || unitCard.class === effects.healClass)
        );
      });
      const target =
        damagedUnits[Math.floor(Math.random() * damagedUnits.length)];

      if (target) {
        const targetCard = getCard(target.cardId);
        target.currentHp = Math.min(
          targetCard.hp,
          target.currentHp + effects.healRandomUnitPerTurn
        );
      }
    }
  }
}

function applyHeadquartersTurnAbility(state: BattleState, playerId: PlayerId) {
  const ability = getAbility(state, playerId);

  if (!ability) return;

  if (ability.drawEveryTurns && state.turn % ability.drawEveryTurns === 0) {
    const drawnCount = drawCardsWithEmptyDeckPenalty(state, playerId, 1);

    if (drawnCount > 0) {
      addLog(
        state,
        `${ability.name}: ${getPlayerLabel(playerId).toLowerCase()} добирает дополнительную карту.`
      );
    }

    if (state.status !== "active") return;
  }

  if (ability.healRandomUnitPerTurn) {
    const damagedUnits = state.units.filter((unit) => {
      if (unit.ownerId !== playerId || !isBattlefieldUnit(unit)) return false;

      return unit.currentHp < getCard(unit.cardId).hp;
    });
    const target =
      damagedUnits[Math.floor(Math.random() * damagedUnits.length)];

    if (target) {
      const targetCard = getCard(target.cardId);

      target.currentHp = Math.min(
        targetCard.hp,
        target.currentHp + ability.healRandomUnitPerTurn
      );

      addLog(
        state,
        `${ability.name}: ${targetCard.name} восстанавливает ${ability.healRandomUnitPerTurn} прочности.`
      );
    }
  }
}

function spendFuel(
  state: BattleState,
  playerId: PlayerId,
  amount: number,
  actionName: string
): boolean {
  const player = state[playerId];

  if (player.resources < amount) {
    addLog(
      state,
      `${
        playerId === "player" ? "Игроку" : "Боту"
      } не хватает топлива: ${actionName} стоит ${amount}.`
    );

    return false;
  }

  player.resources -= amount;

  return true;
}

function resetStepTimer(state: BattleState, playerId: PlayerId) {
  state.timers[playerId].stepTimeLeftMs = STEP_TIME_MS;
  state.timers[playerId].actedThisStep = false;
}

function markSuccessfulAction(
  state: BattleState,
  playerId: PlayerId,
  // END_TURN / idle passes reset the timer like any acted step but must not
  // count toward the anti-farm action tally — otherwise a player could grind
  // rewards by repeatedly ending the turn without playing.
  countsAsAction = true
) {
  state.timers[playerId].idleStreak = 0;
  resetStepTimer(state, playerId);

  if (countsAsAction) {
    ensureBattleStats(state);
    if (playerId === "player") {
      state.stats.actionsByPlayer += 1;
    } else {
      state.stats.actionsByBot += 1;
    }
  }
}

function setWinnerByLoser(state: BattleState, loserId: PlayerId, reason: string) {
  state.status = loserId === "player" ? "bot_won" : "player_won";

  addLog(
    state,
    loserId === "player"
      ? `Игрок проиграл: ${reason}`
      : `Бот проиграл: ${reason}`
  );
}

function damageHeadquartersFromEmptyDeck(
  state: BattleState,
  playerId: PlayerId
) {
  const headquarters = state.headquarters[playerId];

  headquarters.hp -= 1;

  addLog(
    state,
    `${
      playerId === "player" ? "Игрок" : "Бот"
    } не может добрать карту: колода пуста. Штаб получает 1 урон.`
  );

  if (headquarters.hp <= 0) {
    state.status = playerId === "player" ? "bot_won" : "player_won";

    addLog(
      state,
      playerId === "player"
        ? "Штаб игрока уничтожен. Бот победил."
        : "Штаб бота уничтожен. Игрок победил."
    );
  }
}

function drawOneCardWithoutPenalty(state: BattleState, playerId: PlayerId) {
  const player = state[playerId];
  const drawnCard = player.deck[0];

  if (!drawnCard) {
    return false;
  }

  player.hand.push(drawnCard);
  player.deck = player.deck.slice(1);

  return true;
}

function drawCardsWithoutPenalty(
  state: BattleState,
  playerId: PlayerId,
  count: number
) {
  let drawnCount = 0;

  for (let index = 0; index < count; index += 1) {
    const drawn = drawOneCardWithoutPenalty(state, playerId);

    if (!drawn) break;

    drawnCount += 1;
  }

  return drawnCount;
}

function drawCardsWithEmptyDeckPenalty(
  state: BattleState,
  playerId: PlayerId,
  count: number
) {
  let drawnCount = 0;

  for (let index = 0; index < count; index += 1) {
    if (drawOneCardWithoutPenalty(state, playerId)) {
      drawnCount += 1;
      continue;
    }

    damageHeadquartersFromEmptyDeck(state, playerId);

    if (state.status !== "active") break;
  }

  return drawnCount;
}

function beginBattle(
  state: BattleState,
  action: Extract<BattleAction, { type: "BEGIN_BATTLE" }>
) {
  if (state.status !== "starting") return;

  const startingPlayer = action.startingPlayer;
  const secondPlayer = getOpponent(startingPlayer);

  state.status = "active";
  state.activePlayer = startingPlayer;
  state.turn = 1;

  for (const owner of ["player", "bot"] as const) {
    const generatedFuel = calculateFuelGeneration(state, owner);

    state[owner].maxResources = generatedFuel;
    state[owner].resources = generatedFuel;

    resetStepTimer(state, owner);
    state.timers[owner].idleStreak = 0;
    state.timers[owner].actedThisStep = false;

    state.headquarters[owner].alreadyAttacked = false;

    resetAbilityTurnCounters(state, owner);
    getAbilityTracking(state, owner).destroyedUnitReturnedThisBattle = false;
  }

  for (const unit of state.units) {
    unit.alreadyAttacked = isSupportUnit(unit);
    unit.alreadyMoved = isSupportUnit(unit);
    unit.spawnedThisTurn = false;
    unit.deployedThisTurn = false;
    unit.moveCountThisTurn = 0;
    unit.attackCountThisTurn = 0;
    unit.tdAmbushUsedThisTurn = false;
    unit.coverFiredThisTurn = false;
    unit.drawWhenAttackedUsedThisTurn = false;
    unit.breakthroughMoveUsed = false;
  }

  // Scripted missions can pin both opening hands to a fixed size (no
  // second-player bonus); otherwise the default hand + second-player bonus apply.
  const scriptedHandSize = state.startingHandSize;

  const startingPlayerDrawnCards = drawCardsWithoutPenalty(
    state,
    startingPlayer,
    scriptedHandSize ?? STARTING_HAND_SIZE
  );

  const secondPlayerDrawnCards = drawCardsWithoutPenalty(
    state,
    secondPlayer,
    scriptedHandSize ?? (STARTING_HAND_SIZE + SECOND_PLAYER_EXTRA_STARTING_CARDS)
  );

  addLog(
    state,
    `Первым ходит ${startingPlayer === "player" ? "игрок" : "бот"}.`
  );

  addLog(
    state,
    `${
      startingPlayer === "player" ? "Игрок" : "Бот"
    } получает стартовую руку: ${startingPlayerDrawnCards} карты.`
  );

  addLog(
    state,
    `${
      secondPlayer === "player" ? "Игрок" : "Бот"
    } получает стартовую руку и бонус за второй ход: ${secondPlayerDrawnCards} карты.`
  );
}

function startTurn(state: BattleState, playerId: PlayerId) {
  const player = state[playerId];

  const generatedFuel = calculateFuelGeneration(state, playerId);

  player.maxResources = generatedFuel;
  player.resources = generatedFuel;

  resetStepTimer(state, playerId);

  addLog(
    state,
    `${
      playerId === "player" ? "Игрок" : "Бот"
    } получает ${generatedFuel} топлива.`
  );

  const drawnCard = player.deck[0];

  if (drawnCard) {
    player.hand.push(drawnCard);
    player.deck = player.deck.slice(1);

    addLog(state, `${playerId === "player" ? "Игрок" : "Бот"} добирает карту.`);
  } else {
    damageHeadquartersFromEmptyDeck(state, playerId);

    if (state.status !== "active") {
      return;
    }
  }

  applySupportTurnEffects(state, playerId);

  if (state.status !== "active") {
    return;
  }

  applyHeadquartersTurnAbility(state, playerId);

  if (state.status !== "active") {
    return;
  }

  resetAbilityTurnCounters(state, playerId);

  for (const unit of state.units) {
    unit.tdAmbushUsedThisTurn = false;
    unit.coverFiredThisTurn = false;
    unit.drawWhenAttackedUsedThisTurn = false;

    if (unit.ownerId === playerId) {
      // Arm «Танковая засада» only after a full player turn spent stationary:
      // the just-finished turn had no movement and the unit was not deployed
      // during it. Read these flags before they are reset below.
      unit.wasStationaryLastTurn =
        unit.moveCountThisTurn === 0 && !unit.deployedThisTurn;

      unit.alreadyAttacked = isSupportUnit(unit);
      unit.alreadyMoved = isSupportUnit(unit);
      unit.spawnedThisTurn = false;
      unit.deployedThisTurn = false;
      unit.moveCountThisTurn = 0;
      unit.attackCountThisTurn = 0;
      unit.breakthroughMoveUsed = false;
    }
  }

  state.headquarters[playerId].alreadyAttacked = false;
}

/**
 * «Огневой налёт»: a freshly deployed unit shells enemy battlefield units —
 * either one random target or every enemy unit of the listed classes. Still
 * hidden «Маскировка» units are skipped (this is indirect fire, not melee).
 */
function applyDeployDamage(
  state: BattleState,
  ownerId: PlayerId,
  sourceCard: TankCard,
  deployDamage: NonNullable<
    NonNullable<TankCard["onPlayEffects"]>["deployDamage"]
  >
) {
  const opponent = getOpponent(ownerId);

  let targets: BoardUnit[];

  if (deployDamage.scope === "rear") {
    // Strike one random enemy rear-line (support) unit.
    const rear = state.units.filter(
      (unit) =>
        unit.ownerId === opponent &&
        isSupportUnit(unit) &&
        unit.currentHp > 0
    );
    const target = rear[Math.floor(Math.random() * rear.length)];
    targets = target ? [target] : [];
  } else {
    const candidates = state.units.filter((unit) => {
      if (unit.ownerId !== opponent || !isBattlefieldUnit(unit)) return false;
      if (unit.currentHp <= 0) return false;

      const unitCard = getCard(unit.cardId);
      return !(unitCard.combatAbilities?.camouflage && !unit.revealed);
    });

    if (deployDamage.scope === "classes") {
      const classes = deployDamage.classes ?? [];
      targets = candidates.filter((unit) =>
        classes.includes(getCard(unit.cardId).class)
      );
    } else {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      targets = target ? [target] : [];
    }
  }

  for (const target of targets) {
    applyDeployStrike(state, ownerId, sourceCard, target, deployDamage.amount);
  }
}

/**
 * A single «Огневой налёт» shot, resolved exactly like indirect САУ fire: it can
 * be intercepted by an anti-tank support screen («Противотанковый заслон») or a
 * tank screen, and is softened by the target's armour (спецброня, защита
 * плацдарма, стальной клин, сплочение, оборонительные ауры) — but NOT by
 * «Лобовая броня», whose plate the arcing shell flies over. Being ranged fire,
 * it never draws return fire or a counterattack.
 */
function applyDeployStrike(
  state: BattleState,
  ownerId: PlayerId,
  sourceCard: TankCard,
  initialTarget: BoardUnit,
  amount: number
) {
  let target = initialTarget;

  if (isSupportUnit(target)) {
    // Ranged fire on the rear line hits the anti-tank screen first.
    const coverUnit = getSupportCoverUnit(state, target.ownerId);

    if (coverUnit && coverUnit.instanceId !== target.instanceId) {
      addLog(
        state,
        `${getCard(coverUnit.cardId).name} принимает дистанционный удар на себя.`
      );
      target = coverUnit;
    }
  } else if (isBattlefieldUnit(target)) {
    // A tank screen redirects the first strike aimed at a protected tank.
    const screen = findTankScreenUnit(state, target);

    if (screen) {
      screen.coverFiredThisTurn = true;

      addLog(
        state,
        `${getCard(screen.cardId).name} принимает удар по ${
          getCard(target.cardId).name
        } на себя.`
      );

      target = screen;
    }
  }

  // Defensive soak a САУ shot would face. «Лобовая броня» is intentionally
  // excluded: indirect fire ignores the frontal plate.
  const reduction =
    getStationaryTankDefenseBonus(state, target) +
    getTankDefenseAuraBonus(state, target) +
    getSpawnDamageReduction(target) +
    getArmorVsClassReduction(target, sourceCard.class) +
    getHeavyArmorReduction(state, target) +
    getCohesionDefenseBonus(state, target);

  const damage = Math.max(0, amount - reduction);
  target.currentHp -= damage;

  addLog(
    state,
    `${sourceCard.name}: огневой налёт — ${
      getCard(target.cardId).name
    } получает ${damage} урона.`
  );

  if (target.currentHp <= 0) {
    destroyUnit(state, target, "уничтожен огневым налётом.", ownerId);
  }
}

/**
 * «Пополнение»: a freshly deployed unit pulls a matching card out of the
 * owner's deck and into hand. A deck card qualifies if it satisfies any of the
 * listed criteria (name prefix, unit class, or support role). One random match
 * is moved; if the deck holds none, nothing happens.
 */
function applyFetchToHand(
  state: BattleState,
  ownerId: PlayerId,
  sourceCard: TankCard,
  fetch: NonNullable<
    NonNullable<TankCard["onPlayEffects"]>["fetchToHand"]
  >
) {
  const player = state[ownerId];
  const { match } = fetch;
  const fetchLabel = fetch.label ? ` (${fetch.label})` : "";

  const candidates = player.deck.filter((instance) => {
    const card = getCard(instance.cardId);

    if (match.namePrefixes?.some((prefix) => card.name.startsWith(prefix))) {
      return true;
    }
    if (match.classes?.includes(card.class)) return true;
    if (
      card.supportRole &&
      match.supportRoles?.includes(card.supportRole)
    ) {
      return true;
    }
    return false;
  });

  if (candidates.length === 0) {
    addLog(
      state,
      `${sourceCard.name}: пополнение${fetchLabel} — подходящих карт в колоде нет.`
    );
    return;
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  player.deck = player.deck.filter(
    (instance) => instance.instanceId !== chosen.instanceId
  );
  player.hand.push(chosen);

  addLog(
    state,
    `${sourceCard.name}: пополнение — ${
      getCard(chosen.cardId).name
    } добавлен в руку.`
  );
}

function playCard(
  state: BattleState,
  action: Extract<BattleAction, { type: "PLAY_CARD" }>
) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;
  if (!isSpawnCell(action.playerId, action.position)) return;
  if (isCellOccupied(state, action.position)) return;

  const player = state[action.playerId];

  const cardInHand = player.hand.find(
    (card) => card.instanceId === action.cardInstanceId
  );

  if (!cardInHand) return;

  const card = getCard(cardInHand.cardId);
  if (card.deploymentZone === "support") return;

  const ability = getAbility(state, action.playerId);
  const tracking = getAbilityTracking(state, action.playerId);

  // Motorized march: the first unit played each turn costs less fuel.
  const fuelCost = getEffectiveCardCost(state, action.playerId, card.id);
  const fuelDiscount = card.cost - fuelCost;

  if (!spendFuel(state, action.playerId, fuelCost, "размещение юнита")) {
    return;
  }

  player.hand = player.hand.filter(
    (item) => item.instanceId !== action.cardInstanceId
  );

  const isLightTank = card.class === "light";

  // Headquarters abilities can grant blitz on top of the card's own ability.
  const abilityBlitz =
    (ability?.firstTankBlitz === true &&
      tracking.tanksPlayedThisTurn === 0 &&
      isTankClassCard(card)) ||
    (ability?.lightUnitsBlitz === true && isLightTank);

  // Every freshly deployed unit may move and attack on the turn it enters,
  // following its class rules — exactly as if its turn had just begun. «Блиц»
  // no longer affects deployment; it grants a second move action each turn.
  const unit: BoardUnit = {
    instanceId: action.cardInstanceId,
    cardId: card.id,
    ownerId: action.playerId,
    position: action.position,
    zone: "battlefield",
    currentHp: card.hp,

    alreadyAttacked: false,
    alreadyMoved: false,
    spawnedThisTurn: false,
    deployedThisTurn: true,
    moveCountThisTurn: 0,
    tdAmbushUsedThisTurn: false,
    blitzGranted: abilityBlitz,
  };

  state.units.push(unit);

  // Apply on-play effects (new mechanics for low-stat units)
  if (card.onPlayEffects) {
    const effects = card.onPlayEffects;
    const owner = action.playerId;

    // Card draw
    if (effects.draw && effects.draw > 0) {
      const drawnCount = drawCardsWithEmptyDeckPenalty(
        state,
        owner,
        effects.draw
      );

      if (drawnCount > 0) {
        addLog(state, `${owner === "player" ? "Игрок" : "Бот"} добирает карту (Разведка).`);
      }

      if (state.status !== "active") return;
    }

    // HQ protection reinforces the headquarters immediately.
    if (effects.hqProtection && effects.hqProtection > 0) {
      const hq = state.headquarters[owner];
      hq.hp += effects.hqProtection;
      addLog(state, `${owner === "player" ? "Игрок" : "Бот"} укрепляет штаб на +${effects.hqProtection}.`);
    }

    // «Контрбатарейный огонь»: silence the enemy headquarters and SPGs.
    if (effects.suppressEnemyIndirect) {
      const opponent = getOpponent(owner);

      state.headquarters[opponent].attackSuppressed = true;

      for (const enemyUnit of state.units) {
        if (
          enemyUnit.ownerId === opponent &&
          isBattlefieldUnit(enemyUnit) &&
          getCard(enemyUnit.cardId).class === "spg"
        ) {
          enemyUnit.attackSuppressed = true;
        }
      }

      addLog(
        state,
        `${card.name}: контрбатарейный огонь — САУ и штаб противника не могут атаковать.`
      );
    }

    // «Огневой налёт»: deal damage to enemy battlefield units on deploy.
    if (effects.deployDamage && effects.deployDamage.amount > 0) {
      applyDeployDamage(state, owner, card, effects.deployDamage);
    }

    // «Пополнение»: pull a matching card from the deck into hand.
    if (effects.fetchToHand) {
      applyFetchToHand(state, owner, card, effects.fetchToHand);
    }
  }

  // Armored escort: the first light unit each turn reinforces the headquarters.
  if (
    ability?.firstLightUnitHqProtection &&
    isLightTank &&
    tracking.lightUnitsPlayedThisTurn === 0
  ) {
    state.headquarters[action.playerId].hp += ability.firstLightUnitHqProtection;

    addLog(
      state,
      `${ability.name}: штаб укреплён на +${ability.firstLightUnitHqProtection}.`
    );
  }

  if (fuelDiscount > 0) {
    addLog(state, `${ability?.name}: скидка ${fuelDiscount} топлива.`);
  }

  if (abilityBlitz && card.combatAbilities?.blitz !== true) {
    addLog(state, `${ability?.name}: ${card.name} получает «Блиц».`);
  }

  tracking.unitsPlayedThisTurn += 1;
  if (isTankClassCard(card)) tracking.tanksPlayedThisTurn += 1;
  if (isLightTank) tracking.lightUnitsPlayedThisTurn += 1;

  // A new unit may have landed next to a hidden camouflaged unit (either side).
  revealCamouflagedNearEnemies(state);

  markSuccessfulAction(state, action.playerId);

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} размещает ${
      card.name
    } за ${fuelCost} топлива на [${action.position.row},${
      action.position.col
    }].`
  );
}

function playSupportCard(
  state: BattleState,
  action: Extract<BattleAction, { type: "PLAY_SUPPORT_CARD" }>
) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;
  if (!SUPPORT_SLOTS.includes(action.supportSlot)) return;
  if (isSupportSlotOccupied(state, action.playerId, action.supportSlot)) return;

  const player = state[action.playerId];
  const cardInHand = player.hand.find(
    (card) => card.instanceId === action.cardInstanceId
  );

  if (!cardInHand) return;

  const card = getCard(cardInHand.cardId);

  if (card.deploymentZone !== "support" || !card.supportRole) return;

  const ability = getAbility(state, action.playerId);
  const tracking = getAbilityTracking(state, action.playerId);
  const fuelCost = getEffectiveCardCost(state, action.playerId, card.id);
  const fuelDiscount = card.cost - fuelCost;

  if (!spendFuel(state, action.playerId, fuelCost, "support deployment")) {
    return;
  }

  if (fuelDiscount > 0) {
    addLog(state, `${ability?.name}: скидка ${fuelDiscount} топлива.`);
  }

  tracking.unitsPlayedThisTurn += 1;

  player.hand = player.hand.filter(
    (item) => item.instanceId !== action.cardInstanceId
  );

  state.units.push({
    instanceId: action.cardInstanceId,
    cardId: card.id,
    ownerId: action.playerId,
    position: state.headquarters[action.playerId].position,
    zone: "support",
    supportSlot: action.supportSlot,
    currentHp: card.hp,
    alreadyAttacked: true,
    alreadyMoved: true,
    spawnedThisTurn: true,
    moveCountThisTurn: 0,
    tdAmbushUsedThisTurn: false,
  });

  // «Пополнение»: support units can also fetch a card into hand on deploy.
  if (card.onPlayEffects?.fetchToHand) {
    applyFetchToHand(state, action.playerId, card, card.onPlayEffects.fetchToHand);
  }

  // «Огневой налёт»: a support gun can shell enemy units on deploy.
  if (card.onPlayEffects?.deployDamage && card.onPlayEffects.deployDamage.amount > 0) {
    applyDeployDamage(state, action.playerId, card, card.onPlayEffects.deployDamage);
  }

  markSuccessfulAction(state, action.playerId);
}

function getAttacker(state: BattleState, action: AttackAction) {
  if (action.attackerType === "headquarters") {
    return state.headquarters[action.playerId];
  }

  return state.units.find((unit) => unit.instanceId === action.attackerId);
}

function getTarget(state: BattleState, action: AttackAction) {
  if (action.targetType === "headquarters") {
    const opponent = getOpponent(action.playerId);
    return state.headquarters[opponent];
  }

  return state.units.find((unit) => unit.instanceId === action.targetId);
}

function getAttackValue(
  state: BattleState,
  attacker: ReturnType<typeof getAttacker>
): number {
  if (!attacker) return 0;

  if ("cardId" in attacker) {
    return getUnitAttackValue(state, attacker);
  }

  return getHeadquartersAttackValue(state, attacker.ownerId);
}

/**
 * Effective firepower of a battlefield unit, accounting for «Корректировщик»
 * (attack equals the owner's headquarters attack) and «Огневая позиция» (an SPG
 * standing on a board corner fires harder). Support units keep their printed
 * attack (they never strike anyway).
 */
export function getUnitAttackValue(state: BattleState, unit: BoardUnit): number {
  const card = getCard(unit.cardId);

  let attack = card.combatAbilities?.attackEqualsHq
    ? getHeadquartersAttackValue(state, unit.ownerId)
    : card.attack;

  if (
    card.class === "spg" &&
    isBattlefieldUnit(unit) &&
    isCornerCell(unit.position)
  ) {
    attack += card.combatAbilities?.cornerBonus?.attack ?? 0;
  }

  attack += getHqProximityBonus(state, unit);

  return Math.max(0, attack);
}

/**
 * Effective firepower as shown on the battlefield: `getUnitAttackValue` plus the
 * owner-ability self-buffs that apply regardless of the target — «Танковая
 * засада» (stationary tank bonus) and armored momentum (moved tank bonus). These
 * bonuses are added separately during combat (`getUnitCombatBonuses`), so this
 * MUST be used for display only and never to compute damage, or the bonus would
 * be counted twice.
 */
export function getUnitDisplayAttackValue(
  state: BattleState,
  unit: BoardUnit
): number {
  return (
    getUnitAttackValue(state, unit) +
    getStationaryTankAttackBonus(state, unit) +
    getMovedTankAttackBonus(state, unit)
  );
}

/**
 * «Огневой вал»: an SPG keeps its printed attack on its own spawn column and
 * gains the listed firepower for every column it advances toward the enemy HQ.
 */
function getHqProximityBonus(_state: BattleState, unit: BoardUnit): number {
  const proximity = getCard(unit.cardId).combatAbilities?.hqProximityBonus;

  if (!proximity) return 0;
  if (!isBattlefieldUnit(unit)) return 0;

  const spawnColumn = getFrontColumn(unit.ownerId);
  const stepsTowardEnemy =
    unit.ownerId === "player"
      ? unit.position.col - spawnColumn
      : spawnColumn - unit.position.col;

  return Math.max(0, stepsTowardEnemy) * proximity.maxBonus;
}

/**
 * «Оборона плацдарма»: a battlefield unit standing on one of its own spawn
 * cells soaks part of every incoming strike (from units and the headquarters).
 */
function getSpawnDamageReduction(unit: BoardUnit): number {
  if (!isBattlefieldUnit(unit)) return 0;

  const reduction = getCard(unit.cardId).combatAbilities?.spawnDamageReduction ?? 0;
  if (reduction <= 0) return 0;

  return isSpawnCell(unit.ownerId, unit.position) ? reduction : 0;
}

/**
 * «Спецброня»: a unit takes less damage from attackers of a specific class.
 * The headquarters has no class, so its fire is never reduced by this.
 */
function getArmorVsClassReduction(
  unit: BoardUnit,
  attackerClass: TankClass | null
): number {
  if (!attackerClass) return 0;

  const armor = getCard(unit.cardId).combatAbilities?.armorVsClass;
  if (!armor) return 0;

  return armor.class === attackerClass ? armor.amount : 0;
}

/**
 * «Лобовая броня»: a unit soaks part of a strike that comes from the single
 * cell directly in front of it — the direction of the enemy headquarters. The
 * player sits on the left (low columns) facing the bot's HQ on the right, so a
 * player unit's front is toward higher columns and a bot unit's front toward
 * lower columns. Only a straight-ahead strike (same row, in the front column
 * direction) is soaked: diagonal-front, flank and rear strikes deal full
 * damage. It does not help against САУ (spg) fire or headquarters («штаб»)
 * strikes, which arc over the frontal plate.
 */
function getFrontalArmorReduction(
  defender: BoardUnit,
  attacker: NonNullable<ReturnType<typeof getAttacker>>
): number {
  if (!isBattlefieldUnit(defender)) return 0;

  const amount = getCard(defender.cardId).combatAbilities?.frontalArmor?.amount ?? 0;
  if (amount <= 0) return 0;

  // Frontal armor only soaks direct ground fire from the front. Headquarters
  // («штаб») fire and САУ (spg) strikes arc over the plate and ignore it.
  if (!("cardId" in attacker)) return 0;
  if (getCard(attacker.cardId).class === "spg") return 0;

  // Only the single cell directly ahead protects — a diagonally-front attacker
  // (different row) hits the side and bypasses the plate.
  if (attacker.position.row !== defender.position.row) return 0;

  const frontDirection = defender.ownerId === "player" ? 1 : -1;
  const attackDirection = Math.sign(attacker.position.col - defender.position.col);

  return attackDirection === frontDirection ? amount : 0;
}

/**
 * Уязвимый тыл ПТ-САУ: a tank destroyer's gun sits in a fixed forward-facing
 * casemate, so a melee attacker striking from a rear cell (the side toward the
 * defender's own headquarters) draws no return fire. Player units face higher
 * columns and bot units lower columns, so the rear is the side opposite the
 * front direction; a same-column (pure flank) strike is not counted as rear.
 */
function isAttackFromRear(defender: BoardUnit, attacker: BoardUnit): boolean {
  const frontDirection = defender.ownerId === "player" ? 1 : -1;
  const attackDirection = Math.sign(
    attacker.position.col - defender.position.col
  );
  return attackDirection === -frontDirection;
}

/**
 * «Стальной клин»: own heavy tanks and tank destroyers soak part of each
 * incoming strike. Keyed by unit class (heavy/td), it is the breakthrough
 * mirror of the dug-in tank toughness and applies regardless of movement.
 */
function getHeavyArmorReduction(state: BattleState, unit: BoardUnit): number {
  const reduction = getAbility(state, unit.ownerId)?.heavyArmorReduction ?? 0;
  if (reduction <= 0) return 0;
  if (!isBattlefieldUnit(unit)) return 0;

  const unitClass = getCard(unit.cardId).class;
  return unitClass === "heavy" || unitClass === "td" ? reduction : 0;
}

export function getHeadquartersAttackValue(
  state: BattleState,
  ownerId: PlayerId
): number {
  const supportBonus = getSupportUnits(state, ownerId).reduce(
    (total, unit) =>
      total + (getCard(unit.cardId).supportEffects?.hqAttackBonus ?? 0),
    0
  );
  const abilityBonus = getAbility(state, ownerId)?.hqAttackBonus ?? 0;

  return (
    state.headquarters[ownerId].attack +
    supportBonus +
    abilityBonus +
    getLastStandHqAttackBonus(state, ownerId)
  );
}

/**
 * «Глухая оборона» (Польша): while all three of a side's spawn cells are held by
 * its own battlefield units, its headquarters strikes harder.
 */
function getLastStandHqAttackBonus(
  state: BattleState,
  ownerId: PlayerId
): number {
  const ability = getNationalAbilityForPlayer(state, ownerId);

  if (ability?.id !== "last_stand") return 0;

  const spawnCells =
    ownerId === "player" ? PLAYER_SPAWN_CELLS : BOT_SPAWN_CELLS;

  const allSpawnCellsHeld = spawnCells.every((cell) =>
    state.units.some(
      (unit) =>
        unit.ownerId === ownerId &&
        isBattlefieldUnit(unit) &&
        unit.currentHp > 0 &&
        samePosition(unit.position, cell)
    )
  );

  return allSpawnCellsHeld ? ability.bonus : 0;
}

/**
 * Tank ambush: own tanks dug in for a full player turn strike harder. The bonus
 * is armed only once the tank has spent its owner's previous turn stationary
 * (`wasStationaryLastTurn`) — surviving the enemy's turn after deploy is not
 * enough — and is lost the moment it moves again this turn.
 */
function getStationaryTankAttackBonus(
  state: BattleState,
  unit: BoardUnit
): number {
  const ability = getAbility(state, unit.ownerId);

  if (!ability?.stationaryTankAttackBonus) return 0;
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;
  // Must have stood still through a full player turn, and not have moved yet.
  if (!unit.wasStationaryLastTurn) return 0;
  if (unit.moveCountThisTurn > 0) return 0;

  return ability.stationaryTankAttackBonus;
}

/**
 * Dug-in toughness: own tanks dug in for a full player turn reduce each incoming
 * strike (the "+HP in ambush" of the tank-brigade ability). Armed by the same
 * `wasStationaryLastTurn` flag as the attack bonus and lost once the tank moves.
 */
function getStationaryTankDefenseBonus(
  state: BattleState,
  unit: BoardUnit
): number {
  const ability = getAbility(state, unit.ownerId);

  if (!ability?.stationaryTankHpBonus) return 0;
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;
  // Must have stood still through a full player turn, and not have moved yet.
  if (!unit.wasStationaryLastTurn) return 0;
  if (unit.moveCountThisTurn > 0) return 0;

  return ability.stationaryTankHpBonus;
}

/**
 * Armored momentum: own tanks that HAVE moved this turn strike harder — the
 * aggressive mirror of the dug-in ambush bonus. The push only counts on the
 * unit owner's own turn: on the opponent's turn the tank's attack drops back to
 * its base value (it is no longer charging forward when it merely defends).
 */
function getMovedTankAttackBonus(state: BattleState, unit: BoardUnit): number {
  const ability = getAbility(state, unit.ownerId);

  if (!ability?.movedTankAttackBonus) return 0;
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;
  if (state.activePlayer !== unit.ownerId) return 0;
  if (unit.moveCountThisTurn === 0) return 0;

  return ability.movedTankAttackBonus;
}

/**
 * Command-tank defense aura: while a friendly unit with `tankDefenseAura` is
 * alive on the battlefield, every friendly battlefield tank soaks part of each
 * incoming strike. The strongest aura on the field applies (it does not stack).
 */
function getTankDefenseAuraBonus(state: BattleState, unit: BoardUnit): number {
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;

  let bestAura = 0;
  for (const ally of state.units) {
    if (ally.ownerId !== unit.ownerId) continue;
    if (ally.currentHp <= 0) continue;
    if (!isBattlefieldUnit(ally)) continue;

    const aura = getCard(ally.cardId).combatAbilities?.tankDefenseAura ?? 0;
    if (aura > bestAura) bestAura = aura;
  }

  return bestAura;
}

/**
 * Бронеавтомобиль flanking modifier. A fast armored car is a raider, not a
 * line-breaker: against an ordinary battlefield unit (light/medium/heavy/td) its
 * shot lands for −1 when fired from the target's front (straight ahead, from the
 * enemy-HQ side — exactly the «Лобовая броня» front arc) and for +1 from a flank
 * or the rear. САУ (spg) and other armored cars are hit for the printed value,
 * and rear (support) units / the headquarters take standard damage (the armored
 * car's double-strike already rewards raiding them).
 */
function getArmoredCarFlankingBonus(
  attacker: NonNullable<ReturnType<typeof getAttacker>>,
  target: NonNullable<ReturnType<typeof getAttacker>>
): number {
  if (!("cardId" in attacker) || !isArmoredCarUnit(attacker)) return 0;
  if (!("cardId" in target) || !isBattlefieldUnit(target)) return 0;

  const targetClass = getCard(target.cardId).class;
  if (targetClass === "spg" || targetClass === "armored_car") return 0;

  // The target's front faces its own enemy HQ: a player unit faces higher
  // columns (toward the bot HQ), a bot unit faces lower columns.
  const frontDirection = target.ownerId === "player" ? 1 : -1;
  const attackDirection = Math.sign(attacker.position.col - target.position.col);
  const sameRow = attacker.position.row === target.position.row;

  // Straight-ahead, front-side hit = frontal (−1); everything else = +1.
  return sameRow && attackDirection === frontDirection ? -1 : 1;
}

function getUnitCombatBonuses(
  state: BattleState,
  attacker: BoardUnit,
  target: BoardUnit
): Required<UnitCombatBonuses> {
  const attackerClass = getCard(attacker.cardId).class;
  const targetClass = getCard(target.cardId).class;

  return {
    // Effective base firepower (Корректировщик / Огневая позиция).
    attackerAttack: getUnitAttackValue(state, attacker),
    targetAttack: getUnitAttackValue(state, target),
    attackerAttackBonus:
      getStationaryTankAttackBonus(state, attacker) +
      getMovedTankAttackBonus(state, attacker) +
      getArmoredCarFlankingBonus(attacker, target),
    targetAttackBonus:
      getStationaryTankAttackBonus(state, target) +
      getMovedTankAttackBonus(state, target) +
      getArmoredCarFlankingBonus(target, attacker),
    attackerDefenseBonus:
      getStationaryTankDefenseBonus(state, attacker) +
      getTankDefenseAuraBonus(state, attacker) +
      getSpawnDamageReduction(attacker) +
      getArmorVsClassReduction(attacker, targetClass) +
      getFrontalArmorReduction(attacker, target) +
      getHeavyArmorReduction(state, attacker) +
      getCohesionDefenseBonus(state, attacker) -
      (isSupportUnit(attacker)
        ? getRearVulnerabilityPenalty(state, attacker.ownerId, target)
        : 0),
    targetDefenseBonus:
      getStationaryTankDefenseBonus(state, target) +
      getTankDefenseAuraBonus(state, target) +
      getSpawnDamageReduction(target) +
      getArmorVsClassReduction(target, attackerClass) +
      getFrontalArmorReduction(target, attacker) +
      getHeavyArmorReduction(state, target) +
      getCohesionDefenseBonus(state, target) -
      (isSupportUnit(target)
        ? getRearVulnerabilityPenalty(state, target.ownerId, attacker)
        : 0),
  };
}

/** Extra headquarters damage against an already damaged enemy unit. */
function getHeadquartersBonusVsDamagedUnit(
  state: BattleState,
  attackerOwnerId: PlayerId,
  target: BoardUnit
): number {
  const ability = getAbility(state, attackerOwnerId);

  if (!ability?.hqAttackBonusVsDamaged) return 0;
  if (target.currentHp >= getCard(target.cardId).hp) return 0;

  return ability.hqAttackBonusVsDamaged;
}

function headquartersAttackIgnoresCover(
  state: BattleState,
  attackerOwnerId: PlayerId
): boolean {
  return getAbility(state, attackerOwnerId)?.hqAttackIgnoresCover === true;
}

/**
 * «Удар по тылам»: extra headquarters damage when this HQ strikes the enemy rear
 * line (support units) or the enemy headquarters. Caller is responsible for
 * checking that the target actually is a rear/HQ object.
 */
function getHeadquartersRearStrikeBonus(
  state: BattleState,
  attackerOwnerId: PlayerId
): number {
  return getAbility(state, attackerOwnerId)?.hqRearStrikeBonus ?? 0;
}

/**
 * Downside of «Удар по тылам»: the owner's own rear line (support units) and
 * headquarters take extra damage from enemy light tanks and armored cars.
 * `defenderOwnerId` holds the vulnerable rear/HQ; `attacker` is the striker.
 * Returns the extra damage to add (0 when the ability or attacker class does
 * not apply).
 */
function getRearVulnerabilityPenalty(
  state: BattleState,
  defenderOwnerId: PlayerId,
  attacker: NonNullable<ReturnType<typeof getAttacker>>
): number {
  const penalty =
    getAbility(state, defenderOwnerId)?.rearVulnerabilityToLightUnits ?? 0;
  if (penalty <= 0) return 0;
  if (!("cardId" in attacker)) return 0;

  const attackerClass = getCard(attacker.cardId).class;
  return attackerClass === "light" || attackerClass === "armored_car"
    ? penalty
    : 0;
}

function canUnitAttackTarget(
  attackerCard: TankCard,
  attackerPosition: Position,
  targetPosition: Position
): boolean {
  if (attackerCard.class === "td") {
    return isAdjacentAnyDirection(attackerPosition, targetPosition);
  }

  if (attackerCard.class === "spg") {
    return true;
  }

  return chebyshevDistance(attackerPosition, targetPosition) <= attackerCard.range;
}

function canAttackTarget(
  _state: BattleState,
  attacker: ReturnType<typeof getAttacker>,
  target: ReturnType<typeof getTarget>
): boolean {
  if (!attacker || !target) return false;
  if ("cardId" in attacker && isSupportUnit(attacker)) return false;

  // «Контрбатарейный огонь»: suppressed headquarters / SPG cannot attack.
  if ("cardId" in attacker) {
    if (getCard(attacker.cardId).class === "spg" && attacker.attackSuppressed) {
      return false;
    }
  } else if (attacker.attackSuppressed) {
    return false;
  }

  // Бронеавтомобиль: after its first strike this turn it may attack a second
  // time, but only the enemy rear line (support) or headquarters.
  if (
    "cardId" in attacker &&
    isArmoredCarUnit(attacker) &&
    (attacker.attackCountThisTurn ?? 0) >= 1
  ) {
    const targetIsRearOrHq = !("cardId" in target) || isSupportUnit(target);
    if (!targetIsRearOrHq) return false;
  }

  if ("cardId" in target && isSupportUnit(target)) {
    // Тыловые ячейки атакуются по обычной логике поля боя — по дальности/
    // соседству к собственной (виртуальной) позиции слота, а не «все сразу».
    const targetPosition = getSupportSlotPosition(
      target.ownerId,
      target.supportSlot ?? 0
    );

    if (!("cardId" in attacker)) {
      return (
        manhattanDistance(attacker.position, targetPosition) <= attacker.range
      );
    }

    const attackerCard = getCard(attacker.cardId);

    return canUnitAttackTarget(attackerCard, attacker.position, targetPosition);
  }

  // «Маскировка»: only an adjacent enemy unit in melee may target this unit —
  // ranged fire, SPGs and the headquarters cannot. The cover is lost once the
  // unit has attacked (target.revealed).
  if (!("cardId" in attacker) && !("cardId" in target)) {
    return true;
  }

  if (
    "cardId" in target &&
    isBattlefieldUnit(target) &&
    getCard(target.cardId).combatAbilities?.camouflage &&
    !target.revealed
  ) {
    if (!("cardId" in attacker)) return false;
    if (getCard(attacker.cardId).class === "spg") return false;
    if (!isAdjacentAnyDirection(attacker.position, target.position)) return false;
  }

  if (!("cardId" in attacker)) {
    return manhattanDistance(attacker.position, target.position) <= attacker.range;
  }

  const attackerCard = getCard(attacker.cardId);

  return canUnitAttackTarget(attackerCard, attacker.position, target.position);
}

export type AttackAnimationStrike = {
  sourceId: string;
  targetId: string;
  damage: number;
};

export type UnitCombatPreview = {
  strikes: AttackAnimationStrike[];
  attackerHpAfter: number;
  targetHpAfter: number;
  tdAmbushTriggered: boolean;
};

function getCombatObjectId(
  object: NonNullable<ReturnType<typeof getAttacker>>
): string {
  return "cardId" in object ? object.instanceId : `${object.ownerId}_hq`;
}

export type UnitCombatBonuses = {
  /** Effective base firepower of the attacker (defaults to its printed attack). */
  attackerAttack?: number;
  /** Effective base firepower of the target (defaults to its printed attack). */
  targetAttack?: number;
  /** Extra damage added to the attacker's strike. */
  attackerAttackBonus?: number;
  /** Extra damage added to the target's counterattack. */
  targetAttackBonus?: number;
  /** Damage subtracted from each strike that hits the attacker (dug-in tank). */
  attackerDefenseBonus?: number;
  /** Damage subtracted from each strike that hits the target (dug-in tank). */
  targetDefenseBonus?: number;
};

export function getUnitCombatPreview(
  attacker: BoardUnit,
  target: BoardUnit,
  bonuses: UnitCombatBonuses = {}
): UnitCombatPreview {
  const attackerCard = getCard(attacker.cardId);
  const targetCard = getCard(target.cardId);
  const strikes: AttackAnimationStrike[] = [];
  // Dug-in tanks soak part of each incoming strike (stationaryTankHpBonus).
  const attackerDamage = Math.max(
    0,
    (bonuses.attackerAttack ?? attackerCard.attack) +
      (bonuses.attackerAttackBonus ?? 0) -
      (bonuses.targetDefenseBonus ?? 0)
  );
  const targetDamage = Math.max(
    0,
    (bonuses.targetAttack ?? targetCard.attack) +
      (bonuses.targetAttackBonus ?? 0) -
      (bonuses.attackerDefenseBonus ?? 0)
  );
  let attackerHpAfter = attacker.currentHp;
  let targetHpAfter = target.currentHp;
  let tdAmbushTriggered = false;

  const attackTarget = () => {
    targetHpAfter -= attackerDamage;
    strikes.push({
      sourceId: attacker.instanceId,
      targetId: target.instanceId,
      damage: attackerDamage,
    });
  };

  const counterAttack = () => {
    attackerHpAfter -= targetDamage;
    strikes.push({
      sourceId: target.instanceId,
      targetId: attacker.instanceId,
      damage: targetDamage,
    });
  };

  const attackerUsesRangedAttack =
    attackerCard.class === "spg" ||
    chebyshevDistance(attacker.position, target.position) > 1;
  // A tank destroyer struck from behind cannot fire back (neither the «Танковая
  // засада» pre-emptive shot nor a regular counterattack).
  const targetIsTdHitFromRear =
    isBattlefieldUnit(target) &&
    targetCard.class === "td" &&
    isAttackFromRear(target, attacker);
  const targetCanUseTdAmbush =
    isBattlefieldUnit(target) &&
    targetCard.class === "td" &&
    attackerCard.class !== "td" &&
    !target.tdAmbushUsedThisTurn &&
    !attackerUsesRangedAttack &&
    !targetIsTdHitFromRear;

  if (targetCanUseTdAmbush) {
    tdAmbushTriggered = true;
    counterAttack();

    if (attackerHpAfter > 0) {
      attackTarget();
    }

    return {
      strikes,
      attackerHpAfter,
      targetHpAfter,
      tdAmbushTriggered,
    };
  }

  attackTarget();

  const targetCanCounterAttack =
    isBattlefieldUnit(target) &&
    targetCard.class !== "spg" &&
    attackerCard.class !== "spg" &&
    !targetIsTdHitFromRear &&
    !(
      attackerCard.class === "td" &&
      targetCard.class !== "td" &&
      targetHpAfter <= 0
    );

  if (targetCanCounterAttack) {
    counterAttack();
  }

  return {
    strikes,
    attackerHpAfter,
    targetHpAfter,
    tdAmbushTriggered,
  };
}

type HeadquartersDamageDistribution = {
  redirected: { unit: BoardUnit; damage: number }[];
  headquartersDamage: number;
};

function getHeadquartersDamageDistribution(
  state: BattleState,
  targetOwnerId: PlayerId,
  incomingDamage: number,
  // «Противотанковый заслон» also throws itself in front of the HQ against
  // ranged fire (its supportLineCover doubles as soak). Melee raids are
  // answered with return fire instead, so they pass `false` here.
  includeBarrierCover = false
): HeadquartersDamageDistribution {
  let remainingDamage = incomingDamage;
  const redirected: HeadquartersDamageDistribution["redirected"] = [];

  for (const unit of getSupportUnits(state, targetOwnerId)) {
    const effects = getCard(unit.cardId).supportEffects;
    const redirectLimit =
      (effects?.hqDamageRedirect ?? 0) +
      (includeBarrierCover ? effects?.supportLineCover ?? 0 : 0);
    const damage = Math.min(remainingDamage, redirectLimit, unit.currentHp);

    if (damage <= 0) continue;

    redirected.push({ unit, damage });
    remainingDamage -= damage;

    if (remainingDamage <= 0) break;
  }

  return {
    redirected,
    headquartersDamage: remainingDamage,
  };
}

export function getAttackAnimationSequence(
  state: BattleState,
  action: AttackAction
): AttackAnimationStrike[] {
  if (state.status !== "active") return [];
  if (state.activePlayer !== action.playerId) return [];

  const attacker = getAttacker(state, action);
  const target = getTarget(state, action);

  if (!attacker || !target) return [];
  if (attacker.ownerId !== action.playerId) return [];
  if (target.ownerId === action.playerId) return [];
  if (attacker.alreadyAttacked) return [];
  if (!canAttackTarget(state, attacker, target)) return [];

  // Anti-tank screen on the support line (mirrors attack()).
  let effectiveTarget = target;
  const coverStrikes: AttackAnimationStrike[] = [];

  if ("cardId" in target && isSupportUnit(target)) {
    const coverUnit = getSupportCoverUnit(state, target.ownerId);
    const rangedAttack =
      !("cardId" in attacker) || getCard(attacker.cardId).class === "spg";

    if (
      coverUnit &&
      rangedAttack &&
      coverUnit.instanceId !== target.instanceId
    ) {
      effectiveTarget = coverUnit;
    } else if (
      coverUnit &&
      !rangedAttack &&
      "cardId" in attacker &&
      !coverUnit.coverFiredThisTurn
    ) {
      const coverDamage =
        getCard(coverUnit.cardId).supportEffects?.supportLineCover ?? 0;

      coverStrikes.push({
        sourceId: coverUnit.instanceId,
        targetId: attacker.instanceId,
        damage: coverDamage,
      });

      if (attacker.currentHp - coverDamage <= 0) {
        return coverStrikes;
      }
    }
  }

  // Tank-screen redirect (animation mirror; flags are set in attack()).
  if ("cardId" in effectiveTarget && isBattlefieldUnit(effectiveTarget)) {
    const screen = findTankScreenUnit(state, effectiveTarget);

    if (screen) {
      effectiveTarget = screen;
    }
  }

  if ("cardId" in attacker && "cardId" in effectiveTarget) {
    const returnFire = getSupportReturnFire(attacker, effectiveTarget);

    return [
      ...coverStrikes,
      ...getUnitCombatPreview(
        attacker,
        effectiveTarget,
        getUnitCombatBonuses(state, attacker, effectiveTarget)
      ).strikes,
      ...(returnFire > 0
        ? [
            {
              sourceId: effectiveTarget.instanceId,
              targetId: attacker.instanceId,
              damage: returnFire,
            },
          ]
        : []),
    ];
  }

  const sourceId = getCombatObjectId(attacker);
  const attackValue = getAttackValue(state, attacker);
  const attackerIsHeadquarters = !("cardId" in attacker);

  if (!("cardId" in target)) {
    const attackerIsMelee = isMeleeUnitAttacker(attacker);
    const coverUnit = getSupportCoverUnit(state, target.ownerId);

    // «Противотанковый заслон»: a melee raider on the HQ meets preemptive fire.
    const hqCoverStrikes: AttackAnimationStrike[] = [];

    if (attackerIsMelee && coverUnit && !coverUnit.coverFiredThisTurn) {
      const coverDamage =
        getCard(coverUnit.cardId).supportEffects?.supportLineCover ?? 0;

      hqCoverStrikes.push({
        sourceId: coverUnit.instanceId,
        targetId: attacker.instanceId,
        damage: coverDamage,
      });

      // The raid is cancelled if the return fire destroys the attacker.
      if (attacker.currentHp - coverDamage <= 0) {
        return hqCoverStrikes;
      }
    }

    // «Удар по тылам»: a HQ striking the enemy HQ hits harder; the same ability
    // on the defender makes its HQ softer against enemy light tanks / armored cars.
    const rearStrikeBonus = attackerIsHeadquarters
      ? getHeadquartersRearStrikeBonus(state, attacker.ownerId)
      : 0;
    const effectiveAttackValue = attackValue + rearStrikeBonus;
    const rearPenalty = getRearVulnerabilityPenalty(state, target.ownerId, attacker);

    const distribution =
      attackerIsHeadquarters &&
      headquartersAttackIgnoresCover(state, attacker.ownerId)
        ? { redirected: [], headquartersDamage: effectiveAttackValue }
        : getHeadquartersDamageDistribution(
            state,
            target.ownerId,
            effectiveAttackValue,
            // Ranged fire on the HQ is partly soaked by the screen; melee raids
            // are answered by return fire above and deal full HQ damage.
            !attackerIsMelee
          );

    const headquartersDamage =
      distribution.headquartersDamage > 0
        ? distribution.headquartersDamage + rearPenalty
        : 0;

    return [
      ...hqCoverStrikes,
      ...distribution.redirected.map(({ unit, damage }) => ({
        sourceId,
        targetId: unit.instanceId,
        damage,
      })),
      ...(headquartersDamage > 0
        ? [
            {
              sourceId,
              targetId: getCombatObjectId(target),
              damage: headquartersDamage,
            },
          ]
        : []),
    ];
  }

  const unitTarget = "cardId" in effectiveTarget ? effectiveTarget : target;
  const spawnReduction =
    "cardId" in unitTarget ? getSpawnDamageReduction(unitTarget) : 0;
  const frontalReduction =
    "cardId" in unitTarget
      ? getFrontalArmorReduction(unitTarget, attacker)
      : 0;
  const heavyReduction =
    "cardId" in unitTarget ? getHeavyArmorReduction(state, unitTarget) : 0;
  const cohesionReduction =
    "cardId" in unitTarget ? getCohesionDefenseBonus(state, unitTarget) : 0;

  return [
    {
      sourceId,
      targetId: getCombatObjectId(unitTarget),
      damage: Math.max(
        0,
        attackValue +
          (attackerIsHeadquarters
            ? getHeadquartersBonusVsDamagedUnit(
                state,
                attacker.ownerId,
                unitTarget
              )
            : 0) +
          // «Удар по тылам»: HQ fire on a rear (support) unit lands harder.
          (attackerIsHeadquarters && isSupportUnit(unitTarget)
            ? getHeadquartersRearStrikeBonus(state, attacker.ownerId)
            : 0) -
          spawnReduction -
          frontalReduction -
          heavyReduction -
          cohesionReduction
      ),
    },
  ];
}

function destroyUnit(
  state: BattleState,
  unit: BoardUnit,
  reason: string,
  destroyedBy?: PlayerId
) {
  const card = getCard(unit.cardId);

  if (destroyedBy) {
    recordDestroyedUnit(state, destroyedBy, unit);
  }

  state.units = state.units.filter(
    (item) => item.instanceId !== unit.instanceId
  );

  addLog(state, `${card.name} ${reason}`);

  // Recovery and repair: once per battle the first destroyed own unit is
  // returned to its owner's hand instead of the discard pile.
  const ability = getAbility(state, unit.ownerId);
  const tracking = getAbilityTracking(state, unit.ownerId);

  if (
    ability?.returnFirstDestroyedUnit &&
    !tracking.destroyedUnitReturnedThisBattle
  ) {
    tracking.destroyedUnitReturnedThisBattle = true;

    state[unit.ownerId].hand.push({
      instanceId: unit.instanceId,
      cardId: unit.cardId,
    });

    addLog(state, `${ability.name}: ${card.name} возвращается в руку.`);
    return;
  }

  state[unit.ownerId].discard.push({
    instanceId: unit.instanceId,
    cardId: unit.cardId,
  });
}

/**
 * «Дозор»: when a battlefield unit actually takes damage, its owner draws a
 * card (at most once per turn). May end the battle if the deck is empty.
 */
function handleDrawWhenAttacked(
  state: BattleState,
  unit: BoardUnit,
  damageTaken: number
) {
  if (damageTaken <= 0) return;
  if (!isBattlefieldUnit(unit)) return;

  const draw = getCard(unit.cardId).combatAbilities?.drawWhenAttacked ?? 0;
  if (draw <= 0 || unit.drawWhenAttackedUsedThisTurn) return;

  unit.drawWhenAttackedUsedThisTurn = true;

  const drawn = drawCardsWithEmptyDeckPenalty(state, unit.ownerId, draw);

  if (drawn > 0) {
    addLog(
      state,
      `${getCard(unit.cardId).name}: дозор — ${
        unit.ownerId === "player" ? "игрок" : "бот"
      } добирает карту.`
    );
  }
}

function attack(state: BattleState, action: AttackAction) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;

  const attacker = getAttacker(state, action);
  let target = getTarget(state, action);

  if (!attacker || !target) return;
  if (attacker.ownerId !== action.playerId) return;
  if (target.ownerId === action.playerId) return;
  if (attacker.alreadyAttacked) return;
  if (!canAttackTarget(state, attacker, target)) return;

  const attackValue = getAttackValue(state, attacker);

  const attackerIsUnit = "cardId" in attacker;

  // Anti-tank screen on the support line.
  if ("cardId" in target && isSupportUnit(target)) {
    const coverUnit = getSupportCoverUnit(state, target.ownerId);
    const rangedAttack =
      !attackerIsUnit ||
      (attackerIsUnit && getCard(attacker.cardId).class === "spg");

    if (coverUnit && rangedAttack && coverUnit.instanceId !== target.instanceId) {
      // Ranged fire against the support line hits the screen first.
      addLog(
        state,
        `${getCard(coverUnit.cardId).name} принимает дистанционный удар на себя.`
      );
      target = coverUnit;
    } else if (
      coverUnit &&
      !rangedAttack &&
      attackerIsUnit &&
      !coverUnit.coverFiredThisTurn
    ) {
      // Melee raid on the support line is met with preemptive return fire.
      const coverDamage =
        getCard(coverUnit.cardId).supportEffects?.supportLineCover ?? 0;

      coverUnit.coverFiredThisTurn = true;
      attacker.currentHp -= coverDamage;

      addLog(
        state,
        `Противотанковый заслон: ${getCard(coverUnit.cardId).name} встречает ${
          getCard(attacker.cardId).name
        } огнём (${coverDamage} урона).`
      );

      if (attacker.currentHp <= 0) {
        destroyUnit(
          state,
          attacker,
          "уничтожен заслоном на подступах к тылу.",
          target.ownerId
        );
        markSuccessfulAction(state, action.playerId);
        return;
      }
    }
  }

  // Tank screen: once per turn the first strike aimed at a protected friendly
  // tank is redirected into the screening unit (e.g. Porsche-823).
  if ("cardId" in target && isBattlefieldUnit(target)) {
    const screen = findTankScreenUnit(state, target);

    if (screen) {
      screen.coverFiredThisTurn = true;

      addLog(
        state,
        `${getCard(screen.cardId).name} принимает удар по ${
          getCard(target.cardId).name
        } на себя.`
      );

      target = screen;
    }
  }

  const targetIsUnit = "cardId" in target;
  const targetUnit = targetIsUnit ? (target as BoardUnit) : null;
  const targetHeadquarters = targetIsUnit ? null : (target as HeadquartersState);

  const attackerCard = attackerIsUnit ? getCard(attacker.cardId) : null;
  const targetCard = targetUnit ? getCard(targetUnit.cardId) : null;

  const attackerName = attackerCard ? attackerCard.name : "Штаб";
  const targetName = targetCard ? targetCard.name : "штаб";

  if (targetIsUnit) {
    if (!targetUnit) return;

    const targetHpBefore = targetUnit.currentHp;

    if (attackerIsUnit && attackerCard && targetCard) {
      const combatBonuses = getUnitCombatBonuses(state, attacker, targetUnit);
      const preview = getUnitCombatPreview(attacker, targetUnit, combatBonuses);

      if (combatBonuses.attackerAttackBonus > 0) {
        addLog(
          state,
          `${getAbility(state, attacker.ownerId)?.name}: ${attackerCard.name} наносит усиленный удар (+${combatBonuses.attackerAttackBonus} к атаке).`
        );
      }

      attacker.currentHp = preview.attackerHpAfter;
      targetUnit.currentHp = preview.targetHpAfter;
      targetUnit.tdAmbushUsedThisTurn =
        targetUnit.tdAmbushUsedThisTurn || preview.tdAmbushTriggered;

      for (const [index, strike] of preview.strikes.entries()) {
        const isAttackerStrike = strike.sourceId === attacker.instanceId;
        const isPreemptiveTdStrike =
          index === 0 && !isAttackerStrike && preview.tdAmbushTriggered;

        if (isPreemptiveTdStrike) {
          addLog(
            state,
            `${targetName} открывает упреждающий огонь и наносит ${strike.damage} урона.`
          );
          continue;
        }

        if (!isAttackerStrike) {
          addLog(
            state,
            `${targetName} отвечает огнем и наносит ${strike.damage} урона.`
          );
          continue;
        }

        addLog(
          state,
          `${attackerName} атакует ${targetName} и наносит ${strike.damage} урона.`
        );
      }
    } else {
      const damagedBonus = getHeadquartersBonusVsDamagedUnit(
        state,
        action.playerId,
        targetUnit
      );
      // «Оборона плацдарма» softens headquarters fire (spawn-zone protection).
      // «Лобовая броня» does NOT — HQ shells arc over the frontal plate.
      const spawnReduction = getSpawnDamageReduction(targetUnit);
      const frontalReduction = getFrontalArmorReduction(targetUnit, attacker);
      // «Стальной клин» soaks part of headquarters fire against heavy/td units.
      const heavyReduction = getHeavyArmorReduction(state, targetUnit);
      // «Сплочение»: a cohesion line soaks part of headquarters fire too.
      const cohesionReduction = getCohesionDefenseBonus(state, targetUnit);
      // «Удар по тылам»: HQ fire on a rear (support) unit lands harder.
      const rearStrikeBonus = isSupportUnit(targetUnit)
        ? getHeadquartersRearStrikeBonus(state, action.playerId)
        : 0;
      const totalDamage = Math.max(
        0,
        attackValue +
          damagedBonus +
          rearStrikeBonus -
          spawnReduction -
          frontalReduction -
          heavyReduction -
          cohesionReduction
      );

      targetUnit.currentHp -= totalDamage;

      if (damagedBonus > 0) {
        addLog(
          state,
          `${getAbility(state, action.playerId)?.name}: +${damagedBonus} урона по повреждённой технике.`
        );
      }

      if (rearStrikeBonus > 0) {
        addLog(
          state,
          `${getAbility(state, action.playerId)?.name}: +${rearStrikeBonus} урона по тылу.`
        );
      }

      addLog(
        state,
        `${attackerName} атакует ${targetName} и наносит ${totalDamage} урона.`
      );
    }

    // «Самооборона»: an armed rear unit fires back at a melee raider.
    const returnFire = getSupportReturnFire(attacker, targetUnit);

    if (attackerIsUnit && returnFire > 0) {
      attacker.currentHp -= returnFire;

      addLog(
        state,
        `Самооборона: ${targetName} отвечает огнём по ${attackerName} (${returnFire} урона).`
      );
    }

    // «Дозор»: the defender draws a card when it actually took damage.
    handleDrawWhenAttacked(
      state,
      targetUnit,
      targetHpBefore - targetUnit.currentHp
    );

    if (targetUnit.currentHp <= 0) {
      destroyUnit(state, targetUnit, "уничтожен.", action.playerId);
    }

    if (attackerIsUnit && attacker.currentHp <= 0) {
      destroyUnit(
        state,
        attacker,
        "уничтожен ответным огнем.",
        getOpponent(action.playerId)
      );
    }
  } else {
    if (!targetHeadquarters) return;

    // «Противотанковый заслон»: a melee raider striking the headquarters is met
    // with preemptive return fire from the anti-tank screen on the rear line.
    const attackerIsMelee = isMeleeUnitAttacker(attacker);
    const coverUnit = getSupportCoverUnit(state, targetHeadquarters.ownerId);

    if (attackerIsMelee && coverUnit && !coverUnit.coverFiredThisTurn) {
      const coverDamage =
        getCard(coverUnit.cardId).supportEffects?.supportLineCover ?? 0;

      coverUnit.coverFiredThisTurn = true;
      attacker.currentHp -= coverDamage;

      addLog(
        state,
        `Противотанковый заслон: ${getCard(coverUnit.cardId).name} встречает ${attackerName} огнём (${coverDamage} урона).`
      );

      if (attacker.currentHp <= 0) {
        destroyUnit(
          state,
          attacker as BoardUnit,
          "уничтожен заслоном на подступах к штабу.",
          targetHeadquarters.ownerId
        );
        markSuccessfulAction(state, action.playerId);
        return;
      }
    }

    // «Удар по тылам»: a HQ striking the enemy HQ hits harder; the same ability
    // on the defender makes its HQ softer against enemy light tanks / armored cars.
    const rearStrikeBonus = !attackerIsUnit
      ? getHeadquartersRearStrikeBonus(state, action.playerId)
      : 0;
    const effectiveAttackValue = attackValue + rearStrikeBonus;
    const rearPenalty = getRearVulnerabilityPenalty(
      state,
      targetHeadquarters.ownerId,
      attacker
    );

    const normalDistribution = getHeadquartersDamageDistribution(
      state,
      targetHeadquarters.ownerId,
      effectiveAttackValue,
      // Ranged fire on the HQ is partly soaked by the anti-tank screen; melee
      // raids are answered by return fire above, so the HQ takes full damage.
      !attackerIsMelee
    );
    const ignoresCover =
      !attackerIsUnit &&
      headquartersAttackIgnoresCover(state, action.playerId) &&
      normalDistribution.redirected.length > 0;
    const distribution: HeadquartersDamageDistribution = ignoresCover
      ? { redirected: [], headquartersDamage: effectiveAttackValue }
      : normalDistribution;

    if (ignoresCover) {
      addLog(
        state,
        `${getAbility(state, action.playerId)?.name}: удар штаба нельзя перехватить.`
      );
    }

    for (const { unit, damage } of distribution.redirected) {
      unit.currentHp -= damage;

      if (unit.currentHp <= 0) {
        destroyUnit(state, unit, "destroyed while covering headquarters.", action.playerId);
      }
    }

    const incoming =
      distribution.headquartersDamage > 0
        ? distribution.headquartersDamage + rearPenalty
        : 0;
    targetHeadquarters.hp -= incoming;

    if (rearStrikeBonus > 0 && distribution.headquartersDamage > 0) {
      addLog(
        state,
        `${getAbility(state, action.playerId)?.name}: +${rearStrikeBonus} урона по штабу.`
      );
    }

    if (rearPenalty > 0 && distribution.headquartersDamage > 0) {
      addLog(
        state,
        `${getAbility(state, targetHeadquarters.ownerId)?.name}: штаб получает +${rearPenalty} урона от лёгкой техники.`
      );
    }

    addLog(state, `${attackerName} атакует штаб и наносит ${incoming} урона.`);

    if (targetHeadquarters.hp <= 0) {
      state.status = targetHeadquarters.ownerId === "player" ? "bot_won" : "player_won";

      addLog(
        state,
        targetHeadquarters.ownerId === "player" ? "Бот победил." : "Игрок победил."
      );
    }
  }

  // Бронеавтомобиль may strike twice per turn; every other attacker is spent
  // after a single attack. The second armored-car strike is gated to the rear /
  // headquarters by canAttackTarget.
  if (attackerIsUnit && isArmoredCarUnit(attacker)) {
    attacker.attackCountThisTurn = (attacker.attackCountThisTurn ?? 0) + 1;
    attacker.alreadyAttacked = attacker.attackCountThisTurn >= 2;
  } else {
    attacker.alreadyAttacked = true;
  }

  // «Маскировка» drops permanently once the unit opens fire.
  if (attackerIsUnit && attackerCard?.combatAbilities?.camouflage) {
    attacker.revealed = true;
  }

  // Heavy tanks choose one action mode per turn: either move or attack.
  if (attackerIsUnit && attackerCard?.class === "heavy") {
    attacker.alreadyMoved = true;
  }

  if (state.status === "active") {
    markSuccessfulAction(state, action.playerId);
  }
}

/**
 * Whether a unit carries «Блиц» at all (intrinsic on the card or HQ-granted at
 * deploy). The double move itself only fires on the deploy turn — see
 * {@link blitzActiveThisTurn}.
 */
function unitHasBlitz(unit: BoardUnit): boolean {
  return (
    getCard(unit.cardId).combatAbilities?.blitz === true ||
    unit.blitzGranted === true
  );
}

/**
 * «Блиц» only doubles movement on the turn the unit enters play (its first
 * turn). On later turns the unit moves like any other of its class.
 */
function blitzActiveThisTurn(unit: BoardUnit): boolean {
  return unit.deployedThisTurn === true && unitHasBlitz(unit);
}

/**
 * Movement budget (in move points) a unit may spend this turn. Light tanks
 * spend up to 2 points (a 1-cell straight move costs 1, a diagonal or 2-cell
 * straight move costs 2); every other class spends 1 point per move. On its
 * deploy turn a «Блиц» unit gets double the budget — two standard moves.
 */
function getMoveBudget(unit: BoardUnit): number {
  const unitClass = getCard(unit.cardId).class;
  // Armored cars are highly mobile (budget 6: three straight cells at 2 each, or
  // two diagonal steps at 3 each); light tanks get 2; everyone else 1.
  const base = unitClass === "light" ? 2 : unitClass === "armored_car" ? 6 : 1;
  return blitzActiveThisTurn(unit) ? base * 2 : base;
}

/**
 * Move-point cost of a single armored-car move action (budget 6 per turn). A
 * straight horizontal/vertical step costs 2 per cell, so the car can sweep up to
 * three cells in a line; a single diagonal step costs 3, so it can make two
 * diagonal moves. Anything else (e.g. a multi-cell diagonal in one action) is
 * illegal and returns null.
 */
function getArmoredCarMoveCost(from: Position, to: Position): number | null {
  const manhattan = manhattanDistance(from, to);

  if (isStraightMove(from, to) && manhattan >= 1 && manhattan <= 3) {
    return manhattan * 2;
  }

  if (isDiagonalMove(from, to)) {
    return 3;
  }

  return null;
}

/**
 * Whether every cell strictly between two cells on a straight horizontal or
 * vertical line is empty — armored cars (and light tanks) cannot jump over any
 * unit on a multi-cell straight move.
 */
function isStraightLineClear(
  state: BattleState,
  from: Position,
  to: Position
): boolean {
  if (!isStraightMove(from, to)) return true;

  const dRow = Math.sign(to.row - from.row);
  const dCol = Math.sign(to.col - from.col);

  let row = from.row + dRow;
  let col = from.col + dCol;

  while (!(row === to.row && col === to.col)) {
    if (isCellOccupied(state, { row, col })) return false;
    row += dRow;
    col += dCol;
  }

  return true;
}

function getLightTankMoveCost(from: Position, to: Position): number | null {
  const straight = isStraightMove(from, to);
  const diagonal = isDiagonalMove(from, to);
  const manhattan = manhattanDistance(from, to);

  if (diagonal) {
    return 2;
  }

  if (straight && manhattan === 1) {
    return 1;
  }

  if (straight && manhattan === 2) {
    return 2;
  }

  return null;
}

function canUnitMoveTo(
  card: TankCard,
  from: Position,
  to: Position,
  moveCountThisTurn: number,
  moveBudget: number
): boolean {
  if (samePosition(from, to)) return false;

  const straight = isStraightMove(from, to);
  const manhattan = manhattanDistance(from, to);

  if (card.class === "light") {
    const moveCost = getLightTankMoveCost(from, to);

    if (moveCost === null) return false;

    return moveCountThisTurn + moveCost <= moveBudget;
  }

  if (card.class === "armored_car") {
    const moveCost = getArmoredCarMoveCost(from, to);

    if (moveCost === null) return false;

    return moveCountThisTurn + moveCost <= moveBudget;
  }

  if (card.class === "medium") {
    if (!isAdjacentAnyDirection(from, to)) return false;

    return moveCountThisTurn + 1 <= moveBudget;
  }

  if (!(straight && manhattan === 1)) return false;

  return moveCountThisTurn + 1 <= moveBudget;
}

/**
 * «Маскировка»: a still-hidden camouflaged unit is spotted (revealed
 * permanently) as soon as an enemy battlefield unit stands on an adjacent cell.
 * Movement alone never reveals it — only enemy contact or opening fire. Call
 * this after any board change (move or deploy) that could create adjacency.
 */
function revealCamouflagedNearEnemies(state: BattleState) {
  for (const unit of state.units) {
    if (unit.revealed) continue;
    if (!isBattlefieldUnit(unit)) continue;
    if (unit.currentHp <= 0) continue;
    if (!getCard(unit.cardId).combatAbilities?.camouflage) continue;

    const spotted = state.units.some(
      (other) =>
        other.ownerId !== unit.ownerId &&
        isBattlefieldUnit(other) &&
        other.currentHp > 0 &&
        isAdjacentAnyDirection(other.position, unit.position)
    );

    if (spotted) {
      unit.revealed = true;
      addLog(
        state,
        `${getCard(unit.cardId).name}: маскировка раскрыта — противник рядом.`
      );
    }
  }
}

/**
 * «Огневая позиция»: keep an SPG's maximum-HP bonus in sync with whether it is
 * standing on a board corner. Entering a corner grants the bonus HP; leaving
 * removes it (never reducing current HP below 1).
 */
function applyCornerHpBonus(unit: BoardUnit) {
  const card = getCard(unit.cardId);
  const desired =
    card.class === "spg" &&
    isBattlefieldUnit(unit) &&
    isCornerCell(unit.position)
      ? card.combatAbilities?.cornerBonus?.hp ?? 0
      : 0;
  const applied = unit.cornerHpApplied ?? 0;

  if (desired === applied) return;

  const delta = desired - applied;
  unit.currentHp =
    delta > 0 ? unit.currentHp + delta : Math.max(1, unit.currentHp + delta);
  unit.cornerHpApplied = desired;
}

function moveUnit(
  state: BattleState,
  action: Extract<BattleAction, { type: "MOVE_UNIT" }>
) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;

  const unit = state.units.find((item) => item.instanceId === action.unitId);

  if (!unit) return;
  if (unit.ownerId !== action.playerId) return;
  if (isSupportUnit(unit)) return;
  if (unit.alreadyMoved) return;
  if (isCellOccupied(state, action.position)) return;

  const card = getCard(unit.cardId);
  const fromPosition = unit.position;
  const isLightTank = card.class === "light";
  const isArmoredCar = card.class === "armored_car";
  const moveCountThisTurn = unit.moveCountThisTurn ?? 0;
  const moveBudget = getMoveBudget(unit);

  if (
    !canUnitMoveTo(
      card,
      fromPosition,
      action.position,
      moveCountThisTurn,
      moveBudget
    )
  ) {
    return;
  }

  // Extra pathing rule for light tanks doing 2-cell straight moves:
  // they cannot jump over any unit (friendly or enemy)
  const lightManhattan = manhattanDistance(fromPosition, action.position);
  if (isLightTank && lightManhattan === 2 && isStraightMove(fromPosition, action.position)) {
    if (!isPathClear(state, fromPosition, action.position)) {
      return;
    }
  }

  // Armored cars sweep up to three cells along a straight line and cannot jump
  // over any unit on the way.
  if (
    isArmoredCar &&
    isStraightMove(fromPosition, action.position) &&
    manhattanDistance(fromPosition, action.position) >= 2 &&
    !isStraightLineClear(state, fromPosition, action.position)
  ) {
    return;
  }

  unit.position = action.position;

  const moveCost = isLightTank
    ? getLightTankMoveCost(fromPosition, action.position) ?? 1
    : isArmoredCar
      ? getArmoredCarMoveCost(fromPosition, action.position) ?? 1
      : 1;
  const nextMoveCount = moveCountThisTurn + moveCost;

  unit.moveCountThisTurn = nextMoveCount;
  unit.alreadyMoved = nextMoveCount >= moveBudget;
  unit.spawnedThisTurn = false;

  // «Остриё прорыва»: the first time each turn one of this side's units breaks
  // into the enemy half of the board, its movement is refreshed once so the
  // spearhead can exploit the breakthrough and drive deeper on the same turn.
  const ownerAbility = getAbility(state, unit.ownerId);
  if (
    ownerAbility?.breakthroughExtraMove === true &&
    !unit.breakthroughMoveUsed &&
    !isEnemyHalf(unit.ownerId, fromPosition) &&
    isEnemyHalf(unit.ownerId, action.position)
  ) {
    unit.breakthroughMoveUsed = true;
    unit.moveCountThisTurn = 0;
    unit.alreadyMoved = false;

    addLog(
      state,
      `${card.name}: остриё прорыва — клин врывается в тыл противника и рвётся дальше.`
    );
  }

  // Heavy tanks choose one action mode per turn: either move or attack.
  // ПТ-САУ (td) may attack and then move, but moving first forfeits the attack:
  // once it has rolled forward it can no longer bring its gun to bear this turn.
  if (card.class === "heavy" || card.class === "td") {
    unit.alreadyAttacked = true;
  }

  // «Маскировка» is NOT lost by moving. It only drops when the unit opens fire
  // (see attack) or when an enemy ends up on an adjacent cell — repositioning
  // may have brought the scout next to an enemy (or an enemy next to it).
  revealCamouflagedNearEnemies(state);

  // «Огневая позиция»: refresh the corner HP bonus for SPGs.
  applyCornerHpBonus(unit);

  // «Прорыв»: drawing the first time this unit reaches an enemy spawn cell.
  const raidDraw = card.combatAbilities?.raidDraw ?? 0;

  if (
    raidDraw > 0 &&
    !unit.raidDrawUsed &&
    isSpawnCell(getOpponent(unit.ownerId), unit.position)
  ) {
    unit.raidDrawUsed = true;

    const drawn = drawCardsWithEmptyDeckPenalty(state, unit.ownerId, raidDraw);

    if (drawn > 0) {
      addLog(
        state,
        `${card.name}: прорыв на плацдарм — ${
          unit.ownerId === "player" ? "игрок" : "бот"
        } добирает карту.`
      );
    }

    if (state.status !== "active") return;
  }

  markSuccessfulAction(state, action.playerId);

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} перемещает ${
      card.name
    } на [${action.position.row},${
      action.position.col
    }].`
  );
}

function endTurn(state: BattleState, playerId: PlayerId) {
  if (state.status !== "active") return;
  if (state.activePlayer !== playerId) return;

  state.timers[playerId].actedThisStep = true;
  state.timers[playerId].stepTimeLeftMs = STEP_TIME_MS;

  // «Контрбатарейный огонь» wears off at the end of the suppressed side's turn.
  state.headquarters[playerId].attackSuppressed = false;
  for (const unit of state.units) {
    if (unit.ownerId === playerId) unit.attackSuppressed = false;
  }

  const nextPlayer = getOpponent(playerId);

  state.activePlayer = nextPlayer;

  if (nextPlayer === "player") {
    state.turn += 1;
  }

  startTurn(state, nextPlayer);

  if (state.status !== "active") {
    return;
  }

  addLog(
    state,
    `Ход переходит к ${nextPlayer === "player" ? "игроку" : "боту"}.`
  );
}

function handleIdleTimeout(state: BattleState, playerId: PlayerId) {
  if (state.status !== "active") return;
  if (state.activePlayer !== playerId) return;

  const timer = state.timers[playerId];

  timer.idleStreak += 1;
  timer.stepTimeLeftMs = STEP_TIME_MS;
  timer.actedThisStep = false;

  if (timer.idleStreak >= 3) {
    setWinnerByLoser(
      state,
      playerId,
      `${getPlayerLabel(playerId).toLowerCase()} пропустил действие 3 раза подряд`
    );

    return;
  }

  if (timer.idleStreak === 2) {
    const headquarters = state.headquarters[playerId];

    headquarters.hp -= 1;

    addLog(
      state,
      `${
        playerId === "player" ? "Игрок" : "Бот"
      } бездействует второй раз подряд. Штаб теряет 1 HP.`
    );

    if (headquarters.hp <= 0) {
      state.status = playerId === "player" ? "bot_won" : "player_won";

      addLog(
        state,
        playerId === "player"
          ? "Штаб игрока уничтожен. Бот победил."
          : "Штаб бота уничтожен. Игрок победил."
      );

      return;
    }
  } else {
    addLog(
      state,
      `${
        playerId === "player" ? "Игрок" : "Бот"
      } не сделал действие за минуту. Ход пропущен.`
    );
  }

  endTurn(state, playerId);
}

function timerTick(
  state: BattleState,
  action: Extract<BattleAction, { type: "TIMER_TICK" }>
) {
  if (state.status !== "active") return;

  if (!state.timers?.player || !state.timers?.bot) {
    return;
  }

  const activePlayer = state.activePlayer;
  const timer = state.timers[activePlayer];

  if (!timer) {
    return;
  }

  timer.stepTimeLeftMs = Math.max(0, timer.stepTimeLeftMs - action.elapsedMs);

  if (timer.stepTimeLeftMs <= 0) {
    handleIdleTimeout(state, activePlayer);
  }
}

export function applyAction(
  state: BattleState,
  action: BattleAction
): BattleState {
  const nextState = cloneState(state);

    switch (action.type) {
    case "BEGIN_BATTLE":
      beginBattle(nextState, action);
      break;

    case "PLAY_CARD":
      playCard(nextState, action);
      break;

    case "PLAY_SUPPORT_CARD":
      playSupportCard(nextState, action);
      break;

    case "MOVE_UNIT":
      moveUnit(nextState, action);
      break;

    case "ATTACK":
      attack(nextState, action);
      break;

    case "END_TURN":
      markSuccessfulAction(nextState, action.playerId, false);
      endTurn(nextState, action.playerId);
      break;

    case "TIMER_TICK":
      timerTick(nextState, action);
      break;

    default:
      return nextState;
  }

  // «Линия снабжения» (США): keep the +HP buff in sync with the live formation
  // after any board change, regardless of which action path mutated the board.
  syncSupplyLineHpBonus(nextState);

  return nextState;
}

export function getFreeSpawnCells(
  state: BattleState,
  playerId: PlayerId
): Position[] {
  const spawnCells =
    playerId === "player" ? PLAYER_SPAWN_CELLS : BOT_SPAWN_CELLS;

  return spawnCells.filter((cell) => !isCellOccupied(state, cell));
}

export function getFreeSupportSlots(
  state: BattleState,
  playerId: PlayerId
): SupportSlot[] {
  return SUPPORT_SLOTS.filter(
    (supportSlot) => !isSupportSlotOccupied(state, playerId, supportSlot)
  );
}

export function getTargetsInRange(
  state: BattleState,
  playerId: PlayerId,
  attackerType: "unit" | "headquarters",
  attackerId: string
) {
  const fakeAction: AttackAction = {
    type: "ATTACK",
    playerId,
    attackerType,
    attackerId,
    targetType: "headquarters",
    targetId: "",
  };

  const attacker = getAttacker(state, fakeAction);

  if (!attacker || attacker.alreadyAttacked) return [];

  const opponent = getOpponent(playerId);

  const enemyUnits = state.units.filter(
    (unit) => unit.ownerId === opponent && canAttackTarget(state, attacker, unit)
  );

  const enemyHq = state.headquarters[opponent];
  const hqInRange = canAttackTarget(state, attacker, enemyHq);

  return [
    ...enemyUnits.map((unit) => ({
      type: "unit" as const,
      id: unit.instanceId,
    })),
    ...(hqInRange
      ? [
          {
            type: "headquarters" as const,
            id: `${opponent}_hq`,
          },
        ]
      : []),
  ];
}

export function getAvailableMoveCells(
  state: BattleState,
  playerId: PlayerId,
  unitId: string
): Position[] {
  const unit = state.units.find((item) => item.instanceId === unitId);

  if (!unit) return [];
  if (unit.ownerId !== playerId) return [];
  if (isSupportUnit(unit)) return [];
  if (unit.alreadyMoved) return [];

  const card = getCard(unit.cardId);

  const result: Position[] = [];

  const rows = [0, 1, 2] as const;
  const cols = [0, 1, 2, 3, 4] as const;

  const moveCountThisTurn = unit.moveCountThisTurn ?? 0;
  const moveBudget = getMoveBudget(unit);

  for (const row of rows) {
    for (const col of cols) {
      const position: Position = { row, col };

      if (isCellOccupied(state, position)) continue;

      if (
        !canUnitMoveTo(
          card,
          unit.position,
          position,
          moveCountThisTurn,
          moveBudget
        )
      ) {
        continue;
      }

      // For light tanks considering 2-cell straight moves, hide the target if intermediate is blocked
      const manh = manhattanDistance(unit.position, position);
      if (card.class === "light" && manh === 2 && isStraightMove(unit.position, position)) {
        if (!isPathClear(state, unit.position, position)) {
          continue;
        }
      }

      // Armored cars cannot sweep through an occupied cell on a straight move.
      if (
        card.class === "armored_car" &&
        manh >= 2 &&
        isStraightMove(unit.position, position) &&
        !isStraightLineClear(state, unit.position, position)
      ) {
        continue;
      }

      result.push(position);
    }
  }

  return result;
}
