import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST;
const clientDistPath = resolve(process.cwd(), "..", "tank-card-game", "dist");
const allowedOrigins = parseAllowedOrigins(
  process.env.WS_ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS
);
const httpServer = createServer((request, response) => {
  void handleHttpRequest(request.url ?? "/", request.method ?? "GET", response);
});
const server = new WebSocketServer({
  server: httpServer,
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
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

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

async function handleHttpRequest(
  rawUrl: string,
  method: string,
  response: ServerResponse
) {
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  if (rawUrl === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  const filePath = await resolveStaticFilePath(rawUrl);
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Client build not found. Run the frontend build first.");
    return;
  }

  await sendFile(filePath, response, method === "HEAD");
}

async function resolveStaticFilePath(rawUrl: string): Promise<string | null> {
  const requestUrl = new URL(rawUrl, "http://localhost");
  const rawPathname = decodeURIComponent(requestUrl.pathname);
  const normalizedPathname = normalize(rawPathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const requestedPath = resolve(clientDistPath, `.${normalizedPathname}`);

  if (!isInsideDirectory(requestedPath, clientDistPath)) {
    return null;
  }

  const directFile = await getExistingFilePath(requestedPath);
  if (directFile) return directFile;

  const indexFile = await getExistingFilePath(join(clientDistPath, "index.html"));
  return indexFile;
}

async function getExistingFilePath(filePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function isInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = normalize(filePath).slice(normalize(directoryPath).length);
  return relativePath === "" || relativePath.startsWith(sep);
}

async function sendFile(
  filePath: string,
  response: ServerResponse,
  headOnly: boolean
) {
  const fileStat = await stat(filePath);
  const contentType = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";

  response.writeHead(200, {
    "Cache-Control": filePath.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
    "Content-Length": fileStat.size,
    "Content-Type": contentType,
  });

  if (headOnly) {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

server.on("connection", (socket) => {
  socket.on("message", (data) => rooms.handleMessage(socket, data));
  socket.on("close", () => rooms.handleClose(socket));
  socket.on("error", () => rooms.handleClose(socket));
});

httpServer.listen(host ? { port, host } : { port }, () => {
  console.log(
    `Panzershrek server started on http://${host ?? "0.0.0.0"}:${port}`
  );
  console.log(`Serving client build from ${clientDistPath}`);

  if (allowedOrigins.length > 0) {
    console.log(`Allowed WebSocket origins: ${allowedOrigins.join(", ")}`);
  } else {
    console.log("Allowed WebSocket origins: all origins");
  }
});
