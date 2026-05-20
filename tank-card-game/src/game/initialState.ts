import { cards } from "./cards";
import type { BattleState } from "./types";

function createCardInstance(cardId: string, index: number) {
  return {
    instanceId: `${cardId}_${index}_${crypto.randomUUID()}`,
    cardId,
  };
}

function createDeck(cardIds: string[]) {
  return cardIds.map((cardId, index) => createCardInstance(cardId, index));
}

function createPlayerDeck() {
  return createDeck([
    "m5_stuart",
    "t34_76",
    "su76",
    "kv1",
    "m4_sherman",
    "churchill",
    "su_122",
    "t34_76",
    "m5_stuart",
    "su76",
  ]);
}

function createBotDeck() {
  return createDeck([
    "panzer_iv",
    "marder_iii",
    "stug_iii",
    "tiger_i",
    "wespe",
    "panzer_iv",
    "marder_iii",
    "stug_iii",
    "tiger_i",
    "wespe",
  ]);
}

function drawStartingHand(deck: ReturnType<typeof createDeck>, count: number) {
  return {
    hand: deck.slice(0, count),
    deck: deck.slice(count),
  };
}

export function createInitialBattleState(): BattleState {
  const playerDeck = createPlayerDeck();
  const botDeck = createBotDeck();

  const playerStartingCards = drawStartingHand(playerDeck, 4);
  const botStartingCards = drawStartingHand(botDeck, 4);

  const playerHeadquartersFuel = 3;
  const botHeadquartersFuel = 3;

  return {
    turn: 1,
    activePlayer: "player",
    status: "active",

    player: {
      id: "player",
      deck: playerStartingCards.deck,
      hand: playerStartingCards.hand,
      discard: [],
      resources: playerHeadquartersFuel,
      maxResources: playerHeadquartersFuel,
    },

    bot: {
      id: "bot",
      deck: botStartingCards.deck,
      hand: botStartingCards.hand,
      discard: [],
      resources: botHeadquartersFuel,
      maxResources: botHeadquartersFuel,
    },

    units: [],

    headquarters: {
      player: {
        ownerId: "player",
        position: { row: 2, col: 0 },
        hp: 20,
        attack: 1,
        range: 99,
        fuelGeneration: playerHeadquartersFuel,
        actionFuelCost: 1,
        alreadyAttacked: false,
      },

      bot: {
        ownerId: "bot",
        position: { row: 0, col: 4 },
        hp: 20,
        attack: 1,
        range: 99,
        fuelGeneration: botHeadquartersFuel,
        actionFuelCost: 1,
        alreadyAttacked: false,
      },
    },

    log: [
      `Бой начался. Штаб игрока генерирует ${playerHeadquartersFuel} топлива.`,
    ],
  };
}