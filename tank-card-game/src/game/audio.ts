import battleMusicUrl from "../assets/sounds/battle.mp3?url";
import mainMusicUrl from "../assets/sounds/main.mp3?url";
import paperBurningUrl from "../assets/sounds/paper_burning_2.mp3?url";
import steelImpactUrl from "../assets/sounds/steel_imp_3.mp3?url";
import cannonShot1Url from "../assets/sounds/cannon_shot/cannon_shot_1.mp3?url";
import cannonShot2Url from "../assets/sounds/cannon_shot/cannon_shot_2.mp3?url";
import cannonShot3Url from "../assets/sounds/cannon_shot/cannon_shot_3.mp3?url";
import cannonShot4Url from "../assets/sounds/cannon_shot/cannon_shot_4.mp3?url";
import cardDistribution1Url from "../assets/sounds/card_distrib/playing_card_distrib_1.mp3?url";
import cardDistribution2Url from "../assets/sounds/card_distrib/playing_card_distrib_2.mp3?url";

type MusicTrack = "main" | "battle";
type OneShotSound = "cannonShot" | "cardDistribution" | "turnStart" | "destroyed";

const MUSIC_FADE_MS = 900;
const MUSIC_VOLUME = 0.34;
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
  cardDistribution: [cardDistribution1Url, cardDistribution2Url],
  turnStart: [steelImpactUrl],
  destroyed: [paperBurningUrl],
};

const musicElements = new Map<MusicTrack, HTMLAudioElement>();
const fadeTimers = new Map<MusicTrack, number>();
let currentTrack: MusicTrack | null = null;
let pendingTrack: MusicTrack | null = null;
let unlockListenerAttached = false;

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

  fadeAudio(track, MUSIC_VOLUME);

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
  audio.volume = EFFECT_VOLUME[sound];

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
