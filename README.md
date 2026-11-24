# Oproxy Chat

macOS 桌面应用。用户安装 App 后，打开并选择 **Continue with Oproxy**，使用 Oproxy 账号登录即可聊天和生成 Word、PDF、Excel、PowerPoint 文档。用户不需要安装 Node.js、Python、Office、Docker、LibreChat 或其他运行环境；聊天需要网络和可用的 Oproxy 账号。

## 使用

将 DMG 中的 Oproxy Chat 拖入「应用程序」后打开。登录会话保存在 App 自己的用户目录中。需要切换账号时使用 **文件 → 退出登录**。

直接在聊天中提出文档需求，例如：

- “生成一份详细的 Word 实施方案，含职责分工表、预算和验收指标。”
- “制作项目预算 Excel，输入与汇总分表，合计使用公式。”
- “制作 8 页项目汇报 PPT，含详细演讲备注。”
- “生成排版完整的中文 PDF 报告。”

App 提供随包携带的文档技能。模型先选择技能，App 按需读取并自动继续生成；模型完成内容后，内置引擎创建真实文件并保存到「下载」文件夹。成功会显示文件名、大小，可在 App 内预览、用外部应用打开或在 Finder 定位；格式或公式校验失败时，应用最多自动请求模型修正一次；仍失败可点击“让模型修正”。网络、磁盘等运行故障可点击“重试生成”。修正会继续使用当前对话模型，不覆盖用户未发送草稿。生成过程中可以继续查看回答。打开历史对话会查找已有生成记录并恢复文件卡片，不会重新生成文件；页面刷新或重复点击同一请求会复用已有文件。生成时刷新页面会恢复原对话的待处理任务，切换对话后暂停，返回后继续；不会将待处理任务应用到其他历史回答。

生成文档后，可以继续说“把第二部分再详细一些”或“再给一个 PDF 版本”；应用依据最近一条文档回答识别修订和格式转换。解释、咨询、拒绝生成文件的消息保持普通聊天；模型澄清问题也正常显示。服务暂时不可用时可用回答旁的“重新生成”重试，生成结束后仍自动创建文档。

文档请求先显示简短回应，随后展示真实搜索、编写和排版进展；编写中的章节提示来自实际收到的内容，工作总结在文件生成成功后显示。完成后显示带系统文件图标的独立卡片，主按钮“打开文档”调用默认办公应用，旁边可在 Finder 中定位；App 内预览保留在“更多”里。技能读取和自动继续的内部指令不占据聊天区域；正文、附件、错误与重试入口正常显示。

生成后的 **App 内预览** 不要求安装 Office：Word/PDF 可核对正文，Excel 从实际工作簿读取单元格、数字格式与公式结果，PPT 显示全部续页内容、图表和讲稿。预览为内容核对视图，不模拟 Office 的原生编辑和分页。原文件仍保存到下载目录，可按需用其他应用编辑。较旧的生成记录可能没有预览，重新生成后可使用。

本科毕业论文可使用 `documentStyle: "thesis"` 通用样式，包含独立封面、摘要、原生可更新目录、A4、宋体正文、黑体标题、首行缩进、章节分页和页码。具体院校模板仍应以用户提供的要求为准。模型将代码围栏与前文写在同一行时，应用从该回答原始文本恢复明确的文档协议，保留 Markdown 与链接，避免将整段 JSON 展示在聊天中。

输入框右下角提供模型与思考强度按钮。点击打开圆角滑杆面板，可在低、中、高、极高、最高五档间选择，默认极高（xhigh）；重置按钮恢复默认。设置通过 Oproxy 原生参数组件写入实际 `reasoning_effort`，不支持的模型明确显示不可用。

**文件 → 导出** 用于导出已有聊天内容，与让模型创作新文档分别使用。回答工具栏仅保留朗读、复制和重新生成。

左下角头像菜单显示 Oproxy 账户余额和生效订阅的剩余额度，打开菜单时读取，并在展开期间每 15 秒刷新，支持手动刷新。“充值 / 订阅”入口打开 Oproxy 官网窗口。账号状态使用 App 内官网登录会话；如官网会话失效或与聊天账号不一致，菜单提示登录相同账号。金额直接使用官网口径，不将聊天 token 积分作为余额；读取失败时显示错误状态。`npm run test:account` 验证账户菜单、额度计算与登录状态。

充值/订阅窗口隐藏官网左右导航，主区域铺满窗口，保留标题、余额、套餐切换和支付弹窗。登录页保持官网原有布局。`npm run test:purchase` 验证桌面及窄窗口布局。本地验收截图、生成文件等保存在 `docs/validation/`，不纳入 Git。

## 文档架构

```text
Oproxy 账号登录 → chat.oproxy.world → 用户选择的模型
                                    ↓ 文档技能 + 完整结构化内容
                         preload IPC → Document Service
                                    ↓ 校验 / 排队 / 去重
                              Document Engine
                                    ↓
                        Downloads：docx/pdf/xlsx/pptx
```

- `src/skills/`：四类文档技能，与应用一起打包。要求完整内容、合理结构、清晰假设和格式规则。
- `src/documents/schema.js`：统一格式、大小与内容校验。
- `src/documents/formulas.js`：本地重算公式并校验依赖，不信任模型缓存，计算失败时阻止发布文件，可修正的错误反馈给当前模型。
- `src/documents/engine.js`：独立 JS 引擎，Word 原生标题/编号与嵌套列表/多段引用/任务勾选/表格/样式；Chromium 中文 PDF；Excel 数字/公式/工作表和独立重算；PPT 讲稿、指标/对比/时间线/表格/图表多版式与按容量续页。密集对比、长表、时间线与补充说明保留全文，生成卡显示实际页数。
- `src/documents/service.js`：生成队列、并发请求合并和持久化回执。删除输出文件或引擎升级后可重新生成。文档先在临时文件中生成，成功后发布，失败不在下载目录留下损坏文档。
- `src/inject.js`：发送时提供技能目录；模型通过 `oproxy_skill` 选择技能后由 App 读取并自动继续，仅从明确的 `oproxy_document` 围栏生成文件，回答完成后才执行。普通聊天不会增加文档技能提示词，普通 JSON 或 Python 示例不执行。
- `src/main.js` / `src/preload.cjs`：窗口、登录、主进程 IPC。文件生成仅允许来自当前聊天主页面。

不会执行模型生成的 Python 或 shell，也不会提示安装依赖。文档内容来自模型，技能不能替代事实核验。Excel 会独立重算本地支持的确定性公式，纠正不一致缓存；不支持的函数、无效引用、循环依赖和外部工作簿会显示校验失败，避免交付错误缓存。此检查不证明输入数据、公式选取或分析结论符合业务事实。PPT 支持可编辑柱状图、折线图、饼图、环形图及多种信息版式；App 使用内置 Chromium 给图表生成兼容预览，导入器忽略原生图表时仍能显示。图片和任意自由布局尚未纳入协议。

## 开发与测试

以下要求仅适用于开发者，最终用户不需要：Node.js、npm；打包 macOS 版本需要对应的 macOS 构建工具。

```bash
npm ci
npm start
npm test
npm run test:desktop
npm run test:package
```

`test:package` 用临时全新用户目录、仅系统 PATH、被占用的 MCP 端口运行实际 App，并通过固定协议样例生成四种文件；这是独立运行测试，不替代真实模型和干净机器的 Gatekeeper 验收。

`npm test` 验证真实 Office 文件结构、中文、表格、公式、演讲备注及重复请求。`test:desktop` 在 Electron 中验证 Chromium PDF、流式完成、失败重试、重复扫描、按需技能读取、原生图表兼容预览、刷新恢复、对话隔离、草稿保护、错误自动修正及次数上限。

真实模型验收统一使用 Oproxy 的 **gpt-6.1-sol**，保留模型标识、对话地址、输出文件和质量检查结果。Mock 只可用作协议调试，不能代替模型验收。开发时可运行 `npm run start:debug`；调试工具为 `scripts/cdp.mjs`。调试端口只用于开发，不应在分发时开启。

```bash
npm run dist              # Apple Silicon DMG + zip
npm run dist:universal    # Intel + Apple Silicon，需要下载 x64 Electron
```

产物位于 `dist/`。当前版本号为 `0.8.13`。Electron 和生产 JS 依赖包含在安装包中。

欢迎页、模型选择及历史会话的默认模型头像按模型厂商显示（OpenAI、Claude、DeepSeek、Gemini、Qwen、Grok、Mistral、智谱、Kimi、MiniMax）；图标随应用离线打包，兼容接口按模型名识别。运行 `npm run test:provider-icons` 可验证切换模型、历史会话和深色主题。

模型选择器仅保留 GPT 6 Luna、6.1 Sol、6 Astra；Claude Sonnet 5.5、Opus 5.5、Fable 5.1；DeepSeek V4 Flash、V4 Pro；以及其他模型中的 Kimi K3、GLM 5.3、Gemini 4 Argon、Qwen3.8 Max。思考模式后缀由思考强度控件统一管理。

当前构建使用 ad-hoc 签名，用于本机/内部验收。正式构建入口和验收要求见 [macOS 正式分发](docs/release.md)。面向外部用户的直接安装分发仍需 Developer ID 签名及 Apple 公证；现有 ad-hoc 包不能作为“所有新机器无提示打开”的验收证明。

## 可选 MCP 集成

MCP 是高级集成，用户生成文档不需要配置它。App 内置本地 MCP 适配器，与直接生成共用引擎，提供 `get_document_skill` 以及 `create_docx` / `create_pdf` / `create_xlsx` / `create_pptx`。

如果聊天后端需要直接调用本地 MCP，可通过 Oproxy 部署的 Relay 连接。当前 Relay 仍为单连接 PoC，不属于已验收的多用户生产服务。文档主流程不依赖 Relay 或本地端口是否可用。

- 本地配置：`~/Library/Application Support/Oproxy Chat/mcp-config.json`，默认 Relay 为空。
- 状态窗口：**文件 → 本地 MCP 状态**（`⌘⇧M`）。
- [服务端协作草案](docs/oproxy-phase3-cooperation.md)
- [开发联调资料](docs/local-integration.md)
- [重构验收记录](docs/refactor-validation.md)
- [原始目标交付审查](docs/completion-audit.md)
- [最终安装版真实验收](docs/final-acceptance.md)

`mcp-server/` 为旧独立参考服务；`purchase-page/` 为独立页面素材，都不属于安装后使用的必需组件。

## 范围

目前主产品为 macOS Electron 客户端，聊天 UI、账号及模型服务由远端 Oproxy 提供。登录和聊天需要这些服务正常运行。Windows/Linux 与自动更新尚未提供。远端页面修改 DOM 时需要复验注入层与导出功能。
