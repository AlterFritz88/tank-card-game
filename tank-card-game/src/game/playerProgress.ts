import {
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  HEADQUARTERS,
  getTrainingHeadquartersIds,
} from "./headquarters";
import type { BattleReward } from "./economy";
import { getDeckCardIds } from "./initialState";
import { RESEARCH_TREES, type ResearchNode } from "./researchTrees";
import { getPersistentPlayerId } from "./playerIdentity";
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

export type PlayerProfile = {
  nickname: string;
  accountType: PlayerAccountType;
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
};

export type PlayerProgress = PlayerProfile;

const PLAYER_PROGRESS_KEY = "tank-card-game:player-progress";
const PLAYER_NICKNAME_STORAGE_KEY = "panzershrek.playerNickname";
const PLAYER_ACCOUNT_TYPE_STORAGE_KEY = "panzershrek.accountType";
const FAVORITE_HEADQUARTERS_STORAGE_KEY = "panzershrek.favoriteHeadquartersId";
const STARTING_IRON_TRACKS = 0;

async function getProfileClient() {
  return (await import("../network/profileClient")).profileClient;
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

export async function syncPlayerProgressFromServer(): Promise<PlayerProgress> {
  try {
    const profileClient = await getProfileClient();
    const profile = await profileClient.getProfile(getPersistentPlayerId());
    savePlayerProgress(profile);
    return profile;
  } catch {
    return loadPlayerProgress();
  }
}

export async function claimBattleRewardFromServer(input: {
  battle: ClientBattleState;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
}): Promise<{ profile: PlayerProgress; reward?: BattleReward } | null> {
  try {
    const profileClient = await getProfileClient();
    const result = await profileClient.claimBattleReward(
      getPersistentPlayerId(),
      createBattleRewardClaimId(input),
      input
    );
    savePlayerProgress(result.profile);
    return result;
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
      getPersistentPlayerId(),
      input.roomId,
      input.localPlayerId
    );
    savePlayerProgress(result.profile);
    return result;
  } catch {
    return null;
  }
}

export function applyTutorialBattleRewardToProgress(
  reward: BattleReward,
  localPlayerWon?: boolean
): PlayerProgress {
  const progress = loadPlayerProgress();
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
  const nextProgress: PlayerProgress = {
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
    headquartersBattleStats:
      localPlayerWon === undefined
        ? progress.headquartersBattleStats
        : {
            ...progress.headquartersBattleStats,
            [reward.headquartersId]: {
              wins: currentHeadquartersStats.wins + (localPlayerWon ? 1 : 0),
              losses:
                currentHeadquartersStats.losses + (localPlayerWon ? 0 : 1),
            },
          },
    battleStats:
      localPlayerWon === undefined
        ? progress.battleStats
        : {
            wins: progress.battleStats.wins + (localPlayerWon ? 1 : 0),
            losses: progress.battleStats.losses + (localPlayerWon ? 0 : 1),
          },
  };

  savePlayerProgress(nextProgress);

  return nextProgress;
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

  return {
    nickname:
      typeof progress.nickname === "string" && progress.nickname.trim()
        ? progress.nickname.trim()
        : fallback.nickname,
    accountType: progress.accountType === "premium" ? "premium" : "base",
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
    ownedCardCopies:
      typeof progress.ownedCardCopies === "object" && progress.ownedCardCopies
        ? normalizeCardCopies({
            ...fallback.ownedCardCopies,
            ...progress.ownedCardCopies,
          })
        : fallback.ownedCardCopies,
    savedDecks: Array.isArray(progress.savedDecks)
      ? normalizeSavedDecks(progress.savedDecks)
      : fallback.savedDecks,
    claimedBattleRewardIds: Array.isArray(progress.claimedBattleRewardIds)
      ? progress.claimedBattleRewardIds.filter(
          (rewardId): rewardId is string => typeof rewardId === "string"
        )
      : fallback.claimedBattleRewardIds,
  };
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
    const profile = await profileClient.saveProfile(
      getPersistentPlayerId(),
      nextProgress
    );
    savePlayerProgress(profile);
    return profile;
  } catch {
    return null;
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

function getResearchScopeForHeadquarters(
  headquartersId: HeadquartersId
): ResearchNode[] {
  for (const tree of Object.values(RESEARCH_TREES)) {
    if (tree.starterHeadquarters.headquartersId === headquartersId) {
      return tree.branches.flatMap((branch) =>
        branch.nodes.filter((node) => node.status !== "planned")
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
          .filter((node) => node.status !== "planned");
      }

      return branch.nodes.filter((node) => {
        if (node.status === "planned") return false;
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
      getPersistentPlayerId(),
      cardId,
      headquartersId
    );
    savePlayerProgress(profile);
    return profile;
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
      getPersistentPlayerId(),
      targetHeadquartersId,
      sourceHeadquartersId
    );
    savePlayerProgress(profile);
    return profile;
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
      getPersistentPlayerId(),
      cardId
    );
    savePlayerProgress(profile);
    return profile;
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
      getPersistentPlayerId(),
      headquartersId
    );
    savePlayerProgress(profile);
    return profile;
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

function normalizeSavedDecks(decks: unknown[]): PlayerSavedDeck[] {
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

    return [
      {
        id: candidate.id,
        name: candidate.name,
        headquartersId: candidate.headquartersId as HeadquartersId,
        cardIds: candidate.cardIds.filter(
          (cardId): cardId is string => typeof cardId === "string"
        ),
        createdAt: getPositiveInteger(candidate.createdAt),
        updatedAt: getPositiveInteger(candidate.updatedAt),
      },
    ];
  });
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
