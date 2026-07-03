import { getSettings } from "./settings";
import type { HeadquartersDefinition } from "./headquarters";
import type { Nation, SupportRole, TankCard, TankClass } from "./types";

type LocaleText = {
  ru: string;
  en: string;
};

const NATION_LABELS: Record<Nation, LocaleText & { shortRu: string; shortEn: string }> = {
  france: { ru: "Франция", en: "France", shortRu: "ФР", shortEn: "FR" },
  germany: { ru: "Германия", en: "Germany", shortRu: "ГЕР", shortEn: "GER" },
  poland: { ru: "Польша", en: "Poland", shortRu: "ПЛ", shortEn: "PL" },
  uk: { ru: "Британия", en: "Britain", shortRu: "БР", shortEn: "UK" },
  usa: { ru: "США", en: "USA", shortRu: "США", shortEn: "USA" },
  ussr: { ru: "СССР", en: "USSR", shortRu: "СССР", shortEn: "USSR" },
};

const CLASS_LABELS: Record<TankClass, LocaleText> = {
  light: { ru: "Лёгкий танк", en: "Light tank" },
  medium: { ru: "Средний танк", en: "Medium tank" },
  heavy: { ru: "Тяжёлый танк", en: "Heavy tank" },
  td: { ru: "ПТ-САУ", en: "Tank destroyer" },
  spg: { ru: "САУ", en: "SPG" },
  armored_car: { ru: "Бронеавтомобиль", en: "Armored car" },
};

const SUPPORT_ROLE_LABELS: Record<SupportRole, LocaleText> = {
  artillery: { ru: "Артиллерия", en: "Artillery" },
  medical: { ru: "Медицина", en: "Medical unit" },
  transport: { ru: "Транспорт", en: "Transport" },
};

const HEADQUARTERS_TYPE_TRANSLATIONS: Record<string, string> = {
  "Учебная часть": "Training headquarters",
  "Учебный штаб": "Training headquarters",
  "Полевой штаб": "Field headquarters",
  "Армейский штаб": "Army headquarters",
  "Резервный штаб": "Reserve headquarters",
  "Укреплённый штаб": "Fortified headquarters",
  "Танковый штаб": "Armored headquarters",
  "Танковая дивизия": "Armored division",
  "Гвардейский танковый штаб": "Guards armored headquarters",
  "Стрелковый штаб": "Rifle headquarters",
  "Мотопехотный штаб": "Motorized infantry headquarters",
  "Артиллерийский штаб": "Artillery headquarters",
  "Тыловой штаб": "Rear headquarters",
  "Командный пункт": "Command post",
};

const CARD_ABILITY_TEXT_TRANSLATIONS: Record<string, string> = {
  "+1 к атаке штаба и противотанковый заслон тыловой линии.":
    "+1 headquarters attack and an anti-tank screen for the rear line.",
  "+1 к атаке штаба.": "+1 headquarters attack.",
  "+1 топлива и добор карты каждый третий ход":
    "+1 fuel and draw a card every third turn.",
  "+1 топлива, +1 к атаке штаба и отвечает огнём на ближние атаки.":
    "+1 fuel, +1 headquarters attack, and returns fire in close combat.",
  "+1 топлива. Перехватывает удары по лёгким и средним танкам, принимая огонь на себя.":
    "+1 fuel. Screens light and medium tanks by drawing fire onto itself.",
  "+2 топлива. При выходе добавляет в руку артиллерию тыла из колоды.":
    "+2 fuel. On deployment, adds a rear-line artillery card from your deck to your hand.",
  "Амфибия-снабженец: +1 топлива в ход и добирает карту каждый третий ход.":
    "Amphibious supply vehicle: +1 fuel per turn and draws a card every third turn.",
  "Армейский грузовик: +1 топлива каждый ход.":
    "Army truck: +1 fuel each turn.",
  "Бронепоезд.": "Armored train.",
  "Быстроходный кавалерийский танк: рвётся в прорыв.":
    "Fast cavalry tank: built to break through.",
  "В начале хода восстанавливает 1 HP случайному повреждённому юниту.":
    "At the start of your turn, restores 1 HP to a random damaged unit.",
  "В начале хода лечит 1 повреждённый юнит.":
    "At the start of your turn, repairs 1 damaged unit.",
  "В начале хода лечит 2 HP повреждённому юниту и даёт штабу +1 HP.":
    "At the start of your turn, restores 2 HP to a damaged unit and gives your headquarters +1 HP.",
  "В начале хода чинит 2 HP случайному повреждённому юниту.":
    "At the start of your turn, repairs 2 HP on a random damaged unit.",
  "Встречает рейды на тыл огнём и принимает дистанционные удары на себя.":
    "Fires on rear-line raids and absorbs incoming ranged fire.",
  "Вьючная гаубица: +1 к атаке штаба.":
    "Pack howitzer: +1 headquarters attack.",
  "Даёт +1 к атаке штаба и +1 топливо каждый ход.":
    "+1 headquarters attack and +1 fuel each turn.",
  "Даёт +1 топливо и даёт штабу +1 HP в начале хода.":
    "+1 fuel and gives your headquarters +1 HP at the start of your turn.",
  "Даёт +1 топливо и помогает штабу вести огонь точнее: +1 к атаке.":
    "+1 fuel and helps the headquarters fire more accurately: +1 attack.",
  "Даёт +2 топлива в ход.": "+2 fuel per turn.",
  "Даёт +2 топлива, добирает карту каждый третий ход.":
    "+2 fuel and draws a card every third turn.",
  "Дивизионная гаубица: +2 к атаке штаба.":
    "Divisional howitzer: +2 headquarters attack.",
  "Дизельный В-2: дальнобойный разведчик, добирает карту под огнём.":
    "V-2 diesel: long-range scout, draws a card when under fire.",
  "Добор карты каждый второй ход. отвечает на ближние атаки. +1 топливо":
    "Draws a card every second turn. Returns fire in close combat. +1 fuel.",
  "Каждый второй ход доставляет в руку случайную карту поддержки из колоды.":
    "Every second turn, moves a random support card from your deck to your hand.",
  "Командная машина: пока в строю, каждый ваш танк получает −1 к входящему урону.":
    "Command vehicle: while operational, each of your tanks takes −1 incoming damage.",
  "Лечит 1 повреждённый юнит и восстанавливает +1 прочности штаба в начале каждого хода.":
    "Repairs 1 damaged unit and restores +1 headquarters HP at the start of each turn.",
  "Лечит 1 повреждённый юнит каждый ход и добирает карту каждый третий ход.":
    "Repairs 1 damaged unit each turn and draws a card every third turn.",
  "Лобовая броня: −2 урона при ударе со стороны вражеского штаба. Фланг и тыл пробиваются.":
    "Frontal armor: −2 damage from attacks coming from the enemy headquarters side. Flanks and rear are vulnerable.",
  "Машина аса Лавриненко": "Lavrinenko's ace tank.",
  "Мотодозор разведбата: добор карты каждый второй ход.":
    "Recon battalion motorcycle patrol: draw a card every second turn.",
  "Опасен вблизи.": "Dangerous at close range.",
  "Позволяет добирать дополнительную карту каждый второй ход.":
    "Allows you to draw an extra card every second turn.",
  "Пока в строю — все ваши танки получают −1 к каждому входящему удару.":
    "While operational, all your tanks take −1 damage from each incoming hit.",
  "Пока в строю, каждый ваш танк получает −1 к входящему урону.":
    "While operational, each of your tanks takes −1 incoming damage.",
  "Полковая пушка: +1 к атаке штаба.":
    "Regimental gun: +1 headquarters attack.",
  "При выхде на поле добирает 2 карты":
    "On deployment, draw 2 cards.",
  "При выходе на поле боя добавляет в руку случайный Т-34 из колоды.":
    "On deployment, adds a random T-34 from your deck to your hand.",
  "При выходе на поле добирает карту.":
    "On deployment, draw a card.",
  "Ремонтная мастерская": "Repair workshop.",
  "Связная разведмашина: добор карты каждый второй ход.":
    "Liaison scout vehicle: draw a card every second turn.",
  "Сильное прикрытие штаба при обороне.":
    "Strong headquarters cover while defending.",
  "Увеличивает атаку штаба и принимает часть урона на себя.":
    "Increases headquarters attack and absorbs part of incoming damage.",
  "Увеличивает атаку штаба на 2": "Increases headquarters attack by 2.",
  "Штабной кабриолет: +1 к атаке штаба и перехватывает 1 урон по штабу.":
    "Headquarters staff car: +1 headquarters attack and intercepts 1 damage aimed at the headquarters.",
};

export function getLocalizedNationLabel(
  nation: Nation,
  language = getSettings().language
) {
  return NATION_LABELS[nation]?.[language] ?? NATION_LABELS[nation]?.ru ?? nation;
}

export function getLocalizedNationShortLabel(
  nation: Nation,
  language = getSettings().language
) {
  const labels = NATION_LABELS[nation];
  if (!labels) return nation;
  return language === "en" ? labels.shortEn : labels.shortRu;
}

export function getLocalizedClassLabel(
  unitClass: TankClass,
  language = getSettings().language
) {
  return CLASS_LABELS[unitClass]?.[language] ?? CLASS_LABELS[unitClass]?.ru ?? unitClass;
}

export function getLocalizedSupportRoleLabel(
  supportRole: SupportRole | undefined,
  language = getSettings().language
) {
  if (!supportRole) return language === "en" ? "Support" : "Поддержка";
  return SUPPORT_ROLE_LABELS[supportRole]?.[language] ?? supportRole;
}

export function getLocalizedCardClassLabel(
  card: TankCard,
  language = getSettings().language
) {
  return card.deploymentZone === "support"
    ? getLocalizedSupportRoleLabel(card.supportRole, language)
    : getLocalizedClassLabel(card.class, language);
}

export function getLocalizedUnitTypeFilterLabel(
  value: "all" | TankClass | "support" | "headquarters",
  language = getSettings().language,
  allLabel?: string
) {
  if (value === "all") {
    return allLabel ?? (language === "en" ? "All" : "Все");
  }

  if (value === "support") {
    return language === "en" ? "Rear" : "Тыл";
  }

  if (value === "headquarters") {
    return language === "en" ? "Headquarters" : "Штабы";
  }

  return getLocalizedClassLabel(value, language);
}

export function getLocalizedNationFilterLabel(
  value: "all" | Nation,
  language = getSettings().language,
  allLabel?: string
) {
  if (value === "all") {
    return allLabel ?? (language === "en" ? "All" : "Все");
  }

  return getLocalizedNationLabel(value, language);
}

export function getLocalizedHeadquartersType(
  headquarters: HeadquartersDefinition | null | undefined,
  language = getSettings().language
) {
  const value = headquarters?.type ?? headquarters?.subtitle ?? "Командный пункт";
  if (language === "ru") return value;
  return HEADQUARTERS_TYPE_TRANSLATIONS[value] ?? value;
}

export function getLocalizedCardAbilityText(
  card: TankCard,
  language = getSettings().language
) {
  const text = card.abilityText?.trim() ?? "";
  if (language === "ru" || !text) return text;
  return CARD_ABILITY_TEXT_TRANSLATIONS[text] ?? text;
}

export function getLocalizedHeadquartersDescription(
  headquarters: HeadquartersDefinition | null | undefined,
  language = getSettings().language
) {
  const description = headquarters?.description ?? "Командный пункт.";
  if (language === "ru") return description;

  if (!headquarters) return "Command post.";

  return (
    HEADQUARTERS_DESCRIPTION_TRANSLATIONS[headquarters.id] ??
    HEADQUARTERS_DESCRIPTION_TRANSLATIONS[description] ??
    description
  );
}

const HEADQUARTERS_DESCRIPTION_TRANSLATIONS: Record<string, string> = {
  "Командный пункт.": "Command post.",
  training_unit:
    "Soviet training headquarters with balanced stats: steady attack, durability, and supply.",
  trainingslager:
    "German training camp with strong headquarters attack, average durability, and modest supply.",
  training_camp:
    "Weak headquarters with strong supply and fast resource growth.",
  first_panzer_division:
    "Armored Spearhead: the first tank played each turn gains Blitz, allowing two moves on the turn it enters the battlefield.",
  german_motorized_division:
    "Motorized March: the first unit played each turn costs 1 less fuel.",
  german_artillery_division:
    "Rear Strike: HQ hits the enemy rear and HQ for +1, but your own rear and HQ take +1 from light vehicles.",
  german_rear_corps:
    "Scheduled Supply: every third friendly turn, draw an extra card.",
  soviet_tank_brigade:
    "Tank Ambush: a tank that has not moved this turn deals +1 damage and takes 1 less incoming damage.",
  soviet_motor_rifle_division:
    "Rapid Redeployment: light units gain Blitz, allowing two moves on the turn they enter the battlefield.",
  soviet_guards_mortar_regiment:
    "Katyusha Salvo: headquarters attacks deal +1 damage to already damaged targets.",
  soviet_auto_battalion:
    "Repair Columns: at the start of your turn, restore 1 health to a random damaged unit.",
  usa_old_ironsides:
    "Combined Arms: while you have both a tank and a support unit, the headquarters generates +1 fuel each turn.",
  usa_armored_infantry_regiment:
    "Armored Infantry: the first light unit played each turn gives your headquarters +1 health.",
  usa_armored_artillery_battalion:
    "Time on Target: headquarters attacks cannot be intercepted by rear-line cover units.",
  usa_maintenance_battalion:
    "Recovery and Repair: once per battle, your first destroyed unit returns to your hand.",
  polish_border_guard:
    "Forward Polish position. Light vehicles and tankettes quickly occupy key cells.",
  polish_army_lodz:
    "Fortified army headquarters supported by 7TP tanks and anti-tank tankettes. Stronger at holding a defensive line.",
  polish_army_prusy:
    "Reserve formation with improved tanks and self-propelled artillery. Builds pressure in a longer fight.",
  polish_warsaw_defense:
    "The last defensive line. Armored trains, reserve tanks, and improved supply make it the most dangerous Polish headquarters.",
  lavrinenko_tank_brigade:
    "Tank Ambush: a tank that has not moved this turn deals +1 damage and takes 1 less incoming damage.",
  first_guards_tank_brigade:
    "Guards Ambush: a stationary tank deals +2 damage and takes 1 less incoming damage; the first tank played each turn gains Blitz.",
  panfilov_division:
    "Hold to the Last: strong line defense. At the start of your turn, restore 1 headquarters health.",
  german_4_panzer:
    "Armored Assault: tanks that moved this turn deal +1 damage at the spearhead of the attack.",
  guderian_corps:
    "Breakthrough Spearhead: a unit that breaks into the enemy rear pushes deeper.",
  german_10_panzer:
    "Artillery Preparation: headquarters attacks deal +1 damage.",
  german_11_panzer:
    "Motorized March: the first unit played each turn costs 1 less fuel.",
  grossdeutschland:
    "Unbending Regiment: once per battle, your first destroyed unit returns to your hand.",
  german_winter_panzer:
    "Armored Assault in winter conditions: moving tanks still hit harder, but frozen fuel sharply reduces supply.",
  soviet_central_front:
    "Tank Ram: tanks that moved this turn deal +1 damage at the spearhead of the counterattack.",
  german_9th_army:
    "Steel Wedge: heavy tanks and tank destroyers under this headquarters take 1 less damage from each hit.",
  winter_blocking_force:
    "Dense Anti-Tank Fire: headquarters attacks deal +1 damage to already damaged vehicles, but winter reduces supply.",
};
