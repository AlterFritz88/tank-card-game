import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import buttonImage from "../assets/button.webp";
import { getNationFlagAsset } from "../assets/nationFlagAssets";
import classCarIcon from "../assets/icons/classes/class-car-player.webp";
import classArmoredCarIcon from "../assets/icons/classes/class-armored_car-player.webp";
import classHqIcon from "../assets/icons/classes/class-hq-player.webp";
import classHeavyIcon from "../assets/icons/classes/class-heavy-player.webp";
import classLightIcon from "../assets/icons/classes/class-light-player.webp";
import classMediumIcon from "../assets/icons/classes/class-medium-player.webp";
import classSpgIcon from "../assets/icons/classes/class-spg-player.webp";
import classTdIcon from "../assets/icons/classes/class-td-player.webp";
import { cards } from "../game/cards";
import {
  NATION_FILTERS as DECK_NATION_FILTERS,
  UNIT_TYPE_FILTERS as DECK_UNIT_TYPE_FILTERS,
  type NationFilter,
  type UnitTypeFilter,
} from "../game/customDecks";
import { getHeadquartersLevel } from "../game/deckWeight";
import { getCardResearchLevel } from "../game/researchTrees";
import {
  getDeckBuildingHeadquarters,
  getHeadquartersDefinition,
  type HeadquartersDefinition,
} from "../game/headquarters";
import { getCurrentUserId } from "../game/playerIdentity";
import {
  loadPlayerProgress,
  syncPlayerProgressFromServer,
  type PlayerProgress,
} from "../game/playerProgress";
import type {
  HeadquartersId,
  Nation,
  TankCard,
} from "../game/types";
import { getCardKeywords, getHeadquartersKeywords } from "../game/cardKeywords";
import { CardKeywordsPanel } from "./CardKeywordsPanel";
import { screenDeltaToStage, useStageOverlayTransform } from "./GameStage";
import { HandCardView } from "./HandCardView";
import { useI18n } from "../game/i18n";

type CollectionTypeFilter = UnitTypeFilter | "headquarters";

type CollectionSortKey = "cost" | "level";
type CollectionSortDirection = "asc" | "desc";

type CollectionSnapshot = {
  cards: Record<string, number>;
  headquarters: HeadquartersId[];
};

type CollectionItem =
  | {
      kind: "card";
      key: string;
      card: TankCard;
      nation: Nation;
      typeFilter: CollectionTypeFilter;
      copies: number;
      cost: number;
      level: number;
    }
  | {
      kind: "headquarters";
      key: string;
      headquarters: HeadquartersDefinition;
      nation: Nation;
      typeFilter: "headquarters";
      copies: 1;
      cost: number;
      level: number;
    };

const COLLECTION_SEEN_STORAGE_PREFIX = "panzershrek.collectionSeen.v1";
const CARD_PREVIEW_LONG_PRESS_MS = 420;
const CARD_PREVIEW_LONG_PRESS_MOVE_TOLERANCE_PX = 12;

const UNIT_TYPE_FILTER_ICONS: Partial<Record<UnitTypeFilter, string>> = {
  light: classLightIcon,
  medium: classMediumIcon,
  heavy: classHeavyIcon,
  td: classTdIcon,
  spg: classSpgIcon,
  armored_car: classArmoredCarIcon,
  support: classCarIcon,
};

const SORT_BUTTONS: { key: CollectionSortKey; label: string }[] = [
  { key: "level", label: "Уровень" },
  { key: "cost", label: "Стоимость" },
];

function getItemName(item: CollectionItem) {
  return item.kind === "card" ? item.card.name : item.headquarters.title;
}

function getCardTypeFilter(card: TankCard): CollectionTypeFilter {
  if (card.deploymentZone === "support") return "support";

  return card.class;
}

function getNationFilterIcon(value: NationFilter): string | undefined {
  if (value === "all") return undefined;
  return getNationFlagAsset(value as Nation) ?? undefined;
}

function getNationFlagIconStyle(
  value: NationFilter
): CSSProperties | undefined {
  // США: сдвигаем видимую часть флага влево
  if (value === "usa") return { objectPosition: "25% center" };
  // Британия и Франция: показываем флаг целиком, сжимая по ширине до квадрата
  if (value === "uk" || value === "france") return { objectFit: "fill" };
  return undefined;
}

type FilterOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
  iconShape?: "contain" | "cover";
  iconStyleOverride?: CSSProperties;
};

function FilterDropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  menuMaxHeight,
}: {
  value: T;
  options: FilterOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
  menuMaxHeight?: number;
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
              style={{
                ...iconStyle(selected.iconShape),
                ...selected.iconStyleOverride,
              }}
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
        <div
          style={
            menuMaxHeight !== undefined
              ? { ...styles.dropdownMenu, maxHeight: menuMaxHeight }
              : styles.dropdownMenu
          }
          role="listbox"
        >
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
                  style={{
                    ...iconStyle(option.iconShape),
                    ...option.iconStyleOverride,
                  }}
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

function createCollectionSnapshot(progress: PlayerProgress): CollectionSnapshot {
  return {
    cards: Object.fromEntries(
      Object.entries(progress.ownedCardCopies).filter(([, copies]) => copies > 0)
    ),
    headquarters: progress.unlockedHeadquartersIds,
  };
}

function getCollectionSeenStorageKey() {
  return `${COLLECTION_SEEN_STORAGE_PREFIX}:${getCurrentUserId()}`;
}

function readSeenSnapshot(): CollectionSnapshot | null {
  try {
    const rawValue = localStorage.getItem(getCollectionSeenStorageKey());
    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue) as Partial<CollectionSnapshot>;

    return {
      cards:
        parsedValue.cards && typeof parsedValue.cards === "object"
          ? Object.fromEntries(
              Object.entries(parsedValue.cards).map(([cardId, copies]) => [
                cardId,
                Math.max(0, Number(copies) || 0),
              ])
            )
          : {},
      headquarters: Array.isArray(parsedValue.headquarters)
        ? (parsedValue.headquarters.filter(
            (headquartersId) => typeof headquartersId === "string"
          ) as HeadquartersId[])
        : [],
    };
  } catch {
    return null;
  }
}

function saveSeenSnapshot(snapshot: CollectionSnapshot) {
  try {
    localStorage.setItem(getCollectionSeenStorageKey(), JSON.stringify(snapshot));
  } catch {
    // Storage can be unavailable in private modes; the collection still works.
  }
}

function getNewCollectionKeys(
  previous: CollectionSnapshot | null,
  current: CollectionSnapshot
) {
  const keys = new Set<string>();
  if (!previous) return keys;

  for (const [cardId, copies] of Object.entries(current.cards)) {
    if (copies > (previous.cards[cardId] ?? 0)) {
      keys.add(`card:${cardId}`);
    }
  }

  for (const headquartersId of current.headquarters) {
    if (!previous.headquarters.includes(headquartersId)) {
      keys.add(`headquarters:${headquartersId}`);
    }
  }

  return keys;
}

type CardCollectionMenuProps = {
  onBack: () => void;
};

export function CardCollectionMenu({ onBack }: CardCollectionMenuProps) {
  const { language } = useI18n();
  const [progress, setProgress] = useState<PlayerProgress>(() =>
    loadPlayerProgress()
  );
  const [nationFilter, setNationFilter] = useState<NationFilter>("all");
  const [typeFilter, setTypeFilter] = useState<CollectionTypeFilter>("all");
  const [sortKey, setSortKey] = useState<CollectionSortKey>("level");
  const [sortDirections, setSortDirections] = useState<
    Record<CollectionSortKey, CollectionSortDirection>
  >({ level: "asc", cost: "asc" });
  const [previewItem, setPreviewItem] = useState<CollectionItem | null>(null);
  const [newItemKeys, setNewItemKeys] = useState<Set<string>>(() => new Set());
  const stageOverlayTransform = useStageOverlayTransform();
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const previewOpenedAtRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panState = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  useEffect(() => {
    let cancelled = false;

    syncPlayerProgressFromServer().then((serverProgress) => {
      if (!cancelled) {
        setProgress(serverProgress);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const currentSnapshot = createCollectionSnapshot(progress);
    const previousSnapshot = readSeenSnapshot();

    setNewItemKeys(getNewCollectionKeys(previousSnapshot, currentSnapshot));
    saveSeenSnapshot(currentSnapshot);
  }, [progress]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewItem(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => clearLongPressTimer();
  }, []);

  const collectionItems = useMemo<CollectionItem[]>(() => {
    const ownedCards = cards.reduce<CollectionItem[]>((items, card) => {
        const copies = progress.ownedCardCopies[card.id] ?? 0;
        if (copies <= 0) return items;

        items.push({
          kind: "card" as const,
          key: `card:${card.id}`,
          card,
          nation: card.nation,
          typeFilter: getCardTypeFilter(card),
          copies,
          cost: card.cost,
          level: getCardResearchLevel(card.id),
        });

        return items;
      }, []);

    const ownedHeadquarters = progress.unlockedHeadquartersIds.reduce<
      CollectionItem[]
    >((items, headquartersId) => {
        try {
          const headquarters = getHeadquartersDefinition(headquartersId);

          items.push({
            kind: "headquarters" as const,
            key: `headquarters:${headquartersId}`,
            headquarters,
            nation: headquarters.nation,
            typeFilter: "headquarters" as const,
            copies: 1 as const,
            cost: 0,
            level: getHeadquartersLevel(headquarters.id),
          });
        } catch {
          return items;
        }

        return items;
      }, []);

    return [...ownedHeadquarters, ...ownedCards];
  }, [progress]);

  const typeOptions = useMemo<FilterOption<CollectionTypeFilter>[]>(
    () => [
      {
        value: "all",
        label: "Тип",
      },
      {
        value: "headquarters",
        label: "Штабы",
        icon: classHqIcon,
      },
      ...DECK_UNIT_TYPE_FILTERS.filter((filter) => filter.value !== "all").map(
        (filter) => ({
          value: filter.value,
          label: filter.label,
          icon: UNIT_TYPE_FILTER_ICONS[filter.value],
        })
      ),
    ],
    []
  );

  const nationOptions = useMemo<FilterOption<NationFilter>[]>(
    () =>
      DECK_NATION_FILTERS.map((filter) => ({
        value: filter.value,
        label: filter.value === "all" ? "Нация" : filter.label,
        icon: getNationFilterIcon(filter.value),
        iconShape: filter.value === "all" ? undefined : "cover",
        iconStyleOverride: getNationFlagIconStyle(filter.value),
      })),
    []
  );

  const visibleItems = useMemo(() => {
    const direction = sortDirections[sortKey] === "asc" ? 1 : -1;
    const getSortValue = (item: CollectionItem) =>
      sortKey === "cost" ? item.cost : item.level;

    return collectionItems
      .filter((item) => nationFilter === "all" || item.nation === nationFilter)
      .filter((item) => typeFilter === "all" || item.typeFilter === typeFilter)
      .sort((first, second) => {
        const delta = getSortValue(first) - getSortValue(second);
        if (delta !== 0) return delta * direction;

        return getItemName(first).localeCompare(getItemName(second), "ru");
      });
  }, [collectionItems, nationFilter, sortDirections, sortKey, typeFilter]);

  function handleSortClick(key: CollectionSortKey) {
    if (sortKey === key) {
      setSortDirections((current) => ({
        ...current,
        [key]: current[key] === "asc" ? "desc" : "asc",
      }));
      return;
    }

    setSortKey(key);
  }

  const totalCollectionItems = useMemo(() => {
    const uniqueCardCount = new Set(cards.map((card) => card.id)).size;
    const uniqueHeadquartersCount = new Set(
      getDeckBuildingHeadquarters().map((headquarters) => headquarters.id)
    ).size;

    return uniqueCardCount + uniqueHeadquartersCount;
  }, []);
  const ownedCollectionCount = collectionItems.length;
  const collectionProgressPercent =
    totalCollectionItems > 0
      ? Math.min(100, (ownedCollectionCount / totalCollectionItems) * 100)
      : 0;

  function handlePanPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    panState.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  }

  function handlePanPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panState.current;
    if (!pan.active) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;

    if (!pan.moved && Math.hypot(deltaX, deltaY) < 5) return;

    if (!pan.moved) {
      pan.moved = true;
      clearLongPressTimer();
      try {
        viewport.setPointerCapture(pan.pointerId);
      } catch {
        // Pointer capture can be gone already if the browser handled a gesture.
      }
      viewport.style.cursor = "grabbing";
    }

    // Convert the screen-space finger movement into the stage's own axes so a
    // swipe along the list's visual vertical scrolls it even when the stage is
    // rotated 90° on a portrait phone.
    const { y: distance } = screenDeltaToStage(deltaX, deltaY);
    viewport.scrollTop = pan.scrollTop - distance;
    event.preventDefault();
  }

  function handleCollectionWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (event.deltaY === 0) return;

    viewport.scrollTop += event.deltaY;
    clearLongPressTimer();
    event.preventDefault();
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panState.current;
    if (!pan.active) return;

    const viewport = viewportRef.current;
    if (viewport) {
      viewport.style.cursor = "grab";
      try {
        if (pan.moved && viewport.hasPointerCapture(event.pointerId)) {
          viewport.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture already released.
      }
    }

    pan.active = false;
  }

  function handlePanClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (panState.current.moved) {
      event.stopPropagation();
      event.preventDefault();
      panState.current.moved = false;
    }
  }

  function openPreview(event: ReactMouseEvent, item: CollectionItem) {
    event.preventDefault();
    event.stopPropagation();
    previewOpenedAtRef.current = Date.now();
    setPreviewItem(item);
  }

  function closePreview() {
    setPreviewItem(null);
  }

  function closePreviewFromBackdrop() {
    if (Date.now() - previewOpenedAtRef.current < 450) return;
    closePreview();
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function longPressPreviewHandlers(item: CollectionItem) {
    return {
      onTouchStart: (event: ReactTouchEvent) => {
        if (event.touches.length !== 1) {
          clearLongPressTimer();
          longPressOriginRef.current = null;
          return;
        }
        const touch = event.touches[0];
        longPressOriginRef.current = { x: touch.clientX, y: touch.clientY };
        longPressTriggeredRef.current = false;
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTriggeredRef.current = true;
          previewOpenedAtRef.current = Date.now();
          setPreviewItem(item);
        }, CARD_PREVIEW_LONG_PRESS_MS);
      },
      onTouchMove: (event: ReactTouchEvent) => {
        const origin = longPressOriginRef.current;
        if (!origin || longPressTriggeredRef.current) return;
        const touch = event.touches[0];
        if (!touch) return;
        if (
          Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) >
          CARD_PREVIEW_LONG_PRESS_MOVE_TOLERANCE_PX
        ) {
          clearLongPressTimer();
        }
      },
      onTouchEnd: (event: ReactTouchEvent) => {
        clearLongPressTimer();
        longPressOriginRef.current = null;
        if (longPressTriggeredRef.current) {
          event.preventDefault();
          longPressTriggeredRef.current = false;
        }
      },
      onTouchCancel: () => {
        clearLongPressTimer();
        longPressOriginRef.current = null;
      },
    };
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />

      <header style={styles.header}>
        <button
          type="button"
          style={styles.backButton}
          onClick={onBack}
          aria-label="Назад"
        >
          ‹
        </button>
        <h1 style={styles.title}>КОЛЛЕКЦИЯ</h1>
        <div />
      </header>

      <section style={styles.filterPanel} aria-label="Фильтры коллекции">
        <div style={styles.filters}>
          <FilterDropdown
            value={typeFilter}
            options={typeOptions}
            onChange={setTypeFilter}
            ariaLabel="Фильтр по типу техники"
            menuMaxHeight={typeOptions.length * 34 + 16}
          />
          <FilterDropdown
            value={nationFilter}
            options={nationOptions}
            onChange={setNationFilter}
            ariaLabel="Фильтр по нации"
          />
          {SORT_BUTTONS.map((option) => {
            const active = sortKey === option.key;
            const arrow = sortDirections[option.key] === "asc" ? "↑" : "↓";

            return (
              <button
                key={option.key}
                type="button"
                style={{
                  ...styles.filterButton,
                  ...(active ? styles.filterButtonActive : null),
                }}
                onClick={() => handleSortClick(option.key)}
                aria-pressed={active}
              >
                {option.label} {arrow}
              </button>
            );
          })}
        </div>
      </section>

      <section style={styles.progressPanel} aria-label="Прогресс коллекции">
        <div style={styles.progressLabel}>
          <span>Прогресс коллекции</span>
          <strong>
            {ownedCollectionCount}/{totalCollectionItems}
          </strong>
        </div>
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${collectionProgressPercent}%`,
            }}
          />
        </div>
      </section>

      <section
        ref={viewportRef}
        style={styles.collectionViewport}
        onPointerDown={handlePanPointerDown}
        onPointerMove={handlePanPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={handleCollectionWheel}
        onScroll={clearLongPressTimer}
        onClickCapture={handlePanClickCapture}
        aria-label="Карты коллекции"
      >
        <div style={styles.collectionGrid}>
          {visibleItems.map((item) => (
            <motion.button
              key={item.key}
              type="button"
              style={styles.collectionItem}
              onContextMenu={(event) => openPreview(event, item)}
              {...longPressPreviewHandlers(item)}
              whileHover={{ y: -5, scale: 1.025 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              aria-label={getItemName(item)}
            >
              {newItemKeys.has(item.key) ? (
                <motion.span
                  style={styles.newCardGlow}
                  initial={{ opacity: 0.36, scale: 0.82 }}
                  animate={{ opacity: [0.38, 0.82, 0.44], scale: [0.92, 1.08, 0.98] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : null}

              <span style={styles.cardSurface}>
                {item.kind === "card" ? (
                  <HandCardView card={item.card} ownerId="player" />
                ) : (
                  <HandCardView
                    headquartersId={item.headquarters.id}
                    headquarters={{
                      hp: item.headquarters.hp,
                      attack: item.headquarters.attack,
                      fuelGeneration: item.headquarters.fuelGeneration,
                    }}
                    ownerId="player"
                  />
                )}
              </span>

              <span style={styles.itemMeta}>
                <span style={styles.copyBadge}>×{item.copies}</span>
                <span style={styles.weightBadge}>Ур. {item.level}</span>
              </span>
            </motion.button>
          ))}
        </div>

        {visibleItems.length === 0 ? (
          <div style={styles.emptyState}>В коллекции нет карт по выбранным фильтрам</div>
        ) : null}
      </section>

      {createPortal(
        <AnimatePresence>
          {previewItem ? (
            <motion.div
              style={styles.cardPreviewOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onMouseDown={closePreviewFromBackdrop}
              onContextMenu={(event) => {
                event.preventDefault();
                closePreviewFromBackdrop();
              }}
            >
              <div style={{ ...stageOverlayTransform, display: "flex" }}>
                <motion.div
                  style={styles.cardPreviewPanel}
                  initial={{ opacity: 0, scale: 0.84, y: 18 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 12 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <CardKeywordsPanel
                    keywords={
                      previewItem.kind === "card"
                        ? getCardKeywords(previewItem.card, language)
                        : getHeadquartersKeywords(
                            previewItem.headquarters.ability,
                            previewItem.headquarters.nation,
                            language
                          )
                    }
                  />

                  <button
                    type="button"
                    style={styles.cardPreviewClose}
                    onClick={closePreview}
                    aria-label="Закрыть просмотр карты"
                  >
                    ×
                  </button>

                  {previewItem.kind === "card" ? (
                    <HandCardView card={previewItem.card} displayMode="preview" />
                  ) : (
                    <HandCardView
                      headquartersId={previewItem.headquarters.id}
                      headquarters={{
                        hp: previewItem.headquarters.hp,
                        attack: previewItem.headquarters.attack,
                        fuelGeneration: previewItem.headquarters.fuelGeneration,
                      }}
                      displayMode="preview"
                    />
                  )}

                  <div style={styles.cardPreviewHint}>
                    ПКМ по фону или Esc - закрыть
                  </div>
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
    height: "100cqh",
    overflow: "hidden",
    color: "#f2e4c2",
    background: "transparent",
    fontFamily: "var(--font-body)",
  },

  backgroundShade: {
    display: "none",
  },

  header: {
    position: "relative",
    zIndex: 4,
    display: "grid",
    gridTemplateColumns: "86px 1fr 86px",
    alignItems: "center",
    height: 78,
    padding: "10px 24px 0",
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 30,
    fontWeight: 1000,
    lineHeight: 1,
    paddingBottom: 4,
    textAlign: "center",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.2)",
  },

  title: {
    margin: 0,
    color: "#f7e8b8",
    fontFamily: "var(--font-display)",
    fontSize: 31,
    fontWeight: 800,
    letterSpacing: 1.5,
    lineHeight: 1,
    textAlign: "center",
    textShadow: "0 3px 14px rgba(0,0,0,0.92)",
  },

  counter: {
    justifySelf: "end",
    color: "#d8c082",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 1.1,
    textShadow: "0 2px 8px rgba(0,0,0,0.86)",
  },

  filterPanel: {
    position: "relative",
    zIndex: 4,
    display: "flex",
    justifyContent: "center",
    padding: "0 34px 10px",
  },

  filters: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  sortGroup: {
    display: "flex",
    justifyContent: "center",
    gap: 7,
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

  filterButton: {
    minWidth: 78,
    height: 31,
    padding: "0 12px",
    border: "1px solid rgba(194, 154, 77, 0.24)",
    borderRadius: 0,
    background:
      "linear-gradient(180deg, rgba(49, 42, 29, 0.9), rgba(18, 16, 13, 0.92))",
    color: "rgba(245, 224, 170, 0.82)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textShadow: "0 2px 6px rgba(0,0,0,0.72)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
  },

  filterButtonActive: {
    borderColor: "rgba(236, 196, 98, 0.7)",
    background:
      "linear-gradient(180deg, rgba(116, 91, 42, 0.95), rgba(36, 29, 17, 0.96))",
    color: "#fff2c7",
    boxShadow: "0 0 15px rgba(226, 180, 67, 0.22)",
  },

  progressPanel: {
    position: "relative",
    zIndex: 3,
    width: "min(560px, calc(100% - 88px))",
    margin: "0 auto 8px",
    display: "grid",
    gap: 6,
  },

  progressLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#f3d993",
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase",
    textShadow: "0 2px 8px rgba(0,0,0,0.86)",
  },

  progressTrack: {
    position: "relative",
    height: 10,
    overflow: "hidden",
    border: "1px solid rgba(214, 174, 81, 0.32)",
    background:
      "linear-gradient(180deg, rgba(12, 13, 10, 0.86), rgba(30, 25, 14, 0.72))",
    boxShadow:
      "inset 0 1px 5px rgba(0,0,0,0.72), 0 0 14px rgba(214, 174, 81, 0.08)",
  },

  progressFill: {
    height: "100%",
    background:
      "linear-gradient(90deg, rgba(110, 141, 66, 0.88), rgba(230, 194, 86, 0.92))",
    boxShadow: "0 0 16px rgba(226, 190, 75, 0.26)",
  },

  collectionViewport: {
    position: "relative",
    zIndex: 3,
    height: "calc(100cqh - 190px)",
    margin: "0 22px",
    padding: "18px 22px 58px",
    overflowX: "hidden",
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
    cursor: "grab",
    userSelect: "none",
    touchAction: "none",
    maskImage:
      "linear-gradient(180deg, transparent 0%, #000 34px, #000 calc(100% - 34px), transparent 100%)",
    WebkitMaskImage:
      "linear-gradient(180deg, transparent 0%, #000 34px, #000 calc(100% - 34px), transparent 100%)",
  },

  collectionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, 175px)",
    justifyContent: "center",
    gap: "34px 24px",
    padding: "8px 10px 28px",
  },

  collectionItem: {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    gap: 2,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "default",
    font: "inherit",
    isolation: "isolate",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
  },

  newCardGlow: {
    position: "absolute",
    inset: "-14px -12px 20px",
    zIndex: -1,
    pointerEvents: "none",
    background:
      "radial-gradient(circle at 50% 48%, rgba(255, 224, 119, 0.82), rgba(228, 156, 39, 0.34) 42%, rgba(228, 156, 39, 0) 72%)",
    filter: "blur(7px)",
  },

  cardSurface: {
    display: "block",
    width: 175,
    filter: "drop-shadow(0 11px 18px rgba(0,0,0,0.42))",
  },

  itemMeta: {
    display: "flex",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    width: 175,
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "0 17px",
    color: "#f4dda5",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: 0.5,
    textShadow: "0 2px 6px rgba(0,0,0,0.82)",
  },

  copyBadge: {
    flex: "0 0 auto",
    minWidth: 34,
    textAlign: "right",
  },

  weightBadge: {
    flex: "1 1 auto",
    minWidth: 0,
    color: "#d7b764",
    overflow: "hidden",
    textAlign: "left",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  emptyState: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: "rgba(245, 224, 170, 0.72)",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textShadow: "0 2px 8px rgba(0,0,0,0.86)",
    pointerEvents: "none",
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

  cardPreviewPanel: {
    position: "relative",
    width: 390,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 28px 58px rgba(0,0,0,0.78))",
  },

  cardPreviewClose: {
    position: "absolute",
    right: -14,
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
    fontWeight: 800,
    lineHeight: "30px",
    boxShadow: "0 10px 22px rgba(0,0,0,0.58)",
  },

  cardPreviewHint: {
    position: "absolute",
    left: "50%",
    bottom: -30,
    transform: "translateX(-50%)",
    color: "rgba(242, 228, 194, 0.72)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    textShadow: "0 2px 8px rgba(0,0,0,0.82)",
  },
};
