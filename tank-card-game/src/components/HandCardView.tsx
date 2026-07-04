import { useState, type CSSProperties } from "react";
import type React from "react";
import { getHeadquartersDefinition } from "../game/headquarters";
import {
  getHeadquartersImageAsset,
  getLegacyHeadquartersImageAsset,
} from "../game/headquartersImages";
import type {
  HeadquartersId,
  PlayerId,
  SupportRole,
  TankCard,
} from "../game/types";
import {
  getCardClassVisual,
  getCardCombatDamage,
  getNationFlagStyle,
  getNationVisual,
} from "../game/cardVisuals";
import { getTankImage } from "../game/tankImages";
import { getCardAbilityTags } from "../game/cardKeywords";
import {
  getLocalizedCardAbilityText,
  getLocalizedCardClassLabel,
  getLocalizedHeadquartersDescription,
  getLocalizedHeadquartersType,
} from "../game/cardLocalization";
import { useI18n } from "../game/i18n";
import prototypeTankImage from "../assets/tanks/prototype-tank.png";
import { FitText } from "./FitText";
import { StatBadge } from "./StatBadge";
import cardHandFrameImage from "../assets/cards/card-hand-frame.webp";
import handCardArtMaskImage from "../assets/cards/hand-card-art-mask.webp";
import classLightPlayerIcon from "../assets/icons/classes/class-light-player.webp";
import classLightEnemyIcon from "../assets/icons/classes/class-light-enemy.webp";
import classMediumPlayerIcon from "../assets/icons/classes/class-medium-player.webp";
import classMediumEnemyIcon from "../assets/icons/classes/class-medium-enemy.webp";
import classHeavyPlayerIcon from "../assets/icons/classes/class-heavy-player.webp";
import classHeavyEnemyIcon from "../assets/icons/classes/class-heavy-enemy.webp";
import classTdPlayerIcon from "../assets/icons/classes/class-td-player.webp";
import classTdEnemyIcon from "../assets/icons/classes/class-td-enemy.webp";
import classSpgPlayerIcon from "../assets/icons/classes/class-spg-player.webp";
import classSpgEnemyIcon from "../assets/icons/classes/class-spg-enemy.webp";
import classArtPlayerIcon from "../assets/icons/classes/class-art-player.webp";
import classArtEnemyIcon from "../assets/icons/classes/class-art-enemy.webp";
import classCarPlayerIcon from "../assets/icons/classes/class-car-player.webp";
import classCarEnemyIcon from "../assets/icons/classes/class-car-enemy.webp";
import classArmoredCarPlayerIcon from "../assets/icons/classes/class-armored_car-player.webp";
import classArmoredCarEnemyIcon from "../assets/icons/classes/class-armored_car-enemy.webp";
import classMedicPlayerIcon from "../assets/icons/classes/class-medic-player.webp";
import classMedicEnemyIcon from "../assets/icons/classes/class-medic-enemy.webp";

const hqClassIconModules = import.meta.glob(
  "../assets/icons/classes/class-hq-*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;


type HeadquartersHandCardData = {
  hp: number;
  attack: number;
  fuelGeneration: number;
  fuel?: number;
};

type HandCardDisplayMode = "hand" | "preview";

type HandCardViewProps = {
  card?: TankCard;
  headquarters?: HeadquartersHandCardData;
  ownerId?: PlayerId;
  headquartersId?: HeadquartersId;
  artOwnerId?: PlayerId;
  currentHp?: number;
  /**
   * Live fuel cost for this card given the current battlefield («Слаженность»
   * and headquarters discounts). When it is below the printed cost the badge
   * shows the cheaper value highlighted. Defaults to the card's printed cost.
   */
  effectiveCost?: number;
  selected?: boolean;
  disabled?: boolean;
  displayMode?: HandCardDisplayMode;
  previewScale?: number;
};

type StatTooltipId = "cost" | "fuel" | "class" | "attack" | "health";

type StatTooltipPosition = "top-right" | "right" | "bottom-right";

type StatTooltipProps = {
  id: StatTooltipId;
  activeTooltip: StatTooltipId | null;
  text: string;
  enabled: boolean;
  position?: StatTooltipPosition;
  style?: CSSProperties;
  children: React.ReactNode;
  onShow: (id: StatTooltipId) => void;
  onHide: (id: StatTooltipId) => void;
};

function StatTooltipTarget({
  id,
  activeTooltip,
  text,
  enabled,
  position = "right",
  style,
  children,
  onShow,
  onHide,
}: StatTooltipProps) {
  const isActive = enabled && activeTooltip === id;

  if (!enabled) {
    return (
      <span
        style={{
          ...styles.statTooltipTarget,
          ...style,
          pointerEvents: "none",
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={text}
      style={{
        ...styles.statTooltipTarget,
        ...style,
      }}
      onMouseEnter={() => onShow(id)}
      onMouseLeave={() => onHide(id)}
      onFocus={() => onShow(id)}
      onBlur={() => onHide(id)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        isActive ? onHide(id) : onShow(id);
      }}
    >
      <span style={styles.statTooltipHitArea} />
      {children}
      {isActive ? (
        <span
          style={{
            ...styles.statTooltipBubble,
            ...(position === "top-right" ? styles.statTooltipBubbleTopRight : {}),
            ...(position === "bottom-right" ? styles.statTooltipBubbleBottomRight : {}),
          }}
        >
          {text}
        </span>
      ) : null}
    </button>
  );
}

function getBoardClassIcon(cardClass: TankCard["class"], ownerId: PlayerId) {
  const isPlayer = ownerId === "player";

  switch (cardClass) {
    case "light":
      return isPlayer ? classLightPlayerIcon : classLightEnemyIcon;

    case "medium":
      return isPlayer ? classMediumPlayerIcon : classMediumEnemyIcon;

    case "heavy":
      return isPlayer ? classHeavyPlayerIcon : classHeavyEnemyIcon;

    case "td":
      return isPlayer ? classTdPlayerIcon : classTdEnemyIcon;

    case "spg":
      return isPlayer ? classSpgPlayerIcon : classSpgEnemyIcon;

    case "armored_car":
      return isPlayer ? classArmoredCarPlayerIcon : classArmoredCarEnemyIcon;

    default:
      return isPlayer ? classMediumPlayerIcon : classMediumEnemyIcon;
  }
}

function getSupportClassIcon(
  supportRole: SupportRole | undefined,
  ownerId: PlayerId
) {
  const isPlayer = ownerId === "player";

  switch (supportRole) {
    case "artillery":
      return isPlayer ? classArtPlayerIcon : classArtEnemyIcon;

    case "transport":
      return isPlayer ? classCarPlayerIcon : classCarEnemyIcon;

    case "medical":
      return isPlayer ? classMedicPlayerIcon : classMedicEnemyIcon;

    default:
      return null;
  }
}

function getCardClassIcon(card: TankCard, ownerId: PlayerId) {
  if (card.deploymentZone === "support") {
    return getSupportClassIcon(card.supportRole, ownerId);
  }

  return getBoardClassIcon(card.class, ownerId);
}

function getOptionalImage(
  modules: Record<string, string>,
  fileNames: string[]
): string | null {
  for (const [path, imageUrl] of Object.entries(modules)) {
    const fileName = path.split("/").pop();

    if (fileName && fileNames.includes(fileName)) {
      return imageUrl;
    }
  }

  return null;
}

function getLegacyHeadquartersImage(ownerId: PlayerId): string {
  return getLegacyHeadquartersImageAsset(ownerId) ?? prototypeTankImage;
}

function getHeadquartersImage(
  headquartersId: HeadquartersId | undefined,
  fallbackOwnerId: PlayerId
): string {
  if (!headquartersId) {
    return getLegacyHeadquartersImage(fallbackOwnerId);
  }

  const headquartersImage = getHeadquartersImageAsset(headquartersId);

  if (headquartersImage) {
    return headquartersImage;
  }

  return getLegacyHeadquartersImage(fallbackOwnerId);
}

function getHeadquartersClassIcon(ownerId: PlayerId): string | null {
  const side = ownerId === "player" ? "player" : "enemy";
  const opponentSide = ownerId === "player" ? "friendly" : "bot";

  return getOptionalImage(hqClassIconModules, [
    `class-hq-${side}.png`,
    `class-hq-${side}.jpg`,
    `class-hq-${side}.jpeg`,
    `class-hq-${side}.webp`,
    `class-hq-${opponentSide}.png`,
    `class-hq-${opponentSide}.jpg`,
    `class-hq-${opponentSide}.jpeg`,
    `class-hq-${opponentSide}.webp`,
  ]);
}

function getHeadquartersTitleFontSize(title: string): number {
  const visualLength = Array.from(title).reduce((total, char) => {
    if (char === " ") return total + 0.45;
    if (".,-–—()".includes(char)) return total + 0.35;
    if (/[A-ZА-ЯЁ]/.test(char)) return total + 1.05;

    return total + 0.9;
  }, 0);

  if (visualLength <= 14) return 15;
  if (visualLength <= 18) return 14;
  if (visualLength <= 23) return 12;
  if (visualLength <= 29) return 10;

  return 8.5;
}


export function HandCardView({
  card,
  headquarters,
  ownerId = "player",
  headquartersId,
  artOwnerId,
  currentHp,
  effectiveCost,
  selected = false,
  disabled = false,
  displayMode = "hand",
  previewScale,
}: HandCardViewProps) {
  const { language } = useI18n();
  const [activeTooltip, setActiveTooltip] = useState<StatTooltipId | null>(null);
  const isHeadquarters = Boolean(headquarters);

  if (!card && !headquarters) {
    return null;
  }

  const isPreview = displayMode === "preview";
  const badgeMode = isPreview ? "preview" : "hand";
  const defaultPreviewScale = 390 / 175;
  const uiScale = isPreview ? previewScale ?? defaultPreviewScale : 1;
  const scaled = (value: number) => Math.round(value * uiScale);

  const unitClass = card ? getCardClassVisual(card) : null;

  const headquartersDefinition =
    isHeadquarters && headquartersId
      ? getHeadquartersDefinition(headquartersId)
      : null;
  const nation =
    card || headquartersDefinition
      ? getNationVisual(card?.nation ?? headquartersDefinition!.nation)
      : null;

  const tankImage = isHeadquarters
    ? getHeadquartersImage(headquartersId, artOwnerId ?? ownerId)
    : getTankImage(card!.id);

  const hqClassIcon = isHeadquarters ? getHeadquartersClassIcon(ownerId) : null;
  const classIcon = isHeadquarters
    ? hqClassIcon
    : getCardClassIcon(card!, ownerId);

  const title = isHeadquarters
    ? headquartersDefinition?.title ?? "Штаб"
    : card!.name;
  const titleFontSize = isHeadquarters
    ? getHeadquartersTitleFontSize(title)
    : 15;
  const subtitle = isHeadquarters
    ? getLocalizedHeadquartersType(headquartersDefinition, language)
    : `${nation!.label} · ${unitClass!.label}`;

  const hpValue = isHeadquarters
    ? headquarters!.hp
    : currentHp ?? card!.hp;

  // Rear units with no printed attack but a defensive answer (Pak guns,
  // armed half-tracks) show the damage they deal to an attacker.
  const attackValue = isHeadquarters
    ? headquarters!.attack
    : getCardCombatDamage(card!);
  const isDefensiveAttack = !isHeadquarters && card!.attack === 0 && attackValue > 0;

  const fuelGenerationValue = isHeadquarters
    ? headquarters!.fuelGeneration
    : card!.deploymentZone === "support"
      ? card!.supportEffects?.fuelPerTurn ?? 0
      : card!.fuelGeneration;

  const abilityText = isHeadquarters
    ? getLocalizedHeadquartersDescription(headquartersDefinition, language)
    : getLocalizedCardAbilityText(card!, language);
  // Abilities are printed as a plain-text enumeration appended to the
  // description (with their numeric bonuses), instead of separate tag badges.
  const abilityTags = !isHeadquarters && card ? getCardAbilityTags(card, language) : [];
  const descriptionText = [abilityText, abilityTags.join(", ")]
    .filter(Boolean)
    .join(" ");
  // «Слаженность» / headquarters discounts: show the live cost when it is
  // cheaper than printed, highlighting the saving.
  const printedCost = isHeadquarters ? 0 : card!.cost;
  const displayCost =
    !isHeadquarters && effectiveCost !== undefined ? effectiveCost : printedCost;
  const isCostDiscounted = !isHeadquarters && displayCost < printedCost;

  const tooltipEnabled = isPreview;
  const classTooltip = isHeadquarters
    ? language === "en"
      ? "Class: headquarters. Command card with durability, attack, and fuel generation."
      : "Класс: штаб. Командная карта с прочностью, атакой и приростом топлива."
    : language === "en"
      ? `Class: ${getLocalizedCardClassLabel(card!, language)}. Defines the unit role and combat mechanics.`
      : `Класс: ${unitClass!.label}. Определяет роль юнита и его боевую механику.`;
  const costTooltip = isHeadquarters
    ? language === "en"
      ? `Headquarters fuel: +${fuelGenerationValue} to your reserve at the start of your turn.`
      : `Топливо штаба: +${fuelGenerationValue} к запасу в начале вашего хода.`
    : isCostDiscounted
      ? language === "en"
        ? `Cost: ${displayCost} fuel with discount; printed cost is ${printedCost}. Depends on the battlefield.`
        : `Стоимость: ${displayCost} топлива (со скидкой; обычная ${printedCost}). Зависит от ситуации на поле боя.`
      : language === "en"
        ? `Cost: ${displayCost} fuel to deploy this card.`
        : `Стоимость: ${displayCost} топлива нужно, чтобы вывести карту на поле.`;
  const fuelTooltip =
    language === "en"
      ? `Fuel generation: +${fuelGenerationValue} to your reserve at the start of your turn.`
      : `Прирост топлива: +${fuelGenerationValue} к запасу в начале вашего хода.`;
  const attackTooltip = isDefensiveAttack
    ? language === "en"
      ? `Return fire: ${attackValue}. This is the damage dealt to a unit attacking it (or the headquarters) in close combat.`
      : `Ответный огонь: ${attackValue}. Столько урона эта машина наносит юниту, который атакует её (или штаб) в ближнем бою.`
    : language === "en"
      ? `Attack: ${attackValue}. Damage dealt by this card when it strikes.`
      : `Атака: ${attackValue}. Столько урона карта наносит при ударе.`;
  const healthTooltip =
    language === "en"
      ? `Defense: ${hpValue}. Remaining durability of the card.`
      : `Защита: ${hpValue}. Столько прочности осталось у карты.`;
  const showTooltip = (id: StatTooltipId) => setActiveTooltip(id);
  const hideTooltip = (id: StatTooltipId) => {
    setActiveTooltip((current) => (current === id ? null : current));
  };


  return (
    <div
      style={{
        ...styles.card,
        ...(isPreview ? styles.previewCard : {}),
        ...(selected ? styles.selectedCard : {}),
        ...(disabled ? styles.disabledCard : {}),
      }}
    >
      <img
        src={cardHandFrameImage}
        alt=""
        style={styles.cardFrame}
        draggable={false}
      />

      <div
        style={{
          ...styles.artMaskLayer,
          WebkitMaskImage: `url(${handCardArtMaskImage})`,
          maskImage: `url(${handCardArtMaskImage})`,
        }}
      >
        <img
          src={tankImage}
          alt={title}
          style={styles.tankArt}
          draggable={false}
        />
        <div style={styles.artVignette} />
        <div style={styles.artTopShade} />
      </div>

      {nation ? (
        <div
          style={{
            ...styles.nationFlag,
            ...getNationFlagStyle(nation),
          }}
        />
      ) : null}

      <div
        style={{
          ...styles.spawnCostBadge,
          pointerEvents: tooltipEnabled ? "auto" : "none",
        }}
      >
        <StatTooltipTarget
          id="cost"
          activeTooltip={activeTooltip}
          text={costTooltip}
          enabled={tooltipEnabled}
          position="bottom-right"
          style={styles.fillStatTooltipTarget}
          onShow={showTooltip}
          onHide={hideTooltip}
        >
          <StatBadge
            type={isHeadquarters ? "fuelGeneration" : "spawnCost"}
            mode={badgeMode}
            value={isHeadquarters ? `+${fuelGenerationValue}` : displayCost}
            valueStyle={isCostDiscounted ? styles.discountedCostValue : undefined}
            title={
              isHeadquarters
                ? language === "en"
                  ? "Headquarters fuel generation"
                  : "Генерация топлива штабом"
                : isCostDiscounted
                  ? language === "en"
                    ? "Deployment cost (discounted)"
                    : "Стоимость розыгрыша (со скидкой)"
                  : language === "en"
                    ? "Deployment cost"
                    : "Стоимость розыгрыша"
            }
            style={styles.fullBadge}
          />
        </StatTooltipTarget>
      </div>

      {!isHeadquarters && fuelGenerationValue > 0 && (
        <div
          style={{
            ...styles.spawnFuelGenerationBadge,
            pointerEvents: tooltipEnabled ? "auto" : "none",
          }}
        >
          <StatTooltipTarget
            id="fuel"
            activeTooltip={activeTooltip}
            text={fuelTooltip}
            enabled={tooltipEnabled}
            position="bottom-right"
            style={styles.fillStatTooltipTarget}
            onShow={showTooltip}
            onHide={hideTooltip}
          >
            <StatBadge
              type="fuelGeneration"
              mode={badgeMode}
              value={`+${fuelGenerationValue}`}
              title={language === "en" ? "Fuel generation per turn" : "Генерация топлива за ход"}
              style={styles.fullBadge}
            />
          </StatTooltipTarget>
        </div>
      )}

      <div
        style={{
          ...styles.titleArea,
          ...(isHeadquarters ? styles.headquartersTitleArea : {}),
          // Without a fuel badge the title starts right after the cost badge.
          ...(!isHeadquarters && fuelGenerationValue <= 0
            ? styles.titleAreaWithoutFuelBadge
            : {}),
          gap: scaled(4),
        }}
      >
        {/* Fixed-height line: a shrunken title must not shift itself or the
            subtitle below. */}
        <div
          style={{
            ...styles.titleLine,
            height: scaled(titleFontSize),
          }}
        >
          <FitText
            maxFontSize={scaled(titleFontSize)}
            minFontSize={scaled(isHeadquarters ? 5.5 : 6)}
            ellipsis={false}
            style={{
              ...styles.title,
              letterSpacing: 0.4 * uiScale,
            }}
          >
            {title}
          </FitText>
        </div>
        <span
          style={{
            ...styles.subtitle,
            fontSize: scaled(8),
            transform: `translateY(${-2 * uiScale}px)`,
          }}
        >
          {subtitle}
        </span>
      </div>

      <div
        style={{
          ...styles.leftStats,
          gap: scaled(6),
          pointerEvents: tooltipEnabled ? "auto" : "none",
        }}
      >
        {classIcon ? (
          <StatTooltipTarget
            id="class"
            activeTooltip={activeTooltip}
            text={classTooltip}
            enabled={tooltipEnabled}
            position="right"
            style={{
              width: scaled(20),
              height: scaled(29),
              transform: `translate(${-7 * uiScale}px, ${-36 * uiScale}px)`,
            }}
            onShow={showTooltip}
            onHide={hideTooltip}
          >
            <img
              src={classIcon}
              alt={isHeadquarters ? (language === "en" ? "Headquarters" : "Штаб") : unitClass!.label}
              title={isHeadquarters ? (language === "en" ? "Headquarters" : "Штаб") : unitClass!.label}
              style={{
                ...styles.classIcon,
                ...(ownerId === "player" ? null : styles.enemyClassIcon),
                width: scaled(20),
                height: scaled(29),
                transform: "none",
              }}
              draggable={false}
            />
          </StatTooltipTarget>
        ) : (
          <StatTooltipTarget
            id="class"
            activeTooltip={activeTooltip}
            text={classTooltip}
            enabled={tooltipEnabled}
            position="right"
            onShow={showTooltip}
            onHide={hideTooltip}
          >
            <span
              style={{
                ...styles.classIconFallback,
                width: scaled(29),
                height: scaled(29),
                fontSize: scaled(23),
                color: ownerId === "player" ? "#7dff8a" : "#ff5a52",
              }}
              title={language === "en" ? "Headquarters" : "Штаб"}
            >
              ⚑
            </span>
          </StatTooltipTarget>
        )}

        <StatTooltipTarget
          id="attack"
          activeTooltip={activeTooltip}
          text={attackTooltip}
          enabled={tooltipEnabled}
          position="right"
          onShow={showTooltip}
          onHide={hideTooltip}
        >
          <StatBadge
            type="attack"
            mode={badgeMode}
            ownerId={ownerId}
            value={attackValue}
            title={language === "en" ? "Attack" : "Атака"}
          />
        </StatTooltipTarget>

        <StatTooltipTarget
          id="health"
          activeTooltip={activeTooltip}
          text={healthTooltip}
          enabled={tooltipEnabled}
          position="top-right"
          style={{ marginTop: -8 * uiScale }}
          onShow={showTooltip}
          onHide={hideTooltip}
        >
          <StatBadge
            type="health"
            mode={badgeMode}
            value={hpValue}
            title={language === "en" ? "Health" : "Здоровье"}
          />
        </StatTooltipTarget>
      </div>

      <div style={styles.descriptionPanel}>
        {descriptionText && (
          <p
            style={{
              ...styles.abilityText,
              fontSize: scaled(11),
              lineHeight: 1.18,
            }}
          >
            {descriptionText}
          </p>
        )}
      </div>
    </div>
  );
}


const digitFont = "var(--font-digit)";

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: "relative",
    isolation: "isolate",
    width: "100%",
    aspectRatio: "1051 / 1496",
    overflow: "visible",
    color: "#eef2f3",
    fontFamily: "var(--font-body)",
    userSelect: "none",
    transformOrigin: "center bottom",
    filter: "drop-shadow(0 16px 26px rgba(0,0,0,0.52))",
  },

  previewCard: {
    filter: "drop-shadow(0 28px 58px rgba(0,0,0,0.78))",
  },

  selectedCard: {
    filter:
      "drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 0 12px rgba(247, 215, 116, 0.9)) drop-shadow(0 16px 26px rgba(0,0,0,0.52))",
  },

  disabledCard: {
    opacity: 0.8,
    filter: "grayscale(0.3) brightness(0.72) drop-shadow(0 16px 26px rgba(0,0,0,0.42))",
  },

  cardFrame: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    width: "100%",
    height: "100%",
    objectFit: "fill",
    pointerEvents: "none",
    userSelect: "none",
  },

  /*
   * Маска применяется на весь размер карты.
   * ВАЖНО: файл hand-card-art-mask.png должен иметь прозрачный фон
   * и непрозрачную белую область окна под арт.
   */
  artMaskLayer: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    overflow: "hidden",
    pointerEvents: "none",

    // Webkit and standard properties must stay in sync.
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "95% 98%",
    WebkitMaskPosition: "center -2px",

    maskRepeat: "no-repeat",
    maskSize: "95% 98%",
    maskPosition: "center -2px",
  },

  tankArt: {
    position: "absolute",
    left: "-3%",
    top: "calc(9% + 2px)",
    width: "99%",
    height: "60%",
    objectFit: "contain",
    objectPosition: "45% center",
    display: "block",
  },

  artVignette: {
    position: "absolute",
    left: "9.8%",
    top: "10.95%",
    width: "81%",
    height: "82.1%",
    background:
      "radial-gradient(circle at 50% 45%, transparent 20%, rgba(0,0,0,0.38) 100%), linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.24))",
    pointerEvents: "none",
  },

  // The vignette is inset and leaves the photo's top edge undimmed, which reads
  // as a bright strip against the dark frame above. This full-width gradient
  // darkens that top edge; it lives inside the masked layer, so the window mask
  // clips it to the rounded art window.
  artTopShade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "14%",
    height: "7%",
    background: "linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0))",
    pointerEvents: "none",
  },

  titleArea: {
    position: "absolute",
    left: "30%",
    top: "2.8%",
    right: "14%",
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 1,
    textAlign: "left",
    pointerEvents: "none",
  },

  nationFlag: {
    position: "absolute",
    left: "6.5%",
    right: "7%",
    top: "3.5%",
    height: "11%",
    zIndex: 4,
    opacity: 0.35,
    filter: "saturate(0.88)",
    pointerEvents: "none",
  },

  headquartersTitleArea: {
    left: "23.8%",
    right: "8%",
    transform: "translateX(-3px)",
  },

  titleAreaWithoutSpawnCost: {
    left: "7%",
  },

  // Units without fuel generation have no fuel badge — the title starts right
  // after the spawn-cost badge (its right edge is at ~22.7% of the card).
  titleAreaWithoutFuelBadge: {
    left: "24%",
  },

  // Reserves the full max-font-size line height, so a shrunken title stays
  // vertically centered and never shifts the subtitle below it.
  titleLine: {
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
    overflow: "visible",
  },

  title: {
    position: "relative",
    zIndex: 1,
    fontFamily: "inherit",
    fontSize: 15,
    lineHeight: 1,
    color: "#f3ead0",
    textShadow: "0 2px 0 rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.85)",
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    letterSpacing: 0.4,
  },

  subtitle: {
    position: "relative",
    zIndex: 1,
    fontSize: 8,
    lineHeight: 1.05,
    color: "#e2c878",
    textShadow: "0 1px 0 rgba(0,0,0,0.92), 0 0 6px rgba(0,0,0,0.78)",
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transform: "translateY(-2px)"
  },

  fullBadge: {
    width: "100%",
    height: "100%",
    filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.72))",
  },

  // «Слаженность»: a discounted live cost is shown in green to flag the saving.
  discountedCostValue: {
    color: "#7dff8a",
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 7px rgba(40, 200, 90, 0.85)",
  },

  statTooltipTarget: {
    position: "relative",
    width: "max-content",
    height: "max-content",
    margin: 0,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    cursor: "help",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  },

  fillStatTooltipTarget: {
    width: "100%",
    height: "100%",
  },

  statTooltipHitArea: {
    position: "absolute",
    left: "50%",
    top: "50%",
    zIndex: 1,
    width: 82,
    height: 82,
    transform: "translate(-50%, -50%)",
    background: "transparent",
    pointerEvents: "auto",
  },

  statTooltipBubble: {
    position: "absolute",
    left: "calc(100% + 10px)",
    top: "50%",
    zIndex: 80,
    transform: "translateY(-50%)",
    width: 178,
    padding: "10px 12px",
    border: "1px solid rgba(226, 200, 120, 0.58)",
    background:
      "linear-gradient(180deg, rgba(24, 23, 19, 0.97), rgba(5, 6, 7, 0.96))",
    boxShadow:
      "0 0 0 1px rgba(0,0,0,0.72), 0 12px 28px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.08)",
    color: "rgba(244, 238, 216, 0.96)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.18,
    letterSpacing: 0.15,
    textAlign: "left",
    textTransform: "none",
    whiteSpace: "normal",
    pointerEvents: "none",
    textShadow: "0 1px 0 rgba(0,0,0,0.9)",
  },

  statTooltipBubbleTopRight: {
    top: "auto",
    bottom: "calc(100% + 4px)",
    transform: "none",
  },

  statTooltipBubbleBottomRight: {
    top: "calc(100% + 4px)",
    transform: "none",
  },

  spawnCostBadge: {
    position: "absolute",
    left: "2.5%",
    top: "-1.0%",
    zIndex: 6,
    width: "20.2%",
    aspectRatio: "1 / 1.12",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.72))",
  },

  spawnFuelGenerationBadge: {
    position: "absolute",
    left: "16.4%",
    top: "1.6%",
    zIndex: 6,
    width: "14.5%",
    aspectRatio: "1 / 1.12",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.72))",
  },

  spawnCostIcon: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },

  spawnCostValue: {
    position: "absolute",
    left: "50%",
    top: "53%",
    transform: "translate(-50%, -50%)",
    zIndex: 2,
    fontFamily: digitFont,
    fontSize: 15,
    lineHeight: 1,
    color: "#f6d27a",
    fontWeight: 700,
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)",
  },

  leftStats: {
    position: "absolute",
    left: "8.1%",
    top: "27.1%",
    zIndex: 6,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    pointerEvents: "none",
  },

  classIcon: {
    width: 20,
    height: 29,
    objectFit: "contain",
    transform: "translate(-7px, -36px)",
    filter:
      "brightness(1.28) saturate(1.35) contrast(1.38) drop-shadow(0 2px 4px rgba(0,0,0,0.85))",
  },

  enemyClassIcon: {
    opacity: 0.9,
    filter:
      "brightness(0.95) saturate(0.82) contrast(1.04) drop-shadow(0 2px 4px rgba(0,0,0,0.82))",
  },

  healthBadgeOffset: {
    marginTop: -8,
  },

  bottomFuelBadge: {
    marginLeft: 4,
    transform: "scale(0.72)",
    transformOrigin: "center center",
  },

  classIconFallback: {
    width: 29,
    height: 29,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 23,
    lineHeight: 1,
    fontWeight: 900,
    textShadow: "0 2px 4px rgba(0,0,0,0.85)",
  },

  attackWrap: {
    position: "relative",
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
    overflow: "hidden",
    borderRadius: 999,
  },

  attackTint: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderRadius: 999,
    mixBlendMode: "screen",
    pointerEvents: "none",
  },

  healthWrap: {
    position: "relative",
    width: 39,
    height: 43,
    marginTop: -8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
  },

  statIconImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
  },

  attackValue: {
    position: "absolute",
    left: "50%",
    top: "47%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontFamily: digitFont,
    fontSize: 17,
    lineHeight: 1,
    fontWeight: 700,
    textAlign: "center",
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  healthValue: {
    position: "absolute",
    left: "50%",
    top: "43%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontFamily: digitFont,
    fontSize: 17,
    lineHeight: 1,
    color: "#ffe4d8",
    fontWeight: 700,
    textAlign: "center",
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  descriptionPanel: {
    position: "absolute",
    left: "10.5%",
    right: "9.5%",
    bottom: "4.7%",
    height: "25.2%",
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    pointerEvents: "none",
  },

  abilityText: {
    margin: 0,
    color: "rgba(224, 222, 214, 0.72)",
    fontFamily: "inherit",
    fontSize: 9,
    lineHeight: 0.8,
    textShadow: "0 1px 0 rgba(0,0,0,0.95)",
    textAlign: "left",
    overflowWrap: "break-word",
    wordBreak: "normal",
  },

  mechanicsLine: {
    display: "flex",
    flexWrap: "wrap",
    gap: 3,
    marginTop: 2,
    pointerEvents: "auto",
  },

  mechanicBadge: {
    fontSize: 11,
    lineHeight: "1.1",
    padding: "2px 6px",
    borderRadius: 4,
    background: "rgba(180, 160, 90, 0.18)",
    color: "rgba(236, 229, 204, 0.85)",
    border: "1px solid rgba(200, 180, 110, 0.25)",
    whiteSpace: "nowrap",
    cursor: "help",
  },

  compactMechanicsLine: {
    flexWrap: "nowrap",
    gap: 2,
    marginTop: 1,
  },

  compactMechanicBadge: {
    flex: "0 1 auto",
    minWidth: 0,
    padding: "1px 3px",
    fontSize: 7,
    lineHeight: 1,
    letterSpacing: 0,
  },

  bottomMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    color: "rgba(236, 229, 204, 0.72)",
    fontFamily: "inherit",
    fontSize: 10,
    lineHeight: 1,
  },
};
