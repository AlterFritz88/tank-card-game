import { getCard } from "./cards";
import {
  applyAction,
  getAvailableMoveCells,
  getFreeSpawnCells,
  getTargetsInRange,
} from "./engine";
import type { BattleAction, BattleState, BoardUnit, Position } from "./types";

function getDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function getEnemyUnitById(
  state: BattleState,
  unitId: string
): BoardUnit | undefined {
  return state.units.find(
    (unit) => unit.instanceId === unitId && unit.ownerId === "player"
  );
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

    let attackValue = 1;

    if (attackerType === "unit") {
      const attackerUnit = state.units.find(
        (unit) => unit.instanceId === attackerId
      );

      if (!attackerUnit) return false;

      attackValue = getCard(attackerUnit.cardId).attack;
    } else {
      attackValue = state.headquarters.bot.attack;
    }

    return enemyUnit.currentHp <= attackValue;
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

function getNextBotAttackAction(state: BattleState): BattleAction | null {
  const botUnits = state.units.filter((unit) => unit.ownerId === "bot");

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const card = getCard(unit.cardId);

    if (state.bot.resources < card.actionFuelCost) continue;

    const bestTarget = chooseBestAttackTarget(state, unit.instanceId, "unit");

    if (!bestTarget) continue;

    return {
      type: "ATTACK",
      playerId: "bot",
      attackerType: "unit",
      attackerId: unit.instanceId,
      targetType: bestTarget.type,
      targetId: bestTarget.id,
    };
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    if (state.bot.resources < state.headquarters.bot.actionFuelCost) {
      return null;
    }

    const hqTarget = chooseBestAttackTarget(state, "bot_hq", "headquarters");

    if (hqTarget) {
      return {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "headquarters",
        attackerId: "bot_hq",
        targetType: hqTarget.type,
        targetId: hqTarget.id,
      };
    }
  }

  return null;
}

function getNextBotMoveAction(state: BattleState): BattleAction | null {
  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && !unit.alreadyMoved
  );

  for (const unit of botUnits) {
    const card = getCard(unit.cardId);

    if (state.bot.resources < card.actionFuelCost) continue;

    const moveCells = getAvailableMoveCells(state, "bot", unit.instanceId);

    if (moveCells.length === 0) continue;

    const playerHq = state.headquarters.player.position;
    const currentDistance = getDistance(unit.position, playerHq);

    const bestCell = moveCells
      .map((cell) => ({
        cell,
        distanceToPlayerHq: getDistance(cell, playerHq),
      }))
      .sort((a, b) => a.distanceToPlayerHq - b.distanceToPlayerHq)[0];

    if (!bestCell) continue;

    if (bestCell.distanceToPlayerHq >= currentDistance) {
      continue;
    }

    return {
      type: "MOVE_UNIT",
      playerId: "bot",
      unitId: unit.instanceId,
      position: bestCell.cell,
    };
  }

  return null;
}

function getNextBotPlayCardAction(state: BattleState): BattleAction | null {
  const bot = state.bot;
  const freeSpawnCells = getFreeSpawnCells(state, "bot");

  if (freeSpawnCells.length === 0) return null;

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

  if (playableCards.length === 0) return null;

  const playerHq = state.headquarters.player.position;

  const bestSpawnCell = freeSpawnCells
    .map((cell) => ({
      cell,
      distanceToPlayerHq: getDistance(cell, playerHq),
    }))
    .sort((a, b) => a.distanceToPlayerHq - b.distanceToPlayerHq)[0];

  if (!bestSpawnCell) return null;

  return {
    type: "PLAY_CARD",
    playerId: "bot",
    cardInstanceId: playableCards[0].instance.instanceId,
    position: bestSpawnCell.cell,
  };
}

export function getNextBotAction(state: BattleState): BattleAction | null {
  if (state.status !== "active") return null;
  if (state.activePlayer !== "bot") return null;

  const attackAction = getNextBotAttackAction(state);

  if (attackAction) return attackAction;

  const moveAction = getNextBotMoveAction(state);

  if (moveAction) return moveAction;

  const playCardAction = getNextBotPlayCardAction(state);

  if (playCardAction) return playCardAction;

  return {
    type: "END_TURN",
    playerId: "bot",
  };
}

export function runBotTurn(state: BattleState): BattleState {
  let nextState = state;

  while (nextState.status === "active" && nextState.activePlayer === "bot") {
    const action = getNextBotAction(nextState);

    if (!action) break;

    nextState = applyAction(nextState, action);

    if (action.type === "END_TURN") {
      break;
    }
  }

  return nextState;
}