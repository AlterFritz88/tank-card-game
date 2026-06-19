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
   * Premium card node: purchasable directly with gold tracks for this price,
   * bypassing experience research and prerequisites. When set, the node is
   * always available to buy (up to the copy limit) and is excluded from
   * progression/“fully researched” calculations.
   */
  goldCost?: number;
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

const premiumNode = ({
  id,
  title,
  cardId,
  goldCost,
  tier,
  slot,
}: {
  id: string;
  title: string;
  cardId: string;
  goldCost: number;
  tier: number;
  slot: number;
}): ResearchNode => ({
  id,
  type: "unit",
  title,
  cardId,
  goldCost,
  tier,
  slot,
  // Premium nodes are always purchasable (no research, no prerequisites).
  status: "researchable",
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
          "Линия Panzer III → Panzer IV ведёт к 1-й танковой дивизии; за ней — Nb.Fz., Panzer IV G и Tiger I.",
        nodes: [
          // Уровень 2: два средних танка Panzer III.
          unitNode({
            id: "de-tank-pz3d",
            title: "Panzer III D",
            cardId: "pzkpfw_iii_ausf_d",
            experienceCost: 220,
            purchaseCost: 1600,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "de-tank-pz3e",
            title: "Panzer III E",
            cardId: "pzkpfw_iii_ausf_e",
            experienceCost: 260,
            purchaseCost: 1900,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: две машины Panzer IV, каждая продолжает свою линию.
          unitNode({
            id: "de-tank-pz4a",
            title: "Panzer IV A",
            cardId: "pzkpfw_iv_ausf_a",
            experienceCost: 340,
            purchaseCost: 2500,
            requires: ["de-tank-pz3d"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "de-tank-pz4b",
            title: "Panzer IV B",
            cardId: "pzkpfw_iv_ausf_b",
            experienceCost: 380,
            purchaseCost: 2800,
            requires: ["de-tank-pz3e"],
            tier: 1,
            slot: 1,
          }),
          // Уровень 4: штаб. Его нужно исследовать И купить — он сводит обе
          // линии и открывает тяжёлую технику.
          headquartersNode({
            id: "de-tank-hq-first-panzer",
            headquartersId: "first_panzer_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-tank-pz4a", "de-tank-pz4b"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: тяжёлый прототип.
          unitNode({
            id: "de-tank-nb",
            title: "Nb.Fz.",
            cardId: "neubaufahrzeug",
            experienceCost: 560,
            purchaseCost: 4500,
            requires: ["de-tank-hq-first-panzer"],
            tier: 3,
            slot: 0,
          }),
          // Уровень 6: серийный средний танк.
          unitNode({
            id: "de-tank-pz4g",
            title: "Panzer IV G",
            cardId: "panzer_iv",
            experienceCost: 640,
            purchaseCost: 5200,
            requires: ["de-tank-nb"],
            tier: 4,
            slot: 0,
          }),
          // Уровень 7: вершина ветки.
          unitNode({
            id: "de-tank-tiger",
            title: "Tiger I",
            cardId: "tiger_i",
            experienceCost: 820,
            purchaseCost: 7000,
            requires: ["de-tank-pz4g"],
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
          "Лёгкие Panzer II и быстрый Panzer 38(t) ведут к штабу; за ним — штурмовое орудие StuG III G.",
        nodes: [
          // Уровень 2: два лёгких танка Panzer II.
          unitNode({
            id: "de-motor-pz2f",
            title: "Panzer II F",
            cardId: "pzkpfw_ii_ausf_f",
            experienceCost: 200,
            purchaseCost: 1400,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "de-motor-pz2d",
            title: "Panzer II D",
            cardId: "pzkpfw_ii_ausf_d",
            experienceCost: 220,
            purchaseCost: 1600,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: быстрый Panzer 38(t).
          unitNode({
            id: "de-motor-pz38",
            title: "Panzer 38(t)",
            cardId: "panzer_38t",
            experienceCost: 340,
            purchaseCost: 2500,
            requires: ["de-motor-pz2f", "de-motor-pz2d"],
            tier: 1,
            slot: 0,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "de-motor-hq",
            headquartersId: "german_motorized_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-motor-pz38"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: штурмовое орудие.
          unitNode({
            id: "de-motor-stug",
            title: "StuG III G",
            cardId: "stug_iii",
            experienceCost: 560,
            purchaseCost: 4500,
            requires: ["de-motor-hq"],
            tier: 3,
            slot: 0,
          }),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description:
          "Bison I, leFH 18 и PzJäger I ведут к штабу; за ним — Marder III (ранний) и Wespe. Премиум: Bison II за золотые траки.",
        nodes: [
          // Уровень 2: самоходное орудие Bison I.
          unitNode({
            id: "de-art-bison-i",
            title: "Bison I",
            cardId: "sig_33_pzi",
            experienceCost: 200,
            purchaseCost: 1400,
            tier: 0,
            slot: 0,
          }),
          // Премиум: Bison II покупается напрямую за золотые траки.
          premiumNode({
            id: "de-art-bison-ii",
            title: "Bison II",
            cardId: "sig_33_pzii",
            goldCost: 500,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: гаубица и ПТ-самоходка.
          unitNode({
            id: "de-art-lefh",
            title: "leFH 18",
            cardId: "lefh_18",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["de-art-bison-i"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "de-art-pzjager",
            title: "PzJäger I",
            cardId: "panzerjaeger_i",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["de-art-bison-i"],
            tier: 1,
            slot: 1,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "de-art-hq",
            headquartersId: "german_artillery_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-art-lefh", "de-art-pzjager"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: опытный истребитель танков.
          unitNode({
            id: "de-art-marder38",
            title: "Marder III (ранний)",
            cardId: "panzerjaeger_38t_early",
            experienceCost: 560,
            purchaseCost: 4500,
            requires: ["de-art-hq"],
            tier: 3,
            slot: 0,
          }),
          // Уровень 6: дальнобойная САУ.
          unitNode({
            id: "de-art-wespe",
            title: "Wespe",
            cardId: "wespe",
            experienceCost: 640,
            purchaseCost: 5200,
            requires: ["de-art-marder38"],
            tier: 4,
            slot: 0,
          }),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description:
          "Снабжение Sanitäter → Horch 830 ведёт к штабу; за ним — Krupp и бронированный Porsche.",
        nodes: [
          // Уровень 2: медицинская машина.
          unitNode({
            id: "de-rear-medic",
            title: "Sanitätskraftwagen",
            cardId: "sanitaetskraftwagen",
            experienceCost: 200,
            purchaseCost: 1400,
            tier: 0,
            slot: 0,
          }),
          // Уровень 3: штабной кабриолет.
          unitNode({
            id: "de-rear-horch",
            title: "Horch 830",
            cardId: "horch_830r",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["de-rear-medic"],
            tier: 1,
            slot: 0,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "de-rear-hq",
            headquartersId: "german_rear_corps",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["de-rear-horch"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: армейский грузовик-снабженец.
          unitNode({
            id: "de-rear-krupp",
            title: "Krupp L3H163",
            cardId: "krupp_l3h163",
            experienceCost: 560,
            purchaseCost: 4500,
            requires: ["de-rear-hq"],
            tier: 3,
            slot: 0,
          }),
          // Уровень 6: бронированный автотранспорт.
          unitNode({
            id: "de-rear-porsche",
            title: "Porsche-823",
            cardId: "porsche_823",
            experienceCost: 640,
            purchaseCost: 5200,
            requires: ["de-rear-krupp"],
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
        id: "motorized",
        title: "Мотопехотные штабы",
        shortTitle: "Мотопехота",
        description:
          "Быстроходные БТ ведут к 1-й Московской; за штабом — колёсно-гусеничная линия А-20 → Т-34/76. Премиум: БТ-СВ за золотые траки.",
        nodes: [
          // Уровень 2: два быстроходных танка БТ.
          unitNode({
            id: "ussr-motor-bt5",
            title: "БТ-5",
            cardId: "bt_5",
            experienceCost: 150,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "ussr-motor-bt7",
            title: "БТ-7",
            cardId: "bt_7",
            experienceCost: 180,
            purchaseCost: 1350,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: дизельный БТ-7М сводит обе линии.
          unitNode({
            id: "ussr-motor-bt7m",
            title: "БТ-7М",
            cardId: "bt_7m",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["ussr-motor-bt5", "ussr-motor-bt7"],
            tier: 1,
            slot: 0,
          }),
          // Премиум: БТ-СВ «Черепаха» покупается напрямую за золотые траки.
          premiumNode({
            id: "ussr-motor-btsv",
            title: "БТ-СВ «Черепаха»",
            cardId: "bt_sv",
            goldCost: 500,
            tier: 1,
            slot: 1,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "ussr-motor-hq",
            headquartersId: "soviet_motor_rifle_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["ussr-motor-bt7m"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: колёсно-гусеничные предки Т-34.
          unitNode({
            id: "ussr-motor-a20",
            title: "А-20",
            cardId: "a20",
            experienceCost: 520,
            purchaseCost: 4200,
            requires: ["ussr-motor-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "ussr-motor-t46",
            title: "Т-46-1",
            cardId: "t46_1",
            experienceCost: 460,
            purchaseCost: 3600,
            requires: ["ussr-motor-hq"],
            tier: 3,
            slot: 1,
          }),
          // Уровень 6: первые средние танки нового поколения.
          unitNode({
            id: "ussr-motor-t34-1940",
            title: "Т-34 обр. 1940",
            cardId: "t34_1940",
            experienceCost: 660,
            purchaseCost: 5400,
            requires: ["ussr-motor-a20"],
            tier: 4,
            slot: 0,
          }),
          unitNode({
            id: "ussr-motor-t29",
            title: "Т-29",
            cardId: "t29",
            experienceCost: 640,
            purchaseCost: 5200,
            requires: ["ussr-motor-t46"],
            tier: 4,
            slot: 1,
          }),
          // Уровень 7: вершина ветки — серийный Т-34/76.
          unitNode({
            id: "ussr-motor-t34",
            title: "Т-34/76",
            cardId: "t34_76",
            experienceCost: 860,
            purchaseCost: 7400,
            requires: ["ussr-motor-t34-1940", "ussr-motor-t29"],
            tier: 5,
            slot: 0,
          }),
        ],
      },
      {
        id: "tank",
        title: "Танковые штабы",
        shortTitle: "Танковые",
        description:
          "Линия Т-26 и Т-40/Т-35 ведёт к 4-й танковой; за штабом — Т-28, КВ-1 и тяжёлые гиганты Финской войны.",
        nodes: [
          // Уровень 2: два пушечных Т-26.
          unitNode({
            id: "ussr-tank-t26-1933",
            title: "Т-26 1933",
            cardId: "t26_1933",
            experienceCost: 140,
            purchaseCost: 1000,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "ussr-tank-t26-1938",
            title: "Т-26 1938",
            cardId: "t26_1938",
            experienceCost: 170,
            purchaseCost: 1250,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: разведчик Т-40 и многобашенный Т-35.
          unitNode({
            id: "ussr-tank-t40",
            title: "Т-40",
            cardId: "t40",
            experienceCost: 300,
            purchaseCost: 2100,
            requires: ["ussr-tank-t26-1933"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "ussr-tank-t35",
            title: "Т-35",
            cardId: "t35",
            experienceCost: 360,
            purchaseCost: 2600,
            requires: ["ussr-tank-t26-1938"],
            tier: 1,
            slot: 1,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "ussr-tank-hq",
            headquartersId: "soviet_tank_brigade",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["ussr-tank-t40", "ussr-tank-t35"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: многобашенный средний танк.
          unitNode({
            id: "ussr-tank-t28",
            title: "Т-28",
            cardId: "t28",
            experienceCost: 520,
            purchaseCost: 4200,
            requires: ["ussr-tank-hq"],
            tier: 3,
            slot: 0,
          }),
          // Уровень 6: ранний КВ и противоснарядный Т-111.
          unitNode({
            id: "ussr-tank-kv1-1940",
            title: "КВ-1 обр. 1940",
            cardId: "kv1_1940",
            experienceCost: 640,
            purchaseCost: 5200,
            requires: ["ussr-tank-t28"],
            tier: 4,
            slot: 0,
          }),
          unitNode({
            id: "ussr-tank-t111",
            title: "Т-111",
            cardId: "t111",
            experienceCost: 600,
            purchaseCost: 4900,
            requires: ["ussr-tank-t28"],
            tier: 4,
            slot: 1,
          }),
          // Уровень 7: тяжёлые гиганты Финской войны.
          unitNode({
            id: "ussr-tank-kv2",
            title: "КВ-2",
            cardId: "kv2",
            experienceCost: 860,
            purchaseCost: 7400,
            requires: ["ussr-tank-kv1-1940"],
            tier: 5,
            slot: 0,
          }),
          unitNode({
            id: "ussr-tank-t100",
            title: "Т-100",
            cardId: "t100",
            experienceCost: 840,
            purchaseCost: 7200,
            requires: ["ussr-tank-t111"],
            tier: 5,
            slot: 1,
          }),
          // Вершина ветки: двухбашенный СМК венчает обе тяжёлые линии.
          unitNode({
            id: "ussr-tank-smk",
            title: "СМК",
            cardId: "smk",
            experienceCost: 880,
            purchaseCost: 7600,
            requires: ["ussr-tank-kv2", "ussr-tank-t100"],
            tier: 6,
            slot: 0,
          }),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description:
          "АТ-1 и полковая пушка ведут к 13-му миномётному; за штабом — СУ-122, гаубица М-30 и СУ-14.",
        nodes: [
          // Уровень 2: первая САУ и полковая пушка.
          unitNode({
            id: "ussr-art-at1",
            title: "АТ-1",
            cardId: "at1",
            experienceCost: 150,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "ussr-art-76-1927",
            title: "76-мм обр. 1927",
            cardId: "gun_76_1927",
            experienceCost: 130,
            purchaseCost: 950,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: ранние самоходки.
          unitNode({
            id: "ussr-art-su76",
            title: "СУ-76",
            cardId: "su76",
            experienceCost: 300,
            purchaseCost: 2100,
            requires: ["ussr-art-at1"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "ussr-art-su5-2",
            title: "СУ-5-2",
            cardId: "su_5_2",
            experienceCost: 340,
            purchaseCost: 2400,
            requires: ["ussr-art-76-1927"],
            tier: 1,
            slot: 1,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "ussr-art-hq",
            headquartersId: "soviet_guards_mortar_regiment",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["ussr-art-su76", "ussr-art-su5-2"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: штурмовая САУ и дивизионная гаубица.
          unitNode({
            id: "ussr-art-su122",
            title: "СУ-122",
            cardId: "su_122",
            experienceCost: 520,
            purchaseCost: 4200,
            requires: ["ussr-art-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "ussr-art-m30",
            title: "122-мм М-30",
            cardId: "gun_m30",
            experienceCost: 380,
            purchaseCost: 2900,
            requires: ["ussr-art-hq"],
            tier: 3,
            slot: 1,
          }),
          // Уровень 6: тяжёлая дальнобойная САУ.
          unitNode({
            id: "ussr-art-su14",
            title: "СУ-14",
            cardId: "su14",
            experienceCost: 760,
            purchaseCost: 6300,
            requires: ["ussr-art-su122"],
            tier: 4,
            slot: 0,
          }),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description:
          "Штабные машины ГАЗ и ремонтная летучка ведут к 389-му автобату — ветка снабжения и ремонта.",
        nodes: [
          // Уровень 2: санитарная и штабная машины.
          unitNode({
            id: "ussr-rear-gaz55",
            title: "ГАЗ-55",
            cardId: "gaz_55_ambulance",
            experienceCost: 130,
            purchaseCost: 950,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "ussr-rear-gaz-m1",
            title: "ГАЗ-М1",
            cardId: "gaz_m1",
            experienceCost: 150,
            purchaseCost: 1100,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: ремонтная летучка сводит обе линии.
          unitNode({
            id: "ussr-rear-letuchka",
            title: "Летучка тип «А»",
            cardId: "repair_letuchka",
            experienceCost: 280,
            purchaseCost: 2000,
            requires: ["ussr-rear-gaz55", "ussr-rear-gaz-m1"],
            tier: 1,
            slot: 0,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "ussr-rear-hq",
            headquartersId: "soviet_auto_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["ussr-rear-letuchka"],
            tier: 2,
            slot: 0,
          }),
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
        id: "motorized",
        title: "Мотопехотные штабы",
        shortTitle: "Мотопехота",
        description:
          "Ранние лёгкие танки M2A4 и амфибия LVT-1 ведут через M3 Stuart к штабу; за ним — M5 Stuart. Премиум: Christie T3 и Marmon CTLS за золотые траки.",
        nodes: [
          // Уровень 2: лёгкий танк и плавающая машина морпехов.
          unitNode({
            id: "usa-motor-m2a4",
            title: "M2A4",
            cardId: "m2a4",
            experienceCost: 160,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "usa-motor-lvt1",
            title: "LVT-1 Alligator",
            cardId: "lvt1",
            experienceCost: 180,
            purchaseCost: 1300,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: M3 Stuart сводит обе линии.
          unitNode({
            id: "usa-motor-m3stuart",
            title: "M3 Stuart",
            cardId: "m3_stuart",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["usa-motor-m2a4", "usa-motor-lvt1"],
            tier: 1,
            slot: 0,
          }),
          // Премиум: Marmon CTLS покупается напрямую за золотые траки.
          premiumNode({
            id: "usa-motor-ctls",
            title: "Marmon CTLS",
            cardId: "marmon_ctls",
            goldCost: 400,
            tier: 1,
            slot: 1,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "usa-motor-hq",
            headquartersId: "usa_armored_infantry_regiment",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-motor-m3stuart"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: поздний лёгкий танк.
          unitNode({
            id: "usa-motor-m5stuart",
            title: "M5 Stuart",
            cardId: "m5_stuart",
            experienceCost: 520,
            purchaseCost: 4200,
            requires: ["usa-motor-hq"],
            tier: 3,
            slot: 0,
          }),
          // Премиум: Christie T3 покупается напрямую за золотые траки.
          premiumNode({
            id: "usa-motor-t3",
            title: "Christie T3",
            cardId: "christie_t3",
            goldCost: 500,
            tier: 3,
            slot: 1,
          }),
        ],
      },
      {
        id: "tank",
        title: "Танковые штабы",
        shortTitle: "Танковые",
        description:
          "M3 Lee и M4A1 Sherman ведут к штабу; за ним — серийный Sherman, а на вершине тяжёлые M6 и T14.",
        nodes: [
          // Уровень 2: переходный средний танк.
          unitNode({
            id: "usa-tank-m3lee",
            title: "M3 Lee",
            cardId: "m3_lee",
            experienceCost: 220,
            purchaseCost: 1600,
            tier: 0,
            slot: 0,
          }),
          // Уровень 3: ранний Шерман с литым корпусом.
          unitNode({
            id: "usa-tank-sherman-early",
            title: "M4A1 Sherman",
            cardId: "sherman_early",
            experienceCost: 360,
            purchaseCost: 2700,
            requires: ["usa-tank-m3lee"],
            tier: 1,
            slot: 0,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "usa-tank-hq",
            headquartersId: "usa_old_ironsides",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-tank-sherman-early"],
            tier: 2,
            slot: 0,
          }),
          // Уровень 5: серийный средний танк.
          unitNode({
            id: "usa-tank-sherman",
            title: "M4 Sherman",
            cardId: "m4_sherman",
            experienceCost: 560,
            purchaseCost: 4500,
            requires: ["usa-tank-hq"],
            tier: 3,
            slot: 0,
          }),
          // Уровень 6: тяжёлые вершины ветки.
          unitNode({
            id: "usa-tank-m6",
            title: "M6 Heavy",
            cardId: "m6_heavy",
            experienceCost: 820,
            purchaseCost: 7000,
            requires: ["usa-tank-sherman"],
            tier: 4,
            slot: 0,
          }),
          unitNode({
            id: "usa-tank-t14",
            title: "T14 Assault",
            cardId: "t14_assault",
            experienceCost: 780,
            purchaseCost: 6600,
            requires: ["usa-tank-sherman"],
            tier: 4,
            slot: 1,
          }),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description:
          "T18 HMC и M6 GMC Fargo ведут к T19 HMC, а за ним — штаб.",
        nodes: [
          // Уровень 2: гаубичная САУ и импровизированная ПТ.
          unitNode({
            id: "usa-art-t18",
            title: "T18 HMC",
            cardId: "t18_hmc",
            experienceCost: 160,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "usa-art-fargo",
            title: "M6 GMC Fargo",
            cardId: "m6_gmc_fargo",
            experienceCost: 140,
            purchaseCost: 1000,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: 105-мм самоходка сводит обе линии.
          unitNode({
            id: "usa-art-t19",
            title: "T19 HMC",
            cardId: "t19_hmc",
            experienceCost: 360,
            purchaseCost: 2700,
            requires: ["usa-art-t18", "usa-art-fargo"],
            tier: 1,
            slot: 0,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "usa-art-hq",
            headquartersId: "usa_armored_artillery_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-art-t19"],
            tier: 2,
            slot: 0,
          }),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description:
          "Гаубица 105-мм и связной Bantam ведут через M3 GMC и амфибию Ford GPA к штабу.",
        nodes: [
          // Уровень 2: дивизионная гаубица и связной джип.
          unitNode({
            id: "usa-rear-105",
            title: "105-мм M2A1",
            cardId: "gun_105_m2a1",
            experienceCost: 160,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "usa-rear-willys",
            title: "Bantam BRC 40",
            cardId: "willys_mb",
            experienceCost: 130,
            purchaseCost: 900,
            tier: 0,
            slot: 1,
          }),
          // Уровень 3: истребитель танков и амфибия-снабженец.
          unitNode({
            id: "usa-rear-m3gmc",
            title: "M3 GMC",
            cardId: "m3_gmc",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["usa-rear-105"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "usa-rear-gpa",
            title: "Ford GPA",
            cardId: "ford_gpa",
            experienceCost: 240,
            purchaseCost: 1700,
            requires: ["usa-rear-willys"],
            tier: 1,
            slot: 1,
          }),
          // Уровень 4: штаб.
          headquartersNode({
            id: "usa-rear-hq",
            headquartersId: "usa_maintenance_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-rear-m3gmc", "usa-rear-gpa"],
            tier: 2,
            slot: 0,
          }),
        ],
      },
    ],
  },
};

export const RESEARCH_NATIONS: ResearchNation[] = ["ussr", "germany", "usa"];

/**
 * Stock German collection: the 11 units a player owns from the start (the
 * Trainingslager starting deck, granted by getStarterOwnedCardCopies). These
 * are intentionally kept out of the research tree — everything else is unlocked
 * through it.
 */
export const GERMAN_STOCK_CARD_IDS: readonly string[] = [
  "leichttraktor",
  "grosstraktor",
  "pzkpfw_i_ausf_a",
  "pzkpfw_i_ausf_b",
  "pzkpfw_ii_ausf_c",
  "pzkpfw_iii_ausf_a",
  "panzer_35t",
  "stug_iii_b",
  "leig_18",
  "mercedes_g3a",
  "adler_type_10_n",
];

/**
 * Stock US collection: the base units a player owns from the start (the
 * Training Camp starting deck, granted by getStarterOwnedCardCopies). Like the
 * German stock these are kept out of the research tree — everything else is
 * unlocked through it.
 */
export const USA_STOCK_CARD_IDS: readonly string[] = [
  "m1_combat_car",
  "m2a1_medium",
  "m2_light_tank",
  "m2_medium_tank",
  "gun_37mm_m3",
  "gun_75_pack",
  "m3_halftrack",
  "dodge_wc54",
  "m5_hst",
];
