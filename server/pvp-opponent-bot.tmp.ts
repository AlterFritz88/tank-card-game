/**
 * Scripted PvP opponent: finds a public match on the local server and then
 * simply ends its turns, so a real client in the browser can play against it.
 */
import WebSocket from "ws";
const DEFAULT_PLAYER_HEADQUARTERS_ID = "training_unit";

const url = "ws://localhost:8787";
const sessionId = `bot-session-${Date.now()}`;
const socket = new WebSocket(url);

let myPlayerId: string | null = null;
let endTurnTimer: NodeJS.Timeout | null = null;

function log(...args: unknown[]) {
  console.log(new Date().toISOString().slice(11, 23), ...args);
}

function send(message: unknown) {
  socket.send(JSON.stringify(message));
}

function maybeEndTurn(battle: any) {
  if (!myPlayerId) return;
  if (!battle || battle.status !== "active") return;
  if (battle.activePlayer !== myPlayerId) return;
  if (endTurnTimer) return;

  endTurnTimer = setTimeout(() => {
    endTurnTimer = null;
    log("-> END_TURN");
    send({
      type: "GAME_ACTION",
      action: { type: "END_TURN", playerId: myPlayerId },
    });
  }, 3000);
}

socket.on("open", () => {
  log("connected, sending FIND_MATCH");
  send({
    type: "FIND_MATCH",
    sessionId,
    headquartersId: DEFAULT_PLAYER_HEADQUARTERS_ID,
  });
});

socket.on("message", (data) => {
  const message = JSON.parse(String(data));
  log("<-", message.type);

  if (message.type === "ROOM_CREATED" || message.type === "ROOM_JOINED") {
    myPlayerId = message.playerId;
    log("   playerId:", myPlayerId, "roomId:", message.roomId);
  }

  if (message.type === "GAME_STARTED") {
    myPlayerId = message.playerId;
    log("   game started; my id:", myPlayerId);
    maybeEndTurn(message.battle);
  }

  if (message.type === "GAME_STATE") {
    maybeEndTurn(message.battle);
  }

  if (message.type === "MATCH_ENDED") {
    log("match ended:", message.winner, message.reason);
    process.exit(0);
  }
});

socket.on("close", () => {
  log("socket closed");
  process.exit(0);
});

socket.on("error", (error) => {
  log("socket error", error);
});

// Safety: exit after 5 minutes no matter what.
setTimeout(() => {
  log("timeout, exiting");
  process.exit(0);
}, 15 * 60 * 1000);
