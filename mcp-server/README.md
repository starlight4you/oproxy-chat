# Oproxy Local MCP Server

A local MCP server for Oproxy Chat. It exposes a `create_docx` tool and saves generated Word documents to `~/Downloads`.

## Requirements

- Node.js 20+
- `cloudflared` (`brew install cloudflared`)
- An Oproxy Chat account that can add MCP servers

## Install

```bash
cd mcp-server
npm install
```

## Run

1. Generate a token:

```bash
TOKEN=$(openssl rand -hex 24)
echo "$TOKEN" > /tmp/oproxy-mcp-token
```

2. Start a quick tunnel to the local server port:

```bash
cloudflared tunnel --url http://127.0.0.1:3333 --no-autoupdate
```

Copy the `https://xxxx.trycloudflare.com` URL from the output.

3. Start the MCP server with the tunnel URL:

```bash
MCP_TOKEN="$TOKEN" \
MCP_PORT=3333 \
PUBLIC_BASE_URL="https://xxxx.trycloudflare.com" \
node server.js
```

4. In Oproxy Chat: **MCP 设置 → 添加 MCP**

- Name: `Oproxy Local Docs`
- URL: `https://xxxx.trycloudflare.com/mcp`
- Transport: `Streamable HTTPS`
- Auth: `API 密钥`
- API key: the token
- Header Format: `Bearer`
- Check **我信任此应用**
- Click **创建**, then **连接**

5. Ask the chat for a Word document. The AI calls `create_docx`, the file is saved to `~/Downloads`, and the tool result includes a public download link.

## Test

```bash
MCP_URL="https://xxxx.trycloudflare.com/mcp" \
MCP_TOKEN="$TOKEN" \
node test-streamable-client.js
```

## Security

- The quick tunnel is public. The MCP endpoint requires the bearer token; file links use random UUIDs.
- The server only generates documents; it does not execute arbitrary code.
- Stop the tunnel/server when not needed:

```bash
pkill -f "node server.js"
pkill -f "cloudflared tunnel"
```

## Notes

- The quick tunnel URL changes every restart. Update the MCP server URL in Oproxy Chat after a restart.
- For a stable URL, use a named Cloudflare Tunnel with your own domain.
- The server currently supports Word `.docx`. PDF/Excel/PPT tools can be added later.
