export type GameMode = "ai" | "pvp";

export type MatchEndReason =
  | "surrender"
  | "disconnect"
  | "leave"
  | "opponent_left";

export type PvpConnectionState =
  | "idle"
  | "connecting"
  | "searching"
  | "waiting"
  | "matched"
  | "rolling"
  | "inBattle"
  | "finished"
  | "error";
