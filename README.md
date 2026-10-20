<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/sofunai-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/sofunai-logo-light.svg">
  <img alt="SofunAI Studio" src="assets/brand/sofunai-logo-light.svg" width="240">
</picture>

**Published and maintained by [SofunAI Studio](assets/brand/README.md).**

**[English](README.md)** | [简体中文](README.zh-CN.md)

# FreeAll

A local pool for your own API accounts, with a menu-bar app, web panel and OpenAI / Anthropic compatible gateway. Route requests using your account, provider and model preferences, and rotate between eligible accounts when local quota estimates or upstream responses require it.

Use official keys from accounts you own, within the providers' terms and quotas. FreeAll does not provide API keys or unlimited usage; quotas, model availability and billing remain controlled by each provider. Local usage estimates are not an official bill.

## What it includes

- Account pools for Groq, Gemini, OpenRouter, Cerebras, Mistral, NVIDIA, Together, SiliconFlow, Zhipu and custom OpenAI compatible endpoints.
- Provider/model filters, free-tier flags, account priorities, model exclusions and a local quota ledger.
- OpenAI compatible `/v1`, Anthropic compatible `/v1/messages`, and helpers for Claude Code, Codex and OpenCode.
- Encrypted key storage, same-device account exports, passphrase-protected cross-device sync and local request logs.
- English and Simplified Chinese interfaces in the CLI, panel and menu-bar app.

## Build and run from source

Use **Node.js 22 LTS** (minimum 20) and npm. Core CLI / panel code is platform-neutral; the menu-bar app and existing packaging workflow are primarily for macOS. Windows/Linux packaging targets are configured but are not verified releases.

```bash
git clone https://github.com/KyleZheng8848/freeall.git
cd freeall
npm ci
npm run build
node dist/cli.js --lang en --help
```

`npm ci` downloads Electron and runs the TypeScript prepare build. To work only on the CLI, server or tests without the Electron download:

```bash
npm ci --ignore-scripts
npm run build
```

Start the gateway in the foreground and open `http://127.0.0.1:8787/`:

```bash
node dist/cli.js serve --foreground
```

The empty panel, help and test suite do not require provider keys or OSS credentials. Model requests require your own provider key. Add one through **Accounts → Add Key**, or use the CLI prompt (do not paste actual secrets into commands you plan to share):

```bash
node dist/cli.js add groq --name work
node dist/cli.js ask 'Explain Rust in one sentence'
```

Optional: run `npm link` to expose the `freeall` command used below. Without linking, replace `freeall` with `node dist/cli.js`.

For the macOS desktop app, use `npm ci` and `npm run desktop`. The menu-bar app starts a local gateway and registers itself to launch at login. `freeall ui` opens the installed FreeAll.app when present, otherwise the browser panel; for checking this source build specifically, use the foreground command above.

## Panel and About

- **Dashboard** (`/`): usage, a quick prompt and agent connection commands.
- **Accounts** (`/pool`): add/edit keys, notes, declared models, quotas and exports.
- **Settings** (`/settings`): routing, free-model lists, gateway token and port.
- **Logs** (`/logs`): local request records retained for 48 hours.
- **About** (`/about`): FreeAll version, MIT license, SofunAI Studio logo and source link. Also accessible from **FreeAll → About FreeAll** and the tray context menu.

Keys are masked in the account list; reveal and replacement actions require local owner authentication on macOS. The gateway token is visible in Settings. Owner authentication prompts are macOS-specific; the current Windows/Linux implementation does not provide the same native prompt.

## Routing and agents

`openrouter/free` delegates model selection to OpenRouter. `openrouter/auto` selects a concrete `:free` model locally and respects the exclusion list. `auto` follows local routing settings: pinned account, provider scope, free-tier flags, model support, priority and remaining quota. These settings do not change upstream billing rules.

```bash
freeall ask --model openrouter/free Hello
freeall ask --model openrouter/auto Hello
freeall ask --provider openrouter --model auto Hello
freeall use opencode
freeall use claude
freeall use codex
freeall use generic
```

Install the chosen agent separately; FreeAll prints installation instructions when it is missing. `use generic` prints a curl recipe. Agent helpers start the local gateway automatically, which continues after the agent exits; use `freeall stop` to stop it. Cloud-hosted clients cannot reach your machine's `127.0.0.1`. Existing `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` variables can override agent settings.

Pin an account in Settings, or send `X-FreeAll-Account`, `?account=` or the request body's `account` as an ID or `provider/name`. A pinned account bypasses the panel's provider scope. Manual exclusions affect local automatic selection, not OpenRouter's internal free router.

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

Quota overrides affect the local ledger only. The OpenRouter boost option assumes your account qualifies for that provider's higher limit; confirm current eligibility with OpenRouter. For a custom provider, use `freeall add custom --name local --base-url https://YOUR-ENDPOINT/v1`.

## Language

The panel follows the browser's language; the desktop app follows the system. Choose **Language → System / 简体中文 / English** in the panel to override it. Selection is stored locally and reloads the page, so save edits first. The desktop app shares this preference with its menu. Unsupported languages fall back to English.

```bash
freeall --lang en status
freeall --lang zh-CN --help
FREEALL_LANG=en freeall providers
```

CLI precedence is `--lang`, then `FREEALL_LANG`, then `LC_ALL` / `LC_MESSAGES` / `LANG` and the system locale. Dates, relative times and units follow the selected language. Notes, model IDs and user content keep their original values. API clients may send `Accept-Language`.

## Storage and backup

Data defaults to `~/.freeall` (`FREEALL_HOME` can override it). `store.json` contains encrypted API keys; `master.key` is the local encryption key, stored with `0600` permissions. Both are on the same device, so storage encryption does not isolate secrets from someone who can read both files. Requests send prompts and credentials to the provider you choose; local logs may include prompt/response content. The panel may fetch Google Fonts and checks the configured public update manifest.

The Accounts page's import/export bundles use the local master key and are intended for the **same device**. Import merges by provider/name unless replacement is explicitly chosen. For a different machine, use passphrase sync:

```bash
freeall sync export pack.json --pass 'USE-A-LONG-PRIVATE-PASSPHRASE'
freeall sync import pack.json --pass 'USE-A-LONG-PRIVATE-PASSPHRASE'
```

Keep the passphrase separate from the export and avoid leaving actual secrets in shell history; `FREEALL_SYNC_PASS` is also supported. Sync omits the gateway token unless `--keep-token` is supplied. Add `--replace` only when you intend to replace the target pool. Never publish keys, gateway tokens, exports or local data.

## Development

```bash
npm run build
npm test
npm run check:version
```

Tests use temporary stores and mocked provider responses, with no real model charges. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and reporting guidance.

## Packaging and optional distribution

On macOS, install Xcode Command Line Tools / Swift, then run `npm run dist` for the configured arm64 DMG/ZIP packaging. Other platforms and architectures need separate validation. This source publication does not itself publish a new binary release.

The maintainer's existing [download page](https://sometimesgood.oss-cn-hangzhou-zmf.aliyuncs.com/FreeAll/index.html) and automatic update source are configured in `package.json` under `freeall`. Their published version may differ from this repository. To distribute your own fork, change the update/download URLs and use **your own** OSS bucket and credentials; see [.env.example](.env.example). `release:publish`, `release:manifest`, `verify:published` and `verify:surface` are optional maintainer commands, not prerequisites for building or testing.

## License

Copyright © 2026 SofunAI Studio and FreeAll contributors. Source code is available under [MIT](LICENSE). Preserve third-party dependency and asset licenses. Provider APIs, models and third-party agents remain subject to their own terms. Shared studio assets are documented in [assets/brand](assets/brand/README.md).
