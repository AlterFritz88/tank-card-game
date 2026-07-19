import {
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import topBackgroundImage from "../assets/backgrounds/top_background.webp";
import matchmakingBreakImage from "../assets/backgrounds/matchmaking/break.webp";
import matchmakingCielImage from "../assets/backgrounds/matchmaking/ciel.webp";
import matchmakingMapImage from "../assets/backgrounds/matchmaking/map.webp";
import { getBattleBackgroundAsset } from "../assets/battleBackgroundAssets";
import buttonImage from "../assets/button.webp";
import firstPlayerCardBackImage from "../assets/cards/first_players.webp";
import { getHeadquartersAvatarAsset } from "../assets/headquartersAvatarAssets";
import experienceIcon from "../assets/icons/expa.webp";
import goldTracksIcon from "../assets/icons/gold_tracks_transparent.webp";
import silverTracksIcon from "../assets/icons/silver-tracks.webp";
import radioDarkMetalImage from "../assets/radio_game/dark-metal.webp";
import radioEnemyHpImage from "../assets/radio_game/enemy_HP.webp";
import radioGrungeOverlayImage from "../assets/radio_game/grunge-overlay.webp";
import radioOliveMetalImage from "../assets/radio_game/olive-metal.webp";
import radioPlayerHpImage from "../assets/radio_game/player_HP.webp";
import radioRedMetalImage from "../assets/radio_game/red-metal.webp";
import radioVsImage from "../assets/radio_game/vs_sign.webp";
import { getMissionIllustrationAsset } from "../assets/missionIllustrationAssets";
import { getNationFlagAsset } from "../assets/nationFlagAssets";
import { RegistrationReminderOverlay } from "./RegistrationReminderOverlay";
import { TutorialOverlay } from "./TutorialOverlay";
import { createRadarScanSoundPlayer, playMusic } from "../game/audio";
import { calculateDeckWeight, getDefaultDeckWeight } from "../game/deckWeight";
import {
  CAMPAIGNS,
  getCampaignCompletionReward,
  getCampaignCompletionRewardsForCampaign,
  getEarnedCampaignCompletionRewards,
  isCampaignAccessible,
  isCampaignMissionUnlocked,
  isCampaignRewardClaimed,
  type CampaignCompletionReward,
} from "../game/campaigns";
import {
  getLocalizedCampaignDescription,
  getLocalizedCampaignTitle,
  getLocalizedMissionChapter,
  getLocalizedMissionDescription,
  getLocalizedMissionTitle,
} from "../game/campaignLocalization";
import { getCardOrNull } from "../game/cards";
import {
  DECK_UNIT_LIMIT,
  deleteCustomDeck,
  deleteCustomDeckFromServer,
  getGroupedDeckCards,
  loadMostRecentDeckSelection,
  loadRecentDeckSelectionForHeadquarters,
  loadSavedDecksForHeadquarters,
  markRecentDeckSelection,
  syncSavedDecksFromServer,
  validateDeck,
  type SavedDeck,
} from "../game/customDecks";
import {
  HEADQUARTERS,
  getDeckBuildingHeadquarters,
} from "../game/headquarters";
import { getHeadquartersImageAsset } from "../game/headquartersImages";
import { getDeckCardIds } from "../game/initialState";
import {
  TUTORIAL_MISSIONS,
  isTutorialMissionUnlocked,
} from "../game/tutorial";
import {
  claimCampaignRewardFromServer,
  createGoldTracksPaymentOnServer,
  exchangeGoldForIronOnServer,
  GOLD_TO_IRON_RATE,
  getFavoriteHeadquartersId,
  isPremiumAccountActive,
  isValidPlayerNickname,
  loadShopCatalogFromServer,
  loginPlayerAccount,
  loadPlayerProgress,
  logoutPlayerAccount,
  normalizePlayerNickname,
  PLAYER_NICKNAME_MAX_LENGTH,
  purchasePremiumDaysOnServer,
  registerPlayerAccount,
  sanitizePlayerNicknameInput,
  setFavoriteHeadquartersIdOnServer,
  setPlayerNicknameOnServer,
  syncPlayerProgressFromServer,
  type DailyLoginReward,
  type PlayerProgress,
} from "../game/playerProgress";
import { getTankImage } from "../game/tankImages";
import type { HeadquartersId, Nation, TankCard } from "../game/types";
import {
  PVP_MATCH_SEARCH_DURATION_MS,
  type MainMenuView,
  type PvpConnectionState,
} from "../game/modes";
import { RADIO_DUEL_MAX_ACTIVE } from "../game/radioDuel";
import { useBattleStore } from "../store/battleStore";
import { HandCardView } from "./HandCardView";
import {
  RewardCelebrationOverlay,
  type RewardCelebrationCard,
} from "./RewardCelebrationOverlay";
import { CardKeywordsPanel } from "./CardKeywordsPanel";
import {
  getCardKeywords,
  getHeadquartersKeywords,
} from "../game/cardKeywords";
import { getLocalizedNationLabel } from "../game/cardLocalization";
import { getCombatMissionDefinition } from "../game/combatMissions";
import { useStageOverlayTransform, screenDeltaToStage } from "./GameStage";
import { useLandscapeKeyboardLock } from "./useLandscapeKeyboardLock";
import { usePngFallback } from "./LoadingScreen";
import {
  isProfileServerUnavailable,
  retryProfileConnection,
  useProfileConnection,
} from "../network/useProfileConnection";
import { profileClient, submitSupportFeedback } from "../network/profileClient";
import type { RadioDuelListResult, RadioDuelOpenResult } from "../game/radioDuel";
import {
  getCurrentUserId,
  getCurrentUserLogin,
  GUEST_SESSION_READY_STORAGE_KEY,
  isRegisteredUserId,
} from "../game/playerIdentity";
import {
  AVAILABLE_LANGUAGES,
  setLanguage,
  useSettings,
  type Language,
} from "../game/settings";
import { useI18n } from "../game/i18n";
import { enableRadioDuelPushNotifications } from "../nativePushNotifications";

const DeckBuilder = lazy(() =>
  import("./DeckBuilder").then((module) => ({ default: module.DeckBuilder }))
);
const ResearchMenu = lazy(() =>
  import("./ResearchMenu").then((module) => ({ default: module.ResearchMenu }))
);
const CardCollectionMenu = lazy(() =>
  import("./CardCollectionMenu").then((module) => ({
    default: module.CardCollectionMenu,
  }))
);

const HAND_CARD_BASE_WIDTH = 175;
const HAND_CARD_BASE_HEIGHT = Math.round((HAND_CARD_BASE_WIDTH * 1496) / 1051);
// Sized so all four mode cards fit on screen at once (no carousel scrolling).
const MENU_CARD_SCALE = 1.08;
const MENU_CARD_WIDTH = Math.round(HAND_CARD_BASE_WIDTH * MENU_CARD_SCALE);
const MENU_CARD_HEIGHT = Math.round(HAND_CARD_BASE_HEIGHT * MENU_CARD_SCALE);
const MAIN_MENU_CARD_SCALE = 1.16;
const MAIN_MENU_CARD_WIDTH = Math.round(HAND_CARD_BASE_WIDTH * MAIN_MENU_CARD_SCALE);
const MAIN_MENU_CARD_HEIGHT = Math.round(
  (MAIN_MENU_CARD_WIDTH * 1496) / 1051
);
// Company-selection cards are larger than the mode cards — only a couple are
// shown at once, so there's room to make the artwork the focus.
const CAMPAIGN_CARD_WIDTH = Math.round(MENU_CARD_WIDTH * 1.5);
const CAMPAIGN_CARD_HEIGHT = Math.round(MENU_CARD_HEIGHT * 1.5);
const TUTORIAL_CARD_WIDTH = Math.round(MENU_CARD_WIDTH * 1.22);
const TUTORIAL_CARD_HEIGHT = Math.round(MENU_CARD_HEIGHT * 1.22);
const MISSION_CARD_HEIGHT = 410;
// Match the reward card's height to the mission card while preserving the
// standard hand-card aspect ratio.
const MISSION_REWARD_CARD_WIDTH = Math.round(
  (MISSION_CARD_HEIGHT * 1051) / 1496
);
const GUEST_SESSION_READY_KEY = GUEST_SESSION_READY_STORAGE_KEY;

const NATION_FILTER_VALUES: Nation[] = [
  "france",
  "germany",
  "poland",
  "uk",
  "usa",
  "ussr",
];

const PLAYER_NICKNAME_INPUT_PATTERN = "[A-Za-z0-9_-]{3,14}";

type BattleDeckOption = {
  id: string | null;
  name: string;
  cardIds?: string[];
  countLabel: string;
  weightLabel: string;
  savedDeck?: SavedDeck;
};

type DeckPreviewState = {
  headquartersId: HeadquartersId;
  deck: BattleDeckOption;
};

type SupportFeedbackState = {
  contact: string;
  message: string;
  sending: boolean;
  sent: boolean;
  error: string | null;
};

type CarouselDragState = {
  active: boolean;
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
};

function getMostPlayedHeadquartersId(progress: PlayerProgress): HeadquartersId {
  const mostPlayedHeadquarters = Object.entries(progress.headquartersMatchCounts)
    .filter((entry): entry is [HeadquartersId, number] => {
      const [headquartersId, matchCount] = entry;
      return headquartersId in HEADQUARTERS && matchCount > 0;
    })
    .sort(([, leftMatches], [, rightMatches]) => rightMatches - leftMatches)[0];

  return mostPlayedHeadquarters?.[0] ?? getFavoriteHeadquartersId(progress);
}

function getPlayerDisplayNickname(progress: PlayerProgress, userLogin?: string | null) {
  return progress.nickname?.trim() || userLogin?.trim() || "Commander";
}

function getPlayerAccountData(
  accountLabels: { premiumProfile: string; basicProfile: string }
) {
  const progress = loadPlayerProgress();
  const headquarters = HEADQUARTERS[getMostPlayedHeadquartersId(progress)];
  const premium = progress.accountType === "premium";
  const userLogin = getCurrentUserLogin();

  return {
    avatar: getHeadquartersAvatarAsset(headquarters.id),
    flag: getNationFlagAsset(headquarters.nation),
    nickname: getPlayerDisplayNickname(progress, userLogin),
    accountLabel: premium
      ? accountLabels.premiumProfile
      : accountLabels.basicProfile,
  };
}

function PlayerAccountPanel({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const { t } = useI18n();
  const account = getPlayerAccountData({
    premiumProfile: t("account.premiumProfile"),
    basicProfile: t("account.basicProfile"),
  });

  return (
    <button
      type="button"
      style={styles.playerAccountPanel}
      aria-label={t("account.openProfile")}
      onClick={onOpenProfile}
    >
      {account.flag ? (
        <div
          aria-hidden="true"
          style={{
            ...styles.playerAccountFlag,
            backgroundImage: `url("${account.flag}")`,
          }}
        />
      ) : null}
      <div aria-hidden="true" style={styles.playerAccountShade} />

      <div style={styles.playerAccountAvatarFrame}>
        {account.avatar ? (
          <img
            src={account.avatar}
            alt=""
            draggable={false}
            style={styles.playerAccountAvatar}
          />
        ) : null}
      </div>

      <div style={styles.playerAccountText}>
        <strong style={styles.playerAccountName}>{account.nickname}</strong>
        <span style={styles.playerAccountType}>{account.accountLabel}</span>
      </div>
    </button>
  );
}

function formatResourceValue(value: number, language?: Language) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU").format(value);
}

function getSeenDailyLoginRewardId(): string | null {
  try {
    return window.localStorage.getItem(DAILY_LOGIN_REWARD_SEEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function markDailyLoginRewardSeen(rewardId: string) {
  try {
    window.localStorage.setItem(DAILY_LOGIN_REWARD_SEEN_STORAGE_KEY, rewardId);
  } catch {
    // Private-mode storage failures should not block claiming the server reward.
  }
}

function getDailyLoginRewardCelebration(
  reward: DailyLoginReward,
  language: Language
): RewardCelebrationCard {
  const isEnglish = language === "en";

  switch (reward.kind) {
    case "ironTracks":
      return {
        kind: "resource",
        icon: silverTracksIcon,
        title: `+${formatResourceValue(reward.amount, language)}`,
        subtitle: isEnglish ? "Iron tracks" : "Железные траки",
      };
    case "goldTracks":
      return {
        kind: "resource",
        icon: goldTracksIcon,
        title: `+${formatResourceValue(reward.amount, language)}`,
        subtitle: isEnglish ? "Gold tracks" : "Золотые траки",
      };
    case "freeXp":
      return {
        kind: "resource",
        icon: experienceIcon,
        title: `+${formatResourceValue(reward.amount, language)}`,
        subtitle: isEnglish ? "Free XP" : "Свободный опыт",
      };
    case "premium":
      return {
        kind: "resource",
        icon: goldTracksIcon,
        title: isEnglish ? "Premium" : "Премиум",
        subtitle:
          reward.amount === 1
            ? isEnglish
              ? "1 day"
              : "1 день"
            : isEnglish
              ? `${reward.amount} days`
              : `${reward.amount} дн.`,
      };
  }
}

function formatRubPrice(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

type CapacitorWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
  };
};

function isNativeMobileApp(): boolean {
  if (typeof window === "undefined") return false;

  const capacitorWindow = window as CapacitorWindow;
  const platform = capacitorWindow.Capacitor?.getPlatform?.();

  return (
    window.location.protocol === "capacitor:" ||
    platform === "android" ||
    platform === "ios" ||
    capacitorWindow.Capacitor?.isNativePlatform?.() === true
  );
}

function getNativeBackTarget(menuView: MainMenuView): MainMenuView | null {
  switch (menuView) {
    case "missions":
      return "campaign";
    case "deckBuilder":
      return "headquarters";
    case "headquarters":
    case "campaign":
    case "tutorial":
    case "combatMissions":
    case "radioDuels":
    case "profile":
    case "research":
    case "collection":
    case "shop":
    case "exchange":
      return "main";
    case "main":
      return null;
  }
}

const GOLD_TRACK_PRODUCTS = [
  { id: "first-player-pack" as const, gold: 777, label: "Набор первого игрока", pack: true },
  { id: "gold-100" as const, gold: 100, label: "100 золотых траков" },
  { id: "gold-500" as const, gold: 500, label: "500 золотых траков" },
  { id: "gold-1500" as const, gold: 1500, label: "1500 золотых траков" },
];
const LEGAL_ACCEPTED_STORAGE_KEY = "panzershrek.legalAccepted.v2026-06-20";
const DAILY_LOGIN_REWARD_SEEN_STORAGE_KEY =
  "panzershrek.dailyLoginReward.seen";
const LEGAL_LINKS = [
  { href: "/legal/user-agreement", label: "Пользовательское соглашение" },
  { href: "/legal/offer", label: "Оферта" },
  { href: "/legal/privacy-policy", label: "Политика конфиденциальности" },
];

const PREMIUM_PRODUCTS = [
  { days: 1, cost: 99 },
  { days: 5, cost: 470 },
  { days: 21, cost: 1500 },
  { days: 50, cost: 4199 },
];

function getShopText(language: Language) {
  if (language === "en") {
    return {
      title: "SHOP",
      subtitle: "Gold tracks and premium account",
      balance: "Balance",
      until: "until",
      loadPricesFailed: "Could not load shop prices",
      premiumActivated: "Premium activated",
      buyPremiumFailed: "Could not buy premium account",
      createPaymentFailed: "Could not create payment",
      guestTitle: "An e-mail account is required",
      guestBody:
        "Gold purchases are available only to registered players because the receipt is sent to the account e-mail. Sign in or register from the profile panel in the upper-left corner to buy gold tracks.",
      priceLoading: "Loading price...",
      priceMissing: "Price not set",
      signIn: "Sign in",
      creatingPayment: "Creating payment...",
      payYooKassa: "Pay via YooKassa",
      configurePrice: "Configure price on server",
      buying: "Buying...",
      buy: "Buy",
      notEnoughGold: "Not enough gold",
      goldTracks: "gold tracks",
      soon: "Soon",
    };
  }

  return {
    title: "МАГАЗИН",
    subtitle: "Золотые траки и премиум аккаунт",
    balance: "Баланс",
    until: "до",
    loadPricesFailed: "Не удалось загрузить цены магазина",
    premiumActivated: "Премиум активирован",
    buyPremiumFailed: "Не удалось купить премиум аккаунт",
    createPaymentFailed: "Не удалось создать платеж",
    guestTitle: "Нужен аккаунт с e-mail",
    guestBody:
      "Покупка золота доступна только зарегистрированным игрокам — на e-mail аккаунта приходит кассовый чек. Войдите или зарегистрируйтесь в профиле (иконка вверху слева), чтобы покупать золотые траки.",
    priceLoading: "Загрузка цены...",
    priceMissing: "Цена не задана",
    signIn: "Войдите в аккаунт",
    creatingPayment: "Создание платежа...",
    payYooKassa: "Оплата через ЮKassa",
    configurePrice: "Настройте цену на сервере",
    buying: "Покупка...",
    buy: "Купить",
    notEnoughGold: "Не хватает золота",
    goldTracks: "золотых траков",
    soon: "Скоро",
  };
}

function formatPremiumUntil(progress: PlayerProgress) {
  if (!progress.premiumUntil) return null;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(progress.premiumUntil));
}

function LegalLinks({ compact = false }: { compact?: boolean }) {
  return (
    <span style={compact ? styles.legalLinksCompact : styles.legalLinks}>
      {LEGAL_LINKS.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? <span style={styles.legalLinksSeparator}> · </span> : null}
          <a
            href={link.href}
            style={compact ? styles.legalLinkCompact : styles.legalLink}
          >
            {link.label}
          </a>
        </span>
      ))}
    </span>
  );
}

function LanguageChoiceRow({ compact = false }: { compact?: boolean }) {
  const { language } = useSettings();

  return (
    <div
      style={compact ? styles.languageChoiceRowCompact : styles.languageChoiceRow}
      role="group"
      aria-label="Language"
    >
      {AVAILABLE_LANGUAGES.map((option) => {
        const active = language === option.id;
        const flag = getNationFlagAsset(option.id === "ru" ? "ussr" : "uk");

        return (
          <button
            key={option.id}
            type="button"
            style={{
              ...styles.languageChoiceButton,
              ...(active ? styles.languageChoiceButtonActive : {}),
            }}
            onClick={() => setLanguage(option.id)}
            aria-pressed={active}
            title={option.label}
          >
            {flag ? (
              <img
                src={flag}
                alt=""
                draggable={false}
                style={styles.languageChoiceFlag}
              />
            ) : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlayerResourcesPanel({
  onOpenShop,
  onOpenExchange,
  onOpenTutorial,
}: {
  onOpenShop?: () => void;
  onOpenExchange?: () => void;
  onOpenTutorial?: () => void;
}) {
  const { language, t } = useI18n();
  const progress = loadPlayerProgress();
  const resources = [
    {
      icon: experienceIcon,
      label: t("resources.freeXp"),
      value: progress.freeXp,
    },
    {
      icon: silverTracksIcon,
      label: t("resources.ironTracks"),
      value: progress.ironTracks,
      onClick: onOpenExchange,
      actionLabel: t("resources.exchangeGold"),
    },
    {
      icon: goldTracksIcon,
      label: t("resources.goldTracks"),
      value: progress.goldTracks,
      iconOffsetX: -6,
      onClick: onOpenShop,
      actionLabel: t("resources.openShop"),
    },
  ];

  return (
    <aside style={styles.playerResourcesPanel} aria-label={t("resources.freeXp")}>
      {resources.map((resource) => {
        const interactive = Boolean(resource.onClick);
        const content = (
          <>
            <img
              src={resource.icon}
              alt=""
              draggable={false}
              style={{
                ...styles.playerResourceIcon,
                transform: resource.iconOffsetX
                  ? `translateX(${resource.iconOffsetX}px)`
                  : undefined,
              }}
            />
            <span style={styles.playerResourceValue}>
              {formatResourceValue(resource.value, language)}
            </span>
          </>
        );

        return interactive ? (
          <button
            key={resource.label}
            type="button"
            style={{
              ...styles.playerResourceItem,
              ...styles.playerResourceButton,
            }}
            onClick={resource.onClick}
            aria-label={resource.actionLabel}
            title={resource.actionLabel}
          >
            {content}
          </button>
        ) : (
          <div key={resource.label} style={styles.playerResourceItem}>
            {content}
          </div>
        );
      })}
      {onOpenShop ? (
        <button
          type="button"
          style={styles.playerShopButton}
          onClick={onOpenShop}
          aria-label={t("resources.openShop")}
        >
          {t("main.shop")}
        </button>
      ) : null}
      {onOpenTutorial ? (
        <button
          type="button"
          style={{
            ...styles.playerShopButton,
            ...styles.playerTutorialButton,
          }}
          onClick={onOpenTutorial}
          aria-label={t("main.tutorial")}
        >
          {t("main.tutorial")}
        </button>
      ) : null}
    </aside>
  );
}

function ProfileServerBanner({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <div style={styles.profileServerBanner}>
      <span>{t("common.profileServerUnavailable")}</span>
      <button
        type="button"
        style={styles.profileServerRetryButton}
        onClick={onRetry}
      >
        {t("common.retry")}
      </button>
    </div>
  );
}

function ShopMenu({
  onBack,
  onProfileChanged,
}: {
  onBack: () => void;
  onProfileChanged: () => void;
}) {
  const { language, t } = useI18n();
  const shopText = getShopText(language);
  const [progress, setProgress] = useState(() => loadPlayerProgress());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [purchasingPremiumDays, setPurchasingPremiumDays] = useState<
    number | null
  >(null);
  const [purchasingGoldProductId, setPurchasingGoldProductId] = useState<
    (typeof GOLD_TRACK_PRODUCTS)[number]["id"] | null
  >(null);
  const [goldProductPrices, setGoldProductPrices] = useState<
    Partial<Record<(typeof GOLD_TRACK_PRODUCTS)[number]["id"], number | null>>
  >({});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [firstPlayerPackPreviewOpen, setFirstPlayerPackPreviewOpen] = useState(false);
  const packLongPressTimerRef = useRef<number | null>(null);
  const suppressPackClickRef = useRef(false);
  const profileConnection = useProfileConnection();
  const profileServerUnavailable = isProfileServerUnavailable(profileConnection);
  const premiumUntilText = formatPremiumUntil(progress);
  // Гостю золото за деньги не продаём: для кассового чека самозанятого нужен
  // e-mail, который есть только у зарегистрированного аккаунта.
  const isGuest = !isRegisteredUserId();
  const realMoneyPaymentsLocked = isNativeMobileApp();

  useEffect(() => {
    let cancelled = false;

    if (realMoneyPaymentsLocked) {
      setCatalogLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setCatalogLoading(true);
    void loadShopCatalogFromServer()
      .then((catalog) => {
        if (cancelled) return;

        setGoldProductPrices(
          Object.fromEntries(
            catalog.goldProducts.map((product) => [
              product.id,
              product.amountRub,
            ])
          )
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error
              ? error.message
              : shopText.loadPricesFailed
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [realMoneyPaymentsLocked, shopText.loadPricesFailed]);

  async function buyPremium(days: number) {
    setStatusMessage(null);
    setPurchasingPremiumDays(days);

    try {
      const nextProgress = await purchasePremiumDaysOnServer(days);
      setProgress(nextProgress);
      onProfileChanged();
      const nextPremiumUntil = formatPremiumUntil(nextProgress);
      setStatusMessage(
        `${shopText.premiumActivated}${
          nextPremiumUntil ? ` ${shopText.until} ${nextPremiumUntil}` : ""
        }.`
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : shopText.buyPremiumFailed
      );
    } finally {
      setPurchasingPremiumDays(null);
    }
  }

  async function buyGoldProduct(product: (typeof GOLD_TRACK_PRODUCTS)[number]) {
    if (realMoneyPaymentsLocked) return;

    setStatusMessage(null);
    setPurchasingGoldProductId(product.id);

    try {
      const payment = await createGoldTracksPaymentOnServer(product.id);
      window.location.assign(payment.confirmationUrl);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : shopText.createPaymentFailed
      );
    } finally {
      setPurchasingGoldProductId(null);
    }
  }

  function clearPackLongPressTimer() {
    if (packLongPressTimerRef.current !== null) {
      window.clearTimeout(packLongPressTimerRef.current);
      packLongPressTimerRef.current = null;
    }
  }

  function beginPackLongPress(product: (typeof GOLD_TRACK_PRODUCTS)[number]) {
    if (!product.pack) return;
    clearPackLongPressTimer();
    suppressPackClickRef.current = false;
    packLongPressTimerRef.current = window.setTimeout(() => {
      suppressPackClickRef.current = true;
      setFirstPlayerPackPreviewOpen(true);
      packLongPressTimerRef.current = null;
    }, 550);
  }

  const firstPlayerPackProduct = GOLD_TRACK_PRODUCTS[0];
  const firstPlayerPackCard = getCardOrNull("t18_dot");

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />
      <PlayerAccountPanel />
      <PlayerResourcesPanel />
      {profileServerUnavailable ? (
        <ProfileServerBanner onRetry={() => window.location.reload()} />
      ) : null}

      <section style={{ ...styles.menuLayer, ...styles.shopLayer }}>
        <header style={styles.shopHeader}>
          <button type="button" style={styles.shopBackButton} onClick={onBack}>
            {t("common.back")}
          </button>
          <div>
            <h1 style={styles.title}>{shopText.title}</h1>
            <p style={styles.shopSubtitle}>
              {shopText.subtitle}
            </p>
          </div>
        </header>

        <div style={styles.shopBalanceRow}>
          <span>{shopText.balance}</span>
          <strong>
            <img
              src={goldTracksIcon}
              alt=""
              draggable={false}
              style={styles.shopBalanceIcon}
            />
            {formatResourceValue(progress.goldTracks, language)}
          </strong>
          <span>
            {isPremiumAccountActive(progress)
              ? `${t("account.premiumAccount")}${
                  premiumUntilText ? ` ${shopText.until} ${premiumUntilText}` : ""
                }`
              : t("account.basicAccount")}
          </span>
        </div>

        <div style={styles.shopGrid}>
          <section style={styles.shopSection}>
            <h2 style={styles.shopSectionTitle}>{t("resources.goldTracks")}</h2>
            {isGuest ? (
              <div style={styles.shopGuestHint}>
                <strong>{shopText.guestTitle}</strong>
                <span>
                  {shopText.guestBody}
                </span>
              </div>
            ) : null}
            <div style={styles.shopOfferGrid}>
              {GOLD_TRACK_PRODUCTS.map((product) => {
                const priceRub = goldProductPrices[product.id];
                const priceReady =
                  typeof priceRub === "number" && Number.isFinite(priceRub);
                const disabled =
                  realMoneyPaymentsLocked ||
                  isGuest ||
                  purchasingGoldProductId !== null ||
                  profileServerUnavailable ||
                  catalogLoading ||
                  !priceReady || Boolean(product.pack && progress.cardBackId === "first_player");

                return (
                  <button
                    key={product.id}
                    type="button"
                    style={{
                      ...styles.shopOfferCard,
                      ...(disabled ? styles.shopOfferCardDisabled : {}),
                    }}
                    disabled={disabled && !product.pack}
                    aria-disabled={disabled}
                    onClick={() => {
                      if (product.pack && disabled) {
                        setFirstPlayerPackPreviewOpen(true);
                        return;
                      }
                      if (product.pack && suppressPackClickRef.current) {
                        suppressPackClickRef.current = false;
                        return;
                      }
                      void buyGoldProduct(product);
                    }}
                    onContextMenu={(event) => {
                      if (!product.pack) return;
                      event.preventDefault();
                      clearPackLongPressTimer();
                      setFirstPlayerPackPreviewOpen(true);
                    }}
                    onPointerDown={() => beginPackLongPress(product)}
                    onPointerUp={clearPackLongPressTimer}
                    onPointerCancel={clearPackLongPressTimer}
                    onPointerLeave={clearPackLongPressTimer}
                  >
                    {product.pack ? (
                      <div style={styles.shopPackVisual}>
                        {firstPlayerPackCard ? (
                          <div style={styles.shopPackMiniCard}>
                            <HandCardView card={firstPlayerPackCard} ownerId="player" />
                          </div>
                        ) : null}
                        <img src={firstPlayerCardBackImage} alt="" draggable={false} style={styles.shopPackMiniBack} />
                        <img src={goldTracksIcon} alt="" draggable={false} style={styles.shopPackMiniGold} />
                      </div>
                    ) : (
                      <img src={goldTracksIcon} alt="" draggable={false} style={styles.shopOfferIcon} />
                    )}
                    <strong>
                      {product.pack
                        ? language === "en" ? "First Player Pack" : "Набор первого игрока"
                        : `${formatResourceValue(product.gold, language)} ${shopText.goldTracks}`}
                    </strong>
                    {product.pack ? (
                      <span>{language === "en" ? "4× T-18 Pillbox, special card back and 777 gold tracks" : "4× Т-18 ДОТ, особая рубашка и 777 золотых траков"}</span>
                    ) : null}
                    <span style={styles.shopRubPrice}>
                      {realMoneyPaymentsLocked
                        ? shopText.soon
                        : catalogLoading
                        ? shopText.priceLoading
                        : priceReady
                          ? `${formatRubPrice(priceRub)} ₽`
                          : shopText.priceMissing}
                    </span>
                    <span>
                      {realMoneyPaymentsLocked
                        ? shopText.soon
                        : isGuest
                        ? shopText.signIn
                        : product.pack && progress.cardBackId === "first_player"
                          ? language === "en" ? "Purchased" : "Куплено"
                        : purchasingGoldProductId === product.id
                          ? shopText.creatingPayment
                          : priceReady
                            ? shopText.payYooKassa
                            : shopText.configurePrice}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={styles.shopSection}>
            <h2 style={styles.shopSectionTitle}>{t("account.premiumAccount")}</h2>
            <div style={styles.shopOfferGrid}>
              {PREMIUM_PRODUCTS.map((product) => {
                const affordable = progress.goldTracks >= product.cost;
                const busy = purchasingPremiumDays === product.days;
                const dayLabel =
                  language === "en"
                    ? product.days === 1
                      ? "day"
                      : "days"
                    : product.days === 1
                      ? "день"
                      : "дней";

                return (
                  <button
                    key={product.days}
                    type="button"
                    style={{
                      ...styles.shopOfferCard,
                      ...(affordable ? {} : styles.shopOfferCardDisabled),
                    }}
                    disabled={!affordable || busy || profileServerUnavailable}
                    onClick={() => void buyPremium(product.days)}
                  >
                    <strong>
                      {product.days} {dayLabel}
                    </strong>
                    <span style={styles.shopPremiumPrice}>
                      <img
                        src={goldTracksIcon}
                        alt=""
                        draggable={false}
                        style={styles.shopPremiumPriceIcon}
                      />
                      {formatResourceValue(product.cost, language)}
                    </span>
                    <span>
                      {busy
                        ? shopText.buying
                        : affordable
                          ? shopText.buy
                          : shopText.notEnoughGold}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {firstPlayerPackPreviewOpen ? (
          <div style={styles.packPreviewBackdrop} onClick={() => setFirstPlayerPackPreviewOpen(false)}>
            <section style={styles.packPreviewPanel} onClick={(event) => event.stopPropagation()}>
              <button type="button" style={styles.packPreviewClose} onClick={() => setFirstPlayerPackPreviewOpen(false)}>×</button>
              <h2 style={styles.packPreviewTitle}>
                {language === "en" ? "First Player Pack" : "Набор первого игрока"}
              </h2>
              <div style={styles.packPreviewContent}>
                {firstPlayerPackCard ? (
                  <div style={styles.packPreviewCard}>
                    <HandCardView
                      card={firstPlayerPackCard}
                      ownerId="player"
                      cardScale={MISSION_REWARD_CARD_WIDTH / HAND_CARD_BASE_WIDTH}
                    />
                  </div>
                ) : null}
                <img src={firstPlayerCardBackImage} alt="" style={styles.packPreviewBack} />
                <div style={styles.packPreviewDetails}>
                  <strong>{language === "en" ? "Includes" : "В наборе"}</strong>
                  <span>{language === "en" ? "4× T-18 Pillbox" : "4× Т-18 ДОТ"}</span>
                  <span>{language === "en" ? "Exclusive card back" : "Особая рубашка карты"}</span>
                  <span>{language === "en" ? "777 gold tracks" : "777 золотых траков"}</span>
                  <b>199 ₽</b>
                  <button
                    type="button"
                    style={styles.packPreviewBuyButton}
                    disabled={progress.cardBackId === "first_player" || purchasingGoldProductId !== null || realMoneyPaymentsLocked || isGuest || profileServerUnavailable}
                    onClick={() => void buyGoldProduct(firstPlayerPackProduct)}
                  >
                    {progress.cardBackId === "first_player"
                      ? language === "en" ? "Purchased" : "Куплено"
                      : language === "en" ? "Buy" : "Купить"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {statusMessage ? (
          <div style={styles.shopStatusMessage}>{statusMessage}</div>
        ) : null}
      </section>
    </main>
  );
}

function ExchangeMenu({
  onBack,
  onOpenShop,
  onProfileChanged,
}: {
  onBack: () => void;
  onOpenShop: () => void;
  onProfileChanged: () => void;
}) {
  const { language, t } = useI18n();
  const [progress, setProgress] = useState(() => loadPlayerProgress());
  const [goldAmount, setGoldAmount] = useState(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const profileConnection = useProfileConnection();
  const profileServerUnavailable = isProfileServerUnavailable(profileConnection);

  const maxGold = progress.goldTracks;
  const clampedAmount = Math.max(0, Math.min(goldAmount, maxGold));
  const ironGain = clampedAmount * GOLD_TO_IRON_RATE;
  const canExchange =
    clampedAmount > 0 && !exchanging && !profileServerUnavailable;
  const presets = [1, 5, 10, 50];

  function setAmount(next: number) {
    setStatusMessage(null);
    const safeNext = Number.isFinite(next) ? Math.floor(next) : 0;
    setGoldAmount(Math.max(0, Math.min(safeNext, maxGold)));
  }

  async function runExchange() {
    if (!canExchange) return;
    setStatusMessage(null);
    setExchanging(true);

    try {
      const exchangedGold = clampedAmount;
      const nextProgress = await exchangeGoldForIronOnServer(exchangedGold);
      setProgress(nextProgress);
      setGoldAmount((current) => Math.min(current, nextProgress.goldTracks));
      onProfileChanged();
      setStatusMessage(
        language === "en"
          ? `Exchange complete: +${formatResourceValue(
              exchangedGold * GOLD_TO_IRON_RATE,
              language
            )} iron tracks.`
          : `Обмен выполнен: +${formatResourceValue(
              exchangedGold * GOLD_TO_IRON_RATE
            )} железных траков.`
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : language === "en"
            ? "Could not complete exchange"
            : "Не удалось выполнить обмен"
      );
    } finally {
      setExchanging(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />
      <PlayerAccountPanel />
      <PlayerResourcesPanel />
      {profileServerUnavailable ? (
        <ProfileServerBanner onRetry={() => window.location.reload()} />
      ) : null}

      <section style={{ ...styles.menuLayer, ...styles.shopLayer }}>
        <header style={styles.shopHeader}>
          <button type="button" style={styles.shopBackButton} onClick={onBack}>
            {t("common.back")}
          </button>
          <div>
            <h1 style={styles.title}>
              {language === "en" ? "TRACK EXCHANGE" : "ОБМЕН ТРАКОВ"}
            </h1>
            <p style={styles.shopSubtitle}>
              {language === "en"
                ? `1 gold track = ${GOLD_TO_IRON_RATE} iron tracks`
                : `1 золотой трак = ${GOLD_TO_IRON_RATE} железных траков`}
            </p>
          </div>
        </header>

        <div style={styles.exchangeBalanceRow}>
          <span style={styles.exchangeBalanceCell}>
            <img
              src={goldTracksIcon}
              alt=""
              draggable={false}
              style={styles.shopBalanceIcon}
            />
            {formatResourceValue(progress.goldTracks, language)}
          </span>
          <span style={styles.exchangeBalanceCell}>
            <img
              src={silverTracksIcon}
              alt=""
              draggable={false}
              style={styles.shopBalanceIcon}
            />
            {formatResourceValue(progress.ironTracks, language)}
          </span>
        </div>

        <div style={styles.exchangeCard}>
          <div style={styles.exchangeFlow}>
            <div style={styles.exchangeSide}>
              <img
                src={goldTracksIcon}
                alt=""
                draggable={false}
                style={styles.exchangeSideIcon}
              />
              <span style={styles.exchangeSideValue}>
                −{formatResourceValue(clampedAmount)}
              </span>
              <span style={styles.exchangeSideLabel}>{t("resources.goldTracks")}</span>
            </div>
            <span style={styles.exchangeArrow}>→</span>
            <div style={styles.exchangeSide}>
              <img
                src={silverTracksIcon}
                alt=""
                draggable={false}
                style={styles.exchangeSideIcon}
              />
              <span style={styles.exchangeSideValue}>
                +{formatResourceValue(ironGain)}
              </span>
              <span style={styles.exchangeSideLabel}>{t("resources.ironTracks")}</span>
            </div>
          </div>

          <div style={styles.exchangeStepper}>
            <button
              type="button"
              style={styles.exchangeStepButton}
              onClick={() => setAmount(clampedAmount - 1)}
              disabled={clampedAmount <= 0}
              aria-label={language === "en" ? "Decrease" : "Уменьшить"}
            >
              −
            </button>
            <input
              type="number"
              min={0}
              max={maxGold}
              value={clampedAmount}
              onChange={(event) => setAmount(Number(event.target.value))}
              style={styles.exchangeInput}
              inputMode="numeric"
              aria-label={t("resources.goldTracks")}
            />
            <button
              type="button"
              style={styles.exchangeStepButton}
              onClick={() => setAmount(clampedAmount + 1)}
              disabled={clampedAmount >= maxGold}
              aria-label={language === "en" ? "Increase" : "Увеличить"}
            >
              +
            </button>
          </div>

          <div style={styles.exchangePresetRow}>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                style={styles.exchangePresetButton}
                disabled={maxGold < 1}
                onClick={() => setAmount(preset)}
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              style={styles.exchangePresetButton}
              disabled={maxGold < 1}
              onClick={() => setAmount(maxGold)}
            >
              {language === "en" ? "All" : "Всё"}
            </button>
          </div>

          <button
            type="button"
            style={{
              ...styles.exchangeConfirmButton,
              ...(canExchange ? {} : styles.shopOfferCardDisabled),
            }}
            disabled={!canExchange}
            onClick={() => void runExchange()}
          >
            {exchanging
              ? language === "en"
                ? "Exchanging..."
                : "Обмен..."
              : maxGold < 1
                ? language === "en"
                  ? "No gold tracks"
                  : "Нет золотых траков"
                : clampedAmount < 1
                  ? language === "en"
                    ? "Choose amount"
                    : "Выберите количество"
                  : language === "en"
                    ? `Exchange ${formatResourceValue(
                        clampedAmount,
                        language
                      )} → ${formatResourceValue(ironGain, language)}`
                    : `Обменять ${formatResourceValue(
                        clampedAmount
                      )} → ${formatResourceValue(ironGain)}`}
          </button>

          <button
            type="button"
            style={styles.exchangeShopLink}
            onClick={onOpenShop}
          >
            {language === "en"
              ? "Buy gold tracks in the shop"
              : "Купить золотые траки в магазине"}
          </button>
        </div>

        {statusMessage ? (
          <div style={styles.shopStatusMessage}>{statusMessage}</div>
        ) : null}
      </section>
    </main>
  );
}

function MenuChunkLoadingScreen() {
  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />
      <section style={styles.menuLayer}>
        <div style={styles.menuChunkLoading}>Загрузка...</div>
      </section>
    </main>
  );
}

function GuestEntryScreen({
  initialNickname,
  profileUnavailable,
  onRetryProfile,
  onEnter,
  onLogin,
  onRegister,
}: {
  initialNickname: string;
  profileUnavailable: boolean;
  onRetryProfile: () => void;
  onEnter: (nickname: string, legalAccepted: boolean) => Promise<void>;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (
    username: string,
    email: string,
    password: string,
    legalAccepted: boolean,
    promoCode?: string
  ) => Promise<void>;
}) {
  const { t } = useI18n();
  const [authMode, setAuthMode] = useState<"guest" | "login" | "register">(
    "guest"
  );
  const [nickname, setNickname] = useState(() =>
    sanitizePlayerNicknameInput(initialNickname)
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(
    () => window.localStorage.getItem(LEGAL_ACCEPTED_STORAGE_KEY) === "true"
  );
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const normalizedNickname = normalizePlayerNickname(nickname);
  // Forces the device into landscape while a field is focused so the mobile
  // keyboard opens horizontally to match the rotated landscape UI.
  const keyboardLock = useLandscapeKeyboardLock();

  async function submitGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setAuthError(null);
    try {
      if (!isValidPlayerNickname(normalizedNickname)) {
        throw new Error(t("auth.nicknameHint"));
      }

      if (!legalAccepted) {
        throw new Error(t("auth.legalRequired"));
      }

      await onEnter(normalizedNickname, legalAccepted);
      window.localStorage.setItem(LEGAL_ACCEPTED_STORAGE_KEY, "true");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t("auth.loginFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setAuthError(null);
    try {
      if (authMode === "login") {
        await onLogin(username, password);
      } else {
        if (!isValidPlayerNickname(username)) {
          throw new Error(t("auth.nicknameHint"));
        }

        if (!isValidEmail(email)) {
          throw new Error(t("auth.emailInvalid"));
        }

        if (password !== repeatPassword) {
          throw new Error(t("auth.passwordMismatch"));
        }

        if (!legalAccepted) {
          throw new Error(t("auth.legalRequired"));
        }

        await onRegister(username, email, password, legalAccepted, promoCode);
        window.localStorage.setItem(LEGAL_ACCEPTED_STORAGE_KEY, "true");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t("auth.loginFailed"));
    } finally {
      setSaving(false);
    }
  }

  const authModeTitle =
    authMode === "login" ? t("auth.accountLogin") : t("auth.register");

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />
      <section style={styles.guestEntryPanel}>
        <header style={styles.guestEntryHeader}>
          <h1 style={styles.guestEntryTitle}>PANZERSHREK</h1>
          <p style={styles.guestEntrySubtitle}>{t("auth.profileLogin")}</p>
        </header>

        {authMode === "guest" ? (
        <form style={styles.guestEntryForm} onSubmit={submitGuest}>
          <label style={styles.guestEntryLabel} htmlFor="guest-nickname">
            {t("auth.commanderNickname")}
          </label>
          <input
            id="guest-nickname"
            value={nickname}
            maxLength={PLAYER_NICKNAME_MAX_LENGTH}
            pattern={PLAYER_NICKNAME_INPUT_PATTERN}
            title={t("auth.nicknameHint")}
            onChange={(event) =>
              setNickname(sanitizePlayerNicknameInput(event.target.value))
            }
            style={styles.guestEntryInput}
            autoComplete="nickname"
            {...keyboardLock}
          />

          <button
            type="submit"
            style={styles.guestPrimaryButton}
            disabled={saving}
          >
            {saving ? t("auth.saving") : t("auth.playAsGuest")}
          </button>

          <label style={styles.legalConsentRow}>
            <input
              type="checkbox"
              checked={legalAccepted}
              onChange={(event) => setLegalAccepted(event.target.checked)}
              style={styles.legalConsentCheckbox}
            />
            <span>
              {t("auth.legalConsent")} <LegalLinks compact />
            </span>
          </label>
          <LanguageChoiceRow compact />

          <div style={styles.guestSecondaryActions}>
            <button
              type="button"
              style={styles.guestSecondaryButton}
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
                setRepeatPassword("");
              }}
            >
              {t("auth.login")}
            </button>
            <button
              type="button"
              style={styles.guestSecondaryButton}
              onClick={() => {
                setAuthMode("register");
                setAuthError(null);
                setRepeatPassword("");
              }}
            >
              {t("auth.register")}
            </button>
          </div>
        </form>
        ) : (
          <form style={styles.guestEntryForm} onSubmit={submitAuth}>
            <div style={styles.guestAuthHeader}>
              <span style={styles.guestAuthTitle}>{authModeTitle}</span>
              <button
                type="button"
                style={styles.guestAuthBackButton}
                onClick={() => {
                  setAuthMode("guest");
                  setAuthError(null);
                  setRepeatPassword("");
                }}
              >
                {t("common.guest")}
              </button>
            </div>

            <label style={styles.guestEntryLabel} htmlFor="account-username">
              {t("auth.loginLabel")}
            </label>
            <input
              id="account-username"
              value={username}
              maxLength={PLAYER_NICKNAME_MAX_LENGTH}
              pattern={PLAYER_NICKNAME_INPUT_PATTERN}
              title={t("auth.nicknameHint")}
              onChange={(event) =>
                setUsername(sanitizePlayerNicknameInput(event.target.value))
              }
              style={{ ...styles.guestEntryInput, ...styles.authModalInput }}
              autoComplete="username"
              {...keyboardLock}
            />

            {authMode === "register" ? (
              <>
                <label style={styles.guestEntryLabel} htmlFor="account-email">
                  E-mail
                </label>
                <input
                  id="account-email"
                  value={email}
                  maxLength={254}
                  type="email"
                  onChange={(event) => setEmail(event.target.value)}
                  style={styles.guestEntryInput}
                  autoComplete="email"
                  {...keyboardLock}
                />
              </>
            ) : null}

            <label style={styles.guestEntryLabel} htmlFor="account-password">
              {t("auth.password")}
            </label>
            <input
              id="account-password"
              value={password}
              minLength={6}
              maxLength={72}
              type="password"
              onChange={(event) => setPassword(event.target.value)}
              style={styles.guestEntryInput}
              autoComplete={
                authMode === "login" ? "current-password" : "new-password"
              }
              {...keyboardLock}
            />

            {authMode === "register" ? (
              <>
                <label
                  style={styles.guestEntryLabel}
                  htmlFor="account-repeat-password"
                >
                  {t("auth.repeatPassword")}
                </label>
                <input
                  id="account-repeat-password"
                  value={repeatPassword}
                  minLength={6}
                  maxLength={72}
                  type="password"
                  onChange={(event) => setRepeatPassword(event.target.value)}
                  style={styles.guestEntryInput}
                  autoComplete="new-password"
                  {...keyboardLock}
                />

                <label style={styles.guestEntryLabel} htmlFor="account-promo-code">
                  {t("auth.promoCode")}
                </label>
                <input
                  id="account-promo-code"
                  value={promoCode}
                  maxLength={32}
                  onChange={(event) => setPromoCode(event.target.value)}
                  style={styles.guestEntryInput}
                  autoComplete="off"
                  {...keyboardLock}
                />
              </>
            ) : null}

            {authMode === "register" ? (
              <label style={styles.legalConsentRow}>
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(event) => setLegalAccepted(event.target.checked)}
                  style={styles.legalConsentCheckbox}
                />
                <span>
                  {t("auth.legalConsent")} <LegalLinks compact />
                </span>
              </label>
            ) : null}

            {authMode === "register" ? <LanguageChoiceRow compact /> : null}

            <button
              type="submit"
              style={styles.guestPrimaryButton}
              disabled={saving}
            >
              {saving
                ? t("auth.connecting")
                : authMode === "login"
                  ? t("auth.login")
                  : t("auth.createAccount")}
            </button>
          </form>
        )}

        <p style={styles.guestEntryNote}>
          {t("auth.guestProgressNote")}
        </p>

        {authError ? <p style={styles.guestEntryError}>{authError}</p> : null}

        {profileUnavailable ? (
          <div style={styles.guestServerNotice}>
            <span>{t("common.profileServerUnavailable")}</span>
            <button
              type="button"
              style={styles.profileServerRetryButton}
              onClick={onRetryProfile}
            >
              {t("common.retry")}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function getTotalMatchCount(progress: PlayerProgress) {
  return Object.values(progress.headquartersMatchCounts).reduce(
    (total, count) => total + (count ?? 0),
    0
  );
}

/**
 * Account dialog opened from the guest profile header. It lets a guest either
 * create a new account (merging guest progress) or sign in to an existing one.
 */
function ProfileRegisterModal({
  onClose,
  onLogin,
  onRegister,
}: {
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (
    username: string,
    email: string,
    password: string,
    legalAccepted: boolean,
    promoCode?: string
  ) => Promise<void>;
}) {
  const { t } = useI18n();
  const overlayTransform = useStageOverlayTransform();
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(
    () => window.localStorage.getItem(LEGAL_ACCEPTED_STORAGE_KEY) === "true"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboardLock = useLandscapeKeyboardLock();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      if (!isValidPlayerNickname(username)) {
        throw new Error(t("auth.nicknameHint"));
      }

      if (authMode === "login") {
        await onLogin(username, password);
        onClose();
        return;
      }

      if (!isValidEmail(email)) {
        throw new Error(t("auth.emailInvalid"));
      }

      if (password !== repeatPassword) {
        throw new Error(t("auth.passwordMismatch"));
      }

      if (!legalAccepted) {
        throw new Error(t("auth.legalRequired"));
      }

      await onRegister(username, email, password, legalAccepted, promoCode);
      window.localStorage.setItem(LEGAL_ACCEPTED_STORAGE_KEY, "true");
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("auth.registerFailed")
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div style={styles.authModalOverlay} onClick={onClose}>
        <div
          style={{
            ...styles.authModalPanel,
            transform: `translate(-50%, -50%) ${overlayTransform.transform}`,
            transformOrigin: "center center",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={styles.guestAuthHeader}>
            <span style={styles.guestAuthTitle}>
              {authMode === "login" ? t("auth.accountLogin") : t("auth.register")}
            </span>
            <button
              type="button"
              style={styles.guestAuthBackButton}
              onClick={onClose}
            >
              {t("auth.cancel")}
            </button>
          </div>

          <div style={styles.guestSecondaryActions}>
            <button
              type="button"
              style={{
                ...styles.guestSecondaryButton,
                ...(authMode === "login" ? styles.guestModeButtonActive : {}),
              }}
              onClick={() => {
                setAuthMode("login");
                setError(null);
              }}
            >
              {t("auth.login")}
            </button>
            <button
              type="button"
              style={{
                ...styles.guestSecondaryButton,
                ...(authMode === "register" ? styles.guestModeButtonActive : {}),
              }}
              onClick={() => {
                setAuthMode("register");
                setError(null);
              }}
            >
              {t("auth.register")}
            </button>
          </div>

          <p style={{ ...styles.guestEntryNote, ...styles.authModalNote }}>
            {authMode === "login"
              ? t("auth.guestProgressNote")
              : t("auth.guestMergeNote")}
          </p>

          <form
            style={{ ...styles.guestEntryForm, ...styles.authModalForm }}
            onSubmit={submit}
          >
            <div style={styles.authModalField}>
              <label
                style={styles.guestEntryLabel}
                htmlFor="profile-register-username"
              >
                {t("auth.loginLabel")}
              </label>
              <input
                id="profile-register-username"
                value={username}
                maxLength={PLAYER_NICKNAME_MAX_LENGTH}
                pattern={PLAYER_NICKNAME_INPUT_PATTERN}
                title={t("auth.nicknameHint")}
                onChange={(event) =>
                  setUsername(sanitizePlayerNicknameInput(event.target.value))
                }
                style={{ ...styles.guestEntryInput, ...styles.authModalInput }}
                autoComplete="username"
                {...keyboardLock}
              />
            </div>

            {authMode === "register" ? (
              <div style={styles.authModalField}>
                <label
                  style={styles.guestEntryLabel}
                  htmlFor="profile-register-email"
                >
                  E-mail
                </label>
                <input
                  id="profile-register-email"
                  type="email"
                  value={email}
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  style={{ ...styles.guestEntryInput, ...styles.authModalInput }}
                  autoComplete="email"
                  {...keyboardLock}
                />
              </div>
            ) : null}

            <div style={styles.authModalField}>
              <label
                style={styles.guestEntryLabel}
                htmlFor="profile-register-password"
              >
                {t("auth.password")}
              </label>
              <input
                id="profile-register-password"
                type="password"
                value={password}
                minLength={6}
                maxLength={72}
                onChange={(event) => setPassword(event.target.value)}
                style={{ ...styles.guestEntryInput, ...styles.authModalInput }}
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                {...keyboardLock}
              />
            </div>

            {authMode === "register" ? (
              <>
                <div style={styles.authModalField}>
                  <label
                    style={styles.guestEntryLabel}
                    htmlFor="profile-register-repeat-password"
                  >
                    {t("auth.repeatPassword")}
                  </label>
                  <input
                    id="profile-register-repeat-password"
                    type="password"
                    value={repeatPassword}
                    minLength={6}
                    maxLength={72}
                    onChange={(event) => setRepeatPassword(event.target.value)}
                    style={{ ...styles.guestEntryInput, ...styles.authModalInput }}
                    autoComplete="new-password"
                    {...keyboardLock}
                  />
                </div>

                <div style={styles.authModalField}>
                  <label
                    style={styles.guestEntryLabel}
                    htmlFor="profile-register-promo-code"
                  >
                    {t("auth.promoCode")}
                  </label>
                  <input
                    id="profile-register-promo-code"
                    value={promoCode}
                    maxLength={32}
                    onChange={(event) => setPromoCode(event.target.value)}
                    style={{ ...styles.guestEntryInput, ...styles.authModalInput }}
                    autoComplete="off"
                    {...keyboardLock}
                  />
                </div>

                <label style={{ ...styles.legalConsentRow, ...styles.authModalWide }}>
                  <input
                    type="checkbox"
                    checked={legalAccepted}
                    onChange={(event) => setLegalAccepted(event.target.checked)}
                    style={styles.legalConsentCheckbox}
                  />
                  <span>
                    {t("auth.legalConsent")} <LegalLinks compact />
                  </span>
                </label>

                <div style={styles.authModalWide}>
                  <LanguageChoiceRow compact />
                </div>
              </>
            ) : null}

            <button
              type="submit"
              style={{
                ...styles.guestPrimaryButton,
                ...styles.authModalPrimaryButton,
                ...styles.authModalWide,
              }}
              disabled={saving}
            >
              {saving
                ? authMode === "login"
                  ? t("auth.connecting")
                  : t("auth.registering")
                : authMode === "login"
                  ? t("auth.login")
                  : t("auth.registerAccount")}
            </button>
          </form>

          {error ? <p style={styles.guestEntryError}>{error}</p> : null}
        </div>
    </div>,
    document.body
  );
}

function PlayerProfileMenu({
  onBack,
  onProfileChanged,
  onDailyLoginReward,
  openRegisterOnMount = false,
  onRegisterIntentConsumed,
}: {
  onBack: () => void;
  onProfileChanged?: () => void;
  onDailyLoginReward?: (progress: PlayerProgress) => void;
  /** Open the login/registration form immediately (from the reminder CTA). */
  openRegisterOnMount?: boolean;
  onRegisterIntentConsumed?: () => void;
}) {
  const { language, t } = useI18n();
  const [progress, setProgress] = useState(() => loadPlayerProgress());
  const registeredUserOnMount = isRegisteredUserId(getCurrentUserId());
  const [registerOpen, setRegisterOpen] = useState(
    () => openRegisterOnMount && !registeredUserOnMount
  );

  useEffect(() => {
    if (openRegisterOnMount) {
      onRegisterIntentConsumed?.();
    }
    // Consume the one-shot intent once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "failed"
  >("idle");
  const profileConnection = useProfileConnection();
  const profileServerUnavailable = isProfileServerUnavailable(profileConnection);
  const profileServerReady = profileConnection.status === "online";
  const currentUserId = getCurrentUserId();
  const currentUserLogin = getCurrentUserLogin();
  const displayNickname = getPlayerDisplayNickname(progress, currentUserLogin);
  const registeredUser = isRegisteredUserId(currentUserId);
  const favoriteHeadquartersId = getFavoriteHeadquartersId(progress);
  const favoriteHeadquarters = HEADQUARTERS[favoriteHeadquartersId];
  const favoriteFlag = getNationFlagAsset(favoriteHeadquarters.nation);
  const favoriteAvatar = getHeadquartersAvatarAsset(favoriteHeadquarters.id);
  const pendingSyncCount = progress.pendingRewardClaims.length;
  const headquartersRows = Array.from(
    new Set(Object.keys(progress.headquartersMatchCounts))
  )
    .filter((headquartersId): headquartersId is HeadquartersId =>
      Boolean(HEADQUARTERS[headquartersId as HeadquartersId]) &&
      (progress.headquartersMatchCounts[headquartersId as HeadquartersId] ?? 0) > 0
    )
    .map((headquartersId) => ({
      headquarters: HEADQUARTERS[headquartersId],
      flag: getNationFlagAsset(HEADQUARTERS[headquartersId].nation),
      matches: progress.headquartersMatchCounts[headquartersId] ?? 0,
      stats: progress.headquartersBattleStats[headquartersId] ?? {
        wins: 0,
        losses: 0,
      },
      xp: progress.headquartersXp[headquartersId] ?? 0,
    }))
    .sort((left, right) => right.matches - left.matches);

  async function retryProfileSync() {
    setSyncStatus("syncing");
    try {
      await retryProfileConnection();
      const serverProgress = await syncPlayerProgressFromServer();
      setProgress(serverProgress);
      setSyncStatus(
        serverProgress.pendingRewardClaims.length > 0 ? "failed" : "synced"
      );
      onDailyLoginReward?.(serverProgress);
      onProfileChanged?.();
    } catch {
      setSyncStatus("failed");
      window.alert(t("common.profileServerUnavailable"));
    }
  }

  function makeFavorite(headquartersId: HeadquartersId) {
    if (!profileServerReady) {
      window.alert(
        profileServerUnavailable
          ? t("common.profileServerUnavailable")
          : t("common.profileSyncWait")
      );
      return;
    }

    void setFavoriteHeadquartersIdOnServer(headquartersId).then((nextProgress) => {
      if (nextProgress) {
        setProgress(nextProgress);
      }
    });
  }

  async function registerFromProfile(
    username: string,
    email: string,
    password: string,
    legalAccepted: boolean,
    promoCode?: string
  ) {
    const nextProgress = await registerPlayerAccount({
      username,
      email,
      password,
      legalAccepted,
      promoCode,
      mergeGuestProgress: true,
    });
    window.localStorage.setItem(GUEST_SESSION_READY_KEY, "true");
    setProgress(nextProgress);
    onDailyLoginReward?.(nextProgress);
    onProfileChanged?.();
  }

  async function loginFromProfile(username: string, password: string) {
    const nextProgress = await loginPlayerAccount({
      username,
      password,
      mergeGuestProgress: false,
    });
    window.localStorage.setItem(GUEST_SESSION_READY_KEY, "true");
    setProgress(nextProgress);
    onDailyLoginReward?.(nextProgress);
    onProfileChanged?.();
  }

  async function logoutAccount() {
    if (!registeredUser) return;

    const confirmed = window.confirm(
      "Выйти из аккаунта и перейти в гостевой профиль?"
    );
    if (!confirmed) return;

    const nextProgress = await logoutPlayerAccount();
    setProgress(nextProgress);
    onProfileChanged?.();
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />
      <PlayerAccountPanel />
      <PlayerResourcesPanel />
      {profileServerUnavailable ? (
        <ProfileServerBanner onRetry={() => void retryProfileSync()} />
      ) : null}

      <section style={{ ...styles.menuLayer, ...styles.profileLayer }}>
        <div style={styles.profileHero}>
          {favoriteFlag ? (
            <div
              style={{
                ...styles.profileFlag,
                backgroundImage: `url("${favoriteFlag}")`,
              }}
            />
          ) : null}
          <button
            type="button"
            style={{ ...styles.backButton, ...styles.profileBackButton }}
            onClick={onBack}
          >
            Назад
          </button>
          {registeredUser ? (
            <button
              type="button"
              style={styles.profileLogoutButton}
              onClick={() => void logoutAccount()}
            >
              Выйти из аккаунта
            </button>
          ) : null}
          {registeredUser ? null : (
            <button
              type="button"
              style={styles.profileRegisterButton}
              onClick={() => setRegisterOpen(true)}
            >
              {language === "en" ? "Log in / register" : "Войти / регистрация"}
            </button>
          )}
          <div style={styles.profileAvatarFrame}>
            {favoriteAvatar ? (
              <img
                src={favoriteAvatar}
                alt=""
                draggable={false}
                style={styles.profileAvatar}
              />
            ) : null}
          </div>
          <div style={styles.profileIdentity}>
            <span style={styles.profileKicker}>Профиль игрока</span>
            <h1 style={styles.profileName}>{displayNickname}</h1>
            <span style={styles.profileAccount}>
              {progress.accountType === "premium"
                ? "Премиум аккаунт"
                : "Базовый аккаунт"}
            </span>
            <strong
              style={{
                ...styles.profileFavorite,
                ...styles.headquartersNameLabel,
                fontFamily: getDisplayFontForText(favoriteHeadquarters.title),
              }}
            >
              {favoriteHeadquarters.title}
            </strong>
          </div>
        </div>

        <div style={styles.profileStatsGrid}>
          <div style={styles.profileStatCard}>
            <span>Сыграно боев</span>
            <strong>{getTotalMatchCount(progress)}</strong>
          </div>
          <div style={styles.profileStatCard}>
            <span style={styles.profileStatLabelNoWrap}>
              Победы / поражения
            </span>
            <strong>
              {progress.battleStats.wins} / {progress.battleStats.losses}
            </strong>
          </div>
          <div style={styles.profileStatCard}>
            <span>Свободный опыт</span>
            <strong>{formatResourceValue(progress.freeXp)}</strong>
          </div>
          <div style={styles.profileStatCard}>
            <span>Железные траки</span>
            <strong>{formatResourceValue(progress.ironTracks)}</strong>
          </div>
          <div style={styles.profileStatCard}>
            <span>Золотые траки</span>
            <strong>{formatResourceValue(progress.goldTracks)}</strong>
          </div>
        </div>

        {pendingSyncCount > 0 ||
        syncStatus === "synced" ||
        syncStatus === "failed" ? (
          <section
            style={{
              ...styles.profileSyncPanel,
              ...(syncStatus === "failed" ? styles.profileSyncPanelFailed : {}),
              ...(syncStatus === "synced" ? styles.profileSyncPanelSynced : {}),
            }}
          >
            <div style={styles.profileSyncText}>
              <strong>
                {pendingSyncCount > 0
                  ? `Ожидает синхронизации: ${pendingSyncCount}`
                  : syncStatus === "synced"
                    ? "Прогресс синхронизирован"
                    : "Синхронизация не удалась"}
              </strong>
              <span>
                {pendingSyncCount > 0
                  ? "Локальные награды будут отправлены на сервер профиля."
                  : syncStatus === "synced"
                    ? "Все локальные начисления переданы на сервер."
                    : "Проверьте подключение к серверу профиля и повторите попытку."}
              </span>
            </div>
            <button
              type="button"
              style={styles.profileSyncButton}
              onClick={() => void retryProfileSync()}
              disabled={syncStatus === "syncing"}
            >
              {syncStatus === "syncing" ? "Синхронизация..." : "Синхронизировать"}
            </button>
          </section>
        ) : null}

        <section style={styles.profileHeadquartersPanel}>
          <h2 style={styles.profileSectionTitle}>Штабы</h2>
          <div className="menu-carousel-scroll" style={styles.profileHeadquartersList}>
            {headquartersRows.map(({ headquarters, flag, matches, stats, xp }) => (
              <div key={headquarters.id} style={styles.profileHeadquartersRow}>
                {flag ? (
                  <div
                    style={{
                      ...styles.profileHeadquartersFlag,
                      backgroundImage: `url("${flag}")`,
                    }}
                  />
                ) : null}
                <img
                  src={getHeadquartersAvatarAsset(headquarters.id) ?? ""}
                  alt=""
                  draggable={false}
                  style={styles.profileMiniAvatar}
                />
                <div style={styles.profileHeadquartersText}>
                  <strong
                    style={{
                      ...styles.profileHeadquartersName,
                      fontFamily: getDisplayFontForText(headquarters.title),
                    }}
                  >
                    {headquarters.title}
                  </strong>
                  <span>
                    {getLocalizedNationLabel(headquarters.nation, language)} ·{" "}
                    {language === "en" ? "battles" : "боев"}: {matches} ·{" "}
                    {language === "en" ? "wins" : "побед"}: {stats.wins} ·{" "}
                    {language === "en" ? "losses" : "поражений"}: {stats.losses} ·{" "}
                    {language === "en" ? "XP" : "опыта"}: {xp}
                  </span>
                </div>
                <button
                  type="button"
                  style={{
                    ...styles.profileFavoriteButton,
                    ...(headquarters.id === favoriteHeadquartersId
                      ? styles.profileFavoriteButtonActive
                      : {}),
                  }}
                  onClick={() => makeFavorite(headquarters.id)}
                >
                  {headquarters.id === favoriteHeadquartersId
                    ? "Любимый"
                    : "Назначить"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </section>

      {registerOpen ? (
        <ProfileRegisterModal
          onClose={() => setRegisterOpen(false)}
          onLogin={loginFromProfile}
          onRegister={registerFromProfile}
        />
      ) : null}
    </main>
  );
}

function getHeadquartersPortrait(headquartersId: HeadquartersId): string | null {
  return (
    getHeadquartersAvatarAsset(headquartersId) ??
    getHeadquartersImageAsset(headquartersId)
  );
}

function getDisplayFontForText(value: string): string {
  return /[А-Яа-яЁё]/.test(value) ? "var(--font-body)" : "var(--font-display)";
}

function PvpMatchmakingScreen({
  playerHeadquartersId,
  playerNickname,
  playerDeckWeight,
  opponentHeadquartersId,
  opponentNickname,
  opponentDeckWeight,
  previewLabel,
  status,
  error,
  searchDeadlineAt,
  onCancel,
  onRetry,
  onFallback,
  persistentSearch = false,
  radarVolumeMultiplier = 1,
  title,
  onMainMenu,
  cancelLabel,
}: {
  playerHeadquartersId: HeadquartersId;
  playerNickname: string;
  playerDeckWeight: number | null;
  opponentHeadquartersId: HeadquartersId | null;
  opponentNickname: string | null;
  opponentDeckWeight: number | null;
  previewLabel: string | null;
  status: PvpConnectionState;
  error: string | null;
  searchDeadlineAt: number | null;
  onCancel: () => void;
  onRetry: () => void;
  onFallback: () => void;
  persistentSearch?: boolean;
  radarVolumeMultiplier?: number;
  title?: string;
  onMainMenu?: () => void;
  cancelLabel?: string;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [reticleIndex, setReticleIndex] = useState(0);
  const playRadarScanSoundRef = useRef(
    createRadarScanSoundPlayer(radarVolumeMultiplier)
  );
  const matched = status === "matchPreview";
  const failed = status === "error";
  const canAutoFallback = status === "searching" || status === "waiting";
  const playerHeadquarters = HEADQUARTERS[playerHeadquartersId];
  const opponentHeadquarters = opponentHeadquartersId
    ? HEADQUARTERS[opponentHeadquartersId]
    : null;
  const playerPortrait = getHeadquartersPortrait(playerHeadquartersId);
  const opponentPortrait = opponentHeadquartersId
    ? getHeadquartersPortrait(opponentHeadquartersId)
    : null;
  const playerFlag = getNationFlagAsset(playerHeadquarters.nation);
  const opponentFlag = opponentHeadquarters
    ? getNationFlagAsset(opponentHeadquarters.nation)
    : null;
  const remainingMs = searchDeadlineAt
    ? Math.max(0, searchDeadlineAt - now)
    : PVP_MATCH_SEARCH_DURATION_MS;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const reticlePositions = [
    { left: "22%", top: "28%" },
    { left: "68%", top: "22%" },
    { left: "48%", top: "52%" },
    { left: "75%", top: "70%" },
    { left: "30%", top: "72%" },
  ];

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (matched || failed) return;

    const intervalId = window.setInterval(() => {
      setReticleIndex((current) => (current + 1) % reticlePositions.length);
    }, 1250);

    return () => window.clearInterval(intervalId);
  }, [failed, matched, reticlePositions.length]);

  useEffect(() => {
    if (matched || failed) return;

    playRadarScanSoundRef.current();
  }, [failed, matched, reticleIndex]);

  useEffect(() => {
    if (!canAutoFallback) return;
    if (matched) return;
    if (!searchDeadlineAt) return;
    if (now < searchDeadlineAt) return;

    onFallback();
  }, [canAutoFallback, matched, now, onFallback, searchDeadlineAt]);

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />

      <section style={styles.matchmakingScreen}>
        <header style={styles.matchmakingHeader}>
          <h1 style={styles.matchmakingTitle}>{title ?? t("battle.searchingOpponent")}</h1>
        </header>

        <div
          style={{
            ...styles.matchmakingArena,
            ...(matched && opponentHeadquarters
              ? styles.matchmakingArenaMatched
              : styles.matchmakingArenaSearching),
          }}
        >
          <motion.div
            style={styles.matchmakingSide}
            initial={{ opacity: 0, x: -34 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.38, ease: "easeOut" }}
          >
            <div style={styles.matchmakingPortraitStage}>
              {playerFlag ? (
                <div
                  style={{
                    ...styles.matchmakingFlag,
                    ...(playerHeadquarters.nation === "usa"
                      ? styles.matchmakingUsaFlag
                      : {}),
                    backgroundImage: `url("${playerFlag}")`,
                  }}
                />
              ) : null}
              {playerPortrait ? (
                <img
                  src={playerPortrait}
                  alt={playerHeadquarters.title}
                  style={styles.matchmakingPortrait}
                />
              ) : (
                <div
                  style={{
                    ...styles.matchmakingPortraitPlaceholder,
                    fontFamily: getDisplayFontForText(playerHeadquarters.title),
                  }}
                >
                  {playerHeadquarters.title}
                </div>
              )}
            </div>
            <div style={styles.matchmakingDetails}>
              <div
                style={{
                  ...styles.matchmakingName,
                  fontFamily: getDisplayFontForText(playerHeadquarters.title),
                }}
              >
                {playerHeadquarters.title}
              </div>
              <div style={styles.matchmakingIdentity}>
                <strong>{playerNickname}</strong>
                <span>
                  {t("battle.deckWeight")}: {playerDeckWeight ?? "—"}
                </span>
              </div>
            </div>
          </motion.div>

          {matched && opponentHeadquarters ? (
            <>
              <motion.img
                key="break"
                src={matchmakingBreakImage}
                alt=""
                aria-hidden="true"
                style={styles.matchmakingBreak}
                initial={{ opacity: 0, scale: 0.84 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.36, ease: "easeOut" }}
              />
              <motion.div
                key="opponent"
                style={styles.matchmakingSide}
                initial={{ opacity: 0, x: 34 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.38, ease: "easeOut" }}
              >
                {previewLabel ? (
                  <div style={styles.matchmakingOpponentLabel}>
                    {previewLabel}
                  </div>
                ) : null}
                <div style={styles.matchmakingPortraitStage}>
                  {opponentFlag ? (
                    <div
                      style={{
                        ...styles.matchmakingFlag,
                        ...(opponentHeadquarters.nation === "usa"
                          ? styles.matchmakingUsaFlag
                          : {}),
                        backgroundImage: `url("${opponentFlag}")`,
                      }}
                    />
                  ) : null}
                  {opponentPortrait ? (
                    <img
                      src={opponentPortrait}
                      alt={opponentHeadquarters.title}
                      style={styles.matchmakingPortrait}
                    />
                  ) : (
                    <div
                      style={{
                        ...styles.matchmakingPortraitPlaceholder,
                        fontFamily: getDisplayFontForText(
                          opponentHeadquarters.title
                        ),
                      }}
                    >
                      {opponentHeadquarters.title}
                    </div>
                  )}
                </div>
                <div style={styles.matchmakingDetails}>
                  <div
                    style={{
                      ...styles.matchmakingName,
                      fontFamily: getDisplayFontForText(
                        opponentHeadquarters.title
                      ),
                    }}
                  >
                    {opponentHeadquarters.title}
                  </div>
                  <div style={styles.matchmakingIdentity}>
                    <strong>{opponentNickname?.trim() || "Commander"}</strong>
                    <span>
                      {t("battle.deckWeight")}: {opponentDeckWeight ?? "—"}
                    </span>
                  </div>
                </div>
              </motion.div>
            </>
          ) : (
            <motion.div
              key="search"
              style={styles.matchmakingMapPanel}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
            >
              <img
                src={matchmakingMapImage}
                alt=""
                aria-hidden="true"
                style={styles.matchmakingMap}
              />
              <AnimatePresence mode="wait">
                <motion.img
                  key={reticleIndex}
                  src={matchmakingCielImage}
                  alt=""
                  aria-hidden="true"
                  style={{
                    ...styles.matchmakingReticle,
                    ...reticlePositions[reticleIndex],
                  }}
                  initial={{ opacity: 0, scale: 0.72 }}
                  animate={{ opacity: 0.86, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.18 }}
                  transition={{ duration: 0.42, ease: "easeOut" }}
                />
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        <footer style={styles.matchmakingFooter}>
          <div style={styles.matchmakingTimer}>
            {failed ? t("battle.pvpServerUnavailable") : matched
              ? t("battle.opponentFound")
              : persistentSearch
                ? "Заявка отправлена. Поиск продолжится в фоне."
              : `${t("battle.autobattleIn")} ${String(remainingSeconds).padStart(2, "0")} ${t("battle.secondsShort")}`}
          </div>
          <button type="button" style={styles.cancelButton} onClick={onCancel}>
            {cancelLabel ?? (failed ? t("common.back") : t("battle.cancelSearch"))}
          </button>
          {onMainMenu ? (
            <button
              type="button"
              style={{ ...styles.cancelButton, ...styles.retryButton }}
              onClick={onMainMenu}
            >
              В главное меню
            </button>
          ) : null}
          {error ? <div style={styles.error}>{error}</div> : null}
          {failed ? (
            <button
              type="button"
              style={{ ...styles.cancelButton, ...styles.retryButton }}
              onClick={onRetry}
            >
              {t("common.retry")}
            </button>
          ) : null}
        </footer>
      </section>
    </main>
  );
}

function scrollCarousel(
  viewportRef: RefObject<HTMLDivElement | null>,
  direction: -1 | 1
) {
  const viewport = viewportRef.current;
  if (!viewport) return;

  viewport.scrollBy({
    left: direction * Math.max(280, viewport.clientWidth * 0.72),
    behavior: "smooth",
  });
}

function CarouselTapFrame({
  children,
  viewportRef,
  viewportStyle,
  ariaLabel,
  hideArrows = false,
}: {
  children: ReactNode;
  viewportRef: RefObject<HTMLDivElement | null>;
  viewportStyle: CSSProperties;
  ariaLabel: string;
  hideArrows?: boolean;
}) {
  const dragScrollRef = useRef<CarouselDragState | null>(null);
  const suppressClickRef = useRef(false);

  function startDragScroll(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    dragScrollRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
    };
  }

  function moveDragScroll(event: PointerEvent<HTMLDivElement>) {
    const state = dragScrollRef.current;
    const viewport = viewportRef.current;
    if (!state?.active || !viewport || state.pointerId !== event.pointerId) {
      return;
    }

    // Convert the raw screen-space finger movement into the stage's own axes,
    // so a swipe along the carousel's visual horizontal scrolls it even when the
    // stage is rotated 90° on a portrait phone (where physical X/Y are swapped).
    const { x: distance } = screenDeltaToStage(
      event.clientX - state.startX,
      event.clientY - state.startY
    );
    if (Math.abs(distance) > 6) {
      state.moved = true;
      event.preventDefault();
    }

    viewport.scrollLeft = state.startScrollLeft - distance;
  }

  function stopDragScroll(event: PointerEvent<HTMLDivElement>) {
    const state = dragScrollRef.current;
    const viewport = viewportRef.current;
    if (!state?.active || !viewport || state.pointerId !== event.pointerId) {
      return;
    }

    if (state.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 180);
    }

    dragScrollRef.current = null;
  }

  function stopSuppressedClick(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;

    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWheelScroll(event: ReactWheelEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const { x: deltaXInStage, y: deltaYInStage } = screenDeltaToStage(
      event.deltaX,
      event.deltaY
    );
    const delta =
      Math.abs(deltaXInStage) > Math.abs(deltaYInStage)
        ? deltaXInStage
        : deltaYInStage;

    if (delta === 0) return;

    event.preventDefault();
    viewport.scrollLeft += delta;
  }

  return (
    <div style={styles.carouselShell}>
      {hideArrows ? null : (
        <button
          type="button"
          style={{ ...styles.carouselTapZone, ...styles.carouselTapZoneLeft }}
          onClick={() => scrollCarousel(viewportRef, -1)}
          aria-label="Прокрутить влево"
        >
          <span style={styles.carouselTapArrow}>‹</span>
        </button>
      )}

      <div
        ref={viewportRef}
        className="menu-carousel-scroll"
        style={viewportStyle}
        aria-label={ariaLabel}
        onPointerDown={startDragScroll}
        onPointerMove={moveDragScroll}
        onPointerUp={stopDragScroll}
        onPointerCancel={stopDragScroll}
        onWheelCapture={handleWheelScroll}
        onClickCapture={stopSuppressedClick}
      >
        {children}
      </div>

      {hideArrows ? null : (
        <button
          type="button"
          style={{ ...styles.carouselTapZone, ...styles.carouselTapZoneRight }}
          onClick={() => scrollCarousel(viewportRef, 1)}
          aria-label="Прокрутить вправо"
        >
          <span style={styles.carouselTapArrow}>›</span>
        </button>
      )}
    </div>
  );
}

function formatMissionCountdown(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}д ${hours}ч`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatRadioDuelCountdown(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин ${seconds % 60} сек`;
}

export function PvpLobby() {
  const { language, t } = useI18n();
  const {
    mode,
    menuView,
    pvpRoomId,
    pvpStatus,
    pvpError,
    battleStarting,
    pvpOpponentHeadquartersId,
    pvpOpponentNickname,
    pvpPlayerDeckWeight,
    pvpOpponentDeckWeight,
    pvpMatchPreviewLabel,
    pvpSearchDeadlineAt,
    selectedHeadquartersId,
    completedCampaignMissionIds,
    selectedCampaignId: storedSelectedCampaignId,
    setSelectedHeadquartersId,
    openHeadquartersMenu,
    closeHeadquartersMenu,
    openDeckBuilderMenu,
    closeDeckBuilderMenu,
    openProfileMenu,
    closeProfileMenu,
    openResearchMenu,
    closeResearchMenu,
    openCollectionMenu,
    closeCollectionMenu,
    openShopMenu,
    closeShopMenu,
    openExchangeMenu,
    closeExchangeMenu,
    openCampaignMenu,
    openCampaignMissions,
    closeCampaignMissions,
    closeCampaignMenu,
    startCampaignMission,
    findPvpMatch,
    retryPvpMatchmaking,
    startPvpFallbackAiBattle,
    startAiBattle,
    startTutorial,
    openTutorialMenu,
    closeTutorialMenu,
    openCombatMissionsMenu,
    closeCombatMissionsMenu,
    openRadioDuelsMenu,
    closeRadioDuelsMenu,
    openRadioDuelBattle,
    completedTutorialMissionIds,
    cancelMatchmaking,
    registrationReminderVisible,
    dismissRegistrationReminder,
    firstPlayerPackReminderVisible,
    dismissFirstPlayerPackReminder,
    profileRegisterIntent,
    requestProfileRegistration,
    clearProfileRegisterIntent,
  } = useBattleStore();

  const [previewHeadquartersId, setPreviewHeadquartersId] =
    useState<HeadquartersId | null>(null);
  const [previewDeck, setPreviewDeck] = useState<DeckPreviewState | null>(null);
  const [previewUnitCard, setPreviewUnitCard] = useState<TankCard | null>(null);
  // Applies the stage scale + rotation so the body-portaled HQ/deck/unit preview
  // renders like desktop and fits/rotates exactly like the rest of the game.
  const stageOverlayTransform = useStageOverlayTransform();
  const [editingDeck, setEditingDeck] = useState<SavedDeck | null>(null);
  const deckPreviewListRef = useRef<HTMLDivElement>(null);
  const deckPreviewDragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startScrollTop: number;
  } | null>(null);
  const [hoveredDeckOptionKey, setHoveredDeckOptionKey] = useState<
    string | null
  >(null);
  const [deckNationFilter, setDeckNationFilter] = useState<Nation | "all">(
    "all"
  );
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null);
  const [purchasingCampaignId, setPurchasingCampaignId] = useState<string | null>(
    null
  );
  // Triumphant card reveal played after a campaign reward is claimed, mirroring
  // the research tree celebration. Holds the card copies to fan out.
  const [rewardCelebration, setRewardCelebration] = useState<{
    id: number;
    cards: RewardCelebrationCard[];
    label: string;
  } | null>(null);
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const mainMenuCarouselRef = useRef<HTMLDivElement>(null);
  const headquartersCarouselRef = useRef<HTMLDivElement>(null);
  const campaignsCarouselRef = useRef<HTMLDivElement>(null);
  const tutorialCarouselRef = useRef<HTMLDivElement>(null);
  const missionsCarouselRef = useRef<HTMLDivElement>(null);
  const radioDuelsCarouselRef = useRef<HTMLDivElement>(null);
  const [, setProfileRevision] = useState(0);
  const [combatMissionNow, setCombatMissionNow] = useState(Date.now());
  const playerProgress = loadPlayerProgress();
  const [guestSessionReady, setGuestSessionReady] = useState(() =>
    window.localStorage.getItem(GUEST_SESSION_READY_KEY) === "true"
  );
  const profileConnection = useProfileConnection();
  const profileServerUnavailable = isProfileServerUnavailable(profileConnection);
  const profileServerReady = profileConnection.status === "online";
  const [supportOpen, setSupportOpen] = useState(false);
  const [radioDuels, setRadioDuels] = useState<RadioDuelListResult | null>(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);
  const [radioIntroVisible, setRadioIntroVisible] = useState(false);
  const [radioSearching, setRadioSearching] = useState(false);
  const [radioSearchDeckWeight, setRadioSearchDeckWeight] = useState<number | null>(null);
  const [radioMatchPreview, setRadioMatchPreview] = useState<RadioDuelOpenResult | null>(null);
  const radioMatchPreviewTimerRef = useRef<number | null>(null);
  const [radioNow, setRadioNow] = useState(Date.now());
  const [supportFeedback, setSupportFeedback] = useState<SupportFeedbackState>({
    contact: "",
    message: "",
    sending: false,
    sent: false,
    error: null,
  });

  useEffect(() => {
    void playMusic("main");
  }, []);

  async function refreshRadioDuels(): Promise<RadioDuelListResult | null> {
    if (!isRegisteredUserId()) return null;
    setRadioLoading(true);
    try {
      const result = await profileClient.listRadioDuels();
      setRadioDuels(result);
      setRadioError(null);
      return result;
    } catch (error) {
      setRadioError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setRadioLoading(false);
    }
  }

  function clearRadioMatchPreviewTimer() {
    if (radioMatchPreviewTimerRef.current === null) return;
    window.clearTimeout(radioMatchPreviewTimerRef.current);
    radioMatchPreviewTimerRef.current = null;
  }

  function showRadioMatchPreview(result: RadioDuelOpenResult) {
    clearRadioMatchPreviewTimer();
    setRadioSearching(false);
    setRadioMatchPreview(result);
    radioMatchPreviewTimerRef.current = window.setTimeout(() => {
      radioMatchPreviewTimerRef.current = null;
      setRadioMatchPreview(null);
      openRadioDuelBattle(result);
    }, 5_000);
  }

  useEffect(() => () => clearRadioMatchPreviewTimer(), []);

  async function enterRadioDuels() {
    if (radioLoading) return;
    if (!isRegisteredUserId()) {
      window.alert("Радиодуэли доступны только зарегистрированным игрокам.");
      requestProfileRegistration();
      openProfileMenu();
      return;
    }
    const firstVisit =
      window.localStorage.getItem("panzershrek.radioDuelIntroSeen") !== "true";
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    void enableRadioDuelPushNotifications().catch((error) => {
      console.warn("Unable to enable Android radio-duel push:", error);
    });

    // Resolve the destination before changing the menu. Opening the duel list
    // first made an empty carousel flash for one frame before the headquarters
    // selection appeared.
    const result = await refreshRadioDuels();
    if (!result) {
      openRadioDuelsMenu();
      return;
    }
    if (firstVisit) {
      openRadioDuelsMenu();
      setRadioIntroVisible(true);
      return;
    }
    if (result.games.length > 0) {
      setRadioSearching(false);
      openRadioDuelsMenu();
      return;
    }
    if (result.queue.queued) {
      setRadioSearching(true);
      openRadioDuelsMenu();
    } else {
      openHeadquartersMenu("radio");
    }
  }

  useEffect(() => {
    return profileClient.subscribeRadioDuels(() => {
      void profileClient.listRadioDuels().then((result) => {
        setRadioDuels(result);
        if (!radioSearching || result.games.length === 0) return;
        const newest = [...result.games].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (!newest) return;
        void profileClient.openRadioDuel(newest.id).then(showRadioMatchPreview);
      });
    });
  }, [radioSearching]);

  useEffect(() => {
    if (menuView !== "radioDuels") return;
    void refreshRadioDuels().then((result) => {
      if (!result || radioIntroVisible || radioSearching || result.games.length > 0) return;
      if (result.queue.queued) setRadioSearching(true);
      else openHeadquartersMenu("radio");
    });
    const timer = window.setInterval(() => void refreshRadioDuels(), 60_000);
    return () => window.clearInterval(timer);
  }, [menuView, radioIntroVisible, radioSearching]);

  useEffect(() => {
    if (menuView !== "radioDuels") return;
    setRadioNow(Date.now());
    const timer = window.setInterval(() => setRadioNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [menuView]);

  useEffect(() => {
    if (menuView !== "combatMissions") return;
    setCombatMissionNow(Date.now());
    const timer = window.setInterval(() => setCombatMissionNow(Date.now()), 1_000);
    const expiries = [
      playerProgress.combatMissions.daily?.expiresAt,
      playerProgress.combatMissions.weekly?.expiresAt,
    ].filter((value): value is number => typeof value === "number" && value > Date.now());
    const refreshTimer = expiries.length > 0
      ? window.setTimeout(async () => {
          await syncPlayerProgressFromServer();
          setProfileRevision((revision) => revision + 1);
        }, Math.max(1_000, Math.min(...expiries) - Date.now() + 500))
      : null;
    return () => {
      window.clearInterval(timer);
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
    };
  }, [
    menuView,
    playerProgress.combatMissions.daily?.periodKey,
    playerProgress.combatMissions.weekly?.periodKey,
  ]);

  useEffect(() => {
    if (menuView !== "main" || !guestSessionReady) return;

    let cancelled = false;
    const preloadTimer = window.setTimeout(() => {
      if (cancelled) return;

      void import("../assets/assetPreloader").then(
        ({ startMainMenuAssetPreload }) => {
          if (!cancelled) {
            startMainMenuAssetPreload();
          }
        }
      );
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(preloadTimer);
    };
  }, [guestSessionReady, menuView]);

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      syncPlayerProgressFromServer(),
      syncSavedDecksFromServer(),
    ]).then(([progressResult]) => {
      if (!cancelled) {
        if (progressResult.status === "fulfilled") {
          showDailyLoginRewardIfNew(progressResult.value);
        }
        setProfileRevision((revision) => revision + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function showDailyLoginRewardIfNew(progress: PlayerProgress) {
    const reward = progress.dailyLoginReward;
    if (!reward) return;
    if (getSeenDailyLoginRewardId() === reward.id) return;

    markDailyLoginRewardSeen(reward.id);
    setRewardCelebration({
      id: Date.now(),
      cards: [getDailyLoginRewardCelebration(reward, language)],
      label: language === "en" ? "Daily reward" : "Ежедневная награда",
    });
  }

  async function claimCampaignReward(rewardId: string) {
    if (!profileServerReady) {
      window.alert(t("common.profileServerUnavailable"));
      return;
    }

    setClaimingRewardId(rewardId);

    try {
      const nextProgress = await claimCampaignRewardFromServer(rewardId);

      if (nextProgress) {
        setProfileRevision((revision) => revision + 1);

        // Fan out the granted copies in the same triumphant reveal as the
        // research tree, captioned "Награда".
        const reward = getCampaignCompletionReward(rewardId);
        const rewardCard = reward ? getCardOrNull(reward.cardId) : null;
        if (reward && rewardCard) {
          setRewardCelebration({
            id: Date.now(),
            cards: Array.from({ length: Math.max(1, reward.copies) }, () => ({
              kind: "card",
              card: rewardCard,
            })),
            label: t("campaign.reward"),
          });
        }
      } else {
        window.alert(t("campaign.rewardClaimError"));
      }
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : t("campaign.rewardClaimError")
      );
    } finally {
      setClaimingRewardId(null);
    }
  }

  async function purchaseSelectedCampaign() {
    if (
      !missionCampaign?.premium ||
      !missionCampaign.paymentProductId ||
      !missionCampaign.priceRub
    ) {
      return;
    }
    if (missionCampaignAccessible || purchasingCampaignId) return;

    if (!profileServerReady) {
      window.alert(t("common.profileServerUnavailable"));
      return;
    }
    if (!isRegisteredUserId()) {
      window.alert(
        language === "en"
          ? "Sign in to purchase the campaign. An account e-mail is required for the receipt."
          : "Для покупки кампании войдите в аккаунт. E-mail аккаунта нужен для кассового чека."
      );
      requestProfileRegistration();
      openProfileMenu();
      return;
    }

    setPurchasingCampaignId(missionCampaign.id);
    try {
      const payment = await createGoldTracksPaymentOnServer(
        missionCampaign.paymentProductId
      );
      window.location.assign(payment.confirmationUrl);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : language === "en"
            ? "Could not unlock the campaign"
            : "Не удалось открыть кампанию"
      );
    } finally {
      setPurchasingCampaignId(null);
    }
  }

  async function retryProfileSync() {
    try {
      await retryProfileConnection();
      await Promise.allSettled([
        syncPlayerProgressFromServer(),
        syncSavedDecksFromServer(),
      ]);
      setProfileRevision((revision) => revision + 1);
    } catch {
      window.alert(t("common.profileServerUnavailable"));
    }
  }

  async function enterGuestSession(nickname: string, legalAccepted: boolean) {
    if (!legalAccepted) {
      throw new Error("Необходимо ознакомиться с документами и принять условия");
    }

    const nextProgress = await setPlayerNicknameOnServer(nickname);
    window.localStorage.setItem(GUEST_SESSION_READY_KEY, "true");
    window.localStorage.setItem(LEGAL_ACCEPTED_STORAGE_KEY, "true");
    setGuestSessionReady(true);
    if (nextProgress) {
      showDailyLoginRewardIfNew(nextProgress);
    }
    setProfileRevision((revision) => revision + 1);
  }

  function openSupportForm() {
    const userLogin = getCurrentUserLogin();
    setSupportFeedback((state) => ({
      ...state,
      contact: state.contact || userLogin || "",
      sent: false,
      error: null,
    }));
    setSupportOpen(true);
  }

  function closeSupportForm() {
    if (supportFeedback.sending) return;
    setSupportOpen(false);
  }

  async function sendSupportFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = supportFeedback.message.trim();
    if (message.length < 8) {
      setSupportFeedback((state) => ({
        ...state,
        error: t("support.describeMore"),
      }));
      return;
    }

    setSupportFeedback((state) => ({
      ...state,
      sending: true,
      sent: false,
      error: null,
    }));

    try {
      await submitSupportFeedback({
        playerId: getCurrentUserId(),
        nickname: getPlayerDisplayNickname(playerProgress, getCurrentUserLogin()),
        contact: supportFeedback.contact.trim(),
        message,
        pageUrl: window.location.href,
        userAgent: window.navigator.userAgent,
      });

      setSupportFeedback((state) => ({
        ...state,
        message: "",
        sending: false,
        sent: true,
        error: null,
      }));
    } catch (error) {
      setSupportFeedback((state) => ({
        ...state,
        sending: false,
        error:
          error instanceof Error
            ? error.message
            : t("support.sendFailed"),
      }));
    }
  }

  async function loginAccount(username: string, password: string) {
    const nextProgress = await loginPlayerAccount({
      username,
      password,
      mergeGuestProgress: false,
    });
    window.localStorage.setItem(GUEST_SESSION_READY_KEY, "true");
    setGuestSessionReady(true);
    showDailyLoginRewardIfNew(nextProgress);
    setProfileRevision((revision) => revision + 1);
  }

  async function registerAccount(
    username: string,
    email: string,
    password: string,
    legalAccepted: boolean,
    promoCode?: string
  ) {
    const nextProgress = await registerPlayerAccount({
      username,
      email,
      password,
      legalAccepted,
      promoCode,
      mergeGuestProgress: true,
    });
    window.localStorage.setItem(GUEST_SESSION_READY_KEY, "true");
    window.localStorage.setItem(LEGAL_ACCEPTED_STORAGE_KEY, "true");
    setGuestSessionReady(true);
    showDailyLoginRewardIfNew(nextProgress);
    setProfileRevision((revision) => revision + 1);
  }

  function renderProfileServerBanner() {
    if (!profileServerUnavailable) return null;

    return (
      <ProfileServerBanner onRetry={() => void retryProfileSync()} />
    );
  }

  const headquartersList = useMemo(
    () =>
      getDeckBuildingHeadquarters().filter((headquarters) =>
        playerProgress.unlockedHeadquartersIds.includes(headquarters.id)
      ),
    [playerProgress.unlockedHeadquartersIds]
  );
  // Campaigns shown in the selection menu (the auto-launched welcome trailer is
  // hidden from the list).
  const campaignMenuOrder = [
    "lavrinenko-ace",
    "raseiniai-kv",
    "first-panthers",
    "training-front",
  ];
  const visibleCampaigns = CAMPAIGNS.filter(
    (campaign) => !campaign.hiddenFromMenu
  ).sort((left, right) => {
    const leftIndex = campaignMenuOrder.indexOf(left.id);
    const rightIndex = campaignMenuOrder.indexOf(right.id);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
  const missionCampaign =
    visibleCampaigns.find(
      (campaign) => campaign.id === storedSelectedCampaignId
    ) ??
    visibleCampaigns[0] ??
    null;
  const missionCampaignAccessible = missionCampaign
    ? isCampaignAccessible(
        missionCampaign,
        playerProgress.unlockedCampaignIds
      )
    : false;
  const firstUnlockedMission =
    missionCampaign?.missions.find(
      (mission) =>
        isCampaignMissionUnlocked(
          missionCampaign,
          mission.id,
          completedCampaignMissionIds
        ) && !completedCampaignMissionIds.includes(mission.id)
    ) ??
    missionCampaign?.missions.find((mission) =>
      isCampaignMissionUnlocked(
        missionCampaign,
        mission.id,
        completedCampaignMissionIds
      )
    ) ??
    null;
  const selectedMission =
    missionCampaign?.missions.find((mission) => mission.id === selectedMissionId) ??
    firstUnlockedMission;

  // Campaign rewards earned within this campaign, and the first one still
  // waiting to be claimed. The carousel focuses (and the next mission is gated
  // on) that pending reward, so the player collects the prize before moving on.
  const campaignRewards = missionCampaign
    ? getCampaignCompletionRewardsForCampaign(missionCampaign)
    : [];
  const earnedCampaignRewardIds = new Set(
    getEarnedCampaignCompletionRewards(completedCampaignMissionIds).map(
      (reward) => reward.id
    )
  );
  const pendingCampaignReward = campaignRewards.find(
    (reward) =>
      earnedCampaignRewardIds.has(reward.id) &&
      !isCampaignRewardClaimed(playerProgress.claimedBattleRewardIds, reward.id)
  );
  // The carousel item centered when the missions screen opens: an unclaimed
  // reward takes priority, otherwise the next playable mission.
  const campaignFocusKey = pendingCampaignReward
    ? `reward-${pendingCampaignReward.id}`
    : firstUnlockedMission?.id ?? null;

  const pvpBusy =
    mode === "pvp" &&
    (pvpStatus === "connecting" ||
      pvpStatus === "searching" ||
      pvpStatus === "waiting" ||
      pvpStatus === "matched" ||
      pvpStatus === "matchPreview" ||
      pvpStatus === "rolling" ||
      pvpStatus === "error");
  const matchmakingAvatar =
    pvpBusy ? getHeadquartersAvatarAsset(selectedHeadquartersId) : null;

  const buttonsDisabled = pvpBusy || battleStarting;

  function getDeckOptionsForHeadquarters(headquartersId: HeadquartersId) {
    const savedDecks = loadSavedDecksForHeadquarters(headquartersId);
    const recentSelection = loadRecentDeckSelectionForHeadquarters(headquartersId);
    const headquarters = HEADQUARTERS[headquartersId];
    const defaultDeckCardIds = getDeckCardIds(headquarters.defaultDeckId);
    const defaultOption: BattleDeckOption = {
      id: null,
      name: t("battle.stockDeck"),
      cardIds: undefined,
      countLabel: `${defaultDeckCardIds.length}/${DECK_UNIT_LIMIT}`,
      weightLabel: `${getDefaultDeckWeight(headquartersId).totalWeight}`,
    };
    const customOptions = savedDecks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      cardIds: deck.cardIds,
      countLabel: `${deck.cardIds.length}/${DECK_UNIT_LIMIT}`,
      weightLabel: `${calculateDeckWeight(headquartersId, deck.cardIds).totalWeight}`,
      savedDeck: deck,
    }));

    if (!recentSelection || recentSelection.deckId === null) {
      return [
        defaultOption,
        ...customOptions,
      ];
    }

    const recentDeck = customOptions.find(
      (option) => option.id === recentSelection.deckId
    );
    if (!recentDeck) {
      return [
        defaultOption,
        ...customOptions,
      ];
    }

    return [
      recentDeck,
      defaultOption,
      ...customOptions.filter((option) => option.id !== recentDeck.id),
    ];
  }

  function startDeckForHeadquarters(
    headquartersId: HeadquartersId,
    deckId: string | null,
    deckCardIds?: string[]
  ) {
    if (buttonsDisabled) return;
    if (deckCardIds) {
      const validation = validateDeck(headquartersId, deckCardIds, playerProgress);
      if (!validation.valid) {
        window.alert(validation.message ?? t("common.invalidDeck"));
        return;
      }
    }

    setSelectedHeadquartersId(headquartersId);
    markRecentDeckSelection(headquartersId, deckId);

    if (mode === "pvp") {
      findPvpMatch(deckCardIds);
      return;
    }

    if (mode === "radio") {
      const deckWeight = deckCardIds
        ? calculateDeckWeight(headquartersId, deckCardIds).totalWeight
        : getDefaultDeckWeight(headquartersId).totalWeight;
      const knownGameIds = new Set(radioDuels?.games.map((duel) => duel.id) ?? []);
      setRadioSearchDeckWeight(deckWeight);
      setRadioSearching(true);
      openRadioDuelsMenu();
      setRadioLoading(true);
      void profileClient
        .queueRadioDuel(headquartersId, deckCardIds)
        .then(async (result) => {
          setRadioDuels(result);
          setRadioError(null);
          const matchedDuel = [...result.games]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .find((duel) => !knownGameIds.has(duel.id));
          if (!matchedDuel) return;
          showRadioMatchPreview(await profileClient.openRadioDuel(matchedDuel.id));
        })
        .catch((error) => {
          setRadioError(error instanceof Error ? error.message : String(error));
          setRadioSearching(false);
          openRadioDuelsMenu();
        })
        .finally(() => setRadioLoading(false));
      return;
    }

    startAiBattle(deckCardIds);
  }

  function openHeadquartersPreview(
    event: MouseEvent,
    headquartersId: HeadquartersId,
    deck?: BattleDeckOption
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (deck?.savedDeck) {
      setPreviewDeck({ headquartersId, deck });
      setPreviewHeadquartersId(null);
      return;
    }

    setPreviewDeck(null);
    setPreviewHeadquartersId(headquartersId);
  }

  function closeHeadquartersPreview() {
    setPreviewHeadquartersId(null);
    setPreviewDeck(null);
    setPreviewUnitCard(null);
  }

  function openPreviewUnitCard(event: MouseEvent, card: TankCard) {
    event.preventDefault();
    event.stopPropagation();
    setPreviewUnitCard(card);
  }

  async function deletePreviewDeck() {
    if (!previewDeck?.deck.savedDeck) return;

    if (!profileServerReady) {
      window.alert(
        profileServerUnavailable
          ? t("common.profileServerUnavailable")
          : t("common.profileSyncWait")
      );
      return;
    }

    const confirmed = window.confirm(
      `${t("battle.deleteDeckConfirm")} "${previewDeck.deck.name}"?`
    );
    if (!confirmed) return;

    try {
      await deleteCustomDeckFromServer(previewDeck.deck.savedDeck.id);
      deleteCustomDeck(previewDeck.deck.savedDeck.id);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Не удалось удалить колоду"
      );
      return;
    }
    closeHeadquartersPreview();
  }

  function editPreviewDeck() {
    if (!previewDeck?.deck.savedDeck) return;

    setEditingDeck(previewDeck.deck.savedDeck);
    closeHeadquartersPreview();
    openDeckBuilderMenu();
  }

  function openCreateDeckBuilder() {
    setEditingDeck(null);
    openDeckBuilderMenu();
  }

  function startDeckPreviewScroll(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const list = deckPreviewListRef.current;
    if (!list) return;

    deckPreviewDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollTop: list.scrollTop,
    };
    list.setPointerCapture(event.pointerId);
  }

  function moveDeckPreviewScroll(event: PointerEvent<HTMLDivElement>) {
    const state = deckPreviewDragRef.current;
    const list = deckPreviewListRef.current;
    if (!state?.active || !list || state.pointerId !== event.pointerId) return;

    // Convert the screen-space finger movement into the stage's own axes so a
    // swipe along the list's visual vertical scrolls it even when the stage is
    // rotated 90° on a portrait phone.
    const { y: distance } = screenDeltaToStage(
      event.clientX - state.startX,
      event.clientY - state.startY
    );
    list.scrollTop = state.startScrollTop - distance;
  }

  function stopDeckPreviewScroll(event: PointerEvent<HTMLDivElement>) {
    const state = deckPreviewDragRef.current;
    const list = deckPreviewListRef.current;
    if (!state?.active || !list || state.pointerId !== event.pointerId) return;

    if (list.hasPointerCapture(event.pointerId)) {
      list.releasePointerCapture(event.pointerId);
    }

    deckPreviewDragRef.current = null;
  }

  function openSelectedCampaign(campaignId: string) {
    const campaign = CAMPAIGNS.find((item) => item.id === campaignId);
    if (!campaign) return;

    const firstAvailableMission =
      campaign.missions.find(
        (mission) =>
          isCampaignMissionUnlocked(
            campaign,
            mission.id,
            completedCampaignMissionIds
          ) && !completedCampaignMissionIds.includes(mission.id)
      ) ??
      campaign.missions.find((mission) =>
        isCampaignMissionUnlocked(
          campaign,
          mission.id,
          completedCampaignMissionIds
        )
      );

    setSelectedMissionId(firstAvailableMission?.id ?? "");
    openCampaignMissions(campaign.id);
  }

  function selectMission(missionId: string) {
    if (buttonsDisabled) return;
    if (!missionCampaign) return;
    if (!missionCampaignAccessible) return;
    if (
      !isCampaignMissionUnlocked(
        missionCampaign,
        missionId,
        completedCampaignMissionIds
      )
    ) {
      return;
    }

    setSelectedMissionId(missionId);
    startCampaignMission(missionId);
  }

  async function openCombatMissions() {
    openCombatMissionsMenu();
    await syncPlayerProgressFromServer();
    setProfileRevision((revision) => revision + 1);
  }

  function closeHeadquartersSelection() {
    if (mode === "radio" && (radioDuels?.games.length ?? 0) === 0) {
      setRadioSearching(false);
      closeRadioDuelsMenu();
      return;
    }
    closeHeadquartersMenu();
  }

  function closeNativeBackTarget(target: MainMenuView) {
    switch (target) {
      case "main":
        if (menuView === "missions") {
          closeCampaignMenu();
        } else if (menuView === "deckBuilder") {
          closeHeadquartersMenu();
        } else if (menuView === "headquarters") {
          closeHeadquartersSelection();
        } else if (menuView === "campaign") {
          closeCampaignMenu();
        } else if (menuView === "tutorial") {
          closeTutorialMenu();
        } else if (menuView === "combatMissions") {
          closeCombatMissionsMenu();
        } else if (menuView === "radioDuels") {
          setRadioSearching(false);
          closeRadioDuelsMenu();
        } else if (menuView === "profile") {
          closeProfileMenu();
        } else if (menuView === "research") {
          closeResearchMenu();
        } else if (menuView === "collection") {
          closeCollectionMenu();
        } else if (menuView === "shop") {
          closeShopMenu();
        } else if (menuView === "exchange") {
          closeExchangeMenu();
        }
        return;
      case "campaign":
        closeCampaignMissions();
        return;
      case "headquarters":
        closeDeckBuilderMenu();
        return;
      default:
        return;
    }
  }

  function handleNativeAndroidBack() {
    if (rewardCelebration) {
      setRewardCelebration(null);
      return;
    }

    if (previewUnitCard) {
      setPreviewUnitCard(null);
      return;
    }

    if (previewHeadquartersId || previewDeck) {
      closeHeadquartersPreview();
      return;
    }

    if (supportOpen) {
      setSupportOpen(false);
      return;
    }

    const target = getNativeBackTarget(menuView);
    if (target) {
      closeNativeBackTarget(target);
    }
  }

  useEffect(() => {
    if (!isNativeMobileApp()) return;

    window.addEventListener("panzershrekAndroidBack", handleNativeAndroidBack);
    return () =>
      window.removeEventListener(
        "panzershrekAndroidBack",
        handleNativeAndroidBack
      );
  }, [
    menuView,
    previewDeck,
    previewHeadquartersId,
    previewUnitCard,
    rewardCelebration,
    supportOpen,
  ]);

  useEffect(() => {
    if (!previewHeadquartersId && !previewDeck && !previewUnitCard) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (previewUnitCard) {
          setPreviewUnitCard(null);
          return;
        }

        closeHeadquartersPreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewDeck, previewHeadquartersId, previewUnitCard]);

  useEffect(() => {
    if (menuView !== "headquarters") return;

    const frameId = window.requestAnimationFrame(() => {
      if (headquartersCarouselRef.current) {
        headquartersCarouselRef.current.scrollLeft = 0;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [menuView, mode]);

  // Center the next playable mission (or an unclaimed reward) when the missions
  // screen opens — after a battle's result screen, or when navigating in from
  // another screen. Also pre-selects that next mission for the selection glow.
  useEffect(() => {
    if (menuView !== "missions") return;

    if (!pendingCampaignReward && firstUnlockedMission) {
      setSelectedMissionId(firstUnlockedMission.id);
    }

    const frameId = window.requestAnimationFrame(() => {
      focusTargetRef.current?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuView, campaignFocusKey]);

  const previewHeadquarters = previewDeck
    ? HEADQUARTERS[previewDeck.headquartersId]
    : previewHeadquartersId
      ? HEADQUARTERS[previewHeadquartersId]
      : null;
  const previewDeckCards = previewDeck?.deck.cardIds
    ? getGroupedDeckCards(previewDeck.deck.cardIds)
    : [];
  const previewDeckIsCustom = Boolean(previewDeck?.deck.savedDeck);

  // Standalone enlarged card preview (e.g. campaign reward cards opened via
  // right-click) that is not part of the headquarters/deck preview flow.
  const standaloneUnitCardPreview = createPortal(
    <AnimatePresence>
      {previewUnitCard && !previewHeadquarters ? (
        <motion.div
          style={styles.cardPreviewOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={() => setPreviewUnitCard(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setPreviewUnitCard(null);
          }}
        >
          <div
            style={{
              ...stageOverlayTransform,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <motion.div
              style={styles.unitCardPreviewPanel}
              initial={{ opacity: 0, scale: 0.84, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => {
                event.preventDefault();
                setPreviewUnitCard(null);
              }}
            >
              <CardKeywordsPanel keywords={getCardKeywords(previewUnitCard, language)} />

              <button
                type="button"
                style={styles.cardPreviewClose}
                onClick={() => setPreviewUnitCard(null)}
                aria-label={t("battle.closeCardPreview")}
              >
                ×
              </button>
              <HandCardView
                card={previewUnitCard}
                ownerId="player"
                displayMode="preview"
              />
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );

  const rewardCelebrationOverlay = (
    <AnimatePresence>
      {rewardCelebration ? (
        <RewardCelebrationOverlay
          key={rewardCelebration.id}
          cards={rewardCelebration.cards}
          label={rewardCelebration.label}
          tone="reward"
          onClose={() => setRewardCelebration(null)}
        />
      ) : null}
    </AnimatePresence>
  );

  const unorderedBattleDeckOptions = headquartersList.flatMap((headquarters) => {
    const headquartersId = headquarters.id as HeadquartersId;
    const nation = HEADQUARTERS[headquartersId].nation;

    return getDeckOptionsForHeadquarters(headquartersId).map((deck) => ({
      headquarters,
      headquartersId,
      nation,
      deck,
      optionKey: `${headquartersId}-${deck.id ?? "default"}`,
    }));
  });

  const mostRecentDeckSelection = loadMostRecentDeckSelection();
  const mostRecentOptionKey = mostRecentDeckSelection
    ? `${mostRecentDeckSelection.headquartersId}-${mostRecentDeckSelection.deckId ?? "default"}`
    : null;
  const mostRecentOptionIndex = mostRecentOptionKey
    ? unorderedBattleDeckOptions.findIndex(
        (option) => option.optionKey === mostRecentOptionKey
      )
    : -1;
  const battleDeckOptions =
    mostRecentOptionIndex > 0
      ? [
          unorderedBattleDeckOptions[mostRecentOptionIndex],
          ...unorderedBattleDeckOptions.filter(
            (_, index) => index !== mostRecentOptionIndex
          ),
        ]
      : unorderedBattleDeckOptions;

  const availableDeckNations = NATION_FILTER_VALUES.filter((nation) =>
    battleDeckOptions.some((option) => option.nation === nation)
  );

  const filteredDeckOptions =
    deckNationFilter === "all"
      ? battleDeckOptions
      : battleDeckOptions.filter(
          (option) => option.nation === deckNationFilter
        );

  if (!guestSessionReady && menuView === "main" && mode !== "pvp") {
    return (
      <GuestEntryScreen
        initialNickname={playerProgress.nickname}
        profileUnavailable={profileServerUnavailable}
        onRetryProfile={() => void retryProfileSync()}
        onEnter={enterGuestSession}
        onLogin={loginAccount}
        onRegister={registerAccount}
      />
    );
  }

  if (menuView === "headquarters" && pvpBusy) {
    return (
      <PvpMatchmakingScreen
        playerHeadquartersId={selectedHeadquartersId}
        playerNickname={getPlayerDisplayNickname(
          playerProgress,
          getCurrentUserLogin()
        )}
        playerDeckWeight={pvpPlayerDeckWeight}
        opponentHeadquartersId={pvpOpponentHeadquartersId}
        opponentNickname={pvpOpponentNickname}
        opponentDeckWeight={pvpOpponentDeckWeight}
        previewLabel={pvpMatchPreviewLabel}
        status={pvpStatus}
        error={pvpError}
        searchDeadlineAt={pvpSearchDeadlineAt}
        onCancel={cancelMatchmaking}
        onRetry={retryPvpMatchmaking}
        onFallback={startPvpFallbackAiBattle}
      />
    );
  }

  if (menuView === "campaign") {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />
        <PlayerAccountPanel onOpenProfile={openProfileMenu} />
        <PlayerResourcesPanel
          onOpenShop={openShopMenu}
          onOpenExchange={openExchangeMenu}
        />
        {renderProfileServerBanner()}

        <section style={{ ...styles.menuLayer, ...styles.mainMenuLayer }}>
          <header style={styles.header}>
            <h1 style={styles.title}>{t("battle.selectCompany")}</h1>
          </header>

          <CarouselTapFrame
            viewportRef={campaignsCarouselRef}
            viewportStyle={styles.carouselViewport}
            ariaLabel={t("battle.selectCompany")}
          >
            <div style={styles.campaignCarouselTrack}>
              {visibleCampaigns.map((campaign, index) => {
                const artUrl =
                  campaign.menuArtUrl ??
                  `/ui/menu/campaign-${index + 1}-panzer-div.webp`;
                const campaignTitle = getLocalizedCampaignTitle(campaign, language);

                return (
                  <motion.button
                    key={campaign.id}
                    type="button"
                    style={styles.campaignCardOption}
                    onClick={() => openSelectedCampaign(campaign.id)}
                    whileHover={{ y: -8, scale: 1.035 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 360, damping: 28 }}
                    aria-label={`${t("battle.selectCompany")}: ${campaignTitle}`}
                  >
                    <div
                      style={{
                        ...styles.campaignArtCard,
                        backgroundImage: `linear-gradient(180deg, rgba(8, 9, 7, 0.04), rgba(0, 0, 0, 0.25)), url('${artUrl}')`,
                      }}
                    >
                      {campaign.premium ? (
                        <span
                          style={{
                            position: "absolute",
                            top: "0.6cqh",
                            right: "0.6cqw",
                            padding: "0.3cqh 0.8cqw",
                            borderRadius: "0.6cqw",
                            background:
                              "linear-gradient(180deg, #f6d365, #c9971f)",
                            color: "#241a04",
                            fontSize: "1.6cqh",
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            boxShadow: "0 0.3cqh 0.9cqh rgba(0,0,0,0.45)",
                          }}
                        >
                          {t("campaign.premiumBadge")}
                        </span>
                      ) : null}
                      <span style={styles.campaignArtLabel}>{campaignTitle}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </CarouselTapFrame>


          <div style={styles.menuActionsRow}>
            <button type="button" style={styles.backButton} onClick={closeCampaignMenu}>
              {t("common.back")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (menuView === "missions" && missionCampaign) {
    // Index of the last mission a reward depends on — the reward card is shown
    // right after that mission in the carousel.
    const getRewardGatingMissionIndex = (reward: CampaignCompletionReward) =>
      Math.max(
        ...reward.missionIds.map((missionId) =>
          missionCampaign.missions.findIndex((item) => item.id === missionId)
        )
      );

    const renderCampaignRewardCard = (reward: CampaignCompletionReward) => {
      const rewardCard = getCardOrNull(reward.cardId);
      if (!rewardCard) return null;

      const rewardUnlocked = earnedCampaignRewardIds.has(reward.id);
      const rewardClaimed = isCampaignRewardClaimed(
        playerProgress.claimedBattleRewardIds,
        reward.id
      );
      const claiming = claimingRewardId === reward.id;
      const requiredMissionLabel = String(
        getRewardGatingMissionIndex(reward) + 1
      ).padStart(2, "0");
      const cardLabel =
        reward.copies > 1
          ? `${rewardCard.name} ×${reward.copies}`
          : rewardCard.name;
      const canClaim =
        missionCampaignAccessible && rewardUnlocked && !rewardClaimed;
      const isFocusTarget = `reward-${reward.id}` === campaignFocusKey;
      const tooltip = rewardClaimed
        ? `${t("campaign.rewardReceived")}: ${cardLabel}`
        : rewardUnlocked
          ? claiming
            ? t("campaign.rewardClaiming")
            : `${t("campaign.rewardClaim")}: ${cardLabel}`
          : `${t("campaign.rewardLocked")} ${requiredMissionLabel}: ${cardLabel}`;
      const captionText = rewardClaimed
        ? t("campaign.rewardReceived")
        : canClaim
          ? claiming
            ? t("campaign.rewardClaiming")
            : t("campaign.rewardClaim")
          : t("campaign.rewardLocked");

      return (
        <motion.div
          key={`reward-${reward.id}`}
          ref={(el) => {
            if (isFocusTarget) focusTargetRef.current = el;
          }}
          style={styles.rewardCardColumn}
          title={tooltip}
          aria-label={tooltip}
          role={canClaim ? "button" : undefined}
          onClick={
            canClaim && !claiming
              ? () => void claimCampaignReward(reward.id)
              : undefined
          }
          onContextMenu={(event) => openPreviewUnitCard(event, rewardCard)}
          animate={
            canClaim
              ? { scale: [1, 1.045, 1] }
              : { scale: 1 }
          }
          transition={
            canClaim
              ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        >
          <div
            style={{
              ...styles.rewardCardSlot,
              ...(missionCampaignAccessible && rewardUnlocked
                ? {}
                : styles.rewardCardSlotLocked),
              ...(canClaim ? styles.rewardCardSlotClaimable : {}),
            }}
          >
            <HandCardView
              card={rewardCard}
              ownerId="player"
              cardScale={MISSION_REWARD_CARD_WIDTH / HAND_CARD_BASE_WIDTH}
            />
            {reward.copies > 1 ? (
              <span style={styles.rewardCopiesBadge}>×{reward.copies}</span>
            ) : null}
          </div>
          <span
            style={{
              ...styles.rewardCaption,
              ...(canClaim ? styles.rewardCaptionClaim : {}),
              ...(rewardClaimed ? styles.rewardCaptionClaimed : {}),
            }}
          >
            {captionText}
          </span>
        </motion.div>
      );
    };

    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />
        <PlayerAccountPanel onOpenProfile={openProfileMenu} />
        <PlayerResourcesPanel
          onOpenShop={openShopMenu}
          onOpenExchange={openExchangeMenu}
        />
        {renderProfileServerBanner()}

        <section
          style={{
            ...styles.menuLayer,
            ...(!missionCampaignAccessible && missionCampaign.premium
              ? styles.premiumCampaignMissionsLayer
              : {}),
          }}
        >
          <header
            style={{
              ...styles.header,
              ...(!missionCampaignAccessible && missionCampaign.premium
                ? styles.premiumCampaignHeader
                : {}),
            }}
          >
            <div style={styles.kicker}>{t("battle.selectOperation")}</div>
            <h1
              style={{
                ...styles.title,
                ...(!missionCampaignAccessible && missionCampaign.premium
                  ? styles.premiumCampaignTitle
                  : {}),
              }}
            >
              {getLocalizedCampaignTitle(missionCampaign, language)}
            </h1>
            <p
              style={{
                ...styles.subtitle,
                ...(!missionCampaignAccessible && missionCampaign.premium
                  ? styles.premiumCampaignSubtitle
                  : {}),
              }}
            >
              {getLocalizedCampaignDescription(missionCampaign, language)}
            </p>
          </header>

          <CarouselTapFrame
            viewportRef={missionsCarouselRef}
            viewportStyle={{
              ...styles.missionCarouselViewport,
              ...(!missionCampaignAccessible && missionCampaign.premium
                ? styles.premiumMissionCarouselViewport
                : {}),
            }}
            ariaLabel={t("battle.selectOperation")}
          >
            <div style={styles.missionCarouselTrack}>
              {missionCampaign.missions.map((mission, index) => {
                const missionTitle = getLocalizedMissionTitle(mission, language);
                const missionChapter = getLocalizedMissionChapter(mission, language);
                const missionDescription = getLocalizedMissionDescription(
                  mission,
                  language
                );
                const available = mission.available !== false;
                const unlocked = isCampaignMissionUnlocked(
                  missionCampaign,
                  mission.id,
                  completedCampaignMissionIds
                );
                const completed = completedCampaignMissionIds.includes(mission.id);
                // A mission is held back until the prize from the previous
                // mission is collected: an earned-but-unclaimed reward gated on
                // mission `index - 1` blocks entry to mission `index`.
                const rewardLocked = campaignRewards.some(
                  (reward) =>
                    getRewardGatingMissionIndex(reward) === index - 1 &&
                    earnedCampaignRewardIds.has(reward.id) &&
                    !isCampaignRewardClaimed(
                      playerProgress.claimedBattleRewardIds,
                      reward.id
                    )
                );
                const playable =
                  missionCampaignAccessible &&
                  available &&
                  unlocked &&
                  !rewardLocked;
                const selected = mission.id === selectedMission?.id;
                const isFocusTarget = mission.id === campaignFocusKey;
                const missionIllustration =
                  getMissionIllustrationAsset(mission.illustrationId) ??
                  "/menu-background.webp";
                const rewardsAfterMission = campaignRewards.filter(
                  (reward) => getRewardGatingMissionIndex(reward) === index
                );

                return [
                  <motion.button
                    key={mission.id}
                    ref={(el) => {
                      if (isFocusTarget) focusTargetRef.current = el;
                    }}
                    type="button"
                    style={{
                      ...styles.missionCardOption,
                      ...(playable ? {} : styles.missionCardOptionLocked),
                    }}
                    disabled={!playable}
                    onClick={() => selectMission(mission.id)}
                    whileHover={playable ? { y: -8, scale: 1.025 } : undefined}
                    whileTap={playable ? { scale: 0.985 } : undefined}
                    transition={{ type: "spring", stiffness: 360, damping: 28 }}
                    aria-pressed={selected}
                    aria-label={`${t("battle.selectOperation")}: ${missionTitle}`}
                  >
                    <div
                      style={{
                        ...styles.selectionGlow,
                        ...(selected ? styles.selectionGlowVisible : {}),
                      }}
                    />

                    <div
                      style={{
                        ...styles.missionArtCard,
                        ...(completed ? styles.missionArtCardCompleted : {}),
                        ...(selected ? styles.missionArtCardSelected : {}),
                        ...(!playable ? styles.missionArtCardLocked : {}),
                      }}
                    >
                      <div
                        style={{
                          ...styles.missionArtImage,
                          backgroundImage: `linear-gradient(180deg, rgba(8, 9, 7, 0.02), rgba(0, 0, 0, 0.72)), url('${missionIllustration}')`,
                        }}
                      />
                      <div style={styles.missionImageHud}>
                        <span style={styles.missionNumberLabel}>
                          {t("campaign.operation")} {String(index + 1).padStart(2, "0")}
                        </span>
                        <span
                          style={{
                            ...styles.missionStatusChip,
                            ...(completed
                              ? styles.missionStatusChipCompleted
                              : playable
                                ? styles.missionStatusChipAvailable
                                : styles.missionStatusChipLocked),
                          }}
                        >
                          <span style={styles.missionStatusMark}>
                            {completed ? "✓" : playable ? "●" : "—"}
                          </span>
                          {completed
                            ? t("campaign.completed")
                            : !missionCampaignAccessible
                              ? t("campaign.premiumBadge")
                            : playable
                              ? t("campaign.available")
                              : t("campaign.rewardLocked")}
                        </span>
                      </div>
                      <div style={styles.missionArtContent}>
                        <span style={styles.missionChapter}>{missionChapter}</span>
                        <span style={styles.missionTitle}>{missionTitle}</span>
                        <span style={styles.missionDescription}>
                          {missionDescription}
                        </span>
                        <span
                          style={{
                            ...styles.missionActionBar,
                            ...(playable ? styles.missionActionBarPlayable : {}),
                            ...(completed ? styles.missionActionBarCompleted : {}),
                          }}
                        >
                          <span>
                            {completed && playable
                              ? language === "en" ? "Replay mission" : "Переиграть"
                              : playable
                                ? language === "en" ? "Start operation" : "Начать операцию"
                                : !missionCampaignAccessible
                                  ? language === "en" ? "Purchase campaign" : "Купить кампанию"
                                : !available
                                  ? t("campaign.soon")
                                  : rewardLocked
                                    ? t("campaign.claimReward")
                                    : t("campaign.rewardLocked")}
                          </span>
                          {playable ? <span style={styles.missionActionArrow}>›</span> : null}
                        </span>
                      </div>
                    </div>
                  </motion.button>,
                  ...rewardsAfterMission.map((reward) =>
                    renderCampaignRewardCard(reward)
                  ),
                ];
              })}
            </div>
          </CarouselTapFrame>

          <div
            style={{
              ...styles.menuActionsRow,
              ...(!missionCampaignAccessible && missionCampaign.premium
                ? styles.campaignPurchaseActionsRow
                : {}),
            }}
          >
            {!missionCampaignAccessible &&
            missionCampaign.premium &&
            missionCampaign.paymentProductId &&
            missionCampaign.priceRub ? (
              <button
                type="button"
                style={styles.campaignPurchaseButton}
                disabled={purchasingCampaignId === missionCampaign.id}
                onClick={() => void purchaseSelectedCampaign()}
              >
                <span>
                  {purchasingCampaignId === missionCampaign.id
                    ? language === "en"
                      ? "Opening payment…"
                      : "Переход к оплате…"
                    : language === "en"
                      ? "Unlock campaign"
                      : "Купить кампанию"}
                </span>
                <strong style={styles.campaignPurchasePrice}>
                  {missionCampaign.priceRub} ₽
                </strong>
              </button>
            ) : null}
            <button
              type="button"
              style={{
                ...styles.backButton,
                ...(!missionCampaignAccessible && missionCampaign.premium
                  ? styles.campaignPurchaseBackButton
                  : {}),
              }}
              onClick={closeCampaignMissions}
            >
              {t("common.back")}
            </button>
          </div>
        </section>
        {standaloneUnitCardPreview}
        {rewardCelebrationOverlay}
      </main>
    );
  }

  if (menuView === "research") {
    return (
      <Suspense fallback={<MenuChunkLoadingScreen />}>
        <ResearchMenu onBack={closeResearchMenu} />
      </Suspense>
    );
  }

  if (menuView === "collection") {
    return (
      <Suspense fallback={<MenuChunkLoadingScreen />}>
        <CardCollectionMenu onBack={closeCollectionMenu} />
      </Suspense>
    );
  }

  if (menuView === "profile") {
    return (
      <>
        <PlayerProfileMenu
          onBack={closeProfileMenu}
          onProfileChanged={() => setProfileRevision((revision) => revision + 1)}
          onDailyLoginReward={showDailyLoginRewardIfNew}
          openRegisterOnMount={profileRegisterIntent}
          onRegisterIntentConsumed={clearProfileRegisterIntent}
        />
        {rewardCelebrationOverlay}
      </>
    );
  }

  if (menuView === "shop") {
    return (
      <ShopMenu
        onBack={closeShopMenu}
        onProfileChanged={() => setProfileRevision((revision) => revision + 1)}
      />
    );
  }

  if (menuView === "exchange") {
    return (
      <ExchangeMenu
        onBack={closeExchangeMenu}
        onOpenShop={openShopMenu}
        onProfileChanged={() => setProfileRevision((revision) => revision + 1)}
      />
    );
  }

  if (menuView === "deckBuilder") {
    return (
      <Suspense fallback={<MenuChunkLoadingScreen />}>
        <DeckBuilder
          editingDeck={editingDeck}
          onBack={closeDeckBuilderMenu}
          onSaved={() => {
            setEditingDeck(null);
            closeHeadquartersMenu();
          }}
        />
      </Suspense>
    );
  }

  if (menuView === "tutorial") {
    // Старый флаг профиля «обучение пройдено» засчитывает первый урок, чтобы
    // ветераны не проходили основы заново ради разблокировки новых миссий.
    const completedTutorialIds =
      playerProgress.tutorialCompleted &&
      !completedTutorialMissionIds.includes("training")
        ? [...completedTutorialMissionIds, "training"]
        : completedTutorialMissionIds;
    const nextMissionId = TUTORIAL_MISSIONS.find(
      (mission) =>
        !completedTutorialIds.includes(mission.id) &&
        isTutorialMissionUnlocked(mission.id, completedTutorialIds)
    )?.id;

    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />
        <PlayerAccountPanel onOpenProfile={openProfileMenu} />
        <PlayerResourcesPanel
          onOpenShop={openShopMenu}
          onOpenExchange={openExchangeMenu}
        />
        {renderProfileServerBanner()}

        <section style={{ ...styles.menuLayer, ...styles.mainMenuLayer }}>
          <header style={{ ...styles.header, ...styles.mainMenuHeader }}>
            <h1 style={styles.title}>{t("tutorial.selectMission")}</h1>
          </header>

          <CarouselTapFrame
            viewportRef={tutorialCarouselRef}
            viewportStyle={{
              ...styles.carouselViewport,
              ...styles.tutorialCarouselViewport,
            }}
            ariaLabel={t("tutorial.selectMission")}
            hideArrows
          >
            <div style={{ ...styles.mainMenuTrack, ...styles.tutorialMenuTrack }}>
              {TUTORIAL_MISSIONS.map((mission, index) => {
                const unlocked = isTutorialMissionUnlocked(
                  mission.id,
                  completedTutorialIds
                );
                const missionTitle =
                  language === "en" ? mission.titleEn : mission.title;
                const missionDescription =
                  language === "en"
                    ? mission.descriptionEn
                    : mission.description;
                const missionImageSrc = `/ui/menu/tutorial/${mission.id}.webp`;

                return (
                  <motion.button
                    key={mission.id}
                    type="button"
                    className={
                      mission.id === nextMissionId
                        ? "main-menu-tutorial-pulse"
                        : undefined
                    }
                    style={{
                      ...styles.campaignEntryOption,
                      ...styles.tutorialEntryOption,
                      ...(unlocked ? {} : styles.tutorialMissionLocked),
                    }}
                    disabled={!unlocked || battleStarting}
                    onClick={() => {
                      if (unlocked) startTutorial(mission.id);
                    }}
                    whileHover={unlocked ? { y: -8, scale: 1.035 } : undefined}
                    whileTap={unlocked ? { scale: 0.985 } : undefined}
                    transition={{ type: "spring", stiffness: 360, damping: 28 }}
                    aria-label={`${t("tutorial.lesson")} ${index + 1}: ${missionTitle}`}
                  >
                    <div style={{ ...styles.campaignEntryCard, ...styles.tutorialEntryCard }}>
                      <img
                        src={missionImageSrc}
                        alt=""
                        draggable={false}
                        onError={(event) =>
                          usePngFallback(event, "/ui/menu/education.webp")
                        }
                        style={styles.campaignEntryImage}
                      />
                      <span style={styles.tutorialLessonNumber}>
                        {t("tutorial.lesson")} {index + 1}
                      </span>
                      {!unlocked ? (
                        <span style={styles.tutorialLockIcon} aria-hidden="true">
                          🔒
                        </span>
                      ) : null}
                      <span style={styles.tutorialMissionHint}>
                        {unlocked ? missionDescription : t("tutorial.locked")}
                      </span>
                      <span
                        style={{
                          ...styles.campaignEntryTitleOverlay,
                          ...styles.tutorialMissionTitleOverlay,
                        }}
                      >
                        {missionTitle}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </CarouselTapFrame>

          <div style={{ ...styles.menuActionsRow, ...styles.tutorialActionsRow }}>
            <button
              type="button"
              style={styles.backButton}
              onClick={closeTutorialMenu}
            >
              {t("common.back")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (menuView === "combatMissions") {
    const renderMissionGroup = (
      label: string,
      set: PlayerProgress["combatMissions"]["daily"]
    ) => (
      <section style={{ flex: "1 1 0", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginBottom: 10 }}>
          <h2 style={{ margin: 0, color: "#f1d6a1", fontSize: 24, textTransform: "uppercase" }}>{label}</h2>
          <span style={{ color: "#c9b78f", fontSize: 14 }}>
            {language === "en" ? "Refresh in" : "Обновление через"}: {set ? formatMissionCountdown(set.expiresAt, combatMissionNow) : "—"}
          </span>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {set?.missions.map((mission) => {
            const task = getCombatMissionDefinition(mission.id);
            if (!task) return null;
            const complete = mission.completedAt != null;
            const progress = Math.min(task.target, mission.progress);
            return (
              <article key={mission.id} style={{ padding: "14px 16px", border: `1px solid ${complete ? "#af914a" : "rgba(205,184,139,.36)"}`, borderRadius: 8, background: complete ? "linear-gradient(135deg,rgba(91,78,37,.86),rgba(31,37,35,.94))" : "rgba(19,27,28,.9)", boxShadow: "0 8px 20px rgba(0,0,0,.28)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <strong style={{ display: "block", color: "#fff1cc", fontSize: 18 }}>{task.title[language]}</strong>
                    <span style={{ color: "#d0d2ca", fontSize: 14 }}>
                      {task.description[language]}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#f2d67e", whiteSpace: "nowrap", fontWeight: 800 }}>
                    <img src={silverTracksIcon} alt="" style={{ width: 27, height: 27, objectFit: "contain" }} />
                    +{task.reward}
                  </div>
                </div>
                <div style={{ height: 9, marginTop: 12, borderRadius: 99, overflow: "hidden", background: "rgba(0,0,0,.52)", border: "1px solid rgba(255,255,255,.12)" }}>
                  <div style={{ width: `${Math.min(100, (progress / task.target) * 100)}%`, height: "100%", background: complete ? "linear-gradient(90deg,#b89336,#f0d878)" : "linear-gradient(90deg,#566f51,#8eaa72)", transition: "width .3s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: complete ? "#f0d878" : "#c9c9bf", fontSize: 13, fontWeight: 700 }}>
                  <span>{progress} / {task.target}</span>
                  <span>{complete ? (language === "en" ? "REWARD RECEIVED" : "НАГРАДА ПОЛУЧЕНА") : ""}</span>
                </div>
              </article>
            );
          }) ?? (
            <div style={{ padding: 30, color: "#d8c9a8", textAlign: "center" }}>
              {language === "en" ? "Connecting to the profile server…" : "Получаем задачи с сервера…"}
            </div>
          )}
        </div>
      </section>
    );

    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />
        <PlayerAccountPanel onOpenProfile={openProfileMenu} />
        <PlayerResourcesPanel onOpenShop={openShopMenu} onOpenExchange={openExchangeMenu} />
        {renderProfileServerBanner()}
        <section style={{ ...styles.menuLayer, padding: "72px 5vw 28px", overflowY: "auto" }}>
          <header style={{ textAlign: "center", marginBottom: 20 }}>
            <h1 style={{ ...styles.title, marginBottom: 4 }}>{language === "en" ? "COMBAT MISSIONS" : "БОЕВЫЕ ЗАДАЧИ"}</h1>
            <p style={{ margin: 0, color: "#c9b78f" }}>{language === "en" ? "Complete missions to earn iron tracks" : "Выполняйте задачи и получайте железные траки"}</p>
          </header>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24, maxWidth: 1180, width: "100%", margin: "0 auto" }}>
            {renderMissionGroup(language === "en" ? "Daily" : "Ежедневные", playerProgress.combatMissions.daily)}
            {renderMissionGroup(language === "en" ? "Weekly" : "Еженедельные", playerProgress.combatMissions.weekly)}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", maxWidth: 1180, width: "100%", margin: "20px auto 0" }}>
            <button
              type="button"
              style={{ ...styles.backButton, width: 170, padding: "7px 14px 9px", fontSize: 13 }}
              onClick={closeCombatMissionsMenu}
            >
              {t("common.back")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (menuView === "radioDuels" && radioMatchPreview) {
    const duel = radioMatchPreview.duel;
    return (
      <PvpMatchmakingScreen
        playerHeadquartersId={duel.myHeadquartersId}
        playerNickname={duel.myNickname}
        playerDeckWeight={duel.myDeckWeight}
        opponentHeadquartersId={duel.opponentHeadquartersId}
        opponentNickname={duel.opponentNickname}
        opponentDeckWeight={duel.opponentDeckWeight}
        previewLabel={null}
        status="matchPreview"
        error={null}
        searchDeadlineAt={null}
        title="ПРОТИВНИК НАЙДЕН"
        cancelLabel="К списку дуэлей"
        onCancel={() => {
          clearRadioMatchPreviewTimer();
          setRadioMatchPreview(null);
          void refreshRadioDuels();
        }}
        onRetry={() => {}}
        onFallback={() => {}}
      />
    );
  }

  if (menuView === "radioDuels" && radioSearching) {
    return (
      <PvpMatchmakingScreen
        playerHeadquartersId={selectedHeadquartersId}
        playerNickname={getPlayerDisplayNickname(
          playerProgress,
          getCurrentUserLogin()
        )}
        playerDeckWeight={radioSearchDeckWeight}
        opponentHeadquartersId={null}
        opponentNickname={null}
        opponentDeckWeight={null}
        previewLabel={null}
        status={radioError ? "error" : "searching"}
        error={radioError}
        searchDeadlineAt={null}
        persistentSearch
        radarVolumeMultiplier={0.5}
        title="ПОИСК СОПЕРНИКА ДЛЯ РАДИОДУЭЛИ"
        onCancel={() => {
          setRadioLoading(true);
          void profileClient.cancelRadioDuelQueue()
            .then((result) => {
              setRadioDuels(result);
              setRadioSearching(false);
              setRadioError(null);
              openHeadquartersMenu("radio");
            })
            .catch((error) => setRadioError(error instanceof Error ? error.message : String(error)))
            .finally(() => setRadioLoading(false));
        }}
        onRetry={() => {
          setRadioError(null);
          void refreshRadioDuels();
        }}
        onFallback={() => {}}
        onMainMenu={() => {
          setRadioSearching(false);
          closeRadioDuelsMenu();
        }}
      />
    );
  }

  if (menuView === "radioDuels") {
    const games = radioDuels?.games ?? [];
    const activeGameCount = games.filter((duel) => duel.status === "active").length;
    const queue = radioDuels?.queue;
    const queuedHeadquartersId = queue?.headquartersId ?? selectedHeadquartersId;
    const queuedHeadquarters = HEADQUARTERS[queuedHeadquartersId];
    const queuedAvatar = getHeadquartersPortrait(queuedHeadquartersId);
    const queuedBattleBackground = getBattleBackgroundAsset(games[0]?.backgroundId);
    const queuedDeckWeight =
      queue?.deckWeight ??
      radioSearchDeckWeight ??
      getDefaultDeckWeight(queuedHeadquartersId).totalWeight;
    const queuedNickname = getPlayerDisplayNickname(
      playerProgress,
      getCurrentUserLogin()
    );
    const canStart =
      !queue?.queued &&
      activeGameCount < (radioDuels?.maxActiveGames ?? RADIO_DUEL_MAX_ACTIVE);

    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />
        <PlayerAccountPanel onOpenProfile={openProfileMenu} />
        <section style={{ ...styles.menuLayer, ...styles.radioDuelMenuLayer }}>
          <header style={styles.radioDuelMenuHeader}>
            <h1 style={styles.title}>РАДИОДУЭЛИ</h1>
            <div style={styles.radioDuelMenuSubtitle}>АКТИВНЫЕ ДУЭЛИ</div>
            <div style={styles.radioDuelMenuCount}>
              Активные сражения: {activeGameCount}/{radioDuels?.maxActiveGames ?? RADIO_DUEL_MAX_ACTIVE}
            </div>
          </header>

          <CarouselTapFrame
            viewportRef={radioDuelsCarouselRef}
            viewportStyle={{ ...styles.carouselViewport, ...styles.radioDuelCarouselViewport }}
            ariaLabel="Активные радиодуэли"
          >
            <div style={{ ...styles.carouselTrack, ...styles.radioDuelCarouselTrack }}>
              {games.map((duel) => {
                const myAvatar = getHeadquartersPortrait(duel.myHeadquartersId);
                const opponentAvatar = getHeadquartersPortrait(duel.opponentHeadquartersId);
                const battleBackground = getBattleBackgroundAsset(duel.backgroundId);
                const entryWarning = Boolean(
                  duel.isMyTurn &&
                  duel.timerPhase === "entry" &&
                  duel.deadlineAt !== null &&
                  duel.deadlineAt - radioNow <= 30 * 60 * 1_000
                );
                const statusLabel = duel.status === "finished"
                  ? "БОЙ ЗАВЕРШЁН"
                  : entryWarning
                    ? "МАЛО ВРЕМЕНИ"
                    : duel.isMyTurn
                      ? "ВАШ ХОД"
                      : "ХОД СОПЕРНИКА";
                const actionLabel = duel.status === "finished"
                  ? "ПОСМОТРЕТЬ ИТОГ"
                  : entryWarning
                    ? "ОТКРЫТЬ"
                    : duel.isMyTurn
                      ? "СДЕЛАТЬ ХОД"
                      : "ЖДАТЬ";

                return (
                  <motion.button
                    key={duel.id}
                    type="button"
                    className={[
                      "radio-duel-card-textured",
                      entryWarning
                        ? "radio-duel-warning-pulse"
                        : duel.isMyTurn
                          ? "radio-duel-turn-pulse"
                          : "",
                    ].filter(Boolean).join(" ")}
                    style={{
                      ...styles.radioDuelCard,
                      ...(duel.isMyTurn ? styles.radioDuelCardActive : {}),
                      ...(duel.unread ? styles.radioDuelCardUnread : {}),
                      ...(entryWarning ? styles.radioDuelCardWarning : {}),
                      "--radio-grunge-overlay": `url("${radioGrungeOverlayImage}")`,
                      "--radio-olive-metal": `url("${radioOliveMetalImage}")`,
                      "--radio-red-metal": `url("${radioRedMetalImage}")`,
                    } as CSSProperties}
                    whileHover={{ y: -6, scale: 1.018 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      setRadioLoading(true);
                      void profileClient.openRadioDuel(duel.id)
                        .then(openRadioDuelBattle)
                        .catch((error) => setRadioError(error instanceof Error ? error.message : String(error)))
                        .finally(() => setRadioLoading(false));
                    }}
                  >
                    <span
                      className="radio-duel-metal-surface"
                      style={{
                        ...styles.radioDuelStatusHeader,
                        ...(duel.isMyTurn ? styles.radioDuelStatusHeaderActive : {}),
                        ...(entryWarning ? styles.radioDuelStatusHeaderWarning : {}),
                      }}
                    >
                      <span>{statusLabel}</span>
                    </span>

                    <span
                      className={entryWarning ? "radio-duel-metal-surface" : undefined}
                      style={{
                        ...styles.radioDuelTimerRow,
                        ...(entryWarning ? styles.radioDuelTimerRowWarning : {}),
                      }}
                    >
                      <span style={styles.radioDuelClockIcon}>◴</span>
                      <span>
                        {duel.deadlineAt
                          ? `Осталось ${formatRadioDuelCountdown(duel.deadlineAt, radioNow)}`
                          : "Бой завершён"}
                      </span>
                    </span>

                    <span
                      style={{
                        ...styles.radioDuelBattleArt,
                        backgroundColor: battleBackground.color,
                        backgroundImage: `linear-gradient(180deg, rgba(12,12,9,.05) 15%, rgba(8,8,6,.08) 72%, rgba(7,7,5,.28) 100%), url("${battleBackground.image}")`,
                        backgroundSize: battleBackground.size,
                        backgroundPosition: battleBackground.position,
                      }}
                    >
                      {myAvatar ? (
                        <img src={myAvatar} alt="" style={{ ...styles.radioDuelAvatar, ...styles.radioDuelAvatarLeft }} />
                      ) : null}
                      {opponentAvatar ? (
                        <img src={opponentAvatar} alt="" style={{ ...styles.radioDuelAvatar, ...styles.radioDuelAvatarRight }} />
                      ) : null}
                      <img src={radioVsImage} alt="VS" style={styles.radioDuelVsImage} />

                      <span style={styles.radioDuelNamesRow}>
                        <strong style={{ ...styles.radioDuelPlayerName, textAlign: "left" }}>
                          {duel.myNickname}
                        </strong>
                        <span
                          className="radio-duel-metal-surface"
                          style={{
                            ...styles.radioDuelTurnChip,
                            ...(duel.isMyTurn ? styles.radioDuelTurnChipActive : {}),
                            ...(entryWarning ? styles.radioDuelTurnChipWarning : {}),
                          }}
                        >
                          <span>ХОД {duel.turn}</span>
                        </span>
                        <strong style={{ ...styles.radioDuelPlayerName, textAlign: "right" }}>
                          {duel.opponentNickname}
                        </strong>
                      </span>
                    </span>

                    <span className="radio-duel-metal-surface" style={styles.radioDuelStatsRow}>
                      <span className="radio-duel-hp-shield radio-duel-hp-shield--player" style={styles.radioDuelHpShield}>
                        <img src={radioPlayerHpImage} alt="" style={styles.radioDuelHpShieldImage} />
                        <strong style={styles.radioDuelHpValue}>{duel.myHeadquartersHp}</strong>
                      </span>
                      <span style={styles.radioDuelDeckStat}>
                        <span>Сила колоды</span>
                        <strong style={styles.radioDuelDeckValue}>{duel.myDeckWeight}</strong>
                      </span>
                      <span style={{ ...styles.radioDuelDeckStat, textAlign: "right" }}>
                        <span>Сила колоды</span>
                        <strong style={styles.radioDuelDeckValue}>{duel.opponentDeckWeight}</strong>
                      </span>
                      <span className="radio-duel-hp-shield radio-duel-hp-shield--enemy" style={styles.radioDuelHpShield}>
                        <img src={radioEnemyHpImage} alt="" style={styles.radioDuelHpShieldImage} />
                        <strong style={styles.radioDuelHpValue}>{duel.opponentHeadquartersHp}</strong>
                      </span>
                    </span>

                    <span
                      className="radio-duel-metal-surface"
                      style={{
                        ...styles.radioDuelActionBar,
                        ...(duel.isMyTurn ? styles.radioDuelActionBarActive : {}),
                        ...(entryWarning ? styles.radioDuelActionBarWarning : {}),
                      }}
                    >
                      <span>{actionLabel}</span>
                    </span>
                  </motion.button>
                );
              })}

              {queue?.queued ? (
                <article
                  className="radio-duel-card-textured"
                  style={{
                    ...styles.radioDuelCard,
                    ...styles.radioDuelQueueCard,
                    "--radio-grunge-overlay": `url("${radioGrungeOverlayImage}")`,
                    "--radio-olive-metal": `url("${radioOliveMetalImage}")`,
                    "--radio-red-metal": `url("${radioRedMetalImage}")`,
                  } as CSSProperties}
                >
                  <span className="radio-duel-metal-surface" style={styles.radioDuelStatusHeader}>
                    <span>ИДЁТ ПОИСК</span>
                  </span>

                  <span style={styles.radioDuelTimerRow}>
                    <span style={styles.radioDuelClockIcon}>◴</span>
                    <span>Ожидаем соперника</span>
                  </span>

                  <span
                    style={{
                      ...styles.radioDuelBattleArt,
                      backgroundColor: queuedBattleBackground.color,
                      backgroundImage: `linear-gradient(180deg, rgba(12,12,9,.05) 15%, rgba(8,8,6,.08) 72%, rgba(7,7,5,.28) 100%), url("${queuedBattleBackground.image}")`,
                      backgroundSize: queuedBattleBackground.size,
                      backgroundPosition: queuedBattleBackground.position,
                    }}
                  >
                    {queuedAvatar ? (
                      <img
                        src={queuedAvatar}
                        alt=""
                        style={{ ...styles.radioDuelAvatar, ...styles.radioDuelAvatarLeft }}
                      />
                    ) : null}

                    <span style={styles.radioDuelNamesRow}>
                      <strong style={{ ...styles.radioDuelPlayerName, textAlign: "left" }}>
                        {queuedNickname}
                      </strong>
                      <span className="radio-duel-metal-surface" style={styles.radioDuelTurnChip}>
                        <span>ПОИСК</span>
                      </span>
                      <span aria-hidden="true" />
                    </span>
                  </span>

                  <span className="radio-duel-metal-surface" style={styles.radioDuelStatsRow}>
                    <span
                      className="radio-duel-hp-shield radio-duel-hp-shield--player"
                      style={styles.radioDuelHpShield}
                    >
                      <img src={radioPlayerHpImage} alt="" style={styles.radioDuelHpShieldImage} />
                      <strong style={styles.radioDuelHpValue}>{queuedHeadquarters.hp}</strong>
                    </span>
                    <span style={styles.radioDuelDeckStat}>
                      <span>Сила колоды</span>
                      <strong style={styles.radioDuelDeckValue}>{queuedDeckWeight}</strong>
                    </span>
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </span>

                  <button
                    type="button"
                    className="radio-duel-metal-surface"
                    style={{ ...styles.radioDuelActionBar, ...styles.radioDuelQueueCancelButton }}
                    disabled={radioLoading}
                    onClick={() => {
                      setRadioLoading(true);
                      void profileClient.cancelRadioDuelQueue()
                        .then(setRadioDuels)
                        .catch((error) => setRadioError(error instanceof Error ? error.message : String(error)))
                        .finally(() => setRadioLoading(false));
                    }}
                  >
                    <span>ОТМЕНИТЬ ПОИСК</span>
                  </button>
                </article>
              ) : null}

              <motion.button
                type="button"
                className="menu-image-button"
                style={{ ...styles.radioDuelCard, ...styles.radioDuelNewBattleCard }}
                disabled={!canStart || radioLoading}
                onClick={() => openHeadquartersMenu("radio")}
                whileHover={canStart ? { y: -6, scale: 1.018 } : undefined}
                whileTap={canStart ? { scale: 0.99 } : undefined}
              >
                <img src="/ui/menu/radio_duel.webp" alt="" draggable={false} style={styles.radioDuelNewBattleImage} />
                <span style={styles.campaignEntryTitleOverlay}>Новый бой</span>
              </motion.button>
            </div>
          </CarouselTapFrame>

          {radioError ? <div style={{ color: "#ffb2a8", fontWeight: 700 }}>{radioError}</div> : null}
          <div style={{ ...styles.menuActionsRow, justifyContent: "center", gap: 18 }}>
            <button
              type="button"
              style={{ ...styles.backButton, ...styles.radioDuelMenuButton }}
              onClick={closeRadioDuelsMenu}
            >
              В главное меню
            </button>
          </div>
        </section>

        <TutorialOverlay
          kind="dialogue"
          visible={radioIntroVisible}
          text="В радиодуэли можно вести до трёх партий одновременно. Когда ход переходит к игроку, у него есть 12 часов, чтобы открыть бой. Если не войти вовремя, штаб потеряет 5 здоровья. После входа запускается таймер на 3 минуты. Если за это время не совершить ни одного действия, штаб потеряет 5 здоровья, а игра вернёт тебя в главное меню. При возвращении ты увидишь повтор последнего хода соперника."
          nextLabel="Понятно"
          onNext={() => {
            window.localStorage.setItem("panzershrek.radioDuelIntroSeen", "true");
            setRadioIntroVisible(false);
            const result = radioDuels;
            if (!result || result.games.length > 0) return;
            if (result.queue.queued) setRadioSearching(true);
            else openHeadquartersMenu("radio");
          }}
        />
      </main>
    );
  }

  if (menuView === "main" && !pvpBusy) {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />
        <PlayerAccountPanel onOpenProfile={openProfileMenu} />
        <PlayerResourcesPanel
          onOpenShop={openShopMenu}
          onOpenExchange={openExchangeMenu}
          onOpenTutorial={openTutorialMenu}
        />
        <RegistrationReminderOverlay
          visible={registrationReminderVisible && !isRegisteredUserId()}
          onRegister={() => {
            requestProfileRegistration();
            openProfileMenu();
          }}
          onDismiss={dismissRegistrationReminder}
        />
        <RegistrationReminderOverlay
          visible={firstPlayerPackReminderVisible && loadPlayerProgress().cardBackId !== "first_player"}
          variant="firstPlayerPack"
          onRegister={() => {}}
          onOpenShop={() => {
            dismissFirstPlayerPackReminder();
            openShopMenu();
          }}
          onDismiss={dismissFirstPlayerPackReminder}
        />
        {renderProfileServerBanner()}

        <section style={{ ...styles.menuLayer, ...styles.mainMenuLayer }}>
          <header style={{ ...styles.header, ...styles.mainMenuHeader }}>
            <h1 style={styles.title}>{t("main.selectBattleMode")}</h1>
          </header>

          <CarouselTapFrame
            viewportRef={mainMenuCarouselRef}
            viewportStyle={{
              ...styles.carouselViewport,
              ...styles.mainMenuCarouselViewport,
            }}
            ariaLabel={t("main.selectBattleMode")}
            hideArrows
          >
            <div style={styles.mainMenuTrack}>
            <motion.button
              type="button"
              style={styles.campaignEntryOption}
              onClick={openCampaignMenu}
              aria-label={t("main.campaign")}
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src="/ui/menu/campaign-card.webp"
                  alt=""
                  draggable={false}
                  onError={(event) =>
                    usePngFallback(event, "/ui/menu/campaign-card.png")
                  }
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>{t("main.campaign")}</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              style={styles.campaignEntryOption}
              onClick={() => openHeadquartersMenu("pvp")}
              aria-label={t("main.quickBattle")}
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src="/ui/menu/PVP.webp"
                  alt=""
                  draggable={false}
                  onError={(event) => usePngFallback(event, "/ui/menu/PVP.png")}
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>{t("main.quickBattle")}</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              style={styles.campaignEntryOption}
              onClick={enterRadioDuels}
              aria-label="Радиодуэль"
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src="/ui/menu/radio_duel.webp"
                  alt=""
                  draggable={false}
                  onError={(event) => usePngFallback(event, "/ui/menu/radio_duel.png")}
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>Радиодуэль</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              style={styles.campaignEntryOption}
              onClick={() => openHeadquartersMenu("ai")}
              aria-label={t("main.aiBattle")}
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src="/ui/menu/PVE.webp"
                  alt=""
                  draggable={false}
                  onError={(event) => usePngFallback(event, "/ui/menu/PVE.png")}
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>{t("main.aiBattle")}</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              className={
                !playerProgress.tutorialCompleted
                  ? "main-menu-tutorial-pulse"
                  : undefined
              }
              style={styles.campaignEntryOption}
              onClick={playerProgress.tutorialCompleted ? openCombatMissions : openTutorialMenu}
              aria-label={playerProgress.tutorialCompleted ? (language === "en" ? "Combat missions" : "Боевые задачи") : t("main.tutorial")}
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src={
                    playerProgress.tutorialCompleted
                      ? "/ui/menu/combat-missions.webp"
                      : "/ui/menu/education.webp"
                  }
                  alt=""
                  draggable={false}
                  onError={(event) =>
                    usePngFallback(
                      event,
                      playerProgress.tutorialCompleted
                        ? "/ui/menu/combat-missions.png"
                        : "/ui/menu/education.png"
                    )
                  }
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>
                  {playerProgress.tutorialCompleted
                    ? (language === "en" ? "Combat missions" : "Боевые задачи")
                    : t("main.tutorial")}
                </span>
              </div>
            </motion.button>
            </div>
          </CarouselTapFrame>

          <div style={styles.mainSecondaryActions}>
          <button
            type="button"
            className="menu-image-button"
            style={styles.researchButton}
            onClick={openResearchMenu}
          >
            {t("main.research")}
          </button>

          <button
            type="button"
            className="menu-image-button"
            style={styles.collectionButton}
            onClick={openCollectionMenu}
          >
            {t("main.collection")}
          </button>

          </div>

          <footer style={styles.mainLegalFooter}>
            <LegalLinks />
          </footer>
          <button
            type="button"
            style={styles.supportLink}
            onClick={openSupportForm}
          >
            {t("main.support")}
          </button>
        </section>

        {supportOpen ? (
          <div style={styles.supportOverlay} onClick={closeSupportForm}>
            <form
              style={styles.supportPanel}
              onSubmit={sendSupportFeedback}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={styles.supportHeader}>
                <div>
                  <div style={styles.supportKicker}>PANZERSHREK</div>
                  <h2 style={styles.supportTitle}>{t("support.title")}</h2>
                </div>
                <button
                  type="button"
                  style={styles.supportCloseButton}
                  onClick={closeSupportForm}
                  disabled={supportFeedback.sending}
                  aria-label={t("support.close")}
                >
                  ×
                </button>
              </div>

              <label style={styles.supportLabel}>
                {t("support.contact")}
                <input
                  value={supportFeedback.contact}
                  onChange={(event) =>
                    setSupportFeedback((state) => ({
                      ...state,
                      contact: event.target.value,
                    }))
                  }
                  style={styles.supportInput}
                  placeholder={t("support.contactPlaceholder")}
                  maxLength={160}
                />
              </label>

              <label style={styles.supportLabel}>
                {t("support.message")}
                <textarea
                  value={supportFeedback.message}
                  onChange={(event) =>
                    setSupportFeedback((state) => ({
                      ...state,
                      message: event.target.value,
                      sent: false,
                      error: null,
                    }))
                  }
                  style={styles.supportTextarea}
                  placeholder={t("support.messagePlaceholder")}
                  maxLength={3000}
                  rows={7}
                  required
                />
              </label>

              {supportFeedback.error ? (
                <div style={styles.supportError}>{supportFeedback.error}</div>
              ) : null}
              {supportFeedback.sent ? (
                <div style={styles.supportSuccess}>
                  {t("support.sent")}
                </div>
              ) : null}

              <div style={styles.supportActions}>
                <button
                  type="button"
                  style={styles.supportSecondaryButton}
                  onClick={closeSupportForm}
                  disabled={supportFeedback.sending}
                >
                  {t("common.close")}
                </button>
                <button
                  type="submit"
                  style={styles.supportPrimaryButton}
                  disabled={supportFeedback.sending}
                >
                  {supportFeedback.sending ? t("support.sending") : t("support.send")}
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {rewardCelebrationOverlay}
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />
      <PlayerAccountPanel onOpenProfile={openProfileMenu} />
      <PlayerResourcesPanel
          onOpenShop={openShopMenu}
          onOpenExchange={openExchangeMenu}
        />
      {renderProfileServerBanner()}

      <section style={{ ...styles.menuLayer, ...styles.headquartersMenuLayer }}>
        <header style={{ ...styles.header, ...styles.headquartersHeader }}>
          <h1 style={{ ...styles.title, ...styles.headquartersTitle }}>
            {t("battle.selectHeadquarters")}
          </h1>
        </header>

        <CarouselTapFrame
          viewportRef={headquartersCarouselRef}
          viewportStyle={{
            ...styles.carouselViewport,
            ...styles.headquartersCarouselViewport,
          }}
          ariaLabel={t("battle.selectHeadquarters")}
        >
          <div style={styles.carouselTrack}>
            {filteredDeckOptions.map(
              ({ headquarters, headquartersId, deck, optionKey }) => {
              const highlighted = optionKey === hoveredDeckOptionKey;

              return (
                <motion.button
                  key={optionKey}
                  type="button"
                  style={{
                    ...styles.headquartersOption,
                    ...(buttonsDisabled ? styles.headquartersOptionDisabled : {}),
                  }}
                  disabled={buttonsDisabled}
                  onContextMenu={(event) =>
                    openHeadquartersPreview(
                      event,
                      headquartersId,
                      deck
                    )
                  }
                  onMouseEnter={() => setHoveredDeckOptionKey(optionKey)}
                  onMouseLeave={() => setHoveredDeckOptionKey(null)}
                  onFocus={() => setHoveredDeckOptionKey(optionKey)}
                  onBlur={() => setHoveredDeckOptionKey(null)}
                  onClick={() =>
                    startDeckForHeadquarters(
                      headquartersId,
                      deck.id,
                      deck.cardIds
                    )
                  }
                  whileHover={buttonsDisabled ? undefined : { y: -8, scale: 1.035 }}
                  whileTap={buttonsDisabled ? undefined : { scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 360, damping: 28 }}
                  aria-label={`${t("battle.playDeck")} ${deck.name}`}
                >
                  <div
                    style={{
                      ...styles.selectionGlow,
                      ...(highlighted ? styles.selectionGlowVisible : {}),
                    }}
                  />

                  <div style={styles.cardSlot}>
                    <div style={styles.cardScaleBox}>
                      <div style={styles.cardBaseSize}>
                        <HandCardView
                          ownerId="player"
                          headquartersId={headquartersId}
                          headquarters={{
                            hp: headquarters.hp,
                            attack: headquarters.attack,
                            fuelGeneration: headquarters.fuelGeneration,
                          }}
                          displayMode="hand"
                        />
                      </div>
                    </div>
                  </div>

                  <div style={styles.headquartersDeckCaption}>
                    <span style={styles.headquartersDeckName}>{deck.name}</span>
                    <span style={styles.headquartersDeckCount}>
                      {deck.countLabel} · {t("battle.deckStrength")} {deck.weightLabel}
                    </span>
                  </div>
                </motion.button>
              );
            })}

          </div>
        </CarouselTapFrame>

        {!pvpBusy ? (
          <>
            <div style={styles.singleMenuAction}>
              <button
                type="button"
                className="menu-image-button"
                style={{
                  ...styles.createDeckButton,
                  ...(buttonsDisabled ? styles.headquartersOptionDisabled : {}),
                }}
                disabled={buttonsDisabled}
                onClick={openCreateDeckBuilder}
                aria-label={t("battle.createDeck")}
              >
                {t("battle.createDeck")}
              </button>

              <div
                style={styles.deckNationFilterRow}
                role="group"
                aria-label={t("battle.filterDecksByNation")}
              >
                <button
                  type="button"
                  style={{
                    ...styles.deckNationFilterAll,
                    ...(deckNationFilter === "all"
                      ? styles.deckNationFilterButtonActive
                      : {}),
                  }}
                  onClick={() => setDeckNationFilter("all")}
                  aria-pressed={deckNationFilter === "all"}
                  title={t("battle.allNations")}
                >
                  {t("common.all")}
                </button>
                {availableDeckNations.map((nation) => {
                  const flag = getNationFlagAsset(nation);
                  const active = deckNationFilter === nation;
                  const nationLabel = getLocalizedNationLabel(nation, language);

                  return (
                    <button
                      key={nation}
                      type="button"
                      style={{
                        ...styles.deckNationFilterButton,
                        ...(active
                          ? styles.deckNationFilterButtonActive
                          : {}),
                      }}
                      onClick={() => setDeckNationFilter(nation)}
                      aria-pressed={active}
                      aria-label={
                        language === "en"
                          ? `Decks of nation: ${nationLabel}`
                          : `Колоды нации: ${nationLabel}`
                      }
                      title={nationLabel}
                    >
                      {flag ? (
                        <img
                          src={flag}
                          alt=""
                          draggable={false}
                          style={{
                            ...styles.deckNationFilterFlag,
                            objectPosition:
                              nation === "usa" ? "25% center" : "center",
                          }}
                        />
                      ) : (
                        nationLabel
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="menu-image-button"
              style={styles.headquartersBackButton}
              onClick={closeHeadquartersSelection}
              aria-label={t("common.back")}
              title={t("common.back")}
            >
              ‹
            </button>
          </>
        ) : null}

        {pvpBusy && matchmakingAvatar ? (
          <motion.div
            style={styles.matchmakingAvatarPanel}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <img
              src={matchmakingAvatar}
              alt=""
              aria-hidden="true"
              style={styles.matchmakingAvatar}
            />
          </motion.div>
        ) : null}

        {mode === "pvp" && pvpRoomId && pvpStatus === "waiting" ? (
          <div style={styles.hint}>
            Ты в очереди. Как только второй игрок нажмёт “Играть PVP”, бой
            начнётся автоматически.
          </div>
        ) : null}

        {pvpBusy ? (
          <button
            type="button"
            style={styles.cancelButton}
            onClick={cancelMatchmaking}
          >
            {t("battle.cancelSearch")}
          </button>
        ) : null}

        {pvpError ? <div style={styles.error}>{pvpError}</div> : null}
      </section>

      {createPortal(
        <AnimatePresence>
          {previewHeadquarters ? (
            <motion.div
              style={{
                ...styles.cardPreviewOverlay,
                ...(previewDeckIsCustom ? styles.deckPreviewOverlay : {}),
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onMouseDown={closeHeadquartersPreview}
              onContextMenu={(event) => {
                event.preventDefault();
                closeHeadquartersPreview();
              }}
            >
              <div
                style={{
                  ...stageOverlayTransform,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
              <motion.div
                style={{
                  ...styles.cardPreviewPanel,
                  ...(previewDeckIsCustom ? styles.deckPreviewPanel : {}),
                }}
                initial={{ opacity: 0, scale: 0.84, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 12 }}
                transition={{
                  type: "spring",
                  stiffness: 260,
                  damping: 24,
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                {!previewDeckIsCustom && previewHeadquarters ? (
                  <CardKeywordsPanel
                    keywords={getHeadquartersKeywords(
                      previewHeadquarters.ability,
                      previewHeadquarters.nation,
                      language
                    )}
                  />
                ) : null}

                <button
                  type="button"
                  style={styles.cardPreviewClose}
                  onClick={closeHeadquartersPreview}
                aria-label={t("battle.closeCardPreview")}
                >
                  ×
                </button>

                {previewDeckIsCustom ? (
                  <aside style={styles.deckPreviewActions}>
                    <button
                      type="button"
                      style={styles.deckPreviewActionButton}
                      onClick={deletePreviewDeck}
                    >
                      {t("battle.deleteDeck")}
                    </button>
                    <button
                      type="button"
                      style={styles.deckPreviewActionButton}
                      onClick={editPreviewDeck}
                    >
                      {t("battle.editDeck")}
                    </button>
                  </aside>
                ) : null}

                <section style={styles.deckPreviewHeadquarters}>
                  <HandCardView
                    ownerId="player"
                    headquartersId={previewHeadquarters.id as HeadquartersId}
                    headquarters={{
                      hp: previewHeadquarters.hp,
                      attack: previewHeadquarters.attack,
                      fuelGeneration: previewHeadquarters.fuelGeneration,
                    }}
                    displayMode="preview"
                  />
                  {previewDeck ? (
                    <div style={styles.deckPreviewTitleBlock}>
                      <strong>{previewDeck.deck.name}</strong>
                      <span>{previewDeck.deck.countLabel}</span>
                    </div>
                  ) : null}
                </section>

                {previewDeckIsCustom ? (
                  <section style={styles.deckPreviewListPanel}>
                    <div
                      ref={deckPreviewListRef}
                      className="menu-carousel-scroll"
                      style={styles.deckPreviewUnitList}
                      onPointerDown={startDeckPreviewScroll}
                      onPointerMove={moveDeckPreviewScroll}
                      onPointerUp={stopDeckPreviewScroll}
                      onPointerCancel={stopDeckPreviewScroll}
                    >
                      {previewDeckCards.map(({ card, count }) => (
                        <button
                          key={card.id}
                          type="button"
                          style={styles.deckPreviewUnitRow}
                          onContextMenu={(event) =>
                            openPreviewUnitCard(event, card)
                          }
                        >
                          <img
                            src={getTankImage(card.id)}
                            alt=""
                            style={styles.deckPreviewUnitImage}
                            draggable={false}
                          />
                          <span style={styles.deckPreviewUnitName}>
                            {card.name}
                          </span>
                          <strong style={styles.deckPreviewUnitCount}>
                            x{count}
                          </strong>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div style={styles.cardPreviewHint}>
                  {t("battle.previewCloseHint")}
                </div>
              </motion.div>

              {previewUnitCard ? (
                <motion.div
                  style={styles.unitCardPreviewPanel}
                  initial={{ opacity: 0, scale: 0.84, y: 18 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 12 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setPreviewUnitCard(null);
                  }}
                >
                  <CardKeywordsPanel keywords={getCardKeywords(previewUnitCard, language)} />

                  <button
                    type="button"
                    style={styles.cardPreviewClose}
                    onClick={() => setPreviewUnitCard(null)}
                    aria-label={t("battle.closeUnitPreview")}
                  >
                    ×
                  </button>
                  <HandCardView
                    card={previewUnitCard}
                    ownerId="player"
                    displayMode="preview"
                  />
                </motion.div>
              ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}

      {standaloneUnitCardPreview}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  headquartersNameLabel: {
    fontFamily: "var(--font-display)",
    fontSize: "var(--fs-title)",
    fontWeight: "var(--fw-bold)",
    letterSpacing: "var(--ls-title)",
    textTransform: "uppercase",
    color: "var(--brass-400)",
  },

  page: {
    position: "relative",
    height: "100cqh",
    maxHeight: "100cqh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px 0",
    color: "#f4e5bf",
    fontFamily: "var(--font-body)",
    // Background is painted full-viewport by GameStage's backdrop host (the
    // default menu art), so it bleeds into the letterbox margins instead of
    // being clipped to this box. Keep the box transparent so it shows through.
    background: "transparent",
    overflow: "hidden",
    overscrollBehavior: "none",
    boxSizing: "border-box",
  },

  backgroundShade: {
    display: "none",
  },

  playerAccountPanel: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 5,
    width: 306,
    minHeight: 98,
    display: "grid",
    gridTemplateColumns: "82px 1fr",
    alignItems: "start",
    gap: 14,
    padding: "4px 16px 6px 8px",
    overflow: "hidden",
    color: "#fff",
    border: "none",
    background: "transparent",
    boxShadow: "none",
    cursor: "pointer",
    textAlign: "left",
  },

  playerAccountFlag: {
    position: "absolute",
    left: 0,
    right: 40,
    top: 10,
    height: 70,
    zIndex: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    opacity: 0.54,
    filter: "saturate(1.08)",
    WebkitMaskImage:
      "linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
    maskImage:
      "linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
  },

  playerAccountShade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 10,
    height: 56,
    zIndex: 1,
    background: "transparent",
  },

  playerAccountAvatarFrame: {
    position: "relative",
    zIndex: 2,
    width: 78,
    height: 92,
    overflow: "hidden",
    filter:
      "drop-shadow(0 10px 16px rgba(0,0,0,0.78)) drop-shadow(0 0 8px rgba(232,198,112,0.14))",
  },

  playerAccountAvatar: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
    objectPosition: "center bottom",
    userSelect: "none",
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 76%, rgba(0,0,0,0.55) 90%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 76%, rgba(0,0,0,0.55) 90%, transparent 100%)",
  },

  playerAccountText: {
    position: "relative",
    zIndex: 2,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingTop: 10,
    textShadow: "0 2px 8px rgba(0,0,0,0.92)",
  },

  playerAccountName: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 1.05,
    fontWeight: 1000,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  playerAccountType: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  playerAccountSyncBadge: {
    position: "absolute",
    right: 14,
    bottom: 8,
    zIndex: 3,
    padding: "4px 8px",
    background:
      "linear-gradient(180deg, rgba(37, 74, 104, 0.92), rgba(12, 24, 35, 0.96))",
    color: "#cde9ff",
    fontSize: 10,
    fontWeight: 1000,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    boxShadow:
      "0 8px 16px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(156, 214, 255, 0.26)",
    textShadow: "0 2px 4px rgba(0,0,0,0.8)",
  },

  playerResourcesPanel: {
    position: "absolute",
    left: "50%",
    top: 0,
    zIndex: 6,
    width: 430,
    height: 40,
    transform: "translateX(-50%)",
    display: "grid",
    // Columns track the plate art's two divider lines (~33% / ~64%) so each
    // value sits centred in its lit section. The middle (iron tracks) cell is
    // sized to comfortably hold a 7-digit number at the readable HUD font.
    gridTemplateColumns: "33fr 31fr 36fr",
    alignItems: "center",
    gap: 0,
    padding: "8px 8px 12px 8px",
    backgroundImage: `url("${topBackgroundImage}")`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center top",
    backgroundRepeat: "no-repeat",
    pointerEvents: "none",
    filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.56))",
  },

  profileServerBanner: {
    position: "absolute",
    top: 62,
    left: "50%",
    zIndex: 45,
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 16px",
    background:
      "linear-gradient(180deg, rgba(80, 30, 24, 0.92), rgba(21, 10, 8, 0.92))",
    color: "#ffe8ce",
    fontSize: 13,
    fontWeight: 900,
    boxShadow: "0 12px 28px rgba(0,0,0,0.42)",
    textShadow: "0 2px 4px rgba(0,0,0,0.7)",
  },

  profileServerRetryButton: {
    height: 30,
    padding: "0 14px",
    border: "1px solid rgba(255, 226, 163, 0.34)",
    background:
      "linear-gradient(180deg, rgba(97, 78, 42, 0.92), rgba(37, 31, 18, 0.96))",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    pointerEvents: "auto",
  },

  playerResourceItem: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    color: "#f7efe0",
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: 0.3,
    textShadow: "0 2px 5px rgba(0,0,0,0.9)",
    fontVariantNumeric: "tabular-nums",
  },

  playerResourceButton: {
    appearance: "none",
    border: "1px solid transparent",
    borderRadius: 9,
    background: "transparent",
    padding: "3px 7px",
    margin: "-3px -1px",
    cursor: "pointer",
    fontFamily: "inherit",
    pointerEvents: "auto",
    transition: "background-color 120ms ease, border-color 120ms ease",
  },

  playerResourceIcon: {
    width: 23,
    height: 23,
    objectFit: "contain",
    flex: "0 0 auto",
    filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.85))",
  },

  playerResourceValue: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  playerShopButton: {
    position: "absolute",
    left: "calc(100% + 8px)",
    top: 3,
    width: 118,
    height: 34,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 1000,
    letterSpacing: 1.05,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    pointerEvents: "auto",
  },

  playerTutorialButton: {
    left: "calc(100% + 134px)",
    width: 132,
  },

  menuChunkLoading: {
    alignSelf: "center",
    justifySelf: "center",
    padding: "14px 28px",
    color: "var(--brass-400)",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textShadow: "0 3px 12px rgba(0,0,0,0.82)",
  },

  guestEntryPanel: {
    position: "relative",
    zIndex: 6,
    width: "min(560px, calc(100cqw - 42px))",
    display: "grid",
    gap: 20,
    padding: "34px 36px 30px",
    color: "#f4e5bf",
    background:
      "linear-gradient(180deg, rgba(18,18,14,0.76), rgba(9,10,8,0.84))",
    boxShadow:
      "0 26px 70px rgba(0,0,0,0.62), inset 0 0 0 1px rgba(216,174,92,0.18)",
  },

  guestEntryHeader: {
    display: "grid",
    gap: 4,
    textAlign: "center",
  },

  guestEntryTitle: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: "clamp(40px, 6cqw, 76px)",
    lineHeight: 0.9,
    fontWeight: 800,
    letterSpacing: "0.08em",
    color: "var(--brass-400)",
    textTransform: "uppercase",
    textShadow: "0 8px 26px rgba(0,0,0,0.74)",
  },

  guestEntrySubtitle: {
    margin: 0,
    color: "rgba(245,230,192,0.78)",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  guestEntryForm: {
    display: "grid",
    gap: 12,
  },

  authModalForm: {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: 12,
    rowGap: 7,
  },

  authModalField: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },

  authModalWide: {
    gridColumn: "1 / -1",
  },

  legalConsentRow: {
    display: "grid",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    alignItems: "start",
    gap: 10,
    color: "rgba(244,229,191,0.76)",
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 700,
  },

  legalConsentCheckbox: {
    width: 16,
    height: 16,
    margin: "2px 0 0",
    accentColor: "#c49b4a",
  },

  legalLinks: {
    display: "inline-flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 0,
    color: "rgba(244,229,191,0.72)",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.4,
  },

  legalLinksCompact: {
    color: "rgba(244,229,191,0.76)",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.35,
  },

  legalLink: {
    color: "rgba(255, 232, 174, 0.86)",
    textDecoration: "none",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    pointerEvents: "auto",
  },

  legalLinkCompact: {
    color: "#ffe3a4",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },

  legalLinksSeparator: {
    color: "rgba(244,229,191,0.42)",
  },

  languageChoiceRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },

  languageChoiceRowCompact: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },

  languageChoiceButton: {
    minHeight: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 12px",
    border: "1px solid rgba(216,174,92,0.25)",
    borderRadius: 0,
    background: "rgba(6,8,6,0.46)",
    color: "rgba(245,230,192,0.82)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  languageChoiceButtonActive: {
    border: "1px solid rgba(232, 198, 112, 0.82)",
    color: "#fff0bd",
    background:
      "linear-gradient(180deg, rgba(104, 79, 35, 0.74), rgba(22, 18, 12, 0.76))",
    boxShadow: "0 0 14px rgba(232,198,112,0.18)",
  },

  languageChoiceFlag: {
    width: 28,
    height: 17,
    objectFit: "cover",
    filter: "saturate(0.92) contrast(1.02)",
    boxShadow: "0 2px 5px rgba(0,0,0,0.56)",
  },

  guestEntryLabel: {
    color: "rgba(245,230,192,0.82)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  guestEntryInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 14px",
    border: "1px solid rgba(216,174,92,0.32)",
    borderRadius: 0,
    outline: "none",
    color: "#fff8df",
    background: "rgba(5,7,5,0.66)",
    fontSize: 19,
    fontWeight: 800,
    letterSpacing: 0.2,
    boxShadow: "inset 0 0 18px rgba(0,0,0,0.42)",
  },

  authModalInput: {
    padding: "7px 10px",
    fontSize: 15,
  },

  guestPrimaryButton: {
    cursor: "pointer",
    minHeight: 48,
    border: "none",
    borderRadius: 0,
    backgroundColor: "#7b5a24",
    backgroundImage: `linear-gradient(180deg, rgba(234, 190, 94, 0.48), rgba(84, 58, 20, 0.82)), url(${buttonImage})`,
    backgroundSize: "100% 100%",
    color: "#fff0c2",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.86)",
  },

  guestSecondaryActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  guestDisabledButton: {
    minHeight: 38,
    border: "none",
    borderRadius: 0,
    backgroundColor: "#4b4d4e",
    backgroundImage: `linear-gradient(180deg, rgba(156, 159, 154, 0.34), rgba(45, 48, 49, 0.70)), url(${buttonImage})`,
    backgroundSize: "100% 100%",
    color: "rgba(236,232,218,0.58)",
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  guestSecondaryButton: {
    cursor: "pointer",
    minHeight: 38,
    border: "none",
    borderRadius: 0,
    backgroundColor: "#4b4d4e",
    backgroundImage: `linear-gradient(180deg, rgba(156, 159, 154, 0.40), rgba(45, 48, 49, 0.76)), url(${buttonImage})`,
    backgroundSize: "100% 100%",
    color: "rgba(236,232,218,0.84)",
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.86)",
  },

  authModalPrimaryButton: {
    minHeight: 36,
    fontSize: 14,
  },

  guestModeButtonActive: {
    backgroundColor: "#7f6330",
    backgroundImage: `linear-gradient(180deg, rgba(234, 190, 94, 0.44), rgba(84, 58, 20, 0.82)), url(${buttonImage})`,
    color: "#fff3c8",
  },

  guestAuthHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  guestAuthTitle: {
    color: "var(--brass-400)",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  guestAuthBackButton: {
    cursor: "pointer",
    minWidth: 98,
    minHeight: 34,
    border: "none",
    borderRadius: 0,
    backgroundColor: "#4b4d4e",
    backgroundImage: `linear-gradient(180deg, rgba(156, 159, 154, 0.34), rgba(45, 48, 49, 0.70)), url(${buttonImage})`,
    backgroundSize: "100% 100%",
    color: "rgba(236,232,218,0.82)",
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  guestEntryNote: {
    margin: 0,
    color: "rgba(244,229,191,0.68)",
    fontSize: 13,
    lineHeight: 1.45,
    textAlign: "center",
  },

  authModalNote: {
    fontSize: 12,
    lineHeight: 1.25,
  },

  guestEntryError: {
    margin: 0,
    padding: "10px 12px",
    color: "#ffd0c8",
    background: "rgba(90, 16, 10, 0.58)",
    boxShadow: "inset 0 0 0 1px rgba(255, 127, 105, 0.24)",
    fontSize: 13,
    fontWeight: 800,
    textAlign: "center",
  },

  guestServerNotice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    color: "#ffd7c9",
    fontSize: 12,
    fontWeight: 900,
  },

  matchmakingScreen: {
    position: "relative",
    zIndex: 4,
    minHeight: "100cqh",
    display: "grid",
    gridTemplateRows: "108px minmax(0, 1fr) 116px",
    padding: "0 5cqw 22px",
    boxSizing: "border-box",
  },

  matchmakingHeader: {
    display: "grid",
    placeItems: "center",
    paddingTop: 18,
  },

  matchmakingTitle: {
    margin: 0,
    color: "#f4db9a",
    fontSize: "clamp(22px, 3cqw, 42px)",
    lineHeight: 1,
    fontWeight: 1000,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    textShadow:
      "0 3px 0 rgba(0,0,0,0.92), 0 0 24px rgba(213, 151, 54, 0.24)",
  },

  matchmakingArena: {
    position: "relative",
    minHeight: 0,
    display: "grid",
    alignItems: "center",
    gap: "clamp(22px, 3.6cqw, 62px)",
  },

  matchmakingArenaSearching: {
    gridTemplateColumns: "minmax(240px, 0.78fr) minmax(360px, 1.22fr)",
  },

  matchmakingArenaMatched: {
    gridTemplateColumns:
      "minmax(240px, 0.92fr) minmax(190px, 0.58fr) minmax(240px, 0.92fr)",
  },

  matchmakingSide: {
    position: "relative",
    height: "min(40cqh, 570px)",
    minHeight: 390,
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
    alignItems: "stretch",
    justifyItems: "center",
    overflow: "visible",
    isolation: "isolate",
  },

  matchmakingPortraitStage: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    minHeight: 0,
    display: "grid",
    alignItems: "end",
    justifyItems: "center",
    isolation: "isolate",
  },

  matchmakingFlag: {
    position: "absolute",
    inset: "4% -16% 20%",
    zIndex: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: 0.42,
    filter: "saturate(1.18) contrast(0.94)",
    transform: "scaleX(1.04) scaleY(1)",
    WebkitMaskImage:
      "radial-gradient(ellipse at center, #000 0%, #000 30%, rgba(0,0,0,0.48) 48%, transparent 78%)",
    maskImage:
      "radial-gradient(ellipse at center, #000 0%, #000 30%, rgba(0,0,0,0.48) 48%, transparent 78%)",
  },

  matchmakingUsaFlag: {
    // Match the nation filters: crop from 25% of the image width so the canton
    // and stars stay visible instead of showing only the central stripes.
    backgroundPosition: "25% center",
  },

  matchmakingPortrait: {
    position: "relative",
    zIndex: 1,
    width: "min(64%, 340px)",
    height: "100%",
    objectFit: "contain",
    objectPosition: "center bottom",
    filter:
      "drop-shadow(0 24px 30px rgba(0,0,0,0.74)) drop-shadow(0 0 20px rgba(225, 178, 82, 0.12))",
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 80%, rgba(0,0,0,0.5) 92%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 80%, rgba(0,0,0,0.5) 92%, transparent 100%)",
  },

  matchmakingPortraitPlaceholder: {
    position: "relative",
    zIndex: 1,
    width: "min(74%, 340px)",
    minHeight: 220,
    display: "grid",
    placeItems: "center",
    padding: 22,
    color: "var(--brass-400)",
    fontFamily: "var(--font-display)",
    fontSize: "var(--fs-title)",
    fontWeight: "var(--fw-bold)",
    letterSpacing: "var(--ls-title)",
    textAlign: "center",
    textTransform: "uppercase",
    background:
      "linear-gradient(180deg, rgba(44, 38, 24, 0.62), rgba(10, 10, 8, 0.72))",
    boxSizing: "border-box",
  },

  matchmakingName: {
    position: "relative",
    zIndex: 3,
    color: "var(--brass-400)",
    fontFamily: "var(--font-display)",
    fontSize: "var(--fs-title)",
    fontWeight: "var(--fw-bold)",
    letterSpacing: "var(--ls-title)",
    lineHeight: 1.04,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 3px 10px rgba(0,0,0,0.95)",
  },

  matchmakingDetails: {
    position: "relative",
    zIndex: 4,
    width: "84%",
    minHeight: 92,
    marginTop: 8,
    display: "grid",
    alignContent: "start",
    justifyItems: "stretch",
    gap: 7,
  },

  matchmakingIdentity: {
    position: "relative",
    zIndex: 3,
    display: "grid",
    justifyItems: "center",
    gap: 3,
    color: "#f7ddb0",
    fontSize: "clamp(14px, 1.25cqw, 19px)",
    fontWeight: 800,
    letterSpacing: 0.6,
    lineHeight: 1.12,
    textAlign: "center",
    textShadow: "0 3px 10px rgba(0,0,0,0.95)",
  },

  matchmakingMapPanel: {
    position: "relative",
    height: "min(54cqh, 510px)",
    minHeight: 330,
    display: "grid",
    placeItems: "center",
    overflow: "visible",
    background: "transparent",
  },

  matchmakingMap: {
    position: "relative",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    filter: "saturate(0.9) contrast(1.04)",
  },

  matchmakingReticle: {
    position: "absolute",
    zIndex: 2,
    width: "clamp(64px, 8cqw, 116px)",
    height: "clamp(64px, 8cqw, 116px)",
    objectFit: "contain",
    transform: "translate(-50%, -50%)",
    filter:
      "drop-shadow(0 0 16px rgba(209, 36, 22, 0.42)) drop-shadow(0 3px 10px rgba(0,0,0,0.76))",
    pointerEvents: "none",
  },

  matchmakingBreak: {
    width: "min(25cqw, 360px)",
    maxHeight: "62cqh",
    objectFit: "contain",
    justifySelf: "center",
    filter:
      "drop-shadow(0 18px 24px rgba(0,0,0,0.7)) drop-shadow(0 0 18px rgba(224, 174, 76, 0.18))",
  },

  matchmakingOpponentLabel: {
    position: "absolute",
    top: 8,
    left: "8%",
    right: "8%",
    zIndex: 3,
    color: "#f7ddb0",
    fontSize: "clamp(15px, 1.5cqw, 22px)",
    fontWeight: 1000,
    letterSpacing: 1.2,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 3px 12px rgba(0,0,0,0.92)",
  },

  matchmakingFooter: {
    position: "relative",
    zIndex: 20,
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    gap: 12,
    pointerEvents: "auto",
  },

  matchmakingTimer: {
    position: "relative",
    zIndex: 21,
    minWidth: 310,
    padding: "10px 22px",
    color: "#f8e7b8",
    fontSize: 18,
    fontWeight: 1000,
    letterSpacing: 1.8,
    textAlign: "center",
    textTransform: "uppercase",
    background:
      "linear-gradient(90deg, transparent, rgba(18, 17, 12, 0.72) 18%, rgba(40, 34, 20, 0.78) 50%, rgba(18, 17, 12, 0.72) 82%, transparent)",
    textShadow: "0 2px 8px rgba(0,0,0,0.9)",
  },

  radioDuelMenuHeader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    textAlign: "center",
    transform: "translateY(-30px)",
  },

  radioDuelMenuLayer: {
    height: "100%",
    justifyContent: "flex-start",
    padding: "clamp(10px, 10.5cqh, 100px) 24px clamp(24px, 4cqh, 38px)",
    fontFamily: "var(--font-body)",
    overflow: "visible",
  },

  radioDuelMenuSubtitle: {
    color: "#bba778",
    fontSize: "clamp(15px, 2.35cqh, 23px)",
    fontWeight: 900,
    letterSpacing: 1.5,
    textShadow: "0 2px 3px rgba(0,0,0,.9)",
  },

  radioDuelMenuCount: {
    marginTop: 8,
    color: "#dfc98e",
    fontSize: "clamp(13px, 1.9cqh, 18px)",
    letterSpacing: 0.4,
  },

  radioDuelCarouselViewport: {
    maxWidth: "clamp(1048px, 82cqw, 1370px)",
    margin: "0 auto",
    padding: "10px 40px 16px",
    transform: "translateY(-25px)",
  },

  radioDuelCarouselTrack: {
    gap: "clamp(22px, 3.3cqw, 40px)",
    alignItems: "center",
  },

  radioDuelCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: "0 0 auto",
    width: "clamp(270px, min(27cqw, 42cqh), 380px)",
    height: "auto",
    aspectRatio: "3 / 4",
    boxSizing: "border-box",
    padding: 0,
    overflow: "hidden",
    border: "1px solid rgba(211, 183, 111, 0.72)",
    borderRadius: 10,
    backgroundColor: "#171813",
    backgroundImage: `linear-gradient(180deg, rgba(45,45,37,.46), rgba(10,11,9,.84)), url("${radioDarkMetalImage}")`,
    backgroundSize: "100% 100%, 520px 520px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "multiply, normal",
    color: "#f8edcf",
    fontFamily: "var(--font-body)",
    textAlign: "left",
    cursor: "pointer",
    scrollSnapAlign: "center",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.035), 0 16px 36px rgba(0,0,0,.56)",
  },

  radioDuelCardActive: {
    border: "2px solid #d7bd6d",
  },

  radioDuelCardWarning: {
    border: "2px solid #b35f42",
  },

  radioDuelCardUnread: {
    boxShadow: "inset 0 0 0 1px rgba(255,241,186,.12), 0 0 26px rgba(232,199,101,.48), 0 14px 34px rgba(0,0,0,.42)",
  },

  radioDuelStatusHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 clamp(31px, 4.6cqh, 38px)",
    width: "100%",
    backgroundColor: "#383d3d",
    backgroundImage: `linear-gradient(180deg, rgba(126,134,133,.42), rgba(18,21,20,.72)), url("${radioDarkMetalImage}")`,
    backgroundSize: "100% 100%, 460px 460px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "soft-light, normal",
    color: "#d3d3cf",
    fontSize: "clamp(15px, 2.15cqh, 21px)",
    fontWeight: 1000,
    letterSpacing: 1.1,
    textShadow: "0 2px 2px rgba(0,0,0,.9)",
    boxShadow: "inset 0 1px rgba(229,207,139,.2), inset 0 -5px 9px rgba(0,0,0,.28)",
  },

  radioDuelStatusHeaderActive: {
    backgroundColor: "#48512b",
    backgroundImage: `linear-gradient(180deg, rgba(195,196,118,.3), rgba(31,38,18,.72)), url("${radioOliveMetalImage}")`,
    backgroundSize: "100% 100%, 460px 460px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "soft-light, multiply",
    color: "#f2dda1",
  },

  radioDuelStatusHeaderWarning: {
    backgroundColor: "#6b3028",
    backgroundImage: `linear-gradient(180deg, rgba(189,116,83,.24), rgba(43,16,14,.76)), url("${radioRedMetalImage}")`,
    backgroundSize: "100% 100%, 460px 460px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "soft-light, multiply",
    color: "#efd19f",
  },

  radioDuelTimerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 clamp(28px, 4cqh, 34px)",
    gap: 7,
    background: "rgba(10,11,9,.9)",
    color: "#d5bf83",
    fontSize: "clamp(12px, 1.65cqh, 16px)",
    letterSpacing: 0.3,
  },

  radioDuelTimerRowWarning: {
    backgroundColor: "#321714",
    backgroundImage: `linear-gradient(180deg, rgba(126,57,43,.2), rgba(14,8,7,.82)), url("${radioRedMetalImage}")`,
    backgroundSize: "100% 100%, 520px 520px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "multiply, multiply",
    color: "#e0bd8b",
  },

  radioDuelClockIcon: {
    color: "#d9bc69",
    fontSize: "1.35em",
    lineHeight: 1,
  },

  radioDuelBattleArt: {
    position: "relative",
    display: "block",
    flex: "1 1 auto",
    minHeight: 0,
    width: "100%",
    overflow: "hidden",
    borderTop: "1px solid rgba(214,191,130,.18)",
    borderBottom: "1px solid rgba(214,191,130,.28)",
  },

  radioDuelAvatar: {
    position: "absolute",
    zIndex: 2,
    display: "block",
    bottom: 0,
    width: "56%",
    height: "88%",
    objectFit: "contain",
    objectPosition: "center bottom",
    filter: "sepia(.12) saturate(.83) contrast(1.04) drop-shadow(0 8px 8px rgba(0,0,0,.82))",
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  },

  radioDuelAvatarLeft: {
    left: -4,
  },

  radioDuelAvatarRight: {
    right: -4,
  },

  radioDuelVsImage: {
    position: "absolute",
    zIndex: 4,
    top: "48%",
    left: "50%",
    width: "42%",
    height: "88%",
    objectFit: "contain",
    transform: "translate(-50%, -50%)",
    filter: "drop-shadow(0 4px 4px rgba(0,0,0,.75))",
  },

  radioDuelNamesRow: {
    position: "absolute",
    zIndex: 5,
    left: 0,
    right: 0,
    bottom: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
    alignItems: "center",
    gap: 7,
    minHeight: 38,
    padding: "5px 10px",
    background: "transparent",
  },

  radioDuelPlayerName: {
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    color: "#f2e4bd",
    fontSize: "clamp(14px, 1.9cqh, 20px)",
    lineHeight: 1.1,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textShadow: "0 2px 3px rgba(0,0,0,.95)",
  },

  radioDuelTurnChip: {
    padding: "4px 10px",
    border: "1px solid rgba(195,164,88,.66)",
    borderRadius: 4,
    backgroundColor: "rgba(29,29,22,.92)",
    backgroundImage: `linear-gradient(180deg, rgba(103,105,88,.22), rgba(10,10,8,.5)), url("${radioDarkMetalImage}")`,
    backgroundSize: "100% 100%, 420px 420px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "soft-light, normal",
    color: "#e1c98c",
    fontSize: "clamp(11px, 1.45cqh, 15px)",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  radioDuelTurnChipActive: {
    backgroundColor: "#3f4927",
    backgroundImage: `linear-gradient(180deg, rgba(186,190,112,.24), rgba(25,31,15,.68)), url("${radioOliveMetalImage}")`,
    backgroundBlendMode: "soft-light, multiply",
  },

  radioDuelTurnChipWarning: {
    backgroundColor: "#632e25",
    backgroundImage: `linear-gradient(180deg, rgba(183,105,74,.2), rgba(39,14,12,.72)), url("${radioRedMetalImage}")`,
    backgroundBlendMode: "soft-light, multiply",
  },

  radioDuelStatsRow: {
    display: "grid",
    gridTemplateColumns: "clamp(54px, 7cqh, 66px) minmax(0, 1fr) minmax(0, 1fr) clamp(54px, 7cqh, 66px)",
    alignItems: "center",
    flex: "0 0 clamp(70px, 10cqh, 84px)",
    width: "100%",
    padding: "4px 8px 2px",
    backgroundColor: "#171813",
    backgroundImage: `linear-gradient(180deg, rgba(50,50,41,.28), rgba(7,8,6,.72)), url("${radioDarkMetalImage}")`,
    backgroundSize: "100% 100%, 520px 520px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "multiply, normal",
    boxSizing: "border-box",
  },

  radioDuelHpShield: {
    position: "relative",
    display: "block",
    width: "100%",
    aspectRatio: "1 / 1",
  },

  radioDuelHpShieldImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    filter: "drop-shadow(0 4px 3px rgba(0,0,0,.72))",
  },

  radioDuelHpValue: {
    position: "absolute",
    top: "50%",
    left: "50%",
    color: "#f0dfa9",
    fontSize: "clamp(19px, 2.7cqh, 28px)",
    lineHeight: 1,
    transform: "translate(-50%, -50%)",
    textShadow: "0 2px 3px rgba(0,0,0,.95)",
    zIndex: 4,
  },

  radioDuelDeckStat: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    color: "#c9b98d",
    fontSize: "clamp(10px, 1.45cqh, 14px)",
    lineHeight: 1.1,
  },

  radioDuelDeckValue: {
    color: "#ddca92",
    fontSize: "clamp(14px, 2.1cqh, 20px)",
    lineHeight: 1,
  },

  radioDuelActionBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 clamp(39px, 5.7cqh, 48px)",
    margin: "7px 12px 10px",
    border: "1px solid rgba(195,198,193,.36)",
    borderRadius: 4,
    backgroundColor: "#373c3c",
    backgroundImage: `linear-gradient(180deg, rgba(128,135,132,.34), rgba(18,21,20,.74)), url("${radioDarkMetalImage}")`,
    backgroundSize: "100% 100%, 480px 480px",
    backgroundPosition: "center, center",
    backgroundRepeat: "no-repeat, repeat",
    backgroundBlendMode: "soft-light, normal",
    color: "#dedbd0",
    fontSize: "clamp(14px, 2.2cqh, 21px)",
    fontWeight: 1000,
    letterSpacing: 0.7,
    textShadow: "0 2px 2px rgba(0,0,0,.95)",
    boxShadow: "inset 0 1px rgba(255,255,255,.13), 0 3px 5px rgba(0,0,0,.55)",
  },

  radioDuelActionBarActive: {
    borderColor: "rgba(207,190,116,.65)",
    backgroundColor: "#4b562f",
    backgroundImage: `linear-gradient(180deg, rgba(210,207,128,.32), rgba(25,32,16,.72)), url("${radioOliveMetalImage}")`,
    backgroundBlendMode: "soft-light, multiply",
    color: "#f2e2af",
    boxShadow: "inset 0 1px rgba(241,218,147,.3), inset 0 -7px 10px rgba(0,0,0,.3), 0 3px 5px rgba(0,0,0,.55)",
  },

  radioDuelActionBarWarning: {
    borderColor: "rgba(209,135,91,.7)",
    backgroundColor: "#693127",
    backgroundImage: `linear-gradient(180deg, rgba(190,111,77,.26), rgba(41,14,12,.76)), url("${radioRedMetalImage}")`,
    backgroundBlendMode: "soft-light, multiply",
    color: "#f1d4ae",
    boxShadow: "inset 0 1px rgba(235,184,127,.24), inset 0 -7px 10px rgba(0,0,0,.34), 0 3px 5px rgba(0,0,0,.58)",
  },

  radioDuelQueueCard: {
    cursor: "default",
  },

  radioDuelQueueCancelButton: {
    width: "calc(100% - 24px)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
  },

  radioDuelNewBattleCard: {
    padding: 0,
    borderColor: "rgba(225, 197, 121, 0.7)",
    background: "#151b1b",
    scrollSnapAlign: "center",
  },

  radioDuelNewBattleImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  radioDuelMenuButton: {
    fontFamily: "var(--font-body)",
  },

  profileLayer: {
    width: "min(980px, calc(100cqw - 64px))",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    gap: 12,
    paddingTop: 22,
    zIndex: 8,
  },

  profileBackButton: {
    position: "absolute",
    top: 10,
    right: 12,
    zIndex: 3,
    width: 96,
    minHeight: 34,
    padding: "6px 12px 8px",
    fontSize: 11,
    lineHeight: 1,
  },

  profileRegisterButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    zIndex: 3,
    cursor: "pointer",
    minHeight: 34,
    padding: "6px 18px 8px",
    border: "none",
    borderRadius: 0,
    backgroundColor: "#7b5a24",
    backgroundImage: `linear-gradient(180deg, rgba(234, 190, 94, 0.5), rgba(84, 58, 20, 0.86)), url(${buttonImage})`,
    backgroundSize: "100% 100%",
    color: "#fff0c2",
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.86)",
  },

  authModalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 6000,
    display: "grid",
    placeItems: "center",
    background: "rgba(3, 4, 5, 0.72)",
    backdropFilter: "blur(3px)",
    overflow: "hidden",
  },

  authModalPanel: {
    // Absolutely centered (top/left 50% + translate(-50%,-50%) in the transform)
    // so it stays centered even when the fixed design width is larger than a
    // phone's portrait viewport — grid `place-items: center` aligns oversized
    // items to the start, which left the panel off-centre after rotation.
    // Authored in fixed design px so the stage transform scales it like the rest
    // of the game; vw/vh here would resolve against the raw (rotated) viewport.
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 600,
    maxHeight: 680,
    overflowY: "auto",
    display: "grid",
    gap: 7,
    padding: "12px 18px 14px",
    border: "1px solid rgba(216,174,92,0.4)",
    background:
      "linear-gradient(180deg, rgba(34, 30, 22, 0.98), rgba(14, 12, 9, 0.98))",
    boxShadow: "0 28px 70px rgba(0,0,0,0.75)",
    color: "#f1e6d2",
    fontFamily: "var(--font-body)",
  },

  profileHero: {
    position: "relative",
    minHeight: 134,
    display: "grid",
    gridTemplateColumns: "112px 1fr",
    alignItems: "center",
    gap: 16,
    padding: "14px 22px",
    overflow: "hidden",
    background:
      "linear-gradient(90deg, rgba(7,9,8,0.82), rgba(18,17,12,0.64), rgba(7,9,8,0.26))",
    boxShadow: "0 22px 44px rgba(0,0,0,0.45)",
  },

  profileFlag: {
    position: "absolute",
    inset: -18,
    zIndex: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: 0.24,
    filter: "saturate(1.12)",
    WebkitMaskImage:
      "radial-gradient(ellipse at center, #000 0%, rgba(0,0,0,0.82) 48%, transparent 100%)",
    maskImage:
      "radial-gradient(ellipse at center, #000 0%, rgba(0,0,0,0.82) 48%, transparent 100%)",
  },

  profileAvatarFrame: {
    position: "relative",
    zIndex: 1,
    width: 104,
    height: 126,
    overflow: "hidden",
    filter: "drop-shadow(0 16px 24px rgba(0,0,0,0.82))",
  },

  profileAvatar: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "center bottom",
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.54) 91%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.54) 91%, transparent 100%)",
  },

  profileIdentity: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gap: 6,
    textShadow: "0 3px 10px rgba(0,0,0,0.92)",
  },

  profileKicker: {
    color: "#c5a45c",
    fontSize: 11,
    fontWeight: 1000,
    letterSpacing: 2.6,
    textTransform: "uppercase",
  },

  profileName: {
    margin: 0,
    color: "#fff",
    fontSize: 34,
    lineHeight: 1,
    fontWeight: 1000,
    letterSpacing: 0.6,
  },

  profileAccount: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 13,
    fontWeight: 900,
    textTransform: "uppercase",
  },

  profileLogoutButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    zIndex: 3,
    cursor: "pointer",
    width: 156,
    minHeight: 32,
    border: "none",
    borderRadius: 0,
    backgroundColor: "#4b4d4e",
    backgroundImage: `linear-gradient(180deg, rgba(156, 159, 154, 0.34), rgba(45, 48, 49, 0.74)), url(${buttonImage})`,
    backgroundSize: "100% 100%",
    color: "rgba(244,240,226,0.88)",
    fontSize: 11,
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.86)",
  },

  profileFavorite: {
    lineHeight: 1.05,
  },

  profileStatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 10,
  },

  profileStatLabelNoWrap: {
    whiteSpace: "nowrap",
  },

  profileStatCard: {
    display: "grid",
    gap: 4,
    padding: "10px 13px",
    background: "rgba(9, 12, 10, 0.72)",
    boxShadow: "inset 0 0 0 1px rgba(226, 184, 92, 0.16)",
  },

  profileSyncPanel: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    background:
      "linear-gradient(180deg, rgba(24, 48, 72, 0.74), rgba(8, 14, 22, 0.78))",
    color: "#d7ecff",
    boxShadow:
      "inset 0 0 0 1px rgba(133, 198, 255, 0.2), 0 10px 24px rgba(0,0,0,0.22)",
  },

  profileSyncPanelFailed: {
    background:
      "linear-gradient(180deg, rgba(82, 34, 28, 0.76), rgba(22, 10, 8, 0.82))",
    color: "#ffd6cc",
    boxShadow:
      "inset 0 0 0 1px rgba(236, 117, 92, 0.24), 0 10px 24px rgba(0,0,0,0.22)",
  },

  profileSyncPanelSynced: {
    background:
      "linear-gradient(180deg, rgba(35, 72, 38, 0.72), rgba(10, 23, 12, 0.82))",
    color: "#d4ffd0",
    boxShadow:
      "inset 0 0 0 1px rgba(130, 232, 120, 0.2), 0 10px 24px rgba(0,0,0,0.22)",
  },

  profileSyncText: {
    minWidth: 0,
    display: "grid",
    gap: 3,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.25,
    textShadow: "0 2px 4px rgba(0,0,0,0.72)",
  },

  profileSyncButton: {
    minWidth: 164,
    height: 34,
    padding: "0 14px",
    border: "1px solid rgba(255, 226, 163, 0.34)",
    background:
      "linear-gradient(180deg, rgba(97, 78, 42, 0.92), rgba(37, 31, 18, 0.96))",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  profileHeadquartersPanel: {
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: 6,
    padding: "10px 14px",
    background: "rgba(6, 8, 7, 0.68)",
    boxShadow: "inset 0 0 0 1px rgba(226, 184, 92, 0.14)",
  },

  profileSectionTitle: {
    margin: 0,
    color: "#f3db9f",
    fontSize: 18,
    lineHeight: 1,
    textTransform: "uppercase",
  },

  profileHeadquartersList: {
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: 8,
    paddingRight: 8,
    scrollbarWidth: "none",
  },

  profileHeadquartersRow: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "56px minmax(0, 1fr) 106px",
    alignItems: "center",
    gap: 10,
    minHeight: 68,
    padding: "7px 9px",
    overflow: "hidden",
    background: "rgba(14, 17, 14, 0.72)",
  },

  profileHeadquartersFlag: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 5,
    bottom: 5,
    zIndex: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    opacity: 0.28,
    filter: "saturate(1.08) brightness(0.82)",
    WebkitMaskImage:
      "linear-gradient(90deg, transparent 0%, #000 13%, #000 87%, transparent 100%)",
    maskImage:
      "linear-gradient(90deg, transparent 0%, #000 13%, #000 87%, transparent 100%)",
  },

  profileMiniAvatar: {
    position: "relative",
    zIndex: 1,
    width: 54,
    height: 62,
    objectFit: "contain",
    objectPosition: "center bottom",
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.5) 92%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.5) 92%, transparent 100%)",
  },

  profileHeadquartersText: {
    position: "relative",
    zIndex: 1,
    minWidth: 0,
    display: "grid",
    gap: 4,
    color: "#e9d4a2",
    fontSize: 13,
  },

  profileHeadquartersName: {
    fontFamily: "var(--font-display)",
    fontSize: "var(--fs-title)",
    fontWeight: "var(--fw-bold)",
    letterSpacing: "var(--ls-title)",
    textTransform: "uppercase",
    color: "var(--brass-400)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  profileFavoriteButton: {
    position: "relative",
    zIndex: 1,
    height: 36,
    border: "none",
    background: "rgba(80, 86, 91, 0.9)",
    color: "#eee5d6",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 1000,
    textTransform: "uppercase",
  },

  profileFavoriteButtonActive: {
    color: "#fff0bd",
    background: "rgba(120, 92, 35, 0.92)",
  },

  menuLayer: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    // Wide enough for all four mode cards (Компании, Быстрый бой, ИИ, Обучение)
    // to be visible at once without scrolling.
    maxWidth: 1340,
    maxHeight: "100%",
    padding: "8px 24px 0",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    overflow: "hidden",
  },

  headquartersMenuLayer: {
    justifyContent: "flex-start",
    padding: "8px 24px 4px",
    overflowY: "auto",
    scrollbarWidth: "none",
  },

  mainMenuLayer: {
    height: "100%",
    justifyContent: "flex-start",
    padding: "94px 24px 44px",
    overflow: "visible",
  },

  mainMenuHeader: {
    marginBottom: 0,
    transform: "none",
  },

  shopLayer: {
    justifyContent: "flex-start",
    maxWidth: 1180,
    paddingTop: 58,
    gap: 14,
    overflowY: "auto",
    scrollbarWidth: "none",
  },

  shopHeader: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 72,
    textAlign: "center",
  },

  shopBackButton: {
    position: "absolute",
    right: 0,
    top: 10,
    width: 132,
    padding: "11px 18px 13px",
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    cursor: "pointer",
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
  },

  shopSubtitle: {
    margin: "6px 0 0",
    color: "rgba(238, 224, 190, 0.84)",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  shopBalanceRow: {
    alignSelf: "center",
    minWidth: 520,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1.6fr",
    alignItems: "center",
    gap: 14,
    padding: "10px 18px",
    background:
      "linear-gradient(180deg, rgba(29, 34, 33, 0.78), rgba(10, 13, 13, 0.84))",
    color: "#f8efd9",
    boxShadow:
      "0 12px 28px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(214, 173, 83, 0.18)",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  shopBalanceIcon: {
    width: 22,
    height: 22,
    objectFit: "contain",
    marginRight: 7,
    verticalAlign: "middle",
    filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.85))",
  },

  shopGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 18,
  },

  shopSection: {
    padding: 18,
    background:
      "linear-gradient(180deg, rgba(31, 35, 32, 0.82), rgba(9, 12, 11, 0.88))",
    boxShadow:
      "0 18px 40px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(224, 190, 104, 0.18)",
  },

  shopSectionTitle: {
    margin: "0 0 14px",
    color: "var(--brass-400)",
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },

  shopOfferGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },

  shopOfferCard: {
    minHeight: 132,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: "14px 12px",
    border: "1px solid rgba(214, 173, 83, 0.25)",
    background:
      "radial-gradient(circle at center, rgba(179, 137, 53, 0.22), transparent 68%), linear-gradient(180deg, rgba(36, 38, 35, 0.92), rgba(15, 16, 15, 0.96))",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.4,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    boxShadow: "0 12px 24px rgba(0,0,0,0.3)",
  },

  shopOfferCardDisabled: {
    opacity: 0.52,
    cursor: "not-allowed",
    filter: "grayscale(0.42)",
  },

  shopOfferIcon: {
    width: 48,
    height: 48,
    objectFit: "contain",
    filter: "drop-shadow(0 4px 5px rgba(0,0,0,0.82))",
  },

  shopRubPrice: {
    color: "#f8efd9",
    fontFamily: "var(--font-display)",
    fontSize: 21,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textShadow: "0 2px 0 rgba(0,0,0,0.92)",
  },

  shopPremiumPrice: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    color: "#fce7a9",
  },

  shopPremiumPriceIcon: {
    width: 20,
    height: 20,
    objectFit: "contain",
    filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.85))",
  },

  shopGuestHint: {
    display: "grid",
    gap: 6,
    marginBottom: 12,
    padding: "12px 16px",
    background: "rgba(46, 31, 8, 0.72)",
    color: "rgba(255, 240, 205, 0.92)",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
    boxShadow: "inset 0 0 0 1px rgba(224, 190, 104, 0.32)",
  },

  shopStatusMessage: {
    alignSelf: "center",
    maxWidth: 720,
    padding: "10px 16px",
    background: "rgba(19, 24, 22, 0.82)",
    color: "#fff0bd",
    fontSize: 13,
    fontWeight: 900,
    textAlign: "center",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    boxShadow: "inset 0 0 0 1px rgba(224, 190, 104, 0.2)",
  },
  shopPackVisual: {
    position: "relative",
    width: 190,
    height: 122,
    margin: "0 auto 4px",
  },
  shopPackMiniCard: {
    position: "absolute",
    left: 18,
    top: -56,
    width: 168,
    height: 230,
    transform: "scale(0.48) rotate(-5deg)",
    transformOrigin: "center center",
    pointerEvents: "none",
    zIndex: 2,
  },
  shopPackMiniBack: {
    position: "absolute",
    left: 91,
    top: 9,
    width: 68,
    height: 96,
    objectFit: "cover",
    borderRadius: 7,
    transform: "rotate(6deg)",
    boxShadow: "0 8px 16px rgba(0,0,0,0.62)",
    zIndex: 1,
  },
  shopPackMiniGold: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 48,
    height: 48,
    objectFit: "contain",
    filter: "drop-shadow(0 5px 7px rgba(0,0,0,0.8))",
    zIndex: 3,
  },

  packPreviewBackdrop: {
    position: "absolute",
    // Start below the top HUD (account panel ~98px, settings buttons) so the
    // preview doesn't cover the player's account status and settings controls.
    // Top/bottom shifted up 40px together to keep the same size but sit higher.
    inset: "64px 0 20px 0",
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
  },
  packPreviewPanel: {
    position: "absolute",
    inset: "64px 0 20px 0",
    boxSizing: "border-box",
    padding: "32px 48px",
    overflow: "hidden",
    background: "linear-gradient(145deg, #35362f 0%, #20231f 48%, #111310 100%)",
    color: "#f4e4b5",
    boxShadow: "inset 0 0 0 1px rgba(224,190,104,0.45)",
  },
  packPreviewClose: {
    position: "absolute",
    right: 12,
    top: 8,
    border: 0,
    background: "transparent",
    color: "#f4e4b5",
    fontSize: 28,
    cursor: "pointer",
  },
  packPreviewTitle: { margin: "8px 0 28px", textAlign: "center", fontSize: 34 },
  packPreviewContent: { display: "flex", minHeight: "calc(100% - 190px)", alignItems: "flex-start", justifyContent: "center", gap: 54 },
  packPreviewCard: { width: MISSION_REWARD_CARD_WIDTH, height: MISSION_CARD_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" },
  packPreviewBack: { width: MISSION_REWARD_CARD_WIDTH, height: MISSION_CARD_HEIGHT, objectFit: "cover", borderRadius: 16, boxShadow: "0 18px 38px rgba(0,0,0,0.65)" },
  packPreviewDetails: { display: "grid", gap: 16, minWidth: 270, fontSize: 21 },
  packPreviewBuyButton: {
    marginTop: 8,
    minHeight: 44,
    border: "1px solid rgba(244,205,105,0.65)",
    background: "linear-gradient(180deg, #765d23, #3d2d0e)",
    color: "#fff0bd",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },

  exchangeBalanceRow: {
    alignSelf: "center",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    alignItems: "center",
    gap: 14,
    minWidth: 360,
    padding: "10px 22px",
    background:
      "linear-gradient(180deg, rgba(29, 34, 33, 0.78), rgba(10, 13, 13, 0.84))",
    color: "#f8efd9",
    boxShadow:
      "0 12px 28px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(214, 173, 83, 0.18)",
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0.5,
  },

  exchangeBalanceCell: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontVariantNumeric: "tabular-nums",
  },

  exchangeCard: {
    alignSelf: "center",
    width: "min(560px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: 22,
    background:
      "linear-gradient(180deg, rgba(31, 35, 32, 0.82), rgba(9, 12, 11, 0.88))",
    boxShadow:
      "0 18px 40px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(224, 190, 104, 0.18)",
  },

  exchangeFlow: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 14,
  },

  exchangeSide: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "14px 10px",
    border: "1px solid rgba(214, 173, 83, 0.22)",
    background:
      "radial-gradient(circle at center, rgba(179, 137, 53, 0.18), transparent 70%), linear-gradient(180deg, rgba(36, 38, 35, 0.9), rgba(15, 16, 15, 0.95))",
  },

  exchangeSideIcon: {
    width: 46,
    height: 46,
    objectFit: "contain",
    filter: "drop-shadow(0 4px 5px rgba(0,0,0,0.82))",
  },

  exchangeSideValue: {
    color: "#f8efd9",
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "0.02em",
    fontVariantNumeric: "tabular-nums",
    textShadow: "0 2px 0 rgba(0,0,0,0.92)",
  },

  exchangeSideLabel: {
    color: "rgba(238, 224, 190, 0.78)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  exchangeArrow: {
    color: "var(--brass-400)",
    fontSize: 30,
    fontWeight: 900,
    textShadow: "0 2px 6px rgba(0,0,0,0.8)",
  },

  exchangeStepper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  exchangeStepButton: {
    width: 42,
    height: 42,
    flex: "0 0 auto",
    border: "1px solid rgba(214, 173, 83, 0.3)",
    background:
      "linear-gradient(180deg, rgba(46, 48, 44, 0.95), rgba(18, 19, 18, 0.98))",
    color: "#fff0bd",
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1,
    cursor: "pointer",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
  },

  exchangeInput: {
    width: 140,
    height: 42,
    textAlign: "center",
    border: "1px solid rgba(214, 173, 83, 0.3)",
    background: "rgba(8, 10, 9, 0.9)",
    color: "#fce7a9",
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },

  exchangePresetRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },

  exchangePresetButton: {
    minWidth: 52,
    padding: "8px 14px",
    border: "1px solid rgba(214, 173, 83, 0.25)",
    background:
      "linear-gradient(180deg, rgba(40, 42, 39, 0.92), rgba(16, 17, 16, 0.96))",
    color: "#fff0bd",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    cursor: "pointer",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
  },

  exchangeConfirmButton: {
    minHeight: 52,
    padding: "12px 16px",
    border: "1px solid rgba(214, 173, 83, 0.4)",
    background:
      "radial-gradient(circle at center, rgba(179, 137, 53, 0.32), transparent 70%), linear-gradient(180deg, rgba(58, 47, 18, 0.96), rgba(24, 19, 8, 0.98))",
    color: "#fff0bd",
    fontSize: 15,
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    cursor: "pointer",
    textShadow: "0 2px 0 rgba(0,0,0,0.84)",
    boxShadow: "0 12px 24px rgba(0,0,0,0.3)",
  },

  exchangeShopLink: {
    alignSelf: "center",
    border: "none",
    background: "transparent",
    color: "rgba(238, 224, 190, 0.82)",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    textDecoration: "underline",
    cursor: "pointer",
  },

  header: {
    textAlign: "center",
    marginBottom: 8,
    transform: "translateY(-20px)",
    textShadow: "0 2px 12px rgba(0,0,0,0.86)",
  },

  headquartersHeader: {
    minHeight: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
    transform: "none",
  },

  kicker: {
    marginBottom: 6,
    color: "#d7b665",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 3.2,
    textTransform: "uppercase",
  },

  title: {
    margin: 0,
    color: "#ffe9a8",
    fontSize: "clamp(34px, 5cqh, 48px)",
    lineHeight: 1.08,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 22px rgba(247, 215, 116, 0.26)",
  },

  headquartersTitle: {
    fontSize: "clamp(28px, 4cqh, 42px)",
    lineHeight: 1.04,
  },

  subtitle: {
    margin: "7px auto 0",
    fontSize: 14,
    lineHeight: 1.35,
    color: "rgba(244, 229, 191, 0.82)",
  },

  headquartersSubtitle: {
    marginTop: 4,
    fontSize: 13,
  },

  carouselViewport: {
    width: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    padding: "38px 40px 12px",
    boxSizing: "border-box",
    WebkitOverflowScrolling: "touch",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "none",
    cursor: "grab",
    userSelect: "none",
    // Custom JS drag-scroller inside the rotatable stage: disable native panning
    // entirely so the pointer handlers receive the gesture on any orientation.
    // (pan-y would let the browser steal the physical-vertical swipe that scrolls
    // this carousel when the stage is rotated 90° on a portrait phone.)
    touchAction: "none",
  },

  tutorialCarouselViewport: {
    padding: "30px 40px 16px",
  },

  headquartersCarouselViewport: {
    padding: "30px 58px 8px",
  },

  carouselShell: {
    position: "relative",
    width: "max(280px, calc(100% - 104px))",
    maxWidth: "100%",
    margin: "0 auto",
  },

  carouselTapZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 12,
    width: 42,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "rgba(255, 233, 168, 0.76)",
    cursor: "pointer",
  },

  carouselTapZoneLeft: {
    left: -46,
  },

  carouselTapZoneRight: {
    right: -46,
  },

  carouselTapArrow: {
    display: "block",
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1,
    textShadow: "0 3px 12px rgba(0,0,0,0.9)",
  },

  carouselTrack: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 36,
    minWidth: "max-content",
    margin: "0 auto",
  },

  mainMenuTrack: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 8,
    minWidth: "max-content",
    margin: "0 auto",
  },

  tutorialMenuTrack: {
    gap: 30,
  },

  headquartersOption: {
    position: "relative",
    flex: "0 0 auto",
    width: MENU_CARD_WIDTH + 44,
    minHeight: MENU_CARD_HEIGHT + 72,
    padding: "10px 22px 18px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f8e3ae",
    cursor: "pointer",
    textAlign: "center",
    scrollSnapAlign: "center",
    boxSizing: "border-box",
  },

  headquartersDeckCaption: {
    position: "relative",
    zIndex: 3,
    width: MENU_CARD_WIDTH,
    minHeight: 42,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 8,
    margin: "10px auto 0",
    padding: "7px 10px",
    border: "1px solid rgba(220, 184, 96, 0.34)",
    borderRadius: 4,
    background:
      "linear-gradient(180deg, rgba(49, 42, 26, 0.94), rgba(14, 16, 12, 0.94))",
    color: "#f8e3ae",
    boxShadow: "0 8px 18px rgba(0,0,0,0.24)",
    boxSizing: "border-box",
  },

  headquartersDeckName: {
    overflow: "hidden",
    color: "#ffe9a8",
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 0.35,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "center",
    textTransform: "uppercase",
  },

  headquartersDeckCount: {
    color: "#d7b665",
    fontSize: 10,
    fontWeight: 1000,
    letterSpacing: 0.65,
    textTransform: "uppercase",
  },

  headquartersOptionDisabled: {
    cursor: "default",
    opacity: 0.72,
  },

  campaignEntryOption: {
    position: "relative",
    flex: "0 0 auto",
    width: MAIN_MENU_CARD_WIDTH + 12,
    height: MAIN_MENU_CARD_HEIGHT + 20,
    padding: "6px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f8e3ae",
    cursor: "pointer",
    textAlign: "center",
    scrollSnapAlign: "center",
    boxSizing: "border-box",
  },

  tutorialEntryOption: {
    width: TUTORIAL_CARD_WIDTH + 44,
    height: TUTORIAL_CARD_HEIGHT + 28,
  },

  campaignEntryCard: {
    position: "relative",
    width: MAIN_MENU_CARD_WIDTH,
    height: MAIN_MENU_CARD_HEIGHT,
    margin: "0 auto",
    borderRadius: 18,
    overflow: "hidden",
    background:
      "linear-gradient(160deg, rgba(73, 61, 35, 0.96), rgba(21, 24, 18, 0.98) 58%, rgba(7, 8, 6, 0.98))",
    border: "1px solid rgba(244, 209, 124, 0.42)",
    boxShadow:
      "0 18px 42px rgba(0,0,0,0.52), inset 0 0 36px rgba(255, 223, 128, 0.08)",
  },

  tutorialEntryCard: {
    width: TUTORIAL_CARD_WIDTH,
    height: TUTORIAL_CARD_HEIGHT,
    borderRadius: 16,
  },

  deckBuilderEntryCard: {
    position: "relative",
    width: MENU_CARD_WIDTH,
    height: MENU_CARD_HEIGHT,
    margin: "0 auto",
    borderRadius: 18,
    overflow: "hidden",
    background:
      "linear-gradient(160deg, rgba(73, 61, 35, 0.96), rgba(22, 25, 19, 0.98) 58%, rgba(7, 8, 6, 0.98))",
    border: "1px solid rgba(244, 209, 124, 0.42)",
    boxShadow:
      "0 18px 42px rgba(0,0,0,0.52), inset 0 0 44px rgba(255, 223, 128, 0.09)",
  },

  deckBuilderEntryMark: {
    position: "absolute",
    left: "50%",
    top: "28%",
    transform: "translateX(-50%)",
    width: 78,
    height: 78,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: "2px solid rgba(244, 209, 124, 0.62)",
    color: "#ffe9a8",
    fontSize: 54,
    fontWeight: 900,
    lineHeight: 1,
    boxShadow:
      "0 0 24px rgba(255, 219, 119, 0.12), inset 0 0 18px rgba(255, 225, 145, 0.12)",
  },

  deckBuilderEntryTitle: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "7.5%",
    zIndex: 2,
    color: "#f9e7b2",
    fontSize: 21,
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "left",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.9)",
    pointerEvents: "none",
  },

  campaignEntryImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    userSelect: "none",
    pointerEvents: "none",
  },

  campaignEntryTitleOverlay: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "7.5%",
    zIndex: 2,
    color: "#f9e7b2",
    fontSize: 21,
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "left",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.9)",
    pointerEvents: "none",
  },

  tutorialMissionLocked: {
    cursor: "default",
    filter: "grayscale(0.85) brightness(0.72)",
  },

  tutorialLessonNumber: {
    position: "absolute",
    left: "9%",
    top: "7%",
    zIndex: 2,
    color: "#f9e7b2",
    fontFamily: "var(--font-display)",
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.85)",
    pointerEvents: "none",
  },

  tutorialLockIcon: {
    position: "absolute",
    left: "50%",
    top: "40%",
    zIndex: 2,
    transform: "translate(-50%, -50%)",
    fontSize: 46,
    filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.85))",
    pointerEvents: "none",
  },

  tutorialMissionHint: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "24%",
    zIndex: 2,
    color: "#e8dcc0",
    maxHeight: "22%",
    overflow: "hidden",
    fontSize: 13.5,
    fontWeight: 600,
    lineHeight: 1.22,
    textAlign: "left",
    textShadow: "0 2px 0 rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.85)",
    pointerEvents: "none",
  },

  tutorialMissionTitleOverlay: {
    left: "7%",
    right: "7%",
    bottom: "7%",
    maxHeight: "22%",
    overflow: "hidden",
    fontSize: 22,
    lineHeight: 1.02,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    hyphens: "auto",
  },

  campaignEntryMark: {
    position: "absolute",
    left: "50%",
    top: "24%",
    transform: "translateX(-50%)",
    width: 76,
    height: 76,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: "2px solid rgba(244, 209, 124, 0.58)",
    color: "#ffe9a8",
    fontSize: 46,
    fontWeight: 1000,
    fontFamily: "var(--font-display)",
    boxShadow: "inset 0 0 18px rgba(255, 225, 145, 0.12)",
  },

  campaignEntryTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 46,
    color: "#d7b665",
    fontSize: 13,
    fontWeight: 1000,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    textShadow: "0 2px 10px rgba(0,0,0,0.9)",
  },

  campaignEntryLine: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 34,
    height: 1,
    background:
      "linear-gradient(90deg, transparent, rgba(244, 209, 124, 0.72), transparent)",
  },

  campaignEntryLabel: {
    marginTop: 10,
    color: "#ffe9a8",
    fontSize: 18,
    fontWeight: 1000,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textShadow: "0 3px 12px rgba(0,0,0,0.9)",
  },

  selectionGlow: {
    position: "absolute",
    left: "50%",
    top: 12,
    width: MENU_CARD_WIDTH + 58,
    height: MENU_CARD_HEIGHT + 30,
    transform: "translateX(-50%) scale(0.96)",
    borderRadius: 34,
    background:
      "radial-gradient(circle at 50% 48%, rgba(255, 236, 151, 0.95), rgba(247, 196, 68, 0.58) 30%, rgba(247, 185, 73, 0.22) 56%, transparent 78%)",
    filter: "blur(20px)",
    opacity: 0,
    transition: "opacity 220ms ease, transform 220ms ease",
    pointerEvents: "none",
  },

  selectionGlowVisible: {
    opacity: 1,
    transform: "translateX(-50%) scale(1.07)",
  },

  cardSlot: {
    position: "relative",
    zIndex: 2,
    width: MENU_CARD_WIDTH,
    height: MENU_CARD_HEIGHT,
    margin: "0 auto",
    overflow: "visible",
  },

  cardScaleBox: {
    position: "absolute",
    left: "50%",
    top: 0,
    width: HAND_CARD_BASE_WIDTH,
    height: HAND_CARD_BASE_HEIGHT,
    transform: `translateX(-50%) scale(${MENU_CARD_SCALE})`,
    transformOrigin: "center top",
  },

  cardBaseSize: {
    width: HAND_CARD_BASE_WIDTH,
  },

  actionsGrid: {
    width: "min(720px, calc(100cqw - 48px))",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    margin: "0 auto 8px",
  },

  button: {
    cursor: "pointer",
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(220, 184, 96, 0.48)",
    background:
      "linear-gradient(180deg, rgba(74, 58, 34, 0.94), rgba(42, 32, 19, 0.94))",
    color: "#f8e3ae",
    fontWeight: 900,
    letterSpacing: 0.3,
    boxShadow: "0 10px 22px rgba(0,0,0,0.30)",
  },

  primaryButton: {
    background:
      "linear-gradient(180deg, rgba(92, 98, 44, 0.96), rgba(48, 57, 31, 0.96))",
    color: "#fff0b8",
  },

  matchmakingAvatarPanel: {
    width: "min(720px, calc(100cqw - 48px))",
    height: "min(30cqh, 230px)",
    margin: "4px auto 0",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    pointerEvents: "none",
    overflow: "visible",
  },

  matchmakingAvatar: {
    display: "block",
    maxWidth: "min(260px, 48cqw)",
    maxHeight: "100%",
    objectFit: "contain",
    objectPosition: "center bottom",
    userSelect: "none",
    filter:
      "drop-shadow(0 18px 24px rgba(0,0,0,0.76)) drop-shadow(0 0 12px rgba(232, 198, 112, 0.14))",
  },

  cancelButton: {
    position: "relative",
    zIndex: 22,
    cursor: "pointer",
    display: "block",
    width: "min(360px, calc(100cqw - 72px))",
    margin: "7px auto 0",
    padding: "11px 22px 13px",
    borderRadius: 0,
    border: "none",
    backgroundColor: "#4b4d4e",
    backgroundImage: `linear-gradient(180deg, rgba(156, 159, 154, 0.52), rgba(45, 48, 49, 0.78)), url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#ece8da",
    fontWeight: 1000,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.86), 0 0 8px rgba(255,255,255,0.12)",
    boxShadow: "none",
  },

  retryButton: {
    marginTop: 0,
    backgroundColor: "#7b5a24",
    backgroundImage: `linear-gradient(180deg, rgba(234, 190, 94, 0.48), rgba(84, 58, 20, 0.82)), url(${buttonImage})`,
    color: "#fff0c2",
  },

  status: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 1.4,
    color: "rgba(244, 229, 191, 0.86)",
    textShadow: "0 2px 8px rgba(0,0,0,0.86)",
  },

  hint: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 800,
    color: "#ffe08a",
    textShadow: "0 2px 8px rgba(0,0,0,0.90)",
  },

  error: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    color: "#ff8a8a",
    textShadow: "0 2px 8px rgba(0,0,0,0.90)",
  },

  campaignCarouselTrack: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 36,
    minWidth: "max-content",
    margin: "0 auto",
  },

  campaignCardOption: {
    position: "relative",
    flex: "0 0 auto",
    width: CAMPAIGN_CARD_WIDTH + 44,
    height: CAMPAIGN_CARD_HEIGHT + 28,
    padding: "10px 22px 18px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f8e3ae",
    cursor: "pointer",
    textAlign: "center",
    scrollSnapAlign: "center",
    boxSizing: "border-box",
  },

  campaignArtCard: {
    position: "relative",
    zIndex: 2,
    width: CAMPAIGN_CARD_WIDTH,
    height: CAMPAIGN_CARD_HEIGHT,
    margin: "0 auto",
    borderRadius: 18,
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    border: "1px solid rgba(244, 209, 124, 0.42)",
    boxShadow:
      "0 18px 42px rgba(0,0,0,0.52), inset 0 0 36px rgba(255, 223, 128, 0.08)",
  },

  campaignArtLabel: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "7.5%",
    zIndex: 2,
    color: "#f9e7b2",
    fontSize: 26,
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "left",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.9)",
    pointerEvents: "none",
  },

  missionCarouselViewport: {
    width: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    padding: "18px 8px 24px",
    boxSizing: "border-box",
    WebkitOverflowScrolling: "touch",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "none",
    // See carouselViewport: custom JS drag-scroller, so no native panning.
    touchAction: "none",
  },

  mainMenuCarouselViewport: {
    overflowX: "hidden",
    padding: "34px 8px 12px",
    cursor: "default",
    touchAction: "none",
  },

  premiumCampaignMissionsLayer: {
    justifyContent: "flex-start",
    paddingTop: "clamp(38px, 6cqh, 58px)",
    paddingBottom: 6,
  },

  premiumCampaignHeader: {
    flex: "0 0 auto",
    marginBottom: 0,
    transform: "none",
  },

  premiumCampaignTitle: {
    fontSize: "clamp(28px, 4cqh, 40px)",
  },

  premiumCampaignSubtitle: {
    maxWidth: 920,
    marginTop: 3,
    fontSize: 12,
    lineHeight: 1.2,
  },

  premiumMissionCarouselViewport: {
    paddingTop: 5,
    paddingBottom: 7,
  },

  missionCarouselTrack: {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 28,
    minWidth: "max-content",
    margin: "0 auto",
  },

  missionCardOption: {
    position: "relative",
    flex: "0 0 auto",
    width: 326,
    minHeight: 428,
    padding: 9,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f8e3ae",
    cursor: "pointer",
    textAlign: "left",
    scrollSnapAlign: "center",
    boxSizing: "border-box",
  },

  missionCardOptionLocked: {
    cursor: "default",
    opacity: 0.88,
    filter: "grayscale(0.34) brightness(0.86)",
  },

  missionArtCard: {
    position: "relative",
    zIndex: 2,
    height: MISSION_CARD_HEIGHT,
    display: "grid",
    gridTemplateRows: "154px 1fr",
    overflow: "hidden",
    borderRadius: 7,
    border: "1px solid rgba(174, 163, 129, 0.42)",
    background: "linear-gradient(180deg, #292a22 0%, #1b1e19 55%, #141713 100%)",
    boxShadow:
      "0 16px 34px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.035)",
    transition: "border-color 180ms ease, box-shadow 180ms ease, filter 180ms ease",
  },

  missionArtCardSelected: {
    borderColor: "rgba(205, 183, 125, 0.9)",
    boxShadow:
      "0 0 0 1px rgba(205, 183, 125, 0.2), 0 20px 42px rgba(0,0,0,0.58), 0 0 22px rgba(174, 148, 87, 0.13)",
  },

  missionArtCardCompleted: {
    borderColor: "rgba(137, 157, 112, 0.62)",
    background: "linear-gradient(180deg, #292d23 0%, #1b231b 56%, #141a14 100%)",
  },

  missionArtCardLocked: {
    borderColor: "rgba(153, 149, 134, 0.28)",
  },

  missionArtImage: {
    width: "100%",
    height: "100%",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    borderBottom: "1px solid rgba(244, 209, 124, 0.24)",
  },

  missionImageHud: {
    position: "absolute",
    zIndex: 4,
    top: 11,
    left: 12,
    right: 11,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    pointerEvents: "none",
  },

  missionNumberLabel: {
    padding: "4px 0",
    color: "#e2d2a6",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    textShadow: "0 2px 5px rgba(0,0,0,0.98)",
  },

  missionStatusChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 22,
    padding: "2px 7px",
    border: "none",
    borderRadius: 2,
    fontSize: 9,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
    boxShadow: "0 3px 9px rgba(0,0,0,0.36)",
  },

  missionStatusChipAvailable: {
    color: "#dfcca0",
    background: "rgba(54, 53, 40, 0.92)",
  },

  missionStatusChipCompleted: {
    color: "#c1d2ad",
    background: "rgba(45, 63, 42, 0.92)",
  },

  missionStatusChipLocked: {
    color: "rgba(218, 214, 199, 0.82)",
    background: "rgba(41, 43, 39, 0.92)",
  },

  missionStatusMark: {
    fontSize: 12,
    lineHeight: 1,
  },

  rewardCardColumn: {
    flex: "0 0 auto",
    alignSelf: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    scrollSnapAlign: "center",
  },

  rewardCardSlot: {
    position: "relative",
    width: MISSION_REWARD_CARD_WIDTH,
    padding: 0,
    border: "none",
    background: "transparent",
    transition: "filter 180ms ease, transform 180ms ease",
  },

  rewardCardSlotLocked: {
    filter: "grayscale(0.85) brightness(0.55)",
    cursor: "default",
  },

  rewardCardSlotClaimable: {
    cursor: "pointer",
    filter: "drop-shadow(0 0 22px rgba(243, 205, 108, 0.7))",
  },

  rewardCopiesBadge: {
    position: "absolute",
    right: 14,
    bottom: 10,
    zIndex: 4,
    color: "#fff1c4",
    fontSize: 16,
    fontWeight: 1000,
    textAlign: "right",
    textShadow: "0 2px 5px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.85)",
    pointerEvents: "none",
  },

  rewardCaption: {
    color: "rgba(232, 218, 184, 0.6)",
    fontSize: 13,
    fontWeight: 1000,
    letterSpacing: 1,
    textTransform: "uppercase",
    textShadow: "0 2px 3px rgba(0,0,0,0.85)",
  },

  rewardCaptionClaim: {
    color: "#ffe09a",
  },

  rewardCaptionClaimed: {
    color: "#a9d39a",
  },

  missionArtContent: {
    display: "grid",
    gridTemplateRows: "auto auto 1fr auto",
    gap: 8,
    padding: "15px 16px 14px",
  },

  campaignPanel: {
    width: "min(980px, calc(100cqw - 48px))",
    margin: "8px auto 12px",
    padding: 18,
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(12,14,12,0.82), rgba(2,3,2,0.72))",
    border: "1px solid rgba(220, 184, 96, 0.22)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
  },

  campaignBlock: {
    display: "grid",
    gap: 14,
  },

  campaignHeader: {
    display: "grid",
    gap: 5,
  },

  campaignTitle: {
    margin: 0,
    color: "#ffe9a8",
    fontSize: 24,
    fontWeight: 1000,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  campaignDescription: {
    margin: 0,
    color: "rgba(244, 229, 191, 0.78)",
    fontSize: 14,
    lineHeight: 1.35,
  },

  missionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  },

  missionCard: {
    minHeight: 178,
    display: "grid",
    gridTemplateRows: "auto auto 1fr auto",
    gap: 9,
    padding: 16,
    borderRadius: 12,
    border: "1px solid rgba(220, 184, 96, 0.42)",
    background:
      "linear-gradient(180deg, rgba(73, 58, 34, 0.94), rgba(29, 26, 18, 0.94))",
    color: "#f8e3ae",
    cursor: "pointer",
    textAlign: "left",
    boxShadow: "0 12px 28px rgba(0,0,0,0.34)",
  },

  missionCardLocked: {
    cursor: "default",
    opacity: 0.46,
    filter: "grayscale(0.45)",
  },

  missionCardCompleted: {
    borderColor: "rgba(125, 255, 138, 0.44)",
    background:
      "linear-gradient(180deg, rgba(54, 75, 39, 0.94), rgba(22, 34, 20, 0.94))",
  },

  missionNumber: {
    color: "#d7b665",
    fontSize: 14,
    fontWeight: 1000,
    letterSpacing: 2,
  },

  missionChapter: {
    minHeight: 14,
    color: "rgba(196, 185, 153, 0.86)",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.16,
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },

  missionTitle: {
    color: "#e8d8ad",
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    fontSize: 19,
    fontWeight: 1000,
    lineHeight: 1.05,
    textTransform: "uppercase",
  },

  missionDescription: {
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 6,
    color: "rgba(226, 221, 204, 0.9)",
    fontSize: 13,
    lineHeight: 1.32,
  },

  missionActionBar: {
    minHeight: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "4px 9px",
    border: "1px solid rgba(160, 157, 142, 0.2)",
    borderRadius: 2,
    background: "rgba(17, 20, 17, 0.72)",
    color: "rgba(213, 210, 196, 0.72)",
    fontSize: 11,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  missionActionBarPlayable: {
    borderColor: "rgba(181, 162, 111, 0.46)",
    background: "linear-gradient(90deg, rgba(62, 59, 43, 0.9), rgba(39, 42, 34, 0.84))",
    color: "#ddc99a",
  },

  missionActionBarCompleted: {
    borderColor: "rgba(128, 153, 107, 0.42)",
    background: "linear-gradient(90deg, rgba(45, 61, 40, 0.84), rgba(35, 45, 33, 0.8))",
    color: "#bfd1aa",
  },

  missionActionArrow: {
    fontSize: 22,
    lineHeight: 0.8,
    transform: "translateY(-1px)",
  },

  missionState: {
    color: "#d7b665",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  missionStateCompleted: {
    color: "#8ee894",
  },

  menuActionsRow: {
    width: "min(260px, calc(100cqw - 48px))",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 12,
    margin: "0 auto",
  },

  campaignPurchaseActionsRow: {
    width: "calc(100cqw - 48px)",
    maxWidth: "100%",
    gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 520px) minmax(0, 1fr)",
    alignItems: "center",
    gap: 10,
  },

  campaignPurchaseButton: {
    gridColumn: 2,
    minHeight: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "13px 24px",
    border: "1px solid rgba(255, 225, 139, 0.82)",
    borderRadius: 3,
    background:
      "linear-gradient(180deg, rgba(174, 126, 31, 0.98), rgba(91, 57, 10, 0.98))",
    color: "#fff2bf",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.8)",
    boxShadow:
      "inset 0 0 0 1px rgba(255,255,255,0.1), 0 8px 22px rgba(0,0,0,0.42)",
  },

  campaignPurchaseBackButton: {
    gridColumn: 3,
    justifySelf: "end",
    width: 112,
    minHeight: 40,
    padding: "7px 10px 9px",
    fontSize: 12,
    letterSpacing: 0.4,
  },

  campaignPurchasePrice: {
    fontSize: 24,
  },

  campaignPurchaseCurrencyIcon: {
    width: 32,
    height: 32,
    objectFit: "contain",
    filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.55))",
  },

  tutorialActionsRow: {
    margin: "auto auto",
  },

  singleMenuAction: {
    position: "relative",
    width: "min(260px, calc(100cqw - 48px))",
    margin: "0 auto 4px",
  },

  createDeckButton: {
    cursor: "pointer",
    display: "block",
    width: "100%",
    margin: 0,
    padding: "11px 18px 13px",
    borderRadius: 0,
    border: "none",
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.2)",
    boxShadow: "none",
  },

  deckNationFilterRow: {
    position: "fixed",
    left: "50%",
    bottom: 32,
    zIndex: 8,
    width: "min(max-content, calc(100cqw - 160px))",
    transform: "translateX(-50%)",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },

  deckNationFilterButton: {
    position: "relative",
    width: 58,
    height: 44,
    padding: 0,
    overflow: "hidden",
    border: "1px solid rgba(215, 185, 112, 0.22)",
    borderRadius: 3,
    background: "rgba(32, 35, 30, 0.92)",
    color: "#fff0bb",
    cursor: "pointer",
    fontSize: 9,
    fontWeight: 1000,
    textTransform: "uppercase",
    filter: "grayscale(0.5) brightness(0.72)",
    transition:
      "filter 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  deckNationFilterAll: {
    height: 44,
    padding: "0 14px",
    border: "1px solid rgba(215, 185, 112, 0.22)",
    borderRadius: 3,
    background: "rgba(32, 35, 30, 0.92)",
    color: "#fff0bb",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 1000,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    filter: "grayscale(0.5) brightness(0.72)",
    transition:
      "filter 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  deckNationFilterButtonActive: {
    borderColor: "rgba(243, 205, 108, 0.82)",
    filter: "none",
    boxShadow: "0 0 12px rgba(222, 176, 67, 0.24)",
  },

  deckNationFilterFlag: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: 0.84,
  },

  headquartersBackButton: {
    position: "absolute",
    zIndex: 6,
    left: 20,
    bottom: 18,
    width: 58,
    height: 46,
    padding: 0,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 30,
    fontWeight: 1000,
    lineHeight: 1,
    paddingBottom: 4,
    textAlign: "center",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.2)",
    boxShadow: "none",
  },

  mainSecondaryActions: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 100,
    zIndex: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    margin: 0,
    pointerEvents: "auto",
  },

  researchButton: {
    display: "block",
    minWidth: 246,
    margin: 0,
    padding: "15px 30px 17px",
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 1000,
    letterSpacing: 1.9,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.22)",
    boxShadow: "none",
  },

  collectionButton: {
    display: "block",
    minWidth: 246,
    margin: 0,
    padding: "15px 30px 17px",
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 1000,
    letterSpacing: 1.9,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.22)",
    boxShadow: "none",
  },

  mainLegalFooter: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 10,
    zIndex: 7,
    pointerEvents: "none",
    display: "flex",
    justifyContent: "center",
    padding: "0 16px",
    textAlign: "center",
    textShadow: "0 2px 8px rgba(0,0,0,0.82)",
  },

  supportLink: {
    position: "fixed",
    right: 18,
    bottom: 12,
    zIndex: 9,
    border: "none",
    background: "transparent",
    color: "rgba(255, 240, 189, 0.82)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadow: "0 2px 8px rgba(0,0,0,0.86)",
  },

  supportOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9200,
    display: "grid",
    placeItems: "center",
    padding: 22,
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    background:
      "radial-gradient(circle at center, rgba(0,0,0,0.54), rgba(0,0,0,0.86) 72%)",
    backdropFilter: "blur(5px)",
  },

  supportPanel: {
    width: "min(520px, calc(100vw - 32px))",
    maxHeight: "calc(100dvh - 44px)",
    display: "grid",
    gap: 14,
    padding: "22px 24px 24px",
    overflowY: "auto",
    scrollbarWidth: "none",
    color: "#f4e5bf",
    background:
      "linear-gradient(180deg, rgba(24, 25, 20, 0.96), rgba(8, 9, 7, 0.96))",
    boxShadow:
      "0 24px 72px rgba(0,0,0,0.72), inset 0 0 0 1px rgba(216,174,92,0.22)",
  },

  supportHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  supportKicker: {
    color: "rgba(244,229,191,0.62)",
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.16em",
  },

  supportTitle: {
    margin: 0,
    color: "#d6ad53",
    fontFamily: "var(--font-display)",
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textShadow: "0 5px 14px rgba(0,0,0,0.72)",
  },

  supportCloseButton: {
    width: 34,
    height: 34,
    border: "1px solid rgba(216,174,92,0.24)",
    borderRadius: 0,
    color: "#fff0bd",
    background: "rgba(76,78,73,0.38)",
    cursor: "pointer",
    fontSize: 24,
    lineHeight: "30px",
  },

  supportLabel: {
    display: "grid",
    gap: 7,
    color: "rgba(244,229,191,0.78)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  supportInput: {
    minHeight: 40,
    padding: "9px 11px",
    border: "1px solid rgba(216,174,92,0.28)",
    borderRadius: 0,
    outline: "none",
    color: "#fff4d7",
    background: "rgba(5,7,6,0.72)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    fontWeight: 700,
  },

  supportTextarea: {
    minHeight: 140,
    resize: "vertical",
    padding: "10px 11px",
    border: "1px solid rgba(216,174,92,0.28)",
    borderRadius: 0,
    outline: "none",
    color: "#fff4d7",
    background: "rgba(5,7,6,0.72)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.45,
  },

  supportError: {
    padding: "10px 12px",
    color: "#ffc3b5",
    background: "rgba(92, 25, 19, 0.68)",
    boxShadow: "inset 0 0 0 1px rgba(255,120,90,0.26)",
    fontWeight: 800,
  },

  supportSuccess: {
    padding: "10px 12px",
    color: "#dff6b9",
    background: "rgba(35,82,39,0.58)",
    boxShadow: "inset 0 0 0 1px rgba(167,224,117,0.24)",
    fontWeight: 800,
  },

  supportActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 2,
  },

  supportPrimaryButton: {
    minHeight: 40,
    minWidth: 138,
    padding: "9px 18px",
    border: "none",
    borderRadius: 0,
    color: "#1b1407",
    background: "linear-gradient(180deg, #e2c16d, #9e7427)",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  supportSecondaryButton: {
    minHeight: 40,
    minWidth: 118,
    padding: "9px 18px",
    border: "1px solid rgba(216,174,92,0.22)",
    borderRadius: 0,
    color: "#fff0bd",
    background: "rgba(76,78,73,0.48)",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  backButton: {
    cursor: "pointer",
    display: "block",
    width: "100%",
    margin: 0,
    padding: "11px 18px 13px",
    borderRadius: 0,
    border: "none",
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    fontWeight: 1000,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.2)",
    boxShadow: "none",
  },

  primaryMenuButton: {
    borderColor: "rgba(219, 211, 116, 0.62)",
    background:
      "linear-gradient(180deg, rgba(92, 98, 44, 0.96), rgba(48, 57, 31, 0.96))",
    color: "#fff0b8",
  },

  cardPreviewOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background:
      "radial-gradient(circle at center, rgba(0,0,0,0.58), rgba(0,0,0,0.86) 74%)",
    backdropFilter: "blur(6px)",
  },

  deckPreviewOverlay: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 10,
  },

  cardPreviewPanel: {
    position: "relative",
    // Fixed design width; the parent wrapper carries the stage scale/rotation.
    width: 390,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 28px 58px rgba(0,0,0,0.78))",
  },

  deckPreviewPanel: {
    // Fixed design size; the parent wrapper carries the stage scale/rotation.
    width: 1060,
    height: 610,
    display: "grid",
    gridTemplateColumns: "170px 390px minmax(280px, 1fr)",
    gap: 20,
    alignItems: "start",
    justifyContent: "center",
    padding: "12px 24px 18px",
    border: "none",
    borderRadius: 12,
    background:
      "linear-gradient(135deg, rgba(12, 15, 12, 0.94), rgba(25, 24, 16, 0.92))",
    boxShadow:
      "0 24px 70px rgba(0,0,0,0.72)",
    boxSizing: "border-box",
    filter: "none",
  },

  deckPreviewActions: {
    alignSelf: "start",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    gap: 12,
    paddingTop: 82,
  },

  deckPreviewActionButton: {
    width: "100%",
    minHeight: 46,
    padding: "10px 12px",
    border: "1px solid rgba(220, 184, 96, 0.42)",
    borderRadius: 4,
    background:
      "linear-gradient(180deg, rgba(68, 53, 31, 0.98), rgba(26, 24, 17, 0.98))",
    color: "#ffe9a8",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    boxShadow: "0 10px 22px rgba(0,0,0,0.32)",
  },

  deckPreviewHeadquarters: {
    position: "relative",
    width: 390,
    display: "grid",
    justifyItems: "center",
    gap: 12,
  },

  deckPreviewTitleBlock: {
    width: 300,
    display: "grid",
    gap: 3,
    padding: "9px 12px",
    border: "1px solid rgba(220, 184, 96, 0.3)",
    borderRadius: 4,
    background: "rgba(11, 13, 10, 0.82)",
    color: "#ffe9a8",
    textAlign: "center",
    boxSizing: "border-box",
  },

  deckPreviewListPanel: {
    alignSelf: "start",
    minHeight: 0,
    height: 556,
    display: "block",
    paddingTop: 0,
  },

  deckPreviewUnitList: {
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    display: "grid",
    alignContent: "start",
    gap: 8,
    padding: "2px 8px 2px 2px",
    scrollbarWidth: "none",
    cursor: "grab",
    touchAction: "none",
    WebkitOverflowScrolling: "touch",
  },

  deckPreviewUnitRow: {
    minHeight: 66,
    display: "grid",
    gridTemplateColumns: "72px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    padding: "7px 9px 7px 7px",
    border: "1px solid rgba(220, 184, 96, 0.22)",
    borderRadius: 5,
    background:
      "linear-gradient(180deg, rgba(35, 34, 24, 0.9), rgba(12, 14, 11, 0.92))",
    color: "#f4e5bf",
    cursor: "context-menu",
    textAlign: "left",
    boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
  },

  deckPreviewUnitImage: {
    width: 72,
    height: 52,
    objectFit: "cover",
    borderRadius: 3,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#080909",
  },

  deckPreviewUnitName: {
    overflow: "hidden",
    color: "#ffe9a8",
    fontSize: 13,
    fontWeight: 1000,
    lineHeight: 1.08,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  deckPreviewUnitCount: {
    minWidth: 34,
    color: "#d7b665",
    fontSize: 14,
    fontWeight: 1000,
    textAlign: "right",
  },

  unitCardPreviewPanel: {
    position: "absolute",
    zIndex: 2,
    // Fixed design width; the parent wrapper carries the stage scale/rotation.
    width: 390,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 32px 70px rgba(0,0,0,0.82))",
  },

  cardPreviewClose: {
    position: "absolute",
    right: -12,
    top: -12,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background:
      "linear-gradient(180deg, rgba(38,40,40,0.96), rgba(5,6,6,0.96))",
    color: "#f3ead0",
    fontSize: 24,
    lineHeight: "30px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(0,0,0,0.58)",
  },

  cardPreviewHint: {
    position: "absolute",
    left: "50%",
    bottom: -28,
    transform: "translateX(-50%)",
    color: "rgba(238,242,243,0.68)",
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: "nowrap",
    textShadow: "0 2px 8px rgba(0,0,0,0.85)",
    pointerEvents: "none",
  },
};
