import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Fixed design resolution the whole UI is authored against. The landscape
 * design is rendered into a box of exactly these dimensions and then uniformly
 * scaled (transform: scale) to fit the device viewport, so proportions stay
 * pixel-identical on desktop and mobile. Container-query units (cqw/cqh) used
 * throughout the styles resolve against this box because the stage is a size
 * container.
 */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

// Live stage transform, updated whenever the viewport changes. Used to convert
// pointer/getBoundingClientRect screen coordinates back into the stage's own
// (design) coordinate space for absolutely/fixed-positioned overlays such as
// battle projectiles, explosions and card animations.
let stageScale = 1;
let stageRotationDeg = 0;

// Lightweight subscription store so overlays portaled to <body> (outside the
// scaled/rotated design box) can mirror the stage rotation — otherwise they
// appear sideways on phones held in portrait, where the stage is rotated 90°.
const rotationListeners = new Set<() => void>();

function setStageRotation(deg: number) {
  if (deg === stageRotationDeg) return;
  stageRotationDeg = deg;
  for (const listener of rotationListeners) listener();
}

function subscribeRotation(onChange: () => void) {
  rotationListeners.add(onChange);
  return () => {
    rotationListeners.delete(onChange);
  };
}

/**
 * React hook returning the current stage rotation in degrees (0 in landscape,
 * 90 in portrait). Overlays rendered outside the stage (portaled to <body>) use
 * this to rotate their content to match the game's orientation.
 */
export function useStageRotation(): number {
  return useSyncExternalStore(
    subscribeRotation,
    () => stageRotationDeg,
    () => stageRotationDeg
  );
}

/**
 * Convert a screen-space delta (e.g. the vector between two
 * getBoundingClientRect centers) into the stage's local coordinate space,
 * inverting the stage's rotation and scale. Translation cancels out for deltas.
 */
export function screenDeltaToStage(dx: number, dy: number) {
  const rad = (-stageRotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: (dx * cos - dy * sin) / stageScale,
    y: (dx * sin + dy * cos) / stageScale,
  };
}

/**
 * Convert an absolute screen-space point into the stage's local coordinate
 * space. The stage is always centered in the viewport, so the viewport center
 * maps to the design-box center regardless of scale/rotation.
 */
export function screenPointToStage(px: number, py: number) {
  const delta = screenDeltaToStage(
    px - window.innerWidth / 2,
    py - window.innerHeight / 2
  );
  return {
    x: DESIGN_WIDTH / 2 + delta.x,
    y: DESIGN_HEIGHT / 2 + delta.y,
  };
}

const outerStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  background: "#000",
  // Avoid mobile rubber-band / address-bar resize jank.
  overscrollBehavior: "none",
  touchAction: "none",
};

// Default background recipe (the main menu art) used to fill the whole viewport
// behind the scaled stage. Because the design box is letterboxed (its aspect
// ratio rarely matches the device), this layer covers the margins so they show
// the game art instead of black bars. Individual screens can override it with
// <StageBackground/> (e.g. the battlefield art during combat).
const MENU_BACKGROUND_IMAGE =
  "radial-gradient(circle at 50% 10%, rgba(179, 137, 59, 0.20), transparent 34%), linear-gradient(135deg, rgba(5, 7, 5, 0.50), rgba(17, 16, 11, 0.48)), url('/menu-background.webp'), url('/menu-background.png')";

// Full-viewport host that paints the default background and hosts the portal
// content rendered by <StageBackground/>. Sits behind the scaled design box.
const backdropHostStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "#050706",
  backgroundImage: MENU_BACKGROUND_IMAGE,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
};

// Lets screens deep inside the scaled stage paint a full-screen background that
// escapes the design box's clipping/scaling, so it bleeds into the letterbox
// margins. The value is the DOM node owned by GameStage's backdrop host.
const StageBackdropContext = createContext<HTMLElement | null>(null);

/**
 * Renders a full-viewport background layer behind the whole stage, filling the
 * letterbox margins with the same art shown in the design box (no black bars,
 * no seam). Mount it from a screen; it portals out of the scaled/clipped box
 * into GameStage's backdrop host and unmounts cleanly when the screen leaves.
 */
export function StageBackground({
  color,
  image,
  size = "cover",
  position = "center",
}: {
  color?: string;
  image: string;
  size?: string;
  position?: string;
}) {
  const host = useContext(StageBackdropContext);
  if (!host) return null;
  return createPortal(
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: color,
        backgroundImage: image,
        backgroundSize: size,
        backgroundPosition: position,
        backgroundRepeat: "no-repeat",
      }}
    />,
    host
  );
}

const innerStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  transformOrigin: "center center",
  // Makes cqw/cqh inside resolve to the design box, not the real viewport.
  containerType: "size",
};

export function GameStage({ children }: { children: ReactNode }) {
  const [transform, setTransform] = useState<string>(
    "translate(-50%, -50%) scale(1)"
  );
  const [backdropNode, setBackdropNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    function update() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const portrait = vh > vw;

      if (portrait) {
        // Rotate the landscape design 90° so it fills a portrait screen.
        const scale = Math.min(vw / DESIGN_HEIGHT, vh / DESIGN_WIDTH);
        stageScale = scale;
        setStageRotation(90);
        setTransform(`translate(-50%, -50%) rotate(90deg) scale(${scale})`);
      } else {
        const scale = Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);
        stageScale = scale;
        setStageRotation(0);
        setTransform(`translate(-50%, -50%) scale(${scale})`);
      }
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return (
    <div style={outerStyle}>
      <div ref={setBackdropNode} style={backdropHostStyle} />
      <div style={{ ...innerStyle, transform }}>
        <StageBackdropContext.Provider value={backdropNode}>
          {children}
        </StageBackdropContext.Provider>
      </div>
    </div>
  );
}
