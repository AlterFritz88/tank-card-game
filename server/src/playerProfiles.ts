import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { calculateBattleReward, type BattleReward } from "../../tank-card-game/src/game/economy";
import { HEADQUARTERS } from "../../tank-card-game/src/game/headquarters";
import type { GameMode, MatchEndReason } from "../../tank-card-game/src/game/modes";
import {
  canSpendResearchExperience,
  createInitialPlayerProgress,
  isHeadquartersFullyResearched,
  spendResearchExperience,
  type PlayerProgress,
} from "../../tank-card-game/src/game/playerProgress";
import {
  RESEARCH_TREES,
  type ResearchNode,
} from "../../tank-card-game/src/game/researchTrees";
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
  battle: ClientBattleState;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
};

const PROFILE_DB_PATH =
  process.env.PLAYER_PROFILE_DB_PATH ??
  join(process.cwd(), "data", "player-profiles.json");
const CARD_COPY_LIMIT = 4;

function sanitizePlayerId(playerId: string): string {
  return playerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
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

function mergeWithDefaultProgress(profile?: Partial<PlayerProgress>): PlayerProgress {
  const fallback = createInitialPlayerProgress();
  if (!profile) return fallback;

  return {
    ...fallback,
    ...profile,
    battleStats: {
      ...fallback.battleStats,
      ...profile.battleStats,
    },
    headquartersXp: {
      ...fallback.headquartersXp,
      ...profile.headquartersXp,
    },
    headquartersMatchCounts: {
      ...fallback.headquartersMatchCounts,
      ...profile.headquartersMatchCounts,
    },
    headquartersBattleStats: {
      ...fallback.headquartersBattleStats,
      ...profile.headquartersBattleStats,
    },
    researchedHeadquartersIds: Array.from(
      new Set([
        ...fallback.researchedHeadquartersIds,
        ...(profile.researchedHeadquartersIds ?? []),
      ])
    ).filter((headquartersId): headquartersId is HeadquartersId =>
      Boolean(HEADQUARTERS[headquartersId as HeadquartersId])
    ),
    researchedCardIds: Array.from(
      new Set([
        ...fallback.researchedCardIds,
        ...(profile.researchedCardIds ?? []),
      ])
    ),
    unlockedHeadquartersIds: Array.from(
      new Set([
        ...fallback.unlockedHeadquartersIds,
        ...(profile.unlockedHeadquartersIds ?? []),
      ])
    ).filter((headquartersId): headquartersId is HeadquartersId =>
      Boolean(HEADQUARTERS[headquartersId as HeadquartersId])
    ),
    unlockedCardIds: Array.from(
      new Set([
        ...fallback.unlockedCardIds,
        ...(profile.unlockedCardIds ?? []),
      ])
    ),
    ownedCardCopies: {
      ...fallback.ownedCardCopies,
      ...profile.ownedCardCopies,
    },
  };
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

  claimBattleReward(
    playerId: string,
    input: ClaimBattleRewardInput
  ): { profile: PlayerProgress; reward: BattleReward } {
    const profile = this.getProfile(playerId);
    const rewardHeadquartersId =
      input.battle.headquarters[input.localPlayerId].headquartersId ??
      input.battle[input.localPlayerId].headquartersId;
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
    const nextProfile = applyReward(profile, reward, localPlayerWon);

    return {
      profile: this.persistProfile(playerId, nextProfile),
      reward,
    };
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
}
