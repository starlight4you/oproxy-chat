# macOS 正式分发

`npm run dist` 生成的 ad-hoc 包用于内部测试。外部用户“安装后直接打开”需要 Apple Developer ID 签名、公证和独立机器验收，内部签名校验通过不足以证明这一点。

## 正式构建入口

在维护者本机钥匙串或专用构建机器配置：

- `OPROXY_SIGNING_IDENTITY`：有效的 `Developer ID Application: ...` 身份；Apple Development 不可替代。
- 公证凭据选择一种：`APPLE_KEYCHAIN_PROFILE`；或完整的 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`；或完整的 `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`。

凭据不要写进源码、文档、日志或提交。使用系统钥匙串配置优先。

```bash
npm run release:check
npm run dist:release
```

`release:check` 仅验证签名身份和凭据配置完整性，不会上传文件或验证Apple服务端接受。`dist:release` 要求签名、启用 hardened runtime、公证，输出到 `dist/release/`，与内部包分开。缺少凭据时提前失败；不会静默退回ad-hoc。

脚本基于已安装 electron-builder 的公证字段实现；真实签名公证尚未在本项目取得成功证据。当前机器只有Apple Development身份，正式分发仍被Developer ID身份及公证配置阻挡。

## 分发前检查

- 实际调用 `codesign --verify --deep --strict` 验证最终App。
- 可先运行 `node scripts/verify-distribution.mjs /Applications/Oproxy\ Chat.app` 保存只读分发检查报告，任一项不通过即返回非零退出码。
- 对最终App执行 `xcrun stapler validate` 和 `spctl --assess --type execute`，确认公证票据及Gatekeeper评估。
- 挂载最终DMG，实际复制/安装到一台没有Node/Python/Office/Docker的机器，使用普通Oproxy账号登录。
- 测试普通聊天，测试Oproxy `gpt-6.1-sol` 的Word/PDF/Excel/PPT，检查完整内容和全页排版；测试退出重启会话恢复。
- 保存安装包摘要、系统/架构、应用版本、模型标识、文件结果、错误恢复证据。任何一步缺少证据时，不把包标作已完成外部分发验收。

本流程当前覆盖macOS Apple Silicon；Intel/通用包仍需对应构建和运行验证。SDK/编译器只用于开发与打包，不属于用户运行依赖。
