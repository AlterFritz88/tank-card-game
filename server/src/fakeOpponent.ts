/**
 * Fabricates believable "fake" PvP opponents. When matchmaking cannot find a
 * real human in time (see RoomManager), the server drops one of these into the
 * opponent slot so the waiting player still gets a match — a random nickname,
 * a plausible headquarters, a deck within ±40% of the player's strength, and a
 * randomly chosen difficulty + playstyle. The client is told nothing: from its
 * side it looks exactly like a normal human match.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cards, getCard } from "../../tank-card-game/src/game/cards";
import {
  getHeadquartersDefinition,
} from "../../tank-card-game/src/game/headquarters";
import { getDeckCardIds } from "../../tank-card-game/src/game/initialState";
import {
  calculateDeckWeight,
  getCardLevel,
  getHeadquartersWeight,
} from "../../tank-card-game/src/game/deckWeight";
import type { BotDifficulty, FakeStyle } from "../../tank-card-game/src/game/bot";
import type { HeadquartersId } from "../../tank-card-game/src/game/types";

const CUSTOM_DECK_CARD_LIMIT = 40;
const CUSTOM_DECK_COPY_LIMIT = 4;

// The deck's total weight is aimed within ±40% of the player's, uniformly — the
// full spread, so opponents range from clearly weaker to clearly stronger.
const DECK_WEIGHT_MIN_FACTOR = 0.6;
const DECK_WEIGHT_MAX_FACTOR = 1.4;

// Standard, non-campaign headquarters a normal account would realistically field
// in PvP: the three training units plus each nation's four division/corps HQs.
const FAKE_HQ_POOL: HeadquartersId[] = [
  "training_unit",
  "trainingslager",
  "training_camp",
  "first_panzer_division",
  "german_motorized_division",
  "german_artillery_division",
  "german_rear_corps",
  "soviet_tank_brigade",
  "soviet_motor_rifle_division",
  "soviet_guards_mortar_regiment",
  "soviet_auto_battalion",
  "usa_old_ironsides",
  "usa_armored_infantry_regiment",
  "usa_armored_artillery_battalion",
  "usa_maintenance_battalion",
];

const FAKE_STYLES: FakeStyle[] = [
  "hq_rush",
  "rear_raid",
  "board_control",
  "balanced",
  "defensive",
  "aggressive",
];

const FALLBACK_NICKNAMES = [
  "SteelPanzer",
  "IronBarrel",
  "TankRiderX",
  "ArmorFox",
  "TurretLord",
  "RedVector",
  "NovaStrike",
  "GrimHunter",
];

export type FakeOpponentConfig = {
  nickname: string;
  headquartersId: HeadquartersId;
  deckCardIds: string[];
  deckWeight: number;
  difficulty: BotDifficulty;
  style: FakeStyle;
  // Human-misplay rate for this opponent, already scaled down for stronger
  // (non-training, upgraded) decks so a serious account plays cleaner.
  sloppiness: number;
};

let cachedNicknames: string[] | null = null;

function loadNicknames(): string[] {
  if (cachedNicknames) return cachedNicknames;

  try {
    const filePath = fileURLToPath(new URL("./fake_players.txt", import.meta.url));
    const raw = readFileSync(filePath, "utf8");
    const names = raw
      .split(/\r?\n/)
      // Lines look like "42. NickName" — pull the nickname off numbered entries.
      .map((line) => /^\s*\d+\.\s*(\S.*?)\s*$/.exec(line)?.[1] ?? null)
      .filter((name): name is string => Boolean(name));

    cachedNicknames = names.length > 0 ? names : FALLBACK_NICKNAMES;
  } catch (error) {
    console.warn("Failed to load fake_players.txt, using fallback nicknames:", error);
    cachedNicknames = FALLBACK_NICKNAMES;
  }

  return cachedNicknames;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function getRandomFakeNickname(exclude?: Set<string>): string {
  const names = loadNicknames();

  if (exclude && exclude.size > 0) {
    const available = names.filter((name) => !exclude.has(name));
    if (available.length > 0) return pickRandom(available);
  }

  return pickRandom(names);
}

function cardWeight(cardId: string): number {
  try {
    return getCardLevel(getCard(cardId));
  } catch {
    return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function averageCardWeight(deck: string[]): number {
  if (deck.length === 0) return 1;
  return deck.reduce((total, id) => total + cardWeight(id), 0) / deck.length;
}

// Average card weight of a plain training deck — the "unprogressed" baseline that
// deck advancement is measured against.
let cachedTrainingBaseline: number | null = null;
function trainingBaselineAvgCardWeight(): number {
  if (cachedTrainingBaseline !== null) return cachedTrainingBaseline;

  const deck = getDeckCardIds(
    getHeadquartersDefinition("training_unit").defaultDeckId
  );
  cachedTrainingBaseline = Math.max(1, averageCardWeight(deck));
  return cachedTrainingBaseline;
}

/**
 * How "serious/progressed" this opponent looks, 0..1. A non-training
 * headquarters counts for half; drafting cards meaningfully stronger than a
 * plain training deck (higher rarity/level) fills the rest. Drives both a higher
 * difficulty tier and fewer misplays, so a prokачанный opponent plays logically.
 */
function computeAdvancement(headquartersId: HeadquartersId, deck: string[]): number {
  const headquarters = getHeadquartersDefinition(headquartersId);
  const isTraining = headquarters.type === "Учебная часть";
  const baseline = trainingBaselineAvgCardWeight();
  // 0 at baseline, 1 once the deck is ~twice as strong per card.
  const cardStrength = clamp(
    (averageCardWeight(deck) - baseline) / baseline,
    0,
    1
  );

  return clamp((isTraining ? 0 : 0.5) + cardStrength * 0.5, 0, 1);
}

function weightedPick<T>(entries: [T, number][]): T {
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (total <= 0) return entries[0][0];

  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return value;
  }

  return entries[entries.length - 1][0];
}

// Higher advancement skews the tier toward hard/full; a weak/training opponent
// stays mostly easy/medium. Randomness keeps the roster varied either way.
function pickDifficultyForAdvancement(advancement: number): BotDifficulty {
  return weightedPick<BotDifficulty>([
    ["easy", 1.5 * (1 - advancement) + 0.15],
    ["medium", 1.0 + 0.5 * (1 - advancement)],
    ["hard", 0.3 + 1.4 * advancement],
    ["full", 0.1 + 1.4 * advancement],
  ]);
}

function countCopies(deck: string[]): Map<string, number> {
  const copies = new Map<string, number>();
  for (const id of deck) {
    copies.set(id, (copies.get(id) ?? 0) + 1);
  }
  return copies;
}

/**
 * Builds a legal 40-card deck for `headquartersId` whose total weight lands near
 * `targetTotalWeight`. Starts from the headquarters' default deck (so the mana
 * curve stays sane) and swaps cards for heavier or lighter same-nation ones
 * until the weight is close enough, respecting the four-copy limit.
 */
function buildDeck(
  headquartersId: HeadquartersId,
  targetTotalWeight: number
): string[] {
  const headquarters = getHeadquartersDefinition(headquartersId);
  // getDeckCardIds expands standard/training default decks to the full 40 cards.
  const deck = [...getDeckCardIds(headquarters.defaultDeckId)];
  if (deck.length === 0) return deck;

  // Only the headquarters' own nation — even training HQs field a single-nation
  // deck (a German training camp must not roll Soviet/Polish/US tanks).
  const pool = cards.filter((card) => card.nation === headquarters.nation);
  if (pool.length === 0) return deck.slice(0, CUSTOM_DECK_CARD_LIMIT);

  const hqWeight = getHeadquartersWeight(headquartersId);
  const targetCardWeight = Math.max(1, targetTotalWeight - hqWeight);
  const tolerance = Math.max(3, targetCardWeight * 0.04);
  const MAX_SWAPS = 60;

  const currentCardWeight = () =>
    deck.reduce((total, id) => total + cardWeight(id), 0);

  for (let swap = 0; swap < MAX_SWAPS; swap += 1) {
    const diff = targetCardWeight - currentCardWeight();
    if (Math.abs(diff) <= tolerance) break;

    const index = Math.floor(Math.random() * deck.length);
    const removedId = deck[index];
    const removedWeight = cardWeight(removedId);
    const copies = countCopies(deck);

    const candidates = pool.filter((card) => {
      const existing = copies.get(card.id) ?? 0;
      const availableCopies = existing - (card.id === removedId ? 1 : 0);
      if (availableCopies >= CUSTOM_DECK_COPY_LIMIT) return false;

      const weight = cardWeight(card.id);
      return diff > 0 ? weight > removedWeight : weight < removedWeight;
    });

    if (candidates.length === 0) continue;

    deck[index] = pickRandom(candidates).id;
  }

  return deck.slice(0, CUSTOM_DECK_CARD_LIMIT);
}

/**
 * Produces a full fake-opponent configuration sized against the real player's
 * deck weight. `excludeNicknames` avoids handing out a name already in use by
 * another active fake match.
 */
export function createFakeOpponentConfig(
  playerDeckWeight: number,
  options: { excludeNicknames?: Set<string>; trainingHqOnly?: boolean } = {}
): FakeOpponentConfig {
  const factor = randomInRange(DECK_WEIGHT_MIN_FACTOR, DECK_WEIGHT_MAX_FACTOR);
  const targetTotalWeight = Math.max(1, playerDeckWeight * factor);

  // The three level-1 training headquarters — the only opponents shown to brand
  // new players (< 35 battles), so early matchmaking never feels lopsided.
  const trainingHqs: HeadquartersId[] = [
    "training_unit",
    "trainingslager",
    "training_camp",
  ];

  let headquartersId: HeadquartersId;
  if (options.trainingHqOnly) {
    headquartersId = pickRandom(trainingHqs);
  } else {
    // Prefer a headquarters light enough that its cards can realistically reach
    // the target weight; if none qualifies, fall back to the lightest ones.
    const affordableHqs = FAKE_HQ_POOL.filter(
      (id) => getHeadquartersWeight(id) <= targetTotalWeight * 0.85
    );
    headquartersId = pickRandom(
      affordableHqs.length > 0 ? affordableHqs : trainingHqs
    );
  }

  const deckCardIds = buildDeck(headquartersId, targetTotalWeight);
  const deckWeight = calculateDeckWeight(headquartersId, deckCardIds).totalWeight;

  // A non-training HQ with upgraded units → higher difficulty and fewer misplays.
  const advancement = computeAdvancement(headquartersId, deckCardIds);
  const difficulty = pickDifficultyForAdvancement(advancement);
  const sloppiness =
    getSloppinessForDifficulty(difficulty) * (1 - 0.6 * advancement);

  return {
    nickname: getRandomFakeNickname(options.excludeNicknames),
    headquartersId,
    deckCardIds,
    deckWeight,
    difficulty,
    style: pickRandom(FAKE_STYLES),
    sloppiness,
  };
}

/**
 * Human-like misplay rate for a difficulty tier. Weaker fakes "тупят" more
 * often; the strongest tier plays clean.
 */
export function getSloppinessForDifficulty(difficulty: BotDifficulty): number {
  switch (difficulty) {
    case "easy":
      return 0.35;
    case "medium":
      return 0.18;
    case "hard":
      return 0.06;
    case "full":
    default:
      return 0;
  }
}
