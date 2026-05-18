import { getCard } from "./cards";
import type {
  AttackAction,
  BattleAction,
  BattleState,
  BoardUnit,
  PlayerId,
  Position,
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
  const spawnCells = playerId === "player" ? PLAYER_SPAWN_CELLS : BOT_SPAWN_CELLS;
  return spawnCells.some((cell) => samePosition(cell, position));
}

function isCellOccupied(state: BattleState, position: Position): boolean {
  const unitOnCell = state.units.some((unit) => samePosition(unit.position, position));
  const playerHq = samePosition(state.headquarters.player.position, position);
  const botHq = samePosition(state.headquarters.bot.position, position);

  return unitOnCell || playerHq || botHq;
}

function getOpponent(playerId: PlayerId): PlayerId {
  return playerId === "player" ? "bot" : "player";
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
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

function playCard(state: BattleState, action: Extract<BattleAction, { type: "PLAY_CARD" }>) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;
  if (!isSpawnCell(action.playerId, action.position)) return;
  if (isCellOccupied(state, action.position)) return;

  const player = state[action.playerId];
  const cardInHand = player.hand.find((card) => card.instanceId === action.cardInstanceId);

  if (!cardInHand) return;

  const card = getCard(cardInHand.cardId);

  if (player.resources < card.cost) return;

  player.resources -= card.cost;
  player.hand = player.hand.filter((card) => card.instanceId !== action.cardInstanceId);

const unit: BoardUnit = {
  instanceId: action.cardInstanceId,
  cardId: card.id,
  ownerId: action.playerId,
  position: action.position,
  currentHp: card.hp,
  alreadyAttacked: true,
  alreadyMoved: true,
};

  state.units.push(unit);

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} размещает ${card.name} на [${action.position.row},${action.position.col}].`
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
    return getCard(attacker.cardId).range;
  }

  return attacker.range;
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

  const attackRange = getAttackRange(attacker);
  const attackDistance = distance(attacker.position, target.position);

  if (attackDistance > attackRange) return;

  const attackValue = getAttackValue(attacker);

  if ("cardId" in target) {
    const targetCard = getCard(target.cardId);
    const damage = Math.max(1, attackValue - targetCard.armor);

    target.currentHp -= damage;

    const attackerName = "cardId" in attacker ? getCard(attacker.cardId).name : "Штаб";
    const targetName = getCard(target.cardId).name;

    addLog(state, `${attackerName} атакует ${targetName} и наносит ${damage} урона.`);

    if (target.currentHp <= 0) {
      state.units = state.units.filter((unit) => unit.instanceId !== target.instanceId);
      state[target.ownerId].discard.push({
        instanceId: target.instanceId,
        cardId: target.cardId,
      });
      addLog(state, `${targetName} уничтожен.`);
    }
  } else {
    const damage = attackValue;

    target.hp -= damage;

    const attackerName = "cardId" in attacker ? getCard(attacker.cardId).name : "Штаб";
    addLog(state, `${attackerName} атакует штаб и наносит ${damage} урона.`);

    if (target.hp <= 0) {
      state.status = target.ownerId === "player" ? "bot_won" : "player_won";
      addLog(state, target.ownerId === "player" ? "Бот победил." : "Игрок победил.");
    }
  }

  attacker.alreadyAttacked = true;
}

function moveUnit(state: BattleState, action: Extract<BattleAction, { type: "MOVE_UNIT" }>) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;

  const unit = state.units.find((item) => item.instanceId === action.unitId);

  if (!unit) return;
  if (unit.ownerId !== action.playerId) return;
  if (unit.alreadyMoved) return;
  if (isCellOccupied(state, action.position)) return;

  const card = getCard(unit.cardId);
  const moveDistance = distance(unit.position, action.position);

  if (moveDistance < 1) return;
  if (moveDistance > card.movement) return;

  unit.position = action.position;
  unit.alreadyMoved = true;

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} перемещает ${card.name} на [${action.position.row},${action.position.col}].`
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

  addLog(state, `Ход переходит к ${nextPlayer === "player" ? "игроку" : "боту"}.`);
}

export function applyAction(state: BattleState, action: BattleAction): BattleState {
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

export function getFreeSpawnCells(state: BattleState, playerId: PlayerId): Position[] {
  const spawnCells = playerId === "player" ? PLAYER_SPAWN_CELLS : BOT_SPAWN_CELLS;
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

  const range = getAttackRange(attacker);
  const opponent = getOpponent(playerId);

  const enemyUnits = state.units.filter(
    (unit) => unit.ownerId === opponent && distance(attacker.position, unit.position) <= range
  );

  const enemyHq = state.headquarters[opponent];
  const hqInRange = distance(attacker.position, enemyHq.position) <= range;

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

  for (const row of rows) {
    for (const col of cols) {
      const position: Position = { row, col };
      const moveDistance = distance(unit.position, position);

      if (moveDistance < 1) continue;
      if (moveDistance > card.movement) continue;
      if (isCellOccupied(state, position)) continue;

      result.push(position);
    }
  }

  return result;
}