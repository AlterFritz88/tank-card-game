import { randomInt } from "node:crypto";
import type { WebSocket } from "ws";
import { applyAction } from "../../tank-card-game/src/game/engine";
import {
  createInitialBattleState,
  STEP_TIME_MS,
} from "../../tank-card-game/src/game/initialState";
import type { BattleAction, BattleState, PlayerId } from "../../tank-card-game/src/game/types";
import { createBattleViewForPlayer } from "./battleView";
import type { MatchEndReason, PvpClientMessage, PvpServerMessage } from "./protocol";

type RoomPlayer = {
  id: PlayerId;
  socket: WebSocket;
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

type Room = {
  id: string;
  players: Partial<Record<PlayerId, RoomPlayer>>;
  battle: BattleState | null;
  pendingStartRoll: PendingStartRoll | null;
  turnTimer: PvpTurnTimer | null;
  ended: boolean;
  cleanupTimer: NodeJS.Timeout | null;
};

const START_ROLL_DURATION_MS = 2800;
const START_ROLL_RESULT_DELAY_MS = 350;
const START_ROLL_FINISH_DELAY_MS = 900;
const PVP_TURN_DURATION_MS = STEP_TIME_MS;
const PVP_TURN_TIMER_BROADCAST_INTERVAL_MS = 500;
const ROOM_CLEANUP_DELAY_MS = 30_000;

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

function getRandomStartingPlayer(): PlayerId {
  return randomInt(0, 2) === 0 ? "player" : "bot";
}

function createStartedBattle(startingPlayer: PlayerId): BattleState {
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
  private waitingRoomId: string | null = null;

  handleMessage(socket: WebSocket, rawData: WebSocket.RawData) {
    let message: PvpClientMessage;

    try {
      message = JSON.parse(rawData.toString()) as PvpClientMessage;
    } catch {
      safeSend(socket, { type: "ERROR", message: "Некорректное JSON-сообщение" });
      return;
    }

    switch (message.type) {
      case "FIND_MATCH":
        this.findMatch(socket);
        break;
      case "CREATE_ROOM":
        this.createRoom(socket);
        break;
      case "JOIN_ROOM":
        this.joinRoom(socket, message.roomId);
        break;
      case "GAME_ACTION":
        this.applyGameAction(socket, message.action);
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

    console.log(`[PVP:${room.id}] player ${playerId} disconnected`);
    const wasWaitingForOpponent = this.isWaitingForOpponent(room);
    this.releaseSocket(socket, room, playerId);

    if (room.ended) {
      this.deleteRoomIfEmpty(room);
      return;
    }

    if (wasWaitingForOpponent) {
      this.cancelWaitingRoom(room);
      return;
    }

    if (room.battle?.status === "active") {
      this.finishMatchByPlayerExit(room, playerId, "disconnect");
      return;
    }

    this.deleteRoomIfEmpty(room);
  }

  private findMatch(socket: WebSocket) {
    safeSend(socket, { type: "MATCHMAKING_STARTED" });

    const waitingRoom = this.getWaitingRoom();

    if (waitingRoom) {
      this.joinExistingWaitingRoom(socket, waitingRoom);
      return;
    }

    this.createRoom(socket, { makePublicWaiting: true });
  }

  private getWaitingRoom(): Room | null {
    if (!this.waitingRoomId) return null;

    const room = this.rooms.get(this.waitingRoomId);
    if (!room || !room.players.player || room.players.bot || room.battle) {
      this.waitingRoomId = null;
      return null;
    }

    const socket = room.players.player.socket;
    if (socket.readyState !== socket.OPEN) {
      this.waitingRoomId = null;
      return null;
    }

    return room;
  }

  private createRoom(socket: WebSocket, options?: { makePublicWaiting?: boolean }) {
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
      pendingStartRoll: null,
      turnTimer: null,
      ended: false,
      cleanupTimer: null,
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(socket, roomId);
    this.socketToPlayer.set(socket, "player");

    if (options?.makePublicWaiting) {
      this.waitingRoomId = roomId;
    }

    safeSend(socket, { type: "ROOM_CREATED", roomId, playerId: "player" });
    safeSend(socket, { type: "WAITING_FOR_OPPONENT", roomId });
  }

  private joinExistingWaitingRoom(socket: WebSocket, room: Room) {
    this.waitingRoomId = null;

    room.players.bot = { id: "bot", socket };
    this.socketToRoom.set(socket, room.id);
    this.socketToPlayer.set(socket, "bot");

    safeSend(socket, { type: "ROOM_JOINED", roomId: room.id, playerId: "bot" });

    this.startFirstTurnRoll(room);
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

    if (this.waitingRoomId === roomId) {
      this.waitingRoomId = null;
    }

    room.players.bot = { id: "bot", socket };
    this.socketToRoom.set(socket, roomId);
    this.socketToPlayer.set(socket, "bot");

    safeSend(socket, { type: "ROOM_JOINED", roomId, playerId: "bot" });

    this.startFirstTurnRoll(room);
  }

  private startFirstTurnRoll(room: Room) {
    if (room.ended) return;
    if (!room.players.player || !room.players.bot) return;

    const firstPlayer = getRandomStartingPlayer();
    const startsAt = Date.now();
    const revealAt = startsAt + START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS;
    const gameStartDelay = START_ROLL_DURATION_MS + START_ROLL_RESULT_DELAY_MS + START_ROLL_FINISH_DELAY_MS;

    console.log(
      `[PVP:${room.id}] match found; first turn roll: ${firstPlayer === "player" ? "player 1" : "player 2"}`,
    );

    room.battle = createStartedBattle(firstPlayer);

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
      room.battle = createStartedBattle(room.pendingStartRoll.firstPlayer);
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

    const previousActivePlayer = room.battle.activePlayer;
    const safeAction = overwritePlayerId(action, playerId);
    room.battle = applyAction(room.battle, safeAction);

    this.broadcastBattleState(room);

    if (room.battle.status !== "active") {
      this.clearTurnTimer(room);
      return;
    }

    if (
      safeAction.type === "END_TURN" ||
      room.battle.activePlayer !== previousActivePlayer
    ) {
      this.restartTurnTimer(room);
    }
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

  private getRoomBySocket(socket: WebSocket): Room | null {
    const roomId = this.socketToRoom.get(socket);
    if (!roomId) return null;

    return this.rooms.get(roomId) ?? null;
  }

  private getOpponent(playerId: PlayerId): PlayerId {
    return playerId === "player" ? "bot" : "player";
  }

  private isWaitingForOpponent(room: Room): boolean {
    return !room.battle && !room.pendingStartRoll && Boolean(room.players.player) && !room.players.bot;
  }

  private releaseSocket(socket: WebSocket, room: Room, playerId: PlayerId) {
    if (room.players[playerId]?.socket === socket) {
      delete room.players[playerId];
    }

    this.socketToRoom.delete(socket);
    this.socketToPlayer.delete(socket);
  }

  private cancelWaitingRoom(room: Room, notifySocket?: WebSocket) {
    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);

    if (this.waitingRoomId === room.id) {
      this.waitingRoomId = null;
    }

    console.log(`[PVP:${room.id}] matchmaking cancelled`);

    const sockets = Object.values(room.players).flatMap((player) =>
      player ? [player.socket] : [],
    );

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
    room.battle = {
      ...room.battle,
      status,
      log: [...room.battle.log, reasonText],
    };

    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);
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

  private scheduleRoomCleanup(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.cleanupTimer) return;

    room.cleanupTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomId);
      if (!currentRoom) return;

      this.clearTurnTimer(currentRoom);
      this.clearPendingStartRoll(currentRoom);
      this.rooms.delete(roomId);
      console.log(`[PVP:${roomId}] room cleaned`);
    }, ROOM_CLEANUP_DELAY_MS);
  }

  private deleteRoomIfEmpty(room: Room) {
    if (room.players.player || room.players.bot) return;

    this.clearTurnTimer(room);
    this.clearPendingStartRoll(room);

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }

    if (this.waitingRoomId === room.id) {
      this.waitingRoomId = null;
    }

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

    this.broadcastSame(room, {
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

    console.log(`[PVP:${room.id}] timer timeout for ${expectedPlayer}`);

    room.battle = applyAction(room.battle, {
      type: "END_TURN",
      playerId: expectedPlayer,
    });

    this.broadcastBattleState(room);

    if (room.battle.status === "active") {
      this.restartTurnTimer(room);
    } else {
      this.clearTurnTimer(room);
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

  private broadcastSame(room: Room, message: PvpServerMessage) {
    for (const player of Object.values(room.players)) {
      if (player) safeSend(player.socket, message);
    }
  }

}
