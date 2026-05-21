import type React from "react";
import type { BattleState, BattleKillStats } from "../game/types";
import victoryBackground from "../assets/backgrounds/victory-result-bg.png";
import defeatBackground from "../assets/backgrounds/defeat-result-bg.png";

type ResultScreenProps = {
  battle: BattleState;
  onRestart: () => void;
};

const STAT_ROWS: {
  key: keyof BattleKillStats;
  label: string;
}[] = [
  { key: "light", label: "Легкие танки" },
  { key: "medium", label: "Средние танки" },
  { key: "heavy", label: "Тяжелые танки" },
  { key: "td", label: "ПТ-САУ" },
  { key: "spg", label: "САУ" },
];

function getTotal(stats: BattleKillStats): number {
  return STAT_ROWS.reduce((total, row) => total + stats[row.key], 0);
}

export function ResultScreen({ battle, onRestart }: ResultScreenProps) {
  const playerWon = battle.status === "player_won";

  const title = playerWon ? "ПОБЕДА" : "ПОРАЖЕНИЕ";
  const backgroundImage = playerWon ? victoryBackground : defeatBackground;

  const playerStats = battle.stats?.destroyedByPlayer ?? {
    light: 0,
    medium: 0,
    heavy: 0,
    td: 0,
    spg: 0,
  };

  const botStats = battle.stats?.destroyedByBot ?? {
    light: 0,
    medium: 0,
    heavy: 0,
    td: 0,
    spg: 0,
  };

  return (
    <div
      style={{
        ...styles.overlay,
        backgroundImage: `linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.38)), url(${backgroundImage})`,
      }}
    >
      <div style={styles.vignette} />

      <h1
        style={{
          ...styles.title,
          color: playerWon ? "#f7d774" : "#c9c9c9",
          textShadow: playerWon
            ? "0 3px 0 rgba(0,0,0,0.95), 0 0 24px rgba(247,215,116,0.55)"
            : "0 3px 0 rgba(0,0,0,0.95), 0 0 24px rgba(255,255,255,0.24)",
        }}
      >
        {title}
      </h1>

      <section style={styles.leftStats}>
        <StatsPanel
          title="Уничтожено игроком"
          stats={playerStats}
          accent="#7dff8a"
        />
      </section>

      <section style={styles.rightStats}>
        <StatsPanel
          title="Уничтожено ботом"
          stats={botStats}
          accent="#ff7a6b"
        />
      </section>

      <button style={styles.restartButton} onClick={onRestart}>
        Начать бой заново
      </button>
    </div>
  );
}

function StatsPanel({
  title,
  stats,
  accent,
}: {
  title: string;
  stats: BattleKillStats;
  accent: string;
}) {
  return (
    <div style={styles.statsPanel}>
      <h2 style={styles.statsTitle}>{title}</h2>

      <div style={styles.statsRows}>
        {STAT_ROWS.map((row) => (
          <div key={row.key} style={styles.statsRow}>
            <span>{row.label}</span>
            <strong style={{ color: accent }}>{stats[row.key]}</strong>
          </div>
        ))}
      </div>

      <div style={styles.totalRow}>
        <span>Всего уничтожено</span>
        <strong style={{ color: accent }}>{getTotal(stats)}</strong>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 3000,
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    color: "#eef2f3",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },

  vignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at center, rgba(0,0,0,0.02), rgba(0,0,0,0.72) 84%)",
    pointerEvents: "none",
  },

  title: {
    position: "absolute",
    left: "50%",
    top: "8.2%",
    transform: "translateX(-50%)",
    margin: 0,
    fontSize: 76,
    fontWeight: 1000,
    letterSpacing: 8,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },

  leftStats: {
    position: "absolute",
    left: "3.2%",
    top: "22%",
    width: "21.5%",
  },

  rightStats: {
    position: "absolute",
    right: "3.2%",
    top: "22%",
    width: "21.5%",
  },

  statsPanel: {
    padding: 18,
    borderRadius: 16,
    background:
      "linear-gradient(180deg, rgba(8,10,10,0.86), rgba(0,0,0,0.76))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow:
      "0 18px 54px rgba(0,0,0,0.56), inset 0 0 30px rgba(0,0,0,0.72)",
    backdropFilter: "blur(2px)",
  },

  statsTitle: {
    margin: "0 0 14px",
    fontSize: 22,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#d8d2be",
    textShadow: "0 2px 0 rgba(0,0,0,0.9)",
  },

  statsRows: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.06)",
    fontSize: 17,
  },

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    padding: "12px 10px",
    borderRadius: 10,
    background: "rgba(0,0,0,0.42)",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    fontSize: 19,
    fontWeight: 900,
    textTransform: "uppercase",
  },

  restartButton: {
    position: "absolute",
    left: "50%",
    bottom: "7.2%",
    transform: "translateX(-50%)",
    minWidth: 330,
    minHeight: 62,
    borderRadius: 12,
    border: "1px solid rgba(255, 238, 168, 0.72)",
    background:
      "linear-gradient(180deg, rgba(216,180,106,0.96), rgba(117,84,39,0.98))",
    color: "#1d1207",
    fontSize: 22,
    fontWeight: 1000,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
    boxShadow:
      "0 0 0 3px rgba(0,0,0,0.65), 0 16px 44px rgba(0,0,0,0.65)",
  },
};