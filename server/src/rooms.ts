import { randomInt } from "node:crypto";
import { WebSocket } from "ws";
import {
  applyAction,
  getAttackAnimationSequence,
} from "../../tank-card-game/src/game/engine";
import { getCard } from "../../tank-card-game/src/game/cards";
import {
  DEFAULT_BOT_HEADQUARTERS_ID,
  DEFAULT_PLAYER_HEADQUARTERS_ID,
  HEADQUARTERS,
  getHeadquartersDefinition,
} from "../../tank-card-game/src/game/headquarters";
import { calculateDeckWeight, getDefaultDeckWeight } from "../../tank-card-game/src/game/deckWeight";
import { getRandomBattleBackgroundId } from "./battleBackgrounds";
import {
  createInitialBattleState,
  STEP_TIME_MS,
} from "../../tank-card-game/src/game/initialState";
import type {
  BattleAction,
  BattleState,
  HeadquartersId,
  PlayerId,
} from "../../tank-card-game/src/game/types";
import { createBattleViewForPlayer } from "./battleView";
import type { MatchEndReason, PvpClientMessage, PvpServerMessage } from "./protocol";
import { PlayerAccountManager } from "./playerAccounts";
import { PlayerProfileManager } from "./playerProfiles";
import { createSessionToken, verifySessionToken } from "./authTokens";
import { PromoRedemptionStore } from "./promoCodes";

const REGISTERED_USER_PREFIX = "user:";

type RoomPlayer = {
  id: PlayerId;
  profilePlayerId: string | null;
  headquartersId: HeadquartersId;
  deckCardIds: string[] | null;
  deckWeight: number;
  sessionId: string;
  socket: WebSocket | null;
  disconnectTimer: NodeJS.Timeout | null;
  disconnectedAt: number | null;
};

type PendingStartRoll = {
  firstPlayer: PlayerId;
  startsAt: number;
  revealAt: number;
  startTimer: NodeJS.Timeout;
};

type PvpTurnTimer = {
  activePlayer: PlayerId;
  startedAt: number;
  endsAt: number;
  durationMs: number;
  timeoutId: NodeJS.Timeout | null;
  intervalId: NodeJS.Timeout | null;
};

type PendingMovement = {
  intentId: string;
  playerId: PlayerId;
  action: Extract<BattleAction, { type: "MOVE_UNIT" }>;
  queuedActions: Extract<BattleAction, { type: "MOVE_UNIT" }>[];
  timeoutId: NodeJS.Timeout;
};

type PendingAttack = {
  intentId: string;
  playerId: PlayerId;
  action: Extract<BattleAction, { type: "ATTACK" }>;
  timeoutId: NodeJS.Timeout;
};

type PendingDeployBarrage = {
  intentId: string;
  playerId: PlayerId;
  action: Extract<BattleAction, { type: "PLAY_CARD" | "PLAY_SUPPORT_CARD" }>;
  timeoutId: NodeJS.Timeout;
};

type Room = {
  id: string;
  players: Partial<Record<PlayerId, RoomPlayer>>;
  publicMatchmaking: boolean;
  // When this room entered the public matchmaking queue. Drives the widening
  // tolerance band. Null for private (CREATE_ROOM/JOIN_ROOM) rooms.
  matchmakingStartedAt: number | null;
  battle: BattleState | null;
  pendingStartRoll: PendingStartRoll | null;
  pendingMovement: PendingMovement | null;
  pendingAttack: PendingAttack | null;
  pendingDeployBarrage: PendingDeployBarrage | null;
  turnTimer: PvpTurnTimer | null;
  ended: boolean;
  winner: PlayerId | null;
  endReason: MatchEndReason | null;
  cleanupTimer: NodeJS.Timeout | null;
};

type CompletedPvpMatch = {
  roomId: string;
  battle: BattleState;
  endReason: MatchEndReason | null;
  players: Partial<
    Record<PlayerId, { profilePlayerId: string | null; deckWeight: number }>
  >;
  timeoutId: NodeJS.Timeout;
};

export type AdminRuntimeStats = {
  roomsTotal: number;
  matchmakingRooms: number;
  activeBattles: number;
  finishedRooms: number;
  connectedPvpPlayers: number;
  activeGameSessions: number;
  completedPvpRewardClaims: number;
};

const START_ROLL_DURATION_MS = 2800;
const START_ROLL_RESULT_DELAY_MS = 350;
const START_ROLL_FINISH_DELAY_MS = 900;
const PVP_TURN_DURATION_MS = STEP_TIME_MS;
const PVP_TURN_TIMER_BROADCAST_INTERVAL_MS = 500;
const PVP_MOVE_INTENT_DURATION_MS = 520;
const PVP_ATTACK_STRIKE_DURATION_MS = 960;
const PVP_DESTROYED_CARD_ANIMATION_MS = 920;
const PVP_DEPLOY_BARRAGE_SPAWN_MS = 620;
const PVP_DEPLOY_BARRAGE_FIRST_SHOT_MS = 520;
const PVP_DEPLOY_BARRAGE_SHOT_STAGGER_MS = 200;
const PVP_DEPLOY_BARRAGE_DAMAGE_SETTLE_MS = 620;
const PVP_DEPLOY_BARRAGE_DESTROY_START_DELAY_MS = 140;
const PVP_DEPLOY_BARRAGE_DESTROYED_MS = PVP_DESTROYED_CARD_ANIMATION_MS;
const ROOM_CLEANUP_DELAY_MS = 30_000;
const PVP_REWARD_CLAIM_TTL_MS = 10 * 60_000;
const DASHA_PROMO_CODE = "dasha";
const DASHA_PROMO_GOLD_TRACKS = 700;
const MAX_INCOMING_MESSAGE_BYTES = Number(
  process.env.WS_MAX_MESSAGE_BYTES ?? 1024 * 1024
);
const WS_RATE_LIMIT_WINDOW_MS = Number(
  process.env.WS_RATE_LIMIT_WINDOW_MS ?? 1000
);
const WS_RATE_LIMIT_MAX_MESSAGES = Number(
  process.env.WS_RATE_LIMIT_MAX_MESSAGES ?? 60
);
const WS_RATE_LIMIT_BLOCK_MS = Number(process.env.WS_RATE_LIMIT_BLOCK_MS ?? 2000);
// Per-IP guards. The per-socket rate limit above is trivially bypassed by
// opening many sockets, so these aggregate by client IP instead.
const WS_MAX_CONNECTIONS_PER_IP = Number(
  process.env.WS_MAX_CONNECTIONS_PER_IP ?? 30
);
const WS_IP_RATE_LIMIT_WINDOW_MS = Number(
  process.env.WS_IP_RATE_LIMIT_WINDOW_MS ?? 1000
);
const WS_IP_RATE_LIMIT_MAX_MESSAGES = Number(
  process.env.WS_IP_RATE_LIMIT_MAX_MESSAGES ?? 240
);
const WS_IP_RATE_LIMIT_BLOCK_MS = Number(
  process.env.WS_IP_RATE_LIMIT_BLOCK_MS ?? 5000
);
// Brute-force protection for the LOGIN_ACCOUNT message, keyed by client IP.
const LOGIN_MAX_FAILED_ATTEMPTS = Number(
  process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? 10
);
const LOGIN_ATTEMPT_WINDOW_MS = Number(
  process.env.LOGIN_ATTEMPT_WINDOW_MS ?? 15 * 60_000
);
const LOGIN_BLOCK_MS = Number(process.env.LOGIN_BLOCK_MS ?? 15 * 60_000);
const RECONNECT_GRACE_MS = Number(process.env.PVP_RECONNECT_GRACE_MS ?? 15_000);
// PvE battle outcomes are computed client-side, so CLAIM_BATTLE_REWARD can't be
// made fully authoritative without replaying the match. A per-account token
// bucket instead caps how fast reward credits can be claimed, so a fabricated
// stream of "wins" can't accrue faster than someone actually grinding battles.
const REWARD_CLAIM_BUCKET_CAPACITY = Number(
  process.env.REWARD_CLAIM_BUCKET_CAPACITY ?? 10
);
const REWARD_CLAIM_REFILL_MS = Number(
  process.env.REWARD_CLAIM_REFILL_MS ?? 45_000
);
const CUSTOM_DECK_CARD_LIMIT = 40;
const CUSTOM_DECK_COPY_LIMIT = 4;
// Matchmaking weight band. The search starts at ±15% of the deck weight and
// widens by +10 percentage points every 5 seconds, up to a 30-second cap (so the
// widest band is reached at 30s and held). Comparison is relative to the average
// of the two deck weights, so the band is symmetric regardless of which side is
// heavier.
const PVP_MATCH_BASE_TOLERANCE_PCT = Number(
  process.env.PVP_MATCH_BASE_TOLERANCE_PCT ?? 15
);
const PVP_MATCH_TOLERANCE_STEP_PCT = Number(
  process.env.PVP_MATCH_TOLERANCE_STEP_PCT ?? 10
);
const PVP_MATCH_TOLERANCE_STEP_MS = Number(
  process.env.PVP_MATCH_TOLERANCE_STEP_MS ?? 5_000
);
const PVP_MATCH_TOLERANCE_MAX_MS = Number(
  process.env.PVP_MATCH_TOLERANCE_MAX_MS ?? 30_000
);
const PVP_MATCH_SWEEP_INTERVAL_MS = Number(
  process.env.PVP_MATCH_SWEEP_INTERVAL_MS ?? 1_000
);

// Fraction of deck weight two players may differ by after `elapsedMs` of waiting.
function getMatchToleranceFraction(elapsedMs: number): number {
  const cappedElapsed = Math.min(
    Math.max(0, elapsedMs),
    PVP_MATCH_TOLERANCE_MAX_MS
  );
  const steps = Math.floor(cappedElapsed / PVP_MATCH_TOLERANCE_STEP_MS);
  return (
    (PVP_MATCH_BASE_TOLERANCE_PCT + steps * PVP_MATCH_TOLERANCE_STEP_PCT) / 100
  );
}

// Symmetric relative difference between two deck weights.
function getRelativeWeightDelta(a: number, b: number): number {
  const reference = Math.max(1, (a + b) / 2);
  return Math.abs(a - b) / reference;
}

function normalizePromoCode(promoCode: string | undefined): string {
  return promoCode?.trim().toLowerCase() ?? "";
}

function getStraightTwoCellIntermediate(
  from: { row: number; col: number },
  to: { row: number; col: number }
): { row: number; col: number } | null {
  const rowDistance = Math.abs(from.row - to.row);
  const colDistance = Math.abs(from.col - to.col);

  if (rowDistance + colDistance !== 2) return null;
  if (rowDistance > 0 && colDistance > 0) return null;

  return {
    row: from.row + Math.sign(to.row - from.row),
    col: from.col + Math.sign(to.col - from.col),
  };
}

function createRoomId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let index = 0; index < 5; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return result;
}

function safeSend(socket: WebSocket | null | undefined, message: PvpServerMessage) {
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

type SocketRateLimitState = {
  windowStartedAt: number;
  count: number;
  blockedUntil: number;
};

type LoginAttemptState = {
  failedCount: number;
  windowStartedAt: number;
  blockedUntil: number;
};

function getRawDataByteLength(rawData: WebSocket.RawData): number {
  if (typeof rawData === "string") return Buffer.byteLength(rawData);
  if (Array.isArray(rawData)) {
    return rawData.reduce((total, item) => total + item.byteLength, 0);
  }

  return rawData.byteLength;
}

function hasMessageType(value: unknown): value is { type: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function overwritePlayerId(action: BattleAction, playerId: PlayerId): BattleAction {
  if (action.type === "TIMER_TICK") {
    return action;
  }

  if (action.type === "BEGIN_BATTLE") {
    return action;
  }

  return {
    ...action,
    playerId,
  } as BattleAction;
}

function getRandomStartingPlayer(): PlayerId {
  return randomInt(0, 2) === 0 ? "player" : "bot";
}

function createStartedBattle(
  startingPlayer: PlayerId,
  playerHeadquartersId: HeadquartersId,
  botHeadquartersId: HeadquartersId,
  playerDeckCardIds?: string[] | null,
  botDeckCardIds?: string[] | null
): BattleState {
  const battle = createInitialBattleState({
    playerHeadquartersId,
    botHeadquartersId,
    playerDeckCardIds: playerDeckCardIds ?? undefined,
    botDeckCardIds: botDeckCardIds ?? undefined,
    backgroundId: getRandomBattleBackgroundId(),
  });

  return applyAction(battle, {
    type: "BEGIN_BATTLE",
    startingPlayer,
  } as BattleAction);
}

function normalizeHeadquartersId(
  headquartersId: HeadquartersId | undefined,
  fallback: HeadquartersId
): HeadquartersId {
  return headquartersId && headquartersId in HEADQUARTERS ? headquartersId : fallback;
}

function normalizeCustomDeckCardIds(
  headquartersId: HeadquartersId,
  deckCardIds: unknown
): string[] | null {
  if (!Array.isArray(deckCardIds)) return null;
  if (deckCardIds.length !== CUSTOM_DECK_CARD_LIMIT) return null;

  const headquarters = getHeadquartersDefinition(headquartersId);
  const trainingHeadquarters = headquarters.type === "Учебная часть";
  const copies = new Map<string, number>();
  const result: string[] = [];

  for (const cardId of deckCardIds) {
    if (typeof cardId !== "string") return null;

    let card;
    try {
      card = getCard(cardId);
    } catch {
      return null;
    }

    if (!trainingHeadquarters && card.nation !== headquarters.nation) {
      return null;
    }

    const nextCopies = (copies.get(cardId) ?? 0) + 1;
    copies.set(cardId, nextCopies);

    if (nextCopies > CUSTOM_DECK_COPY_LIMIT) {
      return null;
    }

    result.push(cardId);
  }

  return result;
}

function getDeckWeight(
  headquartersId: HeadquartersId,
  deckCardIds: string[] | null
): number {
  return deckCardIds
    ? calculateDeckWeight(headquartersId, deckCardIds).totalWeight
    : getDefaultDeckWeight(headquartersId).totalWeight;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sessionToRoom = new Map<string, { roomId: string; playerId: PlayerId }>();
  private socketToRoom = new WeakMap<WebSocket, string>();
  private socketToPlayer = new WeakMap<WebSocket, PlayerId>();
  private socketRateLimits = new WeakMap<WebSocket, SocketRateLimitState>();
  private socketToIp = new WeakMap<WebSocket, string>();
  // Registered account a socket has proven ownership of (via password login or a
  // valid session token). Profile mutations for `user:` ids require this to
  // match — see assertCanActAs. Guest ids are unguessable random strings and act
  // as their own bearer secret, so they do not need a binding here.
  private socketToAuthUser = new WeakMap<WebSocket, string>();
  private connectionsPerIp = new Map<string, number>();
  private ipRateLimits = new Map<string, SocketRateLimitState>();
  private loginAttempts = new Map<string, LoginAttemptState>();
  private waitingRoomId: string | null = null;
  private movementIntentSequence = 0;
  private attackIntentSequence = 0;
  private deployBarrageIntentSequence = 0;
  private accounts = new PlayerAccountManager();
  private profiles = new PlayerProfileManager();
  private promoRedemptions = new PromoRedemptionStore();
  // Token buckets for CLAIM_BATTLE_REWARD, keyed by profile id. See
  // REWARD_CLAIM_* constants.
  private rewardClaimBuckets = new Map<
    string,
    { tokens: number; lastRefill: number }
  >();
  private completedPvpMatches = new Map<string, CompletedPvpMatch>();
  // One active game session per account. Keyed by accountId; the owning socket
  // auto-releases the lock when it closes (see handleClose). `instanceId`
  // identifies the browser tab so the same tab can re-acquire after a reload.
  private activeGameSessions = new Map<
    string,
    { socket: WebSocket; instanceId: string; kind: string; since: number }
  >();
  private socketToSessionAccount = new WeakMap<WebSocket, string>();
  // Periodically re-pairs waiting rooms whose tolerance bands have widened enough
  // to overlap. Without this, two players already in the queue would never match
  // each other once their bands grew, since matching is otherwise only attempted
  // when a fresh FIND_MATCH arrives.
  private matchmakingSweepTimer: NodeJS.Timeout;

  constructor() {
    this.matchmakingSweepTimer = setInterval(() => {
      this.sweepMatchmaking();
    }, PVP_MATCH_SWEEP_INTERVAL_MS);
    // Don't keep the process alive just for the sweep.
    this.matchmakingSweepTimer.unref?.();
  }

  getAdminRuntimeStats(): AdminRuntimeStats {
    let matchmakingRooms = 0;
    let activeBattles = 0;
    let finishedRooms = 0;
    let connectedPvpPlayers = 0;

    for (const room of this.rooms.values()) {
      if (this.isWaitingForOpponent(room)) {
        matchmakingRooms += 1;
      }

      if (room.battle?.status === "active") {
        activeBattles += 1;
      }

      if (room.ended) {
        finishedRooms += 1;
      }

      for (const player of Object.values(room.players)) {
        const socket = player?.socket;
        if (socket?.readyState === WebSocket.OPEN) {
          connectedPvpPlayers += 1;
        }
      }
    }

    return {
      roomsTotal: this.rooms.size,
      matchmakingRooms,
      activeBattles,
      finishedRooms,
      connectedPvpPlayers,
      activeGameSessions: this.activeGameSessions.size,
      completedPvpRewardClaims: this.completedPvpMatches.size,
    };
  }

  handleMessage(socket: WebSocket, rawData: WebSocket.RawData) {
    const byteLength = getRawDataByteLength(rawData);
    if (byteLength > MAX_INCOMING_MESSAGE_BYTES) {
      console.warn(
        `Rejected oversized message: ${byteLength} bytes (limit ${MAX_INCOMING_MESSAGE_BYTES})`
      );
      safeSend(socket, { type: "ERROR", message: "Сообщение слишком большое" });
      return;
    }

    if (this.isRateLimited(socket) || this.isIpRateLimited(socket)) {
      console.warn("Rejected message: rate limit exceeded");
      safeSend(socket, { type: "ERROR", message: "Слишком много сообщений" });
      return;
    }

    let message: PvpClientMessage;

    try {
      const parsedMessage = JSON.parse(rawData.toString());
      if (!hasMessageType(parsedMessage)) {
        console.warn("Rejected message: missing type field");
        safeSend(socket, { type: "ERROR", message: "Некорректное сообщение" });
        return;
      }

      message = parsedMessage as PvpClientMessage;
    } catch {
      console.warn("Rejected message: invalid JSON");
      safeSend(socket, { type: "ERROR", message: "Некорректное JSON-сообщение" });
      return;
    }

    if ("requestId" in message && message.requestId) {
      console.log(
        `Handling ${message.type} (requestId ${message.requestId}, ${byteLength} bytes)`
      );
    }

    switch (message.type) {
      case "FIND_MATCH":
        this.findMatch(
          socket,
          message.sessionId,
          message.playerId,
          message.headquartersId,
          message.deckCardIds
        );
        break;
      case "CREATE_ROOM":
        this.createRoom(socket, message.sessionId, {
          profilePlayerId: message.playerId,
          headquartersId: message.headquartersId,
          deckCardIds: message.deckCardIds,
        });
        break;
      case "JOIN_ROOM":
        this.joinRoom(
          socket,
          message.roomId,
          message.sessionId,
          message.playerId,
          message.headquartersId,
          message.deckCardIds
        );
        break;
      case "RECONNECT":
        this.reconnect(socket, message.sessionId, message.roomId);
        break;
      case "GAME_ACTION":
        this.applyGameAction(socket, message.action);
        break;
      case "SELECT_CARD":
        this.updateCardSelection(socket, message.cardInstanceId);
        break;
      case "SURRENDER":
        this.surrenderMatch(socket);
        break;
      case "LEAVE_MATCH":
        this.leaveMatch(socket);
        break;
      case "CANCEL_MATCHMAKING":
        this.cancelMatchmaking(socket);
        break;
      case "GET_PROFILE":
        this.sendProfile(socket, message.requestId, message.playerId);
        break;
      case "SAVE_PROFILE":
        this.saveProfile(socket, message.requestId, message.playerId, message.profile);
        break;
      case "UPDATE_NICKNAME":
        this.updateNickname(socket, message);
        break;
      case "UPDATE_FAVORITE_HEADQUARTERS":
        this.updateFavoriteHeadquarters(socket, message);
        break;
      case "CLAIM_BATTLE_REWARD":
        this.claimBattleReward(socket, message);
        break;
      case "CLAIM_PVP_BATTLE_REWARD":
        this.claimPvpBattleReward(socket, message);
        break;
      case "CLAIM_TUTORIAL_REWARD":
        this.claimTutorialReward(socket, message);
        break;
      case "RESEARCH_CARD":
        this.researchCard(socket, message);
        break;
      case "RESEARCH_HEADQUARTERS":
        this.researchHeadquarters(socket, message);
        break;
      case "PURCHASE_CARD_COPY":
        this.purchaseCardCopy(socket, message);
        break;
      case "PURCHASE_HEADQUARTERS":
        this.purchaseHeadquarters(socket, message);
        break;
      case "PURCHASE_PREMIUM_CARD":
        this.purchasePremiumCard(socket, message);
        break;
      case "PURCHASE_PREMIUM_DAYS":
        this.purchasePremiumDays(socket, message);
        break;
      case "EXCHANGE_GOLD_FOR_IRON":
        this.exchangeGoldForIron(socket, message);
        break;
      case "CLAIM_CAMPAIGN_REWARD":
        this.claimCampaignReward(socket, message);
        break;
      case "SAVE_CUSTOM_DECK":
        this.saveCustomDeck(socket, message);
        break;
      case "DELETE_CUSTOM_DECK":
        this.deleteCustomDeck(socket, message);
        break;
      case "ACQUIRE_SESSION":
        this.acquireGameSession(socket, message);
        break;
      case "RELEASE_SESSION":
        this.releaseGameSession(socket, message);
        break;
      case "REGISTER_ACCOUNT":
        this.registerAccount(socket, message);
        break;
      case "LOGIN_ACCOUNT":
        this.loginAccount(socket, message);
        break;
      case "AUTHENTICATE":
        this.authenticateSession(socket, message);
        break;
      default:
        console.warn(`Rejected message: unknown type "${(message as { type?: unknown }).type}"`);
        safeSend(socket, { type: "ERROR", message: "Неизвестное сообщение" });
    }
  }

  private isRateLimited(socket: WebSocket): boolean {
    const now = Date.now();
    const current = this.socketRateLimits.get(socket);

    if (!current || now - current.windowStartedAt >= WS_RATE_LIMIT_WINDOW_MS) {
      this.socketRateLimits.set(socket, {
        windowStartedAt: now,
        count: 1,
        blockedUntil: 0,
      });
      return false;
    }

    if (current.blockedUntil > now) {
      return true;
    }

    current.count += 1;
    if (current.count <= WS_RATE_LIMIT_MAX_MESSAGES) {
      return false;
    }

    current.blockedUntil = now + WS_RATE_LIMIT_BLOCK_MS;
    return true;
  }

  /**
   * Register a freshly opened socket against its client IP. Returns false when
   * the IP already holds the maximum number of concurrent connections, in which
   * case the caller should close the socket. Protects against connection floods
   * that would otherwise each get an independent per-socket rate-limit budget.
   */
  registerConnection(socket: WebSocket, ip: string): boolean {
    const current = this.connectionsPerIp.get(ip) ?? 0;
    if (current >= WS_MAX_CONNECTIONS_PER_IP) {
      console.warn(
        `Rejected connection from ${ip}: too many concurrent connections (${current})`
      );
      return false;
    }

    this.connectionsPerIp.set(ip, current + 1);
    this.socketToIp.set(socket, ip);
    return true;
  }

  private releaseConnection(socket: WebSocket) {
    const ip = this.socketToIp.get(socket);
    if (!ip) return;

    this.socketToIp.delete(socket);
    const remaining = (this.connectionsPerIp.get(ip) ?? 1) - 1;
    if (remaining <= 0) {
      this.connectionsPerIp.delete(ip);
    } else {
      this.connectionsPerIp.set(ip, remaining);
    }
  }

  private isIpRateLimited(socket: WebSocket): boolean {
    const ip = this.socketToIp.get(socket);
    if (!ip) return false;

    const now = Date.now();
    const current = this.ipRateLimits.get(ip);

    if (!current || now - current.windowStartedAt >= WS_IP_RATE_LIMIT_WINDOW_MS) {
      this.ipRateLimits.set(ip, {
        windowStartedAt: now,
        count: 1,
        blockedUntil: 0,
      });
      return false;
    }

    if (current.blockedUntil > now) {
      return true;
    }

    current.count += 1;
    if (current.count <= WS_IP_RATE_LIMIT_MAX_MESSAGES) {
      return false;
    }

    current.blockedUntil = now + WS_IP_RATE_LIMIT_BLOCK_MS;
    return true;
  }

  private isLoginBlocked(ip: string): boolean {
    const state = this.loginAttempts.get(ip);
    if (!state) return false;

    const now = Date.now();
    if (state.blockedUntil > now) return true;

    // Window expired with no fresh block: forget the IP so the map stays small.
    if (now - state.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS) {
      this.loginAttempts.delete(ip);
    }
    return false;
  }

  private recordFailedLogin(ip: string) {
    const now = Date.now();
    const state = this.loginAttempts.get(ip);

    if (!state || now - state.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS) {
      this.loginAttempts.set(ip, {
        failedCount: 1,
        windowStartedAt: now,
        blockedUntil: 0,
      });
      return;
    }

    state.failedCount += 1;
    if (state.failedCount >= LOGIN_MAX_FAILED_ATTEMPTS) {
      state.blockedUntil = now + LOGIN_BLOCK_MS;
      console.warn(`Login temporarily blocked for ${ip} after ${state.failedCount} failed attempts`);
    }
  }

  private clearLoginAttempts(ip: string) {
    this.loginAttempts.delete(ip);
  }

  /**
   * Token bucket guarding repeatable PvE reward claims, keyed by profile id.
   * Returns true (and consumes nothing) when the account is out of tokens.
   */
  private isRewardClaimRateLimited(playerId: string): boolean {
    const key = playerId.trim();
    if (!key) return false;

    const now = Date.now();
    const bucket = this.rewardClaimBuckets.get(key) ?? {
      tokens: REWARD_CLAIM_BUCKET_CAPACITY,
      lastRefill: now,
    };

    const refilled = Math.floor(
      (now - bucket.lastRefill) / REWARD_CLAIM_REFILL_MS
    );
    if (refilled > 0) {
      bucket.tokens = Math.min(
        REWARD_CLAIM_BUCKET_CAPACITY,
        bucket.tokens + refilled
      );
      bucket.lastRefill += refilled * REWARD_CLAIM_REFILL_MS;
    }

    if (bucket.tokens <= 0) {
      this.rewardClaimBuckets.set(key, bucket);
      return true;
    }

    bucket.tokens -= 1;
    this.rewardClaimBuckets.set(key, bucket);
    this.pruneRewardClaimBuckets();
    return false;
  }

  // Forget idle (fully refilled) buckets if the map grows large, e.g. under guest
  // id churn. Active throttled buckets are never below capacity, so they survive.
  private pruneRewardClaimBuckets() {
    if (this.rewardClaimBuckets.size <= 50_000) return;

    for (const [key, bucket] of this.rewardClaimBuckets) {
      if (bucket.tokens >= REWARD_CLAIM_BUCKET_CAPACITY) {
        this.rewardClaimBuckets.delete(key);
      }
    }
  }

  handleClose(socket: WebSocket) {
    this.releaseConnection(socket);
    this.releaseSessionForSocket(socket);

    const roomId = this.socketToRoom.get(socket);
    const playerId = this.socketToPlayer.get(socket);
    if (!roomId || !playerId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    console.log(`[PVP:${room.id}] player ${playerId} disconnected`);
    const wasWaitingForOpponent = this.isWaitingForOpponent(room);
    this.detachSocket(socket, room, playerId);

    if (room.ended) {
      this.deleteRoomIfEmpty(room);
      return;
    }

    if (wasWaitingForOpponent || room.battle?.status === "active") {
      this.schedulePlayerDisconnect(room, playerId, wasWaitingForOpponent);
      return;
    }

    this.deleteRoomIfEmpty(room);
  }

  private acquireGameSession(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "ACQUIRE_SESSION" }>
  ) {
    const accountId = message.accountId?.trim();
    const instanceId = message.instanceId?.trim();

    if (!accountId || !instanceId) {
      safeSend(socket, {
        type: "SESSION_DENIED",
        requestId: message.requestId,
        message: "Некорректная игровая сессия",
      });
      return;
    }

    if (
      accountId.startsWith(REGISTERED_USER_PREFIX) &&
      this.socketToAuthUser.get(socket) !== accountId
    ) {
      safeSend(socket, {
        type: "SESSION_DENIED",
        requestId: message.requestId,
        message: "Войдите в аккаунт, чтобы начать бой",
      });
      return;
    }

    // If this socket previously held a session for a different account (account
    // switch within the same tab), drop that stale lock first.
    const priorAccount = this.socketToSessionAccount.get(socket);
    if (priorAccount && priorAccount !== accountId) {
      const prior = this.activeGameSessions.get(priorAccount);
      if (prior && prior.socket === socket) {
        this.activeGameSessions.delete(priorAccount);
      }
    }

    const existing = this.activeGameSessions.get(accountId);
    const existingIsAlive =
      existing !== undefined &&
      existing.socket.readyState === existing.socket.OPEN;
    const existingIsOtherTab =
      existing !== undefined &&
      existing.socket !== socket &&
      existing.instanceId !== instanceId;

    if (existing && existingIsAlive && existingIsOtherTab) {
      safeSend(socket, {
        type: "SESSION_DENIED",
        requestId: message.requestId,
        message:
          "Игра уже запущена в другом окне или на другом устройстве. Завершите её, чтобы начать новый бой.",
      });
      return;
    }

    // Grant: brand new, same tab re-acquiring (e.g. after reload), or taking
    // over a session whose socket has already died.
    if (existing && existing.socket !== socket) {
      this.socketToSessionAccount.delete(existing.socket);
    }

    this.activeGameSessions.set(accountId, {
      socket,
      instanceId,
      kind: message.kind,
      since: Date.now(),
    });
    this.socketToSessionAccount.set(socket, accountId);

    safeSend(socket, { type: "SESSION_GRANTED", requestId: message.requestId });
  }

  private releaseGameSession(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "RELEASE_SESSION" }>
  ) {
    const accountId = message.accountId?.trim();
    if (!accountId) return;

    const existing = this.activeGameSessions.get(accountId);
    if (
      existing &&
      (existing.socket === socket || existing.instanceId === message.instanceId)
    ) {
      this.activeGameSessions.delete(accountId);
      this.socketToSessionAccount.delete(existing.socket);
    }
  }

  private releaseSessionForSocket(socket: WebSocket) {
    const accountId = this.socketToSessionAccount.get(socket);
    if (!accountId) return;

    const existing = this.activeGameSessions.get(accountId);
    if (existing && existing.socket === socket) {
      this.activeGameSessions.delete(accountId);
    }
    this.socketToSessionAccount.delete(socket);
  }

  private sendProfile(socket: WebSocket, requestId: string, playerId: string) {
    try {
      this.assertCanActAs(socket, playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId,
        profile: this.profiles.getProfile(playerId),
      });
    } catch (error) {
      this.sendProfileError(socket, requestId, error);
    }
  }

  private saveProfile(
    socket: WebSocket,
    requestId: string,
    playerId: string,
    profile: Extract<PvpClientMessage, { type: "SAVE_PROFILE" }>["profile"]
  ) {
    try {
      this.assertCanActAs(socket, playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId,
        profile: this.profiles.saveProfile(playerId, profile),
      });
    } catch (error) {
      this.sendProfileError(socket, requestId, error);
    }
  }

  private updateNickname(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "UPDATE_NICKNAME" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.updateNickname(message.playerId, message.nickname),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private updateFavoriteHeadquarters(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "UPDATE_FAVORITE_HEADQUARTERS" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.updateFavoriteHeadquarters(
          message.playerId,
          message.headquartersId
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private claimBattleReward(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "CLAIM_BATTLE_REWARD" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      // PvP rewards are only ever granted through CLAIM_PVP_BATTLE_REWARD, which
      // is tied to a real server-tracked match. Legit clients never claim a
      // "pvp" reward here, so reject it — otherwise a fabricated PvE battle could
      // claim the richer PvP payout tier.
      if (message.mode === "pvp") {
        throw new Error("Награды PvP начисляются только за завершённый матч");
      }
      if (this.isRewardClaimRateLimited(message.playerId)) {
        throw new Error(
          "Слишком часто запрашиваются награды — подождите немного"
        );
      }
      const { profile, reward } = this.profiles.claimBattleReward(
        message.playerId,
        {
          claimId: message.claimId,
          battle: message.battle,
          mode: message.mode,
          localPlayerId: message.localPlayerId,
          matchEndReason: message.matchEndReason,
        }
      );

      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile,
        reward,
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private claimPvpBattleReward(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "CLAIM_PVP_BATTLE_REWARD" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      const roomId = message.roomId.trim().toUpperCase();
      const completedMatch = this.completedPvpMatches.get(roomId);
      const currentRoom = this.rooms.get(roomId);
      const battle =
        completedMatch?.battle ??
        (currentRoom?.battle?.status === "player_won" ||
        currentRoom?.battle?.status === "bot_won"
          ? currentRoom.battle
          : null);
      const players =
        completedMatch?.players ??
        ({
          player: currentRoom?.players.player
            ? {
                profilePlayerId: currentRoom.players.player.profilePlayerId,
                deckWeight: currentRoom.players.player.deckWeight,
              }
            : undefined,
          bot: currentRoom?.players.bot
            ? {
                profilePlayerId: currentRoom.players.bot.profilePlayerId,
                deckWeight: currentRoom.players.bot.deckWeight,
              }
            : undefined,
        } satisfies CompletedPvpMatch["players"]);
      const endReason = completedMatch?.endReason ?? currentRoom?.endReason ?? null;

      if (!battle) {
        throw new Error("Finished PVP match was not found");
      }

      const localPlayerId = this.getPvpRewardPlayerId(
        players,
        message.playerId,
        message.localPlayerId
      );
      const opponentPlayerId = this.getOpponent(localPlayerId);
      const { profile, reward } = this.profiles.claimBattleReward(
        message.playerId,
        {
          claimId: `pvp:${roomId}:${localPlayerId}`,
          battle,
          mode: "pvp",
          localPlayerId,
          matchEndReason: endReason,
          localDeckWeight: players[localPlayerId]?.deckWeight ?? null,
          opponentDeckWeight: players[opponentPlayerId]?.deckWeight ?? null,
        }
      );

      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile,
        reward,
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private claimTutorialReward(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "CLAIM_TUTORIAL_REWARD" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      const { profile, reward } = this.profiles.claimTutorialReward(
        message.playerId,
        message.reward,
        message.localPlayerWon
      );

      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile,
        reward,
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private researchCard(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "RESEARCH_CARD" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.researchCard(
          message.playerId,
          message.cardId,
          message.sourceHeadquartersId
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private researchHeadquarters(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "RESEARCH_HEADQUARTERS" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.researchHeadquarters(
          message.playerId,
          message.headquartersId,
          message.sourceHeadquartersId
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private purchaseCardCopy(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "PURCHASE_CARD_COPY" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.purchaseCardCopy(message.playerId, message.cardId),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private purchaseHeadquarters(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "PURCHASE_HEADQUARTERS" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.purchaseHeadquarters(
          message.playerId,
          message.headquartersId
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private purchasePremiumCard(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "PURCHASE_PREMIUM_CARD" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.purchasePremiumCard(
          message.playerId,
          message.cardId
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private purchasePremiumDays(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "PURCHASE_PREMIUM_DAYS" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.purchasePremiumDays(
          message.playerId,
          message.days
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private exchangeGoldForIron(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "EXCHANGE_GOLD_FOR_IRON" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.exchangeGoldForIron(
          message.playerId,
          message.goldAmount
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private claimCampaignReward(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "CLAIM_CAMPAIGN_REWARD" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.claimCampaignReward(
          message.playerId,
          message.rewardId
        ),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private saveCustomDeck(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "SAVE_CUSTOM_DECK" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.saveCustomDeck(message.playerId, message.deck),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private deleteCustomDeck(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "DELETE_CUSTOM_DECK" }>
  ) {
    try {
      this.assertCanActAs(socket, message.playerId);
      safeSend(socket, {
        type: "PROFILE_UPDATED",
        requestId: message.requestId,
        profile: this.profiles.deleteCustomDeck(message.playerId, message.deckId),
      });
    } catch (error) {
      this.sendProfileError(socket, message.requestId, error);
    }
  }

  private async registerAccount(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "REGISTER_ACCOUNT" }>
  ) {
    try {
      const account = await this.accounts.register({
        username: message.username,
        password: message.password,
        email: message.email,
        legalAccepted: message.legalAccepted,
      });
      let profile =
        message.mergeGuestProgress && message.guestPlayerId
          ? this.profiles.mergeGuestProgress(account.userId, message.guestPlayerId)
          : this.profiles.getProfile(account.userId);

      if (normalizePromoCode(message.promoCode) === DASHA_PROMO_CODE) {
        // One redemption per device/IP — otherwise the promo mints unlimited
        // free gold (paid currency) across throwaway registrations.
        const ip = this.socketToIp.get(socket);
        const deviceId = message.guestPlayerId;

        if (!this.promoRedemptions.hasRedeemed(DASHA_PROMO_CODE, ip, deviceId)) {
          profile = this.profiles.adminCreditTracks({
            playerId: account.userId,
            ironTracks: 0,
            goldTracks: DASHA_PROMO_GOLD_TRACKS,
          });
          this.promoRedemptions.recordRedemption(DASHA_PROMO_CODE, ip, deviceId);
        } else {
          console.warn(
            `Promo "${DASHA_PROMO_CODE}" already redeemed for ip=${ip ?? "?"} device=${deviceId ?? "?"}; skipping credit`
          );
        }
      }

      this.socketToAuthUser.set(socket, account.userId);

      safeSend(socket, {
        type: "AUTH_RESULT",
        requestId: message.requestId,
        userId: account.userId,
        username: account.username,
        profile,
        sessionToken: createSessionToken(account.userId),
      });
    } catch (error) {
      this.sendAuthError(socket, message.requestId, error);
    }
  }

  private async loginAccount(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "LOGIN_ACCOUNT" }>
  ) {
    const ip = this.socketToIp.get(socket) ?? "unknown";

    if (this.isLoginBlocked(ip)) {
      this.sendAuthError(
        socket,
        message.requestId,
        new Error("Слишком много попыток входа. Повторите позже.")
      );
      return;
    }

    try {
      const account = await this.accounts.login(message.username, message.password);
      this.clearLoginAttempts(ip);
      const profile =
        message.mergeGuestProgress && message.guestPlayerId
          ? this.profiles.mergeGuestProgress(account.userId, message.guestPlayerId)
          : this.profiles.getProfile(account.userId);

      this.socketToAuthUser.set(socket, account.userId);

      safeSend(socket, {
        type: "AUTH_RESULT",
        requestId: message.requestId,
        userId: account.userId,
        username: account.username,
        profile,
        sessionToken: createSessionToken(account.userId),
      });
    } catch (error) {
      this.recordFailedLogin(ip);
      this.sendAuthError(socket, message.requestId, error);
    }
  }

  private authenticateSession(
    socket: WebSocket,
    message: Extract<PvpClientMessage, { type: "AUTHENTICATE" }>
  ) {
    const userId = verifySessionToken(message.token);
    if (!userId) {
      // Drop any stale binding and tell the client to discard its token.
      this.socketToAuthUser.delete(socket);
      this.sendAuthError(
        socket,
        message.requestId,
        new Error("Сессия недействительна, войдите заново")
      );
      return;
    }

    this.socketToAuthUser.set(socket, userId);
    safeSend(socket, {
      type: "AUTHENTICATED",
      requestId: message.requestId,
      userId,
    });
  }

  /**
   * Authorize a profile read/write against the socket's proven identity.
   *
   * Registered accounts (`user:` ids) are guessable from the public username, so
   * a socket may only touch such a profile after authenticating as exactly that
   * account. Guests are identified by an unguessable random id that doubles as a
   * bearer secret, so they are allowed through (and an empty/invalid id is left
   * for the downstream sanitizer to reject).
   */
  private assertCanActAs(socket: WebSocket, requestedPlayerId: string | undefined) {
    const id = (requestedPlayerId ?? "").trim();
    if (!id.startsWith(REGISTERED_USER_PREFIX)) return;

    if (this.socketToAuthUser.get(socket) !== id) {
      throw new Error("Войдите в аккаунт, чтобы изменять его данные");
    }
  }

  private sendProfileError(
    socket: WebSocket,
    requestId: string,
    error: unknown
  ) {
    console.error("Profile request failed:", error);
    safeSend(socket, {
      type: "PROFILE_ERROR",
      requestId,
      message: error instanceof Error ? error.message : "Profile request failed",
    });
  }

  private sendAuthError(
    socket: WebSocket,
    requestId: string,
    error: unknown
  ) {
    console.error("Auth request failed:", error);
    safeSend(socket, {
      type: "AUTH_ERROR",
      requestId,
      message: error instanceof Error ? error.message : "Auth request failed",
    });
  }

  private getPvpRewardPlayerId(
    players: CompletedPvpMatch["players"],
    profilePlayerId: string,
    requestedPlayerId?: PlayerId
  ): PlayerId {
    if (
      requestedPlayerId &&
      players[requestedPlayerId]?.profilePlayerId === profilePlayerId
    ) {
      return requestedPlayerId;
    }

    for (const candidateId of ["player", "bot"] as const) {
      if (players[candidateId]?.profilePlayerId === profilePlayerId) {
        return candidateId;
      }
    }

    throw new Error("Player did not participate in this PVP match");
  }

  private validateIncomingCustomDeck(
    profilePlayerId: string | undefined,
    headquartersId: HeadquartersId,
    deckCardIds: string[] | undefined
  ): string[] | null {
    if (deckCardIds === undefined) return null;
    if (!profilePlayerId) {
      throw new Error("Custom deck requires a player profile");
    }

    return this.profiles.validatePlayableDeck(
      profilePlayerId,
      headquartersId,
      deckCardIds
    );
  }

  private findMatch(
    socket: WebSocket,
    sessionId: string,
    profilePlayerId: string | undefined,
    headquartersId: HeadquartersId,
    deckCardIds?: string[]
  ) {
    const normalizedHeadquartersId = normalizeHeadquartersId(
      headquartersId,
      DEFAULT_PLAYER_HEADQUARTERS_ID
    );
    let normalizedDeckCardIds: string[] | null;

    try {
      normalizedDeckCardIds = this.validateIncomingCustomDeck(
        profilePlayerId,
        normalizedHeadquartersId,
        deckCardIds
      );
    } catch (error) {
      safeSend(socket, {
        type: "ERROR",
        message: error instanceof Error ? error.message : "Invalid custom deck",
      });
      return;
    }

    safeSend(socket, { type: "MATCHMAKING_STARTED" });

    const deckWeight = getDeckWeight(
      normalizedHeadquartersId,
      normalizedDeckCardIds
    );
    const waitingRoom = this.getCompatibleWaitingRoom(deckWeight);

    if (waitingRoom) {
      this.joinExistingWaitingRoom(
        socket,
        waitingRoom,
        sessionId,
        profilePlayerId,
        normalizedHeadquartersId,
        normalizedDeckCardIds ?? undefined
      );
      return;
    }

    this.createRoom(socket, sessionId, {
      makePublicWaiting: true,
      profilePlayerId,
      headquartersId: normalizedHeadquartersId,
      deckCardIds: normalizedDeckCardIds ?? undefined,
    });
  }

  private getCompatibleWaitingRoom(deckWeight: number): Room | null {
    const now = Date.now();
    let bestRoom: Room | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const room of this.rooms.values()) {
      if (!room.publicMatchmaking) continue;
      if (!this.isWaitingForOpponent(room)) continue;

      const player = room.players.player;
      const socket = player?.socket;
      if (!player || !socket || socket.readyState !== socket.OPEN) continue;

      // The arriving searcher has waited 0ms, so the band is governed by however
      // long the waiting room has already been queued.
      const roomElapsed = room.matchmakingStartedAt
        ? now - room.matchmakingStartedAt
        : 0;
      const tolerance = getMatchToleranceFraction(roomElapsed);
      const delta = getRelativeWeightDelta(player.deckWeight, deckWeight);
      if (delta > tolerance) continue;
      if (delta >= bestDelta) continue;

      bestRoom = room;
      bestDelta = delta;
    }

    return bestRoom;
  }

  // Re-pairs queued players whose tolerance bands now overlap. Runs on an
  // interval so expansion happens over time even when no new FIND_MATCH arrives.
  private sweepMatchmaking() {
    const now = Date.now();
    const waiting = [...this.rooms.values()]
      .filter((room) => {
        if (!room.publicMatchmaking) return false;
        if (!this.isWaitingForOpponent(room)) return false;
        const socket = room.players.player?.socket;
        return Boolean(socket && socket.readyState === socket.OPEN);
      })
      .sort(
        (a, b) => (a.matchmakingStartedAt ?? 0) - (b.matchmakingStartedAt ?? 0)
      );

    if (waiting.length < 2) return;

    const paired = new Set<string>();

    for (let i = 0; i < waiting.length; i += 1) {
      const host = waiting[i];
      if (paired.has(host.id)) continue;
      const hostPlayer = host.players.player;
      if (!hostPlayer) continue;
      const hostElapsed = host.matchmakingStartedAt
        ? now - host.matchmakingStartedAt
        : 0;

      let bestGuest: Room | null = null;
      let bestDelta = Number.POSITIVE_INFINITY;

      for (let j = i + 1; j < waiting.length; j += 1) {
        const guest = waiting[j];
        if (paired.has(guest.id)) continue;
        const guestPlayer = guest.players.player;
        if (!guestPlayer) continue;
        const guestElapsed = guest.matchmakingStartedAt
          ? now - guest.matchmakingStartedAt
          : 0;
        // The longer-waiting side relaxes the band for the pair.
        const tolerance = getMatchToleranceFraction(
          Math.max(hostElapsed, guestElapsed)
        );
        const delta = getRelativeWeightDelta(
          hostPlayer.deckWeight,
          guestPlayer.deckWeight
        );
        if (delta > tolerance) continue;
        if (delta >= bestDelta) continue;

        bestGuest = guest;
        bestDelta = delta;
      }

      if (bestGuest) {
        paired.add(host.id);
        paired.add(bestGuest.id);
        this.mergeWaitingRooms(host, bestGuest);
      }
    }
  }

  // Folds a second waiting room (`guest`) into `host` as the opponent, then
  // tears the now-empty guest room down and kicks off the match.
  private mergeWaitingRooms(host: Room, guest: Room) {
    const guestPlayer = guest.players.player;
    const guestSocket = guestPlayer?.socket;
    if (
      !guestPlayer ||
      !guestSocket ||
      guestSocket.readyState !== guestSocket.OPEN
    ) {
      return;
    }

    delete guest.players.player;
    if (this.waitingRoomId === guest.id) {
      this.waitingRoomId = null;
    }
    this.rooms.delete(guest.id);

    const botPlayer: RoomPlayer = { ...guestPlayer, id: "bot" };
    host.players.bot = botPlayer;
    host.publicMatchmaking = false;
    host.matchmakingStartedAt = null;
    if (this.waitingRoomId === host.id) {
      this.waitingRoomId = null;
    }

    this.bindSocket(guestSocket, host, "bot");
    this.sessionToRoom.set(botPlayer.sessionId, {
      roomId: host.id,
      playerId: "bot",
    });

    safeSend(guestSocket, {
      type: "ROOM_JOINED",
      roomId: host.id,
      playerId: "bot",
    });

    this.startFirstTurnRoll(host);
  }

  private createRoom(
    socket: WebSocket,
    sessionId: string,
    options?: {
      makePublicWaiting?: boolean;
      profilePlayerId?: string;
      headquartersId?: HeadquartersId;
      deckCardIds?: string[];
    }
  ) {
    let roomId = createRoomId();
    while (this.rooms.has(roomId)) {
      roomId = createRoomId();
    }

    const playerHeadquartersId = normalizeHeadquartersId(
      options?.headquartersId,
      DEFAULT_PLAYER_HEADQUARTERS_ID
    );
    let playerDeckCardIds: string[] | null;

    try {
      playerDeckCardIds = this.validateIncomingCustomDeck(
        options?.profilePlayerId,
        playerHeadquartersId,
        options?.deckCardIds
      );
    } catch (error) {
      safeSend(socket, {
        type: "ERROR",
        message: error instanceof Error ? error.message : "Invalid custom deck",
      });
      return;
    }

    const room: Room = {
      id: roomId,
      players: {
        player: this.createRoomPlayer(
          "player",
          socket,
          sessionId,
          options?.profilePlayerId ?? null,
          playerHeadquartersId,
          playerDeckCardIds
        ),
      },
      publicMatchmaking: Boolean(options?.makePublicWaiting),
      matchmakingStartedAt: options?.makePublicWaiting ? Date.now() : null,
      battle: null,
      pendingStartRoll: null,
      pendingMovement: null,
      pendingAttack: null,
      pendingDeployBarrage: null,
      turnTimer: null,
      ended: false,
      winner: null,
      endReason: null,
      cleanupTimer: null,
    };

    this.rooms.set(roomId, room);
    this.bindSocket(socket, room, "player");
    this.sessionToRoom.set(sessionId, { roomId, playerId: "player" });

    if (options?.makePublicWaiting) {
      this.waitingRoomId = roomId;
    }

    safeSend(socket, { type: "ROOM_CREATED", roomId, playerId: "player" });
    safeSend(socket, { type: "WAITING_FOR_OPPONENT", roomId });
  }

  private joinExistingWaitingRoom(
    socket: WebSocket,
    room: Room,
    sessionId: string,
    profilePlayerId: string | undefined,
    headquartersId: HeadquartersId,
    deckCardIds?: string[]
  ) {
    const botHeadquartersId = normalizeHeadquartersId(
      headquartersId,
      DEFAULT_BOT_HEADQUARTERS_ID
    );
    let botDeckCardIds: string[] | null;

    try {
      botDeckCardIds = this.validateIncomingCustomDeck(
        profilePlayerId,
        botHeadquartersId,
        deckCardIds
      );
    } catch (error) {
      safeSend(socket, {
        type: "ERROR",
        message: error instanceof Error ? error.message : "Invalid custom deck",
      });
      return;
    }

    if (this.waitingRoomId === room.id) {
      this.waitingRoomId = null;
    }
    room.publicMatchmaking = false;

    room.players.bot = this.createRoomPlayer(
      "bot",
      socket,
      sessionId,
      profilePlayerId ?? null,
      botHeadquartersId,
      botDeckCardIds
    );
    this.bindSocket(socket, room, "bot");
    this.sessionToRoom.set(sessionId, { roomId: room.id, playerId: "bot" });

    safeSend(socket, { type: "ROOM_JOINED", roomId: room.id, playerId: "bot" });

    this.startFirstTurnRoll(room);
  }

  private joinRoom(
    socket: WebSocket,
    unsafeRoomId: string,
    sessionId: string,
    profilePlayerId: string | undefined,
    headquartersId: HeadquartersId,
    deckCardIds?: string[]
  ) {
    const roomId = unsafeRoomId.trim().toUpperCase();
    const room = this.rooms.get(roomId);

    if (!room) {
      safeSend(socket, { type: "ERROR", message: "Комната не найдена" });
      return;
    }

    if (room.players.bot) {
      safeSend(socket, { type: "ERROR", message: "Комната уже заполнена" });
      return;
    }

    const botHeadquartersId = normalizeHeadquartersId(
      headquartersId,
      DEFAULT_BOT_HEADQUARTERS_ID
    );
    let botDeckCardIds: string[] | null;

    try {
      botDeckCardIds = this.validateIncomingCustomDeck(
        profilePlayerId,
        botHeadquartersId,
        deckCardIds
      );
    } catch (error) {
      safeSend(socket, {
        type: "ERROR",
        message: error instanceof Error ? error.message : "Invalid custom deck",
      });
      return;
    }

    if (this.waitingRoomId === roomId) {
      this.waitingRoomId = null;
    }
    room.publicMatchmaking = false;

    room.players.bot = this.createRoomPlayer(
      "bot",
      socket,
      sessionId,
      profilePlayerId ?? null,
      botHeadquartersId,
      botDeckCardIds
    );
    this.bindSocket(socket, room, "bot");
    this.sessionToRoom.set(sessionId, { roomId, playerId: "bot" });

    safeSend(socket, { type: "ROOM_JOINED", roomId, playerId: "bot" });

    this.startFirstTurnRoll(room);
  }

  private startFirstTurnRoll(room: Room) {
    if (room.ended) return;
    if (!room.players.player || !room.players.bot) return;
    if (!room.players.player.socket || !room.players.bot.socket) return;

    const firstPlayer = getRandomStartingPlayer();
    const startsAt = Date.now();
    const revealAt = startsAt + START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS;
    const gameStartDelay = START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS + START_ROLL_FINISH_DELAY_MS;

    console.log(
      `[PVP:${room.id}] match found; first turn roll: ${firstPlayer === "player" ? "player 1" : "player 2"}`,
    );

    room.battle = createStartedBattle(
      firstPlayer,
      room.players.player.headquartersId,
      room.players.bot.headquartersId,
      room.players.player.deckCardIds,
      room.players.bot.deckCardIds
    );

    room.pendingStartRoll = {
      firstPlayer,
      startsAt,
      revealAt,
      startTimer: setTimeout(() => {
        this.finishFirstTurnRoll(room.id);
      }, gameStartDelay),
    };

    this.broadcastFirstTurnRoll(room, firstPlayer, startsAt, revealAt);
  }

  private finishFirstTurnRoll(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || !room.pendingStartRoll) return;
    if (room.ended) return;
    if (!room.players.player || !room.players.bot) return;

    if (!room.battle) {
      room.battle = createStartedBattle(
        room.pendingStartRoll.firstPlayer,
        room.players.player.headquartersId,
        room.players.bot.headquartersId,
        room.players.player.deckCardIds,
        room.players.bot.deckCardIds
      );
    }
    room.pendingStartRoll = null;

    this.sendGameStarted(room, "player");
    this.sendGameStarted(room, "bot");

    this.restartTurnTimer(room);
  }

  private applyGameAction(socket: WebSocket, action: BattleAction) {
    const roomId = this.socketToRoom.get(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!roomId || !playerId) {
      safeSend(socket, { type: "ERROR", message: "Сначала найди PVP-матч" });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room || !room.battle) {
      safeSend(socket, { type: "ERROR", message: "Бой еще не начался" });
      return;
    }

    if (room.ended) {
      safeSend(socket, { type: "ERROR", message: "Бой уже завершен" });
      return;
    }

    if (room.battle.status !== "active") {
      safeSend(socket, { type: "ERROR", message: "Бой уже завершен" });
      return;
    }

    if (action.type === "TIMER_TICK" || action.type === "BEGIN_BATTLE") {
      safeSend(socket, { type: "ERROR", message: "Клиент не управляет PVP-таймером" });
      return;
    }

    if (room.battle.activePlayer !== playerId) {
      safeSend(socket, { type: "ERROR", message: "Сейчас ход противника" });
      return;
    }

    const safeAction = overwritePlayerId(action, playerId);

    if (room.pendingMovement || room.pendingAttack || room.pendingDeployBarrage) {
      safeSend(socket, { type: "ERROR", message: "Дождитесь завершения текущей анимации" });
      return;
    }

    if (safeAction.type === "MOVE_UNIT") {
      this.scheduleMovement(room, playerId, safeAction);
      return;
    }

    if (safeAction.type === "ATTACK") {
      this.scheduleAttack(room, playerId, safeAction);
      return;
    }

    if (
      safeAction.type === "PLAY_CARD" ||
      safeAction.type === "PLAY_SUPPORT_CARD"
    ) {
      if (this.scheduleDeployBarrage(room, playerId, safeAction)) {
        return;
      }
    }

    this.commitGameAction(room, playerId, safeAction);
  }

  private commitGameAction(room: Room, playerId: PlayerId, action: BattleAction) {
    if (!room.battle) return;

    const previousActivePlayer = room.battle.activePlayer;
    this.broadcastCardSelection(room, playerId, null);

    room.battle = applyAction(room.battle, action);

    this.broadcastBattleState(room);

    if (room.battle.status !== "active") {
      this.clearTurnTimer(room);
      this.finishNaturallyCompletedBattle(room);
      return;
    }

    if (
      action.type === "END_TURN" ||
      room.battle.activePlayer !== previousActivePlayer
    ) {
      this.restartTurnTimer(room);
    }
  }

  private scheduleMovement(
    room: Room,
    playerId: PlayerId,
    action: Extract<BattleAction, { type: "MOVE_UNIT" }>,
    queuedActions: Extract<BattleAction, { type: "MOVE_UNIT" }>[] = []
  ) {
    if (!room.battle) return;

    const unitBeforeMove = room.battle.units.find(
      (unit) => unit.instanceId === action.unitId
    );
    const validatedBattle = applyAction(room.battle, action);
    const validatedUnitAfterMove = validatedBattle.units.find(
      (unit) => unit.instanceId === action.unitId
    );

    if (!unitBeforeMove || !validatedUnitAfterMove) return;
    if (
      unitBeforeMove.position.row === validatedUnitAfterMove.position.row &&
      unitBeforeMove.position.col === validatedUnitAfterMove.position.col
    ) {
      return;
    }

    const intermediate =
      getCard(unitBeforeMove.cardId).class === "light"
        ? getStraightTwoCellIntermediate(
            unitBeforeMove.position,
            action.position
          )
        : null;
    const stepAction = intermediate
      ? {
          ...action,
          position: intermediate,
        }
      : action;
    const remainingActions = intermediate
      ? [action, ...queuedActions]
      : queuedActions;
    const nextBattle = applyAction(room.battle, stepAction);
    const unitAfterStep = nextBattle.units.find(
      (unit) => unit.instanceId === action.unitId
    );

    if (!unitAfterStep) return;
    if (
      unitBeforeMove.position.row === unitAfterStep.position.row &&
      unitBeforeMove.position.col === unitAfterStep.position.col
    ) {
      return;
    }

    this.broadcastCardSelection(room, playerId, null);

    this.movementIntentSequence += 1;
    const intentId = `${room.id}-${this.movementIntentSequence}`;

    room.pendingMovement = {
      intentId,
      playerId,
      action: stepAction,
      queuedActions: remainingActions,
      timeoutId: setTimeout(() => {
        this.commitMovement(room.id, intentId);
      }, PVP_MOVE_INTENT_DURATION_MS),
    };

    this.broadcastSame(room, {
      type: "MOVE_INTENT",
      intentId,
      playerId,
      unitId: action.unitId,
      position: stepAction.position,
      durationMs: PVP_MOVE_INTENT_DURATION_MS,
    });
  }

  private commitMovement(roomId: string, intentId: string) {
    const room = this.rooms.get(roomId);

    if (!room || !room.battle) return;
    if (!room.pendingMovement || room.pendingMovement.intentId !== intentId) return;

    const { playerId, action, queuedActions } = room.pendingMovement;
    room.pendingMovement = null;

    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== playerId) return;

    this.commitGameAction(room, playerId, action);

    const nextAction = queuedActions[0];

    if (nextAction && room.battle?.status === "active") {
      this.scheduleMovement(room, playerId, nextAction, queuedActions.slice(1));
    }
  }

  private scheduleAttack(
    room: Room,
    playerId: PlayerId,
    action: Extract<BattleAction, { type: "ATTACK" }>
  ) {
    if (!room.battle) return;

    const strikes = getAttackAnimationSequence(room.battle, action);

    if (strikes.length === 0) return;

    const nextBattle = applyAction(room.battle, action);
    const unitWasDestroyed = room.battle.units.some(
      (unit) =>
        !nextBattle.units.some(
          (nextUnit) => nextUnit.instanceId === unit.instanceId
        )
    );
    const headquartersWasDestroyed =
      room.battle.status === "active" && nextBattle.status !== "active";

    this.broadcastCardSelection(room, playerId, null);

    this.attackIntentSequence += 1;
    const intentId = `${room.id}-attack-${this.attackIntentSequence}`;
    const durationMs =
      strikes.length * PVP_ATTACK_STRIKE_DURATION_MS +
      (unitWasDestroyed || headquartersWasDestroyed
        ? PVP_DESTROYED_CARD_ANIMATION_MS
        : 0);

    room.pendingAttack = {
      intentId,
      playerId,
      action,
      timeoutId: setTimeout(() => {
        this.commitAttack(room.id, intentId);
      }, durationMs),
    };

    this.broadcastSame(room, {
      type: "ATTACK_INTENT",
      intentId,
      playerId,
      strikes,
      durationMs,
    });
  }

  private commitAttack(roomId: string, intentId: string) {
    const room = this.rooms.get(roomId);

    if (!room || !room.battle) return;
    if (!room.pendingAttack || room.pendingAttack.intentId !== intentId) return;

    const { playerId, action } = room.pendingAttack;
    room.pendingAttack = null;

    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== playerId) return;

    this.commitGameAction(room, playerId, action);
  }

  private createHpSnapshot(battle: BattleState): Map<string, number> {
    const hp = new Map<string, number>();

    for (const unit of battle.units) {
      hp.set(unit.instanceId, unit.currentHp - (unit.supplyHpApplied ?? 0));
    }

    hp.set("player_hq", battle.headquarters.player.hp);
    hp.set("bot_hq", battle.headquarters.bot.hp);

    return hp;
  }

  private scheduleDeployBarrage(
    room: Room,
    playerId: PlayerId,
    action: Extract<BattleAction, { type: "PLAY_CARD" | "PLAY_SUPPORT_CARD" }>
  ): boolean {
    if (!room.battle) return false;

    const playedInstance = room.battle[playerId].hand.find(
      (item) => item.instanceId === action.cardInstanceId
    );
    if (!playedInstance) return false;

    const playedCard = getCard(playedInstance.cardId);
    if ((playedCard.onPlayEffects?.deployDamage?.amount ?? 0) <= 0) return false;

    const before = this.createHpSnapshot(room.battle);
    const nextBattle = applyAction(room.battle, action);
    const after = this.createHpSnapshot(nextBattle);
    const shots: { targetId: string; damage: number; destroyed: boolean }[] = [];

    for (const [targetId, previousHp] of before.entries()) {
      if (targetId === action.cardInstanceId) continue;

      const currentHp = after.get(targetId) ?? 0;
      if (currentHp >= previousHp) continue;

      shots.push({
        targetId,
        damage: previousHp - currentHp,
        destroyed: currentHp <= 0,
      });
    }

    if (shots.length === 0) return false;

    this.broadcastCardSelection(room, playerId, null);

    this.deployBarrageIntentSequence += 1;
    const intentId = `${room.id}-deploy-${this.deployBarrageIntentSequence}`;
    const shotSequenceMs =
      PVP_DEPLOY_BARRAGE_FIRST_SHOT_MS +
      Math.max(0, shots.length - 1) * PVP_DEPLOY_BARRAGE_SHOT_STAGGER_MS;
    const impactSequenceMs = shots.some((shot) => shot.destroyed)
      ? PVP_DEPLOY_BARRAGE_DESTROY_START_DELAY_MS +
        PVP_DEPLOY_BARRAGE_DESTROYED_MS
      : PVP_DEPLOY_BARRAGE_DAMAGE_SETTLE_MS;
    const durationMs =
      PVP_DEPLOY_BARRAGE_SPAWN_MS +
      shotSequenceMs +
      impactSequenceMs;

    room.pendingDeployBarrage = {
      intentId,
      playerId,
      action,
      timeoutId: setTimeout(() => {
        this.commitDeployBarrage(room.id, intentId);
      }, durationMs),
    };

    this.broadcastSame(room, {
      type: "DEPLOY_BARRAGE_INTENT",
      intentId,
      playerId,
      cardInstanceId: action.cardInstanceId,
      cardId: playedInstance.cardId,
      source:
        action.type === "PLAY_CARD"
          ? { type: "battlefield", position: action.position }
          : { type: "support", supportSlot: action.supportSlot },
      shots,
      durationMs,
    });

    return true;
  }

  private commitDeployBarrage(roomId: string, intentId: string) {
    const room = this.rooms.get(roomId);

    if (!room || !room.battle) return;
    if (
      !room.pendingDeployBarrage ||
      room.pendingDeployBarrage.intentId !== intentId
    ) {
      return;
    }

    const { playerId, action } = room.pendingDeployBarrage;
    room.pendingDeployBarrage = null;

    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== playerId) return;

    this.commitGameAction(room, playerId, action);
  }

  private updateCardSelection(socket: WebSocket, cardInstanceId: string | null) {
    const room = this.getRoomBySocket(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!room || !playerId || !room.battle) return;
    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== playerId) return;

    if (
      cardInstanceId !== null &&
      !room.battle[playerId].hand.some((card) => card.instanceId === cardInstanceId)
    ) {
      return;
    }

    this.broadcastCardSelection(room, playerId, cardInstanceId);
  }

  private surrenderMatch(socket: WebSocket) {
    const room = this.getRoomBySocket(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!room || !playerId) {
      safeSend(socket, { type: "ERROR", message: "Сначала найди PVP-матч" });
      return;
    }

    if (room.ended) return;

    if (!room.battle || room.battle.status !== "active") {
      safeSend(socket, { type: "ERROR", message: "Сдаться можно только во время боя" });
      return;
    }

    console.log(`[PVP:${room.id}] player ${playerId} surrendered`);
    this.finishMatchByPlayerExit(room, playerId, "surrender");
  }

  private leaveMatch(socket: WebSocket) {
    const room = this.getRoomBySocket(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!room || !playerId) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      return;
    }

    if (room.ended) {
      this.releaseSocket(socket, room, playerId);
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      this.deleteRoomIfEmpty(room);
      return;
    }

    if (this.isWaitingForOpponent(room)) {
      this.cancelWaitingRoom(room, socket);
      return;
    }

    if (room.battle?.status === "active") {
      console.log(`[PVP:${room.id}] player ${playerId} left`);
      this.finishMatchByPlayerExit(room, playerId, "leave");
      return;
    }

    this.releaseSocket(socket, room, playerId);
    safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
    this.deleteRoomIfEmpty(room);
  }

  private cancelMatchmaking(socket: WebSocket) {
    const room = this.getRoomBySocket(socket);

    if (!room) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      return;
    }

    if (room.ended) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      return;
    }

    if (!this.isWaitingForOpponent(room)) {
      this.leaveMatch(socket);
      return;
    }

    this.cancelWaitingRoom(room, socket);
  }

  private reconnect(socket: WebSocket, sessionId: string, requestedRoomId?: string | null) {
    const match = this.findRoomBySession(sessionId, requestedRoomId);

    if (!match) {
      safeSend(socket, {
        type: "RECONNECT_FAILED",
        message: "PVP-матч для восстановления не найден",
      });
      return;
    }

    const { room, playerId } = match;
    const player = room.players[playerId];

    if (!player) {
      safeSend(socket, {
        type: "RECONNECT_FAILED",
        message: "Игрок в PVP-комнате не найден",
      });
      return;
    }

    if (player.socket && player.socket !== socket) {
      this.socketToRoom.delete(player.socket);
      this.socketToPlayer.delete(player.socket);
      player.socket.close();
    }

    player.socket = socket;
    player.disconnectedAt = null;

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }

    this.bindSocket(socket, room, playerId);
    this.sessionToRoom.set(sessionId, { roomId: room.id, playerId });

    console.log(`[PVP:${room.id}] player ${playerId} reconnected`);

    if (this.isWaitingForOpponent(room)) {
      if (room.publicMatchmaking) {
        this.waitingRoomId = room.id;
      }
      safeSend(socket, { type: "ROOM_CREATED", roomId: room.id, playerId });
      safeSend(socket, { type: "WAITING_FOR_OPPONENT", roomId: room.id });
      return;
    }

    if (room.pendingStartRoll && room.battle) {
      safeSend(socket, {
        type: playerId === "player" ? "ROOM_CREATED" : "ROOM_JOINED",
        roomId: room.id,
        playerId,
      });
      this.sendFirstTurnRoll(
        room,
        playerId,
        room.pendingStartRoll.firstPlayer,
        room.pendingStartRoll.startsAt,
        room.pendingStartRoll.revealAt,
      );
      return;
    }

    if (!room.battle) {
      safeSend(socket, {
        type: "RECONNECT_FAILED",
        message: "Бой еще не начался",
      });
      return;
    }

    safeSend(socket, {
      type: "RECONNECTED",
      roomId: room.id,
      playerId,
      battle: createBattleViewForPlayer(room.battle, playerId),
      opponentNickname: this.getOpponentNickname(room, playerId),
    });

    this.sendTurnTimer(room, playerId);

    if (room.ended && room.winner && room.endReason) {
      safeSend(socket, {
        type: "MATCH_ENDED",
        winner: room.winner,
        reason: room.endReason,
      });
    }
  }

  private getRoomBySocket(socket: WebSocket): Room | null {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) return null;

    return this.rooms.get(roomId) ?? null;
  }

  private findRoomBySession(
    sessionId: string,
    requestedRoomId?: string | null
  ): { room: Room; playerId: PlayerId } | null {
    const binding = this.sessionToRoom.get(sessionId);
    const roomId = requestedRoomId?.trim().toUpperCase() || binding?.roomId;
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.sessionToRoom.delete(sessionId);
      return null;
    }

    const playerId = binding?.roomId === roomId ? binding.playerId : null;

    if (playerId && room.players[playerId]?.sessionId === sessionId) {
      return { room, playerId };
    }

    for (const candidateId of ["player", "bot"] as const) {
      if (room.players[candidateId]?.sessionId === sessionId) {
        return { room, playerId: candidateId };
      }
    }

    return null;
  }

  private createRoomPlayer(
    id: PlayerId,
    socket: WebSocket,
    sessionId: string,
    profilePlayerId: string | null,
    headquartersId: HeadquartersId,
    deckCardIds: string[] | null
  ): RoomPlayer {
    return {
      id,
      profilePlayerId,
      headquartersId,
      deckCardIds,
      deckWeight: getDeckWeight(headquartersId, deckCardIds),
      socket,
      sessionId,
      disconnectTimer: null,
      disconnectedAt: null,
    };
  }

  private bindSocket(socket: WebSocket, room: Room, playerId: PlayerId) {
    this.socketToRoom.set(socket, room.id);
    this.socketToPlayer.set(socket, playerId);
  }

  private getOpponent(playerId: PlayerId): PlayerId {
    return playerId === "player" ? "bot" : "player";
  }

  private getOpponentNickname(room: Room, playerId: PlayerId): string | null {
    const opponent = room.players[this.getOpponent(playerId)];
    if (!opponent?.profilePlayerId) return null;

    return this.profiles.getProfile(opponent.profilePlayerId).nickname ?? null;
  }

  private isWaitingForOpponent(room: Room): boolean {
    return !room.battle && !room.pendingStartRoll && Boolean(room.players.player) && !room.players.bot;
  }

  private detachSocket(socket: WebSocket, room: Room, playerId: PlayerId) {
    const player = room.players[playerId];

    if (player?.socket === socket) {
      player.socket = null;
      player.disconnectedAt = Date.now();
    }

    this.socketToRoom.delete(socket);
    this.socketToPlayer.delete(socket);
  }

  private releaseSocket(socket: WebSocket, room: Room, playerId: PlayerId) {
    const player = room.players[playerId];

    if (player?.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
    }

    if (player) {
      this.sessionToRoom.delete(player.sessionId);
    }

    delete room.players[playerId];
    this.socketToRoom.delete(socket);
    this.socketToPlayer.delete(socket);
  }

  private schedulePlayerDisconnect(
    room: Room,
    playerId: PlayerId,
    wasWaitingForOpponent: boolean
  ) {
    const player = room.players[playerId];
    if (!player) return;

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
    }

    player.disconnectTimer = setTimeout(() => {
      this.handlePlayerDisconnectTimeout(room.id, playerId, wasWaitingForOpponent);
    }, RECONNECT_GRACE_MS);
  }

  private handlePlayerDisconnectTimeout(
    roomId: string,
    playerId: PlayerId,
    wasWaitingForOpponent: boolean
  ) {
    const room = this.rooms.get(roomId);
    const player = room?.players[playerId];

    if (!room || !player || player.socket) return;

    player.disconnectTimer = null;

    if (room.ended) {
      this.deleteRoomIfEmpty(room);
      return;
    }

    if (wasWaitingForOpponent || this.isWaitingForOpponent(room)) {
      this.cancelWaitingRoom(room);
      return;
    }

    if (room.battle?.status === "active") {
      this.finishMatchByPlayerExit(room, playerId, "disconnect");
      return;
    }

    this.sessionToRoom.delete(player.sessionId);
    delete room.players[playerId];
    this.deleteRoomIfEmpty(room);
  }

  private clearRoomSessions(room: Room) {
    for (const player of Object.values(room.players)) {
      if (!player) continue;

      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
      }

      if (player.socket) {
        this.socketToRoom.delete(player.socket);
        this.socketToPlayer.delete(player.socket);
      }

      this.sessionToRoom.delete(player.sessionId);
    }
  }

  private cancelWaitingRoom(room: Room, notifySocket?: WebSocket) {
    room.publicMatchmaking = false;
    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);
    this.clearPendingMovement(room);
    this.clearPendingAttack(room);
    this.clearPendingDeployBarrage(room);

    if (this.waitingRoomId === room.id) {
      this.waitingRoomId = null;
    }

    console.log(`[PVP:${room.id}] matchmaking cancelled`);

    const sockets = Object.values(room.players).flatMap((player) =>
      player?.socket ? [player.socket] : [],
    );

    this.clearRoomSessions(room);
    this.rooms.delete(room.id);

    for (const socket of sockets) {
      safeSend(socket, { type: "MATCHMAKING_CANCELLED" });
      this.socketToRoom.delete(socket);
      this.socketToPlayer.delete(socket);
    }

    if (notifySocket && !sockets.includes(notifySocket)) {
      safeSend(notifySocket, { type: "MATCHMAKING_CANCELLED" });
    }
  }

  private getBattleWinnerPlayerId(battle: BattleState): PlayerId | null {
    if (battle.status === "player_won") return "player";
    if (battle.status === "bot_won") return "bot";
    return null;
  }

  private rememberCompletedPvpMatch(
    room: Room,
    endReason: MatchEndReason | null
  ) {
    if (!room.battle) return;
    if (room.battle.status !== "player_won" && room.battle.status !== "bot_won") {
      return;
    }

    const previousMatch = this.completedPvpMatches.get(room.id);
    if (previousMatch) {
      clearTimeout(previousMatch.timeoutId);
    }

    const timeoutId = setTimeout(() => {
      this.completedPvpMatches.delete(room.id);
    }, PVP_REWARD_CLAIM_TTL_MS);

    this.completedPvpMatches.set(room.id, {
      roomId: room.id,
      battle: structuredClone(room.battle),
      endReason,
      players: {
        player: room.players.player
          ? {
              profilePlayerId: room.players.player.profilePlayerId,
              deckWeight: room.players.player.deckWeight,
            }
          : undefined,
        bot: room.players.bot
          ? {
              profilePlayerId: room.players.bot.profilePlayerId,
              deckWeight: room.players.bot.deckWeight,
            }
          : undefined,
      },
      timeoutId,
    });
  }

  private finishNaturallyCompletedBattle(room: Room) {
    if (!room.battle) return;

    const winner = this.getBattleWinnerPlayerId(room.battle);
    if (!winner) return;

    room.ended = true;
    room.winner = winner;
    room.endReason = null;
    this.rememberCompletedPvpMatch(room, null);
    this.scheduleRoomCleanup(room.id);
  }

  private finishMatchByPlayerExit(room: Room, loser: PlayerId, reason: MatchEndReason) {
    if (room.ended) return;
    if (!room.battle) return;

    const winner = this.getOpponent(loser);
    const status = winner === "player" ? "player_won" : "bot_won";
    const reasonText =
      reason === "surrender"
        ? `${loser === "player" ? "Игрок" : "Противник"} сдался.`
        : reason === "disconnect"
          ? `${loser === "player" ? "Игрок" : "Противник"} покинул бой.`
          : `${loser === "player" ? "Игрок" : "Противник"} вышел из боя.`;

    room.ended = true;
    room.winner = winner;
    room.endReason = reason;
    room.battle = {
      ...room.battle,
      status,
      log: [...room.battle.log, reasonText],
    };

    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);
    this.clearPendingMovement(room);
    this.clearPendingAttack(room);
    this.clearPendingDeployBarrage(room);
    this.rememberCompletedPvpMatch(room, reason);
    this.broadcastBattleState(room);
    this.broadcastMatchEnded(room, winner, reason);
    this.scheduleRoomCleanup(room.id);

    console.log(`[PVP:${room.id}] winner is ${winner}`);
  }

  private broadcastMatchEnded(room: Room, winner: PlayerId, reason: MatchEndReason) {
    this.broadcastSame(room, {
      type: "MATCH_ENDED",
      winner,
      reason,
    });
  }

  private clearPendingStartRoll(room: Room) {
    if (!room.pendingStartRoll) return;

    clearTimeout(room.pendingStartRoll.startTimer);
    room.pendingStartRoll = null;
  }

  private clearPendingMovement(room: Room) {
    if (!room.pendingMovement) return;

    clearTimeout(room.pendingMovement.timeoutId);
    room.pendingMovement = null;
  }

  private clearPendingAttack(room: Room) {
    if (!room.pendingAttack) return;

    clearTimeout(room.pendingAttack.timeoutId);
    room.pendingAttack = null;
  }

  private clearPendingDeployBarrage(room: Room) {
    if (!room.pendingDeployBarrage) return;

    clearTimeout(room.pendingDeployBarrage.timeoutId);
    room.pendingDeployBarrage = null;
  }

  private scheduleRoomCleanup(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.cleanupTimer) return;

    room.cleanupTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomId);
      if (!currentRoom) return;

      this.clearTurnTimer(currentRoom);
      this.clearPendingStartRoll(currentRoom);
      this.clearPendingMovement(currentRoom);
      this.clearPendingAttack(currentRoom);
      this.clearPendingDeployBarrage(currentRoom);
      this.clearRoomSessions(currentRoom);
      this.rooms.delete(roomId);
      console.log(`[PVP:${roomId}] room cleaned`);
    }, ROOM_CLEANUP_DELAY_MS);
  }

  private deleteRoomIfEmpty(room: Room) {
    if (room.players.player || room.players.bot) return;

    room.publicMatchmaking = false;
    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);
    this.clearPendingMovement(room);
    this.clearPendingAttack(room);
    this.clearPendingDeployBarrage(room);

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }

    if (this.waitingRoomId === room.id) {
      this.waitingRoomId = null;
    }

    this.clearRoomSessions(room);
    this.rooms.delete(room.id);
    console.log(`[PVP:${room.id}] room cleaned`);
  }

  private restartTurnTimer(room: Room) {
    this.clearTurnTimer(room);

    if (room.ended || !room.battle || room.battle.status !== "active") {
      return;
    }

    const activePlayer = room.battle.activePlayer;
    const startedAt = Date.now();
    const timer: PvpTurnTimer = {
      activePlayer,
      startedAt,
      endsAt: startedAt + PVP_TURN_DURATION_MS,
      durationMs: PVP_TURN_DURATION_MS,
      timeoutId: null,
      intervalId: null,
    };

    room.turnTimer = timer;

    timer.timeoutId = setTimeout(() => {
      this.handleTurnTimeout(room.id, activePlayer);
    }, PVP_TURN_DURATION_MS);

    timer.intervalId = setInterval(() => {
      this.broadcastTurnTimer(room);
    }, PVP_TURN_TIMER_BROADCAST_INTERVAL_MS);

    console.log(`[PVP:${room.id}] timer started for ${activePlayer}`);
    this.broadcastTurnTimer(room);
  }

  private clearTurnTimer(room: Room) {
    if (!room.turnTimer) return;

    if (room.turnTimer.timeoutId) {
      clearTimeout(room.turnTimer.timeoutId);
    }

    if (room.turnTimer.intervalId) {
      clearInterval(room.turnTimer.intervalId);
    }

    room.turnTimer = null;
    console.log(`[PVP:${room.id}] timer cleared`);
  }

  private broadcastTurnTimer(room: Room) {
    if (room.ended) return;
    if (!room.turnTimer) return;

    this.sendTurnTimer(room, "player");
    this.sendTurnTimer(room, "bot");
  }

  private sendTurnTimer(room: Room, playerId: PlayerId) {
    if (room.ended) return;
    if (!room.turnTimer) return;

    safeSend(room.players[playerId]?.socket, {
      type: "TURN_TIMER",
      activePlayer: room.turnTimer.activePlayer,
      remainingMs: Math.max(0, room.turnTimer.endsAt - Date.now()),
      endsAt: room.turnTimer.endsAt,
      durationMs: room.turnTimer.durationMs,
    });
  }

  private handleTurnTimeout(roomId: string, expectedPlayer: PlayerId) {
    const room = this.rooms.get(roomId);

    if (!room || !room.battle) return;
    if (room.ended) return;
    if (room.battle.status !== "active") return;
    if (room.battle.activePlayer !== expectedPlayer) return;

    if (room.pendingAttack || room.pendingMovement || room.pendingDeployBarrage) {
      if (room.turnTimer) {
        room.turnTimer.timeoutId = setTimeout(() => {
          this.handleTurnTimeout(room.id, expectedPlayer);
        }, 100);
      }

      return;
    }

    console.log(`[PVP:${room.id}] timer timeout for ${expectedPlayer}`);

    this.clearPendingMovement(room);
    this.clearPendingAttack(room);
    this.clearPendingDeployBarrage(room);
    this.broadcastCardSelection(room, expectedPlayer, null);

    room.battle = applyAction(room.battle, {
      type: "END_TURN",
      playerId: expectedPlayer,
    });

    this.broadcastBattleState(room);

    if (room.battle.status === "active") {
      this.restartTurnTimer(room);
    } else {
      this.clearTurnTimer(room);
      this.finishNaturallyCompletedBattle(room);
    }
  }

  private broadcastBattleState(room: Room) {
    if (!room.battle) return;

    this.sendBattleState(room, "player");
    this.sendBattleState(room, "bot");
  }

  private broadcastFirstTurnRoll(
    room: Room,
    firstPlayer: PlayerId,
    startsAt: number,
    revealAt: number
  ) {
    this.sendFirstTurnRoll(room, "player", firstPlayer, startsAt, revealAt);
    this.sendFirstTurnRoll(room, "bot", firstPlayer, startsAt, revealAt);
  }

  private sendFirstTurnRoll(
    room: Room,
    playerId: PlayerId,
    firstPlayer: PlayerId,
    startsAt: number,
    revealAt: number
  ) {
    const player = room.players[playerId];
    if (!player || !room.battle) return;

    safeSend(player.socket, {
      type: "FIRST_TURN_ROLL",
      roomId: room.id,
      firstPlayer,
      startsAt,
      revealAt,
      battle: createBattleViewForPlayer(room.battle, playerId),
      opponentNickname: this.getOpponentNickname(room, playerId),
    });
  }

  private sendGameStarted(room: Room, playerId: PlayerId) {
    const player = room.players[playerId];
    if (!player || !room.battle) return;

    safeSend(player.socket, {
      type: "GAME_STARTED",
      roomId: room.id,
      battle: createBattleViewForPlayer(room.battle, playerId),
      playerId,
      opponentNickname: this.getOpponentNickname(room, playerId),
    });
  }

  private sendBattleState(room: Room, playerId: PlayerId) {
    const player = room.players[playerId];
    if (!player || !room.battle) return;

    safeSend(player.socket, {
      type: "GAME_STATE",
      roomId: room.id,
      battle: createBattleViewForPlayer(room.battle, playerId),
    });
  }

  private broadcastCardSelection(
    room: Room,
    playerId: PlayerId,
    cardInstanceId: string | null
  ) {
    const opponentId = this.getOpponent(playerId);
    const opponent = room.players[opponentId];

    safeSend(opponent?.socket, {
      type: "OPPONENT_CARD_SELECTION",
      playerId,
      cardInstanceId,
    });
  }

  private broadcastSame(room: Room, message: PvpServerMessage) {
    for (const player of Object.values(room.players)) {
      if (player) safeSend(player.socket, message);
    }
  }

}
