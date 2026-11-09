# Oproxy Chat Desktop

Oproxy Chat 的 macOS 桌面客户端，基于 Electron。它直接加载 `https://chat.oproxy.world`，因此网页端的功能和更新会自动同步，不需要在本地重新打包前端。

当前已构建并安装到 `/Applications/Oproxy Chat.app`。首次打开需要在应用内点击 `Continue with Oproxy`，同意条款并完成 Oproxy 登录。

## 技术方案

- Electron 45（最新稳定版）
- 远程加载 Oproxy Chat（LibreChat），不复制前端代码
- 独立的持久化会话，登录一次后保持登录
- OIDC 登录流程在应用内完成（`Continue with Oproxy`）
- 内置本地 Python 运行环境，AI 生成的文档代码在本地执行并保存到下载文件夹
- App 自带本地 MCP server，通过 relay + WebSocket 反向隧道暴露给聊天，无需公网端口
- 外部链接默认交给系统浏览器
- 安全配置：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`

## 环境要求

- macOS 13 或更高版本
- Node.js 20 或更高版本
- Xcode Command Line Tools（构建图标和 DMG 需要）

## 开发运行

```bash
npm install
npm start
```

带远程调试端口启动（用于排查页面问题）：

```bash
npm run start:debug
# http://127.0.0.1:9222
```

也可以直接对运行中的页面执行脚本或截图：

```bash
node scripts/cdp.mjs "JSON.stringify({ url: location.href, title: document.title })"
node scripts/cdp.mjs --screenshot /tmp/oproxy.png
```

## 构建 macOS 安装包

只构建当前 Apple Silicon（arm64）：

```bash
npm run dist
```

构建 Intel + Apple Silicon 通用包：

```bash
npm run dist:universal
```

> 通用包需要额外下载 x64 版 Electron。如果网络不稳定（例如下载超时），先使用 arm64 包即可。

构建产物在 `dist/`：

- `Oproxy Chat-0.1.0-arm64.dmg`
- `Oproxy Chat-0.1.0-arm64-mac.zip`

构建时会自动对 App 做 ad-hoc 签名（`scripts/after-pack.cjs`），保证 bundle 的 Info.plist 和资源签名一致。这不会让 App 通过其他机器的 Gatekeeper；对外分发仍需要 Developer ID 和 notarization。

## 登录与会话

首次打开会进入 Oproxy 的 OIDC 登录页。完成登录后，Cookie 会保存在应用自己的会话中，下次打开无需重新登录。

如需切换账号，使用菜单 **文件 → 退出登录…**，会清除本机 Cookie 和本地存储，然后重新加载登录页。

## 导出文档

在对话页面，使用菜单 **文件 → 导出**：

- **当前对话为 Word (.docx)…**（`⌘⇧E`）
- **当前对话为 PDF…**
- **当前对话为 Markdown…**
- **最后一条回答为 Word (.docx)…**
- **最后一条回答为 PDF…**

导出文件默认保存到「文稿」文件夹，保存后会直接在 Finder 中定位。网页里触发的普通下载会自动保存到「下载」文件夹，同样会在 Finder 中显示；菜单 **文件 → 打开下载文件夹** 可以直接打开该目录。

当前 oproxy 的模型不会直接返回 `.docx` 附件。可以让模型先把文档内容写出来，然后用 **最后一条回答为 Word (.docx)** 或 **最后一条回答为 PDF** 导出。

## 本地运行环境

应用内置了一个本地 Python 运行环境，让 AI 可以直接生成可下载文档，而不是让用户自己运行脚本。

工作方式：

1. 应用会自动在每条消息里加入一段**隐藏的**本地运行指令，不会显示在聊天气泡里。
2. 当你在对话里请求生成文档（Word、PDF、Excel、PPT、报告等），AI 会输出 Python 代码，应用在临时目录中执行代码。已连接本地 MCP 时，AI 会优先调用 MCP 工具，不输出 Python 代码。
3. 文档生成期间，Python 代码块会被隐藏，消息里显示滚动的「正在生成......」高光动画；右下角显示「正在生成文档，请耐心等待…」。
4. 生成完成后，文件自动保存到「下载」文件夹，并在消息里显示「文档已生成：xxx」卡片，可直接打开下载文件夹。
5. 普通代码回答里的 **运行代码** 按钮也会在本地执行；文档生成消息会自动运行，不需要手动点。
6. 已有的文档生成回答也会隐藏 Python 代码，并显示「重新生成文档 / 打开下载文件夹」卡片。

支持：

- Word `.docx`：`python-docx`
- PDF：AI 输出自包含 HTML，应用用 Chromium 转成 PDF，中文字体正常
- Excel `.xlsx`：`openpyxl`
- PowerPoint `.pptx`：`python-pptx`
- 图片、CSV、Markdown 等：Pillow / 标准库

本地运行指令默认注入，不需要开关；文档类关键词会自动触发自动运行。生成期间不会显示字符数，只显示「请耐心等待…」。

首次使用如果系统 Python 缺少文档库，应用会提示安装 `python-docx`、`reportlab`、`openpyxl`、`python-pptx` 和 `pillow`。

安全说明：本地运行环境会执行 AI 生成的 Python 代码。代码在临时目录中执行，生成的文件复制到下载文件夹；包含系统/网络操作的代码会先弹窗确认。请只运行你信任的对话内容。

## 本地 MCP（App 托管 + Relay）

App 自带本地 MCP server（`src/mcp-server.js`），随 App 启动/退出。它只监听 `127.0.0.1:3333`，通过 **relay 反向隧道** 暴露给 Oproxy Chat：

```
Oproxy Chat（chat.oproxy.world）
   │  Streamable HTTP MCP
   ▼
Relay（relay/server.js，公网地址）
   │  WebSocket（由 App 主动连接）
   ▼
Oproxy Chat.app
   └─ 本地 MCP server（create_docx / create_pdf / create_xlsx / create_pptx）
```

App 不需要开放公网端口；relay 是唯一公网入口。App 启动时自动连接 relay，断线后按指数退避重连（1s → 2s → … → 30s），并用 WebSocket ping/pong 检测死连接。

MCP 工具：

- `create_docx`：Word `.docx`
- `create_pdf`：PDF（Chromium 渲染，中文字体正常）
- `create_xlsx`：Excel `.xlsx`（Markdown 表格按标题分 sheet，也可传结构化 `sheets`）
- `create_pptx`：PowerPoint `.pptx`（Markdown 标题分页，也可传结构化 `slides`）

### 启动 relay

```bash
RELAY_TOKEN="<与 App 相同的 token>" RELAY_PORT=4444 node relay/server.js
```

PoC 阶段用 cloudflared quick tunnel 暴露：

```bash
cloudflared tunnel --url http://127.0.0.1:4444 --no-autoupdate --protocol http2
```

把得到的 `https://xxxx.trycloudflare.com` 填入 App 状态窗口的 **Relay 公网地址**。

### 状态窗口

- 菜单 **文件 → 本地 MCP 状态…**（`⌘⇧M`），或打开 `oproxy://mcp`。
- 查看运行状态、**Relay 连接**、本地地址、**Relay 公网地址**、MCP URL、Token。
- 启动/停止本地服务、复制 MCP 配置、打开聊天 MCP 设置、切换开机自启。
- Relay 公网地址可以在状态窗口里修改；改完后需要在聊天 MCP 设置里同步更新 URL。

### 聊天端 MCP 配置

在 Oproxy Chat 的 **MCP 设置 → 添加 MCP**：

- URL：`https://xxxx.trycloudflare.com/mcp`
- Transport：`Streamable HTTPS`
- 认证：`API 密钥` / `Bearer`
- API key：与 App 的 token 相同

App 重启或重新连接不会改变聊天端 URL，下一次工具调用会自动走新连接。

### 离线行为

Relay 检测到 App 未连接时，工具调用会返回：

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

打开 App 后 relay 自动重连，无需修改聊天配置。

### URL scheme

- `oproxy://open`：唤起并聚焦 App。
- `oproxy://mcp`：打开本地 MCP 状态窗口。

### 开机自启

- 状态窗口里的“开机自启”使用 macOS 登录项（`app.setLoginItemSettings`），当前测试环境已开启。
- App 关闭窗口后仍驻留 Dock；完全退出用 `⌘Q`。

### 配置

- `~/Library/Application Support/Oproxy Chat/mcp-config.json` 保存 token、端口、公网地址和 relay 配置：

  ```json
  {
    "port": 3333,
    "token": "<token>",
    "publicBaseUrl": "",
    "relayUrl": "ws://127.0.0.1:4444/app",
    "relayToken": "<token>",
    "relayPublicUrl": "https://xxxx.trycloudflare.com"
  }
  ```

- 聊天里的 MCP 服务器使用同一个 token；Relay 公网地址变化后需要同步。
- 连接成功后，隐藏的本地运行指令会优先让 AI 调用 `create_docx` / `create_pdf` / `create_xlsx` / `create_pptx` MCP 工具；MCP 未连接时回退到内置 Python 运行环境。
- `mcp-server/` 仍保留为独立参考/调试服务器；App 实际使用的是 `src/mcp-server.js`。
- `relay/` 是 PoC relay，协议和部署细节见 `relay/README.md`。

> Relay PoC 目前是单 App 连接 + 共享 token + quick tunnel。生产化需要稳定域名（如 `mcp.oproxy.world`）、WSS、OIDC 短期 token、多用户路由和限流。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `⌘N` | 新建对话 |
| `⌘⇧S` | 切换侧边栏 |
| `⌘⇧E` | 导出当前对话为 Word |
| `⌘⇧M` | 本地 MCP 状态窗口 |
| `⌘,` | 账户设置 |
| `⌘[` / `⌘]` | 后退 / 前进 |
| `⌘R` | 重新加载 |
| `⌘⇧R` | 强制重新加载 |
| `⌘⌥I` | 开发者工具 |
| `⌘0` / `⌘+` / `⌘-` | 缩放 |
| `⌃⌘F` | 切换全屏幕 |

## 自定义服务器地址

默认地址是 `https://chat.oproxy.world`。开发时可以通过环境变量覆盖：

```bash
OPROXY_CHAT_URL=https://chat.example.com npm start
```

应用会允许 `oproxy.world` 及其子域名在应用内打开，其余链接交给系统浏览器。

## 代码签名与分发

当前构建默认不签名（`mac.identity: null`），适合本机开发和内部测试。首次打开 DMG 时 macOS 可能提示“无法验证开发者”，可以：

1. 把 App 拖到 `/Applications`
2. 右键点击 App → **打开**
3. 或在终端执行：

```bash
xattr -d com.apple.quarantine "/Applications/Oproxy Chat.app"
```

如果要分发给外部用户，需要：

- Apple Developer Program 账号
- Developer ID Application 证书
- 使用 `electron-builder` 配置签名和 notarization

签名配置加好后，把 `mac.identity` 改成证书名称，并配置 `notarize` 即可。

## 已知限制

- 目前只有 macOS 构建；Windows/Linux 可以后续用同一套 Electron 代码扩展。
- 没有自动更新（auto-update），后续可以接入 `electron-updater`。
- 离线时显示内置错误页，不提供离线聊天。
- 网页端如果修改了 DOM 选择器，菜单里的“新建对话/侧边栏/账户设置”快捷键可能需要同步调整。
- 导出功能依赖 LibreChat 页面的 DOM 结构（`data-testid="messages-view"`、`.message-render`、`.markdown.prose.message-content`）。网页大改后如果导出为空，需要同步调整 `src/export.js` 里的提取脚本。
- 本地运行环境依赖系统 Python 3 和 `python-docx`、`openpyxl`、`python-pptx`、`pillow`。如果系统没有 Python，需要先安装 Python 3。
- AI 是否按“本地运行指令”输出代码取决于模型。如果模型没有输出 Python 代码，应用会提示“没有返回可运行的 Python 代码”，可以重试或换一个模型。
- Relay 目前是 PoC：只支持一个 App 连接、共享 bearer token、cloudflared quick tunnel；公网地址变化后需要同步聊天端 MCP 配置。

## 移动端路线

移动端不建议直接复用这个 Electron 工程。优先评估：

1. **Switchboard（Librechat-Mobile）**：Kotlin Multiplatform 原生客户端，支持 Android/iOS 和 LibreChat 的 OIDC/SSO，可直接连接 `https://chat.oproxy.world`。
2. 如果兼容性不满足，再做轻量 WebView 壳：iOS/iPadOS 用 SwiftUI + WKWebView，Android 用 Kotlin + WebView，复用同一套登录流程。

## 目录结构

```
.
├── build/              # 图标资源（icon.png / icon.icns）
├── relay/
│   ├── server.js       # MCP Streamable HTTP ↔ WebSocket relay
│   └── README.md       # relay 协议与部署说明
├── scripts/
│   └── make-icon.sh    # 从 512px 图标生成 icns
├── src/
│   ├── main.js         # Electron 主进程、窗口、菜单、会话
│   ├── mcp-server.js   # App 托管的本地 MCP server
│   ├── relay-client.js # App 侧 WebSocket 反向隧道客户端
│   ├── mcp-config.js   # MCP / relay 配置读写
│   ├── mcp-status.html # 本地 MCP 状态窗口
│   └── error.html      # 网络失败时的内置错误页
├── package.json
└── README.md
```
