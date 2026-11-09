import express from "express";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.RELAY_PORT || 4444);
const TOKEN = process.env.RELAY_TOKEN || "";

if (!TOKEN) {
  console.error("RELAY_TOKEN is required");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "20mb" }));

let appSocket = null;
let appConnectedAt = null;
const pending = new Map();

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
    appConnected: Boolean(appSocket && appSocket.readyState === WebSocket.OPEN),
    appConnectedAt,
  });
});

app.post("/mcp", async (req, res) => {
  const authorization = req.headers.authorization || "";
  if (authorization !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const message = req.body;
  if (!message || typeof message !== "object") {
    res.status(400).json({ error: "Invalid JSON-RPC body" });
    return;
  }

  if (message.method === "tools/call") {
    console.log(`[relay] request tools/call ${message.params?.name || "(unknown)"}`);
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
      }, 60_000);

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

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`[relay] listening on http://127.0.0.1:${PORT}`);
});

const wss = new WebSocketServer({ server, path: "/app" });

wss.on("connection", (ws, req) => {
  let token = "";

  try {
    const url = new URL(req.url || "/app", "http://127.0.0.1");
    token = url.searchParams.get("token") || "";
  } catch {
    token = "";
  }

  if (token !== TOKEN) {
    ws.close(1008, "Unauthorized");
    return;
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
  ws.isAlive = true;
  console.log("[relay] app connected");

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
        `[relay] tools/call ${message.params?.name || "(unknown)"}`,
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
