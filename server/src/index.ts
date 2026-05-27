import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms";

const port = Number(process.env.PORT ?? 8787);
const server = new WebSocketServer({ port });
const rooms = new RoomManager();

server.on("connection", (socket) => {
  socket.on("message", (data) => rooms.handleMessage(socket, data));
  socket.on("close", () => rooms.handleClose(socket));
  socket.on("error", () => rooms.handleClose(socket));
});

console.log(`PVP WebSocket server started on ws://localhost:${port}`);
