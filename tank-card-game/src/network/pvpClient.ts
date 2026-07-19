import type { MatchEndReason } from "../game/modes";
import { getCurrentUserId } from "../game/playerIdentity";
import type {
  BattleAction,
  BattleStateView,
  HeadquartersId,
  PlayerId,
} from "../game/types";
import type { AttackAnimationStrike } from "../game/engine";
import {
  createPvpDeckIdentity,
  samePvpDeckIdentity,
  type PvpDeckIdentity,
} from "../game/pvpDeckIdentity";

export type StoredPvpDeckSelection = {
  headquartersId: HeadquartersId;
  deckCardIds: string[] | null;
  identity: PvpDeckIdentity;
};

export type PvpClientMessage =
  | { type: "MATCHMAKING_STARTED" }
  | { type: "ROOM_CREATED"; roomId: string; playerId: PlayerId }
  | { type: "ROOM_JOINED"; roomId: string; playerId: PlayerId }
  | {
      type: "RECONNECTED";
      roomId: string;
      playerId: PlayerId;
      battle: BattleStateView;
      opponentNickname?: string | null;
      opponentCardBackId?: "first_player" | null;
      opponentDeckWeight?: number | null;
      ownDeck?: PvpDeckIdentity;
      ownDeckWeight?: number;
    }
  | { type: "RECONNECT_FAILED"; message: string }
  | { type: "WAITING_FOR_OPPONENT"; roomId: string }
  | {
      type: "FIRST_TURN_ROLL";
      roomId: string;
      playerId: PlayerId;
      firstPlayer: PlayerId;
      startsAt: number;
      revealAt: number;
      battle: BattleStateView;
      opponentNickname?: string | null;
      opponentCardBackId?: "first_player" | null;
      opponentDeckWeight?: number | null;
      ownDeck?: PvpDeckIdentity;
      ownDeckWeight?: number;
    }
  | {
      type: "GAME_STARTED";
      roomId: string;
      battle: BattleStateView;
      playerId: PlayerId;
      opponentNickname?: string | null;
      opponentCardBackId?: "first_player" | null;
      opponentDeckWeight?: number | null;
      ownDeck?: PvpDeckIdentity;
      ownDeckWeight?: number;
    }
  | { type: "GAME_STATE"; roomId: string; battle: BattleStateView }
  | {
      type: "TURN_TIMER";
      activePlayer: PlayerId;
      remainingMs: number;
      endsAt: number;
      durationMs: number;
    }
  | {
      type: "MOVE_INTENT";
      intentId: string;
      playerId: PlayerId;
      unitId: string;
      position: { row: number; col: number };
      durationMs: number;
    }
  | {
      type: "ATTACK_INTENT";
      intentId: string;
      playerId: PlayerId;
      strikes: AttackAnimationStrike[];
      durationMs: number;
    }
  | {
      type: "DEPLOY_BARRAGE_INTENT";
      intentId: string;
      playerId: PlayerId;
      cardInstanceId: string;
      cardId: string;
      source:
        | { type: "battlefield"; position: { row: number; col: number } }
        | { type: "support"; supportSlot: number };
      shots: { targetId: string; damage: number; destroyed: boolean }[];
      durationMs: number;
    }
  | {
      type: "OPPONENT_CARD_SELECTION";
      playerId: PlayerId;
      cardInstanceId: string | null;
    }
  | { type: "MATCH_ENDED"; winner: PlayerId; reason: MatchEndReason }
  | { type: "MATCHMAKING_CANCELLED" }
  | { type: "MATCH_START_FAILED"; message: string }
  | { type: "OPPONENT_LEFT"; reason: MatchEndReason }
  | { type: "OPPONENT_DISCONNECTED"; roomId: string }
  | { type: "ERROR"; message: string };

export type PvpServerMessage =
  | {
      type: "FIND_MATCH";
      sessionId: string;
      playerId: string;
      headquartersId: HeadquartersId;
      deckCardIds?: string[];
    }
  | {
      type: "CREATE_ROOM";
      sessionId: string;
      playerId: string;
      headquartersId: HeadquartersId;
      deckCardIds?: string[];
    }
  | {
      type: "JOIN_ROOM";
      roomId: string;
      sessionId: string;
      playerId: string;
      headquartersId: HeadquartersId;
      deckCardIds?: string[];
    }
  | {
      type: "RECONNECT";
      sessionId: string;
      roomId?: string | null;
      expectedDeck?: PvpDeckIdentity;
    }
  | { type: "GAME_ACTION"; action: BattleAction }
  | { type: "SELECT_CARD"; cardInstanceId: string | null }
  | { type: "SURRENDER" }
  | { type: "LEAVE_MATCH" }
  | { type: "CANCEL_MATCHMAKING" };

type PvpMessageHandler = (message: PvpClientMessage) => void;
type PvpCloseHandler = () => void;
type PvpErrorHandler = (message: string) => void;
type PvpOpenHandler = () => void;

const PVP_SESSION_ID_KEY = "tank-card-game:pvp-session-id";
const PVP_ROOM_ID_KEY = "tank-card-game:pvp-room-id";
const PVP_DECK_SELECTION_KEY = "tank-card-game:pvp-deck-selection";

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

class PvpClient {
  private socket: WebSocket | null = null;
  private intentionallyClosedSockets = new WeakSet<WebSocket>();
  private messageHandlers = new Set<PvpMessageHandler>();
  private closeHandlers = new Set<PvpCloseHandler>();
  private errorHandlers = new Set<PvpErrorHandler>();
  private openHandlers = new Set<PvpOpenHandler>();

  connect(url: string) {
    this.disconnect();

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.openHandlers.forEach((handler) => handler());
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data) as PvpClientMessage;
        this.messageHandlers.forEach((handler) => handler(message));
      } catch {
        this.errorHandlers.forEach((handler) =>
          handler("Не удалось прочитать сообщение от PVP-сервера"),
        );
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      if (this.intentionallyClosedSockets.has(socket)) {
        return;
      }

      this.closeHandlers.forEach((handler) => handler());
    });

    socket.addEventListener("error", () => {
      this.errorHandlers.forEach((handler) =>
        handler("Ошибка соединения с PVP-сервером"),
      );
    });
  }

  disconnect() {
    if (!this.socket) return;
    this.intentionallyClosedSockets.add(this.socket);
    this.socket.close();
    this.socket = null;
  }

  send(message: PvpServerMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.errorHandlers.forEach((handler) =>
        handler("PVP-сервер пока не подключен"),
      );
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  getSessionId() {
    const existingSessionId = window.localStorage.getItem(PVP_SESSION_ID_KEY);
    if (existingSessionId) return existingSessionId;

    const nextSessionId = createSessionId();
    window.localStorage.setItem(PVP_SESSION_ID_KEY, nextSessionId);
    return nextSessionId;
  }

  getStoredRoomId() {
    return window.localStorage.getItem(PVP_ROOM_ID_KEY);
  }

  rememberRoom(roomId: string) {
    window.localStorage.setItem(PVP_ROOM_ID_KEY, roomId);
  }

  rememberDeckSelection(
    headquartersId: HeadquartersId,
    deckCardIds?: string[]
  ) {
    const selection: StoredPvpDeckSelection = {
      headquartersId,
      deckCardIds: deckCardIds ? [...deckCardIds] : null,
      identity: createPvpDeckIdentity(headquartersId, deckCardIds),
    };

    window.localStorage.setItem(
      PVP_DECK_SELECTION_KEY,
      JSON.stringify(selection)
    );
  }

  getStoredDeckSelection(): StoredPvpDeckSelection | null {
    try {
      const rawValue = window.localStorage.getItem(PVP_DECK_SELECTION_KEY);
      if (!rawValue) return null;

      const parsed = JSON.parse(rawValue) as Partial<StoredPvpDeckSelection>;
      if (typeof parsed.headquartersId !== "string") return null;
      if (
        parsed.deckCardIds !== null &&
        (!Array.isArray(parsed.deckCardIds) ||
          !parsed.deckCardIds.every((cardId) => typeof cardId === "string"))
      ) {
        return null;
      }

      const headquartersId = parsed.headquartersId as HeadquartersId;
      const deckCardIds = parsed.deckCardIds
        ? [...parsed.deckCardIds]
        : null;
      return {
        headquartersId,
        deckCardIds,
        identity: createPvpDeckIdentity(headquartersId, deckCardIds),
      };
    } catch {
      return null;
    }
  }

  storedDeckMatches(identity: PvpDeckIdentity): boolean {
    const storedSelection = this.getStoredDeckSelection();
    return (
      !storedSelection ||
      samePvpDeckIdentity(storedSelection.identity, identity)
    );
  }

  clearSession() {
    window.localStorage.removeItem(PVP_SESSION_ID_KEY);
    window.localStorage.removeItem(PVP_ROOM_ID_KEY);
    window.localStorage.removeItem(PVP_DECK_SELECTION_KEY);
  }

  findMatch(headquartersId: HeadquartersId, deckCardIds?: string[]) {
    this.rememberDeckSelection(headquartersId, deckCardIds);
    this.send({
      type: "FIND_MATCH",
      sessionId: this.getSessionId(),
      playerId: getCurrentUserId(),
      headquartersId,
      deckCardIds,
    });
  }

  createRoom(headquartersId: HeadquartersId, deckCardIds?: string[]) {
    this.rememberDeckSelection(headquartersId, deckCardIds);
    this.send({
      type: "CREATE_ROOM",
      sessionId: this.getSessionId(),
      playerId: getCurrentUserId(),
      headquartersId,
      deckCardIds,
    });
  }

  joinRoom(roomId: string, headquartersId: HeadquartersId, deckCardIds?: string[]) {
    this.rememberDeckSelection(headquartersId, deckCardIds);
    this.send({
      type: "JOIN_ROOM",
      roomId,
      sessionId: this.getSessionId(),
      playerId: getCurrentUserId(),
      headquartersId,
      deckCardIds,
    });
  }

  reconnect() {
    const storedSelection = this.getStoredDeckSelection();
    this.send({
      type: "RECONNECT",
      sessionId: this.getSessionId(),
      roomId: this.getStoredRoomId(),
      expectedDeck: storedSelection?.identity,
    });
  }

  sendAction(action: BattleAction) {
    this.send({ type: "GAME_ACTION", action });
  }

  selectCard(cardInstanceId: string | null) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({ type: "SELECT_CARD", cardInstanceId }));
  }

  surrender() {
    this.send({ type: "SURRENDER" });
  }

  leaveMatch() {
    this.send({ type: "LEAVE_MATCH" });
  }

  cancelMatchmaking() {
    this.send({ type: "CANCEL_MATCHMAKING" });
  }

  onOpen(handler: PvpOpenHandler) {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  onMessage(handler: PvpMessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onClose(handler: PvpCloseHandler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  onError(handler: PvpErrorHandler) {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }
}

export const pvpClient = new PvpClient();
