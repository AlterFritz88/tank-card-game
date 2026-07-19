export type GameMode = "ai" | "pvp" | "campaign" | "radio";

export const PVP_MATCH_SEARCH_DURATION_MS = 50_000;

export type MainMenuView =
  | "main"
  | "headquarters"
  | "campaign"
  | "missions"
  | "tutorial"
  | "combatMissions"
  | "radioDuels"
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
