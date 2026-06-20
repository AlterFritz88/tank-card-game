import type { BattleReward, BattleRewardSource } from "../game/economy";
import type { GameMode, MatchEndReason } from "../game/modes";
import type { PlayerProgress, PlayerSavedDeck } from "../game/playerProgress";
import type { HeadquartersId, PlayerId } from "../game/types";
import { getDefaultWebSocketUrl } from "./webSocketUrl";

type ProfileClientMessage =
  | { type: "GET_PROFILE"; requestId: string; playerId: string }
  | {
      type: "SAVE_PROFILE";
      requestId: string;
      playerId: string;
      profile: PlayerProgress;
    }
  | {
      type: "UPDATE_NICKNAME";
      requestId: string;
      playerId: string;
      nickname: string;
    }
  | {
      type: "UPDATE_FAVORITE_HEADQUARTERS";
      requestId: string;
      playerId: string;
      headquartersId: HeadquartersId | null;
    }
  | {
      type: "CLAIM_BATTLE_REWARD";
      requestId: string;
      playerId: string;
      claimId: string;
      battle: BattleRewardSource;
      mode: GameMode;
      localPlayerId: PlayerId;
      matchEndReason?: MatchEndReason | null;
    }
  | {
      type: "CLAIM_PVP_BATTLE_REWARD";
      requestId: string;
      playerId: string;
      roomId: string;
      localPlayerId?: PlayerId;
    }
  | {
      type: "CLAIM_TUTORIAL_REWARD";
      requestId: string;
      playerId: string;
      reward: BattleReward;
      localPlayerWon: boolean;
    }
  | {
      type: "RESEARCH_CARD";
      requestId: string;
      playerId: string;
      cardId: string;
      sourceHeadquartersId: HeadquartersId;
    }
  | {
      type: "RESEARCH_HEADQUARTERS";
      requestId: string;
      playerId: string;
      headquartersId: HeadquartersId;
      sourceHeadquartersId: HeadquartersId;
    }
  | {
      type: "PURCHASE_CARD_COPY";
      requestId: string;
      playerId: string;
      cardId: string;
    }
  | {
      type: "PURCHASE_HEADQUARTERS";
      requestId: string;
      playerId: string;
      headquartersId: HeadquartersId;
    }
  | {
      type: "PURCHASE_PREMIUM_CARD";
      requestId: string;
      playerId: string;
      cardId: string;
    }
  | {
      type: "PURCHASE_PREMIUM_DAYS";
      requestId: string;
      playerId: string;
      days: number;
    }
  | {
      type: "CLAIM_CAMPAIGN_REWARD";
      requestId: string;
      playerId: string;
      rewardId: string;
    }
  | {
      type: "SAVE_CUSTOM_DECK";
      requestId: string;
      playerId: string;
      deck: PlayerSavedDeck;
    }
  | {
      type: "DELETE_CUSTOM_DECK";
      requestId: string;
      playerId: string;
      deckId: string;
    }
  | {
      type: "REGISTER_ACCOUNT";
      requestId: string;
      username: string;
      email: string;
      password: string;
      legalAccepted: boolean;
      guestPlayerId?: string;
      mergeGuestProgress?: boolean;
    }
  | {
      type: "LOGIN_ACCOUNT";
      requestId: string;
      username: string;
      password: string;
      guestPlayerId?: string;
      mergeGuestProgress?: boolean;
    }
  | {
      type: "ACQUIRE_SESSION";
      requestId: string;
      accountId: string;
      instanceId: string;
      kind: GameMode;
    }
  | {
      type: "RELEASE_SESSION";
      accountId: string;
      instanceId: string;
    };

type ProfileServerMessage =
  | {
      type: "PROFILE_UPDATED";
      requestId: string;
      profile: PlayerProgress;
      reward?: BattleReward;
    }
  | {
      type: "PROFILE_ERROR";
      requestId: string;
      message: string;
      profile?: PlayerProgress;
    }
  | {
      type: "AUTH_RESULT";
      requestId: string;
      userId: string;
      username: string;
      profile: PlayerProgress;
    }
  | {
      type: "AUTH_ERROR";
      requestId: string;
      message: string;
    }
  | { type: "SESSION_GRANTED"; requestId: string }
  | { type: "SESSION_DENIED"; requestId: string; message: string };

export type AuthResult = Extract<ProfileServerMessage, { type: "AUTH_RESULT" }>;
type ProfileSuccessMessage = Extract<
  ProfileServerMessage,
  | { type: "PROFILE_UPDATED" }
  | { type: "AUTH_RESULT" }
  | { type: "SESSION_GRANTED" }
>;

/**
 * Thrown when the server refuses a session because the account already has an
 * active game session elsewhere. Distinct from connectivity errors so callers
 * can block the second session while still allowing offline play.
 */
export class SessionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionDeniedError";
  }
}

export type SessionAcquireResult =
  | { status: "granted" }
  | { status: "denied"; message: string }
  | { status: "unavailable" };

// Every request/response message carries a requestId; RELEASE_SESSION is the
// only fire-and-forget message and is sent directly, never through request().
type ProfileRequestMessage = Exclude<
  ProfileClientMessage,
  { type: "RELEASE_SESSION" }
>;
type ProfileUpdatedMessage = Extract<
  ProfileServerMessage,
  { type: "PROFILE_UPDATED" }
>;

type PendingRequest = {
  resolve: (message: ProfileSuccessMessage) => void;
  reject: (error: Error) => void;
};

export type ProfileConnectionStatus =
  | "idle"
  | "connecting"
  | "online"
  | "offline"
  | "error";

export type ProfileConnectionSnapshot = {
  status: ProfileConnectionStatus;
  message: string | null;
};

type ProfileConnectionListener = (
  snapshot: ProfileConnectionSnapshot
) => void;

type ProfileImportMeta = ImportMeta & {
  env?: {
    VITE_PROFILE_SERVER_URL?: string;
    VITE_PVP_SERVER_URL?: string;
  };
};

const profileImportMetaEnv = (import.meta as ProfileImportMeta).env ?? {};
const PROFILE_SERVER_URL =
  profileImportMetaEnv.VITE_PROFILE_SERVER_URL ??
  profileImportMetaEnv.VITE_PVP_SERVER_URL ??
  getDefaultWebSocketUrl();
const PROFILE_HTTP_SERVER_URL = PROFILE_SERVER_URL.replace(/^wss:/, "https:").replace(
  /^ws:/,
  "http:"
);
const PROFILE_REQUEST_TIMEOUT_MS = 15_000;
const SESSION_INSTANCE_STORAGE_KEY = "tank-card-game:session-instance-id";

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export type GoldProductId = "gold-100" | "gold-500" | "gold-1500";

export type GoldProductCatalogItem = {
  id: GoldProductId;
  goldTracks: number;
  amountRub: number | null;
};

export async function getShopCatalog(): Promise<{
  goldProducts: GoldProductCatalogItem[];
}> {
  const response = await fetch(`${PROFILE_HTTP_SERVER_URL}/api/shop/catalog`, {
    method: "GET",
  });
  const result = (await response.json()) as
    | {
        ok: true;
        goldProducts: GoldProductCatalogItem[];
      }
    | { ok: false; message?: string };

  if (!response.ok || !result.ok) {
    throw new Error(
      "message" in result && result.message
        ? result.message
        : "Не удалось загрузить каталог магазина"
    );
  }

  return {
    goldProducts: result.goldProducts,
  };
}

export async function createGoldPayment(
  playerId: string,
  productId: GoldProductId
): Promise<{
  paymentId: string;
  confirmationUrl: string;
  goldTracks: number;
  amountRub: number;
}> {
  const response = await fetch(`${PROFILE_HTTP_SERVER_URL}/api/shop/gold-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ playerId, productId }),
  });
  const result = (await response.json()) as
    | {
        ok: true;
        paymentId: string;
        confirmationUrl: string;
        goldTracks: number;
        amountRub: number;
      }
    | { ok: false; message?: string };

  if (!response.ok || !result.ok) {
    throw new Error(
      "message" in result && result.message
        ? result.message
        : "Не удалось создать платеж"
    );
  }

  return {
    paymentId: result.paymentId,
    confirmationUrl: result.confirmationUrl,
    goldTracks: result.goldTracks,
    amountRub: result.amountRub,
  };
}

// Stable per-tab identifier for the single-session lock. Kept in sessionStorage
// so a page reload reuses the same id (and re-acquires its own lock), while a
// separate tab gets a distinct id and is therefore treated as a rival session.
function getSessionInstanceId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_INSTANCE_STORAGE_KEY);
    if (existing) return existing;

    const next = createRequestId();
    window.sessionStorage.setItem(SESSION_INSTANCE_STORAGE_KEY, next);
    return next;
  } catch {
    return createRequestId();
  }
}

class ProfileClient {
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private pending = new Map<string, PendingRequest>();
  private connection: ProfileConnectionSnapshot = {
    status: "idle",
    message: null,
  };
  private listeners = new Set<ProfileConnectionListener>();

  getConnectionSnapshot(): ProfileConnectionSnapshot {
    return this.connection;
  }

  subscribe(listener: ProfileConnectionListener): () => void {
    this.listeners.add(listener);
    listener(this.connection);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async reconnect(): Promise<void> {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close();
    }

    this.socket = null;
    this.connecting = null;
    await this.ensureConnected();
  }

  async getProfile(playerId: string): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "GET_PROFILE",
      requestId: createRequestId(),
      playerId,
    });

    return response.profile;
  }

  async saveProfile(
    playerId: string,
    profile: PlayerProgress
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "SAVE_PROFILE",
      requestId: createRequestId(),
      playerId,
      profile,
    });

    return response.profile;
  }

  async updateNickname(
    playerId: string,
    nickname: string
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "UPDATE_NICKNAME",
      requestId: createRequestId(),
      playerId,
      nickname,
    });

    return response.profile;
  }

  async updateFavoriteHeadquarters(
    playerId: string,
    headquartersId: HeadquartersId | null
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "UPDATE_FAVORITE_HEADQUARTERS",
      requestId: createRequestId(),
      playerId,
      headquartersId,
    });

    return response.profile;
  }

  async claimBattleReward(
    playerId: string,
    claimId: string,
    input: {
      battle: BattleRewardSource;
      mode: GameMode;
      localPlayerId: PlayerId;
      matchEndReason?: MatchEndReason | null;
    }
  ): Promise<{ profile: PlayerProgress; reward?: BattleReward }> {
    const response = await this.requestProfileUpdate({
      type: "CLAIM_BATTLE_REWARD",
      requestId: createRequestId(),
      playerId,
      claimId,
      ...input,
    });

    return {
      profile: response.profile,
      reward: response.reward,
    };
  }

  async claimPvpBattleReward(
    playerId: string,
    roomId: string,
    localPlayerId?: PlayerId
  ): Promise<{ profile: PlayerProgress; reward?: BattleReward }> {
    const response = await this.requestProfileUpdate({
      type: "CLAIM_PVP_BATTLE_REWARD",
      requestId: createRequestId(),
      playerId,
      roomId,
      localPlayerId,
    });

    return {
      profile: response.profile,
      reward: response.reward,
    };
  }

  async claimPVPBattleReward(
    playerId: string,
    roomId: string,
    localPlayerId?: PlayerId
  ): Promise<{ profile: PlayerProgress; reward?: BattleReward }> {
    return this.claimPvpBattleReward(playerId, roomId, localPlayerId);
  }

  async claimTutorialReward(
    playerId: string,
    reward: BattleReward,
    localPlayerWon: boolean
  ): Promise<{ profile: PlayerProgress; reward?: BattleReward }> {
    const response = await this.requestProfileUpdate({
      type: "CLAIM_TUTORIAL_REWARD",
      requestId: createRequestId(),
      playerId,
      reward,
      localPlayerWon,
    });

    return {
      profile: response.profile,
      reward: response.reward,
    };
  }

  async researchCard(
    playerId: string,
    cardId: string,
    sourceHeadquartersId: HeadquartersId
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "RESEARCH_CARD",
      requestId: createRequestId(),
      playerId,
      cardId,
      sourceHeadquartersId,
    });

    return response.profile;
  }

  async researchHeadquarters(
    playerId: string,
    headquartersId: HeadquartersId,
    sourceHeadquartersId: HeadquartersId
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "RESEARCH_HEADQUARTERS",
      requestId: createRequestId(),
      playerId,
      headquartersId,
      sourceHeadquartersId,
    });

    return response.profile;
  }

  async purchaseCardCopy(
    playerId: string,
    cardId: string
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "PURCHASE_CARD_COPY",
      requestId: createRequestId(),
      playerId,
      cardId,
    });

    return response.profile;
  }

  async purchaseHeadquarters(
    playerId: string,
    headquartersId: HeadquartersId
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "PURCHASE_HEADQUARTERS",
      requestId: createRequestId(),
      playerId,
      headquartersId,
    });

    return response.profile;
  }

  async purchasePremiumCard(
    playerId: string,
    cardId: string
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "PURCHASE_PREMIUM_CARD",
      requestId: createRequestId(),
      playerId,
      cardId,
    });

    return response.profile;
  }

  async purchasePremiumDays(
    playerId: string,
    days: number
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "PURCHASE_PREMIUM_DAYS",
      requestId: createRequestId(),
      playerId,
      days,
    });

    return response.profile;
  }

  async claimCampaignReward(
    playerId: string,
    rewardId: string
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "CLAIM_CAMPAIGN_REWARD",
      requestId: createRequestId(),
      playerId,
      rewardId,
    });

    return response.profile;
  }

  async saveCustomDeck(
    playerId: string,
    deck: PlayerSavedDeck
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "SAVE_CUSTOM_DECK",
      requestId: createRequestId(),
      playerId,
      deck,
    });

    return response.profile;
  }

  async deleteCustomDeck(
    playerId: string,
    deckId: string
  ): Promise<PlayerProgress> {
    const response = await this.requestProfileUpdate({
      type: "DELETE_CUSTOM_DECK",
      requestId: createRequestId(),
      playerId,
      deckId,
    });

    return response.profile;
  }

  /**
   * Try to claim the single active game session for this account before a
   * battle starts. Returns "denied" when another tab/device already holds it,
   * "unavailable" when the profile server can't be reached (offline play is
   * allowed rather than blocked), and "granted" otherwise.
   */
  async acquireSession(
    accountId: string,
    kind: GameMode
  ): Promise<SessionAcquireResult> {
    try {
      const response = await this.request({
        type: "ACQUIRE_SESSION",
        requestId: createRequestId(),
        accountId,
        instanceId: getSessionInstanceId(),
        kind,
      });

      return response.type === "SESSION_GRANTED"
        ? { status: "granted" }
        : { status: "unavailable" };
    } catch (error) {
      if (error instanceof SessionDeniedError) {
        return { status: "denied", message: error.message };
      }

      // Server unreachable or timed out — we cannot enforce the lock, so allow
      // play instead of hard-blocking the game when offline.
      return { status: "unavailable" };
    }
  }

  releaseSession(accountId: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    this.socket.send(
      JSON.stringify({
        type: "RELEASE_SESSION",
        accountId,
        instanceId: getSessionInstanceId(),
      })
    );
  }

  private async requestProfileUpdate(
    message: ProfileRequestMessage
  ): Promise<ProfileUpdatedMessage> {
    const response = await this.request(message);
    if (response.type !== "PROFILE_UPDATED") {
      throw new Error("Profile server returned an unexpected response");
    }

    return response;
  }

  async registerAccount(input: {
    username: string;
    email: string;
    password: string;
    legalAccepted: boolean;
    guestPlayerId?: string;
    mergeGuestProgress?: boolean;
  }): Promise<AuthResult> {
    const response = await this.request({
      type: "REGISTER_ACCOUNT",
      requestId: createRequestId(),
      ...input,
    });

    if (response.type !== "AUTH_RESULT") {
      throw new Error("Auth server returned an unexpected response");
    }

    return response;
  }

  async loginAccount(input: {
    username: string;
    password: string;
    guestPlayerId?: string;
    mergeGuestProgress?: boolean;
  }): Promise<AuthResult> {
    const response = await this.request({
      type: "LOGIN_ACCOUNT",
      requestId: createRequestId(),
      ...input,
    });

    if (response.type !== "AUTH_RESULT") {
      throw new Error("Auth server returned an unexpected response");
    }

    return response;
  }

  private async request(
    message: ProfileRequestMessage
  ): Promise<ProfileSuccessMessage> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(message.requestId);
        this.setConnection("error", "Сервер профиля не ответил вовремя");
        reject(new Error("Profile server request timed out"));
      }, PROFILE_REQUEST_TIMEOUT_MS);

      this.pending.set(message.requestId, {
        resolve: (response) => {
          window.clearTimeout(timeoutId);
          resolve(response);
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.socket?.send(JSON.stringify(message));
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.setConnection("online", null);
      return;
    }

    if (this.connecting) return this.connecting;

    this.setConnection("connecting", null);

    this.connecting = new Promise((resolve, reject) => {
      const socket = new WebSocket(PROFILE_SERVER_URL);
      this.socket = socket;

      socket.addEventListener("open", () => {
        if (this.socket !== socket) return;

        this.connecting = null;
        this.setConnection("online", null);
        resolve();
      });

      socket.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });

      socket.addEventListener("close", () => {
        this.rejectPending("Profile server connection closed");
        if (this.socket !== socket) return;

        this.connecting = null;
        this.socket = null;
        this.setConnection("offline", "Соединение с сервером профиля закрыто");
      });

      socket.addEventListener("error", () => {
        this.rejectPending("Profile server connection error");
        if (this.socket !== socket) return;

        this.connecting = null;
        this.setConnection("error", "Сервер профиля недоступен");
        reject(new Error("Profile server connection error"));
      });
    });

    return this.connecting;
  }

  private handleMessage(data: unknown) {
    let message: ProfileServerMessage;

    try {
      message = JSON.parse(String(data)) as ProfileServerMessage;
    } catch {
      return;
    }

    const pendingRequest = this.pending.get(message.requestId);
    if (!pendingRequest) return;

    this.pending.delete(message.requestId);

    if (message.type === "SESSION_DENIED") {
      this.setConnection("online", null);
      pendingRequest.reject(new SessionDeniedError(message.message));
      return;
    }

    if (message.type === "PROFILE_ERROR" || message.type === "AUTH_ERROR") {
      this.setConnection("online", null);
      pendingRequest.reject(new Error(message.message));
      return;
    }

    this.setConnection("online", null);
    pendingRequest.resolve(message);
  }

  private rejectPending(message: string) {
    for (const [, request] of this.pending) {
      request.reject(new Error(message));
    }

    this.pending.clear();
  }

  private setConnection(status: ProfileConnectionStatus, message: string | null) {
    if (
      this.connection.status === status &&
      this.connection.message === message
    ) {
      return;
    }

    this.connection = {
      status,
      message,
    };

    this.listeners.forEach((listener) => listener(this.connection));
  }
}

export const profileClient = new ProfileClient();
