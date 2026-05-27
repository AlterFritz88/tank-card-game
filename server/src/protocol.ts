import type { BattleAction, BattleState, PlayerId } from "../../tank-card-game/src/game/types";

export type PvpClientMessage =
  | { type: "CREATE_ROOM" }
  | { type: "JOIN_ROOM"; roomId: string }
  | { type: "GAME_ACTION"; action: BattleAction };

export type PvpServerMessage =
  | { type: "ROOM_CREATED"; roomId: string; playerId: PlayerId }
  | { type: "ROOM_JOINED"; roomId: string; playerId: PlayerId }
  | { type: "WAITING_FOR_OPPONENT"; roomId: string }
  | { type: "GAME_STARTED"; roomId: string; battle: BattleState; playerId: PlayerId }
  | { type: "GAME_STATE"; roomId: string; battle: BattleState }
  | { type: "OPPONENT_DISCONNECTED"; roomId: string }
  | { type: "ERROR"; message: string };
