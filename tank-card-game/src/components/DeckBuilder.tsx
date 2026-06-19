import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  StageBackground,
  screenDeltaToStage,
  useStageOverlayTransform,
} from "./GameStage";
import buttonImage from "../assets/button.webp";
import {
  HEADQUARTERS,
  getDeckBuildingHeadquarters,
  type HeadquartersDefinition,
} from "../game/headquarters";
import {
  CARD_COPY_LIMIT,
  DECK_UNIT_LIMIT,
  NATION_FILTERS,
  UNIT_TYPE_FILTERS,
  createCustomDeckDraft,
  createUpdatedCustomDeckDraft,
  countCardCopies,
  getAvailableDeckCards,
  getGroupedDeckCards,
  getNextDefaultDeckName,
  saveCustomDeckToServer,
  validateDeck,
  type NationFilter,
  type SavedDeck,
  type UnitTypeFilter,
} from "../game/customDecks";
import type { HeadquartersId, Nation, TankCard } from "../game/types";
import { getNationFlagAsset } from "../assets/nationFlagAssets";
import classLightIcon from "../assets/icons/classes/class-light-player.webp";
import classMediumIcon from "../assets/icons/classes/class-medium-player.webp";
import classHeavyIcon from "../assets/icons/classes/class-heavy-player.webp";
import classTdIcon from "../assets/icons/classes/class-td-player.webp";
import classSpgIcon from "../assets/icons/classes/class-spg-player.webp";
import classCarIcon from "../assets/icons/classes/class-car-player.webp";
import { HandCardView } from "./HandCardView";
import { CardKeywordsPanel } from "./CardKeywordsPanel";
import {
  getCardKeywords,
  getHeadquartersKeywords,
} from "../game/cardKeywords";
import { calculateDeckWeight, getCardLevel } from "../game/deckWeight";
import {
  loadPlayerProgress,
  syncPlayerProgressFromServer,
} from "../game/playerProgress";
import {
  isProfileServerUnavailable,
  retryProfileConnection,
  useProfileConnection,
} from "../network/useProfileConnection";

const HAND_CARD_BASE_WIDTH = 175;
const HAND_CARD_BASE_HEIGHT = Math.round((HAND_CARD_BASE_WIDTH * 1496) / 1051);
const BUILDER_CARD_SCALE = 0.76;
const BUILDER_CARD_WIDTH = Math.round(HAND_CARD_BASE_WIDTH * BUILDER_CARD_SCALE);
const BUILDER_CARD_HEIGHT = Math.round(HAND_CARD_BASE_HEIGHT * BUILDER_CARD_SCALE);

// Icons shown next to the unit-type filter options. "support" (Тыл) groups
// several support roles, so it uses the transport icon as a representative.
const UNIT_TYPE_FILTER_ICONS: Partial<Record<UnitTypeFilter, string>> = {
  light: classLightIcon,
  medium: classMediumIcon,
  heavy: classHeavyIcon,
  td: classTdIcon,
  spg: classSpgIcon,
  support: classCarIcon,
};

function getNationFilterIcon(value: NationFilter): string | undefined {
  if (value === "all") return undefined;
  return getNationFlagAsset(value as Nation) ?? undefined;
}

// Payload describing what a card button is, recorded on pointerdown so the row
// handler knows whether a touch gesture should move a card or just scroll.
type CardDragPayload =
  | { kind: "hq"; hqId: HeadquartersId; cardId?: undefined }
  | { kind: "card"; cardId: string; hqId?: undefined }
  | { kind: "deck-card"; cardId: string; hqId?: undefined };

type DragScrollState = {
  active: boolean;
  captured: boolean;
  moved: boolean;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startScrollLeft: number;
  // Committed gesture: scroll the row, drag a card between zones, or undecided.
  mode: "idle" | "scroll" | "card";
  dragKind: CardDragPayload["kind"] | null;
  dragCardId: string | null;
  dragHqId: HeadquartersId | null;
};

type DragGhost = {
  card?: TankCard;
  headquarters?: HeadquartersDefinition;
  x: number;
  y: number;
};

type DeckBuilderPreview =
  | { type: "card"; card: TankCard }
  | { type: "headquarters"; headquarters: HeadquartersDefinition };

function scrollRow(rowRef: RefObject<HTMLDivElement | null>, direction: -1 | 1) {
  const row = rowRef.current;
  if (!row) return;

  row.scrollBy({
    left: direction * Math.max(360, row.clientWidth * 0.78),
    behavior: "smooth",
  });
}

function MiniHandCard({
  card,
  headquarters,
  headquartersId,
  disabled = false,
  selected = false,
}: {
  card?: TankCard;
  headquarters?: HeadquartersDefinition;
  headquartersId?: HeadquartersId;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      style={{
        ...styles.cardScaleSlot,
        ...(disabled ? styles.cardScaleSlotDisabled : {}),
      }}
    >
      <div
        style={{
          ...styles.cardScale,
          transform: `translateX(-50%) scale(${BUILDER_CARD_SCALE})`,
        }}
      >
        <HandCardView
          ownerId="player"
          card={card}
          headquartersId={headquartersId}
          headquarters={
            headquarters
              ? {
                  hp: headquarters.hp,
                  attack: headquarters.attack,
                  fuelGeneration: headquarters.fuelGeneration,
                }
              : undefined
          }
          selected={selected}
          disabled={disabled}
          displayMode="hand"
        />
      </div>
    </div>
  );
}

// Styled dropdown matching the app theme. Rendered inline inside the scaled
// GameStage (not a native <select>, whose popup ignores the stage transform and
// would open in the wrong orientation on the 90°-rotated mobile stage).
function FilterDropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icon?: string; iconShape?: "contain" | "cover" }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  const iconStyle = (shape: "contain" | "cover" | undefined) =>
    shape === "cover"
      ? { ...styles.dropdownIcon, ...styles.dropdownFlagIcon }
      : styles.dropdownIcon;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={styles.dropdown}>
      <button
        type="button"
        style={styles.dropdownTrigger}
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={styles.dropdownTriggerContent}>
          {selected?.icon ? (
            <img
              src={selected.icon}
              alt=""
              aria-hidden="true"
              style={iconStyle(selected.iconShape)}
            />
          ) : null}
          <span style={styles.dropdownTriggerLabel}>
            {selected?.label ?? options[0]?.label}
          </span>
        </span>
        <span
          style={{
            ...styles.dropdownChevron,
            ...(open ? styles.dropdownChevronOpen : {}),
          }}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open ? (
        <div style={styles.dropdownMenu} role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              style={{
                ...styles.dropdownOption,
                ...(option.value === value ? styles.dropdownOptionActive : {}),
              }}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.icon ? (
                <img
                  src={option.icon}
                  alt=""
                  aria-hidden="true"
                  style={iconStyle(option.iconShape)}
                />
              ) : (
                <span style={styles.dropdownIconPlaceholder} aria-hidden="true" />
              )}
              <span style={styles.dropdownOptionLabel}>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DeckBuilder({
  editingDeck,
  onBack,
  onSaved,
}: {
  editingDeck?: SavedDeck | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [selectedHeadquartersId, setSelectedHeadquartersId] =
    useState<HeadquartersId | null>(editingDeck?.headquartersId ?? null);
  const [deckName, setDeckName] = useState(editingDeck?.name ?? "");
  const [deckCardIds, setDeckCardIds] = useState<string[]>(
    editingDeck?.cardIds ?? []
  );
  const [unitTypeFilter, setUnitTypeFilter] = useState<UnitTypeFilter>("all");
  const [nationFilter, setNationFilter] = useState<NationFilter>("all");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deckDropActive, setDeckDropActive] = useState(false);
  const [collectionDropActive, setCollectionDropActive] = useState(false);
  const [preview, setPreview] = useState<DeckBuilderPreview | null>(null);
  // Applies the stage scale + rotation so the body-portaled preview renders like
  // desktop and fits/rotates exactly like the rest of the game.
  const stageOverlayTransform = useStageOverlayTransform();
  const [progress, setProgress] = useState(() => loadPlayerProgress());
  const profileConnection = useProfileConnection();
  const profileServerUnavailable = isProfileServerUnavailable(profileConnection);
  const profileServerReady = profileConnection.status === "online";
  const collectionRowRef = useRef<HTMLDivElement>(null);
  const deckRowRef = useRef<HTMLDivElement>(null);
  const collectionDragScrollRef = useRef<DragScrollState | null>(null);
  const deckDragScrollRef = useRef<DragScrollState | null>(null);
  const suppressCardClickRef = useRef(false);
  // Set by a card button on pointerdown (touch), consumed by the row handler.
  const pendingCardDragRef = useRef<CardDragPayload | null>(null);
  // Floating card that follows the finger during a touch drag.
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);

  const headquartersList = useMemo(
    () =>
      getDeckBuildingHeadquarters().filter((headquarters) =>
        progress.unlockedHeadquartersIds.includes(headquarters.id)
      ),
    [progress.unlockedHeadquartersIds]
  );
  const selectedHeadquarters = selectedHeadquartersId
    ? HEADQUARTERS[selectedHeadquartersId]
    : null;
  const deckFull = deckCardIds.length >= DECK_UNIT_LIMIT;
  const validation = validateDeck(selectedHeadquartersId, deckCardIds, progress);

  const availableCards = useMemo(() => {
    if (!selectedHeadquarters) return [];

    return getAvailableDeckCards(
      selectedHeadquarters.id,
      unitTypeFilter,
      nationFilter,
      progress
    );
  }, [nationFilter, progress, selectedHeadquarters, unitTypeFilter]);

  const groupedDeckCards = useMemo(
    () => getGroupedDeckCards(deckCardIds),
    [deckCardIds]
  );

  // The "all" reset option doubles as the dropdown's resting label, so it reads
  // "Тип"/"Нация" instead of "Все".
  const unitTypeOptions = useMemo(
    () =>
      UNIT_TYPE_FILTERS.map((filter) => ({
        ...filter,
        label: filter.value === "all" ? "Тип" : filter.label,
        icon: UNIT_TYPE_FILTER_ICONS[filter.value],
      })),
    []
  );
  const nationOptions = useMemo(
    () =>
      NATION_FILTERS.map((filter) => ({
        ...filter,
        label: filter.value === "all" ? "Нация" : filter.label,
        icon: getNationFilterIcon(filter.value),
        iconShape: "cover" as const,
      })),
    []
  );
  const deckWeight = selectedHeadquartersId
    ? calculateDeckWeight(selectedHeadquartersId, deckCardIds)
    : null;

  useEffect(() => {
    const rows = [collectionRowRef.current, deckRowRef.current].filter(
      (row): row is HTMLDivElement => row !== null
    );

    function handleNativeWheel(event: globalThis.WheelEvent) {
      const row = event.currentTarget as HTMLDivElement | null;
      if (!row) return;

      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (delta === 0) return;
      event.preventDefault();
      row.scrollLeft += delta;
    }

    rows.forEach((row) => {
      row.addEventListener("wheel", handleNativeWheel, { passive: false });
    });

    return () => {
      rows.forEach((row) => {
        row.removeEventListener("wheel", handleNativeWheel);
      });
    };
  }, []);

  function selectHeadquarters(headquartersId: HeadquartersId) {
    setSelectedHeadquartersId(headquartersId);
    setDeckName(getNextDefaultDeckName(headquartersId));
    setDeckCardIds([]);
    setUnitTypeFilter("all");
    setNationFilter("all");
  }

  function resetHeadquarters() {
    setSelectedHeadquartersId(null);
    setDeckName("");
    setDeckCardIds([]);
    setUnitTypeFilter("all");
    setNationFilter("all");
  }

  function addCard(cardId: string) {
    if (!selectedHeadquarters || deckFull) return;
    if (countCardCopies(deckCardIds, cardId) >= CARD_COPY_LIMIT) return;
    if (countCardCopies(deckCardIds, cardId) >= (progress.ownedCardCopies[cardId] ?? 0)) {
      return;
    }

    setDeckCardIds((current) => [...current, cardId]);
    setSaveMessage(null);
  }

  function removeCard(cardId: string) {
    setDeckCardIds((current) => {
      const index = current.lastIndexOf(cardId);
      if (index < 0) return current;

      return [...current.slice(0, index), ...current.slice(index + 1)];
    });
    setSaveMessage(null);
  }

  async function saveDeck() {
    if (!profileServerReady) {
      setSaveMessage(
        profileServerUnavailable
          ? "Сервер профиля недоступен"
          : "Дождитесь синхронизации профиля"
      );
      return;
    }

    if (!selectedHeadquartersId || !validation.valid) {
      setSaveMessage(validation.message);
      return;
    }

    const deckDraft = editingDeck
      ? createUpdatedCustomDeckDraft(
          editingDeck,
          selectedHeadquartersId,
          deckCardIds,
          deckName
        )
      : createCustomDeckDraft(selectedHeadquartersId, deckCardIds, deckName);

    try {
      const savedDeck = await saveCustomDeckToServer(deckDraft);
      setSaveMessage(`Колода ${savedDeck.name} сохранена`);
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "Server rejected deck"
      );
      return;
    }

    onSaved();
  }

  async function retryProfileSync() {
    try {
      await retryProfileConnection();
      const serverProgress = await syncPlayerProgressFromServer();
      setProgress(serverProgress);
      setSaveMessage(null);
    } catch {
      setSaveMessage("Сервер профиля недоступен");
    }
  }

  function openCardPreview(event: MouseEvent, previewValue: DeckBuilderPreview) {
    event.preventDefault();
    event.stopPropagation();
    setPreview(previewValue);
  }

  function closeCardPreview() {
    setPreview(null);
  }

  useEffect(() => {
    if (!preview) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCardPreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview]);

  // Records which card a touch started on (called from the card's own
  // onPointerDown, which fires before the row's bubbling handler below).
  function recordCardDragStart(payload: CardDragPayload) {
    pendingCardDragRef.current = payload;
  }

  function resolveDragGhost(state: DragScrollState): Omit<DragGhost, "x" | "y"> | null {
    if (state.dragKind === "hq" && state.dragHqId) {
      return { headquarters: HEADQUARTERS[state.dragHqId] };
    }
    if (state.dragCardId) {
      const card =
        availableCards.find((entry) => entry.id === state.dragCardId) ??
        groupedDeckCards.find((entry) => entry.card.id === state.dragCardId)
          ?.card;
      if (card) return { card };
    }
    return null;
  }

  function beginCardDrag(
    event: PointerEvent<HTMLDivElement>,
    state: DragScrollState
  ) {
    const ghost = resolveDragGhost(state);
    setDragGhost(
      ghost ? { ...ghost, x: event.clientX, y: event.clientY } : null
    );
    // Highlight the zone the card would land in.
    if (state.dragKind === "deck-card") {
      setCollectionDropActive(true);
    } else {
      setDeckDropActive(true);
    }
  }

  function endCardDrag() {
    setDragGhost(null);
    setDeckDropActive(false);
    setCollectionDropActive(false);
  }

  function dropCard(event: PointerEvent<HTMLDivElement>, state: DragScrollState) {
    const dropEl = document.elementFromPoint(
      event.clientX,
      event.clientY
    ) as HTMLElement | null;
    const zone = dropEl
      ?.closest("[data-dropzone]")
      ?.getAttribute("data-dropzone");
    if (!zone) return;

    if (state.dragKind === "deck-card") {
      if (zone === "collection" && state.dragCardId) removeCard(state.dragCardId);
    } else if (state.dragKind === "card") {
      if (zone === "deck" && state.dragCardId) addCard(state.dragCardId);
    } else if (state.dragKind === "hq") {
      if (zone === "deck" && state.dragHqId) selectHeadquarters(state.dragHqId);
    }
  }

  function startDragScroll(
    event: PointerEvent<HTMLDivElement>,
    rowRef: RefObject<HTMLDivElement | null>,
    stateRef: RefObject<DragScrollState | null>
  ) {
    // Always consume the pending payload so it can't leak into a later press
    // (e.g. after an ignored right-click).
    const payload = pendingCardDragRef.current;
    pendingCardDragRef.current = null;

    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("select")) return;

    const row = rowRef.current;
    if (!row) return;

    const startsOnCard = Boolean(payload ?? target?.closest("button"));

    stateRef.current = {
      active: true,
      captured: false,
      moved: false,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: row.scrollLeft,
      // Background presses commit straight to scrolling; presses on a card stay
      // undecided until the gesture direction is known.
      mode: startsOnCard ? "idle" : "scroll",
      dragKind: payload?.kind ?? null,
      dragCardId: payload?.cardId ?? null,
      dragHqId: payload?.hqId ?? null,
    };

    if (!startsOnCard) {
      stateRef.current.captured = true;
      row.setPointerCapture(event.pointerId);
    }
  }

  function moveDragScroll(
    event: PointerEvent<HTMLDivElement>,
    rowRef: RefObject<HTMLDivElement | null>,
    stateRef: RefObject<DragScrollState | null>
  ) {
    const state = stateRef.current;
    const row = rowRef.current;
    if (!state?.active || !row || state.pointerId !== event.pointerId) return;

    // Map the raw screen movement onto the stage axes so the gestures stay
    // correct on a portrait phone, where the stage is rotated 90°.
    const { x: stageX, y: stageY } = screenDeltaToStage(
      event.clientX - state.startX,
      event.clientY - state.startY
    );

    if (state.mode === "idle") {
      const absX = Math.abs(stageX);
      const absY = Math.abs(stageY);
      // Native HTML5 drag still drives desktop mouse, so the pointer-based card
      // drag is reserved for touch/pen. A mostly-vertical drag (toward the other
      // zone) moves the card; a horizontal drag scrolls the row.
      const canCardDrag = state.dragKind !== null && state.pointerType !== "mouse";
      if (canCardDrag && absY > absX && absY > 12) {
        state.mode = "card";
        state.moved = true;
        if (!row.hasPointerCapture(event.pointerId)) {
          row.setPointerCapture(event.pointerId);
          state.captured = true;
        }
        beginCardDrag(event, state);
      } else if (absX > 6 && absX >= absY) {
        state.mode = "scroll";
        state.moved = true;
        if (state.pointerType !== "mouse" && !row.hasPointerCapture(event.pointerId)) {
          row.setPointerCapture(event.pointerId);
          state.captured = true;
        }
      } else {
        return;
      }
    }

    if (state.mode === "scroll") {
      row.scrollLeft = state.startScrollLeft - stageX;
    } else if (state.mode === "card") {
      setDragGhost((ghost) =>
        ghost ? { ...ghost, x: event.clientX, y: event.clientY } : ghost
      );
    }
  }

  function stopDragScroll(
    event: PointerEvent<HTMLDivElement>,
    rowRef: RefObject<HTMLDivElement | null>,
    stateRef: RefObject<DragScrollState | null>
  ) {
    const state = stateRef.current;
    const row = rowRef.current;
    if (!state?.active || !row || state.pointerId !== event.pointerId) return;

    if (state.captured && row.hasPointerCapture(event.pointerId)) {
      row.releasePointerCapture(event.pointerId);
    }

    // Only a genuine pointerup (not a cancel) commits the drop.
    if (state.mode === "card" && event.type !== "pointercancel") {
      dropCard(event, state);
    }

    if (state.mode === "card") {
      endCardDrag();
    }

    if (state.moved) {
      suppressCardClickRef.current = true;
      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 180);
    }

    stateRef.current = null;
  }

  function shouldIgnoreCardClick() {
    if (!suppressCardClickRef.current) return false;

    suppressCardClickRef.current = false;
    return true;
  }

  function handleRowWheelCapture(
    event: ReactWheelEvent<HTMLDivElement>,
    rowRef: RefObject<HTMLDivElement | null>
  ) {
    const row = rowRef.current;
    if (!row) return;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

    if (delta === 0) return;
    event.preventDefault();
    row.scrollLeft += delta;
  }

  function handleCardDragStart(event: DragEvent<HTMLButtonElement>, cardId: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-tank-card", cardId);
    event.dataTransfer.setData("text/plain", cardId);
  }

  function handleDeckCardDragStart(
    event: DragEvent<HTMLButtonElement>,
    cardId: string
  ) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tank-deck-card", cardId);
    event.dataTransfer.setData("text/plain", cardId);
  }

  function handleHeadquartersDragStart(
    event: DragEvent<HTMLButtonElement>,
    headquartersId: HeadquartersId
  ) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-tank-headquarters", headquartersId);
    event.dataTransfer.setData("text/plain", headquartersId);
  }

  function handleDeckDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDeckDropActive(true);
  }

  function handleDeckDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDeckDropActive(false);

    const headquartersId = event.dataTransfer.getData(
      "application/x-tank-headquarters"
    ) as HeadquartersId;
    if (headquartersId && HEADQUARTERS[headquartersId]) {
      selectHeadquarters(headquartersId);
      return;
    }

    const cardId =
      event.dataTransfer.getData("application/x-tank-card") ||
      event.dataTransfer.getData("text/plain");
    if (!cardId) return;

    addCard(cardId);
  }

  function handleCollectionDragOver(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("application/x-tank-deck-card")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setCollectionDropActive(true);
  }

  function handleCollectionDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setCollectionDropActive(false);

    const cardId = event.dataTransfer.getData("application/x-tank-deck-card");
    if (!cardId) return;

    removeCard(cardId);
  }

  function handleHeadquartersClick(headquartersId: HeadquartersId) {
    if (shouldIgnoreCardClick()) return;
    selectHeadquarters(headquartersId);
  }

  function handleAvailableCardClick(cardId: string) {
    if (shouldIgnoreCardClick()) return;
    addCard(cardId);
  }

  function handleDeckHeadquartersClick() {
    if (shouldIgnoreCardClick()) return;
    resetHeadquarters();
  }

  function handleDeckCardClick(cardId: string) {
    if (shouldIgnoreCardClick()) return;
    removeCard(cardId);
  }

  return (
    <main style={styles.page}>
      <StageBackground
        color="#0a0d0a"
        image="radial-gradient(circle at 50% 6%, rgba(210, 168, 70, 0.16), transparent 35%), linear-gradient(90deg, rgba(3,5,5,0.96), rgba(15,18,14,0.88) 48%, rgba(3,5,5,0.98)), url('/menu-background.png')"
      />
      <div style={styles.backgroundShade} />

      <header style={styles.header}>
        <button type="button" style={styles.backButton} onClick={onBack}>
          ←
        </button>
        <div>
          <h1 style={styles.title}>
            {editingDeck ? "Редактирование колоды" : "Создание колоды"}
          </h1>
        </div>
        <div style={styles.headerActions}>
          <input
            type="text"
            value={deckName}
            onChange={(event) => setDeckName(event.target.value)}
            disabled={!selectedHeadquarters}
            placeholder="Имя колоды"
            style={{
              ...styles.deckNameInput,
              ...(!selectedHeadquarters ? styles.deckNameInputDisabled : {}),
            }}
            aria-label="Имя колоды"
          />
          {selectedHeadquarters ? (
            <div style={styles.filters}>
              <FilterDropdown
                value={unitTypeFilter}
                options={unitTypeOptions}
                onChange={setUnitTypeFilter}
                ariaLabel="Фильтр по типу юнита"
              />
              <FilterDropdown
                value={nationFilter}
                options={nationOptions}
                onChange={setNationFilter}
                ariaLabel="Фильтр по нации"
              />
            </div>
          ) : null}
          <div style={styles.deckCounter}>
            <span>Колода</span>
            <strong>{deckCardIds.length}/{DECK_UNIT_LIMIT}</strong>
          </div>
          <div style={styles.deckWeightBadge}>
            <span>Вес</span>
            <strong>{deckWeight?.totalWeight ?? "—"}</strong>
          </div>
          <button
            type="button"
            style={{
              ...styles.readyButton,
              ...(!validation.valid ? styles.saveButtonDisabled : {}),
            }}
            disabled={!validation.valid}
            onClick={saveDeck}
          >
            Готово
          </button>
        </div>
      </header>

      {profileServerUnavailable ? (
        <div style={styles.profileServerBanner}>
          <span>
            {profileConnection.message ?? "Сервер профиля недоступен"}
          </span>
          <button
            type="button"
            style={styles.profileServerRetryButton}
            onClick={() => void retryProfileSync()}
          >
            Повторить
          </button>
        </div>
      ) : null}

      <section style={styles.workspace}>
        <section style={styles.collectionPanel}>
          <div style={styles.rowFrame}>
            <button
              type="button"
              style={{ ...styles.rowNav, ...styles.rowNavLeft }}
              onClick={() => scrollRow(collectionRowRef, -1)}
              aria-label="Прокрутить коллекцию влево"
            >
              ‹
            </button>

            <div
              ref={collectionRowRef}
              className="menu-carousel-scroll"
              data-dropzone="collection"
              style={{
                ...styles.cardRow,
                ...(collectionDropActive ? styles.collectionDropActive : {}),
              }}
              onDragOver={handleCollectionDragOver}
              onDragLeave={() => setCollectionDropActive(false)}
              onDrop={handleCollectionDrop}
              onPointerDown={(event) =>
                startDragScroll(event, collectionRowRef, collectionDragScrollRef)
              }
              onPointerMove={(event) =>
                moveDragScroll(event, collectionRowRef, collectionDragScrollRef)
              }
              onPointerUp={(event) =>
                stopDragScroll(event, collectionRowRef, collectionDragScrollRef)
              }
              onPointerCancel={(event) =>
                stopDragScroll(event, collectionRowRef, collectionDragScrollRef)
              }
              onWheelCapture={(event) =>
                handleRowWheelCapture(event, collectionRowRef)
              }
            >
              {!selectedHeadquarters
                ? headquartersList.map((headquarters) => (
                      <motion.button
                        key={headquarters.id}
                        type="button"
                        className="deck-builder-card-button"
                        style={styles.cardButton}
                      draggable
                      onPointerDown={() =>
                        recordCardDragStart({ kind: "hq", hqId: headquarters.id })
                      }
                      onDragStartCapture={(event) =>
                        handleHeadquartersDragStart(
                          event as unknown as DragEvent<HTMLButtonElement>,
                          headquarters.id
                        )
                      }
                      onClick={() => handleHeadquartersClick(headquarters.id)}
                      onContextMenu={(event) =>
                        openCardPreview(event, {
                          type: "headquarters",
                          headquarters,
                        })
                      }
                      whileHover={{ y: -6, scale: 1.025 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ type: "spring", stiffness: 360, damping: 28 }}
                      aria-label={`Выбрать штаб ${headquarters.title}`}
                    >
                      <MiniHandCard
                        headquarters={headquarters}
                        headquartersId={headquarters.id}
                      />
                    </motion.button>
                  ))
                : availableCards.map((card) => {
                    const copies = countCardCopies(deckCardIds, card.id);
                    const ownedCopies = progress.ownedCardCopies[card.id] ?? 0;
                    const disabled =
                      deckFull ||
                      copies >= CARD_COPY_LIMIT ||
                      copies >= ownedCopies;

                    return (
                      <motion.button
                        key={card.id}
                        initial={{ opacity: 0, y: 18, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        type="button"
                        className="deck-builder-card-button"
                        style={styles.cardButton}
                        disabled={disabled}
                        draggable={!disabled}
                        onPointerDown={
                          disabled
                            ? undefined
                            : () =>
                                recordCardDragStart({
                                  kind: "card",
                                  cardId: card.id,
                                })
                        }
                        onDragStartCapture={(event) =>
                          handleCardDragStart(
                            event as unknown as DragEvent<HTMLButtonElement>,
                            card.id
                          )
                        }
                        onClick={() => handleAvailableCardClick(card.id)}
                        onContextMenu={(event) =>
                          openCardPreview(event, { type: "card", card })
                        }
                        whileHover={disabled ? undefined : { y: -6, scale: 1.025 }}
                        whileTap={disabled ? undefined : { scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 360, damping: 28 }}
                        aria-label={`Добавить ${card.name}`}
                      >
                        <MiniHandCard card={card} disabled={disabled} />
                        <span
                          className="deck-card-weight-badge"
                          style={styles.cardWeightBadge}
                        >
                          Вес {getCardLevel(card)}
                        </span>
                      </motion.button>
                    );
                  })}
            </div>

            <button
              type="button"
              style={{ ...styles.rowNav, ...styles.rowNavRight }}
              onClick={() => scrollRow(collectionRowRef, 1)}
              aria-label="Прокрутить коллекцию вправо"
            >
              ›
            </button>
          </div>
        </section>

        <section style={styles.deckPanel}>
          <div style={styles.rowFrame}>
            <AnimatePresence>
              {deckDropActive ? (
                <motion.div
                  style={styles.deckDropGlow}
                  initial={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
                  animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                  exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                />
              ) : null}
            </AnimatePresence>

            <button
              type="button"
              style={{ ...styles.rowNav, ...styles.rowNavLeft }}
              onClick={() => scrollRow(deckRowRef, -1)}
              aria-label="Прокрутить колоду влево"
            >
              ‹
            </button>

            <div
              ref={deckRowRef}
              className="menu-carousel-scroll"
              data-dropzone="deck"
              style={{
                ...styles.cardRow,
                ...(deckDropActive ? styles.deckDropActive : {}),
              }}
              onDragOver={handleDeckDragOver}
              onDragLeave={() => setDeckDropActive(false)}
              onDrop={handleDeckDrop}
              onPointerDown={(event) =>
                startDragScroll(event, deckRowRef, deckDragScrollRef)
              }
              onPointerMove={(event) =>
                moveDragScroll(event, deckRowRef, deckDragScrollRef)
              }
              onPointerUp={(event) =>
                stopDragScroll(event, deckRowRef, deckDragScrollRef)
              }
              onPointerCancel={(event) =>
                stopDragScroll(event, deckRowRef, deckDragScrollRef)
              }
              onWheelCapture={(event) => handleRowWheelCapture(event, deckRowRef)}
            >
              {selectedHeadquarters ? (
                <motion.button
                  type="button"
                  className="deck-builder-card-button"
                  style={styles.cardButton}
                  onClick={handleDeckHeadquartersClick}
                  onContextMenu={(event) =>
                    openCardPreview(event, {
                      type: "headquarters",
                      headquarters: selectedHeadquarters,
                    })
                  }
                  whileHover={{ y: -4, scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 360, damping: 28 }}
                  aria-label="Сменить выбранный штаб"
                >
                  <MiniHandCard
                    headquarters={selectedHeadquarters}
                    headquartersId={selectedHeadquarters.id}
                  />
                </motion.button>
              ) : null}

              {groupedDeckCards.map(({ card, count }) => (
                <motion.button
                  key={card.id}
                  type="button"
                  className="deck-builder-card-button"
                  style={styles.cardButton}
                  draggable
                  onPointerDown={() =>
                    recordCardDragStart({ kind: "deck-card", cardId: card.id })
                  }
                  onDragStartCapture={(event) =>
                    handleDeckCardDragStart(
                      event as unknown as DragEvent<HTMLButtonElement>,
                      card.id
                    )
                  }
                  onClick={() => handleDeckCardClick(card.id)}
                  onContextMenu={(event) =>
                    openCardPreview(event, { type: "card", card })
                  }
                  whileHover={{ y: -4, scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 360, damping: 28 }}
                  aria-label={`Убрать ${card.name}`}
                >
                  <MiniHandCard card={card} />
                  <span
                    className="deck-card-weight-badge"
                    style={styles.cardWeightBadge}
                  >
                    Вес {getCardLevel(card)}
                  </span>
                  <span style={styles.deckCopyBadge}>x{count}</span>
                </motion.button>
              ))}
            </div>

            <button
              type="button"
              style={{ ...styles.rowNav, ...styles.rowNavRight }}
              onClick={() => scrollRow(deckRowRef, 1)}
              aria-label="Прокрутить колоду вправо"
            >
              ›
            </button>
          </div>

          {saveMessage ? <div style={styles.saveMessage}>{saveMessage}</div> : null}
        </section>
      </section>

      {dragGhost
        ? createPortal(
            <div
              style={{
                position: "fixed",
                left: dragGhost.x,
                top: dragGhost.y,
                zIndex: 9500,
                pointerEvents: "none",
                transform: "translate(-50%, -50%)",
              }}
            >
              <div style={{ ...stageOverlayTransform, opacity: 0.92 }}>
                <MiniHandCard
                  card={dragGhost.card}
                  headquarters={dragGhost.headquarters}
                  headquartersId={dragGhost.headquarters?.id}
                />
              </div>
            </div>,
            document.body
          )
        : null}

      {createPortal(
        <AnimatePresence>
          {preview ? (
            <motion.div
              style={styles.previewOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onMouseDown={closeCardPreview}
              onContextMenu={(event) => {
                event.preventDefault();
                closeCardPreview();
              }}
            >
              <div style={{ ...stageOverlayTransform, display: "flex" }}>
              <motion.div
                style={styles.previewDialog}
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
                <CardKeywordsPanel
                  keywords={
                    preview.type === "card"
                      ? getCardKeywords(preview.card)
                      : getHeadquartersKeywords(preview.headquarters.ability)
                  }
                />

                <button
                  type="button"
                  style={styles.previewCloseButton}
                  onClick={closeCardPreview}
                  aria-label="Закрыть просмотр карты"
                >
                  ×
                </button>

                {preview.type === "card" ? (
                  <HandCardView
                    card={preview.card}
                    ownerId="player"
                    displayMode="preview"
                  />
                ) : (
                  <HandCardView
                    ownerId="player"
                    artOwnerId="player"
                    headquartersId={preview.headquarters.id}
                    headquarters={{
                      hp: preview.headquarters.hp,
                      attack: preview.headquarters.attack,
                      fuelGeneration: preview.headquarters.fuelGeneration,
                    }}
                    displayMode="preview"
                  />
                )}

                <div style={styles.previewHint}>ПКМ по фону или Esc — закрыть</div>
              </motion.div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    position: "relative",
    minHeight: "100cqh",
    height: "100cqh",
    overflow: "hidden",
    color: "#f2e4c2",
    // Background is painted full-viewport by <StageBackground/> so it fills the
    // letterbox margins; keep this box transparent to show it through.
    background: "transparent",
    fontFamily: "var(--font-body)",
  },

  backgroundShade: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.12) 42%, rgba(0,0,0,0.68) 100%)",
  },

  header: {
    position: "relative",
    // Above the workspace (zIndex 2) so the open filter dropdown is not covered
    // by the card rows below it.
    zIndex: 40,
    height: 82,
    display: "grid",
    gridTemplateColumns: "64px 1fr auto",
    alignItems: "center",
    gap: 18,
    padding: "12px 30px",
    background: "transparent",
    boxShadow: "none",
    boxSizing: "border-box",
  },

  profileServerBanner: {
    position: "absolute",
    top: 84,
    left: "50%",
    zIndex: 30,
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
  },

  backButton: {
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
    fontSize: 25,
    fontWeight: 1000,
    lineHeight: 1,
    display: "grid",
    placeItems: "center",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.2)",
    boxShadow: "none",
  },

  kicker: {
    color: "#bf9e57",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 3,
    textTransform: "uppercase",
  },

  title: {
    margin: "2px 0 0",
    color: "#f7e8b8",
    fontSize: 31,
    lineHeight: 1,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textShadow: "0 2px 10px rgba(0,0,0,0.9)",
  },

  deckCounter: {
    minWidth: 136,
    display: "grid",
    gridTemplateColumns: "auto auto",
    columnGap: 10,
    alignItems: "baseline",
    padding: "9px 13px",
    borderRadius: 4,
    background: "rgba(13, 16, 13, 0.48)",
  },

  deckWeightBadge: {
    minWidth: 112,
    display: "grid",
    gridTemplateColumns: "auto auto",
    columnGap: 10,
    alignItems: "baseline",
    padding: "9px 13px",
    borderRadius: 4,
    background:
      "linear-gradient(180deg, rgba(24, 52, 30, 0.48), rgba(10, 18, 11, 0.46))",
    color: "#c8efaa",
    boxShadow: "none",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  deckNameInput: {
    width: 230,
    height: 38,
    padding: "0 12px",
    border: "none",
    borderRadius: 4,
    background: "rgba(15, 18, 14, 0.58)",
    color: "#f8e3ae",
    fontSize: 13,
    fontWeight: 900,
    outline: "none",
    boxSizing: "border-box",
    boxShadow: "none",
  },

  deckNameInputDisabled: {
    opacity: 0.46,
    cursor: "default",
  },

  filters: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  readyButton: {
    height: 48,
    minWidth: 122,
    padding: "0 22px 2px",
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
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.22)",
    boxShadow: "none",
  },

  workspace: {
    position: "relative",
    zIndex: 2,
    height: "calc(100cqh - 82px)",
    width: "100%",
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "1fr 1fr",
    gap: 0,
    padding: "10px 5.5cqw 24px",
    boxSizing: "border-box",
  },

  collectionPanel: {
    position: "relative",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
    overflow: "visible",
    display: "grid",
    gridTemplateRows: "1fr",
    background: "transparent",
  },

  deckPanel: {
    position: "relative",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
    overflow: "visible",
    display: "grid",
    gridTemplateRows: "1fr auto",
    background: "transparent",
  },

  dropdown: {
    position: "relative",
    minWidth: 132,
  },

  dropdownTrigger: {
    width: "100%",
    minWidth: 132,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "0 12px",
    border: "1px solid rgba(232, 198, 112, 0.32)",
    borderRadius: 4,
    background:
      "linear-gradient(180deg, rgba(36, 31, 21, 0.92), rgba(15, 13, 9, 0.94))",
    color: "#f8e3ae",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
    cursor: "pointer",
    outline: "none",
    boxSizing: "border-box",
  },

  dropdownTriggerContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    overflow: "hidden",
  },

  dropdownTriggerLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  dropdownIcon: {
    flex: "0 0 auto",
    width: 18,
    height: 18,
    objectFit: "contain",
    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
  },

  // Nation flags read better as a cropped square chip (matching the research
  // tree rail) rather than a letterboxed full flag.
  dropdownFlagIcon: {
    width: 20,
    height: 20,
    objectFit: "cover",
    borderRadius: 3,
    border: "1px solid rgba(232, 198, 112, 0.4)",
  },

  dropdownIconPlaceholder: {
    flex: "0 0 auto",
    width: 18,
    height: 18,
  },

  dropdownOptionLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  dropdownChevron: {
    flex: "0 0 auto",
    fontSize: 11,
    color: "rgba(246, 220, 145, 0.78)",
    transition: "transform 140ms ease",
  },

  dropdownChevronOpen: {
    transform: "rotate(180deg)",
  },

  dropdownMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 50,
    minWidth: "100%",
    maxHeight: 248,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    padding: 5,
    borderRadius: 6,
    border: "1px solid rgba(232, 198, 112, 0.4)",
    background:
      "linear-gradient(180deg, rgba(34, 30, 22, 0.98), rgba(14, 12, 9, 0.98))",
    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
    scrollbarWidth: "none",
  },

  dropdownOption: {
    width: "100%",
    minHeight: 32,
    padding: "0 12px",
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "#ece0cc",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.3,
    textAlign: "left",
    whiteSpace: "nowrap",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 9,
  },

  dropdownOptionActive: {
    background:
      "linear-gradient(180deg, rgba(120, 92, 44, 0.95), rgba(70, 52, 24, 0.95))",
    color: "#fff3d6",
  },

  saveButtonDisabled: {
    cursor: "default",
    opacity: 0.48,
    filter: "grayscale(0.42)",
  },

  rowFrame: {
    position: "relative",
    zIndex: 1,
    minHeight: 0,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    height: "100%",
    overflow: "visible",
    display: "grid",
    gridTemplateColumns: "58px minmax(0, 1fr) 58px",
    alignItems: "stretch",
  },

  cardRow: {
    position: "relative",
    zIndex: 8,
    height: "100%",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
    overflowX: "auto",
    overflowY: "visible",
    padding: "18px 8px 16px",
    scrollbarWidth: "none",
    boxSizing: "border-box",
    // The stage is rotated 90° on portrait phones, so the browser's own panning
    // can't follow the visual axis — we drive scroll + card drag from pointer
    // events instead and disable native touch panning here.
    touchAction: "none",
    cursor: "grab",
  },

  deckDropActive: {
    background: "transparent",
  },

  deckDropGlow: {
    position: "absolute",
    left: "50%",
    top: "50%",
    zIndex: 5,
    width: "min(820px, 78cqw)",
    height: "min(310px, 38cqh)",
    transform: "translate(-50%, -50%)",
    borderRadius: 999,
    background:
      "radial-gradient(circle at 50% 48%, rgba(255, 236, 151, 0.58), rgba(247, 196, 68, 0.34) 30%, rgba(247, 185, 73, 0.13) 58%, transparent 80%)",
    filter: "blur(28px)",
    pointerEvents: "none",
  },

  collectionDropActive: {
    background: "transparent",
  },

  rowNav: {
    position: "relative",
    zIndex: 12,
    width: 58,
    height: "100%",
    border: "none",
    background: "transparent",
    color: "rgba(255, 235, 176, 0.96)",
    cursor: "pointer",
    fontSize: 54,
    fontWeight: 800,
    textShadow: "0 3px 12px rgba(0,0,0,0.95)",
    boxShadow: "none",
  },

  rowNavLeft: {
    background: "transparent",
  },

  rowNavRight: {
    background: "transparent",
  },

  cardButton: {
    position: "relative",
    flex: "0 0 auto",
    width: BUILDER_CARD_WIDTH + 8,
    minHeight: BUILDER_CARD_HEIGHT + 10,
    padding: "5px 4px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f8e3ae",
    cursor: "pointer",
    textAlign: "center",
    boxSizing: "border-box",
  },

  cardWeightBadge: {
    position: "absolute",
    left: "50%",
    bottom: 6,
    zIndex: 8,
    transform: "translate(-50%, 8px)",
    padding: "4px 8px",
    background:
      "linear-gradient(180deg, rgba(36, 31, 18, 0.84), rgba(11, 12, 10, 0.84))",
    color: "#f6dc91",
    fontSize: 10,
    fontWeight: 1000,
    lineHeight: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    opacity: 0,
    pointerEvents: "none",
    textShadow: "0 2px 2px rgba(0,0,0,0.9)",
    boxShadow: "none",
    transition: "opacity 140ms ease, transform 140ms ease",
  },

  cardScaleSlot: {
    position: "relative",
    width: BUILDER_CARD_WIDTH,
    height: BUILDER_CARD_HEIGHT,
    margin: "0 auto",
    overflow: "visible",
  },

  cardScaleSlotDisabled: {
    opacity: 0.46,
    filter: "grayscale(0.58)",
  },

  cardScale: {
    position: "absolute",
    left: "50%",
    top: 0,
    width: HAND_CARD_BASE_WIDTH,
    height: HAND_CARD_BASE_HEIGHT,
    transformOrigin: "center top",
  },

  deckCopyBadge: {
    position: "absolute",
    right: 8,
    bottom: 9,
    minWidth: 35,
    padding: "4px 7px",
    borderRadius: 5,
    background: "rgba(5, 7, 6, 0.72)",
    color: "#ffe9a8",
    fontSize: 13,
    fontWeight: 1000,
    boxShadow: "none",
  },

  saveMessage: {
    padding: "6px 18px 10px",
    color: "#f3cc6e",
    fontSize: 12,
    fontWeight: 900,
    textAlign: "right",
    textShadow: "0 2px 8px rgba(0,0,0,0.9)",
  },

  previewOverlay: {
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

  previewDialog: {
    position: "relative",
    // Fixed design width; the parent wrapper carries the stage scale/rotation.
    width: 390,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 28px 44px rgba(0,0,0,0.72))",
  },

  previewCloseButton: {
    position: "absolute",
    right: -12,
    top: -12,
    zIndex: 10,
    width: 34,
    height: 34,
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    background:
      "linear-gradient(180deg, rgba(38,40,40,0.96), rgba(5,6,6,0.96))",
    color: "#f3ead0",
    cursor: "pointer",
    fontSize: 24,
    fontWeight: 900,
    lineHeight: "30px",
    textAlign: "center",
    boxShadow: "0 10px 22px rgba(0,0,0,0.58)",
  },

  previewHint: {
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
