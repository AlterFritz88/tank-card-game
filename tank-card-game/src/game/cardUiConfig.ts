export type CardViewMode = "board" | "hand" | "preview";

export type CardStatBadge =
  | "attack"
  | "health"
  | "fuel"
  | "fuelGeneration"
  | "actionCost"
  | "spawnCost";

type BadgeModeOverride = {
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: number;
  valueTop?: string;
};

type BadgeConfig = {
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
  valueTop: string;
  modes?: Partial<Record<CardViewMode, BadgeModeOverride>>;
};

export const CARD_UI = {
  digitFont:
    "'Rajdhani', 'Arial Narrow', Inter, ui-sans-serif, system-ui, sans-serif",

  statScale: {
    board: 1,
    hand: 1,
    preview: 390 / 175,
  },

  colors: {
    playerAttack: "#9cff9f",
    enemyAttack: "#ff6b64",
    playerAttackPreview: "#7dff8a",
    enemyAttackPreview: "#ff5a52",
    health: "#ffe4d8",
    fuel: "#f6d27a",
    fuelGeneration: "#f6d27a",
    actionCost: "#f6d27a",
    spawnCost: "#f6d27a",

    playerAttackTint: "rgba(63, 220, 92, 0.10)",
    enemyAttackTint: "rgba(230, 50, 46, 0.10)",
  },

  statBadges: {
    attack: {
      width: 30,
      height: 30,
      valueTop: "53%",
      fontSize: 17,
      fontWeight: 700,
      modes: {
        board: {
          width: 25,
          height: 25,
          fontSize: 14,
          fontWeight: 600,
        },
        hand: {
          width: 29,
          height: 29,
          fontSize: 13,
          fontWeight: 600,
        },
        preview: {
          width: 29,
          height: 29,
          fontSize: 13,
          fontWeight: 600,
        },
      },
    },

    health: {
      width: 30,
      height: 30,
      valueTop: "53%",
      fontSize: 17,
      fontWeight: 700,
      modes: {
        board: {
          width: 25,
          height: 25,
          fontSize: 14,
          fontWeight: 600,
        },
      },
    },

    fuel: {
      width: 34,
      height: 38,
      valueTop: "53%",
      fontSize: 11,
      fontWeight: 700,
    },

    fuelGeneration: {
      width: 34,
      height: 38,
      valueTop: "53%",
      fontSize: 11,
      fontWeight: 700,
    },

    actionCost: {
      width: 30,
      height: 30,
      valueTop: "60%",
      fontSize: 14,
      fontWeight: 700,
      modes: {
        board: {
          fontWeight: 600,
        },
      },
    },

    spawnCost: {
      width: 58,
      height: 64,
      valueTop: "53%",
      fontSize: 18,
      fontWeight: 700,
    },
  },

  handBadgeLayout: {
    spawnCost: {
      width: "12.2%",
      aspectRatio: "1 / 1.12",
    },

    actionCost: {
      width: "11%",
      aspectRatio: "1 / 1",
    },
  },

  tint: {
    attackInset: 3.5,
    attackBorderRadius: 999,
  },
} as const;

function getBadgeConfig(badge: CardStatBadge, mode: CardViewMode) {
  const base = CARD_UI.statBadges[badge] as BadgeConfig;
  const modeOverride = base.modes?.[mode] ?? {};

  return {
    ...base,
    ...modeOverride,
  };
}

function scaleSize(value: number, mode: CardViewMode): number {
  return Math.round(value * CARD_UI.statScale[mode]);
}

export function getStatBadgeSize(
  badge: CardStatBadge,
  mode: CardViewMode
): { width: number; height: number } {
  const config = getBadgeConfig(badge, mode);

  return {
    width: scaleSize(config.width, mode),
    height: scaleSize(config.height, mode),
  };
}

export function getStatFontSize(
  badge: CardStatBadge,
  mode: CardViewMode
): number {
  const config = getBadgeConfig(badge, mode);

  return scaleSize(config.fontSize, mode);
}

export function getStatFontWeight(
  badge: CardStatBadge,
  mode: CardViewMode
): number {
  return getBadgeConfig(badge, mode).fontWeight;
}

export function getStatValueTop(
  badge: CardStatBadge,
  mode: CardViewMode
): string {
  return getBadgeConfig(badge, mode).valueTop;
}


export function getAttackTintInset(mode: CardViewMode): number {
  return scaleSize(CARD_UI.tint.attackInset, mode);
}

export function getAttackTintBorderRadius(mode: CardViewMode): number {
  const radius = CARD_UI.tint.attackBorderRadius;

  if (radius >= 999) {
    return 9999;
  }

  return scaleSize(radius, mode);
}
