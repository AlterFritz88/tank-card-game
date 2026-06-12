import {
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
  style?: CSSProperties;
  title?: string;
};

/**
 * Single-line text that shrinks its font size until the content fits the
 * available width. Measures and adjusts the DOM directly before paint, so it
 * works with any font, language and parent width (hand cards and scaled
 * previews alike) without cascading re-renders.
 */
export function FitText({
  children,
  maxFontSize,
  minFontSize,
  style,
  title,
}: FitTextProps) {
  const elementRef = useRef<HTMLElement>(null);
  const text = typeof children === "string" ? children : String(children);

  useLayoutEffect(() => {
    const element = elementRef.current;

    if (!element) return;

    let fontSize = maxFontSize;
    element.style.fontSize = `${fontSize}px`;

    while (fontSize > minFontSize && element.scrollWidth > element.clientWidth) {
      fontSize -= 1;
      element.style.fontSize = `${fontSize}px`;
    }
  }, [text, maxFontSize, minFontSize]);

  return (
    <strong
      ref={elementRef}
      title={title}
      style={{
        display: "block",
        maxWidth: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        ...style,
        fontSize: maxFontSize,
      }}
    >
      {children}
    </strong>
  );
}
