import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getNationFlagAsset } from "../assets/nationFlagAssets";
import { cards } from "../game/cards";
import { getHeadquartersDefinition } from "../game/headquarters";
import { getHeadquartersImageAsset } from "../game/headquartersImages";
import {
  RESEARCH_NATIONS,
  RESEARCH_TREES,
  type ResearchNation,
  type ResearchNode,
  type ResearchNodeStatus,
} from "../game/researchTrees";
import { getTankImage } from "../game/tankImages";
import { getCardClassVisual } from "../game/cardVisuals";
import { HandCardView } from "./HandCardView";

const STATUS_LABELS: Record<ResearchNodeStatus, string> = {
  unlocked: "Получено",
  researchable: "Доступно",
  locked: "Закрыто",
  planned: "Скоро",
};

const NATION_LABELS: Record<ResearchNation, string> = {
  germany: "Германия",
  ussr: "СССР",
  usa: "США",
};

function getNodeImage(node: ResearchNode) {
  if (node.headquartersId) {
    return getHeadquartersImageAsset(node.headquartersId) ?? "/panzer-shrek-icon.png";
  }

  if (node.cardId) {
    return getTankImage(node.cardId);
  }

  return "/panzer-shrek-icon.png";
}

function getNodeSubtitle(node: ResearchNode) {
  if (node.subtitle) return node.subtitle;
  if (!node.cardId) return node.type === "headquarters" ? "Штаб" : "Карта";

  const card = cards.find((item) => item.id === node.cardId);
  if (!card) return "Карта";

  return card.deploymentZone === "support"
    ? getCardClassVisual(card).label
    : card.class === "light"
      ? "Лёгкий танк"
      : card.class === "medium"
        ? "Средний танк"
        : card.class === "heavy"
          ? "Тяжёлый танк"
          : card.class === "td"
            ? "ПТ-САУ"
            : "САУ";
}

function ResearchNodeCard({
  node,
  onPreview,
}: {
  node: ResearchNode;
  onPreview: (event: MouseEvent, node: ResearchNode) => void;
}) {
  const locked = node.status === "locked" || node.status === "planned";
  const headquarters = node.type === "headquarters";

  return (
    <motion.div
      style={{
        ...styles.node,
        ...(headquarters ? styles.headquartersNode : {}),
        ...(locked ? styles.nodeLocked : {}),
        ...(node.status === "researchable" ? styles.nodeResearchable : {}),
        ...(node.status === "unlocked" ? styles.nodeUnlocked : {}),
      }}
      whileHover={node.status === "planned" ? undefined : { y: -4, scale: 1.025 }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
      aria-label={`${node.title}: ${STATUS_LABELS[node.status]}`}
      onContextMenu={(event) => onPreview(event, node)}
    >
      <div style={styles.nodeImageFrame}>
        <img
          src={getNodeImage(node)}
          alt=""
          draggable={false}
          style={styles.nodeImage}
        />
      </div>

      <div style={styles.nodeBody}>
        <strong style={styles.nodeTitle}>{node.title}</strong>
        <span style={styles.nodeSubtitle}>{getNodeSubtitle(node)}</span>
      </div>

      <div
        style={{
          ...styles.nodeFooter,
          ...(node.status === "unlocked" ? styles.nodeFooterUnlocked : {}),
          ...(node.status === "researchable" ? styles.nodeFooterResearchable : {}),
        }}
      >
        <span>{STATUS_LABELS[node.status]}</span>
        <span style={styles.nodeCosts}>
          {node.experienceCost ? <span>★ {node.experienceCost}</span> : null}
          {node.purchaseCost ? <span>● {node.purchaseCost}</span> : null}
        </span>
      </div>
    </motion.div>
  );
}

export function ResearchMenu({ onBack }: { onBack: () => void }) {
  const [selectedNation, setSelectedNation] = useState<ResearchNation>("germany");
  const [previewNode, setPreviewNode] = useState<ResearchNode | null>(null);
  const tree = RESEARCH_TREES[selectedNation];
  const previewCard = previewNode?.cardId
    ? cards.find((card) => card.id === previewNode.cardId) ?? null
    : null;
  const previewHeadquarters = previewNode?.headquartersId
    ? getHeadquartersDefinition(previewNode.headquartersId)
    : null;

  function openNodePreview(event: MouseEvent, node: ResearchNode) {
    event.preventDefault();
    event.stopPropagation();

    if (!node.cardId && !node.headquartersId) return;

    setPreviewNode(node);
  }

  function closeNodePreview() {
    setPreviewNode(null);
  }

  useEffect(() => {
    if (!previewNode) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNodePreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewNode]);

  return (
    <main style={styles.page}>
      <div style={styles.backgroundShade} />

      <header style={styles.topBar}>
        <div>
          <div style={styles.kicker}>Развитие армии</div>
          <h1 style={styles.title}>Исследования</h1>
          <p style={styles.subtitle}>
            Открывай карты и штабы, затем приобретай технику для своих колод
          </p>
        </div>

        <div style={styles.resources}>
          <div style={styles.resource}>
            <span style={styles.resourceIcon}>★</span>
            <span>
              <small style={styles.resourceLabel}>Опыт</small>
              <strong style={styles.resourceValue}>Скоро</strong>
            </span>
          </div>
          <div style={styles.resource}>
            <span style={styles.resourceIcon}>●</span>
            <span>
              <small style={styles.resourceLabel}>Снабжение</small>
              <strong style={styles.resourceValue}>Скоро</strong>
            </span>
          </div>
        </div>
      </header>

      <aside style={styles.nationsRail}>
        {RESEARCH_NATIONS.map((nation) => {
          const active = nation === selectedNation;
          const flag = getNationFlagAsset(nation);

          return (
            <button
              key={nation}
              type="button"
              style={{
                ...styles.nationButton,
                ...(active ? styles.nationButtonActive : {}),
              }}
              onClick={() => setSelectedNation(nation)}
              aria-pressed={active}
              aria-label={`Открыть исследования: ${NATION_LABELS[nation]}`}
              title={NATION_LABELS[nation]}
            >
              {flag ? (
                <img
                  src={flag}
                  alt=""
                  draggable={false}
                  style={styles.nationFlag}
                />
              ) : null}
              <span style={styles.nationCaption}>{NATION_LABELS[nation]}</span>
            </button>
          );
        })}
      </aside>

      <section style={styles.treePanel}>
        <div className="research-tree-scroll" style={styles.treeViewport}>
          <div style={styles.treeCanvas}>
            <div style={styles.starterArea}>
              <div style={styles.starterCaption}>Начало пути</div>
              <ResearchNodeCard
                node={tree.starterHeadquarters}
                onPreview={openNodePreview}
              />
            </div>
            <div style={styles.rootStem} />

            <div style={styles.branchesGrid}>
              <div style={styles.branchBus} />
              {tree.branches.map((branch) => (
                <div key={branch.id} style={styles.branchColumn}>
                  <div style={styles.branchDrop} />
                  <div style={styles.branchInfo}>
                    <strong style={styles.branchTitle}>{branch.shortTitle}</strong>
                    <span style={styles.branchDescription}>{branch.description}</span>
                  </div>

                  <div style={styles.branchNodes}>
                    {branch.nodes.map((node) => (
                      <div key={node.id} style={styles.nodeStep}>
                        <div style={styles.nodeConnector} />
                        <ResearchNodeCard node={node} onPreview={openNodePreview} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <button
        type="button"
        style={styles.backButton}
        onClick={onBack}
        aria-label="Назад"
        title="Назад"
      >
        ←
      </button>

      <AnimatePresence>
        {previewNode && (previewCard || previewNode.headquartersId) ? (
          <motion.div
            style={styles.cardPreviewOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={closeNodePreview}
            onContextMenu={(event) => {
              event.preventDefault();
              closeNodePreview();
            }}
          >
            <motion.div
              style={styles.cardPreviewPanel}
              initial={{ opacity: 0, scale: 0.84, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                style={styles.cardPreviewClose}
                onClick={closeNodePreview}
                aria-label="Закрыть просмотр карты"
              >
                ×
              </button>

              {previewCard ? (
                <HandCardView card={previewCard} displayMode="preview" />
              ) : previewHeadquarters ? (
                <HandCardView
                  headquartersId={previewHeadquarters.id}
                  headquarters={{
                    hp: previewHeadquarters.hp,
                    attack: previewHeadquarters.attack,
                    fuelGeneration: previewHeadquarters.fuelGeneration,
                  }}
                  displayMode="preview"
                />
              ) : null}

              <div style={styles.cardPreviewHint}>
                ПКМ по фону или Esc — закрыть
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    position: "relative",
    minHeight: "100vh",
    height: "100vh",
    overflow: "hidden",
    color: "#f2e4c2",
    backgroundImage:
      "linear-gradient(90deg, rgba(4, 6, 5, 0.98), rgba(12, 16, 13, 0.9) 44%, rgba(5, 7, 6, 0.96)), url('/menu-background.png')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },

  backgroundShade: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(circle at 52% 45%, rgba(127, 101, 46, 0.13), transparent 43%), linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.48))",
  },

  topBar: {
    position: "relative",
    zIndex: 3,
    height: 104,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    padding: "16px 32px 14px 122px",
    borderBottom: "1px solid rgba(205, 168, 85, 0.22)",
    background: "rgba(4, 6, 5, 0.68)",
    boxShadow: "0 12px 26px rgba(0,0,0,0.26)",
  },

  kicker: {
    color: "#bf9e57",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 3,
    textTransform: "uppercase",
  },

  title: {
    margin: "2px 0 0",
    color: "#f7e8b8",
    fontSize: 31,
    lineHeight: 1,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textShadow: "0 2px 10px rgba(0,0,0,0.9)",
  },

  subtitle: {
    margin: "6px 0 0",
    color: "rgba(239, 225, 191, 0.68)",
    fontSize: 12,
  },

  resources: {
    display: "flex",
    gap: 10,
  },

  resource: {
    minWidth: 148,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    border: "1px solid rgba(201, 169, 92, 0.28)",
    borderRadius: 4,
    background: "rgba(13, 16, 13, 0.8)",
  },

  resourceIcon: {
    color: "#d0ad57",
    fontSize: 20,
  },

  resourceLabel: {
    display: "block",
    color: "rgba(235, 219, 177, 0.55)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },

  resourceValue: {
    display: "block",
    marginTop: 2,
    color: "#f4dda0",
    fontSize: 13,
    letterSpacing: 0.4,
  },

  nationsRail: {
    position: "absolute",
    zIndex: 4,
    left: 0,
    top: 0,
    bottom: 0,
    width: 92,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "126px 10px 72px",
    borderRight: "1px solid rgba(205, 168, 85, 0.2)",
    background: "rgba(2, 3, 3, 0.78)",
    boxShadow: "10px 0 24px rgba(0,0,0,0.28)",
  },

  nationButton: {
    position: "relative",
    width: 72,
    height: 67,
    padding: 0,
    overflow: "hidden",
    border: "1px solid rgba(215, 185, 112, 0.22)",
    borderRadius: 3,
    background: "rgba(32, 35, 30, 0.92)",
    cursor: "pointer",
    filter: "grayscale(0.5) brightness(0.72)",
    transition: "filter 160ms ease, border-color 160ms ease, transform 160ms ease",
  },

  nationButtonActive: {
    borderColor: "rgba(243, 205, 108, 0.82)",
    filter: "none",
    transform: "translateX(5px)",
    boxShadow: "0 0 16px rgba(222, 176, 67, 0.24)",
  },

  nationFlag: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: 0.84,
  },

  nationCaption: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: 4,
    color: "#fff0bb",
    fontSize: 9,
    fontWeight: 1000,
    textAlign: "center",
    textShadow: "0 1px 4px rgba(0,0,0,0.95)",
    textTransform: "uppercase",
  },

  treePanel: {
    position: "absolute",
    zIndex: 2,
    left: 92,
    right: 0,
    top: 104,
    bottom: 0,
  },

  treeViewport: {
    width: "100%",
    height: "100%",
    overflowX: "auto",
    overflowY: "scroll",
    overscrollBehavior: "contain",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(204, 165, 77, 0.72) rgba(7, 9, 8, 0.68)",
    WebkitOverflowScrolling: "touch",
  },

  treeCanvas: {
    position: "relative",
    minWidth: 1140,
    minHeight: 1250,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "18px 34px 74px",
    boxSizing: "border-box",
  },

  starterArea: {
    position: "relative",
    zIndex: 4,
    display: "grid",
    justifyItems: "center",
    gap: 8,
    padding: "10px 12px 12px",
    border: "1px solid rgba(210, 175, 91, 0.22)",
    borderRadius: 4,
    background: "rgba(10, 13, 11, 0.82)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.28)",
  },

  starterCaption: {
    color: "rgba(239, 213, 147, 0.72)",
    fontSize: 10,
    fontWeight: 1000,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },

  rootStem: {
    width: 1,
    height: 31,
    background: "rgba(207, 165, 77, 0.58)",
  },

  branchesGrid: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "repeat(4, 226px)",
    alignItems: "start",
    gap: 38,
    paddingTop: 22,
  },

  branchBus: {
    position: "absolute",
    left: 113,
    right: 113,
    top: 0,
    height: 1,
    background: "rgba(207, 165, 77, 0.58)",
  },

  branchColumn: {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    alignContent: "start",
    gap: 14,
  },

  branchDrop: {
    position: "absolute",
    left: "50%",
    top: -22,
    width: 1,
    height: 22,
    background: "rgba(207, 165, 77, 0.58)",
  },

  branchInfo: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gap: 4,
    width: 210,
    minHeight: 60,
    padding: "9px 10px",
    borderTop: "2px solid rgba(208, 166, 71, 0.58)",
    background: "linear-gradient(180deg, rgba(24, 27, 22, 0.96), rgba(13, 16, 13, 0.72))",
  },

  branchTitle: {
    color: "#e9cf8c",
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },

  branchDescription: {
    color: "rgba(231, 218, 184, 0.52)",
    fontSize: 9,
    lineHeight: 1.25,
  },

  branchNodes: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    justifyItems: "center",
    gap: 22,
  },

  nodeStep: {
    position: "relative",
    flex: "0 0 auto",
  },

  nodeConnector: {
    position: "absolute",
    left: "50%",
    bottom: "100%",
    width: 1,
    height: 22,
    background: "rgba(203, 164, 79, 0.46)",
  },

  node: {
    position: "relative",
    width: 138,
    display: "grid",
    gridTemplateRows: "auto minmax(37px, auto) 23px",
    overflow: "hidden",
    border: "1px solid rgba(207, 176, 104, 0.42)",
    borderRadius: 3,
    background: "linear-gradient(180deg, rgba(36, 39, 32, 0.98), rgba(14, 17, 14, 0.98))",
    boxShadow: "0 8px 18px rgba(0,0,0,0.38)",
  },

  headquartersNode: {
    width: 152,
    borderColor: "rgba(232, 197, 109, 0.62)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.45), inset 0 0 16px rgba(213, 164, 61, 0.08)",
  },

  nodeLocked: {
    filter: "grayscale(0.74) brightness(0.58)",
  },

  nodeResearchable: {
    borderColor: "rgba(239, 194, 79, 0.88)",
    boxShadow: "0 0 16px rgba(214, 161, 52, 0.28), 0 8px 18px rgba(0,0,0,0.42)",
  },

  nodeUnlocked: {
    borderColor: "rgba(130, 187, 101, 0.8)",
  },

  nodeImageFrame: {
    position: "relative",
    aspectRatio: "1 / 1",
    overflow: "hidden",
    borderBottom: "1px solid rgba(211, 177, 94, 0.22)",
    background: "rgba(4, 5, 4, 0.9)",
  },

  nodeImage: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
    objectPosition: "center",
    padding: 4,
    opacity: 0.92,
  },

  nodeBody: {
    minWidth: 0,
    display: "grid",
    alignContent: "center",
    gap: 2,
    padding: "3px 6px",
  },

  nodeTitle: {
    overflow: "hidden",
    color: "#f2dfaa",
    fontSize: 10,
    lineHeight: 1.05,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  nodeSubtitle: {
    overflow: "hidden",
    color: "rgba(236, 218, 175, 0.56)",
    fontSize: 8,
    lineHeight: 1,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  nodeFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    padding: "0 6px",
    borderTop: "1px solid rgba(208, 175, 96, 0.18)",
    color: "rgba(233, 213, 161, 0.7)",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  nodeFooterUnlocked: {
    color: "#a8df88",
  },

  nodeFooterResearchable: {
    color: "#f3cc6e",
  },

  nodeCosts: {
    display: "flex",
    gap: 4,
    fontSize: 7,
  },

  backButton: {
    position: "absolute",
    zIndex: 6,
    left: 20,
    bottom: 18,
    width: 48,
    height: 48,
    padding: 0,
    border: "1px solid rgba(220, 184, 96, 0.48)",
    borderRadius: 4,
    background: "linear-gradient(180deg, rgba(74, 58, 34, 0.96), rgba(42, 32, 19, 0.96))",
    color: "#f8e3ae",
    cursor: "pointer",
    fontSize: 27,
    fontWeight: 1000,
    lineHeight: "45px",
    textAlign: "center",
    boxShadow: "0 10px 22px rgba(0,0,0,0.3)",
  },

  cardPreviewOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background:
      "radial-gradient(circle at center, rgba(0,0,0,0.58), rgba(0,0,0,0.86) 74%)",
    backdropFilter: "blur(6px)",
  },

  cardPreviewPanel: {
    position: "relative",
    width: 390,
    maxWidth: "82vw",
    maxHeight: "92vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 28px 58px rgba(0,0,0,0.78))",
  },

  cardPreviewClose: {
    position: "absolute",
    right: -12,
    top: -12,
    zIndex: 10,
    width: 34,
    height: 34,
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    background:
      "linear-gradient(180deg, rgba(38,40,40,0.96), rgba(5,6,6,0.96))",
    color: "#f3ead0",
    cursor: "pointer",
    fontSize: 24,
    fontWeight: 800,
    lineHeight: "30px",
    boxShadow: "0 10px 22px rgba(0,0,0,0.58)",
  },

  cardPreviewHint: {
    position: "absolute",
    left: "50%",
    bottom: -28,
    transform: "translateX(-50%)",
    color: "rgba(238,242,243,0.68)",
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: "nowrap",
    textShadow: "0 2px 8px rgba(0,0,0,0.85)",
    pointerEvents: "none",
  },
};
