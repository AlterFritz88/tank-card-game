export type GameMode = "ai" | "pvp" | "campaign";

export type MainMenuView =
  | "main"
  | "headquarters"
  | "campaign"
  | "missions"
  | "profile"
  | "research"
  | "deckBuilder";

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
