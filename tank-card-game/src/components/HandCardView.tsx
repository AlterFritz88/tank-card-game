import type React from "react";
import { getHeadquartersDefinition } from "../game/headquarters";
import {
  getHeadquartersImageAsset,
  getLegacyHeadquartersImageAsset,
} from "../game/headquartersImages";
import type { HeadquartersId, PlayerId, TankCard } from "../game/types";
import {
  getClassVisual,
  getNationFlagStyle,
  getNationVisual,
} from "../game/cardVisuals";
import { getTankImage } from "../game/tankImages";
import prototypeTankImage from "../assets/tanks/prototype-tank.png";
import { StatBadge } from "./StatBadge";
import cardHandFrameImage from "../assets/cards/card-hand-frame.png";
import handCardArtMaskImage from "../assets/cards/hand-card-art-mask.png";
import classLightPlayerIcon from "../assets/icons/classes/class-light-player.png";
import classLightEnemyIcon from "../assets/icons/classes/class-light-enemy.png";
import classMediumPlayerIcon from "../assets/icons/classes/class-medium-player.png";
import classMediumEnemyIcon from "../assets/icons/classes/class-medium-enemy.png";
import classHeavyPlayerIcon from "../assets/icons/classes/class-heavy-player.png";
import classHeavyEnemyIcon from "../assets/icons/classes/class-heavy-enemy.png";
import classTdPlayerIcon from "../assets/icons/classes/class-td-player.png";
import classTdEnemyIcon from "../assets/icons/classes/class-td-enemy.png";
import classSpgPlayerIcon from "../assets/icons/classes/class-spg-player.png";
import classSpgEnemyIcon from "../assets/icons/classes/class-spg-enemy.png";

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
  selected?: boolean;
  disabled?: boolean;
  displayMode?: HandCardDisplayMode;
  previewScale?: number;
};

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

    default:
      return isPlayer ? classMediumPlayerIcon : classMediumEnemyIcon;
  }
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


export function HandCardView({
  card,
  headquarters,
  ownerId = "player",
  headquartersId,
  artOwnerId,
  currentHp,
  selected = false,
  disabled = false,
  displayMode = "hand",
  previewScale,
}: HandCardViewProps) {
  const isHeadquarters = Boolean(headquarters);

  if (!card && !headquarters) {
    return null;
  }

  const isPreview = displayMode === "preview";
  const badgeMode = isPreview ? "preview" : "hand";
  const defaultPreviewScale = 390 / 175;
  const uiScale = isPreview ? previewScale ?? defaultPreviewScale : 1;
  const scaled = (value: number) => Math.round(value * uiScale);

  const unitClass = card ? getClassVisual(card.class) : null;

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
    : getBoardClassIcon(card!.class, ownerId);

  const title = isHeadquarters
    ? headquartersDefinition?.title ?? "Штаб"
    : card!.name;
  const subtitle = isHeadquarters
    ? headquartersDefinition?.type ?? headquartersDefinition?.subtitle ?? "Командный пункт"
    : `${nation!.label} · ${unitClass!.label}`;

  const hpValue = isHeadquarters
    ? headquarters!.hp
    : currentHp ?? card!.hp;

  const attackValue = isHeadquarters
    ? headquarters!.attack
    : card!.attack;

  const fuelGenerationValue = isHeadquarters
    ? headquarters!.fuelGeneration
    : card!.fuelGeneration;

  const abilityText = isHeadquarters
    ? headquartersDefinition?.description ?? "Командный пункт."
    : card!.abilityText || "Без особых свойств.";


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
      </div>

      {nation ? (
        <div
          style={{
            ...styles.nationFlag,
            ...getNationFlagStyle(nation),
          }}
        />
      ) : null}

      <div style={styles.spawnCostBadge}>
        <StatBadge
          type={isHeadquarters ? "fuelGeneration" : "spawnCost"}
          mode={badgeMode}
          value={isHeadquarters ? `+${fuelGenerationValue}` : card!.cost}
          title={
            isHeadquarters
              ? "Генерация топлива штабом"
              : "Стоимость розыгрыша"
          }
          style={styles.fullBadge}
        />
      </div>

      {!isHeadquarters && (
        <div style={styles.spawnFuelGenerationBadge}>
          <StatBadge
            type="fuelGeneration"
            mode={badgeMode}
            value={`+${fuelGenerationValue}`}
            title="Генерация топлива за ход"
            style={styles.fullBadge}
          />
        </div>
      )}

      <div
        style={{
          ...styles.titleArea,
          ...(isHeadquarters ? styles.headquartersTitleArea : {}),
          gap: scaled(4),
        }}
      >
        <strong
          style={{
            ...styles.title,
            fontSize: scaled(15),
            letterSpacing: 0.4 * uiScale,
          }}
        >
          {title}
        </strong>
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
        }}
      >
        {classIcon ? (
          <img
            src={classIcon}
            alt={isHeadquarters ? "Штаб" : unitClass!.label}
            title={isHeadquarters ? "Штаб" : unitClass!.label}
            style={{
              ...styles.classIcon,
              width: scaled(20),
              height: scaled(29),
              transform: `translate(${-7 * uiScale}px, ${-36 * uiScale}px)`,
            }}
            draggable={false}
          />
        ) : (
          <span
            style={{
              ...styles.classIconFallback,
              width: scaled(29),
              height: scaled(29),
              fontSize: scaled(23),
              color: ownerId === "player" ? "#7dff8a" : "#ff5a52",
            }}
            title="Штаб"
          >
            ⚑
          </span>
        )}

        <StatBadge
          type="attack"
          mode={badgeMode}
          ownerId={ownerId}
          value={attackValue}
          title="Атака"
        />

        <StatBadge
          type="health"
          mode={badgeMode}
          value={hpValue}
          title="Здоровье"
          style={{ marginTop: -8 * uiScale }}
        />
      </div>

      <div style={styles.descriptionPanel}>
        <p
          style={{
            ...styles.abilityText,
            fontSize: scaled(11),
            lineHeight: 1.18,
          }}
        >
          {abilityText}
        </p>

        {/* New mechanics badges (only for select low-stat units) */}
        {card && card.onPlayEffects && (
          <div
            style={{
              ...styles.mechanicsLine,
              ...(isPreview ? {} : styles.compactMechanicsLine),
            }}
          >
            {card.onPlayEffects.draw && card.onPlayEffects.draw > 0 && (
              <span
                style={{
                  ...styles.mechanicBadge,
                  ...(isPreview ? {} : styles.compactMechanicBadge),
                }}
                title="Разведка: при выходе на поле боя вы добираете карту."
              >
                {isPreview ? "Разведка" : "РАЗВ"} +{card.onPlayEffects.draw}
              </span>
            )}
            {card.onPlayEffects.hqProtection && card.onPlayEffects.hqProtection > 0 && (
              <span
                style={{
                  ...styles.mechanicBadge,
                  ...(isPreview ? {} : styles.compactMechanicBadge),
                }}
                title="Прикрытие: при выходе на поле боя ваш штаб получает дополнительные очки здоровья."
              >
                {isPreview ? "Прикрытие" : "ПРИКР"} +{card.onPlayEffects.hqProtection}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


const digitFont =
  "'Rajdhani', 'Arial Narrow', Inter, ui-sans-serif, system-ui, sans-serif";

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: "relative",
    isolation: "isolate",
    width: "100%",
    aspectRatio: "1051 / 1496",
    overflow: "visible",
    color: "#eef2f3",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
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

    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "95% 100%",
    WebkitMaskPosition: "center",

    maskRepeat: "no-repeat",
    
    maskSize: "96% 100%",
    maskPosition: "center -6px",
  },

  tankArt: {
  position: "absolute",
  left: "-3%",
  top: "7%",
  width: "99%",
  height: "60%",
  objectFit: "contain",
  objectPosition: "45% center",
  display: "block",
},

  artVignette: {
    position: "absolute",
    left: "9.8%",
    top: "15.95%",
    width: "81%",
    height: "52.1%",
    background:
      "radial-gradient(circle at 50% 45%, transparent 50%, rgba(0,0,0,0.38) 100%), linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.24))",
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
  },

  titleAreaWithoutSpawnCost: {
    left: "7%",
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
