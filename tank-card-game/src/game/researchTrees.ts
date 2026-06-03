import type { HeadquartersId, Nation } from "./types";

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

const plannedHeadquarters = (
  id: string,
  title: string,
  subtitle: string
): ResearchNode => ({
  id,
  type: "headquarters",
  title,
  subtitle,
  status: "planned",
});

export const RESEARCH_TREES: Record<ResearchNation, NationResearchTree> = {
  germany: {
    nation: "germany",
    title: "Германия",
    subtitle: "Бронетанковые войска Вермахта",
    starterHeadquarters: {
      id: "germany-training-camp",
      type: "headquarters",
      title: "Trainingslager",
      subtitle: "Учебная часть",
      headquartersId: "trainingslager",
      status: "unlocked",
    },
    branches: [
      {
        id: "tank",
        title: "Танковые штабы",
        shortTitle: "Танковые",
        description: "Манёвренные соединения для прорыва и развития наступления.",
        nodes: [
          {
            id: "de-tank-pzi-a",
            type: "unit",
            title: "Panzer I A",
            cardId: "pzkpfw_i_ausf_a",
            experienceCost: 120,
            purchaseCost: 900,
            status: "unlocked",
          },
          {
            id: "de-tank-pzi-b",
            type: "unit",
            title: "Panzer I B",
            cardId: "pzkpfw_i_ausf_b",
            experienceCost: 180,
            purchaseCost: 1200,
            status: "researchable",
          },
          {
            id: "de-tank-hq-first-panzer",
            type: "headquarters",
            title: "1. Panzer-Div.",
            subtitle: "Танковая дивизия",
            headquartersId: "first_panzer_division",
            experienceCost: 900,
            purchaseCost: 6800,
            status: "locked",
          },
          {
            id: "de-tank-pz35",
            type: "unit",
            title: "Panzer 35(t)",
            cardId: "panzer_35t",
            experienceCost: 360,
            purchaseCost: 2400,
            status: "locked",
          },
          {
            id: "de-tank-pziii-a",
            type: "unit",
            title: "Panzer III A",
            cardId: "pzkpfw_iii_ausf_a",
            experienceCost: 620,
            purchaseCost: 4600,
            status: "locked",
          },
        ],
      },
      {
        id: "motorized",
        title: "Мотопехотные штабы",
        shortTitle: "Мотопехота",
        description: "Мобильная пехота, связь и техника сопровождения.",
        nodes: [
          {
            id: "de-motor-pzbef",
            type: "unit",
            title: "Funk Panzer I",
            cardId: "pzbef_i",
            experienceCost: 140,
            purchaseCost: 1000,
            status: "unlocked",
          },
          {
            id: "de-motor-pzii-d",
            type: "unit",
            title: "Panzer II D",
            cardId: "pzkpfw_ii_ausf_d",
            experienceCost: 240,
            purchaseCost: 1600,
            status: "researchable",
          },
          plannedHeadquarters(
            "de-motor-hq",
            "Мотопехотная бригада",
            "Будущий штаб"
          ),
          {
            id: "de-motor-pz38",
            type: "unit",
            title: "Panzer 38(t)",
            cardId: "panzer_38t",
            experienceCost: 420,
            purchaseCost: 3100,
            status: "locked",
          },
          {
            id: "de-motor-stug",
            type: "unit",
            title: "StuG III",
            cardId: "stug_iii",
            experienceCost: 680,
            purchaseCost: 5200,
            status: "locked",
          },
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description: "Орудия поддержки, гаубицы и самоходная артиллерия.",
        nodes: [
          {
            id: "de-art-leig",
            type: "unit",
            title: "leIG 18",
            cardId: "leig_18",
            experienceCost: 130,
            purchaseCost: 900,
            status: "unlocked",
          },
          {
            id: "de-art-lefh",
            type: "unit",
            title: "leFH 18",
            cardId: "lefh_18",
            experienceCost: 240,
            purchaseCost: 1700,
            status: "researchable",
          },
          plannedHeadquarters(
            "de-art-hq",
            "Артиллерийский полк",
            "Будущий штаб"
          ),
          {
            id: "de-art-bison",
            type: "unit",
            title: "Bison I",
            cardId: "sig_33_pzi",
            experienceCost: 460,
            purchaseCost: 3400,
            status: "locked",
          },
          {
            id: "de-art-wespe",
            type: "unit",
            title: "Wespe",
            cardId: "wespe",
            experienceCost: 720,
            purchaseCost: 5800,
            status: "locked",
          },
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description: "Снабжение, ремонт и медицинское обеспечение.",
        nodes: [
          {
            id: "de-rear-mercedes",
            type: "unit",
            title: "Mercedes G3a",
            cardId: "mercedes_g3a",
            experienceCost: 100,
            purchaseCost: 700,
            status: "unlocked",
          },
          {
            id: "de-rear-adler",
            type: "unit",
            title: "Adler Type 10 N",
            cardId: "adler_type_10_n",
            experienceCost: 180,
            purchaseCost: 1200,
            status: "researchable",
          },
          plannedHeadquarters("de-rear-hq", "Тыловое управление", "Будущий штаб"),
          {
            id: "de-rear-medical",
            type: "unit",
            title: "Sanitätskraftwagen",
            cardId: "sanitaetskraftwagen",
            experienceCost: 330,
            purchaseCost: 2200,
            status: "locked",
          },
          plannedUnit("de-rear-workshop", "Ремонтная рота", "Будущая карта"),
        ],
      },
    ],
  },

  ussr: {
    nation: "ussr",
    title: "СССР",
    subtitle: "Бронетанковые и механизированные войска",
    starterHeadquarters: {
      id: "ussr-training-unit",
      type: "headquarters",
      title: "Учебная часть",
      subtitle: "Учебный штаб",
      headquartersId: "training_unit",
      status: "unlocked",
    },
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
          plannedHeadquarters("ussr-tank-hq", "Танковая бригада", "Будущий штаб"),
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
          plannedUnit("ussr-motor-ba10", "БА-10", "Будущая карта"),
          plannedUnit("ussr-motor-btr", "БТР-40", "Будущая карта"),
          plannedHeadquarters("ussr-motor-hq", "Механизированная бригада", "Будущий штаб"),
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
          plannedHeadquarters("ussr-art-hq", "Артиллерийский полк", "Будущий штаб"),
          plannedUnit("ussr-art-katyusha", "БМ-13 «Катюша»", "Будущая карта"),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description: "Автотранспорт, ремонт и медицина.",
        nodes: [
          plannedUnit("ussr-rear-zis5", "ЗиС-5", "Будущая карта"),
          plannedUnit("ussr-rear-medical", "Санитарный фургон", "Будущая карта"),
          plannedHeadquarters("ussr-rear-hq", "Управление тыла", "Будущий штаб"),
          plannedUnit("ussr-rear-workshop", "Полевая мастерская", "Будущая карта"),
        ],
      },
    ],
  },

  usa: {
    nation: "usa",
    title: "США",
    subtitle: "Armored Forces",
    starterHeadquarters: {
      id: "usa-training-camp",
      type: "headquarters",
      title: "Training Camp",
      subtitle: "Учебный штаб",
      headquartersId: "training_camp",
      status: "unlocked",
    },
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
          plannedHeadquarters("usa-tank-hq", "Armored Division", "Будущий штаб"),
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
          plannedUnit("usa-motor-greyhound", "M8 Greyhound", "Будущая карта"),
          plannedHeadquarters("usa-motor-hq", "Armored Infantry HQ", "Будущий штаб"),
          plannedUnit("usa-motor-infantry", "Armored Infantry", "Будущая карта"),
        ],
      },
      {
        id: "artillery",
        title: "Артиллерийские штабы",
        shortTitle: "Артиллерия",
        description: "Самоходные гаубицы и противотанковые части.",
        nodes: [
          plannedUnit("usa-art-m7", "M7 Priest", "Будущая карта"),
          plannedUnit("usa-art-m10", "M10 Wolverine", "Будущая карта"),
          plannedHeadquarters("usa-art-hq", "Field Artillery HQ", "Будущий штаб"),
          plannedUnit("usa-art-m36", "M36 Jackson", "Будущая карта"),
        ],
      },
      {
        id: "rear",
        title: "Тыловые штабы",
        shortTitle: "Тыловые",
        description: "Снабжение передовых частей и эвакуация раненых.",
        nodes: [
          plannedUnit("usa-rear-gmc", "GMC CCKW", "Будущая карта"),
          {
            id: "usa-rear-ambulance",
            type: "unit",
            title: "WC-54 Ambulance",
            cardId: "dodge_wc54",
            experienceCost: 180,
            purchaseCost: 1200,
            status: "researchable",
          },
          plannedHeadquarters("usa-rear-hq", "Service Command", "Будущий штаб"),
          plannedUnit("usa-rear-workshop", "Field Workshop", "Будущая карта"),
        ],
      },
    ],
  },
};

export const RESEARCH_NATIONS: ResearchNation[] = ["germany", "ussr", "usa"];
