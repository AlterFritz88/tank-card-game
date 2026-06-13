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
            title: "Panzer IV G",
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
          // Параллельное исследование: штабная машина и линейный танк.
          unitNode({
            id: "de-motor-horch",
            title: "Horch 830R",
            cardId: "horch_830r",
            experienceCost: 260,
            purchaseCost: 1900,
            requires: ["de-motor-marder"],
            tier: 1,
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
            slot: 1,
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
          // Вершина: бронированный эскорт для быстрых лёгких танков.
          unitNode({
            id: "de-motor-porsche823",
            title: "Porsche-823",
            cardId: "porsche_823",
            experienceCost: 700,
            purchaseCost: 5800,
            requires: ["de-motor-pz38"],
            tier: 4,
            slot: 0,
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
          // Параллельное исследование: снабжение и ПТ-самоходка.
          unitNode({
            id: "de-rear-krupp",
            title: "Krupp L3H163",
            cardId: "krupp_l3h163",
            experienceCost: 200,
            purchaseCost: 1400,
            requires: ["de-rear-medic"],
            tier: 1,
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
            slot: 1,
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
        description:
          "Линейно изучи Т-40 и Т-34, затем купи штаб — он открывает КВ-1, Т-111 и КВ-2.",
        nodes: [
          unitNode({
            id: "ussr-tank-t40",
            title: "Т-40",
            cardId: "t40",
            experienceCost: 160,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          // Параллельное исследование: ранний Т-34 и серийный Т-34/76.
          unitNode({
            id: "ussr-tank-t34-1940",
            title: "Т-34 обр. 1940",
            cardId: "t34_1940",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["ussr-tank-t40"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "ussr-tank-t34",
            title: "Т-34/76",
            cardId: "t34_76",
            experienceCost: 360,
            purchaseCost: 2600,
            requires: ["ussr-tank-t40"],
            tier: 1,
            slot: 1,
          }),
          headquartersNode({
            id: "ussr-tank-hq",
            headquartersId: "soviet_tank_brigade",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["ussr-tank-t34"],
            tier: 2,
            slot: 0,
          }),
          // После покупки штаба: линия КВ и экспериментальная броня.
          unitNode({
            id: "ussr-tank-kv1-1940",
            title: "КВ-1 обр. 1940",
            cardId: "kv1_1940",
            experienceCost: 520,
            purchaseCost: 4200,
            requires: ["ussr-tank-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "ussr-tank-t111",
            title: "Т-111",
            cardId: "t111",
            experienceCost: 480,
            purchaseCost: 3800,
            requires: ["ussr-tank-hq"],
            tier: 3,
            slot: 1,
          }),
          unitNode({
            id: "ussr-tank-kv1",
            title: "КВ-1",
            cardId: "kv1",
            experienceCost: 640,
            purchaseCost: 5200,
            requires: ["ussr-tank-kv1-1940"],
            tier: 4,
            slot: 0,
          }),
          unitNode({
            id: "ussr-tank-kv2",
            title: "КВ-2",
            cardId: "kv2",
            experienceCost: 820,
            purchaseCost: 7000,
            requires: ["ussr-tank-kv1"],
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
          "Танкетки и быстроходные БТ ведут к штабу; за ним — экспериментальная линия Кристи.",
        nodes: [
          unitNode({
            id: "ussr-motor-t27",
            title: "Т-27",
            cardId: "t27",
            experienceCost: 120,
            purchaseCost: 900,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "ussr-motor-bt7m",
            title: "БТ-7М",
            cardId: "bt_7m",
            experienceCost: 300,
            purchaseCost: 2100,
            requires: ["ussr-motor-t27"],
            tier: 1,
            slot: 0,
          }),
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
          unitNode({
            id: "ussr-motor-btsv",
            title: "БТ-СВ «Черепаха»",
            cardId: "bt_sv",
            experienceCost: 480,
            purchaseCost: 3800,
            requires: ["ussr-motor-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "ussr-motor-a20",
            title: "А-20",
            cardId: "a20",
            experienceCost: 540,
            purchaseCost: 4300,
            requires: ["ussr-motor-hq"],
            tier: 3,
            slot: 1,
          }),
          unitNode({
            id: "ussr-motor-t29",
            title: "Т-29",
            cardId: "t29",
            experienceCost: 680,
            purchaseCost: 5600,
            requires: ["ussr-motor-a20"],
            tier: 4,
            slot: 0,
          }),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description:
          "Полковая пушка и СУ-76 ведут к штабу; за ним — СУ-122, гаубица М-30 и СУ-14.",
        nodes: [
          unitNode({
            id: "ussr-art-76-1927",
            title: "76-мм обр. 1927",
            cardId: "gun_76_1927",
            experienceCost: 140,
            purchaseCost: 1000,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "ussr-art-su76",
            title: "СУ-76",
            cardId: "su76",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["ussr-art-76-1927"],
            tier: 1,
            slot: 0,
          }),
          headquartersNode({
            id: "ussr-art-hq",
            headquartersId: "soviet_guards_mortar_regiment",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["ussr-art-su76"],
            tier: 2,
            slot: 0,
          }),
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
          "Ремонт и противотанковый заслон ведут к штабу; за ним — тяжёлые прототипы Финской войны.",
        nodes: [
          unitNode({
            id: "ussr-rear-letuchka",
            title: "Летучка тип «А»",
            cardId: "repair_letuchka",
            experienceCost: 130,
            purchaseCost: 900,
            tier: 0,
            slot: 0,
          }),
          // Параллельное исследование: штабная «эмка» и противотанковый заслон.
          unitNode({
            id: "ussr-rear-gaz-m1",
            title: "ГАЗ-М1",
            cardId: "gaz_m1",
            experienceCost: 240,
            purchaseCost: 1700,
            requires: ["ussr-rear-letuchka"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "ussr-rear-53k",
            title: "45-мм 53-К",
            cardId: "gun_53k",
            experienceCost: 280,
            purchaseCost: 2000,
            requires: ["ussr-rear-letuchka"],
            tier: 1,
            slot: 1,
          }),
          headquartersNode({
            id: "ussr-rear-hq",
            headquartersId: "soviet_auto_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["ussr-rear-53k"],
            tier: 2,
            slot: 0,
          }),
          unitNode({
            id: "ussr-rear-smk",
            title: "СМК",
            cardId: "smk",
            experienceCost: 600,
            purchaseCost: 4900,
            requires: ["ussr-rear-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "ussr-rear-t100",
            title: "Т-100",
            cardId: "t100",
            experienceCost: 620,
            purchaseCost: 5000,
            requires: ["ussr-rear-hq"],
            tier: 3,
            slot: 1,
          }),
          // Вершина прототипов: парадный гигант требует обе машины Финской.
          unitNode({
            id: "ussr-rear-t35",
            title: "Т-35",
            cardId: "t35",
            experienceCost: 820,
            purchaseCost: 7000,
            requires: ["ussr-rear-smk", "ussr-rear-t100"],
            tier: 4,
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
        id: "tank",
        title: "Танковые штабы",
        shortTitle: "Танковые",
        description:
          "Ранние средние танки ведут к штабу; за ним — Sherman, T14 и тяжёлый M6.",
        nodes: [
          unitNode({
            id: "usa-tank-m2a4",
            title: "M2A4",
            cardId: "m2a4",
            experienceCost: 160,
            purchaseCost: 1100,
            tier: 0,
            slot: 0,
          }),
          // Параллельное исследование: ранний Шерман и переходный M2A1.
          unitNode({
            id: "usa-tank-sherman-early",
            title: "M4A1 (ранний)",
            cardId: "sherman_early",
            experienceCost: 340,
            purchaseCost: 2500,
            requires: ["usa-tank-m2a4"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "usa-tank-m2a1",
            title: "M2A1 Medium",
            cardId: "m2a1_medium",
            experienceCost: 300,
            purchaseCost: 2100,
            requires: ["usa-tank-m2a4"],
            tier: 1,
            slot: 1,
          }),
          headquartersNode({
            id: "usa-tank-hq",
            headquartersId: "usa_old_ironsides",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-tank-m2a1"],
            tier: 2,
            slot: 0,
          }),
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
          unitNode({
            id: "usa-tank-t14",
            title: "T14 Assault",
            cardId: "t14_assault",
            experienceCost: 520,
            purchaseCost: 4200,
            requires: ["usa-tank-hq"],
            tier: 3,
            slot: 1,
          }),
          // Вершина: тяжёлый M6 требует обе линии.
          unitNode({
            id: "usa-tank-m6",
            title: "M6 Heavy",
            cardId: "m6_heavy",
            experienceCost: 820,
            purchaseCost: 7000,
            requires: ["usa-tank-sherman", "usa-tank-t14"],
            tier: 4,
            slot: 0,
          }),
        ],
      },
      {
        id: "motorized",
        title: "Мотопехотные штабы",
        shortTitle: "Мотопехота",
        description:
          "Лёгкие машины Кристи ведут к штабу; за ним — амфибия LVT и истребитель M3 GMC.",
        nodes: [
          unitNode({
            id: "usa-motor-ctls",
            title: "Marmon CTLS",
            cardId: "marmon_ctls",
            experienceCost: 120,
            purchaseCost: 900,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "usa-motor-t3",
            title: "Christie T3",
            cardId: "christie_t3",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["usa-motor-ctls"],
            tier: 1,
            slot: 0,
          }),
          headquartersNode({
            id: "usa-motor-hq",
            headquartersId: "usa_armored_infantry_regiment",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-motor-t3"],
            tier: 2,
            slot: 0,
          }),
          unitNode({
            id: "usa-motor-lvt1",
            title: "LVT-1 Alligator",
            cardId: "lvt1",
            experienceCost: 420,
            purchaseCost: 3300,
            requires: ["usa-motor-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "usa-motor-m3gmc",
            title: "M3 GMC",
            cardId: "m3_gmc",
            experienceCost: 540,
            purchaseCost: 4300,
            requires: ["usa-motor-hq"],
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
          "Вьючная гаубица и T18 ведут к штабу; за ним — T19 и 105-мм M2A1.",
        nodes: [
          unitNode({
            id: "usa-art-75pack",
            title: "75-мм Pack M1A1",
            cardId: "gun_75_pack",
            experienceCost: 140,
            purchaseCost: 1000,
            tier: 0,
            slot: 0,
          }),
          unitNode({
            id: "usa-art-t18",
            title: "T18 HMC",
            cardId: "t18_hmc",
            experienceCost: 320,
            purchaseCost: 2300,
            requires: ["usa-art-75pack"],
            tier: 1,
            slot: 0,
          }),
          headquartersNode({
            id: "usa-art-hq",
            headquartersId: "usa_armored_artillery_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-art-t18"],
            tier: 2,
            slot: 0,
          }),
          unitNode({
            id: "usa-art-t19",
            title: "T19 HMC",
            cardId: "t19_hmc",
            experienceCost: 520,
            purchaseCost: 4200,
            requires: ["usa-art-hq"],
            tier: 3,
            slot: 0,
          }),
          unitNode({
            id: "usa-art-105",
            title: "105-мм M2A1",
            cardId: "gun_105_m2a1",
            experienceCost: 380,
            purchaseCost: 2900,
            requires: ["usa-art-hq"],
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
          "Связной джип и противотанковый заслон ведут к штабу; за ним — импровизированная ПТ.",
        nodes: [
          unitNode({
            id: "usa-rear-willys",
            title: "Bantam BRC 40",
            cardId: "willys_mb",
            experienceCost: 130,
            purchaseCost: 900,
            tier: 0,
            slot: 0,
          }),
          // Параллельное исследование: амфибия-разведчик и противотанковый заслон.
          unitNode({
            id: "usa-rear-gpa",
            title: "Ford GPA",
            cardId: "ford_gpa",
            experienceCost: 240,
            purchaseCost: 1700,
            requires: ["usa-rear-willys"],
            tier: 1,
            slot: 0,
          }),
          unitNode({
            id: "usa-rear-37mm",
            title: "37-мм M3",
            cardId: "gun_37mm_m3",
            experienceCost: 280,
            purchaseCost: 2000,
            requires: ["usa-rear-willys"],
            tier: 1,
            slot: 1,
          }),
          headquartersNode({
            id: "usa-rear-hq",
            headquartersId: "usa_maintenance_battalion",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
            requires: ["usa-rear-37mm"],
            tier: 2,
            slot: 0,
          }),
          unitNode({
            id: "usa-rear-fargo",
            title: "M6 GMC Fargo",
            cardId: "m6_gmc_fargo",
            experienceCost: 360,
            purchaseCost: 2700,
            requires: ["usa-rear-hq"],
            tier: 3,
            slot: 0,
          }),
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
