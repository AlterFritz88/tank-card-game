import {
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

type FitTextProps = {
  children: ReactNode;
  /** Starting (largest) font size in pixels. */
  maxFontSize: number;
  /** The text never shrinks below this size; overflow then ellipsizes. */
  minFontSize: number;
  /** Disable ellipsis and keep shrinking harder before allowing clipping. */
  ellipsis?: boolean;
  style?: CSSProperties;
  title?: string;
};

/**
 * Single-line text that shrinks its font size until the content fits the
 * available width. Measures and adjusts the DOM directly before paint, so it
 * works with any font, language and parent width (hand cards and scaled
 * previews alike) without cascading re-renders.
 *
 * Re-fits whenever the container resizes (e.g. the scaled card-preview overlay)
 * and once web fonts finish loading — a single measurement at mount can run
 * against a fallback font or a not-yet-settled width, which would otherwise
 * leave the text stuck at the minimum size with a stray ellipsis.
 */
export function FitText({
  children,
  maxFontSize,
  minFontSize,
  ellipsis = true,
  style,
  title,
}: FitTextProps) {
  const elementRef = useRef<HTMLElement>(null);
  const text = typeof children === "string" ? children : String(children);

  const fit = useCallback(() => {
    const element = elementRef.current;

    if (!element) return;

    let fontSize = maxFontSize;
    element.style.fontSize = `${fontSize}px`;

    while (
      fontSize > minFontSize &&
      element.scrollWidth > element.clientWidth
    ) {
      fontSize -= 0.5;
      element.style.fontSize = `${fontSize}px`;
    }
  }, [maxFontSize, minFontSize]);

  useLayoutEffect(() => {
    fit();

    const element = elementRef.current;

    if (!element) return;

    // Re-fit when the available width changes (the preview overlay scales the
    // card up after mount, hand cards reflow, etc.). Changing our own font size
    // can't grow clientWidth (overflow is hidden), so this never loops.
    const observer = new ResizeObserver(() => fit());
    observer.observe(element);

    // The first measurement may use a fallback font; re-fit once the real font
    // is ready so the title isn't permanently shrunk to its fallback metrics.
    let cancelled = false;

    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) fit();
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [fit, text]);

  return (
    <strong
      ref={elementRef}
      title={title}
      style={{
        display: "block",
        maxWidth: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        ...style,
        textOverflow: ellipsis ? "ellipsis" : "clip",
        fontSize: maxFontSize,
      }}
    >
      {children}
    </strong>
  );
}
