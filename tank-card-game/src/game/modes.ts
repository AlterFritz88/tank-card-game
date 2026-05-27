export type GameMode = "ai" | "pvp";

export type PvpConnectionState =
  | "offline"
  | "connecting"
  | "waiting"
  | "connected"
  | "error";
