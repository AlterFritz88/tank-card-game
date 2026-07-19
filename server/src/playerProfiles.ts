import { resolveWritableDbPath } from "./storagePath";
import { JsonDocumentStore } from "./sqliteStore";
import { cards, getCard, normalizeCardId } from "../../tank-card-game/src/game/cards";
import {
  calculateBattleReward,
  type BattleReward,
  type BattleRewardSource,
} from "../../tank-card-game/src/game/economy";
import {
  getHeadquartersDefinition,
  HEADQUARTERS,
  isPlayerSelectableHeadquartersId,
} from "../../tank-card-game/src/game/headquarters";
import type { GameMode, MatchEndReason } from "../../tank-card-game/src/game/modes";
import {
  canSpendResearchExperience,
  addPremiumDaysToProgress,
  createInitialPlayerProgress,
  isHeadquartersFullyResearched,
  isPremiumAccountActive,
  mergeOwnedCardCopiesWithFloor,
  spendResearchExperience,
  type PlayerProgress,
  type PlayerSavedDeck,
} from "../../tank-card-game/src/game/playerProgress";
import {
  RESEARCH_TREES,
  type ResearchNode,
} from "../../tank-card-game/src/game/researchTrees";
import {
  CAMPAIGNS,
  getCampaignCompletionReward,
  getCampaignMission,
  getCampaignRewardClaimKey,
} from "../../tank-card-game/src/game/campaigns";
import type {
  HeadquartersId,
  PlayerId,
} from "../../tank-card-game/src/game/types";
import {
  applyBattleToCombatMissions,
  applyRadioDuelToCombatMissions,
  normalizeCombatMissionsState,
  refreshCombatMissions,
  type RadioDuelMissionEvent,
} from "../../tank-card-game/src/game/combatMissions";

type ProfileDb = Record<string, PlayerProgress>;

export type AdminPlayerProfileView = {
  playerId: string;
  profile: PlayerProgress;
};

type ResearchNodeContext = {
  node: ResearchNode;
  branchNodes: ResearchNode[];
  index: number;
  starterHeadquartersId: HeadquartersId;
};

type ClaimBattleRewardInput = {
  claimId: string;
  battle: BattleRewardSource;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
  localDeckWeight?: number | null;
  opponentDeckWeight?: number | null;
  specialRewardMultiplier?: number;
  // Campaign battles feed combat missions only on the *first* run of a mission
  // (see `claimBattleReward`). These carry the current mission and whether it
  // had already been won before this battle.
  campaignMissionId?: string | null;
  campaignMissionAlreadyWon?: boolean;
};

const PROFILE_DB_PATH = resolveWritableDbPath(
  process.env.PLAYER_PROFILE_DB_PATH,
  "player-profiles.json",
  "Player profiles"
);
const CARD_COPY_LIMIT = 4;
const GOLD_TO_IRON_RATE = 100;
const PREMIUM_DAY_OFFERS: Record<number, number> = {
  1: 99,
  5: 470,
  21: 1500,
  50: 4199,
};
const DAILY_LOGIN_PREMIUM_DAYS = 1;
const DAILY_LOGIN_DAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAILY_LOGIN_REWARD_OPTIONS: Array<{
  kind: NonNullable<PlayerProgress["dailyLoginReward"]>["kind"];
  amount: number;
}> = [
  { kind: "ironTracks", amount: 200 },
  { kind: "goldTracks", amount: 10 },
  { kind: "freeXp", amount: 100 },
  { kind: "premium", amount: DAILY_LOGIN_PREMIUM_DAYS },
];

console.log(`Player profiles database path: ${PROFILE_DB_PATH}`);
const profileStore = new JsonDocumentStore<ProfileDb>(
  "player-profiles",
  {},
  PROFILE_DB_PATH
);
const CUSTOM_DECK_CARD_LIMIT = 40;
const MAX_SAVED_DECKS = 80;

// Master accounts (configured via MASTER_ACCOUNT_USERNAMES) get every
// headquarters and the full card collection unlocked — a play/test account that
// can field and build any deck. Regular players still unlock everything beyond
// the three training headquarters through progression.
const ALL_HEADQUARTERS_IDS = Object.keys(HEADQUARTERS).filter(
  isPlayerSelectableHeadquartersId
);
const ALL_CARD_IDS = cards.map((card) => card.id);
const PREMIUM_CAMPAIGN_IDS = CAMPAIGNS.filter((campaign) => campaign.premium).map(
  (campaign) => campaign.id
);

function masterUsernameToUserId(username: string): string {
  // Mirrors how PlayerAccountManager derives userIds from usernames so the env
  // list can be plain logins ("commander") rather than internal ids.
  const key = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  return key ? `user:${key}` : "";
}

function parseMasterAccountUserIds(raw: string | undefined): Set<string> {
  const ids = new Set<string>();
  if (!raw) return ids;

  for (const entry of raw.split(/[\s,;]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // Accept either a plain username ("commander") or a full userId ("user:commander").
    const userId = trimmed.startsWith("user:")
      ? trimmed
      : masterUsernameToUserId(trimmed);
    if (userId) ids.add(userId);
  }

  if (ids.size > 0) {
    console.log(`Master accounts configured: ${Array.from(ids).join(", ")}`);
  }

  return ids;
}

const MASTER_ACCOUNT_USER_IDS = parseMasterAccountUserIds(
  process.env.MASTER_ACCOUNT_USERNAMES
);

function isMasterAccount(playerId: string): boolean {
  return MASTER_ACCOUNT_USER_IDS.has(playerId);
}

function applyMasterAccountGrants(profile: PlayerProgress): PlayerProgress {
  const ownedCardCopies: Record<string, number> = { ...profile.ownedCardCopies };
  for (const cardId of ALL_CARD_IDS) {
    ownedCardCopies[cardId] = CARD_COPY_LIMIT;
  }

  return {
    ...profile,
    researchedHeadquartersIds: [...ALL_HEADQUARTERS_IDS],
    unlockedHeadquartersIds: [...ALL_HEADQUARTERS_IDS],
    researchedCardIds: [...ALL_CARD_IDS],
    unlockedCardIds: [...ALL_CARD_IDS],
    unlockedCampaignIds: [...PREMIUM_CAMPAIGN_IDS],
    ownedCardCopies,
  };
}

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
    pveBattleCount: accountProfile.pveBattleCount + guestProfile.pveBattleCount,
    ironTracks: Math.max(accountProfile.ironTracks, guestProfile.ironTracks),
    goldTracks: Math.max(accountProfile.goldTracks, guestProfile.goldTracks),
    cardBackId:
      accountProfile.cardBackId === "first_player" || guestProfile.cardBackId === "first_player"
        ? "first_player"
        : null,
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
    unlockedCampaignIds: mergeUnique(
      accountProfile.unlockedCampaignIds,
      guestProfile.unlockedCampaignIds
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
  const parsed = profileStore.read();
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
}

function writeDb(db: ProfileDb) {
  profileStore.write(db);
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
        isPlayerSelectableHeadquartersId(headquartersId)
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

function normalizeUnlockedCampaignIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const premiumCampaignIds = new Set(PREMIUM_CAMPAIGN_IDS);
  return Array.from(
    new Set(
      value.filter(
        (campaignId): campaignId is string =>
          typeof campaignId === "string" && premiumCampaignIds.has(campaignId)
      )
    )
  );
}

function normalizeDailyLoginReward(
  value: unknown
): PlayerProgress["dailyLoginReward"] {
  if (!value || typeof value !== "object") return null;

  const reward = value as Partial<NonNullable<PlayerProgress["dailyLoginReward"]>>;
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
    mergeOwnedCardCopiesWithFloor(
      fallback.ownedCardCopies,
      profile.ownedCardCopies ?? {}
    ),
    researchedCardIds
  );
  const favoriteHeadquartersId = getUnlockedFavoriteHeadquartersId(
    profile.favoriteHeadquartersId,
    {
      ...fallback,
      unlockedHeadquartersIds,
    }
  );

  const premiumUntil =
    typeof profile.premiumUntil === "number" &&
    Number.isFinite(profile.premiumUntil) &&
    profile.premiumUntil > Date.now()
      ? Math.floor(profile.premiumUntil)
      : null;
  const hasLegacyPremium =
    profile.accountType === "premium" && profile.premiumUntil == null;
  const battleStats = mergeBattleStats(
    fallback.battleStats,
    {
      wins: getPositiveInteger(profile.battleStats?.wins),
      losses: getPositiveInteger(profile.battleStats?.losses),
    }
  );
  const pveBattleCount =
    typeof profile.pveBattleCount === "number" &&
    Number.isFinite(profile.pveBattleCount)
      ? getPositiveInteger(profile.pveBattleCount)
      : battleStats.wins + battleStats.losses;

  return {
    ...fallback,
    ...profile,
    nickname: sanitizeNickname(profile.nickname, fallback.nickname),
    accountType: premiumUntil || hasLegacyPremium ? "premium" : "base",
    premiumUntil,
    lastActivityAt: getPositiveInteger(profile.lastActivityAt),
    tutorialCompleted:
      typeof profile.tutorialCompleted === "boolean"
        ? profile.tutorialCompleted
        : fallback.tutorialCompleted,
    favoriteHeadquartersId,
    battleStats,
    pveBattleCount,
    ironTracks: getPositiveInteger(profile.ironTracks),
    goldTracks: getPositiveInteger(profile.goldTracks),
    cardBackId: profile.cardBackId === "first_player" ? "first_player" : null,
    freeXp: getPositiveInteger(profile.freeXp),
    dailyLoginReward: normalizeDailyLoginReward(profile.dailyLoginReward),
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
    unlockedCampaignIds: normalizeUnlockedCampaignIds(
      profile.unlockedCampaignIds
    ),
    claimedBattleRewardIds: normalizeClaimedRewardIds(
      profile.claimedBattleRewardIds
    ),
    pendingRewardClaims: [],
    combatMissions: normalizeCombatMissionsState(profile.combatMissions),
  };
}

const LEGACY_ERRONEOUS_HEADQUARTERS_ID: HeadquartersId =
  "soviet_tank_brigade";
const LEGITIMATE_SOVIET_TANK_HEADQUARTERS_RESEARCH_PATHS = [
  // The first version of the branch led through T-40 and T-34/76.
  ["t40", "t34_76"],
  // The current branch requires both T-40 and T-35.
  ["t40", "t35"],
] as const;

function hasLegitimateSovietTankHeadquartersResearch(
  profile: Partial<PlayerProgress>
): boolean {
  const researchedCardIds = new Set(
    normalizeCardIdList(profile.researchedCardIds)
  );
  return LEGITIMATE_SOVIET_TANK_HEADQUARTERS_RESEARCH_PATHS.some((path) =>
    path.every((cardId) => researchedCardIds.has(cardId))
  );
}

/**
 * For one week the Lavrinenko campaign used the regular research-tree id of
 * the 4th Tank Brigade. Legacy client normalization then copied that accidental
 * unlock into researchedHeadquartersIds as well, so checking that array alone
 * cannot distinguish the campaign grant from a real research unlock.
 *
 * A real unlock necessarily has one of the research paths that existed before
 * or after the tree revision. If neither path is present, remove every live
 * reference to the headquarters while preserving its accumulated XP/statistics
 * for the day when the player researches and buys it normally.
 */
function removeErroneousSovietTankHeadquartersGrant(
  profile: Partial<PlayerProgress>
): Partial<PlayerProgress> {
  if (hasLegitimateSovietTankHeadquartersResearch(profile)) return profile;

  const researchedHeadquartersIds = normalizeHeadquartersIdList(
    profile.researchedHeadquartersIds
  );
  const unlockedHeadquartersIds = normalizeHeadquartersIdList(
    profile.unlockedHeadquartersIds
  );
  const savedDecks = Array.isArray(profile.savedDecks) ? profile.savedDecks : [];
  const hasErroneousReference =
    researchedHeadquartersIds.includes(LEGACY_ERRONEOUS_HEADQUARTERS_ID) ||
    unlockedHeadquartersIds.includes(LEGACY_ERRONEOUS_HEADQUARTERS_ID) ||
    profile.favoriteHeadquartersId === LEGACY_ERRONEOUS_HEADQUARTERS_ID ||
    savedDecks.some(
      (deck) => deck.headquartersId === LEGACY_ERRONEOUS_HEADQUARTERS_ID
    );

  if (!hasErroneousReference) return profile;

  return {
    ...profile,
    favoriteHeadquartersId:
      profile.favoriteHeadquartersId === LEGACY_ERRONEOUS_HEADQUARTERS_ID
        ? null
        : profile.favoriteHeadquartersId,
    researchedHeadquartersIds: researchedHeadquartersIds.filter(
      (headquartersId) =>
        headquartersId !== LEGACY_ERRONEOUS_HEADQUARTERS_ID
    ),
    unlockedHeadquartersIds: unlockedHeadquartersIds.filter(
      (headquartersId) =>
        headquartersId !== LEGACY_ERRONEOUS_HEADQUARTERS_ID
    ),
    savedDecks: savedDecks.filter(
      (deck) => deck.headquartersId !== LEGACY_ERRONEOUS_HEADQUARTERS_ID
    ),
  };
}

/**
 * Normalizes a stored profile and, for master accounts, grants every
 * headquarters and the full card collection. Grants are re-normalized so the
 * unlocked/owned invariants still hold (owned copies stay within the researched
 * set, saved decks revalidate against the now-unlocked headquarters).
 */
function normalizeProfileForPlayer(
  playerId: string,
  profile?: Partial<PlayerProgress>
): PlayerProgress {
  const normalized = mergeWithDefaultProgress(
    isMasterAccount(playerId)
      ? profile
      : removeErroneousSovietTankHeadquartersGrant(profile ?? {})
  );
  if (!isMasterAccount(playerId)) return normalized;

  return mergeWithDefaultProgress(applyMasterAccountGrants(normalized));
}

/**
 * Clean every stored profile at startup as well as normalizing profiles on
 * access. The startup pass fixes inactive accounts immediately; the normalizer
 * prevents an old guest profile or client cache from reintroducing the grant.
 */
function migrateLegacyErroneousHeadquartersGrant() {
  const db = readDb();
  let migratedProfiles = 0;

  for (const [playerId, profile] of Object.entries(db)) {
    if (isMasterAccount(playerId)) continue;
    const migratedProfile = removeErroneousSovietTankHeadquartersGrant(profile);
    if (migratedProfile === profile) continue;

    db[playerId] = migratedProfile as PlayerProgress;
    migratedProfiles += 1;
  }

  if (migratedProfiles > 0) {
    writeDb(db);
    console.log(
      `Removed legacy unresearched 4th Tank Brigade grant from ${migratedProfiles} profile(s)`
    );
  }
}

migrateLegacyErroneousHeadquartersGrant();

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
    isPlayerSelectableHeadquartersId(headquartersId) &&
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

function getBattleWinner(battle: BattleRewardSource, localPlayerId: PlayerId) {
  return (
    (battle.status === "player_won" && localPlayerId === "player") ||
    (battle.status === "bot_won" && localPlayerId === "bot")
  );
}

function applyReward(
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
    pveBattleCount:
      progress.pveBattleCount + (mode === "ai" ? 1 : 0),
  };
}

function getAllResearchNodeContexts(): ResearchNodeContext[] {
  return Object.values(RESEARCH_TREES).flatMap((tree) =>
    tree.branches.flatMap((branch) =>
      branch.nodes.map((node, index) => ({
        node,
        branchNodes: branch.nodes,
        index,
        starterHeadquartersId:
          tree.starterHeadquarters.headquartersId as HeadquartersId,
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
  const isGraph = branchNodes.some(
    (branchNode) => branchNode.requires && branchNode.requires.length > 0
  );

  if (isGraph) {
    const requires = node.requires ?? [];
    if (requires.length === 0) return true;

    const tierMembers = getResearchTierMembers(branchNodes);
    const interchangeable = requires.length === 1;

    return requires.every((requiredId) => {
      const required = branchNodes.find((candidate) => candidate.id === requiredId);
      if (!required) return true;

      return interchangeable
        ? isInterchangeableResearchGateSatisfied(
            required,
            progress,
            tierMembers
          )
        : isResearchGateSatisfied(required, progress);
    });
  }

  if (index <= 0) return true;

  return isResearchGateSatisfied(branchNodes[index - 1], progress);
}

function getResearchTierMembers(
  branchNodes: ResearchNode[]
): Map<number, ResearchNode[]> {
  const tierMembers = new Map<number, ResearchNode[]>();

  branchNodes.forEach((node) => {
    const tier = node.tier ?? -1;
    const members = tierMembers.get(tier) ?? [];

    members.push(node);
    tierMembers.set(tier, members);
  });

  return tierMembers;
}

function isInterchangeableResearchGateSatisfied(
  required: ResearchNode,
  progress: PlayerProgress,
  tierMembers: Map<number, ResearchNode[]>
): boolean {
  if (isResearchGateSatisfied(required, progress)) return true;

  const siblings = tierMembers.get(required.tier ?? -1) ?? [];
  return siblings.some(
    (sibling) =>
      sibling.id !== required.id &&
      sibling.type === required.type &&
      sibling.goldCost === undefined &&
      isResearchGateSatisfied(sibling, progress)
  );
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

type ResearchSourceCandidate = {
  headquartersId: HeadquartersId;
  tier: number;
  index: number;
  depth: number;
};

function isHeadquartersNodeOwned(
  node: ResearchNode,
  progress: PlayerProgress
): boolean {
  return Boolean(
    node.headquartersId &&
      progress.unlockedHeadquartersIds.includes(node.headquartersId)
  );
}

function pickLatestResearchSource(
  candidates: ResearchSourceCandidate[]
): ResearchSourceCandidate | null {
  return (
    [...candidates].sort((left, right) => {
      if (right.tier !== left.tier) return right.tier - left.tier;
      if (right.depth !== left.depth) return right.depth - left.depth;
      return right.index - left.index;
    })[0] ?? null
  );
}

function getGraphResearchSourceHeadquartersId(
  context: ResearchNodeContext,
  progress: PlayerProgress
): HeadquartersId {
  const nodeById = new Map(
    context.branchNodes.map((branchNode) => [branchNode.id, branchNode])
  );
  const indexById = new Map(
    context.branchNodes.map((branchNode, index) => [branchNode.id, index])
  );

  function collectOwnedHeadquartersAncestors(
    current: ResearchNode,
    depth: number,
    visited: Set<string>
  ): ResearchSourceCandidate[] {
    const candidates: ResearchSourceCandidate[] = [];

    for (const requiredId of current.requires ?? []) {
      if (visited.has(requiredId)) continue;
      visited.add(requiredId);

      const required = nodeById.get(requiredId);
      if (!required) continue;

      if (
        required.type === "headquarters" &&
        required.headquartersId &&
        isHeadquartersNodeOwned(required, progress)
      ) {
        candidates.push({
          headquartersId: required.headquartersId,
          tier: required.tier ?? -1,
          index: indexById.get(required.id) ?? -1,
          depth,
        });
      }

      candidates.push(
        ...collectOwnedHeadquartersAncestors(required, depth + 1, visited)
      );
    }

    return candidates;
  }

  return (
    pickLatestResearchSource(
      collectOwnedHeadquartersAncestors(context.node, 1, new Set())
    )?.headquartersId ?? context.starterHeadquartersId
  );
}

function getResearchSourceHeadquartersId(
  context: ResearchNodeContext,
  progress: PlayerProgress
): HeadquartersId {
  const isGraph = context.branchNodes.some(
    (branchNode) => branchNode.requires && branchNode.requires.length > 0
  );

  if (isGraph) {
    return getGraphResearchSourceHeadquartersId(context, progress);
  }

  for (let index = context.index - 1; index >= 0; index -= 1) {
    const previous = context.branchNodes[index];

    if (
      previous.type === "headquarters" &&
      previous.headquartersId &&
      isHeadquartersNodeOwned(previous, progress)
    ) {
      return previous.headquartersId;
    }
  }

  return context.starterHeadquartersId;
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

  const researchSourceHeadquartersId = context
    ? getResearchSourceHeadquartersId(context, progress)
    : sourceHeadquartersId;

  if (
    !canSpendResearchExperience(
      progress,
      researchSourceHeadquartersId,
      node.experienceCost
    )
  ) {
    throw new Error("Не хватает опыта для исследования карты");
  }

  const nextProgress = spendResearchExperience(
    progress,
    researchSourceHeadquartersId,
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
  if (!isPlayerSelectableHeadquartersId(headquartersId)) {
    throw new Error("Этот штаб недоступен игрокам");
  }

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

  const researchSourceHeadquartersId = context
    ? getResearchSourceHeadquartersId(context, progress)
    : sourceHeadquartersId;

  if (
    !canSpendResearchExperience(
      progress,
      researchSourceHeadquartersId,
      node.experienceCost
    )
  ) {
    throw new Error("Не хватает опыта для исследования штаба");
  }

  const nextProgress = spendResearchExperience(
    progress,
    researchSourceHeadquartersId,
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

function purchasePremiumDaysOnProfile(
  progress: PlayerProgress,
  days: number
): PlayerProgress {
  const safeDays = getPositiveInteger(days);
  const goldCost = PREMIUM_DAY_OFFERS[safeDays];

  if (!goldCost) {
    throw new Error("Такой срок премиума недоступен");
  }

  if (progress.goldTracks < goldCost) {
    throw new Error("Не хватает золотых траков");
  }

  return addPremiumDaysToProgress(
    {
      ...progress,
      goldTracks: progress.goldTracks - goldCost,
    },
    safeDays
  );
}

function purchaseCampaignOnProfile(
  progress: PlayerProgress,
  campaignId: string
): PlayerProgress {
  const campaign = CAMPAIGNS.find((item) => item.id === campaignId);
  const goldCost = campaign?.goldCost;

  if (!campaign?.premium || !goldCost || goldCost <= 0) {
    throw new Error("Кампания недоступна для покупки");
  }

  if (progress.unlockedCampaignIds.includes(campaign.id)) {
    return progress;
  }

  if (progress.goldTracks < goldCost) {
    throw new Error("Не хватает золотых траков");
  }

  return {
    ...progress,
    goldTracks: progress.goldTracks - goldCost,
    unlockedCampaignIds: [
      campaign.id,
      ...progress.unlockedCampaignIds.filter((id) => id !== campaign.id),
    ],
  };
}

function exchangeGoldForIronOnProfile(
  progress: PlayerProgress,
  goldAmount: number
): PlayerProgress {
  const safeGoldAmount = getPositiveInteger(goldAmount);

  if (safeGoldAmount <= 0) {
    throw new Error("Укажите количество золотых траков для обмена");
  }

  if (progress.goldTracks < safeGoldAmount) {
    throw new Error("Не хватает золотых траков");
  }

  return {
    ...progress,
    goldTracks: progress.goldTracks - safeGoldAmount,
    ironTracks: progress.ironTracks + safeGoldAmount * GOLD_TO_IRON_RATE,
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

  const rewardCampaign = CAMPAIGNS.find((campaign) => {
    const missionIds = new Set(campaign.missions.map((mission) => mission.id));
    return reward.missionIds.every((missionId) => missionIds.has(missionId));
  });
  if (
    rewardCampaign?.premium &&
    !progress.unlockedCampaignIds.includes(rewardCampaign.id)
  ) {
    throw new Error("Премиум-кампания не куплена");
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
  if (!isPlayerSelectableHeadquartersId(headquartersId)) {
    throw new Error("Этот штаб недоступен игрокам");
  }

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

function getDailyLoginDayKey(timestamp: number): string {
  return new Date(timestamp + DAILY_LOGIN_DAY_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function createDailyLoginRewardId(playerId: string, dayKey: string): string {
  return `daily:${playerId}:${dayKey}`.replace(/[^a-zA-Z0-9:_-]/g, "");
}

function applyDailyLoginReward(
  progress: PlayerProgress,
  playerId: string,
  now = Date.now()
): PlayerProgress {
  const dayKey = getDailyLoginDayKey(now);

  if (progress.dailyLoginReward?.dayKey === dayKey) {
    return progress;
  }

  const reward =
    DAILY_LOGIN_REWARD_OPTIONS[
      Math.floor(Math.random() * DAILY_LOGIN_REWARD_OPTIONS.length)
    ] ?? DAILY_LOGIN_REWARD_OPTIONS[0];
  const dailyLoginReward: NonNullable<PlayerProgress["dailyLoginReward"]> = {
    id: createDailyLoginRewardId(playerId, dayKey),
    dayKey,
    claimedAt: now,
    kind: reward.kind,
    amount: reward.amount,
  };
  const nextProgress = {
    ...progress,
    dailyLoginReward,
  };

  switch (reward.kind) {
    case "ironTracks":
      return {
        ...nextProgress,
        ironTracks: progress.ironTracks + reward.amount,
      };
    case "goldTracks":
      return {
        ...nextProgress,
        goldTracks: progress.goldTracks + reward.amount,
      };
    case "freeXp":
      return {
        ...nextProgress,
        freeXp: progress.freeXp + reward.amount,
      };
    case "premium":
      return addPremiumDaysToProgress(
        nextProgress,
        DAILY_LOGIN_PREMIUM_DAYS,
        now
      );
  }
}

export class PlayerProfileManager {
  private persistProfile(
    playerId: string,
    profile: PlayerProgress,
    options: { touchActivity?: boolean } = {}
  ): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) throw new Error("Некорректный playerId");

    const db = readDb();
    const savedProfile = normalizeProfileForPlayer(safePlayerId, {
      ...profile,
      lastActivityAt:
        options.touchActivity === false ? profile.lastActivityAt : Date.now(),
    });
    db[safePlayerId] = savedProfile;
    writeDb(db);

    return savedProfile;
  }

  getProfile(
    playerId: string,
    options: { touchActivity?: boolean } = {}
  ): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) return createInitialPlayerProgress();

    const db = readDb();
    const now = Date.now();
    const normalizedProfile = normalizeProfileForPlayer(safePlayerId, {
      ...db[safePlayerId],
      lastActivityAt:
        options.touchActivity === false
          ? db[safePlayerId]?.lastActivityAt
          : now,
    });
    const profileWithLoginReward =
      options.touchActivity === false
        ? normalizedProfile
        : applyDailyLoginReward(normalizedProfile, safePlayerId, now);
    const profile = refreshCombatMissions(profileWithLoginReward, safePlayerId, now);

    db[safePlayerId] = profile;
    writeDb(db);

    return profile;
  }

  touchActivity(playerId: string): PlayerProgress | null {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) return null;

    const db = readDb();
    const profile = normalizeProfileForPlayer(safePlayerId, db[safePlayerId]);
    db[safePlayerId] = {
      ...profile,
      lastActivityAt: Date.now(),
    };
    writeDb(db);

    return db[safePlayerId];
  }

  applyRadioDuelMissionProgress(
    playerId: string,
    event: RadioDuelMissionEvent
  ): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) throw new Error("Некорректный playerId");

    const profile = this.getProfile(safePlayerId, { touchActivity: false });
    return this.persistProfile(
      safePlayerId,
      applyRadioDuelToCombatMissions(profile, safePlayerId, event),
      { touchActivity: false }
    );
  }

  listProfiles(): AdminPlayerProfileView[] {
    const db = readDb();

    return Object.entries(db)
      .map(([playerId, profile]) => ({
        playerId,
        profile: mergeWithDefaultProgress(profile),
      }))
      .sort((left, right) => {
        const leftMatches =
          left.profile.battleStats.wins + left.profile.battleStats.losses;
        const rightMatches =
          right.profile.battleStats.wins + right.profile.battleStats.losses;

        return rightMatches - leftMatches;
      });
  }

  countClaimedPvpBattleRooms(): number {
    const db = readDb();
    const roomIds = new Set<string>();

    for (const profile of Object.values(db)) {
      const rewardIds = Array.isArray(profile.claimedBattleRewardIds)
        ? profile.claimedBattleRewardIds
        : [];

      for (const rewardId of rewardIds) {
        if (!rewardId.startsWith("pvp:")) continue;

        const [, roomId] = rewardId.split(":");
        if (roomId) {
          roomIds.add(roomId);
        }
      }
    }

    return roomIds.size;
  }

  adminCreditTracks({
    playerId,
    ironTracks,
    goldTracks,
  }: {
    playerId: string;
    ironTracks: number;
    goldTracks: number;
  }): PlayerProgress {
    const safePlayerId = sanitizePlayerId(playerId);
    if (!safePlayerId) throw new Error("Некорректный playerId");

    const profile = this.getProfile(safePlayerId, { touchActivity: false });
    const safeIronTracks = getPositiveInteger(ironTracks);
    const safeGoldTracks = getPositiveInteger(goldTracks);

    if (safeIronTracks <= 0 && safeGoldTracks <= 0) {
      throw new Error("Укажите количество траков для начисления");
    }

    return this.persistProfile(
      safePlayerId,
      {
        ...profile,
        ironTracks: profile.ironTracks + safeIronTracks,
        goldTracks: profile.goldTracks + safeGoldTracks,
      },
      { touchActivity: false }
    );
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
    const guestProfile = this.getProfile(safeGuestPlayerId, {
      touchActivity: false,
    });
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
    if (input.mode === "campaign" && input.campaignMissionId) {
      const campaignMission = getCampaignMission(input.campaignMissionId);
      if (
        campaignMission?.campaign.premium &&
        !profile.unlockedCampaignIds.includes(campaignMission.campaign.id)
      ) {
        throw new Error("Премиум-кампания не куплена");
      }
    }
    const claimId = sanitizeClaimId(input.claimId);
    if (!claimId) {
      throw new Error("Invalid reward claim id");
    }

    const rewardHeadquartersId =
      input.battle.headquarters[input.localPlayerId].headquartersId ??
      input.battle[input.localPlayerId].headquartersId;

    if (profile.claimedBattleRewardIds.includes(claimId)) {
      // Already credited once. The profile is returned unchanged (so the balance
      // is never credited twice), but we return the *real* recomputed reward for
      // display rather than an all-zero one. Returning zeros here clobbered the
      // credited amount in the UI whenever a battle was claimed twice (e.g. the
      // "retry reward" button or a duplicate claim), which read as "reward not
      // credited" even though the tracks/XP had already been added.
      console.log(`Battle reward already claimed (display-only): ${claimId}`);
      return {
        profile,
        reward: calculateBattleReward({
          battle: input.battle,
          mode: input.mode,
          localPlayerId: input.localPlayerId,
          matchEndReason: input.matchEndReason ?? null,
          headquartersFullyResearched: isHeadquartersFullyResearched(
            profile,
            rewardHeadquartersId
          ),
          localDeckWeight: input.localDeckWeight ?? null,
          opponentDeckWeight: input.opponentDeckWeight ?? null,
          premiumActive: isPremiumAccountActive(profile),
          specialRewardMultiplier: input.specialRewardMultiplier ?? 1,
        }),
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
      localDeckWeight: input.localDeckWeight ?? null,
      opponentDeckWeight: input.opponentDeckWeight ?? null,
      premiumActive: isPremiumAccountActive(profile),
      specialRewardMultiplier: input.specialRewardMultiplier ?? 1,
    });
    const localPlayerWon = getBattleWinner(input.battle, input.localPlayerId);
    const rewardedProfile = applyReward(profile, reward, localPlayerWon, input.mode);
    // Combat missions normally accrue in the standalone AI/PvP modes. Campaign
    // battles also count, but only on the *first* run of a mission: once a
    // mission has been won, replaying it (win or loss) no longer advances combat
    // tasks. A mission that has only ever been lost is still "in progress", so
    // those battles keep counting.
    const campaignCountsForCombat =
      input.mode === "campaign" &&
      !!input.campaignMissionId &&
      input.campaignMissionAlreadyWon !== true;
    const missionProfile =
      input.mode !== "campaign" || campaignCountsForCombat
        ? applyBattleToCombatMissions(
            rewardedProfile,
            sanitizePlayerId(playerId),
            input.battle,
            input.localPlayerId
          )
        : rewardedProfile;
    const nextProfile = {
      ...missionProfile,
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
    const firstCompletion = !profile.tutorialCompleted;
    const grantedReward: BattleReward = firstCompletion
      ? reward
      : {
          ...reward,
          goldTracks: 0,
        };

    const nextProfile = {
      ...applyReward(profile, grantedReward, localPlayerWon),
      tutorialCompleted: true,
      claimedBattleRewardIds: firstCompletion
        ? [
            "tutorial:first-completion",
            ...profile.claimedBattleRewardIds,
          ].slice(0, 500)
        : profile.claimedBattleRewardIds,
    };

    return {
      profile: this.persistProfile(playerId, nextProfile),
      reward: grantedReward,
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

  purchasePremiumDays(playerId: string, days: number): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      purchasePremiumDaysOnProfile(profile, days)
    );
  }

  purchaseCampaign(playerId: string, campaignId: string): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      purchaseCampaignOnProfile(profile, campaignId)
    );
  }

  /** Permanently unlocks a premium campaign after a verified store payment. */
  grantCampaignAccess(playerId: string, campaignId: string): PlayerProgress {
    const campaign = CAMPAIGNS.find(
      (item) => item.id === campaignId && item.premium
    );
    if (!campaign) {
      throw new Error("Кампания недоступна для покупки");
    }

    const profile = this.getProfile(playerId, { touchActivity: false });
    if (profile.unlockedCampaignIds.includes(campaign.id)) return profile;

    return this.persistProfile(
      playerId,
      {
        ...profile,
        unlockedCampaignIds: [
          campaign.id,
          ...profile.unlockedCampaignIds.filter((id) => id !== campaign.id),
        ],
      },
      { touchActivity: false }
    );
  }

  exchangeGoldForIron(playerId: string, goldAmount: number): PlayerProgress {
    const profile = this.getProfile(playerId);
    return this.persistProfile(
      playerId,
      exchangeGoldForIronOnProfile(profile, goldAmount)
    );
  }

  creditGoldTracks(
    playerId: string,
    goldTracks: number,
    claimKey: string
  ): PlayerProgress {
    const profile = this.getProfile(playerId);
    const safeGoldTracks = getPositiveInteger(goldTracks);
    const safeClaimKey = claimKey.trim();

    if (!safeClaimKey) {
      throw new Error("Не указан ключ начисления золота");
    }

    if (profile.claimedBattleRewardIds.includes(safeClaimKey)) {
      return profile;
    }

    return this.persistProfile(
      playerId,
      {
        ...profile,
        goldTracks: profile.goldTracks + safeGoldTracks,
        claimedBattleRewardIds: [
          safeClaimKey,
          ...profile.claimedBattleRewardIds,
        ].slice(0, 500),
      },
      { touchActivity: false }
    );
  }

  grantFirstPlayerPack(playerId: string, claimKey: string): PlayerProgress {
    const profile = this.getProfile(playerId);
    const safeClaimKey = claimKey.trim();
    if (!safeClaimKey) throw new Error("Не указан ключ покупки набора");
    if (profile.claimedBattleRewardIds.includes(safeClaimKey)) return profile;

    return this.persistProfile(
      playerId,
      {
        ...profile,
        goldTracks: profile.goldTracks + 777,
        cardBackId: "first_player",
        researchedCardIds: Array.from(new Set([...profile.researchedCardIds, "t18_dot"])),
        unlockedCardIds: Array.from(new Set([...profile.unlockedCardIds, "t18_dot"])),
        ownedCardCopies: {
          ...profile.ownedCardCopies,
          t18_dot: Math.max(4, profile.ownedCardCopies.t18_dot ?? 0),
        },
        claimedBattleRewardIds: [safeClaimKey, ...profile.claimedBattleRewardIds].slice(0, 500),
      },
      { touchActivity: false }
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
