import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { getCard, getCardOrNull } from "../game/cards";
import { getCardKeywords, getHeadquartersKeywords } from "../game/cardKeywords";
import { CardKeywordsPanel } from "./CardKeywordsPanel";
import { getNextBotAction } from "../game/bot";
import {
  PLAYER_SPAWN_CELLS,
  BOT_SPAWN_CELLS,
  SUPPORT_SLOTS,
  getAttackAnimationSequence,
  getAvailableMoveCells,
  calculateFuelGeneration,
  getActiveCombinations,
  getEffectiveCardCost,
  getFreeSupportSlots,
  getHeadquartersAttackValue,
  getNationalDefenseBonus,
  getTargetsInRange,
  getUnitAttackValue,
  getUnitDisplayAttackValue,
  isBattlefieldUnit,
  isSupportUnit,
  applyAction,
} from "../game/engine";
import type { AttackAnimationStrike } from "../game/engine";
import type {
  BattleAction,
  BattleState,
  BoardUnit,
  CardInstance,
  ClientBattleState,
  ClientCardInstance,
  HeadquartersId,
  PlayerId,
  Position,
  SupportSlot,
  TankCard,
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
import { useI18n } from "../game/i18n";
import {
  screenDeltaToStage,
  screenPointToStage,
  StageBackground,
  useStageRotation,
  useStageScale,
} from "./GameStage";
import { getBattleBackgroundAsset } from "../assets/battleBackgroundAssets";
import {
  getAvatarAssetById,
  getHeadquartersAvatarAsset,
} from "../assets/headquartersAvatarAssets";
import {
  getCampaignCompletionReward,
  getCampaignMission,
} from "../game/campaigns";
import {
  getLocalizedMissionBriefing,
  getLocalizedMissionDefeatDebrief,
  getLocalizedMissionPlayerCommanderName,
  getLocalizedMissionVictoryDebrief,
  getLocalizedCampaignSpeaker,
} from "../game/campaignLocalization";
import { getHeadquartersImageAsset } from "../game/headquartersImages";
import { getBattleFlagAsset } from "../game/battleFlags";
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
  claimCampaignRewardFromServer,
  claimTutorialRewardFromServer,
  getLocalTutorialReward,
  loadPlayerProgress,
} from "../game/playerProgress";
import {
  RewardCelebrationOverlay,
  type RewardCelebrationCard,
} from "./RewardCelebrationOverlay";
import {
  getHeadquartersAbility,
  getHeadquartersDefinition,
} from "../game/headquarters";
import {
  TUTORIAL_REWARD,
  getTutorialEpilogueText,
  getTutorialBotAction,
  getTutorialHighlights,
  getTutorialMoveTargetCell,
  getTutorialStep,
  isStandaloneTutorialScript,
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Gap (px) between battlefield cells — must match styles.board `gap`. */
const BOARD_CELL_GAP = 4;

function isPlayerSpawn(position: Position): boolean {
  return PLAYER_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

function isBotSpawn(position: Position): boolean {
  return BOT_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

// Design-space width of a player hand card (matches styles.card).
const HAND_CARD_WIDTH = 175;
// How far (in screen px) the pointer must travel from the press point before a
// hand-card press turns into a drag instead of a tap-to-select.
const DRAG_START_THRESHOLD_PX = 8;
// Design-space width of an enemy (face-down) hand card (matches styles.cardBack).
const ENEMY_HAND_CARD_WIDTH = 104;

// Cards reflow by animating a child-local `x` transform (see the player hand
// render for why framer's `layout` is avoided). The horizontal slide uses a
// snappier spring; opacity/lift/scale use the softer default.
const HAND_CARD_TRANSITION = {
  x: {
    type: "spring",
    stiffness: 420,
    damping: 34,
    mass: 0.75,
  },
  default: {
    type: "spring",
    stiffness: 280,
    damping: 24,
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

type CounterBatteryCalloutEffect = {
  id: number;
  targetId: string;
  ownerId: PlayerId;
};

// Floating «защита» indicator for the USSR «Сплочение» national ability — shown
// when a unit joins/leaves a vertical cohesion line (no defence stat badge).
type DefenseChangeEffect = {
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

type StagedDeployPreview =
  | {
      zone: "battlefield";
      instanceId: string;
      cardId: string;
      ownerId: PlayerId;
      position: Position;
    }
  | {
      zone: "support";
      instanceId: string;
      cardId: string;
      ownerId: PlayerId;
      supportSlot: SupportSlot;
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
// Finger travel (screen px) tolerated during a hold before it counts as a drag
// and cancels the pending peek. Generous enough to ignore natural tremor.
const CARD_PREVIEW_LONG_PRESS_MOVE_TOLERANCE_PX = 12;

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
  return Math.floor(Math.random() * 2000);
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

// Persistent brass command frame around the rear HQ cell so it reads as the
// command centre instead of just another rear unit of the same size. Corner
// brackets + a thin gold border; sits above the card art (z9) but below the
// selection/target glow rings (z19/20), so those still overlay cleanly.
function HqCommandFrame() {
  return (
    <span style={styles.hqCommandFrame} aria-hidden>
      <span style={{ ...styles.hqFrameCorner, ...styles.hqFrameCornerTL }} />
      <span style={{ ...styles.hqFrameCorner, ...styles.hqFrameCornerTR }} />
      <span style={{ ...styles.hqFrameCorner, ...styles.hqFrameCornerBL }} />
      <span style={{ ...styles.hqFrameCorner, ...styles.hqFrameCornerBR }} />
    </span>
  );
}

function AttackTargetGlow() {
  return (
    <motion.span
      style={styles.attackTargetGlow}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0.62, 1, 0.72, 0.94, 0.62],
        scale: [1, 1.045, 1.012, 1.035, 1],
        borderColor: [
          "rgba(255, 76, 62, 0.9)",
          "rgba(255, 194, 113, 1)",
          "rgba(255, 62, 50, 0.94)",
          "rgba(255, 144, 88, 1)",
          "rgba(255, 76, 62, 0.9)",
        ],
        boxShadow: [
          "0 0 0 1px rgba(255, 230, 160, 0.16), 0 0 10px rgba(255, 76, 62, 0.42), inset 0 0 12px rgba(255, 48, 38, 0.22)",
          "0 0 0 2px rgba(255, 225, 145, 0.34), 0 0 24px rgba(255, 112, 76, 0.78), inset 0 0 20px rgba(255, 86, 58, 0.34)",
          "0 0 0 1px rgba(255, 210, 132, 0.2), 0 0 14px rgba(255, 64, 54, 0.52), inset 0 0 14px rgba(255, 48, 38, 0.26)",
          "0 0 0 2px rgba(255, 225, 145, 0.28), 0 0 20px rgba(255, 122, 76, 0.66), inset 0 0 18px rgba(255, 86, 58, 0.32)",
          "0 0 0 1px rgba(255, 230, 160, 0.16), 0 0 10px rgba(255, 76, 62, 0.42), inset 0 0 12px rgba(255, 48, 38, 0.22)",
        ],
      }}
      transition={{
        duration: 1.45,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    />
  );
}

function CounterBatteryCallout({ friendly }: { friendly: boolean }) {
  return (
    <motion.span
      style={{
        ...styles.counterBatteryCallout,
        ...(friendly
          ? styles.counterBatteryCalloutFriendly
          : styles.counterBatteryCalloutEnemy),
      }}
      initial={{ opacity: 0, x: "-50%", y: 8, scale: 0.72 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: "-50%",
        y: [8, -6, -12, -24],
        scale: [0.72, 1.08, 1, 0.94],
      }}
      exit={{ opacity: 0, x: "-50%", y: -24, scale: 0.9 }}
      transition={{ duration: 1.18, ease: "easeOut" }}
    >
      Контрбатарея
    </motion.span>
  );
}

// Soft shimmering ribbon painted over the units of an active national-ability
// combination (СССР «Сплочение» vertical line, США «Линия снабжения» horizontal
// line). Dark green for the local player's combinations, dark red for the
// enemy's — subtle, a slow band of colour sliding along the line so the player
// reads the units as linked without it being garish.
function NationalComboGlow({
  orientation,
  isAllied,
}: {
  orientation: "vertical" | "horizontal";
  isAllied: boolean;
}) {
  const rgb = isAllied ? "44, 150, 74" : "168, 40, 32";
  const angle = orientation === "vertical" ? "180deg" : "90deg";
  const sizeAlongLine =
    orientation === "vertical" ? "100% 240%" : "240% 100%";
  const slide: string[] =
    orientation === "vertical"
      ? ["50% 0%", "50% 100%", "50% 0%"]
      : ["0% 50%", "100% 50%", "0% 50%"];

  return (
    <motion.span
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        pointerEvents: "none",
        mixBlendMode: "screen",
        background: `linear-gradient(${angle}, rgba(${rgb}, 0) 0%, rgba(${rgb}, 0.5) 50%, rgba(${rgb}, 0) 100%)`,
        backgroundSize: sizeAlongLine,
        boxShadow: `inset 0 0 16px rgba(${rgb}, 0.35)`,
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0.4, 0.7, 0.4],
        backgroundPosition: slide,
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 3.4, ease: "easeInOut", repeat: Infinity }}
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
  const { language, t } = useI18n();
  const battleStore = useBattleStore();
  const {
    mode,
    localPlayerId,
    pvpRoomId,
    pvpOpponentNickname,
    pvpTimer,
    pvpMovementIntent,
    pvpAttackIntent,
    pvpDeployBarrageIntent,
    matchEndReason,
    selectedCardInstanceId,
    opponentSelectedCardInstanceId,
    selectedAttacker,
    selectCard,
    selectAttacker,
    dispatch,
    reset,
    exitBattleToMenu,
    completeTrailerAndExit,
    surrenderBattle,
    leavePvpMatch,
    recordBattleForReminder,
  } = battleStore;

  const firstTurnRoll = battleStore.firstTurnRoll;
  const tutorialActive = battleStore.tutorialActive;
  const tutorialScriptId = battleStore.tutorialScriptId;
  const tutorialStepIndex = battleStore.tutorialStepIndex;
  const tutorialEpilogueSeen = battleStore.tutorialEpilogueSeen;
  const advanceTutorialStep = battleStore.advanceTutorialStep;
  const completeTutorialEpilogue = battleStore.completeTutorialEpilogue;
  const tutorialStep = tutorialActive
    ? getTutorialStep(tutorialScriptId, tutorialStepIndex, language)
    : null;

  // Campaign mission briefing/debrief delivered by the commander avatar.
  const currentCampaignMissionId = battleStore.currentCampaignMissionId;
  const campaignMission =
    mode === "campaign" && currentCampaignMissionId
      ? getCampaignMission(currentCampaignMissionId)
      : null;
  const campaignBriefingAvatar = campaignMission?.campaign.briefingAvatarId
    ? getAvatarAssetById(campaignMission.campaign.briefingAvatarId) ?? undefined
    : undefined;
  const campaignSpeaker = campaignMission
    ? getLocalizedCampaignSpeaker(campaignMission.campaign, language) ?? undefined
    : undefined;
  const missionBriefingText = campaignMission
    ? getLocalizedMissionBriefing(campaignMission.mission, language) ?? null
    : null;
  // Scripted-intro overrides: a fixed commander name and a skipped first-turn roll.
  const missionPlayerCommanderName = campaignMission
    ? getLocalizedMissionPlayerCommanderName(campaignMission.mission, language) ??
      null
    : null;
  const missionSkipFirstTurnRoll =
    campaignMission?.mission.skipFirstTurnRoll ?? false;
  const missionCenteredDialogue =
    campaignMission?.mission.centeredDialogue ?? false;
  const missionSkipResultScreen =
    campaignMission?.mission.skipResultScreen ?? false;
  const missionEndRewardId = campaignMission?.mission.endRewardId ?? null;
  const missionMinimalBattleControls =
    campaignMission?.mission.minimalBattleControls ?? false;
  const missionWon = battle.status === "player_won";
  const missionDebriefText = campaignMission
    ? missionWon
      ? getLocalizedMissionVictoryDebrief(
          campaignMission.mission,
          language
        ) ?? null
      : getLocalizedMissionDefeatDebrief(
          campaignMission.mission,
          language
        ) ?? null
    : null;

  // Local gating: the briefing shows once at battle start, the debrief once at
  // battle end (before the result screen). Reset whenever the mission changes.
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [debriefDismissed, setDebriefDismissed] = useState(false);
  // Scripted ending (welcome trailer): the triumphant SU-152 reveal shown after
  // the debrief instead of the result screen. `null` until it should appear.
  const [endRewardCards, setEndRewardCards] = useState<
    RewardCelebrationCard[] | null
  >(null);
  const endRewardHandledRef = useRef(false);

  // The mission briefing must be read before we roll for the first turn and
  // start the step timer. While it is pending the start-roll effect is held off.
  const briefingPending =
    mode === "campaign" && Boolean(missionBriefingText) && !briefingDismissed;

  useEffect(() => {
    setBriefingDismissed(false);
    setDebriefDismissed(false);
    setEndRewardCards(null);
    endRewardHandledRef.current = false;
  }, [currentCampaignMissionId]);

  // Scripted ending: once the victory debrief is read, grant the campaign reward
  // on the server and trigger the triumphant reveal (instead of the result
  // screen). Runs once per mission.
  useEffect(() => {
    if (!missionEndRewardId) return;
    if (battle.status !== "player_won") return;
    if (!debriefDismissed) return;
    if (endRewardHandledRef.current) return;

    endRewardHandledRef.current = true;

    const reward = getCampaignCompletionReward(missionEndRewardId);
    const rewardCard = reward ? getCardOrNull(reward.cardId) : null;

    if (reward && rewardCard) {
      setEndRewardCards(
        Array.from({ length: Math.max(1, reward.copies) }, () => ({
          kind: "card",
          card: rewardCard,
        }))
      );
    }

    // Grant the card server-side (idempotent); the reveal shows regardless.
    void claimCampaignRewardFromServer(missionEndRewardId).catch(() => {
      // Best-effort: a transient server failure shouldn't block the trailer.
    });
  }, [missionEndRewardId, battle.status, debriefDismissed]);
  // Active-task hints: what to highlight; everything else gets dimmed/blocked.
  const tutorialHighlights =
    tutorialActive && battle.status === "active"
      ? getTutorialHighlights(
          tutorialScriptId,
          tutorialStepIndex,
          battle as BattleState
        )
      : null;

  // Destination cells (spawn targets / scripted moves) blink only after the
  // actor has been picked — see isTutorialSourceSelected.
  function isTutorialCellHighlighted(position: Position): boolean {
    if (!isTutorialSourceSelected()) return false;

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

  // Every task step is split into two stages so exactly one hint blinks at a
  // time: first the actor (a hand card, a unit, or the HQ), then — once that
  // actor is picked — the destination (a cell, an enemy target, the enemy HQ).
  // Returns true once the step's actor has been selected/picked up.
  function isTutorialSourceSelected(): boolean {
    if (!tutorialHighlights) return false;

    if (tutorialHighlights.hqAttackSequence) {
      return isTutorialOwnHqSelected();
    }

    const handCardIds = tutorialHighlights.handCardIds;
    if (handCardIds && handCardIds.length > 0) {
      // Drag-to-play has no discrete "selected" state — picking the card up is
      // the selection, so a drag of the right card counts immediately.
      if (dragCard && handCardIds.includes(dragCard.cardId)) return true;
      if (!selectedCardInstanceId) return false;
      const selected = battle.player.hand.find(
        (item) => item.instanceId === selectedCardInstanceId
      );
      return Boolean(
        selected &&
          !isHiddenCardInstance(selected) &&
          handCardIds.includes(selected.cardId)
      );
    }

    const unitCardIds = tutorialHighlights.unitCardIds;
    const unitInstanceIds = tutorialHighlights.unitInstanceIds;
    if (
      (unitInstanceIds && unitInstanceIds.length > 0) ||
      (unitCardIds && unitCardIds.length > 0)
    ) {
      if (selectedAttacker?.type !== "unit") return false;
      const attackerId = selectedAttacker.id;
      return battle.units.some(
        (unit) =>
          unit.instanceId === attackerId &&
          unit.ownerId === "player" &&
          (unitInstanceIds?.includes(unit.instanceId) ||
            Boolean(unitCardIds?.includes(unit.cardId)))
      );
    }

    return false;
  }

  function isTutorialUnitHighlighted(unit: {
    instanceId: string;
    ownerId: PlayerId;
    cardId: string;
    zone?: string;
  }): boolean {
    if (!tutorialHighlights) return false;

    if (unit.ownerId === "player") {
      // Stage 1: the actor blinks only until it is picked. When instance ids are
      // scripted (several units share a card id) they take precedence.
      const instanceIds = tutorialHighlights.unitInstanceIds;
      const matchesActor =
        instanceIds && instanceIds.length > 0
          ? instanceIds.includes(unit.instanceId)
          : Boolean(tutorialHighlights.unitCardIds?.includes(unit.cardId));
      return matchesActor && !isTutorialSourceSelected();
    }

    const isEnemyTarget =
      (tutorialHighlights.enemySupport && unit.zone === "support") ||
      Boolean(tutorialHighlights.enemyUnitCardIds?.includes(unit.cardId));

    if (!isEnemyTarget) return false;

    // Stage 2: the target blinks only once the actor is picked — and never while
    // a scripted move still has to happen first (then the move cell blinks).
    return isTutorialSourceSelected() && tutorialMoveCells.length === 0;
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

    if (owner === "player") {
      return Boolean(tutorialHighlights.playerHq);
    }

    // The enemy HQ is a stage-2 target: when the step also highlights an actor
    // (a unit or a hand card), it blinks only after that actor is picked — so a
    // single hint is on screen at any moment.
    const stepHasActor = Boolean(
      tutorialHighlights.handCardIds?.length ||
        tutorialHighlights.unitCardIds?.length ||
        tutorialHighlights.unitInstanceIds?.length
    );

    if (!stepHasActor) {
      return Boolean(tutorialHighlights.enemyHq);
    }

    return (
      Boolean(tutorialHighlights.enemyHq) &&
      isTutorialSourceSelected() &&
      tutorialMoveCells.length === 0
    );
  }

  const humanPlayerId: PlayerId = mode === "pvp" ? localPlayerId : "player";
  const opponentPlayerId: PlayerId =
    humanPlayerId === "player" ? "bot" : "player";

  // Имя локального игрока берем из актуального аккаунта: у зарегистрированного
  // профиля это логин, у гостя — сохраненный ник.
  const [localPlayerNickname] = useState(() => loadPlayerProgress().nickname);

  // The single scripted destination cell for the BT-7's advance in the active
  // tutorial step — the only cell highlighted and the only one the player may
  // move it to. Null/empty for every other step.
  const tutorialMoveCell: Position | null =
    tutorialActive && battle.status === "active"
      ? getTutorialMoveTargetCell(
          tutorialScriptId,
          tutorialStepIndex,
          battle as BattleState
        )
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
        // The player avatar (164px) is wider than its 150px column and the
        // leftCommandPanel is shifted left by translateX(-22px), so it gets
        // clipped by the page's overflow:hidden left edge. Push it back to the
        // right via Framer's `x` (a CSS `transform` here would be overridden by
        // Framer's own transform from the `y` animation).
        initial={{ opacity: 0, y: placement === "player" ? 14 : -10, x: placement === "player" ? 26 : 0 }}
        animate={{ opacity: 1, y: 0, x: placement === "player" ? 26 : 0 }}
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

  function renderDeckAvatarStack(
    owner: PlayerId,
    placement: "player" | "enemy"
  ) {
    return (
      <div
        style={{
          ...styles.deckAvatarStack,
          ...(placement === "player"
            ? styles.playerDeckAvatarStack
            : styles.enemyDeckAvatarStack),
        }}
      >
        <div
          ref={(element) => {
            deckRefs.current[owner] = element;
          }}
          style={{
            ...styles.deckBehindAvatar,
            ...(placement === "player"
              ? styles.playerDeckBehindAvatar
              : styles.enemyDeckBehindAvatar),
          }}
        >
          <DeckStack
            cardCount={getDeckCount(owner)}
            countPosition={placement === "enemy" ? "right" : undefined}
          />
        </div>

        {renderHeadquartersAvatar(owner, placement)}
      </div>
    );
  }

  // Ник командира, выводимый в боковой колонке штаба (зелёный у игрока, красный
  // у врага). Раньше показывался в тыловой полосе у поля; теперь живёт рядом с
  // аватаром штаба.
  function renderCommanderNick(owner: PlayerId) {
    const isFriendly = owner === humanPlayerId;
    const enemyHeadquartersTitle = getHeadquartersDefinition(
      getHeadquartersIdForOwner(owner)
    ).title;
    const commanderName = isFriendly
      ? missionPlayerCommanderName ?? localPlayerNickname
      : mode === "pvp"
        ? pvpOpponentNickname ?? enemyHeadquartersTitle
        : enemyHeadquartersTitle;

    if (!commanderName) return null;

    return (
      <span
        style={{
          ...styles.columnCommanderName,
          ...(isFriendly
            ? styles.playerColumnCommanderName
            : styles.enemyColumnCommanderName),
        }}
      >
        {commanderName}
      </span>
    );
  }

  function getVisibleHand(owner: PlayerId): CardInstance[] {
    const hand = battle[owner].hand as ClientCardInstance[];

    return hand.filter(
      (card): card is CardInstance => !isHiddenCardInstance(card)
    );
  }

  function getStartRollFinalRotationForViewer(winner: PlayerId): number {
    // The cartridge settles strictly horizontal: pointing left toward the local
    // player when they win, right toward the enemy otherwise.
    const targetAngle = winner === humanPlayerId ? 180 : 0;
    return 360 * 8 + targetAngle;
  }

  function getStartRollResultText(winner: PlayerId): string {
    if (mode === "pvp") {
      return winner === humanPlayerId
        ? t("battle.youStart")
        : t("battle.enemyStarts");
    }

    return winner === "player"
      ? t("battle.playerStarts")
      : t("battle.enemyStarts");
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
  const [counterBatteryCallouts, setCounterBatteryCallouts] = useState<
    CounterBatteryCalloutEffect[]
  >([]);
  const [defenseChangeEffects, setDefenseChangeEffects] = useState<
    DefenseChangeEffect[]
  >([]);
  const [hoveredAttackTarget, setHoveredAttackTarget] =
    useState<HoveredAttackTarget>(null);
  const [suppressedAttackTarget, setSuppressedAttackTarget] =
    useState<HoveredAttackTarget>(null);
  const [turnBannerText, setTurnBannerText] = useState<string | null>(null);
  const [thinkingCardIndex, setThinkingCardIndex] = useState<number | null>(
    null
  );
  const [botThinkingAboutCard, setBotThinkingAboutCard] = useState(false);
  const previousHandIdsRef = useRef<Record<PlayerId, Set<string>>>({
    player: new Set(battle.player.hand.map((card) => card.instanceId)),
    bot: new Set(battle.bot.hand.map((card) => card.instanceId)),
  });
  const previousBattleStatusRef = useRef<string | null>(null);
  const previousActivePlayerRef = useRef(battle.activePlayer);
  const previousCounterBatteryUnitIdsRef = useRef(
    new Set(battle.units.map((unit) => unit.instanceId))
  );
  const boardRef = useRef<HTMLDivElement | null>(null);
  // Rear-strip cells must match the live battlefield cell size. The board is a
  // 5-column grid with a 4px gap, so a single cell is (width - 4*gap) / 5. We
  // measure the board's layout width (transform-independent) and keep it in
  // sync via a ResizeObserver so the rear column always lines up with the rows.
  const [boardCellSize, setBoardCellSize] = useState(140);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const measure = () => {
      const size = (board.offsetWidth - 4 * BOARD_CELL_GAP) / 5;
      if (size > 0) setBoardCellSize(size);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);

    return () => observer.disconnect();
  }, []);
  const objectRefs = useRef<Map<string, HTMLElement>>(new Map());
  const projectileIdRef = useRef(0);
  const explosionIdRef = useRef(0);
  const hitReactionIdRef = useRef(0);
  const damageTextIdRef = useRef(0);
  const healthGainEffectIdRef = useRef(0);
  const attackChangeEffectIdRef = useRef(0);
  const counterBatteryCalloutIdRef = useRef(0);
  const defenseChangeEffectIdRef = useRef(0);
  const previousHpSnapshotRef = useRef<Map<string, number> | null>(null);
  const previousAttackSnapshotRef = useRef<Map<string, number> | null>(null);
  // National-ability buff diffs (all modes): supply-line +HP and cohesion +defence.
  const previousSupplyAppliedRef = useRef<Map<string, number> | null>(null);
  const previousCohesionDefenseRef = useRef<Map<string, number> | null>(null);
  const suppressNextRemoteDamageEffectsRef = useRef(false);
  const lastPvpAttackIntentIdRef = useRef<string | null>(null);
  const lastPvpDeployBarrageIntentIdRef = useRef<string | null>(null);
  const botTurnRunningRef = useRef(false);
  const [drawCardEffects, setDrawCardEffects] = useState<DrawCardEffect[]>([]);
  const [spawnCardEffects, setSpawnCardEffects] = useState<SpawnCardEffect[]>([]);
  const [stagedDeployPreview, setStagedDeployPreview] =
    useState<StagedDeployPreview | null>(null);
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
  // Units that have just landed from a spawn animation. Their board cell mounts
  // statically (no scale/opacity pop-in) so the destination cell never blinks
  // out before the unit image appears — the flying card overlay hands off
  // seamlessly to a solid unit.
  const [staticSpawnUnitIds, setStaticSpawnUnitIds] = useState<Set<string>>(
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
  // Drag-and-drop play: while a hand card is being dragged we show a card "ghost"
  // following the pointer and reuse the existing selection-based cell/slot
  // highlights. Dropping over a valid cell/slot plays the card; a plain tap still
  // selects it for the click-to-place flow.
  const [dragCard, setDragCard] = useState<{
    cardInstanceId: string;
    cardId: string;
    isSupport: boolean;
  } | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(
    null
  );
  // When the dragged card hovers a legal drop target, the ghost cross-fades from
  // the hand-card look into the on-board card look, sized to match that target
  // cell so it reads as the card about to settle into place. `active` is true
  // only while actually over a legal target; we keep the last size around when
  // it goes false so the board layer can fade back out smoothly instead of
  // popping. null = no drag / never entered a target yet.
  const [dragBoardView, setDragBoardView] = useState<{
    size: number;
    isSupport: boolean;
    active: boolean;
  } | null>(null);
  const dragPointerStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    cardInstanceId: string;
    cardId: string;
    isSupport: boolean;
    dragging: boolean;
  } | null>(null);
  // Set true on pointer-up after an actual drag so the synthetic click that
  // follows does not also toggle the card selection.
  const dragHappenedRef = useRef(false);
  // The preview overlay is portaled to <body>, outside the scaled/rotated
  // GameStage, so it applies the stage transform (rotate + uniform scale) to its
  // content. This keeps the enlarged card pixel-identical to the desktop layout
  // — fixed design px, then scaled/rotated to fit exactly like the rest of the
  // game — instead of resizing itself against the raw viewport (which distorted
  // it on phones).
  const stageRotation = useStageRotation();
  const stageScale = useStageScale();
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const ignorePreviewBackdropUntilRef = useRef(0);
  // Where the finger first touched, so micro-jitter while holding does not abort
  // the pending peek (only a deliberate drag past the tolerance does).
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [debugPaused] = useState(false);
  const [battleReward, setBattleReward] = useState<BattleReward | null>(null);
  const [rewardClaimStatus, setRewardClaimStatus] =
    useState<RewardClaimStatus>("idle");
  const [rewardClaimError, setRewardClaimError] = useState<string | null>(null);
  const [rewardSyncPending, setRewardSyncPending] = useState(false);
  const debugPausedRef = useRef(false);
  const rewardedBattleKeyRef = useRef<string | null>(null);
  const reminderCountedBattleKeyRef = useRef<string | null>(null);

  const handCardRefs = useRef<Record<PlayerId, Map<string, HTMLElement>>>({
    player: new Map(),
    bot: new Map(),
  });
  const dispatchBattleActionRef = useRef<
    (
      action: BattleAction,
      options?: { skipDamageEffects?: boolean; skipAttackEffects?: boolean }
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

  useEffect(() => {
    if (!stagedDeployPreview) return;

    if (
      battle.units.some(
        (unit) => unit.instanceId === stagedDeployPreview.instanceId
      )
    ) {
      setStagedDeployPreview(null);
    }
  }, [battle.units, stagedDeployPreview]);

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

  // Closing the peek listens for a *pointer* down, not a mouse down. After a
  // touch releases the browser fires synthetic compatibility MOUSE events
  // (mousedown/click) at the touch point — which now sits over this backdrop —
  // and during board movement the pressed cell unmounts, so `touchcancel` (no
  // preventDefault) fires instead of `touchend` and those synthetic events are
  // no longer suppressed. Pointer events don't include those compatibility
  // events, and the opening touch's real pointerdown landed on the unit button,
  // never here — so only a genuinely new tap on the backdrop dismisses the peek.
  function handleCardPreviewBackdropPointerDown() {
    if (Date.now() < ignorePreviewBackdropUntilRef.current) {
      return;
    }

    closeCardPreview();
  }

  // На телефоне нет правой кнопки мыши, поэтому увеличенный просмотр карточки
  // открывается долгим нажатием (touch) и остаётся на экране, пока игрок не
  // закроет его тапом по фону или крестиком. Долгое нажатие подавляет обычный
  // клик, чтобы карта не выбиралась/не атаковала при открытии превью.
  function longPressPreviewHandlers(preview: CardPreview) {
    return {
      onTouchStart: (event: React.TouchEvent) => {
        // Pinch/second finger is never a card peek — abort any pending one.
        if (event.touches.length !== 1) {
          clearLongPressTimer();
          longPressOriginRef.current = null;
          return;
        }
        const touch = event.touches[0];
        longPressOriginRef.current = { x: touch.clientX, y: touch.clientY };
        longPressTriggeredRef.current = false;
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTriggeredRef.current = true;
          ignorePreviewBackdropUntilRef.current = Date.now() + 600;
          setCardPreview(preview);
        }, CARD_PREVIEW_LONG_PRESS_MS);
      },
      // Only a deliberate drag (past the tolerance) cancels the pending peek;
      // natural tremor while holding must not. Once the peek is open the timer
      // is already gone, so further moves are ignored.
      onTouchMove: (event: React.TouchEvent) => {
        const origin = longPressOriginRef.current;
        if (!origin || longPressTriggeredRef.current) return;
        const touch = event.touches[0];
        if (!touch) return;
        if (
          Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) >
          CARD_PREVIEW_LONG_PRESS_MOVE_TOLERANCE_PX
        ) {
          clearLongPressTimer();
        }
      },
      // Releasing the finger keeps the peek open and swallows the trailing click
      // so the card is not selected/attacked when the press was only a peek.
      onTouchEnd: (event: React.TouchEvent) => {
        clearLongPressTimer();
        longPressOriginRef.current = null;
        if (longPressTriggeredRef.current) {
          event.preventDefault();
          window.setTimeout(() => {
            longPressTriggeredRef.current = false;
          }, 350);
        }
      },
      // A browser-initiated cancel (OS long-press/callout, pointer capture
      // elsewhere) must NOT dismiss a peek that already opened — it would make
      // the card flash big then vanish. Just stop a still-pending timer.
      onTouchCancel: () => {
        clearLongPressTimer();
        longPressOriginRef.current = null;
      },
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
    const confirmedByPlayer = window.confirm(
      "\u0421\u0434\u0430\u0442\u044c\u0441\u044f \u0438 \u0437\u0430\u0441\u0447\u0438\u0442\u0430\u0442\u044c \u043f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435?"
    );
    if (!confirmedByPlayer) return;

    surrenderBattle();
    return;

    const confirmed = window.confirm(t("battle.surrenderConfirm"));
    if (!confirmed) return;

    surrenderBattle();
  }

  function getPlayerHandSafeWidth() {
    const boardWidth = boardCellSize * 5 + BOARD_CELL_GAP * 4;

    return Math.max(HAND_CARD_WIDTH, boardWidth - 24);
  }

  function getPlayerHandSlotStep(totalCards: number) {
    if (totalCards <= 1) return 0;

    const naturalStep = 95;
    const safeWidth = getPlayerHandSafeWidth();
    const maxStep = (safeWidth - HAND_CARD_WIDTH) / (totalCards - 1);

    return Math.max(4, Math.min(naturalStep, maxStep));
  }

  function getEnemyHandSafeWidth() {
    const boardWidth = boardCellSize * 5 + BOARD_CELL_GAP * 4;

    return Math.max(ENEMY_HAND_CARD_WIDTH, boardWidth - 24);
  }

  function getEnemyHandSlotStep(totalCards: number) {
    if (totalCards <= 1) return 0;

    // Фиксированный «естественный» шаг (как у руки игрока): карты держатся
    // кучно по центру своей области и только при большом числе сжимаются, а не
    // разъезжаются по краям при добавлении новых карт.
    const naturalStep = 52;
    const safeWidth = getEnemyHandSafeWidth();
    const maxStep = (safeWidth - ENEMY_HAND_CARD_WIDTH) / (totalCards - 1);

    return Math.max(4, Math.min(naturalStep, maxStep));
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
    let serverError: string | null = null;

    // Only the standalone training tutorial grants the local tutorial reward.
    // Guided campaign demos use the normal campaign reward/debrief flow.
    if (tutorialActive && tutorialScriptId === "training") {
      setRewardClaimStatus("pending");
      setRewardClaimError(
        serverError
          ? `${serverError}. Награда сохранена локально и будет синхронизирована позже.`
          : null
      );

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
      setRewardClaimError(
        serverError
          ? `${serverError}. Награда сохранена локально и будет синхронизирована позже.`
          : null
      );
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

      let pvpRewardError: string | null = null;
      const serverResult = await claimPvpBattleRewardFromServer({
        roomId: pvpRoomId,
        localPlayerId: humanPlayerId,
      }).catch((error: unknown) => {
        pvpRewardError = getErrorMessage(
          error,
          "Запрос PVP-награды не был обработан сервером"
        );
        setRewardClaimStatus("failed");
        setRewardClaimError(
          getErrorMessage(
            error,
            "Награда не начислена: сервер профиля недоступен"
          )
        );
        return null;
      });

      if (serverResult?.reward) {
        setBattleReward(serverResult.reward);
        setRewardClaimStatus("claimed");
        setRewardSyncPending(false);
        return;
      }

      if (pvpRewardError) {
        setRewardClaimStatus("failed");
        setRewardClaimError(pvpRewardError);
        return;
      }

      setRewardClaimStatus("failed");
      setRewardClaimError("Награда не начислена: сервер профиля недоступен");
      return;
    }

    serverError = null;
    const serverResult = await claimBattleRewardFromServer({
      battle,
      mode,
      localPlayerId: humanPlayerId,
      matchEndReason: null,
    }).catch((error: unknown) => {
      serverError = getErrorMessage(
        error,
        "Награда не начислена: сервер профиля недоступен"
      );
      return null;
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
      setRewardClaimError(
        serverError
          ? `${serverError}. Награда сохранена локально и будет синхронизирована позже.`
          : null
      );
      setRewardSyncPending(localResult.progress.pendingRewardClaims.length > 0);
      return;
    }

    setRewardClaimStatus("failed");
    if (serverError) {
      setRewardClaimError(serverError);
      return;
    }
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

    // NOTE: matchEndReason is deliberately NOT part of this key. On an early
    // exit (surrender/leave/disconnect) the server sends the finished battle
    // state first and the MATCH_ENDED reason in a separate message, so
    // matchEndReason flips null -> "surrender" one render later. Including it
    // here caused a second claim for the same battle; the server dedupes by
    // claimId and returns an all-zeroed reward on that second claim, which
    // overwrote the credited reward in the UI ("rewards not credited"). The
    // actual reward amount is computed server-side from its stored end reason,
    // so the client claim doesn't need the reason at all.
    const rewardKey = [
      mode,
      humanPlayerId,
      battle.status,
      battle.turn,
      battle.headquarters.player.hp,
      battle.headquarters.bot.hp,
      JSON.stringify(battle.stats),
    ].join(":");

    if (rewardedBattleKeyRef.current === rewardKey) return;

    rewardedBattleKeyRef.current = rewardKey;

    void claimCurrentBattleReward();
  }, [battle, humanPlayerId, matchEndReason, mode, pvpRoomId, tutorialActive]);

  // Count every finished battle (any mode) once, so an unregistered player gets
  // the «register to keep your progress» reminder every third battle. The ref
  // resets when a new battle starts, so a fresh terminal state counts again.
  useEffect(() => {
    if (battle.status === "starting" || battle.status === "active") {
      reminderCountedBattleKeyRef.current = null;
      return;
    }

    if (battle.status !== "player_won" && battle.status !== "bot_won") return;

    const countedKey = [
      mode,
      battle.status,
      battle.turn,
      battle.headquarters.player.hp,
      battle.headquarters.bot.hp,
    ].join(":");

    if (reminderCountedBattleKeyRef.current === countedKey) return;

    reminderCountedBattleKeyRef.current = countedKey;
    recordBattleForReminder();
  }, [battle, mode, recordBattleForReminder]);

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

    // Hold the first-turn roll (and thus BEGIN_BATTLE / the timer) until the
    // commander's briefing has been read.
    if (briefingPending) return;

    if (startRollRunningRef.current) return;

    startRollRunningRef.current = true;

    // Scripted intro (welcome trailer): no roll, the player always starts.
    if (missionSkipFirstTurnRoll) {
      dispatchBattleActionRef.current({
        type: "BEGIN_BATTLE",
        startingPlayer: "player",
      });

      setStartRollState({
        visible: false,
        winner: null,
        finalRotation: 0,
        resultVisible: false,
      });

      setTurnBannerText(t("battle.yourTurn"));
      const bannerTimer = window.setTimeout(() => setTurnBannerText(null), 1300);

      previousActivePlayerRef.current = "player";
      startRollRunningRef.current = false;

      return () => window.clearTimeout(bannerTimer);
    }

    const winner = tutorialActive ? "player" : getRandomLocalStartingPlayer();
    // Cartridge settles strictly horizontal — left for the local player, right
    // for the enemy (see getStartRollFinalRotationForViewer).
    const targetAngle = winner === humanPlayerId ? 180 : 0;
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

      setTurnBannerText(
        winner === humanPlayerId ? t("battle.yourTurn") : t("battle.enemyTurn")
      );

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
  }, [
    battle.status,
    humanPlayerId,
    mode,
    tutorialActive,
    briefingPending,
    missionSkipFirstTurnRoll,
  ]);

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
    botThinkingAboutCard &&
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
    battle.activePlayer === humanPlayerId ? t("battle.yourTurn") : t("battle.enemyTurn");

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

        const storeNow = useBattleStore.getState();
        const action: BattleAction | null = storeNow.tutorialActive
          ? getTutorialBotAction(storeNow.tutorialScriptId, currentBattle)
          : getNextBotAction(currentBattle);

        if (!action) break;

        const isCardPlay =
          action.type === "PLAY_CARD" || action.type === "PLAY_SUPPORT_CARD";
        setBotThinkingAboutCard(isCardPlay);

        await delay(getRandomBotThinkingDelay());

        setBotThinkingAboutCard(false);

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

          if (
            cardInstance &&
            shouldSequenceDeployBarrage(currentBattle, action)
          ) {
            await playSpawnCardAnimationRef.current(
              "bot",
              cardInstance.instanceId,
              cardInstance.cardId,
              action.position
            );
            await dispatchDeployBarrageAfterNormalPlacement(
              currentBattle,
              action,
              (options) => dispatchBattleActionRef.current(action, options)
            );
          } else {
            if (cardInstance) {
              await playSpawnCardAnimationRef.current(
                "bot",
                cardInstance.instanceId,
                cardInstance.cardId,
                action.position
              );
            }

            dispatchBattleActionRef.current(action);
          }
          await delay(450);
          continue;
        }

        if (action.type === "PLAY_SUPPORT_CARD") {
          const latestBattle = useBattleStore.getState().battle as BattleState | null;
          const cardInstance = latestBattle?.bot.hand.find(
            (item) => item.instanceId === action.cardInstanceId
          );

          if (
            cardInstance &&
            shouldSequenceDeployBarrage(currentBattle, action)
          ) {
            await playSupportSpawnCardAnimationRef.current(
              "bot",
              cardInstance.instanceId,
              cardInstance.cardId,
              action.supportSlot
            );
            await dispatchDeployBarrageAfterNormalPlacement(
              currentBattle,
              action,
              (options) => dispatchBattleActionRef.current(action, options)
            );
          } else {
            if (cardInstance) {
              await playSupportSpawnCardAnimationRef.current(
                "bot",
                cardInstance.instanceId,
                cardInstance.cardId,
                action.supportSlot
              );
            }

            dispatchBattleActionRef.current(action);
          }
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
      setBotThinkingAboutCard(false);
    }

    void runAnimatedBotTurn();

    return () => {
      cancelled = true;
      botTurnRunningRef.current = false;
      setBotThinkingAboutCard(false);
    };
  }, [botAiEnabled, battle.activePlayer, battle.status, debugPaused]);

  const rows = [0, 1, 2] as const;
  const cols = [0, 1, 2, 3, 4] as const;
  const visualRows: readonly number[] =
    humanPlayerId === "player" ? rows : [...rows].reverse();
  const visualCols: readonly number[] =
    humanPlayerId === "player" ? cols : [...cols].reverse();

  // Units currently part of an active national-ability combination, so their
  // board cells can show the shimmering link (green = local player, red = enemy).
  const combinationByUnitId = new Map<
    string,
    { orientation: "vertical" | "horizontal"; isAllied: boolean }
  >();
  for (const combination of getActiveCombinations(battle as BattleState)) {
    const isAllied = combination.ownerId === humanPlayerId;
    for (const unitId of combination.unitIds) {
      combinationByUnitId.set(unitId, {
        orientation: combination.orientation,
        isAllied,
      });
    }
  }

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

  function shouldShowAttackTargetGlow(
    targetType: "unit" | "headquarters",
    targetId: string
  ) {
    return isTarget(targetType, targetId) && !suppressedAttackTarget;
  }

  useEffect(() => {
    if (!suppressedAttackTarget) return;

    if (
      !selectedAttacker ||
      battle.status !== "active" ||
      battle.activePlayer !== humanPlayerId
    ) {
      setSuppressedAttackTarget(null);
      return;
    }

    const stillTarget = selectedTargets.some(
      (target) =>
        target.type === suppressedAttackTarget.type &&
        target.id === suppressedAttackTarget.id
    );

    if (!stillTarget) {
      setSuppressedAttackTarget(null);
    }
  }, [
    battle.activePlayer,
    battle.status,
    humanPlayerId,
    selectedAttacker,
    selectedTargets,
    suppressedAttackTarget,
  ]);

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

  function getCounterBatteryCallout(targetId: string) {
    for (let index = counterBatteryCallouts.length - 1; index >= 0; index -= 1) {
      const effect = counterBatteryCallouts[index];

      if (effect.targetId === targetId) {
        return effect;
      }
    }

    return undefined;
  }

  function showCounterBatteryCallout(targetId: string, ownerId: PlayerId) {
    counterBatteryCalloutIdRef.current += 1;

    const effect: CounterBatteryCalloutEffect = {
      id: counterBatteryCalloutIdRef.current,
      targetId,
      ownerId,
    };

    setCounterBatteryCallouts((current) => [...current, effect]);

    window.setTimeout(() => {
      setCounterBatteryCallouts((current) =>
        current.filter((item) => item.id !== effect.id)
      );
    }, 1180);
  }

  function getDefenseChangeEffect(targetId: string) {
    for (let index = defenseChangeEffects.length - 1; index >= 0; index -= 1) {
      const effect = defenseChangeEffects[index];

      if (effect.targetId === targetId) {
        return effect;
      }
    }

    return undefined;
  }

  function showDefenseChangeEffect(targetId: string, amount: number) {
    defenseChangeEffectIdRef.current += 1;

    const effect: DefenseChangeEffect = {
      id: defenseChangeEffectIdRef.current,
      targetId,
      amount,
    };

    setDefenseChangeEffects((current) => [...current, effect]);

    window.setTimeout(() => {
      setDefenseChangeEffects((current) =>
        current.filter((item) => item.id !== effect.id)
      );
    }, 1080);
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

  // `baseHp` strips the «Линия снабжения» bonus buffer so the damage diff sees
  // only real combat damage/healing — joining or leaving the supply line moves
  // current HP without it counting as a hit (that change is flashed separately by
  // the national-buff effect).
  function createHpSnapshot(
    sourceBattle: ClientBattleState,
    options: { baseHp?: boolean } = {}
  ): Map<string, number> {
    const hp = new Map<string, number>();

    for (const unit of sourceBattle.units) {
      const value = options.baseHp
        ? unit.currentHp - (unit.supplyHpApplied ?? 0)
        : unit.currentHp;
      hp.set(unit.instanceId, value);
    }

    hp.set("player_hq", sourceBattle.headquarters.player.hp);
    hp.set("bot_hq", sourceBattle.headquarters.bot.hp);

    return hp;
  }

  function getVisibleHeadquartersAttackValue(
    sourceBattle: ClientBattleState,
    owner: PlayerId
  ): number {
    if (sourceBattle.headquarters[owner].attackSuppressed) return 0;

    return getHeadquartersAttackValue(sourceBattle as BattleState, owner);
  }

  function getVisibleUnitAttackValue(
    sourceBattle: ClientBattleState,
    unit: BoardUnit,
    includeAuraBonuses = true
  ): number {
    if (unit.attackSuppressed && getCard(unit.cardId).class === "spg") {
      return 0;
    }

    return includeAuraBonuses
      ? getUnitDisplayAttackValue(sourceBattle as BattleState, unit)
      : getUnitAttackValue(sourceBattle as BattleState, unit);
  }

  /**
   * Snapshot of every combatant's attack for the gain/loss flash diff.
   *
   * The passive HQ auras «Танковая засада» (stationary) and «Танковый натиск»
   * (moved) toggle on and off on every move and at every turn boundary. Flashing
   * their +1/−1 each time duplicates the value already printed on the badge, so
   * by default they are excluded (`includeAuraBonuses = false`) and only the
   * unit's intrinsic attack is diffed. The aura is folded back in only for the
   * move that actually triggers it (the unit's first step onto a new cell), so
   * the buff animation still plays once, where the player expects it.
   */
  function createAttackSnapshot(
    sourceBattle: ClientBattleState,
    includeAuraBonuses = false
  ): Map<string, number> {
    const attack = new Map<string, number>([
      ["player_hq", getVisibleHeadquartersAttackValue(sourceBattle, "player")],
      ["bot_hq", getVisibleHeadquartersAttackValue(sourceBattle, "bot")],
    ]);

    for (const unit of sourceBattle.units) {
      attack.set(
        unit.instanceId,
        getVisibleUnitAttackValue(sourceBattle, unit, includeAuraBonuses)
      );
    }

    return attack;
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
    const currentSnapshot = createHpSnapshot(battle, { baseHp: true });
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

  // National-ability stat-change animations (all modes, including bot turns):
  // flash the health badge when a unit joins/leaves the «Линия снабжения» line
  // (+2 HP) and a shield indicator when it joins/leaves a «Сплочение» line
  // (+2 defence). Diffed off the live state so it fires regardless of which
  // side acted.
  useEffect(() => {
    const nextSupply = new Map<string, number>();
    const nextDefense = new Map<string, number>();

    for (const unit of battle.units) {
      nextSupply.set(unit.instanceId, unit.supplyHpApplied ?? 0);
      nextDefense.set(
        unit.instanceId,
        getNationalDefenseBonus(battle as BattleState, unit)
      );
    }

    const previousSupply = previousSupplyAppliedRef.current;
    const previousDefense = previousCohesionDefenseRef.current;

    if (previousSupply) {
      for (const [id, current] of nextSupply.entries()) {
        const previous = previousSupply.get(id);
        if (previous !== undefined && current !== previous) {
          showHealthGainEffect(id, current - previous);
        }
      }
    }

    if (previousDefense) {
      for (const [id, current] of nextDefense.entries()) {
        const previous = previousDefense.get(id);
        if (previous !== undefined && current !== previous) {
          showDefenseChangeEffect(id, current - previous);
        }
      }
    }

    previousSupplyAppliedRef.current = nextSupply;
    previousCohesionDefenseRef.current = nextDefense;
  }, [battle]);

  useEffect(() => {
    const previousUnitIds = previousCounterBatteryUnitIdsRef.current;
    const nextUnitIds = new Set(battle.units.map((unit) => unit.instanceId));

    for (const unit of battle.units) {
      if (previousUnitIds.has(unit.instanceId)) continue;

      if (getCard(unit.cardId).onPlayEffects?.suppressEnemyIndirect) {
        showCounterBatteryCallout(unit.instanceId, unit.ownerId);
      }
    }

    previousCounterBatteryUnitIdsRef.current = nextUnitIds;
  }, [battle]);

  /**
   * «Огневой налёт»: visualise the deploy barrage as a cannon shot flying from
   * the freshly placed support gun to each enemy unit it damaged. Deferred to a
   * couple of frames so the gun's board element has mounted and registered its
   * ref before we read its position.
   */
  /**
   * Snapshot of every on-board combatant's centre (relative to the board), keyed
   * by instance id. Taken before a deploy resolves so «Огневой налёт» can still
   * aim at a target that the barrage destroys and unmounts.
   */
  function getBattlefieldCellCenter(
    position: Position
  ): { x: number; y: number } | null {
    const boardElement = boardRef.current;
    const cellElement = cellRefs.current.get(positionKey(position));

    if (!boardElement || !cellElement) return null;

    return getElementCenterRelativeToBoard(boardElement, cellElement);
  }

  function getSupportCellCenter(
    owner: PlayerId,
    supportSlot: SupportSlot
  ): { x: number; y: number } | null {
    const boardElement = boardRef.current;
    const cellElement = supportCellRefs.current.get(
      supportCellKey(owner, supportSlot)
    );

    if (!boardElement || !cellElement) return null;

    return getElementCenterRelativeToBoard(boardElement, cellElement);
  }

  function getCombatObjectCenter(
    sourceBattle: ClientBattleState,
    instanceId: string
  ): { x: number; y: number } | null {
    const boardElement = boardRef.current;
    const objectElement = objectRefs.current.get(instanceId);

    if (boardElement && objectElement) {
      return getElementCenterRelativeToBoard(boardElement, objectElement);
    }

    const unit = sourceBattle.units.find((item) => item.instanceId === instanceId);

    if (!unit) return null;

    if (isSupportUnit(unit) && unit.supportSlot !== undefined) {
      return getSupportCellCenter(unit.ownerId, unit.supportSlot);
    }

    return getBattlefieldCellCenter(unit.position);
  }

  function getDeployBarrageSourceCenter(
    sourceBattle: ClientBattleState,
    action: Extract<BattleAction, { type: "PLAY_CARD" | "PLAY_SUPPORT_CARD" }>
  ): { x: number; y: number } | null {
    if (action.type === "PLAY_SUPPORT_CARD") {
      return getSupportCellCenter(action.playerId, action.supportSlot);
    }

    return (
      getBattlefieldCellCenter(action.position) ??
      getCombatObjectCenter(sourceBattle, action.cardInstanceId)
    );
  }

  function captureUnitCenters(
    sourceBattle: ClientBattleState
  ): Map<string, { x: number; y: number }> {
    const centers = new Map<string, { x: number; y: number }>();

    for (const unit of sourceBattle.units) {
      const center = getCombatObjectCenter(sourceBattle, unit.instanceId);
      if (center) centers.set(unit.instanceId, center);
    }

    return centers;
  }

  function playDeployBarrageShot(
    sourceInstanceId: string,
    sourceFallback: { x: number; y: number } | null,
    shots: { targetId: string; to: { x: number; y: number } }[]
  ) {
    if (shots.length === 0) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const boardElement = boardRef.current;
        const sourceElement = objectRefs.current.get(sourceInstanceId);

        if (!boardElement && !sourceFallback) return;

        const from =
          boardElement && sourceElement
            ? getElementCenterRelativeToBoard(boardElement, sourceElement)
            : sourceFallback;

        if (!from) return;

        // Each damaged target gets its own shot, staggered in time so a
        // multi-unit «Огневой налёт» reads as a rapid barrage instead of
        // collapsing into a single visible projectile (the projectile/explosion
        // state is single-slot).
        const SHOT_STAGGER_MS = 200;

        shots.forEach(({ targetId, to }, index) => {
          window.setTimeout(() => {
            playCannonShotSound();

            projectileIdRef.current += 1;
            const projectileId = projectileIdRef.current;
            setProjectileEffect({ id: projectileId, from, to });

            window.setTimeout(() => {
              explosionIdRef.current += 1;
              const explosionId = explosionIdRef.current;
              setExplosionEffect({ id: explosionId, position: to });
              setAttackEffectId(targetId);

              window.setTimeout(() => {
                // Guard by id so a later shot's explosion isn't cleared early.
                setExplosionEffect((current) =>
                  current?.id === explosionId ? null : current
                );
                setAttackEffectId((current) =>
                  current === targetId ? null : current
                );
              }, 720);
            }, 220);

            window.setTimeout(() => {
              setProjectileEffect((current) =>
                current?.id === projectileId ? null : current
              );
            }, 260);
          }, index * SHOT_STAGGER_MS);
        });
      });
    });
  }

  async function playDeployBarrageShotSequence(
    sourceInstanceId: string,
    sourceFallback: { x: number; y: number } | null,
    shots: { targetId: string; to: { x: number; y: number } }[]
  ): Promise<void> {
    if (shots.length === 0) return;

    await waitForNextFrame();
    await waitForNextFrame();

    const boardElement = boardRef.current;
    const sourceElement = objectRefs.current.get(sourceInstanceId);

    if (!boardElement && !sourceFallback) return;

    const from =
      boardElement && sourceElement
        ? getElementCenterRelativeToBoard(boardElement, sourceElement)
        : sourceFallback;

    if (!from) return;

    const shotStaggerMs = 200;

    shots.forEach(({ targetId, to }, index) => {
      window.setTimeout(() => {
        playCannonShotSound();

        projectileIdRef.current += 1;
        const projectileId = projectileIdRef.current;
        setProjectileEffect({ id: projectileId, from, to });

        window.setTimeout(() => {
          explosionIdRef.current += 1;
          const explosionId = explosionIdRef.current;
          setExplosionEffect({ id: explosionId, position: to });
          setAttackEffectId(targetId);

          window.setTimeout(() => {
            setExplosionEffect((current) =>
              current?.id === explosionId ? null : current
            );
            setAttackEffectId((current) =>
              current === targetId ? null : current
            );
          }, 720);
        }, 220);

        window.setTimeout(() => {
          setProjectileEffect((current) =>
            current?.id === projectileId ? null : current
          );
        }, 260);
      }, index * shotStaggerMs);
    });

    await delay((shots.length - 1) * shotStaggerMs + 520);
  }

  function getPlayedCardForAction(
    sourceBattle: ClientBattleState,
    action: Extract<BattleAction, { type: "PLAY_CARD" | "PLAY_SUPPORT_CARD" }>
  ): TankCard | null {
    const playedInstance = sourceBattle[action.playerId]?.hand.find(
      (item) => item.instanceId === action.cardInstanceId
    );

    return playedInstance && !isHiddenCardInstance(playedInstance)
      ? getCardOrNull(playedInstance.cardId)
      : null;
  }

  function shouldSequenceDeployBarrage(
    sourceBattle: ClientBattleState,
    action: Extract<BattleAction, { type: "PLAY_CARD" | "PLAY_SUPPORT_CARD" }>
  ): boolean {
    const playedCard = getPlayedCardForAction(sourceBattle, action);
    return (playedCard?.onPlayEffects?.deployDamage?.amount ?? 0) > 0;
  }

  function getDeployBarrageResolution(
    beforeBattle: ClientBattleState,
    afterBattle: ClientBattleState,
    action: Extract<BattleAction, { type: "PLAY_CARD" | "PLAY_SUPPORT_CARD" }>
  ): {
    sourceCenter: { x: number; y: number } | null;
    shots: {
      targetId: string;
      damage: number;
      destroyed: boolean;
      to: { x: number; y: number };
    }[];
  } {
    const before = createHpSnapshot(beforeBattle, { baseHp: true });
    const after = createHpSnapshot(afterBattle, { baseHp: true });
    const targetPositions = captureUnitCenters(beforeBattle);
    const sourceCenter =
      getDeployBarrageSourceCenter(beforeBattle, action) ??
      getCombatObjectCenter(afterBattle, action.cardInstanceId);
    const shots: {
      targetId: string;
      damage: number;
      destroyed: boolean;
      to: { x: number; y: number };
    }[] = [];

    for (const [id, previousHp] of before.entries()) {
      if (id === action.cardInstanceId) continue;

      const currentHp = after.get(id) ?? 0;
      if (currentHp >= previousHp) continue;

      const to = targetPositions.get(id);
      if (to) {
        shots.push({
          targetId: id,
          damage: previousHp - currentHp,
          destroyed: currentHp <= 0,
          to,
        });
      }
    }

    return { sourceCenter, shots };
  }

  async function dispatchDeployBarrageAfterNormalPlacement(
    beforeBattle: ClientBattleState,
    action: Extract<BattleAction, { type: "PLAY_CARD" | "PLAY_SUPPORT_CARD" }>,
    dispatchAction: (
      options?: {
        skipDamageEffects?: boolean;
        skipAttackEffects?: boolean;
        precomputedNextBattle?: BattleState;
      }
    ) => void
  ): Promise<void> {
    const playedCard = getPlayedCardForAction(beforeBattle, action);
    if (!playedCard) return;

    const afterBattle = applyAction(beforeBattle as BattleState, action);
    const { sourceCenter, shots } = getDeployBarrageResolution(
      beforeBattle,
      afterBattle,
      action
    );

    if (action.type === "PLAY_CARD") {
      setStagedDeployPreview({
        zone: "battlefield",
        instanceId: action.cardInstanceId,
        cardId: playedCard.id,
        ownerId: action.playerId,
        position: action.position,
      });
    } else {
      setStagedDeployPreview({
        zone: "support",
        instanceId: action.cardInstanceId,
        cardId: playedCard.id,
        ownerId: action.playerId,
        supportSlot: action.supportSlot,
      });
    }

    await waitForNextFrame();

    await playDeployBarrageShotSequence(
      action.cardInstanceId,
      sourceCenter,
      shots.map((shot) => ({ targetId: shot.targetId, to: shot.to }))
    );

    for (const shot of shots) {
      showHealthDamageEffect(shot.targetId, shot.damage);
    }

    const destroyedTargetIds = shots
      .filter((shot) => shot.destroyed)
      .map((shot) => shot.targetId);

    if (destroyedTargetIds.length > 0) {
      await delay(140);
      await Promise.all(
        destroyedTargetIds.map((targetId) =>
          playDestroyedCardAnimation(targetId)
        )
      );
    } else if (shots.length > 0) {
      await delay(ATTACK_STRIKE_SETTLE_MS);
    }

    // Commit the very state we simulated above, so the unit destroyed in `state`
    // is the one the barrage just animated against (random targeting must not be
    // rolled again by the store).
    dispatchAction({ skipDamageEffects: true, precomputedNextBattle: afterBattle });
    setStagedDeployPreview((current) =>
      current?.instanceId === action.cardInstanceId ? null : current
    );
  }

  async function playPvpDeployBarrageIntent(
    intent: NonNullable<typeof pvpDeployBarrageIntent>
  ): Promise<void> {
    const currentBattle = useBattleStore.getState().battle;
    if (!currentBattle) return;

    const targetPositions = captureUnitCenters(currentBattle);
    const sourceCenter =
      intent.source.type === "battlefield"
        ? getBattlefieldCellCenter(intent.source.position)
        : getSupportCellCenter(
            intent.playerId,
            intent.source.supportSlot as SupportSlot
          );
    if (intent.playerId !== humanPlayerIdRef.current) {
      if (intent.source.type === "battlefield") {
        await playSpawnCardAnimationRef.current(
          intent.playerId,
          intent.cardInstanceId,
          intent.cardId,
          intent.source.position
        );
      } else {
        await playSupportSpawnCardAnimationRef.current(
          intent.playerId,
          intent.cardInstanceId,
          intent.cardId,
          intent.source.supportSlot as SupportSlot
        );
      }
    }

    setStagedDeployPreview(
      intent.source.type === "battlefield"
        ? {
            zone: "battlefield",
            instanceId: intent.cardInstanceId,
            cardId: intent.cardId,
            ownerId: intent.playerId,
            position: intent.source.position,
          }
        : {
            zone: "support",
            instanceId: intent.cardInstanceId,
            cardId: intent.cardId,
            ownerId: intent.playerId,
            supportSlot: intent.source.supportSlot as SupportSlot,
          }
    );

    await waitForNextFrame();

    const shots = intent.shots
      .map((shot) => {
        const to = targetPositions.get(shot.targetId);
        return to ? { targetId: shot.targetId, to } : null;
      })
      .filter(
        (shot): shot is { targetId: string; to: { x: number; y: number } } =>
          shot !== null
      );

    await playDeployBarrageShotSequence(
      intent.cardInstanceId,
      sourceCenter,
      shots
    );

    for (const shot of intent.shots) {
      if (shot.damage > 0) {
        showHealthDamageEffect(shot.targetId, shot.damage);
      }
    }

    const destroyedTargetIds = intent.shots
      .filter((shot) => shot.destroyed)
      .map((shot) => shot.targetId);

    if (destroyedTargetIds.length > 0) {
      await delay(140);
      await Promise.all(
        destroyedTargetIds.map((targetId) =>
          playDestroyedCardAnimation(targetId)
        )
      );
    } else if (intent.shots.length > 0) {
      await delay(ATTACK_STRIKE_SETTLE_MS);
    }
  }

  function dispatchBattleAction(
    action: BattleAction,
    options: {
      skipDamageEffects?: boolean;
      skipAttackEffects?: boolean;
      precomputedNextBattle?: BattleState;
    } = {}
  ) {
    const shouldShowDamage =
      action.type === "ATTACK" ||
      action.type === "PLAY_CARD" ||
      action.type === "PLAY_SUPPORT_CARD" ||
      action.type === "END_TURN" ||
      action.type === "TIMER_TICK";

    // Fold the stationary/moved HQ auras into the attack diff only for the move
    // that toggles them — the unit's own step onto a new cell. Everywhere else
    // (turn ends, deploys, attacks) the aura is excluded so its +1/−1 is not
    // re-flashed away from the movement that earned it.
    const includeAuraBonuses = action.type === "MOVE_UNIT";

    const beforeBattle = useBattleStore.getState().battle;
    const before =
      shouldShowDamage && beforeBattle
        ? createHpSnapshot(beforeBattle, { baseHp: true })
        : null;
    const beforeAttack =
      beforeBattle ? createAttackSnapshot(beforeBattle, includeAuraBonuses) : null;

    // «Огневой налёт»: capture enemy board positions BEFORE the deploy resolves.
    // A target the barrage destroys is removed from state (and unmounts), so its
    // ref is gone by the time we'd animate — snapshot the centres up front so we
    // can still fire a shot at a killed unit's last position.
    let deployBarrageSource: string | null = null;
    let deployBarrageSourceCenter: { x: number; y: number } | null = null;
    let deployBarragePositions: Map<string, { x: number; y: number }> | null =
      null;

    if (
      (action.type === "PLAY_CARD" || action.type === "PLAY_SUPPORT_CARD") &&
      beforeBattle
    ) {
      const playedInstance = beforeBattle[action.playerId]?.hand.find(
        (item) => item.instanceId === action.cardInstanceId
      );
      const playedCard =
        playedInstance && !isHiddenCardInstance(playedInstance)
          ? getCardOrNull(playedInstance.cardId)
          : null;

      if (playedCard?.onPlayEffects?.deployDamage) {
        deployBarrageSource = action.cardInstanceId;
        deployBarrageSourceCenter = getDeployBarrageSourceCenter(
          beforeBattle,
          action
        );
        deployBarragePositions = captureUnitCenters(beforeBattle);
      }
    }

    dispatch(action, options.precomputedNextBattle);

    const afterBattle = useBattleStore.getState().battle;
    if (!afterBattle) return;

    if (beforeAttack && !options.skipAttackEffects) {
      showAttackChangesFromSnapshots(
        beforeAttack,
        createAttackSnapshot(afterBattle, includeAuraBonuses)
      );
    }

    if (!shouldShowDamage || !before || options.skipDamageEffects) return;

    const after = createHpSnapshot(afterBattle, { baseHp: true });

    showDamageEffectsFromSnapshots(before, after);

    // «Огневой налёт»: if a deployed card shelled enemy units, fire a visible
    // shot from the new gun to every unit that just lost health. Iterate the
    // BEFORE snapshot so targets destroyed by the barrage (removed from `after`)
    // are still counted — their last position was captured pre-dispatch.
    if (deployBarrageSource && deployBarragePositions) {
      const shots: { targetId: string; to: { x: number; y: number } }[] = [];

      for (const [id, previousHp] of before.entries()) {
        if (id === deployBarrageSource) continue;
        const currentHp = after.get(id) ?? 0; // missing from `after` ⇒ destroyed
        if (currentHp >= previousHp) continue;

        const to = deployBarragePositions.get(id);
        if (to) shots.push({ targetId: id, to });
      }

      playDeployBarrageShot(deployBarrageSource, deployBarrageSourceCenter, shots);
    }
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
    options: {
      skipDamageEffects?: boolean;
      skipAttackEffects?: boolean;
      precomputedNextBattle?: BattleState;
    } = {}
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
    ).then(() => undefined);
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
    ).then(() => undefined);
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
        // The flying card has reached the destination cell. Mark the unit so its
        // board cell mounts statically (no pop-in), and keep the overlay visible
        // for now so it overlaps the freshly placed unit instead of leaving the
        // cell empty for a frame.
        flushSync(() => {
          setStaticSpawnUnitIds((current) => {
            const next = new Set(current);
            next.add(cardInstanceId);
            return next;
          });

          setHiddenSpawningCardIds((current) => {
            const next = new Set(current);
            next.delete(cardInstanceId);
            return next;
          });

          setSpawningCardInstanceId((current) =>
            current === cardInstanceId ? null : current
          );
        });

        // Let the caller dispatch the spawn (the unit mounts solid under the
        // still-visible overlay), then on the next frames drop the overlay and
        // clear the static flag — a seamless hand-off with no blink.
        resolve();

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setSpawnCardEffects((current) =>
              current.filter((item) => item.id !== effect.id)
            );

            setStaticSpawnUnitIds((current) => {
              if (!current.has(cardInstanceId)) return current;
              const next = new Set(current);
              next.delete(cardInstanceId);
              return next;
            });
          });
        });
      }, SPAWN_CARD_ANIMATION_MS);
    });
  }

  // Every cell strictly between two positions on a straight horizontal/vertical
  // line. Used to break a multi-cell straight move into per-cell animation steps
  // (light tanks sweep up to 2 cells, armored cars up to 3) so the unit visibly
  // rolls cell by cell instead of teleporting to the destination. Diagonal or
  // single-cell moves have no intermediates.
  function getStraightLineIntermediates(
    fromPosition: Position,
    targetPosition: Position
  ): Position[] {
    const rowDistance = Math.abs(fromPosition.row - targetPosition.row);
    const colDistance = Math.abs(fromPosition.col - targetPosition.col);
    const manhattan = rowDistance + colDistance;

    if (manhattan < 2) return [];
    if (rowDistance > 0 && colDistance > 0) return [];

    const dRow = Math.sign(targetPosition.row - fromPosition.row);
    const dCol = Math.sign(targetPosition.col - fromPosition.col);

    const intermediates: Position[] = [];
    for (let step = 1; step < manhattan; step += 1) {
      intermediates.push({
        row: fromPosition.row + dRow * step,
        col: fromPosition.col + dCol * step,
      });
    }
    return intermediates;
  }

  async function playAndDispatchLocalMovement(
    state: BattleState,
    action: Extract<BattleAction, { type: "MOVE_UNIT" }>,
    options: { preserveLaterSelection?: boolean } = {}
  ): Promise<void> {
    const unit = state.units.find((item) => item.instanceId === action.unitId);
    const unitClass = unit ? getCard(unit.cardId).class : null;
    const intermediates =
      unit && (unitClass === "light" || unitClass === "armored_car")
        ? getStraightLineIntermediates(unit.position, action.position)
        : [];
    const positions = [...intermediates, action.position];

    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index];
      const isFollowUpStep = index > 0;
      const skipAttackEffects = isFollowUpStep;
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
        dispatchQueuedBattleAction(stepAction, {
          skipAttackEffects,
        });
      } else {
        dispatchBattleActionRef.current(stepAction, {
          skipAttackEffects,
        });
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

  useEffect(() => {
    if (mode !== "pvp") return;
    if (!pvpDeployBarrageIntent) return;
    if (
      lastPvpDeployBarrageIntentIdRef.current ===
      pvpDeployBarrageIntent.intentId
    ) {
      return;
    }

    lastPvpDeployBarrageIntentIdRef.current = pvpDeployBarrageIntent.intentId;
    suppressNextRemoteDamageEffectsRef.current = true;

    void playPvpDeployBarrageIntent(pvpDeployBarrageIntent);
  }, [mode, pvpDeployBarrageIntent]);

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

  // Place a freshly played unit straight onto the board with no hand→cell fly
  // animation, marking it static so its board cell mounts without a pop-in — the
  // drag ghost already carried the card to the target.
  function placeUnitStatically(cardInstanceId: string, dispatch: () => void) {
    playCardDistributionSound();

    flushSync(() => {
      setStaticSpawnUnitIds((current) => {
        const next = new Set(current);
        next.add(cardInstanceId);
        return next;
      });
    });

    dispatch();

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setStaticSpawnUnitIds((current) => {
          if (!current.has(cardInstanceId)) return current;
          const next = new Set(current);
          next.delete(cardInstanceId);
          return next;
        });
      });
    });
  }

  async function executeQueuedPlayCard(
    cardInstanceId: string,
    position: Position,
    options: { skipSpawnAnimation?: boolean } = {}
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

    const action: Extract<BattleAction, { type: "PLAY_CARD" }> = {
      type: "PLAY_CARD",
      playerId: currentHumanPlayerId,
      cardInstanceId: cardInstance.instanceId,
      position,
    };

    const dispatch = (options?: {
      skipDamageEffects?: boolean;
      skipAttackEffects?: boolean;
    }) => dispatchQueuedBattleAction(action, options);

    if (
      modeRef.current !== "pvp" &&
      shouldSequenceDeployBarrage(currentBattle, action)
    ) {
      // On a drag-and-drop play the ghost already carried the card to the cell,
      // so skip the hand→cell fly-in (the staged preview shows the unit in place)
      // and go straight to the barrage. A click play still plays the fly-in.
      if (!options.skipSpawnAnimation) {
        await playSpawnCardAnimationRef.current(
          currentHumanPlayerId,
          cardInstance.instanceId,
          cardInstance.cardId,
          position
        );
      }

      await dispatchDeployBarrageAfterNormalPlacement(
        currentBattle,
        action,
        dispatch
      );
      return;
    }

    if (options.skipSpawnAnimation) {
      placeUnitStatically(cardInstance.instanceId, () => dispatch());
      return;
    }

    await playSpawnCardAnimationRef.current(
      currentHumanPlayerId,
      cardInstance.instanceId,
      cardInstance.cardId,
      position
    );

    dispatch();
  }

  async function executeQueuedPlaySupportCard(
    cardInstanceId: string,
    supportSlot: SupportSlot,
    options: { skipSpawnAnimation?: boolean } = {}
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

    const action: Extract<BattleAction, { type: "PLAY_SUPPORT_CARD" }> = {
      type: "PLAY_SUPPORT_CARD",
      playerId: currentHumanPlayerId,
      cardInstanceId: cardInstance.instanceId,
      supportSlot,
    };

    const dispatch = (options?: {
      skipDamageEffects?: boolean;
      skipAttackEffects?: boolean;
    }) => dispatchQueuedBattleAction(action, options);

    if (
      modeRef.current !== "pvp" &&
      shouldSequenceDeployBarrage(currentBattle, action)
    ) {
      // On a drag-and-drop play the ghost already carried the card to the slot,
      // so skip the hand→slot fly-in (the staged preview shows the unit in place)
      // and go straight to the barrage. A click play still plays the fly-in.
      if (!options.skipSpawnAnimation) {
        await playSupportSpawnCardAnimationRef.current(
          currentHumanPlayerId,
          cardInstance.instanceId,
          cardInstance.cardId,
          supportSlot
        );
      }

      await dispatchDeployBarrageAfterNormalPlacement(
        currentBattle,
        action,
        dispatch
      );
      return;
    }

    if (options.skipSpawnAnimation) {
      placeUnitStatically(cardInstance.instanceId, () => dispatch());
      return;
    }

    await playSupportSpawnCardAnimationRef.current(
      currentHumanPlayerId,
      cardInstance.instanceId,
      cardInstance.cardId,
      supportSlot
    );

    dispatch();
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

  // Hit-test the pointer (screen coords) against the live cell / support-slot
  // refs. getBoundingClientRect already accounts for the scaled+rotated stage,
  // so a plain rectangle test in screen space is correct without any inverse
  // transform math. Only empty battlefield cells register a cellRef, so a found
  // cell is always a legal drop surface for a battlefield card.
  function findHandCardDropTarget(
    clientX: number,
    clientY: number
  ):
    | { type: "cell"; position: Position; element: HTMLElement }
    | {
        type: "support";
        owner: PlayerId;
        supportSlot: SupportSlot;
        element: HTMLElement;
      }
    | null {
    const inside = (rect: DOMRect) =>
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    for (const [key, element] of cellRefs.current) {
      if (!inside(element.getBoundingClientRect())) continue;

      const [row, col] = key.split("-").map(Number);
      return { type: "cell", position: { row, col }, element };
    }

    for (const [key, element] of supportCellRefs.current) {
      if (!inside(element.getBoundingClientRect())) continue;

      const separatorIndex = key.indexOf("-");
      const owner = key.slice(0, separatorIndex) as PlayerId;
      const supportSlot = Number(key.slice(separatorIndex + 1)) as SupportSlot;
      return { type: "support", owner, supportSlot, element };
    }

    return null;
  }

  function handleHandCardPointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    cardInstance: CardInstance,
    card: TankCard
  ) {
    // Only the primary mouse button starts a drag; touch/pen always do.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (debugPaused) return;
    if (battle.status !== "active") return;
    if (battle.activePlayer !== humanPlayerId) return;
    if (spawningCardInstanceId) return;
    if (isHiddenCardInstance(cardInstance)) return;

    dragHappenedRef.current = false;
    dragPointerStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cardInstanceId: cardInstance.instanceId,
      cardId: card.id,
      isSupport: card.deploymentZone === "support",
      dragging: false,
    };

    // NB: pointer capture is deferred until an actual drag begins (see
    // handleHandCardPointerMove). Capturing here on touch makes the browser fire
    // `touchcancel` for the same finger, which would kill the long-press peek
    // timer before it ever opens. A still hold therefore stays a touch gesture.
  }

  function handleHandCardPointerMove(
    event: React.PointerEvent<HTMLButtonElement>
  ) {
    const state = dragPointerStartRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    if (!state.dragging) {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;

      if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD_PX) return;

      state.dragging = true;
      // Now that it is a real drag, capture the pointer so move/up keep firing
      // even when it leaves the card and travels across the board. (Deferred
      // from pointerdown so a still hold can open the long-press peek instead.)
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Older browsers / detached nodes — drag falls back to no-capture.
      }
      // Selecting lights up the legal cells/slots via the existing
      // placingBattlefieldCard / placingSupport highlight logic.
      selectCard(state.cardInstanceId);
      setDragCard({
        cardInstanceId: state.cardInstanceId,
        cardId: state.cardId,
        isSupport: state.isSupport,
      });
    }

    setDragPointer({ x: event.clientX, y: event.clientY });

    // Morph the ghost into the on-board card look once it hovers a legal drop
    // target that matches the card's deployment zone, sized to that cell.
    const target = findHandCardDropTarget(event.clientX, event.clientY);
    const matchesTarget =
      target &&
      ((target.type === "cell" && !state.isSupport) ||
        (target.type === "support" &&
          state.isSupport &&
          target.owner === humanPlayerId));

    if (matchesTarget && target) {
      // Cells are square, so screen width / scale recovers the design-px side
      // regardless of the stage's 0°/90° rotation.
      const size = target.element.getBoundingClientRect().width / (stageScale || 1);
      setDragBoardView({ size, isSupport: state.isSupport, active: true });
    } else {
      // Keep the last measured size so the board layer fades back out instead of
      // vanishing the instant the pointer leaves a legal cell.
      setDragBoardView((current) =>
        current ? { ...current, active: false } : null
      );
    }
  }

  function handleHandCardPointerUp(
    event: React.PointerEvent<HTMLButtonElement>
  ) {
    const state = dragPointerStartRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No capture was held — nothing to release.
    }

    dragPointerStartRef.current = null;

    // Plain tap (no movement past the threshold): let the click handler run the
    // existing select-then-place flow.
    if (!state.dragging) return;

    dragHappenedRef.current = true;
    setDragCard(null);
    setDragPointer(null);
    setDragBoardView(null);

    const target = findHandCardDropTarget(event.clientX, event.clientY);

    // Clearing the selection cancels the pick-up; the play command below reads
    // the card straight from the hand by id, so it is unaffected by this.
    selectCard(null);

    if (!target) return;

    // The dragged ghost has already carried the card to the target, so skip the
    // hand→cell fly animation and drop it straight onto the cell.
    if (target.type === "cell" && !state.isSupport) {
      enqueueBattleCommand(() =>
        executeQueuedPlayCard(state.cardInstanceId, target.position, {
          skipSpawnAnimation: true,
        })
      );
    } else if (
      target.type === "support" &&
      state.isSupport &&
      target.owner === humanPlayerId
    ) {
      enqueueBattleCommand(() =>
        executeQueuedPlaySupportCard(state.cardInstanceId, target.supportSlot, {
          skipSpawnAnimation: true,
        })
      );
    }
  }

  function handleHandCardPointerCancel(
    event: React.PointerEvent<HTMLButtonElement>
  ) {
    const state = dragPointerStartRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    dragPointerStartRef.current = null;

    if (!state.dragging) return;

    dragHappenedRef.current = true;
    setDragCard(null);
    setDragPointer(null);
    setDragBoardView(null);
    selectCard(null);
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

    flushSync(() => {
      setSuppressedAttackTarget({ type: targetType, id: targetId });
      setHoveredAttackTarget((current) =>
        current?.type === targetType && current.id === targetId ? null : current
      );
    });
    enqueueBattleCommand(() => executeQueuedAttack(attackAction));
  }


  function getNextTurnFuel(owner: PlayerId): number {
    // Reuse the engine's calculation so the projected income matches exactly
    // what the next turn will generate — including HQ-ability fuel (Combined
    // Arms) and national-ability fuel (Германия «Система»: full rear line → +1).
    return calculateFuelGeneration(battle as BattleState, owner);
  }

  function renderTurnControlPanel(placement: "board" | "column" = "board") {
    const activeOwner =
      mode === "pvp"
        ? pvpTimer.activePlayer ?? battle.activePlayer
        : battle.activePlayer;
    const timer = battle.timers?.[activeOwner];
    const pvpTimeLeftMs =
      pvpTimer.activePlayer === activeOwner ? pvpTimer.remainingMs : null;
    const displayedTimeLeftMs =
      mode === "pvp" ? pvpTimeLeftMs : timer?.stepTimeLeftMs ?? null;
    const isLocalPlayer = activeOwner === humanPlayerId;

    if (displayedTimeLeftMs === null) return null;

    return (
      <div
        style={{
          ...(placement === "column"
            ? styles.turnControlPanelInline
            : {
                ...styles.turnControlPanel,
                left: `calc(100% + ${boardCellSize + BOARD_CELL_GAP + 12}px)`,
                top: `calc(50% + ${2 * (boardCellSize + BOARD_CELL_GAP)}px)`,
              }),
        }}
      >
        <div
          style={{
            ...styles.turnControlLabel,
            ...(isLocalPlayer
              ? styles.turnControlLabelPlayer
              : styles.turnControlLabelEnemy),
          }}
        >
          {isLocalPlayer ? t("battle.playerTurn") : t("battle.enemyTurn")}
        </div>

        <BattleTimerPanel
          active
          showPlayerReminder={false}
          timeLeftMs={displayedTimeLeftMs}
        />

        <button
          type="button"
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
          aria-disabled={debugPaused || !isHumanTurn}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            enqueueBattleCommand(executeQueuedEndTurn);
          }}
        >
          {t("battle.endTurn")}
        </button>
      </div>
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
                <div style={styles.startRollText}>{t("battle.rollFirstTurn")}</div>

                <motion.img
                  src={cartridgeImage}
                  alt={t("battle.rollAlt")}
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
      {renderCommanderNick(opponentPlayerId)}

      {renderDeckAvatarStack(opponentPlayerId, "enemy")}

      <div style={styles.enemyFuelOnly}>
        {(() => {
          const flag = getBattleFlagAsset(
            getHeadquartersDefinition(getHeadquartersIdForOwner(opponentPlayerId))
              .nation
          );

          if (!flag) return null;

          // Enemy flag staked by the HQ but drawn behind the fuel indicator
          // (fuelPanelOverFlag, zIndex 1) so the fuel stays readable. Shifted
          // down-left toward the HQ and mirrored to match the player's flag.
          return (
            <img
              src={flag}
              alt=""
              aria-hidden
              draggable={false}
              style={styles.fuelBattleFlag}
            />
          );
        })()}

        <div style={styles.fuelPanelOverFlag}>
          <FuelPanel
            ownerId={getVisualOwnerId(opponentPlayerId)}
            currentFuel={battle[opponentPlayerId].resources}
            nextTurnFuel={getNextTurnFuel(opponentPlayerId)}
          />
        </div>
      </div>

      {renderTurnControlPanel("column")}
    </div>
  );
}

  // The headquarters now lives in the central cell of the rear strip (off the
  // battlefield grid). Rendered here so it lines up with the middle board row
  // and keeps all of its attack/targeting wiring.
  function renderRearHqCell(owner: PlayerId) {
    const hq = battle.headquarters[owner];
    const hqId = `${owner}_hq`;
    const canBeTarget = isTarget("headquarters", hqId);
    const showTargetGlow = shouldShowAttackTargetGlow("headquarters", hqId);
    const hqAttackValue = getVisibleHeadquartersAttackValue(battle, owner);
    const isAttacking = attackingId === hqId;
    const hitReaction =
      hitReactionEffect?.targetId === hqId ? hitReactionEffect : null;
    const isSelected =
      selectedAttacker?.type === "headquarters" && selectedAttacker.id === hqId;

    return (
      <motion.button
        type="button"
        ref={setObjectRef(objectRefs, hqId)}
        key={hqId}
        className={
          tutorialHighlights && isTutorialHqHighlighted(owner)
            ? "tutorial-highlight-pulse"
            : undefined
        }
        style={{
          ...styles.cell,
          width: boardCellSize,
          height: boardCellSize,
          order: 2,
          zIndex: 6,
          ...styles.occupiedCell,
          ...(owner === humanPlayerId ? styles.playerUnit : styles.botUnit),
          // Тыловые клетки без чёрной рамки/тёмной заливки — карта штаба заполняет
          // ячейку сама, подсветка цели рисуется отдельным свечением.
          border: "none",
          boxShadow: "none",
          background: "transparent",
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
          y: hitReaction ? [0, hitReaction.y, -hitReaction.y * 0.32, 0] : 0,
        }}
        exit={{ scale: 0.75, opacity: 0 }}
        transition={
          hitReaction
            ? { duration: 0.34, ease: "easeOut" }
            : { type: "spring", stiffness: 320, damping: 26 }
        }
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onMouseEnter={() => {
          if (!canBeTarget) return;

          setHoveredAttackTarget({ type: "headquarters", id: hqId });
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
            attack: hqAttackValue,
            fuelGeneration: hq.fuelGeneration,
          })
        }
        {...longPressPreviewHandlers({
          type: "headquarters",
          ownerId: owner,
          headquartersId: getHeadquartersIdForOwner(owner),
          hp: hq.hp,
          attack: hqAttackValue,
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
            if (
              selectedAttacker?.type === "headquarters" &&
              selectedAttacker.id === `${humanPlayerId}_hq`
            ) {
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
        <span
          aria-hidden
          style={{
            ...styles.hqAura,
            ...(owner === humanPlayerId
              ? styles.hqAuraFriendly
              : styles.hqAuraEnemy),
          }}
        />

        {/* The enemy flag is drawn behind the enemy fuel indicator instead (see
            renderEnemyDeckWithTimer): the fuel lives in a side column that sits
            below the board, so a flag in this board cell would always cover it.
            Only the player's flag is planted behind the HQ card here. */}
        {owner === humanPlayerId &&
          (() => {
            const flag = getBattleFlagAsset(
              getHeadquartersDefinition(getHeadquartersIdForOwner(owner)).nation
            );

            if (!flag) return null;

            // Planted behind the HQ card art (zIndex below the card) so it only
            // peeks out to the left.
            return (
              <img
                src={flag}
                alt=""
                aria-hidden
                draggable={false}
                style={{ ...styles.hqBattleFlag, ...styles.hqBattleFlagFriendly }}
              />
            );
          })()}

        <motion.div
          style={{ ...styles.boardCardContent, ...styles.rearHqCardContent }}
          animate={{ opacity: hiddenDestroyedObjectIds.has(hqId) ? 0 : 1 }}
          transition={{ duration: 0.18 }}
        >
          <HeadquartersCardView
            ownerId={getVisualOwnerId(owner)}
            headquartersId={getHeadquartersIdForOwner(owner)}
            hp={hq.hp}
            attack={hqAttackValue}
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

        <HqCommandFrame />

        {isSelected && <SelectedCombatObjectGlow />}
        {showTargetGlow && <AttackTargetGlow />}
      </motion.button>
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

    const isFriendly = owner === humanPlayerId;
    // Ник командира теперь живёт в боковой колонке штаба (renderCommanderNick),
    // а не в тыловой полосе у поля боя.

    // The rear strip is a vertical column of five board-sized cells centred on
    // the middle battlefield row. Top→bottom it reads support 0, support 1,
    // headquarters (центр), support 2, support 3 — slots 0 and 3 sit beyond the
    // field's top/bottom edges, the rest line up with the three rows. CSS
    // `order` interleaves the headquarters between the mapped support cells.
    const rearStripOffset = boardCellSize + BOARD_CELL_GAP;

    return (
      <div
        style={{
          ...styles.supportLine,
          ...(isFriendly
            ? { left: -rearStripOffset }
            : { right: -rearStripOffset }),
        }}
      >
        {renderRearHqCell(owner)}

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
          const showTargetGlow = unit
            ? shouldShowAttackTargetGlow("unit", unit.instanceId)
            : false;
          const counterBatteryCallout = unit
            ? getCounterBatteryCallout(unit.instanceId)
            : undefined;
          const isAttacking = unit ? attackingId === unit.instanceId : false;
          const hitReaction =
            unit && hitReactionEffect?.targetId === unit.instanceId
              ? hitReactionEffect
              : null;
          const isStaticSpawn = unit
            ? staticSpawnUnitIds.has(unit.instanceId)
            : false;
          const stagedSupportPreview =
            !unit &&
            stagedDeployPreview?.zone === "support" &&
            stagedDeployPreview.ownerId === owner &&
            stagedDeployPreview.supportSlot === supportSlot
              ? stagedDeployPreview
              : null;
          // Учебный шаг «выставь снабжение»: свободные тыловые слоты игрока
          // мигают как цель размещения, когда карта снабжения уже выбрана.
          const tutorialSupportSlotHighlighted = Boolean(
            tutorialHighlights?.playerSupportSlots &&
              isFriendly &&
              !unit &&
              isTutorialSourceSelected()
          );

          return (
            <motion.button
              key={`${owner}-support-${supportSlot}`}
              ref={setSupportCellRef(owner, supportSlot)}
              type="button"
              className={
                tutorialHighlights &&
                ((unit && isTutorialUnitHighlighted(unit)) ||
                  tutorialSupportSlotHighlighted)
                  ? "tutorial-highlight-pulse"
                  : undefined
              }
              style={{
                ...styles.supportCell,
                width: boardCellSize,
                height: boardCellSize,
                // Leave order 2 for the headquarters: slots 0,1 stay above it,
                // slots 2,3 fall below it.
                order: supportSlot < 2 ? supportSlot : supportSlot + 1,
                ...(unit || stagedSupportPreview ? styles.supportUnitCell : {}),
                ...(canPlace ? styles.supportCellAvailable : {}),
                ...(canBeTarget ? styles.targetCell : {}),
                ...(tutorialHighlights
                  ? (unit && isTutorialUnitHighlighted(unit)) ||
                    tutorialSupportSlotHighlighted
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
                style={{
                  ...styles.supportCellSurface,
                  // Тыловые ячейки красятся в тот же цвет, что и клетки спавна:
                  // зелёный у игрока, красный у противника.
                  background: isFriendly
                    ? "linear-gradient(135deg, rgba(35, 66, 36, 0.24), rgba(8, 13, 8, 0.36))"
                    : "linear-gradient(135deg, rgba(92, 32, 32, 0.22), rgba(23, 8, 8, 0.36))",
                }}
                animate={
                  canPlace
                    ? {
                        background: [
                          "linear-gradient(135deg, rgba(52, 84, 56, 0.5), rgba(17, 27, 18, 0.42))",
                          "linear-gradient(135deg, rgba(68, 110, 70, 0.6), rgba(22, 38, 23, 0.5))",
                          "linear-gradient(135deg, rgba(52, 84, 56, 0.5), rgba(17, 27, 18, 0.42))",
                        ],
                      }
                    : undefined
                }
                transition={
                  canPlace
                    ? { duration: 2.5, ease: "easeInOut", repeat: Infinity }
                    : undefined
                }
              />

              <AnimatePresence initial={false}>
                {stagedSupportPreview && (
                  <motion.div
                    key={stagedSupportPreview.instanceId}
                    ref={setObjectRef(
                      objectRefs,
                      stagedSupportPreview.instanceId
                    )}
                    style={{
                      ...styles.boardCardContent,
                      ...styles.supportCardContent,
                    }}
                    initial={{ opacity: 1, scale: 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.72 }}
                    transition={{ duration: 0 }}
                  >
                    <TankCardView
                      card={getCard(stagedSupportPreview.cardId)}
                      variant="board"
                      ownerId={getVisualOwnerId(stagedSupportPreview.ownerId)}
                      currentHp={getCard(stagedSupportPreview.cardId).hp}
                      attackValue={getCard(stagedSupportPreview.cardId).attack}
                      borderlessBoard
                      alreadyMoved
                      alreadyAttacked
                      suppressExhaustedDim
                    />
                  </motion.div>
                )}
                {unit && card && (
                  <motion.div
                    key={unit.instanceId}
                    ref={setObjectRef(objectRefs, unit.instanceId)}
                    style={{
                      ...styles.boardCardContent,
                      ...styles.supportCardContent,
                    }}
                    initial={isStaticSpawn ? false : { opacity: 0, scale: 0.82 }}
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
                      attackValue={getVisibleUnitAttackValue(battle, unit)}
                      borderlessBoard
                      alreadyMoved
                      alreadyAttacked
                      suppressExhaustedDim
                      healthDamageEffect={getHealthDamageEffect(
                        unit.instanceId
                      )}
                      healthGainEffect={getHealthGainEffect(unit.instanceId)}
                      attackChangeEffect={getAttackChangeEffect(
                        unit.instanceId
                      )}
                      healthPreviewValue={combatForecast.get(unit.instanceId)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {counterBatteryCallout && (
                  <CounterBatteryCallout
                    key={counterBatteryCallout.id}
                    friendly={counterBatteryCallout.ownerId === humanPlayerId}
                  />
                )}
              </AnimatePresence>

              {showTargetGlow && <AttackTargetGlow />}
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
  const resultRestartLabel = t("battle.toMenu");
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

      {!tutorialActive &&
      battle.status !== "player_won" &&
      battle.status !== "bot_won" &&
      !missionMinimalBattleControls ? (
        <button
          type="button"
          style={{ ...styles.surrenderButton, ...styles.surrenderCornerPos }}
          onClick={handleSurrenderClick}
        >
          <span style={styles.surrenderButtonText}>{t("battle.surrender")}</span>
        </button>
      ) : null}

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
  <div
    style={{
      ...styles.enemyHandClip,
      width: getEnemyHandSafeWidth(),
      minWidth: getEnemyHandSafeWidth(),
      maxWidth: getEnemyHandSafeWidth(),
    }}
  >
    <div style={styles.enemyHandCardMask}>
      <AnimatePresence initial={false}>
        {battle[opponentPlayerId].hand.map((cardInstance, index) => {
          const isHidden =
            hiddenDrawnCardIds.has(cardInstance.instanceId) ||
            isNewlyDrawnCard(opponentPlayerId, cardInstance.instanceId) ||
            hiddenSpawningCardIds.has(cardInstance.instanceId);
          const handCount = battle[opponentPlayerId].hand.length;
          const handCenter = (handCount - 1) / 2;
          const rotation = (index - handCenter) * 2.4;
          const isPulledCard = visibleOpponentPulledCardIndex === index;
          // Same animated-`x` slot positioning as the player hand (see there for
          // why framer `layout` is avoided under the scaled stage).
          const slotX = (index - handCenter) * getEnemyHandSlotStep(handCount);

          return (
            <motion.div
              key={`bot-hand-${cardInstance.instanceId}`}
              ref={setHandCardRef(opponentPlayerId, cardInstance.instanceId)}
              style={{
                ...styles.cardBack,
                ...styles.enemyHandCardSlot,
                backgroundImage: `url(${cardBackImage})`,
                opacity: isHidden ? 0 : 1,
                zIndex: index + 1,
                filter: isPulledCard ? "brightness(1.08)" : "none",
                boxShadow: "none",
              }}
              initial={{
                opacity: 0,
                y: -10,
                x: slotX,
                rotate: rotation,
                scale: 1,
              }}
              animate={{
                opacity: isHidden ? 0 : 1,
                x: slotX,
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
                ...HAND_CARD_TRANSITION,
                // Hide instantly when the card flies out (spawn/draw) so no ghost
                // lingers behind the flying clone; fade back in on reveal.
                opacity: { duration: isHidden ? 0 : 0.18 },
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
  <div style={styles.playerFuelNearDeck}>
    <FuelPanel
      ownerId={getVisualOwnerId(humanPlayerId)}
      currentFuel={battle[humanPlayerId].resources}
      nextTurnFuel={getNextTurnFuel(humanPlayerId)}
    />
  </div>

  {renderDeckAvatarStack(humanPlayerId, "player")}

  {renderCommanderNick(humanPlayerId)}
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
          <div style={styles.startRollText}>{t("battle.rollFirstTurn")}</div>

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
        ...(turnBannerText === t("battle.enemyTurn") ? styles.enemyTurnBanner : {}),
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

            <motion.div ref={boardRef} style={styles.board}>
              {/* Rear strips live inside the board so they centre on the board's
                  own middle row (boardShell is stretched taller by the side
                  panels, so positioning against it would offset the column). */}
              {renderSupportLine(humanPlayerId)}
              {renderSupportLine(opponentPlayerId)}

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
                            attackValue={(() => {
                              const movingUnit = battle.units.find(
                                (item) =>
                                  item.instanceId === movementUnitEffect.unitId
                              );

                              return movingUnit
                                ? getUnitDisplayAttackValue(
                                    battle as BattleState,
                                    movingUnit
                                  )
                                : undefined;
                            })()}
                            alreadyMoved={movementUnitEffect.alreadyMoved}
                            alreadyAttacked={movementUnitEffect.alreadyAttacked}
                            camouflaged={(() => {
                              const movingUnit = battle.units.find(
                                (item) =>
                                  item.instanceId === movementUnitEffect.unitId
                              );

                              return (
                                !!getCard(movementUnitEffect.cardId)
                                  .combatAbilities?.camouflage &&
                                !!movingUnit &&
                                !movingUnit.revealed
                              );
                            })()}
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

              {visualRows.flatMap((row) => visualCols.map((col) => (
                <div key={`${row}-${col}`} style={{ display: "contents" }}>
                  {(() => {
                  const position: Position = { row, col };

                  const unit = battle.units.find((item) =>
                    isBattlefieldUnit(item) && samePosition(item.position, position)
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
                    const showTargetGlow = shouldShowAttackTargetGlow(
                      "unit",
                      unit.instanceId
                    );
                    const counterBatteryCallout = getCounterBatteryCallout(
                      unit.instanceId
                    );
                    const combo = combinationByUnitId.get(unit.instanceId);
                    const defenseChange = getDefenseChangeEffect(
                      unit.instanceId
                    );
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
                    const isStaticSpawn = staticSpawnUnitIds.has(
                      unit.instanceId
                    );
                    const mountsStatically =
                      isMovingUnitHidden || isStaticSpawn;

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
                        initial={
                          mountsStatically
                            ? { scale: 1, opacity: 1 }
                            : { scale: 0.88, opacity: 0 }
                        }
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
                          mountsStatically
                            ? { duration: 0 }
                            : hitReaction
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
                          initial={mountsStatically ? false : undefined}
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
                            attackValue={getVisibleUnitAttackValue(battle, unit)}
                            // Тыловые/слотовые юниты рисуются без рамки —
                            // боевые юниты на поле выглядели иначе из-за тёмной
                            // окантовки (2px бордюр + чёрная тень-гало). Убираем
                            // её, чтобы юнит на линии тыла не «висел» в чёрной
                            // рамке и совпадал с видом слотовых юнитов.
                            borderlessBoard
                            selected={isSelected}
                            alreadyMoved={unit.alreadyMoved}
                            alreadyAttacked={unit.alreadyAttacked}
                            camouflaged={
                              !!card.combatAbilities?.camouflage &&
                              !unit.revealed
                            }
                            healthDamageEffect={getHealthDamageEffect(
                              unit.instanceId
                            )}
                            healthGainEffect={getHealthGainEffect(
                              unit.instanceId
                            )}
                            attackChangeEffect={getAttackChangeEffect(
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

                        {combo && (
                          <NationalComboGlow
                            orientation={combo.orientation}
                            isAllied={combo.isAllied}
                          />
                        )}

                        <AnimatePresence>
                          {counterBatteryCallout && (
                            <CounterBatteryCallout
                              key={counterBatteryCallout.id}
                              friendly={
                                counterBatteryCallout.ownerId === humanPlayerId
                              }
                            />
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {defenseChange && (
                            <motion.span
                              key={defenseChange.id}
                              style={{
                                ...styles.defenseChangeIndicator,
                                color:
                                  defenseChange.amount > 0
                                    ? "#79f09b"
                                    : "#ff8079",
                              }}
                              initial={{ opacity: 0, y: 4, scale: 0.7 }}
                              animate={{
                                opacity: [0, 1, 1, 0],
                                y: [4, -3, -10, -18],
                                scale: [0.7, 1.12, 1, 0.92],
                              }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 1.02, ease: "easeOut" }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="13"
                                height="13"
                                aria-hidden="true"
                                style={{ flex: "0 0 auto" }}
                              >
                                <path
                                  d="M12 2 4 5v6c0 4.4 3.1 8.2 8 9 4.9-.8 8-4.6 8-9V5l-8-3Z"
                                  fill="rgba(120, 235, 150, 0.22)"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              {defenseChange.amount > 0
                                ? `+${defenseChange.amount}`
                                : defenseChange.amount}
                            </motion.span>
                          )}
                        </AnimatePresence>

                        {isSelected && <SelectedCombatObjectGlow />}
                        {showTargetGlow && <AttackTargetGlow />}
                      </motion.button>
                    );
                  }

                  const stagedBattlefieldPreview =
                    stagedDeployPreview?.zone === "battlefield" &&
                    samePosition(stagedDeployPreview.position, position)
                      ? stagedDeployPreview
                      : null;

                  if (stagedBattlefieldPreview) {
                    const previewCard = getCard(stagedBattlefieldPreview.cardId);

                    return (
                      <motion.button
                        type="button"
                        ref={setObjectRef(
                          objectRefs,
                          stagedBattlefieldPreview.instanceId
                        )}
                        key={stagedBattlefieldPreview.instanceId}
                        style={{
                          ...styles.cell,
                          zIndex: 6,
                          ...(ownSpawn ? styles.spawnCell : {}),
                          ...(enemySpawn ? styles.botSpawnCell : {}),
                          ...styles.occupiedCell,
                          ...(stagedBattlefieldPreview.ownerId === humanPlayerId
                            ? styles.playerUnit
                            : styles.botUnit),
                        }}
                        initial={{ scale: 1, opacity: 1 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.75, opacity: 0 }}
                        transition={{ duration: 0 }}
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

                        <motion.div style={styles.boardCardContent}>
                          <TankCardView
                            card={previewCard}
                            variant="board"
                            ownerId={getVisualOwnerId(
                              stagedBattlefieldPreview.ownerId
                            )}
                            currentHp={previewCard.hp}
                            attackValue={previewCard.attack}
                            borderlessBoard
                            alreadyMoved={false}
                            alreadyAttacked={false}
                          />
                        </motion.div>
                      </motion.button>
                    );
                  }

                  const moveCell =
                    isMoveCell(position) &&
                    (!tutorialRestrictsMove ||
                      isTutorialCellHighlighted(position));
                  // During a scripted spawn step the tutorial allows exactly one
                  // cell, so only that cell shows the green placement pulse — the
                  // rest are dimmed, keeping a single blinking target on screen.
                  const tutorialRestrictsSpawn = Boolean(
                    tutorialHighlights?.cells?.length
                  );
                  const canPlaceBattlefieldCard =
                    placingBattlefieldCard &&
                    ownSpawn &&
                    (!tutorialRestrictsSpawn || isTutorialCellHighlighted(position));

                  return (
  <motion.button
    type="button"
    ref={setCellRef(position)}
    key={`${row}-${col}`}
    className={
      tutorialHighlights && isTutorialCellHighlighted(position)
        ? "tutorial-highlight-pulse"
        : undefined
    }
    style={{
      ...styles.cell,
      ...styles.emptyCell,
      ...(ownSpawn ? styles.spawnCell : {}),
      ...(enemySpawn ? styles.botSpawnCell : {}),
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
                  })()}
                </div>
              )))}
            </motion.div>
          </section>

          <aside style={styles.rightCommandPanel}>
  <div style={styles.enemySideColumn}>
    {renderEnemyDeckWithTimer()}
  </div>

  <div style={styles.actionSideColumn}>
            {false && mode === "pvp" && battle.status === "active" ? (
              <button
                type="button"
                style={styles.surrenderButton}
                onClick={handleSurrenderClick}
              >
                {t("battle.surrender")}
              </button>
            ) : null}

            {false && !tutorialActive && mode !== "pvp" && !missionMinimalBattleControls ? (
              <button style={styles.secondaryButton} onClick={reset}>
                {t("battle.newBattle")}
              </button>
            ) : null}

            {false && mode !== "pvp" && !missionMinimalBattleControls ? (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={exitBattleToMenu}
              >
                {t("battle.toMenu")}
              </button>
            ) : null}

            </div>
          </aside>
        </section>

        <section style={styles.playerZone}>
  

          <div
            style={{
              ...styles.playerHandViewport,
              width: getPlayerHandSafeWidth(),
              minWidth: getPlayerHandSafeWidth(),
              maxWidth: getPlayerHandSafeWidth(),
            }}
          >
            <div
  ref={(element) => {
    handRefs.current[humanPlayerId] = element;
  }}
  style={styles.hand}
>
            <AnimatePresence initial={false}>
              {localHand.map((cardInstance, index) => {
                const card = getCard(cardInstance.cardId);
                // Live fuel cost given the board («Слаженность» + HQ discounts).
                const effectiveCardCost = getEffectiveCardCost(
                  battle as BattleState,
                  humanPlayerId,
                  card.id
                );
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
                // The right card stays interactive throughout, but it only
                // blinks in stage 1 — once picked up the spawn cell blinks
                // instead, so a single hint is on screen at any moment.
                const tutorialCardPulsing =
                  tutorialCardHighlighted && !isTutorialSourceSelected();
                const tutorialCardBlocked = Boolean(
                  tutorialHighlights && !tutorialCardHighlighted
                );
                const isBeingDragged =
                  dragCard?.cardInstanceId === cardInstance.instanceId;

                // Cards are positioned by an animated `x` transform instead of
                // flow margins + framer `layout`. The whole UI lives inside a
                // scaled/rotated GameStage, and framer's layout projection
                // miscalculates under a transformed ancestor (positions snap
                // instead of tweening). A child-local `x` transform is immune to
                // that — framer interpolates the value directly. The slot math
                // mirrors the previous margin layout so resting positions match.
                const handCount = localHand.length;
                const slotStep = getPlayerHandSlotStep(handCount);
                const slotX = (index - (handCount - 1) / 2) * slotStep;

                return (
                  <motion.button
                    key={cardInstance.instanceId}
                    ref={setHandCardRef(humanPlayerId, cardInstance.instanceId)}
                    className={
                      tutorialCardPulsing
                        ? "tutorial-highlight-pulse"
                        : undefined
                    }
                    style={{
                      ...styles.card,
                      ...styles.handCardSlot,
                      // Stop touch-drags from being hijacked as page scroll/zoom
                      // so the pointer drag-to-play gesture works on the phone
                      // stage (see the rotated-stage gesture notes). The
                      // selection/callout suppression also keeps the OS
                      // long-press from cancelling the card peek.
                      touchAction: "none",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      WebkitTouchCallout: "none",
                      zIndex: selected || isBeingDragged ? 120 : index + 1,
                      pointerEvents:
                        isHiddenDrawnCard ||
                        isHiddenSpawningCard ||
                        tutorialCardBlocked
                          ? "none"
                          : "auto",
                      ...(tutorialCardPulsing
                        ? styles.tutorialHighlight
                        : {}),
                      ...(tutorialCardBlocked ? styles.tutorialDimmedBoard : {}),
                    }}
                    initial={{ opacity: 0, y: 16, x: slotX }}
                    animate={{
                      opacity:
                        isHiddenDrawnCard || isHiddenSpawningCard
                          ? 0
                          : isBeingDragged
                            ? 0.32
                            : 1,
                      y: 0,
                      x: slotX,
                    }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{
                      ...HAND_CARD_TRANSITION,
                      // Hide instantly when the card leaves for the battlefield
                      // (or the draw fly-in) so the flying clone takes over with
                      // no ghost lingering in the hand; fade back in on reveal.
                      opacity: {
                        duration:
                          isHiddenDrawnCard || isHiddenSpawningCard ? 0 : 0.18,
                      },
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
                    onPointerDown={(event) =>
                      handleHandCardPointerDown(event, cardInstance, card)
                    }
                    onPointerMove={handleHandCardPointerMove}
                    onPointerUp={handleHandCardPointerUp}
                    onPointerCancel={handleHandCardPointerCancel}
                    onClick={() => {
                      // A completed drag fires a trailing click — swallow it so
                      // the card is not also toggled in/out of selection.
                      if (dragHappenedRef.current) {
                        dragHappenedRef.current = false;
                        return;
                      }
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
                      effectiveCost={effectiveCardCost}
                      selected={selected}
                      disabled={
                        debugPaused ||
                        battle.activePlayer !== humanPlayerId ||
                        battle[humanPlayerId].resources < effectiveCardCost
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
        dragCard && dragPointer ? (
          // The dragged card "ghost" follows the pointer. It is portaled to
          // <body> (outside the scaled/rotated stage) and re-applies the stage
          // transform so it matches the in-game card size, exactly like the
          // long-press preview. The outer node is a zero-size anchor at the
          // pointer; each card layer centers itself over it (translate(-50%,
          // -70%) also lifts it above the finger) and the two cross-fade as the
          // ghost moves on/off a legal drop target.
          <div
            style={{
              position: "fixed",
              left: dragPointer.x,
              top: dragPointer.y,
              zIndex: 1000,
              pointerEvents: "none",
              transform: `rotate(${stageRotation}deg) scale(${stageScale})`,
              transformOrigin: "center center",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: HAND_CARD_WIDTH,
                transform: "translate(-50%, -70%)",
                opacity: dragBoardView?.active ? 0 : 1,
                transition: "opacity 0.16s ease",
              }}
            >
              <HandCardView
                card={getCard(dragCard.cardId)}
                ownerId={getVisualOwnerId(humanPlayerId)}
                selected
              />
            </div>

            {/* Always mounted during the drag (at zero size / opacity until a
                target is entered) so its opacity can transition from 0 — a
                freshly mounted layer would otherwise pop straight to full. */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: dragBoardView?.size ?? 0,
                height: dragBoardView?.size ?? 0,
                transform: "translate(-50%, -70%)",
                opacity: dragBoardView?.active ? 1 : 0,
                transition: "opacity 0.16s ease",
              }}
            >
              <TankCardView
                card={getCard(dragCard.cardId)}
                variant="board"
                ownerId={getVisualOwnerId(humanPlayerId)}
                borderlessBoard={dragCard.isSupport}
              />
            </div>
          </div>
        ) : null,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {cardPreview && (
            <motion.div
              style={styles.cardPreviewOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onPointerDown={handleCardPreviewBackdropPointerDown}
              onContextMenu={(event) => {
                // Swallow the OS long-press/context menu but do NOT close: the
                // peek opens (our 420ms timer) while the finger is still down,
                // so the native long-press `contextmenu` lands here on the
                // backdrop a moment later — closing on it made the peek flash
                // open then vanish. Dismissal is a fresh tap / Esc / × only.
                event.preventDefault();
              }}
            >
              {/* Static wrapper carrying the exact stage transform (uniform
                  scale + rotation) so the fixed-size panel below renders
                  identically to desktop, just fit to the device like the game. */}
              <div
                style={{
                  transform: `rotate(${stageRotation}deg) scale(${stageScale})`,
                  transformOrigin: "center center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
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
                  onPointerDown={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <CardKeywordsPanel
                    keywords={
                      cardPreview.type === "unit"
                        ? getCardKeywords(getCard(cardPreview.cardId), language)
                        : getHeadquartersKeywords(
                            getHeadquartersAbility(cardPreview.headquartersId),
                            getHeadquartersDefinition(cardPreview.headquartersId)
                              .nation,
                            language
                          )
                    }
                  />

                  <button
                    type="button"
                    style={styles.cardPreviewClose}
                    onClick={closeCardPreview}
                    aria-label={t("battle.closeCardPreview")}
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
                    Удерживайте карту или ПКМ/Esc — закрыть
                  </div>
                </motion.div>
              </div>
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
          avatarSrc={
            tutorialScriptId === "welcome_kursk"
              ? campaignBriefingAvatar
              : undefined
          }
          speakerName={
            tutorialScriptId === "welcome_kursk" ? campaignSpeaker : undefined
          }
          centered
        />
      ) : null}

      {tutorialActive &&
      isStandaloneTutorialScript(tutorialScriptId) &&
      battle.status === "player_won" &&
      !tutorialEpilogueSeen ? (
        <TutorialOverlay
          kind="dialogue"
          text={getTutorialEpilogueText(tutorialScriptId, language)}
          visible
          onNext={completeTutorialEpilogue}
          nextLabel={language === "en" ? "Rewards" : "К наградам"}
          centered
        />
      ) : null}

      {/* Campaign commander briefs the mission before we roll for the first
          turn and start the timer. Shown during the pre-battle "starting" phase
          (and "active" as a fallback) until dismissed. */}
      {mode === "campaign" &&
      missionBriefingText &&
      (battle.status === "starting" || battle.status === "active") &&
      !briefingDismissed ? (
        <TutorialOverlay
          kind="dialogue"
          text={missionBriefingText}
          visible={!startRollState.visible}
          avatarSrc={campaignBriefingAvatar}
          speakerName={campaignSpeaker}
          onNext={() => setBriefingDismissed(true)}
          nextLabel={language === "en" ? "To Battle" : "В бой"}
          centered={missionCenteredDialogue}
        />
      ) : null}

      {/* Campaign commander debriefs the outcome before the result screen. */}
      {mode === "campaign" &&
      missionDebriefText &&
      (battle.status === "player_won" || battle.status === "bot_won") &&
      !debriefDismissed ? (
        <TutorialOverlay
          kind="dialogue"
          text={missionDebriefText}
          visible
          avatarSrc={campaignBriefingAvatar}
          speakerName={campaignSpeaker}
          onNext={() => setDebriefDismissed(true)}
          nextLabel={
            missionSkipResultScreen
              ? language === "en"
                ? "Next"
                : "Далее"
              : language === "en"
                ? "Results"
                : "К результатам"
          }
          centered={missionCenteredDialogue}
        />
      ) : null}

      {/* Scripted ending: triumphant reward reveal, then back to the main menu. */}
      {endRewardCards ? (
        <RewardCelebrationOverlay
          cards={endRewardCards}
          label={language === "en" ? "Reward" : "Награда"}
          tone="reward"
          onClose={completeTrailerAndExit}
        />
      ) : null}

      {(battle.status === "player_won" || battle.status === "bot_won") &&
        !missionSkipResultScreen &&
        (!tutorialActive ||
          battle.status === "bot_won" ||
          tutorialEpilogueSeen) &&
        !(
          mode === "campaign" &&
          missionDebriefText &&
          !debriefDismissed
        ) && (
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

  counterBatteryCallout: {
    position: "absolute",
    left: "50%",
    top: -18,
    zIndex: 62,
    fontSize: 13,
    fontWeight: 1000,
    letterSpacing: 1.3,
    lineHeight: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },

  counterBatteryCalloutFriendly: {
    color: "#7dff8a",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 10px rgba(125,255,138,0.95), 0 0 22px rgba(125,255,138,0.62)",
  },

  counterBatteryCalloutEnemy: {
    color: "#ff4d4d",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 10px rgba(255,77,77,0.95), 0 0 22px rgba(255,77,77,0.62)",
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
  height: 196,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  overflow: "visible",
  position: "relative",
  // Hands are centred on the full game table, but the board sits ~74px right of
  // that centre (asymmetric 150/300 side panels). Shift left by 74px so the hand
  // lands centred between the rear strip's left/right protruding cells (= board
  // centre). translateY(-18px) keeps the original vertical nudge.
  transform: "translate(-24px, 8px)",
  zIndex: 20,
  background: "transparent",
  border: "none",
  boxShadow: "none",
  // Рука врага (рубашки карт) — некликабельна, поэтому пропускаем клики: её
  // полоса у края экрана перекрывала правый край верхних тыловых ячеек.
  pointerEvents: "none",
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
  height: 196,
  overflow: "visible",
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
  transform: "translateY(-68px)",
  paddingLeft: 58,
  paddingRight: 58,
},

// Absolute slot centered on the (transformed) enemy hand mask; the animated
// per-card `x` transform fans the row out. See styles.handCardSlot.
enemyHandCardSlot: {
  position: "absolute",
  left: "50%",
  top: 0,
  marginLeft: -(104 / 2),
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
  gap: 8,
  alignItems: "center",
  // Аватар штаба игрока с колодой и ником опущены к низу экрана; ник оказывается
  // у нижней границы с небольшим отступом.
  justifyContent: "flex-end",
  paddingBottom: 10,
  alignSelf: "stretch",
  minHeight: 0,
  transform: "translate(-12px, 110px)",
  // Колонка штаба прозрачна для кликов: аватар/колода/ник пропускают нажатия на
  // тыловые ячейки поля, перекрываемые этой колонкой. Интерактивные кнопки
  // (сдаться) сами включают pointerEvents:auto.
  pointerEvents: "none",
},

  rightCommandPanel: {
  display: "grid",
  gridTemplateColumns: "190px 96px",
  gap: 10,
  alignItems: "stretch",
  alignSelf: "stretch",
  // Без собственного z-index: иначе панель создаёт единый слой над доской и
  // затягивает наверх колонку штаба (enemySideColumn, z5), из-за чего аватар
  // штаба врага налезает на тыловые юниты. Без него дети раскладываются в
  // контексте centerBattleArea: enemySideColumn (z5) уходит ПОД доску
  // (boardShell, z20), а actionSideColumn (z60) остаётся над ней.
  // Прозрачна для кликов (как и колонка игрока): аватар/колода/топливо/ник
  // пропускают нажатия на тыловые ячейки врага под ними. Кликаются только
  // кнопки (конец хода, пауза), включающие pointerEvents:auto у себя.
  pointerEvents: "none",
},

enemySideColumn: {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  height: "100%",
  minHeight: 0,
  transform: "translate(70px, -74px)",
  // Колонка штаба врага (аватар + колода) уходит ЗА поле боя, чтобы не
  // перекрывать верхние тыловые клетки. Доска (boardShell, z=20) рисуется
  // поверх. Таймер/«Конец хода» висят ниже доски и остаются кликабельными.
  zIndex: 5,
  pointerEvents: "none",
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
  pointerEvents: "none",
},
  boardShell: {
    position: "relative",
    zIndex: 20,
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

  // Vertical rear column, centred on the middle battlefield row so the five
  // cells straddle the three rows symmetrically (the headquarters cell lands on
  // the centre row). The horizontal offset is applied inline from the measured
  // cell size. Gap matches the board's BOARD_CELL_GAP.
  supportLine: {
    position: "absolute",
    top: "50%",
    zIndex: 12,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    transform: "translateY(-50%)",
  },

  // Имя командира выводится за пределами потока тыловой колонки, чтобы не
  // сдвигать ячейки тыла относительно рядов игрового поля.
  commanderName: {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.5,
    lineHeight: 1.1,
    textAlign: "center",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },

  playerCommanderName: {
    top: "100%",
    marginTop: 8,
    color: "#7dff8a",
    textShadow:
      "0 2px 4px rgba(0,0,0,0.92), 0 0 12px rgba(125,255,138,0.45)",
  },

  enemyCommanderName: {
    bottom: "100%",
    marginBottom: 1,
    marginLeft: 62,
    transform: "translateX(calc(-50% + 62px))",
    color: "#ff6b6b",
    textShadow:
      "0 2px 4px rgba(0,0,0,0.92), 0 0 12px rgba(255,107,107,0.45)",
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
    // See styles.cell — keep the OS long-press from cancelling the card peek.
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
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
    // Без чёрной рамки/тёмной заливки у тыловых ячеек: лёгкая заливка без
    // обводки (свечение доступного слота даёт отдельная анимация фона).
    background:
      "linear-gradient(135deg, rgba(50, 58, 52, 0.28), rgba(17, 21, 18, 0.22))",
    boxShadow: "none",
  },

 board: {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(127px, 1fr))",
  gap: 4,
  alignItems: "stretch",
  transform: "translate(40px, 65px)",
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
  // Stop the browser's native long-press (text selection / callout / context
  // menu) from firing `touchcancel`, which would instantly dismiss the
  // long-press card peek the instant it opens. Also disables native panning so
  // the gesture stays ours on the rotated phone stage.
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
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

  rearHqCardContent: {
    pointerEvents: "none",
  },

  // National flag staked behind the HQ card art. Sits at zIndex 0 (below the
  // boardCardContent at zIndex 1) so the HQ image covers most of it and only a
  // tilted sliver peeks out past one edge.
  hqBattleFlag: {
    position: "absolute",
    bottom: "56%",
    width: "62%",
    height: "auto",
    zIndex: 0,
    pointerEvents: "none",
    // Flip/rotate around the bottom centre so a horizontal mirror keeps the flag
    // box in place (a corner origin would slide the enemy flag back under the HQ
    // card and hide it).
    transformOrigin: "center bottom",
    filter: "brightness(0.82) saturate(0.92) drop-shadow(0 2px 4px rgba(0,0,0,0.55))",
    opacity: 0.95,
  },

  hqBattleFlagFriendly: {
    left: "-46%",
    transform: "scaleX(-1) rotate(31deg)",
  },

  // True horizontal mirror of the friendly flag: scaleX wraps the same rotation
  // so the enemy flag leans symmetrically and peeks out on the right.
  hqBattleFlagEnemy: {
    right: "-46%",
    transform: "rotate(31deg)",
  },

  // Soft side-coloured halo bleeding past the HQ cell (overflow:visible) so the
  // command centre glows green (player) / red (enemy) against the dark rear.
  hqAura: {
    position: "absolute",
    inset: -11,
    zIndex: 0,
    borderRadius: "50%",
    pointerEvents: "none",
  },

  hqAuraFriendly: {
    background:
      "radial-gradient(circle, rgba(80, 255, 130, 0.24), rgba(80, 255, 130, 0.07) 55%, transparent 72%)",
  },

  hqAuraEnemy: {
    background:
      "radial-gradient(circle, rgba(255, 70, 55, 0.24), rgba(255, 70, 55, 0.07) 55%, transparent 72%)",
  },

  // Brass command frame: thin gold border + L-shaped corner brackets.
  hqCommandFrame: {
    position: "absolute",
    inset: 1,
    zIndex: 9,
    pointerEvents: "none",
    border: "1.5px solid rgba(247, 215, 116, 0.5)",
    boxShadow:
      "inset 0 0 7px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(120, 90, 28, 0.45)",
  },

  hqFrameCorner: {
    position: "absolute",
    width: 11,
    height: 11,
    borderStyle: "solid",
    borderColor: "rgba(247, 215, 116, 0.95)",
    borderWidth: 0,
  },

  hqFrameCornerTL: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  hqFrameCornerTR: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  hqFrameCornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  hqFrameCornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },

  supportCardContent: {
    pointerEvents: "none",
  },

  occupiedCell: {
    border: "none",
    background:
      "linear-gradient(135deg, rgba(17, 24, 26, 0.42), rgba(7, 9, 10, 0.34))",
    boxShadow: "none",
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
    inset: -2,
    zIndex: 24,
    border: "2px solid rgba(255, 76, 62, 0.9)",
    borderRadius: 0,
    background:
      "radial-gradient(circle at center, rgba(255, 82, 60, 0.16), rgba(255, 82, 60, 0.06) 45%, transparent 72%)",
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
  transform: "translateY(-260px)",
  overflow: "visible",
  // Поднятая рука игрока перекрывает своей (пустой) областью кнопку «Конец хода»
  // снизу колонки штаба. Делаем секцию прозрачной для кликов, а сами карты руки
  // (playerHandViewport) снова включают pointerEvents:auto — пустое место руки
  // пропускает нажатие на кнопку под ним.
  pointerEvents: "none",
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
    pointerEvents: "auto",
    display: "flex",
    justifyContent: "center",
    // Centre the hand between the rear strip's lower protruding cells (= board
    // centre, ~74px left of the game-table centre), then drop it 4px. Use
    // translate(x, y) — NOT translateX, which only takes one value: 1st value is
    // screen-vertical (larger = lower), 2nd is screen-horizontal.
    transform: "translate(-60px, 120px)",
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

  // Absolute slot centered on the hand container; the per-card `x` transform
  // (animated) places it within the fanned row. Replaces flow margins so the
  // reflow can be tweened without framer's (scale-broken) layout projection.
  handCardSlot: {
    position: "absolute",
    left: "50%",
    top: 0,
    marginLeft: -(175 / 2),
    flex: "0 0 auto",
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
    marginTop: 12,
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
    zIndex: 2,
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
    marginTop: 0,
    overflow: "visible",
  },
  enemyHeadquartersAvatar: {
    flex: "0 0 auto",
    width: 164,
    height: 226,
    marginTop: 0,
  },
  cardsLeftInfo: {
    display: "none",
  },
  // Аватар штаба и колода: колода стоит ЗА аватаром и чуть выглядывает из-за
  // него (см. deckBehindAvatar). Аватар рисуется поверх (headquartersAvatar
  // zIndex:2).
  deckAvatarStack: {
    position: "relative",
    width: 164,
    height: 226,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    isolation: "isolate",
  },
  playerDeckAvatarStack: {
    marginTop: 0,
  },
  enemyDeckAvatarStack: {
    marginBottom: 2,
  },
  deckBehindAvatar: {
    position: "absolute",
    zIndex: 1,
    pointerEvents: "none",
    filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.55))",
  },
  playerDeckBehindAvatar: {
    left: -4,
    bottom: 38,
    transform: "rotate(-4deg) scale(0.92)",
  },
  enemyDeckBehindAvatar: {
    right: -4,
    top: 34,
    transform: "rotate(4deg) scale(0.92)",
  },
  // Ник командира в боковой колонке штаба (под аватаром у игрока, над аватаром
  // у врага). Управление положением — порядком в колонке, не абсолютным.
  columnCommanderName: {
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: 0.5,
    lineHeight: 1.1,
    textAlign: "center",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
  playerColumnCommanderName: {
    color: "#7dff8a",
    textShadow: "0 2px 4px rgba(0,0,0,0.92), 0 0 12px rgba(125,255,138,0.45)",
  },
  enemyColumnCommanderName: {
    color: "#ff6b6b",
    textShadow: "0 2px 4px rgba(0,0,0,0.92), 0 0 12px rgba(255,107,107,0.45)",
    transform: "translate(12px, 8px)",
  },
  enemyDeckWithTimer: {
  position: "relative",
  width: 164,
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 8,
  zIndex: 360,
  pointerEvents: "none",
},
  enemyDeckRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    // Меньший зазор подвигает колоду правее, не сдвигая аватар (он уже у края
    // сцены). Вместе со сдвигом всего ряда это уводит колоду из-под тыловой
    // ячейки противника, которая выступает за правый край поля. Значения в
    // координатах сцены 1280×720 — масштабируются вместе со всей сценой.
    gap: 4,
    transform: "translateX(54px)",
},
  enemyControlStack: {
    display: "none",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 5,
    transform: "translateX(-78px)",
    marginTop: -85,
  },
  enemyFuelOnly: {
    position: "relative",
    width: 118,
    alignSelf: "center",
    transform: "translateY(80px)",
    zIndex: 32,
  },

  // Enemy national flag planted by the HQ but kept BEHIND the fuel indicator
  // (the panel sits at fuelPanelOverFlag zIndex 1). Offset down-left so it reads
  // as standing next to the headquarters, mirrored to match the player's flag.
  fuelBattleFlag: {
    position: "absolute",
    bottom: "+14%",
    left: "-20%",
    width: "70%",
    height: "auto",
    zIndex: 0,
    pointerEvents: "none",
    transform: "rotate(+21deg)",
    transformOrigin: "center bottom",
    filter: "brightness(1.02) saturate(0.92) drop-shadow(0 2px 5px rgba(0,0,0,0.6))",
    opacity: 0.95,
    top: "-132%",
  },

  fuelPanelOverFlag: {
    position: "relative",
    zIndex: 1,
  },
  turnControlPanel: {
    position: "absolute",
    width: 118,
    transform: "translateY(-50%)",
    zIndex: 650,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
    pointerEvents: "auto",
  },
  turnControlPanelInline: {
    position: "relative",
    width: 118,
    zIndex: 900,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
    // Прижимаем таймер и «Конец хода» к низу колонки штаба врага.
    marginTop: "auto",
    // Колонка штаба врага приподнята на 74px (translate ...,-74), а блок игрока
    // прижат к низу с отступом 10px. Опускаем таймер+«Конец хода» на 74−10=64px,
    // чтобы они встали у нижней границы экрана симметрично нику/аватару игрока.
    transform: "translateY(154px)",
    pointerEvents: "auto",
  },
  turnControlLabel: {
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1.1,
    lineHeight: 1,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 2px 5px rgba(0,0,0,0.92), 0 0 12px rgba(0,0,0,0.8)",
    whiteSpace: "nowrap",
  },
  turnControlLabelPlayer: {
    color: "#89ff96",
  },
  turnControlLabelEnemy: {
    color: "#ff6f68",
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
    position: "relative",
    zIndex: 1,
    pointerEvents: "auto",
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
    marginTop: 0,
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
    pointerEvents: "auto",
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
    width: 116,
    pointerEvents: "auto",
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
    fontSize: 0,
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    boxShadow: "none",
  },

  surrenderButtonText: {
    fontSize: 12,
    lineHeight: 1,
  },

  // «Сдаться» прижата к угловой панели управления (на весь экран + настройки),
  // которая в бою живёт слева сверху (left:12, top:10, иконки 40px). Кнопка
  // ставится прямо под ними.
  surrenderCornerPos: {
    position: "absolute",
    top: 56,
    left: 12,
    zIndex: 60,
    pointerEvents: "auto",
  },

  // Обёртка панели топлива игрока: прижимает её ближе к колоде/штабу снизу
  // (отрицательный нижний отступ убирает зазор колонки).
  playerFuelNearDeck: {
    marginBottom: -35,
    transform: "translateY(-56px)",
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

  // Floating «защита» indicator (СССР «Сплочение») — a shield + signed amount,
  // anchored top-centre of the unit cell, drifting up like the stat-gain flashes.
  defenseChangeIndicator: {
    position: "absolute",
    left: "50%",
    top: 2,
    transform: "translateX(-50%)",
    zIndex: 22,
    display: "flex",
    alignItems: "center",
    gap: 2,
    fontFamily: "var(--font-digit)",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
    pointerEvents: "none",
    textShadow: "0 1px 0 rgba(0,0,0,0.96), 0 0 7px rgba(0,0,0,0.85)",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
  },

  cardPreviewOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9000,
    // Portaled to <body> so it spans the entire window — including the
    // letterbox margins around the scaled GameStage — instead of only the
    // central design box. Acts as its own size container so the panel's
    // cqw/cqh sizing keeps working outside the stage.
    containerType: "size",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(4px)",
    // The peek opens while the finger is still pressing, so this backdrop sits
    // under the finger before the OS long-press fires. Suppress the native
    // callout/selection/menu here too (the cells already do) so the long-press
    // can't pop a context menu that would dismiss the peek the instant it opens.
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
  },

  cardPreviewPanel: {
    position: "relative",
    // Fixed design width (matches desktop). The portal-to-body overlay applies
    // the stage's uniform scale + rotation via a wrapper, so this never needs
    // viewport-relative clamping — it fits exactly like the rest of the game.
    width: 390,
    flexShrink: 0,
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
