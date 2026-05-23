import type React from "react";
import type { PlayerId } from "../game/types";
import prototypeTankImage from "../assets/tanks/prototype-tank.png";
import attackBadgeImage from "../assets/icons/badge-attack.png";
import healthBadgeImage from "../assets/icons/badge-health.png";
import fuelCanisterIcon from "../assets/icons/fuel-canister-icon.png";

const headquartersImageModules = import.meta.glob(
  "../assets/headquarters/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const hqClassIconModules = import.meta.glob(
  "../assets/icons/classes/class-hq-*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

type HeadquartersCardViewProps = {
  ownerId: PlayerId;
  hp: number;
  attack: number;
  fuelGeneration: number;
  actionFuelCost: number;
  selected?: boolean;
  alreadyAttacked?: boolean;
};

function getOptionalImage(
  modules: Record<string, string>,
  fileNames: string[]
): string | null {
  for (const [path, imageUrl] of Object.entries(modules)) {
    const fileName = path.split("/").pop();

    if (fileName && fileNames.includes(fileName)) {
      return imageUrl;
    }
  }

  return null;
}

function getHeadquartersImage(ownerId: PlayerId): string {
  const side = ownerId === "player" ? "player" : "enemy";
  const opponentSide = ownerId === "player" ? "friendly" : "bot";

  return (
    getOptionalImage(headquartersImageModules, [
      `headquarters-${side}.png`,
      `headquarters-${side}.jpg`,
      `headquarters-${side}.jpeg`,
      `headquarters-${side}.webp`,
      `hq-${side}.png`,
      `hq-${side}.jpg`,
      `hq-${side}.jpeg`,
      `hq-${side}.webp`,
      `headquarters-${opponentSide}.png`,
      `headquarters-${opponentSide}.jpg`,
      `headquarters-${opponentSide}.jpeg`,
      `headquarters-${opponentSide}.webp`,
      `hq-${opponentSide}.png`,
      `hq-${opponentSide}.jpg`,
      `hq-${opponentSide}.jpeg`,
      `hq-${opponentSide}.webp`,
      "headquarters.png",
      "headquarters.jpg",
      "headquarters.jpeg",
      "headquarters.webp",
      "hq.png",
      "hq.jpg",
      "hq.jpeg",
      "hq.webp",
    ]) ?? prototypeTankImage
  );
}

function getHeadquartersClassIcon(ownerId: PlayerId): string | null {
  const side = ownerId === "player" ? "player" : "enemy";
  const opponentSide = ownerId === "player" ? "friendly" : "bot";

  return getOptionalImage(hqClassIconModules, [
    `class-hq-${side}.png`,
    `class-hq-${side}.jpg`,
    `class-hq-${side}.jpeg`,
    `class-hq-${side}.webp`,
    `class-hq-${opponentSide}.png`,
    `class-hq-${opponentSide}.jpg`,
    `class-hq-${opponentSide}.jpeg`,
    `class-hq-${opponentSide}.webp`,
  ]);
}

export function HeadquartersCardView({
  ownerId,
  hp,
  attack,
  fuelGeneration,
  actionFuelCost,
  selected = false,
  alreadyAttacked = false,
}: HeadquartersCardViewProps) {
  const isPlayer = ownerId === "player";
  const headquartersImage = getHeadquartersImage(ownerId);
  const headquartersClassIcon = getHeadquartersClassIcon(ownerId);

  return (
    <div
      style={{
        ...styles.card,
        ...(selected ? styles.selectedCard : {}),
      }}
    >
      <img
        src={headquartersImage}
        alt={isPlayer ? "Штаб игрока" : "Штаб врага"}
        style={styles.hqImage}
        draggable={false}
      />

      <div
        style={{
          ...styles.ownerGradient,
          ...(isPlayer ? styles.friendlyGradient : styles.enemyGradient),
        }}
      />

      <div style={styles.titleArea}>
        <strong style={styles.title}>{isPlayer ? "Штаб" : "Штаб врага"}</strong>

        {headquartersClassIcon ? (
          <img
            src={headquartersClassIcon}
            alt=""
            title="Штаб"
            style={styles.classIconImage}
            draggable={false}
          />
        ) : (
          <span
            style={{
              ...styles.fallbackClassIcon,
              color: isPlayer ? "#8dff9a" : "#ff7770",
            }}
            title="Штаб"
          >
            ⚑
          </span>
        )}
      </div>

      <div style={styles.actionCost} title="Стоимость действия">
        {actionFuelCost}
      </div>

      <div style={styles.combatStats}>
        <div
          style={{
            ...styles.attackIconWrap,
            ...(alreadyAttacked ? styles.attackIconWrapDimmed : {}),
          }}
          title="Атака"
        >
          <img
            src={attackBadgeImage}
            alt=""
            style={styles.statIconImage}
            draggable={false}
          />
          <strong style={styles.attackValue}>{attack}</strong>
        </div>

        <div style={styles.healthIconWrap} title="Здоровье">
          <img
            src={healthBadgeImage}
            alt=""
            style={styles.statIconImage}
            draggable={false}
          />
          <strong style={styles.healthValue}>{hp}</strong>
        </div>

        <div style={styles.fuelIconWrap} title="Генерация топлива">
          <img
            src={fuelCanisterIcon}
            alt=""
            style={styles.fuelIconImage}
            draggable={false}
          />
          <strong style={styles.fuelValue}>+{fuelGeneration}</strong>
        </div>
      </div>

      {alreadyAttacked && (
        <div style={styles.statusRow}>
          <span style={styles.statusBadge}>FIRE</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    width: "100%",
    height: "100%",
    minHeight: 0,
    borderRadius: 10,
    border: "2px solid rgba(225, 214, 184, 0.28)",
    color: "#eef2f3",
    background: "#070808",
    boxShadow:
      "0 0 0 1px rgba(255,255,255,0.06), 0 10px 24px rgba(0, 0, 0, 0.46)",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    userSelect: "none",
  },

  selectedCard: {
    borderColor: "#f7d774",
    boxShadow:
      "0 0 0 3px rgba(247, 215, 116, 0.9), 0 12px 28px rgba(0, 0, 0, 0.55)",
  },

  hqImage: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center center",
    display: "block",
  },

  ownerGradient: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
    borderRadius: 10,
    mixBlendMode: "screen",
  },

  friendlyGradient: {
    background:
      "linear-gradient(315deg, rgba(80, 255, 130, 0.28) 0%, rgba(80, 255, 130, 0.11) 25%, rgba(80, 255, 130, 0.025) 48%, rgba(80, 255, 130, 0) 72%), radial-gradient(circle at 100% 100%, rgba(80,255,130,0.12), transparent 48%)",
  },

  enemyGradient: {
    background:
      "linear-gradient(315deg, rgba(255, 70, 55, 0.30) 0%, rgba(255, 70, 55, 0.12) 25%, rgba(255, 70, 55, 0.03) 48%, rgba(255, 70, 55, 0) 72%), radial-gradient(circle at 100% 100%, rgba(255,70,55,0.13), transparent 48%)",
  },

  titleArea: {
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

  title: {
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

  classIconImage: {
    width: 24,
    height: 24,
    objectFit: "contain",
    display: "block",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.75))",
    pointerEvents: "none",
    userSelect: "none",
  },

  fallbackClassIcon: {
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    lineHeight: 1,
    fontWeight: 900,
    textShadow: "0 2px 4px rgba(0,0,0,0.75)",
  },

  actionCost: {
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

  combatStats: {
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

  attackIconWrap: {
    position: "relative",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
    transition: "filter 0.22s ease, opacity 0.22s ease",
  },

  attackIconWrapDimmed: {
    opacity: 0.42,
    filter:
      "grayscale(0.45) brightness(0.55) drop-shadow(0 3px 7px rgba(0,0,0,0.62))",
  },

  healthIconWrap: {
    position: "relative",
    width: 38,
    height: 43,
    marginTop: -10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.66))",
  },

  fuelIconWrap: {
    position: "relative",
    width: 34,
    height: 38,
    marginTop: -9,
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

  fuelIconImage: {
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
    fontSize: 18,
    lineHeight: 1,
    color: "#f4ffd8",
    fontWeight: 1000,
    textAlign: "center",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  healthValue: {
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

  fuelValue: {
    position: "absolute",
    left: "50%",
    top: "53%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontSize: 13,
    lineHeight: 1,
    color: "#f6d27a",
    fontWeight: 1000,
    textAlign: "center",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  statusRow: {
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

  statusBadge: {
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
