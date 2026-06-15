import type {
  BattleAction,
  ClientBattleState,
  BattleStateView,
  HeadquartersId,
  PlayerId,
} from "../../tank-card-game/src/game/types";
import type { AttackAnimationStrike } from "../../tank-card-game/src/game/engine";
import type { BattleReward } from "../../tank-card-game/src/game/economy";
import type { GameMode, MatchEndReason as GameMatchEndReason } from "../../tank-card-game/src/game/modes";
import type {
  PlayerProgress,
  PlayerSavedDeck,
} from "../../tank-card-game/src/game/playerProgress";

export type PvpClientMessage =
  | {
      type: "FIND_MATCH";
      sessionId: string;
      playerId?: string;
      headquartersId: HeadquartersId;
      deckCardIds?: string[];
    }
  | {
      type: "CREATE_ROOM";
      sessionId: string;
      playerId?: string;
      headquartersId: HeadquartersId;
      deckCardIds?: string[];
    }
  | {
      type: "JOIN_ROOM";
      roomId: string;
      sessionId: string;
      playerId?: string;
      headquartersId: HeadquartersId;
      deckCardIds?: string[];
    }
  | { type: "RECONNECT"; sessionId: string; roomId?: string | null }
  | { type: "GAME_ACTION"; action: BattleAction }
  | { type: "SELECT_CARD"; cardInstanceId: string | null }
  | { type: "SURRENDER" }
  | { type: "LEAVE_MATCH" }
  | { type: "CANCEL_MATCHMAKING" }
  | { type: "GET_PROFILE"; requestId: string; playerId: string }
  | {
      type: "SAVE_PROFILE";
      requestId: string;
      playerId: string;
      profile: PlayerProgress;
    }
  | {
      type: "UPDATE_NICKNAME";
      requestId: string;
      playerId: string;
      nickname: string;
    }
  | {
      type: "UPDATE_FAVORITE_HEADQUARTERS";
      requestId: string;
      playerId: string;
      headquartersId: HeadquartersId | null;
    }
  | {
      type: "CLAIM_BATTLE_REWARD";
      requestId: string;
      playerId: string;
      claimId: string;
      battle: ClientBattleState;
      mode: GameMode;
      localPlayerId: PlayerId;
      matchEndReason?: GameMatchEndReason | null;
    }
  | {
      type: "CLAIM_PVP_BATTLE_REWARD";
      requestId: string;
      playerId: string;
      roomId: string;
      localPlayerId?: PlayerId;
    }
  | {
      type: "CLAIM_TUTORIAL_REWARD";
      requestId: string;
      playerId: string;
      reward: BattleReward;
      localPlayerWon: boolean;
    }
  | {
      type: "RESEARCH_CARD";
      requestId: string;
      playerId: string;
      cardId: string;
      sourceHeadquartersId: HeadquartersId;
    }
  | {
      type: "RESEARCH_HEADQUARTERS";
      requestId: string;
      playerId: string;
      headquartersId: HeadquartersId;
      sourceHeadquartersId: HeadquartersId;
    }
  | {
      type: "PURCHASE_CARD_COPY";
      requestId: string;
      playerId: string;
      cardId: string;
    }
  | {
      type: "PURCHASE_HEADQUARTERS";
      requestId: string;
      playerId: string;
      headquartersId: HeadquartersId;
    }
  | {
      type: "SAVE_CUSTOM_DECK";
      requestId: string;
      playerId: string;
      deck: PlayerSavedDeck;
    }
  | {
      type: "DELETE_CUSTOM_DECK";
      requestId: string;
      playerId: string;
      deckId: string;
    }
  | {
      type: "REGISTER_ACCOUNT";
      requestId: string;
      username: string;
      password: string;
      guestPlayerId?: string;
      mergeGuestProgress?: boolean;
    }
  | {
      type: "LOGIN_ACCOUNT";
      requestId: string;
      username: string;
      password: string;
      guestPlayerId?: string;
      mergeGuestProgress?: boolean;
    };

export type MatchEndReason =
  | "surrender"
  | "disconnect"
  | "leave"
  | "opponent_left";

export type PvpTurnTimerEvent = {
  type: "TURN_TIMER";
  activePlayer: PlayerId;
  remainingMs: number;
  endsAt: number;
  durationMs: number;
};

export type PvpMoveIntentEvent = {
  type: "MOVE_INTENT";
  intentId: string;
  playerId: PlayerId;
  unitId: string;
  position: { row: number; col: number };
  durationMs: number;
};

export type PvpAttackIntentEvent = {
  type: "ATTACK_INTENT";
  intentId: string;
  playerId: PlayerId;
  strikes: AttackAnimationStrike[];
  durationMs: number;
};

export type PvpServerMessage =
  | { type: "MATCHMAKING_STARTED" }
  | { type: "ROOM_CREATED"; roomId: string; playerId: PlayerId }
  | { type: "ROOM_JOINED"; roomId: string; playerId: PlayerId }
  | {
      type: "RECONNECTED";
      roomId: string;
      playerId: PlayerId;
      battle: BattleStateView;
      opponentNickname?: string | null;
    }
  | { type: "RECONNECT_FAILED"; message: string }
  | { type: "WAITING_FOR_OPPONENT"; roomId: string }
  | {
      type: "FIRST_TURN_ROLL";
      roomId: string;
      firstPlayer: PlayerId;
      startsAt: number;
      revealAt: number;
      battle: BattleStateView;
      opponentNickname?: string | null;
    }
  | {
      type: "GAME_STARTED";
      roomId: string;
      battle: BattleStateView;
      playerId: PlayerId;
      opponentNickname?: string | null;
    }
  | { type: "GAME_STATE"; roomId: string; battle: BattleStateView }
  | PvpTurnTimerEvent
  | PvpMoveIntentEvent
  | PvpAttackIntentEvent
  | {
      type: "OPPONENT_CARD_SELECTION";
      playerId: PlayerId;
      cardInstanceId: string | null;
    }
  | { type: "MATCH_ENDED"; winner: PlayerId; reason: MatchEndReason }
  | { type: "MATCHMAKING_CANCELLED" }
  | { type: "OPPONENT_LEFT"; reason: MatchEndReason }
  | { type: "OPPONENT_DISCONNECTED"; roomId: string }
  | {
      type: "PROFILE_UPDATED";
      requestId: string;
      profile: PlayerProgress;
      reward?: BattleReward;
    }
  | {
      type: "PROFILE_ERROR";
      requestId: string;
      message: string;
      profile?: PlayerProgress;
    }
  | {
      type: "AUTH_RESULT";
      requestId: string;
      userId: string;
      username: string;
      profile: PlayerProgress;
    }
  | {
      type: "AUTH_ERROR";
      requestId: string;
      message: string;
    }
  | { type: "ERROR"; message: string };
