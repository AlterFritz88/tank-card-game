import type React from "react";
import type { TankCard } from "../game/types";
import { getClassVisual, getNationVisual } from "../game/cardVisuals";

type TankCardViewVariant = "hand" | "board";

type TankCardViewProps = {
  card: TankCard;
  variant: TankCardViewVariant;
  currentHp?: number;
  selected?: boolean;
  disabled?: boolean;
  alreadyMoved?: boolean;
  alreadyAttacked?: boolean;
  onClick?: () => void;
};

export function TankCardView({
  card,
  variant,
  currentHp,
  selected = false,
  disabled = false,
  alreadyMoved = false,
  alreadyAttacked = false,
  onClick,
}: TankCardViewProps) {
  const nation = getNationVisual(card.nation);
  const unitClass = getClassVisual(card.class);

  const hpValue = currentHp ?? card.hp;
  const isHand = variant === "hand";

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      style={{
        ...styles.card,
        ...(isHand ? styles.handCard : styles.boardCard),
        borderColor: selected ? "#f7d774" : unitClass.accent,
        boxShadow: selected
          ? `0 0 0 3px rgba(247, 215, 116, 0.9), 0 12px 30px rgba(0, 0, 0, 0.35)`
          : `0 0 0 1px ${unitClass.accent}55, 0 10px 24px rgba(0, 0, 0, 0.25)`,
        opacity: disabled ? 0.48 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
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
      <div style={{ ...styles.nationLayer, background: nation.background }}>
        <span style={styles.nationWatermark}>{nation.shortLabel}</span>
      </div>

      <div style={styles.content}>
        <div style={styles.topBar}>
          <span style={{ ...styles.nationBadge, borderColor: nation.accent }}>
            {nation.shortLabel}
          </span>

          <span
            style={{
              ...styles.classBadge,
              background: `${unitClass.accent}22`,
              borderColor: unitClass.accent,
              color: unitClass.accent,
            }}
            title={unitClass.label}
          >
            <span>{unitClass.icon}</span>
            <span>{unitClass.label}</span>
          </span>
        </div>

        <div style={styles.nameRow}>
          <strong style={isHand ? styles.handName : styles.boardName}>
            {card.name}
          </strong>
        </div>

        <div
          style={{
            ...styles.imageFrame,
            ...(isHand ? styles.handImageFrame : styles.boardImageFrame),
            borderColor: `${unitClass.accent}99`,
          }}
        >
          <div style={styles.tankSilhouette}>
            <div style={styles.tankTurret} />
            <div style={styles.tankBarrel} />
            <div style={styles.tankHull} />
            <div style={styles.tankTrackLeft} />
            <div style={styles.tankTrackRight} />
          </div>
        </div>

        <div style={isHand ? styles.handStatsGrid : styles.boardStatsGrid}>
          <Stat label="HP" value={`${hpValue}/${card.hp}`} tone="#7de38d" />
          <Stat label="ATK" value={card.attack} tone="#ff6b5f" />
          <Stat label="ACT" value={card.actionFuelCost} tone="#ffd166" />

          {isHand && (
            <Stat label="SPAWN" value={card.cost} tone="#c084fc" />
          )}

          <Stat label="FUEL" value={`+${card.fuelGeneration}`} tone="#6fb7ff" />

          {isHand && <Stat label="RNG" value={card.range} tone="#a3e635" />}
        </div>

        {!isHand && (
          <div style={styles.statusRow}>
            {alreadyMoved && <span style={styles.statusBadge}>Двигался</span>}
            {alreadyAttacked && (
              <span style={styles.statusBadge}>Атаковал</span>
            )}
          </div>
        )}

        {isHand && card.abilityText && (
          <p style={styles.abilityText}>{card.abilityText}</p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <span style={{ ...styles.stat, borderColor: `${tone}88` }}>
      <small style={{ color: tone }}>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    borderRadius: 16,
    border: "2px solid",
    color: "#eef2f3",
    padding: 0,
    textAlign: "left",
    background: "#111820",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    width: "100%",
  },

  handCard: {
    minHeight: 285,
  },

  boardCard: {
    minHeight: 132,
  },

  nationLayer: {
    position: "absolute",
    inset: 0,
    zIndex: -2,
  },

  nationWatermark: {
    position: "absolute",
    right: -10,
    bottom: -10,
    fontSize: 48,
    fontWeight: 900,
    letterSpacing: -3,
    color: "rgba(255, 255, 255, 0.08)",
  },

  content: {
    position: "relative",
    zIndex: 1,
    minHeight: "100%",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    background:
      "linear-gradient(180deg, rgba(10, 14, 18, 0.18), rgba(10, 14, 18, 0.82))",
  },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },

  nationBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 38,
    height: 24,
    padding: "0 8px",
    borderRadius: 999,
    border: "1px solid",
    background: "rgba(0, 0, 0, 0.35)",
    fontSize: 11,
    fontWeight: 900,
  },

  classBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 24,
    padding: "0 8px",
    borderRadius: 999,
    border: "1px solid",
    background: "rgba(0, 0, 0, 0.35)",
    fontSize: 11,
    fontWeight: 800,
  },

  nameRow: {
    display: "flex",
    alignItems: "center",
    minHeight: 22,
  },

  handName: {
    fontSize: 18,
    lineHeight: 1.1,
    textShadow: "0 2px 8px rgba(0, 0, 0, 0.65)",
  },

  boardName: {
    fontSize: 13,
    lineHeight: 1.05,
    textShadow: "0 2px 8px rgba(0, 0, 0, 0.65)",
  },

  imageFrame: {
    position: "relative",
    border: "1px solid",
    borderRadius: 12,
    background:
      "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.22), rgba(0,0,0,0.34) 58%, rgba(0,0,0,0.62))",
    overflow: "hidden",
  },

  handImageFrame: {
    height: 88,
  },

  boardImageFrame: {
    height: 34,
  },

  tankSilhouette: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "72%",
    height: "48%",
    transform: "translate(-50%, -50%)",
    filter: "drop-shadow(0 8px 8px rgba(0,0,0,0.65))",
  },

  tankTurret: {
    position: "absolute",
    left: "35%",
    top: "16%",
    width: "28%",
    height: "32%",
    borderRadius: "8px 8px 5px 5px",
    background: "linear-gradient(180deg, #9da58c, #566044)",
  },

  tankBarrel: {
    position: "absolute",
    left: "58%",
    top: "27%",
    width: "35%",
    height: "8%",
    borderRadius: 999,
    background: "#bcc4aa",
  },

  tankHull: {
    position: "absolute",
    left: "16%",
    top: "44%",
    width: "68%",
    height: "32%",
    borderRadius: 8,
    background: "linear-gradient(180deg, #87906f, #3f4935)",
  },

  tankTrackLeft: {
    position: "absolute",
    left: "12%",
    top: "72%",
    width: "76%",
    height: "12%",
    borderRadius: 999,
    background: "#252a22",
  },

  tankTrackRight: {
    position: "absolute",
    left: "12%",
    top: "84%",
    width: "76%",
    height: "12%",
    borderRadius: 999,
    background: "#1c211b",
  },

  handStatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 6,
  },

  boardStatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 5,
  },

  stat: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    padding: "4px 5px",
    borderRadius: 8,
    border: "1px solid",
    background: "rgba(0, 0, 0, 0.38)",
  },

  statusRow: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
  },

  statusBadge: {
    padding: "2px 5px",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.12)",
    fontSize: 10,
    fontWeight: 800,
  },

  abilityText: {
    margin: 0,
    padding: "7px 8px",
    borderRadius: 10,
    background: "rgba(0, 0, 0, 0.35)",
    fontSize: 11,
    lineHeight: 1.25,
    color: "rgba(238, 242, 243, 0.86)",
  },
};