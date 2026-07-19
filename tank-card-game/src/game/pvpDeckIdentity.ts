import type { HeadquartersId } from "./types";
import { normalizeCardId } from "./cards";

export type PvpDeckIdentity = {
  headquartersId: HeadquartersId;
  selection: "default" | "custom";
  cardCount: number | null;
  fingerprint: string;
};

function hashDeckIdentity(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createPvpDeckIdentity(
  headquartersId: HeadquartersId,
  deckCardIds?: readonly string[] | null
): PvpDeckIdentity {
  if (!deckCardIds) {
    const source = `default:${headquartersId}`;
    return {
      headquartersId,
      selection: "default",
      cardCount: null,
      fingerprint: hashDeckIdentity(source),
    };
  }

  const sortedCardIds = deckCardIds
    .map((cardId) => normalizeCardId(cardId) ?? cardId)
    .sort((left, right) => left.localeCompare(right));
  const source = `custom:${headquartersId}:${sortedCardIds.length}:${sortedCardIds.join("\u001f")}`;

  return {
    headquartersId,
    selection: "custom",
    cardCount: sortedCardIds.length,
    fingerprint: hashDeckIdentity(source),
  };
}

export function samePvpDeckIdentity(
  left: PvpDeckIdentity,
  right: PvpDeckIdentity
): boolean {
  return (
    left.headquartersId === right.headquartersId &&
    left.selection === right.selection &&
    left.cardCount === right.cardCount &&
    left.fingerprint === right.fingerprint
  );
}
