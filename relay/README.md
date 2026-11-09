# Oproxy MCP Relay (PoC)

A small relay that exposes a standard MCP Streamable HTTP endpoint to Oproxy Chat and forwards JSON-RPC messages to the Oproxy Chat desktop app over a reverse WebSocket.

```
LibreChat (chat.oproxy.world)
   │  Streamable HTTP MCP
   ▼
relay (this service)
   │  WebSocket (app-initiated)
   ▼
Oproxy Chat.app
   └─ local MCP server (create_docx)
```

The app does not expose a public port. The relay is the only public endpoint; the app reconnects to it automatically.

## Run

```bash
RELAY_TOKEN="<token>" RELAY_PORT=4444 node relay/server.js
```

Expose the relay with cloudflared (or deploy it at a stable domain in production):

```bash
cloudflared tunnel --url http://127.0.0.1:4444 --no-autoupdate --protocol http2
```

Copy the `https://xxxx.trycloudflare.com` URL.

## App configuration

`~/Library/Application Support/Oproxy Chat/mcp-config.json`:

```json
{
  "relayUrl": "ws://127.0.0.1:4444/app",
  "relayToken": "<token>",
  "relayPublicUrl": "https://xxxx.trycloudflare.com"
}
```

The app connects to the relay on launch and reconnects with exponential backoff. The status window shows **Relay 连接** and **Relay 公网地址**.

## Chat MCP configuration

In Oproxy Chat: **MCP 设置 → 添加 MCP**

- URL: `https://xxxx.trycloudflare.com/mcp`
- Transport: `Streamable HTTPS`
- Auth: `API 密钥` / `Bearer`
- API key: `<token>`

The chat only connects to the relay. App restarts do not change the chat MCP URL.

## Health / offline behavior

```bash
curl http://127.0.0.1:4444/health
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
- The relay currently supports one app connection and a shared bearer token. Multi-user routing and OIDC-issued tokens are the next step.

## Production notes

- Deploy the relay at a stable domain such as `mcp.oproxy.world`.
- Use `wss://mcp.oproxy.world/app` for the app WebSocket.
- Exchange the OIDC session for a short-lived, revocable tunnel token (Phase 3).
- Add per-user routing, rate limits, observability, and TLS termination.
