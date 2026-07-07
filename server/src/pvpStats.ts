import { JsonDocumentStore } from "./sqliteStore";

export type PvpAdminStats = {
  // Total completed PvP battles (real players + fake opponents).
  completedBattles: number;
  // Subset of the above played against a server-driven fake opponent.
  completedFakeBattles: number;
  updatedAt: number;
};

const DEFAULT_PVP_STATS: PvpAdminStats = {
  completedBattles: 0,
  completedFakeBattles: 0,
  updatedAt: 0,
};

const pvpStatsStore = new JsonDocumentStore<PvpAdminStats>(
  "pvp-stats",
  DEFAULT_PVP_STATS
);

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizePvpStats(value: PvpAdminStats): PvpAdminStats {
  const completedBattles = normalizeCount(value.completedBattles);
  // Fakes are a subset of all completed battles, so never let them exceed it
  // (guards against a corrupt/legacy document).
  const completedFakeBattles = Math.min(
    completedBattles,
    normalizeCount(value.completedFakeBattles)
  );

  return {
    completedBattles,
    completedFakeBattles,
    updatedAt:
      Number.isFinite(value.updatedAt) && value.updatedAt > 0
        ? Math.floor(value.updatedAt)
        : 0,
  };
}

export class PvpStatsStore {
  getAdminStats(): PvpAdminStats {
    return normalizePvpStats(pvpStatsStore.read());
  }

  recordCompletedBattle(isFake: boolean): PvpAdminStats {
    const current = this.getAdminStats();
    const next: PvpAdminStats = {
      completedBattles: current.completedBattles + 1,
      completedFakeBattles: current.completedFakeBattles + (isFake ? 1 : 0),
      updatedAt: Date.now(),
    };

    pvpStatsStore.write(next);
    return next;
  }

  ensureCompletedBattlesAtLeast(completedBattles: number): PvpAdminStats {
    const safeCompletedBattles = normalizeCount(completedBattles);
    const current = this.getAdminStats();

    if (current.completedBattles >= safeCompletedBattles) {
      return current;
    }

    // Only raise the total floor; the (real-tracked) fake tally is preserved.
    const next: PvpAdminStats = {
      completedBattles: safeCompletedBattles,
      completedFakeBattles: current.completedFakeBattles,
      updatedAt: Date.now(),
    };

    pvpStatsStore.write(next);
    return next;
  }
}
