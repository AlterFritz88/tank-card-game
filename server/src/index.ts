import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST;
const allowedOrigins = parseAllowedOrigins(
  process.env.WS_ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS
);
const server = new WebSocketServer({
  ...(host ? { port, host } : { port }),
  verifyClient: ({ origin }, done) => {
    if (isOriginAllowed(origin)) {
      done(true);
      return;
    }

    console.warn(`Rejected WebSocket connection from origin: ${origin ?? "<none>"}`);
    done(false, 403, "Forbidden");
  },
});
const rooms = new RoomManager();

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (allowedOrigins.length === 0) return true;
  if (!origin) return false;
  if (allowedOrigins.includes("*")) return true;

  return allowedOrigins.includes(origin);
}

server.on("connection", (socket) => {
  socket.on("message", (data) => rooms.handleMessage(socket, data));
  socket.on("close", () => rooms.handleClose(socket));
  socket.on("error", () => rooms.handleClose(socket));
});

console.log(
  `Panzershrek WebSocket server started on ws://${host ?? "0.0.0.0"}:${port}`
);

if (allowedOrigins.length > 0) {
  console.log(`Allowed WebSocket origins: ${allowedOrigins.join(", ")}`);
} else {
  console.log("Allowed WebSocket origins: all origins");
}
