# 最终安装版真实验收

验收目标：使用最终安装包、全新用户目录、实际Oproxy账号登录，所有模型调用限定 `gpt-6.1-sol`，完成普通聊天和四格式文档，并在App内查看。不能以协议夹具替代。

当前运行（2026-11-10）：

- 安装包：0.6.0，`/Applications/Oproxy Chat.app`，源码及依赖校验通过。
- 环境：macOS 27.2 (26B123)，arm64，`PATH=/usr/bin:/bin`。
- 全新用户目录与输出目录位于 `dist/live-acceptance-060/`，没有复制已有Cookie或凭据。
- 本地MCP端口3333被现有App占用，独立验收窗口仍正常启动；使用默认远端站点。
- 已观察到全新登录页，等待用户在该窗口完成Oproxy登录。
- 当前Gatekeeper实际评估拒绝（exit 3），因此本机启动与内容测试通过也不能宣称正式分发完成。

测试请求和内容要求在 `scripts/acceptance-cases.mjs`。每次发送前检查实际模型，不允许默认模型变化后继续发送。服务错误记录为失败/待重试，不切换其他模型。

证据要求：记录实际对话地址、模型、文件名/摘要、内容与结构检查、预览窗口检查、重启恢复结果。此文件只记录验收状态，不能单独证明完成。

新增可复现工具：

```bash
CDP_PORT=9224 node scripts/live-acceptance.mjs status
CDP_PORT=9224 node scripts/live-acceptance.mjs all
node scripts/verify-distribution.mjs '/Applications/Oproxy Chat.app'
```

`live-acceptance` 仅在用户完成全新登录后可发模型请求；每次发送前检查页面为实际Oproxy聊天、模型为gpt-6.1-sol、无未发送草稿/既有生成。记录文件/摘要/对话/预览结果。已经完成的case拒绝重复执行，观察超时记录为未完成并要求检查原对话，不盲目重发。状态文件不替代运行句柄：必须检查活跃App进程及页面。

2026-11-10 14:28（北京时间）分发只读验证：bundle-integrity通过；Developer ID/hardened runtime未通过（Signature=adhoc, TeamIdentifier=not set）；stapler exit65，无公证票据；spctl exit3 rejected。报告在 `docs/validation/final-060/distribution-verification.json`。

全新登录窗口位于oproxy.world/login，读取技能及文档结果IPC均被主进程拒绝，确认登录站点无法调用聊天文档特权。尚未取得新登录成功或新四格式模型结果。

驱动登录门槛已实际验证：在oproxy.world/login执行chat用例会在任何模型提交和case创建前失败，下载目录无输出。当前独立App进程仍存活、同一调试端口9224，后续必须继续检查该窗口的登录状态，不能因为等待时间长就复制凭据或重新启动。

## 验收质量门槛补强（2026-11-10）

上轮驱动的“生成成功并打开预览”仅证明运行链路，不能证明文档满足测试请求。本轮补入 `scripts/acceptance-validation.mjs`：

- 对实际DOCX逐块核对源内容、表格、引用段落、任务状态和正文长度。
- PDF必须有实际PDFKit全部页面文本检查，不能只看PDF文件头。
- XLSX逐单元格核对输入值/类型、公式、缓存、工作表及数字格式；业务合计仍要独立人工核验。
- PPT按实际续页计划核对全部可见字段、原生图表/嵌入工作簿、讲稿、要求的多版式和补充说明。
- 用例文件名和格式必须吻合。结构检查通过仍标记manualReviewRequired，不能自动把全页视觉/事实核验标作完成。

驱动现观察实际聊天提交的网络请求，只保存endpoint/model标识，不保存请求正文、凭据或Cookie。必须同时证明Oproxy OpenAI与gpt-6.1-sol；界面标签本身不足以通过最终模型门槛。预览会检查实际窗口的内容长度、CSP及无特权桥接，并保存截图。

可复验而不再次调用模型：

```bash
node scripts/recheck-acceptance.mjs docx dist/live-acceptance-060
node scripts/verify-live-acceptance.mjs dist/live-acceptance-060
```

最终证据审查要求源包一致、真实用例、请求模型证据、当前文件哈希、预览、每份文档全页人工复核（同一文件摘要）、全新登录、重启恢复及独立机器/Gatekeeper结果。没有记录时明确失败。当前仍未登录，没有将这些新检查当作已有真实验收结果。

反例测试已实际验证：仅能打开但内容不足的Word失败；生成后删除引用第二段失败；只有PDF头而无页面检查失败；修改xlsx输入单元格失败。共40项自动测试通过，包含6项验收工具反例/模型证据测试。

对历史6.1Sol产物复验时，改名重渲染的Word因文件名不匹配被拒绝；历史密集PPT不含本轮用例要求的指标版式，因此不冒充本轮最终PPT验收。报告 `docs/validation/final-060/prior-artifact-recheck.json` 保留这些差异。

## 受阻审计（2026-11-10 14:54 北京时间）

同一外部条件已连续三轮未变化。本轮再次直接确认进程15397仍存活、端口9224可读、页面为oproxy.world/login、chatReady=false、下载目录为空。安装版源码与工作区一致；重新执行实际分发检查，包完整性通过，Developer ID/hardened runtime、公证票据及Gatekeeper仍失败。界面工具再次返回原生应用客户端/服务端版本不匹配。

当前没有可替代这些证据的安全自主动作：不复制已有账号凭据绕过新登录，不把Apple Development冒充Developer ID，不将固定协议测试冒充真实6.1Sol验收，也不继续新增功能或测试来掩盖外部分发/新用户验收缺口。因此将目标标记受阻，非完成、非用户暂停。

恢复条件：用户在现有独立验收窗口完成Oproxy登录；重启Codex桌面客户端以恢复Xcode界面协助，再回到本聊天要求继续。之后先复核同一窗口/运行句柄，再执行真实验收；签名仍需确认账号资格、申请Developer ID并完成公证，不保证重启客户端本身解决证书问题。现有安装包、源码和待登录窗口均保留。
