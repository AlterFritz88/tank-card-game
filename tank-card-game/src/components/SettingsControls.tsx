import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useStageOverlayTransform } from "./GameStage";
import {
  AVAILABLE_LANGUAGES,
  setEffectsVolume,
  setLanguage,
  setMusicVolume,
  useSettings,
  type Language,
} from "../game/settings";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestFullscreen() {
  const element = document.documentElement as FullscreenElement;
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    }
  } catch {
    // Some browsers (notably iOS Safari) reject element fullscreen — ignore.
  }
}

async function exitFullscreen() {
  const doc = document as FullscreenDocument;
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore.
  }
}

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => getFullscreenElement() !== null
  );

  useEffect(() => {
    const handleChange = () => setIsFullscreen(getFullscreenElement() !== null);
    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange);
    };
  }, []);

  const toggle = useCallback(() => {
    if (getFullscreenElement()) {
      void exitFullscreen();
    } else {
      void requestFullscreen();
    }
  }, []);

  return { isFullscreen, toggle };
}

function EnterFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 .1-1 7.6 7.6 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1l-.4-2.5H9.1l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h5.8l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingRowHeader}>
        <span style={styles.settingLabel}>{label}</span>
        <span style={styles.settingValue}>{percent}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        style={styles.slider}
        aria-label={label}
      />
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const overlayTransform = useStageOverlayTransform();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <motion.div
      style={styles.modalOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <div style={overlayTransform}>
        <motion.div
          style={styles.modalPanel}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 360, damping: 30 }}
          onClick={(event) => event.stopPropagation()}
        >
          <header style={styles.modalHeader}>
            <h2 style={styles.modalTitle}>Настройки</h2>
            <button
              type="button"
              style={styles.modalCloseButton}
              onClick={onClose}
              aria-label="Закрыть настройки"
            >
              ✕
            </button>
          </header>

          <section style={styles.modalSection}>
            <h3 style={styles.modalSectionTitle}>Звук</h3>
            <VolumeRow
              label="Громкость музыки"
              value={settings.musicVolume}
              onChange={setMusicVolume}
            />
            <VolumeRow
              label="Громкость эффектов"
              value={settings.effectsVolume}
              onChange={setEffectsVolume}
            />
          </section>

          <section style={styles.modalSection}>
            <h3 style={styles.modalSectionTitle}>Язык</h3>
            <div style={styles.languageRow}>
              {AVAILABLE_LANGUAGES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  style={{
                    ...styles.languageButton,
                    ...(settings.language === option.id
                      ? styles.languageButtonActive
                      : {}),
                  }}
                  onClick={() => setLanguage(option.id as Language)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p style={styles.languageNote}>
              Другие языки появятся в следующих обновлениях.
            </p>
          </section>
        </motion.div>
      </div>
    </motion.div>,
    document.body
  );
}

/**
 * Fixed top-right controls (fullscreen toggle + settings gear) shown over every
 * screen inside the scaled GameStage. The settings modal is portaled to <body>
 * and re-applies the stage transform so it fits and rotates like the rest of the
 * game.
 */
export function SettingsControls({ side = "right" }: { side?: "left" | "right" }) {
  const { isFullscreen, toggle } = useFullscreen();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div
        style={{
          ...styles.controlBar,
          ...(side === "left" ? styles.controlBarLeft : styles.controlBarRight),
        }}
      >
        <button
          type="button"
          style={styles.controlButton}
          onClick={toggle}
          aria-label={
            isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран"
          }
          title={isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран"}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
        </button>
        <button
          type="button"
          style={styles.controlButton}
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки"
          title="Настройки"
        >
          <GearIcon />
        </button>
      </div>

      <AnimatePresence>
        {settingsOpen ? (
          <SettingsModal onClose={() => setSettingsOpen(false)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  controlBar: {
    position: "absolute",
    top: 10,
    zIndex: 60,
    display: "flex",
    gap: 8,
  },

  controlBarRight: {
    right: 12,
  },

  controlBarLeft: {
    left: 12,
  },

  controlButton: {
    width: 40,
    height: 40,
    display: "grid",
    placeItems: "center",
    padding: 0,
    border: "none",
    background: "transparent",
    color: "#f3e6c8",
    cursor: "pointer",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
    transition: "transform 0.12s ease, opacity 0.12s ease",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 6000,
    display: "grid",
    placeItems: "center",
    background: "rgba(3, 4, 5, 0.72)",
    backdropFilter: "blur(3px)",
  },

  modalPanel: {
    width: 460,
    maxWidth: "90vw",
    padding: "22px 26px 26px",
    borderRadius: 12,
    border: "1px solid rgba(232, 198, 112, 0.4)",
    background:
      "linear-gradient(180deg, rgba(34, 30, 22, 0.98), rgba(14, 12, 9, 0.98))",
    boxShadow: "0 28px 70px rgba(0,0,0,0.75)",
    color: "#f1e6d2",
    fontFamily: "var(--font-body)",
  },

  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  modalTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: 0.6,
    color: "#ffe2a8",
    textTransform: "uppercase",
    textShadow: "0 2px 6px #000",
  },

  modalCloseButton: {
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    border: "1px solid rgba(255, 220, 180, 0.28)",
    background: "rgba(0,0,0,0.3)",
    color: "#f3e6c8",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },

  modalSection: {
    marginTop: 18,
  },

  modalSectionTitle: {
    margin: "0 0 12px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "rgba(255, 226, 168, 0.66)",
  },

  settingRow: {
    marginBottom: 16,
  },

  settingRowHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  settingLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#ede0cc",
  },

  settingValue: {
    fontSize: 13,
    fontWeight: 800,
    color: "#ffd98a",
    fontVariantNumeric: "tabular-nums",
  },

  slider: {
    width: "100%",
    accentColor: "#e8c670",
    cursor: "pointer",
  },

  languageRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },

  languageButton: {
    minWidth: 110,
    height: 40,
    padding: "0 18px",
    borderRadius: 8,
    border: "1px solid rgba(255, 220, 180, 0.28)",
    background:
      "linear-gradient(180deg, rgba(60, 52, 38, 0.9), rgba(26, 22, 16, 0.92))",
    color: "#ece0cc",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.4,
    cursor: "pointer",
  },

  languageButtonActive: {
    border: "1px solid rgba(232, 198, 112, 0.9)",
    background:
      "linear-gradient(180deg, rgba(120, 92, 44, 0.95), rgba(70, 52, 24, 0.95))",
    color: "#fff3d6",
    boxShadow: "0 0 0 1px rgba(232, 198, 112, 0.3), 0 6px 16px rgba(0,0,0,0.4)",
  },

  languageNote: {
    margin: "12px 0 0",
    fontSize: 12,
    lineHeight: 1.4,
    color: "rgba(236, 224, 204, 0.6)",
  },
};
