import {
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  HEADQUARTERS,
  getTrainingHeadquartersIds,
  isPlayerSelectableHeadquartersId,
} from "./headquarters";
import { getCardOrNull, normalizeCardId } from "./cards";
import {
  buildBattleRewardSource,
  calculateBattleReward,
  type BattleReward,
  type BattleRewardSource,
} from "./economy";
import { getDeckCardIds } from "./initialState";
import { RESEARCH_TREES, type ResearchNode } from "./researchTrees";
import {
  clearLegacyPlayerIdMigration,
  getCurrentUserId,
  getLegacyPlayerIdForMigration,
  resetGuestUserId,
  setCurrentUserId,
  switchToGuestUser,
} from "./playerIdentity";
import {
  createGoldPayment,
  getShopCatalog,
  profileClient,
  type GoldProductId,
} from "../network/profileClient";
import type {
  ClientBattleState,
  HeadquartersId,
  PlayerId,
} from "./types";
import type { GameMode, MatchEndReason } from "./modes";

export type PlayerAccountType = "base" | "premium";

export type PlayerBattleStats = {
  wins: number;
  losses: number;
};

export type PlayerSavedDeck = {
  id: string;
  name: string;
  headquartersId: HeadquartersId;
  cardIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type DailyLoginRewardKind =
  | "ironTracks"
  | "goldTracks"
  | "freeXp"
  | "premium";

export type DailyLoginReward = {
  id: string;
  dayKey: string;
  claimedAt: number;
  kind: DailyLoginRewardKind;
  amount: number;
};

export type PendingPlayerRewardClaim =
  | {
      type: "battle";
      claimId: string;
      battle: BattleRewardSource;
      mode: GameMode;
      localPlayerId: PlayerId;
      matchEndReason?: MatchEndReason | null;
    }
  | {
      type: "tutorial";
      reward: BattleReward;
      localPlayerWon: boolean;
    };

export type PlayerProfile = {
  nickname: string;
  accountType: PlayerAccountType;
  premiumUntil: number | null;
  lastActivityAt: number;
  tutorialCompleted: boolean;
  favoriteHeadquartersId: HeadquartersId | null;
  battleStats: PlayerBattleStats;
  pveBattleCount: number;
  ironTracks: number;
  goldTracks: number;
  freeXp: number;
  dailyLoginReward: DailyLoginReward | null;
  headquartersXp: Partial<Record<HeadquartersId, number>>;
  headquartersMatchCounts: Partial<Record<HeadquartersId, number>>;
  headquartersBattleStats: Partial<Record<HeadquartersId, PlayerBattleStats>>;
  researchedHeadquartersIds: HeadquartersId[];
  researchedCardIds: string[];
  unlockedHeadquartersIds: HeadquartersId[];
  unlockedCardIds: string[];
  ownedCardCopies: Record<string, number>;
  savedDecks: PlayerSavedDeck[];
  claimedBattleRewardIds: string[];
  pendingRewardClaims: PendingPlayerRewardClaim[];
};

export type PlayerProgress = PlayerProfile;

const PLAYER_PROGRESS_KEY = "tank-card-game:player-progress";
const PLAYER_NICKNAME_STORAGE_KEY = "panzershrek.playerNickname";
const PLAYER_ACCOUNT_TYPE_STORAGE_KEY = "panzershrek.accountType";
const FAVORITE_HEADQUARTERS_STORAGE_KEY = "panzershrek.favoriteHeadquartersId";
const STARTING_IRON_TRACKS = 0;
const DAY_MS = 24 * 60 * 60 * 1000;
const CUSTOM_DECK_CARD_LIMIT = 40;
const CUSTOM_DECK_COPY_LIMIT = 4;
export const PLAYER_NICKNAME_MAX_LENGTH = 14;
export const PLAYER_NICKNAME_PATTERN = /^[A-Za-z0-9_-]{3,14}$/;

async function getProfileClient() {
  return profileClient;
}

export function sanitizePlayerNicknameInput(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, PLAYER_NICKNAME_MAX_LENGTH);
}

export function isValidPlayerNickname(value: string): boolean {
  return PLAYER_NICKNAME_PATTERN.test(value);
}

export function normalizePlayerNickname(value: string, fallback = "Commander") {
  const normalized = sanitizePlayerNicknameInput(value.trim());
  return normalized || fallback;
}

function hashText(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function getDeckCountForClaim(battle: ClientBattleState, playerId: PlayerId): number {
  const player = battle[playerId] as { deck?: unknown[]; deckCount?: number };

  return typeof player.deckCount === "number"
    ? player.deckCount
    : Array.isArray(player.deck)
      ? player.deck.length
      : 0;
}

function createBattleRewardClaimId(input: {
  battle: ClientBattleState;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
}): string {
  const { battle } = input;
  const payload = JSON.stringify({
    mode: input.mode,
    localPlayerId: input.localPlayerId,
    matchEndReason: input.matchEndReason ?? null,
    status: battle.status,
    turn: battle.turn,
    backgroundId: battle.backgroundId,
    activePlayer: battle.activePlayer,
    playerHeadquartersId:
      battle.headquarters.player.headquartersId ?? battle.player.headquartersId,
    botHeadquartersId:
      battle.headquarters.bot.headquartersId ?? battle.bot.headquartersId,
    playerDeckId: battle.player.deckId,
    botDeckId: battle.bot.deckId,
    playerDeckCount: getDeckCountForClaim(battle, "player"),
    botDeckCount: getDeckCountForClaim(battle, "bot"),
    units: battle.units.map((unit) => [
      unit.instanceId,
      unit.cardId,
      unit.ownerId,
      unit.currentHp,
      unit.position.row,
      unit.position.col,
      unit.zone ?? "battlefield",
    ]),
    stats: battle.stats,
    log: battle.log,
  });

  return `battle:${hashText(payload)}`;
}

function createEmptyBattleReward(reward: BattleReward): BattleReward {
  return {
    ...reward,
    rawHeadquartersXp: 0,
    headquartersXp: 0,
    freeXp: 0,
    rawIronTracks: 0,
    repairCost: 0,
    ironTracks: 0,
    goldTracks: 0,
  };
}

export function loadPlayerProgress(): PlayerProgress {
  const fallbackProgress = createInitialPlayerProgress();

  try {
    const rawValue = window.localStorage.getItem(PLAYER_PROGRESS_KEY);
    if (!rawValue) return fallbackProgress;

    const parsedValue = JSON.parse(rawValue) as Partial<PlayerProgress>;

    return normalizePlayerProgress(parsedValue);
  } catch {
    return fallbackProgress;
  }
}

export function savePlayerProgress(progress: PlayerProgress) {
  window.localStorage.setItem(PLAYER_PROGRESS_KEY, JSON.stringify(progress));
}

function saveServerPlayerProgress(
  profile: PlayerProgress,
  pendingRewardClaims = loadPlayerProgress().pendingRewardClaims
): PlayerProgress {
  const nextProfile = normalizePlayerProgress({
    ...profile,
    pendingRewardClaims,
  });
  savePlayerProgress(nextProfile);

  return nextProfile;
}

export async function syncPlayerProgressFromServer(): Promise<PlayerProgress> {
  try {
    const profileClient = await getProfileClient();
    const playerId = getCurrentUserId();
    const legacyPlayerId = getLegacyPlayerIdForMigration();
    const localProgress = loadPlayerProgress();

    if (legacyPlayerId && legacyPlayerId !== playerId) {
      const migratedProfile = await profileClient.saveProfile(
        playerId,
        localProgress
      );
      clearLegacyPlayerIdMigration();
      return saveServerPlayerProgress(
        migratedProfile,
        localProgress.pendingRewardClaims
      );
    }

    if (localProgress.pendingRewardClaims.length > 0) {
      return await flushPendingRewardClaims(profileClient, playerId, localProgress);
    }

    const profile = await profileClient.getProfile(playerId);
    return saveServerPlayerProgress(profile, []);
  } catch {
    return loadPlayerProgress();
  }
}

async function flushPendingRewardClaims(
  profileClient: Awaited<ReturnType<typeof getProfileClient>>,
  playerId: string,
  progress: PlayerProgress
): Promise<PlayerProgress> {
  let latestProfile: PlayerProgress = progress;
  const remainingClaims: PendingPlayerRewardClaim[] = [];

  for (const claim of progress.pendingRewardClaims) {
    try {
      const response =
        claim.type === "battle"
          ? await profileClient.claimBattleReward(playerId, claim.claimId, {
              battle: claim.battle,
              mode: claim.mode,
              localPlayerId: claim.localPlayerId,
              matchEndReason: claim.matchEndReason ?? null,
            })
          : await profileClient.claimTutorialReward(
              playerId,
              claim.reward,
              claim.localPlayerWon
            );

      latestProfile = response.profile;
    } catch {
      remainingClaims.push(claim);
    }
  }

  const nextProfile = normalizePlayerProgress({
    ...latestProfile,
    pendingRewardClaims: remainingClaims,
  });
  savePlayerProgress(nextProfile);

  return nextProfile;
}

export async function claimBattleRewardFromServer(input: {
  battle: ClientBattleState;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
}): Promise<{ profile: PlayerProgress; reward?: BattleReward }> {
  const profileClient = await getProfileClient();
  const claimId = createBattleRewardClaimId(input);
  const result = await profileClient.claimBattleReward(
    getCurrentUserId(),
    claimId,
    { ...input, battle: buildBattleRewardSource(input.battle) }
  );
  const pendingRewardClaims = loadPlayerProgress().pendingRewardClaims.filter(
    (claim) => claim.type !== "battle" || claim.claimId !== claimId
  );

  return {
    ...result,
    profile: saveServerPlayerProgress(result.profile, pendingRewardClaims),
  };
}

export async function claimPvpBattleRewardFromServer(input: {
  roomId: string;
  localPlayerId: PlayerId;
}): Promise<{ profile: PlayerProgress; reward?: BattleReward }> {
  const profileClient = await getProfileClient();
  const result = await profileClient.claimPvpBattleReward(
    getCurrentUserId(),
    input.roomId,
    input.localPlayerId
  );

  return {
    ...result,
    profile: saveServerPlayerProgress(result.profile),
  };
}

export async function claimTutorialRewardFromServer(input: {
  reward: BattleReward;
  localPlayerWon?: boolean;
}): Promise<{ profile: PlayerProgress; reward?: BattleReward } | null> {
  try {
    const profileClient = await getProfileClient();
    const result = await profileClient.claimTutorialReward(
      getCurrentUserId(),
      input.reward,
      input.localPlayerWon ?? true
    );
    const pendingRewardClaims = loadPlayerProgress().pendingRewardClaims.filter(
      (claim) => claim.type !== "tutorial"
    );

    return {
      ...result,
      profile: saveServerPlayerProgress(result.profile, pendingRewardClaims),
    };
  } catch {
    return null;
  }
}

function createEmptyTutorialReward(reward: BattleReward): BattleReward {
  return createEmptyBattleReward(reward);
}

function getBattleWinner(battle: ClientBattleState, localPlayerId: PlayerId) {
  return (
    (battle.status === "player_won" && localPlayerId === "player") ||
    (battle.status === "bot_won" && localPlayerId === "bot")
  );
}

function applyRewardToProgress(
  progress: PlayerProgress,
  reward: BattleReward,
  localPlayerWon: boolean,
  mode?: GameMode
): PlayerProgress {
  const currentHeadquartersXp =
    progress.headquartersXp[reward.headquartersId] ?? 0;
  const currentHeadquartersMatches =
    progress.headquartersMatchCounts[reward.headquartersId] ?? 0;
  const currentHeadquartersStats = progress.headquartersBattleStats[
    reward.headquartersId
  ] ?? {
    wins: 0,
    losses: 0,
  };

  return {
    ...progress,
    ironTracks: progress.ironTracks + reward.ironTracks,
    goldTracks: progress.goldTracks + reward.goldTracks,
    freeXp: progress.freeXp + reward.freeXp,
    headquartersXp: {
      ...progress.headquartersXp,
      [reward.headquartersId]:
        currentHeadquartersXp + reward.headquartersXp,
    },
    headquartersMatchCounts: {
      ...progress.headquartersMatchCounts,
      [reward.headquartersId]: currentHeadquartersMatches + 1,
    },
    headquartersBattleStats: {
      ...progress.headquartersBattleStats,
      [reward.headquartersId]: {
        wins: currentHeadquartersStats.wins + (localPlayerWon ? 1 : 0),
        losses: currentHeadquartersStats.losses + (localPlayerWon ? 0 : 1),
      },
    },
    battleStats: {
      wins: progress.battleStats.wins + (localPlayerWon ? 1 : 0),
      losses: progress.battleStats.losses + (localPlayerWon ? 0 : 1),
    },
    pveBattleCount:
      progress.pveBattleCount + (mode === "ai" ? 1 : 0),
  };
}

export function applyBattleRewardToProgress(input: {
  battle: ClientBattleState;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
  queueForServer?: boolean;
}): { progress: PlayerProgress; reward: BattleReward } | null {
  const { battle, mode, localPlayerId, matchEndReason = null } = input;
  if (battle.status !== "player_won" && battle.status !== "bot_won") return null;

  const progress = loadPlayerProgress();
  const claimId = createBattleRewardClaimId({
    battle,
    mode,
    localPlayerId,
    matchEndReason,
  });
  const rewardHeadquartersId =
    battle.headquarters[localPlayerId].headquartersId ??
    battle[localPlayerId].headquartersId;
  const reward = calculateBattleReward({
    battle,
    mode,
    localPlayerId,
    matchEndReason,
    headquartersFullyResearched: isHeadquartersFullyResearched(
      progress,
      rewardHeadquartersId
    ),
    premiumActive: isPremiumAccountActive(progress),
  });

  if (progress.claimedBattleRewardIds.includes(claimId)) {
    return {
      progress,
      reward: createEmptyBattleReward(reward),
    };
  }

  const localPlayerWon = getBattleWinner(battle, localPlayerId);
  const pendingRewardClaims =
    input.queueForServer === false
      ? progress.pendingRewardClaims
      : [
          {
            type: "battle" as const,
            claimId,
            battle: buildBattleRewardSource(battle),
            mode,
            localPlayerId,
            matchEndReason,
          },
          ...progress.pendingRewardClaims.filter(
            (claim) => claim.type !== "battle" || claim.claimId !== claimId
          ),
        ];
  const nextProgress: PlayerProgress = {
    ...applyRewardToProgress(progress, reward, localPlayerWon, mode),
    claimedBattleRewardIds: [
      claimId,
      ...progress.claimedBattleRewardIds,
    ].slice(0, 500),
    pendingRewardClaims,
  };

  savePlayerProgress(nextProgress);

  return {
    progress: nextProgress,
    reward,
  };
}

export function applyTutorialBattleRewardToProgress(
  reward: BattleReward,
  localPlayerWon?: boolean
): PlayerProgress {
  const progress = loadPlayerProgress();
  if (progress.tutorialCompleted) return progress;

  const nextProgress: PlayerProgress = {
    ...applyRewardToProgress(progress, reward, localPlayerWon ?? true),
    tutorialCompleted: true,
    pendingRewardClaims: [
      {
        type: "tutorial",
        reward,
        localPlayerWon: localPlayerWon ?? true,
      },
      ...progress.pendingRewardClaims.filter((claim) => claim.type !== "tutorial"),
    ],
  };

  savePlayerProgress(nextProgress);

  return nextProgress;
}

export function getLocalTutorialReward(reward: BattleReward): BattleReward {
  return loadPlayerProgress().tutorialCompleted
    ? createEmptyTutorialReward(reward)
    : reward;
}

export function hasCompletedTutorial(progress = loadPlayerProgress()): boolean {
  return progress.tutorialCompleted;
}

export function createInitialPlayerProgress(): PlayerProgress {
  const trainingHeadquartersIds = getTrainingHeadquartersIds();
  const starterCardCopies = getStarterOwnedCardCopies(trainingHeadquartersIds);
  const starterCardIds = Object.keys(starterCardCopies);

  return {
    nickname: readLegacyString(PLAYER_NICKNAME_STORAGE_KEY) ?? "Commander",
    accountType:
      readLegacyString(PLAYER_ACCOUNT_TYPE_STORAGE_KEY) === "premium"
        ? "premium"
        : "base",
    premiumUntil: null,
    lastActivityAt: Date.now(),
    tutorialCompleted: false,
    favoriteHeadquartersId: getValidHeadquartersId(
      readLegacyString(FAVORITE_HEADQUARTERS_STORAGE_KEY)
    ),
    battleStats: {
      wins: 0,
      losses: 0,
    },
    pveBattleCount: 0,
    ironTracks: STARTING_IRON_TRACKS,
    goldTracks: 0,
    freeXp: 0,
    dailyLoginReward: null,
    headquartersXp: {},
    headquartersMatchCounts: {},
    headquartersBattleStats: {},
    researchedHeadquartersIds:
      trainingHeadquartersIds.length > 0
        ? trainingHeadquartersIds
        : [DEFAULT_PLAYER_HEADQUARTERS_ID],
    researchedCardIds: starterCardIds,
    unlockedHeadquartersIds:
      trainingHeadquartersIds.length > 0
        ? trainingHeadquartersIds
        : [DEFAULT_PLAYER_HEADQUARTERS_ID],
    unlockedCardIds: starterCardIds,
    ownedCardCopies: starterCardCopies,
    savedDecks: [],
    claimedBattleRewardIds: [],
    pendingRewardClaims: [],
  };
}

function normalizePlayerProgress(
  progress: Partial<PlayerProgress>
): PlayerProgress {
  const fallback = createInitialPlayerProgress();
  const researchedHeadquartersIds = Array.from(
    new Set([
      ...fallback.researchedHeadquartersIds,
      ...(Array.isArray(progress.researchedHeadquartersIds)
        ? progress.researchedHeadquartersIds
        : []),
      ...(Array.isArray(progress.unlockedHeadquartersIds)
        ? progress.unlockedHeadquartersIds
        : []),
    ])
  ).filter(isPlayerSelectableHeadquartersId);
  const unlockedHeadquartersIds = Array.from(
    new Set([
      ...fallback.unlockedHeadquartersIds,
      ...(Array.isArray(progress.unlockedHeadquartersIds)
        ? progress.unlockedHeadquartersIds
        : []),
    ])
  ).filter(isPlayerSelectableHeadquartersId);
  const researchedCardIds = Array.from(
    new Set([
      ...fallback.researchedCardIds,
      ...(Array.isArray(progress.researchedCardIds)
        ? progress.researchedCardIds
        : []),
      ...(Array.isArray(progress.unlockedCardIds)
        ? progress.unlockedCardIds
        : []),
    ])
  );
  const unlockedCardIds = Array.from(
    new Set([
      ...fallback.unlockedCardIds,
      ...(Array.isArray(progress.unlockedCardIds)
        ? progress.unlockedCardIds
        : []),
    ])
  );
  const ownedCardCopies =
    typeof progress.ownedCardCopies === "object" && progress.ownedCardCopies
      ? normalizeCardCopies(
          mergeOwnedCardCopiesWithFloor(
            fallback.ownedCardCopies,
            progress.ownedCardCopies
          )
        )
      : fallback.ownedCardCopies;
  const premiumUntil =
    typeof progress.premiumUntil === "number" &&
    Number.isFinite(progress.premiumUntil) &&
    progress.premiumUntil > Date.now()
      ? Math.floor(progress.premiumUntil)
      : null;
  const hasLegacyPremium =
    progress.accountType === "premium" && progress.premiumUntil == null;
  const battleStats = normalizeBattleStats(progress.battleStats);
  const pveBattleCount =
    typeof progress.pveBattleCount === "number" &&
    Number.isFinite(progress.pveBattleCount)
      ? getPositiveInteger(progress.pveBattleCount)
      : battleStats.wins + battleStats.losses;

  return {
    nickname:
      typeof progress.nickname === "string"
        ? normalizePlayerNickname(progress.nickname, fallback.nickname)
        : fallback.nickname,
    accountType: premiumUntil || hasLegacyPremium ? "premium" : "base",
    premiumUntil,
    lastActivityAt:
      typeof progress.lastActivityAt === "number" &&
      Number.isFinite(progress.lastActivityAt)
        ? Math.max(0, Math.floor(progress.lastActivityAt))
        : fallback.lastActivityAt,
    tutorialCompleted:
      typeof progress.tutorialCompleted === "boolean"
        ? progress.tutorialCompleted
        : fallback.tutorialCompleted,
    favoriteHeadquartersId:
      getValidHeadquartersId(progress.favoriteHeadquartersId) ??
      fallback.favoriteHeadquartersId,
    battleStats,
    pveBattleCount,
    ironTracks: getPositiveInteger(progress.ironTracks),
    goldTracks: getPositiveInteger(progress.goldTracks),
    freeXp: getPositiveInteger(progress.freeXp),
    dailyLoginReward: normalizeDailyLoginReward(progress.dailyLoginReward),
    headquartersXp:
      typeof progress.headquartersXp === "object" && progress.headquartersXp
        ? progress.headquartersXp
        : {},
    headquartersMatchCounts:
      typeof progress.headquartersMatchCounts === "object" &&
      progress.headquartersMatchCounts
        ? normalizeHeadquartersCounts(progress.headquartersMatchCounts)
        : {},
    headquartersBattleStats:
      typeof progress.headquartersBattleStats === "object" &&
      progress.headquartersBattleStats
        ? normalizeHeadquartersBattleStats(progress.headquartersBattleStats)
        : {},
    researchedHeadquartersIds,
    researchedCardIds,
    unlockedHeadquartersIds,
    unlockedCardIds,
    ownedCardCopies,
    savedDecks: Array.isArray(progress.savedDecks)
      ? normalizeSavedDecks(progress.savedDecks, {
          ownedCardCopies,
          unlockedHeadquartersIds,
        })
      : fallback.savedDecks,
    claimedBattleRewardIds: Array.isArray(progress.claimedBattleRewardIds)
      ? progress.claimedBattleRewardIds.filter(
          (rewardId): rewardId is string => typeof rewardId === "string"
        )
      : fallback.claimedBattleRewardIds,
    pendingRewardClaims: Array.isArray(progress.pendingRewardClaims)
      ? normalizePendingRewardClaims(progress.pendingRewardClaims)
      : fallback.pendingRewardClaims,
  };
}

function normalizeDailyLoginReward(value: unknown): DailyLoginReward | null {
  if (!value || typeof value !== "object") return null;

  const reward = value as Partial<DailyLoginReward>;
  const kind = reward.kind;
  if (
    kind !== "ironTracks" &&
    kind !== "goldTracks" &&
    kind !== "freeXp" &&
    kind !== "premium"
  ) {
    return null;
  }

  if (typeof reward.id !== "string" || typeof reward.dayKey !== "string") {
    return null;
  }

  const id = reward.id.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120);
  const dayKey = reward.dayKey.replace(/[^0-9-]/g, "").slice(0, 16);
  if (!id || !dayKey) return null;

  return {
    id,
    dayKey,
    kind,
    claimedAt:
      typeof reward.claimedAt === "number" && Number.isFinite(reward.claimedAt)
        ? Math.max(0, Math.floor(reward.claimedAt))
        : 0,
    amount: getPositiveInteger(reward.amount),
  };
}

export function isPremiumAccountActive(
  progress: Pick<PlayerProgress, "accountType" | "premiumUntil">,
  now = Date.now()
): boolean {
  if (
    typeof progress.premiumUntil === "number" &&
    Number.isFinite(progress.premiumUntil)
  ) {
    return progress.premiumUntil > now;
  }

  return progress.accountType === "premium";
}

export function addPremiumDaysToProgress(
  progress: PlayerProgress,
  days: number,
  now = Date.now()
): PlayerProgress {
  const safeDays = getPositiveInteger(days);
  const currentUntil =
    typeof progress.premiumUntil === "number" &&
    Number.isFinite(progress.premiumUntil)
      ? progress.premiumUntil
      : 0;
  const startsAt = Math.max(now, currentUntil);

  return {
    ...progress,
    accountType: "premium",
    premiumUntil: startsAt + safeDays * DAY_MS,
  };
}

function normalizePendingRewardClaims(
  claims: unknown[]
): PendingPlayerRewardClaim[] {
  return claims.flatMap((claim): PendingPlayerRewardClaim[] => {
    if (!claim || typeof claim !== "object") return [];

    const candidate = claim as Partial<PendingPlayerRewardClaim>;
    if (candidate.type === "battle") {
      if (
        typeof candidate.claimId !== "string" ||
        !candidate.battle ||
        typeof candidate.battle !== "object" ||
        (candidate.mode !== "ai" &&
          candidate.mode !== "campaign" &&
          candidate.mode !== "pvp") ||
        (candidate.localPlayerId !== "player" && candidate.localPlayerId !== "bot")
      ) {
        return [];
      }

      // Slim the stored battle down to the reward-relevant fields. Safe to
      // re-apply to already-slim claims, and it shrinks legacy claims that were
      // persisted with the full battle state before this change. Drop the claim
      // if the stored battle is malformed rather than failing the whole load.
      let battle: BattleRewardSource;
      try {
        battle = buildBattleRewardSource(candidate.battle as ClientBattleState);
      } catch {
        return [];
      }

      return [
        {
          type: "battle",
          claimId: candidate.claimId,
          battle,
          mode: candidate.mode,
          localPlayerId: candidate.localPlayerId,
          matchEndReason: candidate.matchEndReason ?? null,
        },
      ];
    }

    if (candidate.type === "tutorial" && candidate.reward) {
      return [
        {
          type: "tutorial",
          reward: candidate.reward,
          localPlayerWon: candidate.localPlayerWon ?? true,
        },
      ];
    }

    return [];
  });
}

export function getFavoriteHeadquartersId(
  progress: PlayerProgress
): HeadquartersId {
  if (
    progress.favoriteHeadquartersId &&
    isPlayerSelectableHeadquartersId(progress.favoriteHeadquartersId)
  ) {
    return progress.favoriteHeadquartersId;
  }

  const mostPlayedHeadquarters = Object.entries(progress.headquartersMatchCounts)
    .filter((entry): entry is [HeadquartersId, number] => {
      const [headquartersId, matchCount] = entry;
      return isPlayerSelectableHeadquartersId(headquartersId) && matchCount > 0;
    })
    .sort(([, leftMatches], [, rightMatches]) => rightMatches - leftMatches)[0];

  return mostPlayedHeadquarters?.[0] ?? DEFAULT_PLAYER_HEADQUARTERS_ID;
}

export async function setFavoriteHeadquartersIdOnServer(
  headquartersId: HeadquartersId
): Promise<PlayerProgress | null> {
  const progress = loadPlayerProgress();
  const nextProgress = {
    ...progress,
    favoriteHeadquartersId: isPlayerSelectableHeadquartersId(headquartersId)
      ? headquartersId
      : null,
  };

  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.updateFavoriteHeadquarters(
      getCurrentUserId(),
      nextProgress.favoriteHeadquartersId
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
}

export async function setPlayerNicknameOnServer(
  nickname: string
): Promise<PlayerProgress | null> {
  const progress = loadPlayerProgress();
  const nextProgress = {
    ...progress,
    nickname: normalizePlayerNickname(nickname, progress.nickname),
  };

  savePlayerProgress(nextProgress);
  window.localStorage.setItem(PLAYER_NICKNAME_STORAGE_KEY, nextProgress.nickname);

  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.updateNickname(
      getCurrentUserId(),
      nextProgress.nickname
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
}

export async function registerPlayerAccount(input: {
  username: string;
  email: string;
  password: string;
  legalAccepted: boolean;
  promoCode?: string;
  mergeGuestProgress?: boolean;
}): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const pendingRewardClaims = input.mergeGuestProgress ?? true
    ? loadPlayerProgress().pendingRewardClaims
    : [];
  const authResult = await profileClient.registerAccount({
    ...input,
    guestPlayerId: getCurrentUserId(),
    mergeGuestProgress: input.mergeGuestProgress ?? true,
  });

  setCurrentUserId(authResult.userId);
  const savedProfile = saveServerPlayerProgress(
    authResult.profile,
    pendingRewardClaims
  );
  const accountNickname = normalizePlayerNickname(authResult.username, savedProfile.nickname);

  if (savedProfile.nickname === accountNickname) {
    return savedProfile;
  }

  const renamedProfile = {
    ...savedProfile,
    nickname: accountNickname,
  };
  savePlayerProgress(renamedProfile);
  window.localStorage.setItem(PLAYER_NICKNAME_STORAGE_KEY, accountNickname);

  try {
    const profile = await profileClient.updateNickname(
      authResult.userId,
      accountNickname
    );
    return saveServerPlayerProgress(profile, pendingRewardClaims);
  } catch {
    return renamedProfile;
  }
}

export async function loginPlayerAccount(input: {
  username: string;
  password: string;
  mergeGuestProgress?: boolean;
}): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const authResult = await profileClient.loginAccount({
    ...input,
    guestPlayerId: getCurrentUserId(),
    mergeGuestProgress: input.mergeGuestProgress ?? false,
  });

  setCurrentUserId(authResult.userId);
  return saveServerPlayerProgress(
    authResult.profile,
    input.mergeGuestProgress ?? false
      ? loadPlayerProgress().pendingRewardClaims
      : []
  );
}

/**
 * Wipes the guest's progress on this device/browser and mints a fresh guest
 * identity. Used by the settings "sign out" action for guest profiles — the old
 * guest profile on the server is left orphaned and the player starts clean.
 */
export function resetGuestProgress(): PlayerProgress {
  profileClient.clearSession();
  window.localStorage.removeItem(PLAYER_PROGRESS_KEY);
  window.localStorage.removeItem(PLAYER_NICKNAME_STORAGE_KEY);
  window.localStorage.removeItem(PLAYER_ACCOUNT_TYPE_STORAGE_KEY);
  window.localStorage.removeItem(FAVORITE_HEADQUARTERS_STORAGE_KEY);

  resetGuestUserId();

  const freshProgress = createInitialPlayerProgress();
  savePlayerProgress(freshProgress);

  return freshProgress;
}

export async function logoutPlayerAccount(): Promise<PlayerProgress> {
  profileClient.clearSession();
  const guestUserId = switchToGuestUser();

  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.getProfile(guestUserId);
    return saveServerPlayerProgress(profile, []);
  } catch {
    const fallbackProfile = createInitialPlayerProgress();
    savePlayerProgress(fallbackProfile);
    return fallbackProfile;
  }
}

export function isHeadquartersFullyResearched(
  progress: PlayerProgress,
  headquartersId: HeadquartersId
): boolean {
  const scope = getResearchScopeForHeadquarters(headquartersId);

  if (scope.length === 0) return false;

  return scope.every((node) => isResearchNodeCompleted(node, progress));
}

/**
 * Whether a node counts toward research progression. Planned (coming soon) and
 * premium (gold-purchase) nodes are excluded so a headquarters can be "fully
 * researched" without buying premium cards.
 */
function isProgressionNode(node: ResearchNode): boolean {
  return node.status !== "planned" && node.goldCost === undefined;
}

function getResearchScopeForHeadquarters(
  headquartersId: HeadquartersId
): ResearchNode[] {
  for (const tree of Object.values(RESEARCH_TREES)) {
    if (tree.starterHeadquarters.headquartersId === headquartersId) {
      return tree.branches.flatMap((branch) =>
        branch.nodes.filter(isProgressionNode)
      );
    }

    for (const branch of tree.branches) {
      const nodeById = new Map(branch.nodes.map((node) => [node.id, node]));
      const headquartersNodeIndex = branch.nodes.findIndex(
        (node) => node.headquartersId === headquartersId
      );
      const headquartersNode = branch.nodes[headquartersNodeIndex];

      if (!headquartersNode) continue;

      if (!branch.nodes.some((node) => node.requires && node.requires.length > 0)) {
        return branch.nodes
          .slice(headquartersNodeIndex + 1)
          .filter(isProgressionNode);
      }

      return branch.nodes.filter((node) => {
        if (!isProgressionNode(node)) return false;
        if (node.id === headquartersNode.id) return false;

        return dependsOnNode(node, headquartersNode.id, nodeById);
      });
    }
  }

  return [];
}

function dependsOnNode(
  node: ResearchNode,
  requiredNodeId: string,
  nodeById: Map<string, ResearchNode>
): boolean {
  const requires = node.requires ?? [];
  if (requires.includes(requiredNodeId)) return true;

  return requires.some((dependencyId) => {
    const dependency = nodeById.get(dependencyId);
    return dependency
      ? dependsOnNode(dependency, requiredNodeId, nodeById)
      : false;
  });
}

function isResearchNodeCompleted(
  node: ResearchNode,
  progress: PlayerProgress
): boolean {
  if (node.cardId) return progress.researchedCardIds.includes(node.cardId);
  if (node.headquartersId) {
    return progress.researchedHeadquartersIds.includes(node.headquartersId);
  }

  return true;
}

export function canSpendResearchExperience(
  progress: PlayerProgress,
  headquartersId: HeadquartersId,
  cost: number
): boolean {
  return (
    (progress.headquartersXp[headquartersId] ?? 0) + progress.freeXp >=
    Math.max(0, cost)
  );
}

export function spendResearchExperience(
  progress: PlayerProgress,
  headquartersId: HeadquartersId,
  cost: number
): PlayerProgress {
  const normalizedCost = Math.max(0, Math.floor(cost));
  const headquartersXp = progress.headquartersXp[headquartersId] ?? 0;
  const spentHeadquartersXp = Math.min(headquartersXp, normalizedCost);
  const spentFreeXp = normalizedCost - spentHeadquartersXp;

  return {
    ...progress,
    freeXp: Math.max(0, progress.freeXp - spentFreeXp),
    headquartersXp: {
      ...progress.headquartersXp,
      [headquartersId]: headquartersXp - spentHeadquartersXp,
    },
  };
}

export async function researchCardOnServer(
  cardId: string,
  headquartersId: HeadquartersId,
  _cost: number
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.researchCard(
    getCurrentUserId(),
    cardId,
    headquartersId
  );
  return saveServerPlayerProgress(profile);
}

export async function researchHeadquartersOnServer(
  targetHeadquartersId: HeadquartersId,
  sourceHeadquartersId: HeadquartersId,
  _cost: number
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.researchHeadquarters(
    getCurrentUserId(),
    targetHeadquartersId,
    sourceHeadquartersId
  );
  return saveServerPlayerProgress(profile);
}

export async function purchaseCardCopyOnServer(
  cardId: string,
  _cost: number,
  _copyLimit = 4
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.purchaseCardCopy(
    getCurrentUserId(),
    cardId
  );
  return saveServerPlayerProgress(profile);
}

export async function purchaseHeadquartersOnServer(
  headquartersId: HeadquartersId,
  _cost: number
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.purchaseHeadquarters(
    getCurrentUserId(),
    headquartersId
  );
  return saveServerPlayerProgress(profile);
}

export async function purchasePremiumCardOnServer(
  cardId: string,
  _goldCost: number
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.purchasePremiumCard(
    getCurrentUserId(),
    cardId
  );
  return saveServerPlayerProgress(profile);
}

export async function purchasePremiumDaysOnServer(
  days: number
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.purchasePremiumDays(
    getCurrentUserId(),
    days
  );
  return saveServerPlayerProgress(profile);
}

/** Сколько железных траков даёт один золотой трак при обмене в магазине. */
export const GOLD_TO_IRON_RATE = 100;

export async function exchangeGoldForIronOnServer(
  goldAmount: number
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.exchangeGoldForIron(
    getCurrentUserId(),
    goldAmount
  );
  return saveServerPlayerProgress(profile);
}

export async function createGoldTracksPaymentOnServer(
  productId: GoldProductId
) {
  return createGoldPayment(getCurrentUserId(), productId);
}

export async function loadShopCatalogFromServer() {
  return getShopCatalog();
}

/**
 * Grants the cards tied to completing a campaign reward (e.g. the Funk Panzer I
 * copies for finishing the Polish campaign). The server is idempotent, so this
 * can be re-requested whenever the completion condition holds.
 */
export async function claimCampaignRewardFromServer(
  rewardId: string
): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const profile = await profileClient.claimCampaignReward(
    getCurrentUserId(),
    rewardId
  );
  return saveServerPlayerProgress(profile);
}

function getPositiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function normalizeHeadquartersCounts(
  counts: Partial<Record<HeadquartersId, unknown>>
): Partial<Record<HeadquartersId, number>> {
  return Object.fromEntries(
    Object.entries(counts).map(([headquartersId, count]) => [
      headquartersId,
      getPositiveInteger(count),
    ])
  ) as Partial<Record<HeadquartersId, number>>;
}

function getStarterOwnedCardCopies(
  trainingHeadquartersIds: HeadquartersId[]
): Record<string, number> {
  const copies: Record<string, number> = {};

  for (const headquartersId of trainingHeadquartersIds) {
    const deckId = HEADQUARTERS[headquartersId]?.defaultDeckId;
    if (!deckId) continue;

    for (const cardId of getDeckCardIds(deckId)) {
      // Базовые карты выдаём сразу в максимальном количестве копий (4), чтобы из
      // них можно было собрать колоду с полным набором копий каждой карты.
      copies[cardId] = 4;
    }
  }

  return copies;
}

/**
 * Сливает копии карт, беря максимум по каждой карте. Базовый набор (floor)
 * выступает гарантированным минимумом владения — так базовые карты остаются
 * во владении в количестве 4 даже у уже существующих профилей, а не только у
 * новых.
 */
export function mergeOwnedCardCopiesWithFloor(
  floor: Record<string, number>,
  override: Record<string, unknown>
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const [cardId, count] of Object.entries(floor)) {
    merged[cardId] = getPositiveInteger(count);
  }
  for (const [cardId, count] of Object.entries(override)) {
    merged[cardId] = Math.max(merged[cardId] ?? 0, getPositiveInteger(count));
  }
  return merged;
}

function normalizeCardCopies(copies: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(copies).map(([cardId, count]) => [
      cardId,
      getPositiveInteger(count),
    ])
  );
}

function normalizeSavedDecks(
  decks: unknown[],
  progress: Pick<PlayerProgress, "ownedCardCopies" | "unlockedHeadquartersIds">
): PlayerSavedDeck[] {
  return decks.flatMap((deck): PlayerSavedDeck[] => {
    if (!deck || typeof deck !== "object") return [];

    const candidate = deck as Partial<PlayerSavedDeck>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.headquartersId !== "string" ||
      !(candidate.headquartersId in HEADQUARTERS) ||
      !Array.isArray(candidate.cardIds)
    ) {
      return [];
    }

    const headquartersId = candidate.headquartersId as HeadquartersId;
    if (!progress.unlockedHeadquartersIds.includes(headquartersId)) return [];

    const normalizedCardIds = normalizeSavedDeckCardIds(
      headquartersId,
      candidate.cardIds,
      progress.ownedCardCopies
    );
    if (!normalizedCardIds) return [];

    return [
      {
        id: candidate.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
        name: candidate.name.trim().slice(0, 40) || "Deck",
        headquartersId,
        cardIds: normalizedCardIds,
        createdAt: getPositiveInteger(candidate.createdAt),
        updatedAt: getPositiveInteger(candidate.updatedAt),
      },
    ].filter((item) => Boolean(item.id));
  });
}

function normalizeSavedDeckCardIds(
  headquartersId: HeadquartersId,
  rawCardIds: unknown[],
  ownedCardCopies: Record<string, number>
): string[] | null {
  if (rawCardIds.length !== CUSTOM_DECK_CARD_LIMIT) return null;

  const headquarters = HEADQUARTERS[headquartersId];
  const copies = new Map<string, number>();
  const cardIds: string[] = [];

  for (const rawCardId of rawCardIds) {
    if (typeof rawCardId !== "string") return null;

    const cardId = normalizeCardId(rawCardId);
    const card = cardId ? getCardOrNull(cardId) : null;
    if (!card || !cardId) return null;

    if (card.nation !== headquarters.nation) {
      return null;
    }

    const nextCopies = (copies.get(cardId) ?? 0) + 1;
    if (nextCopies > CUSTOM_DECK_COPY_LIMIT) return null;
    if (nextCopies > (ownedCardCopies[cardId] ?? 0)) return null;

    copies.set(cardId, nextCopies);
    cardIds.push(cardId);
  }

  return cardIds;
}

function normalizeBattleStats(value: unknown): PlayerProgress["battleStats"] {
  if (!value || typeof value !== "object") {
    return {
      wins: 0,
      losses: 0,
    };
  }

  const stats = value as Partial<Record<"wins" | "losses", unknown>>;

  return {
    wins: getPositiveInteger(stats.wins),
    losses: getPositiveInteger(stats.losses),
  };
}

function normalizeHeadquartersBattleStats(
  value: Partial<Record<HeadquartersId, unknown>>
): Partial<Record<HeadquartersId, PlayerBattleStats>> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([headquartersId]) => headquartersId in HEADQUARTERS)
      .map(([headquartersId, stats]) => [
        headquartersId,
        normalizeBattleStats(stats),
      ])
  ) as Partial<Record<HeadquartersId, PlayerBattleStats>>;
}

function getValidHeadquartersId(value: unknown): HeadquartersId | null {
  return isPlayerSelectableHeadquartersId(value) ? value : null;
}

function readLegacyString(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
