import type React from "react";
import { getHeadquartersDefinition } from "../game/headquarters";
import {
  getHeadquartersImageAsset,
  getLegacyHeadquartersImageAsset,
} from "../game/headquartersImages";
import type { HeadquartersId, PlayerId } from "../game/types";
import prototypeTankImage from "../assets/tanks/prototype-tank.png";
import { StatBadge } from "./StatBadge";
import { FitText } from "./FitText";

const hqClassIconModules = import.meta.glob(
  "../assets/icons/classes/class-hq-*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

type HeadquartersCardViewProps = {
  ownerId: PlayerId;
  headquartersId?: HeadquartersId;
  artOwnerId?: PlayerId;
  hp: number;
  attack: number;
  fuelGeneration: number;
  selected?: boolean;
  alreadyAttacked?: boolean;
  healthDamageEffect?: {
    id: number;
    amount: number;
  };
  healthGainEffect?: {
    id: number;
    amount: number;
  };
  attackChangeEffect?: {
    id: number;
    amount: number;
  };
  healthPreviewValue?: number;
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

function getLegacyHeadquartersImage(ownerId: PlayerId): string {
  return getLegacyHeadquartersImageAsset(ownerId) ?? prototypeTankImage;
}

function getHeadquartersImage(
  headquartersId: HeadquartersId | undefined,
  fallbackOwnerId: PlayerId
): string {
  if (!headquartersId) {
    return getLegacyHeadquartersImage(fallbackOwnerId);
  }

  const headquartersImage = getHeadquartersImageAsset(headquartersId);

  if (headquartersImage) {
    return headquartersImage;
  }

  return getLegacyHeadquartersImage(fallbackOwnerId);
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
  headquartersId,
  artOwnerId,
  hp,
  attack,
  selected = false,
  alreadyAttacked = false,
  healthDamageEffect,
  healthGainEffect,
  attackChangeEffect,
  healthPreviewValue,
}: HeadquartersCardViewProps) {
  const isPlayer = ownerId === "player";
  const headquarters = headquartersId
    ? getHeadquartersDefinition(headquartersId)
    : null;
  const headquartersImage = getHeadquartersImage(
    headquartersId,
    artOwnerId ?? ownerId
  );
  const headquartersClassIcon = getHeadquartersClassIcon(ownerId);
  const title = headquarters?.title ?? "Штаб";

  return (
    <div
      style={{
        ...styles.card,
        ...(selected ? styles.selectedCard : {}),
      }}
    >
      <img
        src={headquartersImage}
        alt={headquarters?.title ?? (isPlayer ? "Штаб игрока" : "Штаб врага")}
        style={styles.hqImage}
        draggable={false}
      />

      <div
        style={{
          ...styles.ownerGradient,
          ...(isPlayer ? styles.friendlyGradient : styles.enemyGradient),
        }}
      />

      <div style={styles.topShade} />

      <div style={styles.titleArea}>
        <div style={styles.titleRow}>
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

          <FitText
            maxFontSize={12}
            minFontSize={6}
            ellipsis={false}
            style={styles.title}
            title={title}
          >
            {title}
          </FitText>
        </div>
      </div>

      <div style={styles.combatStats}>
        <StatBadge
          type="attack"
          mode="board"
          ownerId={ownerId}
          value={attack}
          dimmed={alreadyAttacked}
          struckThrough={alreadyAttacked}
          gainEffect={attackChangeEffect}
          title="Атака"
        />

        <StatBadge
          type="health"
          mode="board"
          value={hp}
          title="Здоровье"
          style={styles.healthBadgeOffset}
          damageEffect={healthDamageEffect}
          gainEffect={healthGainEffect}
          previewValue={healthPreviewValue}
        />
      </div>

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
    borderRadius: 0,
    border: "2px solid rgba(225, 214, 184, 0.28)",
    color: "#eef2f3",
    background: "#070808",
    boxShadow:
      "0 0 0 1px rgba(255,255,255,0.06), 0 10px 24px rgba(0, 0, 0, 0.46)",
    fontFamily: "var(--font-body)",
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
    borderRadius: 0,
    mixBlendMode: "normal",
  },

  friendlyGradient: {
    background:
      "linear-gradient(315deg, rgba(3, 25, 10, 0.92) 0%, rgba(8, 55, 22, 0.70) 10%, rgba(5, 25, 12, 0.65) 17%, rgba(0, 0, 0, 0) 25%)",
  },

  enemyGradient: {
    background:
      "linear-gradient(315deg, rgba(45, 4, 3, 0.92) 0%, rgba(95, 14, 10, 0.70) 10%, rgba(42, 7, 5, 0.65) 17%, rgba(0, 0, 0, 0) 25%)",
  },

  topShade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 4,
    height: 30,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.48) 48%, rgba(0,0,0,0) 100%)",
    pointerEvents: "none",
  },

  titleArea: {
    position: "absolute",
    left: 4,
    right: 3,
    top: 3,
    zIndex: 6,
    pointerEvents: "none",
  },

  titleRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: 3,
    minWidth: 0,
    width: "100%",
  },

  title: {
    flex: "1 1 auto",
    minWidth: 0,
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
    width: 20,
    height: 20,
    objectFit: "contain",
    display: "block",
    flex: "0 0 auto",
    filter:
      "brightness(1.28) saturate(1.35) contrast(1.58) drop-shadow(0 1px 3px rgba(0,0,0,0.85))",
    pointerEvents: "none",
    userSelect: "none",
  },

  fallbackClassIcon: {
    width: 20,
    height: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    fontSize: 16,
    lineHeight: 1,
    fontWeight: 900,
    textShadow: "0 1px 3px rgba(0,0,0,0.85)",
  },

  combatStats: {
    position: "absolute",
    left: -2,
    bottom: -0,
    zIndex: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
    padding: 0,
    pointerEvents: "none",
  },

  healthBadgeOffset: {
    marginTop: -1,
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

  attackOwnerTint: {
    position: "absolute",
    inset: 2,
    zIndex: 1,
    borderRadius: 999,
    mixBlendMode: "screen",
    pointerEvents: "none",
  },

  attackPlayerTint: {
    background:
      "radial-gradient(circle at 50% 50%, rgba(94,255,126,0.42), rgba(94,255,126,0.20) 48%, rgba(94,255,126,0.04) 72%, transparent 100%)",
  },

  attackEnemyTint: {
    background:
      "radial-gradient(circle at 50% 50%, rgba(255,72,66,0.44), rgba(255,72,66,0.22) 48%, rgba(255,72,66,0.05) 72%, transparent 100%)",
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

  statIconImage: {
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
    fontSize: 16,
    lineHeight: 1,
    fontFamily: "var(--font-digit)",
    fontWeight: 600,
    textAlign: "center",
    textShadow:
      "0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.85)",
  },

  attackValuePlayer: {
    color: "#8dff9a",
  },

  attackValueEnemy: {
    color: "#ff7770",
  },

  healthValue: {
    position: "absolute",
    left: "50%",
    top: "43%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontSize: 16,
    lineHeight: 1,
    color: "#ffe4d8",
    fontFamily: "var(--font-digit)",
    fontWeight: 600,
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
