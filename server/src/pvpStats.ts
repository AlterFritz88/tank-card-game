import { JsonDocumentStore } from "./sqliteStore";

export type PvpAdminStats = {
  completedBattles: number;
  updatedAt: number;
};

const DEFAULT_PVP_STATS: PvpAdminStats = {
  completedBattles: 0,
  updatedAt: 0,
};

const pvpStatsStore = new JsonDocumentStore<PvpAdminStats>(
  "pvp-stats",
  DEFAULT_PVP_STATS
);

function normalizePvpStats(value: PvpAdminStats): PvpAdminStats {
  return {
    completedBattles:
      Number.isFinite(value.completedBattles) && value.completedBattles > 0
        ? Math.floor(value.completedBattles)
        : 0,
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

  recordCompletedBattle(): PvpAdminStats {
    const current = this.getAdminStats();
    const next: PvpAdminStats = {
      completedBattles: current.completedBattles + 1,
      updatedAt: Date.now(),
    };

    pvpStatsStore.write(next);
    return next;
  }

  ensureCompletedBattlesAtLeast(completedBattles: number): PvpAdminStats {
    const safeCompletedBattles =
      Number.isFinite(completedBattles) && completedBattles > 0
        ? Math.floor(completedBattles)
        : 0;
    const current = this.getAdminStats();

    if (current.completedBattles >= safeCompletedBattles) {
      return current;
    }

    const next: PvpAdminStats = {
      completedBattles: safeCompletedBattles,
      updatedAt: Date.now(),
    };

    pvpStatsStore.write(next);
    return next;
  }
}
