import type {
  BattleAction,
  BattleStateView,
  HeadquartersId,
  PlayerId,
} from "../../tank-card-game/src/game/types";

export type PvpClientMessage =
  | { type: "FIND_MATCH"; sessionId: string; headquartersId: HeadquartersId }
  | { type: "CREATE_ROOM"; sessionId: string; headquartersId: HeadquartersId }
  | { type: "JOIN_ROOM"; roomId: string; sessionId: string; headquartersId: HeadquartersId }
  | { type: "RECONNECT"; sessionId: string; roomId?: string | null }
  | { type: "GAME_ACTION"; action: BattleAction }
  | { type: "SELECT_CARD"; cardInstanceId: string | null }
  | { type: "SURRENDER" }
  | { type: "LEAVE_MATCH" }
  | { type: "CANCEL_MATCHMAKING" };

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

export type PvpServerMessage =
  | { type: "MATCHMAKING_STARTED" }
  | { type: "ROOM_CREATED"; roomId: string; playerId: PlayerId }
  | { type: "ROOM_JOINED"; roomId: string; playerId: PlayerId }
  | { type: "RECONNECTED"; roomId: string; playerId: PlayerId; battle: BattleStateView }
  | { type: "RECONNECT_FAILED"; message: string }
  | { type: "WAITING_FOR_OPPONENT"; roomId: string }
  | {
      type: "FIRST_TURN_ROLL";
      roomId: string;
      firstPlayer: PlayerId;
      startsAt: number;
      revealAt: number;
      battle: BattleStateView;
    }
  | { type: "GAME_STARTED"; roomId: string; battle: BattleStateView; playerId: PlayerId }
  | { type: "GAME_STATE"; roomId: string; battle: BattleStateView }
  | PvpTurnTimerEvent
  | {
      type: "OPPONENT_CARD_SELECTION";
      playerId: PlayerId;
      cardInstanceId: string | null;
    }
  | { type: "MATCH_ENDED"; winner: PlayerId; reason: MatchEndReason }
  | { type: "MATCHMAKING_CANCELLED" }
  | { type: "OPPONENT_LEFT"; reason: MatchEndReason }
  | { type: "OPPONENT_DISCONNECTED"; roomId: string }
  | { type: "ERROR"; message: string };
