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
  | "polish_warsaw_defense"
  | "lavrinenko_tank_brigade"
  | "first_guards_tank_brigade"
  | "panfilov_division"
  | "german_4_panzer"
  | "guderian_corps"
  | "german_10_panzer"
  | "german_11_panzer"
  | "grossdeutschland"
  | "german_winter_panzer"
  | "winter_blocking_force"
  | "soviet_central_front"
  | "german_9th_army";

export type Position = {
  row: number;
  col: number;
};

export type TankClass = "light" | "medium" | "heavy" | "td" | "spg";

export type Nation = "ussr" | "germany" | "usa" | "uk" | "poland" | "france";

export type TankRarity = "common" | "uncommon" | "rare";

export type UnitZone = "battlefield" | "support";

export type SupportSlot = 0 | 1 | 2 | 3;

export type SupportRole = "artillery" | "transport" | "medical";

export type SupportEffects = {
  /** Extra damage dealt by this side's headquarters. */
  hqAttackBonus?: number;
  /** Incoming headquarters damage redirected into this support unit. */
  hqDamageRedirect?: number;
  /**
   * «Противотанковый заслон»: anti-tank screen for the rear. The gun's
   * `supportLineCover` value is also its firepower, so:
   *  - A melee attack against any friendly support unit OR against the
   *    headquarters is met with this much preemptive return fire (once per
   *    turn; the attack is cancelled if the attacker dies).
   *  - Ranged attacks (SPG or enemy headquarters) against any friendly support
   *    unit hit this unit first, and ranged fire aimed at the headquarters is
   *    partly soaked by this unit (up to its cover value).
   */
  supportLineCover?: number;
  /**
   * «Самооборона»: armed rear units (armored half-tracks, motorcycle scouts
   * and the like) that historically carried weapons. When this support unit is
   * directly attacked in melee by an enemy unit, it fires back this much damage
   * at the attacker. Ranged fire (SPG) and headquarters strikes draw no answer.
   */
  returnFire?: number;
  /** Additional fuel generated at the beginning of this side's turn. */
  fuelPerTurn?: number;
  /** Draw one additional card every N own turns. */
  drawEveryTurns?: number;
  /**
   * Every N own turns move a random support card from the deck to the hand
   * (nothing happens when the deck holds no support cards).
   */
  fetchSupportCardEveryTurns?: number;
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
  /** First tank (light/medium/heavy) played each turn gains blitz (two moves per turn). */
  firstTankBlitz?: boolean;
  /** Fuel discount for the first unit (any zone) played each turn. */
  firstUnitFuelDiscount?: number;
  /** Flat bonus to this headquarters' own attack. */
  hqAttackBonus?: number;
  /** Draw an extra card at the start of every Nth own turn. */
  drawEveryTurns?: number;
  /** Attack bonus for own tanks that have not moved this turn. */
  stationaryTankAttackBonus?: number;
  /**
   * Damage reduction for own tanks that have not moved this turn ("dug-in"
   * ambush toughness). Each incoming strike against a stationary tank is
   * reduced by this much (never below zero damage).
   */
  stationaryTankHpBonus?: number;
  /**
   * Attack bonus for own tanks that HAVE moved this turn ("armored momentum" —
   * the mirror of the dug-in ambush bonus). Rewards charging on the move.
   */
  movedTankAttackBonus?: number;
  /** Light units gain blitz (two moves per turn). */
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
  /**
   * «Стальной клин»: own heavy tanks and tank destroyers (heavy/td) take this
   * much less damage from each incoming strike (the heavy-breakthrough mirror
   * of the dug-in tank toughness, keyed by unit class instead of standing still).
   */
  heavyArmorReduction?: number;
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

  /**
   * Fuel-cost modifier applied while a given unit class is on the battlefield
   * («Слаженность»): the card is cheaper when the owner already controls a
   * battlefield unit of `ifClassPresent`.
   */
  costModifiers?: {
    ifClassPresent: TankClass;
    discount: number;
  };

  /** New mechanics - only for low-stat units */
  onPlayEffects?: {
    /** Number of cards the owner draws when this unit enters the battlefield */
    draw?: number;
    /** Headquarters health added when this unit enters the battlefield */
    hqProtection?: number;
    /**
     * On deploy this turn, the enemy headquarters and every enemy SPG on the
     * battlefield cannot attack until their next turn ends («Контрбатарейный
     * огонь»).
     */
    suppressEnemyIndirect?: boolean;
    /**
     * «Огневой налёт»: when this unit enters play it deals `amount` damage.
     * With `scope: "random"` it strikes one random enemy battlefield unit; with
     * `scope: "classes"` it strikes every enemy battlefield unit of the listed
     * `classes`; with `scope: "rear"` it strikes one random enemy rear-line
     * (support) unit. Camouflaged (still hidden) battlefield units are skipped —
     * the barrage is indirect fire, not a melee attack.
     */
    deployDamage?: {
      amount: number;
      scope: "random" | "classes" | "rear";
      classes?: TankClass[];
    };
    /**
     * «Пополнение»: when this unit enters play, the owner searches the deck for
     * a random card matching `match` and moves it straight into hand. A card
     * matches if it satisfies ANY listed criterion (name prefix, unit class, or
     * support role). If nothing matches, the effect does nothing.
     */
    fetchToHand?: {
      /** Short label naming what is fetched, shown in the battle log. */
      label: string;
      match: {
        namePrefixes?: string[];
        classes?: TankClass[];
        supportRoles?: SupportRole[];
      };
    };
  };

  combatAbilities?: {
    /**
     * «Блиц»: on the turn the unit enters play it may perform two standard move
     * actions (double its normal movement budget) while still attacking only
     * once; on later turns it moves like any other unit of its class. For heavy
     * tanks and tank destroyers the double-move turn also lifts the usual "move
     * OR attack" restriction — they may move twice and still fire once.
     */
    blitz?: boolean;
    /**
     * Once per turn the first enemy strike aimed at a friendly light tank is
     * redirected into this unit instead.
     */
    lightScreen?: boolean;
    /**
     * While this unit is alive on the battlefield, every friendly battlefield
     * tank takes this much less damage from each incoming strike (a command
     * tank coordinating the armored group). Does not stack with itself.
     */
    tankDefenseAura?: number;
    /**
     * «Маскировка»: this unit cannot be targeted by ranged fire, by an SPG, or
     * by an enemy headquarters — only by an adjacent enemy unit in melee. The
     * cover is lost permanently as soon as the unit attacks OR moves (see
     * BoardUnit.revealed).
     */
    camouflage?: boolean;
    /**
     * «Огневой вал» (SPG only): the closer this unit stands to the enemy
     * headquarters, the harder its shot lands. Adds `maxBonus` firepower at
     * point-blank range, falling off by 1 per cell of distance to the enemy HQ.
     */
    hqProximityBonus?: { maxBonus: number };
    /**
     * «Корректировщик»: this unit's effective firepower equals its owner's
     * current headquarters attack value (including support/ability bonuses)
     * instead of its printed attack.
     */
    attackEqualsHq?: boolean;
    /**
     * «Спецброня»: incoming damage from attackers of the given class is reduced
     * by `amount` (never below zero damage).
     */
    armorVsClass?: { class: TankClass; amount: number };
    /**
     * «Лобовая броня»: incoming damage is reduced by `amount` when the strike
     * comes from the direction of the enemy headquarters — the unit's front arc
     * (horizontally: the attacker stands on the enemy-HQ side of the unit).
     * Flank and rear attacks deal full damage. Suits heavy tanks and heavy
     * tank destroyers that hold the line facing the enemy.
     */
    frontalArmor?: { amount: number };
    /**
     * «Дозор»: when this unit takes damage, its owner draws this many cards
     * (at most once per turn).
     */
    drawWhenAttacked?: number;
    /**
     * «Огневая позиция» (SPG only): while standing on a board corner cell, the
     * unit gains the given firepower and/or maximum-HP bonus.
     */
    cornerBonus?: { attack?: number; hp?: number };
    /**
     * «Оборона плацдарма»: while standing on one of its own spawn cells, this
     * unit reduces each incoming strike by this much.
     */
    spawnDamageReduction?: number;
    /**
     * «Прорыв»: the first time this unit moves onto an enemy spawn cell, its
     * owner draws this many cards.
     */
    raidDraw?: number;
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
  /**
   * «Контрбатарейный огонь»: this headquarters cannot attack until the end of
   * its owner's next turn.
   */
  attackSuppressed?: boolean;
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
  /**
   * The unit entered the battlefield during its owner's current turn. A freshly
   * deployed tank has not been sitting still and so does NOT earn the «Танковая
   * засада» stationary attack bonus until its owner's next turn (the flag is
   * cleared at the start of that turn). Unlike `spawnedThisTurn` this is set for
   * every class, not just light tanks.
   */
  deployedThisTurn?: boolean;
  /**
   * «Блиц» granted by a headquarters ability (firstTankBlitz / lightUnitsBlitz)
   * at deploy time. Card-intrinsic blitz lives on the card; this flag persists
   * the HQ-granted version so the unit keeps its double move every turn.
   */
  blitzGranted?: boolean;
  tdAmbushUsedThisTurn: boolean;
  /** Anti-tank screen already fired this turn (see supportLineCover). */
  coverFiredThisTurn?: boolean;
  /**
   * «Маскировка» has been broken: the unit has attacked or moved at least once
   * and can now be targeted normally (see combatAbilities.camouflage).
   */
  revealed?: boolean;
  /** «Дозор» already drew a card this turn (see combatAbilities.drawWhenAttacked). */
  drawWhenAttackedUsedThisTurn?: boolean;
  /** «Прорыв» already drew when this unit reached an enemy spawn cell. */
  raidDrawUsed?: boolean;
  /** Maximum-HP bonus currently granted by «Огневая позиция» (cornerBonus.hp). */
  cornerHpApplied?: number;
  /**
   * Health bonus currently granted by the US national ability «Линия снабжения»
   * (a horizontal line of three units fed by a rear support unit). Kept in sync
   * like {@link cornerHpApplied}: gaining it raises current HP, losing it lowers
   * it (never below 1).
   */
  supplyHpApplied?: number;
  /**
   * «Контрбатарейный огонь»: this SPG cannot attack until the end of its
   * owner's next turn.
   */
  attackSuppressed?: boolean;
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

  /**
   * Scripted override for the opening hand size (both players draw exactly this
   * many cards, with no second-player bonus). Absent in normal battles, where
   * the engine's default starting hand applies.
   */
  startingHandSize?: number;

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
  support: number;
};

export type BattleStats = {
  destroyedByPlayer: BattleKillStats;
  destroyedByBot: BattleKillStats;
};
