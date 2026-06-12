import type { BattleReward } from "../game/economy";
import type { GameMode, MatchEndReason } from "../game/modes";
import type { PlayerProgress, PlayerSavedDeck } from "../game/playerProgress";
import type {
  ClientBattleState,
  HeadquartersId,
  PlayerId,
} from "../game/types";

type ProfileClientMessage =
  | { type: "GET_PROFILE"; requestId: string; playerId: string }
  | {
      type: "SAVE_PROFILE";
      requestId: string;
      playerId: string;
      profile: PlayerProgress;
    }
  | {
      type: "CLAIM_BATTLE_REWARD";
      requestId: string;
      playerId: string;
      claimId: string;
      battle: ClientBattleState;
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
    };

type PendingRequest = {
  resolve: (message: Extract<ProfileServerMessage, { type: "PROFILE_UPDATED" }>) => void;
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
  env: {
    VITE_PROFILE_SERVER_URL?: string;
    VITE_PVP_SERVER_URL?: string;
  };
};

const PROFILE_SERVER_URL =
  (import.meta as ProfileImportMeta).env.VITE_PROFILE_SERVER_URL ??
  (import.meta as ProfileImportMeta).env.VITE_PVP_SERVER_URL ??
  "ws://localhost:8787";
const PROFILE_REQUEST_TIMEOUT_MS = 5_000;

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
    const response = await this.request({
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
    const response = await this.request({
      type: "SAVE_PROFILE",
      requestId: createRequestId(),
      playerId,
      profile,
    });

    return response.profile;
  }

  async claimBattleReward(
    playerId: string,
    claimId: string,
    input: {
      battle: ClientBattleState;
      mode: GameMode;
      localPlayerId: PlayerId;
      matchEndReason?: MatchEndReason | null;
    }
  ): Promise<{ profile: PlayerProgress; reward?: BattleReward }> {
    const response = await this.request({
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
    const response = await this.request({
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

  async researchCard(
    playerId: string,
    cardId: string,
    sourceHeadquartersId: HeadquartersId
  ): Promise<PlayerProgress> {
    const response = await this.request({
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
    const response = await this.request({
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
    const response = await this.request({
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
    const response = await this.request({
      type: "PURCHASE_HEADQUARTERS",
      requestId: createRequestId(),
      playerId,
      headquartersId,
    });

    return response.profile;
  }

  async saveCustomDeck(
    playerId: string,
    deck: PlayerSavedDeck
  ): Promise<PlayerProgress> {
    const response = await this.request({
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
    const response = await this.request({
      type: "DELETE_CUSTOM_DECK",
      requestId: createRequestId(),
      playerId,
      deckId,
    });

    return response.profile;
  }

  private async request(
    message: ProfileClientMessage
  ): Promise<Extract<ProfileServerMessage, { type: "PROFILE_UPDATED" }>> {
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

    if (message.type === "PROFILE_ERROR") {
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
