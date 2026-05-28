import type { BattleAction, BattleState, PlayerId } from "../game/types";

export type PvpClientMessage =
  | { type: "MATCHMAKING_STARTED" }
  | { type: "ROOM_CREATED"; roomId: string; playerId: PlayerId }
  | { type: "ROOM_JOINED"; roomId: string; playerId: PlayerId }
  | { type: "WAITING_FOR_OPPONENT"; roomId: string }
  | {
      type: "FIRST_TURN_ROLL";
      roomId: string;
      firstPlayer: PlayerId;
      startsAt: number;
      revealAt: number;
      battle: BattleState;
    }
  | { type: "GAME_STARTED"; roomId: string; battle: BattleState; playerId: PlayerId }
  | { type: "GAME_STATE"; roomId: string; battle: BattleState }
  | { type: "OPPONENT_DISCONNECTED"; roomId: string }
  | { type: "ERROR"; message: string };

export type PvpServerMessage =
  | { type: "FIND_MATCH" }
  | { type: "CREATE_ROOM" }
  | { type: "JOIN_ROOM"; roomId: string }
  | { type: "GAME_ACTION"; action: BattleAction };

type PvpMessageHandler = (message: PvpClientMessage) => void;
type PvpCloseHandler = () => void;
type PvpErrorHandler = (message: string) => void;
type PvpOpenHandler = () => void;

class PvpClient {
  private socket: WebSocket | null = null;
  private messageHandlers = new Set<PvpMessageHandler>();
  private closeHandlers = new Set<PvpCloseHandler>();
  private errorHandlers = new Set<PvpErrorHandler>();
  private openHandlers = new Set<PvpOpenHandler>();

  connect(url: string) {
    this.disconnect();

    this.socket = new WebSocket(url);

    this.socket.addEventListener("open", () => {
      this.openHandlers.forEach((handler) => handler());
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data) as PvpClientMessage;
        this.messageHandlers.forEach((handler) => handler(message));
      } catch {
        this.errorHandlers.forEach((handler) =>
          handler("Не удалось прочитать сообщение от PVP-сервера"),
        );
      }
    });

    this.socket.addEventListener("close", () => {
      this.closeHandlers.forEach((handler) => handler());
    });

    this.socket.addEventListener("error", () => {
      this.errorHandlers.forEach((handler) =>
        handler("Ошибка соединения с PVP-сервером"),
      );
    });
  }

  disconnect() {
    if (!this.socket) return;
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

  findMatch() {
    this.send({ type: "FIND_MATCH" });
  }

  createRoom() {
    this.send({ type: "CREATE_ROOM" });
  }

  joinRoom(roomId: string) {
    this.send({ type: "JOIN_ROOM", roomId });
  }

  sendAction(action: BattleAction) {
    this.send({ type: "GAME_ACTION", action });
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
