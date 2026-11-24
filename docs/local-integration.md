# 全本地联调：LibreChat + Relay + Oproxy Chat.app

> **这不是最终用户流程。**
> 最终用户只需要：安装 Oproxy Chat → 打开 → `Continue with Oproxy` 登录 → 直接聊天。
> 本文的 Docker / 本地 LibreChat / mock model / relay 只用于开发阶段，在没有公网入口时验证 MCP 链路。
> 产品路径仍然是 App 加载 `https://chat.oproxy.world`，由 Oproxy 服务端提供 relay 和短期 token。

> 目标：不使用 Cloudflare Tunnel、ngrok 或任何公网隧道，在本机跑通
> **LibreChat UI → MCP → relay → 桌面 App → 本地文档工具 → `~/Downloads`**。
>
> 本文以本机已验证的环境为准：LibreChat 跑在 Docker，relay 和 mock model 跑在宿主机，App 用开发模式加载本地 LibreChat。

## 1. 架构与端口

```
┌──────────────────────────────────────────┐
│ LibreChat（Docker，127.0.0.1:3080）       │
│  - UI + API                              │
│  - MCP client 在 api 容器里               │
└───────────────┬──────────────────────────┘
                │ Streamable HTTP MCP
                │ http://host.docker.internal:4444/mcp
                ▼
┌──────────────────────────────────────────┐
│ Relay（宿主机，127.0.0.1:4444）           │
│  - POST /mcp                             │
│  - GET  /health                          │
│  - WS   /app                             │
└───────────────┬──────────────────────────┘
                │ WebSocket（App 主动连接）
                ▼
┌──────────────────────────────────────────┐
│ Oproxy Chat.app（开发模式）               │
│ 127.0.0.1:3333/mcp                       │
│ create_docx / create_pdf                 │
│ create_xlsx / create_pptx                │
└───────────────┬──────────────────────────┘
                │
                ▼
        ~/Downloads/*.docx / .pdf / .xlsx / .pptx

┌──────────────────────────────────────────┐
│ Mock model（宿主机，127.0.0.1:5555）      │
│ 仅用于无外部模型 API Key 时联调            │
└──────────────────────────────────────────┘
```

| 端口 | 组件 | 绑定地址 | 说明 |
| --- | --- | --- | --- |
| `3080` | LibreChat | `127.0.0.1` | 浏览器和 App 都访问这里 |
| `4444` | relay | `127.0.0.1` | LibreChat 容器通过 `host.docker.internal:4444` 访问 |
| `3333` | 本地 MCP | `127.0.0.1` | 由 App 启动 |
| `5555` | mock model | `127.0.0.1` | 仅本地测试使用 |
| `9223` | CDP | `127.0.0.1` | 可选，仅调试 App 时使用 |

**为什么不需要公网入口**：LibreChat 的 MCP client 在 Docker 容器里，容器通过 Docker 的 `host.docker.internal` 访问宿主机上的 relay；relay 只需要监听 `127.0.0.1:4444`，不需要暴露到公网。App 仍然主动连 relay，和远程聊天模式一致。

## 2. 文件位置

本机当前使用：

- LibreChat：`/Volumes/Clips 2301-04/librechat-local`
- Oproxy 仓库：`/Volumes/Clips 2301-04/ochat-refresh`
- mock model：`scripts/local-mock-model.mjs`

LibreChat 目录下新增了：

- `docker-compose.local.yml`：只启动 `api` + `mongodb` 的最小栈
- `librechat.yaml`：MCP server、mock model、权限配置
- `.env`：本地密钥、token、UID/GID

## 3. 一次性准备

### 3.1 克隆 LibreChat

```bash
git clone --depth 1 https://github.com/LibreChat-AI/LibreChat.git \
  /Volumes/Clips\ 2301-04/librechat-local
cd /Volumes/Clips\ 2301-04/librechat-local
```

### 3.2 生成 `.env`

```bash
cd /Volumes/Clips\ 2301-04/librechat-local
cp .env.example .env

TOKEN=$(jq -r .relayToken "$HOME/Library/Application Support/Oproxy Chat/mcp-config.json")

cat >> .env <<EOF

# ---- Oproxy local integration overrides ----
UID=$(id -u)
GID=$(id -g)
SEARCH=false
MEILI_MASTER_KEY=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ADMIN_PANEL_SESSION_SECRET=$(openssl rand -hex 32)
OPROXY_MCP_TOKEN=$TOKEN
EOF
```

`OPROXY_MCP_TOKEN` 必须和 App 的 `relayToken` 一致。App 的配置在：

```text
~/Library/Application Support/Oproxy Chat/mcp-config.json
```

### 3.3 `librechat.yaml`

```yaml
version: 1.3.18
cache: true

mcpSettings:
  allowedAddresses:
    - 'host.docker.internal:4444'

mcpServers:
  oproxy-local-relay:
    type: streamable-http
    url: 'http://host.docker.internal:4444/mcp'
    title: 'Oproxy Local Relay'
    description: 'Local Oproxy Chat MCP (Word / PDF / Excel / PowerPoint).'
    requiresOAuth: false
    timeout: 120000
    initTimeout: 30000
    headers:
      Authorization: 'Bearer ${OPROXY_MCP_TOKEN}'

endpoints:
  custom:
    # 没有外部模型 Key 时使用的本地 mock；有真实模型后可以删掉这一段。
    - name: 'Local Mock'
      apiKey: 'local-mock'
      baseURL: 'http://host.docker.internal:5555/v1'
      models:
        default:
          - 'mock-model'
        fetch: false
      titleConvo: false
      modelDisplayLabel: 'Local Mock'

interface:
  mcpServers:
    use: true
    create: true
```

### 3.4 `docker-compose.local.yml`

```yaml
services:
  api:
    container_name: LibreChat
    ports:
      - "127.0.0.1:${PORT:-3080}:${PORT:-3080}"
    depends_on:
      - mongodb
    image: registry.librechat.ai/librechat-ai/librechat-dev:latest
    restart: unless-stopped
    user: "${UID}:${GID}"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - HOST=0.0.0.0
      - PORT=${PORT:-3080}
      - MONGO_URI=mongodb://mongodb:27017/LibreChat
      - DOMAIN_CLIENT=${DOMAIN_CLIENT:-http://localhost:3080}
      - DOMAIN_SERVER=${DOMAIN_SERVER:-http://localhost:3080}
      - SEARCH=false
      - RAG_API_URL=
      - MEILI_HOST=
      - ALLOW_REGISTRATION=true
      - ALLOW_EMAIL_LOGIN=true
      - TRUST_PROXY=1
      - SCHEDULES_SINGLE_PROCESS=true
      - NO_PROXY=localhost,127.0.0.1,::1,mongodb,host.docker.internal
      - no_proxy=localhost,127.0.0.1,::1,mongodb,host.docker.internal
    volumes:
      - type: bind
        source: ./.env
        target: /app/.env
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
      - ./images:/app/client/public/images
      - ./uploads:/app/uploads
      - ./logs:/app/logs
      - ./skill:/app/skill
      - librechat-data:/app/data

  mongodb:
    container_name: chat-mongodb
    image: mongo:8.0.20
    restart: unless-stopped
    user: "${UID}:${GID}"
    volumes:
      - ./data-node:/data/db
    command: mongod --noauth

volumes:
  librechat-data:
```

### 3.5 启动 LibreChat

```bash
cd /Volumes/Clips\ 2301-04/librechat-local
docker compose -f docker-compose.local.yml up -d
docker compose -f docker-compose.local.yml logs -f api
```

看到下面这些日志说明 MCP 已连上：

```text
[MCP][oproxy-local-relay] URL: http://host.docker.internal:4444/mcp
[MCP][oproxy-local-relay] Tools: create_docx, create_pdf, create_xlsx, create_pptx
[MCP] Initialized with 1 configured server and 4 tools.
```

### 3.6 启动 mock model

```bash
cd /Volumes/Clips\ 2301-04/ochat-refresh
npm run dev:mock-model
# [mock-model] listening on http://127.0.0.1:5555/v1 (mock-model)
```

### 3.7 启动 relay

如果 relay 还没运行：

```bash
cd /Volumes/Clips\ 2301-04/ochat-refresh
TOKEN=$(jq -r .relayToken "$HOME/Library/Application Support/Oproxy Chat/mcp-config.json")
RELAY_TOKEN="$TOKEN" RELAY_PORT=4444 RELAY_HOST=127.0.0.1 node relay/server.js
```

检查：

```bash
curl -s http://127.0.0.1:4444/health | jq
# appConnected: true 表示 App 已连上
```

### 3.8 用开发模式启动 App，加载本地 LibreChat

先退出已安装的 App，避免单实例锁：

```bash
osascript -e 'tell application "Oproxy Chat" to quit'
```

然后：

```bash
cd /Volumes/Clips\ 2301-04/ochat-refresh
OPROXY_CHAT_URL=http://127.0.0.1:3080 npm start
```

需要 CDP 调试时：

```bash
OPROXY_CHAT_URL=http://127.0.0.1:3080 \
  ./node_modules/.bin/electron . \
  --remote-debugging-port=9223
```

App 启动后会：

1. 加载 `http://127.0.0.1:3080`
2. 启动本地 MCP（`127.0.0.1:3333`）
3. 连接 relay（`ws://127.0.0.1:4444/app`）

### 3.9 注册 LibreChat 账号

浏览器打开 `http://127.0.0.1:3080`，注册第一个账号（第一个账号是 admin）。App 里用同一个账号登录。

## 4. 在 UI 里跑通一次

1. 模型选择器选择 **Local Mock → mock-model**。
2. 点击输入框左侧的 **+**，在 **MCP SERVERS** 里点击 **Oproxy Local Relay**。
3. 输入：

   ```text
   帮我生成一份 Word 测试文档
   ```

4. 预期结果：
   - 聊天里出现 `运行 create_docx` 的 tool call 卡片
   - 显示“本地联调完成。已生成 Word 文档：...”
   - 文件保存到 `~/Downloads/本地联调测试.docx`
   - App 里出现“已通过本地 MCP 处理，请查看下载文件夹。”提示

也可以试：

- `生成一份 PDF`
- `生成一个 Excel 表格`
- `生成一份 PPT`

mock model 会根据可见提示词选择 `create_pdf` / `create_xlsx` / `create_pptx`。

### 4.1 零配置文档路径（不启用 MCP）

这条路径模拟最终用户：不用 MCP、不用 relay、不用 Python。

1. 新建一个对话。
2. **不要**在 `+ → MCP SERVERS` 里选择 `Oproxy Local Relay`。
3. 模型仍然选择 `Local Mock → mock-model`。
4. 输入“帮我生成一份 Word 测试文档”。

mock model 会输出一个 `oproxy-document` JSON 代码块，App 用内置 JS 生成器直接创建文件。预期：

- 代码块被隐藏
- 显示“文档已生成：xxx.docx”
- 文件出现在 `~/Downloads`

这条路径就是“用户打开 App、登录 Oproxy、直接要文档”的零配置体验；MCP 只是更标准的可选增强。

## 5. 验证命令

```bash
# relay 健康检查
curl -s http://127.0.0.1:4444/health | jq

# 通过 relay 调本地 MCP
TOKEN=$(jq -r .relayToken "$HOME/Library/Application Support/Oproxy Chat/mcp-config.json")
curl -s -X POST http://127.0.0.1:4444/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq

# mock model 健康检查
curl -s http://127.0.0.1:5555/health | jq
```

## 6. 真实模型验收

真实模型测试统一使用 Oproxy 的 `gpt-6.1-sol`。打开默认 `https://chat.oproxy.world`，使用 Oproxy 账号登录，选择 **Oproxy OpenAI → gpt-6.1-sol**。

不要使用本地 mock、Ollama 或其他模型作为产品验收结果。上文 mock 仅为历史协议调试环境；当前文档主流程无需启动此栈。文件与界面自动化测试不调用模型。

## 7. 停止与恢复

```bash
# 停止本地 LibreChat
cd /Volumes/Clips\ 2301-04/librechat-local
docker compose -f docker-compose.local.yml down

# 停止 mock model（如果在后台运行）
pkill -f 'scripts/local-mock-model.mjs'

# 退出开发模式 App 后，恢复已安装版本
open -a "Oproxy Chat"
```

已安装版本默认加载 `https://chat.oproxy.world`，不会自动使用本地 LibreChat；要恢复远程模式，直接重新打开已安装 App 即可。

## 8. 常见问题

### App 显示“无法连接到 Oproxy Chat”

先确认 LibreChat 在跑：

```bash
curl -I http://127.0.0.1:3080
```

如果 Docker/OrbStack 停止了：

```bash
orb start
cd /Volumes/Clips\ 2301-04/librechat-local
docker compose -f docker-compose.local.yml up -d
```

然后在 App 里点“重新加载”，或执行 `location.reload()`。

### LibreChat 日志里 MCP 没有连上

检查：

```bash
curl -s http://127.0.0.1:4444/health | jq
```

- `appConnected` 必须是 `true`。
- `librechat.yaml` 里的 `url` 必须是 `http://host.docker.internal:4444/mcp`。
- `mcpSettings.allowedAddresses` 必须包含 `host.docker.internal:4444`。
- `OPROXY_MCP_TOKEN` 必须和 App 的 `relayToken` 一致。

改完 `librechat.yaml` 后重启 api：

```bash
docker compose -f docker-compose.local.yml restart api
```

### mock model 连不上

在容器里测试：

```bash
docker compose -f docker-compose.local.yml exec api \
  node -e "fetch('http://host.docker.internal:5555/health').then(r=>r.text()).then(console.log)"
```

如果失败，确认 `npm run dev:mock-model` 正在运行，并且监听 `127.0.0.1:5555`。

### Docker/OrbStack 自动停止或磁盘不足

LibreChat 镜像约 4.2 GB，Mongo 约 1.25 GB。检查：

```bash
docker run --rm alpine:3.21 df -h /
df -h /System/Volumes/Data
docker system df
```

如果 Docker VM 磁盘接近满，清理不用的容器/镜像/构建缓存，或把 OrbStack 数据目录迁移到空间更大的磁盘。**不要直接删除正在使用的 `t860-*` 等容器。**

### 重置本地 LibreChat

如果需要清空本地账号和 MCP 配置：

```bash
cd /Volumes/Clips\ 2301-04/librechat-local
docker compose -f docker-compose.local.yml down -v
rm -rf data-node uploads logs
docker compose -f docker-compose.local.yml up -d
```

## 9. 安全说明

- LibreChat 的 `3080` 只绑定 `127.0.0.1`，不会暴露到局域网。
- relay、mock model、本地 MCP 都只监听 loopback。
- 没有 Cloudflare Tunnel、ngrok、frp 或任何公网入口。
- `host.docker.internal` 只允许 LibreChat 容器访问宿主机上的指定端口。
- `librechat.yaml` 的 `OPROXY_MCP_TOKEN` 和 LibreChat 的 `.env` 含本地 relay token，不要提交到 Git 或分享。
- mock model 只用于本地链路验证，不要把它当成真实模型服务。
- 这套配置只适合本地开发；生产仍然使用 Oproxy 的 `mcp.oproxy.world` + OIDC 短期 token 方案。
