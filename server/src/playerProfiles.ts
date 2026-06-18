import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveDbPath } from "./storagePath";
import { getCard, normalizeCardId } from "../../tank-card-game/src/game/cards";
import { calculateBattleReward, type BattleReward } from "../../tank-card-game/src/game/economy";
import { getHeadquartersDefinition, HEADQUARTERS } from "../../tank-card-game/src/game/headquarters";
import type { GameMode, MatchEndReason } from "../../tank-card-game/src/game/modes";
import {
  canSpendResearchExperience,
  createInitialPlayerProgress,
  isHeadquartersFullyResearched,
  spendResearchExperience,
  type PlayerProgress,
  type PlayerSavedDeck,
} from "../../tank-card-game/src/game/playerProgress";
import {
  RESEARCH_TREES,
  type ResearchNode,
} from "../../tank-card-game/src/game/researchTrees";
import {
  getCampaignCompletionReward,
  getCampaignRewardClaimKey,
} from "../../tank-card-game/src/game/campaigns";
import type {
  ClientBattleState,
  HeadquartersId,
  PlayerId,
} from "../../tank-card-game/src/game/types";

type ProfileDb = Record<string, PlayerProgress>;

type ResearchNodeContext = {
  node: ResearchNode;
  branchNodes: ResearchNode[];
  index: number;
};

type ClaimBattleRewardInput = {
  claimId: string;
  battle: ClientBattleState;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
};

const PROFILE_DB_PATH = resolveDbPath(
  process.env.PLAYER_PROFILE_DB_PATH,
  "player-profiles.json"
);
const CARD_COPY_LIMIT = 4;

console.log(`Player profiles database path: ${PROFILE_DB_PATH}`);
const CUSTOM_DECK_CARD_LIMIT = 40;
const MAX_SAVED_DECKS = 80;

function sanitizePlayerId(playerId: string): string {
  return playerId.replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 120);
}

function mergeUnique<T>(left: T[], right: T[]): T[] {
  return Array.from(new Set([...left, ...right]));
}

function mergeNumberMaps<T extends string>(
  left: Partial<Record<T, number>>,
  right: Partial<Record<T, number>>,
  mode: "max" | "sum"
): Partial<Record<T, number>> {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<T>;
  const merged: Partial<Record<T, number>> = {};

  keys.forEach((key) => {
    const leftValue = left[key] ?? 0;
    const rightValue = right[key] ?? 0;
    merged[key] = mode === "sum"
      ? leftValue + rightValue
      : Math.max(leftValue, rightValue);
  });

  return merged;
}

function mergeNumberRecords(
  left: Record<string, number>,
  right: Record<string, number>,
  mode: "max" | "sum"
): Record<string, number> {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const merged: Record<string, number> = {};

  keys.forEach((key) => {
    const leftValue = left[key] ?? 0;
    const rightValue = right[key] ?? 0;
    merged[key] =
      mode === "sum" ? leftValue + rightValue : Math.max(leftValue, rightValue);
  });

  return merged;
}

function mergeBattleStats(
  left: PlayerProgress["battleStats"],
  right: PlayerProgress["battleStats"]
): PlayerProgress["battleStats"] {
  return {
    wins: left.wins + right.wins,
    losses: left.losses + right.losses,
  };
}

function mergeHeadquartersBattleStats(
  left: PlayerProgress["headquartersBattleStats"],
  right: PlayerProgress["headquartersBattleStats"]
): PlayerProgress["headquartersBattleStats"] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<
    HeadquartersId
  >;
  const merged: PlayerProgress["headquartersBattleStats"] = {};

  keys.forEach((key) => {
    merged[key] = mergeBattleStats(
      left[key] ?? { wins: 0, losses: 0 },
      right[key] ?? { wins: 0, losses: 0 }
    );
  });

  return merged;
}

function mergeSavedDecks(
  left: PlayerSavedDeck[],
  right: PlayerSavedDeck[]
): PlayerSavedDeck[] {
  const deckById = new Map<string, PlayerSavedDeck>();

  [...right, ...left]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((deck) => {
      if (!deckById.has(deck.id)) {
        deckById.set(deck.id, deck);
      }
    });

  return Array.from(deckById.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_DECKS);
}

function mergeProgressForAccount(
  accountProfile: PlayerProgress,
  guestProfile: PlayerProgress
): PlayerProgress {
  return mergeWithDefaultProgress({
    ...accountProfile,
    tutorialCompleted:
      accountProfile.tutorialCompleted || guestProfile.tutorialCompleted,
    nickname: accountProfile.nickname || guestProfile.nickname,
    favoriteHeadquartersId:
      accountProfile.favoriteHeadquartersId ?? guestProfile.favoriteHeadquartersId,
    battleStats: mergeBattleStats(
      accountProfile.battleStats,
      guestProfile.battleStats
    ),
    ironTracks: Math.max(accountProfile.ironTracks, guestProfile.ironTracks),
    goldTracks: Math.max(accountProfile.goldTracks, guestProfile.goldTracks),
    freeXp: Math.max(accountProfile.freeXp, guestProfile.freeXp),
    headquartersXp: mergeNumberMaps(
      accountProfile.headquartersXp,
      guestProfile.headquartersXp,
      "max"
    ),
    headquartersMatchCounts: mergeNumberMaps(
      accountProfile.headquartersMatchCounts,
      guestProfile.headquartersMatchCounts,
      "sum"
    ),
    headquartersBattleStats: mergeHeadquartersBattleStats(
      accountProfile.headquartersBattleStats,
      guestProfile.headquartersBattleStats
    ),
    researchedHeadquartersIds: mergeUnique(
      accountProfile.researchedHeadquartersIds,
      guestProfile.researchedHeadquartersIds
    ),
    researchedCardIds: mergeUnique(
      accountProfile.researchedCardIds,
      guestProfile.researchedCardIds
    ),
    unlockedHeadquartersIds: mergeUnique(
      accountProfile.unlockedHeadquartersIds,
      guestProfile.unlockedHeadquartersIds
    ),
    unlockedCardIds: mergeUnique(
      accountProfile.unlockedCardIds,
      guestProfile.unlockedCardIds
    ),
    ownedCardCopies: mergeNumberRecords(
      accountProfile.ownedCardCopies,
      guestProfile.ownedCardCopies,
      "max"
    ),
    savedDecks: mergeSavedDecks(
      accountProfile.savedDecks,
      guestProfile.savedDecks
    ),
    claimedBattleRewardIds: mergeUnique(
      accountProfile.claimedBattleRewardIds,
      guestProfile.claimedBattleRewardIds
    ).slice(0, 500),
  });
}

function readDb(): ProfileDb {
  try {
    if (!existsSync(PROFILE_DB_PATH)) return {};

    const rawValue = readFileSync(PROFILE_DB_PATH, "utf8");
    const parsed = JSON.parse(rawValue);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ProfileDb)
      : {};
  } catch {
    return {};
  }
}

function writeDb(db: ProfileDb) {
  mkdirSync(dirname(PROFILE_DB_PATH), { recursive: true });
  writeFileSync(PROFILE_DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function getPositiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function getKnownCardId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cardId = normalizeCardId(value);
  if (!cardId) return null;

  try {
    getCard(cardId);
    return cardId;
  } catch {
    return null;
  }
}

function normalizeHeadquartersIdList(values: unknown): HeadquartersId[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values.filter((headquartersId): headquartersId is HeadquartersId =>
        typeof headquartersId === "string" &&
        Boolean(HEADQUARTERS[headquartersId as HeadquartersId])
      )
    )
  );
}

function normalizeCardIdList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(values.flatMap((value) => {
      const cardId = getKnownCardId(value);
      return cardId ? [cardId] : [];
    }))
  );
}

function normalizeHeadquartersNumberMap(
  value: unknown
): Partial<Record<HeadquartersId, number>> {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([headquartersId]) => headquartersId in HEADQUARTERS)
      .map(([headquartersId, amount]) => [
        headquartersId,
        getPositiveInteger(amount),
      ])
  ) as Partial<Record<HeadquartersId, number>>;
}

function normalizeOwnedCardCopies(
  value: unknown,
  researchedCardIds: string[]
): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  const researched = new Set(researchedCardIds);
  const copies: Record<string, number> = {};

  for (const [rawCardId, rawCount] of Object.entries(value)) {
    const cardId = getKnownCardId(rawCardId);
    if (!cardId || !researched.has(cardId)) continue;

    const count = Math.min(CARD_COPY_LIMIT, getPositiveInteger(rawCount));
    if (count > 0) {
      copies[cardId] = count;
    }
  }

  return copies;
}

function normalizeClaimedRewardIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((rewardId): rewardId is string => typeof rewardId === "string")
    .map((rewardId) => rewardId.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 180))
    .filter(Boolean)
    .slice(0, 500);
}

function mergeWithDefaultProgress(profile?: Partial<PlayerProgress>): PlayerProgress {
  const fallback = createInitialPlayerProgress();
  if (!profile) return fallback;
  const researchedHeadquartersIds = mergeUnique(
    fallback.researchedHeadquartersIds,
    normalizeHeadquartersIdList(profile.researchedHeadquartersIds)
  );
  const researchedCardIds = Array.from(
    new Set([
      ...fallback.researchedCardIds,
      ...normalizeCardIdList(profile.researchedCardIds),
    ])
  );
  const unlockedHeadquartersIds = mergeUnique(
    fallback.unlockedHeadquartersIds,
    normalizeHeadquartersIdList(profile.unlockedHeadquartersIds)
  ).filter((headquartersId) =>
    researchedHeadquartersIds.includes(headquartersId)
  );
  const unlockedCardIds = mergeUnique(
    fallback.unlockedCardIds,
    normalizeCardIdList(profile.unlockedCardIds)
  ).filter((cardId) => researchedCardIds.includes(cardId));
  const ownedCardCopies = normalizeOwnedCardCopies(
    {
      ...fallback.ownedCardCopies,
      ...profile.ownedCardCopies,
    },
    researchedCardIds
  );
  const favoriteHeadquartersId = getUnlockedFavoriteHeadquartersId(
    profile.favoriteHeadquartersId,
    {
      ...fallback,
      unlockedHeadquartersIds,
    }
  );

  return {
    ...fallback,
    ...profile,
    nickname: sanitizeNickname(profile.nickname, fallback.nickname),
    accountType: profile.accountType === "premium" ? "premium" : "base",
    tutorialCompleted:
      typeof profile.tutorialCompleted === "boolean"
        ? profile.tutorialCompleted
        : fallback.tutorialCompleted,
    favoriteHeadquartersId,
    battleStats: mergeBattleStats(
      fallback.battleStats,
      {
        wins: getPositiveInteger(profile.battleStats?.wins),
        losses: getPositiveInteger(profile.battleStats?.losses),
      }
    ),
    ironTracks: getPositiveInteger(profile.ironTracks),
    goldTracks: getPositiveInteger(profile.goldTracks),
    freeXp: getPositiveInteger(profile.freeXp),
    headquartersXp: normalizeHeadquartersNumberMap(profile.headquartersXp),
    headquartersMatchCounts: normalizeHeadquartersNumberMap(
      profile.headquartersMatchCounts
    ),
    headquartersBattleStats: mergeHeadquartersBattleStats(
      {},
      profile.headquartersBattleStats ?? {}
    ),
    researchedHeadquartersIds,
    researchedCardIds,
    unlockedHeadquartersIds,
    unlockedCardIds,
    ownedCardCopies,
    savedDecks: Array.isArray(profile.savedDecks)
      ? normalizeSavedDecks(profile.savedDecks, {
          ownedCardCopies,
          unlockedHeadquartersIds,
        })
      : fallback.savedDecks,
    claimedBattleRewardIds: normalizeClaimedRewardIds(
      profile.claimedBattleRewardIds
    ),
    pendingRewardClaims: [],
  };
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

    const cardIds = normalizeSavedDeckCardIds(
      headquartersId,
      candidate.cardIds,
      progress.ownedCardCopies
    );
    if (!cardIds) return [];
    const id = candidate.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!id) return [];

    return [
      {
        id,
        name: candidate.name.trim().slice(0, 40) || "Deck",
        headquartersId,
        cardIds,
        createdAt: getPositiveInteger(candidate.createdAt),
        updatedAt: getPositiveInteger(candidate.updatedAt),
      },
    ];
  });
}

function normalizeSavedDeckCardIds(
  headquartersId: HeadquartersId,
  rawCardIds: unknown[],
  ownedCardCopies: Record<string, number>
): string[] | null {
  if (rawCardIds.length !== CUSTOM_DECK_CARD_LIMIT) return null;

  const headquarters = getHeadquartersDefinition(headquartersId);
  const trainingHeadquarters = headquarters.level === 1;
  const copies = new Map<string, number>();
  const cardIds: string[] = [];

  for (const rawCardId of rawCardIds) {
    if (typeof rawCardId !== "string") return null;

    const cardId = normalizeCardId(rawCardId);
    if (!cardId) return null;

    const card = getCard(cardId);
    if (!trainingHeadquarters && card.nation !== headquarters.nation) {
      return null;
    }

    const nextCopies = (copies.get(cardId) ?? 0) + 1;
    if (nextCopies > CARD_COPY_LIMIT) return null;
    if (nextCopies > (ownedCardCopies[cardId] ?? 0)) return null;

    copies.set(cardId, nextCopies);
    cardIds.push(cardId);
  }

  return cardIds;
}

function sanitizeNickname(nickname: unknown, fallback: string): string {
  if (typeof nickname !== "string") return fallback;

  const nextNickname = nickname.trim().slice(0, 32);
  return nextNickname || fallback;
}

function getUnlockedFavoriteHeadquartersId(
  headquartersId: unknown,
  profile: PlayerProgress
): HeadquartersId | null {
  if (
    typeof headquartersId === "string" &&
    headquartersId in HEADQUARTERS &&
    profile.unlockedHeadquartersIds.includes(headquartersId as HeadquartersId)
  ) {
    return headquartersId as HeadquartersId;
  }

  return profile.favoriteHeadquartersId;
}

function validateDeckForProfile(
  profile: PlayerProgress,
  headquartersId: HeadquartersId,
  cardIds: unknown
): string[] {
  if (!profile.unlockedHeadquartersIds.includes(headquartersId)) {
    throw new Error("Headquarters is not unlocked");
  }

  if (!Array.isArray(cardIds) || cardIds.length !== CUSTOM_DECK_CARD_LIMIT) {
    throw new Error(`Deck must contain ${CUSTOM_DECK_CARD_LIMIT} cards`);
  }

  const headquarters = getHeadquartersDefinition(headquartersId);
  const trainingHeadquarters = headquarters.level === 1;
  const copies = new Map<string, number>();
  const normalizedCardIds: string[] = [];

  for (const rawCardId of cardIds) {
    if (typeof rawCardId !== "string") {
      throw new Error("Deck contains invalid card id");
    }

    const cardId = normalizeCardId(rawCardId);
    if (!cardId) {
      throw new Error(`Unknown card: ${rawCardId}`);
    }

    const card = getCard(cardId);
    if (!trainingHeadquarters && card.nation !== headquarters.nation) {
      throw new Error("Deck contains cards from another nation");
    }

    const nextCopies = (copies.get(cardId) ?? 0) + 1;
    if (nextCopies > CARD_COPY_LIMIT) {
      throw new Error(`Too many copies of ${cardId}`);
    }

    if (nextCopies > (profile.ownedCardCopies[cardId] ?? 0)) {
      throw new Error(`Card is not owned: ${cardId}`);
    }

    copies.set(cardId, nextCopies);
    normalizedCardIds.push(cardId);
  }

  return normalizedCardIds;
}

function normalizeDeckName(name: unknown): string {
  if (typeof name !== "string") return "Deck";

  return name.trim().slice(0, 40) || "Deck";
}

function sanitizeClaimId(claimId: unknown): string {
  if (typeof claimId !== "string") return "";

  return claimId.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 180);
}

function getBattleWinner(battle: ClientBattleState, localPlayerId: PlayerId) {
  return (
    (battle.status === "player_won" && localPlayerId === "player") ||
    (battle.status === "bot_won" && localPlayerId === "bot")
  );
}

function applyReward(
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
      [reward.headquartersId]: currentHeadquartersXp + reward.headquartersXp,
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

function getAllResearchNodeContexts(): ResearchNodeContext[] {
  return Object.values(RESEARCH_TREES).flatMap((tree) =>
    tree.branches.flatMap((branch) =>
      branch.nodes.map((node, index) => ({
        node,
        branchNodes: branch.nodes,
        index,
      }))
    )
  );
}

function findResearchContextByCard(
  cardId: string,
  progress: PlayerProgress
): ResearchNodeContext | null {
  const candidates = getAllResearchNodeContexts().filter(
    ({ node }) => node.cardId === cardId && node.status !== "planned"
  );

  return getBestResearchContext(candidates, progress);
}

function findResearchContextByHeadquarters(
  headquartersId: HeadquartersId,
  progress: PlayerProgress
): ResearchNodeContext | null {
  const candidates = getAllResearchNodeContexts().filter(
    ({ node }) =>
        node.headquartersId === headquartersId && node.status !== "planned"
  );

  return getBestResearchContext(candidates, progress);
}

function getBestResearchContext(
  candidates: ResearchNodeContext[],
  progress: PlayerProgress
): ResearchNodeContext | null {
  return (
    candidates
      .sort(
        (left, right) =>
          (left.node.experienceCost ?? 0) - (right.node.experienceCost ?? 0)
      )
      .find((context) => canReachResearchNode(context, progress)) ??
    candidates[0] ??
    null
  );
}

function canReachResearchNode(
  context: ResearchNodeContext,
  progress: PlayerProgress
): boolean {
  const { node, branchNodes, index } = context;

  if (node.requires && node.requires.length > 0) {
    return node.requires.every((requiredId) => {
      const required = branchNodes.find((candidate) => candidate.id === requiredId);
      return required ? isResearchGateSatisfied(required, progress) : true;
    });
  }

  if (index <= 0) return true;

  return isResearchGateSatisfied(branchNodes[index - 1], progress);
}

function isResearchGateSatisfied(
  node: ResearchNode,
  progress: PlayerProgress
): boolean {
  if (node.type === "headquarters" && node.headquartersId) {
    return progress.unlockedHeadquartersIds.includes(node.headquartersId);
  }

  if (node.cardId) {
    return progress.researchedCardIds.includes(node.cardId);
  }

  return true;
}

function researchCardOnProfile(
  progress: PlayerProgress,
  cardId: string,
  sourceHeadquartersId: HeadquartersId
): PlayerProgress {
  if (progress.researchedCardIds.includes(cardId)) return progress;

  const context = findResearchContextByCard(cardId, progress);
  const node = context?.node;
  if (!node?.experienceCost) {
    throw new Error("Карта не найдена в дереве исследований");
  }

  if (context && !canReachResearchNode(context, progress)) {
    throw new Error("Сначала исследуйте предыдущий узел ветки");
  }

  if (!canSpendResearchExperience(progress, sourceHeadquartersId, node.experienceCost)) {
    throw new Error("Не хватает опыта для исследования карты");
  }

  const nextProgress = spendResearchExperience(
    progress,
    sourceHeadquartersId,
    node.experienceCost
  );

  return {
    ...nextProgress,
    researchedCardIds: Array.from(new Set([...nextProgress.researchedCardIds, cardId])),
    unlockedCardIds: Array.from(new Set([...nextProgress.unlockedCardIds, cardId])),
  };
}

function researchHeadquartersOnProfile(
  progress: PlayerProgress,
  headquartersId: HeadquartersId,
  sourceHeadquartersId: HeadquartersId
): PlayerProgress {
  if (progress.researchedHeadquartersIds.includes(headquartersId)) {
    return progress;
  }

  const context = findResearchContextByHeadquarters(headquartersId, progress);
  const node = context?.node;
  if (!node?.experienceCost) {
    throw new Error("Штаб не найден в дереве исследований");
  }

  if (context && !canReachResearchNode(context, progress)) {
    throw new Error("Сначала исследуйте предыдущий узел ветки");
  }

  if (!canSpendResearchExperience(progress, sourceHeadquartersId, node.experienceCost)) {
    throw new Error("Не хватает опыта для исследования штаба");
  }

  const nextProgress = spendResearchExperience(
    progress,
    sourceHeadquartersId,
    node.experienceCost
  );

  return {
    ...nextProgress,
    researchedHeadquartersIds: Array.from(
      new Set([...nextProgress.researchedHeadquartersIds, headquartersId])
    ),
  };
}

function purchaseCardCopyOnProfile(
  progress: PlayerProgress,
  cardId: string
): PlayerProgress {
  if (!progress.researchedCardIds.includes(cardId)) {
    throw new Error("Сначала исследуйте карту");
  }

  const context = findResearchContextByCard(cardId, progress);
  const node = context?.node;
  if (!node?.purchaseCost) {
    throw new Error("Цена карты не найдена");
  }

  const ownedCopies = progress.ownedCardCopies[cardId] ?? 0;
  if (ownedCopies >= CARD_COPY_LIMIT) {
    throw new Error("Куплены все доступные копии");
  }

  if (progress.ironTracks < node.purchaseCost) {
    throw new Error("Не хватает железных траков");
  }

  return {
    ...progress,
    ironTracks: progress.ironTracks - node.purchaseCost,
    ownedCardCopies: {
      ...progress.ownedCardCopies,
      [cardId]: ownedCopies + 1,
    },
  };
}

function findPremiumCardGoldCost(cardId: string): number | null {
  for (const tree of Object.values(RESEARCH_TREES)) {
    for (const branch of tree.branches) {
      for (const node of branch.nodes) {
        if (node.cardId === cardId && typeof node.goldCost === "number") {
          return node.goldCost;
        }
      }
    }
  }

  return null;
}

function purchasePremiumCardOnProfile(
  progress: PlayerProgress,
  cardId: string
): PlayerProgress {
  const resolvedCardId = getKnownCardId(cardId);
  if (!resolvedCardId) {
    throw new Error("Карта не найдена");
  }

  const goldCost = findPremiumCardGoldCost(resolvedCardId);
  if (goldCost === null) {
    throw new Error("Карта не является премиум");
  }

  const ownedCopies = progress.ownedCardCopies[resolvedCardId] ?? 0;
  if (ownedCopies >= CARD_COPY_LIMIT) {
    throw new Error("Куплены все доступные копии");
  }

  if (progress.goldTracks < goldCost) {
    throw new Error("Не хватает золотых траков");
  }

  return {
    ...progress,
    goldTracks: progress.goldTracks - goldCost,
    researchedCardIds: Array.from(
      new Set([...progress.researchedCardIds, resolvedCardId])
    ),
    unlockedCardIds: Array.from(
      new Set([...progress.unlockedCardIds, resolvedCardId])
    ),
    ownedCardCopies: {
      ...progress.ownedCardCopies,
      [resolvedCardId]: ownedCopies + 1,
    },
  };
}

function claimCampaignRewardOnProfile(
  progress: PlayerProgress,
  rewardId: string
): PlayerProgress {
  const reward = getCampaignCompletionReward(rewardId);
  if (!reward) {
    throw new Error("Награда кампании не найдена");
  }

  const claimKey = getCampaignRewardClaimKey(reward.id);
  if (progress.claimedBattleRewardIds.includes(claimKey)) {
    return progress;
  }

  const cardId = getKnownCardId(reward.cardId);
  if (!cardId) {
    throw new Error("Карта награды не найдена");
  }

  const ownedCopies = progress.ownedCardCopies[cardId] ?? 0;
  const nextCopies = Math.min(CARD_COPY_LIMIT, ownedCopies + reward.copies);

  return {
    ...progress,
    researchedCardIds: Array.from(
      new Set([...progress.researchedCardIds, cardId])
    ),
    unlockedCardIds: Array.from(new Set([...progress.unlockedCardIds, cardId])),
    ownedCardCopies: {
      ...progress.ownedCardCopies,
      [cardId]: nextCopies,
    },
    claimedBattleRewardIds: [claimKey, ...progress.claimedBattleRewardIds].slice(
      0,
      500
    ),
  };
}

function purchaseHeadquartersOnProfile(
  progress: PlayerProgress,
  headquartersId: HeadquartersId
): PlayerProgress {
  if (!progress.researchedHeadquartersIds.includes(headquartersId)) {
    throw new Error("Сначала исследуйте штаб");
  }

  if (progress.unlockedHeadquartersIds.includes(headquartersId)) {
    return progress;
  }

  const context = findResearchContextByHeadquarters(headquartersId, progress);
  const node = context?.node;
  if (!node?.purchaseCost) {
    throw new Error("Цена штаба не найдена");
  }

  if (progress.ironTracks < node.purchaseCost) {
    throw new Error("Не хватает железных траков");
  }

  return {
    ...progress,
    ironTracks: progress.ironTracks - node.purchaseCost,
    unlockedHeadquartersIds: Array.from(
      new Set([...progress.unlockedHeadquartersIds, headquartersId])
    ),
  };
}

export class PlayerProfileManager {
  private persistProfile(playerId: string, profile: PlayerProgress): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) throw new Error("Некорректный playerId");

    const db = readDb();
    const savedProfile = mergeWithDefaultProgress(profile);
    db[safePlayerId] = savedProfile;
    writeDb(db);

    return savedProfile;
  }

  getProfile(playerId: string): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) return createInitialPlayerProgress();

    const db = readDb();
    const profile = mergeWithDefaultProgress(db[safePlayerId]);

    db[safePlayerId] = profile;
    writeDb(db);

    return profile;
  }

  saveProfile(playerId: string, profile: PlayerProgress): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) throw new Error("Некорректный playerId");

    const currentProfile = this.getProfile(safePlayerId);
    const savedProfile = {
      ...currentProfile,
      nickname: sanitizeNickname(profile.nickname, currentProfile.nickname),
      favoriteHeadquartersId: getUnlockedFavoriteHeadquartersId(
        profile.favoriteHeadquartersId,
        currentProfile
      ),
    };

    return this.persistProfile(safePlayerId, savedProfile);
  }

  updateNickname(playerId: string, nickname: string): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) throw new Error("Некорректный playerId");

    const currentProfile = this.getProfile(safePlayerId);

    return this.persistProfile(safePlayerId, {
      ...currentProfile,
      nickname: sanitizeNickname(nickname, currentProfile.nickname),
    });
  }

  updateFavoriteHeadquarters(
    playerId: string,
    headquartersId: HeadquartersId | null
  ): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) throw new Error("Некорректный playerId");

    const currentProfile = this.getProfile(safePlayerId);

    return this.persistProfile(safePlayerId, {
      ...currentProfile,
      favoriteHeadquartersId: getUnlockedFavoriteHeadquartersId(
        headquartersId,
        currentProfile
      ),
    });
  }

  mergeGuestProgress(userPlayerId: string, guestPlayerId: string): PlayerProgress {
    const safeUserPlayerId = sanitizePlayerId(userPlayerId);
    const safeGuestPlayerId = sanitizePlayerId(guestPlayerId);
    if (!safeUserPlayerId) throw new Error("Некорректный user playerId");
    if (!safeGuestPlayerId || safeGuestPlayerId === safeUserPlayerId) {
      return this.getProfile(safeUserPlayerId);
    }

    const accountProfile = this.getProfile(safeUserPlayerId);
    const guestProfile = this.getProfile(safeGuestPlayerId);
    return this.persistProfile(
      safeUserPlayerId,
      mergeProgressForAccount(accountProfile, guestProfile)
    );
  }

  claimBattleReward(
    playerId: string,
    input: ClaimBattleRewardInput
  ): { profile: PlayerProgress; reward: BattleReward } {
    const profile = this.getProfile(playerId);
    const claimId = sanitizeClaimId(input.claimId);
    if (!claimId) {
      throw new Error("Invalid reward claim id");
    }

    const rewardHeadquartersId =
      input.battle.headquarters[input.localPlayerId].headquartersId ??
      input.battle[input.localPlayerId].headquartersId;

    if (profile.claimedBattleRewardIds.includes(claimId)) {
      const reward = calculateBattleReward({
        battle: input.battle,
        mode: input.mode,
        localPlayerId: input.localPlayerId,
        matchEndReason: input.matchEndReason ?? null,
        headquartersFullyResearched: isHeadquartersFullyResearched(
          profile,
          rewardHeadquartersId
        ),
      });

      return {
        profile,
        reward: {
          ...reward,
          rawHeadquartersXp: 0,
          headquartersXp: 0,
          freeXp: 0,
          rawIronTracks: 0,
          repairCost: 0,
          ironTracks: 0,
          goldTracks: 0,
        },
      };
    }

    if (input.battle.status !== "player_won" && input.battle.status !== "bot_won") {
      throw new Error("Battle is not finished");
    }

    const reward = calculateBattleReward({
      battle: input.battle,
      mode: input.mode,
      localPlayerId: input.localPlayerId,
      matchEndReason: input.matchEndReason ?? null,
      headquartersFullyResearched: isHeadquartersFullyResearched(
        profile,
        rewardHeadquartersId
      ),
    });
    const localPlayerWon = getBattleWinner(input.battle, input.localPlayerId);
    const nextProfile = {
      ...applyReward(profile, reward, localPlayerWon),
      claimedBattleRewardIds: [
        claimId,
        ...profile.claimedBattleRewardIds,
      ].slice(0, 500),
    };

    return {
      profile: this.persistProfile(playerId, nextProfile),
      reward,
    };
  }

  claimTutorialReward(
    playerId: string,
    reward: BattleReward,
    localPlayerWon: boolean
  ): { profile: PlayerProgress; reward: BattleReward } {
    const profile = this.getProfile(playerId);
    const emptyReward: BattleReward = {
      ...reward,
      rawHeadquartersXp: 0,
      headquartersXp: 0,
      freeXp: 0,
      rawIronTracks: 0,
      repairCost: 0,
      ironTracks: 0,
      goldTracks: 0,
    };

    if (profile.tutorialCompleted) {
      return {
        profile,
        reward: emptyReward,
      };
    }

    const nextProfile = {
      ...applyReward(profile, reward, localPlayerWon),
      tutorialCompleted: true,
      claimedBattleRewardIds: [
        "tutorial:first-completion",
        ...profile.claimedBattleRewardIds,
      ].slice(0, 500),
    };

    return {
      profile: this.persistProfile(playerId, nextProfile),
      reward,
    };
  }

  validatePlayableDeck(
    playerId: string,
    headquartersId: HeadquartersId,
    cardIds: unknown
  ): string[] {
    return validateDeckForProfile(
      this.getProfile(playerId),
      headquartersId,
      cardIds
    );
  }

  saveCustomDeck(
    playerId: string,
    deck: PlayerSavedDeck
  ): PlayerProgress {
    const profile = this.getProfile(playerId);
    const cardIds = validateDeckForProfile(
      profile,
      deck.headquartersId,
      deck.cardIds
    );
    const now = Date.now();
    const existingDeck = profile.savedDecks.find((item) => item.id === deck.id);
    const requestedCreatedAt = getPositiveInteger(deck.createdAt);
    const savedDeck: PlayerSavedDeck = {
      id: deck.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || `${now}`,
      name: normalizeDeckName(deck.name),
      headquartersId: deck.headquartersId,
      cardIds,
      createdAt: existingDeck?.createdAt ?? (requestedCreatedAt || now),
      updatedAt: now,
    };
    const nextDecks = [
      savedDeck,
      ...profile.savedDecks.filter((item) => item.id !== savedDeck.id),
    ].slice(0, MAX_SAVED_DECKS);

    return this.persistProfile(playerId, {
      ...profile,
      savedDecks: nextDecks,
    });
  }

  deleteCustomDeck(playerId: string, deckId: string): PlayerProgress {
    const profile = this.getProfile(playerId);
    const safeDeckId = deckId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

    return this.persistProfile(playerId, {
      ...profile,
      savedDecks: profile.savedDecks.filter((deck) => deck.id !== safeDeckId),
    });
  }

  researchCard(
    playerId: string,
    cardId: string,
    sourceHeadquartersId: HeadquartersId
  ): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      researchCardOnProfile(profile, cardId, sourceHeadquartersId)
    );
  }

  researchHeadquarters(
    playerId: string,
    headquartersId: HeadquartersId,
    sourceHeadquartersId: HeadquartersId
  ): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      researchHeadquartersOnProfile(profile, headquartersId, sourceHeadquartersId)
    );
  }

  purchaseCardCopy(playerId: string, cardId: string): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(playerId, purchaseCardCopyOnProfile(profile, cardId));
  }

  purchaseHeadquarters(
    playerId: string,
    headquartersId: HeadquartersId
  ): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      purchaseHeadquartersOnProfile(profile, headquartersId)
    );
  }

  purchasePremiumCard(playerId: string, cardId: string): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      purchasePremiumCardOnProfile(profile, cardId)
    );
  }

  claimCampaignReward(playerId: string, rewardId: string): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      claimCampaignRewardOnProfile(profile, rewardId)
    );
  }
}
