import { Suspense, lazy, useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
  LoadingScreen,
  preloadCriticalMenuAssets,
} from "./components/LoadingScreen";
import { SettingsControls } from "./components/SettingsControls";
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
const AdminPanel = lazy(() =>
  import("./components/AdminPanel").then((module) => ({
    default: module.AdminPanel,
  }))
);

type LegalDocumentRoute = {
  slug: string;
  title: string;
};

const LEGAL_DOCUMENT_ROUTES: Record<string, LegalDocumentRoute> = {
  "/legal/user-agreement": {
    slug: "user-agreement",
    title: "Пользовательское соглашение",
  },
  "/legal/offer": {
    slug: "offer",
    title: "Оферта",
  },
  "/legal/privacy-policy": {
    slug: "privacy-policy",
    title: "Политика конфиденциальности",
  },
};

export default function App() {
  const legalDocument = LEGAL_DOCUMENT_ROUTES[window.location.pathname];

  if (legalDocument) return <LegalDocumentPage document={legalDocument} />;
  if (window.location.pathname === "/admin") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AdminPanel />
      </Suspense>
    );
  }

  return <GameApp />;
}

function GameApp() {
  const battle = useBattleStore((state) => state.battle);
  const restorePvpSession = useBattleStore((state) => state.restorePvpSession);
  const autoLaunchTrailerIfNeeded = useBattleStore(
    (state) => state.autoLaunchTrailerIfNeeded
  );
  const trailerLaunchPending = useBattleStore(
    (state) => state.trailerLaunchPending
  );
  const sessionError = useBattleStore((state) => state.sessionError);
  const clearSessionError = useBattleStore((state) => state.clearSessionError);
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    restorePvpSession();
  }, [restorePvpSession]);

  // First visit: auto-launch the welcome trailer mission once boot is ready.
  useEffect(() => {
    if (!bootReady) return;
    autoLaunchTrailerIfNeeded();
  }, [bootReady, autoLaunchTrailerIfNeeded]);

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

  // First visit: keep the loading screen up while the welcome trailer mission is
  // being auto-launched, so the registration/menu screen doesn't flash (or get
  // stuck) in the gap before the trailer battle starts.
  if (trailerLaunchPending && !battle) return <LoadingScreen />;

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        {battle ? <BattleScreen /> : <PvpLobby />}
        {sessionError ? (
          <SessionErrorNotice
            message={sessionError}
            onClose={clearSessionError}
          />
        ) : null}
      </Suspense>
      <SettingsControls side={battle ? "left" : "right"} />
    </>
  );
}

function LegalDocumentPage({ document }: { document: LegalDocumentRoute }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setContent(null);
    setError(null);

    void fetch(`/api/legal/${document.slug}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          content?: string;
          message?: string;
        };

        if (!response.ok || !payload.ok || typeof payload.content !== "string") {
          throw new Error(payload.message ?? "Документ недоступен");
        }

        return payload.content;
      })
      .then((nextContent) => {
        if (!cancelled) setContent(nextContent);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [document.slug]);

  return (
    <main style={legalPageStyles.page}>
      <div style={legalPageStyles.noise} />
      <section style={legalPageStyles.content}>
        <a href="/" style={legalPageStyles.backLink}>
          Назад в игру
        </a>
        <article style={legalPageStyles.panel}>
          <h1 style={legalPageStyles.title}>{document.title}</h1>
          <div style={legalPageStyles.kicker}>PANZERSHREK legal archive</div>
          {error ? (
            <div style={legalPageStyles.error}>{error}</div>
          ) : content ? (
            <pre style={legalPageStyles.document}>{content}</pre>
          ) : (
            <div style={legalPageStyles.loading}>Загрузка документа...</div>
          )}
        </article>
      </section>
    </main>
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

const legalPageStyles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflowX: "hidden",
    color: "#f4e5bf",
    background:
      "radial-gradient(circle at 50% 10%, rgba(179, 135, 58, 0.18), transparent 35%), linear-gradient(180deg, #20231d 0%, #070907 100%)",
    fontFamily: "var(--font-body)",
  },
  noise: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(90deg, rgba(0,0,0,0.72), transparent 25%, transparent 75%, rgba(0,0,0,0.72)), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px)",
    mixBlendMode: "overlay",
  },
  content: {
    position: "relative",
    zIndex: 1,
    width: "min(980px, calc(100vw - 32px))",
    margin: "0 auto",
    padding: "32px 0 52px",
  },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 146,
    minHeight: 42,
    marginBottom: 22,
    padding: "10px 18px",
    color: "#fff0bd",
    textDecoration: "none",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    background:
      "linear-gradient(180deg, rgba(156, 159, 154, 0.34), rgba(45, 48, 49, 0.76))",
    boxShadow:
      "inset 0 0 0 1px rgba(216, 174, 92, 0.3), 0 16px 34px rgba(0,0,0,0.38)",
  },
  panel: {
    padding: "clamp(22px, 4vw, 42px)",
    background:
      "linear-gradient(180deg, rgba(18,18,14,0.82), rgba(12,13,11,0.9))",
    boxShadow:
      "0 28px 70px rgba(0,0,0,0.62), inset 0 0 0 1px rgba(216,174,92,0.2)",
  },
  title: {
    margin: "0 0 8px",
    color: "#d6ad53",
    fontFamily: "var(--font-display)",
    fontSize: "clamp(34px, 6vw, 58px)",
    lineHeight: 0.95,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textShadow: "0 6px 18px rgba(0,0,0,0.74)",
  },
  kicker: {
    marginBottom: 28,
    color: "rgba(244, 229, 191, 0.72)",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: 12,
  },
  document: {
    margin: 0,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    color: "rgba(255, 246, 221, 0.9)",
    font: "600 15px/1.62 var(--font-body)",
  },
  loading: {
    color: "rgba(255, 246, 221, 0.8)",
    fontSize: 16,
    fontWeight: 700,
  },
  error: {
    color: "#ff9a86",
    fontSize: 16,
    fontWeight: 800,
  },
};
