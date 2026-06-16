import { Suspense, lazy, useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
  LoadingScreen,
  preloadCriticalMenuAssets,
} from "./components/LoadingScreen";
import { useBattleStore } from "./store/battleStore";

const BattleScreen = lazy(() =>
  import("./components/BattleScreen").then((module) => ({
    default: module.BattleScreen,
  }))
);
const PvpLobby = lazy(() =>
  import("./components/PvpLobby").then((module) => ({
    default: module.PvpLobby,
  }))
);

export default function App() {
  const battle = useBattleStore((state) => state.battle);
  const restorePvpSession = useBattleStore((state) => state.restorePvpSession);
  const sessionError = useBattleStore((state) => state.sessionError);
  const clearSessionError = useBattleStore((state) => state.clearSessionError);
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    restorePvpSession();
  }, [restorePvpSession]);

  useEffect(() => {
    let cancelled = false;
    const minVisibleTime = new Promise<void>((resolve) =>
      window.setTimeout(resolve, 700)
    );

    void Promise.all([preloadCriticalMenuAssets(), minVisibleTime]).then(() => {
      if (!cancelled) setBootReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootReady) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      {battle ? <BattleScreen /> : <PvpLobby />}
      {sessionError ? (
        <SessionErrorNotice message={sessionError} onClose={clearSessionError} />
      ) : null}
    </Suspense>
  );
}

// Blocks starting a battle when the account already has an active game session
// in another tab/device. Portaled to <body> so the dim covers the whole
// viewport (not just the scaled GameStage design box).
function SessionErrorNotice({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return createPortal(
    <div style={sessionNoticeStyles.overlay} onClick={onClose}>
      <div
        style={sessionNoticeStyles.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={sessionNoticeStyles.title}>Игра уже запущена</div>
        <div style={sessionNoticeStyles.message}>{message}</div>
        <button
          type="button"
          style={sessionNoticeStyles.button}
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>,
    document.body
  );
}

const sessionNoticeStyles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 5000,
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "rgba(3, 4, 5, 0.78)",
    backdropFilter: "blur(3px)",
  },
  panel: {
    width: "min(420px, 100%)",
    padding: "26px 28px",
    borderRadius: 10,
    border: "1px solid rgba(228, 101, 82, 0.5)",
    background:
      "linear-gradient(180deg, rgba(38, 22, 18, 0.98), rgba(14, 10, 9, 0.98))",
    boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
    color: "#f1e4d8",
    fontFamily: "var(--font-body)",
    textAlign: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: 0.4,
    color: "#ff9a86",
    textTransform: "uppercase",
    textShadow: "0 2px 4px #000",
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 1.45,
    color: "#e3d6c8",
  },
  button: {
    marginTop: 22,
    minWidth: 150,
    height: 40,
    border: "1px solid rgba(255, 220, 200, 0.35)",
    borderRadius: 6,
    background:
      "linear-gradient(180deg, rgba(92, 58, 48, 0.95), rgba(40, 24, 20, 0.95))",
    color: "#ffe8db",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    cursor: "pointer",
  },
};
