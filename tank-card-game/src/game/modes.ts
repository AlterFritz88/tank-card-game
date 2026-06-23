export type GameMode = "ai" | "pvp" | "campaign";

export type MainMenuView =
  | "main"
  | "headquarters"
  | "campaign"
  | "missions"
  | "profile"
  | "research"
  | "collection"
  | "shop"
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
