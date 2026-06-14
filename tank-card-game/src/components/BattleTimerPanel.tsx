import type React from "react";
import { motion } from "framer-motion";
import hourglassWw2Image from "../assets/icons/hourglass-ww2-clean.webp";

type BattleTimerPanelProps = {
  active: boolean;
  showPlayerReminder: boolean;
  timeLeftMs: number;
};

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function BattleTimerPanel({
  active,
  showPlayerReminder,
  timeLeftMs,
}: BattleTimerPanelProps) {
  const isLowTime = timeLeftMs <= 4000;

  return (
    <div style={styles.timerPanel}>
      <div style={styles.playerReminderSlot}>
        {showPlayerReminder && (
          <motion.div
            style={{
              ...styles.playerReminder,
              color: isLowTime ? "#ff8a65" : "#f0d9a8",
            }}
            animate={{ opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            ТВОЙ ХОД
          </motion.div>
        )}
      </div>

      <div style={styles.timerMainRow}>
        <span style={styles.hourglassFrame}>
          <motion.img
            src={hourglassWw2Image}
            alt=""
            style={{
              ...styles.hourglassImage,
              filter: isLowTime
                ? "sepia(0.3) saturate(2) hue-rotate(-15deg) brightness(0.9)"
                : "none",
            }}
            animate={
              active
                ? { rotate: [0, 180, 180, 360, 360] }
                : { rotate: 0 }
            }
            transition={
              active
                ? {
                    duration: isLowTime ? 2.45 : 3.2,
                    repeat: Infinity,
                    ease: ["easeInOut", "linear", "easeInOut", "linear"],
                    times: [0, 0.18, 0.5, 0.68, 1],
                  }
                : undefined
            }
          />
        </span>

        <motion.strong
          style={{
            fontSize: 22,
            color: isLowTime ? "#ff6b6b" : "#e8e4d9",
            fontWeight: 600,
            letterSpacing: "0.5px",
          }}
          animate={isLowTime ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
          transition={
            isLowTime
              ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
              : undefined
          }
        >
          {formatTimer(timeLeftMs)}
        </motion.strong>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  timerPanel: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "7px 10px",
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    contain: "layout paint style",
    isolation: "isolate",
  },

  playerReminderSlot: {
    height: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },

  playerReminder: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "1.5px",
    textTransform: "uppercase",
  },

  timerMainRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    lineHeight: 1,
    minHeight: 50,
    contain: "layout paint style",
  },

  hourglassFrame: {
    flex: "0 0 62px",
    width: 62,
    height: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
    contain: "layout paint style",
    isolation: "isolate",
  },

  hourglassImage: {
    width: 50,
    height: 50,
    objectFit: "contain",
    opacity: 0.92,
    transformOrigin: "50% 50%",
    transformBox: "fill-box",
    willChange: "transform",
    backfaceVisibility: "hidden",
  },
};
