# Contributing / 参与贡献

FreeAll is published and maintained by SofunAI Studio. Use Node.js 22 LTS (minimum 20) and npm.

FreeAll 由 SofunAI 工作室出品并维护。推荐 Node.js 22 LTS，最低 20。

```bash
npm ci --ignore-scripts
npm run build
npm test
npm run check:version
```

The test suite uses temporary stores and mocked provider responses. It does not require your API keys, a provider account or OSS credentials. The commands above skip Electron's binary download; for the desktop application, run `npm ci` and `npm run desktop` on a graphical desktop. macOS icon generation and packaging require Xcode Command Line Tools / Swift.

测试使用临时存储和模拟供应商响应，不需要真实 API Key、供应商账号或 OSS 密钥。以上命令跳过 Electron 二进制下载；开发桌面应用时执行 `npm ci` 和 `npm run desktop`。macOS 图标生成和打包需要 Xcode Command Line Tools / Swift。

Keep English and Chinese README instructions in sync. Add English catalog entries in `src/i18n/messages.ts` when introducing Chinese source messages. Product names, model IDs, account notes and user content should keep their original values. Use focused tests for behavioral changes.

同步维护中英文 README。新增中文界面文案时补齐英文词典。产品名、模型 ID、账号备注和用户内容保留原值；行为改动用针对性测试验证。

Before submitting an issue or pull request, include the observed behavior, expected result, platform, FreeAll version and relevant checks. Remove provider keys, gateway tokens, account exports, private prompts and identifying logs. Do not submit `.env.local`, `Data/`, `.freeall/`, `store.json`, `master.key`, `node_modules/`, `dist/` or `release/`.

提交问题或 PR 时说明实际/预期行为、平台、版本及检查结果。删除供应商密钥、网关 token、账号导出、私人提示词和个人日志；不要提交上述本地数据或构建产物。

Source contributions do not require publishing access. OSS scripts are optional maintainer tools and must use the publisher's own bucket and credentials. Respect the existing MIT license and third-party notices.

源码贡献不需要发布权限。OSS 脚本为维护者可选工具，发布时使用自己的存储桶与密钥。遵守 MIT 许可并保留第三方声明。


## GitHub macOS Release

Run **Actions → Publish macOS apps → Run workflow** on the reviewed commit. The workflow builds natively on Apple Silicon and Intel, verifies the application and both archives, then creates a new `v<version>` tag and GitHub Release with DMG, ZIP and SHA256 checksums. It refuses to overwrite an existing tag. After publication it downloads every installer anonymously and verifies its checksum. This workflow does not publish to OSS or install an app locally. Windows/Linux package targets remain available for local development and are not part of this macOS release workflow.
