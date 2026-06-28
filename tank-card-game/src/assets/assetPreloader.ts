type PreloadTask = () => Promise<void>;

import { getBattleBackgroundAsset } from "./battleBackgroundAssets";
import { getHeadquartersAvatarAsset } from "./headquartersAvatarAssets";
import { getNationFlagAsset } from "./nationFlagAssets";
import { getCardOrNull } from "../game/cards";
import {
  getDeckBuildingHeadquarters,
  getHeadquartersDefinition,
} from "../game/headquarters";
import { getHeadquartersImageAsset } from "../game/headquartersImages";
import { getTankImage } from "../game/tankImages";
import type {
  BattleState,
  BattleStateView,
  ClientCardInstance,
  HeadquartersId,
  Nation,
  PlayerState,
  PlayerStateView,
} from "../game/types";

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

const missionIllustrationModules = import.meta.glob(
  "./backgrounds/missions/*.{png,jpg,jpeg,webp,avif}",
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

const menuUtilityImageModules = import.meta.glob(
  [
    "./backgrounds/top_background.{png,jpg,jpeg,webp,avif}",
    "./backgrounds/matchmaking/*.{png,jpg,jpeg,webp,avif}",
    "./cards/*.{png,jpg,jpeg,webp,avif}",
    "./button.{png,jpg,jpeg,webp,avif}",
  ],
  {
    eager: true,
    import: "default",
  }
) as Record<string, string>;

let mainMenuPreloadStarted = false;
let cardLibraryPreloadStarted = false;
let campaignPreloadStarted = false;

export function startMainMenuAssetPreload() {
  if (mainMenuPreloadStarted || typeof window === "undefined") return;
  mainMenuPreloadStarted = true;

  const firstWaveImages = uniqueAssetUrls([
    ...Object.values(headquartersImageModules),
    ...Object.values(headquartersAvatarModules),
    ...Object.values(nationFlagModules),
    ...Object.values(combatIconModules),
    ...Object.values(battleEffectModules),
    ...Object.values(menuUtilityImageModules),
  ]);
  const firstWaveSounds = uniqueAssetUrls(Object.values(battleSoundModules));
  const secondWaveImages = uniqueAssetUrls([
    ...Object.values(battleBackgroundModules),
    ...Object.values(missionIllustrationModules),
  ]);
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

export function startCardLibraryAssetPreload() {
  if (cardLibraryPreloadStarted || typeof window === "undefined") return;
  cardLibraryPreloadStarted = true;

  scheduleIdlePreload(() => {
    void runPreloadQueue(
      Object.values(unitImageModules).map((url) => () => preloadImage(url)),
      3
    );
  });
}

export function startCampaignMenuAssetPreload() {
  if (campaignPreloadStarted || typeof window === "undefined") return;
  campaignPreloadStarted = true;

  void preloadAssetUrls(
    [
      ...Object.values(missionIllustrationModules),
      ...Object.values(headquartersAvatarModules),
      ...Object.values(headquartersImageModules),
    ],
    { imageConcurrency: 3 }
  );
}

export function startHeadquartersMenuAssetPreload() {
  if (typeof window === "undefined") return;

  void preloadAssetUrls(
    [
      ...Object.values(headquartersImageModules),
      ...Object.values(headquartersAvatarModules),
      ...Object.values(nationFlagModules),
    ],
    { imageConcurrency: 4 }
  );
}

export function startDeckBuilderAssetPreload() {
  startHeadquartersMenuAssetPreload();
  startCardLibraryAssetPreload();
}

export function startResearchAssetPreload() {
  startHeadquartersMenuAssetPreload();
  startCardLibraryAssetPreload();
}

export function preloadCardImages(cardIds: string[]): Promise<void> {
  return preloadAssetUrls(cardIds.map((cardId) => getTankImage(cardId)), {
    imageConcurrency: 4,
  });
}

export function preloadHeadquartersAssets(
  headquartersIds: HeadquartersId[]
): Promise<void> {
  const urls: string[] = [];

  for (const headquartersId of headquartersIds) {
    const definition = getHeadquartersDefinition(headquartersId);

    urls.push(
      getHeadquartersImageAsset(headquartersId) ?? "",
      getHeadquartersAvatarAsset(headquartersId) ?? "",
      getNationFlagAsset(definition.nation) ?? ""
    );
  }

  return preloadAssetUrls(urls, { imageConcurrency: 4 });
}

export function preloadBattleAssetsForState(
  battle: BattleState | BattleStateView
): Promise<void> {
  const cardIds = getBattleCardIds(battle);
  const headquartersIds = uniqueHeadquartersIds([
    battle.player.headquartersId,
    battle.bot.headquartersId,
    battle.headquarters.player.headquartersId,
    battle.headquarters.bot.headquartersId,
  ]);
  const nationIds = getBattleNationIds(cardIds, headquartersIds);

  return preloadAssetUrls(
    [
      getBattleBackgroundAsset(battle.backgroundId).image,
      ...headquartersIds.flatMap((headquartersId) => [
        getHeadquartersImageAsset(headquartersId) ?? "",
        getHeadquartersAvatarAsset(headquartersId) ?? "",
      ]),
      ...nationIds.map((nation) => getNationFlagAsset(nation) ?? ""),
      ...cardIds.map((cardId) => getTankImage(cardId)),
      ...Object.values(combatIconModules),
      ...Object.values(battleEffectModules),
      ...Object.values(battleSoundModules),
      ...Object.values(menuUtilityImageModules),
    ],
    { imageConcurrency: 5, resourceConcurrency: 4 }
  );
}

export function startBattleAssetPreloadForState(
  battle: BattleState | BattleStateView
) {
  void preloadBattleAssetsForState(battle);
}

function preloadAssetUrls(
  urls: string[],
  options: { imageConcurrency?: number; resourceConcurrency?: number } = {}
): Promise<void> {
  const uniqueUrls = uniqueAssetUrls(urls);
  const imageTasks = uniqueUrls
    .filter(isImageUrl)
    .map((url) => () => preloadImage(url));
  const resourceTasks = uniqueUrls
    .filter((url) => !isImageUrl(url))
    .map((url) => () => preloadResource(url));

  return Promise.all([
    runPreloadQueue(imageTasks, options.imageConcurrency ?? 4),
    runPreloadQueue(resourceTasks, options.resourceConcurrency ?? 3),
  ]).then(() => undefined);
}

function uniqueAssetUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|avif|svg)(?:$|\?)/i.test(url);
}

function uniqueHeadquartersIds(
  values: Array<HeadquartersId | null | undefined>
): HeadquartersId[] {
  return Array.from(new Set(values.filter(Boolean) as HeadquartersId[]));
}

function getBattleCardIds(battle: BattleState | BattleStateView): string[] {
  return Array.from(
    new Set([
      ...getPlayerCardIds(battle.player),
      ...getPlayerCardIds(battle.bot),
      ...battle.units.map((unit) => unit.cardId),
    ])
  );
}

function getPlayerCardIds(player: PlayerState | PlayerStateView): string[] {
  return [...player.hand, ...player.deck, ...player.discard]
    .map(getVisibleCardId)
    .filter(Boolean) as string[];
}

function getVisibleCardId(card: ClientCardInstance): string | null {
  return "cardId" in card ? card.cardId : null;
}

function getBattleNationIds(
  cardIds: string[],
  headquartersIds: HeadquartersId[]
): Nation[] {
  const nations = new Set<Nation>();

  for (const cardId of cardIds) {
    const card = getCardOrNull(cardId);
    if (card) nations.add(card.nation);
  }

  for (const headquartersId of headquartersIds) {
    nations.add(getHeadquartersDefinition(headquartersId).nation);
  }

  for (const headquarters of getDeckBuildingHeadquarters()) {
    nations.add(headquarters.nation);
  }

  return Array.from(nations);
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
