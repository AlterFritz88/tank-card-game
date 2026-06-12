import type { MatchEndReason } from "../game/modes";
import { getPersistentPlayerId } from "../game/playerIdentity";
import type {
  BattleAction,
  BattleStateView,
  HeadquartersId,
  PlayerId,
} from "../game/types";
import type { AttackAnimationStrike } from "../game/engine";

export type PvpClientMessage =
  | { type: "MATCHMAKING_STARTED" }
  | { type: "ROOM_CREATED"; roomId: string; playerId: PlayerId }
  | { type: "ROOM_JOINED"; roomId: string; playerId: PlayerId }
  | { type: "RECONNECTED"; roomId: string; playerId: PlayerId; battle: BattleStateView }
  | { type: "RECONNECT_FAILED"; message: string }
  | { type: "WAITING_FOR_OPPONENT"; roomId: string }
  | {
      type: "FIRST_TURN_ROLL";
      roomId: string;
      firstPlayer: PlayerId;
      startsAt: number;
      revealAt: number;
      battle: BattleStateView;
    }
  | { type: "GAME_STARTED"; roomId: string; battle: BattleStateView; playerId: PlayerId }
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
      type: "OPPONENT_CARD_SELECTION";
      playerId: PlayerId;
      cardInstanceId: string | null;
    }
  | { type: "MATCH_ENDED"; winner: PlayerId; reason: MatchEndReason }
  | { type: "MATCHMAKING_CANCELLED" }
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
  | { type: "RECONNECT"; sessionId: string; roomId?: string | null }
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
    const existingSessionId = window.sessionStorage.getItem(PVP_SESSION_ID_KEY);
    if (existingSessionId) return existingSessionId;

    const nextSessionId = createSessionId();
    window.sessionStorage.setItem(PVP_SESSION_ID_KEY, nextSessionId);
    return nextSessionId;
  }

  getStoredRoomId() {
    return window.sessionStorage.getItem(PVP_ROOM_ID_KEY);
  }

  rememberRoom(roomId: string) {
    window.sessionStorage.setItem(PVP_ROOM_ID_KEY, roomId);
  }

  clearSession() {
    window.sessionStorage.removeItem(PVP_SESSION_ID_KEY);
    window.sessionStorage.removeItem(PVP_ROOM_ID_KEY);
  }

  findMatch(headquartersId: HeadquartersId, deckCardIds?: string[]) {
    this.send({
      type: "FIND_MATCH",
      sessionId: this.getSessionId(),
      playerId: getPersistentPlayerId(),
      headquartersId,
      deckCardIds,
    });
  }

  createRoom(headquartersId: HeadquartersId, deckCardIds?: string[]) {
    this.send({
      type: "CREATE_ROOM",
      sessionId: this.getSessionId(),
      playerId: getPersistentPlayerId(),
      headquartersId,
      deckCardIds,
    });
  }

  joinRoom(roomId: string, headquartersId: HeadquartersId, deckCardIds?: string[]) {
    this.send({
      type: "JOIN_ROOM",
      roomId,
      sessionId: this.getSessionId(),
      playerId: getPersistentPlayerId(),
      headquartersId,
      deckCardIds,
    });
  }

  reconnect() {
    this.send({
      type: "RECONNECT",
      sessionId: this.getSessionId(),
      roomId: this.getStoredRoomId(),
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
