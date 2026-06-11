import type { BattleBackgroundId } from "./battleBackgrounds";

export type PlayerId = "player" | "bot";

export type HeadquartersId =
  | "training_unit"
  | "trainingslager"
  | "training_camp"
  | "first_panzer_division"
  | "german_motorized_division"
  | "german_artillery_division"
  | "german_rear_corps"
  | "soviet_tank_brigade"
  | "soviet_motor_rifle_division"
  | "soviet_guards_mortar_regiment"
  | "soviet_auto_battalion"
  | "usa_old_ironsides"
  | "usa_armored_infantry_regiment"
  | "usa_armored_artillery_battalion"
  | "usa_maintenance_battalion"
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

export type UnitZone = "battlefield" | "support";

export type SupportSlot = 0 | 1 | 2;

export type SupportRole = "artillery" | "transport" | "medical";

export type SupportEffects = {
  /** Extra damage dealt by this side's headquarters. */
  hqAttackBonus?: number;
  /** Incoming headquarters damage redirected into this support unit. */
  hqDamageRedirect?: number;
  /** Additional fuel generated at the beginning of this side's turn. */
  fuelPerTurn?: number;
  /** Draw one additional card every N own turns. */
  drawEveryTurns?: number;
  /** Restore health to a damaged battlefield unit at the beginning of the turn. */
  healRandomUnitPerTurn?: number;
  /** Restrict battlefield healing to one tank class. */
  healClass?: TankClass;
  /** Restore headquarters health at the beginning of the turn. */
  hqHealPerTurn?: number;
};

/**
 * Special ability of an advanced headquarters. Each flag is an independent
 * mechanic; a headquarters usually has exactly one of them set.
 */
export type HeadquartersAbility = {
  /** Short ability name shown in logs and on the card. */
  name: string;
  /** First tank (light/medium/heavy) played each turn enters with blitz. */
  firstTankBlitz?: boolean;
  /** Fuel discount for the first unit (any zone) played each turn. */
  firstUnitFuelDiscount?: number;
  /** Flat bonus to this headquarters' own attack. */
  hqAttackBonus?: number;
  /** Draw an extra card at the start of every Nth own turn. */
  drawEveryTurns?: number;
  /** Attack bonus for own tanks that have not moved this turn. */
  stationaryTankAttackBonus?: number;
  /** Light units enter the battlefield with blitz. */
  lightUnitsBlitz?: boolean;
  /** Extra headquarters damage against already damaged enemy units. */
  hqAttackBonusVsDamaged?: number;
  /** Heal a random damaged own battlefield unit at the start of the turn. */
  healRandomUnitPerTurn?: number;
  /** Extra fuel per turn while controlling both a tank and a support unit. */
  combinedArmsFuelBonus?: number;
  /** First light unit played each turn adds HP to the headquarters. */
  firstLightUnitHqProtection?: number;
  /** This headquarters' attacks cannot be intercepted by covering units. */
  hqAttackIgnoresCover?: boolean;
  /** Once per battle, the first destroyed own unit returns to hand. */
  returnFirstDestroyedUnit?: boolean;
};

/** Per-player counters used by headquarters abilities. */
export type HeadquartersAbilityTracking = {
  unitsPlayedThisTurn: number;
  tanksPlayedThisTurn: number;
  lightUnitsPlayedThisTurn: number;
  destroyedUnitReturnedThisBattle: boolean;
};

export type TankCard = {
  id: string;
  name: string;
  nation: Nation;
  class: TankClass;
  rarity: TankRarity;
  level?: number;

  cost: number;
  attack: number;
  hp: number;
  armor: number;
  range: number;
  movement: number;
  initiative: number;

  fuelGeneration: number;

  abilityText?: string;

  /** Support cards deploy into the three-slot line beside the headquarters. */
  deploymentZone?: UnitZone;
  supportRole?: SupportRole;
  supportEffects?: SupportEffects;

  /** New mechanics - only for low-stat units */
  onPlayEffects?: {
    /** Number of cards the owner draws when this unit enters the battlefield */
    draw?: number;
    /** Headquarters health added when this unit enters the battlefield */
    hqProtection?: number;
  };

  combatAbilities?: {
    /** Unit enters the battlefield ready for a full move and attack. */
    blitz?: boolean;
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

  /** Lazily initialized by the engine; absent in older saved states. */
  abilityTracking?: HeadquartersAbilityTracking;
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
  /** Missing values in older states are treated as battlefield placement. */
  zone?: UnitZone;
  supportSlot?: SupportSlot;

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

export type PlaySupportCardAction = {
  type: "PLAY_SUPPORT_CARD";
  playerId: PlayerId;
  cardInstanceId: string;
  supportSlot: SupportSlot;
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
  | PlaySupportCardAction
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
