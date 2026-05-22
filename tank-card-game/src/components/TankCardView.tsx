import type React from "react";
import type { PlayerId, TankCard } from "../game/types";
import { getClassVisual, getNationVisual } from "../game/cardVisuals";
import prototypeTankImage from "../assets/tanks/prototype-tank.png";
import ussrCardBackground from "../assets/cards/nation-ussr-bg.png";
import fuelCanisterIcon from "../assets/icons/fuel-canister-icon.png";

type TankCardViewVariant = "hand" | "board";

type TankCardViewProps = {
  card: TankCard;
  variant: TankCardViewVariant;
  ownerId?: PlayerId;
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
  ownerId = "player",
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

  if (!isHand) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        style={{
          ...styles.card,
          ...styles.boardCard,
          borderColor: selected ? "#f7d774" : "rgba(220, 205, 155, 0.34)",
          boxShadow: selected
            ? `0 0 0 3px rgba(247, 215, 116, 0.9), 0 12px 28px rgba(0, 0, 0, 0.6)`
            : `0 0 0 1px rgba(0,0,0,0.72), 0 10px 24px rgba(0, 0, 0, 0.5)`,
          opacity: disabled ? 0.46 : 1,
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
        <img
          src={prototypeTankImage}
          alt={card.name}
          style={styles.boardTankImage}
          draggable={false}
        />

        <div
          style={{
            ...styles.boardOwnerGradient,
            ...(ownerId === "player"
              ? styles.boardFriendlyGradient
              : styles.boardEnemyGradient),
          }}
        />

        <header style={styles.boardNameArea}>
          <strong style={styles.boardTitle}>{card.name}</strong>

          <span
            style={{
              ...styles.boardClassIcon,
              borderColor: unitClass.accent,
              color: unitClass.accent,
            }}
            title={unitClass.label}
          >
            {unitClass.icon}
          </span>
        </header>

        <div style={styles.boardActionCost} title="Стоимость действия">
          {card.actionFuelCost}
        </div>

        <div style={styles.boardCombatStats}>
          <div style={styles.boardAttackCircle} title="Сила атаки">
            <strong>{card.attack}</strong>
          </div>

          <div style={styles.boardHpShield} title="Текущее здоровье">
            <strong>{hpValue}</strong>
          </div>
        </div>

        {(alreadyMoved || alreadyAttacked) && (
          <div style={styles.statusRowBoard}>
            {alreadyMoved && <span style={styles.statusBadge}>MOVE</span>}
            {alreadyAttacked && <span style={styles.statusBadge}>FIRE</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      style={{
        ...styles.card,
        ...styles.handCard,
        borderColor: selected ? "#f7d774" : `${unitClass.accent}aa`,
        boxShadow: selected
          ? `0 0 0 3px rgba(247, 215, 116, 0.9), 0 18px 42px rgba(0, 0, 0, 0.55)`
          : `0 0 0 1px rgba(255,255,255,0.08), 0 14px 34px rgba(0, 0, 0, 0.45)`,
        opacity: disabled ? 0.46 : 1,
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
      <div
        style={{
          ...styles.backgroundLayer,
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.86)), url(${ussrCardBackground})`,
        }}
      />

      <div style={styles.innerShadow} />

      <div style={styles.spawnCostBadge}>
        <img
          src={fuelCanisterIcon}
          alt=""
          style={styles.spawnCostIcon}
          draggable={false}
        />
        <strong style={styles.spawnCostValue}>{card.cost}</strong>
      </div>

      <div
        style={{
          ...styles.fuelBadge,
          borderColor: `${nation.accent}cc`,
        }}
      >
        <span>FUEL</span>
        <strong>+{card.fuelGeneration}</strong>
      </div>

      <header style={styles.handHeader}>
        <strong style={styles.handTitle}>{card.name}</strong>
        <span style={styles.subtitle}>
          {nation.label} · {unitClass.label}
        </span>
      </header>

      <div style={styles.handStatRail}>
        <div
          style={{
            ...styles.classIconBadge,
            borderColor: unitClass.accent,
            color: unitClass.accent,
          }}
          title={unitClass.label}
        >
          {unitClass.icon}
        </div>

        <div style={styles.attackBadge}>
          <span>ATK</span>
          <strong>{card.attack}</strong>
        </div>

        <div style={styles.hpBadge}>
          <span>HP</span>
          <strong>
            {hpValue}/{card.hp}
          </strong>
        </div>
      </div>

      <section style={styles.handImageFrame}>
        <img src={prototypeTankImage} alt={card.name} style={styles.tankImage} />
        <div style={styles.imageVignette} />
      </section>

      <div style={styles.handBottomStats}>
        <StatChip label="ACT" value={card.actionFuelCost} tone="#d6a84f" />
        <StatChip label="RNG" value={card.range} tone="#9fd3ff" />
      </div>

      {card.abilityText && <p style={styles.abilityText}>{card.abilityText}</p>}
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
    <span style={{ ...styles.statChip, borderColor: `${tone}aa` }}>
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
    width: "100%",
    borderRadius: 18,
    border: "2px solid",
    color: "#eef2f3",
    background: "#080909",
    textAlign: "left",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    userSelect: "none",
  },

  handCard: {
    minHeight: 332,
  },

  boardCard: {
    height: "100%",
    minHeight: 0,
    borderRadius: 10,
    background: "#080909",
  },

  boardTankImage: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center center",
    display: "block",
  },

  boardOwnerGradient: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderRadius: 10,
    pointerEvents: "none",
  },

  boardFriendlyGradient: {
    background:
      "linear-gradient(135deg, rgba(54, 255, 118, 0.28) 0%, rgba(54, 255, 118, 0.14) 28%, rgba(54, 255, 118, 0.04) 54%, rgba(54, 255, 118, 0) 78%), radial-gradient(circle at 0% 0%, rgba(126, 255, 164, 0.18) 0%, rgba(126, 255, 164, 0) 52%)",
  },

  boardEnemyGradient: {
    background:
      "linear-gradient(135deg, rgba(255, 68, 54, 0.30) 0%, rgba(255, 68, 54, 0.15) 28%, rgba(255, 68, 54, 0.04) 54%, rgba(255, 68, 54, 0) 78%), radial-gradient(circle at 0% 0%, rgba(255, 120, 96, 0.17) 0%, rgba(255, 120, 96, 0) 52%)",
  },

  boardNameArea: {
    position: "absolute",
    left: 6,
    top: 5,
    zIndex: 4,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 3,
    maxWidth: "calc(100% - 44px)",
    pointerEvents: "none",
  },

  boardTitle: {
    maxWidth: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: 11,
    lineHeight: 1,
    color: "#f5eed8",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.85)",
  },

  boardClassIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    background: "rgba(4, 6, 6, 0.78)",
    border: "1px solid",
    boxShadow: "0 5px 12px rgba(0,0,0,0.58)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 1000,
    lineHeight: 1,
  },

  boardActionCost: {
    position: "absolute",
    right: 6,
    top: 5,
    zIndex: 5,
    width: 28,
    height: 28,
    borderRadius: 999,
    background:
      "radial-gradient(circle at 38% 30%, rgba(255, 229, 139, 0.98), rgba(165, 105, 25, 0.96) 62%, rgba(60, 34, 8, 0.98))",
    border: "1px solid rgba(255, 234, 160, 0.62)",
    boxShadow:
      "0 0 0 2px rgba(0,0,0,0.55), 0 8px 16px rgba(0,0,0,0.58)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#1b1004",
    fontSize: 17,
    fontWeight: 1000,
    lineHeight: 1,
    textShadow: "0 1px 0 rgba(255,255,255,0.36)",
    pointerEvents: "none",
  },

  boardCombatStats: {
    position: "absolute",
    left: 1,
    bottom: 3,
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    padding: 0,
    pointerEvents: "none",
  },

  boardAttackCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    background:
      "radial-gradient(circle at 38% 30%, rgba(117, 255, 153, 0.98), rgba(22, 119, 47, 0.96) 58%, rgba(3, 30, 12, 0.98))",
    border: "1px solid rgba(154, 255, 178, 0.72)",
    boxShadow:
      "0 0 0 1px rgba(0,0,0,0.64), 0 0 10px rgba(65, 255, 112, 0.22), 0 5px 10px rgba(0,0,0,0.52)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#071108",
    fontSize: 14,
    fontWeight: 1000,
    lineHeight: 1,
    textShadow: "0 1px 0 rgba(255,255,255,0.32)",
  },

  boardHpShield: {
    width: 26,
    height: 30,
    clipPath:
      "polygon(50% 0%, 92% 15%, 86% 67%, 50% 100%, 14% 67%, 8% 15%)",
    background:
      "linear-gradient(180deg, rgba(255, 95, 82, 0.98), rgba(132, 17, 14, 0.98) 64%, rgba(48, 5, 4, 0.98))",
    border: "1px solid rgba(255, 146, 132, 0.78)",
    boxShadow:
      "0 0 0 1px rgba(0,0,0,0.68), 0 0 10px rgba(255, 69, 55, 0.22), 0 5px 10px rgba(0,0,0,0.52)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff0e8",
    fontSize: 13,
    fontWeight: 1000,
    lineHeight: 1,
    textShadow: "0 2px 0 rgba(0,0,0,0.88)",
  },

  statusRowBoard: {
    position: "absolute",
    right: 5,
    bottom: 5,
    zIndex: 6,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    alignItems: "flex-end",
    pointerEvents: "none",
  },

  backgroundLayer: {
    position: "absolute",
    inset: 0,
    zIndex: -3,
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
  },

  innerShadow: {
    position: "absolute",
    inset: 5,
    zIndex: -2,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.11)",
    boxShadow:
      "inset 0 0 28px rgba(0,0,0,0.92), inset 0 0 0 1px rgba(0,0,0,0.55)",
    pointerEvents: "none",
  },

  spawnCostBadge: {
    position: "absolute",
    left: 3,
    top: 3,
    zIndex: 8,
    width: 58,
    height: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.75))",
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
    zIndex: 2,
    left: "50%",
    top: "53%",
    transform: "translate(-50%, -50%)",
    fontSize: 21,
    lineHeight: 1,
    color: "#f6d27a",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 8px rgba(255, 210, 90, 0.8)",
  },

  fuelBadge: {
    position: "absolute",
    right: 9,
    top: 9,
    zIndex: 5,
    minWidth: 46,
    height: 44,
    padding: "0 7px",
    borderRadius: "12px 12px 16px 16px",
    background:
      "linear-gradient(180deg, rgba(50, 48, 42, 0.98), rgba(15, 15, 14, 0.96))",
    border: "2px solid",
    boxShadow:
      "0 0 0 2px rgba(0,0,0,0.65), 0 8px 18px rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },

  handHeader: {
    position: "relative",
    zIndex: 2,
    padding: "13px 62px 8px 68px",
    minHeight: 58,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  handTitle: {
    fontSize: 20,
    lineHeight: 1,
    letterSpacing: 0.2,
    textShadow: "0 2px 6px rgba(0,0,0,0.85)",
  },

  subtitle: {
    marginTop: 2,
    fontSize: 8,
    opacity: 0.72,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  handStatRail: {
    position: "absolute",
    left: 10,
    top: 68,
    zIndex: 6,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },

  classIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background:
      "linear-gradient(180deg, rgba(20, 24, 20, 0.96), rgba(5, 6, 5, 0.96))",
    border: "2px solid",
    boxShadow: "0 6px 13px rgba(0,0,0,0.58)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 900,
  },

  attackBadge: {
    width: 38,
    height: 42,
    borderRadius: "999px",
    background:
      "radial-gradient(circle at 40% 30%, rgba(255,110,90,0.9), rgba(93,14,10,0.98) 55%, rgba(12,5,4,0.98))",
    border: "2px solid rgba(255, 99, 85, 0.72)",
    boxShadow:
      "0 0 0 2px rgba(0,0,0,0.65), 0 8px 18px rgba(0,0,0,0.58)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },

  hpBadge: {
    width: 42,
    height: 46,
    borderRadius: "12px 12px 18px 18px",
    background:
      "linear-gradient(180deg, rgba(38, 42, 48, 0.98), rgba(8, 9, 12, 0.98))",
    border: "2px solid rgba(170, 185, 205, 0.55)",
    boxShadow:
      "0 0 0 2px rgba(0,0,0,0.65), 0 8px 18px rgba(0,0,0,0.58)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },

  handImageFrame: {
    position: "relative",
    zIndex: 1,
    margin: "3px 12px 0 52px",
    height: 132,
    borderRadius: 12,
    border: "2px solid rgba(180, 170, 145, 0.55)",
    overflow: "hidden",
    background: "#111",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)",
  },

  tankImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center center",
    display: "block",
  },

  imageVignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at center, transparent 42%, rgba(0,0,0,0.55) 100%), linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.42))",
    pointerEvents: "none",
  },

  handBottomStats: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    margin: "9px 12px 0 52px",
  },

  statChip: {
    minHeight: 22,
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

  statusBadge: {
    padding: "2px 5px",
    borderRadius: 999,
    background: "rgba(0, 0, 0, 0.64)",
    border: "1px solid rgba(255,255,255,0.14)",
    fontSize: 8,
    fontWeight: 900,
    color: "rgba(238,242,243,0.76)",
    letterSpacing: 0.4,
  },

  abilityText: {
    position: "relative",
    zIndex: 2,
    minHeight: 72,
    margin: "10px 12px 12px",
    padding: "10px 11px",
    borderRadius: 10,
    background:
      "linear-gradient(180deg, rgba(6, 7, 7, 0.68), rgba(0, 0, 0, 0.82))",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 11,
    lineHeight: 1.28,
    color: "rgba(238, 242, 243, 0.76)",
  },
};
