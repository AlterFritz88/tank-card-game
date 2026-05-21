export type PlayerId = "player" | "bot";

export type Position = {
  row: number;
  col: number;
};

export type TankClass = "light" | "medium" | "heavy" | "td" | "spg";

export type Nation = "ussr" | "germany" | "usa" | "uk";

export type TankCard = {
  id: string;
  name: string;
  nation: Nation;
  class: TankClass;

  cost: number;
  attack: number;
  hp: number;
  range: number;

  fuelGeneration: number;
  actionFuelCost: number;

  abilityText?: string;
};

export type CardInstance = {
  instanceId: string;
  cardId: string;
};

export type PlayerState = {
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];

  resources: number;
  maxResources: number;
};

export type HeadquartersState = {
  ownerId: PlayerId;
  position: Position;

  hp: number;
  attack: number;
  range: number;

  fuelGeneration: number;
  actionFuelCost: number;

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
};

export type PlayerTimerState = {
  battleTimeLeftMs: number;
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

export type BattleAction =
  | PlayCardAction
  | MoveUnitAction
  | AttackAction
  | EndTurnAction
  | TimerTickAction;

export type BattleStatus = "active" | "player_won" | "bot_won";

export type BattleState = {
  status: BattleStatus;
  activePlayer: PlayerId;
  turn: number;

  player: PlayerState;
  bot: PlayerState;

  headquarters: Record<PlayerId, HeadquartersState>;
  units: BoardUnit[];

  timers: Record<PlayerId, PlayerTimerState>;

  log: string[];
};