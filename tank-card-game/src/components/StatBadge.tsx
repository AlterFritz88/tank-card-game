import type React from "react";
import type { PlayerId } from "../game/types";
import {
  CARD_UI,
  getStatBadgeSize,
  getStatFontSize,
  getStatFontWeight,
  getStatValueTop,
  getAttackTintBorderRadius,
  getAttackTintInset,
  type CardStatBadge,
  type CardViewMode,
} from "../game/cardUiConfig";
import attackBadgeImage from "../assets/icons/badge-attack.png";
import healthBadgeImage from "../assets/icons/badge-health.png";
import fuelCanisterIcon from "../assets/icons/fuel-canister-icon.png";
import fuelGenerationCanisterIcon from "../assets/icons/fuel-generation-canister.png";

type StatBadgeProps = {
  type: CardStatBadge;
  mode: CardViewMode;
  value: React.ReactNode;
  ownerId?: PlayerId;
  dimmed?: boolean;
  title?: string;
  style?: React.CSSProperties;
  valueStyle?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
};

const badgeImages: Record<CardStatBadge, string> = {
  attack: attackBadgeImage,
  health: healthBadgeImage,
  fuel: fuelCanisterIcon,
  fuelGeneration: fuelGenerationCanisterIcon,
  spawnCost: fuelCanisterIcon,
};

function getValueColor(type: CardStatBadge, mode: CardViewMode, ownerId: PlayerId) {
  if (type === "attack") {
    if (mode === "preview") {
      return ownerId === "player"
        ? CARD_UI.colors.playerAttackPreview
        : CARD_UI.colors.enemyAttackPreview;
    }

    return ownerId === "player"
      ? CARD_UI.colors.playerAttack
      : CARD_UI.colors.enemyAttack;
  }

  if (type === "health") return CARD_UI.colors.health;
  if (type === "fuel") return CARD_UI.colors.fuel;
  if (type === "fuelGeneration") return CARD_UI.colors.fuelGeneration;
  if (type === "spawnCost") return CARD_UI.colors.spawnCost;

  return CARD_UI.colors.spawnCost;
}

function getAttackTint(ownerId: PlayerId) {
  return ownerId === "player"
    ? CARD_UI.colors.playerAttackTint
    : CARD_UI.colors.enemyAttackTint;
}

export function StatBadge({
  type,
  mode,
  value,
  ownerId = "player",
  dimmed = false,
  title,
  style,
  valueStyle,
  iconStyle,
}: StatBadgeProps) {
  const size = getStatBadgeSize(type, mode);
  const showAttackTint = type === "attack";

  return (
    <div
      title={title}
      style={{
        ...styles.wrap,
        ...size,
        ...(dimmed ? styles.dimmed : {}),
        ...style,
      }}
    >
      <img
        src={badgeImages[type]}
        alt=""
        style={{ ...styles.icon, ...iconStyle }}
        draggable={false}
      />

      {showAttackTint && (
        <div
          style={{
            ...styles.attackTint,
            inset: getAttackTintInset(mode),
            borderRadius: getAttackTintBorderRadius(mode),
            background: getAttackTint(ownerId),
          }}
        />
      )}

      <strong
        style={{
          ...styles.value,
          top: getStatValueTop(type, mode),
          fontSize: getStatFontSize(type, mode),
          fontWeight: getStatFontWeight(type, mode),
          color: getValueColor(type, mode, ownerId),
          ...valueStyle,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
    transition: "filter 0.22s ease, opacity 0.22s ease",
  },

  icon: {
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
    zIndex: 1,
    mixBlendMode: "screen",
    pointerEvents: "none",
  },

  value: {
    position: "absolute",
    left: "50%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontFamily: CARD_UI.digitFont,
    lineHeight: 1,
    textAlign: "center",
    textShadow: "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  dimmed: {
    opacity: 0.8,
    filter:
      "grayscale(0.55) brightness(0.85) drop-shadow(0 3px 7px rgba(0,0,0,0.62))",
  },
};
