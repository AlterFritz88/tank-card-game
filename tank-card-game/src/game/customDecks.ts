import { cards, getCardOrNull, normalizeCardId } from "./cards";
import { HEADQUARTERS } from "./headquarters";
import type { PlayerProgress } from "./playerProgress";
import type { HeadquartersId, Nation, TankCard, TankClass } from "./types";

export const DECK_UNIT_LIMIT = 40;
export const CARD_COPY_LIMIT = 4;

const SAVED_DECKS_STORAGE_KEY = "tank-card-game:saved-decks";
const RECENT_DECK_STORAGE_KEY = "tank-card-game:recent-deck-selections";

export type UnitTypeFilter = "all" | TankClass | "support";
export type NationFilter = "all" | Nation;

export type SavedDeck = {
  id: string;
  name: string;
  headquartersId: HeadquartersId;
  cardIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type RecentDeckSelection = {
  headquartersId: HeadquartersId;
  deckId: string | null;
  usedAt: number;
};

export type DeckValidationResult = {
  valid: boolean;
  message: string | null;
};

export const UNIT_TYPE_FILTERS: { value: UnitTypeFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "light", label: "Лёгкие" },
  { value: "medium", label: "Средние" },
  { value: "heavy", label: "Тяжёлые" },
  { value: "td", label: "ПТ-САУ" },
  { value: "spg", label: "САУ" },
  { value: "support", label: "Тыл" },
];

export const NATION_FILTERS: { value: NationFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "ussr", label: "СССР" },
  { value: "germany", label: "Германия" },
  { value: "usa", label: "США" },
  { value: "uk", label: "Британия" },
  { value: "poland", label: "Польша" },
  { value: "france", label: "Франция" },
];

function createDeckId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getCardById(cardId: string): TankCard | null {
  return getCardOrNull(cardId);
}

export function isTrainingHeadquarters(headquartersId: HeadquartersId): boolean {
  return HEADQUARTERS[headquartersId]?.type === "Учебная часть";
}

export function countCardCopies(cardIds: string[], cardId: string): number {
  return cardIds.filter((item) => item === cardId).length;
}

export function getGroupedDeckCards(cardIds: string[]): { card: TankCard; count: number }[] {
  const groups = new Map<string, number>();

  for (const cardId of cardIds) {
    groups.set(cardId, (groups.get(cardId) ?? 0) + 1);
  }

  return Array.from(groups.entries())
    .map(([cardId, count]) => ({
      card: getCardById(cardId),
      count,
    }))
    .filter((item): item is { card: TankCard; count: number } => Boolean(item.card));
}

export function getAvailableDeckCards(
  headquartersId: HeadquartersId,
  unitTypeFilter: UnitTypeFilter,
  nationFilter: NationFilter,
  progress?: PlayerProgress
): TankCard[] {
  const headquarters = HEADQUARTERS[headquartersId];
  if (!headquarters) return [];

  const trainingHeadquarters = isTrainingHeadquarters(headquartersId);

  return cards
    .filter((card) => {
      if (progress && (progress.ownedCardCopies[card.id] ?? 0) <= 0) {
        return false;
      }

      if (!trainingHeadquarters && card.nation !== headquarters.nation) {
        return false;
      }

      if (nationFilter !== "all" && card.nation !== nationFilter) {
        return false;
      }

      if (unitTypeFilter === "support") {
        return card.deploymentZone === "support";
      }

      if (unitTypeFilter !== "all" && card.class !== unitTypeFilter) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (left.nation !== right.nation) return left.nation.localeCompare(right.nation);
      if (left.cost !== right.cost) return left.cost - right.cost;
      return left.name.localeCompare(right.name);
    });
}

export function validateDeck(
  headquartersId: HeadquartersId | null,
  cardIds: string[],
  progress?: PlayerProgress
): DeckValidationResult {
  if (!headquartersId || !(headquartersId in HEADQUARTERS)) {
    return { valid: false, message: "Выберите штаб" };
  }

  if (progress && !progress.unlockedHeadquartersIds.includes(headquartersId)) {
    return { valid: false, message: "Этот штаб еще не куплен" };
  }

  if (cardIds.length !== DECK_UNIT_LIMIT) {
    return {
      valid: false,
      message: `В колоде должно быть ${DECK_UNIT_LIMIT} карт`,
    };
  }

  const headquarters = HEADQUARTERS[headquartersId];
  const trainingHeadquarters = isTrainingHeadquarters(headquartersId);
  const copies = new Map<string, number>();

  for (const cardId of cardIds) {
    const card = getCardById(cardId);

    if (!card) {
      return { valid: false, message: `Неизвестная карта: ${cardId}` };
    }

    if (!trainingHeadquarters && card.nation !== headquarters.nation) {
      return {
        valid: false,
        message: "Для этого штаба можно использовать только карты своей нации",
      };
    }

    const nextCopies = (copies.get(cardId) ?? 0) + 1;
    copies.set(cardId, nextCopies);
    const ownedCopies = progress?.ownedCardCopies[cardId];

    if (nextCopies > CARD_COPY_LIMIT) {
      return {
        valid: false,
        message: `В колоде может быть максимум ${CARD_COPY_LIMIT} копии одной карты`,
      };
    }

    if (ownedCopies !== undefined && nextCopies > ownedCopies) {
      return {
        valid: false,
        message: "Нет достаточно копий карты в коллекции",
      };
    }
  }

  return { valid: true, message: null };
}

function parseSavedDecks(value: string | null): SavedDeck[] {
  if (!value) return [];

  try {
    const parsedValue = JSON.parse(value);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.flatMap((item): SavedDeck[] => {
      const validShape =
        typeof item?.id === "string" &&
        typeof item.name === "string" &&
        typeof item.headquartersId === "string" &&
        item.headquartersId in HEADQUARTERS &&
        Array.isArray(item.cardIds) &&
        item.cardIds.every((cardId: unknown) => typeof cardId === "string");

      if (!validShape) return [];

      const cardIds = item.cardIds
        .map((cardId: string) => normalizeCardId(cardId))
        .filter((cardId: string | null): cardId is string => Boolean(cardId));

      return [
        {
          ...item,
          cardIds,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function loadSavedDecks(): SavedDeck[] {
  return parseSavedDecks(window.localStorage.getItem(SAVED_DECKS_STORAGE_KEY));
}

export function saveDecks(decks: SavedDeck[]) {
  window.localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(decks));
}

export function loadSavedDecksForHeadquarters(headquartersId: HeadquartersId): SavedDeck[] {
  return loadSavedDecks().filter((deck) => deck.headquartersId === headquartersId);
}

export function getNextDefaultDeckName(headquartersId: HeadquartersId): string {
  const headquarters = HEADQUARTERS[headquartersId];
  const baseName = headquarters?.title ?? "Колода";
  const existingNames = new Set(
    loadSavedDecksForHeadquarters(headquartersId).map((deck) => deck.name.trim())
  );

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!existingNames.has(candidate)) return candidate;
  }

  return `${baseName} ${Date.now().toString(36)}`;
}

function parseRecentDeckSelections(value: string | null): RecentDeckSelection[] {
  if (!value) return [];

  try {
    const parsedValue = JSON.parse(value);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter((item): item is RecentDeckSelection => {
      return (
        typeof item?.headquartersId === "string" &&
        item.headquartersId in HEADQUARTERS &&
        (typeof item.deckId === "string" || item.deckId === null) &&
        typeof item.usedAt === "number"
      );
    });
  } catch {
    return [];
  }
}

export function loadRecentDeckSelections(): RecentDeckSelection[] {
  return parseRecentDeckSelections(
    window.localStorage.getItem(RECENT_DECK_STORAGE_KEY)
  );
}

export function loadRecentDeckSelectionForHeadquarters(
  headquartersId: HeadquartersId
): RecentDeckSelection | null {
  return (
    loadRecentDeckSelections().find(
      (selection) => selection.headquartersId === headquartersId
    ) ?? null
  );
}

export function markRecentDeckSelection(
  headquartersId: HeadquartersId,
  deckId: string | null
) {
  const selections = loadRecentDeckSelections().filter(
    (selection) => selection.headquartersId !== headquartersId
  );

  window.localStorage.setItem(
    RECENT_DECK_STORAGE_KEY,
    JSON.stringify([
      {
        headquartersId,
        deckId,
        usedAt: Date.now(),
      },
      ...selections,
    ])
  );
}

export function saveCustomDeck(
  headquartersId: HeadquartersId,
  cardIds: string[],
  name: string
): SavedDeck {
  const now = Date.now();
  const deck: SavedDeck = {
    id: createDeckId(),
    name: name.trim() || "Новая колода",
    headquartersId,
    cardIds,
    createdAt: now,
    updatedAt: now,
  };

  saveDecks([...loadSavedDecks(), deck]);

  return deck;
}

export function updateCustomDeck(
  deckId: string,
  headquartersId: HeadquartersId,
  cardIds: string[],
  name: string
): SavedDeck | null {
  const decks = loadSavedDecks();
  const deckIndex = decks.findIndex((deck) => deck.id === deckId);

  if (deckIndex < 0) return null;

  const existingDeck = decks[deckIndex];
  const updatedDeck: SavedDeck = {
    ...existingDeck,
    name: name.trim() || existingDeck.name,
    headquartersId,
    cardIds,
    updatedAt: Date.now(),
  };

  saveDecks([
    ...decks.slice(0, deckIndex),
    updatedDeck,
    ...decks.slice(deckIndex + 1),
  ]);

  return updatedDeck;
}

export function deleteCustomDeck(deckId: string): void {
  saveDecks(loadSavedDecks().filter((deck) => deck.id !== deckId));

  const selections = loadRecentDeckSelections().map((selection) =>
    selection.deckId === deckId
      ? {
          ...selection,
          deckId: null,
          usedAt: Date.now(),
        }
      : selection
  );

  window.localStorage.setItem(RECENT_DECK_STORAGE_KEY, JSON.stringify(selections));
}
