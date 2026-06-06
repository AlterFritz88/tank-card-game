import {
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  getTrainingHeadquartersIds,
} from "./headquarters";
import type { BattleReward } from "./economy";
import type { HeadquartersId } from "./types";

export type PlayerProgress = {
  ironTracks: number;
  goldTracks: number;
  freeXp: number;
  headquartersXp: Partial<Record<HeadquartersId, number>>;
  headquartersMatchCounts: Partial<Record<HeadquartersId, number>>;
  unlockedHeadquartersIds: HeadquartersId[];
  unlockedCardIds: string[];
  ownedCardCopies: Record<string, number>;
};

const PLAYER_PROGRESS_KEY = "tank-card-game:player-progress";

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

export function applyBattleRewardToProgress(
  reward: BattleReward
): PlayerProgress {
  const progress = loadPlayerProgress();
  const currentHeadquartersXp =
    progress.headquartersXp[reward.headquartersId] ?? 0;
  const currentHeadquartersMatches =
    progress.headquartersMatchCounts[reward.headquartersId] ?? 0;
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
  };

  savePlayerProgress(nextProgress);

  return nextProgress;
}

export function createInitialPlayerProgress(): PlayerProgress {
  const trainingHeadquartersIds = getTrainingHeadquartersIds();

  return {
    ironTracks: 0,
    goldTracks: 0,
    freeXp: 0,
    headquartersXp: {},
    headquartersMatchCounts: {},
    unlockedHeadquartersIds:
      trainingHeadquartersIds.length > 0
        ? trainingHeadquartersIds
        : [DEFAULT_PLAYER_HEADQUARTERS_ID],
    unlockedCardIds: [],
    ownedCardCopies: {},
  };
}

function normalizePlayerProgress(
  progress: Partial<PlayerProgress>
): PlayerProgress {
  const fallback = createInitialPlayerProgress();
  const unlockedHeadquartersIds = Array.from(
    new Set([
      ...fallback.unlockedHeadquartersIds,
      ...(Array.isArray(progress.unlockedHeadquartersIds)
        ? progress.unlockedHeadquartersIds
        : []),
    ])
  );

  return {
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
    unlockedHeadquartersIds,
    unlockedCardIds: Array.isArray(progress.unlockedCardIds)
      ? progress.unlockedCardIds
      : [],
    ownedCardCopies:
      typeof progress.ownedCardCopies === "object" && progress.ownedCardCopies
        ? progress.ownedCardCopies
        : {},
  };
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
