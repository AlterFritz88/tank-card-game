import type { HeadquartersAbility, Nation, TankClass, TankCard } from "./types";
import { getNationalAbility } from "./nationalAbilities";
import { getSettings, type Language } from "./settings";
import { getLocalizedClassLabel } from "./cardLocalization";

/** Genitive-plural label of a unit class for ability descriptions. */
function getClassLabel(unitClass: TankClass, language: Language = "ru"): string {
  if (language === "en") {
    return getLocalizedClassLabel(unitClass, language).toLowerCase();
  }

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
    case "armored_car":
      return "бронеавтомобилей";
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

function getVehicleTypeKeyword(card: TankCard, language: Language): CardKeyword {
  if (language === "en") {
    if (card.deploymentZone === "support") {
      switch (card.supportRole) {
        case "artillery":
          return {
            id: "type",
            title: "ARTILLERY",
            body: "Support card. Deploys into one of the three rear-line slots next to your headquarters and strengthens your army without entering the main battlefield.",
          };
        case "transport":
          return {
            id: "type",
            title: "TRANSPORT",
            body: "Rear-line support card. Provides supply: fuel and card draw.",
          };
        case "medical":
          return {
            id: "type",
            title: "MEDICAL UNIT",
            body: "Rear-line support card. Restores health to your units or headquarters at the start of your turn.",
          };
        default:
          return {
            id: "type",
            title: "SUPPORT",
            body: "Support card. Deploys to the rear line next to your headquarters and does not fight directly.",
          };
      }
    }

    switch (card.class) {
      case "light":
        return {
          id: "type",
          title: "LIGHT TANK",
          body: "Can move up to two cells in a straight line or one cell diagonally, and can move and attack on the turn it is deployed.",
        };
      case "medium":
        return {
          id: "type",
          title: "MEDIUM TANK",
          body: "Moves one cell in any direction, including diagonally, and can move and attack in the same turn.",
        };
      case "heavy":
        return {
          id: "type",
          title: "HEAVY TANK",
          body: "Each turn it can either move one cell or attack, but not both.",
        };
      case "td":
        return {
          id: "type",
          title: "TANK DESTROYER",
          body: "Attacks adjacent cells only and fires first from ambush when attacked in close combat. It may attack and then move, but if it moves first it cannot attack that turn.",
        };
      case "spg":
        return {
          id: "type",
          title: "SPG",
          body: "Can fire at any target regardless of distance and does not receive return fire, but is vulnerable up close.",
        };
      case "armored_car":
        return {
          id: "type",
          title: "ARMORED CAR",
          body: "Highly mobile but lightly protected: moves up to three cells straight or twice diagonally. Can attack twice per turn when attacking the rear line or headquarters. Deals −1 damage from the front and +1 from flank or rear; standard damage against SPGs and armored cars.",
        };
      default:
        return {
          id: "type",
          title: "UNIT",
          body: "Can both move and attack in one turn.",
        };
    }
  }

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
        body: "Бьёт только по соседним клеткам и в засаде открывает огонь первым, если его атакуют в ближнем бою. Может сначала атаковать, а потом сдвинуться, но если сходит с места — атаковать в этот ход уже не сможет.",
      };
    case "spg":
      return {
        id: "type",
        title: "САУ",
        body: "Стреляет по любой цели независимо от расстояния и не получает ответного удара, но уязвима вблизи.",
      };
    case "armored_car":
      return {
        id: "type",
        title: "БРОНЕАВТОМОБИЛЬ",
        body: "Высокомобильная, но слабозащищённая машина: за ход проходит до трёх клеток по прямой или дважды по диагонали. Может атаковать дважды за ход, если бьёт по тылу или штабу. По обычным юнитам с фронта наносит на 1 меньше урона, с фланга или тыла — на 1 больше; по САУ и другим бронеавтомобилям — стандартный урон.",
      };
    default:
      return {
        id: "type",
        title: "ТАНК",
        body: "Может и передвигаться, и атаковать в один ход.",
      };
  }
}

function getAbilityKeywords(card: TankCard, language: Language): CardKeyword[] {
  const keywords: CardKeyword[] = [];

  if (card.combatAbilities?.blitz) {
    keywords.push({
      id: "blitz",
      title: language === "en" ? "BLITZ" : "БЛИЦ",
      body:
        language === "en"
          ? "On the turn this unit is deployed, it can make two normal moves, but it can still attack only once. On later turns it moves normally."
          : "В тот ход, когда юнит выходит на поле, он может сделать два обычных перемещения (двойной запас хода), но атаковать всё равно только один раз. В следующие ходы перемещается как обычно.",
    });
  }

  if (card.combatAbilities?.lightScreen) {
    keywords.push({
      id: "lightScreen",
      title: language === "en" ? "SCREEN" : "ЭКРАН",
      body:
        language === "en"
          ? "Once per turn, the first attack aimed at a friendly light tank is redirected to this unit."
          : "Раз за ход первый удар, нацеленный на дружественный лёгкий танк, перенаправляется в этот юнит.",
    });
  }

  if (card.combatAbilities?.tankDefenseAura) {
    keywords.push({
      id: "tankDefenseAura",
      title: language === "en" ? "COMMAND VEHICLE" : "КОМАНДНАЯ МАШИНА",
      body:
        language === "en"
          ? `While this unit is operational, each of your tanks takes −${card.combatAbilities.tankDefenseAura} incoming damage from each hit.`
          : `Пока этот юнит в строю, каждый ваш танк на поле получает −${card.combatAbilities.tankDefenseAura} к входящему урону от каждого удара.`,
    });
  }

  if (card.combatAbilities?.camouflage) {
    keywords.push({
      id: "camouflage",
      title: language === "en" ? "CAMOUFLAGE" : "МАСКИРОВКА",
      body:
        language === "en"
          ? "This unit cannot be attacked at range by SPGs or headquarters; only an adjacent unit can attack it in close combat. Moving does not break camouflage: it is lost permanently only when the unit fires or an enemy moves adjacent to it."
          : "Этот юнит нельзя атаковать дистанционно, из САУ или штабом — только соседним юнитом в ближнем бою. Передвижение маскировку не снимает: она спадает навсегда, только когда юнит сам открывает огонь или когда вражеский юнит встаёт на соседнюю клетку.",
    });
  }

  if (card.combatAbilities?.attackEqualsHq) {
    keywords.push({
      id: "attackEqualsHq",
      title: language === "en" ? "FORWARD OBSERVER" : "КОРРЕКТИРОВЩИК",
      body:
        language === "en"
          ? "This unit's firepower equals your current headquarters attack, including bonuses, instead of the printed value."
          : "Огневая мощь этого юнита равна текущей огневой мощи вашего штаба (со всеми бонусами), а не значению на карте.",
    });
  }

  if (card.combatAbilities?.armorVsClass) {
    const armor = card.combatAbilities.armorVsClass;
    keywords.push({
      id: "armorVsClass",
      title: language === "en" ? "SPECIAL ARMOR" : "СПЕЦБРОНЯ",
      body:
        language === "en"
          ? `Each hit against this unit from ${getClassLabel(
              armor.class,
              language
            )} units is reduced by ${armor.amount}.`
          : `Каждый удар по этому юниту со стороны ${getClassLabel(
              armor.class
            )} слабее на ${armor.amount}.`,
    });
  }

  if (card.combatAbilities?.frontalArmor) {
    const frontal = card.combatAbilities.frontalArmor;
    keywords.push({
      id: "frontalArmor",
      title: language === "en" ? "FRONTAL ARMOR" : "ЛОБОВАЯ БРОНЯ",
      body:
        language === "en"
          ? `When this unit is hit directly from the front, from the enemy headquarters side, damage is reduced by ${frontal.amount}. Diagonal, flank, and rear attacks deal full damage. SPG and headquarters fire ignores frontal armor.`
          : `Когда по этому юниту бьют строго спереди — из клетки прямо перед ним, со стороны вражеского штаба, — урон слабее на ${frontal.amount}. Диагональные, фланговые и тыловые удары проходят полностью. Огонь САУ и штаба лобовая броня не сдерживает.`,
    });
  }

  if (card.combatAbilities?.drawWhenAttacked) {
    keywords.push({
      id: "drawWhenAttacked",
      title: language === "en" ? "WATCH" : "ДОЗОР",
      body:
        language === "en"
          ? `When this unit takes damage, draw ${card.combatAbilities.drawWhenAttacked} card(s), once per turn.`
          : `Когда этот юнит получает урон, вы добираете ${
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
      title: language === "en" ? "FIRING POSITION" : "ОГНЕВАЯ ПОЗИЦИЯ",
      body:
        language === "en"
          ? `While this SPG is in a corner cell, it gains ${parts.join(" and ")}.`
          : `Пока эта САУ стоит в угловой клетке поля, она получает ${parts.join(
              " и "
            )}.`,
    });
  }

  if (card.combatAbilities?.hqProximityBonus) {
    const bonus = card.combatAbilities.hqProximityBonus.maxBonus;
    keywords.push({
      id: "hqProximityBonus",
      title: language === "en" ? "ROLLING BARRAGE" : "ОГНЕВОЙ ВАЛ",
      body:
        language === "en"
          ? `On its own spawn cell this SPG uses printed firepower. For every cell advanced toward the enemy headquarters it gains +${bonus} firepower.`
          : `На своей клетке спавна эта САУ бьёт с номинальной огневой мощью. За каждую клетку продвижения к штабу противника получает +${bonus} к огневой мощи.`,
    });
  }

  if (card.combatAbilities?.spawnDamageReduction) {
    keywords.push({
      id: "spawnDamageReduction",
      title: language === "en" ? "BRIDGEHEAD DEFENSE" : "ОБОРОНА ПЛАЦДАРМА",
      body:
        language === "en"
          ? `While this unit is on your bridgehead spawn cell, each hit against it is reduced by ${card.combatAbilities.spawnDamageReduction}.`
          : `Пока этот юнит находится на вашем плацдарме (клетке спавна), каждый удар по нему слабее на ${card.combatAbilities.spawnDamageReduction}.`,
    });
  }

  if (card.combatAbilities?.raidDraw) {
    keywords.push({
      id: "raidDraw",
      title: language === "en" ? "BREAKTHROUGH" : "ПРОРЫВ",
      body:
        language === "en"
          ? `When this unit first enters an enemy bridgehead cell, draw ${card.combatAbilities.raidDraw} card(s).`
          : `Когда этот юнит впервые заходит на клетку плацдарма противника, вы добираете ${
              card.combatAbilities.raidDraw === 1
                ? "карту"
                : `${card.combatAbilities.raidDraw} карты`
            }.`,
    });
  }

  if (card.costModifiers) {
    keywords.push({
      id: "costModifiers",
      title: language === "en" ? "COORDINATION" : "СЛАЖЕННОСТЬ",
      body:
        language === "en"
          ? `While you have a ${getClassLabel(
              card.costModifiers.ifClassPresent,
              language
            )} unit on the battlefield, this card costs ${card.costModifiers.discount} less fuel.`
          : `Пока у вас на поле боя есть юнит класса «${getClassLabel(
              card.costModifiers.ifClassPresent
            )}», эта карта дешевле на ${card.costModifiers.discount} топлива.`,
    });
  }

  if (card.onPlayEffects?.suppressEnemyIndirect) {
    keywords.push({
      id: "suppressEnemyIndirect",
      title: language === "en" ? "COUNTER-BATTERY FIRE" : "КОНТРБАТАРЕЙНЫЙ ОГОНЬ",
      body:
        language === "en"
          ? "On deployment, all enemy SPGs and the enemy headquarters cannot attack until the end of their next turn."
          : "При выходе на поле боя все САУ и штаб противника не могут атаковать до конца их следующего хода.",
    });
  }

  if (card.onPlayEffects?.deployDamage) {
    const deploy = card.onPlayEffects.deployDamage;

    keywords.push({
      id: "deployDamage",
      title: language === "en" ? "FIRE RAID" : "ОГНЕВОЙ НАЛЁТ",
      body:
        language === "en"
          ? deploy.scope === "classes"
            ? `On deployment, deals ${deploy.amount} damage to all enemy units of these classes: ${(
                deploy.classes ?? []
              )
                .map((unitClass) => getClassLabel(unitClass, language))
                .join(", ")}.`
            : deploy.scope === "rear"
              ? `On deployment, deals ${deploy.amount} damage to a random enemy rear-line unit.`
              : `On deployment, deals ${deploy.amount} damage to a random enemy battlefield unit.`
        : deploy.scope === "classes"
          ? `При выходе на поле боя наносит ${deploy.amount} урона всем вражеским юнитам классов: ${(
              deploy.classes ?? []
            )
              .map((unitClass) => getClassLabel(unitClass, language))
              .join(", ")}.`
          : deploy.scope === "rear"
            ? `При выходе наносит ${deploy.amount} урона случайному вражескому юниту в тылу.`
            : `При выходе на поле боя наносит ${deploy.amount} урона случайному вражескому юниту на поле.`,
    });
  }

  if (card.onPlayEffects?.fetchToHand) {
    keywords.push({
      id: "fetchToHand",
      title: language === "en" ? "REINFORCEMENT" : "ПОПОЛНЕНИЕ",
      body:
        language === "en"
          ? `On deployment, move a random "${card.onPlayEffects.fetchToHand.label}" card from your deck to your hand, if available.`
          : `При выходе на поле боя вы переносите случайную карту «${card.onPlayEffects.fetchToHand.label}» из колоды в руку (если такая есть).`,
    });
  }

  const draw = card.onPlayEffects?.draw ?? 0;
  const hqProtection = card.onPlayEffects?.hqProtection ?? 0;

  if (draw > 0) {
    keywords.push({
      id: "deploy-draw",
      title: language === "en" ? "RECON" : "РАЗВЕДКА",
      body:
        language === "en"
          ? `Recon triggers on deployment: draw ${draw} card(s) from your deck.`
          : `Разведка срабатывает при выходе отряда на поле боя: вы добираете ${draw === 1 ? "карту" : `${draw} карты`} из колоды.`,
    });
  }

  if (hqProtection > 0) {
    keywords.push({
      id: "deploy-hq",
      title: language === "en" ? "COVER" : "ПРИКРЫТИЕ",
      body:
        language === "en"
          ? `Cover triggers on deployment: your headquarters gains +${hqProtection} health.`
          : `Прикрытие срабатывает при выходе отряда на поле боя: ваш штаб получает +${hqProtection} к здоровью.`,
    });
  }

  return keywords;
}

function getSupportEffectKeywords(card: TankCard, language: Language): CardKeyword[] {
  const effects = card.supportEffects;
  if (!effects) return [];

  const keywords: CardKeyword[] = [];

  if (effects.hqAttackBonus) {
    keywords.push({
      id: "fx-hqAttack",
      title: language === "en" ? "FIRE SUPPORT" : "ОГНЕВАЯ ПОДДЕРЖКА",
      body:
        language === "en"
          ? `Your headquarters deals +${effects.hqAttackBonus} extra damage.`
          : `Ваш штаб наносит на +${effects.hqAttackBonus} урона больше.`,
    });
  }

  if (effects.hqDamageRedirect) {
    keywords.push({
      id: "fx-redirect",
      title: language === "en" ? "HEADQUARTERS SCREEN" : "ЗАСЛОН ШТАБА",
      body:
        language === "en"
          ? `Absorbs up to ${effects.hqDamageRedirect} damage that would hit your headquarters.`
          : `Принимает на себя до ${effects.hqDamageRedirect} урона, который шёл бы в ваш штаб.`,
    });
  }

  if (effects.tankScreenClasses?.length) {
    const classNames = effects.tankScreenClasses
      .map((tankClass) => {
        switch (tankClass) {
          case "light":
            return language === "en" ? "light" : "лёгким";
          case "medium":
            return language === "en" ? "medium" : "средним";
          case "heavy":
            return language === "en" ? "heavy" : "тяжёлым";
          case "td":
            return "ПТ-САУ";
          case "spg":
            return "САУ";
          case "armored_car":
            return "бронеавтомобилям";
          default:
            return language === "en" ? "tank" : "танкам";
        }
      })
      .join(" и ");

    keywords.push({
      id: "fx-tank-screen",
      title: language === "en" ? "TANK SCREEN" : "ЭКРАН ТАНКОВ",
      body:
        language === "en"
          ? `Once per turn, the first hit against friendly ${classNames} tanks is redirected to this rear-line unit.`
          : `Раз за ход первый удар по дружественным ${classNames} танкам перенаправляется в этот тыловой юнит.`,
    });
  }

  if (effects.supportLineCover) {
    keywords.push({
      id: "fx-cover",
      title: language === "en" ? "ANTI-TANK SCREEN" : "ПРОТИВОТАНКОВЫЙ ЗАСЛОН",
      body:
        language === "en"
          ? `Protects the rear line and headquarters. Close attacks against friendly support or headquarters are met with ${effects.supportLineCover} return damage once per turn, and part of ranged fire against the headquarters is absorbed.`
          : `Защищает тыл и штаб. Ближние атаки по союзной поддержке или по штабу встречает огнём на ${effects.supportLineCover} урона (раз за ход), а часть дистанционного огня по штабу принимает на себя.`,
    });
  }

  if (effects.returnFire) {
    keywords.push({
      id: "fx-returnFire",
      title: language === "en" ? "SELF-DEFENSE" : "САМООБОРОНА",
      body:
        language === "en"
          ? `Armed vehicle: when attacked by an enemy unit in close combat, returns fire for ${effects.returnFire} damage.`
          : `Вооружённая машина: когда по ней бьёт вражеский юнит в ближнем бою, отвечает огнём на ${effects.returnFire} урона.`,
    });
  }

  if (effects.fuelPerTurn) {
    keywords.push({
      id: "fx-fuel",
      title: language === "en" ? "SUPPLY" : "СНАБЖЕНИЕ",
      body:
        language === "en"
          ? `At the start of your turn, gain +${effects.fuelPerTurn} fuel.`
          : `В начале вашего хода вы получаете +${effects.fuelPerTurn} топлива.`,
    });
  }

  if (effects.drawEveryTurns) {
    keywords.push({
      id: "fx-draw",
      title: language === "en" ? "RECON" : "РАЗВЕДКА",
      body:
        language === "en"
          ? `Every ${effects.drawEveryTurns} of your turns, draw an extra card.`
          : `Каждые ${effects.drawEveryTurns} ваших хода вы добираете дополнительную карту.`,
    });
  }

  if (effects.fetchSupportCardEveryTurns) {
    keywords.push({
      id: "fx-fetch",
      title: language === "en" ? "RESERVE DELIVERY" : "ПОДВОЗ РЕЗЕРВОВ",
      body:
        language === "en"
          ? `Every ${effects.fetchSupportCardEveryTurns} turns, moves a random support card from your deck to your hand.`
          : `Каждые ${effects.fetchSupportCardEveryTurns} хода переносит случайную карту поддержки из колоды в руку.`,
    });
  }

  if (effects.healRandomUnitPerTurn) {
    keywords.push({
      id: "fx-heal",
      title: language === "en" ? "FIELD HOSPITAL" : "ПОЛЕВОЙ ГОСПИТАЛЬ",
      body:
        language === "en"
          ? `At the start of your turn, restores ${effects.healRandomUnitPerTurn} health to a random damaged unit${effects.healClass ? " of the selected class" : ""}.`
          : `В начале хода восстанавливает ${effects.healRandomUnitPerTurn} здоровья случайному повреждённому юниту${
              effects.healClass ? " выбранного класса" : ""
            }.`,
    });
  }

  if (effects.hqHealPerTurn) {
    keywords.push({
      id: "fx-hqHeal",
      title: language === "en" ? "HEADQUARTERS REPAIR" : "РЕМОНТ ШТАБА",
      body:
        language === "en"
          ? `At the start of your turn, restores ${effects.hqHealPerTurn} health to your headquarters.`
          : `В начале хода восстанавливает ${effects.hqHealPerTurn} здоровья вашему штабу.`,
    });
  }

  return keywords;
}

/**
 * Builds a flat list of short ability labels for a unit, mirroring the keyword
 * mechanics — each entry names the ability and, where the ability carries a
 * numeric bonus, appends its amount (e.g. «Командная машина −1», «Разведка +1»).
 * Used to print the abilities as plain text in the card description instead of
 * rendering them as separate tag badges.
 */
export function getCardAbilityTags(
  card: TankCard,
  language: Language = getSettings().language
): string[] {
  const tags: string[] = [];

  if (card.combatAbilities?.blitz) {
    tags.push(language === "en" ? "Blitz" : "Блиц");
  }

  if (card.combatAbilities?.lightScreen) {
    tags.push(language === "en" ? "Screen" : "Экран");
  }

  if (
    card.combatAbilities?.tankDefenseAura &&
    card.combatAbilities.tankDefenseAura > 0
  ) {
    tags.push(
      language === "en"
        ? `Command vehicle −${card.combatAbilities.tankDefenseAura}`
        : `Командная машина −${card.combatAbilities.tankDefenseAura}`
    );
  }

  if (card.onPlayEffects?.draw && card.onPlayEffects.draw > 0) {
    tags.push(
      language === "en"
        ? `Recon +${card.onPlayEffects.draw}`
        : `Разведка +${card.onPlayEffects.draw}`
    );
  }

  if (card.onPlayEffects?.hqProtection && card.onPlayEffects.hqProtection > 0) {
    tags.push(
      language === "en"
        ? `Cover +${card.onPlayEffects.hqProtection}`
        : `Прикрытие +${card.onPlayEffects.hqProtection}`
    );
  }

  if (card.combatAbilities?.camouflage) {
    tags.push(language === "en" ? "Camouflage" : "Маскировка");
  }

  if (card.combatAbilities?.attackEqualsHq) {
    tags.push(language === "en" ? "Forward observer" : "Корректировщик");
  }

  if (card.combatAbilities?.armorVsClass) {
    tags.push(
      language === "en"
        ? `Special armor −${card.combatAbilities.armorVsClass.amount}`
        : `Спецброня −${card.combatAbilities.armorVsClass.amount}`
    );
  }

  if (card.combatAbilities?.frontalArmor) {
    tags.push(
      language === "en"
        ? `Frontal armor −${card.combatAbilities.frontalArmor.amount}`
        : `Лобовая броня −${card.combatAbilities.frontalArmor.amount}`
    );
  }

  if (
    card.combatAbilities?.drawWhenAttacked &&
    card.combatAbilities.drawWhenAttacked > 0
  ) {
    tags.push(
      language === "en"
        ? `Watch +${card.combatAbilities.drawWhenAttacked}`
        : `Дозор +${card.combatAbilities.drawWhenAttacked}`
    );
  }

  if (card.combatAbilities?.cornerBonus) {
    tags.push(language === "en" ? "Firing position" : "Огневая позиция");
  }

  if (card.combatAbilities?.hqProximityBonus) {
    tags.push(
      language === "en"
        ? `Rolling barrage +${card.combatAbilities.hqProximityBonus.maxBonus}/cell`
        : `Огневой вал +${card.combatAbilities.hqProximityBonus.maxBonus}/клетка`
    );
  }

  if (
    card.combatAbilities?.spawnDamageReduction &&
    card.combatAbilities.spawnDamageReduction > 0
  ) {
    tags.push(language === "en" ? "Bridgehead defense" : "Оборона плацдарма");
  }

  if (card.combatAbilities?.raidDraw && card.combatAbilities.raidDraw > 0) {
    tags.push(
      language === "en"
        ? `Breakthrough +${card.combatAbilities.raidDraw}`
        : `Прорыв +${card.combatAbilities.raidDraw}`
    );
  }

  if (card.costModifiers) {
    tags.push(
      language === "en"
        ? `Coordination −${card.costModifiers.discount}`
        : `Слаженность −${card.costModifiers.discount}`
    );
  }

  if (card.onPlayEffects?.suppressEnemyIndirect) {
    tags.push(language === "en" ? "Counter-battery" : "Контрбатарея");
  }

  if (card.onPlayEffects?.deployDamage) {
    tags.push(
      language === "en"
        ? `Fire raid ${card.onPlayEffects.deployDamage.amount}`
        : `Огневой налёт ${card.onPlayEffects.deployDamage.amount}`
    );
  }

  if (card.onPlayEffects?.fetchToHand) {
    tags.push(
      language === "en"
        ? `Reinforcement (${card.onPlayEffects.fetchToHand.label})`
        : `Пополнение (${card.onPlayEffects.fetchToHand.label})`
    );
  }

  return tags;
}

/**
 * Builds the ordered list of glossary entries for an enlarged unit card: the
 * vehicle type first, then any special mechanics it carries.
 */
export function getCardKeywords(
  card: TankCard,
  language: Language = getSettings().language
): CardKeyword[] {
  return [
    getVehicleTypeKeyword(card, language),
    ...getAbilityKeywords(card, language),
    ...getSupportEffectKeywords(card, language),
  ];
}

function getHeadquartersAbilityKeyword(
  ability: HeadquartersAbility,
  language: Language
): CardKeyword | null {
  const title =
    language === "en"
      ? translateHeadquartersAbilityName(ability.name).toUpperCase()
      : ability.name.toUpperCase();

  if (ability.firstTankBlitz) {
    return {
      id: "hq-firstTankBlitz",
      title,
      body:
        language === "en"
          ? "The first tank played each turn gains Blitz: two moves on the turn it enters the battlefield."
          : "Первый танк, сыгранный за ход, получает «Блиц» — два перемещения в ход выхода на поле.",
    };
  }

  if (ability.lightUnitsBlitz) {
    return {
      id: "hq-lightUnitsBlitz",
      title,
      body:
        language === "en"
          ? "Light units gain Blitz: two moves on the turn they enter the battlefield."
          : "Лёгкие юниты получают «Блиц» — два перемещения в ход выхода на поле.",
    };
  }

  if (ability.firstUnitFuelDiscount) {
    return {
      id: "hq-fuelDiscount",
      title,
      body:
        language === "en"
          ? `The first unit played each turn costs ${ability.firstUnitFuelDiscount} less fuel.`
          : `Первый юнит, сыгранный за ход, обходится на ${ability.firstUnitFuelDiscount} топлива дешевле.`,
    };
  }

  if (ability.breakthroughExtraMove) {
    return {
      id: "hq-breakthrough",
      title,
      body:
        language === "en"
          ? "The first friendly unit each turn to break into the enemy rear half immediately gains an extra move: the spearhead drives deeper."
          : "Первый ваш юнит за ход, ворвавшийся в тыловую половину поля противника, тут же получает повторное перемещение — клин рвётся в глубину.",
    };
  }

  if (ability.stationaryTankAttackBonus) {
    const toughness = ability.stationaryTankHpBonus
      ? language === "en"
        ? ` In addition, each hit against such a tank is reduced by ${ability.stationaryTankHpBonus}.`
        : ` Кроме того, каждый удар по такому танку слабее на ${ability.stationaryTankHpBonus}.`
      : "";
    return {
      id: "hq-stationary",
      title,
      body:
        language === "en"
          ? `Your tanks that have not moved this turn deal +${ability.stationaryTankAttackBonus} extra damage.${toughness}`
          : `Ваши танки, не двигавшиеся в этот ход, наносят на +${ability.stationaryTankAttackBonus} урона больше.${toughness}`,
    };
  }

  if (ability.movedTankAttackBonus) {
    return {
      id: "hq-moved",
      title,
      body:
        language === "en"
          ? `Your tanks that moved this turn deal +${ability.movedTankAttackBonus} extra damage: the attack lands at the spearhead.`
          : `Ваши танки, продвинувшиеся в этот ход, наносят на +${ability.movedTankAttackBonus} урона больше — удар на острие наступления.`,
    };
  }

  if (ability.hqRearStrikeBonus || ability.rearVulnerabilityToLightUnits) {
    const bonus = ability.hqRearStrikeBonus ?? 0;
    const penalty = ability.rearVulnerabilityToLightUnits ?? 0;
    return {
      id: "hq-rearStrike",
      title,
      body:
        language === "en"
          ? `The headquarters deals +${bonus} extra damage when attacking enemy rear-line units and the enemy headquarters, but your own rear line and headquarters take +${penalty} extra damage from enemy light tanks and armored cars.`
          : `Штаб наносит на +${bonus} урона больше по тыловым юнитам и вражескому штабу, но свой тыл и штаб получают +${penalty} урона от лёгких танков и бронеавтомобилей.`,
    };
  }

  if (ability.hqAttackBonusVsDamaged) {
    return {
      id: "hq-vsDamaged",
      title,
      body:
        language === "en"
          ? `The headquarters deals +${ability.hqAttackBonusVsDamaged} extra damage to already damaged targets.`
          : `Штаб наносит на +${ability.hqAttackBonusVsDamaged} урона больше по уже повреждённым целям.`,
    };
  }

  if (ability.hqAttackBonus) {
    return {
      id: "hq-attackBonus",
      title,
      body:
        language === "en"
          ? `The headquarters deals +${ability.hqAttackBonus} extra damage.`
          : `Штаб наносит на +${ability.hqAttackBonus} урона больше.`,
    };
  }

  if (ability.drawEveryTurns) {
    return {
      id: "hq-draw",
      title,
      body:
        language === "en"
          ? `At the start of every ${ability.drawEveryTurns}th friendly turn, draw an extra card.`
          : `В начале каждого ${ability.drawEveryTurns}-го вашего хода вы добираете дополнительную карту.`,
    };
  }

  if (ability.healRandomUnitPerTurn) {
    return {
      id: "hq-heal",
      title,
      body:
        language === "en"
          ? `At the start of your turn, restores ${ability.healRandomUnitPerTurn} health to a random damaged unit.`
          : `В начале хода восстанавливает ${ability.healRandomUnitPerTurn} здоровья случайному повреждённому юниту.`,
    };
  }

  if (ability.combinedArmsFuelBonus) {
    return {
      id: "hq-combinedArms",
      title,
      body:
        language === "en"
          ? `While you have both a tank and a support unit, gain +${ability.combinedArmsFuelBonus} fuel per turn.`
          : `Пока у вас одновременно есть и танк, и юнит поддержки, вы получаете +${ability.combinedArmsFuelBonus} топлива за ход.`,
    };
  }

  if (ability.firstLightUnitHqProtection) {
    return {
      id: "hq-firstLightProtection",
      title,
      body:
        language === "en"
          ? `The first light unit played each turn gives your headquarters +${ability.firstLightUnitHqProtection} health.`
          : `Первый лёгкий юнит, сыгранный за ход, добавляет штабу +${ability.firstLightUnitHqProtection} здоровья.`,
    };
  }

  if (ability.hqAttackIgnoresCover) {
    return {
      id: "hq-ignoresCover",
      title,
      body:
        language === "en"
          ? "Headquarters attacks cannot be intercepted by rear-line cover units."
          : "Атаки штаба нельзя перехватить прикрывающими юнитами тыловой линии.",
    };
  }

  if (ability.returnFirstDestroyedUnit) {
    return {
      id: "hq-returnUnit",
      title,
      body:
        language === "en"
          ? "Once per battle, your first destroyed unit returns to your hand."
          : "Раз за бой первый уничтоженный ваш юнит возвращается к вам в руку.",
    };
  }

  return null;
}

/**
 * Builds the glossary entries for an enlarged headquarters card: a short
 * intro about what a headquarters is, followed by its special ability.
 */
export function getHeadquartersKeywords(
  ability: HeadquartersAbility | null | undefined,
  nation?: Nation,
  language: Language = getSettings().language
): CardKeyword[] {
  const keywords: CardKeyword[] = [
    {
      id: "hq-type",
      title: language === "en" ? "HEADQUARTERS" : "ШТАБ",
      body:
        language === "en"
          ? "Command post of your army. Generates fuel every turn; if its health reaches zero, you lose the battle."
          : "Командный пункт вашей армии. Генерирует топливо каждый ход; если его здоровье падает до нуля — вы проигрываете бой.",
    },
  ];

  if (ability) {
    const abilityKeyword = getHeadquartersAbilityKeyword(ability, language);
    if (abilityKeyword) {
      keywords.push(abilityKeyword);
    }
  }

  const nationalAbility = getNationalAbility(nation);
  if (nationalAbility) {
    keywords.push({
      id: `hq-national-${nationalAbility.id}`,
      title:
        language === "en"
          ? `NATION · ${translateNationalAbilityName(nationalAbility).toUpperCase()}`
          : `НАЦИЯ · ${nationalAbility.name.toUpperCase()}`,
      body:
        language === "en"
          ? translateNationalAbilityDescription(nationalAbility)
          : nationalAbility.description,
    });
  }

  return keywords;
}

function translateHeadquartersAbilityName(name: string): string {
  const translations: Record<string, string> = {
    "Танковый клин": "Armored Spearhead",
    "Моторизованный марш": "Motorized March",
    "Быстрая переброска": "Rapid Redeployment",
    "Артиллерийская подготовка": "Artillery Preparation",
    "Удар по тылам": "Rear Strike",
    "Снабжение по графику": "Scheduled Supply",
    "Танковая засада": "Tank Ambush",
    "Ремонтные колонны": "Repair Columns",
    "Бронедесант": "Armored Infantry",
    "Эвакуация и ремонт": "Recovery and Repair",
    "Тыловое снабжение": "Rear Supply",
    "Система": "System",
    "Залп «Катюш»": "Katyusha Salvo",
    "Оборона Москвы": "Defense of Moscow",
    "Гвардейская засада": "Guards Ambush",
    "Стоять насмерть": "Hold to the Last",
    "Танковый натиск": "Armored Assault",
    "Остриё прорыва": "Breakthrough Spearhead",
    "Артподготовка": "Artillery Preparation",
    "Несгибаемый полк": "Unbending Regiment",
    "Танковый таран": "Tank Ram",
    "Стальной клин": "Steel Wedge",
    "Заградительный огонь": "Blocking Fire",
  };

  return translations[name] ?? name;
}

function translateNationalAbilityName(ability: NonNullable<ReturnType<typeof getNationalAbility>>): string {
  const translations: Record<typeof ability.id, string> = {
    cohesion: "Cohesion",
    supply_line: "Supply Line",
    system: "System",
    last_stand: "Last Stand",
  };

  return translations[ability.id] ?? ability.name;
}

function translateNationalAbilityDescription(
  ability: NonNullable<ReturnType<typeof getNationalAbility>>
): string {
  const translations: Record<typeof ability.id, string> = {
    cohesion:
      "When three of your units stand in one vertical line, filling a full three-cell column, each of them gains +1 defense. Every hit against those units is reduced by 1.",
    supply_line:
      "When three of your units form a horizontal line connected to the rear edge by a supply unit, those three units gain +2 health. If the line is not connected to the rear, the supply bonus does not apply.",
    system:
      "While all four rear-line slots are occupied by support units, your headquarters gains +1 fuel at the start of each turn.",
    last_stand:
      "While all three of your bridgehead cells are occupied by your units, your headquarters gains +2 attack: the line holds to the last.",
  };

  return translations[ability.id] ?? ability.description;
}
