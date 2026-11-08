# Oproxy Chat Desktop

Oproxy Chat 的 macOS 桌面客户端，基于 Electron。它直接加载 `https://chat.oproxy.world`，因此网页端的功能和更新会自动同步，不需要在本地重新打包前端。

当前已构建并安装到 `/Applications/Oproxy Chat.app`。首次打开需要在应用内点击 `Continue with Oproxy`，同意条款并完成 Oproxy 登录。

## 技术方案

- Electron 45（最新稳定版）
- 远程加载 Oproxy Chat（LibreChat），不复制前端代码
- 独立的持久化会话，登录一次后保持登录
- OIDC 登录流程在应用内完成（`Continue with Oproxy`）
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

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `⌘N` | 新建对话 |
| `⌘⇧S` | 切换侧边栏 |
| `⌘⇧E` | 导出当前对话为 Word |
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

## 移动端路线

移动端不建议直接复用这个 Electron 工程。优先评估：

1. **Switchboard（Librechat-Mobile）**：Kotlin Multiplatform 原生客户端，支持 Android/iOS 和 LibreChat 的 OIDC/SSO，可直接连接 `https://chat.oproxy.world`。
2. 如果兼容性不满足，再做轻量 WebView 壳：iOS/iPadOS 用 SwiftUI + WKWebView，Android 用 Kotlin + WebView，复用同一套登录流程。

## 目录结构

```
.
├── build/              # 图标资源（icon.png / icon.icns）
├── scripts/
│   └── make-icon.sh    # 从 512px 图标生成 icns
├── src/
│   ├── main.js         # Electron 主进程、窗口、菜单、会话
│   └── error.html      # 网络失败时的内置错误页
├── package.json
└── README.md
```
