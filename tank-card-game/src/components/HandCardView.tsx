import type React from "react";
import type { PlayerId, TankCard } from "../game/types";
import { getClassVisual, getNationVisual } from "../game/cardVisuals";
import { getTankImage } from "../game/tankImages";
import cardHandFrameImage from "../assets/cards/card-hand-frame.png";
import handCardArtMaskImage from "../assets/cards/hand-card-art-mask.png";
import fuelCanisterIcon from "../assets/icons/fuel-canister-icon.png";
import attackBadgeImage from "../assets/icons/badge-attack.png";
import healthBadgeImage from "../assets/icons/badge-health.png";
import actionCostBadgeImage from "../assets/icons/badge-action-cost.png";
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

type HandCardViewProps = {
  card: TankCard;
  ownerId?: PlayerId;
  currentHp?: number;
  selected?: boolean;
  disabled?: boolean;
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

export function HandCardView({
  card,
  ownerId = "player",
  currentHp,
  selected = false,
  disabled = false,
}: HandCardViewProps) {
  const nation = getNationVisual(card.nation);
  const unitClass = getClassVisual(card.class);
  const tankImage = getTankImage(card.id);
  const classIcon = getBoardClassIcon(card.class, ownerId);
  const hpValue = currentHp ?? card.hp;
  const attackTint =
    ownerId === "player"
      ? "rgba(63, 220, 92, 0.34)"
      : "rgba(230, 50, 46, 0.36)";
  const attackValueColor = ownerId === "player" ? "#7dff8a" : "#ff5a52";

  return (
    <div
      style={{
        ...styles.card,
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
        <img src={tankImage} alt={card.name} style={styles.tankArt} draggable={false} />
        <div style={styles.artVignette} />
      </div>

      <div style={styles.spawnCostBadge} title="Стоимость розыгрыша">
        <img src={fuelCanisterIcon} alt="" style={styles.spawnCostIcon} draggable={false} />
        <strong style={styles.spawnCostValue}>{card.cost}</strong>
      </div>

      <div style={styles.actionCostBadge} title="Стоимость действия">
        <img src={actionCostBadgeImage} alt="" style={styles.actionCostIcon} draggable={false} />
        <strong style={styles.actionCostValue}>{card.actionFuelCost}</strong>
      </div>

      <div style={styles.titleArea}>
        <strong style={styles.title}>{card.name}</strong>
        <span style={styles.subtitle}>
          {nation.label} · {unitClass.label}
        </span>
      </div>

      <div style={styles.leftStats}>
        <img src={classIcon} alt={unitClass.label} title={unitClass.label} style={styles.classIcon} draggable={false} />

        <div style={styles.attackWrap} title="Атака">
          <img src={attackBadgeImage} alt="" style={styles.statIconImage} draggable={false} />
          <div style={{ ...styles.attackTint, background: attackTint }} />
          <strong style={{ ...styles.attackValue, color: attackValueColor }}>
            {card.attack}
          </strong>
        </div>

        <div style={styles.healthWrap} title="Здоровье">
          <img src={healthBadgeImage} alt="" style={styles.statIconImage} draggable={false} />
          <strong style={styles.healthValue}>{hpValue}</strong>
        </div>
      </div>

      <div style={styles.descriptionPanel}>
        <p style={styles.abilityText}>
          {card.abilityText || "Без особых свойств."}
        </p>
        <div style={styles.bottomMeta}>
          <span>RNG</span>
          <strong>{card.range}</strong>
          <span>FUEL</span>
          <strong>+{card.fuelGeneration}</strong>
        </div>
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

  selectedCard: {
    filter:
      "drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 0 12px rgba(247, 215, 116, 0.9)) drop-shadow(0 16px 26px rgba(0,0,0,0.52))",
  },

  disabledCard: {
    opacity: 0.52,
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
    WebkitMaskSize: "100% 100%",
    WebkitMaskPosition: "center",

    maskRepeat: "no-repeat",
    maskSize: "100% 100%",
    maskPosition: "center",
  },

  tankArt: {
    position: "absolute",
    left: "9.8%",
    top: "8.95%",
    width: "98%",
    height: "52.1%",
    objectFit: "cover",
    objectPosition: "center center",
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
    left: "15%",
    top: "2.8%",
    right: "14%",
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    gap: 1,
    pointerEvents: "none",
  },

  title: {
    fontFamily: "'Oswald', 'Rajdhani', 'Arial Narrow', sans-serif",
    fontSize: 18,
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
  },

  spawnCostBadge: {
    position: "absolute",
    left: "2.5%",
    top: "2.3%",
    zIndex: 6,
    width: "12.2%",
    aspectRatio: "1 / 1.12",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.72))",
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
    fontSize: 18,
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
    width: "11%",
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
    left: "3.1%",
    top: "25.1%",
    zIndex: 6,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    pointerEvents: "none",
  },

  classIcon: {
    width: 29,
    height: 29,
    objectFit: "contain",
    filter:
      "brightness(1.28) saturate(1.35) contrast(1.38) drop-shadow(0 2px 4px rgba(0,0,0,0.85))",
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
    left: "6.5%",
    right: "5.5%",
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
    fontFamily: "'Roboto Condensed', 'Arial Narrow', Inter, sans-serif",
    fontSize: 11,
    lineHeight: 1.18,
    textShadow: "0 1px 0 rgba(0,0,0,0.95)",
  },

  bottomMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    color: "rgba(236, 229, 204, 0.72)",
    fontFamily: digitFont,
    fontSize: 10,
    lineHeight: 1,
  },
};
