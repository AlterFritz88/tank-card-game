const PLAYER_ID_STORAGE_KEY = "tank-card-game:player-id";

function createPersistentPlayerId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getPersistentPlayerId(): string {
  const existingPlayerId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (existingPlayerId) return existingPlayerId;

  const nextPlayerId = createPersistentPlayerId();
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, nextPlayerId);
  return nextPlayerId;
}
