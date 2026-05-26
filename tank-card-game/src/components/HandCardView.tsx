import type React from "react";
import type { PlayerId, TankCard } from "../game/types";
import { getClassVisual, getNationVisual } from "../game/cardVisuals";
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

const headquartersImageModules = import.meta.glob(
  "../assets/headquarters/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

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
  actionFuelCost: number;
};

type HandCardDisplayMode = "hand" | "preview";

type HandCardViewProps = {
  card?: TankCard;
  headquarters?: HeadquartersHandCardData;
  ownerId?: PlayerId;
  currentHp?: number;
  selected?: boolean;
  disabled?: boolean;
  displayMode?: HandCardDisplayMode;
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

function getHeadquartersImage(ownerId: PlayerId): string {
  const side = ownerId === "player" ? "player" : "enemy";
  const opponentSide = ownerId === "player" ? "friendly" : "bot";

  return (
    getOptionalImage(headquartersImageModules, [
      `headquarters-${side}.png`,
      `headquarters-${side}.jpg`,
      `headquarters-${side}.jpeg`,
      `headquarters-${side}.webp`,
      `hq-${side}.png`,
      `hq-${side}.jpg`,
      `hq-${side}.jpeg`,
      `hq-${side}.webp`,
      `headquarters-${opponentSide}.png`,
      `headquarters-${opponentSide}.jpg`,
      `headquarters-${opponentSide}.jpeg`,
      `headquarters-${opponentSide}.webp`,
      `hq-${opponentSide}.png`,
      `hq-${opponentSide}.jpg`,
      `hq-${opponentSide}.jpeg`,
      `hq-${opponentSide}.webp`,
      "headquarters.png",
      "headquarters.jpg",
      "headquarters.jpeg",
      "headquarters.webp",
      "hq.png",
      "hq.jpg",
      "hq.jpeg",
      "hq.webp",
    ]) ?? prototypeTankImage
  );
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
  currentHp,
  selected = false,
  disabled = false,
  displayMode = "hand",
}: HandCardViewProps) {
  const isHeadquarters = Boolean(headquarters);

  if (!card && !headquarters) {
    return null;
  }

  const isPreview = displayMode === "preview";
  const badgeMode = isPreview ? "preview" : "hand";
  const previewScale = 390 / 175;
  const uiScale = isPreview ? previewScale : 1;
  const scaled = (value: number) => Math.round(value * uiScale);

  const nation = card ? getNationVisual(card.nation) : null;
  const unitClass = card ? getClassVisual(card.class) : null;

  const tankImage = isHeadquarters
    ? getHeadquartersImage(ownerId)
    : getTankImage(card!.id);

  const hqClassIcon = isHeadquarters ? getHeadquartersClassIcon(ownerId) : null;
  const classIcon = isHeadquarters
    ? hqClassIcon
    : getBoardClassIcon(card!.class, ownerId);

  const title = isHeadquarters ? "Штаб" : card!.name;
  const subtitle = isHeadquarters
    ? ownerId === "player"
      ? "Командный пункт · Союзник"
      : "Командный пункт · Враг"
    : `${nation!.label} · ${unitClass!.label}`;

  const hpValue = isHeadquarters
    ? headquarters!.hp
    : currentHp ?? card!.hp;

  const attackValue = isHeadquarters
    ? headquarters!.attack
    : card!.attack;

  const actionCostValue = isHeadquarters
    ? headquarters!.actionFuelCost
    : card!.actionFuelCost;

  const fuelGenerationValue = isHeadquarters
    ? headquarters!.fuelGeneration
    : card!.fuelGeneration;

  const abilityText = isHeadquarters
    ? `Командный пункт. Генерирует топливо: +${fuelGenerationValue}. Потеря штаба означает поражение.`
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

      {!isHeadquarters && (
        <div style={styles.spawnCostBadge}>
          <StatBadge
            type="spawnCost"
            mode={badgeMode}
            value={card!.cost}
            title="Стоимость розыгрыша"
            style={styles.fullBadge}
          />
        </div>
      )}

      {!isHeadquarters && (
        <div style={styles.spawnFuelGenerationBadge}>
          <StatBadge
            type="fuel"
            mode={badgeMode}
            value={`+${fuelGenerationValue}`}
            title="Генерация топлива за ход"
            style={styles.fullBadge}
          />
        </div>
      )}

      <div style={styles.actionCostBadge}>
        <StatBadge
          type="actionCost"
          mode={badgeMode}
          value={actionCostValue}
          title="Стоимость действия"
          style={styles.fullBadge}
        />
      </div>

      <div
        style={{
          ...styles.titleArea,
          ...(isHeadquarters ? styles.titleAreaWithoutSpawnCost : {}),
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
    gap: 1,
    pointerEvents: "none",
  },

  titleAreaWithoutSpawnCost: {
    left: "7%",
  },

  title: {
    fontFamily: "inherit",
    fontSize: 15,
    lineHeight: 1,
    color: "#f3ead0",
    textShadow: "0 2px 0 rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.85)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    letterSpacing: 0.4,
  },

  subtitle: {
    fontSize: 8,
    lineHeight: 1.05,
    color: "#e2c878",
    textShadow: "0 1px 0 rgba(0,0,0,0.92), 0 0 6px rgba(0,0,0,0.78)",
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

  actionCostBadge: {
    position: "absolute",
    right: "2.7%",
    top: "2.2%",
    zIndex: 6,
    width: "17%",
    aspectRatio: "1 / 1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.72))",
  },

  actionCostIcon: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },

  actionCostValue: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 2,
    fontFamily: digitFont,
    fontSize: 14,
    lineHeight: 1,
    color: "#f6d27a",
    fontWeight: 700,
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
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
