import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

// Hosting providers mount a writable persistent volume here (Amvera uses /data).
// The rest of the container filesystem is read-only at runtime, so JSON
// databases must live on the mount or every write fails with EROFS.
const PERSISTENT_MOUNT = "/data";

type StorageStatus = {
  label: string;
  path: string;
  writable: boolean;
  error: string | null;
};

const storageStatuses = new Map<string, StorageStatus>();

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkWritable(filePath: string): StorageStatus {
  const probePath = join(
    dirname(filePath),
    `.panzershrek-write-test-${process.pid}-${randomUUID()}.tmp`
  );

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(probePath, "ok", "utf8");
    rmSync(probePath, { force: true });

    return {
      label: "",
      path: filePath,
      writable: true,
      error: null,
    };
  } catch (error) {
    try {
      rmSync(probePath, { force: true });
    } catch {
      // Ignore cleanup errors; the original write error is more useful.
    }

    return {
      label: "",
      path: filePath,
      writable: false,
      error: getErrorMessage(error),
    };
  }
}

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
  return resolveWritableDbPath(envValue, fileName, fileName);
}

export function resolveWritableDbPath(
  envValue: string | undefined,
  fileName: string,
  label: string
): string {
  const trimmed = envValue?.trim();
  const candidates = [
    trimmed,
    existsSync(PERSISTENT_MOUNT) ? join(PERSISTENT_MOUNT, fileName) : null,
    join(process.cwd(), "data", fileName),
  ].filter((value): value is string => Boolean(value));

  const uniqueCandidates = Array.from(new Set(candidates));
  let firstStatus: StorageStatus | null = null;

  for (const candidate of uniqueCandidates) {
    const status = {
      ...checkWritable(candidate),
      label,
    };

    if (!firstStatus) {
      firstStatus = status;
    }

    if (status.writable) {
      storageStatuses.set(label, status);
      if (candidate !== trimmed && trimmed) {
        console.warn(
          `${label} storage path ${trimmed} is not writable; using ${candidate}`
        );
      }
      return candidate;
    }

    console.warn(
      `${label} storage path ${candidate} is not writable: ${status.error}`
    );
  }

  const fallbackPath = uniqueCandidates[0] ?? join(process.cwd(), "data", fileName);
  storageStatuses.set(label, {
    ...(firstStatus ?? {
      path: fallbackPath,
      writable: false,
      error: "No storage path candidates were available",
    }),
    label,
  });
  return fallbackPath;
}

export function writeJsonFileAtomic(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });

  const tempPath = join(
    dirname(filePath),
    `.${fileNameFromPath(filePath)}.${process.pid}.${randomUUID()}.tmp`
  );

  writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  renameSync(tempPath, filePath);
}

function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function getStorageStatuses(): StorageStatus[] {
  return Array.from(storageStatuses.values());
}
