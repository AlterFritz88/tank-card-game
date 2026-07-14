import { getCard } from "./cards";
import { getHeadquartersDefinition } from "./headquarters";
import { getDeckCardIds } from "./initialState";
import type { HeadquartersId, SupportRole, TankCard, TankClass, TankRarity } from "./types";

export type DeckWeightBreakdown = {
  headquartersLevel: number;
  headquartersWeight: number;
  cardWeight: number;
  totalWeight: number;
};

export type CardStrengthBreakdown = {
  attack: number;
  defense: number;
  economy: number;
  mobility: number;
  range: number;
  abilities: number;
  rarity: number;
  costDiscount: number;
  rolePenalty: number;
  total: number;
};

const RARITY_LEVEL_BONUS: Record<TankRarity, number> = {
  common: 0,
  uncommon: 0.35,
  rare: 0.7,
};

type ClassStrengthProfile = {
  attackWeight: number;
  hpWeight: number;
  fuelWeight: number;
  movementWeight: number;
  rangeWeight: number;
  costWeight: number;
  expectedAttack: number;
  expectedHp: number;
  expectedFuel: number;
  excessAttackPenalty: number;
  excessHpPenalty: number;
  excessFuelPenalty: number;
};

const CLASS_STRENGTH_PROFILES: Record<TankClass, ClassStrengthProfile> = {
  light: {
    attackWeight: 0.55,
    hpWeight: 0.55,
    fuelWeight: 0.8,
    movementWeight: 0.65,
    rangeWeight: 0.35,
    costWeight: 0.52,
    expectedAttack: 2,
    expectedHp: 3,
    expectedFuel: 1,
    excessAttackPenalty: 0.22,
    excessHpPenalty: 0.22,
    excessFuelPenalty: 0.1,
  },
  medium: {
    attackWeight: 0.68,
    hpWeight: 0.62,
    fuelWeight: 0.58,
    movementWeight: 0.42,
    rangeWeight: 0.35,
    costWeight: 0.5,
    expectedAttack: 3,
    expectedHp: 5,
    expectedFuel: 2,
    excessAttackPenalty: 0.12,
    excessHpPenalty: 0.12,
    excessFuelPenalty: 0.16,
  },
  heavy: {
    attackWeight: 0.62,
    hpWeight: 0.42,
    fuelWeight: 0.52,
    movementWeight: 0.55,
    rangeWeight: 0.3,
    costWeight: 0.46,
    expectedAttack: 3,
    expectedHp: 7,
    expectedFuel: 2,
    excessAttackPenalty: 0.14,
    excessHpPenalty: 0.04,
    excessFuelPenalty: 0.18,
  },
  td: {
    attackWeight: 0.46,
    hpWeight: 0.66,
    fuelWeight: 0.5,
    movementWeight: 0.38,
    rangeWeight: 0.34,
    costWeight: 0.48,
    expectedAttack: 4,
    expectedHp: 3,
    expectedFuel: 1,
    excessAttackPenalty: 0.04,
    excessHpPenalty: 0.42,
    excessFuelPenalty: 0.18,
  },
  spg: {
    attackWeight: 0.5,
    hpWeight: 0.62,
    fuelWeight: 0.5,
    movementWeight: 0.3,
    rangeWeight: 0.58,
    costWeight: 0.48,
    expectedAttack: 3,
    expectedHp: 3,
    expectedFuel: 1,
    excessAttackPenalty: 0.08,
    excessHpPenalty: 0.38,
    excessFuelPenalty: 0.18,
  },
  armored_car: {
    // Fast raider: prizes mobility and is deliberately soft on HP.
    attackWeight: 0.52,
    hpWeight: 0.5,
    fuelWeight: 0.72,
    movementWeight: 0.85,
    rangeWeight: 0.35,
    costWeight: 0.52,
    expectedAttack: 2,
    expectedHp: 3,
    expectedFuel: 1,
    excessAttackPenalty: 0.2,
    excessHpPenalty: 0.26,
    excessFuelPenalty: 0.1,
  },
};

const SUPPORT_ROLE_BONUS: Record<SupportRole, number> = {
  artillery: 0.45,
  transport: 0.35,
  medical: 0.35,
};

const MAX_CARD_STRENGTH_LEVEL = 7;
const WEIGHT_EXPONENTIAL_BASE = 1.6;

export function getCardStrengthLevel(card: TankCard): number {
  return Math.min(
    MAX_CARD_STRENGTH_LEVEL,
    Math.max(1, Math.round(getCardStrength(card).total))
  );
}

export function getCardLevel(card: TankCard): number {
  // Research/campaign level describes progression, not combat power. Every unit
  // first receives a live combat-strength level and only then an exponential
  // weight. Capping the combat scale at seven keeps the exponential curve useful
  // for matchmaking without letting one exceptional card outweigh a whole deck.
  return getExponentialLevelWeight(getCardStrengthLevel(card));
}

export function getCardStrength(card: TankCard): CardStrengthBreakdown {
  const profile = CLASS_STRENGTH_PROFILES[card.class];
  const attack = card.attack * profile.attackWeight;
  // Printed `armor` is currently informational and has no effect in combat,
  // so it must not inflate matchmaking/deck strength either.
  const defense = card.hp * profile.hpWeight;
  const economy =
    card.fuelGeneration * profile.fuelWeight +
    (card.deploymentZone === "support" ? 0.3 : 0);
  const mobility = Math.max(0, card.movement - 1) * profile.movementWeight;
  const range = Math.max(0, card.range - 1) * profile.rangeWeight;
  const abilities = getAbilityStrength(card);
  const rarity = RARITY_LEVEL_BONUS[card.rarity];
  const costDiscount = card.cost * profile.costWeight;
  const rolePenalty = getRolePenalty(card, profile);
  const total = Math.max(
    1,
    attack +
      defense +
      economy +
      mobility +
      range +
      abilities +
      rarity +
      rolePenalty -
      costDiscount
  );

  return {
    attack,
    defense,
    economy,
    mobility,
    range,
    abilities,
    rarity,
    costDiscount,
    rolePenalty,
    total,
  };
}

export function getHeadquartersLevel(headquartersId: HeadquartersId): number {
  return normalizeLevel(getHeadquartersDefinition(headquartersId).level);
}

export function getHeadquartersWeight(headquartersId: HeadquartersId): number {
  const headquarters = getHeadquartersDefinition(headquartersId);
  const levelWeight = getExponentialLevelWeight(headquarters.level);
  const durability = headquarters.hp * 0.35;
  const firepower = headquarters.attack * 2.8;
  const economy = headquarters.fuelGeneration * 2.2;
  const range = headquarters.range > 1 ? 1 : 0;

  return Math.max(
    1,
    Math.round(levelWeight + durability + firepower + economy + range)
  );
}

export function getDefaultDeckWeight(
  headquartersId: HeadquartersId
): DeckWeightBreakdown {
  const headquarters = getHeadquartersDefinition(headquartersId);

  return calculateDeckWeight(headquartersId, getDeckCardIds(headquarters.defaultDeckId));
}

export function calculateDeckWeight(
  headquartersId: HeadquartersId,
  cardIds: string[]
): DeckWeightBreakdown {
  const headquartersLevel = getHeadquartersLevel(headquartersId);
  const headquartersWeight = getHeadquartersWeight(headquartersId);
  const cardWeight = cardIds.reduce((total, cardId) => {
    try {
      return total + getCardLevel(getCard(cardId));
    } catch {
      return total;
    }
  }, 0);

  return {
    headquartersLevel,
    headquartersWeight,
    cardWeight,
    totalWeight: headquartersWeight + cardWeight,
  };
}

function normalizeLevel(level: number): number {
  return Math.max(1, Math.floor(level));
}

function getExponentialLevelWeight(level: number): number {
  const normalizedLevel = normalizeLevel(level);

  return Math.max(
    1,
    Math.round(WEIGHT_EXPONENTIAL_BASE ** (normalizedLevel - 1))
  );
}

function getAbilityStrength(card: TankCard): number {
  let score = 0;

  if (card.onPlayEffects?.draw) {
    score += card.onPlayEffects.draw * 1.1;
  }

  if (card.onPlayEffects?.hqProtection) {
    score += card.onPlayEffects.hqProtection * 0.8;
  }

  const deployDamage = card.onPlayEffects?.deployDamage;
  if (deployDamage) {
    const targetMultiplier =
      deployDamage.scope === "classes"
        ? Math.max(1, deployDamage.classes?.length ?? 0)
        : 1;
    score += deployDamage.amount * targetMultiplier * 0.7;
  }

  if (card.onPlayEffects?.suppressEnemyIndirect) {
    score += 0.65;
  }

  if (card.onPlayEffects?.fetchToHand) {
    score += 0.65;
  }

  if (card.combatAbilities?.blitz) {
    score += 1.1;
  }

  const combatAbilities = card.combatAbilities;
  if (combatAbilities?.camouflage) {
    score += 0.5;
  }
  if (combatAbilities?.lightScreen) {
    score += 0.65;
  }
  if (combatAbilities?.tankDefenseAura) {
    score += combatAbilities.tankDefenseAura * 1.25;
  }
  if (combatAbilities?.raidDraw) {
    score += combatAbilities.raidDraw * 0.55;
  }
  if (combatAbilities?.spawnDamageReduction) {
    score += combatAbilities.spawnDamageReduction * 0.5;
  }
  if (combatAbilities?.armorVsClass) {
    score += combatAbilities.armorVsClass.amount * 0.4;
  }
  if (combatAbilities?.frontalArmor) {
    score += combatAbilities.frontalArmor.amount * 0.45;
  }
  if (combatAbilities?.drawWhenAttacked) {
    score += combatAbilities.drawWhenAttacked * 0.6;
  }
  if (combatAbilities?.cornerBonus) {
    score += (combatAbilities.cornerBonus.attack ?? 0) * 0.45;
    score += (combatAbilities.cornerBonus.hp ?? 0) * 0.25;
  }
  if (combatAbilities?.hqProximityBonus) {
    score += combatAbilities.hqProximityBonus.maxBonus * 0.45;
  }
  if (combatAbilities?.attackEqualsHq) {
    score += 0.75;
  }
  if (combatAbilities?.longGun) {
    score += combatAbilities.longGun.armorIgnored * 0.4;
  }
  if (combatAbilities?.repairAura) {
    // Besides restoring HP, a repair vehicle clears immobilization and engine
    // fires from every adjacent ally, so the utility floor is substantial.
    score += 2 + (combatAbilities.repairAura.healHp ?? 1) * 0.75;
  }

  // Negative abilities reduce real combat value and therefore the deck weight.
  if (combatAbilities?.flankVulnerable) {
    score -= combatAbilities.flankVulnerable.amount * 0.3;
  }
  if (combatAbilities?.overheat) {
    const deploymentDamage = combatAbilities.overheat.deploymentDamage;
    if (deploymentDamage) {
      score -= ((deploymentDamage.min + deploymentDamage.max) / 2) * 0.35;
    }
    if (combatAbilities.overheat.threshold) {
      score -= 0.35;
    }
    if (combatAbilities.overheat.moveDamage) {
      score -= combatAbilities.overheat.moveDamage * 0.25;
    }
  }

  if (card.costModifiers) {
    score += card.costModifiers.discount * 0.4;
  }

  if (card.supportRole) {
    score += SUPPORT_ROLE_BONUS[card.supportRole];
  }

  const supportEffects = card.supportEffects;
  if (supportEffects) {
    score += (supportEffects.hqAttackBonus ?? 0) * 0.85;
    score += (supportEffects.hqDamageRedirect ?? 0) * 0.55;
    score += (supportEffects.supportLineCover ?? 0) * 0.9;
    score += (supportEffects.returnFire ?? 0) * 0.55;
    score += (supportEffects.tankScreenClasses?.length ?? 0) * 0.42;
    score += (supportEffects.fuelPerTurn ?? 0) * 0.72;
    score += supportEffects.drawEveryTurns
      ? 1.2 / supportEffects.drawEveryTurns
      : 0;
    score += supportEffects.fetchSupportCardEveryTurns
      ? 1 / supportEffects.fetchSupportCardEveryTurns
      : 0;
    score += (supportEffects.healRandomUnitPerTurn ?? 0) * 0.62;
    score += (supportEffects.hqHealPerTurn ?? 0) * 0.58;
    score += supportEffects.healClass ? 0.18 : 0;
  }

  return score;
}

function getRolePenalty(
  card: TankCard,
  profile: ClassStrengthProfile
): number {
  return (
    getExcess(card.attack, profile.expectedAttack) *
      profile.excessAttackPenalty +
    getExcess(card.hp, profile.expectedHp) * profile.excessHpPenalty +
    getExcess(card.fuelGeneration, profile.expectedFuel) *
      profile.excessFuelPenalty
  );
}

function getExcess(value: number, expected: number): number {
  return Math.max(0, value - expected);
}
