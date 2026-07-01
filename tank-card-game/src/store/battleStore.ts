import { create } from "zustand";

import { applyAction } from "../game/engine";
import type { AttackAnimationStrike } from "../game/engine";
import {
  DEFAULT_BOT_HEADQUARTERS_ID,
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  getDeckBuildingHeadquarters,
  getHeadquartersDefinition,
  getTrainingHeadquartersIds,
} from "../game/headquarters";
import { getRandomBattleBackgroundId } from "../assets/battleBackgroundAssets";
import {
  preloadBattleAssetsForState,
  preloadCardImages,
  preloadHeadquartersAssets,
  startBattleAssetPreloadForState,
  startCampaignMenuAssetPreload,
  startCardLibraryAssetPreload,
  startDeckBuilderAssetPreload,
  startHeadquartersMenuAssetPreload,
  startResearchAssetPreload,
} from "../assets/assetPreloader";
import {
  getAutoLaunchMission,
  getCampaignCompletionReward,
  getCampaignMission,
  isCampaignMissionUnlocked,
} from "../game/campaigns";
import { calculateDeckWeight } from "../game/deckWeight";
import { createInitialBattleState, getDeckCardIds } from "../game/initialState";
import {
  TUTORIAL_BOT_DECK,
  TUTORIAL_BOT_HEADQUARTERS_ID,
  TUTORIAL_PLAYER_DECK,
  TUTORIAL_PLAYER_HEADQUARTERS_ID,
  getNextTutorialStepIndex,
  isTutorialActionAllowed,
} from "../game/tutorial";
import type { TutorialScriptId } from "../game/tutorial";
import type {
  GameMode,
  MainMenuView,
  MatchEndReason,
  PvpConnectionState,
} from "../game/modes";
import type {
  BattleAction,
  BattleState,
  HeadquartersId,
  BattleStateView,
  ClientBattleState,
  PlayerId,
} from "../game/types";
import { pvpClient } from "../network/pvpClient";
import type { PvpClientMessage } from "../network/pvpClient";
import { profileClient } from "../network/profileClient";
import { getDefaultWebSocketUrl } from "../network/webSocketUrl";
import { getCurrentUserId } from "../game/playerIdentity";

type SelectedAttacker = {
  type: "unit" | "headquarters";
  id: string;
} | null;

const AI_CUSTOM_OPPONENT_DECK_CARD_COUNT = 40;
const PVP_MATCH_FOUND_PREVIEW_MS = 5_000;
const PVP_CONNECT_TIMEOUT_MS = 6_000;
const FIRST_TURN_ROLL_DURATION_MS = 2_800;
const FIRST_TURN_ROLL_RESULT_DELAY_MS = 350;
const FIRST_TURN_ROLL_FINISH_DELAY_MS = 650;

export type FirstTurnRollState = {
  visible: boolean;
  resultVisible: boolean;
  firstPlayer: PlayerId | null;
  startsAt: number | null;
  revealAt: number | null;
  finalRotation: number;
};

export type PvpTimerState = {
  activePlayer: PlayerId | null;
  remainingMs: number | null;
  endsAt: number | null;
  durationMs: number | null;
};

export type PvpMovementIntent = {
  intentId: string;
  playerId: PlayerId;
  unitId: string;
  position: {
    row: number;
    col: number;
  };
  durationMs: number;
};

export type PvpAttackIntent = {
  intentId: string;
  playerId: PlayerId;
  strikes: AttackAnimationStrike[];
  durationMs: number;
};

export type PvpDeployBarrageIntent = {
  intentId: string;
  playerId: PlayerId;
  cardInstanceId: string;
  cardId: string;
  source:
    | { type: "battlefield"; position: { row: number; col: number } }
    | { type: "support"; supportSlot: number };
  shots: { targetId: string; damage: number; destroyed: boolean }[];
  durationMs: number;
};

type BattleStore = {
  battle: ClientBattleState | null;
  mode: GameMode;
  menuView: MainMenuView;
  localPlayerId: PlayerId;
  pvpRoomId: string | null;
  pvpStatus: PvpConnectionState;
  pvpError: string | null;
  sessionError: string | null;
  /** True while a battle is being started (session lock + asset preload), used
   * to disable start buttons so a match can't be launched twice. */
  battleStarting: boolean;
  /** True on a first visit until the welcome trailer mission has launched (or
   * been ruled out), so the menu/registration screen isn't shown in the gap
   * before the trailer battle starts. */
  trailerLaunchPending: boolean;
  pvpOpponentHeadquartersId: HeadquartersId | null;
  pvpOpponentNickname: string | null;
  pvpMatchPreviewLabel: string | null;
  pvpSearchStartedAt: number | null;
  pvpSearchDeadlineAt: number | null;
  pvpFallbackDeckCardIds: string[] | null;
  matchEndReason: MatchEndReason | null;
  pvpTimer: PvpTimerState;
  pvpMovementIntent: PvpMovementIntent | null;
  pvpAttackIntent: PvpAttackIntent | null;
  pvpDeployBarrageIntent: PvpDeployBarrageIntent | null;
  firstTurnRoll: FirstTurnRollState;
  selectedHeadquartersId: HeadquartersId;
  completedCampaignMissionIds: string[];
  selectedCampaignId: string | null;
  currentCampaignMissionId: string | null;

  selectedCardInstanceId: string | null;
  opponentSelectedCardInstanceId: string | null;
  selectedAttacker: SelectedAttacker;

  tutorialActive: boolean;
  /** Which scripted battle drives the guided UI (training vs the «Поныри» demo). */
  tutorialScriptId: TutorialScriptId;
  tutorialStepIndex: number;
  tutorialEpilogueSeen: boolean;

  startTutorial: () => void;
  advanceTutorialStep: () => void;
  completeTutorialEpilogue: () => void;

  selectCard: (cardInstanceId: string | null) => void;
  selectAttacker: (attacker: SelectedAttacker) => void;

  setMode: (mode: GameMode) => void;
  openHeadquartersMenu: (mode: "ai" | "pvp") => void;
  closeHeadquartersMenu: () => void;
  openDeckBuilderMenu: () => void;
  closeDeckBuilderMenu: () => void;
  openProfileMenu: () => void;
  closeProfileMenu: () => void;
  openResearchMenu: () => void;
  closeResearchMenu: () => void;
  openCollectionMenu: () => void;
  closeCollectionMenu: () => void;
  openShopMenu: () => void;
  closeShopMenu: () => void;
  openExchangeMenu: () => void;
  closeExchangeMenu: () => void;
  openCampaignMenu: () => void;
  openCampaignMissions: (campaignId: string) => void;
  closeCampaignMissions: () => void;
  closeCampaignMenu: () => void;
  exitBattleToMenu: () => void;
  startAiBattle: (deckCardIds?: string[]) => void;
  startCampaignMission: (missionId: string) => void;
  /** Auto-launch the welcome trailer mission once, on the player's first visit. */
  autoLaunchTrailerIfNeeded: () => void;
  /** Mark the current campaign mission complete and return to the main menu (trailer ending). */
  completeTrailerAndExit: () => void;
  findPvpMatch: (deckCardIds?: string[]) => void;
  retryPvpMatchmaking: () => void;
  startPvpFallbackAiBattle: () => void;
  createPvpRoom: (deckCardIds?: string[]) => void;
  joinPvpRoom: (roomId: string, deckCardIds?: string[]) => void;
  startPvpBattle: (roomId?: string, deckCardIds?: string[]) => void;
  restorePvpSession: () => void;
  applyRemoteBattleState: (battle: BattleStateView) => void;
  applyMatchEnded: (winner: PlayerId, reason: MatchEndReason) => void;
  applyOpponentCardSelection: (
    playerId: PlayerId,
    cardInstanceId: string | null
  ) => void;
  applyPvpTimer: (timer: {
    activePlayer: PlayerId;
    remainingMs: number;
    endsAt: number;
    durationMs: number;
  }) => void;
  applyPvpMovementIntent: (intent: PvpMovementIntent) => void;
  applyPvpAttackIntent: (intent: PvpAttackIntent) => void;
  applyPvpDeployBarrageIntent: (intent: PvpDeployBarrageIntent) => void;
  surrenderBattle: () => void;
  surrenderPvpMatch: () => void;
  leavePvpMatch: () => void;
  cancelMatchmaking: () => void;
  setPvpError: (message: string | null) => void;
  clearSessionError: () => void;
  hideFirstTurnRoll: () => void;
  setSelectedHeadquartersId: (headquartersId: HeadquartersId) => void;

  // `precomputedNext` lets a caller commit an already-simulated result instead of
  // re-running `applyAction` here. Required for actions with randomised outcomes
  // (e.g. «Огневой налёт» random targeting): the animation layer simulates the
  // result once to know what to animate, and the store must commit that exact
  // state — re-applying would roll the dice again and desync visuals from state.
  dispatch: (action: BattleAction, precomputedNext?: BattleState) => void;
  reset: () => void;
};

const PVP_SERVER_URL =
  import.meta.env.VITE_PVP_SERVER_URL ?? getDefaultWebSocketUrl();
const CAMPAIGN_PROGRESS_KEY = "tank-card-game:campaign-progress";
/** Set once the welcome trailer has auto-launched, so it never repeats. */
const TRAILER_SEEN_KEY = "tank-card-game:trailer-seen";

function loadTrailerSeen(): boolean {
  try {
    return window.localStorage.getItem(TRAILER_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveTrailerSeen() {
  try {
    window.localStorage.setItem(TRAILER_SEEN_KEY, "1");
  } catch {
    // Ignore storage failures — at worst the trailer shows again next visit.
  }
}

/**
 * Decided synchronously at store creation: on a fresh device with no campaign
 * progress and an unseen welcome trailer, the trailer mission will auto-launch,
 * so we should hold the menu/registration screen until it does.
 */
function computeTrailerLaunchPending(completedMissionIds: string[]): boolean {
  if (loadTrailerSeen()) return false;
  if (completedMissionIds.length > 0) return false;
  return getAutoLaunchMission() != null;
}

const emptyFirstTurnRoll: FirstTurnRollState = {
  visible: false,
  resultVisible: false,
  firstPlayer: null,
  startsAt: null,
  revealAt: null,
  finalRotation: 0,
};

const emptyPvpTimer: PvpTimerState = {
  activePlayer: null,
  remainingMs: null,
  endsAt: null,
  durationMs: null,
};

let pvpSubscriptionsReady = false;
// Synchronous re-entrancy guard: a battle start does async work (session lock +
// asset preload) before any state changes, so without this a second click during
// that window would fire a duplicate start and race the single-session lock.
let battleStartInProgress = false;
let firstTurnRollResultTimer: number | null = null;
let firstTurnRollHideTimer: number | null = null;
let reconnectTimer: number | null = null;
let matchFoundPreviewTimer: number | null = null;
let pendingFirstTurnRollMessage: Extract<
  PvpClientMessage,
  { type: "FIRST_TURN_ROLL" }
> | null = null;
let pendingGameStartedMessage: Extract<
  PvpClientMessage,
  { type: "GAME_STARTED" }
> | null = null;

function loadCompletedCampaignMissionIds(): string[] {
  try {
    const rawValue = window.localStorage.getItem(CAMPAIGN_PROGRESS_KEY);
    if (!rawValue) return [];

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function saveCompletedCampaignMissionIds(missionIds: string[]) {
  window.localStorage.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify(missionIds));
}

function clearFirstTurnRollTimers() {
  if (firstTurnRollResultTimer !== null) {
    window.clearTimeout(firstTurnRollResultTimer);
    firstTurnRollResultTimer = null;
  }

  if (firstTurnRollHideTimer !== null) {
    window.clearTimeout(firstTurnRollHideTimer);
    firstTurnRollHideTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer === null) return;

  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function shouldClearSelection(action: BattleAction): boolean {
  return (
    action.type === "PLAY_CARD" ||
    action.type === "PLAY_SUPPORT_CARD" ||
    action.type === "MOVE_UNIT" ||
    action.type === "ATTACK" ||
    action.type === "END_TURN"
  );
}

function createFreshBattle(
  playerHeadquartersId: HeadquartersId = DEFAULT_PLAYER_HEADQUARTERS_ID,
  botHeadquartersId?: HeadquartersId,
  playerDeckCardIds?: string[],
  botDeckCardIds?: string[]
) {
  const aiOpponent = botHeadquartersId
    ? { headquartersId: botHeadquartersId, deckCardIds: botDeckCardIds }
    : getAiOpponentSetup(playerHeadquartersId, playerDeckCardIds);

  return createInitialBattleState({
    playerHeadquartersId,
    botHeadquartersId: aiOpponent.headquartersId,
    playerDeckCardIds,
    botDeckCardIds: aiOpponent.deckCardIds,
    backgroundId: getRandomBattleBackgroundId(),
  });
}

function cloneDeckCardIds(deckCardIds?: string[]): string[] | null {
  return deckCardIds ? [...deckCardIds] : null;
}

function clearMatchFoundPreviewTimer() {
  if (matchFoundPreviewTimer === null) return;

  window.clearTimeout(matchFoundPreviewTimer);
  matchFoundPreviewTimer = null;
}

function clearPendingPvpStart() {
  clearMatchFoundPreviewTimer();
  pendingFirstTurnRollMessage = null;
  pendingGameStartedMessage = null;
}

function getAiOpponentSetup(
  playerHeadquartersId: HeadquartersId,
  playerDeckCardIds?: string[]
): { headquartersId: HeadquartersId; deckCardIds?: string[] } {
  if (!playerDeckCardIds) {
    return {
      headquartersId: getRandomSameLevelOpponentHeadquartersId(playerHeadquartersId),
    };
  }

  const sameLevelCandidates =
    getSameLevelOpponentHeadquartersIds(playerHeadquartersId);
  const candidates =
    sameLevelCandidates.length > 0
      ? sameLevelCandidates
      : getTrainingHeadquartersIds();

  if (candidates.length === 0) {
    return {
      headquartersId: DEFAULT_BOT_HEADQUARTERS_ID,
      deckCardIds: getExpandedDefaultDeckCardIds(DEFAULT_BOT_HEADQUARTERS_ID),
    };
  }

  const playerWeight = calculateDeckWeight(
    playerHeadquartersId,
    playerDeckCardIds
  ).totalWeight;

  const opponent =
    candidates
      .map((headquartersId) => {
        const deckCardIds = getExpandedDefaultDeckCardIds(headquartersId);

        return {
          headquartersId,
          deckCardIds,
          distance: Math.abs(
            calculateDeckWeight(headquartersId, deckCardIds).totalWeight -
              playerWeight
          ),
        };
      })
      .sort((left, right) => left.distance - right.distance)[0] ?? null;

  return opponent
    ? {
        headquartersId: opponent.headquartersId,
        deckCardIds: opponent.deckCardIds,
      }
    : {
        headquartersId: DEFAULT_BOT_HEADQUARTERS_ID,
        deckCardIds: getExpandedDefaultDeckCardIds(DEFAULT_BOT_HEADQUARTERS_ID),
      };
}

function getSameLevelOpponentHeadquartersIds(
  playerHeadquartersId: HeadquartersId
): HeadquartersId[] {
  const playerHeadquarters = getHeadquartersDefinition(playerHeadquartersId);
  const candidates = getDeckBuildingHeadquarters()
    .filter(
      (headquarters) =>
        headquarters.id !== playerHeadquartersId &&
        headquarters.level === playerHeadquarters.level &&
        headquarters.defaultDeckId.endsWith("_default") &&
        getDeckCardIds(headquarters.defaultDeckId).length > 0
    )
    .map((headquarters) => headquarters.id);

  return candidates;
}

function getRandomSameLevelOpponentHeadquartersId(
  playerHeadquartersId: HeadquartersId
): HeadquartersId {
  const sameLevelCandidates = getSameLevelOpponentHeadquartersIds(
    playerHeadquartersId
  );
  const availableCandidates =
    sameLevelCandidates.length > 0
      ? sameLevelCandidates
      : getTrainingHeadquartersIds().filter(
          (headquartersId) => headquartersId !== playerHeadquartersId
        );

  if (availableCandidates.length === 0) {
    return DEFAULT_BOT_HEADQUARTERS_ID;
  }

  const randomIndex = Math.floor(Math.random() * availableCandidates.length);

  return availableCandidates[randomIndex];
}

function getExpandedDefaultDeckCardIds(headquartersId: HeadquartersId): string[] {
  const defaultDeckId = getHeadquartersDefinition(headquartersId).defaultDeckId;
  const defaultCardIds = getDeckCardIds(defaultDeckId);

  if (defaultCardIds.length === 0) return [];

  return Array.from(
    { length: AI_CUSTOM_OPPONENT_DECK_CARD_COUNT },
    (_, index) => defaultCardIds[index % defaultCardIds.length]
  );
}

function createCampaignBattle(missionId: string): BattleState | null {
  const campaignMission = getCampaignMission(missionId);

  if (!campaignMission) return null;
  if (campaignMission.mission.available === false) return null;
  if (!campaignMission.mission.botHeadquartersId) return null;
  if (!campaignMission.mission.botDeckId) return null;

  return createInitialBattleState({
    playerHeadquartersId:
      campaignMission.mission.playerHeadquartersId ??
      campaignMission.campaign.playerHeadquartersId,
    botHeadquartersId: campaignMission.mission.botHeadquartersId,
    playerDeckId:
      campaignMission.mission.playerDeckId ?? campaignMission.campaign.playerDeckId,
    botDeckId: campaignMission.mission.botDeckId,
    backgroundId: campaignMission.mission.backgroundId ?? getRandomBattleBackgroundId(),
    playerBoardUnits: campaignMission.mission.playerBoardUnits,
    botBoardUnits: campaignMission.mission.botBoardUnits,
    startingHandSize: campaignMission.mission.startingHandSize,
  });
}

function getStartRollFinalRotation(firstPlayer: PlayerId): number {
  const targetAngle = firstPlayer === "player" ? 135 : -45;
  return 360 * 8 + targetAngle;
}

function getOpponentPlayerId(playerId: PlayerId): PlayerId {
  return playerId === "player" ? "bot" : "player";
}

function getOpponentHeadquartersIdFromBattle(
  battle: BattleStateView,
  localPlayerId: PlayerId
): HeadquartersId {
  return battle[getOpponentPlayerId(localPlayerId)].headquartersId;
}

function applyFirstTurnRollMessage(
  message: Extract<PvpClientMessage, { type: "FIRST_TURN_ROLL" }>
) {
  clearFirstTurnRollTimers();
  clearReconnectTimer();
  pvpClient.rememberRoom(message.roomId);
  startBattleAssetPreloadForState(message.battle);

  const now = Date.now();
  const serverRevealDelay = Math.max(0, message.revealAt - now);
  const revealDelay =
    serverRevealDelay > 0
      ? serverRevealDelay
      : FIRST_TURN_ROLL_DURATION_MS + FIRST_TURN_ROLL_RESULT_DELAY_MS;
  const hideDelay = revealDelay + FIRST_TURN_ROLL_FINISH_DELAY_MS + 250;

  useBattleStore.setState((state) => ({
    battle: message.battle,
    mode: "pvp",
    menuView: "main",
    pvpRoomId: message.roomId,
    pvpStatus: "rolling",
    pvpError: null,
    matchEndReason: null,
    pvpTimer: emptyPvpTimer,
    pvpMovementIntent: null,
    pvpAttackIntent: null,
    pvpDeployBarrageIntent: null,
    pvpOpponentHeadquartersId: getOpponentHeadquartersIdFromBattle(
      message.battle,
      state.localPlayerId
    ),
    pvpOpponentNickname: message.opponentNickname ?? null,
    pvpMatchPreviewLabel: null,
    pvpSearchStartedAt: null,
    pvpSearchDeadlineAt: null,
    pvpFallbackDeckCardIds: null,
    selectedCardInstanceId: null,
    opponentSelectedCardInstanceId: null,
    selectedAttacker: null,
    firstTurnRoll: {
      visible: true,
      resultVisible: false,
      firstPlayer: message.firstPlayer,
      startsAt: message.startsAt,
      revealAt: message.revealAt,
      finalRotation: getStartRollFinalRotation(message.firstPlayer),
    },
  }));

  firstTurnRollResultTimer = window.setTimeout(() => {
    useBattleStore.setState((state) => ({
      firstTurnRoll: {
        ...state.firstTurnRoll,
        resultVisible: true,
      },
    }));
  }, revealDelay);

  firstTurnRollHideTimer = window.setTimeout(() => {
    useBattleStore.getState().hideFirstTurnRoll();

    if (pendingGameStartedMessage) {
      const gameStartedMessage = pendingGameStartedMessage;
      pendingGameStartedMessage = null;
      applyGameStartedMessage(gameStartedMessage);
    }
  }, hideDelay);
}

function applyGameStartedMessage(
  message: Extract<PvpClientMessage, { type: "GAME_STARTED" }>
) {
  clearReconnectTimer();
  pvpClient.rememberRoom(message.roomId);
  startBattleAssetPreloadForState(message.battle);
  useBattleStore.setState({
    battle: message.battle,
    mode: "pvp",
    menuView: "main",
    localPlayerId: message.playerId,
    pvpRoomId: message.roomId,
    pvpStatus: "inBattle",
    pvpError: null,
    matchEndReason: null,
    pvpTimer: emptyPvpTimer,
    pvpMovementIntent: null,
    pvpAttackIntent: null,
    pvpDeployBarrageIntent: null,
    pvpOpponentHeadquartersId: getOpponentHeadquartersIdFromBattle(
      message.battle,
      message.playerId
    ),
    pvpOpponentNickname: message.opponentNickname ?? null,
    pvpMatchPreviewLabel: null,
    pvpSearchStartedAt: null,
    pvpSearchDeadlineAt: null,
    pvpFallbackDeckCardIds: null,
    selectedCardInstanceId: null,
    opponentSelectedCardInstanceId: null,
    selectedAttacker: null,
  });
}

function flushPendingPvpStart() {
  clearMatchFoundPreviewTimer();

  const gameStartedMessage = pendingGameStartedMessage;
  const firstTurnRollMessage = pendingFirstTurnRollMessage;

  pendingGameStartedMessage = null;
  pendingFirstTurnRollMessage = null;

  if (firstTurnRollMessage) {
    pendingGameStartedMessage = gameStartedMessage;
    applyFirstTurnRollMessage(firstTurnRollMessage);
    return;
  }

  if (gameStartedMessage) {
    applyGameStartedMessage(gameStartedMessage);
  }
}

function schedulePendingPvpStart() {
  clearMatchFoundPreviewTimer();
  matchFoundPreviewTimer = window.setTimeout(() => {
    flushPendingPvpStart();
  }, PVP_MATCH_FOUND_PREVIEW_MS);
}

function getCleanMenuState() {
  return {
    battle: null,
    mode: "ai" as GameMode,
    tutorialActive: false,
    tutorialScriptId: "training" as TutorialScriptId,
    tutorialStepIndex: 0,
    tutorialEpilogueSeen: false,
    menuView: "main" as MainMenuView,
    localPlayerId: "player" as PlayerId,
    pvpRoomId: null,
    pvpStatus: "idle" as PvpConnectionState,
    pvpError: null,
    sessionError: null,
    battleStarting: false,
    pvpOpponentHeadquartersId: null,
    pvpOpponentNickname: null,
    pvpMatchPreviewLabel: null,
    pvpSearchStartedAt: null,
    pvpSearchDeadlineAt: null,
    pvpFallbackDeckCardIds: null,
    matchEndReason: null,
    pvpTimer: emptyPvpTimer,
    pvpMovementIntent: null,
    pvpAttackIntent: null,
    pvpDeployBarrageIntent: null,
    selectedCardInstanceId: null,
    opponentSelectedCardInstanceId: null,
    selectedAttacker: null,
    selectedCampaignId: null,
    currentCampaignMissionId: null,
    firstTurnRoll: emptyFirstTurnRoll,
  };
}

// Single-session lock helpers. A battle (PVE or PVP) may only start if the
// account isn't already playing elsewhere. The lock lives on the profile
// server connection and auto-releases when that socket closes; we also release
// explicitly when returning to the menu so other devices are freed promptly.
async function acquireGameSession(kind: GameMode): Promise<boolean> {
  const result = await profileClient.acquireSession(getCurrentUserId(), kind);

  if (result.status === "denied") {
    useBattleStore.setState({
      sessionError:
        result.message ??
        "Игра уже запущена в другом окне или на другом устройстве.",
    });
    return false;
  }

  // "granted" or "unavailable" (offline — lock can't be enforced) → allow play.
  useBattleStore.setState({ sessionError: null });
  return true;
}

function releaseGameSession() {
  profileClient.releaseSession(getCurrentUserId());
}

function setupPvpSubscriptions() {
  if (pvpSubscriptionsReady) return;
  pvpSubscriptionsReady = true;

  pvpClient.onMessage((message) => {
    const store = useBattleStore.getState();

    switch (message.type) {
      case "MATCHMAKING_STARTED":
        clearPendingPvpStart();
        useBattleStore.setState({
          battle: null,
          mode: "pvp",
          menuView: "headquarters",
          pvpRoomId: null,
          pvpStatus: "searching",
          pvpError: null,
          pvpOpponentHeadquartersId: null,
          pvpMatchPreviewLabel: null,
          pvpSearchStartedAt: Date.now(),
          pvpSearchDeadlineAt: Date.now() + 30_000,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "ROOM_CREATED":
      case "ROOM_JOINED":
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        pvpClient.rememberRoom(message.roomId);
        useBattleStore.setState({
          battle: null,
          mode: "pvp",
          menuView: "headquarters",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: message.type === "ROOM_JOINED" ? "matched" : "waiting",
          pvpError: null,
          pvpOpponentHeadquartersId: null,
          pvpMatchPreviewLabel: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          firstTurnRoll: emptyFirstTurnRoll,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
        });
        break;

      case "WAITING_FOR_OPPONENT":
        pvpClient.rememberRoom(message.roomId);
        useBattleStore.setState({
          battle: null,
          pvpRoomId: message.roomId,
          pvpStatus: "waiting",
          pvpError: null,
          pvpOpponentHeadquartersId: null,
          pvpMatchPreviewLabel: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
        });
        break;

      case "FIRST_TURN_ROLL": {
        clearReconnectTimer();
        pvpClient.rememberRoom(message.roomId);
        pendingFirstTurnRollMessage = message;

        useBattleStore.setState((state) => ({
          battle: null,
          mode: "pvp",
          menuView: "headquarters",
          pvpRoomId: message.roomId,
          pvpStatus: "matchPreview",
          pvpError: null,
          pvpOpponentHeadquartersId: getOpponentHeadquartersIdFromBattle(
            message.battle,
            state.localPlayerId
          ),
          pvpOpponentNickname: message.opponentNickname ?? null,
          pvpMatchPreviewLabel: null,
          matchEndReason: null,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
          firstTurnRoll: emptyFirstTurnRoll,
        }));

        schedulePendingPvpStart();

        break;
      }

      case "GAME_STARTED":
        startBattleAssetPreloadForState(message.battle);

        if (pendingFirstTurnRollMessage || store.pvpStatus === "matchPreview") {
          pendingGameStartedMessage = message;
          useBattleStore.setState({
            pvpOpponentHeadquartersId: getOpponentHeadquartersIdFromBattle(
              message.battle,
              message.playerId
            ),
            pvpOpponentNickname: message.opponentNickname ?? null,
            pvpMatchPreviewLabel: null,
          });
          schedulePendingPvpStart();
          break;
        }

        applyGameStartedMessage(message);
        break;

      case "GAME_STATE":
        startBattleAssetPreloadForState(message.battle);
        store.applyRemoteBattleState(message.battle);
        break;

      case "RECONNECTED":
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        pvpClient.rememberRoom(message.roomId);
        startBattleAssetPreloadForState(message.battle);
        useBattleStore.setState({
          battle: message.battle,
          mode: "pvp",
          menuView: "main",
          localPlayerId: message.playerId,
          pvpRoomId: message.roomId,
          pvpStatus: message.battle.status === "active" ? "inBattle" : "finished",
          pvpError: null,
          pvpOpponentNickname: message.opponentNickname ?? null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "RECONNECT_FAILED":
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        clearPendingPvpStart();
        pvpClient.clearSession();
        useBattleStore.setState({
          ...getCleanMenuState(),
          pvpError: message.message,
        });
        break;

      case "TURN_TIMER":
        store.applyPvpTimer(message);
        break;

      case "MOVE_INTENT":
        store.applyPvpMovementIntent(message);
        break;

      case "ATTACK_INTENT":
        store.applyPvpAttackIntent(message);
        break;

      case "DEPLOY_BARRAGE_INTENT":
        store.applyPvpDeployBarrageIntent(message);
        break;

      case "MATCH_ENDED":
        store.applyMatchEnded(message.winner, message.reason);
        break;

      case "OPPONENT_CARD_SELECTION":
        store.applyOpponentCardSelection(message.playerId, message.cardInstanceId);
        break;

      case "MATCHMAKING_CANCELLED":
        releaseGameSession();
        clearFirstTurnRollTimers();
        clearReconnectTimer();
        clearPendingPvpStart();
        pvpClient.clearSession();
        useBattleStore.setState(getCleanMenuState());
        break;

      case "OPPONENT_LEFT":
        useBattleStore.setState({
          pvpStatus: "finished",
          matchEndReason: message.reason,
          pvpError: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          opponentSelectedCardInstanceId: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "OPPONENT_DISCONNECTED":
        clearFirstTurnRollTimers();
        useBattleStore.setState({
          pvpStatus: "finished",
          pvpError: null,
          matchEndReason: "disconnect",
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          opponentSelectedCardInstanceId: null,
          firstTurnRoll: emptyFirstTurnRoll,
        });
        break;

      case "ERROR":
        store.setPvpError(message.message);
        break;
    }
  });

  pvpClient.onClose(() => {
    const state = useBattleStore.getState();
    if (state.mode !== "pvp") return;
    if (state.pvpStatus === "error") return;
    if (state.pvpStatus === "finished") return;
    if (state.pvpStatus === "matchPreview" && !pvpClient.getStoredRoomId()) {
      return;
    }

    clearFirstTurnRollTimers();

    if (pvpClient.getStoredRoomId()) {
      useBattleStore.setState({
        pvpStatus: "connecting",
        pvpError: "Соединение потеряно, восстанавливаю PVP-матч...",
        pvpTimer: emptyPvpTimer,
        pvpMovementIntent: null,
        pvpAttackIntent: null,
        pvpDeployBarrageIntent: null,
        firstTurnRoll: emptyFirstTurnRoll,
      });

      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectAndRun(() => pvpClient.reconnect());
      }, 300);
      return;
    }

    useBattleStore.setState({
      pvpStatus: "error",
      pvpError: "Соединение с PVP-сервером закрыто",
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      pvpDeployBarrageIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
    });
  });

  pvpClient.onError((message) => {
    useBattleStore.getState().setPvpError(message);
  });
}

function connectAndRun(onOpen: () => void) {
  setupPvpSubscriptions();

  let timeoutId: number | null = window.setTimeout(() => {
    cleanup();
    pvpClient.disconnect();
    useBattleStore
      .getState()
      .setPvpError("PVP-сервер недоступен. Проверьте запуск сервера и попробуйте снова.");
  }, PVP_CONNECT_TIMEOUT_MS);

  let unsubscribeOpen = () => {};
  let unsubscribeClose = () => {};
  let unsubscribeError = () => {};

  function cleanup() {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }

    unsubscribeOpen();
    unsubscribeClose();
    unsubscribeError();
    unsubscribeOpen = () => {};
    unsubscribeClose = () => {};
    unsubscribeError = () => {};
  }

  unsubscribeOpen = pvpClient.onOpen(() => {
    cleanup();
    onOpen();
  });
  unsubscribeClose = pvpClient.onClose(cleanup);
  unsubscribeError = pvpClient.onError(cleanup);

  pvpClient.connect(PVP_SERVER_URL);
}

declare global {
  interface Window {
    /** Dev-only handle for debugging and automated checks. */
    __battleStore?: unknown;
  }
}

export const useBattleStore = create<BattleStore>()((set, get) => ({
  battle: null,
  mode: "ai",
  menuView: "main",
  localPlayerId: "player",
  pvpRoomId: null,
  pvpStatus: "idle",
  pvpError: null,
  sessionError: null,
  battleStarting: false,
  trailerLaunchPending: computeTrailerLaunchPending(
    loadCompletedCampaignMissionIds()
  ),
  pvpOpponentHeadquartersId: null,
  pvpOpponentNickname: null,
  pvpMatchPreviewLabel: null,
  pvpSearchStartedAt: null,
  pvpSearchDeadlineAt: null,
  pvpFallbackDeckCardIds: null,
  matchEndReason: null,
  pvpTimer: emptyPvpTimer,
  pvpMovementIntent: null,
  pvpAttackIntent: null,
  pvpDeployBarrageIntent: null,
  firstTurnRoll: emptyFirstTurnRoll,
  selectedHeadquartersId: DEFAULT_PLAYER_HEADQUARTERS_ID,
  completedCampaignMissionIds: loadCompletedCampaignMissionIds(),
  selectedCampaignId: null,
  currentCampaignMissionId: null,

  selectedCardInstanceId: null,
  opponentSelectedCardInstanceId: null,
  selectedAttacker: null,

  tutorialActive: false,
  tutorialScriptId: "training",
  tutorialStepIndex: 0,
  tutorialEpilogueSeen: false,

  startTutorial: async () => {
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();
    pvpClient.clearSession();

    const battle = createInitialBattleState({
      playerHeadquartersId: TUTORIAL_PLAYER_HEADQUARTERS_ID,
      botHeadquartersId: TUTORIAL_BOT_HEADQUARTERS_ID,
      playerDeckCardIds: [...TUTORIAL_PLAYER_DECK],
      botDeckCardIds: [...TUTORIAL_BOT_DECK],
      backgroundId: getRandomBattleBackgroundId(),
      shuffleDecks: false,
    });

    await preloadBattleAssetsForState(battle);

    set({
      ...getCleanMenuState(),
      battle,
      tutorialActive: true,
      tutorialStepIndex: 0,
      tutorialEpilogueSeen: false,
    });

    pvpClient.disconnect();
  },

  advanceTutorialStep: () => {
    set((state) => ({ tutorialStepIndex: state.tutorialStepIndex + 1 }));
  },

  completeTutorialEpilogue: () => {
    set({ tutorialEpilogueSeen: true });
  },

  selectCard: (cardInstanceId) => {
    if (get().mode === "pvp") {
      pvpClient.selectCard(cardInstanceId);
    }

    set({
      selectedCardInstanceId: cardInstanceId,
      selectedAttacker: null,
    });
  },

  selectAttacker: (attacker) => {
    if (get().mode === "pvp") {
      pvpClient.selectCard(null);
    }

    set({
      selectedAttacker: attacker,
      selectedCardInstanceId: null,
    });
  },

  setMode: (mode) => {
    set({ mode });
  },

  openHeadquartersMenu: (mode) => {
    startHeadquartersMenuAssetPreload();
    set({
      menuView: "headquarters",
      mode,
      pvpError: null,
    });
  },

  closeHeadquartersMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openDeckBuilderMenu: () => {
    startDeckBuilderAssetPreload();
    set({
      menuView: "deckBuilder",
      pvpError: null,
    });
  },

  closeDeckBuilderMenu: () => {
    set({
      menuView: "headquarters",
      pvpError: null,
    });
  },

  openProfileMenu: () => {
    set({
      menuView: "profile",
      mode: "ai",
      pvpError: null,
    });
  },

  closeProfileMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openResearchMenu: () => {
    startResearchAssetPreload();
    set({
      menuView: "research",
      mode: "ai",
      pvpError: null,
    });
  },

  closeResearchMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openCollectionMenu: () => {
    startCardLibraryAssetPreload();
    set({
      menuView: "collection",
      mode: "ai",
      pvpError: null,
    });
  },

  closeCollectionMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openShopMenu: () => {
    set({
      menuView: "shop",
      mode: "ai",
      pvpError: null,
    });
  },

  closeShopMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openExchangeMenu: () => {
    set({
      menuView: "exchange",
      mode: "ai",
      pvpError: null,
    });
  },

  closeExchangeMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      pvpError: null,
    });
  },

  openCampaignMenu: () => {
    startCampaignMenuAssetPreload();
    set({
      menuView: "campaign",
      mode: "campaign",
      pvpError: null,
    });
  },

  openCampaignMissions: (campaignId) => {
    startCampaignMenuAssetPreload();
    set({
      menuView: "missions",
      mode: "campaign",
      selectedCampaignId: campaignId,
      pvpError: null,
    });
  },

  closeCampaignMissions: () => {
    set({
      menuView: "campaign",
      mode: "campaign",
      currentCampaignMissionId: null,
    });
  },

  closeCampaignMenu: () => {
    set({
      menuView: "main",
      mode: "ai",
      selectedCampaignId: null,
      currentCampaignMissionId: null,
    });
  },

  exitBattleToMenu: () => {
    releaseGameSession();
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();
    pvpClient.selectCard(null);
    pvpClient.clearSession();

    set(getCleanMenuState());
    pvpClient.disconnect();
  },

  completeTrailerAndExit: () => {
    const { currentCampaignMissionId, completedCampaignMissionIds } = get();

    let nextCompleted = completedCampaignMissionIds;
    if (
      currentCampaignMissionId &&
      !nextCompleted.includes(currentCampaignMissionId)
    ) {
      nextCompleted = [...nextCompleted, currentCampaignMissionId];
      saveCompletedCampaignMissionIds(nextCompleted);
    }

    releaseGameSession();
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();
    pvpClient.selectCard(null);
    pvpClient.clearSession();

    set({ ...getCleanMenuState(), completedCampaignMissionIds: nextCompleted });
    pvpClient.disconnect();
  },

  hideFirstTurnRoll: () => {
    set({ firstTurnRoll: emptyFirstTurnRoll });
  },

  setSelectedHeadquartersId: (headquartersId) => {
    set({ selectedHeadquartersId: headquartersId });
  },

  startAiBattle: async (deckCardIds) => {
    if (battleStartInProgress) return;
    battleStartInProgress = true;
    set({ battleStarting: true });

    try {
      if (!(await acquireGameSession("ai"))) return;

      clearFirstTurnRollTimers();
      clearReconnectTimer();
      clearPendingPvpStart();
      pvpClient.clearSession();

      const battle = createFreshBattle(
        get().selectedHeadquartersId,
        undefined,
        deckCardIds
      );

      await preloadBattleAssetsForState(battle);

      set({
        battle,
        mode: "ai",
        menuView: "main",
        localPlayerId: "player",
        pvpRoomId: null,
        pvpStatus: "idle",
        pvpError: null,
        pvpOpponentHeadquartersId: null,
        pvpMatchPreviewLabel: null,
        pvpSearchStartedAt: null,
        pvpSearchDeadlineAt: null,
        pvpFallbackDeckCardIds: null,
        matchEndReason: null,
        pvpTimer: emptyPvpTimer,
        pvpMovementIntent: null,
        pvpAttackIntent: null,
        pvpDeployBarrageIntent: null,
        firstTurnRoll: emptyFirstTurnRoll,
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
        currentCampaignMissionId: null,
      });

      pvpClient.disconnect();
    } finally {
      battleStartInProgress = false;
      set({ battleStarting: false });
    }
  },

  startPvpFallbackAiBattle: () => {
    const state = get();
    if (state.mode !== "pvp") return;
    if (state.pvpStatus !== "searching" && state.pvpStatus !== "waiting") {
      return;
    }

    const deckCardIds = state.pvpFallbackDeckCardIds ?? undefined;
    const aiOpponent = getAiOpponentSetup(
      state.selectedHeadquartersId,
      deckCardIds
    );

    pvpClient.cancelMatchmaking();
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();
    pvpClient.clearSession();
    pvpClient.disconnect();

    set({
      battle: null,
      mode: "pvp",
      menuView: "headquarters",
      localPlayerId: "player",
      pvpRoomId: null,
      pvpStatus: "matchPreview",
      pvpError: null,
      pvpOpponentHeadquartersId: aiOpponent.headquartersId,
      pvpMatchPreviewLabel: "Бой против ИИ",
      pvpSearchStartedAt: null,
      pvpSearchDeadlineAt: null,
      pvpFallbackDeckCardIds: null,
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      pvpDeployBarrageIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
      currentCampaignMissionId: null,
    });

    matchFoundPreviewTimer = window.setTimeout(() => {
      const latest = useBattleStore.getState();
      if (
        latest.mode !== "pvp" ||
        latest.pvpStatus !== "matchPreview" ||
        latest.pvpOpponentHeadquartersId !== aiOpponent.headquartersId
      ) {
        return;
      }

      const battle = createFreshBattle(
        state.selectedHeadquartersId,
        aiOpponent.headquartersId,
        deckCardIds,
        aiOpponent.deckCardIds
      );

      void preloadBattleAssetsForState(battle).then(() => {
        const current = useBattleStore.getState();
        if (
          current.mode !== "pvp" ||
          current.pvpStatus !== "matchPreview" ||
          current.pvpOpponentHeadquartersId !== aiOpponent.headquartersId
        ) {
          return;
        }

        useBattleStore.setState({
          battle,
          mode: "ai",
          menuView: "main",
          localPlayerId: "player",
          pvpRoomId: null,
          pvpStatus: "idle",
          pvpError: null,
          pvpOpponentHeadquartersId: null,
          pvpMatchPreviewLabel: null,
          pvpSearchStartedAt: null,
          pvpSearchDeadlineAt: null,
          pvpFallbackDeckCardIds: null,
          matchEndReason: null,
          pvpTimer: emptyPvpTimer,
          pvpMovementIntent: null,
          pvpAttackIntent: null,
          pvpDeployBarrageIntent: null,
          firstTurnRoll: emptyFirstTurnRoll,
          selectedCardInstanceId: null,
          opponentSelectedCardInstanceId: null,
          selectedAttacker: null,
          currentCampaignMissionId: null,
        });

        matchFoundPreviewTimer = null;
      });
    }, PVP_MATCH_FOUND_PREVIEW_MS);
  },

  startCampaignMission: async (missionId) => {
    const campaignMission = getCampaignMission(missionId);
    if (!campaignMission) return;

    const state = get();
    const unlocked = isCampaignMissionUnlocked(
      campaignMission.campaign,
      missionId,
      state.completedCampaignMissionIds
    );

    if (!unlocked) return;

    const battle = createCampaignBattle(missionId);
    if (!battle) return;

    if (battleStartInProgress) return;
    battleStartInProgress = true;
    set({ battleStarting: true });

    try {
      if (!(await acquireGameSession("campaign"))) return;

      // Warm the end-of-mission reward card art during the battle so the
      // victory reveal (e.g. the SU-152 "Зверобой") shows instantly, fully
      // loaded, instead of popping in.
      const rewardId = campaignMission.mission.endRewardId;
      const rewardCardId = rewardId
        ? getCampaignCompletionReward(rewardId)?.cardId
        : undefined;
      if (rewardCardId) void preloadCardImages([rewardCardId]);

      await preloadBattleAssetsForState(battle);

      clearFirstTurnRollTimers();
      clearReconnectTimer();
      pvpClient.clearSession();

      // Guided demo missions (e.g. the «Поныри» trailer) reuse the tutorial
      // machinery: highlighted targets, gated actions and a passive scripted bot.
      const guidedScriptId = campaignMission.mission.guidedScriptId;

      set({
        battle,
        mode: "campaign",
        menuView: "campaign",
        localPlayerId: "player",
        pvpRoomId: null,
        pvpStatus: "idle",
        pvpError: null,
        matchEndReason: null,
        pvpTimer: emptyPvpTimer,
        pvpMovementIntent: null,
        pvpAttackIntent: null,
        pvpDeployBarrageIntent: null,
        firstTurnRoll: emptyFirstTurnRoll,
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
        currentCampaignMissionId: missionId,
        selectedCampaignId: campaignMission.campaign.id,
        tutorialActive: Boolean(guidedScriptId),
        tutorialScriptId: guidedScriptId ?? "training",
        tutorialStepIndex: 0,
        tutorialEpilogueSeen: false,
      });

      pvpClient.disconnect();
    } finally {
      battleStartInProgress = false;
      set({ battleStarting: false });
    }
  },

  autoLaunchTrailerIfNeeded: async () => {
    const state = get();

    // Never interrupt an active battle (e.g. a restored session on reload).
    if (state.battle) {
      set({ trailerLaunchPending: false });
      return;
    }
    if (loadTrailerSeen()) {
      set({ trailerLaunchPending: false });
      return;
    }

    // A returning player who already has campaign progress skips the trailer.
    if (state.completedCampaignMissionIds.length > 0) {
      saveTrailerSeen();
      set({ trailerLaunchPending: false });
      return;
    }

    const auto = getAutoLaunchMission();
    if (!auto) {
      set({ trailerLaunchPending: false });
      return;
    }

    // Mark seen up front so a reload during the trailer doesn't relaunch it.
    saveTrailerSeen();
    try {
      await get().startCampaignMission(auto.mission.id);
    } finally {
      // Battle is set by now (or launch failed); either way release the gate so
      // the menu/registration screen can show once the trailer is over.
      set({ trailerLaunchPending: false });
    }
  },

  findPvpMatch: async (deckCardIds) => {
    if (battleStartInProgress) return;
    battleStartInProgress = true;
    set({ battleStarting: true });

    try {
      if (!(await acquireGameSession("pvp"))) return;

      const selectedHeadquartersId = get().selectedHeadquartersId;
      void preloadHeadquartersAssets([selectedHeadquartersId]);
      if (deckCardIds) void preloadCardImages(deckCardIds);

      clearFirstTurnRollTimers();
      clearReconnectTimer();
      clearPendingPvpStart();
      pvpClient.clearSession();
      const now = Date.now();

      set({
        battle: null,
        mode: "pvp",
        menuView: "headquarters",
        pvpRoomId: null,
        pvpStatus: "connecting",
        pvpError: null,
        pvpOpponentHeadquartersId: null,
        pvpMatchPreviewLabel: null,
        pvpSearchStartedAt: now,
        pvpSearchDeadlineAt: now + 30_000,
        pvpFallbackDeckCardIds: cloneDeckCardIds(deckCardIds),
        matchEndReason: null,
        pvpTimer: emptyPvpTimer,
        pvpMovementIntent: null,
        pvpAttackIntent: null,
        pvpDeployBarrageIntent: null,
        firstTurnRoll: emptyFirstTurnRoll,
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
      });

      connectAndRun(() =>
        pvpClient.findMatch(selectedHeadquartersId, deckCardIds)
      );
    } finally {
      battleStartInProgress = false;
      set({ battleStarting: false });
    }
  },

  retryPvpMatchmaking: () => {
    const state = get();
    if (state.mode !== "pvp" || state.pvpStatus !== "error") return;

    get().findPvpMatch(state.pvpFallbackDeckCardIds ?? undefined);
  },

  createPvpRoom: async (deckCardIds) => {
    if (battleStartInProgress) return;
    battleStartInProgress = true;
    set({ battleStarting: true });

    try {
      if (!(await acquireGameSession("pvp"))) return;

      const selectedHeadquartersId = get().selectedHeadquartersId;
      void preloadHeadquartersAssets([selectedHeadquartersId]);
      if (deckCardIds) void preloadCardImages(deckCardIds);

      clearFirstTurnRollTimers();
      clearReconnectTimer();
      clearPendingPvpStart();
      pvpClient.clearSession();
      const now = Date.now();

      set({
        battle: null,
        mode: "pvp",
        menuView: "headquarters",
        pvpRoomId: null,
        pvpStatus: "connecting",
        pvpError: null,
        pvpOpponentHeadquartersId: null,
        pvpMatchPreviewLabel: null,
        pvpSearchStartedAt: now,
        pvpSearchDeadlineAt: now + 30_000,
        pvpFallbackDeckCardIds: cloneDeckCardIds(deckCardIds),
        matchEndReason: null,
        pvpTimer: emptyPvpTimer,
        pvpMovementIntent: null,
        pvpAttackIntent: null,
        pvpDeployBarrageIntent: null,
        firstTurnRoll: emptyFirstTurnRoll,
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
      });

      connectAndRun(() =>
        pvpClient.createRoom(selectedHeadquartersId, deckCardIds)
      );
    } finally {
      battleStartInProgress = false;
      set({ battleStarting: false });
    }
  },

  joinPvpRoom: async (roomId, deckCardIds) => {
    const normalizedRoomId = roomId.trim().toUpperCase();

    if (!normalizedRoomId) {
      set({ pvpError: "Введите код комнаты" });
      return;
    }

    if (battleStartInProgress) return;
    battleStartInProgress = true;
    set({ battleStarting: true });

    try {
      if (!(await acquireGameSession("pvp"))) return;

      const selectedHeadquartersId = get().selectedHeadquartersId;
      void preloadHeadquartersAssets([selectedHeadquartersId]);
      if (deckCardIds) void preloadCardImages(deckCardIds);

      clearFirstTurnRollTimers();
      clearReconnectTimer();
      clearPendingPvpStart();
      pvpClient.clearSession();
      const now = Date.now();

      set({
        battle: null,
        mode: "pvp",
        menuView: "headquarters",
        pvpRoomId: normalizedRoomId,
        pvpStatus: "connecting",
        pvpError: null,
        pvpOpponentHeadquartersId: null,
        pvpMatchPreviewLabel: null,
        pvpSearchStartedAt: now,
        pvpSearchDeadlineAt: now + 30_000,
        pvpFallbackDeckCardIds: cloneDeckCardIds(deckCardIds),
        matchEndReason: null,
        pvpTimer: emptyPvpTimer,
        pvpMovementIntent: null,
        pvpAttackIntent: null,
        pvpDeployBarrageIntent: null,
        firstTurnRoll: emptyFirstTurnRoll,
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
      });

      connectAndRun(() =>
        pvpClient.joinRoom(normalizedRoomId, selectedHeadquartersId, deckCardIds)
      );
    } finally {
      battleStartInProgress = false;
      set({ battleStarting: false });
    }
  },

  startPvpBattle: (roomId, deckCardIds) => {
    if (roomId) {
      get().joinPvpRoom(roomId, deckCardIds);
      return;
    }

    get().findPvpMatch(deckCardIds);
  },

  restorePvpSession: () => {
    const roomId = pvpClient.getStoredRoomId();
    if (!roomId) return;

    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();

    set({
      battle: null,
      mode: "pvp",
      menuView: "headquarters",
      pvpRoomId: roomId,
      pvpStatus: "connecting",
      pvpError: "Восстанавливаю PVP-матч...",
      matchEndReason: null,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      pvpDeployBarrageIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });

    connectAndRun(() => pvpClient.reconnect());
  },

  applyRemoteBattleState: (battle) => {
    const state = get();
    const opponentIsActive =
      battle.status === "active" && battle.activePlayer !== state.localPlayerId;

    set({
      battle,
      pvpStatus: battle.status === "active" ? "inBattle" : "finished",
      pvpError: null,
      ...(battle.status === "active" ? {} : { pvpTimer: emptyPvpTimer }),
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      pvpDeployBarrageIntent: null,
      ...(opponentIsActive ? {} : { opponentSelectedCardInstanceId: null }),
    });
  },

  applyMatchEnded: (_winner, reason) => {
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();

    set({
      pvpStatus: "finished",
      pvpError: null,
      matchEndReason: reason,
      pvpTimer: emptyPvpTimer,
      pvpMovementIntent: null,
      pvpAttackIntent: null,
      pvpDeployBarrageIntent: null,
      firstTurnRoll: emptyFirstTurnRoll,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },

  applyOpponentCardSelection: (playerId, cardInstanceId) => {
    const state = get();

    if (state.mode !== "pvp") return;
    if (playerId === state.localPlayerId) return;
    if (!state.battle || state.battle.activePlayer !== playerId) {
      set({ opponentSelectedCardInstanceId: null });
      return;
    }

    if (
      cardInstanceId !== null &&
      !state.battle[playerId].hand.some((card) => card.instanceId === cardInstanceId)
    ) {
      return;
    }

    set({
      opponentSelectedCardInstanceId: cardInstanceId,
    });
  },

  applyPvpTimer: (timer) => {
    set({
      pvpTimer: {
        activePlayer: timer.activePlayer,
        remainingMs: timer.remainingMs,
        endsAt: timer.endsAt,
        durationMs: timer.durationMs,
      },
    });
  },

  applyPvpMovementIntent: (intent) => {
    set({ pvpMovementIntent: intent });
  },

  applyPvpAttackIntent: (intent) => {
    set({ pvpAttackIntent: intent });

    window.setTimeout(() => {
      set((state) => ({
        pvpAttackIntent:
          state.pvpAttackIntent?.intentId === intent.intentId
            ? null
            : state.pvpAttackIntent,
      }));
    }, intent.durationMs);
  },

  applyPvpDeployBarrageIntent: (intent) => {
    set({ pvpDeployBarrageIntent: intent });

    window.setTimeout(() => {
      set((state) => ({
        pvpDeployBarrageIntent:
          state.pvpDeployBarrageIntent?.intentId === intent.intentId
            ? null
            : state.pvpDeployBarrageIntent,
      }));
    }, intent.durationMs);
  },

  surrenderBattle: () => {
    const state = get();

    if (state.mode === "pvp") {
      pvpClient.surrender();
      return;
    }

    if (
      !state.battle ||
      state.battle.status === "player_won" ||
      state.battle.status === "bot_won"
    ) {
      return;
    }

    set({
      battle: {
        ...(state.battle as BattleState),
        status: "bot_won",
      },
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
      firstTurnRoll: emptyFirstTurnRoll,
    });
  },

  surrenderPvpMatch: () => {
    if (get().mode !== "pvp") return;

    pvpClient.surrender();
  },

  leavePvpMatch: () => {
    const state = get();
    if (state.mode !== "pvp") return;

    pvpClient.leaveMatch();

    if (state.battle?.status === "active") {
      return;
    }

    releaseGameSession();
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();
    pvpClient.clearSession();
    set(getCleanMenuState());
    pvpClient.disconnect();
  },

  cancelMatchmaking: () => {
    if (get().mode !== "pvp") return;

    releaseGameSession();
    pvpClient.cancelMatchmaking();
    clearFirstTurnRollTimers();
    clearReconnectTimer();
    clearPendingPvpStart();
    pvpClient.clearSession();
    set(getCleanMenuState());
  },

  setPvpError: (message) => {
    set({
      pvpError: message,
      pvpStatus: message ? "error" : get().pvpStatus,
    });
  },

  clearSessionError: () => {
    set({ sessionError: null });
  },

  dispatch: (action, precomputedNext) => {
    const { mode } = get();

    if (mode === "pvp") {
      pvpClient.sendAction(action);

      if (shouldClearSelection(action)) {
        pvpClient.selectCard(null);
        set({
          selectedCardInstanceId: null,
          selectedAttacker: null,
        });
      }

      return;
    }

    const currentBattle = get().battle as BattleState | null;

    if (!currentBattle) {
      return;
    }

    const { tutorialActive, tutorialScriptId, tutorialStepIndex } = get();

    if (tutorialActive) {
      // No idle pressure while the instructor is talking.
      if (action.type === "TIMER_TICK") return;

      if (
        !isTutorialActionAllowed(
          tutorialScriptId,
          tutorialStepIndex,
          action,
          currentBattle
        )
      ) {
        return;
      }
    }

    const nextTutorialStepIndex = tutorialActive
      ? getNextTutorialStepIndex(
          tutorialScriptId,
          tutorialStepIndex,
          action,
          currentBattle
        )
      : tutorialStepIndex;

    // Reuse the caller's already-simulated result when provided so randomised
    // effects are not rolled a second time (see the `dispatch` type comment).
    const nextBattle = precomputedNext ?? applyAction(currentBattle, action);

    set({
      battle: nextBattle,
      ...(tutorialActive ? { tutorialStepIndex: nextTutorialStepIndex } : {}),
      ...(shouldClearSelection(action)
        ? {
            selectedCardInstanceId: null,
            selectedAttacker: null,
          }
        : {}),
    });
  },

  reset: async () => {
    const { battle, currentCampaignMissionId, mode, tutorialActive, tutorialScriptId } =
      get();

    // The standalone training tutorial returns to the menu; guided campaign
    // demos (tutorialScriptId !== "training") fall through to the campaign path
    // below so mission progress is still recorded.
    if (tutorialActive && tutorialScriptId === "training") {
      releaseGameSession();
      set(getCleanMenuState());
      return;
    }

    if (mode === "pvp") {
      pvpClient.selectCard(null);
      set({
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
      });
      return;
    }

    if (mode === "campaign") {
      let completedCampaignMissionIds = get().completedCampaignMissionIds;

      if (
        battle?.status === "player_won" &&
        currentCampaignMissionId &&
        !completedCampaignMissionIds.includes(currentCampaignMissionId)
      ) {
        completedCampaignMissionIds = [
          ...completedCampaignMissionIds,
          currentCampaignMissionId,
        ];
        saveCompletedCampaignMissionIds(completedCampaignMissionIds);
      }

      releaseGameSession();
      set({
        battle: null,
        mode: "campaign",
        menuView: "missions",
        pvpRoomId: null,
        pvpStatus: "idle",
        pvpError: null,
        matchEndReason: null,
        pvpTimer: emptyPvpTimer,
        firstTurnRoll: emptyFirstTurnRoll,
        selectedCardInstanceId: null,
        opponentSelectedCardInstanceId: null,
        selectedAttacker: null,
        currentCampaignMissionId: null,
        completedCampaignMissionIds,
      });
      return;
    }

    const nextBattle = createFreshBattle(get().selectedHeadquartersId);
    await preloadBattleAssetsForState(nextBattle);

    set({
      battle: nextBattle,
      selectedCardInstanceId: null,
      opponentSelectedCardInstanceId: null,
      selectedAttacker: null,
    });
  },
}));

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__battleStore = useBattleStore;
}
