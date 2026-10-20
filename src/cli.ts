#!/usr/bin/env node
import { tr, setLocale, resolveLocale, currentLocale } from "./i18n.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stderr } from "node:process";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listProviders, resolveProvider } from "./catalog.js";
import { logAccountRef, sourceLabel } from "./logs.js";
import { accountLimits, patchAccountLimits, remainingHint } from "./quota.js";
import { spawn } from "node:child_process";
import { daemonRunning, ensureDaemon, stopDaemon, writeOwnPid } from "./daemon.js";
import { hasCommand, installCommands, launchAgent, type AgentName, type InstallAgent } from "./agents.js";
import { answerFromOutcome, printAsk, printStatus } from "./format.js";
import { startProxy } from "./proxy.js";
import { routeChat, verifyAccount } from "./router.js";
import { Store } from "./store.js";
import { importMerge, importReplace, readExport, writeExport } from "./sync.js";
import type { ProviderId } from "./types.js";

interface Options {
  command?: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): Options {
  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];
  let command: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (token.startsWith("--")) {
      const [raw, inline] = token.slice(2).split("=", 2);
      const name = raw.replace(/-/g, "");
      if (inline !== undefined) {
        flags[name] = inline;
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[name] = next;
        i += 1;
      } else {
        flags[name] = true;
      }
      continue;
    }
    if (token.startsWith("-") && token.length === 2) {
      throw new Error(tr("未知短选项 {0}。用 --help", token));
    }
    if (!command) command = token;
    else args.push(token);
  }
  return { command, args, flags };
}

function store(): Store {
  return new Store().loadOrCreate();
}

function flag(flags: Record<string, string | boolean>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = flags[name.replace(/-/g, "")];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function bool(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name.replace(/-/g, "")] === true;
}

async function readSecret(flags: Record<string, string | boolean>, positional?: string): Promise<string> {
  const fromFlag = flag(flags, "key", "apikey");
  if (fromFlag) return fromFlag;
  if (positional) return positional;
  if (process.env.FREEALL_ADD_KEY) return process.env.FREEALL_ADD_KEY;
  if (!input.isTTY) throw new Error(tr("没有密钥。用 --key 或环境变量 FREEALL_ADD_KEY"));
  const rl = createInterface({ input, output: stderr });
  const value = (await rl.question(tr("API key（输入不回显到命令历史，请粘贴）："))).trim();
  rl.close();
  if (!value) throw new Error(tr("密钥不能为空"));
  return value;
}

async function cmdAdd(opts: Options): Promise<void> {
  const provider = opts.args[0];
  if (!provider) throw new Error(tr("用法：freeall add <provider> --key <key> --name work"));
  const spec = resolveProvider(provider);
  const s = store();
  const name = flag(opts.flags, "name") ?? uniqueName(s, spec.id);
  const baseUrl = flag(opts.flags, "baseurl", "base-url");
  if (spec.id === "custom" && !baseUrl) throw new Error(tr("custom 必须带 --base-url https://…/v1"));
  const apiKey = await readSecret(opts.flags, opts.args[1]);
  const account = s.addAccount({
    name,
    provider: spec.id as ProviderId,
    apiKey,
    baseUrl,
    note: flag(opts.flags, "note"),
  });
  if (bool(opts.flags, "boost") || flag(opts.flags, "rpd") || flag(opts.flags, "rpm")) {
    patchAccountLimits(account, {
      boost: bool(opts.flags, "boost") || undefined,
      rpd: flag(opts.flags, "rpd"),
      rpm: flag(opts.flags, "rpm"),
    });
    s.save();
  }
  if (bool(opts.flags, "skipverify") || bool(opts.flags, "skip-verify")) {
    console.log(tr("已加入 {0}/{1}（跳过验证）", account.provider, account.name));
    return;
  }
  const result = await verifyAccount(s, account);
  if (result.ok) {
    const same = s.data.accounts.filter((a) => a.provider === account.provider).length;
    const extra = same > 1 ? tr("。同供应商已有 {0} 个账号，额度耗尽会自动切", same) : "";
    const current = account.preferredModel ?? spec.defaultModel;
    console.log(
      tr("已加入 {0}/{1} · 已验证 · {2} 个模型 · 当前 {3}{4}", account.provider, account.name, result.models.length, current, extra),
    );
    if (result.models.length) {
      console.log(tr("换模型：面板里改，或 freeall ask --model {0}/{1}", account.provider, result.models[0]));
    }
  } else {
    console.log(tr("已加入 {0}/{1}，但验证失败：{2}", account.provider, account.name, result.error));
    console.log(tr("密钥未丢。检查后可再 freeall doctor，或 freeall rm {0}/{1}", account.provider, account.name));
    process.exitCode = 2;
  }
}

function uniqueName(s: Store, provider: string): string {
  const used = new Set(s.data.accounts.filter((a) => a.provider === provider).map((a) => a.name));
  if (!used.has("main")) return "main";
  let i = 2;
  while (used.has(`alt${i}`)) i += 1;
  return `alt${i}`;
}

function cmdRm(opts: Options): void {
  const ref = opts.args[0];
  if (!ref) throw new Error(tr("用法：freeall rm <provider/name|name|id>"));
  const removed = store().removeAccount(ref);
  console.log(tr("已删除 {0}/{1}", removed.provider, removed.name));
}

function cmdLs(): void {
  const s = store();
  if (s.data.accounts.length === 0) {
    console.log(tr("还没有账号。freeall providers 看支持列表，然后 freeall add groq --key …"));
    return;
  }
  for (const a of s.data.accounts) {
    const model = a.preferredModel ?? "-";
    const n = a.models?.length ?? 0;
    console.log(`${a.provider}/${a.name}\t${a.status}\t${model}\t${n} models`);
  }
}

function cmdModels(): void {
  const s = store();
  if (s.data.accounts.length === 0) {
    console.log(tr("还没有账号。先 freeall add 或 freeall ui"));
    return;
  }
  for (const a of s.data.accounts) {
    const list = a.models?.length ? a.models : [tr("（未拉取，面板点刷新或重新 add 验证）")];
    console.log(tr("{0}/{1}  当前 {2}", a.provider, a.name, a.preferredModel ?? tr("未选")));
    for (const model of list) console.log(`  ${model}`);
  }
}

function cmdStatus(): void {
  console.log(printStatus(store()));
}

function cmdLogs(opts: Options): void {
  const s = store();
  const n = Number(flag(opts.flags, "n") ?? "20");
  const rows = [...(s.data.logs ?? [])].sort((a, b) => b.at - a.at).slice(0, Number.isInteger(n) && n > 0 ? n : 20);
  if (!rows.length) {
    console.log(tr("还没有请求记录。试一句或 Agent 走网关后会出现。"));
    return;
  }
  for (const log of rows) {
    const when = new Date(log.at).toLocaleString(currentLocale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const state = log.ok ? "ok" : `×${log.status ?? ""}`;
    console.log(
      `${when}\t${state}\t${logAccountRef(log)}\t${log.model}\t${log.promptTokens}→${log.completionTokens} tok\t${log.ms}ms\t${sourceLabel(log.source)}`,
    );
  }
}

function cmdQuota(opts: Options): void {
  const ref = opts.args[0];
  if (!ref) throw new Error(tr("用法：freeall quota <provider/name> [--boost|--reset|--rpd N|--rpm N]"));
  const s = store();
  const account = s.find(ref);
  if (!account) throw new Error(tr("找不到账号 '{0}'。用 freeall ls 查看", ref));
  const reset = bool(opts.flags, "reset");
  const boost = bool(opts.flags, "boost");
  const rpd = flag(opts.flags, "rpd");
  const rpm = flag(opts.flags, "rpm");
  if (reset) {
    delete account.limitOverride;
    s.save();
  } else if (boost || rpd !== undefined || rpm !== undefined) {
    patchAccountLimits(account, {
      boost: boost || undefined,
      rpd,
      rpm,
    });
    s.save();
  }
  const limits = accountLimits(account);
  const hint = remainingHint(account, s.data.usage);
  const cap = tr("{0}/分 · {1}/日", limits.rpm ?? tr("不限"), limits.rpd ?? tr("不限"));
  console.log(tr("{0}/{1}  本机上限 {2}  剩 {3}", account.provider, account.name, cap, hint.label));
}

async function cmdAsk(opts: Options): Promise<void> {
  const prompt = opts.args.join(" ").trim();
  if (!prompt) throw new Error(tr("用法：freeall ask 用一句话解释 Rust"));
  const s = store();
  const model = flag(opts.flags, "model") ?? s.data.settings.defaultModel;
  const provider = flag(opts.flags, "provider");
  const started = Date.now();
  const outcome = await routeChat(s, {
    model,
    provider,
    messages: [{ role: "user", content: prompt }],
  }, fetch, Date.now(), "cli");
  if (!outcome.ok || !outcome.result?.json) {
    console.error(outcome.exhaustion ?? tr("请求失败"));
    process.exitCode = 1;
    return;
  }
  const via = outcome.account ? `${outcome.account.provider}/${outcome.account.name}` : undefined;
  console.log(printAsk(answerFromOutcome(outcome.result.json), via, Date.now() - started, outcome.attempts));
}

async function cmdServe(opts: Options): Promise<void> {
  const s = store();
  const port = flag(opts.flags, "port");
  const host = flag(opts.flags, "host");
  if (port) s.data.settings.port = Number(port);
  if (host) s.data.settings.host = host;
  if (!Number.isFinite(s.data.settings.port) || s.data.settings.port <= 0) {
    throw new Error(tr("--port 必须是正整数"));
  }
  s.save();
  writeOwnPid(s);
  const server = startProxy(s);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE") {
        reject(new Error(tr("端口 {0} 被占。freeall stop，或 freeall serve --port 8788", s.data.settings.port)));
        return;
      }
      reject(error);
    });
  });
  const url = `http://${s.data.settings.host}:${s.data.settings.port}`;
  console.log(tr("面板 {0}/", url));
  console.log(tr("网关 {0}/v1", url));
  console.log(`token  ${s.data.settings.gatewayToken}`);
  console.log(tr("任意 OpenAI 客户端把 baseURL 指过来即可。Ctrl+C 停。"));
  if (!bool(opts.flags, "foreground") && input.isTTY) {
    console.log(tr("后台跑：freeall use claude 会自动拉起。这里是前台，方便看日志。"));
  }
  await new Promise(() => undefined);
}

async function cmdUse(opts: Options): Promise<void> {
  const agent = (opts.args[0] ?? "generic") as AgentName;
  if (!["claude", "codex", "opencode", "generic"].includes(agent)) {
    throw new Error(tr("用法：freeall use claude|codex|opencode|generic"));
  }
  const code = await launchAgent(store(), agent, opts.args.slice(1));
  process.exitCode = code;
}

function cmdSync(opts: Options): void {
  const action = opts.args[0];
  const file = opts.args[1];
  const pass = flag(opts.flags, "pass", "passphrase") ?? process.env.FREEALL_SYNC_PASS;
  if (!action || !file) throw new Error(tr("用法：freeall sync export|import <file> --pass <password>"));
  if (!pass) throw new Error(tr("同步必须带 --pass（或 FREEALL_SYNC_PASS）。禁止无口令导出"));
  const s = store();
  if (action === "export") {
    writeExport(s, file, pass, bool(opts.flags, "keep-token") || bool(opts.flags, "keeptoken"));
    console.log(tr("已写入加密包 {0}。口令不要和文件放一起。", file));
    return;
  }
  if (action === "import") {
    const payload = readExport(file, pass);
    if (bool(opts.flags, "replace")) {
      const r = importReplace(s, payload);
      console.log(tr("已替换本机池，共 {0} 个账号", r.added));
    } else {
      const r = importMerge(s, payload);
      console.log(tr("已合并：新增 {0}，更新 {1}。同名账号以导入包为准", r.added, r.updated));
    }
    return;
  }
  throw new Error(tr("sync 只要 export 或 import"));
}

function cmdProviders(): void {
  for (const spec of listProviders()) {
    console.log(
      `${spec.id.padEnd(14)} ${spec.defaultModel.padEnd(42)} ${spec.limits.monthlyHint.padEnd(12)} ${spec.signup}`,
    );
  }
  console.log(("custom         " + "<你的 OpenAI 兼容地址>" + tr("                     --base-url 必填")));
}

function cmdToken(): void {
  const s = store();
  console.log(s.data.settings.gatewayToken);
  console.log(`OPENAI_BASE_URL=http://${s.data.settings.host}:${s.data.settings.port}/v1`);
}

function cmdDoctor(): void {
  const s = store();
  const problems: string[] = [];
  if (s.data.accounts.length === 0) problems.push(tr("P0 池是空的：freeall add groq --key …"));
  if (!s.data.accounts.some((a) => a.enabled && a.status !== "invalid" && a.status !== "error")) {
    problems.push(tr("P0 没有可用账号。invalid/error 的先修好或换硅基流动/智谱；冷却中的等或再添加 Key"));
  }
  const pid = daemonRunning(s);
  const anth = process.env.ANTHROPIC_BASE_URL;
  const oai = process.env.OPENAI_BASE_URL;
  const expect = `http://${s.data.settings.host}:${s.data.settings.port}`;
  if (anth && !anth.startsWith(expect)) {
    problems.push(tr("ANTHROPIC_BASE_URL={0} 会盖掉 freeall use claude。先 unset", anth));
  }
  if (oai && !oai.startsWith(expect)) {
    problems.push(tr("OPENAI_BASE_URL={0} 不指向本机网关 {1}/v1", oai, expect));
  }
  console.log(printStatus(s));
  console.log(pid ? tr("守护进程 pid {0}", pid) : tr("网关未运行（ask 不需要；use/serve 会拉起）"));
  for (const agent of ["claude", "codex", "opencode"] as InstallAgent[]) {
    if (hasCommand(agent)) continue;
    console.log(tr("提示：本机没有 {0}。要接到它先装（任选一条）：", agent));
    for (const line of installCommands(agent).split("\n")) console.log(`  ${line}`);
  }
  if (problems.length === 0) console.log(tr("doctor：没有挡住用量的问题。"));
  else {
    for (const p of problems) console.log(`· ${p}`);
    process.exitCode = 1;
  }
}

function cmdStop(): void {
  console.log(stopDaemon(store()) ? tr("已停止网关") : tr("网关本来就没在跑"));
}

async function cmdUi(): Promise<void> {
  const s = store();
  const { started } = await ensureDaemon(s);
  const url = `http://${s.data.settings.host}:${s.data.settings.port}/`;
  if (!openDesktop()) openBrowser(url);
  console.log(tr("{0}面板 {1}", started ? tr("已拉起网关。") : tr("网关已在跑。"), url));
  console.log(tr("和 CLI 共用 ~/.freeall，ask / use / sync 读的是同一份池。"));
}

function openDesktop(): boolean {
  if (process.platform !== "darwin") return false;
  const appPath = "/Applications/FreeAll.app";
  if (!existsSync(appPath)) return false;
  const child = spawn("open", ["-a", "FreeAll"], { detached: true, stdio: "ignore" });
  child.unref();
  return true;
}

function openBrowser(url: string): void {
  const child =
    process.platform === "darwin"
      ? spawn("open", [url], { detached: true, stdio: "ignore" })
      : process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" })
        : spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

function help(): string {
  return tr("FreeAll — 把你自己的免费额度账号收进一个池，额度尽了自动切。\n\n最快路径\n  freeall ui                                 # 打开面板（已装软件则开 FreeAll.app）\n  freeall add groq gsk_… --name work --note '个人邮箱'\n  freeall ask 用一句话说什么是 Rust\n  freeall ask --model openrouter/free 你好     # 交给 OpenRouter 派免费模型；本机派用 openrouter/auto\n  freeall ask --provider openrouter --model auto 你好   # 本次只打这家\n\n日常\n  freeall status                 看每个账号还剩多少（本地账本）\n  freeall logs [--n 20]          最近请求记录（本机 48h）\n  freeall quota provider/name --boost     OpenRouter 充过 ≥$10，本机日限按 1000\n  freeall quota provider/name --rpd 800   手改本机日上限（--rpm 改每分钟）\n  freeall quota provider/name --reset     退回目录默认\n  freeall ls / rm provider/name\n  freeall ui                     打开面板；已装软件则开 FreeAll.app\n  freeall serve                  给 Claude/Codex/OpenCode 用的本地网关\n  freeall use claude|codex|opencode|generic   # 启动对应 CLI；没装会打印安装命令\n  freeall sync export pack.json --pass '长口令'\n  freeall sync import pack.json --pass '长口令'   # 默认合并\n  freeall models                 列出每个 Key 拉到的可用模型\n  freeall providers\n  freeall token                  打印网关 token（给已在跑的 serve 用）\n  freeall doctor\n  freeall stop\n\n只加你自己申请的官方 key。不要导入来路不明的 token。");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);
  const language = flag(opts.flags, "lang");
  if (language) setLocale(resolveLocale(language));
  if (!opts.command || opts.flags.help) {
    console.log(help() + "\n" + tr("语言：--lang en / --lang zh-CN，或 FREEALL_LANG；默认跟随系统。"));
    return;
  }
  switch (opts.command) {
    case "add":
      await cmdAdd(opts);
      break;
    case "rm":
    case "remove":
      cmdRm(opts);
      break;
    case "ls":
    case "list":
      cmdLs();
      break;
    case "status":
      cmdStatus();
      break;
    case "logs":
      cmdLogs(opts);
      break;
    case "quota":
      cmdQuota(opts);
      break;
    case "ask":
      await cmdAsk(opts);
      break;
    case "serve":
      await cmdServe(opts);
      break;
    case "ui":
    case "panel":
      await cmdUi();
      break;
    case "use":
      await cmdUse(opts);
      break;
    case "sync":
      cmdSync(opts);
      break;
    case "models":
      cmdModels();
      break;
    case "providers":
      cmdProviders();
      break;
    case "token":
      cmdToken();
      break;
    case "doctor":
      cmdDoctor();
      break;
    case "stop":
      cmdStop();
      break;
    default:
      throw new Error(tr("未知命令 {0}。freeall --help", opts.command));
  }
}

export function isDirectCli(argv1 = process.argv[1], moduleUrl = import.meta.url): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return moduleUrl === pathToFileURL(argv1).href;
  }
}

if (isDirectCli()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
