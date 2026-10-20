<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/sofunai-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/sofunai-logo-light.svg">
  <img alt="SofunAI Studio" src="assets/brand/sofunai-logo-light.svg" width="240">
</picture>

**由 [SofunAI 工作室](assets/brand/README.md)出品并维护。**

**[GitHub 仓库](https://github.com/KyleZheng8848/freeall)**

[English](README.md) | **[简体中文](README.zh-CN.md)**

# FreeAll

把自己申请的官方 API 账号收进本机账号池，通过菜单栏应用、网页面板和 OpenAI / Anthropic 兼容网关统一使用。按账号、供应商、模型和优先级路由，在本地额度估算或上游响应需要时轮换到符合规则的账号。

仅使用你自己持有的官方 Key，并遵守供应商条款与额度规则。FreeAll 不提供密钥或无限额度；可用模型、实际限额和收费由供应商决定，本地账本不是官方账单。

## 功能

- 支持 Groq、Gemini、OpenRouter、Cerebras、Mistral、NVIDIA、Together、SiliconFlow、智谱，以及自定义 OpenAI 兼容接口。
- 供应商/模型过滤、免费档标记、固定账号、优先级、排除列表和本机额度账本。
- OpenAI 兼容 `/v1`、Anthropic 兼容 `/v1/messages`，以及 Claude Code、Codex、OpenCode 接入辅助。
- 密钥加密存储、同机导出、口令保护的跨设备同步和本机请求日志。
- 命令行、面板和菜单栏支持简体中文及英语。

## 下载 macOS 应用

[全部版本](https://github.com/KyleZheng8848/freeall/releases) · **0.2.16**

- [Apple Silicon（M 系列芯片）— DMG](https://github.com/KyleZheng8848/freeall/releases/download/v0.2.16/FreeAll-0.2.16-mac-arm64.dmg)
- [Intel 芯片 — DMG](https://github.com/KyleZheng8848/freeall/releases/download/v0.2.16/FreeAll-0.2.16-mac-x64.dmg)

Release 页面同时提供 ZIP 和 `SHA256SUMS.txt` 校验文件。应用采用临时签名，尚未经过 Apple 公证。将 FreeAll.app 拖到「应用程序」。首次启动若被 macOS 拦截，核对下载来源后，在「系统设置 → 隐私与安全性」选择「仍要打开」。

## 从源码构建运行

推荐 **Node.js 22 LTS**，最低 20，并安装 npm。核心 CLI/面板代码跨平台，菜单栏应用和既有打包流程主要面向 macOS；Windows/Linux 虽有打包目标配置，尚未验证发布。

```bash
git clone https://github.com/KyleZheng8848/freeall.git
cd freeall
npm ci
npm run build
node dist/cli.js --lang zh-CN --help
```

`npm ci` 会下载 Electron 并执行 TypeScript prepare 构建。只开发 CLI、服务或跑测试时，可跳过 Electron 下载：

```bash
npm ci --ignore-scripts
npm run build
```

前台启动网关后打开 `http://127.0.0.1:8787/`：

```bash
node dist/cli.js serve --foreground
```

空面板、帮助和测试不需要供应商账号、模型 Key 或 OSS 权限。调用模型需要自己的 Key。可在 **账号池 → 添加 Key** 中添加，也可用命令行提示输入；不要把真实密钥粘贴到准备分享的命令中：

```bash
node dist/cli.js add groq --name work
node dist/cli.js ask '用一句话解释 Rust'
```

可选执行 `npm link`，获得下文使用的 `freeall` 命令；不 link 时用 `node dist/cli.js` 替代。

macOS 桌面应用使用 `npm ci` 后执行 `npm run desktop`。菜单栏应用会启动本地网关，并注册登录启动。`freeall ui` 优先打开本机已安装的 FreeAll.app，否则打开网页；专门检查当前源码时使用上述前台运行方式。

## 面板与关于页

- **看板** `/`：用量、试一句和 Agent 接入命令。
- **账号池** `/pool`：Key、备注、模型声明、限额和导入导出。
- **设置** `/settings`：路由、免费模型列表、网关 token 与端口。
- **日志** `/logs`：本机请求记录，保留 48 小时。
- **关于** `/about`：FreeAll 版本、MIT 许可、SofunAI 标识和源码链接；也可从 **FreeAll → 关于 FreeAll** 或托盘右键菜单进入。

账号列表中的 Key 默认脱敏，macOS 查看与更换密钥需本机身份解锁。设置页会显示网关 token。身份解锁提示目前仅在 macOS 实现，Windows/Linux 没有同等原生提示。

## 路由与 Agent

`openrouter/free` 原样交给 OpenRouter 派免费模型；`openrouter/auto` 在本机从具体 `:free` 模型中选择并跳过排除列表。`auto` 遵循本机设置：固定账号、供应商范围、免费档、模型支持、优先级和余量。这些规则不改变上游收费规则。

```bash
freeall ask --model openrouter/free 你好
freeall ask --model openrouter/auto 你好
freeall ask --provider openrouter --model auto 你好
freeall use opencode
freeall use claude
freeall use codex
freeall use generic
```

Agent 需单独安装，缺少时 FreeAll 会打印安装方式。`use generic` 仅打印 curl 接入示例。`use` 会自动启动网关，Agent 退出后网关继续运行，停用执行 `freeall stop`。云端客户端无法访问你本机的 `127.0.0.1`。已有 `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` 环境变量可能覆盖 Agent 的接入设置。

可在设置中固定账号，也可通过 `X-FreeAll-Account`、`?account=` 或 body 的 `account` 传账号 ID 或 `provider/name`；固定账号会忽略面板的供应商范围。本机排除列表影响本地自动选模，不控制 OpenRouter 内部 free 路由。

```bash
freeall providers
freeall status
freeall logs --n 20
freeall models
freeall doctor
freeall quota openrouter/home --rpd 800
freeall quota openrouter/home --boost
freeall quota openrouter/home --reset
```

限额覆盖只作用于本机账本。OpenRouter 的 boost 选项假定账号符合其更高额度条件，实际资格请以 OpenRouter 当前规则为准。自定义供应商使用 `freeall add custom --name local --base-url https://YOUR-ENDPOINT/v1`。

## 语言

面板默认跟随浏览器语言，桌面应用跟随系统；可在顶栏 **语言 → 跟随系统 / 简体中文 / English** 覆盖。选择保存在本机，切换会重新加载当前页，请先保存编辑。桌面应用的菜单也使用该选择。不支持的语言回退为英语。

```bash
freeall --lang en status
freeall --lang zh-CN --help
FREEALL_LANG=en freeall providers
```

CLI 优先级为 `--lang`、`FREEALL_LANG`、`LC_ALL` / `LC_MESSAGES` / `LANG` 及系统语言。日期、相对时间和单位随语言变化；账号备注、模型 ID 和用户内容保留原值。API 客户端可用 `Accept-Language`。

## 存储与备份

默认数据在 `~/.freeall`，可用 `FREEALL_HOME` 覆盖。`store.json` 保存密钥密文，`master.key` 为本机解密密钥，权限为 `0600`。两者在同一设备，本地加密不能隔离同时读取两个文件的访问者。请求会把提示词和凭据发给你选择的供应商；本机日志可能包含提示词/回复内容。面板可能加载 Google Fonts，并检查配置中的公开更新清单。

账号池页导入导出使用本机 master key，只适合**同一设备**重新导入。导入默认按供应商/名字合并，明确选择覆盖才替换。跨设备使用口令同步：

```bash
freeall sync export pack.json --pass '请替换为私密长口令'
freeall sync import pack.json --pass '请替换为私密长口令'
```

口令与导出文件分开保存，避免把真实口令留进命令历史；也支持 `FREEALL_SYNC_PASS`。默认不带网关 token，需要时加 `--keep-token`；只有确定要替换目标账号池时才加 `--replace`。不要公开密钥、网关 token、账号导出或本机数据。

## 开发

```bash
npm run build
npm test
npm run check:version
```

测试使用临时存储与模拟供应商响应，不产生真实模型调用费用。开发和问题反馈见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 打包与可选分发

macOS 安装 Xcode Command Line Tools / Swift 后，执行 `npm run dist`，按当前配置生成 arm64 DMG/ZIP。其他系统和架构需单独验证。本次源码开源不等于发布了新的二进制版本。

维护者既有[下载页](https://sometimesgood.oss-cn-hangzhou-zmf.aliyuncs.com/FreeAll/index.html)和自动更新源位于 `package.json` 的 `freeall` 配置中，其线上版本可能与源码不同。自行分发 fork 时修改更新/下载地址，使用**自己的** OSS 存储桶与密钥，参考 [.env.example](.env.example)。`release:publish`、`release:manifest`、`verify:published` 与 `verify:surface` 是维护者可选命令，构建和测试不需要执行。

## 许可证

版权所有 © 2026 SofunAI 工作室及 FreeAll 贡献者，源码采用 [MIT](LICENSE)。保留第三方依赖与素材的许可声明。供应商 API、模型和第三方 Agent 各自遵循其条款。共享工作室素材见 [assets/brand](assets/brand/README.md)。
