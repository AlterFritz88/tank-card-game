import type React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PlayerId } from "../game/types";
import { StatBadge } from "./StatBadge";

type FuelPanelProps = {
  ownerId: PlayerId;
  currentFuel: number;
  nextTurnFuel: number;
  title?: string;
};

function SplitFlapNumber({ value }: { value: number }) {
  const digits = String(Math.max(0, Math.floor(value)));

  return (
    <span style={styles.flapNumber} aria-label={String(value)}>
      {Array.from(digits).map((digit, index) => (
        <span key={`${digits.length}-${index}`} style={styles.flapCell}>
          <AnimatePresence initial={false}>
            <motion.span
              key={digit}
              style={styles.flapDigit}
              initial={{ y: "-82%", rotateX: 72, opacity: 0 }}
              animate={{ y: "0%", rotateX: 0, opacity: 1 }}
              exit={{ y: "82%", rotateX: -72, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {digit}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

export function FuelPanel({
  ownerId,
  currentFuel,
  nextTurnFuel,
  title = "Топливо",
}: FuelPanelProps) {
  const isPlayer = ownerId === "player";

  return (
    <div
      style={{
        ...styles.panel,
        ...(isPlayer ? styles.playerPanel : styles.enemyPanel),
      }}
      title={title}
    >
      <div style={styles.badgesRow}>
        <StatBadge
          type="spawnCost"
          mode="hand"
          value={<SplitFlapNumber value={currentFuel} />}
          title="Осталось топлива в этом ходу"
          style={styles.currentFuelBadge}
          valueStyle={styles.currentFuelValue}
        />

        <span style={styles.plusSign} aria-hidden="true">
          +
        </span>

        <StatBadge
          type="fuelGeneration"
          mode="hand"
          value={<SplitFlapNumber value={nextTurnFuel} />}
          title="Придет топлива в следующем ходу"
          style={styles.nextFuelBadge}
          valueStyle={styles.nextFuelValue}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    color: "#d6a84f",
    pointerEvents: "none",
  },

  playerPanel: {},

  enemyPanel: {},

  badgesRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    width: "100%",
  },

  plusSign: {
    flex: "0 0 auto",
    margin: "0 -1px",
    color: "#f6d27a",
    fontSize: 18,
    lineHeight: 1,
    fontWeight: 900,
    fontFamily: "var(--font-digit)",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)",
    pointerEvents: "none",
    userSelect: "none",
    transform: "translate(-14px, 0px)",
  },

  currentFuelBadge: {
    width: 75,
    height: 74,
    filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.72))",
  },

  nextFuelBadge: {
    width: 42,
    height: 46,
    filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.64))",
    marginLeft: -18,
  },

  currentFuelValue: {
    fontSize: 20,
    fontWeight: 800,
    transform: "translate(-50%, calc(-50% + 2px))",
  },

  nextFuelValue: {
    fontSize: 16,
    fontWeight: 800,
  },

  flapNumber: {
    display: "inline-flex",
    alignItems: "center",
    gap: 1,
    fontVariantNumeric: "tabular-nums",
  },

  flapCell: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "0.68em",
    height: "1.04em",
    overflow: "hidden",
    perspective: 70,
  },

  flapDigit: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transformOrigin: "center center",
  },

};
