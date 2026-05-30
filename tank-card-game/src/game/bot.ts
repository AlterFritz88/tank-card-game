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

function getChebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function canCardAttackPosition(
  cardId: string,
  from: Position,
  to: Position
): boolean {
  const card = getCard(cardId);

  if (card.class === "spg") return true;
  if (card.class === "td") return getChebyshevDistance(from, to) === 1;

  return getChebyshevDistance(from, to) <= card.range;
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
      return total + card.attack + unit.currentHp + card.fuelGeneration;
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

function getClassThreatBonus(cardId: string): number {
  const card = getCard(cardId);

  if (card.class === "spg") return 8;
  if (card.class === "td") return 6;
  if (card.class === "heavy") return 5;
  if (card.class === "medium") return 3;
  return 1;
}

function getUnitThreatScore(state: BattleState, unit: BoardUnit): number {
  const card = getCard(unit.cardId);
  const distanceToBotHq = getDistance(
    unit.position,
    state.headquarters.bot.position
  );
  const distancePressure = Math.max(0, 7 - distanceToBotHq) * 4;
  const damagedBonus = Math.max(0, card.hp - unit.currentHp);
  const canAttackBotHq = canCardAttackPosition(
    unit.cardId,
    unit.position,
    state.headquarters.bot.position
  );

  return (
    card.attack * 6 +
    card.fuelGeneration * 7 +
    card.range * 2 +
    card.movement +
    getClassThreatBonus(unit.cardId) +
    distancePressure +
    damagedBonus +
    (canAttackBotHq ? 18 : 0)
  );
}

function getMostDangerousEnemyUnit(state: BattleState): BoardUnit | null {
  const enemyUnits = state.units.filter((unit) => unit.ownerId === "player");

  return (
    enemyUnits
      .map((unit) => ({
        unit,
        score: getUnitThreatScore(state, unit),
      }))
      .sort((a, b) => b.score - a.score)[0]?.unit ?? null
  );
}

function getEnemyPressureScore(state: BattleState): number {
  return state.units
    .filter((unit) => unit.ownerId === "player")
    .reduce((total, unit) => total + getUnitThreatScore(state, unit), 0);
}

function getEconomyGap(state: BattleState): number {
  return state.player.maxResources - state.bot.maxResources;
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
    card.fuelGeneration * 5 +
    classBonus
  );
}

function scoreCardForCurrentBattle(state: BattleState, cardId: string): number {
  const card = getCard(cardId);
  const economyGap = getEconomyGap(state);
  const botUnitsCount = state.units.filter((unit) => unit.ownerId === "bot").length;
  const playerUnitsCount = state.units.filter(
    (unit) => unit.ownerId === "player"
  ).length;
  const needsBoard = botUnitsCount <= playerUnitsCount;
  const economyMultiplier =
    state.turn <= 4 || economyGap > 0 ? 9 : economyGap < -1 ? 3 : 6;

  return (
    scoreCardForBot(cardId) +
    card.fuelGeneration * economyMultiplier +
    (needsBoard ? card.hp + card.attack * 2 : 0) +
    (card.cost <= state.bot.resources ? 2 : 0)
  );
}

function getBestPlayableCard(state: BattleState) {
  const freeSpawnCells = getFreeSpawnCells(state, "bot");

  if (freeSpawnCells.length === 0) return null;

  const playableCards = state.bot.hand
    .map((cardInstance) => ({
      instance: cardInstance,
      card: getCard(cardInstance.cardId),
      score: scoreCardForCurrentBattle(state, cardInstance.cardId),
    }))
    .filter(({ card }) => card.cost <= state.bot.resources)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.card.cost - a.card.cost;
    });

  return playableCards[0] ?? null;
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

function getCounterDamageRisk(
  attackValue: number,
  attackerCardId: string | null,
  attackerHp: number | null,
  targetUnit: BoardUnit
): number {
  if (!attackerCardId || attackerHp === null) return 0;

  const attackerCard = getCard(attackerCardId);
  const targetCard = getCard(targetUnit.cardId);
  const targetDestroyed = targetUnit.currentHp <= attackValue;

  if (attackerCard.class === "spg") return 0;
  if (attackerCard.class === "td" && targetDestroyed) return 0;

  const wouldDie = attackerHp <= targetCard.attack;

  return targetCard.attack * 3 + (wouldDie ? 28 : 0);
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
          getUnitThreatScore(state, enemyUnit) +
          enemyCard.attack * 2 +
          enemyCard.fuelGeneration * 4 +
          enemyCard.hp -
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
          getUnitThreatScore(state, enemyUnit) +
          enemyCard.attack * 2 +
          enemyUnit.currentHp -
          distanceToBotHq * 2,
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
          getUnitThreatScore(state, enemyUnit) +
          enemyCard.attack * 3 +
          enemyCard.fuelGeneration * 5 +
          enemyCard.hp * 2 -
          Math.max(0, card.attack - enemyUnit.currentHp),
      });
    }
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    const targets = getTargetsInRange(
      state,
      "bot",
      "headquarters",
      "bot_hq"
    );

    for (const target of targets) {
      if (target.type !== "unit") continue;

      const enemyUnit = getEnemyUnitById(state, target.id);

      if (!enemyUnit) continue;

      const enemyCard = getCard(enemyUnit.cardId);

      if (enemyUnit.currentHp > state.headquarters.bot.attack) continue;

      candidates.push({
        action: {
          type: "ATTACK",
          playerId: "bot",
          attackerType: "headquarters",
          attackerId: "bot_hq",
          targetType: target.type,
          targetId: target.id,
        },
        score:
          getUnitThreatScore(state, enemyUnit) +
          enemyCard.attack * 2 +
          enemyCard.fuelGeneration * 5,
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
  const botHq = state.headquarters.bot.position;
  const mostDangerousEnemy = getMostDangerousEnemyUnit(state);

  const bestSpawnCell = freeSpawnCells
    .map((cell) => {
      const distanceToPlayerHq = getDistance(cell, playerHq);
      const distanceToBotHq = getDistance(cell, botHq);
      const distanceToThreat = mostDangerousEnemy
        ? getDistance(cell, mostDangerousEnemy.position)
        : 0;
      const card = bestCard.card;
      const economyCardBonus = card.fuelGeneration > 0 ? distanceToBotHq : 0;
      const defensiveBonus = mostDangerousEnemy
        ? Math.max(0, 5 - distanceToThreat) * 3
        : 0;
      const offensiveBonus = Math.max(0, 7 - distanceToPlayerHq) * 2;

      return {
        cell,
        score: offensiveBonus + defensiveBonus + economyCardBonus,
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!bestSpawnCell) return null;

  return {
    type: "PLAY_CARD",
    playerId: "bot",
    cardInstanceId: bestCard.instance.instanceId,
    position: bestSpawnCell.cell,
  };
}

function getNormalAttackAction(state: BattleState): BattleAction | null {
  const botUnits = state.units.filter((unit) => unit.ownerId === "bot");

  const candidates: {
    action: BattleAction;
    score: number;
  }[] = [];

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const card = getCard(unit.cardId);
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
        score +=
          getUnitThreatScore(state, enemyUnit) +
          enemyCard.attack * 2 +
          enemyCard.fuelGeneration * 3;

        score -= getCounterDamageRisk(
          card.attack,
          unit.cardId,
          unit.currentHp,
          enemyUnit
        );
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
    });
  }

  if (!state.headquarters.bot.alreadyAttacked) {
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
        score:
          bestTarget.type === "headquarters"
            ? 3
            : (() => {
                const enemyUnit = getEnemyUnitById(state, bestTarget.id);
                return enemyUnit ? getUnitThreatScore(state, enemyUnit) : 2;
              })(),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? null;
}

function getStrategicMoveAction(state: BattleState): BattleAction | null {
  const mostDangerousEnemy = getMostDangerousEnemyUnit(state);

  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && !unit.alreadyMoved
  );

  const candidates: {
    action: BattleAction;
    score: number;
  }[] = [];

  for (const unit of botUnits) {
    const card = getCard(unit.cardId);

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
    const currentThreatDistance = mostDangerousEnemy
      ? getDistance(unit.position, mostDangerousEnemy.position)
      : null;

    const bestCell = moveCells
      .map((cell) => {
        const distanceToPlayerHq = getDistance(cell, playerHq);
        const distanceGain = currentDistance - distanceToPlayerHq;
        const threatDistanceGain =
          mostDangerousEnemy && currentThreatDistance !== null
            ? currentThreatDistance - getDistance(cell, mostDangerousEnemy.position)
            : 0;
        const enemyPressure =
          mostDangerousEnemy &&
          getDistance(mostDangerousEnemy.position, state.headquarters.bot.position) <= 3
            ? getUnitThreatScore(state, mostDangerousEnemy)
            : 0;
        const canAttackAfterMove =
          mostDangerousEnemy &&
          canCardAttackPosition(card.id, cell, mostDangerousEnemy.position);

        return {
          cell,
          distanceGain,
          threatDistanceGain,
          score:
            distanceGain * 3 +
            threatDistanceGain * (enemyPressure > 0 ? 7 : 2) +
            (canAttackAfterMove ? 12 : 0),
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (!bestCell) continue;

    if (bestCell.score <= 0) continue;

    candidates.push({
      action: {
        type: "MOVE_UNIT",
        playerId: "bot",
        unitId: unit.instanceId,
        position: bestCell.cell,
      },
      score: bestCell.score + card.attack,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

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
  const enemyPressure = getEnemyPressureScore(state);

  if (botStrength < playerStrength) return true;
  if (enemyPressure >= 90 && botUnitsCount <= playerUnitsCount + 1) return true;

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
