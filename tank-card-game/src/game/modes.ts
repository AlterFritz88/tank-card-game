export type GameMode = "ai" | "pvp" | "campaign";

export type MainMenuView =
  | "main"
  | "headquarters"
  | "campaign"
  | "missions"
  | "tutorial"
  | "profile"
  | "research"
  | "collection"
  | "shop"
  | "exchange"
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
  | "matchPreview"
  | "rolling"
  | "inBattle"
  | "finished"
  | "error";
