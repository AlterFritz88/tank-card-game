import type React from "react";
import type { PlayerId } from "../game/types";
import { AnimatePresence, motion } from "framer-motion";
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
  damageEffect?: {
    id: number;
    amount: number;
  };
  gainEffect?: {
    id: number;
    amount: number;
  };
  previewValue?: number;
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
  damageEffect,
  gainEffect,
  previewValue,
}: StatBadgeProps) {
  const size = getStatBadgeSize(type, mode);
  const showAttackTint = type === "attack";
  const showHealthDamage = type === "health" && damageEffect;
  const showStatChange =
    (type === "health" || type === "attack") && gainEffect;
  const statChangeColor =
    gainEffect && gainEffect.amount < 0 ? "#ff7770" : "#75ff98";
  const showHealthPreview = type === "health" && previewValue !== undefined;

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
      <motion.img
        key={showStatChange ? `gain-icon-${gainEffect.id}` : "idle-icon"}
        src={badgeImages[type]}
        alt=""
        style={{
          ...styles.icon,
          ...iconStyle,
        }}
        animate={
          showStatChange
            ? {
                scale: [1, 1.28, 1.16, 1],
              }
            : {
                scale: 1,
              }
        }
        transition={{ duration: showStatChange ? 0.86 : 0.12, ease: "easeOut" }}
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
        <motion.span
          key={showStatChange ? `gain-${gainEffect.id}` : "value"}
          style={styles.animatedValue}
          animate={
            showStatChange
              ? {
                  scale: [1, 1.36, 1.18, 1],
                  color: [
                    getValueColor(type, mode, ownerId),
                    statChangeColor,
                    statChangeColor,
                    getValueColor(type, mode, ownerId),
                  ],
                }
              : undefined
          }
          transition={
            showStatChange ? { duration: 0.86, ease: "easeOut" } : undefined
          }
        >
          {value}
        </motion.span>
      </strong>

      <AnimatePresence>
        {showStatChange && (
          <motion.strong
            key={gainEffect.id}
            style={{
              ...styles.gainValue,
              color: statChangeColor,
            }}
            initial={{ opacity: 0, y: 3, scale: 0.82 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: [3, -4, -12, -20],
              scale: [0.82, 1.12, 1, 0.92],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.86, ease: "easeOut" }}
          >
            {gainEffect.amount > 0 ? `+${gainEffect.amount}` : gainEffect.amount}
          </motion.strong>
        )}
      </AnimatePresence>

      {showHealthPreview && (
        <motion.div
          style={styles.healthPreview}
          initial={{ opacity: 0, x: -5, scale: 0.82 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -5, scale: 0.82 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <img
            src={healthBadgeImage}
            alt=""
            style={styles.healthPreviewIcon}
            draggable={false}
          />
          <strong style={styles.healthPreviewValue}>{previewValue}</strong>
        </motion.div>
      )}

      <AnimatePresence>
        {showHealthDamage && (
          <motion.div
            key={damageEffect.id}
            style={styles.damageOverlay}
            initial={{ opacity: 0, scale: 1 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [1, 1.12, 1.48, 1.36],
              filter: [
                "brightness(1)",
                "brightness(1.42) drop-shadow(0 0 5px rgba(255, 233, 190, 0.52))",
                "brightness(1.78) drop-shadow(0 0 10px rgba(255, 222, 168, 0.78))",
                "brightness(1.22)",
              ],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.88, ease: "easeOut" }}
          >
            <motion.img
              src={healthBadgeImage}
              alt=""
              style={{ ...styles.icon, ...styles.leftShieldHalf, ...iconStyle }}
              initial={{ x: 0, rotate: 0 }}
              animate={{ x: [0, -3, -10], y: [0, -2, 3], rotate: [0, -6, -15] }}
              transition={{ duration: 0.76, ease: "easeOut" }}
              draggable={false}
            />
            <motion.img
              src={healthBadgeImage}
              alt=""
              style={{ ...styles.icon, ...styles.rightShieldHalf, ...iconStyle }}
              initial={{ x: 0, rotate: 0 }}
              animate={{ x: [0, 3, 10], y: [0, 2, 4], rotate: [0, 7, 16] }}
              transition={{ duration: 0.76, ease: "easeOut" }}
              draggable={false}
            />
            <motion.strong
              style={styles.damageValue}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.76 }}
              animate={{
                opacity: [0, 0, 1, 1, 0],
                x: [0, 7, 18, 40, 62],
                y: [0, -1, -4, -8, -12],
                scale: [0.76, 0.94, 1.34, 1.16, 0.96],
              }}
              transition={{ duration: 0.94, ease: "easeOut" }}
            >
              -{damageEffect.amount}
            </motion.strong>
          </motion.div>
        )}
      </AnimatePresence>
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

  damageOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 5,
    pointerEvents: "none",
  },

  leftShieldHalf: {
    clipPath: "polygon(0 0, 53% 0, 47% 42%, 55% 54%, 47% 100%, 0 100%)",
    transformOrigin: "48% 52%",
  },

  rightShieldHalf: {
    clipPath: "polygon(53% 0, 100% 0, 100% 100%, 47% 100%, 55% 54%, 47% 42%)",
    transformOrigin: "52% 52%",
  },

  damageValue: {
    position: "absolute",
    left: "53%",
    top: "37%",
    zIndex: 7,
    color: "#ff6c62",
    fontFamily: CARD_UI.digitFont,
    fontSize: 16,
    lineHeight: 1,
    fontWeight: 800,
    textShadow:
      "0 1px 0 rgba(0,0,0,0.96), 0 0 6px rgba(120, 0, 0, 0.94)",
    whiteSpace: "nowrap",
  },

  gainValue: {
    position: "absolute",
    left: "56%",
    top: "8%",
    zIndex: 7,
    color: "#75ff98",
    fontFamily: CARD_UI.digitFont,
    fontSize: 15,
    lineHeight: 1,
    fontWeight: 800,
    textShadow:
      "0 1px 0 rgba(0,0,0,0.96), 0 0 7px rgba(20, 115, 48, 0.92)",
    whiteSpace: "nowrap",
  },

  healthPreview: {
    position: "absolute",
    left: "calc(100% + 3px)",
    top: 0,
    zIndex: 6,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    filter: "drop-shadow(0 4px 7px rgba(0,0,0,0.58))",
  },

  healthPreviewIcon: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    opacity: 0.62,
    filter: "sepia(1) saturate(7) hue-rotate(316deg) brightness(0.92)",
  },

  healthPreviewValue: {
    position: "absolute",
    left: "50%",
    top: "53%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    color: "#ff9b91",
    fontFamily: CARD_UI.digitFont,
    fontSize: 14,
    lineHeight: 1,
    fontWeight: 700,
    textShadow:
      "0 1px 0 rgba(0,0,0,0.98), 0 0 5px rgba(95, 0, 0, 0.92)",
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

  animatedValue: {
    display: "inline-block",
    transformOrigin: "center center",
  },

  dimmed: {
    opacity: 0.8,
    filter:
      "grayscale(0.55) brightness(0.85) drop-shadow(0 3px 7px rgba(0,0,0,0.62))",
  },
};
