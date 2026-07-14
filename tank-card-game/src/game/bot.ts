import { getCard } from "./cards";
import {
  BOARD_CORNER_CELLS,
  BOT_SPAWN_CELLS,
  PLAYER_SPAWN_CELLS,
  applyAction,
  getAttackAnimationSequence,
  getAvailableMoveCells,
  getEffectiveCardCost,
  getFreeSpawnCells,
  getFreeSupportSlots,
  getFrontColumn,
  getNationalAbilityForPlayer,
  getSupportSlotPosition,
  getTargetsInRange,
  isBattlefieldUnit,
  isSupportUnit,
  SUPPORT_SLOTS,
} from "./engine";
import type { NationalAbility } from "./nationalAbilities";
import type {
  AttackAction,
  BattleAction,
  BattleState,
  BoardUnit,
  CardInstance,
  Position,
  TankCard,
} from "./types";

export type Side = "player" | "bot";
export type BotDifficulty = "easy" | "medium" | "hard" | "full";

type BotDecisionOptions = {
  difficulty?: BotDifficulty;
};

const HEADQUARTERS_PRESSURE_SHOT_WINDOW = 4;
const MIN_TACTICAL_MOVE_ATTACK_SCORE = 36;
const MAX_TACTICAL_ROUTE_EXTRA_MOVES = 2;

function getDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function getChebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * Player tank destroyers face the bot side (higher columns), so their rear is
 * on the lower-column side. Reaching that side suppresses both the TD ambush
 * and its normal counterattack (the authoritative rule lives in engine.ts).
 */
function isRearAttackOnEnemyTd(
  attackerPosition: Position,
  target: BoardUnit
): boolean {
  return (
    getCard(target.cardId).class === "td" &&
    attackerPosition.col < target.position.col
  );
}

function isBotSpawnCell(position: Position): boolean {
  return BOT_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

/** From the bot's perspective the player's spawn is the enemy bridgehead. */
function isEnemySpawnCell(position: Position): boolean {
  return PLAYER_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

function isCornerCell(position: Position): boolean {
  return BOARD_CORNER_CELLS.some((cell) => samePosition(cell, position));
}

/**
 * Whether moving the card to `cell` lets it attack any enemy (unit or HQ) this
 * turn. Heavy tanks can never move and attack in the same turn. Used both to
 * value advancing moves and to suppress pointless extra steps.
 */
function moveEnablesAttack(
  state: BattleState,
  card: TankCard,
  cell: Position
): boolean {
  // Heavy tanks and ПТ-САУ cannot attack after moving, so a reposition never
  // sets up a strike for them this turn.
  if (card.class === "heavy" || card.class === "td") return false;

  if (canCardAttackPosition(card.id, cell, state.headquarters.player.position)) {
    return true;
  }

  return state.units.some(
    (unit) =>
      unit.ownerId === "player" &&
      isBattlefieldUnit(unit) &&
      canCardAttackPosition(card.id, cell, unit.position)
  );
}

/**
 * Bonus the bot assigns to a card's special abilities so it values playing and
 * positioning units that carry the new mechanics. Context-aware where it
 * matters (suppression vs. an enemy artillery park, «Корректировщик» scaling
 * with the headquarters' firepower).
 */
function getCardAbilityValue(state: BattleState, card: TankCard): number {
  let value = 0;

  const combat = card.combatAbilities;
  if (combat) {
    if (combat.camouflage) value += 9;
    if (combat.attackEqualsHq) {
      value += Math.max(0, state.headquarters.bot.attack - card.attack) * 5 + 6;
    }
    if (combat.armorVsClass) value += combat.armorVsClass.amount * 6;
    if (combat.frontalArmor) value += combat.frontalArmor.amount * 7;
    if (combat.drawWhenAttacked) value += combat.drawWhenAttacked * 7;
    if (combat.cornerBonus) {
      value += (combat.cornerBonus.attack ?? 0) * 6 + (combat.cornerBonus.hp ?? 0) * 4;
    }
    if (combat.hqProximityBonus) value += combat.hqProximityBonus.maxBonus * 6;
    if (combat.spawnDamageReduction) value += combat.spawnDamageReduction * 5;
    if (combat.raidDraw) value += combat.raidDraw * 6;
    if (combat.blitz) value += 6;
    if (combat.lightScreen) value += 6;
    if (combat.tankDefenseAura) value += combat.tankDefenseAura * 10;
  }

  const onPlay = card.onPlayEffects;
  if (onPlay) {
    if (onPlay.draw) value += onPlay.draw * 8;
    if (onPlay.hqProtection) value += onPlay.hqProtection * 6;
    if (onPlay.fetchToHand) {
      // Pulling a specific card into hand is worth a draw only when the deck
      // actually holds a match; otherwise the effect fizzles.
      const match = onPlay.fetchToHand.match;
      const hasMatch = state.bot.deck.some((instance) => {
        const c = getCard(instance.cardId);
        return (
          match.namePrefixes?.some((p) => c.name.startsWith(p)) ||
          (match.classes?.includes(c.class) ?? false) ||
          (c.supportRole != null && (match.supportRoles?.includes(c.supportRole) ?? false))
        );
      });
      if (hasMatch) value += 8;
    }
    if (onPlay.deployDamage) {
      const deploy = onPlay.deployDamage;
      const enemyBattlefield = state.units.filter(
        (unit) => unit.ownerId === "player" && isBattlefieldUnit(unit)
      );
      let hitCount: number;

      if (deploy.scope === "classes") {
        hitCount = enemyBattlefield.filter((unit) =>
          (deploy.classes ?? []).includes(getCard(unit.cardId).class)
        ).length;
      } else if (deploy.scope === "rear") {
        const enemyRear = state.units.filter(
          (unit) => unit.ownerId === "player" && unit.zone === "support"
        );
        hitCount = Math.min(1, enemyRear.length);
      } else {
        hitCount = Math.min(1, enemyBattlefield.length);
      }

      value += 4 + deploy.amount * hitCount * 6;
    }
    if (onPlay.suppressEnemyIndirect) {
      const enemySpgs = state.units.filter(
        (unit) =>
          unit.ownerId === "player" &&
          isBattlefieldUnit(unit) &&
          getCard(unit.cardId).class === "spg"
      ).length;

      value +=
        10 +
        enemySpgs * 14 +
        (state.headquarters.player.alreadyAttacked ? 0 : 6);
    }
  }

  if (card.costModifiers) value += 4;

  return value;
}

function isBattlefieldSpg(card: TankCard): boolean {
  return card.class === "spg" && card.deploymentZone !== "support";
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
    (supportEffects?.supportLineCover ?? 0) * 9 +
    (supportEffects?.tankScreenClasses?.length ?? 0) * 8 +
    (supportEffects?.returnFire ?? 0) * 7 +
    (supportEffects?.fuelPerTurn ?? 0) * 15 +
    (supportEffects?.drawEveryTurns
      ? Math.round(18 / supportEffects.drawEveryTurns)
      : 0) +
    (supportEffects?.healRandomUnitPerTurn ?? 0) * 12 +
    (supportEffects?.hqHealPerTurn ?? 0) * 12 +
    card.hp * 3
  );
}

function getBotBattlefieldSpgs(state: BattleState): BoardUnit[] {
  return state.units.filter((unit) => {
    if (unit.ownerId !== "bot" || !isBattlefieldUnit(unit)) return false;

    return isBattlefieldSpg(getCard(unit.cardId));
  });
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

function getDamagedBotUnitHpGap(state: BattleState): number {
  return state.units
    .filter((unit) => unit.ownerId === "bot" && isBattlefieldUnit(unit))
    .reduce((total, unit) => {
      const card = getCard(unit.cardId);

      return total + Math.max(0, card.hp - unit.currentHp);
    }, 0);
}

function getBotSupportRoleCount(
  state: BattleState,
  role: TankCard["supportRole"]
): number {
  if (!role) return 0;

  return state.units
    .filter((unit) => unit.ownerId === "bot" && !isBattlefieldUnit(unit))
    .reduce((count, unit) => {
      const card = getCard(unit.cardId);

      return count + (card.supportRole === role ? 1 : 0);
    }, 0);
}

function getContextualSupportCardBonus(
  state: BattleState,
  card: TankCard
): number {
  if (card.deploymentZone !== "support") return 0;

  const effects = card.supportEffects;
  if (!effects) return 0;

  const economyGap = getEconomyGap(state);
  const enemyPressure = getEnemyPressureScore(state);
  const damagedUnitHpGap = getDamagedBotUnitHpGap(state);
  const handSize = state.bot.hand.length;
  const deckSize = state.bot.deck.length;
  const headquartersTargets = state.headquarters.bot.alreadyAttacked
    ? []
    : getTargetsInRange(state, "bot", "headquarters", "bot_hq");
  const roleCount = getBotSupportRoleCount(state, card.supportRole);

  let score = 0;

  if (effects.fuelPerTurn) {
    score += effects.fuelPerTurn * (state.turn <= 4 ? 18 : 8);
    score += effects.fuelPerTurn * Math.max(0, economyGap) * 5;

    if (state.bot.resources <= 2) {
      score += effects.fuelPerTurn * 7;
    }
  }

  if (effects.drawEveryTurns && deckSize > 0) {
    const drawUrgency = handSize <= 2 ? 32 : handSize <= 4 ? 20 : 8;

    score += Math.round(drawUrgency / effects.drawEveryTurns);

    if (state.turn <= 4) {
      score += Math.round(10 / effects.drawEveryTurns);
    }
  }

  if (effects.hqAttackBonus) {
    score += effects.hqAttackBonus * (headquartersTargets.length > 0 ? 20 : 8);
    score += effects.hqAttackBonus * Math.min(12, Math.round(enemyPressure / 12));
  }

  if (effects.hqDamageRedirect) {
    score += effects.hqDamageRedirect * (enemyPressure >= 75 ? 13 : 6);
  }

  // «Противотанковый заслон» / «Самооборона»: rear defense is worth more under
  // pressure, when the enemy is likely to push the headquarters and rear line.
  if (effects.supportLineCover) {
    score += effects.supportLineCover * (enemyPressure >= 60 ? 12 : 5);
  }

  if (effects.tankScreenClasses?.length) {
    const ownProtectedTanks = state.units.filter((unit) => {
      if (unit.ownerId !== "bot" || !isBattlefieldUnit(unit)) return false;
      return effects.tankScreenClasses?.includes(getCard(unit.cardId).class);
    }).length;

    score += effects.tankScreenClasses.length * 4 + ownProtectedTanks * 9;
    score += enemyPressure >= 55 ? 8 : 0;
  }

  if (effects.returnFire) {
    score += effects.returnFire * (enemyPressure >= 60 ? 8 : 4);
  }

  if (effects.healRandomUnitPerTurn) {
    score += damagedUnitHpGap > 0
      ? effects.healRandomUnitPerTurn * Math.min(28, damagedUnitHpGap * 7)
      : -5;
  }

  if (effects.hqHealPerTurn) {
    score += effects.hqHealPerTurn * (state.headquarters.bot.hp <= 8 ? 16 : 5);
  }

  if (roleCount > 0 && card.supportRole !== "artillery") {
    score -= roleCount * 6;
  }

  return score;
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

  if (card.deploymentZone === "support") {
    return (
      scoreCardForBot(cardId) +
      getContextualSupportCardBonus(state, card) +
      getSystemSupportBonus(state, getBotNationalAbility(state)) +
      (getEffectiveCardCost(state, "bot", cardId) <= state.bot.resources
        ? 3
        : 0)
    );
  }

  return (
    scoreCardForBot(cardId) +
    card.fuelGeneration * economyMultiplier +
    getSpgProtectionCardBonus(state, card) +
    getCardAbilityValue(state, card) +
    (needsBoard ? card.hp + card.attack * 2 : 0) +
    (getEffectiveCardCost(state, "bot", cardId) <= state.bot.resources ? 2 : 0)
  );
}

type PlayableCardCandidate = {
  instance: CardInstance;
  card: TankCard;
  score: number;
};

type PlayableCardFilter = (candidate: PlayableCardCandidate) => boolean;

function getPlayableCardCandidates(
  state: BattleState,
  filter?: PlayableCardFilter
): PlayableCardCandidate[] {
  const freeSpawnCells = getFreeSpawnCells(state, "bot");
  const freeSupportSlots = getFreeSupportSlots(state, "bot");

  if (freeSpawnCells.length === 0 && freeSupportSlots.length === 0) return [];

  return state.bot.hand
    .map((cardInstance) => ({
      instance: cardInstance,
      card: getCard(cardInstance.cardId),
      score: scoreCardForCurrentBattle(state, cardInstance.cardId),
    }))
    .filter(
      ({ card }) =>
        getEffectiveCardCost(state, "bot", card.id) <= state.bot.resources &&
        (card.deploymentZone === "support"
          ? freeSupportSlots.length > 0
          : freeSpawnCells.length > 0)
    )
    .filter((candidate) => !filter || filter(candidate))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.card.cost - a.card.cost;
    });
}

function getBestPlayableCard(
  state: BattleState,
  filter?: PlayableCardFilter
) {
  return getPlayableCardCandidates(state, filter)[0] ?? null;
}

function isDevelopmentCard(card: TankCard): boolean {
  if (card.deploymentZone === "support") return true;
  if (card.fuelGeneration >= 2) return true;
  if ((card.onPlayEffects?.draw ?? 0) > 0) return true;
  if ((card.onPlayEffects?.hqProtection ?? 0) > 0) return true;
  if (card.onPlayEffects?.fetchToHand) return true;

  return false;
}

function shouldDevelopBeforeCombat(state: BattleState): boolean {
  if (shouldPressHeadquarters(state)) return false;
  if (state.turn <= 4) return true;
  if (getEconomyGap(state) > 0) return true;
  if (state.bot.hand.length <= 2 && state.bot.deck.length > 0) return true;
  if (getBotBattlefieldSpgs(state).length > 0) {
    return state.units.some((unit) => {
      if (unit.ownerId !== "player" || !isBattlefieldUnit(unit)) return false;

      return getBotBattlefieldSpgs(state).some(
        (spg) => getDistance(unit.position, spg.position) <= 3
      );
    });
  }

  return false;
}

function hasPlayableBattlefieldCard(state: BattleState): boolean {
  return state.bot.hand.some((cardInstance) => {
    const card = getCard(cardInstance.cardId);

    return (
      card.deploymentZone !== "support" &&
      getEffectiveCardCost(state, "bot", card.id) <= state.bot.resources
    );
  });
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

function getAvailableHeadquartersAttackCandidates(
  state: BattleState
): { action: AttackAction; outcome: AttackOutcome }[] {
  const candidates: { action: AttackAction; outcome: AttackOutcome }[] = [];
  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && isBattlefieldUnit(unit)
  );

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    const targets = getTargetsInRange(state, "bot", "unit", unit.instanceId);
    const headquartersTarget = targets.find(
      (target) => target.type === "headquarters" && target.id === "player_hq"
    );

    if (!headquartersTarget) continue;

    const action: AttackAction = {
      type: "ATTACK",
      playerId: "bot",
      attackerType: "unit",
      attackerId: unit.instanceId,
      targetType: "headquarters",
      targetId: headquartersTarget.id,
    };
    const outcome = getAttackOutcome(state, action);

    if (!outcome || !outcome.attackerStruck || outcome.targetDamage <= 0) {
      continue;
    }

    candidates.push({ action, outcome });
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    const targets = getTargetsInRange(state, "bot", "headquarters", "bot_hq");
    const headquartersTarget = targets.find(
      (target) => target.type === "headquarters" && target.id === "player_hq"
    );

    if (headquartersTarget) {
      const action: AttackAction = {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "headquarters",
        attackerId: "bot_hq",
        targetType: "headquarters",
        targetId: headquartersTarget.id,
      };
      const outcome = getAttackOutcome(state, action);

      if (outcome && outcome.attackerStruck && outcome.targetDamage > 0) {
        candidates.push({ action, outcome });
      }
    }
  }

  return candidates;
}

function getAvailableHeadquartersDamage(state: BattleState): number {
  return getAvailableHeadquartersAttackCandidates(state).reduce(
    (total, candidate) => total + candidate.outcome.targetDamage,
    0
  );
}

function getHeadquartersDamageClock(state: BattleState): number {
  const damage = getAvailableHeadquartersDamage(state);

  if (damage <= 0) return Number.POSITIVE_INFINITY;

  return Math.ceil(state.headquarters.player.hp / damage);
}

function shouldPressHeadquarters(state: BattleState): boolean {
  return getHeadquartersDamageClock(state) <= HEADQUARTERS_PRESSURE_SHOT_WINDOW;
}

function getProjectedHeadquartersAttackPower(state: BattleState): number {
  const unitDamage = state.units
    .filter(
      (unit) =>
        unit.ownerId === "bot" && isBattlefieldUnit(unit) && unit.currentHp > 0
    )
    .reduce((total, unit) => total + getCard(unit.cardId).attack, 0);

  return unitDamage + state.headquarters.bot.attack;
}

function shouldAdvanceOnHeadquarters(state: BattleState): boolean {
  if (shouldPressHeadquarters(state)) return true;
  if (state.turn < 5) return false;

  const projectedDamage = getProjectedHeadquartersAttackPower(state);

  if (projectedDamage <= 0) return false;

  return (
    Math.ceil(state.headquarters.player.hp / projectedDamage) <=
    HEADQUARTERS_PRESSURE_SHOT_WINDOW
  );
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
    const headquartersDamageClock = getHeadquartersDamageClock(state);

    if (action.attackerType === "unit") {
      const attacker = getBotUnitById(state, action.attackerId);

      if (
        attacker &&
        isBattlefieldSpg(getCard(attacker.cardId)) &&
        !shouldSpgAttackHeadquarters(state, attacker)
      ) {
        return null;
      }

      if (attacker && isBattlefieldSpg(getCard(attacker.cardId))) {
        score +=
          getAvailableSpgHeadquartersDamage(state) >= state.headquarters.player.hp
            ? 42
            : 10;
      }
    }

    score += 8;

    if (headquartersDamageClock <= HEADQUARTERS_PRESSURE_SHOT_WINDOW) {
      score +=
        54 +
        (HEADQUARTERS_PRESSURE_SHOT_WINDOW + 1 - headquartersDamageClock) * 18 +
        outcome.targetDamage * 7;
    }
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

    // Scripted evacuation mission: the opposing headquarters keeps its fire
    // fixed on the stranded objective vehicle whenever that shot is legal.
    if (
      action.attackerType === "headquarters" &&
      state.objective?.type === "evacuate_unit" &&
      enemyUnit.scenarioTag === state.objective.unitTag
    ) {
      score += 10_000;
    }

    if (supportTargetValue > 0) {
      score += supportTargetValue;

      if (action.attackerType === "headquarters") {
        score += 10;
      } else if (attackerDefinition?.class === "spg") {
        score += 12;
      }
    }

    // A rear attack on a TD is materially safer than an equally damaging
    // frontal attack: it avoids both the pre-emptive ambush and return fire.
    // Keep an explicit bonus in addition to the zero attackerDamage already
    // reflected above so route planning deliberately looks for the rear cell.
    if (
      attackerCard &&
      isRearAttackOnEnemyTd(attackerCard.position, enemyUnit)
    ) {
      score += 34;
    }
  }

  if (outcome.targetDestroyed) score += 28;
  if (outcome.attackerDestroyed) {
    score -= outcome.targetDestroyed ? 26 : 44;
  }

  return score;
}

function getSpgPositionScore(state: BattleState, position: Position): number {
  const isSpawnCell = isBotSpawnCell(position);
  const isCentralSpawnCell = position.row === 1 && position.col === 4;
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

function getSpgProtectionPositionScore(
  state: BattleState,
  card: TankCard,
  position: Position
): number {
  if (isBattlefieldSpg(card)) return 0;

  const spgs = getBotBattlefieldSpgs(state);
  if (spgs.length === 0) return 0;

  const enemyPressureNearSpg = state.units.some((unit) => {
    if (unit.ownerId !== "player" || !isBattlefieldUnit(unit)) return false;

    return spgs.some((spg) => getDistance(unit.position, spg.position) <= 3);
  });

  return spgs.reduce((score, spg) => {
    const distanceToSpg = getChebyshevDistance(position, spg.position);
    const isScreeningCell = position.col < spg.position.col;
    const classGuardBonus =
      card.class === "td"
        ? 12
        : card.class === "heavy"
          ? 8
          : card.class === "medium"
            ? 7
            : card.class === "light"
              ? 4
              : 0;

    if (distanceToSpg === 1) {
      return (
        score +
        18 +
        classGuardBonus +
        (isScreeningCell ? 12 : 0) +
        (enemyPressureNearSpg ? 10 : 0)
      );
    }

    if (distanceToSpg === 2 && isScreeningCell) {
      return score + 7 + Math.round(classGuardBonus / 2);
    }

    return score;
  }, 0);
}

function getSpgProtectionCardBonus(state: BattleState, card: TankCard): number {
  if (card.deploymentZone === "support" || isBattlefieldSpg(card)) return 0;
  if (getBotBattlefieldSpgs(state).length === 0) return 0;

  const enemyCanPressureBattery = state.units.some((unit) => {
    if (unit.ownerId !== "player" || !isBattlefieldUnit(unit)) return false;

    const enemyCard = getCard(unit.cardId);

    return getBotBattlefieldSpgs(state).some((spg) => {
      const distance = getDistance(unit.position, spg.position);

      return (
        distance <= 3 ||
        canCardAttackPosition(enemyCard.id, unit.position, spg.position)
      );
    });
  });

  if (!enemyCanPressureBattery) return 0;

  if (card.class === "td") return 24;
  if (card.class === "heavy") return 18;
  if (card.class === "medium") return 16;
  if (card.class === "light") return 8;

  return 0;
}

function shouldMoveSpgToClearSpawn(state: BattleState, unit: BoardUnit): boolean {
  if (!isBotSpawnCell(unit.position)) return false;
  if (getFreeSpawnCells(state, "bot").length > 0) return false;

  return hasPlayableBattlefieldCard(state);
}

function getSpgTargetValue(
  state: BattleState,
  attacker: BoardUnit,
  targetId: string
): number {
  const target = getEnemyUnitById(state, targetId);
  if (!target) return 0;

  const action: AttackAction = {
    type: "ATTACK",
    playerId: "bot",
    attackerType: "unit",
    attackerId: attacker.instanceId,
    targetType: "unit",
    targetId,
  };
  const outcome = getAttackOutcome(state, action);
  if (!outcome?.attackerStruck || outcome.targetDamage <= 0) return 0;

  const targetCard = getCard(target.cardId);

  return (
    getUnitThreatScore(state, target) +
    getSupportUnitValue(targetCard) +
    outcome.targetDamage * 4 +
    (outcome.targetDestroyed ? 28 : 0)
  );
}

function hasWorthySpgTarget(state: BattleState, attacker: BoardUnit): boolean {
  const targets = getTargetsInRange(state, "bot", "unit", attacker.instanceId);

  return targets.some(
    (target) =>
      target.type === "unit" &&
      getSpgTargetValue(state, attacker, target.id) >= 55
  );
}

function getAvailableSpgHeadquartersDamage(state: BattleState): number {
  return getBotBattlefieldSpgs(state).reduce((total, unit) => {
    if (unit.alreadyAttacked) return total;

    const targets = getTargetsInRange(state, "bot", "unit", unit.instanceId);
    const canAttackHeadquarters = targets.some(
      (target) => target.type === "headquarters" && target.id === "player_hq"
    );

    return canAttackHeadquarters ? total + getCard(unit.cardId).attack : total;
  }, 0);
}

function shouldSpgAttackHeadquarters(
  state: BattleState,
  attacker: BoardUnit
): boolean {
  const card = getCard(attacker.cardId);
  if (!isBattlefieldSpg(card)) return true;

  if (state.headquarters.player.hp <= card.attack) return true;
  if (shouldPressHeadquarters(state)) return true;
  if (getAvailableSpgHeadquartersDamage(state) >= state.headquarters.player.hp) {
    return true;
  }

  return !hasWorthySpgTarget(state, attacker);
}

function getHeadquartersPressureAttackAction(
  state: BattleState
): BattleAction | null {
  if (!shouldPressHeadquarters(state)) return null;

  const candidates = getAvailableHeadquartersAttackCandidates(state)
    .map((candidate) => {
      const score = scoreAttackAction(state, candidate.action);

      if (score === null) return null;

      return {
        action: candidate.action,
        score:
          score +
          candidate.outcome.targetDamage * 10 +
          (candidate.outcome.targetDestroyed ? 200 : 0),
      };
    })
    .filter((candidate): candidate is { action: AttackAction; score: number } =>
      Boolean(candidate)
    )
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? null;
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

    if (
      lethalHqTarget &&
      (!isBattlefieldSpg(card) || shouldSpgAttackHeadquarters(state, unit))
    ) {
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

/** The national ability the bot's headquarters carries, if any. */
function getBotNationalAbility(state: BattleState): NationalAbility | null {
  return getNationalAbilityForPlayer(state, "bot");
}

/** Whether the player still has any living unit on the battlefield. */
function enemyHasBattlefieldUnits(state: BattleState): boolean {
  return state.units.some(
    (unit) =>
      unit.ownerId === "player" &&
      isBattlefieldUnit(unit) &&
      unit.currentHp > 0
  );
}

function isLineFormationAbility(ability: NationalAbility | null): boolean {
  return ability?.id === "cohesion" || ability?.id === "supply_line";
}

function getBotBattlefieldUnits(
  state: BattleState,
  excludeId: string | null
): BoardUnit[] {
  return state.units.filter(
    (unit) =>
      unit.ownerId === "bot" &&
      isBattlefieldUnit(unit) &&
      unit.currentHp > 0 &&
      unit.instanceId !== excludeId
  );
}

/**
 * Marginal value to the bot of a battlefield unit ending its turn on `cell`,
 * measured by how much it advances the bot's national formation. Lets the bot
 * actively assemble «Сплочение» columns and «Линия снабжения» rows, and hold its
 * spawn for «Глухая оборона», instead of treating those passives as invisible.
 * `movingUnitId` is the unit being repositioned (excluded from the count) or
 * null for a fresh spawn.
 */
function getNationalFormationCellValue(
  state: BattleState,
  ability: NationalAbility | null,
  movingUnitId: string | null,
  cell: Position
): number {
  if (!ability) return 0;

  // Line formations are useful while contesting the board, but should not freeze
  // the bot in place once the enemy HQ is exposed or under a short damage clock.
  if (
    isLineFormationAbility(ability) &&
    (!enemyHasBattlefieldUnits(state) || shouldAdvanceOnHeadquarters(state))
  ) {
    return 0;
  }

  const others = getBotBattlefieldUnits(state, movingUnitId);

  // «Сплочение» (СССР): three own units sharing one fully-occupied column gain
  // defence — reward stacking the column (the bot's spawn column is a free one).
  if (ability.id === "cohesion") {
    const inColumn = others.filter((u) => u.position.col === cell.col).length;
    const afterPlacement = inColumn + 1;

    if (afterPlacement >= 3) return 24;
    if (afterPlacement === 2) return 8;
    return 0;
  }

  // «Линия снабжения» (США): three own units in a row, the run anchored on the
  // front column, while a support unit feeds it from the rear — and the supply
  // only flows if that support unit sits directly behind the line's rear cell
  // (the front-column cell of this row). A support unit off to the side cannot
  // feed the row, so the formation would never trigger from here.
  if (ability.id === "supply_line") {
    const frontColumn = getFrontColumn("bot");
    const rearCell: Position = { row: cell.row, col: frontColumn };
    const hasAdjacentSupply = state.units.some(
      (u) =>
        u.ownerId === "bot" &&
        isSupportUnit(u) &&
        u.currentHp > 0 &&
        u.supportSlot !== undefined &&
        getChebyshevDistance(
          getSupportSlotPosition("bot", u.supportSlot),
          rearCell
        ) === 1
    );
    if (!hasAdjacentSupply) return 0;

    const rearRun = [frontColumn - 2, frontColumn - 1, frontColumn];
    if (!rearRun.includes(cell.col)) return 0;

    const occupiedCols = new Set(
      others
        .filter(
          (u) => u.position.row === cell.row && rearRun.includes(u.position.col)
        )
        .map((u) => u.position.col)
    );
    occupiedCols.add(cell.col);

    if (occupiedCols.size >= 3) return 22;
    if (occupiedCols.size === 2) return 7;
    return 0;
  }

  // «Глухая оборона» (Польша): holding all three spawn cells grants the HQ +2
  // attack — reward keeping the front line manned.
  if (ability.id === "last_stand") {
    if (!isBotSpawnCell(cell)) return 0;

    const spawnHeld = others.filter((u) => isBotSpawnCell(u.position)).length;
    const afterPlacement = spawnHeld + 1;

    if (afterPlacement >= 3) return 20;
    if (afterPlacement === 2) return 6;
    return 0;
  }

  return 0;
}

/**
 * «Система» (Германия): filling all four support slots yields +1 fuel/turn, so a
 * support card that completes — or builds toward — the full rear is worth extra.
 */
function getSystemSupportBonus(
  state: BattleState,
  ability: NationalAbility | null
): number {
  if (ability?.id !== "system") return 0;

  const occupiedSlots = SUPPORT_SLOTS.length - getFreeSupportSlots(state, "bot").length;
  const afterPlacement = occupiedSlots + 1;

  if (afterPlacement >= SUPPORT_SLOTS.length) return 28;
  if (afterPlacement === SUPPORT_SLOTS.length - 1) return 10;
  return 4;
}

function getPlayActionForCandidate(
  state: BattleState,
  bestCard: PlayableCardCandidate
): BattleAction | null {
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
  const nationalAbility = getBotNationalAbility(state);

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
      const spgProtectionBonus = getSpgProtectionPositionScore(
        state,
        card,
        cell
      );
      // A fresh unit can complete a «Сплочение» column / «Линия снабжения» row or
      // help man the spawn for «Глухая оборона» — value the spot accordingly.
      const formationBonus = getNationalFormationCellValue(
        state,
        nationalAbility,
        null,
        cell
      );
      const positionScore =
        (card.class === "spg"
          ? getSpgPositionScore(state, cell)
          : offensiveBonus +
            defensiveBonus +
            economyCardBonus +
            spgProtectionBonus) + formationBonus;

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

function getDevelopmentPlayAction(state: BattleState): BattleAction | null {
  if (!shouldDevelopBeforeCombat(state)) return null;

  const bestCard = getBestPlayableCard(state, ({ card }) => {
    if (!isDevelopmentCard(card)) return false;

    if (card.deploymentZone === "support") {
      const contextualScore = getContextualSupportCardBonus(state, card);
      const hasStrongEconomyEffect =
        (card.supportEffects?.fuelPerTurn ?? 0) > 0 ||
        (card.supportEffects?.drawEveryTurns ?? 0) > 0;
      const hasUsefulCombatEffect =
        (card.supportEffects?.hqAttackBonus ?? 0) > 0 ||
        (card.supportEffects?.hqDamageRedirect ?? 0) > 0 ||
        (card.supportEffects?.tankScreenClasses?.length ?? 0) > 0;

      return (
        contextualScore >= 0 ||
        hasStrongEconomyEffect ||
        hasUsefulCombatEffect
      );
    }

    return (
      card.fuelGeneration >= 2 ||
      (state.turn <= 3 && card.fuelGeneration > 0 && card.cost <= 2) ||
      (card.onPlayEffects?.draw ?? 0) > 0 ||
      (card.onPlayEffects?.hqProtection ?? 0) > 0
    );
  });

  return bestCard ? getPlayActionForCandidate(state, bestCard) : null;
}

function getStrategicPlayCardAction(state: BattleState): BattleAction | null {
  const bestCard = getBestPlayableCard(state);

  return bestCard ? getPlayActionForCandidate(state, bestCard) : null;
}

function getNormalAttackAction(
  state: BattleState,
  options: { allowHeadquartersTargets?: boolean } = {}
): BattleAction | null {
  const allowHeadquartersTargets = options.allowHeadquartersTargets ?? true;
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
      if (!allowHeadquartersTargets && target.type === "headquarters") continue;

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

  if (allowHeadquartersTargets && !state.headquarters.bot.alreadyAttacked) {
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

function getEasyBotAction(state: BattleState): BattleAction | null {
  if (shouldPrioritizeSpawn(state)) {
    const playCardAction = getStrategicPlayCardAction(state);
    if (playCardAction) return playCardAction;
  }

  const normalAttack = getNormalAttackAction(state, {
    allowHeadquartersTargets: false,
  });
  if (normalAttack) return normalAttack;

  const moveAction = getStrategicMoveAction(state);
  if (moveAction) return moveAction;

  const playCardAction = getStrategicPlayCardAction(state);
  if (playCardAction) return playCardAction;

  return null;
}

function getMediumBotAction(state: BattleState): BattleAction | null {
  const lethalAttack = getLethalAttackAction(state);
  if (lethalAttack) return lethalAttack;

  const killUnitAttack = getKillUnitAttackAction(state);
  if (killUnitAttack) return killUnitAttack;

  if (shouldPrioritizeSpawn(state)) {
    const playCardAction = getStrategicPlayCardAction(state);
    if (playCardAction) return playCardAction;
  }

  const normalAttack = getNormalAttackAction(state, {
    allowHeadquartersTargets: false,
  });
  if (normalAttack) return normalAttack;

  const moveAction = getStrategicMoveAction(state);
  if (moveAction) return moveAction;

  const playCardAction = getStrategicPlayCardAction(state);
  if (playCardAction) return playCardAction;

  return null;
}

function getHardBotAction(state: BattleState): BattleAction | null {
  const lethalAttack = getLethalAttackAction(state);
  if (lethalAttack) return lethalAttack;

  const headquartersPressureAttack = getHeadquartersPressureAttackAction(state);
  if (headquartersPressureAttack) return headquartersPressureAttack;

  const killUnitAttack = getKillUnitAttackAction(state);
  if (killUnitAttack) return killUnitAttack;

  if (shouldPrioritizeSpawn(state)) {
    const playCardAction = getStrategicPlayCardAction(state);
    if (playCardAction) return playCardAction;
  }

  const normalAttack = getNormalAttackAction(state);
  if (normalAttack) return normalAttack;

  const moveAction = getStrategicMoveAction(state);
  if (moveAction) return moveAction;

  const playCardAction = getStrategicPlayCardAction(state);
  if (playCardAction) return playCardAction;

  return null;
}

type TacticalMovePlan = {
  score: number;
  extraMoves: number;
  attacksRearUnit: boolean;
  attacksTdFromRear: boolean;
};

/** Best legal attack for one unit from its position in a simulated state. */
function getBestPlannedUnitAttack(
  state: BattleState,
  unitId: string
): Omit<TacticalMovePlan, "extraMoves"> | null {
  const attacker = getBotUnitById(state, unitId);
  if (!attacker || attacker.alreadyAttacked) return null;

  let best: Omit<TacticalMovePlan, "extraMoves"> | null = null;

  for (const target of getTargetsInRange(state, "bot", "unit", unitId)) {
    const action: AttackAction = {
      type: "ATTACK",
      playerId: "bot",
      attackerType: "unit",
      attackerId: unitId,
      targetType: target.type,
      targetId: target.id,
    };
    const score = scoreAttackAction(state, action);
    if (score === null) continue;

    const enemyUnit =
      target.type === "unit" ? getEnemyUnitById(state, target.id) : undefined;
    const candidate = {
      score,
      attacksRearUnit: !!enemyUnit && isSupportUnit(enemyUnit),
      attacksTdFromRear:
        !!enemyUnit && isRearAttackOnEnemyTd(attacker.position, enemyUnit),
    };

    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
}

/**
 * Search a few legal moves ahead after `firstCell`. This uses applyAction and
 * getAvailableMoveCells instead of duplicating movement budgets/path blocking,
 * so blitz, light-tank and armored-car routes follow the real engine rules.
 */
function getTacticalMovePlan(
  state: BattleState,
  unit: BoardUnit,
  firstCell: Position
): TacticalMovePlan | null {
  if (unit.alreadyAttacked) return null;

  const firstState = applyAction(state, {
    type: "MOVE_UNIT",
    playerId: "bot",
    unitId: unit.instanceId,
    position: firstCell,
  });
  const movedUnit = getBotUnitById(firstState, unit.instanceId);

  if (!movedUnit || samePosition(movedUnit.position, unit.position)) return null;

  const queue: { state: BattleState; extraMoves: number }[] = [
    { state: firstState, extraMoves: 0 },
  ];
  const queued = new Set<string>([
    `${movedUnit.position.row}:${movedUnit.position.col}:${
      movedUnit.moveCountThisTurn ?? 0
    }`,
  ]);
  let best: TacticalMovePlan | null = null;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const currentUnit = getBotUnitById(current.state, unit.instanceId);
    if (!currentUnit) continue;

    const attack = getBestPlannedUnitAttack(current.state, unit.instanceId);
    if (attack) {
      const routeScore = attack.score - current.extraMoves * 5;
      if (!best || routeScore > best.score) {
        best = { ...attack, score: routeScore, extraMoves: current.extraMoves };
      }
    }

    if (
      current.extraMoves >= MAX_TACTICAL_ROUTE_EXTRA_MOVES ||
      currentUnit.alreadyMoved
    ) {
      continue;
    }

    for (const cell of getAvailableMoveCells(
      current.state,
      "bot",
      unit.instanceId
    )) {
      const nextState = applyAction(current.state, {
        type: "MOVE_UNIT",
        playerId: "bot",
        unitId: unit.instanceId,
        position: cell,
      });
      const nextUnit = getBotUnitById(nextState, unit.instanceId);

      if (!nextUnit || samePosition(nextUnit.position, currentUnit.position)) {
        continue;
      }

      const nextKey = `${nextUnit.position.row}:${nextUnit.position.col}:${
        nextUnit.moveCountThisTurn ?? 0
      }`;
      if (queued.has(nextKey)) continue;
      queued.add(nextKey);

      queue.push({ state: nextState, extraMoves: current.extraMoves + 1 });
    }
  }

  return best && best.score >= MIN_TACTICAL_MOVE_ATTACK_SCORE ? best : null;
}

function getStrategicMoveAction(state: BattleState): BattleAction | null {
  const mostDangerousEnemy = getMostDangerousEnemyUnit(state);
  const nationalAbility = getBotNationalAbility(state);
  const advancingOnHeadquarters = shouldAdvanceOnHeadquarters(state);

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
      const cornerBonus = card.combatAbilities?.cornerBonus;
      const proximityBonus = card.combatAbilities?.hqProximityBonus;
      const mustClearSpawn = shouldMoveSpgToClearSpawn(state, unit);
      // «Огневая позиция»: an SPG with a corner bonus actively seeks a corner.
      const wantsCorner = !!cornerBonus && !isCornerCell(unit.position);
      // «Огневой вал»: an SPG that hits harder after advancing pushes forward.
      const wantsApproach = !!proximityBonus;

      if (!mustClearSpawn && !wantsCorner && !wantsApproach) continue;

      const cornerValue = cornerBonus
        ? (cornerBonus.attack ?? 0) * 10 + (cornerBonus.hp ?? 0) * 6 + 16
        : 0;
      // Reward cells farther from the bot spawn by the firepower they unlock.
      const proximityValue = (cell: Position) =>
        proximityBonus
          ? Math.max(0, getFrontColumn("bot") - cell.col) *
            proximityBonus.maxBonus *
            14
          : 0;
      const scoreCell = (cell: Position) =>
        getSpgPositionScore(state, cell) +
        (cornerBonus && isCornerCell(cell) ? cornerValue : 0) +
        proximityValue(cell);

      const bestCell = moveCells
        .filter((cell) => (mustClearSpawn ? !isBotSpawnCell(cell) : true))
        .map((cell) => ({ cell, score: scoreCell(cell) }))
        .sort((a, b) => b.score - a.score)[0];

      if (!bestCell) continue;

      // When only repositioning for a corner (not forced off the spawn), the
      // move must actually improve the SPG's firing position.
      if (!mustClearSpawn && bestCell.score <= scoreCell(unit.position)) continue;

      candidates.push({
        action: {
          type: "MOVE_UNIT",
          playerId: "bot",
          unitId: unit.instanceId,
          position: bestCell.cell,
        },
        score: bestCell.score + 28,
      });

      continue;
    }

    const currentTargets = getTargetsInRange(
      state,
      "bot",
      "unit",
      unit.instanceId
    );
    const currentAttackPlan = getBestPlannedUnitAttack(
      state,
      unit.instanceId
    );

    // Если юнит уже может атаковать, движение обычно не нужно.
    const currentCanAttackHeadquarters = currentTargets.some(
      (target) => target.type === "headquarters" && target.id === "player_hq"
    );

    if (
      !unit.alreadyAttacked &&
      currentTargets.length > 0 &&
      currentAttackPlan !== null &&
      (!advancingOnHeadquarters || currentCanAttackHeadquarters)
    ) {
      continue;
    }

    const playerHq = state.headquarters.player.position;
    const currentDistance = getDistance(unit.position, playerHq);
    const currentThreatDistance = mostDangerousEnemy
      ? getDistance(unit.position, mostDangerousEnemy.position)
      : null;
    const enemyPressure =
      mostDangerousEnemy &&
      getDistance(mostDangerousEnemy.position, state.headquarters.bot.position) <= 3
        ? getUnitThreatScore(state, mostDangerousEnemy)
        : 0;
    // «Прорыв»: a raid unit that has not triggered yet wants the enemy spawn.
    const raidDraw = unit.raidDrawUsed
      ? 0
      : card.combatAbilities?.raidDraw ?? 0;
    // How much the national formation is worth from where the unit stands now —
    // moving away from a completed «Сплочение»/«Глухая оборона» line costs it.
    const currentFormationValue = getNationalFormationCellValue(
      state,
      nationalAbility,
      unit.instanceId,
      unit.position
    );

    const bestCell = moveCells
      .map((cell) => {
        const distanceToPlayerHq = getDistance(cell, playerHq);
        const distanceGain = currentDistance - distanceToPlayerHq;
        const threatDistanceGain =
          mostDangerousEnemy && currentThreatDistance !== null
            ? currentThreatDistance - getDistance(cell, mostDangerousEnemy.position)
            : 0;
        const tacticalPlan = getTacticalMovePlan(state, unit, cell);
        const enablesAttack =
          tacticalPlan?.extraMoves === 0 || moveEnablesAttack(state, card, cell);
        const canAttackHeadquartersFromCell = canCardAttackPosition(
          card.id,
          cell,
          playerHq
        );
        const spgProtectionBonus = getSpgProtectionPositionScore(
          state,
          card,
          cell
        );
        const raidBonus =
          raidDraw > 0 && isEnemySpawnCell(cell) ? raidDraw * 12 + 10 : 0;
        const formationDeltaRaw =
          getNationalFormationCellValue(
            state,
            nationalAbility,
            unit.instanceId,
            cell
          ) - currentFormationValue;
        const formationDelta =
          isLineFormationAbility(nationalAbility) && formationDeltaRaw < 0
            ? Math.ceil(formationDeltaRaw / 3)
            : formationDeltaRaw;
        const lineInitiativeBonus =
          isLineFormationAbility(nationalAbility) && distanceGain > 0
            ? advancingOnHeadquarters
              ? 12
              : 7
            : 0;
        const headquartersPositionBonus = canAttackHeadquartersFromCell
          ? advancingOnHeadquarters
            ? 30
            : 16
          : 0;
        const tacticalAttackBonus = tacticalPlan
          ? Math.round(tacticalPlan.score * 0.55) +
            (tacticalPlan.attacksRearUnit ? 18 : 0) +
            (tacticalPlan.attacksTdFromRear ? 24 : 0)
          : 0;

        return {
          cell,
          distanceGain,
          threatDistanceGain,
          enablesAttack,
          tacticalPlan,
          raidBonus,
          formationDelta,
          spgProtectionBonus,
          score:
            distanceGain * (advancingOnHeadquarters ? 7 : 3) +
            threatDistanceGain * (enemyPressure > 0 ? 7 : 2) +
            (enablesAttack ? 12 : 0) +
            tacticalAttackBonus +
            headquartersPositionBonus +
            spgProtectionBonus +
            raidBonus +
            lineInitiativeBonus +
            formationDelta,
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (!bestCell) continue;

    if (bestCell.score <= 0) continue;

    // Multi-move units must have a concrete reason for every continuation.
    // This prevents light tanks and armored cars from consuming their whole
    // budget by oscillating around a threat. A planned attack, an actual raid,
    // preserving a formation or a short HQ kill push are concrete reasons.
    if (
      (card.class === "light" || card.class === "armored_car") &&
      (unit.moveCountThisTurn ?? 0) > 0 &&
      !bestCell.tacticalPlan &&
      bestCell.raidBonus <= 0 &&
      bestCell.formationDelta <= 0 &&
      bestCell.spgProtectionBonus <= 0 &&
      !(
        advancingOnHeadquarters &&
        bestCell.distanceGain > 0 &&
        canCardAttackPosition(card.id, bestCell.cell, playerHq)
      )
    ) {
      continue;
    }

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
  if (shouldPressHeadquarters(state)) return false;

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
  if (getSpgProtectionCardBonus(state, bestCard.card) > 0) return true;

  // Если карта дает много топлива, бот старается играть ее раньше,
  // потому что она усилит экономику будущих ходов.
  if (bestCard.card.fuelGeneration >= 2) return true;

  return false;
}

export function getNextBotAction(
  state: BattleState,
  options: BotDecisionOptions = {}
): BattleAction | null {
  if (state.status !== "active") return null;
  if (state.activePlayer !== "bot") return null;

  const difficulty = options.difficulty ?? "full";
  const difficultyAction =
    difficulty === "easy"
      ? getEasyBotAction(state)
      : difficulty === "medium"
        ? getMediumBotAction(state)
        : difficulty === "hard"
          ? getHardBotAction(state)
          : null;

  if (difficulty !== "full") {
    return (
      difficultyAction ?? {
        type: "END_TURN",
        playerId: "bot",
      }
    );
  }

  // 1. Если можно немедленно победить — атакуем штаб.
  const lethalAttack = getLethalAttackAction(state);
  if (lethalAttack) return lethalAttack;

  const headquartersPressureAttack = getHeadquartersPressureAttackAction(state);
  if (headquartersPressureAttack) return headquartersPressureAttack;

  const developmentPlay = getDevelopmentPlayAction(state);
  if (developmentPlay) return developmentPlay;

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
// Fake PvP opponent styles
// ============================================================
//
// Server-driven "fake" opponents impersonate real players when matchmaking
// fails to find a human in time. Each fake gets a difficulty tier (reusing the
// easy/medium/hard/full ladder above) and one of several playstyles. A style is
// just a different ordering/filtering of the existing action generators, so the
// fake visibly favours a plan — sprinting the HQ, raiding the rear, farming the
// board, turtling, or all-out attack — instead of always playing the same
// optimal line. `sloppiness` layers in human-like mistakes on top.

export type FakeStyle =
  | "hq_rush"
  | "rear_raid"
  | "board_control"
  | "balanced"
  | "defensive"
  | "aggressive";

/** Best attack that targets the enemy headquarters, ignoring the pressure gate. */
function getAnyHeadquartersAttackAction(state: BattleState): BattleAction | null {
  const candidates = getAvailableHeadquartersAttackCandidates(state)
    .map((candidate) => {
      const score = scoreAttackAction(state, candidate.action);
      return score === null ? null : { action: candidate.action, score };
    })
    .filter((item): item is { action: AttackAction; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? null;
}

/** Best attack against an enemy support/rear unit — the raider's preferred prey. */
function getRearStrikeAttackAction(state: BattleState): BattleAction | null {
  const candidates: { action: BattleAction; score: number }[] = [];

  const consider = (action: AttackAction) => {
    const enemy = getEnemyUnitById(state, action.targetId);
    if (!enemy) return;

    const isRear =
      enemy.zone === "support" || getSupportUnitValue(getCard(enemy.cardId)) > 0;
    if (!isRear) return;

    const score = scoreAttackAction(state, action);
    if (score === null) return;

    candidates.push({ action, score: score + 40 });
  };

  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && isBattlefieldUnit(unit)
  );

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    for (const target of getTargetsInRange(state, "bot", "unit", unit.instanceId)) {
      if (target.type !== "unit") continue;
      consider({
        type: "ATTACK",
        playerId: "bot",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: "unit",
        targetId: target.id,
      });
    }
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    for (const target of getTargetsInRange(state, "bot", "headquarters", "bot_hq")) {
      if (target.type !== "unit") continue;
      consider({
        type: "ATTACK",
        playerId: "bot",
        attackerType: "headquarters",
        attackerId: "bot_hq",
        targetType: "unit",
        targetId: target.id,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? null;
}

/**
 * Highest-value attack that does not sacrifice the attacker (unless it trades
 * for a kill). Used by the defensive style, which will not throw units away.
 */
function getSafeAttackAction(
  state: BattleState,
  options: { allowHeadquartersTargets?: boolean } = {}
): BattleAction | null {
  const allowHeadquartersTargets = options.allowHeadquartersTargets ?? false;
  const candidates: { action: BattleAction; score: number }[] = [];

  const push = (action: AttackAction) => {
    const outcome = getAttackOutcome(state, action);
    if (!outcome || !outcome.attackerStruck || outcome.targetDamage <= 0) return;
    if (outcome.attackerDestroyed && !outcome.targetDestroyed) return;

    const score = scoreAttackAction(state, action);
    if (score === null) return;

    candidates.push({ action, score });
  };

  const botUnits = state.units.filter(
    (unit) => unit.ownerId === "bot" && isBattlefieldUnit(unit)
  );

  for (const unit of botUnits) {
    if (unit.alreadyAttacked) continue;

    for (const target of getTargetsInRange(state, "bot", "unit", unit.instanceId)) {
      if (!allowHeadquartersTargets && target.type === "headquarters") continue;
      push({
        type: "ATTACK",
        playerId: "bot",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: target.type,
        targetId: target.id,
      });
    }
  }

  if (!state.headquarters.bot.alreadyAttacked) {
    for (const target of getTargetsInRange(state, "bot", "headquarters", "bot_hq")) {
      if (!allowHeadquartersTargets && target.type === "headquarters") continue;
      push({
        type: "ATTACK",
        playerId: "bot",
        attackerType: "headquarters",
        attackerId: "bot_hq",
        targetType: target.type,
        targetId: target.id,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? null;
}

/**
 * A deliberately imperfect action: a random legal move or card play, or an early
 * end of turn. Lets a fake opponent "тупить" — shuffle around, misplay, or pass
 * when it still had options — the way a distracted human might.
 */
function getRandomLegalAction(state: BattleState): BattleAction | null {
  const options: BattleAction[] = [];

  for (const candidate of getPlayableCardCandidates(state).slice(0, 4)) {
    const action = getPlayActionForCandidate(state, candidate);
    if (action) options.push(action);
  }

  const movable = state.units.filter(
    (unit) =>
      unit.ownerId === "bot" && isBattlefieldUnit(unit) && !unit.alreadyMoved
  );

  for (const unit of movable.slice(0, 4)) {
    const cells = getAvailableMoveCells(state, "bot", unit.instanceId);
    if (cells.length === 0) continue;

    const cell = cells[Math.floor(Math.random() * cells.length)];
    options.push({
      type: "MOVE_UNIT",
      playerId: "bot",
      unitId: unit.instanceId,
      position: cell,
    });
  }

  if (options.length === 0) return null;

  // Sometimes just pass despite having options — a human moment of hesitation.
  if (Math.random() < 0.25) return { type: "END_TURN", playerId: "bot" };

  return options[Math.floor(Math.random() * options.length)];
}

function getHqRushStyleAction(state: BattleState): BattleAction | null {
  const hqAttack = getAnyHeadquartersAttackAction(state);
  if (hqAttack) return hqAttack;

  if (shouldPrioritizeSpawn(state)) {
    const play = getStrategicPlayCardAction(state);
    if (play) return play;
  }

  const move = getStrategicMoveAction(state);
  if (move) return move;

  const attack = getNormalAttackAction(state, { allowHeadquartersTargets: true });
  if (attack) return attack;

  return getStrategicPlayCardAction(state);
}

function getRearRaidStyleAction(state: BattleState): BattleAction | null {
  const rear = getRearStrikeAttackAction(state);
  if (rear) return rear;

  const kill = getKillUnitAttackAction(state);
  if (kill) return kill;

  const move = getStrategicMoveAction(state);
  if (move) return move;

  if (shouldPrioritizeSpawn(state)) {
    const play = getStrategicPlayCardAction(state);
    if (play) return play;
  }

  const attack = getNormalAttackAction(state, { allowHeadquartersTargets: true });
  if (attack) return attack;

  return getStrategicPlayCardAction(state);
}

function getBoardControlStyleAction(state: BattleState): BattleAction | null {
  const kill = getKillUnitAttackAction(state);
  if (kill) return kill;

  const pressure = getHeadquartersPressureAttackAction(state);
  if (pressure) return pressure;

  if (shouldPrioritizeSpawn(state)) {
    const play = getStrategicPlayCardAction(state);
    if (play) return play;
  }

  const attack = getNormalAttackAction(state, { allowHeadquartersTargets: false });
  if (attack) return attack;

  const move = getStrategicMoveAction(state);
  if (move) return move;

  return getStrategicPlayCardAction(state);
}

function getDefensiveStyleAction(state: BattleState): BattleAction | null {
  const develop = getDevelopmentPlayAction(state);
  if (develop) return develop;

  const kill = getKillUnitAttackAction(state);
  if (kill) return kill;

  const safe = getSafeAttackAction(state, { allowHeadquartersTargets: false });
  if (safe) return safe;

  // Turtle: no forward advances — hold the line and keep developing the rear.
  return getStrategicPlayCardAction(state);
}

function getAggressiveStyleAction(state: BattleState): BattleAction | null {
  const pressure = getHeadquartersPressureAttackAction(state);
  if (pressure) return pressure;

  const kill = getKillUnitAttackAction(state);
  if (kill) return kill;

  if (shouldPrioritizeSpawn(state)) {
    const play = getStrategicPlayCardAction(state);
    if (play) return play;
  }

  const attack = getNormalAttackAction(state, { allowHeadquartersTargets: true });
  if (attack) return attack;

  const move = getStrategicMoveAction(state);
  if (move) return move;

  return getStrategicPlayCardAction(state);
}

/**
 * One action for a server-driven fake opponent. `difficulty` sets the baseline
 * competence (also folded into `sloppiness`), `style` picks the plan. Returns
 * null when only ending the turn remains — the caller ends the turn.
 */
export function getFakeBotAction(
  state: BattleState,
  options: { difficulty: BotDifficulty; style: FakeStyle; sloppiness?: number }
): BattleAction | null {
  if (state.status !== "active") return null;
  if (state.activePlayer !== "bot") return null;

  const sloppiness = options.sloppiness ?? 0;

  // A free win is (almost) always taken — but a very sloppy opponent can whiff it.
  const lethal = getLethalAttackAction(state);
  if (lethal && !(sloppiness > 0 && Math.random() < sloppiness * 0.4)) {
    return lethal;
  }

  if (sloppiness > 0 && Math.random() < sloppiness) {
    const random = getRandomLegalAction(state);
    if (random) return random;
  }

  switch (options.style) {
    case "hq_rush":
      return getHqRushStyleAction(state);
    case "rear_raid":
      return getRearRaidStyleAction(state);
    case "board_control":
      return getBoardControlStyleAction(state);
    case "defensive":
      return getDefensiveStyleAction(state);
    case "aggressive":
      return getAggressiveStyleAction(state);
    case "balanced":
    default:
      return getNextBotAction(state, { difficulty: options.difficulty });
  }
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
