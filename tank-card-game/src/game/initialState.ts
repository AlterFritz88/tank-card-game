import type {
  BattleState,
  CardInstance,
  HeadquartersState,
  PlayerId,
  PlayerState,
  PlayerTimerState,
} from "./types";

export const STEP_TIME_MS = 15 * 1000;

const PLAYER_DECK_CARD_IDS = [
  "m4_sherman",
  "m5_stuart",
  "churchill",
  "su_122",
  "m4_sherman",
  "m5_stuart",
  "churchill",
  "su_122",
];

const BOT_DECK_CARD_IDS = [
  "panzer_iv",
  "stug_iii",
  "marder_iii",
  "wespe",
  "tiger_i",
  "panzer_iv",
  "stug_iii",
  "marder_iii",
];

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

function createPlayerState(owner: PlayerId, deckCardIds: string[]): PlayerState {
  const deck = shuffleCards(createCardInstances(deckCardIds, owner));

  return {
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

function createHeadquarters(ownerId: PlayerId): HeadquartersState {
  const isPlayer = ownerId === "player";

  return {
    ownerId,
    position: isPlayer ? { row: 2, col: 0 } : { row: 0, col: 4 },

    hp: 15,
    attack: 1,
    range: 99,

    fuelGeneration: 3,
    actionFuelCost: 1,

    alreadyAttacked: false,
  };
}

export function createInitialBattleState(): BattleState {
  const state: BattleState = {
    status: "starting",
    activePlayer: "player",
    turn: 1,

    player: createPlayerState("player", PLAYER_DECK_CARD_IDS),
    bot: createPlayerState("bot", BOT_DECK_CARD_IDS),

    headquarters: {
      player: createHeadquarters("player"),
      bot: createHeadquarters("bot"),
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
