# Oproxy MCP Relay

A small relay that exposes a standard MCP Streamable HTTP endpoint to Oproxy Chat and forwards JSON-RPC messages to the Oproxy Chat desktop app over a reverse WebSocket.

```
LibreChat (chat.oproxy.world)
   │  Streamable HTTP MCP
   ▼
relay (this service)
   │  WebSocket (app-initiated)
   ▼
Oproxy Chat.app
   └─ local MCP server (create_docx / create_pdf / create_xlsx / create_pptx)
```

The app does not expose a public port. The relay is the only public endpoint; the app reconnects to it automatically.

## Run

```bash
RELAY_TOKEN="<token>" \
RELAY_PORT=4444 \
RELAY_HOST=127.0.0.1 \
RELAY_PUBLIC_URL="https://mcp.example.com" \
node relay/server.js
```

| Environment variable | Default | Description |
| --- | --- | --- |
| `RELAY_TOKEN` | required | Shared bearer token (PoC). Production should use OIDC-issued tunnel tokens. |
| `RELAY_PORT` | `4444` | HTTP / WebSocket listen port. |
| `RELAY_HOST` | `127.0.0.1` | Listen address. Use `0.0.0.0` inside a container or behind a reverse proxy. |
| `RELAY_PUBLIC_URL` | empty | Public base URL, shown in `/health` and logs. |
| `RELAY_REQUEST_TIMEOUT_MS` | `60000` | How long to wait for the app to answer a JSON-RPC request. |

For local development, point the app at `ws://127.0.0.1:4444/app` directly.

For public access, deploy behind Oproxy's own reverse proxy / load balancer at `mcp.oproxy.world`. Do not use Cloudflare Tunnel or Cloudflare proxy.

nginx example:

```nginx
location / {
  proxy_pass http://127.0.0.1:4444;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 3600s;
  proxy_send_timeout 3600s;
  proxy_buffering off;
}
```

## Docker

Build from the repository root:

```bash
docker build -f relay/Dockerfile -t oproxy-relay .
docker run --rm -p 4444:4444 \
  -e RELAY_TOKEN="<token>" \
  -e RELAY_HOST=0.0.0.0 \
  -e RELAY_PUBLIC_URL="https://mcp.example.com" \
  oproxy-relay
```

## Auth

- HTTP MCP endpoint: `Authorization: Bearer <token>`.
- App WebSocket: `Authorization: Bearer <token>` (preferred) or `?token=<token>` (legacy query fallback).
- Token comparison uses `crypto.timingSafeEqual`.

## App configuration

`~/Library/Application Support/Oproxy Chat/mcp-config.json`:

```json
{
  "relayUrl": "wss://mcp.example.com/app",
  "relayToken": "<token>",
  "relayTokenUrl": "https://chat.oproxy.world/api/oproxy/relay-token",
  "relayPublicUrl": "https://mcp.example.com"
}
```

- `relayUrl`: WebSocket endpoint used by the app.
- `relayToken`: static token for local development / PoC.
- `relayTokenUrl`: optional token exchange endpoint. When set, the app calls it with the logged-in session cookie and uses the returned `token` / `expiresAt`. Tokens are refreshed automatically before expiry and after a `1008` auth close.
- `relayPublicUrl`: public base URL shown in the status window and copied into the chat MCP configuration.

The app connects to the relay on launch and reconnects with exponential backoff. The status window shows **Relay 连接** and **Relay 公网地址**.

## Chat MCP configuration

In Oproxy Chat: **MCP 设置 → 添加 MCP**

- URL: `https://mcp.example.com/mcp`
- Transport: `Streamable HTTPS`
- Auth: `API 密钥` / `Bearer`
- API key: `<token>`

The chat only connects to the relay. App restarts do not change the chat MCP URL.

## Health / offline behavior

```bash
curl https://mcp.example.com/health
```

```json
{
  "ok": true,
  "version": "0.2.0",
  "publicUrl": "https://mcp.example.com",
  "uptimeSeconds": 120,
  "appConnected": true,
  "appConnectedAt": "2026-11-09T01:31:49.917Z",
  "appUserId": null,
  "pendingRequests": 0
}
```

- `appConnected: true` — the desktop app is connected.
- `appConnected: false` — the app is offline. Tool calls return a JSON-RPC error:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "本地 Oproxy Chat 未连接。请打开桌面应用后重试（oproxy://open）。",
    "data": {
      "openUrl": "oproxy://open",
      "installUrl": "https://oproxy.world"
    }
  }
}
```

When the app reconnects, the next tool call works without editing the chat MCP configuration.

## Protocol notes

- The relay accepts MCP JSON-RPC POSTs at `/mcp` and forwards them to the app WebSocket.
- The app forwards each request to its local MCP server (`http://127.0.0.1:3333/mcp`) and returns the response.
- `Accept` and `MCP-Protocol-Version` headers are passed through to the local MCP server.
- The relay uses a heartbeat (WebSocket ping/pong) and rejects pending requests when the app disconnects.
- `SIGTERM` / `SIGINT` trigger a graceful shutdown: pending requests are rejected and WebSocket clients receive close code `1001`.
- The relay currently supports one app connection and a shared bearer token. Multi-user routing and OIDC-issued tokens are the next step.

## Production checklist

- Deploy at a stable domain such as `mcp.oproxy.world` with TLS.
- Use `wss://mcp.oproxy.world/app` for the app WebSocket.
- Exchange the OIDC session for a short-lived, revocable tunnel token.
- Terminate TLS at the load balancer / reverse proxy and enable WebSocket upgrade.
- Set proxy idle timeout above the heartbeat interval (for example 3600s).
- Add per-user routing, rate limits, audit logging, and observability.
- If running more than one relay instance, use sticky sessions or a shared pub/sub layer.
