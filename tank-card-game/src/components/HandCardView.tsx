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
  onClick?: () => void;
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
  onClick,
}: HandCardViewProps) {
  const nation = getNationVisual(card.nation);
  const unitClass = getClassVisual(card.class);
  const hpValue = currentHp ?? card.hp;
  const tankImage = getTankImage(card.id);
  const classIcon = getBoardClassIcon(card.class, ownerId);
  const isPlayer = ownerId === "player";

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      style={{
        ...styles.card,
        ...(selected ? styles.cardSelected : {}),
        ...(disabled ? styles.cardDisabled : {}),
      }}
      onClick={() => {
        if (disabled) return;
        onClick?.();
      }}
      onKeyDown={(event) => {
        if (disabled) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div style={styles.cardInner}>
        <img
          src={cardHandFrameImage}
          alt=""
          style={styles.cardFrame}
          draggable={false}
        />

        <div
          style={{
            ...styles.artMaskWrap,
            WebkitMaskImage: `url(${handCardArtMaskImage})`,
            maskImage: `url(${handCardArtMaskImage})`,
          }}
        >
          <img
            src={tankImage}
            alt={card.name}
            style={styles.tankArt}
            draggable={false}
          />

          <div style={styles.artVignette} />
        </div>

        <div style={styles.titleArea}>
          <strong style={styles.title}>{card.name}</strong>
          <span style={styles.subtitle}>
            {nation.label} {unitClass.label}
          </span>
        </div>

        <div style={styles.spawnCostBadge} title="Стоимость розыгрыша">
          <img
            src={fuelCanisterIcon}
            alt=""
            style={styles.spawnCostIcon}
            draggable={false}
          />
          <strong style={styles.spawnCostValue}>{card.cost}</strong>
        </div>

        <div style={styles.actionCostBadge} title="Стоимость действия">
          <img
            src={actionCostBadgeImage}
            alt=""
            style={styles.actionCostIcon}
            draggable={false}
          />
          <strong style={styles.actionCostValue}>{card.actionFuelCost}</strong>
        </div>

        <div style={styles.leftStatsRail}>
          <div style={styles.classIconWrap} title={unitClass.label}>
            <img
              src={classIcon}
              alt={unitClass.label}
              style={styles.classIconImage}
              draggable={false}
            />
          </div>

          <div style={styles.attackIconWrap} title="Атака">
            <img
              src={attackBadgeImage}
              alt=""
              style={styles.statIconImage}
              draggable={false}
            />
            <span
              style={{
                ...styles.attackTint,
                ...(isPlayer ? styles.attackTintPlayer : styles.attackTintEnemy),
              }}
            />
            <strong
              style={{
                ...styles.attackValue,
                color: isPlayer ? "#73ff78" : "#ff5f56",
              }}
            >
              {card.attack}
            </strong>
          </div>

          <div style={styles.healthIconWrap} title="Здоровье">
            <img
              src={healthBadgeImage}
              alt=""
              style={styles.statIconImage}
              draggable={false}
            />
            <strong style={styles.healthValue}>{hpValue}</strong>
          </div>
        </div>

        <div style={styles.descriptionArea}>
          {card.abilityText ? (
            <p style={styles.abilityText}>{card.abilityText}</p>
          ) : (
            <p style={styles.abilityTextMuted}>Особых свойств нет.</p>
          )}
        </div>

        <div style={styles.bottomStatsRow}>
          <StatChip label="Дальность" value={card.range} tone="#9fd3ff" />
          <StatChip label="Топливо" value={`+${card.fuelGeneration}`} tone="#d6a84f" />
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <span style={{ ...styles.statChip, borderColor: `${tone}88` }}>
      <small style={{ color: tone }}>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: "relative",
    width: "100%",
    minWidth: 175,
    aspectRatio: "2 / 3",
    border: "none",
    background: "transparent",
    color: "#eef2f3",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    overflow: "visible",
    userSelect: "none",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    transition: "filter 0.18s ease, opacity 0.18s ease",
  },

  cardSelected: {
    filter:
      "drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 0 14px rgba(247, 215, 116, 0.9)) brightness(1.08)",
  },

  cardDisabled: {
    opacity: 0.52,
    cursor: "not-allowed",
    filter: "grayscale(0.25) brightness(0.78)",
  },

  cardInner: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "visible",
  },

  cardFrame: {
    position: "absolute",
    inset: 0,
    zIndex: 5,
    width: "100%",
    height: "100%",
    objectFit: "fill",
    pointerEvents: "none",
    userSelect: "none",
  },

  artMaskWrap: {
    position: "absolute",
    left: "14.1%",
    top: "17.1%",
    width: "76.2%",
    height: "30.6%",
    zIndex: 12,
    overflow: "hidden",
    background: "#101313",

    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "100% 100%",
    WebkitMaskPosition: "center",

    maskRepeat: "no-repeat",
    maskSize: "100% 100%",
    maskPosition: "center",
  },

  tankArt: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center center",
    display: "block",
    transform: "scale(1.02)",
  },

  artVignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 52% 48%, rgba(255,255,255,0.04), rgba(0,0,0,0.38) 82%), linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.34))",
    pointerEvents: "none",
  },

  titleArea: {
    position: "absolute",
    left: "20.2%",
    right: "16.8%",
    top: "3.2%",
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    pointerEvents: "none",
  },

  title: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontFamily: "'Oswald', 'Rajdhani', 'Arial Narrow', sans-serif",
    fontSize: "clamp(17px, 7.6vw, 32px)",
    lineHeight: 1,
    letterSpacing: 0.3,
    color: "#f8e59b",
    textTransform: "uppercase",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.9)",
  },

  subtitle: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontFamily: "'Roboto Condensed', 'Arial Narrow', sans-serif",
    fontSize: "clamp(8px, 3vw, 12px)",
    lineHeight: 1,
    color: "#f5d56b",
    opacity: 0.92,
    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
  },

  spawnCostBadge: {
    position: "absolute",
    left: "1.7%",
    top: "1.9%",
    zIndex: 22,
    width: "16.5%",
    height: "10.8%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.75))",
  },

  spawnCostIcon: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
  },

  spawnCostValue: {
    position: "absolute",
    left: "50%",
    top: "53%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
    fontSize: "clamp(16px, 6.8vw, 28px)",
    lineHeight: 1,
    color: "#f6d27a",
    fontWeight: 700,
    textAlign: "center",
    textShadow: "0 2px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)",
  },

  actionCostBadge: {
    position: "absolute",
    right: "3.8%",
    top: "3.1%",
    zIndex: 22,
    width: "12.2%",
    height: "8.2%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },

  actionCostIcon: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
    filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.66))",
  },

  actionCostValue: {
    position: "absolute",
    left: "50%",
    top: "50%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
    fontSize: "clamp(12px, 4.8vw, 19px)",
    lineHeight: 1,
    color: "#f6d27a",
    fontWeight: 700,
    textAlign: "center",
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  leftStatsRail: {
    position: "absolute",
    left: "1.6%",
    top: "16.7%",
    zIndex: 24,
    width: "16%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    pointerEvents: "none",
  },

  classIconWrap: {
    position: "relative",
    width: "74%",
    aspectRatio: "1 / 1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.76))",
  },

  classIconImage: {
    width: "82%",
    height: "82%",
    objectFit: "contain",
    display: "block",
    filter:
      "brightness(1.28) saturate(1.35) contrast(1.58) drop-shadow(0 1px 3px rgba(0,0,0,0.85))",
    pointerEvents: "none",
    userSelect: "none",
  },

  attackIconWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
  },

  healthIconWrap: {
    position: "relative",
    width: "104%",
    aspectRatio: "38 / 43",
    marginTop: -7,
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

  attackTint: {
    position: "absolute",
    inset: "14%",
    zIndex: 1,
    borderRadius: "999px",
    mixBlendMode: "screen",
    pointerEvents: "none",
  },

  attackTintPlayer: {
    background:
      "radial-gradient(circle, rgba(71,255,89,0.5), rgba(71,255,89,0.18) 58%, transparent 72%)",
  },

  attackTintEnemy: {
    background:
      "radial-gradient(circle, rgba(255,56,47,0.56), rgba(255,56,47,0.2) 58%, transparent 72%)",
  },

  attackValue: {
    position: "absolute",
    left: "50%",
    top: "47%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
    fontSize: "clamp(15px, 5.8vw, 24px)",
    lineHeight: 1,
    fontWeight: 600,
    textAlign: "center",
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  healthValue: {
    position: "absolute",
    left: "50%",
    top: "43%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontFamily: "'Rajdhani', 'Arial Narrow', sans-serif",
    fontSize: "clamp(15px, 5.8vw, 24px)",
    lineHeight: 1,
    color: "#f0f0f0",
    fontWeight: 600,
    textAlign: "center",
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  descriptionArea: {
    position: "absolute",
    left: "5.4%",
    right: "5.4%",
    top: "50.3%",
    bottom: "9.8%",
    zIndex: 18,
    padding: "7% 4.5% 4.5%",
    pointerEvents: "none",
    overflow: "hidden",
  },

  abilityText: {
    margin: 0,
    fontFamily: "'Roboto Condensed', 'Arial Narrow', sans-serif",
    fontSize: "clamp(10px, 3.9vw, 15px)",
    lineHeight: 1.16,
    color: "rgba(230, 232, 222, 0.72)",
    textShadow: "0 1px 3px rgba(0,0,0,0.82)",
  },

  abilityTextMuted: {
    margin: 0,
    fontFamily: "'Roboto Condensed', 'Arial Narrow', sans-serif",
    fontSize: "clamp(10px, 3.9vw, 15px)",
    lineHeight: 1.16,
    color: "rgba(210, 214, 206, 0.42)",
    textShadow: "0 1px 3px rgba(0,0,0,0.82)",
  },

  bottomStatsRow: {
    position: "absolute",
    left: "8%",
    right: "8%",
    bottom: "4%",
    zIndex: 19,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    pointerEvents: "none",
  },

  statChip: {
    minHeight: 20,
    borderRadius: 7,
    border: "1px solid",
    background:
      "linear-gradient(180deg, rgba(12, 13, 13, 0.88), rgba(0, 0, 0, 0.78))",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    padding: "2px 5px",
    boxShadow: "inset 0 0 12px rgba(0,0,0,0.65)",
    fontSize: 10,
  },
};
