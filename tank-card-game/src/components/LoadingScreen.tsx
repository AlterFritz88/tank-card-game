import type { CSSProperties, SyntheticEvent } from "react";

type PublicImageAsset = {
  src: string;
  fallbackSrc?: string;
};

const MAIN_LOGO: PublicImageAsset = {
  src: "/ui/main_logo.webp",
  fallbackSrc: "/ui/main_logo.png",
};
const MENU_BACKGROUND: PublicImageAsset = {
  src: "/menu-background.webp",
  fallbackSrc: "/menu-background.png",
};
const CRITICAL_MENU_ASSETS: PublicImageAsset[] = [
  MAIN_LOGO,
  MENU_BACKGROUND,
  {
    src: "/ui/menu/campaign-card.webp",
    fallbackSrc: "/ui/menu/campaign-card.png",
  },
  {
    src: "/ui/menu/PVP.webp",
    fallbackSrc: "/ui/menu/PVP.png",
  },
  {
    src: "/ui/menu/PVE.webp",
    fallbackSrc: "/ui/menu/PVE.png",
  },
  {
    src: "/ui/menu/education.webp",
    fallbackSrc: "/ui/menu/education.png",
  },
];

export function preloadCriticalMenuAssets(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return Promise.all(
    CRITICAL_MENU_ASSETS.map((asset) => preloadImageWithFallback(asset))
  ).then(() => undefined);
}

export function usePngFallback(
  event: SyntheticEvent<HTMLImageElement>,
  fallbackSrc: string
) {
  const image = event.currentTarget;
  if (image.src.endsWith(fallbackSrc)) return;

  image.onerror = null;
  image.src = fallbackSrc;
}

export function LoadingScreen() {
  return (
    <main style={styles.page} aria-label="Загрузка игры">
      <div style={styles.vignette} />
      <section style={styles.content}>
        <img
          src={MAIN_LOGO.src}
          alt="Panzershrek"
          draggable={false}
          onError={(event) =>
            MAIN_LOGO.fallbackSrc
              ? usePngFallback(event, MAIN_LOGO.fallbackSrc)
              : undefined
          }
          style={styles.logo}
        />
        <div style={styles.progressTrack}>
          <div style={styles.progressBar} />
        </div>
        <div style={styles.loadingText}>ЗАГРУЗКА РЕСУРСОВ</div>
      </section>
    </main>
  );
}

function preloadImageWithFallback(asset: PublicImageAsset): Promise<void> {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => {
      if (!asset.fallbackSrc) {
        resolve();
        return;
      }

      const fallbackImage = new Image();
      fallbackImage.onload = () => resolve();
      fallbackImage.onerror = () => resolve();
      fallbackImage.src = asset.fallbackSrc;
    };
    image.src = asset.src;
  });
}

const styles = {
  page: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    color: "#f4e5bf",
    // Menu art is painted full-viewport by GameStage's backdrop host; keep this
    // box transparent so it shows through (and fills the letterbox margins).
    background: "transparent",
    fontFamily: "var(--font-body)",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.24) 48%, rgba(0,0,0,0.78) 100%)",
  },
  content: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    width: "min(560px, 76cqw)",
    alignItems: "center",
    flexDirection: "column" as const,
    gap: 22,
    textAlign: "center" as const,
  },
  logo: {
    width: "min(520px, 72cqw)",
    maxHeight: "42cqh",
    objectFit: "contain" as const,
    filter:
      "drop-shadow(0 8px 16px rgba(0,0,0,0.72)) drop-shadow(0 0 22px rgba(213,171,83,0.18))",
  },
  progressTrack: {
    position: "relative",
    width: "min(360px, 62cqw)",
    height: 8,
    overflow: "hidden",
    border: "1px solid rgba(219, 184, 98, 0.38)",
    background: "rgba(6, 8, 7, 0.7)",
    boxShadow: "0 0 18px rgba(0,0,0,0.48)",
  },
  progressBar: {
    position: "absolute",
    inset: "1px auto 1px 1px",
    width: "44%",
    background:
      "linear-gradient(90deg, rgba(116, 83, 30, 0.1), rgba(255, 218, 127, 0.92), rgba(116, 83, 30, 0.1))",
    animation: "boot-loading-sweep 1.25s ease-in-out infinite",
  },
  loadingText: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "var(--brass-400)",
    textShadow: "var(--text-shadow-gold-glow)",
  },
} satisfies Record<string, CSSProperties>;
