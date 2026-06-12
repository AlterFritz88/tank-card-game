import { normalizeCardId } from "./cards";
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
const TRAINING_DECK_CARD_LIMIT = 20;
const DEFAULT_DECK_CARD_LIMIT = 40;
const STOCK_DECK_COPY_LIMIT = 4;

/**
 * Minimum number of valid cards a custom deck must contain to be playable.
 * A deck below this size (corrupted localStorage, cards removed from the
 * collection, hand-edited save) would start the battle in a degraded state,
 * so we fall back to the headquarters default deck instead.
 */
const MIN_PLAYABLE_DECK_CARD_COUNT = 20;

export type CreateBattleOptions = {
  playerHeadquartersId?: HeadquartersId;
  botHeadquartersId?: HeadquartersId;
  playerDeckId?: string;
  botDeckId?: string;
  playerDeckCardIds?: string[];
  botDeckCardIds?: string[];
  backgroundId?: BattleBackgroundId;
  /** Set to false for scripted battles (tutorial) that need deterministic draws. */
  shuffleDecks?: boolean;
};

const DECK_CARD_IDS: Record<string, string[]> = {
  training_unit_default: [
    "ms_1_t18",
    "ms_1_t18",
    "t26_1931",
    "t26_1931",
    "t26_1933",
    "t26_1933",
    "t26_1938",
    "t26_1938",
    "bt_2",
    "bt_2",
    "bt_5",
    "bt_5",
    "bt_7",
    "t37a",
    "t38",
    "t24",
    "t28",
    "t46_1",
    "su_5_2",
    "gaz_55_ambulance",
  ],

  trainingslager_default: [
    "pzkpfw_i_ausf_a",
    "pzkpfw_i_ausf_a",
    "pzkpfw_i_ausf_b",
    "pzkpfw_i_ausf_b",
    "pzkpfw_i_ausf_b",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzbef_i",
    "panzer_35t",
    "panzer_35t",
    "panzer_35t",
    "leig_18",
    "leig_18",
    "mercedes_g3a",
    "adler_type_10_n",
  ],

  training_camp_default: [
    "m1_combat_car",
    "m1_combat_car",
    "m2_light_tank",
    "m2_light_tank",
    "m2_light_tank",
    "m2_light_tank",
    "m3_stuart",
    "m3_stuart",
    "m3_stuart",
    "m2_medium_tank",
    "m2_medium_tank",
    "m2_medium_tank",
    "m3_lee",
    "m5_stuart",
    "m5_stuart",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
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
    "lefh_18",
    "leig_18",
    "mercedes_g3a",
    "adler_type_10_n",
    "sanitaetskraftwagen",
  ],

  german_motorized_division_default: [
    "pzkpfw_i_ausf_b",
    "pzkpfw_i_ausf_b",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "panzer_35t",
    "panzer_35t",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "pzbef_i",
    "pzbef_i",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iv_ausf_a",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "marder_iii",
    "stug_iii",
    "stug_iii",
    "wespe",
    "leig_18",
    "leig_18",
    "mercedes_g3a",
    "mercedes_g3a",
    "mercedes_g3a",
    "adler_type_10_n",
    "adler_type_10_n",
    "adler_type_10_n",
    "sanitaetskraftwagen",
    "sanitaetskraftwagen",
    "pzkpfw_ii_ausf_c",
    "panzer_35t",
    "panzer_38t",
    "pzkpfw_iii_ausf_a",
  ],

  german_artillery_division_default: [
    "pzkpfw_i_ausf_b",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_f",
    "panzer_35t",
    "panzer_35t",
    "panzer_38t",
    "panzer_38t",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "marder_iii",
    "marder_iii",
    "stug_iii",
    "stug_iii",
    "wespe",
    "wespe",
    "wespe",
    "sig_33_pzi",
    "sig_33_pzi",
    "sig_33_pzii",
    "sig_33_pzii",
    "leig_18",
    "leig_18",
    "leig_18",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "mercedes_g3a",
    "mercedes_g3a",
    "adler_type_10_n",
    "adler_type_10_n",
    "sanitaetskraftwagen",
    "sanitaetskraftwagen",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_b",
    "panzer_38t",
    "marder_iii",
    "wespe",
    "lefh_18",
  ],

  german_rear_corps_default: [
    "pzkpfw_i_ausf_a",
    "pzkpfw_i_ausf_b",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_d",
    "panzer_35t",
    "panzer_35t",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iv_ausf_a",
    "panzerjaeger_i",
    "marder_iii",
    "stug_iii",
    "wespe",
    "leig_18",
    "leig_18",
    "lefh_18",
    "mercedes_g3a",
    "mercedes_g3a",
    "mercedes_g3a",
    "mercedes_g3a",
    "adler_type_10_n",
    "adler_type_10_n",
    "adler_type_10_n",
    "adler_type_10_n",
    "sanitaetskraftwagen",
    "sanitaetskraftwagen",
    "sanitaetskraftwagen",
    "sanitaetskraftwagen",
    "pzbef_i",
    "pzbef_i",
    "panzer_35t",
    "panzer_38t",
    "pzkpfw_ii_ausf_f",
    "stug_iii",
    "lefh_18",
    "mercedes_g3a",
    "sanitaetskraftwagen",
  ],

  soviet_tank_brigade_default: [
    "ms_1_t18",
    "t26_1931",
    "t26_1933",
    "t26_1933",
    "t26_1938",
    "t26_1938",
    "bt_2",
    "bt_5",
    "bt_5",
    "bt_7",
    "bt_7",
    "t37a",
    "t38",
    "t40",
    "t40",
    "t24",
    "t24",
    "t28",
    "t28",
    "t46_1",
    "t46_1",
    "t34_76",
    "t34_76",
    "t34_76",
    "kv1",
    "kv1",
    "su76",
    "su76",
    "su_122",
    "su_122",
    "su_5_2",
    "su_5_2",
    "amo_f15",
    "ford_aa_ammo",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "bt_5",
    "bt_7",
    "t34_76",
    "kv1",
  ],

  soviet_motor_rifle_division_default: [
    "ms_1_t18",
    "ms_1_t18",
    "t26_1931",
    "t26_1933",
    "t26_1938",
    "bt_2",
    "bt_2",
    "bt_5",
    "bt_5",
    "bt_7",
    "bt_7",
    "t37a",
    "t37a",
    "t38",
    "t38",
    "t40",
    "t40",
    "t24",
    "t46_1",
    "t46_1",
    "t34_76",
    "t34_76",
    "su76",
    "su76",
    "su_5_2",
    "amo_f15",
    "amo_f15",
    "ford_aa_ammo",
    "ford_aa_ammo",
    "ford_aa_ammo",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "bt_5",
    "bt_7",
    "t40",
    "t34_76",
    "su76",
    "amo_f15",
    "ford_aa_ammo",
    "gaz_55_ambulance",
  ],

  soviet_guards_mortar_regiment_default: [
    "t26_1933",
    "t26_1938",
    "bt_5",
    "bt_7",
    "t24",
    "t28",
    "t34_76",
    "t34_76",
    "kv1",
    "su76",
    "su76",
    "su76",
    "su_122",
    "su_122",
    "su_122",
    "su_5_2",
    "su_5_2",
    "su_5_2",
    "amo_f15",
    "amo_f15",
    "ford_aa_ammo",
    "ford_aa_ammo",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "t34_76",
    "kv1",
    "su76",
    "su_122",
    "su_5_2",
    "t28",
    "t46_1",
    "bt_7",
    "t40",
    "ford_aa_ammo",
    "gaz_55_ambulance",
    "su76",
    "su_122",
    "su_5_2",
    "t34_76",
    "kv1",
  ],

  soviet_auto_battalion_default: [
    "ms_1_t18",
    "t26_1931",
    "t26_1933",
    "t26_1938",
    "bt_2",
    "bt_5",
    "bt_7",
    "t37a",
    "t38",
    "t40",
    "t24",
    "t46_1",
    "t34_76",
    "t34_76",
    "kv1",
    "su76",
    "su_122",
    "su_5_2",
    "amo_f15",
    "amo_f15",
    "amo_f15",
    "amo_f15",
    "ford_aa_ammo",
    "ford_aa_ammo",
    "ford_aa_ammo",
    "ford_aa_ammo",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "bt_5",
    "bt_7",
    "t34_76",
    "su76",
    "t28",
    "kv1",
    "amo_f15",
    "ford_aa_ammo",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
  ],

  usa_old_ironsides_default: [
    "m1_combat_car",
    "m1_combat_car",
    "m2_light_tank",
    "m2_light_tank",
    "m3_stuart",
    "m3_stuart",
    "m3_stuart",
    "m5_stuart",
    "m5_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m2_medium_tank",
    "m3_lee",
    "m3_lee",
    "m4_sherman",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m3_lee",
    "m4_sherman",
    "m3_halftrack",
    "dodge_wc54",
    "m1_combat_car",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
  ],

  usa_armored_infantry_regiment_default: [
    "m1_combat_car",
    "m1_combat_car",
    "m2_light_tank",
    "m2_light_tank",
    "m2_light_tank",
    "m3_stuart",
    "m3_stuart",
    "m3_stuart",
    "m5_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m3_lee",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
    "dodge_wc54",
    "dodge_wc54",
    "m1_combat_car",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m3_lee",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
  ],

  usa_armored_artillery_battalion_default: [
    "m2_light_tank",
    "m2_light_tank",
    "m3_stuart",
    "m3_stuart",
    "m5_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m3_lee",
    "m3_lee",
    "m4_sherman",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m3_lee",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
    "m1_combat_car",
    "m1_combat_car",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
    "m3_lee",
  ],

  usa_maintenance_battalion_default: [
    "m1_combat_car",
    "m2_light_tank",
    "m2_light_tank",
    "m3_stuart",
    "m3_stuart",
    "m5_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m3_lee",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
    "dodge_wc54",
    "dodge_wc54",
    "m1_combat_car",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m2_medium_tank",
    "m3_lee",
    "m4_sherman",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
    "dodge_wc54",
    "m2_light_tank",
    "m3_stuart",
    "m5_stuart",
    "m4_sherman",
    "m4_sherman",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
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
    "lefh_18",
    "leig_18",
    "mercedes_g3a",
    "adler_type_10_n",
    "sanitaetskraftwagen",
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
    "leig_18",
    "adler_type_10_n",
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
    "fiat_508_junak",
    "ciagacz_c4p",
    "karetka_sanitarnaya",
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
    "armata_75mm",
    "fiat_508_junak",
    "karetka_sanitarnaya",
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
    "armata_75mm",
    "haubica_100mm",
    "karetka_sanitarnaya",
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
    "armata_75mm",
    "haubica_100mm",
    "karetka_sanitarnaya",
  ],
};

const TRAINING_DECK_IDS = new Set([
  "training_unit_default",
  "trainingslager_default",
  "training_camp_default",
]);

function isStandardDefaultDeck(deckId: string): boolean {
  return deckId.endsWith("_default") && !TRAINING_DECK_IDS.has(deckId);
}

function limitCardCopies(cardIds: string[], copyLimit = STOCK_DECK_COPY_LIMIT): string[] {
  const copies = new Map<string, number>();
  const result: string[] = [];

  for (const cardId of cardIds) {
    const nextCopies = (copies.get(cardId) ?? 0) + 1;
    if (nextCopies > copyLimit) continue;

    copies.set(cardId, nextCopies);
    result.push(cardId);
  }

  return result;
}

function expandDeckCardIds(
  cardIds: string[],
  count: number,
  copyLimit = STOCK_DECK_COPY_LIMIT
): string[] {
  if (cardIds.length === 0) return [];

  const copies = new Map<string, number>();
  const result: string[] = [];

  while (result.length < count) {
    let addedThisPass = false;

    for (const cardId of cardIds) {
      const nextCopies = (copies.get(cardId) ?? 0) + 1;
      if (nextCopies > copyLimit) continue;

      copies.set(cardId, nextCopies);
      result.push(cardId);
      addedThisPass = true;

      if (result.length >= count) break;
    }

    if (!addedThisPass) break;
  }

  return result;
}

function normalizeDeckCardIds(cardIds: string[], deckLabel: string): string[] {
  const normalizedCardIds: string[] = [];
  const missingCardIds = new Set<string>();

  for (const cardId of cardIds) {
    const normalizedCardId = normalizeCardId(cardId);

    if (!normalizedCardId) {
      missingCardIds.add(cardId);
      continue;
    }

    normalizedCardIds.push(normalizedCardId);
  }

  if (missingCardIds.size > 0) {
    console.warn(
      `[deck:${deckLabel}] ignored missing cards: ${Array.from(missingCardIds).join(", ")}`
    );
  }

  return normalizedCardIds;
}

export function getDeckCardIds(deckId: string): string[] {
  const cardIds = DECK_CARD_IDS[deckId] ?? [];
  const normalizedCardIds = normalizeDeckCardIds(cardIds, deckId);

  if (TRAINING_DECK_IDS.has(deckId)) {
    return limitCardCopies(normalizedCardIds).slice(0, TRAINING_DECK_CARD_LIMIT);
  }

  if (isStandardDefaultDeck(deckId)) {
    return expandDeckCardIds(normalizedCardIds, DEFAULT_DECK_CARD_LIMIT);
  }

  return limitCardCopies(normalizedCardIds);
}

function createCardInstances(cardIds: string[], owner: PlayerId): CardInstance[] {
  return normalizeDeckCardIds(cardIds, `${owner}_custom`)
    .map((cardId, index) => ({
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

/**
 * Picks the card list a player will battle with, guarding against custom decks
 * that are too small to be playable. Invalid custom decks fall back to the
 * headquarters default deck so a battle never starts in a degraded state.
 */
function resolveDeckCardIds(
  owner: PlayerId,
  resolvedDeckId: string,
  customDeckCardIds?: string[]
): string[] {
  if (!customDeckCardIds) {
    return getDeckCardIds(resolvedDeckId);
  }

  const validCustomCardIds = normalizeDeckCardIds(
    customDeckCardIds,
    `${owner}_custom`
  );

  if (validCustomCardIds.length >= MIN_PLAYABLE_DECK_CARD_COUNT) {
    return validCustomCardIds;
  }

  console.warn(
    `[deck:${owner}_custom] custom deck has only ${validCustomCardIds.length} valid cards ` +
      `(min ${MIN_PLAYABLE_DECK_CARD_COUNT}); falling back to default deck "${resolvedDeckId}".`
  );

  return getDeckCardIds(resolvedDeckId);
}

function createPlayerState(
  owner: PlayerId,
  headquartersId: HeadquartersId,
  deckId?: string,
  customDeckCardIds?: string[],
  shuffleDecks = true
): PlayerState {
  const headquarters = getHeadquartersDefinition(headquartersId);
  const resolvedDeckId = deckId ?? headquarters.defaultDeckId;
  // Scripted battles (shuffleDecks === false) use their deck list verbatim:
  // they are authored by the game, not loaded from player storage.
  const deckCardIds =
    !shuffleDecks && customDeckCardIds
      ? normalizeDeckCardIds(customDeckCardIds, `${owner}_scripted`)
      : resolveDeckCardIds(owner, resolvedDeckId, customDeckCardIds);
  const cardInstances = createCardInstances(deckCardIds, owner);
  const deck = shuffleDecks ? shuffleCards(cardInstances) : cardInstances;

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

    player: createPlayerState(
      "player",
      playerHeadquartersId,
      options.playerDeckId,
      options.playerDeckCardIds,
      options.shuffleDecks ?? true
    ),
    bot: createPlayerState(
      "bot",
      botHeadquartersId,
      options.botDeckId,
      options.botDeckCardIds,
      options.shuffleDecks ?? true
    ),

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
        support: 0,
      },
      destroyedByBot: {
        light: 0,
        medium: 0,
        heavy: 0,
        td: 0,
        spg: 0,
        support: 0,
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
