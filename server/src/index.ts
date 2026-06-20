import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms";
import { getStorageStatuses } from "./storagePath";
import { PaymentManager } from "./payments";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST;
const clientDistPath = resolve(process.cwd(), "..", "tank-card-game", "dist");
const projectRootPath = resolve(process.cwd(), "..");
const allowedOrigins = parseAllowedOrigins(
  process.env.WS_ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS
);
const httpServer = createServer((request, response) => {
  void handleHttpRequest(request, response);
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
const payments = new PaymentManager();
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
const legalDocuments: Record<string, { fileName: string; title: string }> = {
  "/legal/user-agreement": {
    fileName: "пользовательское соглашение.txt",
    title: "Пользовательское соглашение",
  },
  "/legal/offer": {
    fileName: "оферта.txt",
    title: "Оферта",
  },
  "/legal/privacy-policy": {
    fileName: "Политика конфиденциальности.txt",
    title: "Политика конфиденциальности",
  },
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
  request: IncomingMessage,
  response: ServerResponse
) {
  const rawUrl = request.url ?? "/";
  const method = request.method ?? "GET";
  const requestUrl = new URL(rawUrl, "http://localhost");
  const corsHeaders = getCorsHeaders(request);

  if (method === "OPTIONS" && requestUrl.pathname.startsWith("/api/")) {
    response.writeHead(204, {
      ...corsHeaders,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    });
    response.end();
    return;
  }

  if (requestUrl.pathname === "/api/shop/gold-payment") {
    await handleCreateGoldPayment(request, response, corsHeaders);
    return;
  }

  if (requestUrl.pathname === "/api/shop/catalog") {
    handleShopCatalog(response, corsHeaders);
    return;
  }

  if (requestUrl.pathname.startsWith("/api/legal/")) {
    await handleLegalDocumentApi(requestUrl.pathname, response, corsHeaders);
    return;
  }

  if (requestUrl.pathname === "/api/payments/yookassa/webhook") {
    await handleYookassaWebhook(request, response, corsHeaders);
    return;
  }

  if (legalDocuments[requestUrl.pathname]) {
    await handleLegalDocument(requestUrl.pathname, response, method === "HEAD");
    return;
  }

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

  if (rawUrl === "/health/storage") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify(
        {
          ok: getStorageStatuses().every((status) => status.writable),
          storage: getStorageStatuses(),
        },
        null,
        2
      )
    );
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

function getCorsHeaders(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin) return {};
  if (!isOriginAllowed(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
  extraHeaders: Record<string, string> = {}
) {
  response.writeHead(statusCode, {
    ...extraHeaders,
    "Cache-Control": "no-cache",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function getPublicReturnUrl(request: IncomingMessage): string {
  const configuredReturnUrl = process.env.YOOKASSA_RETURN_URL?.trim();
  if (configuredReturnUrl) return configuredReturnUrl;

  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || "http";
  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  const safeHost = Array.isArray(host) ? host[0] : host;

  return `${protocol}://${safeHost ?? "localhost"}/`;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  const maxSize = 256 * 1024;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buffer.byteLength;

    if (totalSize > maxSize) {
      throw new Error("Слишком большой HTTP-запрос");
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function getBodyString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

async function handleCreateGoldPayment(
  request: IncomingMessage,
  response: ServerResponse,
  corsHeaders: Record<string, string>
) {
  if (request.method !== "POST") {
    response.writeHead(405, { ...corsHeaders, Allow: "POST" });
    response.end();
    return;
  }

  try {
    const body = await readJsonBody(request);
    const result = await payments.createGoldPayment({
      playerId: getBodyString(body, "playerId"),
      productId: getBodyString(body, "productId"),
      returnUrl: getPublicReturnUrl(request),
    });

    writeJson(response, 200, { ok: true, ...result }, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(response, 400, { ok: false, message }, corsHeaders);
  }
}

function handleShopCatalog(
  response: ServerResponse,
  corsHeaders: Record<string, string>
) {
  writeJson(
    response,
    200,
    {
      ok: true,
      goldProducts: payments.getGoldCatalog(),
    },
    corsHeaders
  );
}

async function handleYookassaWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  corsHeaders: Record<string, string>
) {
  if (request.method !== "POST") {
    response.writeHead(405, { ...corsHeaders, Allow: "POST" });
    response.end();
    return;
  }

  try {
    const body = await readJsonBody(request);
    const result = await payments.handleYookassaWebhook(body);
    writeJson(response, 200, { ok: true, ...result }, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Failed to handle YooKassa webhook", error);
    writeJson(response, 200, { ok: false, message }, corsHeaders);
  }
}

async function handleLegalDocument(
  pathname: string,
  response: ServerResponse,
  headOnly: boolean
) {
  const document = legalDocuments[pathname];
  if (!document) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Document not found");
    return;
  }

  try {
    const content = await readFile(resolve(projectRootPath, document.fileName), "utf8");
    const html = renderLegalDocumentPage(document.title, content);
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": "text/html; charset=utf-8",
    });

    if (headOnly) {
      response.end();
      return;
    }

    response.end(html);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Document not found");
  }
}

async function handleLegalDocumentApi(
  pathname: string,
  response: ServerResponse,
  corsHeaders: Record<string, string>
) {
  const slug = decodeURIComponent(pathname.replace(/^\/api\/legal\//, ""));
  const document = legalDocuments[`/legal/${slug}`];

  if (!document) {
    writeJson(
      response,
      404,
      { ok: false, message: "Document not found" },
      corsHeaders
    );
    return;
  }

  try {
    const content = await readFile(resolve(projectRootPath, document.fileName), "utf8");
    writeJson(
      response,
      200,
      { ok: true, title: document.title, content },
      corsHeaders
    );
  } catch {
    writeJson(
      response,
      404,
      { ok: false, message: "Document not found" },
      corsHeaders
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLegalDocumentPage(title: string, content: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | PANZERSHREK</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --brass: #d6ad53;
      --paper: #f4e5bf;
      --muted: rgba(244, 229, 191, 0.72);
      --panel: rgba(12, 13, 11, 0.88);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--paper);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(circle at 50% 12%, rgba(175, 133, 56, 0.16), transparent 36%),
        linear-gradient(180deg, rgba(35, 38, 31, 0.98), rgba(5, 7, 6, 1));
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(90deg, rgba(0,0,0,0.72), transparent 24%, transparent 76%, rgba(0,0,0,0.72)),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px);
      mix-blend-mode: overlay;
    }

    .page {
      position: relative;
      z-index: 1;
      width: min(980px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 52px;
    }

    .back {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 146px;
      min-height: 42px;
      margin-bottom: 22px;
      padding: 10px 18px;
      color: #fff0bd;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-family: Rajdhani, Inter, sans-serif;
      font-weight: 700;
      background: linear-gradient(180deg, rgba(156, 159, 154, 0.34), rgba(45, 48, 49, 0.76));
      box-shadow: inset 0 0 0 1px rgba(216, 174, 92, 0.3), 0 16px 34px rgba(0,0,0,0.38);
    }

    .panel {
      padding: clamp(22px, 4vw, 42px);
      background: linear-gradient(180deg, rgba(18,18,14,0.82), var(--panel));
      box-shadow: 0 28px 70px rgba(0,0,0,0.62), inset 0 0 0 1px rgba(216,174,92,0.2);
    }

    h1 {
      margin: 0 0 8px;
      color: var(--brass);
      font-family: Rajdhani, Inter, sans-serif;
      font-size: clamp(34px, 6vw, 58px);
      line-height: 0.95;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-shadow: 0 6px 18px rgba(0,0,0,0.74);
    }

    .kicker {
      margin: 0 0 28px;
      color: var(--muted);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 12px;
    }

    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: rgba(255, 246, 221, 0.9);
      font: 600 15px/1.62 Inter, ui-sans-serif, system-ui, sans-serif;
    }

    @media (max-width: 720px) {
      .page { width: min(100vw - 20px, 980px); padding-top: 18px; }
      .panel { padding: 18px; }
      pre { font-size: 13px; line-height: 1.55; }
    }
  </style>
</head>
<body>
  <main class="page">
    <a class="back" href="/">Назад в игру</a>
    <article class="panel">
      <h1>${escapeHtml(title)}</h1>
      <p class="kicker">PANZERSHREK legal archive</p>
      <pre>${escapeHtml(content)}</pre>
    </article>
  </main>
</body>
</html>`;
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
