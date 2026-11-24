# 重构前的项目现状（历史记录）

> 下文为重构前的事实快照。2026-11-10 起系统 Python 路径已移除，文档引擎与技能已拆分。当前行为与验收进度以 [README](../README.md) 和 [重构验收记录](refactor-validation.md) 为准。

梳理日期：2026-11-10。依据当前工作区、Git 差异、代码及本机安装包；不代表公网服务或完整用户流程已验收。

## 1. 项目到底是什么

当前主产品是 **macOS Electron 客户端**，默认加载 `https://chat.oproxy.world`。聊天 UI、模型调用、账号和对话存储由远端 LibreChat/Oproxy 提供，本仓库没有这些服务的完整实现。

本仓库在网页外增加窗口、登录会话、下载、导出，以及在用户电脑上生成文档的能力。建议以“安装 App → 登录 → 聊天 → 文档落到下载目录”为当前产品验收主线。

## 2. 几条工作线及其边界

| 工作线 | 入口 | 当前定位与状态 |
| --- | --- | --- |
| 桌面客户端 | `src/main.js`、`src/preload.cjs` | 主产品；管理窗口、导航、菜单、IPC、服务生命周期 |
| 网页增强 | `src/inject.js` | 注入提示词、识别模型输出、隐藏代码、自动生成和结果卡片；依赖网页 DOM |
| 直接生成文档 | `src/mcp-server.js` 的 `generateDocument` | 最新未提交功能；JSON → IPC → JS 生成器，无需 Relay/Python |
| MCP 文档工具 | `src/mcp-server.js` | App 托管；Word/PDF/Excel/PPT 四个工具，默认本地端口 3333 |
| Relay | `relay/server.js`、`src/relay-client.js` | 单连接、共享 token 的 PoC；不具备完整多用户生产能力 |
| Python 执行 | `src/runtime.js` | 查找系统 Python，必要时提示安装依赖，再运行模型代码；不是内置解释器或安全沙箱 |
| 对话导出 | `src/export.js`、`src/main.js` | 已有回答/对话转 Word、PDF、Markdown，与让模型新生成文档是两种功能 |
| 全本地联调 | `docs/local-integration.md`、`scripts/local-mock-model.mjs` | 开发验证环境；依赖相邻的 `librechat-local` 仓库，不属于用户安装流程 |
| 独立 MCP | `mcp-server/` | 旧参考/调试实现，只做 Word；不是 App 实际使用的服务 |
| 购买页 | `purchase-page/` | HTML 与预览图；未被当前 App 打包文件列表纳入，作为独立素材维护 |

文档生成当前存在三条通道：

```text
MCP：聊天后端 → Relay → App 本地 MCP → 文档生成器 → Downloads
JSON：模型回答 → inject.js → preload IPC → generateDocument → 同一生成器 → Downloads
Python：模型代码 → inject.js → runtime.js → 系统 Python → Downloads
```

另外还有“已有聊天内容 → 菜单导出”，不要与以上三条生成通道混为一谈。

## 3. 混乱的具体来源

### 源码、提交、安装包是三个不同状态

- 当前 HEAD：`8045fa7`（移除 Cloudflare 隧道，要求 Oproxy 自有入口）。
- 梳理前已有 7 个受跟踪文件修改、2 个未跟踪文件，尚未形成提交。
- 修改主要包括：新增 JSON 文档协议和自动生成、IPC 桥接、生成器入口、mock model、本地联调说明。
- `/Applications/Oproxy Chat.app` 的 `app.asar` 时间为北京时间 **2026-11-09 14:15**；与当前 `inject.js`、`main.js`、`mcp-server.js`、`preload.cjs` 均不一致（逐文件比较已确认）。
- `dist/mac-arm64` 的归档存在且时间相同，但本轮未逐文件比较其内容。

因此，“改了源码”和“已安装 App 能使用新功能”不能互相证明。版本号仍为 `0.1.0`，也无法区分这些状态。

### 产品路径与开发环境混在说明里

默认产品是远程网页；本地 LibreChat + Docker + Relay + mock 是验证工具。mock 能证明协议链路，不能证明真实模型会稳定输出 JSON 或正确调用工具。

### 文档里包含超出实现的表述

| 位置/表述 | 实现事实 | 后续处理 |
| --- | --- | --- |
| README“内置本地 Python” | `runtime.js` 查找系统 Python，并可能运行 pip 安装 | 改为系统 Python 兜底；若要自带解释器，需另做打包 |
| README“本地联调时 App 直接连接本机 relay” | `mcp-config.js` 新配置默认 `relayUrl` 为空；启动代码仅在非空时连接 | 联调步骤补齐配置前提，区分已有机器状态与全新安装 |
| Phase 3 建议接口返回 `tunnelToken` | `fetchRelayToken` 只接受 `data.token`，只返回 token/expiresAt | 联调前统一字段；草案中的 relayUrl/mcpUrl/mcpToken 尚未在此处接入 |
| 部分 README 描述 MCP 断开后直接回退 Python | 最新代码加入 JSON 生成路径 | 统一描述为 MCP 优先、JSON 生成、Python 兼容兜底 |
| Phase 3 自动配置、OIDC、多用户目标 | 当前 Relay 仍是单 `appSocket` + 静态共享 token | 标为待实施/待协作，不能当作已上线能力 |

### 模块职责过于集中

`main.js` 约 1272 行、`mcp-server.js` 约 966 行、`inject.js` 约 893 行。生成器与 MCP 协议绑定在同一个模块；网页识别、输出解析、自动执行、提示 UI 集中在注入脚本。多个模块重复处理下载文件命名，修改容易出现行为偏差。

## 4. 当前确定性与验证缺口

本轮已完成：

- 阅读结构、配置、主要代码与未提交差异。
- 17 个 JS/MJS/CJS 文件通过 `node --check`。
- 梳理前的工作区通过 `git diff --check`。
- 比较已安装包中的四个关键源码文件，确认与工作区不一致。

本轮未进行：启动/退出 App、真实登录、重新打包、真实模型对话、四种格式实际生成、断线与 token 刷新、多用户验证。项目根目录没有 `test` / `lint` 脚本；`mcp-server/test-*.js` 是独立参考服务器的客户端脚本，不是完整回归套件。

需要优先覆盖的行为：流式响应结束后再生成、刷新/切换对话不重复生成、失败后能重试、模型返回普通 JSON 示例不误触发。当前 JSON 识别还会匹配带文档 type 字段的代码块和正文，需要专门验收边界。

Python 路径用主机进程权限执行代码，正则检查不能提供沙箱隔离；是否保留自动执行应作为明确产品决策，不能由 Electron 渲染层的 sandbox 配置推断其安全性。

## 5. 建议按这个顺序收敛

1. **固定当前基线。** 先验收未提交的 JSON 文档链路，再把代码与 mock/联调资料拆成可辨识提交；记录源码提交与安装包的对应关系。
2. **先交付不依赖生产 Relay 的用户主线。** 在默认远程站点、真实模型上验证 Word/PDF/Excel/PPT、失败提示、重试及重复生成控制。通过后重新打包并验证安装版。
3. **统一文档。** README 保留用户/开发入口；本文件记录事实；本地联调文档只写开发环境；Phase 3 只写双方接口和待交付项。消除 Python、默认配置、token 字段等偏差。
4. **再做 Relay 生产化。** 先与 Oproxy 确认域名/WSS、token 契约、聊天端 MCP 自动配置/OBO 权限；随后实现验签、多用户隔离、限流和监控。服务器工作不是仅配置一个公网 URL。
5. **最后拆职责。** 抽出共享文档生成器供 IPC/MCP 调用，拆分网页解析与执行状态管理；标注独立 MCP 的参考身份，购买页单独维护。避免在验收主线未固定前大规模搬目录。

建议下一项具体任务：**验证并收口现有 JSON 文档生成改动，生成一个可追溯的安装包。** 暂不同时推进移动端、购买页和多用户 Relay。

## 6. 阅读入口

- 用户使用、开发与打包：[`../README.md`](../README.md)
- 本地联调：[`local-integration.md`](local-integration.md)
- 生产协作与接口建议：[`oproxy-phase3-cooperation.md`](oproxy-phase3-cooperation.md)
- Relay 协议与部署：[`../relay/README.md`](../relay/README.md)
- 旧独立 MCP：[`../mcp-server/README.md`](../mcp-server/README.md)

本次只增加现状文档及 README 导航，没有改动业务代码或处理原有未提交修改。
