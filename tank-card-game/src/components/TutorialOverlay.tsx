import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import eduAvatarImage from "../assets/headquarters/avatars/edu_avatar.webp";
import buttonImage from "../assets/button.webp";
import { useI18n } from "../game/i18n";

type TutorialOverlayProps = {
  /** Dialogue blocks the battle and shows the «Далее» button. */
  kind: "dialogue" | "task";
  text: string;
  visible: boolean;
  onNext?: () => void;
  nextLabel?: string;
  /** Overrides the default instructor portrait (e.g. a campaign commander). */
  avatarSrc?: string;
  /** Overrides the default «Инструктор» speaker label. */
  speakerName?: string;
  /** Center the dialogue on screen instead of anchoring it to the bottom. */
  centered?: boolean;
};

export function TutorialOverlay({
  kind,
  text,
  visible,
  onNext,
  nextLabel,
  avatarSrc = eduAvatarImage,
  speakerName,
  centered = false,
}: TutorialOverlayProps) {
  const { language } = useI18n();
  const resolvedNextLabel =
    nextLabel ?? (language === "en" ? "Next" : "Далее");
  const resolvedSpeakerName =
    speakerName ?? (language === "en" ? "Instructor" : "Инструктор");

  return (
    <AnimatePresence>
      {visible ? (
        kind === "dialogue" ? (
          <motion.div
            key="tutorial-dialogue"
            style={{
              ...styles.dialogueLayer,
              ...(centered ? styles.dialogueLayerCentered : null),
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <motion.div
              style={{
                ...styles.dialoguePanel,
                ...(centered ? styles.dialoguePanelCentered : null),
              }}
              initial={{ y: 26, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <img
                src={avatarSrc}
                alt=""
                draggable={false}
                style={styles.dialogueAvatar}
              />
              <div style={styles.dialogueBody}>
                <div style={styles.speakerName}>{resolvedSpeakerName}</div>
                <p style={styles.dialogueText}>{text}</p>
                <button type="button" style={styles.nextButton} onClick={onNext}>
                  {resolvedNextLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="tutorial-task"
            style={styles.taskBanner}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <img
              src={eduAvatarImage}
              alt=""
              draggable={false}
              style={styles.taskAvatar}
            />
            <span style={styles.taskText}>{text}</span>
          </motion.div>
        )
      ) : null}
    </AnimatePresence>
  );
}

const styles: Record<string, CSSProperties> = {
  dialogueLayer: {
    position: "fixed",
    inset: 0,
    zIndex: 2600,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "0 24px 36px",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.55) 78%)",
    // The layer itself must not swallow board clicks (especially while the
    // exit animation is still playing); only the panel is interactive.
    pointerEvents: "none",
  },

  dialogueLayerCentered: {
    alignItems: "center",
    padding: "0 24px",
  },

  dialoguePanel: {
    display: "flex",
    alignItems: "flex-end",
    gap: 18,
    width: "min(860px, calc(100cqw - 48px))",
    pointerEvents: "auto",
  },

  dialoguePanelCentered: {
    alignItems: "center",
  },

  dialogueAvatar: {
    width: 168,
    height: 196,
    flex: "0 0 auto",
    objectFit: "contain",
    objectPosition: "center bottom",
    filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.7))",
    // Bottom fade, same as the battle headquarters avatars.
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 78%, rgba(0,0,0,0.58) 91%, transparent 100%)",
  },

  dialogueBody: {
    position: "relative",
    flex: "1 1 auto",
    padding: "16px 18px 14px",
    border: "1px solid rgba(213, 178, 102, 0.45)",
    background:
      "linear-gradient(180deg, rgba(26, 28, 23, 0.97), rgba(10, 12, 10, 0.97))",
    boxShadow: "0 18px 40px rgba(0,0,0,0.65)",
    color: "#ece2c8",
    fontFamily: "var(--font-body)",
  },

  speakerName: {
    marginBottom: 6,
    color: "#e9c878",
    fontSize: 11,
    fontWeight: 1000,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },

  dialogueText: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.5,
  },

  nextButton: {
    display: "block",
    width: 150,
    height: 38,
    margin: "14px 0 0 auto",
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
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    textShadow: "0 2px 2px #000",
  },

  taskBanner: {
    position: "fixed",
    left: "50%",
    top: 14,
    transform: "translateX(-50%)",
    zIndex: 2500,
    display: "flex",
    alignItems: "center",
    gap: 12,
    maxWidth: "min(820px, calc(100cqw - 112px))",
    padding: "12px 20px 12px 12px",
    border: "1px solid rgba(213, 178, 102, 0.45)",
    background:
      "linear-gradient(180deg, rgba(26, 28, 23, 0.96), rgba(10, 12, 10, 0.96))",
    boxShadow: "0 12px 28px rgba(0,0,0,0.6)",
    color: "#ece2c8",
    fontFamily: "var(--font-body)",
    pointerEvents: "none",
  },

  taskAvatar: {
    width: 58,
    height: 58,
    flex: "0 0 auto",
    objectFit: "cover",
    objectPosition: "center top",
  },

  taskText: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.4,
    textAlign: "center",
  },
};
