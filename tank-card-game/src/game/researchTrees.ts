import type { HeadquartersId, Nation } from "./types";
import { getHeadquartersDefinition } from "./headquarters";

export type ResearchNation = Extract<Nation, "germany" | "ussr" | "usa">;

export type ResearchBranchId = "tank" | "motorized" | "artillery" | "rear";

export type ResearchNodeStatus =
  | "unlocked"
  | "researchable"
  | "locked"
  | "planned";

export type ResearchNode = {
  id: string;
  type: "unit" | "headquarters";
  title: string;
  subtitle?: string;
  cardId?: string;
  headquartersId?: HeadquartersId;
  experienceCost?: number;
  purchaseCost?: number;
  status: ResearchNodeStatus;
  /**
   * Prerequisite node ids forming a directed acyclic graph. A node becomes
   * researchable only once every prerequisite is acquired. When omitted the
   * branch falls back to linear "previous node" gating (used by the linear
   * trees). Enables forks (one node feeding several) and merges (one node
   * requiring several).
   */
  requires?: string[];
  /** Row within the branch graph (0-based, top to bottom). */
  tier?: number;
  /** Column within a tier (0 = left, 1 = right). Single-node tiers are centered. */
  slot?: number;
};

export type ResearchBranch = {
  id: ResearchBranchId;
  title: string;
  shortTitle: string;
  description: string;
  nodes: ResearchNode[];
};

export type NationResearchTree = {
  nation: ResearchNation;
  title: string;
  subtitle: string;
  starterHeadquarters: ResearchNode;
  branches: ResearchBranch[];
};

const plannedUnit = (
  id: string,
  title: string,
  subtitle: string
): ResearchNode => ({
  id,
  type: "unit",
  title,
  subtitle,
  status: "planned",
});

const headquartersNode = ({
  id,
  headquartersId,
  status,
  experienceCost,
  purchaseCost,
  requires,
  tier,
  slot,
}: {
  id: string;
  headquartersId: HeadquartersId;
  status: ResearchNodeStatus;
  experienceCost?: number;
  purchaseCost?: number;
  requires?: string[];
  tier?: number;
  slot?: number;
}): ResearchNode => {
  const headquarters = getHeadquartersDefinition(headquartersId);

  return {
    id,
    type: "headquarters",
    title: headquarters.title,
    subtitle: headquarters.type,
    headquartersId,
    experienceCost,
    purchaseCost,
    status,
    requires,
    tier,
    slot,
  };
};

const unitNode = ({
  id,
  title,
  cardId,
  experienceCost,
  purchaseCost,
  requires,
  tier,
  slot,
}: {
  id: string;
  title: string;
  cardId: string;
  experienceCost: number;
  purchaseCost: number;
  requires?: string[];
  tier: number;
  slot: number;
}): ResearchNode => ({
  id,
  type: "unit",
  title,
  cardId,
  experienceCost,
  purchaseCost,
  requires,
  tier,
  slot,
  // Graph gating is driven by `requires`; the static status only seeds the
  // linear fallback, so entry units (no prerequisites) are researchable.
  status: requires && requires.length > 0 ? "locked" : "researchable",
});

export const RESEARCH_TREES: Record<ResearchNation, NationResearchTree> = {
  germany: {
    nation: "germany",
    title: "Германия",
    subtitle: "Бронетанковые войска Вермахта",
    starterHeadquarters: headquartersNode({
      id: "germany-training-camp",
      headquartersId: "trainingslager",
      status: "unlocked",
    }),
    branches: [
      {
        id: "tank",
        title: "Танковые штабы",
        shortTitle: "Танковые",
        description:
          "Линейно изучи два уровня танков, затем исследуй и купи штаб — он открывает Pz III / Pz IV и Tiger I.",
        nodes: [
          // Линейный путь к штабу: два уровня юнитов от тренировочного лагеря.
          unitNode({
            id: "de-tank-pz3a",
            title: "Panzer III A",
            cardId: "pzkpfw_iii_ausf_a",
            experienceCost: 300,
            purchaseCost: 2100,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "de-tank-pz4a",
            title: "Panzer IV A",
            cardId: "pzkpfw_iv_ausf_a",
            experienceCost: 360,
            purchaseCost: 2600,
            requires: ["de-tank-pz3a"],
            tier: 1,
            slot: 0,
          }),
          // Штаб 4-го уровня. Его нужно исследовать И купить, чтобы открыть
          // последующие юниты ветки.
          headquartersNode({
            id: "de-tank-hq-first-panzer",
            headquartersId: "first_panzer_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-tank-pz4a"],
            tier: 2,
            slot: 0,
          }),
          // После покупки штаба ветка раскрывается двумя линиями.
          unitNode({
            id: "de-tank-pz3d",
            title: "Panzer III D",
            cardId: "pzkpfw_iii_ausf_d",
            experienceCost: 520,
            purchaseCost: 4100,
            requires: ["de-tank-hq-first-panzer"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "de-tank-pz4",
            title: "Panzer IV",
            cardId: "panzer_iv",
            experienceCost: 540,
            purchaseCost: 4300,
            requires: ["de-tank-hq-first-panzer"],
            tier: 3,
            slot: 1,
          }),
          unitNode({
            id: "de-tank-pz3e",
            title: "Panzer III E",
            cardId: "pzkpfw_iii_ausf_e",
            experienceCost: 640,
            purchaseCost: 5200,
            requires: ["de-tank-pz3d"],
            tier: 4,
            slot: 0,
          }),
          // Вершина ветки (показатель 8.88): требует обе линии.
          unitNode({
            id: "de-tank-tiger",
            title: "Tiger I",
            cardId: "tiger_i",
            experienceCost: 820,
            purchaseCost: 7000,
            requires: ["de-tank-pz3e", "de-tank-pz4"],
            tier: 5,
            slot: 0,
          }),
        ],
      },
      {
        id: "motorized",
        title: "Мотопехотные штабы",
        shortTitle: "Мотопехота",
        description:
          "Купи штаб после двух уровней техники — он открывает StuG III и быстрый Panzer 38(t).",
        nodes: [
          unitNode({
            id: "de-motor-marder",
            title: "Marder III",
            cardId: "marder_iii",
            experienceCost: 150,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "de-motor-pz4b",
            title: "Panzer IV B",
            cardId: "pzkpfw_iv_ausf_b",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["de-motor-marder"],
            tier: 1,
            slot: 0,
          }),
          headquartersNode({
            id: "de-motor-hq",
            headquartersId: "german_motorized_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-motor-pz4b"],
            tier: 2,
            slot: 0,
          }),
          // Развилка после штаба: штурмовое орудие (6.99) и прорыв (7.29).
          unitNode({
            id: "de-motor-stug",
            title: "StuG III",
            cardId: "stug_iii",
            experienceCost: 580,
            purchaseCost: 4700,
            requires: ["de-motor-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "de-motor-pz38",
            title: "Panzer 38(t)",
            cardId: "panzer_38t",
            experienceCost: 620,
            purchaseCost: 5000,
            requires: ["de-motor-hq"],
            tier: 3,
            slot: 1,
          }),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description:
          "Bison I и leFH 18 ведут к штабу; после покупки открываются Wespe и тяжёлая Bison II.",
        nodes: [
          unitNode({
            id: "de-art-bison-i",
            title: "Bison I",
            cardId: "sig_33_pzi",
            experienceCost: 170,
            purchaseCost: 1200,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "de-art-lefh",
            title: "leFH 18",
            cardId: "lefh_18",
            experienceCost: 230,
            purchaseCost: 1700,
            requires: ["de-art-bison-i"],
            tier: 1,
            slot: 0,
          }),
          headquartersNode({
            id: "de-art-hq",
            headquartersId: "german_artillery_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-art-lefh"],
            tier: 2,
            slot: 0,
          }),
          // Развилка после штаба: дальнобойная Wespe (3.61) и Bison II (7.20).
          unitNode({
            id: "de-art-wespe",
            title: "Wespe",
            cardId: "wespe",
            experienceCost: 250,
            purchaseCost: 1800,
            requires: ["de-art-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "de-art-bison-ii",
            title: "Bison II",
            cardId: "sig_33_pzii",
            experienceCost: 600,
            purchaseCost: 4900,
            requires: ["de-art-hq"],
            tier: 3,
            slot: 1,
          }),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description:
          "Снабжение и ПТ-самоходки ведут к штабу; за ним — линия тяжёлых прототипов.",
        nodes: [
          unitNode({
            id: "de-rear-medic",
            title: "Sanitätskraftwagen",
            cardId: "sanitaetskraftwagen",
            experienceCost: 120,
            purchaseCost: 900,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "de-rear-pzjager",
            title: "PzJäger I",
            cardId: "panzerjaeger_i",
            experienceCost: 180,
            purchaseCost: 1300,
            requires: ["de-rear-medic"],
            tier: 1,
            slot: 0,
          }),
          headquartersNode({
            id: "de-rear-hq",
            headquartersId: "german_rear_corps",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-rear-pzjager"],
            tier: 2,
            slot: 0,
          }),
          // Развилка после штаба: тяжёлый прототип (6.80) и истребитель (7.34).
          unitNode({
            id: "de-rear-nb",
            title: "Nb.Fz.",
            cardId: "neubaufahrzeug",
            experienceCost: 560,
            purchaseCost: 4500,
            requires: ["de-rear-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "de-rear-marder38",
            title: "Marder III (ранний)",
            cardId: "panzerjaeger_38t_early",
            experienceCost: 620,
            purchaseCost: 5000,
            requires: ["de-rear-hq"],
            tier: 3,
            slot: 1,
          }),
          // Вершина прототипов (7.02).
          unitNode({
            id: "de-rear-grosstraktor",
            title: "Großtraktor",
            cardId: "grosstraktor",
            experienceCost: 580,
            purchaseCost: 4700,
            requires: ["de-rear-nb"],
            tier: 4,
            slot: 0,
          }),
        ],
      },
    ],
  },

  ussr: {
    nation: "ussr",
    title: "СССР",
    subtitle: "Бронетанковые и механизированные войска",
    starterHeadquarters: headquartersNode({
      id: "ussr-training-unit",
      headquartersId: "training_unit",
      status: "unlocked",
    }),
    branches: [
      {
        id: "tank",
        title: "Танковые штабы",
        shortTitle: "Танковые",
        description: "Основная линия танковых соединений.",
        nodes: [
          {
            id: "ussr-tank-t34",
            type: "unit",
            title: "T-34/76",
            cardId: "t34_76",
            experienceCost: 180,
            purchaseCost: 1400,
            status: "researchable",
          },
          {
            id: "ussr-tank-kv1",
            type: "unit",
            title: "KV-1",
            cardId: "kv1",
            experienceCost: 420,
            purchaseCost: 3400,
            status: "locked",
          },
          headquartersNode({
            id: "ussr-tank-hq",
            headquartersId: "soviet_tank_brigade",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("ussr-tank-t34-85", "T-34-85", "Будущая карта"),
          plannedUnit("ussr-tank-is2", "ИС-2", "Будущая карта"),
        ],
      },
      {
        id: "motorized",
        title: "Мотопехотные штабы",
        shortTitle: "Мотопехота",
        description: "Механизированные части и мобильное сопровождение.",
        nodes: [
          {
            id: "ussr-motor-t37a",
            type: "unit",
            title: "Т-37А",
            cardId: "t37a",
            experienceCost: 140,
            purchaseCost: 1000,
            status: "researchable",
          },
          {
            id: "ussr-motor-t40",
            type: "unit",
            title: "Т-40",
            cardId: "t40",
            experienceCost: 260,
            purchaseCost: 1800,
            status: "locked",
          },
          headquartersNode({
            id: "ussr-motor-hq",
            headquartersId: "soviet_motor_rifle_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("ussr-motor-infantry", "Мотострелковый батальон", "Будущая карта"),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description: "Противотанковые установки и дальняя поддержка.",
        nodes: [
          {
            id: "ussr-art-su76",
            type: "unit",
            title: "SU-76",
            cardId: "su76",
            experienceCost: 180,
            purchaseCost: 1300,
            status: "researchable",
          },
          {
            id: "ussr-art-su122",
            type: "unit",
            title: "SU-122",
            cardId: "su_122",
            experienceCost: 380,
            purchaseCost: 2900,
            status: "locked",
          },
          headquartersNode({
            id: "ussr-art-hq",
            headquartersId: "soviet_guards_mortar_regiment",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("ussr-art-katyusha", "БМ-13 «Катюша»", "Будущая карта"),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description: "Автотранспорт, ремонт и медицина.",
        nodes: [
          {
            id: "ussr-rear-amo",
            type: "unit",
            title: "АМО Ф15",
            cardId: "amo_f15",
            experienceCost: 120,
            purchaseCost: 850,
            status: "researchable",
          },
          {
            id: "ussr-rear-gaz55",
            type: "unit",
            title: "ГАЗ-55",
            cardId: "gaz_55_ambulance",
            experienceCost: 260,
            purchaseCost: 1800,
            status: "locked",
          },
          headquartersNode({
            id: "ussr-rear-hq",
            headquartersId: "soviet_auto_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("ussr-rear-workshop", "Полевая мастерская", "Будущая карта"),
        ],
      },
    ],
  },

  usa: {
    nation: "usa",
    title: "США",
    subtitle: "Armored Forces",
    starterHeadquarters: headquartersNode({
      id: "usa-training-camp",
      headquartersId: "training_camp",
      status: "unlocked",
    }),
    branches: [
      {
        id: "tank",
        title: "Танковые штабы",
        shortTitle: "Танковые",
        description: "Бронетанковые дивизии и мобильные ударные группы.",
        nodes: [
          {
            id: "usa-tank-m2-light",
            type: "unit",
            title: "M2 Light Tank",
            cardId: "m2_light_tank",
            experienceCost: 160,
            purchaseCost: 1200,
            status: "researchable",
          },
          {
            id: "usa-tank-m3-stuart",
            type: "unit",
            title: "M3 Stuart",
            cardId: "m3_stuart",
            experienceCost: 360,
            purchaseCost: 2800,
            status: "locked",
          },
          headquartersNode({
            id: "usa-tank-hq",
            headquartersId: "usa_old_ironsides",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("usa-tank-jumbo", "M4A3E2 Jumbo", "Будущая карта"),
          plannedUnit("usa-tank-pershing", "M26 Pershing", "Будущая карта"),
        ],
      },
      {
        id: "motorized",
        title: "Мотопехотные штабы",
        shortTitle: "Мотопехота",
        description: "Мобильная пехота и бронетранспортёры.",
        nodes: [
          {
            id: "usa-motor-halftrack",
            type: "unit",
            title: "M3 Half-track",
            cardId: "m3_halftrack",
            experienceCost: 140,
            purchaseCost: 1000,
            status: "researchable",
          },
          {
            id: "usa-motor-m5-stuart",
            type: "unit",
            title: "M5 Stuart",
            cardId: "m5_stuart",
            experienceCost: 260,
            purchaseCost: 1800,
            status: "locked",
          },
          headquartersNode({
            id: "usa-motor-hq",
            headquartersId: "usa_armored_infantry_regiment",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("usa-motor-infantry", "Armored Infantry", "Будущая карта"),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description: "Самоходные гаубицы и противотанковые части.",
        nodes: [
          {
            id: "usa-art-m3-lee",
            type: "unit",
            title: "M3 Lee",
            cardId: "m3_lee",
            experienceCost: 200,
            purchaseCost: 1500,
            status: "researchable",
          },
          {
            id: "usa-art-m4-sherman",
            type: "unit",
            title: "M4 Sherman",
            cardId: "m4_sherman",
            experienceCost: 420,
            purchaseCost: 3200,
            status: "locked",
          },
          headquartersNode({
            id: "usa-art-hq",
            headquartersId: "usa_armored_artillery_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("usa-art-m36", "M36 Jackson", "Будущая карта"),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description: "Снабжение передовых частей и эвакуация раненых.",
        nodes: [
          {
            id: "usa-rear-halftrack",
            type: "unit",
            title: "M3 Half-track",
            cardId: "m3_halftrack",
            experienceCost: 140,
            purchaseCost: 1000,
            status: "researchable",
          },
          {
            id: "usa-rear-ambulance",
            type: "unit",
            title: "WC-54 Ambulance",
            cardId: "dodge_wc54",
            experienceCost: 180,
            purchaseCost: 1200,
            status: "researchable",
          },
          headquartersNode({
            id: "usa-rear-hq",
            headquartersId: "usa_maintenance_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          }),
          plannedUnit("usa-rear-workshop", "Field Workshop", "Будущая карта"),
        ],
      },
    ],
  },
};

export const RESEARCH_NATIONS: ResearchNation[] = ["germany", "ussr", "usa"];

/**
 * Stock German collection: 10 units a player owns from the start (the
 * Trainingslager starting deck, granted by getStarterOwnedCardCopies). These
 * are intentionally kept out of the research tree — everything else is unlocked
 * through it.
 */
export const GERMAN_STOCK_CARD_IDS: readonly string[] = [
  "pzkpfw_i_ausf_a",
  "pzkpfw_i_ausf_b",
  "pzkpfw_ii_ausf_c",
  "pzkpfw_ii_ausf_f",
  "pzkpfw_ii_ausf_d",
  "pzbef_i",
  "panzer_35t",
  "leig_18",
  "mercedes_g3a",
  "adler_type_10_n",
];
