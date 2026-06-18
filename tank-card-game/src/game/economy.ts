import { getCard } from "./cards";
import { getHeadquartersDefinition } from "./headquarters";
import type { GameMode, MatchEndReason } from "./modes";
import type {
  BattleKillStats,
  BattleStats,
  BattleStatus,
  BoardUnit,
  ClientBattleState,
  ClientCardInstance,
  HeadquartersId,
  HeadquartersState,
  PlayerId,
} from "./types";
import { isHiddenCardInstance } from "./types";

/**
 * The minimal slice of a finished battle the reward formula actually reads.
 *
 * Reward claims are sent to the profile server over WebSocket; serializing the
 * whole {@link ClientBattleState} (units, full hands/decks, the per-action log)
 * produces messages large enough to be dropped by hosting reverse proxies
 * before they reach the app. Sending only this compact source keeps the payload
 * tiny while preserving identical reward math.
 */
export type BattleRewardSource = {
  status: BattleStatus;
  stats: BattleStats;
  headquarters: Record<PlayerId, Pick<HeadquartersState, "headquartersId" | "hp">>;
  player: BattleRewardArmySource;
  bot: BattleRewardArmySource;
  units: Pick<BoardUnit, "ownerId" | "currentHp">[];
};

type BattleRewardArmySource = {
  headquartersId: HeadquartersId;
  hand: ClientCardInstance[];
  deck: ClientCardInstance[];
};

export function buildBattleRewardSource(
  battle: ClientBattleState
): BattleRewardSource {
  return {
    status: battle.status,
    stats: battle.stats,
    headquarters: {
      player: {
        headquartersId: battle.headquarters.player.headquartersId,
        hp: battle.headquarters.player.hp,
      },
      bot: {
        headquartersId: battle.headquarters.bot.headquartersId,
        hp: battle.headquarters.bot.hp,
      },
    },
    player: {
      headquartersId: battle.player.headquartersId,
      hand: battle.player.hand,
      deck: battle.player.deck,
    },
    bot: {
      headquartersId: battle.bot.headquartersId,
      hand: battle.bot.hand,
      deck: battle.bot.deck,
    },
    units: battle.units.map((unit) => ({
      ownerId: unit.ownerId,
      currentHp: unit.currentHp,
    })),
  };
}

export type BattleReward = {
  headquartersId: HeadquartersId;
  rawHeadquartersXp: number;
  headquartersXp: number;
  freeXp: number;
  rawIronTracks: number;
  repairCost: number;
  ironTracks: number;
  goldTracks: number;
  destructionProgress: number;
  modeMultiplier: number;
  resultMultiplier: number;
  reasonMultiplier: number;
  fullyResearchedConversion: boolean;
};

type BattleRewardInput = {
  battle: BattleRewardSource;
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
  support: 3,
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
  const reasonMultiplier = getReasonMultiplier(
    matchEndReason,
    localWon,
    destructionProgress
  );
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
  const rawIronTracks = Math.max(
    1,
    Math.round(
      modeReward.ironTracks *
        modeReward.multiplier *
        resultMultiplier *
        reasonMultiplier *
        (0.5 + destructionProgress * 0.5)
    )
  );
  const repairCost = -Math.max(
    0,
    Math.round(rawIronTracks * (localWon ? 0.08 : 0.12))
  );
  const ironTracks = Math.max(0, rawIronTracks + repairCost);

  return {
    headquartersId,
    rawHeadquartersXp,
    headquartersXp,
    freeXp,
    rawIronTracks,
    repairCost,
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
  battle: BattleRewardSource,
  playerId: PlayerId
): HeadquartersId {
  return battle.headquarters[playerId].headquartersId ?? battle[playerId].headquartersId;
}

// Early-exit endings (a player surrendered, left, or lost connection) cut the
// match short, so neither side fought it to its natural conclusion. Instead of
// a flat penalty, scale the reward by how far the battle had actually
// progressed (`destructionProgress` — HQ damage dealt plus units destroyed),
// so the payout is proportional to what each side accomplished: an opponent who
// surrenders with 1 HP left on their headquarters yields an almost-full reward,
// while an instant ragequit yields little. Applied symmetrically so both the
// winner and the surrendering loser are paid fairly for their own contribution.
function getReasonMultiplier(
  reason: MatchEndReason | null,
  localWon: boolean,
  destructionProgress: number
): number {
  if (!reason) return 1;

  const isEarlyExit =
    reason === "surrender" ||
    reason === "leave" ||
    reason === "disconnect" ||
    reason === "opponent_left";
  if (!isEarlyExit) return 1;

  // Winners keep more of their reward as they near the kill; the side that
  // bailed keeps a slightly higher floor for the effort it did put in.
  const floor = localWon ? 0.55 : 0.65;
  return floor + (1 - floor) * clamp01(destructionProgress);
}

function getDestructionProgress(
  battle: BattleRewardSource,
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
    return total + (CLASS_HP_ESTIMATE[classKey] ?? 0) * count;
  }, 0);
}

function estimateKnownArmyHp(
  battle: BattleRewardSource,
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
