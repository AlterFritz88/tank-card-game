import { getCard } from "./cards";
import type {
  AttackAction,
  BattleAction,
  BattleState,
  BoardUnit,
  PlayerId,
  Position,
  TankCard,
} from "./types";

const STEP_TIME_MS = 15 * 1000;

export const PLAYER_SPAWN_CELLS: Position[] = [
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 2, col: 1 },
];

export const BOT_SPAWN_CELLS: Position[] = [
  { row: 0, col: 3 },
  { row: 1, col: 3 },
  { row: 1, col: 4 },
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

function isCellOccupied(state: BattleState, position: Position): boolean {
  const unitOnCell = state.units.some((unit) =>
    samePosition(unit.position, position)
  );

  const playerHq = samePosition(state.headquarters.player.position, position);
  const botHq = samePosition(state.headquarters.bot.position, position);

  return unitOnCell || playerHq || botHq;
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
  if (state.stats) return;

  state.stats = {
    destroyedByPlayer: {
      light: 0,
      medium: 0,
      heavy: 0,
      td: 0,
      spg: 0,
    },
    destroyedByBot: {
      light: 0,
      medium: 0,
      heavy: 0,
      td: 0,
      spg: 0,
    },
  };
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

  stats[card.class] += 1;
}

function calculateFuelGeneration(
  state: BattleState,
  playerId: PlayerId
): number {
  const headquartersFuel = state.headquarters[playerId].fuelGeneration;

  const unitsFuel = state.units
    .filter((unit) => unit.ownerId === playerId)
    .reduce((total, unit) => {
      const card = getCard(unit.cardId);
      return total + card.fuelGeneration;
    }, 0);

  return headquartersFuel + unitsFuel;
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

function markSuccessfulAction(state: BattleState, playerId: PlayerId) {
  state.timers[playerId].idleStreak = 0;
  resetStepTimer(state, playerId);
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
  }

  for (const unit of state.units) {
    unit.alreadyAttacked = false;
    unit.alreadyMoved = false;
    unit.spawnedThisTurn = false;
    unit.moveCountThisTurn = 0;
    unit.tdAmbushUsedThisTurn = false;
  }

  const startingPlayerDrawnCards = drawCardsWithoutPenalty(
    state,
    startingPlayer,
    3
  );

  const secondPlayerDrawnCards = drawCardsWithoutPenalty(
    state,
    secondPlayer,
    4
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

  for (const unit of state.units) {
    unit.tdAmbushUsedThisTurn = false;

    if (unit.ownerId === playerId) {
      unit.alreadyAttacked = false;
      unit.alreadyMoved = false;
      unit.spawnedThisTurn = false;
      unit.moveCountThisTurn = 0;
    }
  }

  state.headquarters[playerId].alreadyAttacked = false;
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

  if (!spendFuel(state, action.playerId, card.cost, "размещение юнита")) {
    return;
  }

  player.hand = player.hand.filter(
    (item) => item.instanceId !== action.cardInstanceId
  );

  const isLightTank = card.class === "light";

  const unit: BoardUnit = {
    instanceId: action.cardInstanceId,
    cardId: card.id,
    ownerId: action.playerId,
    position: action.position,
    currentHp: card.hp,

    alreadyAttacked: !isLightTank,
    alreadyMoved: !isLightTank,
    spawnedThisTurn: true,
    moveCountThisTurn: 0,
    tdAmbushUsedThisTurn: false,
  };

  state.units.push(unit);

  // Apply on-play effects (new mechanics for low-stat units)
  if (card.onPlayEffects) {
    const effects = card.onPlayEffects;
    const owner = action.playerId;

    // Card draw
    if (effects.draw && effects.draw > 0) {
      for (let i = 0; i < effects.draw; i++) {
        const drawn = player.deck[0];
        if (drawn) {
          player.hand.push(drawn);
          player.deck = player.deck.slice(1);
          addLog(state, `${owner === "player" ? "Игрок" : "Бот"} добирает карту (Разведка).`);
        }
      }
    }

    // HQ protection reinforces the headquarters immediately.
    if (effects.hqProtection && effects.hqProtection > 0) {
      const hq = state.headquarters[owner];
      hq.hp += effects.hqProtection;
      addLog(state, `${owner === "player" ? "Игрок" : "Бот"} укрепляет штаб на +${effects.hqProtection}.`);
    }
  }

  markSuccessfulAction(state, action.playerId);

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} размещает ${
      card.name
    } за ${card.cost} топлива на [${action.position.row},${
      action.position.col
    }].`
  );
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

function getAttackValue(attacker: ReturnType<typeof getAttacker>): number {
  if (!attacker) return 0;

  if ("cardId" in attacker) {
    return getCard(attacker.cardId).attack;
  }

  return attacker.attack;
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
  attacker: ReturnType<typeof getAttacker>,
  target: ReturnType<typeof getTarget>
): boolean {
  if (!attacker || !target) return false;

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

export function getUnitCombatPreview(
  attacker: BoardUnit,
  target: BoardUnit
): UnitCombatPreview {
  const attackerCard = getCard(attacker.cardId);
  const targetCard = getCard(target.cardId);
  const strikes: AttackAnimationStrike[] = [];
  let attackerHpAfter = attacker.currentHp;
  let targetHpAfter = target.currentHp;
  let tdAmbushTriggered = false;

  const attackTarget = () => {
    targetHpAfter -= attackerCard.attack;
    strikes.push({
      sourceId: attacker.instanceId,
      targetId: target.instanceId,
      damage: attackerCard.attack,
    });
  };

  const counterAttack = () => {
    attackerHpAfter -= targetCard.attack;
    strikes.push({
      sourceId: target.instanceId,
      targetId: attacker.instanceId,
      damage: targetCard.attack,
    });
  };

  const attackerUsesRangedAttack =
    attackerCard.class === "spg" ||
    chebyshevDistance(attacker.position, target.position) > 1;
  const targetCanUseTdAmbush =
    targetCard.class === "td" &&
    attackerCard.class !== "td" &&
    !target.tdAmbushUsedThisTurn &&
    !attackerUsesRangedAttack;

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
    targetCard.class !== "spg" &&
    attackerCard.class !== "spg" &&
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
  if (!canAttackTarget(attacker, target)) return [];

  if ("cardId" in attacker && "cardId" in target) {
    return getUnitCombatPreview(attacker, target).strikes;
  }

  return [
    {
      sourceId: getCombatObjectId(attacker),
      targetId: getCombatObjectId(target),
      damage: getAttackValue(attacker),
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

  state[unit.ownerId].discard.push({
    instanceId: unit.instanceId,
    cardId: unit.cardId,
  });

  addLog(state, `${card.name} ${reason}`);
}

function attack(state: BattleState, action: AttackAction) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;

  const attacker = getAttacker(state, action);
  const target = getTarget(state, action);

  if (!attacker || !target) return;
  if (attacker.ownerId !== action.playerId) return;
  if (target.ownerId === action.playerId) return;
  if (attacker.alreadyAttacked) return;
  if (!canAttackTarget(attacker, target)) return;

  const attackValue = getAttackValue(attacker);

  const attackerIsUnit = "cardId" in attacker;
  const targetIsUnit = "cardId" in target;

  const attackerCard = attackerIsUnit ? getCard(attacker.cardId) : null;
  const targetCard = targetIsUnit ? getCard(target.cardId) : null;

  const attackerName = attackerCard ? attackerCard.name : "Штаб";
  const targetName = targetCard ? targetCard.name : "штаб";

  if (targetIsUnit) {
    if (attackerIsUnit && attackerCard && targetCard) {
      const preview = getUnitCombatPreview(attacker, target);

      attacker.currentHp = preview.attackerHpAfter;
      target.currentHp = preview.targetHpAfter;
      target.tdAmbushUsedThisTurn =
        target.tdAmbushUsedThisTurn || preview.tdAmbushTriggered;

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
      target.currentHp -= attackValue;

      addLog(
        state,
        `${attackerName} атакует ${targetName} и наносит ${attackValue} урона.`
      );
    }

    if (target.currentHp <= 0) {
      destroyUnit(state, target, "уничтожен.", action.playerId);
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
    const incoming = attackValue;
    target.hp -= incoming;
    addLog(state, `${attackerName} атакует штаб и наносит ${incoming} урона.`);

    if (target.hp <= 0) {
      state.status = target.ownerId === "player" ? "bot_won" : "player_won";

      addLog(
        state,
        target.ownerId === "player" ? "Бот победил." : "Игрок победил."
      );
    }
  }

  attacker.alreadyAttacked = true;

  if (state.status === "active") {
    markSuccessfulAction(state, action.playerId);
  }
}

function getLightTankMoveCost(
  from: Position,
  to: Position,
  isSpawnBonusMove: boolean
): number | null {
  const straight = isStraightMove(from, to);
  const diagonal = isDiagonalMove(from, to);
  const manhattan = manhattanDistance(from, to);

  if (isSpawnBonusMove) {
    return straight && manhattan === 1 ? 1 : null;
  }

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
  isSpawnBonusMove: boolean,
  moveCountThisTurn = 0
): boolean {
  if (samePosition(from, to)) return false;

  const straight = isStraightMove(from, to);
  const manhattan = manhattanDistance(from, to);

  if (card.class === "light") {
    const moveCost = getLightTankMoveCost(from, to, isSpawnBonusMove);

    if (moveCost === null) return false;

    if (isSpawnBonusMove) {
      // Spawn bonus is only 1 cell straight
      return straight && manhattan === 1;
    }

    return moveCountThisTurn + moveCost <= 2;
  }

  if (card.class === "medium") {
    return isAdjacentAnyDirection(from, to);
  }

  return straight && manhattan === 1;
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
  if (unit.alreadyMoved) return;
  if (isCellOccupied(state, action.position)) return;

  const card = getCard(unit.cardId);
  const fromPosition = unit.position;
  const isLightTank = card.class === "light";
  const moveCountThisTurn = unit.moveCountThisTurn ?? 0;
  const isSpawnBonusMove = isLightTank && unit.spawnedThisTurn;

  if (
    !canUnitMoveTo(
      card,
      fromPosition,
      action.position,
      isSpawnBonusMove,
      moveCountThisTurn
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

  unit.position = action.position;

  if (isLightTank) {
    const moveCost =
      getLightTankMoveCost(fromPosition, action.position, isSpawnBonusMove) ?? 1;

    if (isSpawnBonusMove) {
      unit.moveCountThisTurn = 1;
      unit.alreadyMoved = true;
    } else {
      const nextMoveCount = moveCountThisTurn + moveCost;

      unit.moveCountThisTurn = nextMoveCount;
      unit.alreadyMoved = nextMoveCount >= 2;
    }

    unit.spawnedThisTurn = false;
  } else {
    unit.alreadyMoved = true;
    unit.spawnedThisTurn = false;
    unit.moveCountThisTurn = 1;
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
      } не сделал действие за 15 секунд. Ход пропущен.`
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

    case "MOVE_UNIT":
      moveUnit(nextState, action);
      break;

    case "ATTACK":
      attack(nextState, action);
      break;

    case "END_TURN":
      markSuccessfulAction(nextState, action.playerId);
      endTurn(nextState, action.playerId);
      break;

    case "TIMER_TICK":
      timerTick(nextState, action);
      break;

    default:
      return nextState;
  }

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
    (unit) => unit.ownerId === opponent && canAttackTarget(attacker, unit)
  );

  const enemyHq = state.headquarters[opponent];
  const hqInRange = canAttackTarget(attacker, enemyHq);

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
  if (unit.alreadyMoved) return [];

  const card = getCard(unit.cardId);

  const result: Position[] = [];

  const rows = [0, 1, 2] as const;
  const cols = [0, 1, 2, 3, 4] as const;

  const isSpawnBonusMove = card.class === "light" && unit.spawnedThisTurn;
  const moveCountThisTurn = unit.moveCountThisTurn ?? 0;

  for (const row of rows) {
    for (const col of cols) {
      const position: Position = { row, col };

      if (isCellOccupied(state, position)) continue;

      if (
        !canUnitMoveTo(
          card,
          unit.position,
          position,
          isSpawnBonusMove,
          moveCountThisTurn
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

      result.push(position);
    }
  }

  return result;
}
