import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import buttonImage from "../assets/button.png";
import cardBackImage from "../assets/cards/card-back.png";
import experienceIcon from "../assets/icons/expa.png";
import goldTracksIcon from "../assets/icons/gold_tracks_transparent.png";
import silverTracksIcon from "../assets/icons/silver-tracks.png";
import { getNationFlagAsset } from "../assets/nationFlagAssets";
import { cards } from "../game/cards";
import { getHeadquartersDefinition } from "../game/headquarters";
import { getHeadquartersImageAsset } from "../game/headquartersImages";
import {
  RESEARCH_NATIONS,
  RESEARCH_TREES,
  type ResearchNation,
  type ResearchNode,
} from "../game/researchTrees";
import { getTankImage } from "../game/tankImages";
import type { HeadquartersId } from "../game/types";
import { CARD_COPY_LIMIT } from "../game/customDecks";
import {
  canSpendResearchExperience,
  loadPlayerProgress,
  purchaseCardCopy,
  purchaseHeadquarters,
  researchCard,
  researchHeadquarters,
  type PlayerProgress,
} from "../game/playerProgress";
import { HandCardView } from "./HandCardView";

const NATION_LABELS: Record<ResearchNation, string> = {
  germany: "Германия",
  ussr: "СССР",
  usa: "США",
};

type ResearchNodeStage =
  | "owned"
  | "researched"
  | "researchable"
  | "locked"
  | "planned";

type ResearchNodeView = ResearchNode & {
  stage: ResearchNodeStage;
  statusLabel: string;
  actionKind?: "owned" | "research" | "purchase" | "experience";
  costIcon?: string;
  costValue?: number;
  costInsufficient?: boolean;
  headquartersXp?: number;
  ownedCopies?: number;
  requiredPreviousTitle?: string;
};

type ResearchFeedback = {
  id: number;
  text: string;
};

type ResearchCelebration = {
  id: number;
  label: "Исследовано" | "Куплено";
  node: ResearchNode;
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function isNodeResearched(node: ResearchNode, progress: PlayerProgress): boolean {
  if (node.cardId) return progress.researchedCardIds.includes(node.cardId);
  if (node.headquartersId) {
    return progress.researchedHeadquartersIds.includes(node.headquartersId);
  }

  return false;
}

function isNodeOwned(node: ResearchNode, progress: PlayerProgress): boolean {
  if (node.cardId) return (progress.ownedCardCopies[node.cardId] ?? 0) > 0;
  if (node.headquartersId) {
    return progress.unlockedHeadquartersIds.includes(node.headquartersId);
  }

  return false;
}

function createNodeView({
  node,
  progress,
  sourceHeadquartersId,
  previousComplete,
  previousNodeTitle,
}: {
  node: ResearchNode;
  progress: PlayerProgress;
  sourceHeadquartersId: HeadquartersId;
  previousComplete: boolean;
  previousNodeTitle?: string;
}): ResearchNodeView {
  if (node.status === "planned") {
    return {
      ...node,
      stage: "planned",
      statusLabel: "Скоро",
    };
  }

  if (isNodeOwned(node, progress)) {
    const ownedCopies = node.cardId ? progress.ownedCardCopies[node.cardId] ?? 0 : 1;
    const headquartersXp = node.headquartersId
      ? progress.headquartersXp[node.headquartersId] ?? 0
      : undefined;

    return {
      ...node,
      stage: "owned",
      statusLabel: node.cardId ? `Куплено x${ownedCopies}` : "Опыт",
      actionKind: node.headquartersId ? "experience" : "owned",
      ownedCopies,
      headquartersXp,
      costIcon:
        node.cardId && ownedCopies < CARD_COPY_LIMIT && node.purchaseCost
          ? silverTracksIcon
          : node.headquartersId
            ? experienceIcon
            : undefined,
      costValue:
        node.cardId && ownedCopies < CARD_COPY_LIMIT
          ? node.purchaseCost
          : headquartersXp,
      costInsufficient:
        Boolean(node.cardId && ownedCopies < CARD_COPY_LIMIT && node.purchaseCost) &&
        progress.ironTracks < (node.purchaseCost ?? 0),
    };
  }

  if (isNodeResearched(node, progress)) {
    return {
      ...node,
      stage: "researched",
      statusLabel: "Купить",
      actionKind: "purchase",
      ownedCopies: node.cardId ? progress.ownedCardCopies[node.cardId] ?? 0 : undefined,
      costIcon: silverTracksIcon,
      costValue: node.purchaseCost,
      costInsufficient: progress.ironTracks < (node.purchaseCost ?? 0),
    };
  }

  if (!previousComplete) {
    return {
      ...node,
      stage: "locked",
      statusLabel: previousNodeTitle ? "Нужен узел" : "Закрыто",
      requiredPreviousTitle: previousNodeTitle,
    };
  }

  const experienceCost = node.experienceCost ?? 0;
  const canResearch = canSpendResearchExperience(
    progress,
    sourceHeadquartersId,
    experienceCost
  );

  return {
    ...node,
    stage: canResearch ? "researchable" : "locked",
    statusLabel: canResearch ? "Исследовать" : "Не хватает опыта",
    actionKind: "research",
    costIcon: experienceCost ? experienceIcon : undefined,
    costValue: experienceCost || undefined,
    costInsufficient: !canResearch,
  };
}

function createBranchNodeViews({
  nodes,
  progress,
  sourceHeadquartersId,
}: {
  nodes: ResearchNode[];
  progress: PlayerProgress;
  sourceHeadquartersId: HeadquartersId;
}): ResearchNodeView[] {
  let previousComplete = true;
  let previousNodeTitle: string | undefined;

  return nodes.map((node) => {
    const view = createNodeView({
      node,
      progress,
      sourceHeadquartersId,
      previousComplete,
      previousNodeTitle,
    });
    previousComplete =
      view.stage === "owned" ||
      view.stage === "researched" ||
      node.status === "unlocked";
    previousNodeTitle = node.title;

    return view;
  });
}

function ResearchCostBadge({ icon, value }: { icon: string; value: number }) {
  return (
    <span style={styles.nodeCostBadge}>
      <img src={icon} alt="" draggable={false} style={styles.nodeCostIcon} />
      {value}
    </span>
  );
}

function ResourceBadge({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div style={styles.resource}>
      <img src={icon} alt="" draggable={false} style={styles.resourceIcon} />
      <span>
        <small style={styles.resourceLabel}>{label}</small>
        <strong style={styles.resourceValue}>{value}</strong>
      </span>
    </div>
  );
}

function ResearchNodeHandCard({ node }: { node: ResearchNode }) {
  const card = node.cardId
    ? cards.find((item) => item.id === node.cardId) ?? null
    : null;
  const headquarters = node.headquartersId
    ? getHeadquartersDefinition(node.headquartersId)
    : null;

  if (card) {
    return <HandCardView card={card} ownerId="player" />;
  }

  if (headquarters) {
    return (
      <HandCardView
        headquartersId={headquarters.id}
        headquarters={{
          hp: headquarters.hp,
          attack: headquarters.attack,
          fuelGeneration: headquarters.fuelGeneration,
        }}
        ownerId="player"
      />
    );
  }

  return (
    <img
      src={getNodeImage(node)}
      alt=""
      draggable={false}
      style={styles.nodeFallbackImage}
    />
  );
}

function ResearchNodeCard({
  node,
  onPreview,
  onAction,
}: {
  node: ResearchNodeView;
  onPreview: (event: MouseEvent, node: ResearchNode) => void;
  onAction?: (node: ResearchNodeView) => void;
}) {
  const locked = node.stage === "locked" || node.stage === "planned";
  const actionable =
    node.stage === "researchable" ||
    node.stage === "researched" ||
    (node.stage === "owned" &&
      Boolean(node.cardId && node.costValue && node.costValue > 0));
  const headquarters = node.type === "headquarters";
  const ownedCopies = Math.min(CARD_COPY_LIMIT, node.ownedCopies ?? 0);

  return (
    <motion.div
      style={{
        ...styles.node,
        ...(headquarters ? styles.headquartersNode : {}),
        ...(locked ? styles.nodeLocked : {}),
        ...(actionable ? styles.nodeResearchable : {}),
        ...(node.stage === "owned" ? styles.nodeUnlocked : {}),
      }}
      whileHover={node.stage === "planned" ? undefined : { y: -4, scale: 1.025 }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
      aria-label={`${node.title}: ${node.statusLabel}`}
      onContextMenu={(event) => onPreview(event, node)}
      onClick={() => onAction?.(node)}
    >
      <div style={styles.nodeCardArea}>
        {node.cardId && ownedCopies > 0 ? (
          <div style={styles.ownedCardStack}>
            {Array.from({ length: ownedCopies }, (_, index) => {
              const reverseIndex = ownedCopies - index - 1;

              return (
                <div
                  key={`${node.id}-copy-${index}`}
                  style={{
                    ...styles.ownedCardStackLayer,
                    transform: `translate(${reverseIndex * 11}px, ${
                      reverseIndex * 4
                    }px)`,
                    zIndex: index + 1,
                    opacity: index === ownedCopies - 1 ? 1 : 0.72,
                  }}
                >
                  <ResearchNodeHandCard node={node} />
                </div>
              );
            })}
          </div>
        ) : (
          <ResearchNodeHandCard node={node} />
        )}
      </div>

      <div
        style={{
          ...styles.nodeCostBox,
          ...(node.stage === "owned" ? styles.nodeFooterUnlocked : {}),
          ...(actionable ? styles.nodeFooterResearchable : {}),
          ...(node.actionKind === "research" ? styles.nodeCostBoxResearch : {}),
          ...(node.actionKind === "purchase" ? styles.nodeCostBoxPurchase : {}),
          ...(node.actionKind === "experience" ? styles.nodeCostBoxExperience : {}),
          ...(node.costInsufficient ? styles.nodeCostBoxInsufficient : {}),
        }}
      >
        <span>{node.statusLabel}</span>
        <span style={styles.nodeCosts}>
          {node.costIcon && node.costValue !== undefined ? (
            <ResearchCostBadge icon={node.costIcon} value={node.costValue} />
          ) : null}
        </span>
      </div>
    </motion.div>
  );
}

function ResearchCelebrationOverlay({
  celebration,
  onClose,
}: {
  celebration: ResearchCelebration;
  onClose: () => void;
}) {
  const card = celebration.node.cardId
    ? cards.find((item) => item.id === celebration.node.cardId) ?? null
    : null;
  const headquarters = celebration.node.headquartersId
    ? getHeadquartersDefinition(celebration.node.headquartersId)
    : null;

  return (
    <motion.div
      style={styles.researchCelebrationOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={onClose}
    >
      <motion.div
        style={styles.researchCelebrationCardWrap}
        onMouseDown={(event) => event.stopPropagation()}
        initial={{ y: 30, scale: 0.72, rotateY: -180 }}
        animate={{
          y: 0,
          scale: [0.72, 1.1, 1],
          rotateY: [-180, -34, 0],
        }}
        exit={{ y: -20, scale: 0.82, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <div
          aria-hidden="true"
          style={{
            ...styles.researchCelebrationBack,
            backgroundImage: `url(${cardBackImage})`,
          }}
        />
        {card ? (
          <HandCardView card={card} displayMode="preview" />
        ) : headquarters ? (
          <HandCardView
            headquartersId={headquarters.id}
            headquarters={{
              hp: headquarters.hp,
              attack: headquarters.attack,
              fuelGeneration: headquarters.fuelGeneration,
            }}
            displayMode="preview"
          />
        ) : null}
        <motion.div
          style={styles.researchCelebrationLabel}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 0.22, duration: 0.24 }}
        >
          {celebration.label}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function ResearchMenu({ onBack }: { onBack: () => void }) {
  const [selectedNation, setSelectedNation] = useState<ResearchNation>("germany");
  const [previewNode, setPreviewNode] = useState<ResearchNode | null>(null);
  const [progress, setProgress] = useState(() => loadPlayerProgress());
  const [feedback, setFeedback] = useState<ResearchFeedback | null>(null);
  const [celebration, setCelebration] = useState<ResearchCelebration | null>(null);
  const tree = RESEARCH_TREES[selectedNation];
  const sourceHeadquartersId = tree.starterHeadquarters.headquartersId;
  const starterNodeView: ResearchNodeView = {
    ...tree.starterHeadquarters,
    stage: "owned",
    statusLabel: "Опыт",
    actionKind: "experience",
    headquartersXp: sourceHeadquartersId
      ? progress.headquartersXp[sourceHeadquartersId] ?? 0
      : 0,
    ownedCopies: 1,
    costIcon: experienceIcon,
    costValue: sourceHeadquartersId
      ? progress.headquartersXp[sourceHeadquartersId] ?? 0
      : 0,
  };
  const branchNodeViews = sourceHeadquartersId
    ? tree.branches.map((branch) => ({
        branch,
        nodes: createBranchNodeViews({
          nodes: branch.nodes,
          progress,
          sourceHeadquartersId,
        }),
      }))
    : [];
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

  function showFeedback(text: string) {
    setFeedback({
      id: Date.now(),
      text,
    });
  }

  function showCelebration(label: ResearchCelebration["label"], node: ResearchNode) {
    setCelebration({
      id: Date.now(),
      label,
      node,
    });
  }

  function getResearchShortage(cost: number) {
    const headquartersXp = sourceHeadquartersId
      ? progress.headquartersXp[sourceHeadquartersId] ?? 0
      : 0;
    const availableExperience = headquartersXp + progress.freeXp;
    return Math.max(0, cost - availableExperience);
  }

  function handleNodeAction(node: ResearchNodeView) {
    if (!sourceHeadquartersId) return;

    let nextProgress: PlayerProgress | null = null;
    let celebrationLabel: ResearchCelebration["label"] | null = null;

    if (node.stage === "planned") {
      showFeedback("Эта ветка пока недоступна");
      return;
    }

    if (node.stage === "locked") {
      const experienceCost = node.experienceCost ?? 0;

      if (node.requiredPreviousTitle) {
        showFeedback(`Сначала исследуйте: ${node.requiredPreviousTitle}`);
        return;
      }

      if (experienceCost > 0 && node.statusLabel === "Не хватает опыта") {
        showFeedback(
          `Не хватает опыта: ${formatNumber(getResearchShortage(experienceCost))}`
        );
      } else {
        showFeedback("Сначала исследуйте предыдущий узел ветки");
      }
      return;
    }

    if (node.stage === "researchable") {
      const experienceCost = node.experienceCost ?? 0;

      if (getResearchShortage(experienceCost) > 0) {
        showFeedback(
          `Не хватает опыта: ${formatNumber(getResearchShortage(experienceCost))}`
        );
        return;
      }

      nextProgress = node.cardId
        ? researchCard(node.cardId, sourceHeadquartersId, experienceCost)
        : node.headquartersId
          ? researchHeadquarters(node.headquartersId, sourceHeadquartersId, experienceCost)
          : null;
      celebrationLabel = "Исследовано";
    } else if (
      (node.stage === "researched" || node.stage === "owned") &&
      node.cardId
    ) {
      const purchaseCost = node.purchaseCost ?? 0;

      if ((progress.ownedCardCopies[node.cardId] ?? 0) >= CARD_COPY_LIMIT) {
        showFeedback("Куплены все доступные копии");
        return;
      }

      if (progress.ironTracks < purchaseCost) {
        showFeedback(
          `Не хватает железных траков: ${formatNumber(
            purchaseCost - progress.ironTracks
          )}`
        );
        return;
      }

      nextProgress = purchaseCardCopy(node.cardId, purchaseCost);
      celebrationLabel = "Куплено";
    } else if (node.stage === "researched" && node.headquartersId) {
      const purchaseCost = node.purchaseCost ?? 0;

      if (progress.ironTracks < purchaseCost) {
        showFeedback(
          `Не хватает железных траков: ${formatNumber(
            purchaseCost - progress.ironTracks
          )}`
        );
        return;
      }

      nextProgress = purchaseHeadquarters(node.headquartersId, purchaseCost);
      celebrationLabel = "Куплено";
    }

    if (nextProgress) {
      setProgress(nextProgress);
      if (celebrationLabel) {
        showCelebration(celebrationLabel, node);
      }
    }
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

  useEffect(() => {
    if (!feedback) return;

    const timeoutId = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

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
          <ResourceBadge
            icon={experienceIcon}
            label="Свободный опыт"
            value={formatNumber(progress.freeXp)}
          />
          <ResourceBadge
            icon={silverTracksIcon}
            label="Железные траки"
            value={formatNumber(progress.ironTracks)}
          />
          <ResourceBadge
            icon={goldTracksIcon}
            label="Золотые траки"
            value={formatNumber(progress.goldTracks)}
          />
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
                node={starterNodeView}
                onPreview={openNodePreview}
                onAction={handleNodeAction}
              />
            </div>
            <div style={styles.rootStem} />

            <div style={styles.branchesGrid}>
              <div style={styles.branchBus} />
              {branchNodeViews.map(({ branch, nodes }) => (
                <div key={branch.id} style={styles.branchColumn}>
                  <div style={styles.branchDrop} />
                  <div style={styles.branchInfo}>
                    <strong style={styles.branchTitle}>{branch.shortTitle}</strong>
                    <span style={styles.branchDescription}>{branch.description}</span>
                  </div>

                  <div style={styles.branchNodes}>
                    {nodes.map((node) => (
                      <div key={node.id} style={styles.nodeStep}>
                        <div style={styles.nodeConnector} />
                        <ResearchNodeCard
                          node={node}
                          onPreview={openNodePreview}
                          onAction={handleNodeAction}
                        />
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
        {feedback ? (
          <motion.div
            key={feedback.id}
            style={styles.feedbackToast}
            initial={{ opacity: 0, x: "-50%", y: -12, scale: 0.96 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", y: -10, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            {feedback.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {celebration ? (
          <ResearchCelebrationOverlay
            key={celebration.id}
            celebration={celebration}
            onClose={() => setCelebration(null)}
          />
        ) : null}
      </AnimatePresence>

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
    minWidth: 136,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 11px",
    border: "1px solid rgba(201, 169, 92, 0.28)",
    borderRadius: 4,
    background: "rgba(13, 16, 13, 0.8)",
  },

  resourceIcon: {
    width: 28,
    height: 28,
    objectFit: "contain",
    filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.72))",
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
    minWidth: 1260,
    minHeight: 1800,
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
    padding: "0 12px 12px",
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
    gridTemplateColumns: "repeat(4, 258px)",
    alignItems: "start",
    gap: 38,
    paddingTop: 22,
  },

  branchBus: {
    position: "absolute",
    left: 129,
    right: 129,
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
    gap: 28,
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
    width: 175,
    display: "grid",
    gridTemplateRows: "auto 30px",
    gap: 6,
    overflow: "visible",
    border: "none",
    borderRadius: 0,
    background: "transparent",
    boxShadow: "none",
    cursor: "pointer",
  },

  headquartersNode: {
    width: 175,
  },

  nodeLocked: {
    filter: "grayscale(0.74) brightness(0.58)",
  },

  nodeResearchable: {
    filter:
      "drop-shadow(0 0 12px rgba(214, 161, 52, 0.24)) drop-shadow(0 8px 18px rgba(0,0,0,0.42))",
  },

  nodeUnlocked: {
    filter:
      "drop-shadow(0 0 10px rgba(130, 187, 101, 0.18)) drop-shadow(0 8px 18px rgba(0,0,0,0.36))",
  },

  nodeCardArea: {
    position: "relative",
    width: "100%",
    aspectRatio: "1051 / 1496",
    overflow: "visible",
  },

  nodeFallbackImage: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "contain",
    objectPosition: "center",
    padding: 4,
    opacity: 0.92,
  },

  ownedCardStack: {
    position: "absolute",
    inset: 0,
  },

  ownedCardStackLayer: {
    position: "absolute",
    inset: 0,
    transformOrigin: "center bottom",
  },

  nodeCostBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 36,
    padding: "0 9px",
    border: "1px solid rgba(208, 175, 96, 0.24)",
    color: "rgba(233, 213, 161, 0.7)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    background: "rgba(8, 10, 9, 0.78)",
    boxShadow: "0 7px 14px rgba(0,0,0,0.34)",
  },

  nodeCostBoxResearch: {
    borderColor: "rgba(232, 188, 84, 0.46)",
    color: "#f3cc6e",
    background:
      "linear-gradient(180deg, rgba(45, 34, 13, 0.88), rgba(8, 10, 9, 0.82))",
  },

  nodeCostBoxPurchase: {
    borderColor: "rgba(190, 198, 202, 0.34)",
    color: "#d9e0e2",
    background:
      "linear-gradient(180deg, rgba(35, 40, 40, 0.84), rgba(8, 10, 9, 0.82))",
  },

  nodeCostBoxExperience: {
    borderColor: "rgba(120, 180, 95, 0.34)",
    color: "#a8df88",
    background:
      "linear-gradient(180deg, rgba(23, 44, 20, 0.78), rgba(8, 10, 9, 0.82))",
  },

  nodeCostBoxInsufficient: {
    borderColor: "rgba(212, 70, 55, 0.52)",
    color: "#ff695f",
  },

  nodeFooterUnlocked: {
    color: "#a8df88",
  },

  nodeFooterResearchable: {
    color: "#f3cc6e",
  },

  nodeCosts: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
  },

  nodeCostBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    whiteSpace: "nowrap",
  },

  nodeCostIcon: {
    width: 18,
    height: 18,
    objectFit: "contain",
    filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.78))",
  },

  backButton: {
    position: "absolute",
    zIndex: 6,
    left: 20,
    bottom: 18,
    width: 58,
    height: 46,
    padding: 0,
    border: "none",
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `url(${buttonImage})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 25,
    fontWeight: 1000,
    lineHeight: "43px",
    textAlign: "center",
    textShadow: "0 2px 0 rgba(0,0,0,0.84), 0 0 10px rgba(255,236,178,0.2)",
    boxShadow: "none",
  },

  feedbackToast: {
    position: "fixed",
    left: "50%",
    top: 126,
    zIndex: 9500,
    maxWidth: "min(520px, calc(100vw - 32px))",
    padding: "12px 18px",
    color: "#ffe4ad",
    fontSize: 15,
    fontWeight: 1000,
    letterSpacing: 0.4,
    textAlign: "center",
    textTransform: "uppercase",
    background:
      "linear-gradient(180deg, rgba(71, 34, 24, 0.96), rgba(18, 12, 9, 0.96))",
    border: "1px solid rgba(242, 176, 82, 0.42)",
    boxShadow: "0 18px 38px rgba(0,0,0,0.58), 0 0 22px rgba(206, 88, 42, 0.18)",
    pointerEvents: "none",
  },

  researchCelebrationOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9400,
    display: "grid",
    placeItems: "center",
    pointerEvents: "auto",
    perspective: 1200,
    background:
      "radial-gradient(circle at center, rgba(223, 170, 61, 0.16), transparent 38%)",
  },

  researchCelebrationCardWrap: {
    position: "relative",
    width: 390,
    maxWidth: "min(390px, 78vw)",
    display: "grid",
    placeItems: "center",
    transformStyle: "preserve-3d",
    filter: "drop-shadow(0 28px 54px rgba(0,0,0,0.82))",
  },

  researchCelebrationBack: {
    position: "absolute",
    inset: "5% 14%",
    zIndex: -1,
    border: "1px solid rgba(241, 213, 138, 0.36)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    opacity: 0.92,
    transform: "translateZ(-18px) rotateY(180deg)",
    boxShadow: "0 18px 36px rgba(0,0,0,0.68)",
  },

  researchCelebrationLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "12%",
    zIndex: 12,
    color: "#ffe7a9",
    fontSize: 42,
    fontWeight: 1000,
    letterSpacing: 2.2,
    textAlign: "center",
    textTransform: "uppercase",
    textShadow:
      "0 4px 0 rgba(0,0,0,0.82), 0 0 26px rgba(242, 188, 77, 0.54)",
    pointerEvents: "none",
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
