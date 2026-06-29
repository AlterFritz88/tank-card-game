import { resolveWritableDbPath } from "./storagePath";
import { JsonDocumentStore } from "./sqliteStore";

// Tracks which device/IP has already redeemed a one-time promo code so the same
// machine can't farm the reward by re-registering. Persisted so a server restart
// doesn't reset the limit. VPN/incognito can still rotate both axes — this only
// stops casual farming, which is the agreed-upon bar.
type PromoLedger = Record<
  string,
  {
    ips: Record<string, number>;
    devices: Record<string, number>;
  }
>;

const MAX_ENTRIES_PER_AXIS = 20_000;

function isUsableKey(value: string | undefined | null): value is string {
  const trimmed = value?.trim();
  return Boolean(trimmed) && trimmed !== "unknown";
}

function pruneOldest(map: Record<string, number>) {
  const keys = Object.keys(map);
  if (keys.length <= MAX_ENTRIES_PER_AXIS) return;

  keys
    .sort((left, right) => (map[left] ?? 0) - (map[right] ?? 0))
    .slice(0, keys.length - MAX_ENTRIES_PER_AXIS)
    .forEach((key) => {
      delete map[key];
    });
}

export class PromoRedemptionStore {
  private path = resolveWritableDbPath(
    process.env.PROMO_REDEMPTION_DB_PATH,
    "promo-redemptions.json",
    "Promo redemptions"
  );
  private store = new JsonDocumentStore<PromoLedger>(
    "promo-redemptions",
    {},
    this.path
  );

  constructor() {
    console.log(`Promo redemptions database path: ${this.path}`);
  }

  private read(): PromoLedger {
    const parsed = this.store.read();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  }

  /**
   * True when this IP or device has already redeemed the code. Either axis being
   * a match blocks the redemption.
   */
  hasRedeemed(code: string, ip: string | undefined, deviceId: string | undefined): boolean {
    const entry = this.read()[code];
    if (!entry) return false;

    if (isUsableKey(ip) && entry.ips[ip] !== undefined) return true;
    if (isUsableKey(deviceId) && entry.devices[deviceId] !== undefined) return true;

    return false;
  }

  recordRedemption(code: string, ip: string | undefined, deviceId: string | undefined) {
    const ledger = this.read();
    const entry = ledger[code] ?? { ips: {}, devices: {} };
    const now = Date.now();

    if (isUsableKey(ip)) {
      entry.ips[ip] = now;
      pruneOldest(entry.ips);
    }
    if (isUsableKey(deviceId)) {
      entry.devices[deviceId] = now;
      pruneOldest(entry.devices);
    }

    ledger[code] = entry;
    this.store.write(ledger);
  }
}
