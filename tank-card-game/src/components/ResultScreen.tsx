import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import buttonImage from "../assets/button.webp";
import experienceIcon from "../assets/icons/expa.webp";
import goldTracksIcon from "../assets/icons/gold_tracks_transparent.webp";
import silverTracksIcon from "../assets/icons/silver-tracks.webp";
import statsBackgroundImage from "../game/results_screen/back_for_stats.png";
import defeatBannerImage from "../game/results_screen/defeat.png";
import ratingBannerImage from "../game/results_screen/rating.png";
import victoryBannerImage from "../game/results_screen/victory.png";
import type { BattleReward } from "../game/economy";
import { getHeadquartersDefinition } from "../game/headquarters";
import type { MatchEndReason } from "../game/modes";
import { getSettings, type Language } from "../game/settings";
import type { BattleKillStats, ClientBattleState, PlayerId } from "../game/types";
import { useStageRotation, useStageScale } from "./GameStage";
import { useI18n } from "../game/i18n";

type ResultScreenProps = {
  battle: ClientBattleState;
  onRestart: () => void;
  localPlayerId?: PlayerId;
  matchEndReason?: MatchEndReason | null;
  restartLabel?: string;
  reward?: BattleReward | null;
  rewardStatus?: "pending" | "claimed" | "failed" | "idle";
  rewardError?: string | null;
  rewardSyncPending?: boolean;
  onRetryReward?: () => void;
  ratingDelta?: number | null;
};

type ResultTab = "summary" | "trophies";
type TrophyStatKey = keyof BattleKillStats;

const STAT_ROWS: { key: TrophyStatKey }[] = [
  { key: "light" },
  { key: "medium" },
  { key: "heavy" },
  { key: "td" },
  { key: "spg" },
  { key: "armored_car" },
  { key: "support" },
];

const emptyStats: BattleKillStats = {
  light: 0,
  medium: 0,
  heavy: 0,
  td: 0,
  spg: 0,
  armored_car: 0,
  support: 0,
};

function getTotal(stats: BattleKillStats): number {
  return STAT_ROWS.reduce((total, row) => total + getStatCount(stats, row.key), 0);
}

function getStatCount(stats: BattleKillStats, key: TrophyStatKey): number {
  return stats[key] ?? 0;
}

function formatNumber(value: number, language = getSettings().language): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU").format(value);
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
  rewardStatus = "idle",
  rewardError = null,
  rewardSyncPending = false,
  onRetryReward,
  ratingDelta: ratingDeltaOverride = null,
}: ResultScreenProps) {
  const { language } = useI18n();
  const resultText = getResultText(language);
  const [activeTab, setActiveTab] = useState<ResultTab>("summary");

  // Portaled to <body>, outside the scaled/rotated GameStage, so apply the
  // stage transform (uniform scale + rotation) to the window. It then renders at
  // the same fixed design size as the desktop and is scaled/rotated to fit
  // exactly like the rest of the game, instead of resizing against the raw
  // viewport (which distorted it and put it sideways on phones).
  const stageRotation = useStageRotation();
  const stageScale = useStageScale();

  const winningPlayer: PlayerId | null =
    battle.status === "player_won"
      ? "player"
      : battle.status === "bot_won"
        ? "bot"
        : null;

  const localPlayerWon = winningPlayer === localPlayerId;
  const title = localPlayerWon ? resultText.victory : resultText.defeat;
  const reasonText = getResultReasonText(matchEndReason, localPlayerWon, language);
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
  const rewardPremiumMultiplier = reward?.premiumMultiplier ?? 1;
  const specialRewardMultiplier = reward?.specialRewardMultiplier ?? 1;
  // The reward table shows both tiers side by side; bold the column that was
  // actually credited by the reward calculation returned from the server.
  const isPremium = rewardPremiumMultiplier > 1;
  const toBaseRewardValue = (value: number) =>
    rewardPremiumMultiplier > 1
      ? Math.round(value / rewardPremiumMultiplier)
      : value;
  const earnedHeadquartersXp = reward?.headquartersXp ?? 0;
  const baseHeadquartersXp = toBaseRewardValue(earnedHeadquartersXp);
  const rawHeadquartersXp = Math.round(
    (reward?.rawHeadquartersXp ?? baseHeadquartersXp) *
      specialRewardMultiplier
  );
  const freeXp = reward?.freeXp ?? 0;
  const baseFreeXp = toBaseRewardValue(freeXp);
  const rawIronTracks = Math.round(
    (reward?.rawIronTracks ?? reward?.ironTracks ?? 0) *
      specialRewardMultiplier
  );
  const repairCost = Math.round(
    (reward?.repairCost ?? 0) * specialRewardMultiplier
  );
  const netIronTracks =
    reward?.ironTracks ?? Math.max(0, rawIronTracks + repairCost);
  const baseNetIronTracks = reward?.insufficientActions
    ? 0
    : Math.max(0, rawIronTracks + repairCost);
  const ratingDelta =
    ratingDeltaOverride ?? getRatingDelta(localPlayerWon, matchEndReason);
  const ratingText = ratingDelta > 0 ? `+${ratingDelta}` : `${ratingDelta}`;

  return createPortal(
    <div style={styles.overlay}>
      <main
        style={{
          ...styles.resultWindow,
          // Center via translate(-50%,-50%) (like GameStage's design box) rather
          // than relying on the overlay's grid centering: the window is wider
          // than a phone's portrait viewport, and grid `place-items: center`
          // does not center an oversized item (it aligns to the start), so after
          // rotation only a strip of the window was visible on screen.
          transform: `translate(-50%, -50%) rotate(${stageRotation}deg) scale(${stageScale})`,
          transformOrigin: "center center",
        }}
      >
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
                  ? resultText.enemyHqDestroyed
                  : resultText.ownHqDestroyed)}
            </div>
            <div style={styles.topRewards}>
              <RewardTicker icon={silverTracksIcon} value={netIronTracks} animated />
              <RewardTicker
                icon={experienceIcon}
                value={earnedHeadquartersXp + freeXp}
                color={accentColor}
                animated
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
            {resultText.trophies}
          </ResultTabButton>
          <ResultTabButton
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
          >
            {resultText.summary}
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
              <span style={styles.ratingTitle}>{resultText.rating}</span>
              <span style={styles.ratingValue}>{ratingText}</span>
            </div>
          </aside>

          <div style={styles.summary}>
            {rewardStatus === "pending" ? (
              <RewardClaimNotice tone="pending">
                {resultText.rewardPending}
              </RewardClaimNotice>
            ) : null}
            {rewardStatus === "failed" ? (
              <RewardClaimNotice tone="failed">
                {rewardError ?? resultText.rewardFailed}
              </RewardClaimNotice>
            ) : null}
            {rewardSyncPending ? (
              <RewardClaimNotice tone="queued">
                {resultText.rewardQueued}
              </RewardClaimNotice>
            ) : null}
            {reward?.insufficientActions ? (
              <RewardClaimNotice tone="failed">
                {resultText.insufficientActions}
              </RewardClaimNotice>
            ) : null}

            {activeTab === "summary" ? (
              <>
                <ResultSection title={resultText.experience} icon={experienceIcon}>
                  <ResultTable
                    icon={experienceIcon}
                    isPremium={isPremium}
                    rows={[
                      {
                        label: resultText.headquartersXp,
                        value: rawHeadquartersXp,
                        premiumValue: getPremiumValue(rawHeadquartersXp),
                      },
                      {
                        label: reward?.fullyResearchedConversion
                          ? resultText.fullyResearchedConversion
                          : resultText.headquartersXpTotal,
                        value: reward?.fullyResearchedConversion
                          ? baseFreeXp
                          : baseHeadquartersXp,
                        premiumValue: getPremiumValue(
                          reward?.fullyResearchedConversion
                            ? baseFreeXp
                            : baseHeadquartersXp
                        ),
                      },
                      {
                        label: resultText.freeXp,
                        value: baseFreeXp,
                        premiumValue: getPremiumValue(baseFreeXp),
                      },
                    ]}
                  />
                </ResultSection>

                <ResultSection title={resultText.ironTracks} icon={silverTracksIcon}>
                  <ResultTable
                    icon={silverTracksIcon}
                    isPremium={isPremium}
                    rows={[
                      {
                        label: resultText.baseBattleReward,
                        value: rawIronTracks,
                        premiumValue: getPremiumValue(rawIronTracks),
                      },
                      {
                        label: resultText.autoRepair,
                        value: repairCost,
                        premiumValue: repairCost,
                        muted: true,
                      },
                      {
                        label: resultText.totalEarned,
                        value: baseNetIronTracks,
                        premiumValue: reward?.insufficientActions
                          ? 0
                          : isPremium
                            ? netIronTracks
                            : Math.max(
                                0,
                                getPremiumValue(rawIronTracks) + repairCost
                              ),
                      },
                    ]}
                  />
                </ResultSection>
              </>
            ) : (
              <ResultSection title={resultText.destroyedUnits}>
                <StatsSummary
                  ownStats={ownStats}
                  enemyStats={enemyStats}
                  language={language}
                />
              </ResultSection>
            )}
          </div>

          {headquarters ? (
            <div style={styles.headquartersNote}>{headquarters.title}</div>
          ) : null}
        </section>

        <footer style={styles.footer}>
          {rewardStatus === "failed" && onRetryReward ? (
            <button
              type="button"
              style={{ ...styles.continueButton, ...styles.retryRewardButton }}
              onClick={onRetryReward}
            >
              {resultText.retryReward}
            </button>
          ) : null}
          <button type="button" style={styles.continueButton} onClick={onRestart}>
            {language === "en" && restartLabel === "В меню"
              ? "To Menu"
              : restartLabel}
          </button>
        </footer>
      </main>
    </div>,
    document.body
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

function RewardClaimNotice({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "pending" | "failed" | "queued";
}) {
  return (
    <div
      style={{
        ...styles.rewardClaimNotice,
        ...(tone === "failed" ? styles.rewardClaimNoticeFailed : {}),
        ...(tone === "queued" ? styles.rewardClaimNoticeQueued : {}),
      }}
    >
      {children}
    </div>
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
  isPremium,
}: {
  rows: {
    label: string;
    value: number;
    premiumValue: number;
    muted?: boolean;
  }[];
  icon: string;
  isPremium: boolean;
}) {
  return (
    <div style={styles.table}>
      <div style={{ ...styles.row, ...styles.headerRow }}>
        <div />
        <div
          style={{
            ...styles.centerCell,
            ...(isPremium ? {} : styles.activeColumnHeader),
          }}
        >
          <img src={icon} alt="" style={styles.tableIcon} />
          Без премиума
        </div>
        <div
          style={{
            ...styles.premiumCell,
            ...(isPremium ? styles.activeColumnHeader : {}),
          }}
        >
          <img src={icon} alt="" style={styles.tableIcon} />
          С премиумом
        </div>
      </div>

      {rows.map((row) => (
        <div key={row.label} style={styles.row}>
          <div style={styles.labelCell}>{row.label}</div>
          <div
            style={{
              ...styles.centerCell,
              ...(row.muted ? styles.minusCell : {}),
              ...(!row.muted && !isPremium ? styles.activeAmountCell : {}),
            }}
          >
            <CurrencyAmount icon={icon} value={row.value} />
          </div>
          <div
            style={{
              ...styles.premiumCell,
              ...(row.muted ? styles.minusCell : {}),
              ...(!row.muted && isPremium ? styles.activeAmountCell : {}),
            }}
          >
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
  animated = false,
}: {
  icon: string;
  value: number;
  color?: string;
  animated?: boolean;
}) {
  return (
    <span style={{ ...styles.rewardTicker, ...(color ? { color } : null) }}>
      <img src={icon} alt="" style={styles.rewardIcon} />
      {animated ? <AnimatedRewardNumber value={value} /> : formatNumber(value)}
    </span>
  );
}

function AnimatedRewardNumber({ value }: { value: number }) {
  const targetValue = Math.max(0, Math.floor(value));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (targetValue <= 0) {
      const frameId = window.requestAnimationFrame(() => setDisplayValue(0));
      return () => window.cancelAnimationFrame(frameId);
    }

    let frameId = 0;
    const startedAt = performance.now();
    const durationMs = 1450;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(targetValue * easedProgress));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [targetValue]);

  return <RewardFlapNumber value={displayValue} />;
}

function RewardFlapNumber({ value }: { value: number }) {
  const digits = formatNumber(Math.max(0, Math.floor(value)));

  return (
    <span style={styles.rewardFlapNumber} aria-label={digits}>
      {Array.from(digits).map((digit, index) => {
        const digitKey = `${digits.length}-${index}`;

        return /\s/.test(digit) ? (
          <span key={digitKey} style={styles.rewardFlapSeparator}>
            {" "}
          </span>
        ) : (
          <span key={digitKey} style={styles.rewardFlapCell}>
            <AnimatePresence initial={false}>
              <motion.span
                key={digit}
                style={styles.rewardFlapDigit}
                initial={{ y: "-78%", rotateX: 64, opacity: 0 }}
                animate={{ y: "0%", rotateX: 0, opacity: 1 }}
                exit={{ y: "78%", rotateX: -64, opacity: 0 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {digit}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
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
  language,
}: {
  ownStats: BattleKillStats;
  enemyStats: BattleKillStats;
  language: Language;
}) {
  const text = getResultText(language);

  return (
    <div style={styles.statsGrid}>
      <div style={styles.statsTotalCard}>
        <div style={styles.statsColumnTitle}>{text.youDestroyed}</div>
        <strong style={styles.statsTotalValue}>{getTotal(ownStats)}</strong>
      </div>
      <div style={styles.statsTotalCard}>
        <div style={styles.statsColumnTitle}>{text.enemyDestroyed}</div>
        <strong style={styles.statsTotalValue}>{getTotal(enemyStats)}</strong>
      </div>

      <div style={styles.statsTypeColumn}>
        {STAT_ROWS.map((row) => (
          <div key={row.key} style={styles.statsTypeLine}>
            <span>{getTrophyStatLabel(row.key, language)}</span>
            <strong style={styles.statsTypeValue}>
              {getStatCount(ownStats, row.key)}
            </strong>
          </div>
        ))}
      </div>

      <div style={styles.statsTypeColumn}>
        {STAT_ROWS.map((row) => (
          <div key={row.key} style={styles.statsTypeLine}>
            <span>{getTrophyStatLabel(row.key, language)}</span>
            <strong style={styles.statsTypeValue}>
              {getStatCount(enemyStats, row.key)}
            </strong>
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
  isVictory: boolean,
  language: Language
): string | null {
  const text = getResultText(language);

  switch (reason) {
    case "surrender":
      return isVictory ? text.reasonOpponentSurrendered : text.reasonYouSurrendered;
    case "disconnect":
      return isVictory ? text.reasonOpponentDisconnected : text.reasonConnectionLost;
    case "leave":
    case "opponent_left":
      return isVictory ? text.reasonOpponentLeft : text.reasonYouLeft;
    default:
      return null;
  }
}

function getTrophyStatLabel(key: TrophyStatKey, language: Language): string {
  const labels: Record<TrophyStatKey, { ru: string; en: string }> = {
    light: { ru: "Легкие танки", en: "Light tanks" },
    medium: { ru: "Средние танки", en: "Medium tanks" },
    heavy: { ru: "Тяжелые танки", en: "Heavy tanks" },
    td: { ru: "ПТ-САУ", en: "Tank destroyers" },
    spg: { ru: "САУ", en: "SPGs" },
    armored_car: { ru: "Бронеавтомобили", en: "Armored cars" },
    support: { ru: "Тыловые войска", en: "Rear troops" },
  };

  return labels[key]?.[language] ?? labels[key]?.ru ?? key;
}

function getResultText(language: Language) {
  if (language === "en") {
    return {
      victory: "Victory!",
      defeat: "Defeat",
      enemyHqDestroyed: "Enemy headquarters destroyed.",
      ownHqDestroyed: "Your headquarters has lost combat capability.",
      trophies: "Trophies",
      summary: "Summary",
      rating: "Rating",
      rewardPending: "Granting reward on the profile server...",
      rewardFailed: "Reward not granted: profile server is unavailable",
      rewardQueued:
        "Reward saved locally. It will synchronize when the profile server is available.",
      insufficientActions:
        "Reward not granted: too few battle actions. Play a more active battle to earn resources.",
      experience: "Experience",
      headquartersXp: "Headquarters battle XP",
      fullyResearchedConversion:
        "Headquarters fully researched, converted into free XP",
      headquartersXpTotal: "Total added to headquarters",
      freeXp: "Free XP",
      ironTracks: "Iron tracks",
      baseBattleReward: "Base battle reward",
      autoRepair: "Automatic headquarters repair",
      totalEarned: "Total earned",
      destroyedUnits: "Destroyed units",
      retryReward: "Retry reward",
      youDestroyed: "You destroyed",
      enemyDestroyed: "Enemy destroyed",
      reasonOpponentSurrendered: "Opponent surrendered",
      reasonYouSurrendered: "You surrendered",
      reasonOpponentDisconnected: "Opponent left the battle",
      reasonConnectionLost: "Connection lost",
      reasonOpponentLeft: "Opponent left the battle",
      reasonYouLeft: "You left the battle",
    };
  }

  return {
    victory: "Победа!",
    defeat: "Поражение",
    enemyHqDestroyed: "Штаб противника уничтожен.",
    ownHqDestroyed: "Ваш штаб потерял боеспособность.",
    trophies: "Трофеи",
    summary: "Сводка",
    rating: "Рейтинг",
    rewardPending: "Начисляем награду на сервере профиля...",
    rewardFailed: "Награда не начислена: сервер профиля недоступен",
    rewardQueued:
      "Награда сохранена локально. Будет синхронизирована при подключении к серверу.",
    insufficientActions:
      "Награда не начислена: слишком мало действий в бою. Чтобы получить ресурсы, сыграйте бой активнее.",
    experience: "Опыт",
    headquartersXp: "Боевой опыт штаба",
    fullyResearchedConversion: "Штаб изучен, перевод в свободный опыт",
    headquartersXpTotal: "Итого начислено на штаб",
    freeXp: "Свободный опыт",
    ironTracks: "Железные траки",
    baseBattleReward: "Базовая награда за бой",
    autoRepair: "Автоматический ремонт штаба",
    totalEarned: "Итого заработано",
    destroyedUnits: "Уничтоженные юниты",
    retryReward: "Повторить начисление",
    youDestroyed: "Вы уничтожили",
    enemyDestroyed: "Противник уничтожил",
    reasonOpponentSurrendered: "Противник сдался",
    reasonYouSurrendered: "Вы сдались",
    reasonOpponentDisconnected: "Противник покинул бой",
    reasonConnectionLost: "Соединение потеряно",
    reasonOpponentLeft: "Противник вышел из боя",
    reasonYouLeft: "Вы вышли из боя",
  };
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 3000,
    // Portaled to <body> so the dark backdrop spans the entire window —
    // including the letterbox margins around the scaled GameStage — instead of
    // only the central design box. Acts as its own size container so the result
    // window's cqw/cqh sizing keeps working outside the stage.
    containerType: "size",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    background:
      "radial-gradient(circle at center, rgba(42,38,31,0.26), rgba(0,0,0,0.88) 72%), #050607",
    color: "#c9c0b2",
    fontFamily: "var(--font-body)",
  },

  resultWindow: {
    // Absolutely centered in the overlay (top/left 50% + translate(-50%,-50%)
    // in the transform) so it stays centered even when the fixed design width is
    // larger than the viewport — grid centering can't do that for oversized
    // items.
    position: "absolute",
    top: "50%",
    left: "50%",
    // Fixed design size (matches desktop); the stage's uniform scale is applied
    // via transform so it fits any device exactly like the rest of the game.
    width: 875,
    height: 665,
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
    fontFamily: "var(--font-body)",
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

  rewardFlapNumber: {
    display: "inline-flex",
    alignItems: "center",
    gap: 1,
    fontVariantNumeric: "tabular-nums",
  },

  rewardFlapCell: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "0.62em",
    height: "1.05em",
    overflow: "hidden",
    perspective: 90,
  },

  rewardFlapDigit: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transformOrigin: "center center",
  },

  rewardFlapSeparator: {
    display: "inline-block",
    width: "0.28em",
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

  rewardClaimNotice: {
    padding: "9px 12px",
    border: "1px solid rgba(218, 179, 91, 0.28)",
    background:
      "linear-gradient(180deg, rgba(47, 40, 24, 0.72), rgba(14, 13, 10, 0.72))",
    color: "#f3d996",
    fontSize: 13,
    fontWeight: 900,
    textShadow: "0 2px 4px rgba(0,0,0,0.75)",
  },

  rewardClaimNoticeFailed: {
    border: "1px solid rgba(228, 101, 82, 0.36)",
    background:
      "linear-gradient(180deg, rgba(83, 31, 24, 0.78), rgba(18, 10, 8, 0.78))",
    color: "#ffd1c6",
  },

  rewardClaimNoticeQueued: {
    border: "1px solid rgba(110, 166, 220, 0.34)",
    background:
      "linear-gradient(180deg, rgba(25, 48, 72, 0.72), rgba(10, 16, 24, 0.74))",
    color: "#cde9ff",
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
    fontWeight: 400,
    textAlign: "center",
  },

  minusCell: {
    color: "#aa9990",
  },

  // Column the player actually earns (matches their account type) — emphasised
  // so the relevant reward amount reads as bold.
  activeAmountCell: {
    color: "#f4dca6",
    fontWeight: 900,
  },

  activeColumnHeader: {
    color: "#f0d18a",
    fontWeight: 900,
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
    display: "grid",
    gridTemplateColumns: "1fr 42px",
    gap: 10,
    alignItems: "end",
    minHeight: 34,
    padding: "6px 10px",
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
    textAlign: "center",
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

  statsTypeValue: {
    textAlign: "center",
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
    fontFamily: "var(--font-digit)",
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
    gap: 12,
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

  retryRewardButton: {
    width: 218,
    backgroundColor: "#4f565b",
    backgroundImage: `linear-gradient(rgba(82, 88, 92, 0.82), rgba(33, 36, 39, 0.9)), url(${buttonImage})`,
    backgroundSize: "100% 100%, 100% 100%",
  },
};
