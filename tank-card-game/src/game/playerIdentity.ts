const PLAYER_ID_STORAGE_KEY = "tank-card-game:player-id";
const CURRENT_USER_ID_STORAGE_KEY = "panzershrek.current-user-id";
const LEGACY_PLAYER_ID_MIGRATION_KEY = "panzershrek.legacy-player-id";

// Flag the main menu uses to skip the guest entry screen once the player has
// chosen a nickname / signed in. Cleared when signing out so the entry screen
// reappears. Exported so the settings sign-out can reset it too.
export const GUEST_SESSION_READY_STORAGE_KEY = "panzershrek.guestSessionReady";

const GUEST_USER_PREFIX = "guest:";
const REGISTERED_USER_PREFIX = "user:";

export type CurrentUserId =
  | `${typeof GUEST_USER_PREFIX}${string}`
  | `${typeof REGISTERED_USER_PREFIX}${string}`;

function createLocalIdentityId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeIdentitySuffix(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
}

function normalizeUserId(value: string | null): CurrentUserId | null {
  if (!value) return null;

  if (value.startsWith(GUEST_USER_PREFIX)) {
    const suffix = sanitizeIdentitySuffix(value.slice(GUEST_USER_PREFIX.length));
    return suffix ? (`${GUEST_USER_PREFIX}${suffix}` as CurrentUserId) : null;
  }

  if (value.startsWith(REGISTERED_USER_PREFIX)) {
    const suffix = sanitizeIdentitySuffix(
      value.slice(REGISTERED_USER_PREFIX.length)
    );
    return suffix ? (`${REGISTERED_USER_PREFIX}${suffix}` as CurrentUserId) : null;
  }

  const suffix = sanitizeIdentitySuffix(value);
  return suffix ? (`${GUEST_USER_PREFIX}${suffix}` as CurrentUserId) : null;
}

function rememberLegacyPlayerId(value: string) {
  const normalizedLegacyId = sanitizeIdentitySuffix(value);
  if (!normalizedLegacyId) return;

  window.localStorage.setItem(
    LEGACY_PLAYER_ID_MIGRATION_KEY,
    normalizedLegacyId
  );
}

export function getGuestUserId(): CurrentUserId {
  const existingPlayerId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (
    existingPlayerId &&
    !existingPlayerId.startsWith(GUEST_USER_PREFIX) &&
    !existingPlayerId.startsWith(REGISTERED_USER_PREFIX)
  ) {
    rememberLegacyPlayerId(existingPlayerId);
  }

  const normalizedExistingPlayerId = normalizeUserId(existingPlayerId);

  if (normalizedExistingPlayerId?.startsWith(GUEST_USER_PREFIX)) {
    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, normalizedExistingPlayerId);
    return normalizedExistingPlayerId;
  }

  const guestUserId =
    normalizedExistingPlayerId ??
    (`${GUEST_USER_PREFIX}${createLocalIdentityId()}` as CurrentUserId);

  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, guestUserId);
  return guestUserId;
}

export function getCurrentUserId(): CurrentUserId {
  const storedCurrentUserId = window.localStorage.getItem(
    CURRENT_USER_ID_STORAGE_KEY
  );

  if (
    storedCurrentUserId &&
    !storedCurrentUserId.startsWith(GUEST_USER_PREFIX) &&
    !storedCurrentUserId.startsWith(REGISTERED_USER_PREFIX)
  ) {
    rememberLegacyPlayerId(storedCurrentUserId);
  }

  const currentUserId = normalizeUserId(
    storedCurrentUserId
  );

  if (currentUserId) {
    window.localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, currentUserId);
    return currentUserId;
  }

  const guestUserId = getGuestUserId();
  window.localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, guestUserId);
  return guestUserId;
}

export function setCurrentUserId(userId: string): CurrentUserId {
  const normalizedUserId = normalizeUserId(userId) ?? getGuestUserId();
  window.localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, normalizedUserId);

  if (normalizedUserId.startsWith(GUEST_USER_PREFIX)) {
    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, normalizedUserId);
  }

  return normalizedUserId;
}

export function isGuestUserId(userId = getCurrentUserId()): boolean {
  return userId.startsWith(GUEST_USER_PREFIX);
}

export function isRegisteredUserId(userId = getCurrentUserId()): boolean {
  return userId.startsWith(REGISTERED_USER_PREFIX);
}

export function getCurrentUserLogin(): string | null {
  const userId = getCurrentUserId();
  if (!userId.startsWith(REGISTERED_USER_PREFIX)) return null;

  return userId.slice(REGISTERED_USER_PREFIX.length) || null;
}

export function switchToGuestUser(): CurrentUserId {
  const guestUserId = getGuestUserId();
  window.localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, guestUserId);
  return guestUserId;
}

/**
 * Mints a brand-new guest identity, abandoning the previous guest's progress on
 * this device/browser. Used when a guest signs out and starts over from a clean
 * slate.
 */
export function resetGuestUserId(): CurrentUserId {
  const guestUserId =
    `${GUEST_USER_PREFIX}${createLocalIdentityId()}` as CurrentUserId;
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, guestUserId);
  window.localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, guestUserId);
  window.localStorage.removeItem(LEGACY_PLAYER_ID_MIGRATION_KEY);
  return guestUserId;
}

export function getLegacyPlayerIdForMigration(): string | null {
  return window.localStorage.getItem(LEGACY_PLAYER_ID_MIGRATION_KEY);
}

export function clearLegacyPlayerIdMigration() {
  window.localStorage.removeItem(LEGACY_PLAYER_ID_MIGRATION_KEY);
}

export function getPersistentPlayerId(): string {
  return getCurrentUserId();
}
