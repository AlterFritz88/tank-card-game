import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import cartridgeImage from "../assets/effects/rifle-cartridge.png";
import type { PlayerId } from "../game/types";
import { useBattleStore } from "../store/battleStore";

const START_ROLL_DURATION_MS = 2800;

type FirstTurnRollOverlayProps = {
  visible: boolean;
  resultVisible: boolean;
  firstPlayer: PlayerId | null;
  localPlayerId: PlayerId;
  finalRotation?: number;
};

export function FirstTurnRollOverlay({
  visible,
  resultVisible,
  firstPlayer,
  localPlayerId,
}: FirstTurnRollOverlayProps) {
  const isYourFirstTurn = firstPlayer === localPlayerId;

  // В PVP сервер присылает технического победителя жеребьёвки:
  // "player" — создатель комнаты, "bot" — второй игрок.
  // Но визуально каждый клиент смотрит на поле со своей перспективы:
  // свой игрок всегда снизу, противник всегда сверху.
  // Поэтому финальный угол нельзя брать в абсолютных координатах сервера.
  const viewerTargetAngle = isYourFirstTurn ? 135 : -45;
  const displayFinalRotation = 360 * 8 + viewerTargetAngle;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          style={styles.startRollOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div style={styles.startRollPanel}>
            <div style={styles.startRollCenterGroup}>
              <div style={styles.startRollText}>Определяем первый ход</div>

              <motion.img
                src={cartridgeImage}
                alt="Жеребьевка первого хода"
                style={styles.startRollCartridge}
                initial={{ rotate: 0, scale: 0.9 }}
                animate={{
                  rotate: displayFinalRotation,
                  scale: 1,
                }}
                transition={{
                  duration: START_ROLL_DURATION_MS / 1000,
                  ease: [0.08, 0.82, 0.18, 1],
                }}
              />

              {resultVisible && firstPlayer && (
                <motion.div
                  style={{
                    ...styles.startRollResult,
                    ...(isYourFirstTurn
                      ? styles.startRollResultPlayer
                      : styles.startRollResultBot),
                  }}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25 }}
                >
                  {isYourFirstTurn
                    ? "ПЕРВЫМ ХОДИТЕ ВЫ"
                    : "ПЕРВЫМ ХОДИТ ПРОТИВНИК"}
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConnectedFirstTurnRollOverlay() {
  const firstTurnRoll = useBattleStore((state) => state.firstTurnRoll);
  const localPlayerId = useBattleStore((state) => state.localPlayerId);

  return (
    <FirstTurnRollOverlay
      visible={firstTurnRoll.visible}
      resultVisible={firstTurnRoll.resultVisible}
      firstPlayer={firstTurnRoll.firstPlayer}
      localPlayerId={localPlayerId}
      finalRotation={firstTurnRoll.finalRotation}
    />
  );
}

const styles: Record<string, CSSProperties> = {
  startRollOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 4000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    background: "transparent",
  },

  startRollPanel: {
    width: "100%",
    height: "100%",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    boxShadow: "none",
  },

  startRollCenterGroup: {
    position: "relative",
    display: "grid",
    gridTemplateRows: "28px 140px 36px",
    alignItems: "center",
    justifyItems: "center",
    gap: 10,
  },

  startRollCartridge: {
    width: 220,
    height: "auto",
    gridRow: "2 / 3",
    filter:
      "drop-shadow(0 14px 28px rgba(0,0,0,0.55)) drop-shadow(0 0 18px rgba(255,215,120,0.18))",
    transformOrigin: "50% 50%",
  },

  startRollText: {
    gridRow: "1 / 2",
    color: "#e6e0cf",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textShadow: "0 2px 10px rgba(0,0,0,0.8)",
    whiteSpace: "nowrap",
  },

  startRollResult: {
    gridRow: "3 / 4",
    fontSize: 24,
    fontWeight: 1000,
    letterSpacing: 2,
    textTransform: "uppercase",
    textShadow: "0 2px 14px rgba(0,0,0,0.9)",
    whiteSpace: "nowrap",
    padding: 0,
    border: "none",
    borderRadius: 0,
    background: "transparent",
    boxShadow: "none",
    backdropFilter: "none",
  },

  startRollResultPlayer: {
    color: "#7dff8a",
  },

  startRollResultBot: {
    color: "#ff6b6b",
  },
};
