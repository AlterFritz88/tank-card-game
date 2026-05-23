import type React from "react";
import type { PlayerId, TankCard } from "../game/types";
import { getClassVisual, getNationVisual } from "../game/cardVisuals";
import prototypeTankImage from "../assets/tanks/prototype-tank.png";
import ussrCardBackground from "../assets/cards/nation-ussr-bg.png";
import fuelCanisterIcon from "../assets/icons/fuel-canister-icon.png";
import attackBadgeImage from "../assets/icons/badge-attack.png";
import healthBadgeImage from "../assets/icons/badge-health.png";

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
  const isBoardExhausted = !isHand && alreadyMoved && alreadyAttacked;
  const boardClassIconImage = getBoardClassIcon(card.class, ownerId);

  if (!isHand) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        style={{
          ...styles.card,
          ...styles.boardCard,
          borderColor: selected
            ? "#f7d774"
            : "rgba(225, 214, 184, 0.28)",
          boxShadow: selected
            ? "0 0 0 3px rgba(247, 215, 116, 0.9), 0 12px 28px rgba(0, 0, 0, 0.55)"
            : "0 0 0 1px rgba(255,255,255,0.06), 0 10px 24px rgba(0, 0, 0, 0.46)",
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
          style={{
            ...styles.boardTankImage,
            ...(isBoardExhausted ? styles.boardTankImageExhausted : {}),
          }}
        />

        <div
          style={{
            ...styles.boardOwnerGradient,
            ...(ownerId === "player"
              ? styles.boardFriendlyGradient
              : styles.boardEnemyGradient),
          }}
        />

        {isBoardExhausted && <div style={styles.boardExhaustedOverlay} />}

        <div style={styles.boardTitleArea}>
          <strong style={styles.boardTitle}>{card.name}</strong>
          <img
            src={boardClassIconImage}
            alt={unitClass.label}
            title={unitClass.label}
            style={styles.boardClassIconImage}
            draggable={false}
          />
        </div>

        <div style={styles.boardActionCost} title="Стоимость действия">
          {card.actionFuelCost}
        </div>

        <div style={styles.boardCombatStats}>
          <div
            style={{
              ...styles.boardAttackIconWrap,
              ...(alreadyAttacked ? styles.boardAttackIconWrapDimmed : {}),
            }}
            title="Атака"
          >
            <img
              src={attackBadgeImage}
              alt=""
              style={styles.boardAttackIconImage}
              draggable={false}
            />
            <strong style={styles.boardAttackValue}>{card.attack}</strong>
          </div>

          <div style={styles.boardHealthIconWrap} title="Здоровье">
            <img
              src={healthBadgeImage}
              alt=""
              style={styles.boardHealthIconImage}
              draggable={false}
            />
            <strong style={styles.boardHealthValue}>{hpValue}</strong>
          </div>
        </div>

        {(alreadyMoved || alreadyAttacked) && (
          <div style={styles.boardStatusRow}>
            {alreadyMoved && <span style={styles.boardStatusBadge}>MOVE</span>}
            {alreadyAttacked && <span style={styles.boardStatusBadge}>FIRE</span>}
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
          ? "0 0 0 3px rgba(247, 215, 116, 0.9), 0 18px 42px rgba(0, 0, 0, 0.55)"
          : "0 0 0 1px rgba(255,255,255,0.08), 0 14px 34px rgba(0, 0, 0, 0.45)",
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
          <strong>{hpValue}/{card.hp}</strong>
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
    background: "#070808",
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

  boardTankImage: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center center",
    display: "block",
    transition: "filter 0.22s ease, opacity 0.22s ease",
  },

  boardTankImageExhausted: {
    filter: "brightness(0.48) saturate(0.72) contrast(0.95)",
    opacity: 0.72,
  },

  boardOwnerGradient: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
    borderRadius: 10,
    mixBlendMode: "screen",
  },

  boardExhaustedOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 3,
    borderRadius: 10,
    background: "rgba(0, 0, 0, 0.28)",
    boxShadow: "inset 0 0 26px rgba(0,0,0,0.62)",
    pointerEvents: "none",
  },

  boardFriendlyGradient: {
    background:
      "linear-gradient(315deg, rgba(80, 255, 130, 0.28) 0%, rgba(80, 255, 130, 0.11) 25%, rgba(80, 255, 130, 0.025) 48%, rgba(80, 255, 130, 0) 72%), radial-gradient(circle at 100% 100%, rgba(80,255,130,0.12), transparent 48%)",
  },

  boardEnemyGradient: {
    background:
      "linear-gradient(315deg, rgba(255, 70, 55, 0.30) 0%, rgba(255, 70, 55, 0.12) 25%, rgba(255, 70, 55, 0.03) 48%, rgba(255, 70, 55, 0) 72%), radial-gradient(circle at 100% 100%, rgba(255,70,55,0.13), transparent 48%)",
  },

  boardTitleArea: {
    position: "absolute",
    left: 4,
    top: 3,
    zIndex: 6,
    maxWidth: "calc(100% - 34px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    pointerEvents: "none",
  },

  boardTitle: {
    maxWidth: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: 10,
    lineHeight: 1,
    color: "#f1ead5",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.95)",
  },

  boardClassIconImage: {
    width: 24,
    height: 24,
    objectFit: "contain",
    display: "block",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.8))",
    pointerEvents: "none",
    userSelect: "none",
  },

  boardActionCost: {
    position: "absolute",
    right: 3,
    top: 3,
    zIndex: 7,
    minWidth: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background:
      "radial-gradient(circle at 40% 30%, rgba(255,220,120,0.96), rgba(132,84,22,0.96))",
    border: "1px solid rgba(255,235,160,0.58)",
    color: "#170d03",
    fontSize: 13,
    fontWeight: 1000,
    textShadow: "0 1px 0 rgba(255,255,255,0.32)",
    boxShadow: "0 4px 10px rgba(0,0,0,0.58)",
    pointerEvents: "none",
  },

  boardCombatStats: {
    position: "absolute",
    left: -7,
    bottom: -6,
    zIndex: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
    padding: 0,
    pointerEvents: "none",
  },

  boardAttackIconWrap: {
    position: "relative",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
    transition: "filter 0.22s ease, opacity 0.22s ease",
  },

  boardAttackIconWrapDimmed: {
    opacity: 0.42,
    filter:
      "grayscale(0.45) brightness(0.55) drop-shadow(0 3px 7px rgba(0,0,0,0.62))",
  },

  boardHealthIconWrap: {
    position: "relative",
    width: 38,
    height: 43,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -10,
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
  },

  boardAttackIconImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
  },

  boardHealthIconImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
  },

  boardAttackValue: {
    position: "absolute",
    left: "50%",
    top: "47%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontSize: 18,
    lineHeight: 1,
    color: "#f4ffd8",
    fontWeight: 1000,
    textAlign: "center",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  boardHealthValue: {
    position: "absolute",
    left: "50%",
    top: "43%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontSize: 18,
    lineHeight: 1,
    color: "#ffe4d8",
    fontWeight: 1000,
    textAlign: "center",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  boardStatusRow: {
    position: "absolute",
    right: 3,
    bottom: 3,
    zIndex: 9,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-end",
    pointerEvents: "none",
  },

  boardStatusBadge: {
    padding: "2px 4px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.68)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(238,242,243,0.72)",
    fontSize: 7,
    fontWeight: 900,
    letterSpacing: 0.4,
  },
};
