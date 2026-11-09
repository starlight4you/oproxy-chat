# Oproxy Local MCP Server

A standalone reference/debug MCP server for Oproxy Chat. It exposes a `create_docx` tool and saves generated Word documents to `~/Downloads`.

> The app-managed server in `../src/mcp-server.js` is the one actually used by the desktop app. It also exposes `create_pdf`, `create_xlsx`, and `create_pptx`.

## Requirements

- Node.js 20+
- An Oproxy Chat account that can add MCP servers
- For remote chat access: your own HTTPS reverse proxy / gateway (do **not** use Cloudflare Tunnel or Cloudflare proxy)

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

2. Start the MCP server:

```bash
MCP_TOKEN="$TOKEN" \
MCP_PORT=3333 \
PUBLIC_BASE_URL="https://mcp.example.com" \
node server.js
```

`PUBLIC_BASE_URL` is optional. It is only used to build file download links in tool results.

3. Expose the server to Oproxy Chat:

- Local-only testing: use `http://127.0.0.1:3333/mcp`.
- Remote chat: put the server behind your own HTTPS reverse proxy / load balancer at a stable domain, for example `https://mcp.example.com`, and forward both HTTP and WebSocket traffic to `127.0.0.1:3333`.
- Do not use Cloudflare Tunnel / Cloudflare proxy.

4. In Oproxy Chat: **MCP 设置 → 添加 MCP**

- Name: `Oproxy Local Docs`
- URL: `https://mcp.example.com/mcp`
- Transport: `Streamable HTTPS`
- Auth: `API 密钥`
- API key: the token
- Header Format: `Bearer`
- Check **我信任此应用**
- Click **创建**, then **连接**

5. Ask the chat for a Word document. The AI calls `create_docx`, the file is saved to `~/Downloads`, and the tool result includes a public download link.

## Test

```bash
MCP_URL="https://mcp.example.com/mcp" \
MCP_TOKEN="$TOKEN" \
node test-streamable-client.js
```

## Security

- The public endpoint requires the bearer token; file links use random UUIDs.
- The server only generates documents; it does not execute arbitrary code.
- Stop the server when not needed:

```bash
pkill -f "node server.js"
```

## Notes

- For a stable URL, use your own domain and reverse proxy / load balancer. Do not use Cloudflare Tunnel.
- This reference server only implements Word `.docx`. The app-managed server supports Word, PDF, Excel, and PowerPoint.
