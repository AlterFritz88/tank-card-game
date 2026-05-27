import type { WebSocket } from "ws";
import { applyAction } from "../../tank-card-game/src/game/engine";
import { createInitialBattleState } from "../../tank-card-game/src/game/initialState";
import type { BattleAction, BattleState, PlayerId } from "../../tank-card-game/src/game/types";
import type { PvpClientMessage, PvpServerMessage } from "./protocol";

type RoomPlayer = {
  id: PlayerId;
  socket: WebSocket;
};

type Room = {
  id: string;
  players: Partial<Record<PlayerId, RoomPlayer>>;
  battle: BattleState | null;
};

function createRoomId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let index = 0; index < 5; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function safeSend(socket: WebSocket, message: PvpServerMessage) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
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

function createStartedBattle(): BattleState {
  const startingPlayer: PlayerId = Math.random() < 0.5 ? "player" : "bot";
  const battle = createInitialBattleState();

  return applyAction(battle, {
    type: "BEGIN_BATTLE",
    startingPlayer,
  } as BattleAction);
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new WeakMap<WebSocket, string>();
  private socketToPlayer = new WeakMap<WebSocket, PlayerId>();

  handleMessage(socket: WebSocket, rawData: WebSocket.RawData) {
    let message: PvpClientMessage;

    try {
      message = JSON.parse(rawData.toString()) as PvpClientMessage;
    } catch {
      safeSend(socket, { type: "ERROR", message: "Некорректное JSON-сообщение" });
      return;
    }

    switch (message.type) {
      case "CREATE_ROOM":
        this.createRoom(socket);
        break;
      case "JOIN_ROOM":
        this.joinRoom(socket, message.roomId);
        break;
      case "GAME_ACTION":
        this.applyGameAction(socket, message.action);
        break;
      default:
        safeSend(socket, { type: "ERROR", message: "Неизвестное сообщение" });
    }
  }

  handleClose(socket: WebSocket) {
    const roomId = this.socketToRoom.get(socket);
    const playerId = this.socketToPlayer.get(socket);
    if (!roomId || !playerId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    delete room.players[playerId];

    const opponent = playerId === "player" ? "bot" : "player";
    const opponentSocket = room.players[opponent]?.socket;
    if (opponentSocket) {
      safeSend(opponentSocket, { type: "OPPONENT_DISCONNECTED", roomId });
    }

    if (!room.players.player && !room.players.bot) {
      this.rooms.delete(roomId);
    }
  }

  private createRoom(socket: WebSocket) {
    let roomId = createRoomId();
    while (this.rooms.has(roomId)) {
      roomId = createRoomId();
    }

    const room: Room = {
      id: roomId,
      players: {
        player: { id: "player", socket },
      },
      battle: null,
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(socket, roomId);
    this.socketToPlayer.set(socket, "player");

    safeSend(socket, { type: "ROOM_CREATED", roomId, playerId: "player" });
    safeSend(socket, { type: "WAITING_FOR_OPPONENT", roomId });
  }

  private joinRoom(socket: WebSocket, unsafeRoomId: string) {
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

    room.players.bot = { id: "bot", socket };
    this.socketToRoom.set(socket, roomId);
    this.socketToPlayer.set(socket, "bot");

    safeSend(socket, { type: "ROOM_JOINED", roomId, playerId: "bot" });

    room.battle = createStartedBattle();
    this.broadcast(room, {
      type: "GAME_STARTED",
      roomId,
      battle: room.battle,
      playerId: "player",
    }, {
      type: "GAME_STARTED",
      roomId,
      battle: room.battle,
      playerId: "bot",
    });
  }

  private applyGameAction(socket: WebSocket, action: BattleAction) {
    const roomId = this.socketToRoom.get(socket);
    const playerId = this.socketToPlayer.get(socket);

    if (!roomId || !playerId) {
      safeSend(socket, { type: "ERROR", message: "Сначала создай комнату или подключись к ней" });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room || !room.battle) {
      safeSend(socket, { type: "ERROR", message: "Бой еще не начался" });
      return;
    }

    if (room.battle.status !== "active") {
      safeSend(socket, { type: "ERROR", message: "Бой уже завершен" });
      return;
    }

    if (action.type !== "TIMER_TICK" && room.battle.activePlayer !== playerId) {
      safeSend(socket, { type: "ERROR", message: "Сейчас ход противника" });
      return;
    }

    const safeAction = overwritePlayerId(action, playerId);
    room.battle = applyAction(room.battle, safeAction);

    this.broadcastSame(room, {
      type: "GAME_STATE",
      roomId,
      battle: room.battle,
    });
  }

  private broadcastSame(room: Room, message: PvpServerMessage) {
    for (const player of Object.values(room.players)) {
      if (player) safeSend(player.socket, message);
    }
  }

  private broadcast(room: Room, playerMessage: PvpServerMessage, botMessage: PvpServerMessage) {
    if (room.players.player) safeSend(room.players.player.socket, playerMessage);
    if (room.players.bot) safeSend(room.players.bot.socket, botMessage);
  }
}
