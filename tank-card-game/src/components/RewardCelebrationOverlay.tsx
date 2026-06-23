import { useMemo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import cardBackImage from "../assets/cards/card-back.webp";
import { HandCardView } from "./HandCardView";
import type { HeadquartersId, TankCard } from "../game/types";

/**
 * A single card revealed by the celebration. Either a unit card or a
 * headquarters card (research tree HQ nodes); the same triumphant reveal is
 * used for campaign rewards (which always grant unit cards, possibly several
 * copies at once).
 */
export type RewardCelebrationCard =
  | { kind: "card"; card: TankCard }
  | {
      kind: "headquarters";
      headquartersId: HeadquartersId;
      headquarters: { hp: number; attack: number; fuelGeneration: number };
    };

export type RewardCelebrationTone = "research" | "purchase" | "reward";

/**
 * Full-screen triumphant reveal shared by the research tree (Исследовано /
 * Куплено) and campaign rewards (Награда). Renders one or more cards flying in
 * with a radial spark burst; lives inside the scaled GameStage like the rest of
 * the UI, so it uses cqw/cqh sizing.
 */
export function RewardCelebrationOverlay({
  cards,
  label,
  tone,
  onClose,
}: {
  cards: RewardCelebrationCard[];
  label: string;
  tone: RewardCelebrationTone;
  onClose: () => void;
}) {
  const count = Math.max(1, cards.length);

  // Radial burst of sparks that fly outward the moment the cards land.
  // Positions are deterministic per mount so the burst reads as a clean star.
  const sparkles = useMemo(() => {
    return Array.from({ length: 18 }, (_, index) => {
      const angle = (index / 18) * Math.PI * 2 + (index % 2 ? 0.32 : 0);
      const distance = 168 + (index % 4) * 30;
      return {
        id: index,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 7 + (index % 3) * 6,
        delay: 0.14 + (index % 6) * 0.035,
        gold: index % 3 !== 0,
      };
    });
  }, []);

  // Two copies share the width a single card would take, so a double reward
  // still fits the stage comfortably.
  const cardWidth = count > 1 ? 320 : 390;
  const cardMaxWidth = `min(${cardWidth}px, ${Math.floor(80 / count)}cqw)`;

  return (
    <motion.div
      style={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={onClose}
    >
      <div style={styles.stage}>
        <motion.div
          aria-hidden="true"
          style={styles.rays}
          initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{ opacity: [0, 0.85, 0.55], scale: 1, rotate: 360 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1.1, ease: "easeOut" },
            scale: { duration: 0.7, ease: "easeOut" },
            rotate: { duration: 22, ease: "linear", repeat: Infinity },
          }}
        />
        <motion.div
          aria-hidden="true"
          style={styles.ring}
          initial={{ opacity: 0.7, scale: 0.25 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 0.95, ease: "easeOut" }}
        />

        {sparkles.map((sparkle) => (
          <motion.span
            key={sparkle.id}
            aria-hidden="true"
            style={{
              ...styles.sparkle,
              width: sparkle.size,
              height: sparkle.size,
              background: sparkle.gold
                ? "radial-gradient(circle, #fff4cf 0%, #f4c053 55%, rgba(244,192,83,0) 72%)"
                : "radial-gradient(circle, #ffffff 0%, #b9e29a 55%, rgba(185,226,154,0) 72%)",
            }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              x: sparkle.x,
              y: sparkle.y,
              scale: [0, 1, 0.3],
            }}
            transition={{ duration: 1.05, delay: sparkle.delay, ease: "easeOut" }}
          />
        ))}

        <div
          style={styles.column}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div style={styles.cardRow}>
            {cards.map((item, index) => (
              <motion.div
                key={index}
                style={{
                  ...styles.cardWrap,
                  width: cardWidth,
                  maxWidth: cardMaxWidth,
                }}
                initial={{ y: 30, scale: 0.72, rotateY: -180 }}
                animate={{
                  y: 0,
                  scale: [0.72, 1.1, 1],
                  rotateY: [-180, -34, 0],
                }}
                exit={{ y: -20, scale: 0.82, opacity: 0 }}
                transition={{
                  duration: 0.9,
                  delay: index * 0.12,
                  ease: "easeOut",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    ...styles.cardBack,
                    backgroundImage: `url(${cardBackImage})`,
                  }}
                />
                {item.kind === "card" ? (
                  <HandCardView card={item.card} displayMode="preview" />
                ) : (
                  <HandCardView
                    headquartersId={item.headquartersId}
                    headquarters={item.headquarters}
                    displayMode="preview"
                  />
                )}
              </motion.div>
            ))}
          </div>
          <motion.div
            style={{
              ...styles.label,
              ...(tone === "research" ? styles.labelResearch : {}),
              ...(tone === "purchase" ? styles.labelPurchase : {}),
              ...(tone === "reward" ? styles.labelReward : {}),
            }}
            initial={{ opacity: 0, y: 18, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: [0.6, 1.22, 1], rotate: [-3, 2, 0] }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
          >
            {label}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9400,
    display: "grid",
    placeItems: "center",
    pointerEvents: "auto",
    perspective: 1200,
    background:
      "radial-gradient(circle at center, rgba(223, 170, 61, 0.16), transparent 38%)",
  },

  stage: {
    position: "relative",
    display: "grid",
    placeItems: "center",
  },

  rays: {
    position: "absolute",
    width: 760,
    height: 760,
    maxWidth: "150cqw",
    maxHeight: "150cqh",
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: 0,
    mixBlendMode: "screen",
    background:
      "repeating-conic-gradient(from 0deg, rgba(255, 218, 120, 0) 0deg, rgba(255, 218, 120, 0.22) 4deg, rgba(255, 218, 120, 0) 9deg)",
    WebkitMaskImage:
      "radial-gradient(circle, rgba(0,0,0,0.95) 12%, rgba(0,0,0,0.5) 38%, transparent 68%)",
    maskImage:
      "radial-gradient(circle, rgba(0,0,0,0.95) 12%, rgba(0,0,0,0.5) 38%, transparent 68%)",
  },

  ring: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: "50%",
    border: "3px solid rgba(255, 226, 150, 0.85)",
    pointerEvents: "none",
    zIndex: 1,
    boxShadow:
      "0 0 28px rgba(242, 188, 77, 0.7), inset 0 0 22px rgba(242, 188, 77, 0.45)",
  },

  sparkle: {
    position: "absolute",
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: 1,
    filter: "drop-shadow(0 0 6px rgba(255, 222, 140, 0.8))",
  },

  column: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
  },

  cardRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 18,
  },

  cardWrap: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    placeItems: "center",
    transformStyle: "preserve-3d",
    filter: "drop-shadow(0 28px 54px rgba(0,0,0,0.82))",
  },

  cardBack: {
    position: "absolute",
    inset: "5% 14%",
    zIndex: -1,
    border: "1px solid rgba(241, 213, 138, 0.36)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    opacity: 0.92,
    transform: "translateZ(-18px) rotateY(180deg)",
    boxShadow: "0 18px 36px rgba(0,0,0,0.68)",
  },

  label: {
    zIndex: 12,
    fontSize: 42,
    fontWeight: 1000,
    letterSpacing: 2.2,
    textAlign: "center",
    textTransform: "uppercase",
    pointerEvents: "none",
  },

  labelResearch: {
    color: "#ffe7a9",
    textShadow: "0 4px 0 rgba(0,0,0,0.82), 0 0 30px rgba(242, 188, 77, 0.7)",
  },

  labelPurchase: {
    color: "#d7f3bd",
    textShadow: "0 4px 0 rgba(0,0,0,0.82), 0 0 30px rgba(130, 187, 101, 0.7)",
  },

  labelReward: {
    color: "#ffe7a9",
    textShadow: "0 4px 0 rgba(0,0,0,0.82), 0 0 34px rgba(242, 188, 77, 0.85)",
  },
};
