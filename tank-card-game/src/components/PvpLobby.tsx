import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getBattleBackgroundAsset } from "../assets/battleBackgroundAssets";
import { getHeadquartersAvatarAsset } from "../assets/headquartersAvatarAssets";
import { getMissionIllustrationAsset } from "../assets/missionIllustrationAssets";
import { CAMPAIGNS, isCampaignMissionUnlocked } from "../game/campaigns";
import {
  DECK_UNIT_LIMIT,
  deleteCustomDeck,
  getGroupedDeckCards,
  loadRecentDeckSelectionForHeadquarters,
  loadSavedDecksForHeadquarters,
  markRecentDeckSelection,
  type SavedDeck,
} from "../game/customDecks";
import { HEADQUARTERS, getMainMenuHeadquarters } from "../game/headquarters";
import { getTankImage } from "../game/tankImages";
import type { HeadquartersId, TankCard } from "../game/types";
import { useBattleStore } from "../store/battleStore";
import { DeckBuilder } from "./DeckBuilder";
import { HandCardView } from "./HandCardView";
import { ResearchMenu } from "./ResearchMenu";

const HAND_CARD_BASE_WIDTH = 175;
const HAND_CARD_BASE_HEIGHT = Math.round((HAND_CARD_BASE_WIDTH * 1496) / 1051);
const MENU_CARD_SCALE = 1.18;
const MENU_CARD_WIDTH = Math.round(HAND_CARD_BASE_WIDTH * MENU_CARD_SCALE);
const MENU_CARD_HEIGHT = Math.round(HAND_CARD_BASE_HEIGHT * MENU_CARD_SCALE);

type BattleDeckOption = {
  id: string | null;
  name: string;
  cardIds?: string[];
  countLabel: string;
  savedDeck?: SavedDeck;
};

type DeckPreviewState = {
  headquartersId: HeadquartersId;
  deck: BattleDeckOption;
};

type CarouselDragState = {
  active: boolean;
  moved: boolean;
  pointerId: number;
  startX: number;
  startScrollLeft: number;
};

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
}: {
  children: ReactNode;
  viewportRef: RefObject<HTMLDivElement | null>;
  viewportStyle: CSSProperties;
  ariaLabel: string;
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
      startScrollLeft: viewport.scrollLeft,
    };
  }

  function moveDragScroll(event: PointerEvent<HTMLDivElement>) {
    const state = dragScrollRef.current;
    const viewport = viewportRef.current;
    if (!state?.active || !viewport || state.pointerId !== event.pointerId) {
      return;
    }

    const distance = event.clientX - state.startX;
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

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

    if (delta === 0) return;

    event.preventDefault();
    viewport.scrollLeft += delta;
  }

  return (
    <div style={styles.carouselShell}>
      <button
        type="button"
        style={{ ...styles.carouselTapZone, ...styles.carouselTapZoneLeft }}
        onClick={() => scrollCarousel(viewportRef, -1)}
        aria-label="Прокрутить влево"
      >
        <span style={styles.carouselTapArrow}>‹</span>
      </button>

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

      <button
        type="button"
        style={{ ...styles.carouselTapZone, ...styles.carouselTapZoneRight }}
        onClick={() => scrollCarousel(viewportRef, 1)}
        aria-label="Прокрутить вправо"
      >
        <span style={styles.carouselTapArrow}>›</span>
      </button>
    </div>
  );
}

export function PvpLobby() {
  const {
    mode,
    menuView,
    pvpRoomId,
    pvpStatus,
    pvpError,
    selectedHeadquartersId,
    completedCampaignMissionIds,
    selectedCampaignId: storedSelectedCampaignId,
    setSelectedHeadquartersId,
    openHeadquartersMenu,
    closeHeadquartersMenu,
    openDeckBuilderMenu,
    closeDeckBuilderMenu,
    openResearchMenu,
    closeResearchMenu,
    openCampaignMenu,
    openCampaignMissions,
    closeCampaignMissions,
    closeCampaignMenu,
    startCampaignMission,
    findPvpMatch,
    startAiBattle,
    cancelMatchmaking,
  } = useBattleStore();

  const [previewHeadquartersId, setPreviewHeadquartersId] =
    useState<HeadquartersId | null>(null);
  const [previewDeck, setPreviewDeck] = useState<DeckPreviewState | null>(null);
  const [previewUnitCard, setPreviewUnitCard] = useState<TankCard | null>(null);
  const [editingDeck, setEditingDeck] = useState<SavedDeck | null>(null);
  const deckPreviewListRef = useRef<HTMLDivElement>(null);
  const deckPreviewDragRef = useRef<{
    active: boolean;
    pointerId: number;
    startY: number;
    startScrollTop: number;
  } | null>(null);
  const [hoveredDeckOptionKey, setHoveredDeckOptionKey] = useState<
    string | null
  >(null);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const mainMenuCarouselRef = useRef<HTMLDivElement>(null);
  const headquartersCarouselRef = useRef<HTMLDivElement>(null);
  const campaignsCarouselRef = useRef<HTMLDivElement>(null);
  const missionsCarouselRef = useRef<HTMLDivElement>(null);

  const headquartersList = useMemo(
    () => getMainMenuHeadquarters(),
    []
  );
  const missionCampaign =
    CAMPAIGNS.find((campaign) => campaign.id === storedSelectedCampaignId) ??
    CAMPAIGNS[0] ??
    null;
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

  const pvpBusy =
    mode === "pvp" &&
    (pvpStatus === "connecting" ||
      pvpStatus === "searching" ||
      pvpStatus === "waiting" ||
      pvpStatus === "matched" ||
      pvpStatus === "rolling");
  const matchmakingAvatar =
    pvpBusy ? getHeadquartersAvatarAsset(selectedHeadquartersId) : null;

  const buttonsDisabled = pvpBusy;

  function getDeckOptionsForHeadquarters(headquartersId: HeadquartersId) {
    const savedDecks = loadSavedDecksForHeadquarters(headquartersId);
    const recentSelection = loadRecentDeckSelectionForHeadquarters(headquartersId);
    const defaultOption: BattleDeckOption = {
      id: null,
      name: "Стоковая колода",
      cardIds: undefined,
      countLabel: "По умолчанию",
    };
    const customOptions = savedDecks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      cardIds: deck.cardIds,
      countLabel: `${deck.cardIds.length}/${DECK_UNIT_LIMIT}`,
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
    setSelectedHeadquartersId(headquartersId);
    markRecentDeckSelection(headquartersId, deckId);

    if (mode === "pvp") {
      findPvpMatch(deckCardIds);
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

  function deletePreviewDeck() {
    if (!previewDeck?.deck.savedDeck) return;

    const confirmed = window.confirm(
      `Удалить колоду "${previewDeck.deck.name}"?`
    );
    if (!confirmed) return;

    deleteCustomDeck(previewDeck.deck.savedDeck.id);
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
      startY: event.clientY,
      startScrollTop: list.scrollTop,
    };
    list.setPointerCapture(event.pointerId);
  }

  function moveDeckPreviewScroll(event: PointerEvent<HTMLDivElement>) {
    const state = deckPreviewDragRef.current;
    const list = deckPreviewListRef.current;
    if (!state?.active || !list || state.pointerId !== event.pointerId) return;

    list.scrollTop = state.startScrollTop - (event.clientY - state.startY);
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
    if (!missionCampaign) return;
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

  const previewHeadquarters = previewDeck
    ? HEADQUARTERS[previewDeck.headquartersId]
    : previewHeadquartersId
      ? HEADQUARTERS[previewHeadquartersId]
      : null;
  const previewDeckCards = previewDeck?.deck.cardIds
    ? getGroupedDeckCards(previewDeck.deck.cardIds)
    : [];
  const previewDeckIsCustom = Boolean(previewDeck?.deck.savedDeck);
  const battleDeckOptions = headquartersList.flatMap((headquarters) => {
    const headquartersId = headquarters.id as HeadquartersId;

    return getDeckOptionsForHeadquarters(headquartersId).map((deck) => ({
      headquarters,
      headquartersId,
      deck,
      optionKey: `${headquartersId}-${deck.id ?? "default"}`,
    }));
  });

  if (menuView === "campaign") {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />

        <section style={styles.menuLayer}>
          <header style={styles.header}>
            <div style={styles.kicker}>Одиночные операции</div>
            <h1 style={styles.title}>Компании</h1>
            <p style={styles.subtitle}>Выбери кампанию</p>
          </header>

          <CarouselTapFrame
            viewportRef={campaignsCarouselRef}
            viewportStyle={styles.carouselViewport}
            ariaLabel="Выбор кампании"
          >
            <div style={styles.campaignCarouselTrack}>
              {CAMPAIGNS.map((campaign, index) => {
                const artUrl = `/ui/menu/campaign-${index + 1}-panzer-div.png`;

                return (
                  <motion.button
                    key={campaign.id}
                    type="button"
                    style={styles.campaignCardOption}
                    onClick={() => openSelectedCampaign(campaign.id)}
                    whileHover={{ y: -8, scale: 1.035 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 360, damping: 28 }}
                    aria-label={`Выбрать кампанию ${campaign.title}`}
                  >
                    <div
                      style={{
                        ...styles.campaignArtCard,
                        backgroundImage: `linear-gradient(180deg, rgba(8, 9, 7, 0.04), rgba(0, 0, 0, 0.25)), url('${artUrl}')`,
                      }}
                    >
                      <span style={styles.campaignArtLabel}>{campaign.title}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </CarouselTapFrame>


          <div style={styles.menuActionsRow}>
            <button type="button" style={styles.backButton} onClick={closeCampaignMenu}>
              Назад
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (menuView === "missions" && missionCampaign) {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />

        <section style={styles.menuLayer}>
          <header style={styles.header}>
            <div style={styles.kicker}>Выбор операции</div>
            <h1 style={styles.title}>{missionCampaign.title}</h1>
            <p style={styles.subtitle}>{missionCampaign.description}</p>
          </header>

          <CarouselTapFrame
            viewportRef={missionsCarouselRef}
            viewportStyle={styles.missionCarouselViewport}
            ariaLabel="Выбор миссии"
          >
            <div style={styles.missionCarouselTrack}>
              {missionCampaign.missions.map((mission, index) => {
                const available = mission.available !== false;
                const unlocked = isCampaignMissionUnlocked(
                  missionCampaign,
                  mission.id,
                  completedCampaignMissionIds
                );
                const completed = completedCampaignMissionIds.includes(mission.id);
                const selected = mission.id === selectedMission?.id;
                const missionBackground = getBattleBackgroundAsset(
                  mission.backgroundId
                );
                const missionIllustration =
                  getMissionIllustrationAsset(mission.illustrationId) ??
                  missionBackground.image;

                return (
                  <motion.button
                    key={mission.id}
                    type="button"
                    style={{
                      ...styles.missionCardOption,
                      ...(unlocked ? {} : styles.missionCardOptionLocked),
                    }}
                    disabled={!unlocked}
                    onClick={() => selectMission(mission.id)}
                    whileHover={unlocked ? { y: -8, scale: 1.025 } : undefined}
                    whileTap={unlocked ? { scale: 0.985 } : undefined}
                    transition={{ type: "spring", stiffness: 360, damping: 28 }}
                    aria-pressed={selected}
                    aria-label={`Выбрать миссию ${mission.title}`}
                  >
                    <div
                      style={{
                        ...styles.selectionGlow,
                        ...(selected ? styles.selectionGlowVisible : {}),
                      }}
                    />

                    <div style={styles.missionArtCard}>
                      <div
                        style={{
                          ...styles.missionArtImage,
                          backgroundImage: `linear-gradient(180deg, rgba(8, 9, 7, 0.02), rgba(0, 0, 0, 0.46)), url('${missionIllustration}')`,
                        }}
                      />
                      <div style={styles.missionArtContent}>
                        <span style={styles.missionNumber}>
                          Операция {String(index + 1).padStart(2, "0")}
                        </span>
                        <span style={styles.missionChapter}>{mission.chapter}</span>
                        <span style={styles.missionTitle}>{mission.title}</span>
                        <span style={styles.missionDescription}>
                          {mission.description}
                        </span>
                        <span
                          style={{
                            ...styles.missionState,
                            ...(completed ? styles.missionStateCompleted : {}),
                          }}
                        >
                          {completed
                            ? "Пройдено"
                            : !available
                              ? "Скоро"
                              : unlocked
                                ? "Доступно"
                                : "Закрыто"}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </CarouselTapFrame>

          <div style={styles.menuActionsRow}>
            <button type="button" style={styles.backButton} onClick={closeCampaignMissions}>
              Назад
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (menuView === "research") {
    return <ResearchMenu onBack={closeResearchMenu} />;
  }

  if (menuView === "deckBuilder") {
    return (
      <DeckBuilder
        editingDeck={editingDeck}
        onBack={closeDeckBuilderMenu}
        onSaved={() => {
          setEditingDeck(null);
          closeHeadquartersMenu();
        }}
      />
    );
  }

  if (menuView === "main" && !pvpBusy) {
    return (
      <main style={styles.page}>
        <div style={styles.backgroundShade} />

        <section style={styles.menuLayer}>
          <header style={styles.header}>
            <div style={styles.kicker}>Карточная тактика</div>
            <h1 style={styles.title}>PanzerShrek</h1>
            <p style={styles.subtitle}>Выбери режим боя</p>
          </header>

          <CarouselTapFrame
            viewportRef={mainMenuCarouselRef}
            viewportStyle={styles.carouselViewport}
            ariaLabel="Выбор режима боя"
          >
            <div style={styles.mainMenuTrack}>
            <motion.button
              type="button"
              style={styles.campaignEntryOption}
              onClick={openCampaignMenu}
              aria-label="Открыть компании"
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src="/ui/menu/campaign-card.png"
                  alt=""
                  draggable={false}
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>Компании</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              style={styles.campaignEntryOption}
              onClick={() => openHeadquartersMenu("pvp")}
              aria-label="Открыть быстрый бой"
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src="/ui/menu/PVP.png"
                  alt=""
                  draggable={false}
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>Быстрый бой</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              style={styles.campaignEntryOption}
              onClick={() => openHeadquartersMenu("ai")}
              aria-label="Открыть бой против ИИ"
              whileHover={{ y: -8, scale: 1.035 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <div style={styles.campaignEntryCard}>
                <img
                  src="/ui/menu/PVE.png"
                  alt=""
                  draggable={false}
                  style={styles.campaignEntryImage}
                />
                <span style={styles.campaignEntryTitleOverlay}>Бой против ИИ</span>
              </div>
            </motion.button>
            </div>
          </CarouselTapFrame>

          <button
            type="button"
            style={styles.researchButton}
            onClick={openResearchMenu}
          >
            Исследования
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />

      <section style={{ ...styles.menuLayer, ...styles.headquartersMenuLayer }}>
        <header style={{ ...styles.header, ...styles.headquartersHeader }}>
          <div style={styles.kicker}>
            {mode === "pvp" ? "Быстрый бой" : "Бой против ИИ"}
          </div>
          <h1 style={{ ...styles.title, ...styles.headquartersTitle }}>
            PanzerShrek
          </h1>
          <p style={{ ...styles.subtitle, ...styles.headquartersSubtitle }}>
            Выбери штаб для боя
          </p>
        </header>

        <CarouselTapFrame
          viewportRef={headquartersCarouselRef}
          viewportStyle={{
            ...styles.carouselViewport,
            ...styles.headquartersCarouselViewport,
          }}
          ariaLabel="Выбор штаба"
        >
          <div style={styles.carouselTrack}>
            {battleDeckOptions.map(
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
                  aria-label={`Играть колодой ${deck.name}`}
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
                      {deck.countLabel}
                    </span>
                  </div>
                </motion.button>
              );
            })}

            <motion.button
              type="button"
              style={{
                ...styles.campaignEntryOption,
                ...(buttonsDisabled ? styles.headquartersOptionDisabled : {}),
              }}
              disabled={buttonsDisabled}
              onClick={openCreateDeckBuilder}
              whileHover={buttonsDisabled ? undefined : { y: -8, scale: 1.035 }}
              whileTap={buttonsDisabled ? undefined : { scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              aria-label="Открыть создание колоды"
            >
              <div style={styles.deckBuilderEntryCard}>
                <span style={styles.deckBuilderEntryMark}>+</span>
                <span style={styles.deckBuilderEntryTitle}>Создать колоду</span>
              </div>
            </motion.button>

          </div>
        </CarouselTapFrame>

        {!pvpBusy ? (
          <div style={styles.singleMenuAction}>
            <button
              type="button"
              style={styles.backButton}
              onClick={closeHeadquartersMenu}
            >
              Назад
            </button>
          </div>
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
            Отмена поиска
          </button>
        ) : null}

        {pvpError ? <div style={styles.error}>{pvpError}</div> : null}
      </section>

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
              <button
                type="button"
                style={styles.cardPreviewClose}
                onClick={closeHeadquartersPreview}
                aria-label="Закрыть просмотр карты"
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
                    Удалить колоду
                  </button>
                  <button
                    type="button"
                    style={styles.deckPreviewActionButton}
                    onClick={editPreviewDeck}
                  >
                    Редактировать колоду
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
                ПКМ по фону или Esc — закрыть
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
                <button
                  type="button"
                  style={styles.cardPreviewClose}
                  onClick={() => setPreviewUnitCard(null)}
                  aria-label="Закрыть просмотр юнита"
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    position: "relative",
    height: "100vh",
    maxHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px 0",
    color: "#f4e5bf",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    backgroundImage:
      "radial-gradient(circle at 50% 10%, rgba(179, 137, 59, 0.20), transparent 34%), linear-gradient(135deg, rgba(5, 7, 5, 0.50), rgba(17, 16, 11, 0.48)), url('/menu-background.png')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    overflow: "hidden",
    overscrollBehavior: "none",
    boxSizing: "border-box",
  },

  backgroundShade: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.10) 42%, rgba(0,0,0,0.52) 100%)",
  },

  menuLayer: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 1180,
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
    padding: "2px 24px 4px",
    overflowY: "auto",
    scrollbarWidth: "none",
  },

  header: {
    textAlign: "center",
    marginBottom: 8,
    textShadow: "0 2px 12px rgba(0,0,0,0.86)",
  },

  headquartersHeader: {
    marginBottom: 0,
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
    fontSize: "clamp(34px, 5vh, 48px)",
    lineHeight: 1.08,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 22px rgba(247, 215, 116, 0.26)",
  },

  headquartersTitle: {
    fontSize: "clamp(28px, 4vh, 42px)",
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
    padding: "38px 58px 12px",
    boxSizing: "border-box",
    WebkitOverflowScrolling: "touch",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "none",
    cursor: "grab",
    userSelect: "none",
    touchAction: "pan-y",
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
    gap: 36,
    minWidth: "max-content",
    margin: "0 auto",
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
    width: MENU_CARD_WIDTH + 44,
    height: MENU_CARD_HEIGHT + 28,
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

  campaignEntryCard: {
    position: "relative",
    width: MENU_CARD_WIDTH,
    height: MENU_CARD_HEIGHT,
    margin: "0 auto",
    borderRadius: 18,
    overflow: "hidden",
    background:
      "linear-gradient(160deg, rgba(73, 61, 35, 0.96), rgba(21, 24, 18, 0.98) 58%, rgba(7, 8, 6, 0.98))",
    border: "1px solid rgba(244, 209, 124, 0.42)",
    boxShadow:
      "0 18px 42px rgba(0,0,0,0.52), inset 0 0 36px rgba(255, 223, 128, 0.08)",
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
    fontFamily: "Georgia, Times New Roman, serif",
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
    width: "min(720px, calc(100vw - 48px))",
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
    width: "min(720px, calc(100vw - 48px))",
    height: "min(30vh, 230px)",
    margin: "4px auto 0",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    pointerEvents: "none",
    overflow: "visible",
  },

  matchmakingAvatar: {
    display: "block",
    maxWidth: "min(260px, 48vw)",
    maxHeight: "100%",
    objectFit: "contain",
    objectPosition: "center bottom",
    userSelect: "none",
    filter:
      "drop-shadow(0 18px 24px rgba(0,0,0,0.76)) drop-shadow(0 0 12px rgba(232, 198, 112, 0.14))",
  },

  cancelButton: {
    cursor: "pointer",
    display: "block",
    width: "min(720px, calc(100vw - 48px))",
    margin: "7px auto 0",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255, 138, 138, 0.55)",
    background: "rgba(76, 31, 31, 0.92)",
    color: "#ffd6d6",
    fontWeight: 900,
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
    width: MENU_CARD_WIDTH + 44,
    height: MENU_CARD_HEIGHT + 28,
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
    width: MENU_CARD_WIDTH,
    height: MENU_CARD_HEIGHT,
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
    fontSize: 21,
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
    width: 286,
    minHeight: 352,
    padding: 12,
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
    opacity: 0.5,
    filter: "grayscale(0.72)",
  },

  missionArtCard: {
    position: "relative",
    zIndex: 2,
    height: 328,
    display: "grid",
    gridTemplateRows: "126px 1fr",
    overflow: "hidden",
    borderRadius: 14,
    border: "1px solid rgba(244, 209, 124, 0.42)",
    background: "linear-gradient(180deg, rgba(47, 42, 28, 0.98), rgba(14, 16, 12, 0.98))",
    boxShadow:
      "0 18px 42px rgba(0,0,0,0.52), inset 0 0 28px rgba(255, 223, 128, 0.06)",
  },

  missionArtImage: {
    width: "100%",
    height: "100%",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    borderBottom: "1px solid rgba(244, 209, 124, 0.24)",
  },

  missionArtContent: {
    display: "grid",
    gridTemplateRows: "auto auto auto 1fr auto",
    gap: 5,
    padding: "12px 14px 13px",
  },

  campaignPanel: {
    width: "min(980px, calc(100vw - 48px))",
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
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 2,
  },

  missionChapter: {
    minHeight: 22,
    color: "rgba(244, 229, 191, 0.74)",
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.12,
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },

  missionTitle: {
    color: "#ffe9a8",
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    fontSize: 16,
    fontWeight: 1000,
    lineHeight: 1.08,
    textTransform: "uppercase",
  },

  missionDescription: {
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
    color: "rgba(244, 229, 191, 0.78)",
    fontSize: 12,
    lineHeight: 1.25,
  },

  missionState: {
    color: "#d7b665",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  missionStateCompleted: {
    color: "#8ee894",
  },

  menuActionsRow: {
    width: "min(260px, calc(100vw - 48px))",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 12,
    margin: "0 auto",
  },

  singleMenuAction: {
    width: "min(260px, calc(100vw - 48px))",
    margin: "0 auto 4px",
  },

  researchButton: {
    display: "block",
    minWidth: 226,
    margin: "2px auto 0",
    padding: "11px 22px",
    border: "1px solid rgba(220, 184, 96, 0.54)",
    borderRadius: 4,
    background:
      "linear-gradient(180deg, rgba(69, 65, 43, 0.98), rgba(35, 36, 25, 0.98))",
    color: "#f8e3ae",
    cursor: "pointer",
    fontWeight: 1000,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    boxShadow: "0 10px 22px rgba(0,0,0,0.3)",
  },

  backButton: {
    cursor: "pointer",
    display: "block",
    width: "100%",
    margin: 0,
    padding: "9px 16px",
    borderRadius: 10,
    border: "1px solid rgba(220, 184, 96, 0.48)",
    background:
      "linear-gradient(180deg, rgba(74, 58, 34, 0.94), rgba(42, 32, 19, 0.94))",
    color: "#f8e3ae",
    fontWeight: 1000,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    boxShadow: "0 10px 22px rgba(0,0,0,0.30)",
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
    alignItems: "flex-start",
    paddingTop: 10,
    paddingBottom: 10,
  },

  cardPreviewPanel: {
    position: "relative",
    width: 390,
    maxWidth: "82vw",
    maxHeight: "92vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 28px 58px rgba(0,0,0,0.78))",
  },

  deckPreviewPanel: {
    width: "min(1060px, calc(100vw - 72px))",
    maxWidth: "calc(100vw - 72px)",
    height: "min(610px, calc(100vh - 28px))",
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
    width: 390,
    maxWidth: "82vw",
    maxHeight: "92vh",
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
