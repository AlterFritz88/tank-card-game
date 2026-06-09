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
import { AnimatePresence, motion } from "framer-motion";
import buttonImage from "../assets/button.png";
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
  countCardCopies,
  getAvailableDeckCards,
  getGroupedDeckCards,
  getNextDefaultDeckName,
  saveCustomDeck,
  updateCustomDeck,
  validateDeck,
  type NationFilter,
  type SavedDeck,
  type UnitTypeFilter,
} from "../game/customDecks";
import type { HeadquartersId, TankCard } from "../game/types";
import { HandCardView } from "./HandCardView";
import { calculateDeckWeight, getCardLevel } from "../game/deckWeight";
import { loadPlayerProgress } from "../game/playerProgress";

const HAND_CARD_BASE_WIDTH = 175;
const HAND_CARD_BASE_HEIGHT = Math.round((HAND_CARD_BASE_WIDTH * 1496) / 1051);
const BUILDER_CARD_SCALE = 0.76;
const BUILDER_CARD_WIDTH = Math.round(HAND_CARD_BASE_WIDTH * BUILDER_CARD_SCALE);
const BUILDER_CARD_HEIGHT = Math.round(HAND_CARD_BASE_HEIGHT * BUILDER_CARD_SCALE);

type DragScrollState = {
  active: boolean;
  captured: boolean;
  moved: boolean;
  pointerId: number;
  startX: number;
  startScrollLeft: number;
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
  const [progress] = useState(() => loadPlayerProgress());
  const collectionRowRef = useRef<HTMLDivElement>(null);
  const deckRowRef = useRef<HTMLDivElement>(null);
  const collectionDragScrollRef = useRef<DragScrollState | null>(null);
  const deckDragScrollRef = useRef<DragScrollState | null>(null);
  const suppressCardClickRef = useRef(false);

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

  function saveDeck() {
    if (!selectedHeadquartersId || !validation.valid) {
      setSaveMessage(validation.message);
      return;
    }

    const savedDeck = editingDeck
      ? updateCustomDeck(
          editingDeck.id,
          selectedHeadquartersId,
          deckCardIds,
          deckName
        )
      : saveCustomDeck(selectedHeadquartersId, deckCardIds, deckName);

    if (!savedDeck) {
      setSaveMessage("Не удалось обновить колоду");
      return;
    }

    setSaveMessage(`Колода ${savedDeck.name} сохранена`);
    onSaved();
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

  function startDragScroll(
    event: PointerEvent<HTMLDivElement>,
    rowRef: RefObject<HTMLDivElement | null>,
    stateRef: RefObject<DragScrollState | null>
  ) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("select")) return;

    const row = rowRef.current;
    if (!row) return;
    const startsOnCard = Boolean(target?.closest("button"));

    stateRef.current = {
      active: true,
      captured: !startsOnCard,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: row.scrollLeft,
    };

    if (!startsOnCard) {
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

    const distance = event.clientX - state.startX;
    if (Math.abs(distance) > 6) {
      state.moved = true;
    }

    row.scrollLeft = state.startScrollLeft - distance;
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
              <select
                value={unitTypeFilter}
                onChange={(event) =>
                  setUnitTypeFilter(event.target.value as UnitTypeFilter)
                }
                style={styles.filterSelect}
                aria-label="Фильтр по типу юнита"
              >
                {UNIT_TYPE_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>

              <select
                value={nationFilter}
                onChange={(event) =>
                  setNationFilter(event.target.value as NationFilter)
                }
                style={styles.filterSelect}
                aria-label="Фильтр по нации"
              >
                {NATION_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    position: "relative",
    minHeight: "100vh",
    height: "100vh",
    overflow: "hidden",
    color: "#f2e4c2",
    backgroundImage:
      "radial-gradient(circle at 50% 6%, rgba(210, 168, 70, 0.16), transparent 35%), linear-gradient(90deg, rgba(3,5,5,0.96), rgba(15,18,14,0.88) 48%, rgba(3,5,5,0.98)), url('/menu-background.png')",
    backgroundSize: "cover",
    backgroundPosition: "center",
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
    zIndex: 2,
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
    height: "calc(100vh - 82px)",
    width: "100%",
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "1fr 1fr",
    gap: 0,
    padding: "10px 5.5vw 24px",
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

  filterSelect: {
    minWidth: 132,
    height: 34,
    border: "none",
    borderRadius: 4,
    background: "rgba(15, 18, 14, 0.58)",
    color: "#f8e3ae",
    fontSize: 12,
    fontWeight: 900,
    outline: "none",
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
    touchAction: "pan-x",
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
    width: "min(820px, 78vw)",
    height: "min(310px, 38vh)",
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
    width: 390,
    maxWidth: "82vw",
    maxHeight: "92vh",
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
