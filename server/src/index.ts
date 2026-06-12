import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST;
const server = new WebSocketServer(host ? { port, host } : { port });
const rooms = new RoomManager();

server.on("connection", (socket) => {
  socket.on("message", (data) => rooms.handleMessage(socket, data));
  socket.on("close", () => rooms.handleClose(socket));
  socket.on("error", () => rooms.handleClose(socket));
});

console.log(
  `Panzershrek WebSocket server started on ws://${host ?? "0.0.0.0"}:${port}`
);
