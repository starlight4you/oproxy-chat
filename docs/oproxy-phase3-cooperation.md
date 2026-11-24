# Oproxy Chat 桌面端本地 MCP / Relay 生产化配合说明

> 文档版本：v1.0（2026-11-09）  
> 面向：Oproxy 后端 / 基础设施 / 安全团队  
> 目的：把当前已验证的桌面端本地 MCP PoC，推进到可对真实用户开放的生产架构。

---

## 1. 一句话总结

桌面端 App 已经可以在本地生成 Word / PDF / Excel / PPT，并通过 **relay + WebSocket 反向隧道** 让 `chat.oproxy.world` 调用本机 MCP 工具。

现在需要 Oproxy 侧配合完成 5 件事：

1. 提供稳定域名 `mcp.oproxy.world` 和 TLS / WSS。
2. 部署 relay 服务（我们已提供 Docker 镜像构建文件）。
3. 提供 OIDC 会话换取短期 tunnel token 的接口，以及 token 验签方式。
4. 解决聊天端 MCP 服务器自动创建 / OBO 权限问题。
5. 确认多用户路由方案，并提供 staging 环境联调。

---

## 2. 背景与目标

### 2.1 用户价值

用户在 Oproxy Chat 里说“帮我生成一份 Word / PDF / Excel / PPT”，AI 直接调用桌面 App 的本地 MCP 工具，文件保存到本机 `~/Downloads`，不需要用户复制代码、运行脚本或手动下载附件。

### 2.2 为什么需要 relay

桌面 App 在用户内网 / 家庭网络里，没有公网 IP，也不应该开放入站端口。因此采用：

- App 主动向公网 relay 建立 WebSocket 长连接。
- 聊天后端只访问 relay 的标准 MCP Streamable HTTP 地址。
- relay 把 JSON-RPC 请求通过 WebSocket 转发给对应 App，再把结果返回给聊天后端。

这样 App 不需要端口映射，relay 是唯一公网入口。

### 2.3 当前状态

已完成并在本机端到端验证：

- macOS App（Electron 45），加载 `https://chat.oproxy.world`。
- 本地 MCP server 随 App 启动，监听 `127.0.0.1:3333`。
- MCP 工具：`create_docx`、`create_pdf`、`create_xlsx`、`create_pptx`。
- relay PoC：标准 `/mcp` HTTP 端点 + `/app` WebSocket + `/health`。
- 聊天端 MCP 服务器通过 relay 连接成功，四个工具均可调用。
- App 退出后 relay 返回友好离线错误；App 重启后自动重连，聊天端配置无需修改。
- 本地端到端验证已完成；公网联调需要 Oproxy 提供自有域名和反向代理。
- 全本地联调（LibreChat 跑在本机、mock model、relay、App）已验证，不使用任何公网隧道；步骤见 [`local-integration.md`](local-integration.md)。

当前 PoC 的限制：

- 单 App 连接、共享 bearer token。
- 公网入口尚未配置，目前只在本地 `127.0.0.1:4444` 运行。
- 没有 OIDC token 交换、没有多用户路由、没有生产级限流和审计。

---

## 3. 目标架构

```
┌──────────────────────────────┐
│ Oproxy Chat（LibreChat）      │
│ chat.oproxy.world            │
└──────────────┬───────────────┘
               │ Streamable HTTP MCP
               │ Authorization: Bearer <mcp token>
               ▼
┌──────────────────────────────┐
│ Relay                        │
│ mcp.oproxy.world             │
│  - POST /mcp                 │
│  - GET  /health              │
│  - WS   /app                 │
└──────────────┬───────────────┘
               │ WebSocket（App 主动连接）
               │ Authorization: Bearer <tunnel token>
               ▼
┌──────────────────────────────┐
│ Oproxy Chat.app              │
│ 127.0.0.1:3333/mcp           │
│  create_docx / create_pdf    │
│  create_xlsx / create_pptx   │
└──────────────────────────────┘
```

关键原则：

- App 不开放公网端口。
- 聊天后端不直接访问用户内网。
- relay 不保存用户文档内容，只转发 JSON-RPC。
- 每个用户只能路由到自己的 App 连接。

---

## 4. 需要 Oproxy 配合的事项

### P0-1：稳定域名与 TLS / WSS

需要提供：

- `mcp.oproxy.world` 的 DNS 记录（A / AAAA 或 CNAME 到负载均衡）。
- 有效 TLS 证书。
- 支持 WebSocket Upgrade 的入口（443 端口，`wss://mcp.oproxy.world/app`）。
- **不使用 Cloudflare Tunnel / Cloudflare 代理**，由 Oproxy 自有网关、反向代理或负载均衡承载。

验收：

```bash
curl https://mcp.oproxy.world/health
# 返回 200，JSON 中包含 "ok": true
```

### P0-2：部署 relay 服务

我们已提供：

- `relay/server.js`
- `relay/Dockerfile`
- `relay/.env.example`
- `relay/README.md`

需要 Oproxy 侧确认：

- 由谁部署（Oproxy 基础设施 / 我们提供镜像 / 共同维护）。
- 部署在哪个环境（K8s / ECS / 单机 Docker）。
- 是否需要多副本；如果多副本，需要 sticky session 或 Redis pub/sub 做跨实例路由。

建议配置：

| 环境变量 | 示例 | 说明 |
| --- | --- | --- |
| `RELAY_TOKEN` | `<secret>` | PoC 共享 token；生产替换为 OIDC 验签 |
| `RELAY_PORT` | `4444` | 容器内监听端口 |
| `RELAY_HOST` | `0.0.0.0` | 容器内监听地址 |
| `RELAY_PUBLIC_URL` | `https://mcp.oproxy.world` | 公网地址，用于健康检查和日志 |
| `RELAY_REQUEST_TIMEOUT_MS` | `60000` | App 响应超时 |

反向代理要求：

- 开启 WebSocket Upgrade。
- `proxy_read_timeout` / `proxy_send_timeout` 建议 ≥ 3600s。
- 关闭响应缓冲（`proxy_buffering off`）。
- 健康检查路径 `/health`。
- WebSocket 空闲超时需大于 App 心跳间隔（App 每 20s ping 一次）。
- 不使用 Cloudflare Tunnel / Cloudflare 代理。

### P0-3：OIDC token 交换接口

需要新增一个供桌面 App 调用的接口，用当前登录会话换取短期 relay token。

建议接口：

```http
POST https://chat.oproxy.world/api/oproxy/relay-token
Cookie: <现有 OIDC 会话 Cookie>
Content-Type: application/json

{
  "relayUrl": "wss://mcp.oproxy.world/app"
}
```

成功响应：

```json
{
  "tunnelToken": "<短期 JWT>",
  "expiresAt": 1794187649,
  "relayUrl": "wss://mcp.oproxy.world/app",
  "mcpUrl": "https://mcp.oproxy.world/u/<user-id>/mcp",
  "mcpToken": "<该用户聊天端 MCP 访问 token>"
}
```

字段说明：

- `tunnelToken`：App 连接 relay WebSocket 使用，短期有效（建议 5–15 分钟）。
- `expiresAt`：Unix 秒或毫秒均可，建议秒。
- `mcpUrl`：该用户的聊天端 MCP URL。
- `mcpToken`：聊天后端访问 relay `/mcp` 使用，长期有效、可撤销；由 App 写入聊天端 MCP 服务器配置。

建议 JWT claims：

```json
{
  "iss": "https://chat.oproxy.world",
  "sub": "<稳定的用户 ID>",
  "aud": "oproxy-mcp-relay",
  "scope": "relay:tunnel",
  "iat": 1794187049,
  "exp": 1794187649,
  "jti": "<唯一 ID>"
}
```

需要 Oproxy 提供：

- 验签方式：JWKS URL（推荐）或共享密钥。
- `sub` 使用哪个字段（必须是稳定、不可变的用户 ID）。
- token 撤销策略：短 TTL + `jti` 黑名单，或提供撤销接口。
- staging 环境的 token 接口和测试账号。

### P1-1：聊天端 MCP 服务器自动创建 / OBO 权限

当前问题：

- 在聊天 UI 里手动创建 MCP 服务器时，前端被 OBO 校验拦住，提示：
  > OBO is configured for this server but your role no longer has permission to modify it. Contact an administrator to make changes.
- 直接调用 `POST /api/mcp/servers`（带用户 JWT）可以创建成功，说明后端接口本身可用，但 UI / 权限策略不允许普通用户创建或修改。

需要 Oproxy 选择一种方案：

**方案 A（推荐）：允许用户级 MCP 服务器**

- 允许 `source: user` 的 MCP 服务器，不强制 OBO scopes。
- 或对 `mcp.oproxy.world` 白名单，跳过 OBO 校验。
- App 登录后调用官方 API 自动创建 / 更新 “Oproxy Local Relay” 服务器。

**方案 B：Oproxy 预置服务器**

- 为每个用户预置一个 MCP 服务器配置，URL 为 `https://mcp.oproxy.world/u/<user-id>/mcp`。
- App 只负责连接 relay，不创建聊天端配置。

**方案 C：新增桌面端专用接口**

- 提供 `POST /api/oproxy/desktop/mcp-server`，由后端完成创建 / 更新，App 只传 `mcpUrl` 和 `mcpToken`。

无论哪种方案，都需要明确：

- 普通用户是否允许拥有多个 MCP 服务器。
- MCP 服务器配置的 URL / API key 是否允许 App 通过 API 更新。
- OBO 策略对 `source: user` 的服务器是否适用。

### P1-2：多用户路由

当前 relay 只维护一个 `appSocket`。生产需要：

- App WebSocket 连接时，从 `tunnelToken` 的 `sub` 获取用户 ID。
- relay 维护 `Map<userId, appSocket>`。
- `/mcp` 请求根据 `mcpUrl` 中的 user id（或 `mcpToken`）找到对应连接。
- 同一用户多设备：建议“最新连接覆盖旧连接”，旧连接收到 `1000` 关闭。
- pending 请求按 `userId + JSON-RPC id` 隔离，避免不同用户 id 冲突。
- 用户 App 离线时，只对该用户的请求返回离线错误。

如果 relay 多副本：

- 方案 A：负载均衡按 `userId` 做 sticky session。
- 方案 B：Redis pub/sub 把请求发布到持有该用户连接的实例。

### P1-3：安全、限流、可观测性

需要 Oproxy 安全团队确认：

- `mcpToken` 的存储方式（建议服务端哈希存储、可撤销）。
- 每个用户的请求限流（建议 60 次/分钟起步）。
- 请求体大小限制（当前 relay 20MB）。
- 审计日志：记录 user id、tool name、耗时、错误码；**不记录文档内容、不记录完整 token**。
- 监控指标：在线 App 数、请求量、错误率、P95 延迟、token 刷新失败数。
- 告警：relay 5xx、App 连接数异常、token 验签失败突增。

---

## 5. 接口契约（建议稿）

### 5.1 Relay HTTP 端点

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/mcp` | `Authorization: Bearer <mcpToken>` | MCP Streamable HTTP JSON-RPC |
| `GET` | `/health` | 无 | 健康检查 |
| `GET` | `/app`（Upgrade） | `Authorization: Bearer <tunnelToken>` | App WebSocket |

### 5.2 WebSocket 握手

```http
GET /app HTTP/1.1
Host: mcp.oproxy.world
Upgrade: websocket
Connection: Upgrade
Authorization: Bearer <tunnelToken>
```

兼容旧 PoC：也支持 `?token=<token>` 查询参数，但生产建议只用 Header，避免 token 出现在代理日志。

### 5.3 错误约定

| 场景 | HTTP / WS | 返回 |
| --- | --- | --- |
| 未带 token | HTTP 401 | `{"error":"Unauthorized"}` |
| token 无效 / 过期 | HTTP 401 / WS 1008 | `{"error":"Unauthorized"}` |
| App 离线 | HTTP 200 + JSON-RPC error | `code: -32000`，带 `oproxy://open` 提示 |
| App 响应超时 | HTTP 200 + JSON-RPC error | `code: -32000`，`本地 App 响应超时` |
| relay 重启 | WS 1001 | App 自动重连 |

### 5.4 健康检查响应

```json
{
  "ok": true,
  "version": "0.2.0",
  "publicUrl": "https://mcp.oproxy.world",
  "uptimeSeconds": 120,
  "appConnected": true,
  "appConnectedAt": "2026-11-09T01:31:49.917Z",
  "appUserId": "<user-id>",
  "pendingRequests": 0
}
```

生产多用户版本建议增加：

```json
{
  "connectedUsers": 12,
  "pendingRequests": 3
}
```

---

## 6. 客户端已实现的行为

以下行为已经在 macOS App 中实现，Oproxy 侧不需要重复开发：

- App 启动时自动启动本地 MCP server（`127.0.0.1:3333`）。
- MCP 未连接时，App 支持模型输出 `oproxy-document` JSON，由内置 JS 生成器直接生成 Word / PDF / Excel / PPT，不依赖 Python 或 MCP。这条路径保证用户“打开 App + 登录 Oproxy”即可使用文档功能。
- App 启动时自动连接 `relayUrl`，断线后指数退避重连（1s → 2s → … → 30s）。
- WebSocket ping/pong 心跳，60s 无 pong 自动重连。
- 支持 `relayTokenUrl`：用登录 Cookie 调用 token 交换接口，token 过期前 60s 自动刷新，收到 `1008` 后刷新并重连。
- relay 离线时聊天端收到友好 JSON-RPC 错误，不会暴露内部异常。
- 状态窗口显示 Relay 连接状态、公网地址、本地地址、Token。
- `oproxy://open` 唤起 App，`oproxy://mcp` 打开状态窗口。
- 支持开机自启（macOS 登录项）。

---

## 7. 验收标准

### 7.1 功能验收

1. 新用户安装 App、登录后，App 自动连接 `wss://mcp.oproxy.world/app`，状态窗口显示“已连接”。
2. 聊天端自动出现 / 连接 “Oproxy Local Relay” MCP 服务器，用户不需要手动填 URL 和 token。
3. 在聊天里请求 Word / PDF / Excel / PPT，文件保存到 `~/Downloads`，聊天显示工具调用卡片。
4. 退出 App 后发起文档请求，返回“本地 Oproxy Chat 未连接”的友好提示；重新打开 App 后自动恢复，聊天端配置不需要修改。
5. token 过期后 App 自动刷新并重连，用户无感。
6. relay 重启后 App 在 30s 内自动重连。

### 7.2 多用户验收

1. 两个账号同时在线，各自只能调用自己的 App。
2. 用户 A 的文档不会出现在用户 B 的电脑上。
3. 用户 A 离线时，用户 B 的调用不受影响。
4. 同一用户两台设备连接时，行为符合约定（建议最新连接生效）。

### 7.3 安全验收

1. 无 token / 错误 token 访问 `/mcp` 返回 401。
2. 无 token / 错误 token 建立 WebSocket 返回 1008。
3. 日志中不出现完整 token、文档内容。
4. 撤销 `mcpToken` 后，聊天端调用立即失败。
5. relay 重启或异常不会导致 token 泄漏。

### 7.4 联调测试命令

```bash
# 健康检查
curl https://mcp.oproxy.world/health

# MCP 工具列表（需要 mcpToken）
curl -X POST https://mcp.oproxy.world/mcp \
  -H "Authorization: Bearer <mcpToken>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## 8. 需要 Oproxy 确认的问题

1. `mcp.oproxy.world` 的 DNS 和证书由谁负责？能否提供 staging 域名？
2. relay 由谁部署？是否接受我们提供的 Dockerfile / 镜像？
3. OIDC 用户稳定 ID 使用哪个 claim？能否增加 `aud=oproxy-mcp-relay`、`scope=relay:tunnel`？
4. token 验签使用 JWKS 还是共享密钥？轮换策略是什么？
5. OBO 策略能否对用户级 MCP 服务器放行？如果不能，采用预置服务器还是新增桌面端专用接口？
6. 聊天端 MCP 配置的 API key 是否支持 App 通过 API 自动写入 / 更新？
7. 多用户路由采用 per-user path（`/u/<user-id>/mcp`）还是共享 `/mcp` + token 识别？是否有 URL 长度或字符限制？
8. 每用户限流、配额、审计日志保留周期如何设定？
9. 是否有 staging 环境、测试账号和联调时间窗口？
10. 生产发布节奏：先内测白名单，还是直接全量？

---

## 9. 代码与文档位置

| 内容 | 位置 |
| --- | --- |
| relay 服务 | `relay/server.js` |
| relay Dockerfile | `relay/Dockerfile` |
| relay 环境变量示例 | `relay/.env.example` |
| relay 部署说明 | `relay/README.md` |
| App WebSocket 客户端 | `src/relay-client.js` |
| App token 交换 | `src/main.js`（`fetchRelayToken`） |
| MCP 配置 | `src/mcp-config.js` |
| 本地 MCP 工具 | `src/mcp-server.js` |
| 根文档 | `README.md` |

---

## 10. 最小配合清单（可直接排期）

- [ ] `mcp.oproxy.world` DNS + TLS + WSS 入口
- [ ] relay 部署环境与部署负责人
- [ ] `POST /api/oproxy/relay-token` token 交换接口
- [ ] JWKS / 验签方式 + `sub` 字段确认
- [ ] MCP 服务器自动创建 / OBO 权限方案
- [ ] 多用户路由方案确认
- [ ] staging 域名、测试账号、联调窗口
- [ ] 限流、审计、监控指标确认

---

如有疑问，建议先围绕 **P0-1 / P0-2 / P0-3** 三项开一次 30 分钟对齐会；这三项确定后，多用户路由和聊天端自动配置可以并行推进。
