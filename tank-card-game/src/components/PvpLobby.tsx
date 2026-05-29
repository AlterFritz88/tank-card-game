import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HEADQUARTERS } from "../game/headquarters";
import type { HeadquartersId } from "../game/types";
import { useBattleStore } from "../store/battleStore";
import { HandCardView } from "./HandCardView";

const HAND_CARD_BASE_WIDTH = 175;
const HAND_CARD_BASE_HEIGHT = Math.round((HAND_CARD_BASE_WIDTH * 1496) / 1051);
const MENU_CARD_SCALE = 1.18;
const MENU_CARD_WIDTH = Math.round(HAND_CARD_BASE_WIDTH * MENU_CARD_SCALE);
const MENU_CARD_HEIGHT = Math.round(HAND_CARD_BASE_HEIGHT * MENU_CARD_SCALE);

function getPvpStatusText(status: string) {
  switch (status) {
    case "connecting":
      return "Подключаемся к серверу...";
    case "searching":
      return "Ищем соперника...";
    case "waiting":
      return "Ожидаем второго игрока...";
    case "matched":
      return "Соперник найден";
    case "rolling":
      return "Жеребьёвка первого хода...";
    case "inBattle":
      return "Бой идет";
    case "finished":
      return "Бой завершен";
    case "error":
      return "Ошибка подключения";
    default:
      return "Готово к поиску боя";
  }
}

export function PvpLobby() {
  const {
    mode,
    pvpRoomId,
    pvpStatus,
    pvpError,
    selectedHeadquartersId,
    setSelectedHeadquartersId,
    findPvpMatch,
    startAiBattle,
    cancelMatchmaking,
  } = useBattleStore();

  const [previewHeadquartersId, setPreviewHeadquartersId] =
    useState<HeadquartersId | null>(null);

  const headquartersList = useMemo(() => Object.values(HEADQUARTERS), []);

  const pvpBusy =
    mode === "pvp" &&
    (pvpStatus === "connecting" ||
      pvpStatus === "searching" ||
      pvpStatus === "waiting" ||
      pvpStatus === "matched" ||
      pvpStatus === "rolling");

  const buttonsDisabled = pvpBusy;

  function selectHeadquarters(headquartersId: HeadquartersId) {
    if (buttonsDisabled) return;
    setSelectedHeadquartersId(headquartersId);
  }

  function openHeadquartersPreview(
    event: MouseEvent,
    headquartersId: HeadquartersId
  ) {
    event.preventDefault();
    event.stopPropagation();
    setPreviewHeadquartersId(headquartersId);
  }

  function closeHeadquartersPreview() {
    setPreviewHeadquartersId(null);
  }

  useEffect(() => {
    if (!previewHeadquartersId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeHeadquartersPreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewHeadquartersId]);

  const previewHeadquarters = previewHeadquartersId
    ? HEADQUARTERS[previewHeadquartersId]
    : null;

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />

      <section style={styles.menuLayer}>
        <header style={styles.header}>
          <div style={styles.kicker}>Карточная тактика</div>
          <h1 style={styles.title}>PanzerShrek</h1>
          <p style={styles.subtitle}>Выбери штаб для боя</p>
        </header>

        <div style={styles.carouselViewport} aria-label="Выбор штаба">
          <div style={styles.carouselTrack}>
            {headquartersList.map((headquarters) => {
              const selected = headquarters.id === selectedHeadquartersId;

              return (
                <button
                  key={headquarters.id}
                  type="button"
                  style={{
                    ...styles.headquartersOption,
                    ...(buttonsDisabled ? styles.headquartersOptionDisabled : {}),
                  }}
                  disabled={buttonsDisabled}
                  onClick={() =>
                    selectHeadquarters(headquarters.id as HeadquartersId)
                  }
                  onContextMenu={(event) =>
                    openHeadquartersPreview(
                      event,
                      headquarters.id as HeadquartersId
                    )
                  }
                  aria-pressed={selected}
                  aria-label={`Выбрать штаб ${headquarters.title}`}
                >
                  <div
                    style={{
                      ...styles.selectionGlow,
                      ...(selected ? styles.selectionGlowVisible : {}),
                    }}
                  />

                  <div style={styles.cardSlot}>
                    <div style={styles.cardScaleBox}>
                      <div style={styles.cardBaseSize}>
                        <HandCardView
                          ownerId="player"
                          headquartersId={headquarters.id as HeadquartersId}
                          headquarters={{
                            hp: headquarters.hp,
                            attack: headquarters.attack,
                            fuelGeneration: headquarters.fuelGeneration,
                            actionFuelCost: headquarters.actionFuelCost,
                          }}
                          displayMode="hand"
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.actionsGrid}>
          <button
            type="button"
            style={styles.button}
            onClick={startAiBattle}
            disabled={buttonsDisabled}
          >
            Играть против бота
          </button>

          <button
            type="button"
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={findPvpMatch}
            disabled={pvpBusy}
          >
            {pvpBusy ? "Поиск соперника..." : "Играть PVP"}
          </button>
        </div>

        <div style={styles.status}>
          Режим: {mode === "ai" ? "бот" : "PVP"}
          {mode === "pvp" ? ` · ${getPvpStatusText(pvpStatus)}` : ""}
        </div>

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
            style={styles.cardPreviewOverlay}
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
              style={styles.cardPreviewPanel}
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

              <HandCardView
                ownerId="player"
                headquartersId={previewHeadquarters.id as HeadquartersId}
                headquarters={{
                  hp: previewHeadquarters.hp,
                  attack: previewHeadquarters.attack,
                  fuelGeneration: previewHeadquarters.fuelGeneration,
                  actionFuelCost: previewHeadquarters.actionFuelCost,
                }}
                displayMode="preview"
              />

              <div style={styles.cardPreviewHint}>
                ПКМ по фону или Esc — закрыть
              </div>
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
    padding: "0 24px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    overflow: "hidden",
  },

  header: {
    textAlign: "center",
    marginBottom: 8,
    textShadow: "0 2px 12px rgba(0,0,0,0.86)",
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
    lineHeight: 0.94,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 22px rgba(247, 215, 116, 0.26)",
  },

  subtitle: {
    margin: "7px auto 0",
    fontSize: 14,
    lineHeight: 1.35,
    color: "rgba(244, 229, 191, 0.82)",
  },

  carouselViewport: {
    width: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    padding: "12px 6px 16px",
    boxSizing: "border-box",
    WebkitOverflowScrolling: "touch",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(247, 215, 116, 0.55) transparent",
  },

  carouselTrack: {
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

  headquartersOptionDisabled: {
    cursor: "default",
    opacity: 0.72,
  },

  selectionGlow: {
    position: "absolute",
    left: "50%",
    top: 0,
    width: MENU_CARD_WIDTH + 58,
    height: MENU_CARD_HEIGHT + 42,
    transform: "translateX(-50%) scale(0.96)",
    borderRadius: 34,
    background:
      "radial-gradient(circle at 50% 48%, rgba(255, 236, 151, 0.95), rgba(247, 196, 68, 0.58) 30%, rgba(247, 185, 73, 0.22) 56%, transparent 78%)",
    filter: "blur(24px)",
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
    maxWidth: "82vw",
    maxHeight: "92vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 28px 58px rgba(0,0,0,0.78))",
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
