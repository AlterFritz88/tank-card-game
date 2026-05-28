export type GameMode = "ai" | "pvp";

export type PvpConnectionState =
  | "offline"
  | "connecting"
  | "matchmaking"
  | "waiting"
  | "rolling"
  | "connected"
  | "error";
