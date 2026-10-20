import { tr } from "./i18n.js";
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { ensureDaemon } from "./daemon.js";
import { opencodeConfigContent, recipeBody } from "./recipes.js";
import type { Store } from "./store.js";

export type AgentName = "claude" | "codex" | "opencode" | "generic";

export type InstallAgent = Exclude<AgentName, "generic">;

const INSTALL: Record<InstallAgent, { label: string; official: string; commands: string[] }> = {
  claude: {
    label: "Claude Code CLI",
    official: "Claude 会员",
    commands: ["npm install -g @anthropic-ai/claude-code && hash -r"],
  },
  codex: {
    label: "OpenAI Codex CLI",
    official: "ChatGPT",
    commands: ["npm install -g @openai/codex && hash -r", "brew install --cask codex && hash -r"],
  },
  opencode: {
    label: "OpenCode CLI",
    official: "OpenCode 里登录的那些 key",
    commands: ["npm install -g opencode-ai && hash -r", "brew install anomalyco/tap/opencode && hash -r"],
  },
};

export function gatewayUrl(store: Store): string {
  return `http://${store.data.settings.host}:${store.data.settings.port}`;
}

export function hasCommand(cmd: string): boolean {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  const names = process.platform === "win32" ? [cmd, `${cmd}.cmd`, `${cmd}.exe`, `${cmd}.bat`] : [cmd];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of names) {
      try {
        accessSync(path.join(dir, name), constants.X_OK);
        return true;
      } catch {
        /* next */
      }
    }
  }
  return false;
}

export function installCommands(agent: InstallAgent): string {
  return INSTALL[agent].commands.join("\n");
}

export function installHint(agent: InstallAgent): string {
  return tr("本机要先有 {0} 命令。没有就先装（任选一条），再跑上面那行。", agent);
}

export function missingCliText(agent: InstallAgent): string {
  const spec = INSTALL[agent];
  return [
    tr("本机没有 {0} 命令，没法启动。", agent),
    "",
    tr("先装 {0}（任选一条）：", spec.label),
    ...spec.commands.map((c) => `  ${c}`),
    "",
    tr("装好后 which {0} 能看到路径，再到要干活的目录跑：", agent),
    `  freeall use ${agent}`,
    "",
    tr("这条会拉本机网关，把 {0} 指到账号池（不扣 {1}）。", agent, tr(spec.official)),
    tr("现在只想问一句、不经过 Agent：freeall ask 你好"),
    tr("只看接线：freeall use generic"),
  ].join("\n");
}

export function launchBanner(agent: InstallAgent, started: boolean, base: string): string {
  const spec = INSTALL[agent];
  return [
    started ? tr("已自动拉起本地网关。{0}", base) : tr("网关已在跑。{0}", base),
    tr("启动 {0}：请求走本机网关，模型 auto，走账号池，不扣 {1}。", spec.label, tr(spec.official)),
    tr("退出后网关还在，停用：freeall stop"),
  ].join("\n");
}

export function exitBanner(agent: InstallAgent, base: string): string {
  return tr("{0} 已退出。网关还在 {1} ，停用：freeall stop", INSTALL[agent].label, base);
}

export async function launchAgent(store: Store, agent: AgentName, extra: string[]): Promise<number> {
  if (agent !== "generic" && !hasCommand(agent)) {
    console.log(missingCliText(agent));
    return 1;
  }

  const { started } = await ensureDaemon(store);
  const base = gatewayUrl(store);
  const token = store.data.settings.gatewayToken;

  if (agent === "generic") {
    printGeneric(base, token, started);
    return 0;
  }

  console.log(launchBanner(agent, started, base));
  console.log("");

  const env = { ...process.env };
  strip(env, ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "OPENAI_BASE_URL"]);
  env.NO_PROXY = joinNoProxy(env.NO_PROXY, "127.0.0.1,localhost");

  const code = await spawnAgent(agent, extra, env, base, token, store);
  console.log("");
  console.log(exitBanner(agent, base));
  return code;
}

function spawnAgent(
  agent: Exclude<AgentName, "generic">,
  extra: string[],
  env: NodeJS.ProcessEnv,
  base: string,
  token: string,
  store: Store,
): Promise<number> {
  if (agent === "claude") {
    env.ANTHROPIC_BASE_URL = base;
    env.ANTHROPIC_AUTH_TOKEN = token;
    return spawnWait("claude", extra, env);
  }
  env.OPENAI_BASE_URL = `${base}/v1`;
  env.OPENAI_API_KEY = token;
  if (agent === "opencode") {
    env.OPENCODE_CONFIG_CONTENT = opencodeConfigContent(
      { url: base, openaiBase: `${base}/v1`, token, model: "auto" },
      poolModelIds(store),
    );
    const args = hasModelFlag(extra) ? extra : ["-m", "freeall/auto", ...extra];
    return spawnWait("opencode", args, env);
  }
  return spawnWait(
    "codex",
    [
      "-c",
      'model_provider="freeall"',
      "-c",
      `model_providers.freeall.base_url="${base}/v1"`,
      "-c",
      'model_providers.freeall.env_key="OPENAI_API_KEY"',
      "-c",
      'model_providers.freeall.wire_api="chat"',
      "-c",
      'model="auto"',
      ...extra,
    ],
    env,
  );
}

function poolModelIds(store: Store): string[] {
  const ids = new Set<string>();
  for (const account of store.data.accounts) {
    if (account.preferredModel) ids.add(account.preferredModel);
    for (const id of account.models ?? []) ids.add(id);
  }
  return [...ids];
}

function hasModelFlag(extra: string[]): boolean {
  return extra.some((arg) => arg === "-m" || arg === "--model" || arg.startsWith("-m=") || arg.startsWith("--model="));
}

function printGeneric(base: string, token: string, started: boolean): void {
  console.log(started ? tr("已自动拉起本地网关。") : tr("网关已在跑。"));
  console.log(tr("下面是通用接线。Claude / Codex / OpenCode 请用 freeall use claude|codex|opencode（要先装对应 CLI）。"));
  console.log("");
  console.log(recipeBody("curl", { url: base, openaiBase: `${base}/v1`, token, model: "auto" }));
}

function strip(env: NodeJS.ProcessEnv, keys: string[]): void {
  for (const key of keys) delete env[key];
}

function joinNoProxy(current: string | undefined, extra: string): string {
  return [current, extra].filter(Boolean).join(",");
}

function spawnWait(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: "inherit" });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (cmd === "claude" || cmd === "codex" || cmd === "opencode") {
          reject(new Error(missingCliText(cmd)));
          return;
        }
        reject(new Error(tr("找不到命令 {0}。先安装对应 CLI，或用 freeall use generic 看接入方式", cmd)));
        return;
      }
      reject(error);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
