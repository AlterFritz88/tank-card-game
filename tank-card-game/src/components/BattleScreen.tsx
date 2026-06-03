import type React from "react";
import { useEffect, useRef, useState } from "react";
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
import { getBattleBackgroundAsset } from "../assets/battleBackgroundAssets";
import apShellImage from "../assets/ap-shell.png";
import explosionFlashImage from "../assets/effects/explosion-flash.png";
import explosionFireballImage from "../assets/effects/explosion-fireball.png";
import explosionSmokeImage from "../assets/effects/explosion-smoke.png";
import movementArrowImage from "../assets/effects/arrow.png";
import burntCardImage from "../assets/effects/burnt-card.png";
import cardBackImage from "../assets/cards/card-back.png";
import cartridgeImage from "../assets/effects/rifle-cartridge.png";

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

type DestroyedCardEffect = {
  id: number;
  targetId: string;
  from: CellCenter;
  to: CellCenter;
  width: number;
  height: number;
  rotation: number;
};

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

function setObjectRef(
  refs: React.MutableRefObject<Map<string, HTMLButtonElement>>,
  id: string
) {
  return (element: HTMLButtonElement | null) => {
    if (element) {
      refs.current.set(id, element);
    } else {
      refs.current.delete(id);
    }
  };
}

function getElementCenterRelativeToBoard(
  boardElement: HTMLDivElement,
  element: HTMLButtonElement
): CellCenter {
  const boardRect = boardElement.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  return {
    x: elementRect.left - boardRect.left + elementRect.width / 2,
    y: elementRect.top - boardRect.top + elementRect.height / 2,
  };
}

function getElementCenterInViewport(element: HTMLElement): CellCenter {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
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
  const humanPlayerId: PlayerId = mode === "pvp" ? localPlayerId : "player";
  const opponentPlayerId: PlayerId =
    humanPlayerId === "player" ? "bot" : "player";
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
  const previousActivePlayerRef = useRef(battle.activePlayer);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const objectRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
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
  const [destroyedCardEffects, setDestroyedCardEffects] = useState<
    DestroyedCardEffect[]
  >([]);
  const [hiddenDestroyedObjectIds, setHiddenDestroyedObjectIds] = useState<
    Set<string>
  >(new Set());
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
  const [debugPaused, setDebugPaused] = useState(false);
  const debugPausedRef = useRef(false);

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
    ) => Promise<void>
  >(() => Promise.resolve());
  const playAndDispatchLocalMovementRef = useRef<
    (
      state: BattleState,
      action: Extract<BattleAction, { type: "MOVE_UNIT" }>
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

  function setSupportUnitRef(
    owner: PlayerId,
    supportSlot: SupportSlot,
    unitId: string
  ) {
    return (element: HTMLButtonElement | null) => {
      setSupportCellRef(owner, supportSlot)(element);
      setObjectRef(objectRefs, unitId)(element);
    };
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

    return -Math.min(98, 10 + (totalCards - 6) * 14);
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

    const winner = getRandomLocalStartingPlayer();
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
  }, [battle.status, humanPlayerId, mode]);

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
  const previousActivePlayer = previousActivePlayerRef.current;

  previousActivePlayerRef.current = battle.activePlayer;

  if (battle.status !== "active") return;
  if (previousActivePlayer === battle.activePlayer) return;

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

        const action: BattleAction | null = getNextBotAction(currentBattle);

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

    const targetElement = objectRefs.current.get(targetId);
    const owner = getCombatObjectOwner(targetId);
    const deckElement = owner ? deckRefs.current[owner] : null;

    if (!targetElement || !deckElement || !owner) {
      await delay(DESTROYED_CARD_ANIMATION_MS);
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const from = getElementCenterInViewport(targetElement);
    const to = getElementCenterInViewport(deckElement);

    destroyedCardEffectIdRef.current += 1;

    const effect: DestroyedCardEffect = {
      id: destroyedCardEffectIdRef.current,
      targetId,
      from,
      to,
      width: targetRect.width,
      height: targetRect.height,
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

  function playDrawCardAnimation(owner: PlayerId, cardInstanceId: string) {
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
    action: Extract<BattleAction, { type: "MOVE_UNIT" }>
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
      await playMoveIntentAnimation(action.playerId, action.unitId, position);
      dispatchBattleActionRef.current({
        ...action,
        position,
      });
      await waitForNextFrame();
      await delay(MOVE_ARROW_FOLLOW_MS);
    }
  }

  async function playMoveIntentAnimation(
    owner: PlayerId,
    unitId: string,
    position: Position,
    durationMs = MOVE_ARROW_LEAD_MS
  ): Promise<void> {
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
        return;
      }

      movementArrowEffectIdRef.current += 1;

      const effect: MovementArrowEffect = {
        id: movementArrowEffectIdRef.current,
        owner,
        from: getElementCenterRelativeToBoard(boardElement, unitElement),
        to: getElementCenterRelativeToBoard(boardElement, targetCellElement),
        phase: "extending",
      };

      const targetCellRect = targetCellElement.getBoundingClientRect();
      const dx = effect.to.x - effect.from.x;
      const dy = effect.to.y - effect.from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const unitX = dx / distance;
      const unitY = dy / distance;
      const isDiagonalMove = Math.abs(dx) > 1 && Math.abs(dy) > 1;
      const targetEdgeOffset = isDiagonalMove
        ? 0
        : ((Math.abs(unitX) * targetCellRect.width +
            Math.abs(unitY) * targetCellRect.height) /
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
    } finally {
      movementAnimationRunningRef.current = false;
    }
  }

  useEffect(() => {
    if (mode !== "pvp") return;
    if (!pvpMovementIntent) return;

    void playMoveIntentAnimationRef.current(
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

  function handleCellClick(position: Position) {
    if (debugPaused) return;
    if (attackSequenceRunningRef.current) return;
    if (battle.status !== "active") return;
    if (battle.activePlayer !== humanPlayerId) return;

    if (selectedAttacker?.type === "headquarters") {
      selectAttacker(null);
    }

    if (selectedCardInstanceId) {
      if (spawningCardInstanceId) return;
      const isOwnSpawn =
        humanPlayerId === "player" ? isPlayerSpawn(position) : isBotSpawn(position);
      if (!isOwnSpawn) return;

      const cardInstance = battle[humanPlayerId].hand.find(
        (item) => item.instanceId === selectedCardInstanceId
      );

      if (!cardInstance || isHiddenCardInstance(cardInstance)) return;
      if (getCard(cardInstance.cardId).deploymentZone === "support") return;

      void playSpawnCardAnimation(
        humanPlayerId,
        cardInstance.instanceId,
        cardInstance.cardId,
        position
      ).then(() => {
        dispatchBattleAction({
          type: "PLAY_CARD",
          playerId: humanPlayerId,
          cardInstanceId: cardInstance.instanceId,
          position,
        });
      });

      return;
    }

    if (selectedAttacker && selectedAttacker.type === "unit") {
      if (!isMoveCell(position)) return;
      if (movementAnimationRunningRef.current) return;

      const moveAction: BattleAction = {
          type: "MOVE_UNIT",
          playerId: humanPlayerId,
          unitId: selectedAttacker.id,
          position,
        };

      if (mode === "pvp") {
        dispatchBattleAction(moveAction);
        return;
      }

      void playAndDispatchLocalMovement(battle as BattleState, moveAction);
    }
  }

  function handleSupportSlotClick(owner: PlayerId, supportSlot: SupportSlot) {
    if (debugPaused) return;
    if (attackSequenceRunningRef.current) return;
    if (battle.status !== "active") return;
    if (battle.activePlayer !== humanPlayerId) return;
    if (owner !== humanPlayerId) return;
    if (!selectedCardInstanceId) return;
    if (spawningCardInstanceId) return;

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

    void playSupportSpawnCardAnimation(
      humanPlayerId,
      cardInstance.instanceId,
      cardInstance.cardId,
      supportSlot
    ).then(() => {
      dispatchBattleAction({
        type: "PLAY_SUPPORT_CARD",
        playerId: humanPlayerId,
        cardInstanceId: cardInstance.instanceId,
        supportSlot,
      });
    });
  }

  async function handleAttackTarget(
    targetType: "unit" | "headquarters",
    targetId: string
  ) {
    if (debugPaused) return;
    if (attackSequenceRunningRef.current) return;
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

    if (mode === "pvp") {
      dispatchBattleAction(attackAction);
      return;
    }

    const strikes = getAttackAnimationSequence(battle as BattleState, attackAction);

    const animationPlayed = await playAttackSequence(strikes);

    if (!animationPlayed) return;

    dispatchBattleAction(attackAction, { skipDamageEffects: true });
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
      return null;
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

function renderEnemyDeckWithTimer() {
  return (
    <div style={styles.enemyDeckWithTimer}>
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

      {renderTimerPanel(opponentPlayerId)}

      <FuelPanel
        ownerId={getVisualOwnerId(opponentPlayerId)}
        currentFuel={battle[opponentPlayerId].resources}
        nextTurnFuel={getNextTurnFuel(opponentPlayerId)}
      />
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
        <span style={styles.supportLineLabel}>SUPPORT</span>

        {SUPPORT_SLOTS.map((supportSlot) => {
          const unit = battle.units.find(
            (item) =>
              item.ownerId === owner &&
              isSupportUnit(item) &&
              item.supportSlot === supportSlot
          );
          const canPlace = freeSlots.includes(supportSlot);

          if (!unit) {
            return (
              <motion.button
                key={`${owner}-support-${supportSlot}`}
                type="button"
                ref={setSupportCellRef(owner, supportSlot)}
                style={{
                  ...styles.supportCell,
                  ...(canPlace ? styles.supportCellAvailable : {}),
                }}
                animate={
                  canPlace
                    ? {
                        boxShadow: [
                          "inset 0 0 7px rgba(102, 226, 123, 0.16), 0 0 3px rgba(102, 226, 123, 0.12)",
                          "inset 0 0 14px rgba(124, 246, 145, 0.34), 0 0 8px rgba(102, 226, 123, 0.24)",
                          "inset 0 0 7px rgba(102, 226, 123, 0.16), 0 0 3px rgba(102, 226, 123, 0.12)",
                        ],
                      }
                    : {}
                }
                transition={{
                  duration: 2.5,
                  ease: "easeInOut",
                  repeat: Infinity,
                }}
                onMouseDown={preventPersistentBattleFocus}
                onClick={() => handleSupportSlotClick(owner, supportSlot)}
                aria-label={`Support slot ${supportSlot + 1}`}
              />
            );
          }

          const card = getCard(unit.cardId);
          const canBeTarget = isTarget("unit", unit.instanceId);

          return (
            <motion.button
              key={unit.instanceId}
              ref={setSupportUnitRef(owner, supportSlot, unit.instanceId)}
              type="button"
              style={{
                ...styles.supportCell,
                ...styles.supportUnitCell,
                ...(canBeTarget ? styles.targetCell : {}),
              }}
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.72 }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
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
              onClick={() => {
                if (canBeTarget) {
                  void handleAttackTarget("unit", unit.instanceId);
                }
              }}
            >
              <motion.div
                style={styles.boardCardContent}
                animate={{
                  opacity: hiddenDestroyedObjectIds.has(unit.instanceId) ? 0 : 1,
                }}
              >
                <TankCardView
                  card={card}
                  variant="board"
                  ownerId={getVisualOwnerId(unit.ownerId)}
                  currentHp={unit.currentHp}
                  alreadyMoved
                  alreadyAttacked
                  healthDamageEffect={getHealthDamageEffect(unit.instanceId)}
                  healthGainEffect={getHealthGainEffect(unit.instanceId)}
                  healthPreviewValue={combatForecast.get(unit.instanceId)}
                />
              </motion.div>

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
  const localHand = getVisibleHand(humanPlayerId);
  const battleBackground = getBattleBackgroundAsset(battle.backgroundId);
  const resultRestartLabel =
    mode === "pvp"
      ? "В меню"
      : mode === "campaign"
        ? "В кампании"
        : "Начать бой заново";

  return (
    <div
      style={{
        ...styles.page,
        backgroundColor: battleBackground.color,
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.2)), url(${battleBackground.image})`,
        backgroundSize: `cover, ${battleBackground.size}`,
        backgroundPosition: `center center, ${battleBackground.position}`,
        backgroundRepeat: "no-repeat, no-repeat",
      }}
    >
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
              layout="position"
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
</aside>

          <section style={styles.boardShell}>
            <div style={styles.boardGlow} />

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
              <div style={styles.boardCellBackdropGrid} aria-hidden="true">
                {visualRows.map((row) =>
                  visualCols.map((col) => {
                    const position: Position = { row, col };
                    const playerSpawn = isPlayerSpawn(position);
                    const botSpawn = isBotSpawn(position);
                    const ownSpawn =
                      humanPlayerId === "player" ? playerSpawn : botSpawn;
                    const enemySpawn =
                      humanPlayerId === "player" ? botSpawn : playerSpawn;

                    return (
                      <div
                        key={`backdrop-${row}-${col}`}
                        style={{
                          ...styles.cell,
                          ...styles.boardCellBackdrop,
                          ...(ownSpawn ? styles.spawnCell : {}),
                          ...(enemySpawn ? styles.botSpawnCell : {}),
                        }}
                      />
                    );
                  })
                )}
              </div>

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

                    return (
                      <motion.button
                        type="button"
                        ref={setObjectRef(objectRefs, unit.instanceId)}
                        layout
                        layoutId={unit.instanceId}
                        key={unit.instanceId}
                        style={{
                          ...styles.cell,
                          zIndex: 6,
                          ...(unit.ownerId === humanPlayerId
                            ? styles.playerUnit
                            : styles.botUnit),
                          ...(canBeTarget ? styles.targetCell : {}),
                          ...(isSelected ? styles.selectedUnitCell : {}),
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
                        <motion.div
                          style={styles.boardCardContent}
                          animate={{
                            opacity: hiddenDestroyedObjectIds.has(
                              unit.instanceId
                            )
                              ? 0
                              : 1,
                          }}
                          transition={{ duration: 0.18 }}
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
                        style={{
                          ...styles.cell,
                          zIndex: 6,
                          ...(owner === humanPlayerId
                            ? styles.playerUnit
                            : styles.botUnit),
                          ...(canBeTarget ? styles.targetCell : {}),
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

                  const moveCell = isMoveCell(position);

                  return (
  <motion.button
    type="button"
    ref={setCellRef(position)}
    layout
    key={`${row}-${col}`}
    style={{
      ...styles.cell,
      ...(ownSpawn ? styles.spawnCell : {}),
      ...(enemySpawn ? styles.botSpawnCell : {}),
      ...(moveCell ? styles.moveCell : {}),
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
    <button
              style={{
                ...styles.endTurnButton,
                opacity: debugPaused || !isHumanTurn ? 0.45 : 1,
              }}
              disabled={debugPaused || !isHumanTurn}
              onClick={() =>
                dispatchBattleAction({
                  type: "END_TURN",
                  playerId: humanPlayerId,
                })
              }
            >
              Конец хода
            </button>

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

            {mode === "pvp" && battle.status === "active" ? (
              <button
                type="button"
                style={styles.surrenderButton}
                onClick={handleSurrenderClick}
              >
                Сдаться
              </button>
            ) : null}

            <button style={styles.secondaryButton} onClick={reset}>
              Новый бой
            </button>

            {mode !== "pvp" ? (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={exitBattleToMenu}
              >
                В меню
              </button>
            ) : null}

            <div style={styles.actionHint}>
              {debugPaused && (
                <span>
                  Отладочная пауза включена: таймеры, бот и действия игрока
                  остановлены. ПКМ-просмотр карт работает.
                </span>
              )}

              {!debugPaused && selectedCardInstanceId && (
                <span>Выбрана карта. Нажми на свободный спавн.</span>
              )}

              {!debugPaused &&
                selectedAttacker &&
                selectedAttacker.type === "unit" && (
                  <span>
                    Зеленые клетки — движение. Желтые цели — атака. Оба
                    действия тратят топливо.
                  </span>
                )}

              {!debugPaused &&
                selectedAttacker &&
                selectedAttacker.type === "headquarters" && (
                  <span>Выбран штаб. Желтые цели доступны для атаки.</span>
                )}

              {!debugPaused && !selectedCardInstanceId && !selectedAttacker && (
                <span>Выбери карту из руки или свой юнит на поле.</span>
              )}
            </div>
            </div>
          </aside>
        </section>

        <section style={styles.playerZone}>
  

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

                return (
                  <motion.button
                    key={cardInstance.instanceId}
                    ref={setHandCardRef(humanPlayerId, cardInstance.instanceId)}
                    layout="position"
                    style={{
                      ...styles.card,
                      marginLeft: getPlayerHandCardMarginLeft(
                        index,
                        localHand.length
                      ),
                      zIndex: selected ? 120 : index + 1,
                      pointerEvents:
                        isHiddenDrawnCard || isHiddenSpawningCard
                          ? "none"
                          : "auto",
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
                    whileHover={{ y: -108, scale: 1.08 }}
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
        </section>

      </main>

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
      </AnimatePresence>

      {(battle.status === "player_won" || battle.status === "bot_won") && (
  <ResultScreen
    battle={battle}
    onRestart={mode === "pvp" ? leavePvpMatch : reset}
    localPlayerId={humanPlayerId}
    matchEndReason={mode === "pvp" ? matchEndReason : null}
    restartLabel={resultRestartLabel}
  />
)}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    color: "#eef2f3",
    padding: 18,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },

  vignette: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(circle at center, rgba(255,255,255,0.02), rgba(0,0,0,0.58) 82%), linear-gradient(90deg, rgba(0,0,0,0.48), transparent 20%, transparent 80%, rgba(0,0,0,0.48))",
    zIndex: 0,
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
  width: "min(560px, calc(100vw - 260px))",
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
  gridTemplateColumns: "130px 1fr 270px",
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
},

  rightCommandPanel: {
  display: "grid",
  gridTemplateColumns: "118px 1fr",
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
  transform: "translate(-2px, -74px)",
  zIndex: 30,
},

actionSideColumn: {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  alignItems: "stretch",
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
    transform: "translateY(-50%)",
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
    fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
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
    borderRadius: 7,
    border: "1px solid rgba(213, 203, 168, 0.28)",
    background: "rgba(19, 22, 20, 0.3)",
    boxShadow: "inset 0 0 9px rgba(0,0,0,0.48)",
    cursor: "pointer",
  },

  supportCellAvailable: {
    borderColor: "rgba(111, 228, 132, 0.58)",
    background: "rgba(42, 96, 54, 0.24)",
  },

  supportUnitCell: {
    borderColor: "rgba(213, 203, 168, 0.28)",
    background: "rgba(19, 22, 20, 0.3)",
  },

 board: {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
  gap: 4,
  alignItems: "stretch",
},

  boardCellBackdropGrid: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
    gridTemplateRows: "repeat(3, minmax(0, 1fr))",
    gap: 4,
    alignItems: "stretch",
    pointerEvents: "none",
  },

  boardCellBackdrop: {
    cursor: "default",
    pointerEvents: "none",
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

  cell: {
  aspectRatio: "1 / 1",
  minHeight: 0,
  position: "relative",
  overflow: "visible",
  outline: "none",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "linear-gradient(135deg, rgba(17, 24, 26, 0.72), rgba(7, 9, 10, 0.62))",
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
    "inset 0 0 0 1px rgba(255,255,255,0.025), inset 0 0 24px rgba(0,0,0,0.35)",
},

  boardCardContent: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 0,
  },

  spawnCell: {
    background:
      "linear-gradient(135deg, rgba(35, 66, 36, 0.48), rgba(8, 13, 8, 0.62))",
  },

  botSpawnCell: {
  background:
    "linear-gradient(135deg, rgba(92, 32, 32, 0.46), rgba(23, 8, 8, 0.64))",
  boxShadow:
    "inset 0 0 0 1px rgba(255, 120, 100, 0.08), inset 0 0 24px rgba(120, 20, 20, 0.22)",
},

  moveCell: {
    background:
      "linear-gradient(135deg, rgba(24, 70, 31, 0.46), rgba(11, 23, 13, 0.68))",
  },

  moveCellPulse: {
    position: "absolute",
    inset: 3,
    zIndex: 2,
    borderRadius: 7,
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
    borderRadius: 9,
    pointerEvents: "none",
  },

  attackTargetGlow: {
    position: "absolute",
    inset: 1,
    zIndex: 19,
    border: "1px solid rgba(207, 72, 61, 0.68)",
    borderRadius: 9,
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
  transform: "translateY(-70px)",
  overflow: "visible",
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
    marginTop: "auto",
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
    minHeight: 150,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  cardsLeftInfo: {
    display: "none",
  },
  enemyDeckWithTimer: {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 4,
},
  enemyDeckCompact: {
    minHeight: 150,
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
    minHeight: 74,
    border: "none",
    borderRadius: 14,
    background:
      "linear-gradient(180deg, #d8b46a, #9d7133), radial-gradient(circle at 50% 0%, rgba(255,255,255,0.35), transparent 60%)",
    color: "#1d1207",
    padding: "12px 14px",
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 1,
    boxShadow: "0 12px 32px rgba(0,0,0,0.42)",
  },

  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    background: "rgba(12, 14, 14, 0.7)",
    color: "#eef2f3",
    padding: "10px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },

  pauseButton: {
    border: "1px solid rgba(255, 226, 124, 0.32)",
    borderRadius: 12,
    background:
      "linear-gradient(180deg, rgba(66, 48, 21, 0.88), rgba(18, 14, 8, 0.82))",
    color: "#f7d774",
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    boxShadow: "inset 0 0 14px rgba(247, 215, 116, 0.08)",
  },

  pauseButtonActive: {
    borderColor: "rgba(125, 255, 138, 0.55)",
    color: "#7dff8a",
    background:
      "linear-gradient(180deg, rgba(26, 72, 35, 0.92), rgba(8, 20, 10, 0.86))",
    boxShadow:
      "0 0 0 2px rgba(125, 255, 138, 0.16), inset 0 0 18px rgba(125, 255, 138, 0.12)",
  },

  surrenderButton: {
    border: "1px solid rgba(255, 138, 138, 0.42)",
    borderRadius: 12,
    background:
      "linear-gradient(180deg, rgba(92, 32, 32, 0.92), rgba(24, 8, 8, 0.86))",
    color: "#ffd0d0",
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    boxShadow: "inset 0 0 14px rgba(255, 120, 120, 0.08)",
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
    maxWidth: "82vw",
    maxHeight: "92vh",
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
