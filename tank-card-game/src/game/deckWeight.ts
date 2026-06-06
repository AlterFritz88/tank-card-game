import { getCard } from "./cards";
import { getHeadquartersDefinition } from "./headquarters";
import { getDeckCardIds } from "./initialState";
import type { HeadquartersId, SupportRole, TankCard, TankClass, TankRarity } from "./types";

export type DeckWeightBreakdown = {
  headquartersLevel: number;
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
  armorWeight: number;
  fuelWeight: number;
  movementWeight: number;
  rangeWeight: number;
  costWeight: number;
  expectedAttack: number;
  expectedHp: number;
  expectedArmor: number;
  expectedFuel: number;
  excessAttackPenalty: number;
  excessHpPenalty: number;
  excessArmorPenalty: number;
  excessFuelPenalty: number;
};

const CLASS_STRENGTH_PROFILES: Record<TankClass, ClassStrengthProfile> = {
  light: {
    attackWeight: 0.55,
    hpWeight: 0.55,
    armorWeight: 0.65,
    fuelWeight: 0.8,
    movementWeight: 0.65,
    rangeWeight: 0.35,
    costWeight: 0.52,
    expectedAttack: 2,
    expectedHp: 3,
    expectedArmor: 0,
    expectedFuel: 1,
    excessAttackPenalty: 0.22,
    excessHpPenalty: 0.22,
    excessArmorPenalty: 0.35,
    excessFuelPenalty: 0.1,
  },
  medium: {
    attackWeight: 0.68,
    hpWeight: 0.62,
    armorWeight: 0.72,
    fuelWeight: 0.58,
    movementWeight: 0.42,
    rangeWeight: 0.35,
    costWeight: 0.5,
    expectedAttack: 3,
    expectedHp: 5,
    expectedArmor: 1,
    expectedFuel: 2,
    excessAttackPenalty: 0.12,
    excessHpPenalty: 0.12,
    excessArmorPenalty: 0.18,
    excessFuelPenalty: 0.16,
  },
  heavy: {
    attackWeight: 0.62,
    hpWeight: 0.42,
    armorWeight: 0.5,
    fuelWeight: 0.52,
    movementWeight: 0.55,
    rangeWeight: 0.3,
    costWeight: 0.46,
    expectedAttack: 3,
    expectedHp: 7,
    expectedArmor: 2,
    expectedFuel: 2,
    excessAttackPenalty: 0.14,
    excessHpPenalty: 0.04,
    excessArmorPenalty: 0.08,
    excessFuelPenalty: 0.18,
  },
  td: {
    attackWeight: 0.46,
    hpWeight: 0.66,
    armorWeight: 0.88,
    fuelWeight: 0.5,
    movementWeight: 0.38,
    rangeWeight: 0.34,
    costWeight: 0.48,
    expectedAttack: 4,
    expectedHp: 3,
    expectedArmor: 0,
    expectedFuel: 1,
    excessAttackPenalty: 0.04,
    excessHpPenalty: 0.42,
    excessArmorPenalty: 0.62,
    excessFuelPenalty: 0.18,
  },
  spg: {
    attackWeight: 0.5,
    hpWeight: 0.62,
    armorWeight: 0.82,
    fuelWeight: 0.5,
    movementWeight: 0.3,
    rangeWeight: 0.58,
    costWeight: 0.48,
    expectedAttack: 3,
    expectedHp: 3,
    expectedArmor: 0,
    expectedFuel: 1,
    excessAttackPenalty: 0.08,
    excessHpPenalty: 0.38,
    excessArmorPenalty: 0.58,
    excessFuelPenalty: 0.18,
  },
};

const SUPPORT_ROLE_BONUS: Record<SupportRole, number> = {
  artillery: 0.45,
  transport: 0.35,
  medical: 0.35,
};

export function getCardLevel(card: TankCard): number {
  if (card.level !== undefined) {
    return getExponentialLevelWeight(card.level);
  }

  return getExponentialLevelWeight(getCardStrength(card).total);
}

export function getCardStrength(card: TankCard): CardStrengthBreakdown {
  const profile = CLASS_STRENGTH_PROFILES[card.class];
  const attack = card.attack * profile.attackWeight;
  const defense =
    card.hp * profile.hpWeight + card.armor * (1 + profile.armorWeight);
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
  const cardWeight = cardIds.reduce((total, cardId) => {
    try {
      return total + getCardLevel(getCard(cardId));
    } catch {
      return total;
    }
  }, 0);

  return {
    headquartersLevel,
    cardWeight,
    totalWeight: headquartersLevel + cardWeight,
  };
}

function normalizeLevel(level: number): number {
  return Math.max(1, Math.floor(level));
}

function getExponentialLevelWeight(level: number): number {
  const normalizedLevel = normalizeLevel(level);

  return Math.max(1, Math.round(1.55 ** (normalizedLevel - 1)));
}

function getAbilityStrength(card: TankCard): number {
  let score = 0;

  if (card.onPlayEffects?.draw) {
    score += card.onPlayEffects.draw * 0.8;
  }

  if (card.onPlayEffects?.hqProtection) {
    score += card.onPlayEffects.hqProtection * 0.55;
  }

  if (card.supportRole) {
    score += SUPPORT_ROLE_BONUS[card.supportRole];
  }

  const supportEffects = card.supportEffects;
  if (supportEffects) {
    score += (supportEffects.hqAttackBonus ?? 0) * 0.85;
    score += (supportEffects.hqDamageRedirect ?? 0) * 0.55;
    score += (supportEffects.fuelPerTurn ?? 0) * 0.72;
    score += supportEffects.drawEveryTurns
      ? 1.2 / supportEffects.drawEveryTurns
      : 0;
    score += (supportEffects.healRandomUnitPerTurn ?? 0) * 0.62;
    score += (supportEffects.hqHealPerTurn ?? 0) * 0.58;
    score += supportEffects.healClass ? 0.18 : 0;
  }

  if (card.abilityText) {
    score += 0.18;
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
    getExcess(card.armor, profile.expectedArmor) *
      profile.excessArmorPenalty +
    getExcess(card.fuelGeneration, profile.expectedFuel) *
      profile.excessFuelPenalty
  );
}

function getExcess(value: number, expected: number): number {
  return Math.max(0, value - expected);
}
