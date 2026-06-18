import {
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  HEADQUARTERS,
  getTrainingHeadquartersIds,
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
  setCurrentUserId,
  switchToGuestUser,
} from "./playerIdentity";
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
  tutorialCompleted: boolean;
  favoriteHeadquartersId: HeadquartersId | null;
  battleStats: PlayerBattleStats;
  ironTracks: number;
  goldTracks: number;
  freeXp: number;
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
const CUSTOM_DECK_CARD_LIMIT = 40;
const CUSTOM_DECK_COPY_LIMIT = 4;

async function getProfileClient() {
  return (await import("../network/profileClient")).profileClient;
}

export function normalizePlayerNickname(value: string, fallback = "Командир") {
  const normalized = value.trim().slice(0, 32);
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
}): Promise<{ profile: PlayerProgress; reward?: BattleReward } | null> {
  try {
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
  } catch {
    return null;
  }
}

export async function claimPvpBattleRewardFromServer(input: {
  roomId: string;
  localPlayerId: PlayerId;
}): Promise<{ profile: PlayerProgress; reward?: BattleReward } | null> {
  try {
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
  } catch {
    return null;
  }
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
  localPlayerWon: boolean
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
    ...applyRewardToProgress(progress, reward, localPlayerWon),
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
    nickname: readLegacyString(PLAYER_NICKNAME_STORAGE_KEY) ?? "Командир",
    accountType:
      readLegacyString(PLAYER_ACCOUNT_TYPE_STORAGE_KEY) === "premium"
        ? "premium"
        : "base",
    tutorialCompleted: false,
    favoriteHeadquartersId: getValidHeadquartersId(
      readLegacyString(FAVORITE_HEADQUARTERS_STORAGE_KEY)
    ),
    battleStats: {
      wins: 0,
      losses: 0,
    },
    ironTracks: STARTING_IRON_TRACKS,
    goldTracks: 0,
    freeXp: 0,
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
  ).filter((headquartersId): headquartersId is HeadquartersId =>
    Boolean(HEADQUARTERS[headquartersId as HeadquartersId])
  );
  const unlockedHeadquartersIds = Array.from(
    new Set([
      ...fallback.unlockedHeadquartersIds,
      ...(Array.isArray(progress.unlockedHeadquartersIds)
        ? progress.unlockedHeadquartersIds
        : []),
    ])
  ).filter((headquartersId): headquartersId is HeadquartersId =>
    Boolean(HEADQUARTERS[headquartersId as HeadquartersId])
  );
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
      ? normalizeCardCopies({
          ...fallback.ownedCardCopies,
          ...progress.ownedCardCopies,
        })
      : fallback.ownedCardCopies;

  return {
    nickname:
      typeof progress.nickname === "string" && progress.nickname.trim()
        ? progress.nickname.trim()
        : fallback.nickname,
    accountType: progress.accountType === "premium" ? "premium" : "base",
    tutorialCompleted:
      typeof progress.tutorialCompleted === "boolean"
        ? progress.tutorialCompleted
        : fallback.tutorialCompleted,
    favoriteHeadquartersId:
      getValidHeadquartersId(progress.favoriteHeadquartersId) ??
      fallback.favoriteHeadquartersId,
    battleStats: normalizeBattleStats(progress.battleStats),
    ironTracks: getPositiveInteger(progress.ironTracks),
    goldTracks: getPositiveInteger(progress.goldTracks),
    freeXp: getPositiveInteger(progress.freeXp),
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
    HEADQUARTERS[progress.favoriteHeadquartersId]
  ) {
    return progress.favoriteHeadquartersId;
  }

  const mostPlayedHeadquarters = Object.entries(progress.headquartersMatchCounts)
    .filter((entry): entry is [HeadquartersId, number] => {
      const [headquartersId, matchCount] = entry;
      return headquartersId in HEADQUARTERS && matchCount > 0;
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
    favoriteHeadquartersId: headquartersId in HEADQUARTERS ? headquartersId : null,
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
  password: string;
  mergeGuestProgress?: boolean;
}): Promise<PlayerProgress> {
  const profileClient = await getProfileClient();
  const authResult = await profileClient.registerAccount({
    ...input,
    guestPlayerId: getCurrentUserId(),
    mergeGuestProgress: input.mergeGuestProgress ?? true,
  });

  setCurrentUserId(authResult.userId);
  return saveServerPlayerProgress(
    authResult.profile,
    input.mergeGuestProgress ?? true
      ? loadPlayerProgress().pendingRewardClaims
      : []
  );
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

export async function logoutPlayerAccount(): Promise<PlayerProgress> {
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
): Promise<PlayerProgress | null> {
  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.researchCard(
      getCurrentUserId(),
      cardId,
      headquartersId
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
}

export async function researchHeadquartersOnServer(
  targetHeadquartersId: HeadquartersId,
  sourceHeadquartersId: HeadquartersId,
  _cost: number
): Promise<PlayerProgress | null> {
  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.researchHeadquarters(
      getCurrentUserId(),
      targetHeadquartersId,
      sourceHeadquartersId
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
}

export async function purchaseCardCopyOnServer(
  cardId: string,
  _cost: number,
  _copyLimit = 4
): Promise<PlayerProgress | null> {
  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.purchaseCardCopy(
      getCurrentUserId(),
      cardId
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
}

export async function purchaseHeadquartersOnServer(
  headquartersId: HeadquartersId,
  _cost: number
): Promise<PlayerProgress | null> {
  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.purchaseHeadquarters(
      getCurrentUserId(),
      headquartersId
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
}

export async function purchasePremiumCardOnServer(
  cardId: string,
  _goldCost: number
): Promise<PlayerProgress | null> {
  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.purchasePremiumCard(
      getCurrentUserId(),
      cardId
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
}

/**
 * Grants the cards tied to completing a campaign reward (e.g. the Funk Panzer I
 * copies for finishing the Polish campaign). The server is idempotent, so this
 * can be re-requested whenever the completion condition holds.
 */
export async function claimCampaignRewardFromServer(
  rewardId: string
): Promise<PlayerProgress | null> {
  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.claimCampaignReward(
      getCurrentUserId(),
      rewardId
    );
    return saveServerPlayerProgress(profile);
  } catch {
    return null;
  }
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
      copies[cardId] = Math.min(4, (copies[cardId] ?? 0) + 1);
    }
  }

  return copies;
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
  const trainingHeadquarters = headquarters.level === 1;
  const copies = new Map<string, number>();
  const cardIds: string[] = [];

  for (const rawCardId of rawCardIds) {
    if (typeof rawCardId !== "string") return null;

    const cardId = normalizeCardId(rawCardId);
    const card = cardId ? getCardOrNull(cardId) : null;
    if (!card || !cardId) return null;

    if (!trainingHeadquarters && card.nation !== headquarters.nation) {
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
  return typeof value === "string" && value in HEADQUARTERS
    ? (value as HeadquartersId)
    : null;
}

function readLegacyString(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
