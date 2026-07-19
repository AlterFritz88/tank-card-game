import type {
  BattleAction,
  BattleStateView,
  HeadquartersId,
  PlayerId,
} from "./types";
import type { MatchEndReason } from "./modes";

export const RADIO_DUEL_TURN_MS = 3 * 60 * 1_000;
export const RADIO_DUEL_ENTRY_MS = 12 * 60 * 60 * 1_000;
export const RADIO_DUEL_ENTRY_WARNING_MS = 30 * 60 * 1_000;
export const RADIO_DUEL_TIMEOUT_DAMAGE = 5;
export const RADIO_DUEL_MAX_ACTIVE = 5;
export const RADIO_DUEL_DEFEAT_RESULT_DELAY_MS = 3_000;

export type RadioDuelStatus = "active" | "finished";

export type RadioDuelSummary = {
  id: string;
  status: RadioDuelStatus;
  localPlayerId: PlayerId;
  myNickname: string;
  myHeadquartersId: HeadquartersId;
  opponentHeadquartersId: HeadquartersId;
  myDeckWeight: number;
  opponentDeckWeight: number;
  opponentNickname: string;
  opponentRating: number;
  rating: number;
  ratingDelta: number;
  battleStatus: BattleStateView["status"];
  backgroundId: BattleStateView["backgroundId"];
  activePlayer: PlayerId;
  isMyTurn: boolean;
  timerPhase: "entry" | "turn";
  deadlineAt: number | null;
  updatedAt: number;
  turn: number;
  myHeadquartersHp: number;
  opponentHeadquartersHp: number;
  unread: boolean;
  endReason: MatchEndReason | null;
};

export type RadioDuelQueueState = {
  queued: boolean;
  queuedAt: number | null;
  headquartersId: HeadquartersId | null;
  deckWeight: number | null;
};

export type RadioDuelListResult = {
  games: RadioDuelSummary[];
  queue: RadioDuelQueueState;
  rating: number;
  maxActiveGames: number;
};

export type RadioDuelReplay = {
  version: number;
  turn: number;
  actions: BattleAction[];
  frames: BattleStateView[];
};

export type RadioDuelOpenResult = {
  duel: RadioDuelSummary;
  battle: BattleStateView;
  replay: RadioDuelReplay | null;
};

export type RadioDuelLiveUpdate = {
  duelId: string;
  duel: RadioDuelSummary;
  action: BattleAction;
  before: BattleStateView;
  after: BattleStateView;
};

export type RadioDuelEventKind =
  | "match_found"
  | "opponent_moved"
  | "turn_warning"
  | "turn_timeout"
  | "idle_turn_penalty"
  | "timeout_damage"
  | "opponent_surrendered";

export type RadioDuelEvent = {
  kind: RadioDuelEventKind;
  duelId: string;
  title: string;
  message: string;
};

export type RadioDuelActionRequest = {
  duelId: string;
  action: BattleAction;
};
