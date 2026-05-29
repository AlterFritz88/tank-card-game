import {
  DEFAULT_BOT_HEADQUARTERS_ID,
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  getHeadquartersDefinition,
} from "./headquarters";
import { DEFAULT_BATTLE_BACKGROUND_ID } from "./battleBackgrounds";
import type { BattleBackgroundId } from "./battleBackgrounds";
import type {
  BattleState,
  CardInstance,
  HeadquartersId,
  HeadquartersState,
  PlayerId,
  PlayerState,
  PlayerTimerState,
} from "./types";

export const STEP_TIME_MS = 15 * 1000;

export type CreateBattleOptions = {
  playerHeadquartersId?: HeadquartersId;
  botHeadquartersId?: HeadquartersId;
  backgroundId?: BattleBackgroundId;
};

const DECK_CARD_IDS: Record<string, string[]> = {
  training_unit_default: [
    "m4_sherman",
    "m5_stuart",
    "churchill",
    "su_122",
    "m4_sherman",
    "m5_stuart",
    "churchill",
    "su_122",
  ],

  trainingslager_default: [
    "panzer_iv",
    "stug_iii",
    "marder_iii",
    "wespe",
    "tiger_i",
    "panzer_iv",
    "stug_iii",
    "marder_iii",
  ],
};

function createCardInstances(cardIds: string[], owner: PlayerId): CardInstance[] {
  return cardIds.map((cardId, index) => ({
    instanceId: `${owner}_${cardId}_${index}`,
    cardId,
  }));
}

function shuffleCards<T>(items: T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));

    [result[index], result[randomIndex]] = [
      result[randomIndex],
      result[index],
    ];
  }

  return result;
}

function createPlayerState(
  owner: PlayerId,
  headquartersId: HeadquartersId
): PlayerState {
  const headquarters = getHeadquartersDefinition(headquartersId);
  const deckCardIds = DECK_CARD_IDS[headquarters.defaultDeckId] ?? [];
  const deck = shuffleCards(createCardInstances(deckCardIds, owner));

  return {
    headquartersId,
    deckId: headquarters.defaultDeckId,
    deck,
    hand: [],
    discard: [],

    resources: 0,
    maxResources: 0,
  };
}

function createTimerState(): PlayerTimerState {
  return {
    stepTimeLeftMs: STEP_TIME_MS,
    idleStreak: 0,
    actedThisStep: false,
  };
}

function createHeadquarters(
  ownerId: PlayerId,
  headquartersId: HeadquartersId
): HeadquartersState {
  const isPlayer = ownerId === "player";
  const headquarters = getHeadquartersDefinition(headquartersId);

  return {
    ownerId,
    headquartersId,
    position: isPlayer ? { row: 2, col: 0 } : { row: 0, col: 4 },

    hp: headquarters.hp,
    attack: headquarters.attack,
    range: headquarters.range,

    fuelGeneration: headquarters.fuelGeneration,
    actionFuelCost: headquarters.actionFuelCost,

    alreadyAttacked: false,
  };
}

export function createInitialBattleState(
  options: CreateBattleOptions = {}
): BattleState {
  const playerHeadquartersId =
    options.playerHeadquartersId ?? DEFAULT_PLAYER_HEADQUARTERS_ID;
  const botHeadquartersId =
    options.botHeadquartersId ?? DEFAULT_BOT_HEADQUARTERS_ID;

  const state: BattleState = {
    status: "starting",
    activePlayer: "player",
    turn: 1,
    backgroundId: options.backgroundId ?? DEFAULT_BATTLE_BACKGROUND_ID,

    player: createPlayerState("player", playerHeadquartersId),
    bot: createPlayerState("bot", botHeadquartersId),

    headquarters: {
      player: createHeadquarters("player", playerHeadquartersId),
      bot: createHeadquarters("bot", botHeadquartersId),
    },

    units: [],

    timers: {
      player: createTimerState(),
      bot: createTimerState(),
    },

    stats: {
      destroyedByPlayer: {
        light: 0,
        medium: 0,
        heavy: 0,
        td: 0,
        spg: 0,
      },
      destroyedByBot: {
        light: 0,
        medium: 0,
        heavy: 0,
        td: 0,
        spg: 0,
      },
    },

    log: ["Бой готовится. Определяется первый ход."],
  };

  state.player.maxResources = state.headquarters.player.fuelGeneration;
  state.player.resources = state.player.maxResources;

  state.bot.maxResources = state.headquarters.bot.fuelGeneration;
  state.bot.resources = state.bot.maxResources;

  return state;
}

export const initialBattleState = createInitialBattleState();
