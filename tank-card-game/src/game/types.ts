export type PlayerId = "player" | "bot";

export type Nation = "ussr" | "germany" | "usa" | "uk";

export type VehicleClass = "light" | "medium" | "heavy" | "td" | "spg";

export type Rarity = "common" | "uncommon" | "rare" | "epic";

export type Position = {
  row: 0 | 1 | 2;
  col: 0 | 1 | 2 | 3 | 4;
};

export type TankCard = {
  id: string;
  name: string;
  nation: Nation;
  class: VehicleClass;
  rarity: Rarity;
  cost: number;
  attack: number;
  armor: number;
  hp: number;
  range: number;
  movement: number;
  initiative: number;
  abilityText?: string;
};

export type CardInstance = {
  instanceId: string;
  cardId: string;
};

export type BoardUnit = {
  instanceId: string;
  cardId: string;
  ownerId: PlayerId;
  position: Position;
  currentHp: number;
  alreadyAttacked: boolean;
  alreadyMoved: boolean;
};

export type Headquarters = {
  ownerId: PlayerId;
  position: Position;
  hp: number;
  attack: number;
  range: number;
  alreadyAttacked: boolean;
};

export type PlayerBattleState = {
  id: PlayerId;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  resources: number;
  maxResources: number;
};

export type BattleStatus = "active" | "player_won" | "bot_won";

export type BattleState = {
  activePlayer: PlayerId;
  turn: number;
  status: BattleStatus;
  player: PlayerBattleState;
  bot: PlayerBattleState;
  units: BoardUnit[];
  headquarters: {
    player: Headquarters;
    bot: Headquarters;
  };
  log: string[];
};

export type PlayCardAction = {
  type: "PLAY_CARD";
  playerId: PlayerId;
  cardInstanceId: string;
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

export type MoveUnitAction = {
  type: "MOVE_UNIT";
  playerId: PlayerId;
  unitId: string;
  position: Position;
};

export type EndTurnAction = {
  type: "END_TURN";
  playerId: PlayerId;
};

export type BattleAction = PlayCardAction | AttackAction | MoveUnitAction | EndTurnAction;