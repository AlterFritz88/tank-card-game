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

function getBotUnitById(
  state: BattleState,
  unitId: string
): BoardUnit | undefined {
  return state.units.find(
    (unit) => unit.instanceId === unitId && unit.ownerId === "bot"
  );
}

function getBotBoardStrength(state: BattleState): number {
  return state.units
    .filter((unit) => unit.ownerId === "bot")
    .reduce((total, unit) => {
      const card = getCard(unit.cardId);
      return total + card.attack + card.currentHp + card.fuelGeneration;
    }, 0);
}

function getPlayerBoardStrength(state: BattleState): number {
  return state.units
    .filter((unit) => unit.ownerId === "player")
    .reduce((total, unit) => {
      const card = getCard(unit.cardId);
      return total + card.attack + unit.currentHp + card.fuelGeneration;
    }, 0);
}

function scoreCardForBot(cardId: string): number {
  const card = getCard(cardId);

  const classBonus =
    card.class === "spg"
      ? 3
      : card.class === "td"
        ? 2
        : card.class === "heavy"
          ? 2
          : card.class === "medium"
            ? 1
            : 0;

  return (
    card.attack * 3 +
    card.hp * 2 +
    card.fuelGeneration * 5 -
    card.actionFuelCost +
    classBonus
  );
}

function getBestPlayableCard(state: BattleState) {
  const freeSpawnCells = getFreeSpawnCells(state, "bot");

  if (freeSpawnCells.length === 0) return null;

  const playableCards = state.bot.hand
    .map((cardInstance) => ({
      instance: cardInstance,
      card: getCard(cardInstance.cardId),
      score: scoreCardForBot(cardInstance.cardId),
    }))
    .filter(({ card }) => card.cost <= state.bot.resources)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.card.cost - a.card.cost;
    });

  return playableCards[0] ?? null;
}

function getFuelReserveForSpawn(state: BattleState): number {
  const freeSpawnCells = getFreeSpawnCells(state, "bot");

  if (freeSpawnCells.length === 0) return 0;

  const affordableCards = state.bot.hand
    .map((cardInstance) => getCard(cardInstance.cardId))
    .filter((card) => card.cost <= state.bot.resources)
    .sort((a, b) => {
      const scoreA = scoreCardForBot(a.id);
      const scoreB = scoreCardForBot(b.id);

      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.cost - a.cost;
    });

  const bestCard = affordableCards[0];

  if (!bestCard) return 0;

  return bestCard.cost;
}

function canSpendWithReserve(
  state: BattleState,
  cost: number,
  reserve: number
): boolean {
  return state.bot.resources - cost >= reserve;
}

function getAttackValue(
  state: BattleState,
  attackerType: "unit" | "headquarters",
  attackerId: string
): number {
  if (attackerType === "headquarters") {
    return state.headquarters.bot.attack;
  }

  const attacker = getBotUnitById(state, attackerId);

  if (!attacker) return 0;

  return getCard(attacker.cardId).attack;
}

function getActionFuelCost(
  state: BattleState,
  attackerType: "unit" | "headquarters",
  attackerId: string
): number {
  if (attackerType === "headquarters") {
    return state.headquarters.bot.actionFuelCost;
  }

  const attacker = getBotUnitById(state, attackerId);

  if (!attacker) return Number.MAX_SAFE_INTEGER;

  return getCard(attacker.cardId).actionFuelCost;
}

function chooseBestAttackTarget(
  state: BattleState,
  attackerId: string,
  attackerType: "unit" | "headquarters"
) {
  const targets = getTargetsInRange(state, "bot", attackerType, attackerId);

  if (targets.length === 0) return null;

  const attackValue = getAttackValue(state, attackerType, attackerId);

  const playerHqTarget = targets.find(
    (target) => target.type === "headquarters"
  );

  if (
    playerHqTarget &&
    state.headquarters.player.hp <= attackValue
  ) {
    return playerHqTarget;
  }

  const killableUnitTargets = targets
    .filter((target) => target.type === "unit")
    .map((target) => {
      const enemyUnit = getEnemyUnitById(state, target.id);

      if (!enemyUnit) return null;

      const enemyCard = getCard(enemyUnit.cardId);
      const overkill = attackValue - enemyUnit.currentHp;

      if (overkill < 0) return null;

      return {
        target,
        score:
          enemyCard.attack * 3 +
          enemyCard.fuelGeneration * 5 +
          enemyCard.hp * 2 -
          overkill,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score);

  if (killableUnitTargets.length > 0) {
    return killableUnitTargets[0].target;
  }

  const dangerousUnitTargets = targets
    .filter((target) => target.type === "unit")
    .map((target) => {
      const enemyUnit = getEnemyUnitById(state, target.id);

      if (!enemyUnit) return null;

      const enemyCard = getCard(enemyUnit.cardId);
      const distanceToBotHq = getDistance(
        enemyUnit.position,
        state.headquarters.bot.position
      );

      return {
        target,
        score:
          enemyCard.attack * 3 +
          enemyCard.fuelGeneration * 4 +
          enemyUnit.currentHp -
          distanceToBotHq,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score);

  if (dangerousUnitTargets.length > 0) {
    return dangerousUnitTargets[0].target;
  }

  if (playerHqTarget) {
    return playerHqTarget;
  }

  return targets[0];
}

function getLethalAttackAction(state: BattleState): BattleAction | null {
  const botUnits = state.units.filter((unit) => unit.ownerId === "bot");

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const card = getCard(unit.cardId);

    if (state.bot.resources < card.actionFuelCost) continue;

    const targets = getTargetsInRange(state, "bot", "unit", unit.instanceId);

    const lethalHqTarget = targets.find(
      (target) =>
        target.type === "headquarters" &&
        state.headquarters.player.hp <= card.attack
    );

    if (lethalHqTarget) {
      return {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: lethalHqTarget.type,
        targetId: lethalHqTarget.id,
      };
    }
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    const hqCost = state.headquarters.bot.actionFuelCost;

    if (state.bot.resources >= hqCost) {
      const targets = getTargetsInRange(
        state,
        "bot",
        "headquarters",
        "bot_hq"
      );

      const lethalHqTarget = targets.find(
        (target) =>
          target.type === "headquarters" &&
          state.headquarters.player.hp <= state.headquarters.bot.attack
      );

      if (lethalHqTarget) {
        return {
          type: "ATTACK",
          playerId: "bot",
          attackerType: "headquarters",
          attackerId: "bot_hq",
          targetType: lethalHqTarget.type,
          targetId: lethalHqTarget.id,
        };
      }
    }
  }

  return null;
}

function getKillUnitAttackAction(state: BattleState): BattleAction | null {
  const botUnits = state.units.filter((unit) => unit.ownerId === "bot");

  const candidates: {
    action: BattleAction;
    score: number;
  }[] = [];

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const card = getCard(unit.cardId);

    if (state.bot.resources < card.actionFuelCost) continue;

    const targets = getTargetsInRange(state, "bot", "unit", unit.instanceId);

    for (const target of targets) {
      if (target.type !== "unit") continue;

      const enemyUnit = getEnemyUnitById(state, target.id);

      if (!enemyUnit) continue;

      const enemyCard = getCard(enemyUnit.cardId);

      if (enemyUnit.currentHp > card.attack) continue;

      candidates.push({
        action: {
          type: "ATTACK",
          playerId: "bot",
          attackerType: "unit",
          attackerId: unit.instanceId,
          targetType: target.type,
          targetId: target.id,
        },
        score:
          enemyCard.attack * 3 +
          enemyCard.fuelGeneration * 5 +
          enemyCard.hp * 2,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? null;
}

function getStrategicPlayCardAction(state: BattleState): BattleAction | null {
  const bestCard = getBestPlayableCard(state);

  if (!bestCard) return null;

  const freeSpawnCells = getFreeSpawnCells(state, "bot");

  if (freeSpawnCells.length === 0) return null;

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
    cardInstanceId: bestCard.instance.instanceId,
    position: bestSpawnCell.cell,
  };
}

function getNormalAttackAction(state: BattleState): BattleAction | null {
  const reserve = getFuelReserveForSpawn(state);

  const botUnits = state.units.filter((unit) => unit.ownerId === "bot");

  const candidates: {
    action: BattleAction;
    score: number;
    cost: number;
  }[] = [];

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const card = getCard(unit.cardId);
    const cost = card.actionFuelCost;

    if (state.bot.resources < cost) continue;
    if (!canSpendWithReserve(state, cost, reserve)) continue;

    const bestTarget = chooseBestAttackTarget(state, unit.instanceId, "unit");

    if (!bestTarget) continue;

    let score = card.attack * 2;

    if (bestTarget.type === "headquarters") {
      score += 4;
    }

    if (bestTarget.type === "unit") {
      const enemyUnit = getEnemyUnitById(state, bestTarget.id);

      if (enemyUnit) {
        const enemyCard = getCard(enemyUnit.cardId);
        score += enemyCard.attack * 2 + enemyCard.fuelGeneration * 3;
      }
    }

    candidates.push({
      action: {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: bestTarget.type,
        targetId: bestTarget.id,
      },
      score,
      cost,
    });
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    const cost = state.headquarters.bot.actionFuelCost;

    if (
      state.bot.resources >= cost &&
      canSpendWithReserve(state, cost, reserve)
    ) {
      const bestTarget = chooseBestAttackTarget(state, "bot_hq", "headquarters");

      if (bestTarget) {
        candidates.push({
          action: {
            type: "ATTACK",
            playerId: "bot",
            attackerType: "headquarters",
            attackerId: "bot_hq",
            targetType: bestTarget.type,
            targetId: bestTarget.id,
          },
          score: bestTarget.type === "headquarters" ? 3 : 2,
          cost,
        });
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.cost - b.cost;
  });

  return candidates[0]?.action ?? null;
}

function getStrategicMoveAction(state: BattleState): BattleAction | null {
  const reserve = getFuelReserveForSpawn(state);

  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && !unit.alreadyMoved
  );

  const candidates: {
    action: BattleAction;
    score: number;
    cost: number;
  }[] = [];

  for (const unit of botUnits) {
    const card = getCard(unit.cardId);
    const cost = card.actionFuelCost;

    if (state.bot.resources < cost) continue;
    if (!canSpendWithReserve(state, cost, reserve)) continue;

    const currentTargets = getTargetsInRange(
      state,
      "bot",
      "unit",
      unit.instanceId
    );

    // Если юнит уже может атаковать, движение обычно не нужно.
    if (!unit.alreadyAttacked && currentTargets.length > 0) {
      continue;
    }

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

    const distanceGain = currentDistance - bestCell.distanceToPlayerHq;

    if (distanceGain <= 0) continue;

    candidates.push({
      action: {
        type: "MOVE_UNIT",
        playerId: "bot",
        unitId: unit.instanceId,
        position: bestCell.cell,
      },
      score: distanceGain * 3 + card.attack,
      cost,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.cost - b.cost;
  });

  return candidates[0]?.action ?? null;
}

function shouldPrioritizeSpawn(state: BattleState): boolean {
  const bestCard = getBestPlayableCard(state);

  if (!bestCard) return false;

  const botUnitsCount = state.units.filter((unit) => unit.ownerId === "bot").length;
  const playerUnitsCount = state.units.filter(
    (unit) => unit.ownerId === "player"
  ).length;

  if (botUnitsCount === 0) return true;
  if (botUnitsCount < playerUnitsCount) return true;

  const botStrength = getBotBoardStrength(state);
  const playerStrength = getPlayerBoardStrength(state);

  if (botStrength < playerStrength) return true;

  // Если карта дает много топлива, бот старается играть ее раньше,
  // потому что она усилит экономику будущих ходов.
  if (bestCard.card.fuelGeneration >= 2) return true;

  return false;
}

export function getNextBotAction(state: BattleState): BattleAction | null {
  if (state.status !== "active") return null;
  if (state.activePlayer !== "bot") return null;

  // 1. Если можно немедленно победить — атакуем штаб.
  const lethalAttack = getLethalAttackAction(state);
  if (lethalAttack) return lethalAttack;

  // 2. Если можно уничтожить важный юнит — делаем это.
  const killUnitAttack = getKillUnitAttackAction(state);
  if (killUnitAttack) return killUnitAttack;

  // 3. Если бот отстает по столу или есть экономически важная карта —
  // сначала выставляет юнит, а не тратит топливо на движение.
  if (shouldPrioritizeSpawn(state)) {
    const playCardAction = getStrategicPlayCardAction(state);
    if (playCardAction) return playCardAction;
  }

  // 4. Обычная атака, но с резервом топлива под спавн.
  const normalAttack = getNormalAttackAction(state);
  if (normalAttack) return normalAttack;

  // 5. Движение, но только если оно улучшает позицию и не ломает резерв.
  const moveAction = getStrategicMoveAction(state);
  if (moveAction) return moveAction;

  // 6. Если осталось топливо и есть карта — разыгрываем карту.
  const playCardAction = getStrategicPlayCardAction(state);
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