import express from "express";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const VERSION = "0.2.0";
const PORT = Number(process.env.RELAY_PORT || 4444);
const HOST = process.env.RELAY_HOST || "127.0.0.1";
const TOKEN = process.env.RELAY_TOKEN || "";
const PUBLIC_URL = String(process.env.RELAY_PUBLIC_URL || "").replace(
  /\/$/,
  "",
);
const REQUEST_TIMEOUT_MS = Number(
  process.env.RELAY_REQUEST_TIMEOUT_MS || 60_000,
);
const STARTED_AT = Date.now();

if (!TOKEN) {
  console.error("RELAY_TOKEN is required");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));

let appSocket = null;
let appConnectedAt = null;
let appUserId = "";
let shuttingDown = false;
const pending = new Map();

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(value) {
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function authorizeRequest(req) {
  return safeEqual(bearerToken(req.headers.authorization), TOKEN);
}

function authorizeSocket(req) {
  if (authorizeRequest(req)) return true;

  try {
    const url = new URL(req.url || "/app", "http://127.0.0.1");
    return safeEqual(url.searchParams.get("token") || "", TOKEN);
  } catch {
    return false;
  }
}

function offlineError(id) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code: -32000,
      message:
        "本地 Oproxy Chat 未连接。请打开桌面应用后重试（oproxy://open）。",
      data: {
        openUrl: "oproxy://open",
        installUrl: "https://oproxy.world",
      },
    },
  };
}

function sendToApp(message, req) {
  const envelope = {
    __oproxy: true,
    message,
    headers: {
      accept: req.headers.accept || "",
      "mcp-protocol-version": req.headers["mcp-protocol-version"] || "",
    },
  };
  appSocket.send(JSON.stringify(envelope));
}

function rejectPending(message) {
  for (const [key, entry] of pending.entries()) {
    clearTimeout(entry.timer);
    entry.resolve({
      jsonrpc: "2.0",
      id: entry.id,
      error: {
        code: -32000,
        message,
      },
    });
    pending.delete(key);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    publicUrl: PUBLIC_URL || null,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    appConnected: Boolean(appSocket && appSocket.readyState === WebSocket.OPEN),
    appConnectedAt,
    appUserId: appUserId || null,
    pendingRequests: pending.size,
  });
});

app.post("/mcp", async (req, res) => {
  if (!authorizeRequest(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const message = req.body;
  if (!message || typeof message !== "object") {
    res.status(400).json({ error: "Invalid JSON-RPC body" });
    return;
  }

  if (message.method === "tools/call") {
    console.log(
      `[relay] request tools/call ${message.params?.name || "(unknown)"}${
        appUserId ? ` user=${appUserId}` : ""
      }`,
    );
  }

  if (!appSocket || appSocket.readyState !== WebSocket.OPEN) {
    res.json(offlineError(message.id));
    return;
  }

  if (message.id === undefined || message.id === null) {
    try {
      sendToApp(message, req);
    } catch {
      // Ignore notification send failures.
    }
    res.status(202).end();
    return;
  }

  const key = JSON.stringify(message.id);

  try {
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new Error("本地 App 响应超时"));
      }, REQUEST_TIMEOUT_MS);

      pending.set(key, { resolve, reject, timer, id: message.id });
      sendToApp(message, req);
    });

    res.json(response);
  } catch (error) {
    res.json({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32000,
        message: String(error?.message || error),
      },
    });
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed" });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed" });
});

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[relay] v${VERSION} listening on http://${HOST}:${PORT}${
      PUBLIC_URL ? ` (public: ${PUBLIC_URL})` : ""
    }`,
  );
});

server.on("error", (error) => {
  console.error("[relay] server error", error);
  process.exit(1);
});

const wss = new WebSocketServer({
  server,
  path: "/app",
  maxPayload: 20 * 1024 * 1024,
  perMessageDeflate: false,
});

wss.on("connection", (ws, req) => {
  if (!authorizeSocket(req)) {
    ws.close(1008, "Unauthorized");
    return;
  }

  let userId = "";

  try {
    const url = new URL(req.url || "/app", "http://127.0.0.1");
    userId = url.searchParams.get("user") || "";
  } catch {
    userId = "";
  }

  if (appSocket && appSocket.readyState === WebSocket.OPEN) {
    try {
      appSocket.close(1000, "Replaced by a new app connection");
    } catch {
      // Ignore.
    }
  }

  appSocket = ws;
  appConnectedAt = new Date().toISOString();
  appUserId = userId;
  ws.isAlive = true;
  console.log(`[relay] app connected${userId ? ` user=${userId}` : ""}`);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data) => {
    let envelope;

    try {
      envelope = JSON.parse(data.toString());
    } catch {
      return;
    }

    const message = envelope?.__oproxy ? envelope.message : envelope;
    if (!message || typeof message !== "object") return;

    if (message.method === "tools/call") {
      console.log(
        `[relay] tools/call ${message.params?.name || "(unknown)"}${
          appUserId ? ` user=${appUserId}` : ""
        }`,
      );
    }

    if (message.id === undefined || message.id === null) return;

    const key = JSON.stringify(message.id);
    const entry = pending.get(key);
    if (!entry) return;

    clearTimeout(entry.timer);
    pending.delete(key);
    entry.resolve(message);
  });

  ws.on("close", () => {
    if (appSocket !== ws) return;
    appSocket = null;
    appConnectedAt = null;
    appUserId = "";
    console.log("[relay] app disconnected");
    rejectPending("本地 Oproxy Chat 已断开。请重新打开桌面应用。");
  });

  ws.on("error", (error) => {
    console.error("[relay] app websocket error", error?.message || error);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch {
        // Ignore.
      }
      continue;
    }

    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // Ignore.
    }
  }
}, 20_000);

wss.on("close", () => {
  clearInterval(heartbeat);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[relay] ${signal} received, shutting down`);

  clearInterval(heartbeat);
  rejectPending("Relay 正在重启，请稍后重试。");

  for (const ws of wss.clients) {
    try {
      ws.close(1001, "Relay shutting down");
    } catch {
      // Ignore.
    }
  }

  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
