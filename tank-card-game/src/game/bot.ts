import { getCard } from "./cards";
import {
  BOT_SPAWN_CELLS,
  applyAction,
  getAttackAnimationSequence,
  getAvailableMoveCells,
  getFreeSpawnCells,
  getFreeSupportSlots,
  getTargetsInRange,
  isBattlefieldUnit,
} from "./engine";
import type {
  AttackAction,
  BattleAction,
  BattleState,
  BoardUnit,
  Position,
  TankCard,
} from "./types";

export type Side = "player" | "bot";

function getDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function getChebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
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

function getSupportUnitValue(card: TankCard): number {
  if (card.deploymentZone !== "support") return 0;

  const supportEffects = card.supportEffects;

  return (
    12 +
    (supportEffects?.hqAttackBonus ?? 0) * 16 +
    (supportEffects?.hqDamageRedirect ?? 0) * 10 +
    (supportEffects?.fuelPerTurn ?? 0) * 15 +
    (supportEffects?.drawEveryTurns
      ? Math.round(18 / supportEffects.drawEveryTurns)
      : 0) +
    (supportEffects?.healRandomUnitPerTurn ?? 0) * 12 +
    (supportEffects?.hqHealPerTurn ?? 0) * 12 +
    card.hp * 3
  );
}

function getUnitThreatScore(state: BattleState, unit: BoardUnit): number {
  const card = getCard(unit.cardId);
  const supportValue = getSupportUnitValue(card);

  if (supportValue > 0) {
    const damagedBonus = Math.max(0, card.hp - unit.currentHp);

    return supportValue + damagedBonus * 3;
  }

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

  if (card.deploymentZone === "support") {
    return getSupportUnitValue(card);
  }

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
  const freeSupportSlots = getFreeSupportSlots(state, "bot");

  if (freeSpawnCells.length === 0 && freeSupportSlots.length === 0) return null;

  const playableCards = state.bot.hand
    .map((cardInstance) => ({
      instance: cardInstance,
      card: getCard(cardInstance.cardId),
      score: scoreCardForCurrentBattle(state, cardInstance.cardId),
    }))
    .filter(
      ({ card }) =>
        card.cost <= state.bot.resources &&
        (card.deploymentZone === "support"
          ? freeSupportSlots.length > 0
          : freeSpawnCells.length > 0)
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.card.cost - a.card.cost;
    });

  return playableCards[0] ?? null;
}

type AttackOutcome = {
  targetDamage: number;
  attackerDamage: number;
  targetDestroyed: boolean;
  attackerDestroyed: boolean;
  attackerStruck: boolean;
};

function getAttackOutcome(
  state: BattleState,
  action: AttackAction
): AttackOutcome | null {
  const strikes = getAttackAnimationSequence(state, action);

  if (strikes.length === 0) return null;

  const attackerHp =
    action.attackerType === "unit"
      ? getBotUnitById(state, action.attackerId)?.currentHp
      : state.headquarters.bot.hp;
  const targetHp =
    action.targetType === "unit"
      ? getEnemyUnitById(state, action.targetId)?.currentHp
      : state.headquarters.player.hp;

  if (attackerHp === undefined || targetHp === undefined) return null;

  const targetDamage = strikes
    .filter((strike) => strike.targetId === action.targetId)
    .reduce((total, strike) => total + strike.damage, 0);
  const attackerDamage = strikes
    .filter((strike) => strike.targetId === action.attackerId)
    .reduce((total, strike) => total + strike.damage, 0);

  return {
    targetDamage,
    attackerDamage,
    targetDestroyed: targetDamage >= targetHp,
    attackerDestroyed: attackerDamage >= attackerHp,
    attackerStruck: strikes.some(
      (strike) =>
        strike.sourceId === action.attackerId &&
        strike.targetId === action.targetId
    ),
  };
}

function scoreAttackAction(
  state: BattleState,
  action: AttackAction
): number | null {
  const outcome = getAttackOutcome(state, action);

  // An armed TD can destroy an attacker before it fires. The bot must not
  // spend a unit on an attack that deals no damage.
  if (!outcome || !outcome.attackerStruck || outcome.targetDamage <= 0) {
    return null;
  }

  let score = outcome.targetDamage * 5 - outcome.attackerDamage * 4;

  if (action.targetType === "headquarters") {
    score += 8;
  } else {
    const enemyUnit = getEnemyUnitById(state, action.targetId);

    if (!enemyUnit) return null;

    const enemyCard = getCard(enemyUnit.cardId);
    const supportTargetValue = getSupportUnitValue(enemyCard);
    const attackerCard =
      action.attackerType === "unit"
        ? getBotUnitById(state, action.attackerId)
        : null;
    const attackerDefinition = attackerCard
      ? getCard(attackerCard.cardId)
      : null;

    score +=
      getUnitThreatScore(state, enemyUnit) +
      enemyCard.attack * 2 +
      enemyCard.fuelGeneration * 4;

    if (supportTargetValue > 0) {
      score += supportTargetValue;

      if (action.attackerType === "headquarters") {
        score += 10;
      } else if (attackerDefinition?.class === "spg") {
        score += 12;
      }
    }
  }

  if (outcome.targetDestroyed) score += 28;
  if (outcome.attackerDestroyed) score -= 26;

  return score;
}

function getSpgPositionScore(state: BattleState, position: Position): number {
  const isSpawnCell = BOT_SPAWN_CELLS.some((cell) =>
    samePosition(cell, position)
  );
  const isCentralSpawnCell = position.row === 1 && position.col === 3;
  const backEdgeBonus = position.row === 0 ? 12 : 0;
  const flankEdgeBonus = position.col === 4 ? 4 : 0;

  return (
    getDistance(position, state.headquarters.player.position) * 4 +
    backEdgeBonus +
    flankEdgeBonus -
    (isSpawnCell ? 5 : 0) -
    (isCentralSpawnCell ? 14 : 0)
  );
}

function getLethalAttackAction(state: BattleState): BattleAction | null {
  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && isBattlefieldUnit(unit)
  );

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
  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && isBattlefieldUnit(unit)
  );

  const candidates: {
    action: BattleAction;
    score: number;
  }[] = [];

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const targets = getTargetsInRange(state, "bot", "unit", unit.instanceId);

    for (const target of targets) {
      if (target.type !== "unit") continue;

      const enemyUnit = getEnemyUnitById(state, target.id);

      if (!enemyUnit) continue;

      const enemyCard = getCard(enemyUnit.cardId);
      const action: AttackAction = {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: target.type,
        targetId: target.id,
      };
      const outcome = getAttackOutcome(state, action);
      const attackScore = scoreAttackAction(state, action);

      if (!outcome?.targetDestroyed || attackScore === null) continue;

      candidates.push({
        action,
        score:
          attackScore +
          getUnitThreatScore(state, enemyUnit) +
          enemyCard.attack * 3 +
          enemyCard.fuelGeneration * 5 +
          enemyCard.hp * 2 -
          Math.max(0, outcome.targetDamage - enemyUnit.currentHp),
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
      const action: AttackAction = {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "headquarters",
        attackerId: "bot_hq",
        targetType: target.type,
        targetId: target.id,
      };
      const outcome = getAttackOutcome(state, action);
      const attackScore = scoreAttackAction(state, action);

      if (!outcome?.targetDestroyed || attackScore === null) continue;

      candidates.push({
        action,
        score:
          attackScore +
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

  if (bestCard.card.deploymentZone === "support") {
    const supportSlot = getFreeSupportSlots(state, "bot")[0];

    if (supportSlot === undefined) return null;

    return {
      type: "PLAY_SUPPORT_CARD",
      playerId: "bot",
      cardInstanceId: bestCard.instance.instanceId,
      supportSlot,
    };
  }

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
      const positionScore =
        card.class === "spg"
          ? getSpgPositionScore(state, cell)
          : offensiveBonus + defensiveBonus + economyCardBonus;

      return {
        cell,
        score: positionScore,
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
  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && isBattlefieldUnit(unit)
  );

  const candidates: {
    action: BattleAction;
    score: number;
  }[] = [];

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const targets = getTargetsInRange(state, "bot", "unit", unit.instanceId);

    for (const target of targets) {
      const action: AttackAction = {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: target.type,
        targetId: target.id,
      };
      const score = scoreAttackAction(state, action);

      if (score === null) continue;

      candidates.push({ action, score });
    }
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    const targets = getTargetsInRange(state, "bot", "headquarters", "bot_hq");

    for (const target of targets) {
      const action: AttackAction = {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "headquarters",
        attackerId: "bot_hq",
        targetType: target.type,
        targetId: target.id,
      };
      const score = scoreAttackAction(state, action);

      if (score === null) continue;

      candidates.push({ action, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? null;
}

function getStrategicMoveAction(state: BattleState): BattleAction | null {
  const mostDangerousEnemy = getMostDangerousEnemyUnit(state);

  const botUnits = state.units.filter(
    (unit) =>
      unit.ownerId === "bot" &&
      isBattlefieldUnit(unit) &&
      !unit.alreadyMoved
  );

  const candidates: {
    action: BattleAction;
    score: number;
  }[] = [];

  for (const unit of botUnits) {
    const card = getCard(unit.cardId);
    const moveCells = getAvailableMoveCells(state, "bot", unit.instanceId);

    if (moveCells.length === 0) continue;

    if (card.class === "spg") {
      const currentScore = getSpgPositionScore(state, unit.position);
      const bestCell = moveCells
        .map((cell) => ({
          cell,
          score: getSpgPositionScore(state, cell),
        }))
        .sort((a, b) => b.score - a.score)[0];

      if (!bestCell || bestCell.score <= currentScore) continue;

      candidates.push({
        action: {
          type: "MOVE_UNIT",
          playerId: "bot",
          unitId: unit.instanceId,
          position: bestCell.cell,
        },
        score: bestCell.score - currentScore + 4,
      });

      continue;
    }

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

// ============================================================
// Side-agnostic AI support (for balance simulations)
// ============================================================

function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}

/**
 * Creates a "flipped" view of the battle state where the requested side
 * appears as "bot" to the existing bot AI logic.
 */
function createFlippedStateForSide(state: BattleState, side: Side): BattleState {
  if (side === "bot") return state;

  const flipped = deepClone(state);

  // Swap player <-> bot at top level
  const tempPlayer = flipped.player;
  flipped.player = flipped.bot;
  flipped.bot = tempPlayer;

  // Swap headquarters
  const tempHq = flipped.headquarters.player;
  flipped.headquarters.player = flipped.headquarters.bot;
  flipped.headquarters.bot = tempHq;

  // Swap units ownership and flags
  flipped.units = flipped.units.map((unit) => {
    const newOwner = unit.ownerId === "player" ? "bot" : "player";
    return {
      ...unit,
      ownerId: newOwner,
      // Preserve movement/attack flags relative to the new "bot" perspective
      alreadyMoved: unit.alreadyMoved,
      alreadyAttacked: unit.alreadyAttacked,
      tdAmbushUsedThisTurn: unit.tdAmbushUsedThisTurn,
    };
  });

  // Swap active player
  if (flipped.activePlayer === "player") {
    flipped.activePlayer = "bot";
  } else if (flipped.activePlayer === "bot") {
    flipped.activePlayer = "player";
  }

  return flipped;
}

/**
 * Maps an action generated by the bot AI (thinking it is "bot") back to the real side.
 */
function mapActionToRealSide(action: BattleAction | null, realSide: Side): BattleAction | null {
  if (!action) return null;
  if (realSide === "bot") return action;

  // We need to map playerId and any unit/headquarters references
  const mapped =
    "playerId" in action
      ? {
          ...action,
          playerId: action.playerId === "bot" ? "player" : "bot",
        } as BattleAction
      : action;

  // For attacks, the attackerId and targetId may need owner adjustment, but since
  // we also flipped unit ownership in the state, the instanceIds remain valid.
  // The main thing is the playerId on the action itself.

  return mapped;
}

export function getNextActionForSide(state: BattleState, side: Side): BattleAction | null {
  if (state.status !== "active") return null;
  if (state.activePlayer !== side) return null;

  const flipped = createFlippedStateForSide(state, side);
  const botStyleAction = getNextBotAction(flipped);

  return mapActionToRealSide(botStyleAction, side);
}

export function runTurnForSide(state: BattleState, side: Side): BattleState {
  let nextState = state;

  while (nextState.status === "active" && nextState.activePlayer === side) {
    const action = getNextActionForSide(nextState, side);

    if (!action) break;

    nextState = applyAction(nextState, action);

    if (action.type === "END_TURN") {
      break;
    }
  }

  return nextState;
}
