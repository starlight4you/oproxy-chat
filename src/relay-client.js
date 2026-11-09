import { WebSocket } from "ws";

export function createRelayClient({
  url,
  token,
  userId = "",
  getToken = null,
  localMcpUrl,
  localToken,
  onStatus = () => {},
}) {
  let socket = null;
  let stopped = true;
  let connecting = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let connected = false;
  let lastConnectedAt = null;
  let lastError = "";
  let currentToken = String(token || "");
  let tokenExpiresAt = 0;
  let lastTokenRefreshAt = null;
  let pingTimer = null;
  let pongWatchTimer = null;
  let lastPongAt = Date.now();

  function getStatus() {
    return {
      connected,
      url,
      userId: userId || null,
      lastConnectedAt,
      reconnectAttempts,
      lastError,
      tokenExpiresAt: tokenExpiresAt
        ? new Date(tokenExpiresAt).toISOString()
        : null,
      lastTokenRefreshAt,
    };
  }

  function notify() {
    try {
      onStatus(getStatus());
    } catch {
      // The host app can ignore status callback errors.
    }
  }

  function clearTimers() {
    clearInterval(pingTimer);
    clearInterval(pongWatchTimer);
    pingTimer = null;
    pongWatchTimer = null;
  }

  function startHeartbeat() {
    clearTimers();
    lastPongAt = Date.now();

    pingTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.ping();
        } catch {
          // The close handler will reconnect.
        }
      }
    }, 20_000);

    pongWatchTimer = setInterval(() => {
      if (
        socket?.readyState === WebSocket.OPEN &&
        Date.now() - lastPongAt > 60_000
      ) {
        try {
          socket.terminate();
        } catch {
          // The close handler will reconnect.
        }
      }
    }, 15_000);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;

    const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    notify();

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  async function resolveToken() {
    const now = Date.now();
    const needsRefresh =
      getToken &&
      (!currentToken || !tokenExpiresAt || tokenExpiresAt - now < 60_000);

    if (!needsRefresh) return currentToken;

    try {
      const result = await getToken();
      const value = typeof result === "string" ? result : result?.token;
      const expiresAt =
        typeof result === "object" ? Number(result?.expiresAt) : 0;

      if (!value) throw new Error("token endpoint returned no token");

      currentToken = String(value);
      tokenExpiresAt =
        Number.isFinite(expiresAt) && expiresAt > 0
          ? expiresAt < 1e12
            ? expiresAt * 1000
            : expiresAt
          : now + 5 * 60_000;
      lastTokenRefreshAt = new Date().toISOString();
      lastError = "";
      notify();
    } catch (error) {
      lastError = `获取 relay token 失败：${String(error?.message || error)}`;
      notify();
    }

    return currentToken;
  }

  async function forwardToLocalServer(message, headers = {}) {
    if (!message || typeof message !== "object") return null;

    const requestHeaders = {
      "Content-Type": "application/json",
      Accept: headers.accept || "application/json, text/event-stream",
      Authorization: `Bearer ${localToken}`,
    };

    if (headers["mcp-protocol-version"]) {
      requestHeaders["mcp-protocol-version"] = headers["mcp-protocol-version"];
    }

    const isNotification = message.id === undefined || message.id === null;
    const response = await fetch(localMcpUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(message),
    });

    if (isNotification) return null;

    const text = await response.text();
    if (!text) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: "本地 MCP 服务返回了空响应。" },
      };
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: "本地 MCP 服务返回了无效响应。" },
      };
    }
  }

  async function handleMessage(data, ws) {
    let envelope;

    try {
      envelope = JSON.parse(data.toString());
    } catch {
      return;
    }

    const message = envelope?.__oproxy ? envelope.message : envelope;
    const headers = envelope?.__oproxy ? envelope.headers || {} : {};

    if (!message || typeof message !== "object") return;

    try {
      const response = await forwardToLocalServer(message, headers);
      if (response && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      lastError = String(error?.message || error);
      notify();

      if (
        message.id !== undefined &&
        message.id !== null &&
        ws.readyState === WebSocket.OPEN
      ) {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32000,
              message: `本地 MCP 服务不可用：${lastError}`,
            },
          }),
        );
      }
    }
  }

  async function connect() {
    if (stopped || connecting) return;
    connecting = true;

    try {
      const authToken = await resolveToken();
      if (stopped) return;

      if (!authToken) {
        lastError = lastError || "缺少 relay token";
        notify();
        scheduleReconnect();
        return;
      }

      const separator = url.includes("?") ? "&" : "?";
      const wsUrl = userId
        ? `${url}${separator}user=${encodeURIComponent(userId)}`
        : url;

      let ws;

      try {
        ws = new WebSocket(wsUrl, {
          headers: { Authorization: `Bearer ${authToken}` },
          handshakeTimeout: 15_000,
        });
        socket = ws;
      } catch (error) {
        lastError = String(error?.message || error);
        notify();
        scheduleReconnect();
        return;
      }

      ws.on("open", () => {
        if (socket !== ws) return;
        connected = true;
        reconnectAttempts = 0;
        lastConnectedAt = new Date().toISOString();
        lastError = "";
        startHeartbeat();
        notify();
      });

      ws.on("message", (data) => {
        if (socket !== ws) return;
        handleMessage(data, ws);
      });

      ws.on("pong", () => {
        if (socket !== ws) return;
        lastPongAt = Date.now();
      });

      ws.on("error", (error) => {
        if (socket !== ws) return;
        lastError = String(error?.message || error);
        notify();
      });

      ws.on("close", (code) => {
        if (socket !== ws) return;
        connected = false;
        clearTimers();
        socket = null;

        if (code === 1008) {
          if (getToken) {
            currentToken = "";
            lastError = "Relay token 已失效，正在刷新";
          } else {
            lastError = "Relay 鉴权失败，请检查 token";
          }
        }

        notify();
        scheduleReconnect();
      });
    } finally {
      connecting = false;
    }
  }

  function start() {
    if (!url || !localMcpUrl) return;
    stopped = false;
    reconnectAttempts = 0;
    connect();
  }

  function stop() {
    stopped = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearTimers();

    if (socket) {
      try {
        socket.close();
      } catch {
        // Ignore.
      }
      socket = null;
    }

    connected = false;
    notify();
  }

  return {
    start,
    stop,
    getStatus,
  };
}
