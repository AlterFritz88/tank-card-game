import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";

import eduAvatarImage from "../assets/headquarters/avatars/edu_avatar.webp";
import buttonImage from "../assets/button.webp";
import { useI18n } from "../game/i18n";

type RegistrationReminderOverlayProps = {
  visible: boolean;
  /** Opens the profile/registration panel and dismisses the hint. */
  onRegister: () => void;
  /** Dismisses the hint without registering. */
  onDismiss: () => void;
};

/**
 * Centered modal that nudges an unregistered player to register so their
 * progress isn't lost. Reuses the tutorial instructor portrait (large, no
 * mirror) with a big centered message.
 */
export function RegistrationReminderOverlay({
  visible,
  onRegister,
  onDismiss,
}: RegistrationReminderOverlayProps) {
  const { language } = useI18n();
  const isEn = language === "en";

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="registration-reminder"
          style={styles.root}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            style={styles.panel}
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <img
              src={eduAvatarImage}
              alt=""
              draggable={false}
              style={styles.avatar}
            />

            <div style={styles.bubble}>
              <div style={styles.speaker}>
                {isEn ? "Instructor" : "Инструктор"}
              </div>
              <p style={styles.text}>
                {isEn
                  ? "Playing as a guest — your progress can be lost. Register to save it: tap the profile button in the top-left corner."
                  : "Ты играешь как гость — прогресс можно потерять. Зарегистрируйся, чтобы сохранить его: нажми на кнопку профиля в левом верхнем углу."}
              </p>
              <div style={styles.actions}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={onRegister}
                >
                  {isEn ? "Register" : "Зарегистрироваться"}
                </button>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={onDismiss}
                >
                  {isEn ? "Later" : "Позже"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "absolute",
    inset: 0,
    zIndex: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 24px",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.66) 80%)",
    pointerEvents: "auto",
  },

  panel: {
    display: "flex",
    alignItems: "center",
    gap: 26,
    width: "min(820px, calc(100cqw - 48px))",
  },

  avatar: {
    width: 240,
    height: 300,
    flex: "0 0 auto",
    objectFit: "contain",
    objectPosition: "center bottom",
    filter: "drop-shadow(0 16px 26px rgba(0,0,0,0.72))",
    WebkitMaskImage:
      "linear-gradient(180deg, #000 0%, #000 80%, rgba(0,0,0,0.58) 92%, transparent 100%)",
    maskImage:
      "linear-gradient(180deg, #000 0%, #000 80%, rgba(0,0,0,0.58) 92%, transparent 100%)",
  },

  bubble: {
    position: "relative",
    flex: "1 1 auto",
    minWidth: 0,
    padding: "24px 26px 22px",
    border: "1px solid rgba(213, 178, 102, 0.45)",
    background:
      "linear-gradient(180deg, rgba(26, 28, 23, 0.97), rgba(10, 12, 10, 0.97))",
    boxShadow: "0 22px 48px rgba(0,0,0,0.68)",
    color: "#ece2c8",
    fontFamily: "var(--font-body)",
    textAlign: "center",
  },

  speaker: {
    marginBottom: 10,
    color: "#e9c878",
    fontSize: 13,
    fontWeight: 1000,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },

  text: {
    margin: 0,
    fontSize: 24,
    lineHeight: 1.5,
    fontWeight: 700,
  },

  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 22,
  },

  primaryButton: {
    display: "block",
    minWidth: 240,
    height: 46,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    textShadow: "0 2px 2px #000",
  },

  secondaryButton: {
    height: 46,
    padding: "0 18px",
    border: "none",
    background: "transparent",
    color: "rgba(236, 226, 200, 0.7)",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
};
