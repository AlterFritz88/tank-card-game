import type { BattleBackgroundId } from "./battleBackgrounds";

export type PlayerId = "player" | "bot";

export type HeadquartersId =
  | "training_unit"
  | "trainingslager"
  | "first_panzer_division"
  | "polish_border_guard"
  | "polish_army_lodz"
  | "polish_army_prusy"
  | "polish_warsaw_defense";

export type Position = {
  row: number;
  col: number;
};

export type TankClass = "light" | "medium" | "heavy" | "td" | "spg";

export type Nation = "ussr" | "germany" | "usa" | "uk" | "poland" | "france";

export type TankRarity = "common" | "uncommon" | "rare";

export type TankCard = {
  id: string;
  name: string;
  nation: Nation;
  class: TankClass;
  rarity: TankRarity;

  cost: number;
  attack: number;
  hp: number;
  armor: number;
  range: number;
  movement: number;
  initiative: number;

  fuelGeneration: number;

  abilityText?: string;

  /** New mechanics - only for low-stat units */
  onPlayEffects?: {
    /** Number of cards the owner draws when this unit enters the battlefield */
    draw?: number;
    /** Headquarters health added when this unit enters the battlefield */
    hqProtection?: number;
  };
};

export type CardInstance = {
  instanceId: string;
  cardId: string;
};

export type HiddenCardInstance = {
  instanceId: string;
  hidden: true;
};

export type ClientCardInstance = CardInstance | HiddenCardInstance;

export type PlayerState = {
  headquartersId: HeadquartersId;
  deckId: string;

  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];

  resources: number;
  maxResources: number;
};

export type HeadquartersState = {
  ownerId: PlayerId;
  headquartersId?: HeadquartersId;
  position: Position;

  hp: number;
  attack: number;
  range: number;

  fuelGeneration: number;

  alreadyAttacked: boolean;
};

export type BoardUnit = {
  instanceId: string;
  cardId: string;
  ownerId: PlayerId;
  position: Position;

  currentHp: number;

  alreadyMoved: boolean;
  alreadyAttacked: boolean;

  spawnedThisTurn: boolean;
  moveCountThisTurn: number;
  tdAmbushUsedThisTurn: boolean;
};

export type PlayerTimerState = {
  stepTimeLeftMs: number;
  idleStreak: number;
  actedThisStep: boolean;
};

export type PlayCardAction = {
  type: "PLAY_CARD";
  playerId: PlayerId;
  cardInstanceId: string;
  position: Position;
};

export type MoveUnitAction = {
  type: "MOVE_UNIT";
  playerId: PlayerId;
  unitId: string;
  position: Position;
};

export type AttackAction = {
  type: "ATTACK";
  playerId: PlayerId;
  attackerType: "unit" | "headquarters";
  attackerId: string;
  targetType: "unit" | "headquarters";
  targetId: string;
};

export type EndTurnAction = {
  type: "END_TURN";
  playerId: PlayerId;
};

export type TimerTickAction = {
  type: "TIMER_TICK";
  elapsedMs: number;
};

export type BeginBattleAction = {
  type: "BEGIN_BATTLE";
  startingPlayer: PlayerId;
};

export type BattleAction =
  | BeginBattleAction
  | PlayCardAction
  | MoveUnitAction
  | AttackAction
  | EndTurnAction
  | TimerTickAction;

export type BattleStatus = "starting" | "active" | "player_won" | "bot_won";

export type BattleState = {
  status: BattleStatus;
  activePlayer: PlayerId;
  turn: number;
  backgroundId: BattleBackgroundId;

  player: PlayerState;
  bot: PlayerState;

  headquarters: Record<PlayerId, HeadquartersState>;
  units: BoardUnit[];

  timers: Record<PlayerId, PlayerTimerState>;
  stats: BattleStats;

  log: string[];
};

export type PlayerStateView = Omit<PlayerState, "hand" | "deck"> & {
  hand: ClientCardInstance[];
  deck: ClientCardInstance[];
  handCount: number;
  deckCount: number;
};

export type BattleStateView = Omit<BattleState, "player" | "bot"> & {
  player: PlayerStateView;
  bot: PlayerStateView;
};

export type ClientBattleState = BattleState | BattleStateView;

export function isHiddenCardInstance(
  card: ClientCardInstance
): card is HiddenCardInstance {
  return "hidden" in card && card.hidden === true;
}

export type BattleKillStats = {
  light: number;
  medium: number;
  heavy: number;
  td: number;
  spg: number;
};

export type BattleStats = {
  destroyedByPlayer: BattleKillStats;
  destroyedByBot: BattleKillStats;
};
