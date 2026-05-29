import type {
  BattleState,
  BattleStateView,
  CardInstance,
  HiddenCardInstance,
  PlayerId,
  PlayerState,
  PlayerStateView,
} from "../../tank-card-game/src/game/types";

function createHiddenHandCards(cards: CardInstance[]): HiddenCardInstance[] {
  return cards.map((card) => ({
    instanceId: card.instanceId,
    hidden: true,
  }));
}

function createHiddenDeckCards(
  count: number,
  prefix: string
): HiddenCardInstance[] {
  return Array.from({ length: count }, (_, index) => ({
    instanceId: `${prefix}-${index}`,
    hidden: true,
  }));
}

function createOwnPlayerView(
  player: PlayerState,
  ownerId: PlayerId
): PlayerStateView {
  return {
    ...player,
    hand: player.hand,
    deck: createHiddenDeckCards(player.deck.length, `${ownerId}-deck-hidden`),
    handCount: player.hand.length,
    deckCount: player.deck.length,
  };
}

function createOpponentPlayerView(
  player: PlayerState,
  ownerId: PlayerId
): PlayerStateView {
  return {
    ...player,
    hand: createHiddenHandCards(player.hand),
    deck: createHiddenDeckCards(player.deck.length, `${ownerId}-deck-hidden`),
    handCount: player.hand.length,
    deckCount: player.deck.length,
  };
}

export function createBattleViewForPlayer(
  battle: BattleState,
  viewerId: PlayerId
): BattleStateView {
  return {
    ...battle,
    player:
      viewerId === "player"
        ? createOwnPlayerView(battle.player, "player")
        : createOpponentPlayerView(battle.player, "player"),
    bot:
      viewerId === "bot"
        ? createOwnPlayerView(battle.bot, "bot")
        : createOpponentPlayerView(battle.bot, "bot"),
  };
}
