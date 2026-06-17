import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { StageBackground, useStageOverlayTransform } from "./GameStage";
import buttonImage from "../assets/button.webp";
import cardBackImage from "../assets/cards/card-back.webp";
import experienceIcon from "../assets/icons/expa.webp";
import goldTracksIcon from "../assets/icons/gold_tracks_transparent.webp";
import silverTracksIcon from "../assets/icons/silver-tracks.webp";
import { getNationFlagAsset } from "../assets/nationFlagAssets";
import { getCardOrNull } from "../game/cards";
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
  purchaseCardCopyOnServer,
  purchaseHeadquartersOnServer,
  purchasePremiumCardOnServer,
  researchCardOnServer,
  researchHeadquartersOnServer,
  syncPlayerProgressFromServer,
  type PlayerProgress,
} from "../game/playerProgress";
import { HandCardView } from "./HandCardView";
import {
  isProfileServerUnavailable,
  retryProfileConnection,
  useProfileConnection,
} from "../network/useProfileConnection";

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
  /** Whether the node directly above this one in the branch is already acquired. */
  incomingPathComplete?: boolean;
};

type ResearchBranchProgress = {
  acquired: number;
  total: number;
  ratio: number;
};

type ResearchNodeBadge = {
  glyph: string;
  tone: "owned" | "available" | "ready" | "locked" | "planned";
  label: string;
};

const NODE_BADGES: Record<ResearchNodeStage, ResearchNodeBadge> = {
  owned: { glyph: "✓", tone: "owned", label: "В наличии" },
  researched: { glyph: "₸", tone: "ready", label: "Можно купить" },
  researchable: { glyph: "!", tone: "available", label: "Доступно для исследования" },
  locked: { glyph: "🔒", tone: "locked", label: "Закрыто" },
  planned: { glyph: "⏳", tone: "planned", label: "Скоро" },
};

function isAcquiredStage(stage: ResearchNodeStage): boolean {
  return stage === "owned" || stage === "researched";
}

function getBranchProgress(nodes: ResearchNodeView[]): ResearchBranchProgress {
  // Premium (gold-purchase) nodes are collectibles outside the research path,
  // so they don't count toward branch progression.
  const realNodes = nodes.filter(
    (node) => node.stage !== "planned" && node.goldCost === undefined
  );
  const acquired = realNodes.filter((node) => node.stage === "owned").length;
  const total = realNodes.length;

  return {
    acquired,
    total,
    ratio: total > 0 ? acquired / total : 0,
  };
}

/**
 * Groups branch nodes into tier rows for the non-linear (graph) layout. Returns
 * null when the branch has no tier information, in which case the caller renders
 * the classic linear chain.
 */
function getBranchTiers(
  nodes: ResearchNodeView[]
): ResearchNodeView[][] | null {
  if (!nodes.some((node) => node.tier !== undefined)) {
    return null;
  }

  const tierMap = new Map<number, ResearchNodeView[]>();

  nodes.forEach((node, index) => {
    const tier = node.tier ?? index;
    const row = tierMap.get(tier) ?? [];
    row.push(node);
    tierMap.set(tier, row);
  });

  return Array.from(tierMap.entries())
    .sort(([leftTier], [rightTier]) => leftTier - rightTier)
    .map(([, row]) => row.sort((left, right) => (left.slot ?? 0) - (right.slot ?? 0)));
}

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

  // Premium nodes are bought directly with gold tracks, bypassing research and
  // prerequisites. They remain purchasable up to the copy limit.
  if (node.goldCost !== undefined) {
    const ownedCopies = node.cardId
      ? progress.ownedCardCopies[node.cardId] ?? 0
      : 0;
    const maxed = ownedCopies >= CARD_COPY_LIMIT;

    return {
      ...node,
      stage: ownedCopies > 0 ? "owned" : "researchable",
      statusLabel: maxed
        ? `Куплено x${ownedCopies}`
        : ownedCopies > 0
          ? `Премиум x${ownedCopies}`
          : "Премиум",
      actionKind: "purchase",
      ownedCopies,
      costIcon: maxed ? undefined : goldTracksIcon,
      costValue: maxed ? undefined : node.goldCost,
      costInsufficient: !maxed && progress.goldTracks < node.goldCost,
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

function isNodeAcquired(node: ResearchNode, progress: PlayerProgress): boolean {
  return isNodeOwned(node, progress) || isNodeResearched(node, progress);
}

/**
 * Whether a prerequisite node opens the path to its successors. Headquarters
 * must be researched AND purchased (owned) to act as a gate, so a player has to
 * actually field the HQ before its branch units unlock. Unit prerequisites only
 * need to be researched.
 */
function isPrerequisiteSatisfied(
  node: ResearchNode,
  progress: PlayerProgress
): boolean {
  if (node.type === "headquarters") {
    return isNodeOwned(node, progress);
  }

  return isNodeAcquired(node, progress);
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
  // A branch is a directed graph when any node declares prerequisites; in that
  // case gating is driven by `requires`. Otherwise we keep the original linear
  // "previous node in the list" gating used by the linear trees.
  const isGraph = nodes.some((node) => node.requires && node.requires.length > 0);

  if (isGraph) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    return nodes.map((node) => {
      const requires = node.requires ?? [];
      const blocking = requires
        .map((requiredId) => nodeById.get(requiredId))
        .find((required) => required && !isPrerequisiteSatisfied(required, progress));
      const reachable = !blocking;

      const view = createNodeView({
        node,
        progress,
        sourceHeadquartersId,
        previousComplete: reachable,
        previousNodeTitle: blocking?.title,
      });

      // The path into a node is "lit" once every prerequisite is satisfied
      // (units researched, headquarters purchased).
      view.incomingPathComplete = requires.every((requiredId) => {
        const required = nodeById.get(requiredId);
        return required ? isPrerequisiteSatisfied(required, progress) : true;
      });

      return view;
    });
  }

  let previousComplete = true;
  let previousNodeTitle: string | undefined;
  // The trunk feeding the first node of a branch is always considered laid,
  // so the path visibly originates from the branch header.
  let previousAcquired = true;

  return nodes.map((node) => {
    const view = createNodeView({
      node,
      progress,
      sourceHeadquartersId,
      previousComplete,
      previousNodeTitle,
    });

    view.incomingPathComplete = previousAcquired;

    previousComplete =
      view.stage === "owned" ||
      view.stage === "researched" ||
      node.status === "unlocked";
    previousAcquired = isAcquiredStage(view.stage);
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
  const card = node.cardId ? getCardOrNull(node.cardId) : null;
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
  onAction?: (node: ResearchNodeView) => void | Promise<void>;
}) {
  const locked = node.stage === "locked" || node.stage === "planned";
  const actionable =
    node.stage === "researchable" ||
    node.stage === "researched" ||
    (node.stage === "owned" &&
      Boolean(node.cardId && node.costValue && node.costValue > 0));
  const headquarters = node.type === "headquarters";
  const ownedCopies = Math.min(CARD_COPY_LIMIT, node.ownedCopies ?? 0);
  const badge = NODE_BADGES[node.stage];
  // The "!" (researchable) and "₸" (purchasable) badges are intentionally
  // hidden — the footer label already conveys those actions.
  const showBadge =
    node.stage !== "researchable" && node.stage !== "researched";

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
      onClick={() => {
        void onAction?.(node);
      }}
    >
      {showBadge ? (
        <span
          style={{ ...styles.nodeBadge, ...badgeToneStyles[badge.tone] }}
          title={badge.label}
          aria-hidden="true"
        >
          {badge.glyph}
        </span>
      ) : null}

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

// Deterministic grid for the non-linear (graph) branches. Node positions are
// computed from tier/slot so edges can be drawn precisely without measuring the
// DOM. All cards keep the same full size as the linear trees.
const GRAPH_BRANCH_WIDTH = 372;
const GRAPH_CARD_WIDTH = 175;
const GRAPH_NODE_HEIGHT = 286;
const GRAPH_ROW_GAP = 74;
const GRAPH_ROW_HEIGHT = GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP;
const GRAPH_SLOT_CENTERS_TWO = [95, 277];
const GRAPH_SLOT_CENTER_SINGLE = GRAPH_BRANCH_WIDTH / 2;

function getGraphNodeCenterX(tierSize: number, indexInTier: number): number {
  if (tierSize === 1) return GRAPH_SLOT_CENTER_SINGLE;
  return GRAPH_SLOT_CENTERS_TWO[indexInTier] ?? GRAPH_SLOT_CENTER_SINGLE;
}

function BranchGraph({
  nodes,
  onPreview,
  onAction,
}: {
  nodes: ResearchNodeView[];
  onPreview: (event: MouseEvent, node: ResearchNode) => void;
  onAction?: (node: ResearchNodeView) => void;
}) {
  const tiers = getBranchTiers(nodes);
  if (!tiers) return null;

  const positions = new Map<string, { cx: number; top: number }>();
  tiers.forEach((row, tierIndex) => {
    row.forEach((node, indexInTier) => {
      positions.set(node.id, {
        cx: getGraphNodeCenterX(row.length, indexInTier),
        top: tierIndex * GRAPH_ROW_HEIGHT,
      });
    });
  });

  const height = tiers.length * GRAPH_ROW_HEIGHT - GRAPH_ROW_GAP + 12;

  const edges = nodes.flatMap((node) => {
    const child = positions.get(node.id);
    if (!child || !node.requires) return [];

    return node.requires.flatMap((requiredId) => {
      const parent = positions.get(requiredId);
      if (!parent) return [];

      const startY = parent.top + GRAPH_NODE_HEIGHT;
      const endY = child.top;
      const midY = (startY + endY) / 2;

      return [
        {
          id: `${requiredId}->${node.id}`,
          d: `M ${parent.cx} ${startY} C ${parent.cx} ${midY} ${child.cx} ${midY} ${child.cx} ${endY}`,
          complete: Boolean(node.incomingPathComplete),
        },
      ];
    });
  });

  return (
    <div style={{ ...styles.branchGraph, height }}>
      <svg
        width={GRAPH_BRANCH_WIDTH}
        height={height}
        style={styles.branchGraphEdges}
        aria-hidden="true"
      >
        {edges.map((edge) => (
          <path
            key={edge.id}
            d={edge.d}
            fill="none"
            strokeWidth={edge.complete ? 3 : 2.5}
            strokeLinecap="round"
            stroke={
              edge.complete
                ? "rgba(243, 205, 108, 0.92)"
                : "rgba(196, 168, 104, 0.5)"
            }
            style={
              edge.complete
                ? { filter: "drop-shadow(0 0 5px rgba(228, 184, 84, 0.55))" }
                : undefined
            }
          />
        ))}
      </svg>

      {nodes.map((node) => {
        const position = positions.get(node.id);
        if (!position) return null;

        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              zIndex: 1,
              left: position.cx - GRAPH_CARD_WIDTH / 2,
              top: position.top,
              width: GRAPH_CARD_WIDTH,
            }}
          >
            <ResearchNodeCard
              node={node}
              onPreview={onPreview}
              onAction={onAction}
            />
          </div>
        );
      })}
    </div>
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
    ? getCardOrNull(celebration.node.cardId)
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
  // Applies the stage scale + rotation so the body-portaled preview renders like
  // desktop and fits/rotates exactly like the rest of the game.
  const stageOverlayTransform = useStageOverlayTransform();
  const [progress, setProgress] = useState(() => loadPlayerProgress());
  const [feedback, setFeedback] = useState<ResearchFeedback | null>(null);
  const [celebration, setCelebration] = useState<ResearchCelebration | null>(null);
  const profileConnection = useProfileConnection();
  const profileServerUnavailable = isProfileServerUnavailable(profileConnection);
  const profileServerReady = profileConnection.status === "online";

  useEffect(() => {
    let cancelled = false;

    void syncPlayerProgressFromServer().then((serverProgress) => {
      if (!cancelled) {
        setProgress(serverProgress);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Drag-to-pan: navigate the tree by grabbing it with the mouse, like a touch
  // screen. Touch keeps native scrolling; only mouse uses manual panning.
  const viewportRef = useRef<HTMLDivElement>(null);
  const panState = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  function handlePanPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    panState.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  }

  function handlePanPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panState.current;
    if (!pan.active) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;

    if (!pan.moved && Math.hypot(deltaX, deltaY) < 5) return;

    if (!pan.moved) {
      pan.moved = true;
      try {
        viewport.setPointerCapture(pan.pointerId);
      } catch {
        // Pointer may already be gone; panning still works without capture.
      }
      viewport.style.cursor = "grabbing";
    }

    viewport.scrollLeft = pan.scrollLeft - deltaX;
    viewport.scrollTop = pan.scrollTop - deltaY;
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panState.current;
    if (!pan.active) return;

    const viewport = viewportRef.current;
    if (viewport) {
      viewport.style.cursor = "grab";
      try {
        if (pan.moved && viewport.hasPointerCapture(event.pointerId)) {
          viewport.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture already released.
      }
    }

    pan.active = false;
    // `moved` stays true until the click is swallowed by handlePanClickCapture.
  }

  // After a drag, suppress the click so a pan does not trigger a node action.
  function handlePanClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (panState.current.moved) {
      event.stopPropagation();
      event.preventDefault();
      panState.current.moved = false;
    }
  }
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
  const branchNodeViews = useMemo(
    () =>
      sourceHeadquartersId
        ? tree.branches.map((branch) => {
            const nodes = createBranchNodeViews({
              nodes: branch.nodes,
              progress,
              sourceHeadquartersId,
            });

            return {
              branch,
              nodes,
              branchProgress: getBranchProgress(nodes),
            };
          })
        : [],
    [tree, progress, sourceHeadquartersId]
  );

  const nationProgress = useMemo<ResearchBranchProgress>(() => {
    const totals = branchNodeViews.reduce(
      (accumulator, { branchProgress }) => ({
        acquired: accumulator.acquired + branchProgress.acquired,
        total: accumulator.total + branchProgress.total,
      }),
      { acquired: 0, total: 0 }
    );

    return {
      ...totals,
      ratio: totals.total > 0 ? totals.acquired / totals.total : 0,
    };
  }, [branchNodeViews]);
  const previewCard = previewNode?.cardId
    ? getCardOrNull(previewNode.cardId)
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

  async function retryProfileSync() {
    try {
      await retryProfileConnection();
      const serverProgress = await syncPlayerProgressFromServer();
      setProgress(serverProgress);
    } catch {
      showFeedback("Сервер профиля недоступен");
    }
  }

  function getResearchShortage(cost: number) {
    const headquartersXp = sourceHeadquartersId
      ? progress.headquartersXp[sourceHeadquartersId] ?? 0
      : 0;
    const availableExperience = headquartersXp + progress.freeXp;
    return Math.max(0, cost - availableExperience);
  }

  async function handleNodeAction(node: ResearchNodeView) {
    if (!sourceHeadquartersId) return;

    if (!profileServerReady) {
      showFeedback(
        profileServerUnavailable
          ? "Сервер профиля недоступен"
          : "Дождитесь синхронизации профиля"
      );
      return;
    }

    let nextProgress: PlayerProgress | null = null;
    let celebrationLabel: ResearchCelebration["label"] | null = null;

    if (node.stage === "planned") {
      showFeedback("Эта ветка пока недоступна");
      return;
    }

    // Premium cards are purchased directly with gold tracks; handled before the
    // experience/iron-track research flow below.
    if (node.goldCost !== undefined && node.cardId) {
      const ownedCopies = progress.ownedCardCopies[node.cardId] ?? 0;

      if (ownedCopies >= CARD_COPY_LIMIT) {
        showFeedback("Куплены все доступные копии");
        return;
      }

      if (progress.goldTracks < node.goldCost) {
        showFeedback(
          `Не хватает золотых траков: ${formatNumber(
            node.goldCost - progress.goldTracks
          )}`
        );
        return;
      }

      const premiumProgress = await purchasePremiumCardOnServer(
        node.cardId,
        node.goldCost
      );

      if (premiumProgress) {
        setProgress(premiumProgress);
        showCelebration("Куплено", node);
      } else {
        showFeedback("Операция не была подтверждена сервером");
      }

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
        ? await researchCardOnServer(node.cardId, sourceHeadquartersId, experienceCost)
        : node.headquartersId
          ? await researchHeadquartersOnServer(node.headquartersId, sourceHeadquartersId, experienceCost)
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

      nextProgress = await purchaseCardCopyOnServer(node.cardId, purchaseCost);
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

      nextProgress = await purchaseHeadquartersOnServer(node.headquartersId, purchaseCost);
      celebrationLabel = "Куплено";
    }

    if (nextProgress) {
      setProgress(nextProgress);
      if (celebrationLabel) {
        showCelebration(celebrationLabel, node);
      }
    } else if (celebrationLabel) {
      showFeedback("Операция не была подтверждена сервером");
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
      <StageBackground
        color="#070a08"
        image="linear-gradient(90deg, rgba(4, 6, 5, 0.98), rgba(12, 16, 13, 0.9) 44%, rgba(5, 7, 6, 0.96)), url('/menu-background.png')"
      />
      <div style={styles.backgroundShade} />

      <header style={styles.topBar}>
        <div>
          <div style={styles.kicker}>Развитие армии</div>
          <h1 style={styles.title}>Исследования</h1>
          <div style={styles.nationProgressRow}>
            <span style={styles.nationProgressLabel}>
              {NATION_LABELS[selectedNation]} · в наличии{" "}
              {nationProgress.acquired}/{nationProgress.total}
            </span>
            <div
              style={styles.nationProgressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={nationProgress.total}
              aria-valuenow={nationProgress.acquired}
              aria-label={`Прогресс нации: ${nationProgress.acquired} из ${nationProgress.total}`}
            >
              <div
                style={{
                  ...styles.nationProgressFill,
                  width: `${Math.round(nationProgress.ratio * 100)}%`,
                }}
              />
            </div>
          </div>
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

      {profileServerUnavailable ? (
        <div style={styles.profileServerBanner}>
          <span>
            {profileConnection.message ?? "Сервер профиля недоступен"}
          </span>
          <button
            type="button"
            style={styles.profileServerRetryButton}
            onClick={() => void retryProfileSync()}
          >
            Повторить
          </button>
        </div>
      ) : null}

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
        <div
          ref={viewportRef}
          className="research-tree-scroll"
          style={styles.treeViewport}
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onClickCapture={handlePanClickCapture}
        >
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
              {branchNodeViews.map(({ branch, nodes, branchProgress }) => {
                const tiers = getBranchTiers(nodes);

                return (
                  <div key={branch.id} style={styles.branchColumn}>
                    <div style={styles.branchDrop} />
                    <div style={styles.branchInfo}>
                      <div style={styles.branchHeadRow}>
                        <strong style={styles.branchTitle}>
                          {branch.shortTitle}
                        </strong>
                        <span style={styles.branchCount}>
                          {branchProgress.acquired}/{branchProgress.total}
                        </span>
                      </div>
                      <span style={styles.branchDescription}>
                        {branch.description}
                      </span>
                      <div
                        style={styles.branchProgressTrack}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={branchProgress.total}
                        aria-valuenow={branchProgress.acquired}
                        aria-label={`${branch.shortTitle}: ${branchProgress.acquired} из ${branchProgress.total} в наличии`}
                      >
                        <div
                          style={{
                            ...styles.branchProgressFill,
                            width: `${Math.round(branchProgress.ratio * 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {tiers ? (
                      <BranchGraph
                        nodes={nodes}
                        onPreview={openNodePreview}
                        onAction={handleNodeAction}
                      />
                    ) : (
                      <div style={styles.branchNodes}>
                        {nodes.map((node) => (
                          <div key={node.id} style={styles.nodeStep}>
                            <div
                              style={{
                                ...styles.nodeConnector,
                                ...(node.incomingPathComplete
                                  ? styles.nodeConnectorComplete
                                  : {}),
                              }}
                            />
                            <ResearchNodeCard
                              node={node}
                              onPreview={openNodePreview}
                              onAction={handleNodeAction}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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

      {createPortal(
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
              <div style={{ ...stageOverlayTransform, display: "flex" }}>
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
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    position: "relative",
    minHeight: "100cqh",
    height: "100cqh",
    overflow: "hidden",
    color: "#f2e4c2",
    // Background is painted full-viewport by <StageBackground/> so it fills the
    // letterbox margins; keep this box transparent to show it through.
    background: "transparent",
    fontFamily: "var(--font-body)",
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

  profileServerBanner: {
    position: "absolute",
    top: 112,
    left: "50%",
    zIndex: 20,
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 16px",
    background:
      "linear-gradient(180deg, rgba(80, 30, 24, 0.92), rgba(21, 10, 8, 0.92))",
    color: "#ffe8ce",
    fontSize: 13,
    fontWeight: 900,
    boxShadow: "0 12px 28px rgba(0,0,0,0.42)",
    textShadow: "0 2px 4px rgba(0,0,0,0.7)",
  },

  profileServerRetryButton: {
    height: 30,
    padding: "0 14px",
    border: "1px solid rgba(255, 226, 163, 0.34)",
    background:
      "linear-gradient(180deg, rgba(97, 78, 42, 0.92), rgba(37, 31, 18, 0.96))",
    color: "#fff0bd",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 1000,
    letterSpacing: 0.8,
    textTransform: "uppercase",
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

  nationProgressRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },

  nationProgressLabel: {
    color: "rgba(239, 225, 191, 0.78)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },

  nationProgressTrack: {
    position: "relative",
    width: 220,
    maxWidth: "32cqw",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    background: "rgba(0, 0, 0, 0.46)",
    boxShadow: "inset 0 0 0 1px rgba(208, 166, 71, 0.2)",
  },

  nationProgressFill: {
    height: "100%",
    borderRadius: 999,
    background:
      "linear-gradient(90deg, rgba(208, 166, 71, 0.9), rgba(247, 224, 150, 0.98))",
    boxShadow: "0 0 10px rgba(228, 184, 84, 0.5)",
    transition: "width 320ms ease",
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
    overflowY: "auto",
    overscrollBehavior: "contain",
    // The tree is panned by dragging; scrollbars are hidden (see index.css for
    // the WebKit counterpart).
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
    cursor: "grab",
    userSelect: "none",
    touchAction: "pan-x pan-y",
  },

  treeCanvas: {
    position: "relative",
    minWidth: 1700,
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
    gridTemplateColumns: "repeat(4, 372px)",
    alignItems: "start",
    gap: 36,
    paddingTop: 22,
  },

  branchBus: {
    position: "absolute",
    left: 186,
    right: 186,
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

  branchHeadRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },

  branchTitle: {
    color: "#e9cf8c",
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },

  branchCount: {
    color: "rgba(243, 205, 108, 0.9)",
    fontSize: 11,
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
  },

  branchDescription: {
    color: "rgba(231, 218, 184, 0.52)",
    fontSize: 9,
    lineHeight: 1.25,
  },

  branchProgressTrack: {
    position: "relative",
    height: 4,
    marginTop: 2,
    borderRadius: 999,
    overflow: "hidden",
    background: "rgba(0, 0, 0, 0.42)",
    boxShadow: "inset 0 0 0 1px rgba(208, 166, 71, 0.18)",
  },

  branchProgressFill: {
    height: "100%",
    borderRadius: 999,
    background:
      "linear-gradient(90deg, rgba(208, 166, 71, 0.85), rgba(243, 205, 108, 0.95))",
    boxShadow: "0 0 8px rgba(228, 184, 84, 0.45)",
    transition: "width 320ms ease",
  },

  branchNodes: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    justifyItems: "center",
    gap: 28,
  },

  branchGraph: {
    position: "relative",
    zIndex: 2,
    width: 372,
    margin: "0 auto",
  },

  branchGraphEdges: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    overflow: "visible",
  },

  nodeStep: {
    position: "relative",
    flex: "0 0 auto",
  },

  nodeConnector: {
    position: "absolute",
    left: "50%",
    bottom: "100%",
    width: 2,
    height: 22,
    background: "rgba(150, 130, 92, 0.28)",
    transition: "background 200ms ease, box-shadow 200ms ease",
  },

  nodeConnectorComplete: {
    background:
      "linear-gradient(180deg, rgba(243, 205, 108, 0.92), rgba(208, 166, 71, 0.7))",
    boxShadow: "0 0 8px rgba(228, 184, 84, 0.5)",
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

  nodeBadge: {
    position: "absolute",
    top: -7,
    right: -7,
    zIndex: 6,
    display: "grid",
    placeItems: "center",
    width: 24,
    height: 24,
    borderRadius: 999,
    border: "1.5px solid rgba(0, 0, 0, 0.55)",
    fontSize: 13,
    fontWeight: 1000,
    lineHeight: 1,
    boxShadow: "0 3px 8px rgba(0,0,0,0.5)",
    pointerEvents: "none",
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
    maxWidth: "min(520px, calc(100cqw - 32px))",
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
    maxWidth: "min(390px, 78cqw)",
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
    // Fixed design width; the parent wrapper carries the stage scale/rotation.
    width: 390,
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

const badgeToneStyles: Record<ResearchNodeBadge["tone"], CSSProperties> = {
  owned: {
    color: "#0c150a",
    background: "linear-gradient(180deg, #b6e58a, #79bb65)",
  },
  ready: {
    color: "#0c1314",
    background: "linear-gradient(180deg, #e3eaec, #b3c0c4)",
  },
  available: {
    color: "#1c1405",
    background: "linear-gradient(180deg, #ffdd7a, #f0b94a)",
  },
  locked: {
    color: "#f0e6cf",
    background: "linear-gradient(180deg, #4a4136, #221c14)",
  },
  planned: {
    color: "#e9ddc2",
    background: "linear-gradient(180deg, #3a4032, #1f2419)",
  },
};
