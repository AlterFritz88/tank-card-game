import { getCard } from "./cards";
import {
  applyAction,
  getAvailableMoveCells,
  getFreeSpawnCells,
  getTargetsInRange,
} from "./engine";
import type { BattleState, BoardUnit, Position } from "./types";

function getDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function getEnemyUnitById(state: BattleState, unitId: string): BoardUnit | undefined {
  return state.units.find((unit) => unit.instanceId === unitId && unit.ownerId === "player");
}

function chooseBestAttackTarget(
  state: BattleState,
  attackerId: string,
  attackerType: "unit" | "headquarters"
) {
  const targets = getTargetsInRange(state, "bot", attackerType, attackerId);

  if (targets.length === 0) return null;

  const playerHqTarget = targets.find((target) => target.type === "headquarters");

  if (playerHqTarget) {
    return playerHqTarget;
  }

  const killableTarget = targets.find((target) => {
    if (target.type !== "unit") return false;

    const enemyUnit = getEnemyUnitById(state, target.id);
    if (!enemyUnit) return false;

    const enemyCard = getCard(enemyUnit.cardId);

    let attackValue = 1;

    if (attackerType === "unit") {
      const attackerUnit = state.units.find((unit) => unit.instanceId === attackerId);
      if (!attackerUnit) return false;
      attackValue = getCard(attackerUnit.cardId).attack;
    }

    const damage = Math.max(1, attackValue - enemyCard.armor);

    return enemyUnit.currentHp <= damage;
  });

  if (killableTarget) {
    return killableTarget;
  }

  const playerHqPosition = state.headquarters.player.position;

  const unitTargets = targets
    .filter((target) => target.type === "unit")
    .map((target) => {
      const enemyUnit = getEnemyUnitById(state, target.id);

      return {
        target,
        distanceToHq: enemyUnit
          ? getDistance(enemyUnit.position, playerHqPosition)
          : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.distanceToHq - b.distanceToHq);

  return unitTargets[0]?.target ?? targets[0];
}

function attackWithAvailableUnits(state: BattleState): BattleState {
  let nextState = state;

  const botUnits = [...nextState.units].filter((unit) => unit.ownerId === "bot");

  for (const unit of botUnits) {
    const bestTarget = chooseBestAttackTarget(nextState, unit.instanceId, "unit");

    if (!bestTarget) continue;

    nextState = applyAction(nextState, {
      type: "ATTACK",
      playerId: "bot",
      attackerType: "unit",
      attackerId: unit.instanceId,
      targetType: bestTarget.type,
      targetId: bestTarget.id,
    });

    if (nextState.status !== "active") {
      return nextState;
    }
  }

  const hqTarget = chooseBestAttackTarget(nextState, "bot_hq", "headquarters");

  if (hqTarget) {
    nextState = applyAction(nextState, {
      type: "ATTACK",
      playerId: "bot",
      attackerType: "headquarters",
      attackerId: "bot_hq",
      targetType: hqTarget.type,
      targetId: hqTarget.id,
    });
  }

  return nextState;
}

function moveUnitsTowardPlayerHq(state: BattleState): BattleState {
  let nextState = state;

  const botUnits = [...nextState.units].filter(
    (unit) => unit.ownerId === "bot" && !unit.alreadyMoved
  );

  for (const unit of botUnits) {
    const moveCells = getAvailableMoveCells(nextState, "bot", unit.instanceId);

    if (moveCells.length === 0) continue;

    const playerHq = nextState.headquarters.player.position;

    const bestCell = moveCells
      .map((cell) => ({
        cell,
        distanceToPlayerHq: getDistance(cell, playerHq),
      }))
      .sort((a, b) => a.distanceToPlayerHq - b.distanceToPlayerHq)[0];

    if (!bestCell) continue;

    const currentDistance = getDistance(unit.position, playerHq);

    if (bestCell.distanceToPlayerHq >= currentDistance) {
      continue;
    }

    nextState = applyAction(nextState, {
      type: "MOVE_UNIT",
      playerId: "bot",
      unitId: unit.instanceId,
      position: bestCell.cell,
    });
  }

  return nextState;
}

function playBestAvailableCard(state: BattleState): BattleState {
  let nextState = state;

  const bot = nextState.bot;
  const freeSpawnCells = getFreeSpawnCells(nextState, "bot");

  if (freeSpawnCells.length === 0) return nextState;

  const playableCards = bot.hand
    .map((cardInstance) => ({
      instance: cardInstance,
      card: getCard(cardInstance.cardId),
    }))
    .filter(({ card }) => card.cost <= bot.resources)
    .sort((a, b) => {
      if (b.card.cost !== a.card.cost) {
        return b.card.cost - a.card.cost;
      }

      return b.card.attack - a.card.attack;
    });

  if (playableCards.length === 0) return nextState;

  const playerHq = nextState.headquarters.player.position;

  const bestSpawnCell = freeSpawnCells
    .map((cell) => ({
      cell,
      distanceToPlayerHq: getDistance(cell, playerHq),
    }))
    .sort((a, b) => a.distanceToPlayerHq - b.distanceToPlayerHq)[0];

  if (!bestSpawnCell) return nextState;

  nextState = applyAction(nextState, {
    type: "PLAY_CARD",
    playerId: "bot",
    cardInstanceId: playableCards[0].instance.instanceId,
    position: bestSpawnCell.cell,
  });

  return nextState;
}

export function runBotTurn(state: BattleState): BattleState {
  let nextState = state;

  if (nextState.status !== "active") return nextState;
  if (nextState.activePlayer !== "bot") return nextState;

  nextState = attackWithAvailableUnits(nextState);

  if (nextState.status !== "active") return nextState;

  nextState = moveUnitsTowardPlayerHq(nextState);

  nextState = playBestAvailableCard(nextState);

  nextState = applyAction(nextState, {
    type: "END_TURN",
    playerId: "bot",
  });

  return nextState;
}