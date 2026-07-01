import { getCardOrNull, normalizeCardId } from "./cards";
import {
  DEFAULT_BOT_HEADQUARTERS_ID,
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  getHeadquartersDefinition,
} from "./headquarters";
import { BOT_HQ_POSITION, PLAYER_HQ_POSITION } from "./engine";
import { DEFAULT_BATTLE_BACKGROUND_ID } from "./battleBackgrounds";
import type { BattleBackgroundId } from "./battleBackgrounds";
import type {
  BattleState,
  BoardUnit,
  CardInstance,
  HeadquartersId,
  HeadquartersState,
  PlayerId,
  PlayerState,
  PlayerTimerState,
  Position,
  SupportSlot,
  UnitZone,
} from "./types";

/**
 * A unit placed on the board before the battle begins (scripted missions like
 * the welcome trailer, where the enemy is already advancing). Unlike spawned
 * units it is battle-ready: it can move and attack on its owner's first turn.
 */
export type PreplacedUnit = {
  cardId: string;
  /** Required for battlefield units. Ignored for support units (they sit on the HQ cell). */
  position?: Position;
  zone?: UnitZone;
  supportSlot?: SupportSlot;
  /** Starting HP (e.g. a battle-worn vehicle). Defaults to the card's full HP, clamped to it. */
  hp?: number;
};

export const STEP_TIME_MS = 60 * 1000;
const TRAINING_DECK_CARD_LIMIT = 40;
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
  /** Units already on the board at battle start (scripted/trailer missions). */
  playerBoardUnits?: PreplacedUnit[];
  botBoardUnits?: PreplacedUnit[];
  /** Scripted opening-hand size: both players draw exactly this many cards. */
  startingHandSize?: number;
};

const DECK_CARD_IDS: Record<string, string[]> = {
  // Учебная часть (СССР) — базовые юниты, которыми каждый игрок владеет с
  // самого начала (всё остальное открывается в дереве развития). Эти 11 машин
  // намеренно держатся вне дерева исследований — аналог немецкого стартового
  // набора.
  training_unit_default: [
    "ms_1_t18",
    "ms_1_t18",
    "t26_1931",
    "t26_1931",
    "bt_2",
    "bt_2",
    "t37a",
    "t37a",
    "t24",
    "t24",
    "t-12",
    "t-12",
    "t27",
    "t27",
    "d8",
    "d8",
    "su18",
    "su18",
    "gun_53k",
    "gun_53k",
    "amo_f15",
    "ford_aa_ammo",
  ],

  // Trainingslager (Германия) — стартовый набор: базовые юниты, которыми
  // владеет каждый игрок с самого начала (всё остальное открывается в дереве
  // развития). Сильная атака штаба (2), leIG 18 усиливает огонь штаба.
  trainingslager_default: [
    "leichttraktor",
    "leichttraktor",
    "grosstraktor",
    "pzkpfw_i_ausf_a",
    "pzkpfw_i_ausf_a",
    "pzkpfw_i_ausf_b",
    "pzkpfw_i_ausf_b",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_iii_ausf_a",
    "pzkpfw_iii_ausf_a",
    "panzer_35t",
    "panzer_35t",
    "stug_iii_b",
    "stug_iii_b",
    "kfz_13",
    "kfz_13",
    "adgz",
    "adgz",
    "leig_18",
    "leig_18",
    "pak36",
    "mercedes_g3a",
    "krad_bmw",
    "adler_type_10_n",
    "adler_type_10_n",
  ],

  // Training Camp (США) — стартовый набор: базовые юниты, которыми владеет
  // каждый игрок с самого начала (всё остальное открывается в дереве развития).
  // Слабый штаб, но мощное снабжение (4 топлива).
  training_camp_default: [
    // Лёгкие танки и бронеавтомобили — мобильное ядро (16)
    "m2_light_tank",
    "m2_light_tank",
    "m1_combat_car",
    "m1_combat_car",
    "m1_combat_car",
    "m1_combat_car",
    "m1_armored_car",
    "m1_armored_car",
    "m2_scout_car",
    "m2_scout_car",
    "m2a4",
    "m2a4",
    "m2a4",
    "m2a4",
    "marmon_ctls",
    "marmon_ctls",
    // Средние танки — ударная линия (8)
    "m2a1_medium",
    "m2a1_medium",
    "m2a1_medium",
    "m2a1_medium",
    "m2_medium_tank",
    "m2_medium_tank",
    "m2_medium_tank",
    "m2_medium_tank",
    // ПТ-САУ (4)
    "m6_gmc_fargo",
    "m6_gmc_fargo",
    "m6_gmc_fargo",
    "m6_gmc_fargo",
    // Поддержка и снабжение (12)
    "gun_37mm_m3",
    "gun_37mm_m3",
    "gun_37mm_m3",
    "gun_37mm_m3",
    "gun_75_pack",
    "gun_75_pack",
    "gun_75_pack",
    "m3_halftrack",
    "m3_halftrack",
    "m3_halftrack",
    "m5_hst",
    "dodge_wc54",
  ],

  // 1. Panzer-Division — «Танковый клин»: первый танк за ход получает Блиц.
  // Агрессивная танковая колода: ударные средние танки и тяжёлые (Tiger,
  // Nb.Fz., Großtraktor), которым Блиц позволяет сразу бить с хода.
  first_panzer_division_default: [
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_35t",
    "panzer_35t",
    "panzer_35t",
    "panzer_35t",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "tiger_i",
    "tiger_i",
    "neubaufahrzeug",
    "grosstraktor",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "marder_iii",
    "marder_iii",
    "panzerjaeger_38t_early",
    "wespe",
    "wespe",
    "mercedes_g3a",
    "mercedes_g3a",
    "leig_18",
    "leig_18",
    "adler_type_10_n",
    "sanitaetskraftwagen",
  ],

  // 29. Inf. mot. — «Моторизованный марш»: первый юнит каждого хода на 1
  // топливо дешевле. Дешёвая мобильная техника (movement 2–3, Блиц) и
  // транспорт-снабженцы выжимают максимум из скидки.
  german_motorized_division_default: [
    "panzer_35t",
    "panzer_35t",
    "sdkfz_231",
    "sdkfz_231",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "sdkfz_221",
    "sdkfz_221",
    "panzer_38t",
    "panzer_38t",
    "pzbef_i",
    "pzbef_i",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "panzer_iv",
    "panzer_iv",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "stug_iii",
    "stug_iii",
    "marder_iii",
    "wespe",
    "mercedes_g3a",
    "mercedes_g3a",
    "krupp_l3h163",
    "krupp_l3h163",
    "adler_type_10_n",
    "horch_830r",
  ],

  // 45. InfDiv — «Артиллерийская подготовка»: атака штаба наносит +1 урон.
  // Колода вокруг огня штаба: leFH 18/leIG (+атака штаба), Horch (бонус и
  // перехват урона), дальнобойные САУ и крепкие Panzer III для обороны.
  german_artillery_division_default: [
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iv_ausf_b",
    "panzer_iv",
    "panzer_iv",
    "porsche_823",
    "porsche_823",
    "panzer_35t",
    "panzer_35t",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "marder_iii",
    "marder_iii",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "wespe",
    "wespe",
    "wespe",
    "sig_33_pzi",
    "sig_33_pzi",
    "sig_33_pzii",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "leig_18",
    "leig_18",
    "leig_18",
    "horch_830r",
    "horch_830r",
  ],

  // XIX. AK — «Снабжение по графику»: каждый третий ход добор карты.
  // Колода на преимущество в картах и затяжной бой: дорогие тяжёлые танки,
  // крепкие Panzer III, ремонт (Sanität) и снабженцы (pzbef, Krupp).
  german_rear_corps_default: [
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_d",
    "pzkpfw_iii_ausf_a",
    "pzkpfw_iii_ausf_a",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "panzer_iv",
    "panzer_iv",
    "tiger_i",
    "tiger_i",
    "grosstraktor",
    "neubaufahrzeug",
    "porsche_823",
    "porsche_823",
    "kfz_13",
    "kfz_13",
    "adgz",
    "adgz",
    "pzbef_i",
    "pzbef_i",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "marder_iii",
    "marder_iii",
    "wespe",
    "wespe",
    "sig_33_pzii",
    "sanitaetskraftwagen",
    "sanitaetskraftwagen",
    "mercedes_g3a",
    "mercedes_g3a",
    "adler_type_10_n",
    "adler_type_10_n",
    "krupp_l3h163",
    "krupp_l3h163",
  ],

  // 4-я танковая — «Танковая засада»: танк, не двигавшийся в этом ходу,
  // получает +1 к атаке. Колода удержания позиций: крепкие средние/тяжёлые
  // танки (КВ, Т-34, Т-28, Т-35, СМК, КВ-2) бьют из засады, не сходя с клетки.
  soviet_tank_brigade_default: [
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_1940",
    "t34_1940",
    "t24",
    "t24",
    "t24",
    "t28",
    "t28",
    "kv1",
    "kv1",
    "kv1",
    "kv1_1940",
    "kv1_1940",
    "t35",
    "t100",
    "smk",
    "kv2",
    "t111",
    "t26_1938",
    "t26_1938",
    "t26_1938",
    "t26_1933",
    "t26_1933",
    "su76",
    "su76",
    "at1",
    "at1",
    "su_122",
    "su_122",
    "su_5_2",
    "su_5_2",
    "gun_76_1927",
    "gun_76_1927",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "amo_f15",
    "amo_f15",
  ],

  // 1-я Московская — «Быстрая переброска»: лёгкие юниты входят с Блицем.
  // Колода роя лёгких танков: вся линейка БТ, Т-40/Т-46, БТ-СВ и А-20 сразу
  // давят с хода, разведчики добирают карты, снабженцы держат темп.
  soviet_motor_rifle_division_default: [
    "bt_2",
    "bt_2",
    "bt_2",
    "bt_5",
    "bt_5",
    "bt_5",
    "bt_5",
    "bt_7",
    "bt_7",
    "bt_7",
    "bt_7",
    "t40",
    "t40",
    "t40",
    "t46_1",
    "t46_1",
    "t46_1",
    "t26_1938",
    "t26_1938",
    "t26_1938",
    "t26_1933",
    "t26_1933",
    "bt_7m",
    "bt_7m",
    "bt_sv",
    "a20",
    "t37a",
    "t38",
    "t27",
    "t27",
    "t-12",
    "t29",
    "t34_76",
    "su76",
    "su76",
    "amo_f15",
    "ford_aa_ammo",
    "d8",
    "fai",
    "gun_76_1927",
  ],

  // 13-й миномётный — «Залп Катюш»: атака штаба по уже повреждённой технике
  // наносит +1 урон. Колода продавливания дистанцией: дальнобойные САУ и
  // ПТ-САУ сначала ранят цель, затем штаб (с гаубицами в линии) добивает.
  soviet_guards_mortar_regiment_default: [
    "su_122",
    "su_122",
    "su_122",
    "su_122",
    "su_5_2",
    "su_5_2",
    "su_5_2",
    "su14",
    "su76",
    "su76",
    "su76",
    "at1",
    "at1",
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_1940",
    "t34_1940",
    "t28",
    "t28",
    "kv1",
    "kv1",
    "t24",
    "t24",
    "t26_1938",
    "t26_1938",
    "t26_1933",
    "t26_1933",
    "bt_7",
    "bt_7",
    "bt_5",
    "gun_m30",
    "gun_m30",
    "gun_76_1927",
    "gun_76_1927",
    "gun_76_1927",
    "gun_53k",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
  ],

  // 389-й автобат — «Ремонтные колонны»: в начале хода лечит случайный
  // повреждённый юнит. Колода затяжной обороны: живучие средние/тяжёлые
  // танки, которые ремонт возвращает в строй, и плотная линия снабжения.
  soviet_auto_battalion_default: [
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_1940",
    "t34_1940",
    "kv1",
    "kv1",
    "kv1",
    "kv1_1940",
    "kv1_1940",
    "t28",
    "t28",
    "t28",
    "t24",
    "t24",
    "t111",
    "t111",
    "t35",
    "t100",
    "t26_1938",
    "fai",
    "fai",
    "ba_20_ac",
    "ba_20_ac",
    "bt_7",
    "bt_7",
    "su76",
    "su76",
    "su_122",
    "su_122",
    "at1",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "repair_letuchka",
    "repair_letuchka",
    "ford_aa_ammo",
    "ford_aa_ammo",
    "amo_f15",
    "amo_f15",
    "gaz_m1",
  ],

  // Old Ironsides — «Combined Arms»: пока на поле есть и танк, и юнит
  // поддержки, штаб даёт +1 топлива. Сбалансированная колода: надёжный костяк
  // средних танков плюс постоянная линия поддержки удерживает бонус активным.
  usa_old_ironsides_default: [
    "m4_sherman",
    "m4_sherman",
    "m4_sherman",
    "m4_sherman",
    "sherman_early",
    "sherman_early",
    "sherman_early",
    "m2_medium_tank",
    "m2_medium_tank",
    "m2a1_medium",
    "m2a1_medium",
    "m3_lee",
    "m3_lee",
    "m3_stuart",
    "m3_stuart",
    "m3_stuart",
    "m5_stuart",
    "m5_stuart",
    "m2_light_tank",
    "m2_light_tank",
    "m2_light_tank",
    "m2a4",
    "m2a4",
    "christie_t3",
    "t14_assault",
    "m6_heavy",
    "m3_gmc",
    "m3_gmc",
    "m6_gmc_fargo",
    "t18_hmc",
    "t18_hmc",
    "t19_hmc",
    "m3_halftrack",
    "m3_halftrack",
    "gun_75_pack",
    "gun_75_pack",
    "dodge_wc54",
    "dodge_wc54",
    "gun_105_m2a1",
    "willys_mb",
  ],

  // 6th Arm. Inf. — «Бронедесант»: первый лёгкий юнит за ход укрепляет штаб
  // на +1 прочности. Колода роя лёгкой техники (штаб даёт 6 топлива): дешёвые
  // танки и разведчики каждый ход штампуют защиту и давят числом.
  usa_armored_infantry_regiment_default: [
    "m2_light_tank",
    "m2_light_tank",
    "m2_light_tank",
    "m2_light_tank",
    "m3_stuart",
    "m3_stuart",
    "m3_stuart",
    "m3_stuart",
    "m5_stuart",
    "m5_stuart",
    "m5_stuart",
    "m1_combat_car",
    "m1_combat_car",
    "m1_combat_car",
    "marmon_ctls",
    "m2_scout_car",
    "m2_scout_car",
    "m2a4",
    "m2a4",
    "m2a4",
    "ford_gpa",
    "ford_gpa",
    "t13_armored_car",
    "t13_armored_car",
    "lvt1",
    "lvt1",
    "m4_sherman",
    "m4_sherman",
    "m2a1_medium",
    "m2a1_medium",
    "m3_gmc",
    "m3_gmc",
    "m6_gmc_fargo",
    "m3_halftrack",
    "m3_halftrack",
    "willys_mb",
    "willys_mb",
    "dodge_wc54",
    "dodge_wc54",
    "gun_75_pack",
  ],

  // 27th Arm. Art. — «Time on Target»: атаку штаба нельзя перехватить.
  // Колода вокруг неотразимого огня штаба: гаубицы (+атака штаба) и
  // дальнобойные HMC простреливают тыл, ПТ-САУ добивают бронетехнику.
  usa_armored_artillery_battalion_default: [
    "t18_hmc",
    "t18_hmc",
    "t18_hmc",
    "t19_hmc",
    "t19_hmc",
    "t19_hmc",
    "m4_sherman",
    "m4_sherman",
    "m4_sherman",
    "m4_sherman",
    "sherman_early",
    "sherman_early",
    "m2_medium_tank",
    "m2_medium_tank",
    "m2a1_medium",
    "m2a1_medium",
    "m3_lee",
    "m3_stuart",
    "m3_stuart",
    "m3_stuart",
    "m2_light_tank",
    "m2_light_tank",
    "m2a4",
    "m2a4",
    "m3_gmc",
    "m3_gmc",
    "m3_gmc",
    "m6_gmc_fargo",
    "m6_gmc_fargo",
    "t14_assault",
    "gun_105_m2a1",
    "gun_105_m2a1",
    "gun_105_m2a1",
    "gun_75_pack",
    "gun_75_pack",
    "gun_75_pack",
    "m3_halftrack",
    "m3_halftrack",
    "dodge_wc54",
    "dodge_wc54",
  ],

  // 123rd Maintenance — «Эвакуация и ремонт»: первый уничтоженный за бой свой
  // юнит возвращается в руку. Колода ценных машин: дорогие тяжёлые/средние
  // танки не страшно разменивать, а медики и снабжение тянут долгий бой.
  usa_maintenance_battalion_default: [
    "m4_sherman",
    "m4_sherman",
    "m4_sherman",
    "sherman_early",
    "sherman_early",
    "sherman_early",
    "m3_lee",
    "m3_lee",
    "m2_medium_tank",
    "m2_medium_tank",
    "m2a1_medium",
    "m2a1_medium",
    "m6_heavy",
    "m6_heavy",
    "t14_assault",
    "t14_assault",
    "m3_stuart",
    "m3_scout_car",
    "m3_scout_car",
    "m5_stuart",
    "m5_stuart",
    "m1_armored_car",
    "m1_armored_car",
    "m2a4",
    "m2a4",
    "lvt1",
    "lvt1",
    "m3_gmc",
    "m3_gmc",
    "t18_hmc",
    "t18_hmc",
    "t19_hmc",
    "dodge_wc54",
    "dodge_wc54",
    "dodge_wc54",
    "m3_halftrack",
    "m3_halftrack",
    "gun_75_pack",
    "gun_37mm_m3",
    "willys_mb",
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
    "kfz_13",
    "kfz_13",
    "adgz",
    "adgz",
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
    "sdkfz_221",
    "sdkfz_221",
    "kfz_13",
    "kfz_13",
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
    "sig_33_pzi",
    "sdkfz_231",
    "sdkfz_231",
    "sdkfz_221",
    "sdkfz_221",
    "mercedes_g3a",
    "krad_bmw",
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
    "sig_33_pzi",
    "mercedes_g3a",
    "mercedes_g3a",
    "adler_type_10_n",
    "krad_bmw",
    "sdkfz_231",
    "sdkfz_231",
    "sdkfz_263",
    "sdkfz_263",
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
    "wz28",
    "wz28",
    "wz34",
    "wz34",
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
    "wz34",
    "wz34_ii",
    "wz34_ii",
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
    "wz34_ii",
    "wz29_ursus",
    "wz29_ursus",
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
    "wz29_ursus",
    "wz29_ursus",
    "wz29_dow",
    "wz29_dow",
    "armata_75mm",
    "haubica_100mm",
    "karetka_sanitarnaya",
  ],

  // ============================================================
  // Кампания «Лавриненко» — колоды игрока
  // ============================================================

  // Миссии 1–4 (4-я танковая бригада): средние Т-34 и КВ держат засаду,
  // лёгкие БТ/Т-60 разведуют, дальние СУ и ПТ ранят, снабженцы держат темп.
  lavrinenko_brigade_campaign: [
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_stz",
    "t34_stz",
    "t34_stz",
    "t34_1940",
    "t34_1940",
    "kv1",
    "kv1",
    "kv1_1940",
    "t28",
    "t28",
    "bt_7",
    "bt_7",
    "bt_7",
    "bt_7_command",
    "bt_7_command",
    "t60",
    "t60",
    "t26_1938",
    "t26_1938",
    "zis_30",
    "zis_30",
    "at1",
    "at1",
    "gun_76_1927",
    "gun_76_1927",
    "ba_20_ac",
    "ba_20_ac",
    "ba_10_ac",
    "ba_10_ac",
    "zis_5_ammo",
    "zis_5_ammo",
    "gaz_55_ambulance",
    "amo_f15",
    "amo_f15",
  ],

  // Миссия 6 «Одинокий Т-34»: мало машин, но каждая бьёт насмерть. Личный
  // танк аса уже стоит на спавне (см. playerBoardUnits миссии); колода урезана
  // до 15 — только тяжёлые засадные Т-34/41 и КВ, ПТ-САУ, дальняя поддержка и
  // ремонт. Короткая дуэль: на руки приходит стандартное число карт.
  lavrinenko_ace_campaign: [
    "t34_1941",
    "t34_1941",
    "t34_1941",
    "t34_76",
    "t34_76",
    "kv1",
    "kv1_1940",
    "zis_30",
    "zis_30",
    "su_5_2",
    "at1",
    "gun_m30",
    "parm_workshop",
    "zis_5_ammo",
    "gaz_55_ambulance",
  ],

  // Миссии 8–10 (1-я гвардейская): сильнейшие Т-34/41 и КВ, ПТ-САУ ЗИС-30,
  // ремонт и снабжение. Личный танк аса игрок получает только в награду.
  lavrinenko_guards_campaign: [
    "t34_1941",
    "t34_1941",
    "t34_1941",
    "t34_1941",
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_stz",
    "t34_stz",
    "kv1_1940",
    "kv1_1940",
    "kv1_1940",
    "kv1",
    "kv1",
    "kv2",
    "t28",
    "t28",
    "bt_7_command",
    "bt_7_command",
    "t60",
    "t60",
    "zis_30",
    "zis_30",
    "zis_30",
    "t26_1938",
    "t26_1938",
    "at1",
    "at1",
    "gun_m30",
    "gun_m30",
    "parm_workshop",
    "parm_workshop",
    "ba_10_ac",
    "ba_10_ac",
    "ba_11_ac",
    "ba_11_ac",
    "zis_5_ammo",
    "zis_5_ammo",
    "m72_recon",
  ],

  // Миссия 7 (316-я сд Панфилова): оборона рубежа — заслоны ПТО, дивизионки,
  // мало танков, упор на стойкость и ремонт.
  panfilov_division_campaign: [
    "at1",
    "at1",
    "at1",
    "at1",
    "t26_1938",
    "t26_1938",
    "t26_1938",
    "gun_53k",
    "gun_53k",
    "gun_53k",
    "gun_76_1927",
    "gun_76_1927",
    "gun_m30",
    "gun_m30",
    "zis_30",
    "zis_30",
    "su_5_2",
    "su_5_2",
    "t60",
    "t60",
    "t60",
    "t26_1938",
    "t26_1938",
    "t26_1938",
    "t34_76",
    "t34_76",
    "kv1",
    "kv1",
    "parm_workshop",
    "parm_workshop",
    "gaz_55_ambulance",
    "gaz_55_ambulance",
    "zis_5_ammo",
    "zis_5_ammo",
  ],

  // Базовая колода 1-й гвардейской для свободной игры (расширяется до 40).
  first_guards_tank_brigade_default: [
    "t34_1941",
    "t34_76",
    "t34_stz",
    "t34_1940",
    "kv1",
    "kv1_1940",
    "kv2",
    "t28",
    "bt_7",
    "bt_7_command",
    "t60",
    "zis_30",
    "t26_1938",
    "su_5_2",
    "at1",
    "gun_m30",
    "gun_76_1927",
    "parm_workshop",
    "zis_5_ammo",
    "m72_recon",
  ],

  // Базовая колода 4-й танковой бригады для свободной игры (после кампании).
  lavrinenko_tank_brigade_default: [
    "t34_76",
    "t34_stz",
    "t34_1940",
    "t34_1941",
    "kv1",
    "kv1_1940",
    "t28",
    "t24",
    "bt_7",
    "bt_7_command",
    "t60",
    "t26_1938",
    "zis_30",
    "su_5_2",
    "at1",
    "gun_76_1927",
    "gun_m30",
    "parm_workshop",
    "zis_5_ammo",
    "gaz_55_ambulance",
    "amo_f15",
    "m72_recon",
  ],

  // ============================================================
  // Кампания «Лавриненко» — колоды противника
  // ============================================================

  // Миссия 1: разведбат — лёгкие Pz II, пара Pz III, мотодозоры.
  german_4_panzer_campaign: [
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "panzer_35t",
    "panzer_35t",
    "panzer_35t",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "leig_18",
    "leig_18",
    "krad_bmw",
    "krad_bmw",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_221",
    "sdkfz_221",
    "sdkfz_231",
    "sdkfz_231",
    "mercedes_g3a",
  ],

  // Миссия 2: масса средних Pz III/IV под Мценском.
  german_panzer_mtsensk_campaign: [
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "pak38",
    "pak38",
    "stug_iii_b",
    "stug_iii_b",
    "pak36",
    "pak36",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_222",
    "sdkfz_222",
    "leig_18",
    "leig_18",
    "sanitaetskraftwagen",
  ],

  // Миссия 3: танковый корпус Гудериана — танки, StuG, ПТО, глубокое снабжение.
  guderian_corps_campaign: [
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iv_ausf_b",
    "panzer_38t",
    "panzer_38t",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pak38",
    "pak38",
    "pak36",
    "pak36",
    "sdkfz_251",
    "sdkfz_251",
    "lefh_18",
    "lefh_18",
    "sdkfz_231",
    "sdkfz_231",
    "sanitaetskraftwagen",
  ],

  // Миссия 4: моторизованный авангард — быстрый и лёгкий разведдозор.
  german_aufklarung_campaign: [
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_d",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_c",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "leichttraktor",
    "leichttraktor",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "krad_bmw",
    "krad_bmw",
    "krad_bmw",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_222",
    "sdkfz_222",
    "sdkfz_221",
    "sdkfz_221",
    "adler_type_10_n",
    "adler_type_10_n",
    "mercedes_g3a",
  ],

  // Миссия 5: 10-я тд штурмует деревню — танки и пехотные пушки/гаубицы.
  german_10_panzer_campaign: [
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iii_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "panzer_38t",
    "panzer_38t",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "sig_33_pzi",
    "sig_33_pzi",
    "leig_18",
    "leig_18",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "pak36",
    "pak36",
    "pak36",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_222",
    "sdkfz_222",
  ],

  // Миссия 6: «Призрачная» дивизия на марше — короткая колонна (15 карт)
  // быстрых лёгких машин с парой средних танков и ПТ-самоходок.
  german_11_panzer_campaign: [
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_iv_ausf_e",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "krad_bmw",
    "krad_bmw",
    "sdkfz_251",
    "adler_type_10_n",
    "leig_18",
  ],

  // Миссия 7: штурм позиций Панфилова — тяжёлый сбалансированный натиск.
  german_moscow_assault_campaign: [
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iv_ausf_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "pak38",
    "pak38",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_231",
    "sdkfz_231",
    "sanitaetskraftwagen",
  ],

  // Миссия 8: элита «Großdeutschland» — высокий стат, связка танк+поддержка.
  grossdeutschland_campaign: [
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iv_ausf_b",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "pak38",
    "pak38",
    "pak38",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_251",
    "sdkfz_231",
    "sdkfz_231",
    "sdkfz_263",
    "sdkfz_263",
    "horch_830r",
    "sanitaetskraftwagen",
  ],

  // Миссия 9: 4-я тд, обескровленная зимой — слабее и малочисленнее.
  german_winter_campaign: [
    "panzer_38t",
    "panzer_38t",
    "panzer_38t",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_iii_ausf_h",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_ii_ausf_f",
    "pzkpfw_iv_ausf_a",
    "pzkpfw_iv_ausf_a",
    "stug_iii_b",
    "stug_iii_b",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "pak36",
    "pak36",
    "pak36",
    "leig_18",
    "leig_18",
    "sdkfz_221",
    "sdkfz_221",
    "sdkfz_251",
    "sdkfz_251",
    "sanitaetskraftwagen",
  ],

  // ============================================================
  // Миссия-трейлер «Поныри» (Курская дуга 1943, северный фас)
  // ============================================================

  // Колода игрока в трейлере: в основном Т-34 (волна средних танков на острие
  // контрудара), пара СУ-122 для дистанционного добивания и резервные
  // снабженцы/ремонт. СУ-152 в колоде НЕТ — её игрок получает в награду.
  //
  // Колода гид-миссии НЕ тасуется (createCampaignBattle → shuffleDecks:false),
  // поэтому порядок = стартовая рука. Первые карты подобраны так, чтобы рука
  // была разнообразной (Т-34/76 + СУ-122 + Т-34 1941 + БА-10), но обязательно
  // содержала Т-34/76 для скриптового шага розыгрыша `wk-play-t34`.
  welcome_kursk_player: [
    "t34_76", // стартовая рука: гарантированный Т-34/76 для шага розыгрыша
    "su_122", // + разнообразие: дальнобойная СУ-122
    "t34_1941", // + Т-34 обр. 1941
    "ba_10_ac", // + бронеавтомобиль БА-10
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_76",
    "t34_1941",
    "t34_1941",
    "t34_1941",
    "t34_1941",
    "t34_1940",
    "t34_1940",
    "t34_1940",
    "t34_stz",
    "t34_stz",
    "t34_stz",
    "su_122",
    "ba_10_ac",
    "gun_m30",
    "gaz_55_ambulance",
    "parm_workshop",
    "zis_5_ammo",
  ],

  // Колода противника в трейлере: средние танки 9-й армии — Panzer III F и
  // Panzer IV G, плюс лёгкая поддержка (колоды кампаний режутся до 4 копий
  // карты). Тигр и Фердинанд уже на поле (подбитые) и в колоду не добираются.
  // Разведбронеавтомобиль Sd.Kfz. 222 (без контрбатареи) вместо Sd.Kfz. 231:
  // в учебной демо-миссии противник не должен глушить артиллерию и штаб игрока.
  german_9th_army_campaign: [
    "pzkpfw_iii_ausf_f",
    "pzkpfw_iii_ausf_f",
    "pzkpfw_iii_ausf_f",
    "pzkpfw_iii_ausf_f",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "panzer_iv",
    "sdkfz_222",
    "sdkfz_222",
    "sdkfz_251",
    "sdkfz_251",
    "leig_18",
    "leig_18",
    "sanitaetskraftwagen",
  ],

  // База штаба Центрального фронта для свободной игры после открытия
  // (расширяется до 40). Танковый таран — упор на Т-34.
  soviet_central_front_default: [
    "t34_76",
    "t34_76",
    "t34_1941",
    "t34_1941",
    "t34_1940",
    "t34_stz",
    "kv1",
    "kv1_1940",
    "t28",
    "su_122",
    "su_122",
    "su_5_2",
    "at1",
    "gun_m30",
    "gun_76_1927",
    "t26_1938",
    "ba_10_ac",
    "ba_20_ac",
    "gaz_55_ambulance",
    "parm_workshop",
    "zis_5_ammo",
    "amo_f15",
  ],

  // Миссия 10: зимний заслон у Горюнов — плотная ПТО (StuG, Pak, Marder).
  winter_blocking_force_campaign: [
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii_b",
    "stug_iii",
    "stug_iii",
    "stug_iii",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "panzerjaeger_i",
    "pak38",
    "pak38",
    "pak38",
    "pak38",
    "pak36",
    "pak36",
    "pak36",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iii_ausf_j",
    "pzkpfw_iv_ausf_e",
    "pzkpfw_iv_ausf_e",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "lefh_18",
    "sanitaetskraftwagen",
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
    return expandDeckCardIds(normalizedCardIds, TRAINING_DECK_CARD_LIMIT);
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
    position: isPlayer ? PLAYER_HQ_POSITION : BOT_HQ_POSITION,

    hp: headquarters.hp,
    attack: headquarters.attack,
    range: headquarters.range,
    fuelGeneration: headquarters.fuelGeneration,

    alreadyAttacked: false,
  };
}

function createPreplacedUnits(
  owner: PlayerId,
  preplaced: PreplacedUnit[] | undefined,
  hqPosition: Position
): BoardUnit[] {
  if (!preplaced || preplaced.length === 0) return [];

  const units: BoardUnit[] = [];

  preplaced.forEach((entry, index) => {
    const resolvedCardId = normalizeCardId(entry.cardId);
    const card = resolvedCardId ? getCardOrNull(resolvedCardId) : null;

    if (!resolvedCardId || !card) {
      console.warn(
        `[preplaced:${owner}] ignored missing card: ${entry.cardId}`
      );
      return;
    }

    const zone: UnitZone = entry.zone ?? "battlefield";
    // Support units always sit on the HQ cell (mirrors playSupportCard);
    // battlefield units need an explicit board position.
    const position = zone === "support" ? hqPosition : entry.position;

    if (!position) {
      console.warn(
        `[preplaced:${owner}] battlefield unit ${resolvedCardId} has no position; skipped.`
      );
      return;
    }

    // A battle-worn vehicle can start damaged (clamped to its full HP).
    const currentHp =
      entry.hp != null ? Math.max(1, Math.min(entry.hp, card.hp)) : card.hp;

    units.push({
      instanceId: `${owner}_preplaced_${resolvedCardId}_${index}`,
      cardId: resolvedCardId,
      ownerId: owner,
      position,
      zone,
      supportSlot: entry.supportSlot,
      currentHp,
      alreadyMoved: false,
      alreadyAttacked: false,
      // Already in the field: battle-ready, not a fresh spawn.
      spawnedThisTurn: false,
      moveCountThisTurn: 0,
      tdAmbushUsedThisTurn: false,
    });
  });

  return units;
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

    units: [
      ...createPreplacedUnits("player", options.playerBoardUnits, {
        row: 2,
        col: 0,
      }),
      ...createPreplacedUnits("bot", options.botBoardUnits, { row: 0, col: 4 }),
    ],

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
        armored_car: 0,
        support: 0,
      },
      destroyedByBot: {
        light: 0,
        medium: 0,
        heavy: 0,
        td: 0,
        spg: 0,
        armored_car: 0,
        support: 0,
      },
      actionsByPlayer: 0,
      actionsByBot: 0,
    },

    startingHandSize: options.startingHandSize,

    log: ["Бой готовится. Определяется первый ход."],
  };

  state.player.maxResources = state.headquarters.player.fuelGeneration;
  state.player.resources = state.player.maxResources;

  state.bot.maxResources = state.headquarters.bot.fuelGeneration;
  state.bot.resources = state.bot.maxResources;

  return state;
}

export const initialBattleState = createInitialBattleState();
