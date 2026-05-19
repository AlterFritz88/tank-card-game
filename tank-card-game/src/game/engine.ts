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

function addLog(state: BattleState, message: string) {
  state.log = [message, ...state.log].slice(0, 12);
}

function startTurn(state: BattleState, playerId: PlayerId) {
  const player = state[playerId];

  player.maxResources = Math.min(10, player.maxResources + 1);
  player.resources = player.maxResources;

  const drawnCard = player.deck[0];

  if (drawnCard) {
    player.hand.push(drawnCard);
    player.deck = player.deck.slice(1);
    addLog(state, `${playerId === "player" ? "Игрок" : "Бот"} добирает карту.`);
  }

  for (const unit of state.units) {
    if (unit.ownerId === playerId) {
      unit.alreadyAttacked = false;
      unit.alreadyMoved = false;
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

  if (player.resources < card.cost) return;

  player.resources -= card.cost;

  player.hand = player.hand.filter(
    (card) => card.instanceId !== action.cardInstanceId
  );

  const isLightTank = card.class === "light";

  const unit: BoardUnit = {
    instanceId: action.cardInstanceId,
    cardId: card.id,
    ownerId: action.playerId,
    position: action.position,
    currentHp: card.hp,

    // Обычные юниты после спавна не могут атаковать.
    // Легкий танк может сразу атаковать.
    alreadyAttacked: !isLightTank,

    // Обычные юниты после спавна не могут двигаться.
    // Легкий танк может сделать шаг на 1 клетку.
    alreadyMoved: !isLightTank,
  };

  state.units.push(unit);

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} размещает ${
      card.name
    } на [${action.position.row},${action.position.col}].`
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

function getAttackRange(attacker: ReturnType<typeof getAttacker>): number {
  if (!attacker) return 0;

  if ("cardId" in attacker) {
    const card = getCard(attacker.cardId);

    if (card.class === "td") {
      return 1;
    }

    return card.range;
  }

  return attacker.range;
}

function canUnitAttackTarget(
  attackerCard: TankCard,
  attackerPosition: Position,
  targetPosition: Position
): boolean {
  const range = attackerCard.class === "td" ? 1 : attackerCard.range;

  // ПТ-САУ атакует только соседние клетки, включая диагональ.
  if (attackerCard.class === "td") {
    return isAdjacentAnyDirection(attackerPosition, targetPosition);
  }

  // Все остальные юниты могут атаковать по диагонали,
  // поэтому используем Chebyshev distance.
  return chebyshevDistance(attackerPosition, targetPosition) <= range;
}

function canAttackTarget(
  attacker: ReturnType<typeof getAttacker>,
  target: ReturnType<typeof getTarget>
): boolean {
  if (!attacker || !target) return false;

  // Штабы атакуют любые вражеские цели в пределах своей дальности.
  // При range 99 они достают всю карту.
  if (!("cardId" in attacker)) {
    return manhattanDistance(attacker.position, target.position) <= attacker.range;
  }

  const attackerCard = getCard(attacker.cardId);

  return canUnitAttackTarget(attackerCard, attacker.position, target.position);
}

function destroyUnit(state: BattleState, unit: BoardUnit, reason: string) {
  const card = getCard(unit.cardId);

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
    target.currentHp -= attackValue;

    addLog(
      state,
      `${attackerName} атакует ${targetName} и наносит ${attackValue} урона.`
    );

    const targetDestroyed = target.currentHp <= 0;

    // Ответный урон получает только атакующий юнит.
    // Штаб и САУ ответный урон не получают.
    const attackerCanReceiveCounterDamage =
      attackerIsUnit && attackerCard?.class !== "spg";

    // ПТ-САУ получает ответный урон только если не уничтожила цель.
    const tdAvoidsCounterDamage =
      attackerCard?.class === "td" && targetDestroyed;

    if (
      attackerCanReceiveCounterDamage &&
      !tdAvoidsCounterDamage &&
      targetCard
    ) {
      const counterDamage = targetCard.attack;

      attacker.currentHp -= counterDamage;

      addLog(
        state,
        `${targetName} отвечает огнем и наносит ${counterDamage} урона.`
      );
    }

    if (targetDestroyed) {
      destroyUnit(state, target, "уничтожен.");
    }

    if (attackerIsUnit && attacker.currentHp <= 0) {
      destroyUnit(state, attacker, "уничтожен ответным огнем.");
    }
  } else {
    target.hp -= attackValue;

    addLog(
      state,
      `${attackerName} атакует штаб и наносит ${attackValue} урона.`
    );

    if (target.hp <= 0) {
      state.status = target.ownerId === "player" ? "bot_won" : "player_won";

      addLog(
        state,
        target.ownerId === "player" ? "Бот победил." : "Игрок победил."
      );
    }
  }

  attacker.alreadyAttacked = true;
}

function canUnitMoveTo(
  card: TankCard,
  from: Position,
  to: Position,
  isSpawnBonusMove: boolean
): boolean {
  if (samePosition(from, to)) return false;

  const diagonal = isDiagonalMove(from, to);
  const straight = isStraightMove(from, to);
  const manhattan = manhattanDistance(from, to);

  // Бонусное движение легкого танка после спавна:
  // 1 клетка в любом направлении.
  if (isSpawnBonusMove && card.class === "light") {
    return isAdjacentAnyDirection(from, to);
  }

  if (card.class === "light") {
    // Легкий танк:
    // - диагональ на 1;
    // - прямо на 1 или 2.
    return (diagonal && manhattan === 2) || (straight && manhattan <= 2);
  }

  if (card.class === "medium") {
    // Средний танк:
    // - 1 клетка в любом направлении.
    return isAdjacentAnyDirection(from, to);
  }

  // Тяжелые, ПТ-САУ и САУ:
  // - 1 клетка только прямо.
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

  const isSpawnBonusMove =
    card.class === "light" && !unit.alreadyMoved && !unit.alreadyAttacked;

  if (!canUnitMoveTo(card, unit.position, action.position, isSpawnBonusMove)) {
    return;
  }

  unit.position = action.position;
  unit.alreadyMoved = true;

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} перемещает ${
      card.name
    } на [${action.position.row},${action.position.col}].`
  );
}

function endTurn(state: BattleState, playerId: PlayerId) {
  if (state.status !== "active") return;
  if (state.activePlayer !== playerId) return;

  const nextPlayer = getOpponent(playerId);

  state.activePlayer = nextPlayer;

  if (nextPlayer === "player") {
    state.turn += 1;
  }

  startTurn(state, nextPlayer);

  addLog(
    state,
    `Ход переходит к ${nextPlayer === "player" ? "игроку" : "боту"}.`
  );
}

export function applyAction(
  state: BattleState,
  action: BattleAction
): BattleState {
  const nextState = cloneState(state);

  switch (action.type) {
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
      endTurn(nextState, action.playerId);
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

  const isSpawnBonusMove =
    card.class === "light" && !unit.alreadyMoved && !unit.alreadyAttacked;

  for (const row of rows) {
    for (const col of cols) {
      const position: Position = { row, col };

      if (isCellOccupied(state, position)) continue;

      if (!canUnitMoveTo(card, unit.position, position, isSpawnBonusMove)) {
        continue;
      }

      result.push(position);
    }
  }

  return result;
}