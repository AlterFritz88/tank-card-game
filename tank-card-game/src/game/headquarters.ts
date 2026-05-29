import type { HeadquartersId } from "./types";

export type HeadquartersDefinition = {
  id: HeadquartersId;
  title: string;
  subtitle: string;
  description: string;
  faction: string;
  hp: number;
  attack: number;
  range: number;
  fuelGeneration: number;
  actionFuelCost: number;
  artKey: string;
  defaultDeckId: string;
};

export const HEADQUARTERS: Record<HeadquartersId, HeadquartersDefinition> = {
  training_unit: {
    id: "training_unit",
    title: "Учебная часть",
    subtitle: "Базовый учебный штаб",
    description: "Стартовая учебная часть с универсальной колодой для освоения механик.",
    faction: "Учебные войска",
    hp: 15,
    attack: 1,
    range: 99,
    fuelGeneration: 3,
    actionFuelCost: 1,
    artKey: "player",
    defaultDeckId: "training_unit_default",
  },

  trainingslager: {
    id: "trainingslager",
    title: "Trainingslager",
    subtitle: "Немецкий учебный лагерь",
    description: "Учебный лагерь с немецкой техникой и стартовой немецкой колодой.",
    faction: "Trainingslager",
    hp: 15,
    attack: 1,
    range: 99,
    fuelGeneration: 3,
    actionFuelCost: 1,
    artKey: "enemy",
    defaultDeckId: "trainingslager_default",
  },
};

export const DEFAULT_PLAYER_HEADQUARTERS_ID: HeadquartersId = "training_unit";
export const DEFAULT_BOT_HEADQUARTERS_ID: HeadquartersId = "trainingslager";

export function getHeadquartersDefinition(
  headquartersId: HeadquartersId
): HeadquartersDefinition {
  return HEADQUARTERS[headquartersId] ?? HEADQUARTERS[DEFAULT_PLAYER_HEADQUARTERS_ID];
}
