import { cards } from "./cards";
import type { BattleState, CardInstance } from "./types";

function createDeck(owner: "player" | "bot"): CardInstance[] {
  const deck: CardInstance[] = [];

  for (let copy = 0; copy < 2; copy += 1) {
    for (const card of cards) {
      deck.push({
        instanceId: `${owner}_${card.id}_${copy}`,
        cardId: card.id,
      });
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

function drawCards(deck: CardInstance[], count: number) {
  return {
    drawn: deck.slice(0, count),
    deck: deck.slice(count),
  };
}

export function createInitialBattleState(): BattleState {
  const playerDeck = createDeck("player");
  const botDeck = createDeck("bot");

  const playerDraw = drawCards(playerDeck, 5);
  const botDraw = drawCards(botDeck, 5);

  return {
    activePlayer: "player",
    turn: 1,
    status: "active",
    player: {
      id: "player",
      deck: playerDraw.deck,
      hand: playerDraw.drawn,
      discard: [],
      resources: 1,
      maxResources: 1,
    },
    bot: {
      id: "bot",
      deck: botDraw.deck,
      hand: botDraw.drawn,
      discard: [],
      resources: 1,
      maxResources: 1,
    },
    units: [],
    headquarters: {
      player: {
        ownerId: "player",
        position: { row: 2, col: 0 },
        hp: 20,
        attack: 1,
        range: 99,
        alreadyAttacked: false,
      },
      bot: {
        ownerId: "bot",
        position: { row: 0, col: 4 },
        hp: 20,
        attack: 1,
        range: 99,
        alreadyAttacked: false,
      },
    },
    log: ["Бой начался."],
  };
}