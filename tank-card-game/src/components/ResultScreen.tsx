import { useState, type ReactNode, type CSSProperties } from "react";
import buttonImage from "../assets/button.png";
import experienceIcon from "../assets/icons/expa.png";
import goldTracksIcon from "../assets/icons/gold_tracks_transparent.png";
import silverTracksIcon from "../assets/icons/silver-tracks.png";
import statsBackgroundImage from "../game/results_screen/back_for_stats.png";
import defeatBannerImage from "../game/results_screen/defeat.png";
import ratingBannerImage from "../game/results_screen/rating.png";
import victoryBannerImage from "../game/results_screen/victory.png";
import type { BattleReward } from "../game/economy";
import { getHeadquartersDefinition } from "../game/headquarters";
import type { MatchEndReason } from "../game/modes";
import type { BattleKillStats, ClientBattleState, PlayerId } from "../game/types";

type ResultScreenProps = {
  battle: ClientBattleState;
  onRestart: () => void;
  localPlayerId?: PlayerId;
  matchEndReason?: MatchEndReason | null;
  restartLabel?: string;
  reward?: BattleReward | null;
};

type ResultTab = "summary" | "trophies";
type TrophyStatKey = keyof BattleKillStats | "support";

const STAT_ROWS: { key: TrophyStatKey; label: string }[] = [
  { key: "light", label: "Легкие танки" },
  { key: "medium", label: "Средние танки" },
  { key: "heavy", label: "Тяжелые танки" },
  { key: "td", label: "ПТ-САУ" },
  { key: "spg", label: "САУ" },
  { key: "support", label: "Тыловые войска" },
];

const emptyStats: BattleKillStats = {
  light: 0,
  medium: 0,
  heavy: 0,
  td: 0,
  spg: 0,
};

function getTotal(stats: BattleKillStats): number {
  return STAT_ROWS.reduce((total, row) => total + getStatCount(stats, row.key), 0);
}

function getStatCount(stats: BattleKillStats, key: TrophyStatKey): number {
  return key === "support" ? 0 : stats[key];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function getPremiumValue(value: number): number {
  return Math.round(value * 1.5);
}

function getRatingDelta(isVictory: boolean, reason: MatchEndReason | null): number {
  if (isVictory) {
    return reason === "disconnect" || reason === "opponent_left" ? 2 : 3;
  }

  return reason === "surrender" || reason === "leave" ? -3 : -2;
}

export function ResultScreen({
  battle,
  onRestart,
  localPlayerId = "player",
  matchEndReason = null,
  restartLabel = "В меню",
  reward = null,
}: ResultScreenProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>("summary");

  const winningPlayer: PlayerId | null =
    battle.status === "player_won"
      ? "player"
      : battle.status === "bot_won"
        ? "bot"
        : null;

  const localPlayerWon = winningPlayer === localPlayerId;
  const title = localPlayerWon ? "Победа!" : "Поражение";
  const reasonText = getResultReasonText(matchEndReason, localPlayerWon);
  const bannerImage = localPlayerWon ? victoryBannerImage : defeatBannerImage;
  const titleColor = localPlayerWon ? "#9ef47f" : "#ff7b6c";
  const accentColor = localPlayerWon ? "#78d45f" : "#d76555";

  const playerStats = battle.stats?.destroyedByPlayer ?? emptyStats;
  const botStats = battle.stats?.destroyedByBot ?? emptyStats;
  const ownStats = localPlayerId === "player" ? playerStats : botStats;
  const enemyStats = localPlayerId === "player" ? botStats : playerStats;
  const headquarters = reward
    ? getHeadquartersDefinition(reward.headquartersId)
    : null;
  const baseHeadquartersXp = reward?.headquartersXp ?? 0;
  const freeXp = reward?.freeXp ?? 0;
  const ironTracks = reward?.ironTracks ?? 0;
  const repairCost = reward
    ? -Math.max(0, Math.round(ironTracks * (localPlayerWon ? 0.08 : 0.12)))
    : 0;
  const netIronTracks = Math.max(0, ironTracks + repairCost);
  const ratingDelta = getRatingDelta(localPlayerWon, matchEndReason);
  const ratingText = ratingDelta > 0 ? `+${ratingDelta}` : `${ratingDelta}`;

  return (
    <div style={styles.overlay}>
      <main style={styles.resultWindow}>
        <section
          style={{
            ...styles.hero,
            backgroundImage: `url(${bannerImage})`,
          }}
        >
          <div style={styles.heroShade} />
          <div style={styles.titleBlock}>
            <h1 style={{ ...styles.title, color: titleColor }}>{title}</h1>
            <div style={styles.subtitle}>
              {reasonText ??
                (localPlayerWon
                  ? "Штаб противника уничтожен."
                  : "Ваш штаб потерял боеспособность.")}
            </div>
            <div style={styles.topRewards}>
              <RewardTicker icon={silverTracksIcon} value={ironTracks} />
              <RewardTicker
                icon={experienceIcon}
                value={baseHeadquartersXp + freeXp}
                color={accentColor}
              />
              <RewardTicker icon={goldTracksIcon} value={reward?.goldTracks ?? 0} />
            </div>
          </div>
        </section>

        <nav style={styles.tabs}>
          <ResultTabButton
            active={activeTab === "trophies"}
            onClick={() => setActiveTab("trophies")}
          >
            Трофеи
          </ResultTabButton>
          <ResultTabButton
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
          >
            Сводка
          </ResultTabButton>
        </nav>

        <section
          style={{
            ...styles.content,
            backgroundImage: `linear-gradient(90deg, rgba(4,4,4,0.74), rgba(12,10,9,0.52) 62%, rgba(45,11,9,0.30)), url(${statsBackgroundImage})`,
          }}
        >
          <aside style={styles.ratingBadge}>
            <img src={ratingBannerImage} alt="" style={styles.ratingImage} />
            <div style={styles.ratingContent}>
              <span style={styles.ratingTitle}>Рейтинг</span>
              <span style={styles.ratingValue}>{ratingText}</span>
            </div>
          </aside>

          <div style={styles.summary}>
            {activeTab === "summary" ? (
              <>
                <ResultSection title="Опыт" icon={experienceIcon}>
                  <ResultTable
                    icon={experienceIcon}
                    rows={[
                      {
                        label: "Боевой опыт штаба",
                        value: baseHeadquartersXp,
                        premiumValue: getPremiumValue(baseHeadquartersXp),
                      },
                      {
                        label: reward?.fullyResearchedConversion
                          ? "Штаб изучен, перевод в свободный опыт"
                          : "Итого начислено на штаб",
                        value: baseHeadquartersXp,
                        premiumValue: getPremiumValue(baseHeadquartersXp),
                      },
                      {
                        label: "Свободный опыт",
                        value: freeXp,
                        premiumValue: getPremiumValue(freeXp),
                      },
                    ]}
                  />
                </ResultSection>

                <ResultSection title="Железные траки" icon={silverTracksIcon}>
                  <ResultTable
                    icon={silverTracksIcon}
                    rows={[
                      {
                        label: "Базовая награда за бой",
                        value: ironTracks,
                        premiumValue: getPremiumValue(ironTracks),
                      },
                      {
                        label: "Автоматический ремонт штаба",
                        value: repairCost,
                        premiumValue: repairCost,
                        muted: true,
                      },
                      {
                        label: "Итого заработано",
                        value: netIronTracks,
                        premiumValue: Math.max(
                          0,
                          getPremiumValue(ironTracks) + repairCost
                        ),
                      },
                    ]}
                  />
                </ResultSection>
              </>
            ) : (
              <ResultSection title="Уничтоженные юниты">
                <StatsSummary ownStats={ownStats} enemyStats={enemyStats} />
              </ResultSection>
            )}
          </div>

          {headquarters ? (
            <div style={styles.headquartersNote}>{headquarters.title}</div>
          ) : null}
        </section>

        <footer style={styles.footer}>
          <button type="button" style={styles.continueButton} onClick={onRestart}>
            {restartLabel}
          </button>
        </footer>
      </main>
    </div>
  );
}

function ResultTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      style={{
        ...styles.tabButton,
        ...(active ? styles.tabButtonActive : null),
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ResultSection({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: string;
}) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionTitle}>
        {icon ? <img src={icon} alt="" style={styles.sectionIcon} /> : null}
        {title}
      </div>
      {children}
    </section>
  );
}

function ResultTable({
  rows,
  icon,
}: {
  rows: {
    label: string;
    value: number;
    premiumValue: number;
    muted?: boolean;
  }[];
  icon: string;
}) {
  return (
    <div style={styles.table}>
      <div style={{ ...styles.row, ...styles.headerRow }}>
        <div />
        <div style={styles.centerCell}>
          <img src={icon} alt="" style={styles.tableIcon} />
          Без премиума
        </div>
        <div style={styles.premiumCell}>
          <img src={icon} alt="" style={styles.tableIcon} />
          С премиумом
        </div>
      </div>

      {rows.map((row) => (
        <div key={row.label} style={styles.row}>
          <div style={styles.labelCell}>{row.label}</div>
          <div style={{ ...styles.centerCell, ...(row.muted ? styles.minusCell : {}) }}>
            <CurrencyAmount icon={icon} value={row.value} />
          </div>
          <div style={{ ...styles.premiumCell, ...(row.muted ? styles.minusCell : {}) }}>
            <CurrencyAmount icon={icon} value={row.premiumValue} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RewardTicker({
  icon,
  value,
  color,
}: {
  icon: string;
  value: number;
  color?: string;
}) {
  return (
    <span style={{ ...styles.rewardTicker, ...(color ? { color } : null) }}>
      <img src={icon} alt="" style={styles.rewardIcon} />
      {formatNumber(value)}
    </span>
  );
}

function CurrencyAmount({ icon, value }: { icon: string; value: number }) {
  return (
    <span style={styles.currencyAmount}>
      <img src={icon} alt="" style={styles.currencyIcon} />
      {formatSigned(value)}
    </span>
  );
}

function StatsSummary({
  ownStats,
  enemyStats,
}: {
  ownStats: BattleKillStats;
  enemyStats: BattleKillStats;
}) {
  return (
    <div style={styles.statsGrid}>
      <div style={styles.statsTotalCard}>
        <div style={styles.statsColumnTitle}>Вы уничтожили</div>
        <strong style={styles.statsTotalValue}>{getTotal(ownStats)}</strong>
      </div>
      <div style={styles.statsTotalCard}>
        <div style={styles.statsColumnTitle}>Противник уничтожил</div>
        <strong style={styles.statsTotalValue}>{getTotal(enemyStats)}</strong>
      </div>

      <div style={styles.statsTypeColumn}>
        {STAT_ROWS.map((row) => (
          <div key={row.key} style={styles.statsTypeLine}>
            <span>{row.label}</span>
            <strong>{getStatCount(ownStats, row.key)}</strong>
          </div>
        ))}
      </div>

      <div style={styles.statsTypeColumn}>
        {STAT_ROWS.map((row) => (
          <div key={row.key} style={styles.statsTypeLine}>
            <span>{row.label}</span>
            <strong>{getStatCount(enemyStats, row.key)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSigned(value: number): string {
  if (value > 0) {
    return formatNumber(value);
  }

  if (value < 0) {
    return `-${formatNumber(Math.abs(value))}`;
  }

  return "0";
}

function getResultReasonText(
  reason: MatchEndReason | null,
  isVictory: boolean
): string | null {
  switch (reason) {
    case "surrender":
      return isVictory ? "Противник сдался" : "Вы сдались";
    case "disconnect":
      return isVictory ? "Противник покинул бой" : "Соединение потеряно";
    case "leave":
    case "opponent_left":
      return isVictory ? "Противник вышел из боя" : "Вы вышли из боя";
    default:
      return null;
  }
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 3000,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    background:
      "radial-gradient(circle at center, rgba(42,38,31,0.26), rgba(0,0,0,0.88) 72%), #050607",
    color: "#c9c0b2",
    fontFamily:
      "'Arial Narrow', 'Roboto Condensed', Inter, ui-sans-serif, system-ui, sans-serif",
  },

  resultWindow: {
    position: "relative",
    width: "min(875px, calc(100vw - 36px))",
    height: "min(665px, calc(100vh - 32px))",
    overflow: "hidden",
    borderRadius: 10,
    border: "2px solid #2a2d30",
    background: "#090807",
    boxShadow:
      "0 28px 70px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.05)",
  },

  hero: {
    position: "relative",
    width: "calc(100% - 54px)",
    height: 222,
    margin: "16px auto 0",
    border: "1px solid rgba(174, 94, 68, 0.42)",
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
  },

  heroShade: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.03), rgba(0,0,0,0.24))",
    pointerEvents: "none",
  },

  titleBlock: {
    position: "relative",
    zIndex: 2,
    paddingTop: 32,
    textAlign: "center",
    textShadow: "0 3px 6px #000",
  },

  title: {
    margin: 0,
    fontFamily: "Impact, 'Arial Narrow', sans-serif",
    fontSize: 48,
    fontWeight: 900,
    letterSpacing: 3,
    lineHeight: 1,
    textTransform: "uppercase",
  },

  subtitle: {
    marginTop: 9,
    color: "#e1d9ce",
    fontSize: 16,
    fontWeight: 700,
  },

  topRewards: {
    marginTop: 10,
    display: "flex",
    justifyContent: "center",
    gap: 28,
    color: "#c8c7c3",
    fontSize: 20,
    fontWeight: 800,
  },

  rewardTicker: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#d7c5a5",
  },

  rewardIcon: {
    width: 25,
    height: 25,
    objectFit: "contain",
    filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.75))",
  },

  tabs: {
    position: "absolute",
    left: 50,
    top: 205,
    zIndex: 12,
    display: "flex",
    gap: 8,
  },

  tabButton: {
    width: 148,
    height: 39,
    border: "none",
    borderRadius: 0,
    backgroundColor: "#4f565b",
    backgroundImage: `linear-gradient(rgba(82, 88, 92, 0.82), rgba(33, 36, 39, 0.9)), url(${buttonImage})`,
    backgroundSize: "100% 100%, 100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#d6d6d2",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.25,
    textTransform: "uppercase",
    textShadow: "0 2px 2px #000",
    filter: "brightness(0.88)",
  },

  tabButtonActive: {
    color: "#fff0bd",
    filter: "brightness(1.04)",
  },

  content: {
    position: "relative",
    height: "calc(100% - 238px)",
    padding: "28px 45px 74px",
    borderTop: "1px solid #080807",
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },

  summary: {
    width: 615,
    maxWidth: "calc(100% - 190px)",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },

  section: {
    minHeight: 0,
  },

  sectionTitle: {
    height: 23,
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#d9cab0",
    fontSize: 16,
    fontWeight: 900,
    textShadow: "0 2px 2px #000",
  },

  sectionIcon: {
    width: 20,
    height: 20,
    objectFit: "contain",
    filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.72))",
  },

  table: {
    width: "100%",
    color: "#9d9890",
    fontSize: 14,
  },

  row: {
    display: "grid",
    gridTemplateColumns: "1.68fr 0.7fr 0.72fr",
    alignItems: "center",
    minHeight: 20,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },

  headerRow: {
    color: "#a99a83",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
  },

  labelCell: {
    paddingLeft: 15,
  },

  centerCell: {
    textAlign: "center",
  },

  premiumCell: {
    color: "#d7c5a5",
    fontWeight: 800,
    textAlign: "center",
  },

  minusCell: {
    color: "#aa9990",
  },

  tableIcon: {
    width: 17,
    height: 17,
    marginRight: 5,
    verticalAlign: -3,
    objectFit: "contain",
    filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.75))",
  },

  currencyAmount: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 54,
  },

  currencyIcon: {
    width: 16,
    height: 16,
    objectFit: "contain",
    filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.75))",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    color: "#9d9890",
    fontSize: 13,
  },

  statsTotalCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    minHeight: 34,
    padding: "6px 11px",
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(0,0,0,0.24)",
    color: "#d7c5a5",
  },

  statsColumnTitle: {
    fontWeight: 900,
  },

  statsTotalValue: {
    color: "#f0d690",
    fontSize: 21,
    lineHeight: 1,
  },

  statsTypeColumn: {
    display: "grid",
    gap: 0,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(0,0,0,0.2)",
  },

  statsTypeLine: {
    display: "grid",
    gridTemplateColumns: "1fr 42px",
    gap: 10,
    alignItems: "center",
    minHeight: 21,
    padding: "0 10px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },

  ratingBadge: {
    position: "absolute",
    top: 34,
    right: 62,
    width: 148,
    height: 142,
    display: "grid",
    placeItems: "center",
    filter: "drop-shadow(0 7px 8px rgba(0,0,0,0.85))",
  },

  ratingImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },

  ratingContent: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    transform: "translateY(-5px)",
  },

  ratingTitle: {
    marginBottom: 7,
    color: "#d1a492",
    fontSize: 16,
    textTransform: "uppercase",
  },

  ratingValue: {
    color: "#fff",
    fontFamily: "Arial, sans-serif",
    fontSize: 44,
    fontWeight: 900,
    lineHeight: 1,
    textShadow: "0 3px 5px #000",
  },

  headquartersNote: {
    position: "absolute",
    right: 54,
    top: 184,
    width: 172,
    color: "#b8aa91",
    fontSize: 12,
    fontWeight: 800,
    textAlign: "center",
    textTransform: "uppercase",
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 13,
    zIndex: 14,
    display: "flex",
    justifyContent: "center",
  },

  continueButton: {
    width: 178,
    height: 39,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#eee5d6",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textShadow: "0 2px 2px #000",
  },
};
