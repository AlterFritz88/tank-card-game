import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { getCard } from "../game/cards";
import { getNextBotAction } from "../game/bot";
import {
  PLAYER_SPAWN_CELLS,
  BOT_SPAWN_CELLS,
  SUPPORT_SLOTS,
  getAttackAnimationSequence,
  getAvailableMoveCells,
  getFreeSupportSlots,
  getHeadquartersAttackValue,
  getTargetsInRange,
  isBattlefieldUnit,
  isSupportUnit,
} from "../game/engine";
import type { AttackAnimationStrike } from "../game/engine";
import type {
  BattleAction,
  BattleState,
  CardInstance,
  ClientBattleState,
  ClientCardInstance,
  HeadquartersId,
  PlayerId,
  Position,
  SupportSlot,
} from "../game/types";
import { isHiddenCardInstance } from "../game/types";
import { useBattleStore } from "../store/battleStore";
import { TankCardView } from "./TankCardView";
import { HandCardView } from "./HandCardView";
import { HeadquartersCardView } from "./HeadquartersCardView";
import { ResultScreen } from "./ResultScreen";
import { FuelPanel } from "./FuelPanel";
import { BattleTimerPanel } from "./BattleTimerPanel";
import { DeckStack } from "./DeckStack";
import { screenDeltaToStage, screenPointToStage, StageBackground } from "./GameStage";
import { getBattleBackgroundAsset } from "../assets/battleBackgroundAssets";
import { getHeadquartersAvatarAsset } from "../assets/headquartersAvatarAssets";
import { getHeadquartersImageAsset } from "../game/headquartersImages";
import {
  playCannonShotSound,
  playCardDistributionSound,
  playDestroyedSound,
  playMusic,
  playRotatingCartridgeSound,
  playTurnStartSound,
} from "../game/audio";
import type { BattleReward } from "../game/economy";
import {
  applyBattleRewardToProgress,
  applyTutorialBattleRewardToProgress,
  claimBattleRewardFromServer,
  claimPvpBattleRewardFromServer,
  claimTutorialRewardFromServer,
  getLocalTutorialReward,
} from "../game/playerProgress";
import {
  TUTORIAL_EPILOGUE_TEXT,
  TUTORIAL_REWARD,
  getTutorialBotAction,
  getTutorialHighlights,
  getTutorialMoveTargetCell,
  getTutorialStep,
} from "../game/tutorial";
import { TutorialOverlay } from "./TutorialOverlay";
import apShellImage from "../assets/ap-shell.png";
import buttonImage from "../assets/button.webp";
import explosionFlashImage from "../assets/effects/explosion-flash.webp";
import explosionFireballImage from "../assets/effects/explosion-fireball.webp";
import explosionSmokeImage from "../assets/effects/explosion-smoke.webp";
import movementArrowImage from "../assets/effects/arrow.png";
import burntCardImage from "../assets/effects/burnt-card.webp";
import cardBackImage from "../assets/cards/card-back.webp";
import cartridgeImage from "../assets/effects/rifle-cartridge.webp";

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isPlayerSpawn(position: Position): boolean {
  return PLAYER_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

function isBotSpawn(position: Position): boolean {
  return BOT_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

const HAND_LAYOUT_TRANSITION = {
  layout: {
    type: "spring",
    stiffness: 420,
    damping: 34,
    mass: 0.75,
  },
} as const;

type CellCenter = {
  x: number;
  y: number;
};

type ProjectileEffect = {
  id: number;
  from: CellCenter;
  to: CellCenter;
};

type ExplosionEffect = {
  id: number;
  position: CellCenter;
};

type DamageTextEffect = {
  id: number;
  amount: number;
  targetId: string;
};

type HealthGainEffect = {
  id: number;
  amount: number;
  targetId: string;
};

type AttackChangeEffect = {
  id: number;
  amount: number;
  targetId: string;
};

type HitReactionEffect = {
  id: number;
  targetId: string;
  x: number;
  y: number;
};

type HoveredAttackTarget = {
  type: "unit" | "headquarters";
  id: string;
} | null;

type DrawCardEffect = {
  id: number;
  owner: PlayerId;
  from: CellCenter;
  to: CellCenter;
};

type SpawnCardEffect = {
  id: number;
  owner: PlayerId;
  from: CellCenter;
  to: CellCenter;
  cardId: string;
  hiddenCardInstanceId: string;
};

type MovementArrowEffect = {
  id: number;
  owner: PlayerId;
  from: CellCenter;
  to: CellCenter;
  phase: "extending" | "following";
};

type MovementUnitEffect = {
  id: number;
  unitId: string;
  cardId: string;
  owner: PlayerId;
  currentHp: number;
  alreadyMoved: boolean;
  alreadyAttacked: boolean;
  from: CellCenter;
  to: CellCenter;
  width: number;
  height: number;
  phase: "waiting" | "moving";
};

type MovementPath = {
  from: CellCenter;
  to: CellCenter;
  width: number;
  height: number;
};

type DestroyedCardEffect = {
  id: number;
  targetId: string;
  from: CellCenter;
  to: CellCenter;
  width: number;
  height: number;
  rotation: number;
};

type QueuedBattleCommand = {
  id: number;
  run: () => Promise<void>;
};

const CARD_PREVIEW_LONG_PRESS_MS = 420;

type CardPreview =
  | {
      type: "unit";
      cardId: string;
      ownerId: PlayerId;
      currentHp?: number;
    }
  | {
      type: "headquarters";
      ownerId: PlayerId;
      headquartersId: HeadquartersId;
      hp: number;
      attack: number;
      fuelGeneration: number;
    };

type RewardClaimStatus = "idle" | "pending" | "claimed" | "failed";

function setObjectRef(
  refs: React.MutableRefObject<Map<string, HTMLElement>>,
  id: string
) {
  return (element: HTMLElement | null) => {
    if (element) {
      refs.current.set(id, element);
    } else {
      refs.current.delete(id);
    }
  };
}

// Returns the element's center in the board's own (unscaled) layout coordinate
// space, relative to the board's top-left corner. getBoundingClientRect reports
// screen pixels affected by the GameStage transform, so the screen-space delta
// between the two centers is mapped back through the inverse stage transform.
// Board layout size (offsetWidth/Height) is transform-independent.
function getElementCenterRelativeToBoard(
  boardElement: HTMLDivElement,
  element: HTMLElement
): CellCenter {
  const boardRect = boardElement.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const screenDx =
    elementRect.left + elementRect.width / 2 -
    (boardRect.left + boardRect.width / 2);
  const screenDy =
    elementRect.top + elementRect.height / 2 -
    (boardRect.top + boardRect.height / 2);
  const localDelta = screenDeltaToStage(screenDx, screenDy);

  return {
    x: boardElement.offsetWidth / 2 + localDelta.x,
    y: boardElement.offsetHeight / 2 + localDelta.y,
  };
}

// Returns the element's center in the stage's local coordinate space, which is
// what fixed/absolute overlays inside the transformed stage are positioned in.
function getElementCenterInViewport(element: HTMLElement): CellCenter {
  const rect = element.getBoundingClientRect();

  return screenPointToStage(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getRandomBotThinkingDelay(): number {
  return Math.floor(Math.random() * 4000);
}

function getRandomLocalStartingPlayer(): PlayerId {
  return Math.random() < 0.5 ? "player" : "bot";
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function SelectedCombatObjectGlow() {
  return (
    <motion.span
      style={styles.selectedCombatObjectGlow}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0.5, 0.84, 0.58, 0.78, 0.5],
        borderColor: [
          "rgba(235, 188, 77, 0.64)",
          "rgba(255, 229, 145, 0.9)",
          "rgba(213, 160, 50, 0.68)",
          "rgba(248, 211, 111, 0.84)",
          "rgba(235, 188, 77, 0.64)",
        ],
        boxShadow: [
          "0 0 3px rgba(232, 188, 82, 0.18)",
          "0 0 7px rgba(247, 215, 116, 0.36)",
          "0 0 4px rgba(213, 160, 50, 0.22)",
          "0 0 6px rgba(247, 215, 116, 0.32)",
          "0 0 3px rgba(232, 188, 82, 0.18)",
        ],
      }}
      transition={{
        duration: 2.5,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    />
  );
}

function AttackTargetGlow() {
  return (
    <motion.span
      style={styles.attackTargetGlow}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0.42, 0.76, 0.5, 0.7, 0.42],
        borderColor: [
          "rgba(207, 72, 61, 0.64)",
          "rgba(255, 133, 116, 0.9)",
          "rgba(190, 54, 47, 0.7)",
          "rgba(242, 102, 88, 0.84)",
          "rgba(207, 72, 61, 0.64)",
        ],
        boxShadow: [
          "0 0 3px rgba(194, 54, 47, 0.18)",
          "0 0 8px rgba(255, 105, 91, 0.4)",
          "0 0 4px rgba(190, 54, 47, 0.24)",
          "0 0 7px rgba(242, 102, 88, 0.34)",
          "0 0 3px rgba(194, 54, 47, 0.18)",
        ],
      }}
      transition={{
        duration: 2.1,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    />
  );
}

export function BattleScreen() {
  const battle = useBattleStore((state) => state.battle);

  if (!battle) {
    return null;
  }

  return <BattleScreenContent battle={battle} />;
}

type BattleScreenContentProps = {
  battle: ClientBattleState;
};

function BattleScreenContent({ battle }: BattleScreenContentProps) {
  const battleStore = useBattleStore();
  const {
    mode,
    localPlayerId,
    pvpRoomId,
    pvpTimer,
    pvpMovementIntent,
    pvpAttackIntent,
    matchEndReason,
    selectedCardInstanceId,
    opponentSelectedCardInstanceId,
    selectedAttacker,
    selectCard,
    selectAttacker,
    dispatch,
    reset,
    exitBattleToMenu,
    surrenderPvpMatch,
    leavePvpMatch,
  } = battleStore;

  const firstTurnRoll = battleStore.firstTurnRoll;
  const tutorialActive = battleStore.tutorialActive;
  const tutorialStepIndex = battleStore.tutorialStepIndex;
  const tutorialEpilogueSeen = battleStore.tutorialEpilogueSeen;
  const advanceTutorialStep = battleStore.advanceTutorialStep;
  const completeTutorialEpilogue = battleStore.completeTutorialEpilogue;
  const tutorialStep = tutorialActive
    ? getTutorialStep(tutorialStepIndex)
    : null;
  // Active-task hints: what to highlight; everything else gets dimmed/blocked.
  const tutorialHighlights =
    tutorialActive && battle.status === "active"
      ? getTutorialHighlights(tutorialStepIndex)
      : null;

  function isTutorialCellHighlighted(position: Position): boolean {
    return Boolean(
      tutorialHighlights?.cells?.some(
        (cell) => cell.row === position.row && cell.col === position.col
      ) ||
        tutorialMoveCells.some(
          (cell) => cell.row === position.row && cell.col === position.col
        )
    );
  }

  // Two-stage HQ attack hint: until the own HQ is selected only it blinks,
  // afterwards only the intended target blinks.
  function isTutorialOwnHqSelected(): boolean {
    return (
      selectedAttacker?.type === "headquarters" &&
      selectedAttacker.id === "player_hq"
    );
  }

  function isTutorialUnitHighlighted(unit: {
    ownerId: PlayerId;
    cardId: string;
    zone?: string;
  }): boolean {
    if (!tutorialHighlights) return false;

    if (unit.ownerId === "player") {
      return Boolean(tutorialHighlights.unitCardIds?.includes(unit.cardId));
    }

    const isEnemyTarget =
      (tutorialHighlights.enemySupport && unit.zone === "support") ||
      Boolean(tutorialHighlights.enemyUnitCardIds?.includes(unit.cardId));

    if (!isEnemyTarget) return false;

    return tutorialHighlights.hqAttackSequence
      ? isTutorialOwnHqSelected()
      : true;
  }

  function isTutorialHqHighlighted(owner: PlayerId): boolean {
    if (!tutorialHighlights) return false;

    if (tutorialHighlights.hqAttackSequence) {
      const ownHqSelected = isTutorialOwnHqSelected();

      if (owner === "player") {
        return Boolean(tutorialHighlights.playerHq) && !ownHqSelected;
      }

      return Boolean(tutorialHighlights.enemyHq) && ownHqSelected;
    }

    return owner === "player"
      ? Boolean(tutorialHighlights.playerHq)
      : Boolean(tutorialHighlights.enemyHq);
  }

  const humanPlayerId: PlayerId = mode === "pvp" ? localPlayerId : "player";
  const opponentPlayerId: PlayerId =
    humanPlayerId === "player" ? "bot" : "player";

  // The single scripted destination cell for the BT-7's advance in the active
  // tutorial step — the only cell highlighted and the only one the player may
  // move it to. Null/empty for every other step.
  const tutorialMoveCell: Position | null =
    tutorialActive && battle.status === "active"
      ? getTutorialMoveTargetCell(tutorialStepIndex, battle as BattleState)
      : null;
  const tutorialMoveCells: Position[] = tutorialMoveCell ? [tutorialMoveCell] : [];
  // While the tutorial scripts a BT advance, only the highlighted target cell
  // may show a move indicator — every other legal cell is hidden and blocked.
  const tutorialRestrictsMove = tutorialMoveCells.length > 0;
  const botAiEnabled = mode === "ai" || mode === "campaign";
  const isHumanTurn =
    battle.status === "active" && battle.activePlayer === humanPlayerId;
  const playerHand = battle.player.hand;
  const botHand = battle.bot.hand;

  function getVisualOwnerId(owner: PlayerId): PlayerId {
    return owner === humanPlayerId ? "player" : "bot";
  }

  function getHeadquartersIdForOwner(owner: PlayerId): HeadquartersId {
    return battle.headquarters[owner].headquartersId ?? battle[owner].headquartersId;
  }

  function getDeckCount(owner: PlayerId): number {
    const player = battle[owner];
    return "deckCount" in player ? player.deckCount : player.deck.length;
  }

  function renderHeadquartersAvatar(
    owner: PlayerId,
    placement: "player" | "enemy"
  ) {
    const headquartersId = getHeadquartersIdForOwner(owner);
    const avatar = getHeadquartersAvatarAsset(headquartersId);
    const fallbackImage = getHeadquartersImageAsset(headquartersId);
    const image = avatar ?? fallbackImage;

    return (
      <motion.div
        aria-hidden="true"
        style={{
          ...styles.headquartersAvatar,
          ...(placement === "player"
            ? styles.playerHeadquartersAvatar
            : styles.enemyHeadquartersAvatar),
          ...(!image ? styles.headquartersAvatarEmpty : {}),
        }}
        initial={{ opacity: 0, y: placement === "player" ? 14 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        {image ? (
          <img
            src={image}
            alt=""
            draggable={false}
            style={{
              ...styles.headquartersAvatarImage,
              ...(!avatar ? styles.headquartersAvatarFallbackImage : {}),
              ...(placement === "player"
                ? styles.playerHeadquartersAvatarImage
                : styles.enemyHeadquartersAvatarImage),
              objectPosition: "center bottom",
            }}
          />
        ) : (
          <div style={styles.headquartersAvatarPlaceholder} />
        )}
      </motion.div>
    );
  }

  function getVisibleHand(owner: PlayerId): CardInstance[] {
    const hand = battle[owner].hand as ClientCardInstance[];

    return hand.filter(
      (card): card is CardInstance => !isHiddenCardInstance(card)
    );
  }

  function getStartRollFinalRotationForViewer(winner: PlayerId): number {
    const targetAngle = winner === humanPlayerId ? 135 : -45;
    return 360 * 8 + targetAngle;
  }

  function getStartRollResultText(winner: PlayerId): string {
    if (mode === "pvp") {
      return winner === humanPlayerId
        ? "ПЕРВЫМ ХОДИШЬ ТЫ"
        : "ПЕРВЫМ ХОДИТ ВРАГ";
    }

    return winner === "player"
      ? "ПЕРВЫМ ХОДИТ ИГРОК"
      : "ПЕРВЫМ ХОДИТ ВРАГ";
  }

  const DRAW_CARD_ANIMATION_MS = 760;
  const DRAW_CARD_REVEAL_DELAY_MS = 80;
  const SPAWN_CARD_ANIMATION_MS = 620;
  const MOVE_ARROW_LEAD_MS = 340;
  const MOVE_ARROW_FOLLOW_MS = 280;
  const ATTACK_STRIKE_SETTLE_MS = 620;
  const DESTROYED_CARD_ANIMATION_MS = 920;
  const START_ROLL_DURATION_MS = 2800;
  const START_ROLL_RESULT_DELAY_MS = 350;
  const [attackingId, setAttackingId] = useState<string | null>(null);
  const [attackEffectId, setAttackEffectId] = useState<string | null>(null);
  const [projectileEffect, setProjectileEffect] =
    useState<ProjectileEffect | null>(null);
  const [explosionEffect, setExplosionEffect] =
    useState<ExplosionEffect | null>(null);
  const [hitReactionEffect, setHitReactionEffect] =
    useState<HitReactionEffect | null>(null);
  const [damageTextEffects, setDamageTextEffects] = useState<
    DamageTextEffect[]
  >([]);
  const [healthGainEffects, setHealthGainEffects] = useState<
    HealthGainEffect[]
  >([]);
  const [attackChangeEffects, setAttackChangeEffects] = useState<
    AttackChangeEffect[]
  >([]);
  const [hoveredAttackTarget, setHoveredAttackTarget] =
    useState<HoveredAttackTarget>(null);
  const [turnBannerText, setTurnBannerText] = useState<string | null>(null);
  const [thinkingCardIndex, setThinkingCardIndex] = useState<number | null>(
    null
  );
  const previousHandIdsRef = useRef<Record<PlayerId, Set<string>>>({
    player: new Set(battle.player.hand.map((card) => card.instanceId)),
    bot: new Set(battle.bot.hand.map((card) => card.instanceId)),
  });
  const previousBattleStatusRef = useRef<string | null>(null);
  const previousActivePlayerRef = useRef(battle.activePlayer);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const objectRefs = useRef<Map<string, HTMLElement>>(new Map());
  const projectileIdRef = useRef(0);
  const explosionIdRef = useRef(0);
  const hitReactionIdRef = useRef(0);
  const damageTextIdRef = useRef(0);
  const healthGainEffectIdRef = useRef(0);
  const attackChangeEffectIdRef = useRef(0);
  const previousHpSnapshotRef = useRef<Map<string, number> | null>(null);
  const previousAttackSnapshotRef = useRef<Map<string, number> | null>(null);
  const suppressNextRemoteDamageEffectsRef = useRef(false);
  const lastPvpAttackIntentIdRef = useRef<string | null>(null);
  const botTurnRunningRef = useRef(false);
  const [drawCardEffects, setDrawCardEffects] = useState<DrawCardEffect[]>([]);
  const [spawnCardEffects, setSpawnCardEffects] = useState<SpawnCardEffect[]>([]);
  const [movementArrowEffect, setMovementArrowEffect] =
    useState<MovementArrowEffect | null>(null);
  const [movementUnitEffect, setMovementUnitEffect] =
    useState<MovementUnitEffect | null>(null);
  const [destroyedCardEffects, setDestroyedCardEffects] = useState<
    DestroyedCardEffect[]
  >([]);
  const [hiddenDestroyedObjectIds, setHiddenDestroyedObjectIds] = useState<
    Set<string>
  >(new Set());
  const [hiddenMovingUnitIds, setHiddenMovingUnitIds] = useState<Set<string>>(
    new Set()
  );
  const [hiddenSpawningCardIds, setHiddenSpawningCardIds] = useState<Set<string>>(
    new Set()
  );
  const [spawningCardInstanceId, setSpawningCardInstanceId] = useState<
    string | null
  >(null);
  const drawCardEffectIdRef = useRef(0);
  const spawnCardEffectIdRef = useRef(0);
  const movementArrowEffectIdRef = useRef(0);
  const destroyedCardEffectIdRef = useRef(0);
  const movementAnimationRunningRef = useRef(false);
  const attackSequenceRunningRef = useRef(false);
  const commandQueueRef = useRef<QueuedBattleCommand[]>([]);
  const commandQueueRunningRef = useRef(false);
  const commandQueueIdRef = useRef(0);
  const modeRef = useRef(mode);
  const humanPlayerIdRef = useRef(humanPlayerId);
  const spawningCardInstanceIdRef = useRef<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const supportCellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  type StartRollState = {
    visible: boolean;
    winner: PlayerId | null;
    finalRotation: number;
    resultVisible: boolean;
  };

  const startRollRunningRef = useRef(false);

  const deckRefs = useRef<Record<PlayerId, HTMLDivElement | null>>({
    player: null,
    bot: null,
  });

  const handRefs = useRef<Record<PlayerId, HTMLDivElement | null>>({
    player: null,
    bot: null,
  });

  const [hiddenDrawnCardIds, setHiddenDrawnCardIds] = useState<Set<string>>(
    new Set()
  );

  const [cardPreview, setCardPreview] = useState<CardPreview | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [debugPaused, setDebugPaused] = useState(false);
  const [battleReward, setBattleReward] = useState<BattleReward | null>(null);
  const [rewardClaimStatus, setRewardClaimStatus] =
    useState<RewardClaimStatus>("idle");
  const [rewardClaimError, setRewardClaimError] = useState<string | null>(null);
  const [rewardSyncPending, setRewardSyncPending] = useState(false);
  const debugPausedRef = useRef(false);
  const rewardedBattleKeyRef = useRef<string | null>(null);

  const handCardRefs = useRef<Record<PlayerId, Map<string, HTMLElement>>>({
    player: new Map(),
    bot: new Map(),
  });
  const dispatchBattleActionRef = useRef<
    (
      action: BattleAction,
      options?: { skipDamageEffects?: boolean }
    ) => void
  >(
    () => undefined
  );
  const playAttackSequenceRef = useRef<
    (strikes: AttackAnimationStrike[]) => Promise<boolean>
  >(() => Promise.resolve(false));
  const showDamageEffectsFromSnapshotsRef = useRef<
    (before: Map<string, number>, after: Map<string, number>) => void
  >(() => undefined);
  const showAttackChangesFromSnapshotsRef = useRef<
    (before: Map<string, number>, after: Map<string, number>) => void
  >(() => undefined);
  const playDrawCardAnimationRef = useRef<
    (owner: PlayerId, cardInstanceId: string) => void
  >(() => undefined);

  useEffect(() => {
    void playMusic("battle");
  }, []);
  const playSpawnCardAnimationRef = useRef<
    (
      owner: PlayerId,
      cardInstanceId: string,
      cardId: string,
      position: Position
    ) => Promise<void>
  >(() => Promise.resolve());
  const playSupportSpawnCardAnimationRef = useRef<
    (
      owner: PlayerId,
      cardInstanceId: string,
      cardId: string,
      supportSlot: SupportSlot
    ) => Promise<void>
  >(() => Promise.resolve());
  const playMoveIntentAnimationRef = useRef<
    (
      owner: PlayerId,
      unitId: string,
      position: Position,
      durationMs?: number
    ) => Promise<MovementPath | null>
  >(() => Promise.resolve(null));
  const playAndDispatchLocalMovementRef = useRef<
    (
      state: BattleState,
      action: Extract<BattleAction, { type: "MOVE_UNIT" }>,
      options?: { preserveLaterSelection?: boolean }
    ) => Promise<void>
  >(() => Promise.resolve());

  const [startRollState, setStartRollState] = useState<StartRollState>({
    visible: false,
    winner: null,
    finalRotation: 0,
    resultVisible: false,
  });

  useEffect(() => {
    dispatchBattleActionRef.current = dispatchBattleAction;
    playAttackSequenceRef.current = playAttackSequence;
    showDamageEffectsFromSnapshotsRef.current = showDamageEffectsFromSnapshots;
    showAttackChangesFromSnapshotsRef.current = showAttackChangesFromSnapshots;
    playDrawCardAnimationRef.current = playDrawCardAnimation;
    playSpawnCardAnimationRef.current = playSpawnCardAnimation;
    playSupportSpawnCardAnimationRef.current = playSupportSpawnCardAnimation;
    playMoveIntentAnimationRef.current = playMoveIntentAnimation;
    playAndDispatchLocalMovementRef.current = playAndDispatchLocalMovement;
  });

  function setHandCardRef(owner: PlayerId, cardInstanceId: string) {
    return (element: HTMLElement | null) => {
      if (element) {
        handCardRefs.current[owner].set(cardInstanceId, element);
      } else {
        handCardRefs.current[owner].delete(cardInstanceId);
      }
    };
  }

  function positionKey(position: Position): string {
    return `${position.row}-${position.col}`;
  }

  function setCellRef(position: Position) {
    return (element: HTMLButtonElement | null) => {
      const key = positionKey(position);

      if (element) {
        cellRefs.current.set(key, element);
      } else {
        cellRefs.current.delete(key);
      }
    };
  }

  function supportCellKey(owner: PlayerId, supportSlot: SupportSlot) {
    return `${owner}-${supportSlot}`;
  }

  function setSupportCellRef(owner: PlayerId, supportSlot: SupportSlot) {
    return (element: HTMLButtonElement | null) => {
      const key = supportCellKey(owner, supportSlot);

      if (element) {
        supportCellRefs.current.set(key, element);
      } else {
        supportCellRefs.current.delete(key);
      }
    };
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function openCardPreview(
    event: React.MouseEvent,
    preview: CardPreview
  ) {
    event.preventDefault();
    event.stopPropagation();

    setCardPreview(preview);
  }

  function closeCardPreview() {
    setCardPreview(null);
  }

  // На телефоне нет правой кнопки мыши, поэтому увеличенный просмотр карточки
  // открывается долгим нажатием (touch). Долгое нажатие подавляет обычный клик,
  // чтобы карта не выбиралась/не атаковала при открытии превью.
  function longPressPreviewHandlers(preview: CardPreview) {
    return {
      onTouchStart: () => {
        longPressTriggeredRef.current = false;
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTriggeredRef.current = true;
          setCardPreview(preview);
        }, CARD_PREVIEW_LONG_PRESS_MS);
      },
      onTouchMove: clearLongPressTimer,
      onTouchEnd: (event: React.TouchEvent) => {
        clearLongPressTimer();
        if (longPressTriggeredRef.current) {
          event.preventDefault();
          longPressTriggeredRef.current = false;
        }
      },
      onTouchCancel: clearLongPressTimer,
    };
  }

  function preventPersistentBattleFocus(
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function handleSurrenderClick() {
    const confirmed = window.confirm("Сдаться и засчитать поражение?");
    if (!confirmed) return;

    surrenderPvpMatch();
  }

  function getPlayerHandCardMarginLeft(index: number, totalCards: number) {
    if (index === 0) return 0;

    if (totalCards <= 5) {
      return 12;
    }

    const cardWidth = 175;
    const maxHandWidth = 980;
    const neededOverlap = Math.ceil(
      (cardWidth * totalCards - maxHandWidth) / (totalCards - 1)
    );

    return -Math.min(148, Math.max(42, neededOverlap));
  }

  function isNewlyDrawnCard(owner: PlayerId, cardInstanceId: string) {
    return (
      battle.status === "active" &&
      !previousHandIdsRef.current[owner].has(cardInstanceId)
    );
  }

  useEffect(() => {
    debugPausedRef.current = debugPaused;
  }, [debugPaused]);

  useEffect(() => {
    modeRef.current = mode;
    humanPlayerIdRef.current = humanPlayerId;
    spawningCardInstanceIdRef.current = spawningCardInstanceId;
  }, [humanPlayerId, mode, spawningCardInstanceId]);

  useEffect(() => {
    if (battle.status === "active") return;

    commandQueueRef.current = [];
  }, [battle.status]);

  async function claimCurrentBattleReward() {
    if (battle.status !== "player_won" && battle.status !== "bot_won") return;

    const localPlayerWon =
      (battle.status === "player_won" && humanPlayerId === "player") ||
      (battle.status === "bot_won" && humanPlayerId === "bot");

    if (tutorialActive) {
      setRewardClaimStatus("pending");
      setRewardClaimError(null);

      const serverResult = await claimTutorialRewardFromServer({
        reward: TUTORIAL_REWARD,
        localPlayerWon,
      });

      if (serverResult?.reward) {
        setBattleReward(serverResult.reward);
        setRewardClaimStatus("claimed");
        setRewardSyncPending(false);
        return;
      }

      const localReward = getLocalTutorialReward(TUTORIAL_REWARD);
      const localProgress = applyTutorialBattleRewardToProgress(
        TUTORIAL_REWARD,
        localPlayerWon
      );
      setBattleReward(localReward);
      setRewardClaimStatus("claimed");
      setRewardClaimError(null);
      setRewardSyncPending(localProgress.pendingRewardClaims.length > 0);
      return;
    }

    setRewardClaimStatus("pending");
    setRewardClaimError(null);

    if (mode === "pvp") {
      if (!pvpRoomId) {
        setRewardClaimStatus("failed");
        setRewardClaimError("Награда не начислена: PVP-комната не найдена");
        return;
      }

      const serverResult = await claimPvpBattleRewardFromServer({
        roomId: pvpRoomId,
        localPlayerId: humanPlayerId,
      });

      if (serverResult?.reward) {
        setBattleReward(serverResult.reward);
        setRewardClaimStatus("claimed");
        setRewardSyncPending(false);
        return;
      }

      setRewardClaimStatus("failed");
      setRewardClaimError("Награда не начислена: сервер профиля недоступен");
      return;
    }

    const serverResult = await claimBattleRewardFromServer({
      battle,
      mode,
      localPlayerId: humanPlayerId,
      matchEndReason: null,
    });

    if (serverResult?.reward) {
      setBattleReward(serverResult.reward);
      setRewardClaimStatus("claimed");
      setRewardSyncPending(false);
      return;
    }

    const localResult = applyBattleRewardToProgress({
      battle,
      mode,
      localPlayerId: humanPlayerId,
      matchEndReason: null,
    });

    if (localResult) {
      setBattleReward(localResult.reward);
      setRewardClaimStatus("claimed");
      setRewardClaimError(null);
      setRewardSyncPending(localResult.progress.pendingRewardClaims.length > 0);
      return;
    }

    setRewardClaimStatus("failed");
    setRewardClaimError("Награда не начислена: сервер профиля недоступен");
  }

  useEffect(() => {
    let frameId: number | null = null;

    if (battle.status === "starting" || battle.status === "active") {
      rewardedBattleKeyRef.current = null;
      frameId = window.requestAnimationFrame(() => {
        setBattleReward(null);
        setRewardClaimStatus("idle");
        setRewardClaimError(null);
        setRewardSyncPending(false);
      });

      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    if (battle.status !== "player_won" && battle.status !== "bot_won") return;

    const rewardKey = [
      mode,
      humanPlayerId,
      battle.status,
      battle.turn,
      battle.headquarters.player.hp,
      battle.headquarters.bot.hp,
      JSON.stringify(battle.stats),
      matchEndReason ?? "normal",
    ].join(":");

    if (rewardedBattleKeyRef.current === rewardKey) return;

    rewardedBattleKeyRef.current = rewardKey;

    void claimCurrentBattleReward();
  }, [battle, humanPlayerId, matchEndReason, mode, pvpRoomId, tutorialActive]);

  useEffect(() => {
    if (!cardPreview) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCardPreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [cardPreview]);

  useEffect(() => clearLongPressTimer, []);


  useEffect(() => {
    if (mode === "pvp") return;

    if (battle.status !== "starting") {
      if (battle.status === "active") {
        startRollRunningRef.current = false;
      }

      return;
    }

    if (startRollRunningRef.current) return;

    startRollRunningRef.current = true;

    const winner = tutorialActive ? "player" : getRandomLocalStartingPlayer();
    const targetAngle = winner === "player" ? 135 : -45;
    const finalRotation = 360 * 8 + targetAngle;

    setStartRollState({
      visible: true,
      winner,
      finalRotation,
      resultVisible: false,
    });

    const resultTimer = window.setTimeout(() => {
      setStartRollState((current) => ({
        ...current,
        resultVisible: true,
      }));
    }, START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS);

    const finishTimer = window.setTimeout(() => {
      dispatchBattleActionRef.current({
        type: "BEGIN_BATTLE",
        startingPlayer: winner,
      });

      setStartRollState({
        visible: false,
        winner: null,
        finalRotation: 0,
        resultVisible: false,
      });

      setTurnBannerText(winner === humanPlayerId ? "ТВОЙ ХОД" : "ХОД ВРАГА");

      window.setTimeout(() => {
        setTurnBannerText(null);
      }, 1300);

      previousActivePlayerRef.current = winner;
      startRollRunningRef.current = false;
    }, START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS + 650);

    return () => {
      window.clearTimeout(resultTimer);
      window.clearTimeout(finishTimer);
      startRollRunningRef.current = false;
    };
  }, [battle.status, humanPlayerId, mode, tutorialActive]);

  useEffect(() => {
    const owners: PlayerId[] = ["player", "bot"];

    for (const owner of owners) {
      const previousIds = previousHandIdsRef.current[owner];
      const currentHand = owner === "player" ? playerHand : botHand;

      const newCards = currentHand.filter(
        (card) => !previousIds.has(card.instanceId)
      );

      if (battle.status === "active" && newCards.length > 0) {
        setHiddenDrawnCardIds((current) => {
          const next = new Set(current);

          for (const drawnCard of newCards) {
            next.add(drawnCard.instanceId);
          }

          return next;
        });

        newCards.forEach((drawnCard, index) => {
          window.setTimeout(() => {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                playDrawCardAnimationRef.current(owner, drawnCard.instanceId);
              });
            });
          }, index * 140);
        });
      }

      previousHandIdsRef.current[owner] = new Set(
        currentHand.map((card) => card.instanceId)
      );
    }
  }, [
    battle.status,
    botHand,
    playerHand,
  ]);

  useEffect(() => {
    if (debugPaused) return;
    if (battle.status !== "active") return;
    if (mode === "pvp") return;

    let lastTickTime = Date.now();

    const interval = window.setInterval(() => {
      const now = Date.now();

      if (attackSequenceRunningRef.current) {
        lastTickTime = now;
        return;
      }

      const elapsedMs = now - lastTickTime;

      lastTickTime = now;

      dispatchBattleActionRef.current({
        type: "TIMER_TICK",
        elapsedMs,
      });
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [battle.status, debugPaused, mode]);

  const canAnimateEnemyThinking =
    botAiEnabled &&
    !debugPaused &&
    battle.status === "active" &&
    battle.activePlayer === "bot" &&
    battle.bot.hand.length > 0;
  const visibleThinkingCardIndex = canAnimateEnemyThinking
    ? thinkingCardIndex
    : null;
  const pvpSelectedOpponentCardIndex =
    mode === "pvp" && opponentSelectedCardInstanceId
      ? battle[opponentPlayerId].hand.findIndex(
          (card) => card.instanceId === opponentSelectedCardInstanceId
        )
      : -1;
  const visibleOpponentPulledCardIndex =
    pvpSelectedOpponentCardIndex >= 0
      ? pvpSelectedOpponentCardIndex
      : visibleThinkingCardIndex;

  useEffect(() => {
    if (!canAnimateEnemyThinking) return;

    const firstPickTimeout = window.setTimeout(() => {
      setThinkingCardIndex(Math.floor(Math.random() * battle.bot.hand.length));
    }, 80);

    const interval = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * battle.bot.hand.length);
      setThinkingCardIndex(randomIndex);
    }, 950);

    return () => {
      window.clearTimeout(firstPickTimeout);
      window.clearInterval(interval);
    };
  }, [canAnimateEnemyThinking, battle.bot.hand.length]);


  useEffect(() => {
    const previousBattleStatus = previousBattleStatusRef.current;
    previousBattleStatusRef.current = battle.status;

    if (battle.status !== "active") return;
    if (previousBattleStatus === "active") return;

    playTurnStartSound();
  }, [battle.status]);

  useEffect(() => {
  const previousActivePlayer = previousActivePlayerRef.current;

  previousActivePlayerRef.current = battle.activePlayer;

  if (battle.status !== "active") return;
  if (previousActivePlayer === battle.activePlayer) return;

  playTurnStartSound();

  const nextBannerText =
    battle.activePlayer === humanPlayerId ? "ТВОЙ ХОД" : "ХОД ВРАГА";

  setTurnBannerText(nextBannerText);

  const timeout = window.setTimeout(() => {
    setTurnBannerText(null);
  }, 1300);

  return () => {
    window.clearTimeout(timeout);
  };
}, [battle.activePlayer, battle.status, humanPlayerId]);

  async function playAttackAnimation(attackerId: string, targetId: string) {
    await waitForNextFrame();
    await delay(40);

    const attackerElement = objectRefs.current.get(attackerId);
    const targetElement = objectRefs.current.get(targetId);
    const boardElement = boardRef.current;

    setAttackingId(attackerId);

    if (!attackerElement || !targetElement || !boardElement) {
      console.warn("Attack animation skipped: missing element", {
        attackerId,
        targetId,
        hasAttackerElement: Boolean(attackerElement),
        hasTargetElement: Boolean(targetElement),
        hasBoardElement: Boolean(boardElement),
      });

      await delay(260);
      return;
    }

    const from = getElementCenterRelativeToBoard(boardElement, attackerElement);
    const to = getElementCenterRelativeToBoard(boardElement, targetElement);

    projectileIdRef.current += 1;
    playCannonShotSound();

    setProjectileEffect({
      id: projectileIdRef.current,
      from,
      to,
    });

    await delay(260);

    setAttackEffectId(targetId);

    explosionIdRef.current += 1;

    setExplosionEffect({
      id: explosionIdRef.current,
      position: to,
    });

    const impactDistance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));

    hitReactionIdRef.current += 1;

    const hitReaction: HitReactionEffect = {
      id: hitReactionIdRef.current,
      targetId,
      x: ((to.x - from.x) / impactDistance) * 17,
      y: ((to.y - from.y) / impactDistance) * 17,
    };

    setHitReactionEffect(hitReaction);

    window.setTimeout(() => {
      setAttackingId(null);
      setProjectileEffect(null);
    }, 220);

    window.setTimeout(() => {
      setAttackEffectId(null);
      setExplosionEffect(null);
    }, 940);

    window.setTimeout(() => {
      setHitReactionEffect((current) =>
        current?.id === hitReaction.id ? null : current
      );
    }, 360);
  }

  useEffect(() => {
    if (!botAiEnabled) return;
    if (debugPaused) return;
    if (battle.status !== "active") return;
    if (battle.activePlayer !== "bot") return;
    if (botTurnRunningRef.current) return;

    let cancelled = false;

    async function runAnimatedBotTurn() {
      botTurnRunningRef.current = true;

      await delay(450);

      while (!cancelled) {
        if (debugPausedRef.current) break;

        const currentBattle = useBattleStore.getState().battle as BattleState | null;

        if (!currentBattle) break;
        if (currentBattle.status !== "active") break;
        if (currentBattle.activePlayer !== "bot") break;

        const tutorialNow = useBattleStore.getState().tutorialActive;
        const action: BattleAction | null = tutorialNow
          ? getTutorialBotAction(currentBattle)
          : getNextBotAction(currentBattle);

        if (!action) break;

        await delay(getRandomBotThinkingDelay());

        if (cancelled || debugPausedRef.current) break;

        if (action.type === "ATTACK") {
          await delay(180);
          const strikes = getAttackAnimationSequence(currentBattle, action);

          const animationPlayed = await playAttackSequenceRef.current(strikes);

          if (cancelled || !animationPlayed) break;

          dispatchBattleActionRef.current(action, { skipDamageEffects: true });
          await delay(700);
          continue;
        }

        if (action.type === "MOVE_UNIT") {
          if (cancelled) break;

          await playAndDispatchLocalMovementRef.current(currentBattle, action);
          await delay(170);
          continue;
        }

        if (action.type === "PLAY_CARD") {
          const latestBattle = useBattleStore.getState().battle as BattleState | null;
          const cardInstance = latestBattle?.bot.hand.find(
            (item) => item.instanceId === action.cardInstanceId
          );

          if (cardInstance) {
            await playSpawnCardAnimationRef.current(
              "bot",
              cardInstance.instanceId,
              cardInstance.cardId,
              action.position
            );
          }

          dispatchBattleActionRef.current(action);
          await delay(450);
          continue;
        }

        if (action.type === "PLAY_SUPPORT_CARD") {
          const latestBattle = useBattleStore.getState().battle as BattleState | null;
          const cardInstance = latestBattle?.bot.hand.find(
            (item) => item.instanceId === action.cardInstanceId
          );

          if (cardInstance) {
            await playSupportSpawnCardAnimationRef.current(
              "bot",
              cardInstance.instanceId,
              cardInstance.cardId,
              action.supportSlot
            );
          }

          dispatchBattleActionRef.current(action);
          await delay(450);
          continue;
        }

        if (action.type === "END_TURN") {
          dispatchBattleActionRef.current(action);
          await delay(250);
          break;
        }
      }

      botTurnRunningRef.current = false;
    }

    void runAnimatedBotTurn();

    return () => {
      cancelled = true;
      botTurnRunningRef.current = false;
    };
  }, [botAiEnabled, battle.activePlayer, battle.status, debugPaused]);

  const rows = [0, 1, 2] as const;
  const cols = [0, 1, 2, 3, 4] as const;
  const visualRows: readonly number[] =
    humanPlayerId === "player" ? rows : [...rows].reverse();
  const visualCols: readonly number[] =
    humanPlayerId === "player" ? cols : [...cols].reverse();

  const selectedTargets =
    selectedAttacker &&
    battle.status === "active" &&
    battle.activePlayer === humanPlayerId
      ? getTargetsInRange(
        battle as BattleState,
        humanPlayerId,
          selectedAttacker.type,
          selectedAttacker.id
        )
      : [];

  const selectedMoveCells =
    selectedAttacker &&
    selectedAttacker.type === "unit" &&
    battle.status === "active" &&
    battle.activePlayer === humanPlayerId
      ? getAvailableMoveCells(battle as BattleState, humanPlayerId, selectedAttacker.id)
      : [];

  function isTarget(targetType: "unit" | "headquarters", targetId: string) {
    return selectedTargets.some(
      (target) => target.type === targetType && target.id === targetId
    );
  }

  function isMoveCell(position: Position) {
    return selectedMoveCells.some((cell) => samePosition(cell, position));
  }

  function getHealthDamageEffect(targetId: string) {
    for (let index = damageTextEffects.length - 1; index >= 0; index -= 1) {
      const effect = damageTextEffects[index];

      if (effect.targetId === targetId) {
        return effect;
      }
    }

    return undefined;
  }

  function showHealthDamageEffect(targetId: string, amount: number) {
    damageTextIdRef.current += 1;

    const effect: DamageTextEffect = {
      id: damageTextIdRef.current,
      targetId,
      amount,
    };

    setDamageTextEffects((current) => [...current, effect]);

    window.setTimeout(() => {
      setDamageTextEffects((current) =>
        current.filter((item) => item.id !== effect.id)
      );
    }, 980);
  }

  function getHealthGainEffect(targetId: string) {
    for (let index = healthGainEffects.length - 1; index >= 0; index -= 1) {
      const effect = healthGainEffects[index];

      if (effect.targetId === targetId) {
        return effect;
      }
    }

    return undefined;
  }

  function showHealthGainEffect(targetId: string, amount: number) {
    healthGainEffectIdRef.current += 1;

    const effect: HealthGainEffect = {
      id: healthGainEffectIdRef.current,
      targetId,
      amount,
    };

    setHealthGainEffects((current) => [...current, effect]);

    window.setTimeout(() => {
      setHealthGainEffects((current) =>
        current.filter((item) => item.id !== effect.id)
      );
    }, 920);
  }

  function getAttackChangeEffect(targetId: string) {
    for (let index = attackChangeEffects.length - 1; index >= 0; index -= 1) {
      const effect = attackChangeEffects[index];

      if (effect.targetId === targetId) {
        return effect;
      }
    }

    return undefined;
  }

  function showAttackChangeEffect(targetId: string, amount: number) {
    attackChangeEffectIdRef.current += 1;

    const effect: AttackChangeEffect = {
      id: attackChangeEffectIdRef.current,
      targetId,
      amount,
    };

    setAttackChangeEffects((current) => [...current, effect]);

    window.setTimeout(() => {
      setAttackChangeEffects((current) =>
        current.filter((item) => item.id !== effect.id)
      );
    }, 920);
  }

  function getCombatObjectOwner(targetId: string): PlayerId | null {
    if (targetId === "player_hq") return "player";
    if (targetId === "bot_hq") return "bot";

    return (
      battle.units.find((unit) => unit.instanceId === targetId)?.ownerId ?? null
    );
  }

  async function playDestroyedCardAnimation(targetId: string): Promise<void> {
    await waitForNextFrame();
    playDestroyedSound();

    const targetElement = objectRefs.current.get(targetId);
    const owner = getCombatObjectOwner(targetId);
    const deckElement = owner ? deckRefs.current[owner] : null;

    if (!targetElement || !deckElement || !owner) {
      await delay(DESTROYED_CARD_ANIMATION_MS);
      return;
    }

    const from = getElementCenterInViewport(targetElement);
    const to = getElementCenterInViewport(deckElement);

    destroyedCardEffectIdRef.current += 1;

    const effect: DestroyedCardEffect = {
      id: destroyedCardEffectIdRef.current,
      targetId,
      from,
      to,
      width: targetElement.offsetWidth,
      height: targetElement.offsetHeight,
      rotation: owner === humanPlayerId ? -14 : 14,
    };

    setDestroyedCardEffects((current) => [...current, effect]);

    window.setTimeout(() => {
      setHiddenDestroyedObjectIds((current) => {
        const next = new Set(current);
        next.add(targetId);
        return next;
      });
    }, 150);

    await delay(DESTROYED_CARD_ANIMATION_MS);

    setDestroyedCardEffects((current) =>
      current.filter((item) => item.id !== effect.id)
    );

    setHiddenDestroyedObjectIds((current) => {
      const next = new Set(current);
      next.delete(targetId);
      return next;
    });
  }

  async function playAttackSequence(
    strikes: AttackAnimationStrike[]
  ): Promise<boolean> {
    if (attackSequenceRunningRef.current) return false;

    attackSequenceRunningRef.current = true;

    try {
      const hp = createHpSnapshot(battle);
      const damagedTargetIds = new Set<string>();

      for (const strike of strikes) {
        await playAttackAnimation(strike.sourceId, strike.targetId);
        showHealthDamageEffect(strike.targetId, strike.damage);

        const currentHp = hp.get(strike.targetId);

        if (currentHp !== undefined) {
          hp.set(strike.targetId, currentHp - strike.damage);
          damagedTargetIds.add(strike.targetId);
        }

        await delay(ATTACK_STRIKE_SETTLE_MS);
      }

      const destroyedTargetIds = [...damagedTargetIds].filter(
        (targetId) => (hp.get(targetId) ?? 1) <= 0
      );

      await Promise.all(
        destroyedTargetIds.map((targetId) =>
          playDestroyedCardAnimation(targetId)
        )
      );

      return true;
    } finally {
      attackSequenceRunningRef.current = false;
    }
  }

  function getCombatForecast(): Map<string, number> {
    const forecast = new Map<string, number>();

    if (!selectedAttacker || !hoveredAttackTarget) return forecast;
    if (!isTarget(hoveredAttackTarget.type, hoveredAttackTarget.id)) {
      return forecast;
    }

    const strikes = getAttackAnimationSequence(battle as BattleState, {
      type: "ATTACK",
      playerId: humanPlayerId,
      attackerType: selectedAttacker.type,
      attackerId: selectedAttacker.id,
      targetType: hoveredAttackTarget.type,
      targetId: hoveredAttackTarget.id,
    });

    const hp = createHpSnapshot(battle);

    for (const strike of strikes) {
      const targetHp = hp.get(strike.targetId);

      if (targetHp === undefined) continue;

      const hpAfterStrike = Math.max(0, targetHp - strike.damage);
      hp.set(strike.targetId, hpAfterStrike);
      forecast.set(strike.targetId, hpAfterStrike);
    }

    return forecast;
  }

  const combatForecast = getCombatForecast();

  function createHpSnapshot(sourceBattle: ClientBattleState): Map<string, number> {
    const hp = new Map<string, number>();

    for (const unit of sourceBattle.units) {
      hp.set(unit.instanceId, unit.currentHp);
    }

    hp.set("player_hq", sourceBattle.headquarters.player.hp);
    hp.set("bot_hq", sourceBattle.headquarters.bot.hp);

    return hp;
  }

  function createAttackSnapshot(
    sourceBattle: ClientBattleState
  ): Map<string, number> {
    return new Map([
      [
        "player_hq",
        getHeadquartersAttackValue(sourceBattle as BattleState, "player"),
      ],
      ["bot_hq", getHeadquartersAttackValue(sourceBattle as BattleState, "bot")],
    ]);
  }

  function showAttackChangesFromSnapshots(
    before: Map<string, number>,
    after: Map<string, number>
  ) {
    for (const [id, currentAttack] of after.entries()) {
      const previousAttack = before.get(id);

      if (previousAttack !== undefined && currentAttack !== previousAttack) {
        showAttackChangeEffect(id, currentAttack - previousAttack);
      }
    }
  }

  function showDamageEffectsFromSnapshots(
    before: Map<string, number>,
    after: Map<string, number>
  ) {
    for (const [id, currentHp] of after.entries()) {
      const previousHp = before.get(id);

      if (previousHp !== undefined && currentHp < previousHp) {
        const amount = previousHp - currentHp;

        showHealthDamageEffect(id, amount);
      }

      if (previousHp !== undefined && currentHp > previousHp) {
        const amount = currentHp - previousHp;

        showHealthGainEffect(id, amount);
      }
    }
  }

  useEffect(() => {
    const currentSnapshot = createHpSnapshot(battle);
    const previousSnapshot = previousHpSnapshotRef.current;
    const currentAttackSnapshot = createAttackSnapshot(battle);
    const previousAttackSnapshot = previousAttackSnapshotRef.current;

    if (mode === "pvp" && previousSnapshot) {
      if (suppressNextRemoteDamageEffectsRef.current) {
        suppressNextRemoteDamageEffectsRef.current = false;
      } else {
        showDamageEffectsFromSnapshotsRef.current(previousSnapshot, currentSnapshot);
      }
    }

    if (mode === "pvp" && previousAttackSnapshot) {
      showAttackChangesFromSnapshotsRef.current(
        previousAttackSnapshot,
        currentAttackSnapshot
      );
    }

    previousHpSnapshotRef.current = currentSnapshot;
    previousAttackSnapshotRef.current = currentAttackSnapshot;
  }, [battle, mode]);

  function dispatchBattleAction(
    action: BattleAction,
    options: { skipDamageEffects?: boolean } = {}
  ) {
    const shouldShowDamage =
      action.type === "ATTACK" ||
      action.type === "PLAY_CARD" ||
      action.type === "PLAY_SUPPORT_CARD" ||
      action.type === "END_TURN" ||
      action.type === "TIMER_TICK";

    const beforeBattle = useBattleStore.getState().battle;
    const before =
      shouldShowDamage && beforeBattle ? createHpSnapshot(beforeBattle) : null;
    const beforeAttack =
      beforeBattle ? createAttackSnapshot(beforeBattle) : null;

    dispatch(action);

    const afterBattle = useBattleStore.getState().battle;
    if (!afterBattle) return;

    if (beforeAttack) {
      showAttackChangesFromSnapshots(beforeAttack, createAttackSnapshot(afterBattle));
    }

    if (!shouldShowDamage || !before || options.skipDamageEffects) return;

    const after = createHpSnapshot(afterBattle);

    showDamageEffectsFromSnapshots(before, after);
  }

  function actionUsesSelection(action: BattleAction) {
    const { selectedCardInstanceId: currentCard, selectedAttacker: currentAttacker } =
      useBattleStore.getState();

    if (action.type === "PLAY_CARD" || action.type === "PLAY_SUPPORT_CARD") {
      return currentCard === action.cardInstanceId;
    }

    if (action.type === "MOVE_UNIT") {
      return (
        currentAttacker?.type === "unit" && currentAttacker.id === action.unitId
      );
    }

    if (action.type === "ATTACK") {
      return (
        currentAttacker?.type === action.attackerType &&
        currentAttacker.id === action.attackerId
      );
    }

    return true;
  }

  function dispatchQueuedBattleAction(
    action: BattleAction,
    options: { skipDamageEffects?: boolean } = {}
  ) {
    const {
      selectedCardInstanceId: currentCard,
      selectedAttacker: currentAttacker,
    } = useBattleStore.getState();
    const shouldRestoreSelection =
      (currentCard !== null || currentAttacker !== null) &&
      !actionUsesSelection(action);

    dispatchBattleActionRef.current(action, options);

    if (!shouldRestoreSelection) return;

    useBattleStore.setState({
      selectedCardInstanceId: currentCard,
      selectedAttacker: currentAttacker,
    });
  }

  function playDrawCardAnimation(owner: PlayerId, cardInstanceId: string) {
    playCardDistributionSound();

    const deckElement = deckRefs.current[owner];
    const targetCardElement = handCardRefs.current[owner].get(cardInstanceId);

    if (!deckElement || !targetCardElement) {
      setHiddenDrawnCardIds((current) => {
        const next = new Set(current);
        next.delete(cardInstanceId);
        return next;
      });

      return;
    }

    const from = getElementCenterInViewport(deckElement);
    const to = getElementCenterInViewport(targetCardElement);

    drawCardEffectIdRef.current += 1;

    const effect: DrawCardEffect = {
      id: drawCardEffectIdRef.current,
      owner,
      from,
      to,
    };

    setDrawCardEffects((current) => [...current, effect]);

    window.setTimeout(() => {
      setDrawCardEffects((current) =>
        current.filter((item) => item.id !== effect.id)
      );
    }, DRAW_CARD_ANIMATION_MS);

    window.setTimeout(() => {
      setHiddenDrawnCardIds((current) => {
        const next = new Set(current);
        next.delete(cardInstanceId);
        return next;
      });
    }, DRAW_CARD_ANIMATION_MS + DRAW_CARD_REVEAL_DELAY_MS);
  }


  function playSpawnCardAnimation(
    owner: PlayerId,
    cardInstanceId: string,
    cardId: string,
    position: Position
  ): Promise<void> {
    const targetCellElement = cellRefs.current.get(positionKey(position));

    return playSpawnCardAnimationToElement(
      owner,
      cardInstanceId,
      cardId,
      targetCellElement
    );
  }

  function playSupportSpawnCardAnimation(
    owner: PlayerId,
    cardInstanceId: string,
    cardId: string,
    supportSlot: SupportSlot
  ): Promise<void> {
    const targetCellElement = supportCellRefs.current.get(
      supportCellKey(owner, supportSlot)
    );

    return playSpawnCardAnimationToElement(
      owner,
      cardInstanceId,
      cardId,
      targetCellElement
    );
  }

  function playSpawnCardAnimationToElement(
    owner: PlayerId,
    cardInstanceId: string,
    cardId: string,
    targetCellElement: HTMLButtonElement | undefined
  ): Promise<void> {
    const sourceCardElement = handCardRefs.current[owner].get(cardInstanceId);

    if (!sourceCardElement || !targetCellElement) {
      return Promise.resolve();
    }

    playCardDistributionSound();

    const from = getElementCenterInViewport(sourceCardElement);
    const to = getElementCenterInViewport(targetCellElement);

    spawnCardEffectIdRef.current += 1;

    const effect: SpawnCardEffect = {
      id: spawnCardEffectIdRef.current,
      owner,
      from,
      to,
      cardId,
      hiddenCardInstanceId: cardInstanceId,
    };

    setSpawningCardInstanceId(cardInstanceId);

    setHiddenSpawningCardIds((current) => {
      const next = new Set(current);
      next.add(cardInstanceId);
      return next;
    });

    setSpawnCardEffects((current) => [...current, effect]);

    return new Promise((resolve) => {
      window.setTimeout(() => {
        setSpawnCardEffects((current) =>
          current.filter((item) => item.id !== effect.id)
        );

        setHiddenSpawningCardIds((current) => {
          const next = new Set(current);
          next.delete(cardInstanceId);
          return next;
        });

        setSpawningCardInstanceId((current) =>
          current === cardInstanceId ? null : current
        );

        resolve();
      }, SPAWN_CARD_ANIMATION_MS);
    });
  }

  function getStraightTwoCellIntermediate(
    fromPosition: Position,
    targetPosition: Position
  ): Position | null {
    const rowDistance = Math.abs(fromPosition.row - targetPosition.row);
    const colDistance = Math.abs(fromPosition.col - targetPosition.col);

    if (rowDistance + colDistance !== 2) return null;
    if (rowDistance > 0 && colDistance > 0) return null;

    const dRow = Math.sign(targetPosition.row - fromPosition.row);
    const dCol = Math.sign(targetPosition.col - fromPosition.col);

    return {
      row: fromPosition.row + dRow,
      col: fromPosition.col + dCol,
    };
  }

  async function playAndDispatchLocalMovement(
    state: BattleState,
    action: Extract<BattleAction, { type: "MOVE_UNIT" }>,
    options: { preserveLaterSelection?: boolean } = {}
  ): Promise<void> {
    const unit = state.units.find((item) => item.instanceId === action.unitId);
    const intermediate =
      unit && getCard(unit.cardId).class === "light"
        ? getStraightTwoCellIntermediate(unit.position, action.position)
        : null;
    const positions = intermediate
      ? [intermediate, action.position]
      : [action.position];

    for (const position of positions) {
      const currentBattle =
        (useBattleStore.getState().battle as BattleState | null) ?? state;
      const movingUnit =
        currentBattle.units.find((item) => item.instanceId === action.unitId) ??
        unit;
      const movementPath = await playMoveIntentAnimation(
        action.playerId,
        action.unitId,
        position
      );
      const stepAction: BattleAction = {
        ...action,
        position,
      };

      if (movementPath && movingUnit) {
        movementArrowEffectIdRef.current += 1;
        const effectId = movementArrowEffectIdRef.current;

        flushSync(() => {
          setHiddenMovingUnitIds((current) => {
            const next = new Set(current);
            next.add(action.unitId);
            return next;
          });
          setMovementUnitEffect({
            id: effectId,
            unitId: action.unitId,
            cardId: movingUnit.cardId,
            owner: movingUnit.ownerId,
            currentHp: movingUnit.currentHp,
            alreadyMoved: movingUnit.alreadyMoved,
            alreadyAttacked: movingUnit.alreadyAttacked,
            phase: "moving",
            ...movementPath,
          });
        });

        await waitForNextFrame();
      }

      if (options.preserveLaterSelection) {
        dispatchQueuedBattleAction(stepAction);
      } else {
        dispatchBattleActionRef.current(stepAction);
      }
      await waitForNextFrame();
      await delay(MOVE_ARROW_FOLLOW_MS);

      if (movementPath) {
        setMovementUnitEffect((current) =>
          current?.unitId === action.unitId ? null : current
        );
        setHiddenMovingUnitIds((current) => {
          const next = new Set(current);
          next.delete(action.unitId);
          return next;
        });
      }
    }
  }

  async function playMoveIntentAnimation(
    owner: PlayerId,
    unitId: string,
    position: Position,
    durationMs = MOVE_ARROW_LEAD_MS
  ): Promise<MovementPath | null> {
    while (movementAnimationRunningRef.current) {
      await delay(20);
    }

    movementAnimationRunningRef.current = true;

    try {
      await waitForNextFrame();
      await delay(30);

      const boardElement = boardRef.current;
      const unitElement = objectRefs.current.get(unitId);
      const targetCellElement = cellRefs.current.get(positionKey(position));

      if (!boardElement || !unitElement || !targetCellElement) {
        await delay(durationMs);
        return null;
      }

      playCardDistributionSound();

      movementArrowEffectIdRef.current += 1;
      const from = getElementCenterRelativeToBoard(boardElement, unitElement);
      const to = getElementCenterRelativeToBoard(boardElement, targetCellElement);

      const effect: MovementArrowEffect = {
        id: movementArrowEffectIdRef.current,
        owner,
        from,
        to,
        phase: "extending",
      };

      const dx = effect.to.x - effect.from.x;
      const dy = effect.to.y - effect.from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const unitX = dx / distance;
      const unitY = dy / distance;
      const isDiagonalMove = Math.abs(dx) > 1 && Math.abs(dy) > 1;
      const targetEdgeOffset = isDiagonalMove
        ? 0
        : ((Math.abs(unitX) * targetCellElement.offsetWidth +
            Math.abs(unitY) * targetCellElement.offsetHeight) /
            2) *
          0.85;

      effect.to = {
        x: effect.to.x + unitX * targetEdgeOffset,
        y: effect.to.y + unitY * targetEdgeOffset,
      };

      setMovementArrowEffect(effect);

      await delay(durationMs);

      setMovementArrowEffect((current) =>
        current?.id === effect.id
          ? {
              ...current,
              phase: "following",
            }
          : current
      );

      window.setTimeout(() => {
        setMovementArrowEffect((current) =>
          current?.id === effect.id ? null : current
        );
      }, MOVE_ARROW_FOLLOW_MS);

      return {
        from,
        to,
        width: unitElement.offsetWidth,
        height: unitElement.offsetHeight,
      };
    } finally {
      movementAnimationRunningRef.current = false;
    }
  }

  async function playRemoteMoveIntentAnimation(
    owner: PlayerId,
    unitId: string,
    position: Position,
    durationMs: number
  ) {
    while (movementAnimationRunningRef.current) {
      await delay(20);
    }

    movementAnimationRunningRef.current = true;
    let effectId: number | null = null;

    try {
      await waitForNextFrame();
      await delay(30);

      const currentBattle = useBattleStore.getState().battle as BattleState | null;
      const movingUnit = currentBattle?.units.find(
        (item) => item.instanceId === unitId
      );
      const boardElement = boardRef.current;
      const unitElement = objectRefs.current.get(unitId);
      const targetCellElement = cellRefs.current.get(positionKey(position));

      if (!boardElement || !unitElement || !targetCellElement || !movingUnit) {
        await delay(durationMs + MOVE_ARROW_FOLLOW_MS);
        return;
      }

      playCardDistributionSound();

      movementArrowEffectIdRef.current += 1;
      effectId = movementArrowEffectIdRef.current;

      const from = getElementCenterRelativeToBoard(boardElement, unitElement);
      const to = getElementCenterRelativeToBoard(boardElement, targetCellElement);
      const arrowTo = { ...to };
      const dx = arrowTo.x - from.x;
      const dy = arrowTo.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const unitX = dx / distance;
      const unitY = dy / distance;
      const isDiagonalMove = Math.abs(dx) > 1 && Math.abs(dy) > 1;
      const targetEdgeOffset = isDiagonalMove
        ? 0
        : ((Math.abs(unitX) * targetCellElement.offsetWidth +
            Math.abs(unitY) * targetCellElement.offsetHeight) /
            2) *
          0.85;

      arrowTo.x += unitX * targetEdgeOffset;
      arrowTo.y += unitY * targetEdgeOffset;

      flushSync(() => {
        setHiddenMovingUnitIds((current) => {
          const next = new Set(current);
          next.add(unitId);
          return next;
        });
        setMovementUnitEffect({
          id: effectId ?? movementArrowEffectIdRef.current,
          unitId,
          cardId: movingUnit.cardId,
          owner: movingUnit.ownerId,
          currentHp: movingUnit.currentHp,
          alreadyMoved: movingUnit.alreadyMoved,
          alreadyAttacked: movingUnit.alreadyAttacked,
          from,
          to,
          width: unitElement.offsetWidth,
          height: unitElement.offsetHeight,
          phase: "waiting",
        });
        setMovementArrowEffect({
          id: effectId ?? movementArrowEffectIdRef.current,
          owner,
          from,
          to: arrowTo,
          phase: "extending",
        });
      });

      await delay(durationMs);

      setMovementArrowEffect((current) =>
        current?.id === effectId
          ? {
              ...current,
              phase: "following",
            }
          : current
      );
      setMovementUnitEffect((current) =>
        current?.unitId === unitId
          ? {
              ...current,
              phase: "moving",
            }
          : current
      );

      window.setTimeout(() => {
        setMovementArrowEffect((current) =>
          current?.id === effectId ? null : current
        );
      }, MOVE_ARROW_FOLLOW_MS);

      await delay(MOVE_ARROW_FOLLOW_MS);
    } finally {
      setMovementUnitEffect((current) =>
        current?.unitId === unitId ? null : current
      );
      setHiddenMovingUnitIds((current) => {
        const next = new Set(current);
        next.delete(unitId);
        return next;
      });
      movementAnimationRunningRef.current = false;
    }
  }

  useEffect(() => {
    if (mode !== "pvp") return;
    if (!pvpMovementIntent) return;

    void playRemoteMoveIntentAnimation(
      pvpMovementIntent.playerId,
      pvpMovementIntent.unitId,
      pvpMovementIntent.position,
      pvpMovementIntent.durationMs
    );
  }, [mode, pvpMovementIntent]);

  useEffect(() => {
    if (mode !== "pvp") return;
    if (!pvpAttackIntent) return;
    if (lastPvpAttackIntentIdRef.current === pvpAttackIntent.intentId) return;

    lastPvpAttackIntentIdRef.current = pvpAttackIntent.intentId;
    suppressNextRemoteDamageEffectsRef.current = true;

    void playAttackSequenceRef.current(pvpAttackIntent.strikes);
  }, [mode, pvpAttackIntent]);

  function isCommandAnimationBusy() {
    return (
      attackSequenceRunningRef.current ||
      movementAnimationRunningRef.current ||
      spawningCardInstanceIdRef.current !== null
    );
  }

  async function waitForCommandSlot() {
    while (isCommandAnimationBusy()) {
      await delay(35);
    }
  }

  function getCurrentCommandBattle(): BattleState | null {
    const currentBattle = useBattleStore.getState().battle as BattleState | null;
    const currentHumanPlayerId = humanPlayerIdRef.current;

    if (!currentBattle) return null;
    if (currentBattle.status !== "active") return null;
    if (currentBattle.activePlayer !== currentHumanPlayerId) return null;

    return currentBattle;
  }

  async function runQueuedBattleCommands() {
    if (commandQueueRunningRef.current) return;

    commandQueueRunningRef.current = true;

    try {
      while (commandQueueRef.current.length > 0) {
        await waitForCommandSlot();

        const command = commandQueueRef.current.shift();
        if (!command) continue;

        await command.run();
        await waitForNextFrame();
      }
    } finally {
      commandQueueRunningRef.current = false;

      if (commandQueueRef.current.length > 0) {
        void runQueuedBattleCommands();
      }
    }
  }

  function enqueueBattleCommand(run: () => Promise<void>) {
    commandQueueIdRef.current += 1;
    commandQueueRef.current.push({
      id: commandQueueIdRef.current,
      run,
    });

    void runQueuedBattleCommands();
  }

  async function executeQueuedPlayCard(
    cardInstanceId: string,
    position: Position
  ) {
    const currentBattle = getCurrentCommandBattle();
    const currentHumanPlayerId = humanPlayerIdRef.current;

    if (!currentBattle) return;

    const isOwnSpawn =
      currentHumanPlayerId === "player"
        ? isPlayerSpawn(position)
        : isBotSpawn(position);

    if (!isOwnSpawn) return;

    const cardInstance = currentBattle[currentHumanPlayerId].hand.find(
      (item) => item.instanceId === cardInstanceId
    );

    if (!cardInstance || isHiddenCardInstance(cardInstance)) return;
    if (getCard(cardInstance.cardId).deploymentZone === "support") return;

    await playSpawnCardAnimationRef.current(
      currentHumanPlayerId,
      cardInstance.instanceId,
      cardInstance.cardId,
      position
    );

    dispatchQueuedBattleAction({
      type: "PLAY_CARD",
      playerId: currentHumanPlayerId,
      cardInstanceId: cardInstance.instanceId,
      position,
    });
  }

  async function executeQueuedPlaySupportCard(
    cardInstanceId: string,
    supportSlot: SupportSlot
  ) {
    const currentBattle = getCurrentCommandBattle();
    const currentHumanPlayerId = humanPlayerIdRef.current;

    if (!currentBattle) return;
    if (
      !getFreeSupportSlots(currentBattle, currentHumanPlayerId).includes(
        supportSlot
      )
    ) {
      return;
    }

    const cardInstance = currentBattle[currentHumanPlayerId].hand.find(
      (item) => item.instanceId === cardInstanceId
    );

    if (!cardInstance || isHiddenCardInstance(cardInstance)) return;
    if (getCard(cardInstance.cardId).deploymentZone !== "support") return;

    await playSupportSpawnCardAnimationRef.current(
      currentHumanPlayerId,
      cardInstance.instanceId,
      cardInstance.cardId,
      supportSlot
    );

    dispatchQueuedBattleAction({
      type: "PLAY_SUPPORT_CARD",
      playerId: currentHumanPlayerId,
      cardInstanceId: cardInstance.instanceId,
      supportSlot,
    });
  }

  async function executeQueuedMove(
    action: Extract<BattleAction, { type: "MOVE_UNIT" }>
  ) {
    const currentBattle = getCurrentCommandBattle();

    if (!currentBattle) return;

    const canMoveToTarget = getAvailableMoveCells(
      currentBattle,
      action.playerId,
      action.unitId
    ).some((cell) => samePosition(cell, action.position));

    if (!canMoveToTarget) return;

    if (modeRef.current === "pvp") {
      dispatchQueuedBattleAction(action);
      return;
    }

    await playAndDispatchLocalMovementRef.current(currentBattle, action, {
      preserveLaterSelection: true,
    });
  }

  async function executeQueuedAttack(
    action: Extract<BattleAction, { type: "ATTACK" }>
  ) {
    const currentBattle = getCurrentCommandBattle();

    if (!currentBattle) return;

    const canAttackTarget = getTargetsInRange(
      currentBattle,
      action.playerId,
      action.attackerType,
      action.attackerId
    ).some(
      (target) => target.type === action.targetType && target.id === action.targetId
    );

    if (!canAttackTarget) return;

    if (modeRef.current === "pvp") {
      dispatchQueuedBattleAction(action);
      return;
    }

    const strikes = getAttackAnimationSequence(currentBattle, action);
    const animationPlayed = await playAttackSequenceRef.current(strikes);

    if (!animationPlayed) return;

    dispatchQueuedBattleAction(action, { skipDamageEffects: true });
  }

  async function executeQueuedEndTurn() {
    const currentBattle = getCurrentCommandBattle();
    const currentHumanPlayerId = humanPlayerIdRef.current;

    if (!currentBattle) return;

    dispatchQueuedBattleAction({
      type: "END_TURN",
      playerId: currentHumanPlayerId,
    });
  }

  function handleCellClick(position: Position) {
    if (debugPaused) return;
    if (battle.status !== "active") return;
    if (battle.activePlayer !== humanPlayerId) return;

    if (selectedAttacker?.type === "headquarters") {
      selectAttacker(null);
    }

    if (selectedCardInstanceId) {
      const isOwnSpawn =
        humanPlayerId === "player" ? isPlayerSpawn(position) : isBotSpawn(position);
      if (!isOwnSpawn) return;

      const cardInstance = battle[humanPlayerId].hand.find(
        (item) => item.instanceId === selectedCardInstanceId
      );

      if (!cardInstance || isHiddenCardInstance(cardInstance)) return;
      if (getCard(cardInstance.cardId).deploymentZone === "support") return;

      enqueueBattleCommand(() =>
        executeQueuedPlayCard(cardInstance.instanceId, position)
      );

      return;
    }

    if (selectedAttacker && selectedAttacker.type === "unit") {
      if (!isMoveCell(position)) return;
      // During a scripted BT advance only the highlighted target cell is a
      // legal destination; ignore clicks on any other (dimmed) move cell.
      if (tutorialRestrictsMove && !isTutorialCellHighlighted(position)) return;

      const moveAction: BattleAction = {
          type: "MOVE_UNIT",
          playerId: humanPlayerId,
          unitId: selectedAttacker.id,
          position,
        };

      enqueueBattleCommand(() => executeQueuedMove(moveAction));
    }
  }

  function handleSupportSlotClick(owner: PlayerId, supportSlot: SupportSlot) {
    if (debugPaused) return;
    if (battle.status !== "active") return;
    if (battle.activePlayer !== humanPlayerId) return;
    if (owner !== humanPlayerId) return;
    if (!selectedCardInstanceId) return;

    const cardInstance = battle[humanPlayerId].hand.find(
      (item) => item.instanceId === selectedCardInstanceId
    );

    if (!cardInstance || isHiddenCardInstance(cardInstance)) return;
    if (getCard(cardInstance.cardId).deploymentZone !== "support") return;
    if (
      !getFreeSupportSlots(battle as BattleState, humanPlayerId).includes(
        supportSlot
      )
    ) {
      return;
    }

    enqueueBattleCommand(() =>
      executeQueuedPlaySupportCard(cardInstance.instanceId, supportSlot)
    );
  }

  function handleAttackTarget(
    targetType: "unit" | "headquarters",
    targetId: string
  ) {
    if (debugPaused) return;
    if (!selectedAttacker) return;
    if (battle.status !== "active") return;
    if (battle.activePlayer !== humanPlayerId) return;

    const attackAction: BattleAction = {
      type: "ATTACK",
      playerId: humanPlayerId,
      attackerType: selectedAttacker.type,
      attackerId: selectedAttacker.id,
      targetType,
      targetId,
    };

    enqueueBattleCommand(() => executeQueuedAttack(attackAction));
  }


  function getNextTurnFuel(owner: PlayerId): number {
    const headquartersFuel = battle.headquarters[owner].fuelGeneration;

    const unitsFuel = battle.units
      .filter((unit) => unit.ownerId === owner)
      .reduce((sum, unit) => {
        const card = getCard(unit.cardId);

        return (
          sum +
          (isSupportUnit(unit)
            ? card.supportEffects?.fuelPerTurn ?? 0
            : card.fuelGeneration)
        );
      }, 0);

    return headquartersFuel + unitsFuel;
  }

  function renderTimerPanel(owner: PlayerId) {
    const timer = battle.timers?.[owner];
    const pvpTimeLeftMs =
      pvpTimer.activePlayer === owner ? pvpTimer.remainingMs : null;
    const displayedTimeLeftMs =
      mode === "pvp" ? pvpTimeLeftMs : timer?.stepTimeLeftMs ?? null;

    if (displayedTimeLeftMs === null) {
      return mode === "pvp" ? <div style={styles.timerPanelPlaceholder} /> : null;
    }

    const active =
      mode === "pvp" ? pvpTimer.activePlayer === owner : battle.activePlayer === owner;
    const isLocalPlayer = owner === humanPlayerId;
    const showPlayerReminder = isLocalPlayer && active;

    return (
      <BattleTimerPanel
        active={active}
        showPlayerReminder={showPlayerReminder}
        timeLeftMs={displayedTimeLeftMs}
      />
    );
  }

  function renderStartRollOverlay() {
    return (
      <AnimatePresence>
        {visibleStartRollState.visible && (
          <motion.div
            style={styles.startRollOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div style={styles.startRollPanel}>
              <div style={styles.startRollCenterGroup}>
                <div style={styles.startRollText}>Определяем первый ход</div>

                <motion.img
                  src={cartridgeImage}
                  alt="Жеребьёвка первого хода"
                  style={styles.startRollCartridge}
                  initial={{ rotate: 0, scale: 0.9 }}
                  animate={{
                    rotate: visibleStartRollState.finalRotation,
                    scale: 1,
                  }}
                  transition={{
                    duration: START_ROLL_DURATION_MS / 1000,
                    ease: [0.08, 0.82, 0.18, 1],
                  }}
                />

                {visibleStartRollState.resultVisible &&
                  visibleStartRollState.winner && (
                    <motion.div
                      style={{
                        ...styles.startRollResult,
                        ...(visibleStartRollWinnerIsLocal
                          ? styles.startRollResultPlayer
                          : styles.startRollResultBot),
                      }}
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.25 }}
                    >
                      {getStartRollResultText(visibleStartRollState.winner)}
                    </motion.div>
                  )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

function renderEnemyDeckWithTimer() {
  return (
    <div style={styles.enemyDeckWithTimer}>
      <div style={styles.enemyDeckRow}>
      <div
  ref={(element) => {
    deckRefs.current[opponentPlayerId] = element;
  }}
  style={styles.enemyDeckCompact}
>
        <DeckStack
          cardCount={getDeckCount(opponentPlayerId)}
          countPosition="right"
        />
      </div>
      {renderHeadquartersAvatar(opponentPlayerId, "enemy")}
      </div>

      <div style={styles.enemyControlStack}>
        {renderTimerPanel(opponentPlayerId)}

        <FuelPanel
          ownerId={getVisualOwnerId(opponentPlayerId)}
          currentFuel={battle[opponentPlayerId].resources}
          nextTurnFuel={getNextTurnFuel(opponentPlayerId)}
        />

        <button
          className={
            tutorialHighlights?.endTurn ? "tutorial-highlight-pulse" : undefined
          }
          style={{
            ...styles.endTurnButton,
            opacity: debugPaused || !isHumanTurn ? 0.45 : 1,
            ...(tutorialHighlights
              ? tutorialHighlights.endTurn
                ? styles.tutorialHighlight
                : styles.tutorialDimmedControl
              : {}),
          }}
          disabled={debugPaused || !isHumanTurn}
          onClick={() => enqueueBattleCommand(executeQueuedEndTurn)}
        >
          Конец хода
        </button>
      </div>
    </div>
  );
}

  function renderSupportLine(owner: PlayerId) {
    const selectedCard = selectedCardInstanceId
      ? battle[humanPlayerId].hand.find(
          (card) => card.instanceId === selectedCardInstanceId
        )
      : null;
    const selectedCardDefinition =
      selectedCard && !isHiddenCardInstance(selectedCard)
        ? getCard(selectedCard.cardId)
        : null;
    const placingSupport =
      owner === humanPlayerId &&
      selectedCardDefinition?.deploymentZone === "support";
    const freeSlots = placingSupport
      ? getFreeSupportSlots(battle as BattleState, owner)
      : [];

    return (
      <div
        style={{
          ...styles.supportLine,
          ...(owner === humanPlayerId
            ? styles.supportLineFriendly
            : styles.supportLineEnemy),
        }}
      >
        <span style={styles.supportLineLabel}>ТЫЛ</span>

        {SUPPORT_SLOTS.map((supportSlot) => {
          const unit = battle.units.find(
            (item) =>
              item.ownerId === owner &&
              isSupportUnit(item) &&
              item.supportSlot === supportSlot
          );
          const canPlace = freeSlots.includes(supportSlot);

          const card = unit ? getCard(unit.cardId) : null;
          const canBeTarget = unit ? isTarget("unit", unit.instanceId) : false;
          const isAttacking = unit ? attackingId === unit.instanceId : false;
          const hitReaction =
            unit && hitReactionEffect?.targetId === unit.instanceId
              ? hitReactionEffect
              : null;

          return (
            <motion.button
              key={`${owner}-support-${supportSlot}`}
              ref={setSupportCellRef(owner, supportSlot)}
              type="button"
              className={
                tutorialHighlights && unit && isTutorialUnitHighlighted(unit)
                  ? "tutorial-highlight-pulse"
                  : undefined
              }
              style={{
                ...styles.supportCell,
                ...(unit ? styles.supportUnitCell : {}),
                ...(canPlace ? styles.supportCellAvailable : {}),
                ...(canBeTarget ? styles.targetCell : {}),
                ...(tutorialHighlights
                  ? unit && isTutorialUnitHighlighted(unit)
                    ? styles.tutorialHighlight
                    : styles.tutorialDimmedBoard
                  : {}),
              }}
              onMouseEnter={() => {
                if (!unit || !canBeTarget) return;

                setHoveredAttackTarget({
                  type: "unit",
                  id: unit.instanceId,
                });
              }}
              onMouseLeave={() => {
                if (!unit) return;

                setHoveredAttackTarget((current) =>
                  current?.id === unit.instanceId ? null : current
                );
              }}
              onMouseDown={preventPersistentBattleFocus}
              onContextMenu={(event) => {
                if (!unit) return;

                openCardPreview(event, {
                  type: "unit",
                  cardId: unit.cardId,
                  ownerId: unit.ownerId,
                  currentHp: unit.currentHp,
                });
              }}
              {...(unit
                ? longPressPreviewHandlers({
                    type: "unit",
                    cardId: unit.cardId,
                    ownerId: unit.ownerId,
                    currentHp: unit.currentHp,
                  })
                : {})}
              onClick={() => {
                if (unit && canBeTarget) {
                  void handleAttackTarget("unit", unit.instanceId);
                  return;
                }

                handleSupportSlotClick(owner, supportSlot);
              }}
              aria-label={`Тыловая ячейка ${supportSlot + 1}`}
            >
              <motion.span
                aria-hidden="true"
                style={styles.supportCellSurface}
                animate={
                  canPlace
                    ? {
                        background: [
                          "linear-gradient(135deg, rgba(52, 84, 56, 0.5), rgba(17, 27, 18, 0.42))",
                          "linear-gradient(135deg, rgba(68, 110, 70, 0.6), rgba(22, 38, 23, 0.5))",
                          "linear-gradient(135deg, rgba(52, 84, 56, 0.5), rgba(17, 27, 18, 0.42))",
                        ],
                      }
                    : {
                        background:
                          "linear-gradient(135deg, rgba(50, 58, 52, 0.5), rgba(17, 21, 18, 0.42))",
                      }
                }
                transition={{
                  duration: 2.5,
                  ease: "easeInOut",
                  repeat: canPlace ? Infinity : 0,
                }}
              />

              <AnimatePresence initial={false}>
                {unit && card && (
                  <motion.div
                    key={unit.instanceId}
                    ref={setObjectRef(objectRefs, unit.instanceId)}
                    style={{
                      ...styles.boardCardContent,
                      ...styles.supportCardContent,
                    }}
                    initial={{ opacity: 0, scale: 0.82 }}
                    animate={{
                      opacity: hiddenDestroyedObjectIds.has(unit.instanceId)
                        ? 0
                        : 1,
                      scale: 1,
                      x: isAttacking
                        ? [0, 8, -5, 0]
                        : hitReaction
                          ? [0, hitReaction.x, -hitReaction.x * 0.32, 0]
                          : 0,
                      y: hitReaction
                        ? [0, hitReaction.y, -hitReaction.y * 0.32, 0]
                        : 0,
                    }}
                    exit={{ opacity: 0, scale: 0.72 }}
                    transition={
                      hitReaction
                        ? { duration: 0.34, ease: "easeOut" }
                        : {
                            type: "spring",
                            stiffness: 320,
                            damping: 26,
                          }
                    }
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <TankCardView
                      card={card}
                      variant="board"
                      ownerId={getVisualOwnerId(unit.ownerId)}
                      currentHp={unit.currentHp}
                      borderlessBoard
                      alreadyMoved
                      alreadyAttacked
                      suppressExhaustedDim
                      healthDamageEffect={getHealthDamageEffect(
                        unit.instanceId
                      )}
                      healthGainEffect={getHealthGainEffect(unit.instanceId)}
                      healthPreviewValue={combatForecast.get(unit.instanceId)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {canBeTarget && <AttackTargetGlow />}
            </motion.button>
          );
        })}
      </div>
    );
  }

  const pvpStartRollState =
    mode === "pvp" && firstTurnRoll?.visible && firstTurnRoll.firstPlayer
      ? {
          visible: true,
          winner: firstTurnRoll.firstPlayer,
          finalRotation: getStartRollFinalRotationForViewer(
            firstTurnRoll.firstPlayer
          ),
          resultVisible: firstTurnRoll.resultVisible,
        }
      : null;

  const visibleStartRollState = pvpStartRollState ?? startRollState;
  const visibleStartRollWinnerIsLocal =
    visibleStartRollState.winner === humanPlayerId;

  useEffect(() => {
    if (!visibleStartRollState.visible) return;

    return playRotatingCartridgeSound(START_ROLL_DURATION_MS);
  }, [visibleStartRollState.visible, visibleStartRollState.finalRotation]);

  const localHand = getVisibleHand(humanPlayerId);
  const selectedHandCard = selectedCardInstanceId
    ? battle[humanPlayerId].hand.find(
        (card) => card.instanceId === selectedCardInstanceId
      )
    : null;
  const selectedHandCardDefinition =
    selectedHandCard && !isHiddenCardInstance(selectedHandCard)
      ? getCard(selectedHandCard.cardId)
      : null;
  const placingBattlefieldCard =
    battle.status === "active" &&
    battle.activePlayer === humanPlayerId &&
    selectedHandCardDefinition !== null &&
    selectedHandCardDefinition.deploymentZone !== "support";
  const battleBackground = getBattleBackgroundAsset(battle.backgroundId);
  const resultRestartLabel = "В меню";
  const handleResultRestart =
    mode === "pvp"
      ? leavePvpMatch
      : mode === "campaign"
        ? reset
        : exitBattleToMenu;

  return (
    <div style={styles.page}>
      {/* Painted full-viewport behind the stage so the battlefield art fills the
          letterbox margins instead of leaving black bars. */}
      <StageBackground
        color={battleBackground.color}
        image={`linear-gradient(180deg, rgba(0, 0, 0, 0.28) 0%, rgba(0, 0, 0, 0.52) 100%), url(${battleBackground.image})`}
      />
      <div style={styles.vignette} />

      <AnimatePresence>
        {debugPaused && (
          <motion.div
            style={styles.debugPauseBadge}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            ПАУЗА
          </motion.div>
        )}
      </AnimatePresence>
        <AnimatePresence>
  {drawCardEffects.map((effect) => (
    <motion.div
      key={effect.id}
      style={{
        ...styles.drawCardEffect,
        backgroundImage: `url(${cardBackImage})`,
      }}
      initial={{
        x: effect.from.x,
        y: effect.from.y,
        opacity: 0,
        scale: 0.48,
        rotate: effect.owner === humanPlayerId ? -8 : 8,
      }}
      animate={{
        x: effect.to.x,
        y: effect.to.y,
        opacity: [0, 1, 1, 0],
        scale: [0.48, 0.78, 0.9, 0.86],
        rotate: effect.owner === humanPlayerId ? [ -8, 2, 0 ] : [8, -2, 0],
      }}
      exit={{ opacity: 0 }}
      transition={{
  duration: DRAW_CARD_ANIMATION_MS / 1000,
  ease: "easeOut",
}}
    />
  ))}
</AnimatePresence>
        <AnimatePresence>
  {spawnCardEffects.map((effect) => {
    const card = getCard(effect.cardId);

    if (effect.owner !== humanPlayerId) {
      return (
        <motion.div
          key={effect.id}
          style={{
            ...styles.spawnCardBackEffect,
            backgroundImage: `url(${cardBackImage})`,
          }}
          initial={{
            x: effect.from.x,
            y: effect.from.y,
            opacity: 0.95,
            scale: 0.72,
            rotate: 4,
          }}
          animate={{
            x: effect.to.x,
            y: effect.to.y,
            opacity: [0.95, 1, 1, 0],
            scale: [0.72, 0.76, 0.58],
            rotate: [4, -2, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration: SPAWN_CARD_ANIMATION_MS / 1000,
            ease: "easeOut",
          }}
        />
      );
    }

    return (
      <motion.div
        key={effect.id}
        style={styles.spawnCardEffect}
        initial={{
          x: effect.from.x,
          y: effect.from.y,
          opacity: 0.95,
          scale: 1,
          rotate: -4,
        }}
        animate={{
          x: effect.to.x,
          y: effect.to.y,
          opacity: [0.95, 1, 1, 0],
          scale: [1, 0.82, 0.58],
          rotate: [-4, 2, 0],
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: SPAWN_CARD_ANIMATION_MS / 1000,
          ease: "easeOut",
        }}
      >
        <HandCardView card={card} ownerId={getVisualOwnerId(effect.owner)} />
      </motion.div>
    );
  })}
</AnimatePresence>
      <AnimatePresence>
        {destroyedCardEffects.map((effect) => (
          <motion.img
            key={effect.id}
            src={burntCardImage}
            alt=""
            style={{
              ...styles.destroyedCardEffect,
              left: effect.from.x,
              top: effect.from.y,
              width: effect.width,
              height: effect.height,
              marginLeft: -effect.width / 2,
              marginTop: -effect.height / 2,
            }}
            initial={{
              x: 0,
              y: 0,
              opacity: 0,
              scale: 1.04,
              rotate: 0,
            }}
            animate={{
              x: [0, 0, (effect.to.x - effect.from.x) * 0.16, effect.to.x - effect.from.x],
              y: [0, 0, (effect.to.y - effect.from.y) * 0.16, effect.to.y - effect.from.y],
              opacity: [0, 1, 0.96, 0],
              scale: [1.04, 1, 0.7, 0.24],
              rotate: [0, -2, effect.rotation * 0.45, effect.rotation],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: DESTROYED_CARD_ANIMATION_MS / 1000,
              times: [0, 0.2, 0.54, 1],
              ease: "easeInOut",
            }}
            draggable={false}
          />
        ))}
      </AnimatePresence>
      <main style={styles.gameTable}>
        <section style={styles.enemyZone}>
  <div style={styles.enemyDeckArea} />

  <div
  ref={(element) => {
    handRefs.current[opponentPlayerId] = element;
  }}
  style={styles.enemyHand}
>
  <div style={styles.enemyHandClip}>
    <div style={styles.enemyHandCardMask}>
      <AnimatePresence initial={false}>
        {battle[opponentPlayerId].hand.map((cardInstance, index) => {
          const isHidden =
            hiddenDrawnCardIds.has(cardInstance.instanceId) ||
            isNewlyDrawnCard(opponentPlayerId, cardInstance.instanceId) ||
            hiddenSpawningCardIds.has(cardInstance.instanceId);
          const handCenter = (battle[opponentPlayerId].hand.length - 1) / 2;
          const rotation = (index - handCenter) * 2.4;
          const isPulledCard = visibleOpponentPulledCardIndex === index;

          return (
            <motion.div
              key={`bot-hand-${cardInstance.instanceId}`}
              ref={setHandCardRef(opponentPlayerId, cardInstance.instanceId)}
              layout={mode === "pvp" ? false : "position"}
              layoutDependency={battle[opponentPlayerId].hand.length}
              style={{
                ...styles.cardBack,
                ...styles.enemyHandCard,
                backgroundImage: `url(${cardBackImage})`,
                marginLeft: index === 0 ? 0 : -48,
                opacity: isHidden ? 0 : 1,
                zIndex: index + 1,
                filter: isPulledCard ? "brightness(1.08)" : "none",
                boxShadow: isPulledCard ? "none" : styles.cardBack.boxShadow,
              }}
              initial={{
                opacity: 0,
                y: -10,
                rotate: rotation,
                scale: 1,
              }}
              animate={{
                opacity: isHidden ? 0 : 1,
                y: isPulledCard ? 31 : 0,
                rotate: isPulledCard ? rotation * 0.55 : rotation,
                scale: isPulledCard ? 1.045 : 1,
              }}
              exit={{
                opacity: 0,
                y: -10,
                rotate: rotation,
                scale: 1,
              }}
              transition={{
                ...HAND_LAYOUT_TRANSITION,
                type: "spring",
                stiffness: 280,
                damping: 24,
              }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  </div>
</div>

          <div style={styles.enemyInfo} />
        </section>

        <section style={styles.centerBattleArea}>
         <aside style={styles.leftCommandPanel}>
  {renderTimerPanel(humanPlayerId)}

  <FuelPanel
    ownerId={getVisualOwnerId(humanPlayerId)}
    currentFuel={battle[humanPlayerId].resources}
    nextTurnFuel={getNextTurnFuel(humanPlayerId)}
  />

  <div style={styles.playerDeckBottom}>
    <div
  ref={(element) => {
    deckRefs.current[humanPlayerId] = element;
  }}
  style={styles.playerDeckOnly}
>
  <DeckStack cardCount={getDeckCount(humanPlayerId)} />
</div>
  </div>

  {renderHeadquartersAvatar(humanPlayerId, "player")}
</aside>

          <section style={styles.boardShell}>
            <div style={styles.boardGlow} />

      <AnimatePresence>
  {visibleStartRollState.visible && (
    <motion.div
      style={styles.startRollLegacyOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div style={styles.startRollPanel}>
        <div style={styles.startRollCenterGroup}>
          <div style={styles.startRollText}>Определяем первый ход</div>

          <motion.img
            src={cartridgeImage}
            alt="Жеребьевка первого хода"
            style={styles.startRollCartridge}
            initial={{ rotate: 0, scale: 0.9 }}
            animate={{
              rotate: visibleStartRollState.finalRotation,
              scale: 1,
            }}
            transition={{
              duration: START_ROLL_DURATION_MS / 1000,
              ease: [0.08, 0.82, 0.18, 1],
            }}
          />

          {visibleStartRollState.resultVisible && visibleStartRollState.winner && (
            <motion.div
              style={{
                ...styles.startRollResult,
                ...(visibleStartRollWinnerIsLocal
                  ? styles.startRollResultPlayer
                  : styles.startRollResultBot),
              }}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              {getStartRollResultText(visibleStartRollState.winner)}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>


            <AnimatePresence>
  {turnBannerText && (
    <motion.div
      style={{
        ...styles.turnBanner,
        ...(turnBannerText === "ХОД ВРАГА" ? styles.enemyTurnBanner : {}),
      }}
      initial={{ opacity: 0, scale: 0.72, y: 20 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.72, 1.08, 1, 0.96],
        y: [20, 0, 0, -16],
      }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 1.3, ease: "easeOut" }}
    >
      {turnBannerText}
    </motion.div>
  )}
</AnimatePresence>

            {renderSupportLine(humanPlayerId)}
            {renderSupportLine(opponentPlayerId)}

            <motion.div ref={boardRef} layout style={styles.board}>
              {renderStartRollOverlay()}

              <AnimatePresence>
                {movementArrowEffect &&
                  (() => {
                    const dx =
                      movementArrowEffect.to.x - movementArrowEffect.from.x;
                    const dy =
                      movementArrowEffect.to.y - movementArrowEffect.from.y;
                    const length = Math.max(1, Math.hypot(dx, dy));
                    const rotationDegrees =
                      (Math.atan2(dy, dx) * 180) / Math.PI;
                    const isFollowing =
                      movementArrowEffect.phase === "following";

                    return (
                      <div
                        key={movementArrowEffect.id}
                        style={{
                          ...styles.tacticalArrowWrap,
                          left: movementArrowEffect.from.x,
                          top: movementArrowEffect.from.y,
                          width: length,
                          transform: `rotate(${rotationDegrees}deg)`,
                        }}
                      >
                        <motion.img
                          src={movementArrowImage}
                          alt=""
                          style={{
                            ...styles.tacticalArrowImage,
                            filter:
                              movementArrowEffect.owner === humanPlayerId
                                ? styles.tacticalArrowFriendly.filter
                                : styles.tacticalArrowEnemy.filter,
                          }}
                          initial={{
                            opacity: 0,
                            scaleX: 0.04,
                            clipPath: "inset(0 0 0 0%)",
                          }}
                          animate={
                            isFollowing
                              ? {
                                  opacity: [0.38, 0.28, 0],
                                  scaleX: 1,
                                  clipPath: [
                                    "inset(0 0 0 0%)",
                                    "inset(0 0 0 54%)",
                                    "inset(0 0 0 100%)",
                                  ],
                                }
                              : {
                                  opacity: [0, 0.4, 0.38],
                                  scaleX: [0.04, 0.76, 1],
                                  clipPath: "inset(0 0 0 0%)",
                                }
                          }
                          exit={{ opacity: 0 }}
                          transition={{
                            duration:
                              (isFollowing
                                ? MOVE_ARROW_FOLLOW_MS
                                : MOVE_ARROW_LEAD_MS) / 1000,
                            ease: "easeOut",
                          }}
                          draggable={false}
                        />
                      </div>
                    );
                  })()}
              </AnimatePresence>

              <AnimatePresence>
                {movementUnitEffect && (
                  (() => {
                    const fromX =
                      movementUnitEffect.from.x - movementUnitEffect.width / 2;
                    const fromY =
                      movementUnitEffect.from.y - movementUnitEffect.height / 2;
                    const toX =
                      movementUnitEffect.to.x - movementUnitEffect.width / 2;
                    const toY =
                      movementUnitEffect.to.y - movementUnitEffect.height / 2;
                    const waiting = movementUnitEffect.phase === "waiting";

                    return (
                      <motion.div
                        key={movementUnitEffect.id}
                        style={{
                          ...styles.movingUnitEffect,
                          width: movementUnitEffect.width,
                          height: movementUnitEffect.height,
                        }}
                        initial={{
                          x: fromX,
                          y: fromY,
                          opacity: 1,
                        }}
                        animate={{
                          x: waiting ? fromX : toX,
                          y: waiting ? fromY : toY,
                          opacity: 1,
                        }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: waiting ? 0 : MOVE_ARROW_FOLLOW_MS / 1000,
                          ease: "easeInOut",
                        }}
                      >
                        <div style={styles.movingUnitCard}>
                          <TankCardView
                            card={getCard(movementUnitEffect.cardId)}
                            variant="board"
                            ownerId={getVisualOwnerId(movementUnitEffect.owner)}
                            currentHp={movementUnitEffect.currentHp}
                            alreadyMoved={movementUnitEffect.alreadyMoved}
                            alreadyAttacked={movementUnitEffect.alreadyAttacked}
                          />
                        </div>
                      </motion.div>
                    );
                  })()
                )}
              </AnimatePresence>

              <AnimatePresence>
                {projectileEffect && (
                  <motion.img
                    key={projectileEffect.id}
                    src={apShellImage}
                    alt=""
                    style={{
                      ...styles.projectileImage,
                      left: projectileEffect.from.x,
                      top: projectileEffect.from.y,
                      rotate: `${Math.atan2(
                        projectileEffect.to.y - projectileEffect.from.y,
                        projectileEffect.to.x - projectileEffect.from.x
                      )}rad`,
                    }}
                    initial={{
                      x: 0,
                      y: 0,
                      opacity: 0,
                      scale: 0.22,
                    }}
                    animate={{
                      x: projectileEffect.to.x - projectileEffect.from.x,
                      y: projectileEffect.to.y - projectileEffect.from.y,
                      opacity: [0, 1, 1, 0],
                      scale: [0.22, 0.28, 0.28, 0.22],
                    }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.34,
                      ease: "easeOut",
                    }}
                  />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {explosionEffect && (
                  <motion.div
                    key={explosionEffect.id}
                    style={{
                      ...styles.explosionContainer,
                      left: explosionEffect.position.x,
                      top: explosionEffect.position.y,
                    }}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.img
                      src={explosionFlashImage}
                      alt=""
                      style={styles.explosionFlash}
                      initial={{ opacity: 0, scale: 0.15, rotate: 0 }}
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0.15, 1.15, 1.7],
                        rotate: [0, 8, -4],
                      }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    />

                    <motion.img
                      src={explosionFireballImage}
                      alt=""
                      style={styles.explosionFireball}
                      initial={{ opacity: 0, scale: 0.25, rotate: -6 }}
                      animate={{
                        opacity: [0, 1, 0.9, 0],
                        scale: [0.25, 1.05, 1.35, 1.55],
                        rotate: [-6, 4, -2, 0],
                      }}
                      transition={{
                        duration: 0.52,
                        ease: "easeOut",
                        delay: 0.06,
                      }}
                    />

                    <motion.img
                      src={explosionSmokeImage}
                      alt=""
                      style={styles.explosionSmoke}
                      initial={{ opacity: 0, scale: 0.35, y: 4 }}
                      animate={{
                        opacity: [0, 0.55, 0.35, 0],
                        scale: [0.35, 1.1, 1.45, 1.85],
                        y: [4, -2, -8, -14],
                      }}
                      transition={{
                        duration: 0.95,
                        ease: "easeOut",
                        delay: 0.12,
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {visualRows.map((row) => visualCols.map((col) => {
                  const position: Position = { row, col };

                  const unit = battle.units.find((item) =>
                    isBattlefieldUnit(item) && samePosition(item.position, position)
                  );

                  const isPlayerHq = samePosition(
                    battle.headquarters.player.position,
                    position
                  );

                  const isBotHq = samePosition(
                    battle.headquarters.bot.position,
                    position
                  );

                  const playerSpawn = isPlayerSpawn(position);
                  const botSpawn = isBotSpawn(position);
                  const ownSpawn =
                    humanPlayerId === "player" ? playerSpawn : botSpawn;
                  const enemySpawn =
                    humanPlayerId === "player" ? botSpawn : playerSpawn;

                  if (unit) {
                    const card = getCard(unit.cardId);
                    const canBeTarget = isTarget("unit", unit.instanceId);
                    const isAttacking = attackingId === unit.instanceId;
                    const hitReaction =
                      hitReactionEffect?.targetId === unit.instanceId
                        ? hitReactionEffect
                        : null;
                    const isSelected =
                      selectedAttacker?.type === "unit" &&
                      selectedAttacker.id === unit.instanceId;
                    const isMovingUnitHidden = hiddenMovingUnitIds.has(
                      unit.instanceId
                    );

                    return (
                      <motion.button
                        type="button"
                        ref={setObjectRef(objectRefs, unit.instanceId)}
                        key={unit.instanceId}
                        className={
                          tutorialHighlights && isTutorialUnitHighlighted(unit)
                            ? "tutorial-highlight-pulse"
                            : undefined
                        }
                        style={{
                          ...styles.cell,
                          zIndex: 6,
                          ...(ownSpawn ? styles.spawnCell : {}),
                          ...(enemySpawn ? styles.botSpawnCell : {}),
                          ...styles.occupiedCell,
                          ...(unit.ownerId === humanPlayerId
                            ? styles.playerUnit
                            : styles.botUnit),
                          ...(canBeTarget ? styles.targetCell : {}),
                          ...(isSelected ? styles.selectedUnitCell : {}),
                          ...(tutorialHighlights
                            ? isTutorialUnitHighlighted(unit)
                              ? styles.tutorialHighlight
                              : styles.tutorialDimmedBoard
                            : {}),
                        }}
                        initial={{ scale: 0.88, opacity: 0 }}
                        animate={{
                          scale: 1,
                          opacity: 1,
                          x: isAttacking
                            ? [0, 10, -6, 0]
                            : hitReaction
                              ? [0, hitReaction.x, -hitReaction.x * 0.32, 0]
                              : 0,
                          y: hitReaction
                            ? [0, hitReaction.y, -hitReaction.y * 0.32, 0]
                            : 0,
                        }}
                        exit={{ scale: 0.75, opacity: 0 }}
                        transition={
                          hitReaction
                            ? { duration: 0.34, ease: "easeOut" }
                            : {
                                type: "spring",
                                stiffness: 320,
                                damping: 26,
                              }
                        }
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onMouseEnter={() => {
                          if (!canBeTarget) return;

                          setHoveredAttackTarget({
                            type: "unit",
                            id: unit.instanceId,
                          });
                        }}
                        onMouseLeave={() => {
                          setHoveredAttackTarget((current) =>
                            current?.id === unit.instanceId ? null : current
                          );
                        }}
                        onMouseDown={preventPersistentBattleFocus}
                        onContextMenu={(event) =>
                          openCardPreview(event, {
                            type: "unit",
                            cardId: unit.cardId,
                            ownerId: unit.ownerId,
                            currentHp: unit.currentHp,
                          })
                        }
                        {...longPressPreviewHandlers({
                          type: "unit",
                          cardId: unit.cardId,
                          ownerId: unit.ownerId,
                          currentHp: unit.currentHp,
                        })}
                        onClick={() => {
                          if (debugPaused) return;
                          if (battle.status !== "active") return;
                          if (battle.activePlayer !== humanPlayerId) return;

                          if (selectedAttacker?.type === "headquarters") {
                            selectAttacker(null);
                          }

                          if (canBeTarget) {
                            void handleAttackTarget("unit", unit.instanceId);
                            return;
                          }

                          if (unit.ownerId === humanPlayerId) {
                            selectAttacker({
                              type: "unit",
                              id: unit.instanceId,
                            });
                          }
                        }}
                      >
                        {ownSpawn || enemySpawn ? (
                          <span
                            style={{
                              ...styles.occupiedSpawnCellTint,
                              ...(ownSpawn
                                ? styles.occupiedFriendlySpawnCellTint
                                : styles.occupiedEnemySpawnCellTint),
                            }}
                          />
                        ) : null}

                        <motion.div
                          style={styles.boardCardContent}
                          animate={{
                            opacity: hiddenDestroyedObjectIds.has(
                              unit.instanceId
                            ) || isMovingUnitHidden
                              ? 0
                              : 1,
                          }}
                          transition={{ duration: isMovingUnitHidden ? 0 : 0.18 }}
                        >
                          <TankCardView
                            card={card}
                            variant="board"
                            ownerId={getVisualOwnerId(unit.ownerId)}
                            currentHp={unit.currentHp}
                            selected={isSelected}
                            alreadyMoved={unit.alreadyMoved}
                            alreadyAttacked={unit.alreadyAttacked}
                            healthDamageEffect={getHealthDamageEffect(
                              unit.instanceId
                            )}
                            healthGainEffect={getHealthGainEffect(
                              unit.instanceId
                            )}
                            healthPreviewValue={combatForecast.get(
                              unit.instanceId
                            )}
                          />

                          <AnimatePresence>
                            {attackEffectId === unit.instanceId && (
                              <motion.span
                                style={styles.explosionEffect}
                                initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                                animate={{
                                  opacity: [0, 1, 0.85, 0],
                                  scale: [0.2, 1.1, 1.6, 2.2],
                                  rotate: [0, 12, -8, 0],
                                }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.5 }}
                              />
                            )}
                          </AnimatePresence>
                        </motion.div>

                        {isSelected && <SelectedCombatObjectGlow />}
                        {canBeTarget && <AttackTargetGlow />}
                      </motion.button>
                    );
                  }

                  if (isPlayerHq || isBotHq) {
                    const owner = isPlayerHq ? "player" : "bot";
                    const hq = battle.headquarters[owner];
                    const hqId = `${owner}_hq`;
                    const canBeTarget = isTarget("headquarters", hqId);
                    const isAttacking = attackingId === hqId;
                    const hitReaction =
                      hitReactionEffect?.targetId === hqId
                        ? hitReactionEffect
                        : null;
                    const isSelected =
                      selectedAttacker?.type === "headquarters" &&
                      selectedAttacker.id === hqId;
                    return (
                      <motion.button
                        type="button"
                        ref={setObjectRef(objectRefs, hqId)}
                        layout
                        layoutId={hqId}
                        key={hqId}
                        className={
                          tutorialHighlights && isTutorialHqHighlighted(owner)
                            ? "tutorial-highlight-pulse"
                            : undefined
                        }
                        style={{
                          ...styles.cell,
                          zIndex: 6,
                          ...(ownSpawn ? styles.spawnCell : {}),
                          ...(enemySpawn ? styles.botSpawnCell : {}),
                          ...styles.occupiedCell,
                          ...(owner === humanPlayerId
                            ? styles.playerUnit
                            : styles.botUnit),
                          ...(canBeTarget ? styles.targetCell : {}),
                          ...(tutorialHighlights
                            ? isTutorialHqHighlighted(owner)
                              ? styles.tutorialHighlight
                              : styles.tutorialDimmedBoard
                            : {}),
                        }}
                        initial={{ scale: 0.88, opacity: 0 }}
                        animate={{
                          scale: 1,
                          opacity: 1,
                          x: isAttacking
                            ? [0, 10, -6, 0]
                            : hitReaction
                              ? [0, hitReaction.x, -hitReaction.x * 0.32, 0]
                              : 0,
                          y: hitReaction
                            ? [0, hitReaction.y, -hitReaction.y * 0.32, 0]
                            : 0,
                        }}
                        exit={{ scale: 0.75, opacity: 0 }}
                        transition={
                          hitReaction
                            ? { duration: 0.34, ease: "easeOut" }
                            : {
                                type: "spring",
                                stiffness: 320,
                                damping: 26,
                              }
                        }
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onMouseEnter={() => {
                          if (!canBeTarget) return;

                          setHoveredAttackTarget({
                            type: "headquarters",
                            id: hqId,
                          });
                        }}
                        onMouseLeave={() => {
                          setHoveredAttackTarget((current) =>
                            current?.id === hqId ? null : current
                          );
                        }}
                        onMouseDown={preventPersistentBattleFocus}
                        onContextMenu={(event) =>
                          openCardPreview(event, {
                            type: "headquarters",
                            ownerId: owner,
                            headquartersId: getHeadquartersIdForOwner(owner),
                            hp: hq.hp,
                            attack: getHeadquartersAttackValue(
                              battle as BattleState,
                              owner
                            ),
                            fuelGeneration: hq.fuelGeneration,
                          })
                        }
                        {...longPressPreviewHandlers({
                          type: "headquarters",
                          ownerId: owner,
                          headquartersId: getHeadquartersIdForOwner(owner),
                          hp: hq.hp,
                          attack: getHeadquartersAttackValue(
                            battle as BattleState,
                            owner
                          ),
                          fuelGeneration: hq.fuelGeneration,
                        })}
                        onClick={() => {
                          if (debugPaused) return;
                          if (battle.status !== "active") return;
                          if (battle.activePlayer !== humanPlayerId) return;

                          if (canBeTarget) {
                            void handleAttackTarget("headquarters", hqId);
                            return;
                          }

                          if (owner === humanPlayerId) {
                            // Toggle: clicking the HQ again while it is selected clears the selection
                            if (selectedAttacker?.type === "headquarters" &&
                                selectedAttacker.id === `${humanPlayerId}_hq`) {
                              selectAttacker(null);
                            } else {
                              selectAttacker({
                                type: "headquarters",
                                id: `${humanPlayerId}_hq`,
                              });
                            }
                          }
                        }}
                      >
                        {ownSpawn || enemySpawn ? (
                          <span
                            style={{
                              ...styles.occupiedSpawnCellTint,
                              ...(ownSpawn
                                ? styles.occupiedFriendlySpawnCellTint
                                : styles.occupiedEnemySpawnCellTint),
                            }}
                          />
                        ) : null}

                        <motion.div
                          style={styles.boardCardContent}
                          animate={{
                            opacity: hiddenDestroyedObjectIds.has(hqId) ? 0 : 1,
                          }}
                          transition={{ duration: 0.18 }}
                        >
                          <HeadquartersCardView
                            ownerId={getVisualOwnerId(owner)}
                            headquartersId={getHeadquartersIdForOwner(owner)}
                            hp={hq.hp}
                            attack={getHeadquartersAttackValue(
                              battle as BattleState,
                              owner
                            )}
                            fuelGeneration={hq.fuelGeneration}
                            alreadyAttacked={hq.alreadyAttacked}
                            healthDamageEffect={getHealthDamageEffect(hqId)}
                            healthGainEffect={getHealthGainEffect(hqId)}
                            attackChangeEffect={getAttackChangeEffect(hqId)}
                            healthPreviewValue={combatForecast.get(hqId)}
                          />

                          <AnimatePresence>
                            {attackEffectId === hqId && (
                              <motion.span
                                style={styles.explosionEffect}
                                initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                                animate={{
                                  opacity: [0, 1, 0.85, 0],
                                  scale: [0.2, 1.1, 1.6, 2.2],
                                  rotate: [0, 12, -8, 0],
                                }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.5 }}
                              />
                            )}
                          </AnimatePresence>
                        </motion.div>

                        {isSelected && <SelectedCombatObjectGlow />}
                        {canBeTarget && <AttackTargetGlow />}
                      </motion.button>
                    );
                  }

                  const moveCell =
                    isMoveCell(position) &&
                    (!tutorialRestrictsMove ||
                      isTutorialCellHighlighted(position));
                  const canPlaceBattlefieldCard =
                    placingBattlefieldCard && ownSpawn;

                  return (
  <motion.button
    type="button"
    ref={setCellRef(position)}
    layout
    key={`${row}-${col}`}
    className={
      tutorialHighlights && isTutorialCellHighlighted(position)
        ? "tutorial-highlight-pulse"
        : undefined
    }
    style={{
      ...styles.cell,
      ...styles.emptyCell,
      ...(moveCell ? styles.moveCell : {}),
      ...(canPlaceBattlefieldCard ? styles.spawnCellAvailable : {}),
      ...(tutorialHighlights
        ? isTutorialCellHighlighted(position)
          ? styles.tutorialHighlight
          : moveCell || canPlaceBattlefieldCard
            ? {}
            : styles.tutorialDimmedBoard
        : {}),
    }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.97 }}
    transition={{
      type: "spring",
      stiffness: 300,
      damping: 28,
    }}
    onMouseDown={preventPersistentBattleFocus}
    onClick={() => handleCellClick(position)}
    aria-label={`Клетка ${position.row}-${position.col}`}
  >
    {canPlaceBattlefieldCard && (
      <motion.span
        style={styles.spawnCellPulse}
        initial={{ opacity: 0.28, scale: 0.96 }}
        animate={{
          opacity: [0.18, 0.4, 0.24, 0.34, 0.18],
          scale: [0.98, 1, 0.99, 1, 0.98],
          background: [
            "rgba(74, 177, 91, 0.12)",
            "rgba(111, 228, 132, 0.24)",
            "rgba(77, 188, 99, 0.15)",
            "rgba(101, 217, 122, 0.2)",
            "rgba(74, 177, 91, 0.12)",
          ],
          boxShadow: [
            "inset 0 0 11px rgba(90, 214, 111, 0.1), 0 0 2px rgba(90, 214, 111, 0.06)",
            "inset 0 0 18px rgba(124, 246, 145, 0.22), 0 0 6px rgba(102, 226, 123, 0.13)",
            "inset 0 0 13px rgba(96, 220, 117, 0.14), 0 0 3px rgba(90, 214, 111, 0.08)",
            "inset 0 0 16px rgba(118, 238, 139, 0.18), 0 0 5px rgba(102, 226, 123, 0.11)",
            "inset 0 0 11px rgba(90, 214, 111, 0.1), 0 0 2px rgba(90, 214, 111, 0.06)",
          ],
        }}
        transition={{
          duration: 2.7,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
    )}

    {moveCell && (
      <motion.span
        style={styles.moveCellPulse}
        initial={{ opacity: 0.32, scale: 0.96 }}
        animate={{
          opacity: [0.22, 0.46, 0.28, 0.4, 0.22],
          scale: [0.98, 1, 0.99, 1, 0.98],
          background: [
            "rgba(74, 177, 91, 0.14)",
            "rgba(111, 228, 132, 0.28)",
            "rgba(77, 188, 99, 0.18)",
            "rgba(101, 217, 122, 0.24)",
            "rgba(74, 177, 91, 0.14)",
          ],
          boxShadow: [
            "inset 0 0 11px rgba(90, 214, 111, 0.12), 0 0 2px rgba(90, 214, 111, 0.08)",
            "inset 0 0 18px rgba(124, 246, 145, 0.26), 0 0 6px rgba(102, 226, 123, 0.16)",
            "inset 0 0 13px rgba(96, 220, 117, 0.16), 0 0 3px rgba(90, 214, 111, 0.1)",
            "inset 0 0 16px rgba(118, 238, 139, 0.22), 0 0 5px rgba(102, 226, 123, 0.14)",
            "inset 0 0 11px rgba(90, 214, 111, 0.12), 0 0 2px rgba(90, 214, 111, 0.08)",
          ],
        }}
        transition={{
          duration: 2.7,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
    )}
  </motion.button>
);
                })
              )}
            </motion.div>
          </section>

          <aside style={styles.rightCommandPanel}>
  <div style={styles.enemySideColumn}>
    {renderEnemyDeckWithTimer()}
  </div>

  <div style={styles.actionSideColumn}>
            {!tutorialActive && mode !== "pvp" ? (
              <button
                type="button"
                style={{
                  ...styles.pauseButton,
                  ...(debugPaused ? styles.pauseButtonActive : {}),
                }}
                onClick={() => setDebugPaused((current) => !current)}
              >
                {debugPaused ? "Продолжить" : "Пауза"}
              </button>
            ) : null}

            {mode === "pvp" && battle.status === "active" ? (
              <button
                type="button"
                style={styles.surrenderButton}
                onClick={handleSurrenderClick}
              >
                Сдаться
              </button>
            ) : null}

            {!tutorialActive && mode !== "pvp" ? (
              <button style={styles.secondaryButton} onClick={reset}>
                Новый бой
              </button>
            ) : null}

            {mode !== "pvp" ? (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={exitBattleToMenu}
              >
                В меню
              </button>
            ) : null}

            </div>
          </aside>
        </section>

        <section style={styles.playerZone}>
  

          <div style={styles.playerHandViewport}>
            <div
  ref={(element) => {
    handRefs.current[humanPlayerId] = element;
  }}
  style={styles.hand}
>
            <AnimatePresence initial={false}>
              {localHand.map((cardInstance, index) => {
                const card = getCard(cardInstance.cardId);
                const selected =
                  selectedCardInstanceId === cardInstance.instanceId;
                const isHiddenDrawnCard = hiddenDrawnCardIds.has(
                  cardInstance.instanceId
                ) || isNewlyDrawnCard(humanPlayerId, cardInstance.instanceId);
                const isHiddenSpawningCard = hiddenSpawningCardIds.has(
                  cardInstance.instanceId
                );
                const tutorialCardHighlighted = Boolean(
                  tutorialHighlights?.handCardIds?.includes(card.id)
                );
                const tutorialCardBlocked = Boolean(
                  tutorialHighlights && !tutorialCardHighlighted
                );

                return (
                  <motion.button
                    key={cardInstance.instanceId}
                    ref={setHandCardRef(humanPlayerId, cardInstance.instanceId)}
                    layout={mode === "pvp" ? false : "position"}
                    layoutDependency={localHand.length}
                    className={
                      tutorialCardHighlighted
                        ? "tutorial-highlight-pulse"
                        : undefined
                    }
                    style={{
                      ...styles.card,
                      marginLeft: getPlayerHandCardMarginLeft(
                        index,
                        localHand.length
                      ),
                      zIndex: selected ? 120 : index + 1,
                      pointerEvents:
                        isHiddenDrawnCard ||
                        isHiddenSpawningCard ||
                        tutorialCardBlocked
                          ? "none"
                          : "auto",
                      ...(tutorialCardHighlighted
                        ? styles.tutorialHighlight
                        : {}),
                      ...(tutorialCardBlocked ? styles.tutorialDimmedBoard : {}),
                    }}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{
                      opacity:
                        isHiddenDrawnCard || isHiddenSpawningCard ? 0 : 1,
                      y: 0,
                    }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{
                      ...HAND_LAYOUT_TRANSITION,
                      type: "spring",
                      stiffness: 280,
                      damping: 24,
                    }}
                    whileHover={{ y: -88, scale: 1.06 }}
                    whileTap={{ scale: 0.97 }}
                    aria-disabled={
                      debugPaused ||
                      battle.status !== "active" ||
                      battle.activePlayer !== humanPlayerId ||
                      Boolean(spawningCardInstanceId) ||
                      isHiddenDrawnCard ||
                      isHiddenSpawningCard
                    }
                    onContextMenu={(event) =>
                      openCardPreview(event, {
                        type: "unit",
                        cardId: card.id,
                        ownerId: humanPlayerId,
                      })
                    }
                    {...longPressPreviewHandlers({
                      type: "unit",
                      cardId: card.id,
                      ownerId: humanPlayerId,
                    })}
                    onClick={() => {
                      if (debugPaused) return;
                      if (battle.status !== "active") return;
                      if (battle.activePlayer !== humanPlayerId) return;
                      if (spawningCardInstanceId) return;
                      if (isHiddenDrawnCard || isHiddenSpawningCard) return;

                      selectCard(selected ? null : cardInstance.instanceId);
                    }}
                  >
                    <HandCardView
                      card={card}
                      ownerId={getVisualOwnerId(humanPlayerId)}
                      selected={selected}
                      disabled={
                        debugPaused ||
                        battle.activePlayer !== humanPlayerId ||
                        battle[humanPlayerId].resources < card.cost
                      }
                    />
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
          </div>
        </section>

      </main>

      {createPortal(
        <AnimatePresence>
          {cardPreview && (
            <motion.div
              style={styles.cardPreviewOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onMouseDown={closeCardPreview}
              onContextMenu={(event) => {
                event.preventDefault();
                closeCardPreview();
              }}
            >
              <motion.div
                style={styles.cardPreviewPanel}
                initial={{ opacity: 0, scale: 0.84, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 12 }}
                transition={{
                  type: "spring",
                  stiffness: 260,
                  damping: 24,
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                <button
                  type="button"
                  style={styles.cardPreviewClose}
                  onClick={closeCardPreview}
                  aria-label="Закрыть просмотр карты"
                >
                  ×
                </button>

                {cardPreview.type === "unit" ? (
                  <HandCardView
                    card={getCard(cardPreview.cardId)}
                    ownerId={getVisualOwnerId(cardPreview.ownerId)}
                    currentHp={cardPreview.currentHp}
                    displayMode="preview"
                  />
                ) : (
                  <HandCardView
                    ownerId={getVisualOwnerId(cardPreview.ownerId)}
                    headquartersId={cardPreview.headquartersId}
                    headquarters={{
                      hp: cardPreview.hp,
                      attack: cardPreview.attack,
                      fuelGeneration: cardPreview.fuelGeneration,
                    }}
                    displayMode="preview"
                  />
                )}

                <div style={styles.cardPreviewHint}>
                  ПКМ по фону или Esc — закрыть
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {tutorialActive && battle.status === "active" && tutorialStep ? (
        <TutorialOverlay
          kind={tutorialStep.kind}
          text={tutorialStep.text}
          visible={battle.activePlayer === "player" && !startRollState.visible}
          onNext={advanceTutorialStep}
        />
      ) : null}

      {tutorialActive &&
      battle.status === "player_won" &&
      !tutorialEpilogueSeen ? (
        <TutorialOverlay
          kind="dialogue"
          text={TUTORIAL_EPILOGUE_TEXT}
          visible
          onNext={completeTutorialEpilogue}
          nextLabel="К наградам"
        />
      ) : null}

      {(battle.status === "player_won" || battle.status === "bot_won") &&
        (!tutorialActive ||
          battle.status === "bot_won" ||
          tutorialEpilogueSeen) && (
          <ResultScreen
            battle={battle}
            onRestart={handleResultRestart}
            localPlayerId={humanPlayerId}
            matchEndReason={mode === "pvp" ? matchEndReason : null}
            restartLabel={resultRestartLabel}
            reward={battleReward}
            rewardStatus={rewardClaimStatus}
            rewardError={rewardClaimError}
            rewardSyncPending={rewardSyncPending}
            onRetryReward={() => void claimCurrentBattleReward()}
          />
        )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100cqh",
    position: "relative",
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    color: "#eef2f3",
    padding: 18,
    fontFamily: "var(--font-body)",
  },

  vignette: {
    display: "none",
  },

  debugPauseBadge: {
    position: "fixed",
    left: "50%",
    top: 16,
    zIndex: 650,
    transform: "translateX(-50%)",
    padding: "8px 18px",
    borderRadius: 999,
    background:
      "linear-gradient(180deg, rgba(26, 72, 35, 0.96), rgba(7, 17, 8, 0.92))",
    border: "1px solid rgba(125, 255, 138, 0.56)",
    color: "#7dff8a",
    fontSize: 15,
    fontWeight: 1000,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.9), 0 0 10px rgba(125,255,138,0.45)",
    boxShadow:
      "0 10px 28px rgba(0,0,0,0.45), 0 0 22px rgba(125,255,138,0.18)",
    pointerEvents: "none",
  },

  turnBanner: {
    position: "absolute",
    left: "35%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 500,
    color: "#7dff8a",
    fontSize: 54,
    fontWeight: 1000,
    letterSpacing: 4,
    textTransform: "uppercase",
    textShadow:
      "0 3px 0 rgba(0,0,0,0.95), 0 0 14px rgba(125,255,138,0.95), 0 0 34px rgba(125,255,138,0.65)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  },

  enemyTurnBanner: {
  color: "#ff4d4d",
  textShadow:
    "0 3px 0 rgba(0,0,0,0.95), 0 0 14px rgba(255,77,77,0.95), 0 0 34px rgba(255,77,77,0.65)",
},

  gameTable: {
  position: "relative",
  zIndex: 1,
  display: "grid",
  gridTemplateRows: "110px minmax(260px, auto) minmax(210px, auto)",
  gridTemplateColumns: "1fr",
  gap: 6,
  overflow: "visible",
},


  enemyDeckArea: {
    display: "flex",
    justifyContent: "flex-start",
  },

  enemyHand: {
  height: 96,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  overflow: "hidden",
  position: "relative",
  transform: "translateY(-18px)",
  zIndex: 20,
  background: "transparent",
  border: "none",
  boxShadow: "none",
},

startRollOverlay: {
  position: "absolute",
  inset: 0,
  zIndex: 4000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
},

startRollLegacyOverlay: {
  display: "none",
},

startRollPanel: {
  width: "100%",
  height: "100%",
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
},

startRollCenterGroup: {
  position: "relative",
  display: "grid",
  gridTemplateRows: "28px 140px 36px",
  alignItems: "center",
  justifyItems: "center",
  gap: 10,
},

startRollCartridge: {
  width: 220,
  height: "auto",
  gridRow: "2 / 3",
  filter:
    "drop-shadow(0 14px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 18px rgba(255,215,120,0.18))",
  transformOrigin: "50% 50%",
},

startRollText: {
  gridRow: "1 / 2",
  color: "#e6e0cf",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  textShadow: "0 2px 10px rgba(0,0,0,0.8)",
  whiteSpace: "nowrap",
},

startRollResult: {
  gridRow: "3 / 4",
  fontSize: 24,
  fontWeight: 1000,
  letterSpacing: 2,
  textTransform: "uppercase",
  textShadow: "0 2px 14px rgba(0,0,0,0.9)",
  whiteSpace: "nowrap",
},

startRollResultPlayer: {
  color: "#7dff8a",
},

startRollResultBot: {
  color: "#ff6b6b",
},

enemyHandClip: {
  height: 96,
  overflow: "hidden",
  position: "relative",
  width: "min(560px, calc(100cqw - 260px))",
  minWidth: 260,
  background: "transparent",
  border: "none",
  boxShadow: "none",
},

enemyHandCardMask: {
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  transform: "translateY(-78px)",
  paddingLeft: 58,
  paddingRight: 58,
},

enemyHandCard: {
  flex: "0 0 auto",
},

 enemyInfo: {
  justifySelf: "end",
  alignSelf: "start",
},

  centerBattleArea: {
  gridColumn: "1 / 2",
  display: "grid",
  gridTemplateColumns: "150px 1fr 300px",
  gap: 8,
  alignItems: "stretch",
  transform: "translateY(-62px)",
},

  leftCommandPanel: {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  justifyContent: "flex-start",
  alignSelf: "stretch",
  minHeight: 0,
  transform: "translateX(-22px)",
},

  rightCommandPanel: {
  display: "grid",
  gridTemplateColumns: "190px 96px",
  gap: 10,
  alignItems: "start",
  alignSelf: "start",
  zIndex: 10,
},

enemySideColumn: {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 8,
  transform: "translate(70px, -74px)",
  zIndex: 30,
},

actionSideColumn: {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-start",
  marginTop: 184,
  zIndex: 60,
},
  boardShell: {
    position: "relative",
    padding: 0,
    maxWidth: 720,
    justifySelf: "center",
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
  },
  boardGlow: {
    position: "absolute",
    inset: 0,
    borderRadius: 0,
    background: "transparent",
    pointerEvents: "none",
  },

  supportLine: {
    position: "absolute",
    top: "50%",
    zIndex: 12,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    transform: "translateY(calc(-50% - 85px))",
  },

  supportLineFriendly: {
    left: -111,
  },

  supportLineEnemy: {
    right: -111,
  },

  supportLineLabel: {
    alignSelf: "center",
    color: "rgba(228, 218, 184, 0.56)",
    fontFamily: "var(--font-display)",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.8,
    lineHeight: 1,
    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
    pointerEvents: "none",
  },

  supportCell: {
    position: "relative",
    width: 91,
    height: 91,
    padding: 0,
    overflow: "visible",
    borderRadius: 0,
    border: "none",
    outline: "none",
    appearance: "none",
    background: "transparent",
    boxShadow: "none",
    cursor: "pointer",
  },

  supportCellAvailable: {
    border: "none",
    background: "transparent",
  },

  supportUnitCell: {
    border: "none",
    background: "transparent",
    boxShadow: "none",
  },

  supportCellSurface: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(135deg, rgba(50, 58, 52, 0.5), rgba(17, 21, 18, 0.42))",
    boxShadow:
      "inset 0 0 18px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(238, 224, 184, 0.09)",
  },

 board: {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(120.5px, 1fr))",
  gap: 4,
  alignItems: "stretch",
},

  tacticalArrowWrap: {
    position: "absolute",
    zIndex: 4,
    height: 27,
    marginTop: -14,
    transformOrigin: "0 50%",
    pointerEvents: "none",
  },

  tacticalArrowImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "fill",
    transformOrigin: "0 50%",
    pointerEvents: "none",
  },

  tacticalArrowFriendly: {
    filter:
      "brightness(0) saturate(100%) invert(62%) sepia(48%) saturate(420%) hue-rotate(74deg) brightness(94%) contrast(82%) drop-shadow(1px 0 0 rgba(18, 35, 19, 0.58)) drop-shadow(-1px 0 0 rgba(18, 35, 19, 0.58)) drop-shadow(0 1px 0 rgba(18, 35, 19, 0.58)) drop-shadow(0 -1px 0 rgba(18, 35, 19, 0.58))",
  },

  tacticalArrowEnemy: {
    filter:
      "brightness(0) saturate(100%) invert(42%) sepia(60%) saturate(980%) hue-rotate(326deg) brightness(94%) contrast(82%) drop-shadow(1px 0 0 rgba(48, 17, 17, 0.58)) drop-shadow(-1px 0 0 rgba(48, 17, 17, 0.58)) drop-shadow(0 1px 0 rgba(48, 17, 17, 0.58)) drop-shadow(0 -1px 0 rgba(48, 17, 17, 0.58))",
  },

  movingUnitEffect: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 9,
    padding: 3,
    boxSizing: "border-box",
    pointerEvents: "none",
  },

  movingUnitCard: {
    width: "100%",
    height: "100%",
  },

  cell: {
  aspectRatio: "1 / 1",
  minHeight: 0,
  position: "relative",
  overflow: "visible",
  outline: "none",
  borderRadius: 0,
  border: "1px solid rgba(255,255,255,0.075)",
  background:
    "linear-gradient(135deg, rgba(17, 24, 26, 0.42), rgba(7, 9, 10, 0.34))",
  color: "#eef2f3",
  padding: 3,
  display: "flex",
  flexDirection: "column",
  gap: 0,
  alignItems: "stretch",
  justifyContent: "center",
  cursor: "pointer",
  textAlign: "left",
  boxShadow:
    "inset 0 0 0 1px rgba(255,255,255,0.014), inset 0 0 18px rgba(0,0,0,0.22)",
},

  boardCardContent: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 0,
    zIndex: 1,
  },

  supportCardContent: {
    pointerEvents: "none",
  },

  occupiedCell: {
  },

  emptyCell: {
  },

  occupiedSpawnCellTint: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  },

  occupiedFriendlySpawnCellTint: {
    background:
      "linear-gradient(135deg, rgba(35, 66, 36, 0.24), rgba(8, 13, 8, 0.36))",
  },

  occupiedEnemySpawnCellTint: {
    background:
      "linear-gradient(135deg, rgba(92, 32, 32, 0.22), rgba(23, 8, 8, 0.36))",
    boxShadow:
      "inset 0 0 0 1px rgba(255, 120, 100, 0.04), inset 0 0 18px rgba(120, 20, 20, 0.12)",
  },

  spawnCell: {
    background:
      "linear-gradient(135deg, rgba(35, 66, 36, 0.24), rgba(8, 13, 8, 0.36))",
  },

  spawnCellAvailable: {
    background:
      "linear-gradient(135deg, rgba(30, 70, 35, 0.28), rgba(8, 16, 9, 0.38))",
  },

  spawnCellPulse: {
    position: "absolute",
    inset: 3,
    zIndex: 2,
    borderRadius: 0,
    pointerEvents: "none",
  },

  botSpawnCell: {
  background:
    "linear-gradient(135deg, rgba(92, 32, 32, 0.22), rgba(23, 8, 8, 0.36))",
  boxShadow:
    "inset 0 0 0 1px rgba(255, 120, 100, 0.04), inset 0 0 18px rgba(120, 20, 20, 0.12)",
},

  moveCell: {
    background:
      "linear-gradient(135deg, rgba(24, 70, 31, 0.34), rgba(11, 23, 13, 0.48))",
  },

  moveCellPulse: {
    position: "absolute",
    inset: 3,
    zIndex: 2,
    borderRadius: 0,
    pointerEvents: "none",
  },

  playerUnit: {
    border: "1px solid rgba(255,255,255,0.12)",
  },

  botUnit: {
    border: "1px solid rgba(255,255,255,0.12)",
  },

  selectedUnitCell: {
    zIndex: 8,
  },

  selectedCombatObjectGlow: {
    position: "absolute",
    inset: 1,
    zIndex: 20,
    border: "1px solid rgba(235, 188, 77, 0.7)",
    borderRadius: 0,
    pointerEvents: "none",
  },

  attackTargetGlow: {
    position: "absolute",
    inset: 1,
    zIndex: 19,
    border: "1px solid rgba(207, 72, 61, 0.68)",
    borderRadius: 0,
    pointerEvents: "none",
  },

  hqCell: {
    padding: 3,
    background: "transparent",
    border: "1px solid rgba(225, 214, 184, 0.18)",
  },

  playerHq: {
    background: "transparent",
    border: "1px solid rgba(225, 214, 184, 0.22)",
  },

  botHq: {
    background: "transparent",
    border: "1px solid rgba(225, 214, 184, 0.22)",
  },

  selectedHqCell: {
    boxShadow: "0 0 0 3px rgba(247, 215, 116, 0.86)",
  },

  targetCell: {
    zIndex: 7,
  },

  // Tutorial: the element the player must interact with on the current step.
  tutorialHighlight: {
    boxShadow:
      "0 0 0 3px rgba(247, 215, 116, 0.9), 0 0 22px rgba(247, 215, 116, 0.5)",
  },

  // Tutorial: board elements outside the current step are dimmed.
  tutorialDimmedBoard: {
    filter: "brightness(0.5) saturate(0.6)",
  },

  // Tutorial: controls outside the current step (still clickable as fallback).
  tutorialDimmedControl: {
    opacity: 0.35,
    filter: "grayscale(0.5)",
  },

  playerZone: {
  gridColumn: "1 / 2",
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 14,
  alignItems: "end",
  padding: "6px 16px 0px",
  borderRadius: 0,
  background: "transparent",
  border: "none",
  boxShadow: "none",
  transform: "translateY(-233px)",
  overflow: "visible",
},

  timerPanelPlaceholder: {
    width: "100%",
    height: 82,
    pointerEvents: "none",
  },

  playerFuelBadge: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 14,
  background: "rgba(14, 17, 17, 0.78)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#d6a84f",
  fontSize: 13,
  fontWeight: 800,
},

 hand: {
  display: "flex",
  flexWrap: "nowrap",
  justifyContent: "center",
  alignItems: "flex-start",
  gap: 0,
  minHeight: 350,
  overflow: "visible",
  position: "relative",
  zIndex: 30,
},

  playerHandViewport: {
    width: "min(980px, calc(100cqw - 430px))",
    minWidth: 560,
    maxWidth: 980,
    margin: "0 auto",
    overflow: "visible",
    display: "flex",
    justifyContent: "center",
  },

  card: {
  flex: "0 0 175px",
  width: 175,
  maxWidth: 175,
  border: "none",
  background: "transparent",
  color: "#eef2f3",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  height: "auto",
  display: "flex",
  alignItems: "flex-start",
  overflow: "visible",
},

  deckPile: {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
  padding: 8,
  borderRadius: 12,
  background: "rgba(7, 9, 9, 0.62)",
  border: "1px solid rgba(255,255,255,0.08)",
},
  playerDeckBottom: {
    marginTop: 3,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 0,
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
  },
  playerDeckOnly: {
    minHeight: 132,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    transform: "translateZ(0)",
  },
  headquartersAvatar: {
    position: "relative",
    display: "block",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    filter:
      "drop-shadow(0 14px 20px rgba(0,0,0,0.72)) drop-shadow(0 0 10px rgba(232, 198, 112, 0.12))",
  },
  headquartersAvatarImage: {
    position: "relative",
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
  },
  headquartersAvatarFallbackImage: {
    width: "82%",
    height: "82%",
    margin: "auto",
    objectFit: "contain",
    filter:
      "drop-shadow(0 10px 18px rgba(0,0,0,0.78)) saturate(0.95) brightness(0.95)",
  },
  headquartersAvatarEmpty: {
    opacity: 0.42,
  },
  headquartersAvatarPlaceholder: {
    width: "82%",
    height: "82%",
    margin: "auto",
    background:
      "radial-gradient(circle at 50% 58%, rgba(236, 211, 135, 0.16), transparent 58%)",
    boxShadow: "inset 0 0 0 1px rgba(232, 198, 112, 0.08)",
  },
  playerHeadquartersAvatarImage: {
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
  },
  enemyHeadquartersAvatarImage: {
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  },
  playerHeadquartersAvatar: {
    alignSelf: "center",
    width: 164,
    height: 226,
    marginTop: -24,
  },
  enemyHeadquartersAvatar: {
    flex: "0 0 auto",
    width: 164,
    height: 226,
    marginTop: -35,
  },
  cardsLeftInfo: {
    display: "none",
  },
  enemyDeckWithTimer: {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 5,
},
  enemyDeckRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    gap: 10,
},
  enemyControlStack: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 5,
    transform: "translateX(-78px)",
    marginTop: -55,
  },
  enemyDeckCompact: {
    minHeight: 132,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 0,
    padding: 0,
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    transform: "translateY(1px)",
  },

  deckLabel: {
    fontSize: 11,
    opacity: 0.68,
    textTransform: "uppercase",
  },

  cardBack: {
    width: 104,
    height: 138,
    borderRadius: 12,
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    border: "none",
    boxShadow: "0 14px 34px rgba(0,0,0,0.52)",
  },

  hqPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 15,
    background: "rgba(10, 12, 12, 0.75)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 18px 44px rgba(0,0,0,0.36)",
  },

  playerHqPanel: {
    borderColor: "rgba(122, 162, 255, 0.34)",
  },

  botHqPanel: {
    borderColor: "rgba(255, 139, 122, 0.34)",
  },

  selectedHqPanel: {
    boxShadow:
      "0 0 0 3px rgba(247, 215, 116, 0.74), 0 18px 44px rgba(0,0,0,0.36)",
  },

  hqPanelLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    opacity: 0.64,
  },

  hqPanelTitle: {
    fontSize: 22,
    letterSpacing: 2,
  },

  hqStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    fontSize: 12,
  },

  smallInfoPanel: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    background: "rgba(7, 9, 9, 0.62)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  turnCounterPanel: {
  minHeight: 64,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  padding: "10px 12px",
  borderRadius: 16,
  background:
    "linear-gradient(180deg, rgba(55, 43, 22, 0.92), rgba(12, 10, 7, 0.86))",
  border: "1px solid rgba(247, 215, 116, 0.42)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.55), 0 12px 30px rgba(0,0,0,0.35), inset 0 0 18px rgba(247, 215, 116, 0.08)",
  color: "#f7d774",
  textTransform: "uppercase",
},

turnCounterLabel: {
  fontSize: 11,
  letterSpacing: 2,
  opacity: 0.78,
},

turnCounterValue: {
  fontSize: 34,
  lineHeight: 1,
  color: "#f7d774",
  textShadow:
    "0 2px 0 rgba(0,0,0,0.95), 0 0 14px rgba(247, 215, 116, 0.42)",
},

  endTurnButton: {
    alignSelf: "center",
    width: 86,
    height: 86,
    minHeight: 86,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#1d1207",
    padding: "8px 10px",
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 1,
    lineHeight: 1.12,
    textShadow: "0 1px 0 rgba(255,235,176,0.34)",
    boxShadow: "none",
  },

  secondaryButton: {
    width: 92,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `linear-gradient(180deg, rgba(145, 148, 143, 0.62), rgba(34, 37, 37, 0.78)), url(${buttonImage})`,
    backgroundSize: "100% 100%, 100% 100%",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundBlendMode: "color, normal",
    color: "#e8e9e5",
    padding: "9px 10px 10px",
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "center",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    boxShadow: "none",
  },

  pauseButton: {
    width: 98,
    minHeight: 40,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `linear-gradient(180deg, rgba(145, 148, 143, 0.62), rgba(34, 37, 37, 0.78)), url(${buttonImage})`,
    backgroundSize: "100% 100%, 100% 100%",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundBlendMode: "color, normal",
    color: "#e8e9e5",
    padding: "8px 7px 9px",
    fontSize: 9,
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 0.2,
    lineHeight: 1.05,
    overflowWrap: "anywhere",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    boxShadow: "none",
  },

  pauseButtonActive: {
    color: "#f3f4ef",
    backgroundImage: `linear-gradient(180deg, rgba(176, 180, 172, 0.66), rgba(52, 56, 55, 0.82)), url(${buttonImage})`,
  },

  surrenderButton: {
    width: 92,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `linear-gradient(180deg, rgba(138, 48, 44, 0.54), rgba(45, 12, 12, 0.74)), url(${buttonImage})`,
    backgroundSize: "100% 100%, 100% 100%",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundBlendMode: "color, normal",
    color: "#ffd0d0",
    padding: "9px 10px 10px",
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    boxShadow: "none",
  },

  actionHint: {
    minHeight: 90,
    padding: 12,
    borderRadius: 14,
    background: "rgba(7, 9, 9, 0.62)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 13,
    lineHeight: 1.35,
    color: "rgba(238, 242, 243, 0.78)",
  },

  projectileImage: {
    position: "absolute",
    width: 132,
    height: 38,
    marginLeft: -66,
    marginTop: -19,
    zIndex: 20,
    pointerEvents: "none",
    transformOrigin: "center center",
    objectFit: "contain",
    filter: "drop-shadow(0 0 8px rgba(255, 209, 102, 0.75))",
  },

  explosionContainer: {
    position: "absolute",
    width: 140,
    height: 140,
    marginLeft: -70,
    marginTop: -70,
    zIndex: 35,
    pointerEvents: "none",
  },

  explosionFlash: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    mixBlendMode: "screen",
    filter: "drop-shadow(0 0 18px rgba(255, 229, 120, 0.95))",
  },

  explosionFireball: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    mixBlendMode: "screen",
    filter: "drop-shadow(0 0 22px rgba(255, 104, 20, 0.85))",
  },

  explosionSmoke: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    opacity: 0.55,
    filter: "drop-shadow(0 0 12px rgba(30, 30, 30, 0.65))",
  },
  cardsLeftValue: {
  fontSize: 24,
  lineHeight: 1,
  color: "#f7d774",
  textShadow: "0 2px 0 rgba(0,0,0,0.9)",
},

drawCardEffect: {
  position: "fixed",
  left: 0,
  top: 0,
  width: 96,
  height: 128,
  marginLeft: -48,
  marginTop: -64,
  borderRadius: 12,
  backgroundSize: "cover",
  backgroundPosition: "center center",
  backgroundRepeat: "no-repeat",
  border: "none",
  boxShadow:
    "0 18px 42px rgba(0,0,0,0.64), 0 0 18px rgba(247,215,116,0.18)",
  zIndex: 2600,
  pointerEvents: "none",
  
},

spawnCardEffect: {
  position: "fixed",
  left: 0,
  top: 0,
  width: 175,
  marginLeft: -87,
  marginTop: -140,
  zIndex: 2700,
  pointerEvents: "none",
  filter: "drop-shadow(0 22px 44px rgba(0,0,0,0.62))",
},

spawnCardBackEffect: {
  position: "fixed",
  left: 0,
  top: 0,
  width: 104,
  height: 138,
  marginLeft: -52,
  marginTop: -69,
  borderRadius: 12,
  backgroundSize: "cover",
  backgroundPosition: "center center",
  backgroundRepeat: "no-repeat",
  border: "none",
  boxShadow: "0 18px 42px rgba(0,0,0,0.64)",
  zIndex: 2700,
  pointerEvents: "none",
},

destroyedCardEffect: {
  position: "fixed",
  zIndex: 2800,
  pointerEvents: "none",
  objectFit: "cover",
  borderRadius: 10,
  filter:
    "drop-shadow(0 18px 34px rgba(0,0,0,0.68)) saturate(0.86) contrast(1.08)",
},

  explosionEffect: {
    position: "absolute",
    inset: "50%",
    width: 26,
    height: 26,
    marginLeft: -13,
    marginTop: -13,
    borderRadius: "999px",
    background:
      "radial-gradient(circle, #fff3a3 0%, #ffb703 35%, #fb5607 62%, rgba(251, 86, 7, 0) 72%)",
    boxShadow: "0 0 28px 12px rgba(251, 86, 7, 0.8)",
    zIndex: 10,
    pointerEvents: "none",
  },

  cardPreviewOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background:
      "radial-gradient(circle at center, rgba(0,0,0,0.58), rgba(0,0,0,0.86) 74%)",
    backdropFilter: "blur(6px)",
  },

  cardPreviewPanel: {
    position: "relative",
    width: 390,
    maxWidth: "82cqw",
    maxHeight: "92cqh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 28px 58px rgba(0,0,0,0.78))",
  },

  cardPreviewClose: {
    position: "absolute",
    right: -12,
    top: -12,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background:
      "linear-gradient(180deg, rgba(38,40,40,0.96), rgba(5,6,6,0.96))",
    color: "#f3ead0",
    fontSize: 24,
    lineHeight: "30px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(0,0,0,0.58)",
  },

  cardPreviewHint: {
    position: "absolute",
    left: "50%",
    bottom: -28,
    transform: "translateX(-50%)",
    color: "rgba(238,242,243,0.68)",
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: "nowrap",
    textShadow: "0 2px 8px rgba(0,0,0,0.85)",
    pointerEvents: "none",
  },

};
