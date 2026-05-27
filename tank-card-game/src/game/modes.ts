export type GameMode = "ai" | "pvp";

export type PvpConnectionState =
  | "offline"
  | "connecting"
  | "waiting"
  | "rolling"
  | "connected"
  | "error";
