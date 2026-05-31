import {
  DEFAULT_BOT_HEADQUARTERS_ID,
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  getHeadquartersDefinition,
} from "./headquarters";
import { DEFAULT_BATTLE_BACKGROUND_ID } from "./battleBackgrounds";
import type { BattleBackgroundId } from "./battleBackgrounds";
import type {
  BattleState,
  CardInstance,
  HeadquartersId,
  HeadquartersState,
  PlayerId,
  PlayerState,
  PlayerTimerState,
} from "./types";

export const STEP_TIME_MS = 15 * 1000;

export type CreateBattleOptions = {
  playerHeadquartersId?: HeadquartersId;
  botHeadquartersId?: HeadquartersId;
  playerDeckId?: string;
  botDeckId?: string;
  backgroundId?: BattleBackgroundId;
};

const DECK_CARD_IDS: Record<string, string[]> = {
  training_unit_default: [
    "m4_sherman",
    "m5_stuart",
    "churchill",
    "su_122",
    "m4_sherman",
    "m5_stuart",
    "churchill",
    "su_122",
  ],

  trainingslager_default: [
    "panzer_iv",
    "stug_iii",
    "marder_iii",
    "wespe",
    "tiger_i",
    "panzer_iv",
    "stug_iii",
    "marder_iii",
  ],

  first_panzer_division_default: [
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "marder_iii",
    "marder_iii",
    "wespe",
    "wespe",
    "panzer_iv",
    "stug_iii",
    "marder_iii",
    "wespe",
  ],

  // === Прогрессивные колоды 1. Panzer-Division (Польша 1939) ===

  // Миссия 1 — Прорыв границы (против слабых пограничников)
  first_panzer_m1: [
    "pzkpfw_i_ausf_a",
    "pzkpfw_i_ausf_a",
    "pzkpfw_i_ausf_b",
    "pzkpfw_i_ausf_b",
    "pzkpfw_i_ausf_b",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "panzer_35t",
    "panzer_35t",
    "panzer_35t",
    "pzbef_i",
    "pzbef_i",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_iii_ausf_a",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "sig_33_pzi",
  ],

  // Миссия 2 — Бои за Радом (против армии «Лодзь»)
  first_panzer_m2: [
    "pzkpfw_i_ausf_b",
    "pzkpfw_i_ausf_b",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "panzer_35t",
    "panzer_35t",
    "panzer_35t",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "pzbef_i",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iv_ausf_a",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_35t",
    "sig_33_pzi",
    "sig_33_pzi",
  ],

  // Миссия 3 — Битва на Бзуре (против «Прусы», появляется бронепоезд)
  first_panzer_m3: [
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "panzer_35t",
    "panzer_35t",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_b",
    "panzerjaeger_i",
    "panzerjaeger_35t",
    "panzerjaeger_38t_early",
    "sig_33_pzi",
    "sig_33_pzii",
    "neubaufahrzeug",
  ],

  // Миссия 4 — Наступление на Варшаву (самая тяжёлая, два бронепоезда)
  first_panzer_m4: [
    "panzer_35t",
    "panzer_35t",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iv_ausf_b",
    "panzerjaeger_35t",
    "panzerjaeger_35t",
    "panzerjaeger_38t_early",
    "panzerjaeger_38t_early",
    "sig_33_pzi",
    "sig_33_pzii",
    "sig_33_pzii",
    "neubaufahrzeug",
    "neubaufahrzeug",
    "grosstraktor",
  ],

  first_panzer_division_campaign: [
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "marder_iii",
    "marder_iii",
    "marder_iii",
    "marder_iii",
    "marder_iii",
    "wespe",
    "wespe",
    "wespe",
    "wespe",
    "tiger_i",
    "tiger_i",
    "tiger_i",
  ],

  polish_border_guard_campaign: [
    "tk_3",
    "tk_3",
    "tk_3",
    "tk_3",
    "tk_3",
    "tks",
    "tks",
    "tks",
    "tks",
    "tks",
    "tkf",
    "tkf",
    "tkf",
    "tkf",
    "renault_ft",
    "renault_ft",
    "renault_ft",
    "vickers_e_type_a",
    "vickers_e_type_a",
    "vickers_e_type_a",
    "tp7_dwuwiezowy",
    "tp7_dwuwiezowy",
    "tks_20mm",
    "tks_20mm",
    "tkd",
  ],

  polish_army_lodz_campaign: [
    "tk_3",
    "tk_3",
    "tks",
    "tks",
    "tks",
    "tkf",
    "tkf",
    "tkw",
    "tkw",
    "tks_20mm",
    "tks_20mm",
    "tks_20mm",
    "tks_d",
    "tks_d",
    "tkd",
    "tkd",
    "tp7_dwuwiezowy",
    "tp7_dwuwiezowy",
    "tp7_jednowiezowy",
    "tp7_jednowiezowy",
    "vickers_e_type_a",
    "vickers_e_type_b",
    "renault_ft",
    "renault_r35",
    "hotchkiss_h35",
  ],

  polish_army_prusy_campaign: [
    "tks",
    "tks",
    "tkf",
    "tkf",
    "tkw",
    "tks_20mm",
    "tks_20mm",
    "tks_d",
    "tks_d",
    "tkd",
    "tkd",
    "tp7_dwuwiezowy",
    "tp7_dwuwiezowy",
    "tp7_jednowiezowy",
    "tp7_jednowiezowy",
    "tp7_jednowiezowy",
    "tp7_wzmocniony",
    "tp7_wzmocniony",
    "tp9",
    "tp9",
    "tp10",
    "vickers_e_type_b",
    "renault_r35",
    "hotchkiss_h35",
    "pociag_pancerny_danuta",
  ],

  polish_warsaw_defense_campaign: [
    "tks_20mm",
    "tks_20mm",
    "tks_d",
    "tks_d",
    "tkd",
    "tkd",
    "tp7_jednowiezowy",
    "tp7_jednowiezowy",
    "tp7_wzmocniony",
    "tp7_wzmocniony",
    "tp7_wzmocniony",
    "tp9",
    "tp9",
    "tp9",
    "tp10",
    "tp10",
    "tp10",
    "tp14",
    "tp14",
    "renault_r35",
    "hotchkiss_h35",
    "pociag_pancerny_danuta",
    "pociag_pancerny_danuta",
    "pociag_pancerny_smialy",
    "pociag_pancerny_smialy",
  ],
};

function createCardInstances(cardIds: string[], owner: PlayerId): CardInstance[] {
  return cardIds.map((cardId, index) => ({
    instanceId: `${owner}_${cardId}_${index}`,
    cardId,
  }));
}

function shuffleCards<T>(items: T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));

    [result[index], result[randomIndex]] = [
      result[randomIndex],
      result[index],
    ];
  }

  return result;
}

function createPlayerState(
  owner: PlayerId,
  headquartersId: HeadquartersId,
  deckId?: string
): PlayerState {
  const headquarters = getHeadquartersDefinition(headquartersId);
  const resolvedDeckId = deckId ?? headquarters.defaultDeckId;
  const deckCardIds = DECK_CARD_IDS[resolvedDeckId] ?? [];
  const deck = shuffleCards(createCardInstances(deckCardIds, owner));

  return {
    headquartersId,
    deckId: resolvedDeckId,
    deck,
    hand: [],
    discard: [],

    resources: 0,
    maxResources: 0,
  };
}

function createTimerState(): PlayerTimerState {
  return {
    stepTimeLeftMs: STEP_TIME_MS,
    idleStreak: 0,
    actedThisStep: false,
  };
}

function createHeadquarters(
  ownerId: PlayerId,
  headquartersId: HeadquartersId
): HeadquartersState {
  const isPlayer = ownerId === "player";
  const headquarters = getHeadquartersDefinition(headquartersId);

  return {
    ownerId,
    headquartersId,
    position: isPlayer ? { row: 2, col: 0 } : { row: 0, col: 4 },

    hp: headquarters.hp,
    attack: headquarters.attack,
    range: headquarters.range,
    fuelGeneration: headquarters.fuelGeneration,

    alreadyAttacked: false,
  };
}

export function createInitialBattleState(
  options: CreateBattleOptions = {}
): BattleState {
  const playerHeadquartersId =
    options.playerHeadquartersId ?? DEFAULT_PLAYER_HEADQUARTERS_ID;
  const botHeadquartersId =
    options.botHeadquartersId ?? DEFAULT_BOT_HEADQUARTERS_ID;

  const state: BattleState = {
    status: "starting",
    activePlayer: "player",
    turn: 1,
    backgroundId: options.backgroundId ?? DEFAULT_BATTLE_BACKGROUND_ID,

    player: createPlayerState("player", playerHeadquartersId, options.playerDeckId),
    bot: createPlayerState("bot", botHeadquartersId, options.botDeckId),

    headquarters: {
      player: createHeadquarters("player", playerHeadquartersId),
      bot: createHeadquarters("bot", botHeadquartersId),
    },

    units: [],

    timers: {
      player: createTimerState(),
      bot: createTimerState(),
    },

    stats: {
      destroyedByPlayer: {
        light: 0,
        medium: 0,
        heavy: 0,
        td: 0,
        spg: 0,
      },
      destroyedByBot: {
        light: 0,
        medium: 0,
        heavy: 0,
        td: 0,
        spg: 0,
      },
    },

    log: ["Бой готовится. Определяется первый ход."],
  };

  state.player.maxResources = state.headquarters.player.fuelGeneration;
  state.player.resources = state.player.maxResources;

  state.bot.maxResources = state.headquarters.bot.fuelGeneration;
  state.bot.resources = state.bot.maxResources;

  return state;
}

export const initialBattleState = createInitialBattleState();
