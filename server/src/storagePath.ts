import { existsSync } from "node:fs";
import { join } from "node:path";

// Hosting providers mount a writable persistent volume here (Amvera uses /data).
// The rest of the container filesystem is read-only at runtime, so JSON
// databases must live on the mount or every write fails with EROFS.
const PERSISTENT_MOUNT = "/data";

/**
 * Resolve where a JSON database file should be stored.
 *
 * Priority:
 *   1. Explicit env var (set in the hosting panel / amvera.yaml).
 *   2. A mounted persistent volume at /data, if present (Amvera / containers).
 *   3. ./data next to the process (local development).
 */
export function resolveDbPath(
  envValue: string | undefined,
  fileName: string
): string {
  const trimmed = envValue?.trim();
  if (trimmed) return trimmed;
  if (existsSync(PERSISTENT_MOUNT)) return join(PERSISTENT_MOUNT, fileName);
  return join(process.cwd(), "data", fileName);
}
