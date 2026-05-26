import type React from "react";
import type { PlayerId } from "../game/types";
import { StatBadge } from "./StatBadge";

type FuelPanelProps = {
  ownerId: PlayerId;
  currentFuel: number;
  nextTurnFuel: number;
  title?: string;
};

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
          type="fuel"
          mode="hand"
          value={currentFuel}
          title="Осталось топлива в этом ходу"
          style={styles.currentFuelBadge}
          valueStyle={styles.currentFuelValue}
        />

        <span style={styles.plusSign} aria-hidden="true">
          +
        </span>

        <StatBadge
          type="fuel"
          mode="hand"
          value={nextTurnFuel}
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
    gap: 3,
    width: "100%",
  },

  plusSign: {
    flex: "0 0 auto",
    margin: "0 -1px",
    color: "#f6d27a",
    fontSize: 18,
    lineHeight: 1,
    fontWeight: 900,
    fontFamily:
      "'Rajdhani', 'Arial Narrow', Inter, ui-sans-serif, system-ui, sans-serif",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)",
    pointerEvents: "none",
    userSelect: "none",
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
  },

  currentFuelValue: {
    fontSize: 20,
    fontWeight: 800,
  },

  nextFuelValue: {
    fontSize: 13,
    fontWeight: 800,
  },
};
