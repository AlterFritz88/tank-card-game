import { useCallback, useEffect, useRef, type FocusEventHandler } from "react";

/**
 * The mobile soft keyboard always opens in the *physical* device orientation.
 * Our landscape game is faked on portrait phones by rotating the GameStage 90°
 * (see GameStage), so a focused input pops a portrait keyboard that sits
 * sideways relative to the UI. The only real fix is to force the device into
 * landscape via the Screen Orientation API while a field is focused, then
 * release it on blur.
 *
 * Caveats: orientation locking requires fullscreen + a user gesture and only
 * works on browsers that expose `screen.orientation.lock` (Android Chrome).
 * iOS Safari has no such API, so this degrades to a no-op there.
 *
 * Spread the returned `{ onFocus, onBlur }` onto every nickname/password input.
 */

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait" | string) => Promise<void>;
  unlock?: () => void;
};

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

function isTouchPrimary(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function getLockableOrientation(): LockableOrientation | null {
  if (typeof screen === "undefined") return null;
  const orientation = screen.orientation as LockableOrientation | undefined;
  return orientation?.lock ? orientation : null;
}

function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitorWindow = window as CapacitorWindow;

  return (
    window.location.protocol === "capacitor:" ||
    capacitorWindow.Capacitor?.isNativePlatform?.() === true
  );
}

function keepFocusedInputVisible(element: HTMLElement): void {
  const reveal = () => {
    if (document.activeElement !== element) return;

    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  };

  window.setTimeout(reveal, 80);
  window.setTimeout(reveal, 320);
}

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestFullscreen(): Promise<void> {
  const element = document.documentElement as FullscreenElement;
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    }
  } catch {
    // Some browsers (notably iOS Safari) reject element fullscreen — ignore.
  }
}

async function exitFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore — already exited or unsupported.
  }
}

export function useLandscapeKeyboardLock() {
  // Whether *we* forced fullscreen (so we only exit what we opened) and whether
  // an orientation lock is currently held.
  const enteredFullscreenRef = useRef(false);
  const lockedRef = useRef(false);
  // Releasing on blur is deferred so that moving focus between fields (blur on
  // one immediately followed by focus on the next) keeps the lock instead of
  // flipping the device back and forth.
  const releaseTimerRef = useRef<number | null>(null);

  const release = useCallback(() => {
    const orientation = getLockableOrientation();
    if (lockedRef.current) {
      try {
        orientation?.unlock?.();
      } catch {
        // Ignore.
      }
      lockedRef.current = false;
    }
    if (enteredFullscreenRef.current) {
      void exitFullscreen();
      enteredFullscreenRef.current = false;
    }
  }, []);

  const onFocus: FocusEventHandler<HTMLElement> = useCallback((event) => {
    if (!isTouchPrimary()) return;

    if (isCapacitorNativeApp()) return;

    keepFocusedInputVisible(event.currentTarget);

    const orientation = getLockableOrientation();
    if (!orientation) return; // iOS Safari and other unsupported browsers.

    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    if (lockedRef.current) return; // Already locked (e.g. field-to-field move).

    void (async () => {
      if (!getFullscreenElement()) {
        await requestFullscreen();
        enteredFullscreenRef.current = getFullscreenElement() !== null;
      }
      try {
        await orientation.lock?.("landscape");
        lockedRef.current = true;
      } catch {
        // Lock rejects when not fullscreen or unsupported — leave UI as-is.
      }
    })();
  }, []);

  const onBlur = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
    }
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      release();
    }, 200);
  }, [release]);

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
      release();
    };
  }, [release]);

  return { onFocus, onBlur };
}
