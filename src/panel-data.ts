import { tr } from "./i18n.js";
import { describeUpstreamError } from "./client.js";
import { accountBaseUrl, accountModelChoices, listProviders, resolveAccountModel, resolveProvider } from "./catalog.js";
import { answerFromOutcome } from "./format.js";
import {
  effectiveFreeModels,
  ensureProviderFreeModels,
  getFreeEntry,
  mergeProbeModels,
  patchFreeEntry,
  setProviderFreeModels,
} from "./free-models.js";
import { accountIsFree, normalizePolicy, policyOf } from "./policy.js";
import {
  remainingHint,
  activeCooldown,
  startOfLocalDay,
  usageWindow,
  accountLimits,
  catalogLimits,
  isOpenRouterCreditsBoost,
  patchAccountLimits,
} from "./quota.js";
import { groupLogs, hourBuckets, summarizeLogs, usageFromJson } from "./logs.js";
import { installCommands, installHint, type InstallAgent } from "./agents.js";
import { recipeBody, recipeHint, useCommand, type RecipeKind } from "./recipes.js";
import { accountPriority, normalizePriority, routeChat, verifyAccount } from "./router.js";
import { assertLocalOwner } from "./local-auth.js";
import { exportSync, importMerge, importReplace, parseExport } from "./sync.js";
import { readFreeAllMeta } from "./app-meta.js";
import { assertAccountName, clipNote, newGatewayToken, type Store } from "./store.js";
import { maskSecret } from "./crypto.js";
import type { GenerationLog, ProviderId, RoutePolicy } from "./types.js";

export interface PanelAccount {
  id: string;
  ref: string;
  provider: string;
  name: string;
  status: string;
  enabled: boolean;
  free: boolean;
  remaining: string;
  todayRequests: number;
  todayTokens: number;
  cooldownSec: number | null;
  lastError?: string;
  defaultModel: string;
  models: string[];
  preferredModel: string;
  baseUrl?: string;
  priority: number;
  createdAt: number;
  lastUsedAt?: number;
  verifiedAt?: number;
  note?: string;
  limits: { rpm: number | null; rpd: number | null };
  catalogLimits: { rpm: number | null; rpd: number | null };
  boosted: boolean;
  /** 脱敏后的 Key 提示，不含明文 */
  keyHint: string;
}

export interface PanelState {
  available: number;
  total: number;
  app: {
    version: string;
    downloadPage?: string;
  };
  gateway: {
    url: string;
    openaiBase: string;
    token: string;
    model: string;
    host: string;
    port: number;
  };
  usage: {
    from: "logs" | "usage";
    today: {
      requests: number;
      tokens: number;
      ok: number;
      fail: number;
      promptTokens: number;
      completionTokens: number;
      avgMs: number;
      tokPerSec: number | null;
    };
    hour: { requests: number; tokens: number; ok: number; fail: number };
    byProvider: Array<{ provider: string; requests: number; tokens: number; ok: number; fail: number }>;
    byModel: Array<{ model: string; requests: number; tokens: number; ok: number; fail: number }>;
    buckets: Array<{ t: number; n: number; ok: number }>;
  };
  logs: GenerationLog[];
  accounts: PanelAccount[];
  providers: Array<{
    id: string;
    label: string;
    signup: string;
    keyHint: string;
    defaultModel: string;
    monthlyHint: string;
    baseUrl: string;
    recommended?: boolean;
  }>;
  recipes: {
    use: {
      freeall: string | null;
      curl: string | null;
      openai: string | null;
      anthropic: string | null;
      claude: string | null;
      codex: string | null;
      opencode: string | null;
    };
    install: { claude: string; codex: string; opencode: string };
    hint: {
      openai?: string;
      anthropic?: string;
      claude: string;
      codex: string;
      opencode: string;
    };
    freeall: string;
    curl: string;
    openai: string;
    anthropic: string;
    claude: string;
    codex: string;
    opencode: string;
    generic: string;
  };
  policy: RoutePolicy;
  policyModels: string[];
  providerFreeModels: Record<
    string,
    { models: string[]; manual: string[]; excluded: string[]; effective: string[]; updatedAt?: number; source?: string }
  >;
}

function displayError(provider: string, lastError?: string): string | undefined {
  if (!lastError) return undefined;
  if (lastError.includes("{") && lastError.includes("Forbidden")) {
    return describeUpstreamError(provider, 403, lastError);
  }
  if (lastError.includes("{") && /invalid|unauthorized|401/i.test(lastError)) {
    return describeUpstreamError(provider, 401, lastError);
  }
  if (/location is not supported/i.test(lastError)) {
    return describeUpstreamError(provider, 400, lastError);
  }
  if (/insufficient|balance|402/.test(lastError)) {
    return describeUpstreamError(provider, 402, lastError);
  }
  return lastError;
}

function recipePack(g: { url: string; openaiBase: string; token: string; model: string }) {
  const kinds = ["freeall", "curl", "openai", "anthropic", "claude", "codex", "opencode"] as const;
  const agents = ["claude", "codex", "opencode"] as const satisfies readonly InstallAgent[];
  const use = Object.fromEntries(kinds.map((k) => [k, useCommand(k)])) as Record<RecipeKind, string | null>;
  const bodies = Object.fromEntries(kinds.map((k) => [k, recipeBody(k, g)])) as Record<RecipeKind, string>;
  const install = Object.fromEntries(agents.map((k) => [k, installCommands(k)])) as Record<InstallAgent, string>;
  const hint: PanelState["recipes"]["hint"] = {
    ...Object.fromEntries(agents.map((k) => [k, installHint(k)])) as Record<InstallAgent, string>,
    openai: recipeHint("openai") ?? undefined,
    anthropic: recipeHint("anthropic") ?? undefined,
  };
  return { use, install, hint, ...bodies, generic: bodies.curl };
}

function uniqueName(store: Store, provider: string): string {
  const used = new Set(store.data.accounts.filter((a) => a.provider === provider).map((a) => a.name));
  if (!used.has("main")) return "main";
  let i = 2;
  while (used.has(`alt${i}`)) i += 1;
  return `alt${i}`;
}

export function panelState(store: Store, now = Date.now()): PanelState {
  store.prune(now);
  const dayStart = startOfLocalDay(now);
  const hourStart = now - 60 * 60 * 1000;
  const accounts: PanelAccount[] = store.data.accounts.map((account) => {
    const cd = activeCooldown(store.data.cooldowns, account.id, now);
    const spec = resolveProvider(account.provider);
    const dead = account.status === "invalid" || account.status === "error";
    const today = usageWindow(store.data.usage, dayStart, account.id);
    const limits = accountLimits(account);
    const catalog = catalogLimits(account);
    return {
      id: account.id,
      ref: `${account.provider}/${account.name}`,
      provider: account.provider,
      name: account.name,
      status: cd ? "cooldown" : account.status,
      enabled: account.enabled,
      free: accountIsFree(account),
      remaining: dead ? tr("先修好") : remainingHint(account, store.data.usage, now).label,
      todayRequests: today.requests,
      todayTokens: today.tokens,
      cooldownSec: cd ? Math.max(1, Math.ceil((cd.until - now) / 1000)) : null,
      lastError: displayError(account.provider, account.lastError),
      defaultModel: spec.defaultModel,
      models: dead ? [] : accountModelChoices(account, false),
      preferredModel: dead ? "" : resolveAccountModel(account),
      baseUrl: accountBaseUrl(account) || undefined,
      priority: accountPriority(account),
      createdAt: account.createdAt,
      lastUsedAt: account.lastUsedAt,
      verifiedAt: account.verifiedAt,
      note: account.note,
      limits: { rpm: limits.rpm, rpd: limits.rpd },
      catalogLimits: { rpm: catalog.rpm, rpd: catalog.rpd },
      boosted: isOpenRouterCreditsBoost(account),
      keyHint: maskSecret(store.secret(account)),
    };
  });
  const available = accounts.filter((a) => a.enabled && a.status !== "invalid" && a.status !== "error" && a.status !== "cooldown").length;
  const host = store.data.settings.host;
  const port = store.data.settings.port;
  const url = `http://${host}:${port}`;
  const policy = policyOf(store);
  const scoped = policy.providers.length
    ? accounts.filter((a) => policy.providers.includes(a.provider as ProviderId))
    : accounts;
  ensureProviderFreeModels(store.data.settings);
  const freeMap = store.data.settings.providerFreeModels ?? {};
  const providerFreeModels = Object.fromEntries(
    Object.entries(freeMap).map(([id, entry]) => {
      const normalized = getFreeEntry(store.data.settings, id);
      return [
        id,
        {
          models: normalized.models,
          manual: normalized.manual,
          excluded: normalized.excluded,
          effective: effectiveFreeModels(normalized, id as ProviderId),
          ...(normalized.updatedAt ? { updatedAt: normalized.updatedAt } : {}),
          ...(normalized.source ? { source: normalized.source } : {}),
        },
      ];
    }),
  );
  const policyModels = ["auto", "free-auto", ...new Set(scoped.flatMap((a) => a.models))];
  const logs = [...(store.data.logs ?? [])].sort((a, b) => b.at - a.at);
  const dayLogs = logs.filter((l) => l.at >= dayStart);
  const hourLogs = logs.filter((l) => l.at >= hourStart);
  const fromLogs = logs.length > 0;
  const todaySum = fromLogs ? summarizeLogs(dayLogs) : {
    ...summarizeLogs([]),
    requests: usageWindow(store.data.usage, dayStart).requests,
    tokens: usageWindow(store.data.usage, dayStart).tokens,
  };
  const hourSum = fromLogs ? summarizeLogs(hourLogs) : {
    ...summarizeLogs([]),
    requests: usageWindow(store.data.usage, hourStart).requests,
    tokens: usageWindow(store.data.usage, hourStart).tokens,
  };
  const byProvider = fromLogs
    ? groupLogs(dayLogs, (l) => l.provider).map((row) => ({
        provider: row.key,
        requests: row.requests,
        tokens: row.tokens,
        ok: row.ok,
        fail: row.fail,
      }))
    : accounts
        .reduce<Array<{ provider: string; requests: number; tokens: number; ok: number; fail: number }>>((rows, account) => {
          const row = rows.find((r) => r.provider === account.provider);
          if (row) {
            row.requests += account.todayRequests;
            row.tokens += account.todayTokens;
          } else if (account.todayRequests || account.todayTokens) {
            rows.push({ provider: account.provider, requests: account.todayRequests, tokens: account.todayTokens, ok: 0, fail: 0 });
          }
          return rows;
        }, []);
  const byModel = groupLogs(dayLogs, (l) => l.model).map((row) => ({
    model: row.key,
    requests: row.requests,
    tokens: row.tokens,
    ok: row.ok,
    fail: row.fail,
  }));
  const meta = readFreeAllMeta();
  return {
    available,
    total: accounts.length,
    app: {
      version: meta.version,
      downloadPage: meta.downloadPage,
    },
    gateway: {
      url,
      openaiBase: `${url}/v1`,
      token: store.data.settings.gatewayToken,
      model: policy.model || "auto",
      host,
      port,
    },
    usage: {
      from: fromLogs ? "logs" : "usage",
      today: todaySum,
      hour: hourSum,
      byProvider,
      byModel,
      buckets: hourBuckets(logs, now - 24 * 60 * 60 * 1000, now),
    },
    logs: logs.slice(0, 400),
    accounts,
    providers: [
      ...listProviders().map((p) => ({
        id: p.id,
        label: p.label,
        signup: p.signup,
        keyHint: p.keyHint,
        defaultModel: p.defaultModel,
        monthlyHint: p.limits.monthlyHint,
        baseUrl: p.baseUrl,
        recommended: p.id === "zhipu" || p.id === "openrouter",
      })),
      {
        id: "custom",
        label: "Custom OpenAI-compatible",
        signup: "",
        keyHint: "sk-…",
        defaultModel: "gpt-4o-mini",
        monthlyHint: "unknown",
        baseUrl: "",
      },
    ],
    recipes: recipePack({
      url,
      openaiBase: `${url}/v1`,
      token: store.data.settings.gatewayToken,
      model: policy.model || "auto",
    }),
    policy,
    policyModels,
    providerFreeModels,
  };
}


function normalizeModelList(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.flatMap((item) => String(item).split(/[\n,]+/))
    : String(raw ?? "").split(/[\n,]+/);
  const out: string[] = [];
  for (const part of parts) {
    const id = part.trim();
    if (!id || id === "auto" || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function mergePreferredIntoModels(account: { models?: string[]; preferredModel?: string }, preferred?: string): void {
  const model = (preferred ?? account.preferredModel ?? "").trim();
  if (!model) return;
  const list = [...(account.models ?? [])];
  if (!list.includes(model)) list.push(model);
  account.models = list;
}

export async function panelAdd(
  store: Store,
  input: {
    provider: string;
    apiKey: string;
    name?: string;
    baseUrl?: string;
    note?: string;
    preferredModel?: string;
    models?: string[];
    skipVerify?: boolean;
    free?: boolean;
    boost?: boolean;
    rpm?: unknown;
    rpd?: unknown;
  },
  fetchFn: typeof fetch = fetch,
): Promise<{ account: PanelAccount; warning?: string }> {
  const spec = resolveProvider(input.provider);
  const name = (input.name ?? "").trim() || uniqueName(store, spec.id);
  if (spec.id === "custom" && !input.baseUrl) {
    throw new Error(tr("custom 必须填写 Base URL，例如 http://127.0.0.1:11434/v1"));
  }
  const key = input.apiKey.trim();
  if (!key) throw new Error(tr("API key 不能为空"));
  const typedUrl = input.baseUrl?.trim().replace(/\/+$/, "") || undefined;
  const catalogUrl = spec.baseUrl.replace(/\/+$/, "");
  const created = store.addAccount({
    name,
    provider: spec.id as ProviderId,
    apiKey: key,
    baseUrl: typedUrl && typedUrl !== catalogUrl ? typedUrl : undefined,
    note: input.note,
    free: input.free !== false,
  });
  const seededModels = normalizeModelList(input.models);
  const preferred = (input.preferredModel ?? "").trim();
  if (preferred) {
    created.preferredModel = preferred;
    if (!seededModels.includes(preferred)) seededModels.push(preferred);
  }
  if (seededModels.length) created.models = seededModels;
  if (preferred || seededModels.length) store.save();
  if (input.boost || input.rpm !== undefined || input.rpd !== undefined) {
    patchAccountLimits(created, { boost: input.boost, rpm: input.rpm, rpd: input.rpd });
    store.save();
  }
  let warning: string | undefined;
  if (!input.skipVerify) {
    const result = await verifyAccount(store, created, fetchFn);
    if (!result.ok) warning = tr("已入账，但验证失败：{0}", result.error);
  }
  const state = panelState(store);
  const account = state.accounts.find((a) => a.id === created.id);
  if (!account) throw new Error(tr("入账后读不到账号"));
  return { account, warning };
}

export function panelRemove(store: Store, ref: string): { ref: string } {
  const removed = store.removeAccount(ref);
  return { ref: `${removed.provider}/${removed.name}` };
}

export function panelUpdate(
  store: Store,
  ref: string,
  patch: {
    note?: string;
    enabled?: boolean;
    preferredModel?: string;
    models?: string[] | string;
    free?: boolean;
    baseUrl?: string;
    name?: string;
    priority?: unknown;
    boost?: unknown;
    rpm?: unknown;
    rpd?: unknown;
    apiKey?: string;
  },
): PanelAccount {
  const account = store.find(ref);
  if (!account) throw new Error(tr("找不到账号 '{0}'", ref));
  if (patch.name !== undefined) {
    const name = assertAccountName(patch.name);
    if (name !== account.name) {
      const clash = store.data.accounts.some(
        (a) => a.id !== account.id && a.provider === account.provider && a.name === name,
      );
      if (clash) throw new Error(tr("已存在 {0}/{1}", account.provider, name));
      account.name = name;
    }
  }
  if (patch.note !== undefined) account.note = clipNote(patch.note);
  if (patch.enabled !== undefined) account.enabled = patch.enabled;
  if (patch.free !== undefined) account.free = patch.free;
  if (patch.apiKey !== undefined) {
    const key = String(patch.apiKey).trim();
    if (!key) throw new Error(tr("API Key 不能为空"));
    account.key = store.seal(key);
    account.status = "unknown";
    account.lastError = undefined;
  }
  if (patch.baseUrl !== undefined) {
    const next = patch.baseUrl.trim().replace(/\/+$/, "");
    if (account.provider === "custom" && !next) {
      throw new Error(tr("custom 必须填写 Base URL，例如 http://127.0.0.1:11434/v1"));
    }
    account.baseUrl = next || undefined;
  }
  if (patch.models !== undefined) {
    const list = normalizeModelList(patch.models);
    account.models = list.length ? list : undefined;
  }
  if (patch.preferredModel !== undefined) {
    const model = patch.preferredModel.trim();
    if (!model) throw new Error(tr("模型名不能为空"));
    account.preferredModel = model;
    mergePreferredIntoModels(account, model);
  } else if (patch.models !== undefined && account.preferredModel) {
    mergePreferredIntoModels(account, account.preferredModel);
  }
  if (patch.priority !== undefined) {
    account.priority = normalizePriority(patch.priority);
  }
  if (patch.boost !== undefined || patch.rpm !== undefined || patch.rpd !== undefined) {
    patchAccountLimits(account, { boost: patch.boost, rpm: patch.rpm, rpd: patch.rpd });
  }
  store.save();
  const row = panelState(store).accounts.find((a) => a.id === account.id);
  if (!row) throw new Error(tr("更新后读不到账号"));
  return row;
}

/** 查看明文 Key：需本机解锁（指纹 / 密码）。 */
export async function panelRevealKey(store: Store, ref: string): Promise<{ apiKey: string; hint: string }> {
  const account = store.find(ref);
  if (!account) throw new Error(tr("找不到账号 '{0}'", ref));
  await assertLocalOwner(tr("FreeAll 要显示账号 API Key"));
  const apiKey = store.secret(account);
  return { apiKey, hint: maskSecret(apiKey) };
}

export function panelUpdatePolicy(store: Store, patch: { providers?: string[]; model?: string; freeOnly?: boolean; account?: string | null; excludeModels?: string[] | null }): RoutePolicy {
  const next = normalizePolicy({
    providers: patch.providers ?? store.data.settings.policy?.providers,
    model: patch.model ?? store.data.settings.policy?.model,
    freeOnly: patch.freeOnly ?? store.data.settings.policy?.freeOnly,
    account: patch.account === undefined ? store.data.settings.policy?.account : patch.account,
    excludeModels: patch.excludeModels === undefined ? store.data.settings.policy?.excludeModels : patch.excludeModels,
  });
  store.data.settings.policy = next;
  store.data.settings.defaultModel = next.model;
  store.save();
  return next;
}


export function panelUpdateFreeModels(
  store: Store,
  provider: string,
  patch: { manual?: string[] | string; excluded?: string[] | string; models?: string[] | string },
): PanelState["providerFreeModels"][string] {
  const id = String(provider || "").trim();
  if (!id) throw new Error(tr("缺少供应商"));
  try {
    resolveProvider(id);
  } catch {
    throw new Error(tr("未知供应商 '{0}'", id));
  }
  ensureProviderFreeModels(store.data.settings);
  const entry = getFreeEntry(store.data.settings, id);
  const list = (raw: unknown): string[] | undefined => {
    if (raw === undefined) return undefined;
    if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
    return String(raw)
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  };
  const next = patchFreeEntry(entry, {
    ...(list(patch.manual) ? { manual: list(patch.manual)! } : {}),
    ...(list(patch.excluded) ? { excluded: list(patch.excluded)! } : {}),
    ...(list(patch.models) ? { models: list(patch.models)! } : {}),
  });
  setProviderFreeModels(store.data.settings, id, next);
  store.save();
  return {
    models: next.models,
    manual: next.manual,
    excluded: next.excluded,
    effective: effectiveFreeModels(next, id as ProviderId),
    ...(next.updatedAt ? { updatedAt: next.updatedAt } : {}),
    ...(next.source ? { source: next.source } : {}),
  };
}

export function panelRefreshFreeModels(store: Store, provider: string): PanelState["providerFreeModels"][string] {
  const id = String(provider || "").trim();
  if (!id) throw new Error(tr("缺少供应商"));
  try {
    resolveProvider(id);
  } catch {
    throw new Error(tr("未知供应商 '{0}'", id));
  }
  ensureProviderFreeModels(store.data.settings);
  const entry = getFreeEntry(store.data.settings, id);
  const probed = store.data.accounts
    .filter((a) => a.provider === id)
    .flatMap((a) => [...(a.models ?? []), ...(a.preferredModel ? [a.preferredModel] : [])]);
  const next = mergeProbeModels(entry, id as ProviderId, probed);
  setProviderFreeModels(store.data.settings, id, next);
  store.save();
  return {
    models: next.models,
    manual: next.manual,
    excluded: next.excluded,
    effective: effectiveFreeModels(next, id as ProviderId),
    ...(next.updatedAt ? { updatedAt: next.updatedAt } : {}),
    ...(next.source ? { source: next.source } : {}),
  };
}

export async function panelRefreshModels(
  store: Store,
  ref: string,
  fetchFn: typeof fetch = fetch,
): Promise<PanelAccount> {
  const account = store.find(ref);
  if (!account) throw new Error(tr("找不到账号 '{0}'", ref));
  const result = await verifyAccount(store, account, fetchFn);
  if (!result.ok) throw new Error(result.error ?? tr("刷新模型失败"));
  const row = panelState(store).accounts.find((a) => a.id === account.id);
  if (!row) throw new Error(tr("刷新后读不到账号"));
  return row;
}

export async function panelAsk(
  store: Store,
  input: { prompt?: string; model?: string; provider?: string; account?: string },
  fetchFn: typeof fetch = fetch,
): Promise<{
  ok: boolean;
  text?: string;
  via?: string;
  model?: string;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  tokPerSec?: number | null;
  error?: string;
}> {
  const prompt = (input.prompt ?? "").trim();
  if (!prompt) throw new Error(tr("先写一句要问的话"));
  const started = Date.now();
  const outcome = await routeChat(
    store,
    {
      model: input.model?.trim() || store.data.settings.defaultModel || "auto",
      provider: input.provider?.trim() || undefined,
      account: input.account?.trim() || undefined,
      messages: [{ role: "user", content: prompt }],
    },
    fetchFn,
    Date.now(),
    "ask",
  );
  const ms = Date.now() - started;
  if (!outcome.ok || !outcome.result?.json) {
    return { ok: false, ms, error: outcome.exhaustion ?? tr("请求失败") };
  }
  const usage = usageFromJson(outcome.result.json);
  const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0;
  const promptTokens = hasUsage ? usage.promptTokens : undefined;
  const completionTokens = hasUsage ? usage.completionTokens : undefined;
  const tokPerSec =
    completionTokens && ms > 0 ? Math.round((completionTokens / (ms / 1000)) * 10) / 10 : null;
  return {
    ok: true,
    text: answerFromOutcome(outcome.result.json),
    via: outcome.account ? `${outcome.account.provider}/${outcome.account.name}` : undefined,
    model: outcome.model,
    ms,
    ...(promptTokens != null ? { promptTokens } : {}),
    ...(completionTokens != null ? { completionTokens } : {}),
    tokPerSec,
  };
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function panelUpdateGateway(
  store: Store,
  patch: { host?: string; port?: number | string; token?: string; rotate?: boolean },
): { restart?: string } {
  const settings = store.data.settings;
  if (patch.rotate) {
    settings.gatewayToken = newGatewayToken();
  } else if (typeof patch.token === "string" && patch.token.trim()) {
    const token = patch.token.trim();
    if (token.length < 12) throw new Error(tr("访问令牌至少 12 个字符"));
    settings.gatewayToken = token;
  }
  if (typeof patch.host === "string" && patch.host.trim()) {
    const host = patch.host.trim();
    if (!LOOPBACK.has(host)) throw new Error(tr("网关只许绑本机：127.0.0.1 或 localhost"));
    settings.host = host === "localhost" ? "127.0.0.1" : host;
  }
  let restart: string | undefined;
  if (patch.port !== undefined && patch.port !== "") {
    const port = Number(patch.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(tr("端口必须是 1–65535"));
    if (port !== settings.port) {
      settings.port = port;
      restart = tr("端口已记下。正在跑的还是旧端口，终端执行 freeall stop && freeall ui 才换听。");
    }
  }
  store.save();
  return { restart };
}

export async function panelExport(store: Store, keepToken = false): Promise<{ pack: string; filename: string; accounts: number }> {
  await assertLocalOwner(tr("FreeAll 要导出账号池"));
  const pack = exportSync(store, store.machineWrapPass(), keepToken);
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return { pack, filename: `freeall-${stamp}.json`, accounts: store.data.accounts.length };
}

export async function panelImport(
  store: Store,
  pack: string,
  replace = false,
): Promise<{ added: number; updated: number; replaced: boolean }> {
  await assertLocalOwner(tr("FreeAll 要导入账号池"));
  let payload;
  try {
    payload = parseExport(pack, store.machineWrapPass());
  } catch {
    throw new Error(tr("打不开。账号池导入只认本机导出的包。换电脑请用 freeall sync import --pass"));
  }
  if (replace) {
    const r = importReplace(store, payload);
    return { added: r.added, updated: 0, replaced: true };
  }
  const r = importMerge(store, payload);
  return { ...r, replaced: false };
}
