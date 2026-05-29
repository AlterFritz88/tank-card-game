import type React from "react";
import cardBackImage from "../assets/cards/card-back.png";

type DeckStackProps = {
  cardCount: number;
};

export function DeckStack({ cardCount }: DeckStackProps) {
  if (cardCount <= 0) {
    return <div style={styles.emptyDeckStack} />;
  }

  const visibleCardsCount = Math.min(cardCount, 3);

  return (
    <div style={styles.deckStack}>
      {Array.from({ length: visibleCardsCount }).map((_, index) => (
        <div
          key={`deck-card-${index}`}
          style={{
            ...styles.deckStackCard,
            left: index * 5,
            top: index * -4,
            zIndex: index + 1,
            backgroundImage: `url(${cardBackImage})`,
          }}
        />
      ))}

      <strong style={styles.deckCountBadge}>{cardCount}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  deckStack: {
    position: "relative",
    width: 114,
    height: 146,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  deckStackCard: {
    position: "absolute",
    width: 104,
    height: 138,
    borderRadius: 12,
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    border: "none",
    boxShadow: "0 14px 34px rgba(0,0,0,0.52)",
    pointerEvents: "none",
  },

  deckCountBadge: {
    position: "absolute",
    left: 9,
    bottom: 8,
    zIndex: 10,
    display: "block",
    padding: 0,
    color: "#f6d27a",
    fontFamily:
      "'Rajdhani', 'Arial Narrow', Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: 22,
    lineHeight: 1,
    fontWeight: 900,
    textShadow:
      "0 2px 0 rgba(0,0,0,0.95), 0 0 7px rgba(0,0,0,0.95), 0 0 12px rgba(246,210,122,0.45)",
    pointerEvents: "none",
  },

  emptyDeckStack: {
    position: "relative",
    width: 104,
    height: 138,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
};
