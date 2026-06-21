import type { HeadquartersAbility, TankClass, TankCard } from "./types";

/** Genitive-plural label of a unit class for ability descriptions. */
function getClassLabel(unitClass: TankClass): string {
  switch (unitClass) {
    case "light":
      return "лёгких танков";
    case "medium":
      return "средних танков";
    case "heavy":
      return "тяжёлых танков";
    case "td":
      return "ПТ-САУ";
    case "spg":
      return "САУ";
    default:
      return "юнитов";
  }
}

/**
 * A single explanatory entry shown beside the enlarged card view. Each entry
 * describes either the unit's type (always present) or one of its special
 * mechanics (blitz, deploy effects, support effects, …) — mirroring the
 * keyword glossary panel of card games like KARDS.
 */
export type CardKeyword = {
  id: string;
  /** Short uppercase heading, e.g. "ТАНК", "БЛИЦ". */
  title: string;
  /** One or two sentences explaining the mechanic in plain language. */
  body: string;
};

function getVehicleTypeKeyword(card: TankCard): CardKeyword {
  if (card.deploymentZone === "support") {
    switch (card.supportRole) {
      case "artillery":
        return {
          id: "type",
          title: "АРТИЛЛЕРИЯ",
          body: "Карта поддержки. Выходит в одну из трёх ячеек тыловой линии рядом со штабом и усиливает вашу армию, не выходя на поле боя.",
        };
      case "transport":
        return {
          id: "type",
          title: "АВТОТРАНСПОРТ",
          body: "Карта поддержки тыловой линии. Обеспечивает снабжение: даёт топливо и помогает добирать карты.",
        };
      case "medical":
        return {
          id: "type",
          title: "МЕДСЛУЖБА",
          body: "Карта поддержки тыловой линии. В начале хода восстанавливает здоровье вашим юнитам или штабу.",
        };
      default:
        return {
          id: "type",
          title: "ПОДДЕРЖКА",
          body: "Карта поддержки. Выходит в тыловую линию рядом со штабом и не участвует в бою напрямую.",
        };
    }
  }

  switch (card.class) {
    case "light":
      return {
        id: "type",
        title: "ЛЁГКИЙ ТАНК",
        body: "За ход проходит до двух клеток по прямой или одну по диагонали и может двигаться и атаковать после выхода на поле боя.",
      };
    case "medium":
      return {
        id: "type",
        title: "СРЕДНИЙ ТАНК",
        body: "Перемещается на одну клетку в любую сторону, включая диагональ, и может двигаться и атаковать в один ход.",
      };
    case "heavy":
      return {
        id: "type",
        title: "ТЯЖЁЛЫЙ ТАНК",
        body: "За ход либо передвигается на одну клетку, либо атакует — но не то и другое сразу.",
      };
    case "td":
      return {
        id: "type",
        title: "ПТ-САУ",
        body: "Бьёт только по соседним клеткам, но если его атакуют в ближнем бою — открывает огонь первым (засада).",
      };
    case "spg":
      return {
        id: "type",
        title: "САУ",
        body: "Стреляет по любой цели независимо от расстояния и не получает ответного удара, но уязвима вблизи.",
      };
    default:
      return {
        id: "type",
        title: "ТАНК",
        body: "Может и передвигаться, и атаковать в один ход.",
      };
  }
}

function getAbilityKeywords(card: TankCard): CardKeyword[] {
  const keywords: CardKeyword[] = [];

  if (card.combatAbilities?.blitz) {
    keywords.push({
      id: "blitz",
      title: "БЛИЦ",
      body: "Сразу после выхода на поле боя юнит может полноценно двигаться и атаковать в тот же ход, не дожидаясь следующего.",
    });
  }

  if (card.combatAbilities?.lightScreen) {
    keywords.push({
      id: "lightScreen",
      title: "ЭКРАН",
      body: "Раз за ход первый удар, нацеленный на дружественный лёгкий танк, перенаправляется в этот юнит.",
    });
  }

  if (card.combatAbilities?.tankDefenseAura) {
    keywords.push({
      id: "tankDefenseAura",
      title: "КОМАНДНАЯ МАШИНА",
      body: `Пока этот юнит в строю, каждый ваш танк на поле получает −${card.combatAbilities.tankDefenseAura} к входящему урону от каждого удара.`,
    });
  }

  if (card.combatAbilities?.camouflage) {
    keywords.push({
      id: "camouflage",
      title: "МАСКИРОВКА",
      body: "Этот юнит нельзя атаковать дистанционно, из САУ или штабом — только соседним юнитом в ближнем бою. Маскировка спадает навсегда, как только юнит сам атакует.",
    });
  }

  if (card.combatAbilities?.attackEqualsHq) {
    keywords.push({
      id: "attackEqualsHq",
      title: "КОРРЕКТИРОВЩИК",
      body: "Огневая мощь этого юнита равна текущей огневой мощи вашего штаба (со всеми бонусами), а не значению на карте.",
    });
  }

  if (card.combatAbilities?.armorVsClass) {
    const armor = card.combatAbilities.armorVsClass;
    keywords.push({
      id: "armorVsClass",
      title: "СПЕЦБРОНЯ",
      body: `Каждый удар по этому юниту со стороны ${getClassLabel(
        armor.class
      )} слабее на ${armor.amount}.`,
    });
  }

  if (card.combatAbilities?.drawWhenAttacked) {
    keywords.push({
      id: "drawWhenAttacked",
      title: "ДОЗОР",
      body: `Когда этот юнит получает урон, вы добираете ${
        card.combatAbilities.drawWhenAttacked === 1
          ? "карту"
          : `${card.combatAbilities.drawWhenAttacked} карты`
      } (раз за ход).`,
    });
  }

  if (card.combatAbilities?.cornerBonus) {
    const corner = card.combatAbilities.cornerBonus;
    const parts: string[] = [];
    if (corner.attack) parts.push(`+${corner.attack} к огневой мощи`);
    if (corner.hp) parts.push(`+${corner.hp} к прочности`);

    keywords.push({
      id: "cornerBonus",
      title: "ОГНЕВАЯ ПОЗИЦИЯ",
      body: `Пока эта САУ стоит в угловой клетке поля, она получает ${parts.join(
        " и "
      )}.`,
    });
  }

  if (card.combatAbilities?.spawnDamageReduction) {
    keywords.push({
      id: "spawnDamageReduction",
      title: "ОБОРОНА ПЛАЦДАРМА",
      body: `Пока этот юнит находится на вашем плацдарме (клетке спавна), каждый удар по нему слабее на ${card.combatAbilities.spawnDamageReduction}.`,
    });
  }

  if (card.combatAbilities?.raidDraw) {
    keywords.push({
      id: "raidDraw",
      title: "ПРОРЫВ",
      body: `Когда этот юнит впервые заходит на клетку плацдарма противника, вы добираете ${
        card.combatAbilities.raidDraw === 1
          ? "карту"
          : `${card.combatAbilities.raidDraw} карты`
      }.`,
    });
  }

  if (card.costModifiers) {
    keywords.push({
      id: "costModifiers",
      title: "СЛАЖЕННОСТЬ",
      body: `Пока у вас на поле боя есть юнит класса «${getClassLabel(
        card.costModifiers.ifClassPresent
      )}», эта карта дешевле на ${card.costModifiers.discount} топлива.`,
    });
  }

  if (card.onPlayEffects?.suppressEnemyIndirect) {
    keywords.push({
      id: "suppressEnemyIndirect",
      title: "КОНТРБАТАРЕЙНЫЙ ОГОНЬ",
      body: "При выходе на поле боя все САУ и штаб противника не могут атаковать до конца их следующего хода.",
    });
  }

  const draw = card.onPlayEffects?.draw ?? 0;
  const hqProtection = card.onPlayEffects?.hqProtection ?? 0;

  if (draw > 0) {
    keywords.push({
      id: "deploy-draw",
      title: "РАЗВЕДКА",
      body: `Разведка срабатывает при выходе отряда на поле боя: вы добираете ${draw === 1 ? "карту" : `${draw} карты`} из колоды.`,
    });
  }

  if (hqProtection > 0) {
    keywords.push({
      id: "deploy-hq",
      title: "ПРИКРЫТИЕ",
      body: `Прикрытие срабатывает при выходе отряда на поле боя: ваш штаб получает +${hqProtection} к здоровью.`,
    });
  }

  return keywords;
}

function getSupportEffectKeywords(card: TankCard): CardKeyword[] {
  const effects = card.supportEffects;
  if (!effects) return [];

  const keywords: CardKeyword[] = [];

  if (effects.hqAttackBonus) {
    keywords.push({
      id: "fx-hqAttack",
      title: "ОГНЕВАЯ ПОДДЕРЖКА",
      body: `Ваш штаб наносит на +${effects.hqAttackBonus} урона больше.`,
    });
  }

  if (effects.hqDamageRedirect) {
    keywords.push({
      id: "fx-redirect",
      title: "ЗАСЛОН ШТАБА",
      body: `Принимает на себя до ${effects.hqDamageRedirect} урона, который шёл бы в ваш штаб.`,
    });
  }

  if (effects.supportLineCover) {
    keywords.push({
      id: "fx-cover",
      title: "ПРИКРЫТИЕ ТЫЛА",
      body: `Защищает тыловую линию: удары по союзной поддержке принимает этот юнит, отвечая ${effects.supportLineCover} урона в ближнем бою (раз за ход).`,
    });
  }

  if (effects.fuelPerTurn) {
    keywords.push({
      id: "fx-fuel",
      title: "СНАБЖЕНИЕ",
      body: `В начале вашего хода вы получаете +${effects.fuelPerTurn} топлива.`,
    });
  }

  if (effects.drawEveryTurns) {
    keywords.push({
      id: "fx-draw",
      title: "РАЗВЕДКА",
      body: `Каждые ${effects.drawEveryTurns} ваших хода вы добираете дополнительную карту.`,
    });
  }

  if (effects.fetchSupportCardEveryTurns) {
    keywords.push({
      id: "fx-fetch",
      title: "ПОДВОЗ РЕЗЕРВОВ",
      body: `Каждые ${effects.fetchSupportCardEveryTurns} хода переносит случайную карту поддержки из колоды в руку.`,
    });
  }

  if (effects.healRandomUnitPerTurn) {
    keywords.push({
      id: "fx-heal",
      title: "ПОЛЕВОЙ ГОСПИТАЛЬ",
      body: `В начале хода восстанавливает ${effects.healRandomUnitPerTurn} здоровья случайному повреждённому юниту${
        effects.healClass ? " выбранного класса" : ""
      }.`,
    });
  }

  if (effects.hqHealPerTurn) {
    keywords.push({
      id: "fx-hqHeal",
      title: "РЕМОНТ ШТАБА",
      body: `В начале хода восстанавливает ${effects.hqHealPerTurn} здоровья вашему штабу.`,
    });
  }

  return keywords;
}

/**
 * Builds the ordered list of glossary entries for an enlarged unit card: the
 * vehicle type first, then any special mechanics it carries.
 */
export function getCardKeywords(card: TankCard): CardKeyword[] {
  return [
    getVehicleTypeKeyword(card),
    ...getAbilityKeywords(card),
    ...getSupportEffectKeywords(card),
  ];
}

function getHeadquartersAbilityKeyword(
  ability: HeadquartersAbility
): CardKeyword | null {
  const title = ability.name.toUpperCase();

  if (ability.firstTankBlitz) {
    return {
      id: "hq-firstTankBlitz",
      title,
      body: "Первый танк, сыгранный за ход, выходит с эффектом «Блиц» — может сразу двигаться и атаковать.",
    };
  }

  if (ability.lightUnitsBlitz) {
    return {
      id: "hq-lightUnitsBlitz",
      title,
      body: "Лёгкие юниты выходят на поле боя с эффектом «Блиц» — могут сразу двигаться и атаковать.",
    };
  }

  if (ability.firstUnitFuelDiscount) {
    return {
      id: "hq-fuelDiscount",
      title,
      body: `Первый юнит, сыгранный за ход, обходится на ${ability.firstUnitFuelDiscount} топлива дешевле.`,
    };
  }

  if (ability.stationaryTankAttackBonus) {
    const toughness = ability.stationaryTankHpBonus
      ? ` Кроме того, каждый удар по такому танку слабее на ${ability.stationaryTankHpBonus}.`
      : "";
    return {
      id: "hq-stationary",
      title,
      body: `Ваши танки, не двигавшиеся в этот ход, наносят на +${ability.stationaryTankAttackBonus} урона больше.${toughness}`,
    };
  }

  if (ability.movedTankAttackBonus) {
    return {
      id: "hq-moved",
      title,
      body: `Ваши танки, продвинувшиеся в этот ход, наносят на +${ability.movedTankAttackBonus} урона больше — удар на острие наступления.`,
    };
  }

  if (ability.hqAttackBonusVsDamaged) {
    return {
      id: "hq-vsDamaged",
      title,
      body: `Штаб наносит на +${ability.hqAttackBonusVsDamaged} урона больше по уже повреждённым целям.`,
    };
  }

  if (ability.hqAttackBonus) {
    return {
      id: "hq-attackBonus",
      title,
      body: `Штаб наносит на +${ability.hqAttackBonus} урона больше.`,
    };
  }

  if (ability.drawEveryTurns) {
    return {
      id: "hq-draw",
      title,
      body: `В начале каждого ${ability.drawEveryTurns}-го вашего хода вы добираете дополнительную карту.`,
    };
  }

  if (ability.healRandomUnitPerTurn) {
    return {
      id: "hq-heal",
      title,
      body: `В начале хода восстанавливает ${ability.healRandomUnitPerTurn} здоровья случайному повреждённому юниту.`,
    };
  }

  if (ability.combinedArmsFuelBonus) {
    return {
      id: "hq-combinedArms",
      title,
      body: `Пока у вас одновременно есть и танк, и юнит поддержки, вы получаете +${ability.combinedArmsFuelBonus} топлива за ход.`,
    };
  }

  if (ability.firstLightUnitHqProtection) {
    return {
      id: "hq-firstLightProtection",
      title,
      body: `Первый лёгкий юнит, сыгранный за ход, добавляет штабу +${ability.firstLightUnitHqProtection} здоровья.`,
    };
  }

  if (ability.hqAttackIgnoresCover) {
    return {
      id: "hq-ignoresCover",
      title,
      body: "Атаки штаба нельзя перехватить прикрывающими юнитами тыловой линии.",
    };
  }

  if (ability.returnFirstDestroyedUnit) {
    return {
      id: "hq-returnUnit",
      title,
      body: "Раз за бой первый уничтоженный ваш юнит возвращается к вам в руку.",
    };
  }

  return null;
}

/**
 * Builds the glossary entries for an enlarged headquarters card: a short
 * intro about what a headquarters is, followed by its special ability.
 */
export function getHeadquartersKeywords(
  ability: HeadquartersAbility | null | undefined
): CardKeyword[] {
  const keywords: CardKeyword[] = [
    {
      id: "hq-type",
      title: "ШТАБ",
      body: "Командный пункт вашей армии. Генерирует топливо каждый ход; если его здоровье падает до нуля — вы проигрываете бой.",
    },
  ];

  if (ability) {
    const abilityKeyword = getHeadquartersAbilityKeyword(ability);
    if (abilityKeyword) {
      keywords.push(abilityKeyword);
    }
  }

  return keywords;
}
