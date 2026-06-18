import battleMusicUrl from "../assets/sounds/battle.mp3?url";
import mainMusicUrl from "../assets/sounds/main.mp3?url";
import paperBurningUrl from "../assets/sounds/paper_burning_2.mp3?url";
import rotatingCartridgeUrl from "../assets/sounds/rotating_catrige.mp3?url";
import steelImpactUrl from "../assets/sounds/steel_imp_3.mp3?url";
import cannonShot1Url from "../assets/sounds/cannon_shot/cannon_shot_1.mp3?url";
import cannonShot2Url from "../assets/sounds/cannon_shot/cannon_shot_2.mp3?url";
import cannonShot3Url from "../assets/sounds/cannon_shot/cannon_shot_3.mp3?url";
import cannonShot4Url from "../assets/sounds/cannon_shot/cannon_shot_4.mp3?url";
import cardDistribution1Url from "../assets/sounds/card_distrib/playing_card_distrib_1.mp3?url";
import cardDistribution2Url from "../assets/sounds/card_distrib/playing_card_distrib_2.mp3?url";
import cardDistribution3Url from "../assets/sounds/card_distrib/playing_card_distrib_3.mp3?url";
import radarScanning1Url from "../assets/sounds/radar/Radar_scaning_1.mp3?url";
import radarScanning2Url from "../assets/sounds/radar/Radar_scaning_2.mp3?url";
import {
  getEffectsVolume,
  getMusicVolume,
  subscribeSettings,
} from "./settings";

type MusicTrack = "main" | "battle";
type OneShotSound = "cannonShot" | "cardDistribution" | "turnStart" | "destroyed";

const MUSIC_FADE_MS = 900;
const MUSIC_VOLUME = 0.34;
const RADAR_SCAN_VOLUME = 0.38;
const ROTATING_CARTRIDGE_VOLUME = 0.46;
const EFFECT_VOLUME: Record<OneShotSound, number> = {
  cannonShot: 0.58,
  cardDistribution: 0.46,
  turnStart: 0.42,
  destroyed: 0.5,
};

const musicUrls: Record<MusicTrack, string> = {
  main: mainMusicUrl,
  battle: battleMusicUrl,
};

const effectUrls: Record<OneShotSound, string[]> = {
  cannonShot: [
    cannonShot1Url,
    cannonShot2Url,
    cannonShot3Url,
    cannonShot4Url,
  ],
  cardDistribution: [
    cardDistribution1Url,
    cardDistribution2Url,
    cardDistribution3Url,
  ],
  turnStart: [steelImpactUrl],
  destroyed: [paperBurningUrl],
};

const radarScanUrls = [radarScanning1Url, radarScanning2Url];

const musicElements = new Map<MusicTrack, HTMLAudioElement>();
const fadeTimers = new Map<MusicTrack, number>();
let currentTrack: MusicTrack | null = null;
let pendingTrack: MusicTrack | null = null;
let unlockListenerAttached = false;

// Final music volume = authored base × the user's music-volume setting (0..1).
function musicTargetVolume(): number {
  return MUSIC_VOLUME * getMusicVolume();
}

// Reconcile the playing track with the current music-volume setting. At 0% the
// track is fully stopped (paused), not just silenced; above 0% it resumes and
// tracks the slider live. Skips a live volume write while a fade is running so
// it doesn't fight the fade interval (which already targets musicTargetVolume).
function applyMusicVolume() {
  if (!currentTrack) return;

  const audio = getMusicElement(currentTrack);

  if (getMusicVolume() === 0) {
    clearFade(currentTrack);
    audio.volume = 0;
    audio.pause();
    return;
  }

  if (audio.paused) {
    void audio.play().catch(() => undefined);
  }

  if (!fadeTimers.has(currentTrack)) {
    audio.volume = musicTargetVolume();
  }
}

subscribeSettings(applyMusicVolume);

function getMusicElement(track: MusicTrack): HTMLAudioElement {
  const existing = musicElements.get(track);
  if (existing) return existing;

  const audio = new Audio(musicUrls[track]);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;

  musicElements.set(track, audio);

  return audio;
}

function clearFade(track: MusicTrack) {
  const timer = fadeTimers.get(track);
  if (timer === undefined) return;

  window.clearInterval(timer);
  fadeTimers.delete(track);
}

function fadeAudio(
  track: MusicTrack,
  targetVolume: number,
  onComplete?: () => void
) {
  const audio = getMusicElement(track);
  const startedAt = Date.now();
  const startVolume = audio.volume;

  clearFade(track);

  const timer = window.setInterval(() => {
    const progress = Math.min(1, (Date.now() - startedAt) / MUSIC_FADE_MS);
    audio.volume = startVolume + (targetVolume - startVolume) * progress;

    if (progress < 1) return;

    clearFade(track);
    audio.volume = targetVolume;
    onComplete?.();
  }, 40);

  fadeTimers.set(track, timer);
}

function attachUnlockListener() {
  if (unlockListenerAttached) return;
  unlockListenerAttached = true;

  const retry = () => {
    if (pendingTrack) {
      const track = pendingTrack;
      pendingTrack = null;
      void playMusic(track);
    }
  };

  window.addEventListener("pointerdown", retry, { once: true });
  window.addEventListener("keydown", retry, { once: true });
}

export async function playMusic(track: MusicTrack) {
  if (currentTrack === track) return;

  const nextAudio = getMusicElement(track);
  pendingTrack = track;

  try {
    await nextAudio.play();
  } catch {
    attachUnlockListener();
    return;
  }

  pendingTrack = null;

  const previousTrack = currentTrack;
  currentTrack = track;

  if (getMusicVolume() === 0) {
    // Muted: don't leave the freshly-started track playing silently.
    nextAudio.volume = 0;
    nextAudio.pause();
  } else {
    fadeAudio(track, musicTargetVolume());
  }

  if (previousTrack && previousTrack !== track) {
    fadeAudio(previousTrack, 0, () => {
      const previousAudio = getMusicElement(previousTrack);
      previousAudio.pause();
      previousAudio.currentTime = 0;
    });
  }
}

export function playRandomSound(sound: OneShotSound) {
  const urls = effectUrls[sound];
  if (urls.length === 0) return;

  const url = urls[Math.floor(Math.random() * urls.length)];
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = EFFECT_VOLUME[sound] * getEffectsVolume();

  void audio.play().catch(() => undefined);
}

function playSoundUrl(url: string, volume: number) {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = volume * getEffectsVolume();

  void audio.play().catch(() => undefined);
}

export function playCannonShotSound() {
  playRandomSound("cannonShot");
}

export function playCardDistributionSound() {
  playRandomSound("cardDistribution");
}

export function playTurnStartSound() {
  playRandomSound("turnStart");
}

export function playDestroyedSound() {
  playRandomSound("destroyed");
}

export function playRotatingCartridgeSound(durationMs: number) {
  const audio = new Audio(rotatingCartridgeUrl);
  let stopTimer: number | null = null;

  audio.preload = "auto";
  audio.volume = ROTATING_CARTRIDGE_VOLUME * getEffectsVolume();
  audio.currentTime = 0;

  void audio.play().catch(() => undefined);

  const stop = () => {
    if (stopTimer !== null) {
      window.clearTimeout(stopTimer);
      stopTimer = null;
    }

    audio.pause();
    audio.currentTime = 0;
  };

  stopTimer = window.setTimeout(stop, durationMs);

  return stop;
}

export function createRadarScanSoundPlayer() {
  const url = radarScanUrls[Math.floor(Math.random() * radarScanUrls.length)];

  return () => playSoundUrl(url, RADAR_SCAN_VOLUME);
}
