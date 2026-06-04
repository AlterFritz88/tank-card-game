import { getCard } from "./cards";
import { getHeadquartersDefinition } from "./headquarters";
import type { GameMode, MatchEndReason } from "./modes";
import type {
  BattleKillStats,
  ClientBattleState,
  ClientCardInstance,
  HeadquartersId,
  PlayerId,
} from "./types";
import { isHiddenCardInstance } from "./types";

export type BattleReward = {
  headquartersId: HeadquartersId;
  headquartersXp: number;
  freeXp: number;
  ironTracks: number;
  goldTracks: number;
  destructionProgress: number;
  modeMultiplier: number;
  resultMultiplier: number;
  reasonMultiplier: number;
  fullyResearchedConversion: boolean;
};

type BattleRewardInput = {
  battle: ClientBattleState;
  mode: GameMode;
  localPlayerId: PlayerId;
  matchEndReason?: MatchEndReason | null;
  headquartersFullyResearched?: boolean;
};

const FREE_XP_SHARE = 0.08;
const FULLY_RESEARCHED_FREE_XP_CONVERSION = 0.65;

const CLASS_HP_ESTIMATE: BattleKillStats = {
  light: 3,
  medium: 5,
  heavy: 7,
  td: 4,
  spg: 4,
};

const MODE_REWARD = {
  pvp: {
    headquartersXp: 280,
    ironTracks: 190,
    multiplier: 1,
  },
  campaign: {
    headquartersXp: 180,
    ironTracks: 130,
    multiplier: 0.72,
  },
  ai: {
    headquartersXp: 155,
    ironTracks: 105,
    multiplier: 0.62,
  },
} as const;

export function calculateBattleReward({
  battle,
  mode,
  localPlayerId,
  matchEndReason = null,
  headquartersFullyResearched = false,
}: BattleRewardInput): BattleReward {
  const rewardMode = mode === "pvp" ? "pvp" : mode === "campaign" ? "campaign" : "ai";
  const opponentId: PlayerId = localPlayerId === "player" ? "bot" : "player";
  const localWon =
    (battle.status === "player_won" && localPlayerId === "player") ||
    (battle.status === "bot_won" && localPlayerId === "bot");
  const headquartersId = getHeadquartersIdForReward(battle, localPlayerId);
  const destroyedStats =
    localPlayerId === "player"
      ? battle.stats.destroyedByPlayer
      : battle.stats.destroyedByBot;
  const destructionProgress = getDestructionProgress(
    battle,
    opponentId,
    destroyedStats
  );
  const modeReward = MODE_REWARD[rewardMode];
  const resultMultiplier = localWon
    ? 1
    : rewardMode === "pvp"
      ? 0.52
      : rewardMode === "campaign"
        ? 0.34
        : 0.3;
  const reasonMultiplier = getReasonMultiplier(matchEndReason, localWon);
  const activityMultiplier = 0.45 + destructionProgress * 0.55;
  const rawHeadquartersXp = Math.round(
    modeReward.headquartersXp *
      modeReward.multiplier *
      resultMultiplier *
      reasonMultiplier *
      activityMultiplier
  );
  const headquartersXp = headquartersFullyResearched ? 0 : rawHeadquartersXp;
  const freeXp = Math.max(
    1,
    Math.round(
      headquartersFullyResearched
        ? rawHeadquartersXp * FULLY_RESEARCHED_FREE_XP_CONVERSION
        : rawHeadquartersXp * FREE_XP_SHARE
    )
  );
  const ironTracks = Math.max(
    1,
    Math.round(
      modeReward.ironTracks *
        modeReward.multiplier *
        resultMultiplier *
        reasonMultiplier *
        (0.5 + destructionProgress * 0.5)
    )
  );

  return {
    headquartersId,
    headquartersXp,
    freeXp,
    ironTracks,
    goldTracks: 0,
    destructionProgress,
    modeMultiplier: modeReward.multiplier,
    resultMultiplier,
    reasonMultiplier,
    fullyResearchedConversion: headquartersFullyResearched,
  };
}

function getHeadquartersIdForReward(
  battle: ClientBattleState,
  playerId: PlayerId
): HeadquartersId {
  return battle.headquarters[playerId].headquartersId ?? battle[playerId].headquartersId;
}

function getReasonMultiplier(
  reason: MatchEndReason | null,
  localWon: boolean
): number {
  if (!reason) return 1;

  if (!localWon) {
    return reason === "surrender" || reason === "leave" ? 0.8 : 0.9;
  }

  switch (reason) {
    case "surrender":
      return 0.78;
    case "disconnect":
    case "leave":
    case "opponent_left":
      return 0.72;
    default:
      return 1;
  }
}

function getDestructionProgress(
  battle: ClientBattleState,
  opponentId: PlayerId,
  destroyedStats: BattleKillStats
): number {
  const opponentHeadquartersId = getHeadquartersIdForReward(battle, opponentId);
  const opponentHeadquarters = getHeadquartersDefinition(opponentHeadquartersId);
  const currentOpponentHqHp = Math.max(0, battle.headquarters[opponentId].hp);
  const hqDamage = Math.max(0, opponentHeadquarters.hp - currentOpponentHqHp);
  const destroyedHp = estimateDestroyedHp(destroyedStats);
  const visibleArmyHp = estimateKnownArmyHp(battle, opponentId);
  const totalEnemyHp = Math.max(
    opponentHeadquarters.hp + destroyedHp + visibleArmyHp,
    opponentHeadquarters.hp
  );

  return clamp01((hqDamage + destroyedHp) / totalEnemyHp);
}

function estimateDestroyedHp(stats: BattleKillStats): number {
  return Object.entries(stats).reduce((total, [key, count]) => {
    const classKey = key as keyof BattleKillStats;
    return total + CLASS_HP_ESTIMATE[classKey] * count;
  }, 0);
}

function estimateKnownArmyHp(
  battle: ClientBattleState,
  owner: PlayerId
): number {
  const visibleDeckAndHandHp = [
    ...battle[owner].hand,
    ...battle[owner].deck,
  ].reduce(
    (total, card) => total + estimateCardHp(card),
    0
  );
  const visibleBoardHp = battle.units
    .filter((unit) => unit.ownerId === owner)
    .reduce((total, unit) => total + Math.max(0, unit.currentHp), 0);

  return visibleDeckAndHandHp + visibleBoardHp;
}

function estimateCardHp(card: ClientCardInstance): number {
  if (isHiddenCardInstance(card)) return 3;

  return getCard(card.cardId).hp;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
