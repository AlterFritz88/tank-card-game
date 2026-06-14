type PreloadTask = () => Promise<void>;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number }
  ) => number;
};

const headquartersImageModules = import.meta.glob(
  "./headquarters/*.{png,jpg,jpeg,webp,avif}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const headquartersAvatarModules = import.meta.glob(
  "./headquarters/avatars/*.{png,jpg,jpeg,webp,avif}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const nationFlagModules = import.meta.glob(
  "./flags/*.{png,jpg,jpeg,webp,avif,svg}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const combatIconModules = import.meta.glob(
  ["./icons/*.{png,jpg,jpeg,webp,avif,svg}", "./icons/classes/*.{png,jpg,jpeg,webp,avif,svg}"],
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const battleEffectModules = import.meta.glob(
  ["./effects/*.{png,jpg,jpeg,webp,avif,svg}", "./ap-shell.{png,jpg,jpeg,webp,avif}"],
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const battleBackgroundModules = import.meta.glob(
  "./backgrounds/battle/*.{png,jpg,jpeg,webp,avif}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const battleSoundModules = import.meta.glob(
  [
    "./sounds/battle.mp3",
    "./sounds/paper_burning_2.mp3",
    "./sounds/rotating_catrige.mp3",
    "./sounds/steel_imp_3.mp3",
    "./sounds/cannon_shot/*.mp3",
    "./sounds/card_distrib/*.mp3",
  ],
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const unitImageModules = import.meta.glob(
  ["./tanks/prototype-tank.{png,jpg,jpeg,webp,avif}", "./tanks/units/*.{png,jpg,jpeg,webp,avif}"],
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

let mainMenuPreloadStarted = false;

export function startMainMenuAssetPreload() {
  if (mainMenuPreloadStarted || typeof window === "undefined") return;
  mainMenuPreloadStarted = true;

  const firstWaveImages = uniqueAssetUrls([
    ...Object.values(headquartersImageModules),
    ...Object.values(headquartersAvatarModules),
    ...Object.values(nationFlagModules),
    ...Object.values(combatIconModules),
    ...Object.values(battleEffectModules),
  ]);
  const firstWaveSounds = uniqueAssetUrls(Object.values(battleSoundModules));
  const secondWaveImages = uniqueAssetUrls(Object.values(battleBackgroundModules));
  const idleWaveImages = uniqueAssetUrls(Object.values(unitImageModules));

  void runPreloadQueue(
    [
      ...firstWaveImages.map((url) => () => preloadImage(url)),
      ...firstWaveSounds.map((url) => () => preloadResource(url)),
    ],
    4
  ).then(() => {
    void runPreloadQueue(
      secondWaveImages.map((url) => () => preloadImage(url)),
      3
    ).then(() => {
      scheduleIdlePreload(() => {
        void runPreloadQueue(
          idleWaveImages.map((url) => () => preloadImage(url)),
          2
        );
      });
    });
  });
}

function uniqueAssetUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();

    image.decoding = "async";
    image.onload = () => {
      if (!image.decode) {
        resolve();
        return;
      }

      void image.decode().then(resolve, resolve);
    };
    image.onerror = () => resolve();
    image.src = url;
  });
}

function preloadResource(url: string): Promise<void> {
  return fetch(url, { cache: "force-cache" })
    .then(() => undefined)
    .catch(() => undefined);
}

function runPreloadQueue(tasks: PreloadTask[], concurrency: number): Promise<void> {
  if (tasks.length === 0) return Promise.resolve();

  let nextIndex = 0;
  let activeCount = 0;

  return new Promise((resolve) => {
    const runNext = () => {
      if (nextIndex >= tasks.length && activeCount === 0) {
        resolve();
        return;
      }

      while (activeCount < concurrency && nextIndex < tasks.length) {
        const task = tasks[nextIndex];
        nextIndex += 1;
        activeCount += 1;

        void task().finally(() => {
          activeCount -= 1;
          runNext();
        });
      }
    };

    runNext();
  });
}

function scheduleIdlePreload(callback: () => void) {
  const idleWindow = window as WindowWithIdleCallback;

  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(callback, { timeout: 5_000 });
    return;
  }

  window.setTimeout(callback, 1_500);
}
