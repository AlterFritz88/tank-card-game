import type React from "react";
import { motion } from "framer-motion";
import hourglassWw2Image from "../assets/icons/hourglass-ww2-clean.png";

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

      <div style={styles.timerMainRow}>
        <motion.img
          src={hourglassWw2Image}
          alt=""
          style={{
            width: 50,
            height: 50,
            marginRight: 12,
            marginTop: 0,
            objectFit: "contain",
            filter: isLowTime
              ? "sepia(0.3) saturate(2) hue-rotate(-15deg) brightness(0.9)"
              : "none",
            opacity: 0.92,
          }}
          animate={active ? { rotate: [0, 180, 360] } : { rotate: 0 }}
          transition={
            active
              ? {
                  duration: isLowTime ? 1.1 : 2.8,
                  repeat: Infinity,
                  ease: "linear",
                }
              : undefined
          }
        />

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
  },

  playerReminder: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    marginBottom: 1,
  },

  timerMainRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    lineHeight: 1,
  },
};
