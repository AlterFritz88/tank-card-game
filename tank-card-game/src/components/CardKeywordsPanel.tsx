import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import type { CardKeyword } from "../game/cardKeywords";

/**
 * Glossary column rendered to the left of an enlarged card. It is absolutely
 * positioned against the (relatively positioned) card panel so the card itself
 * stays centred while the hints hang off to its left — the same format is used
 * in battle, the headquarters menu, the research tree and the deck builder.
 */
export function CardKeywordsPanel({ keywords }: { keywords: CardKeyword[] }) {
  if (keywords.length === 0) return null;

  return (
    <div style={styles.anchor}>
      <motion.div
        style={styles.panel}
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {keywords.map((keyword, index) => (
          <div key={`${keyword.id}-${index}`} style={styles.entry}>
            <div style={styles.title}>{keyword.title}</div>
            <p style={styles.body}>{keyword.body}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  // Spans the full height of the card panel and centres the hints vertically,
  // sitting entirely to the left of the card (right edge meets the card's left
  // edge). Transparent to clicks so the empty space still closes the overlay.
  anchor: {
    position: "absolute",
    right: "100%",
    top: 0,
    bottom: 0,
    marginRight: 22,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    pointerEvents: "none",
  },

  panel: {
    width: 340,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: "22px 22px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(28,30,30,0.95), rgba(12,13,13,0.95))",
    boxShadow: "0 24px 52px rgba(0,0,0,0.62)",
    color: "#eef2f3",
    fontFamily: "var(--font-body)",
    pointerEvents: "auto",
  },

  entry: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  title: {
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 0.6,
    color: "#f3ead0",
  },

  body: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.36,
    color: "rgba(226,232,233,0.86)",
  },
};
