import { tr } from "./i18n.js";
import { candidateBaseUrls, modelSequence, persistWorkingBaseUrl, resolveAccountModel, resolveBaseUrl, resolveDefaultModel } from "./catalog.js";
import { pickPreferredModel } from "./catalog.js";
import { chatCompletions, chatCompletionsStream, describeUpstreamError, listModels } from "./client.js";
import { accountIsFree, accountMatchesPolicyModel, policyOf, providerOrder, resolveRequestRoute } from "./policy.js";
import {
  FREE_AUTO,
  buildFreeAutoAttempts,
  ensureProviderFreeModels,
  isFreeAutoRequest,
  isFreeModel,
  mergeProbeModels,
  getFreeEntry,
  setProviderFreeModels,
} from "./free-models.js";
import { makeLog, usageFromJson } from "./logs.js";
import { activeCooldown, cooldownFromStatus, estimateTokens, isProviderBusy429, remainingHint, wouldExceed } from "./quota.js";
import type { Store } from "./store.js";
import type { Account, ChatRequest, LogSource, RouteAttempt, RoutePolicy } from "./types.js";

export interface RouteOutcome {
  ok: boolean;
  account?: Account;
  model?: string;
  result?: Awaited<ReturnType<typeof chatCompletions>>;
  attempts: RouteAttempt[];
  exhaustion?: string;
}

export function candidates(
  store: Store,
  wantProvider?: string,
  now = Date.now(),
  wantModel?: string,
  policy: RoutePolicy = policyOf(store),
): Account[] {
  store.prune(now);
  const alive = store.data.accounts.filter((a) => a.enabled && a.status !== "invalid" && a.status !== "error");
  let filtered = alive;
  if (policy.account) {
    const pinned = store.find(policy.account);
    filtered = pinned ? alive.filter((a) => a.id === pinned.id) : [];
    if (wantProvider) filtered = filtered.filter((a) => a.provider === wantProvider);
  } else {
    if (wantProvider) filtered = alive.filter((a) => a.provider === wantProvider);
    else if (policy.providers.length) filtered = alive.filter((a) => policy.providers.includes(a.provider));
  }
  ensureProviderFreeModels(store.data.settings);
  const freeAuto = isFreeAutoRequest(wantModel, policy);
  // 免费号只认用户配置的 account.free；free-auto / freeOnly 只用免费号
  if (freeAuto || policy.freeOnly) {
    filtered = filtered.filter((a) => accountIsFree(a));
  }
  // 指定模型：硬过滤。没有声明支持的账号就不进池，避免整池盲试。
  if (wantModel && wantModel !== "auto" && wantModel !== FREE_AUTO && !freeAuto) {
    filtered = filtered.filter((a) => accountMatchesPolicyModel(a, wantModel));
    // 收费模型：排除用户标成免费档的号
    filtered = filtered.filter((a) => {
      if (isFreeModel(a.provider, wantModel, store.data.settings)) return true;
      return !accountIsFree(a);
    });
    // 指定模型时：供应商范围若把唯一声明号滤光，放开供应商限定（模型钉死优先）
    if (!filtered.length && !wantProvider && !policy.account && policy.providers.length) {
      let byModel = alive.filter((a) => accountMatchesPolicyModel(a, wantModel));
      if (freeAuto || policy.freeOnly) byModel = byModel.filter((a) => accountIsFree(a));
      byModel = byModel.filter((a) => {
        if (isFreeModel(a.provider, wantModel, store.data.settings)) return true;
        return !accountIsFree(a);
      });
      filtered = byModel;
    }
  }
  const order = providerOrder(policy, filtered);
  const rank = (id: string) => {
    const idx = order.indexOf(id as (typeof order)[number]);
    return idx < 0 ? 999 : idx;
  };
  return filtered
    .map((account) => {
      const cd = activeCooldown(store.data.cooldowns, account.id, now);
      const blocked = wouldExceed(account, store.data.usage, 64, now);
      const hint = remainingHint(account, store.data.usage, now);
      // 同级随机：每轮固定一次，避免 Array.sort 比较器不稳
      return { account, cd, blocked, hint, tie: Math.random() };
    })
    .filter((row) => !row.cd && !row.blocked)
    .sort((a, b) => {
      const pa = accountPriority(a.account);
      const pb = accountPriority(b.account);
      if (pb !== pa) return pb - pa;
      const byProv = rank(a.account.provider) - rank(b.account.provider);
      if (byProv) return byProv;
      const byHint = b.hint.score - a.hint.score;
      if (byHint) return byHint;
      return a.tie - b.tie;
    })
    .map((row) => row.account);
}

/** 未设 priority 视为 0；非法值钳到 -99..99。 */
export function accountPriority(account: { priority?: number }): number {
  const n = account.priority;
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(-99, Math.min(99, Math.trunc(n)));
}

export function normalizePriority(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) throw new Error(tr("优先级必须是数字"));
  return Math.max(-99, Math.min(99, Math.trunc(n)));
}

export function blockedReasons(store: Store, now = Date.now()): string[] {
  store.prune(now);
  if (store.data.accounts.length === 0) {
    return [tr("池是空的。先 freeall add <provider> <key>")];
  }
  return store.data.accounts.map((account) => {
    if (!account.enabled) return tr("{0}/{1} 已禁用", account.provider, account.name);
    if (account.status === "invalid" || account.status === "error") {
      return tr("{0}/{1} 不可用：{2}", account.provider, account.name, account.lastError ?? account.status);
    }
    const cd = activeCooldown(store.data.cooldowns, account.id, now);
    if (cd) {
      const wait = Math.max(1, Math.ceil((cd.until - now) / 1000));
      return tr("{0}/{1} 冷却 {2}s（{3}）", account.provider, account.name, wait, cd.reason);
    }
    const blocked = wouldExceed(account, store.data.usage, 64, now);
    if (blocked) return `${account.provider}/${account.name} ${blocked}`;
    return tr("{0}/{1} 可用", account.provider, account.name);
  });
}

export async function verifyAccount(
  store: Store,
  account: Account,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string; models: string[] }> {
  const secret = store.secret(account);
  const hosts = candidateBaseUrls(account.provider, account.baseUrl);
  let lastProbe: Awaited<ReturnType<typeof listModels>> | undefined;
  let lastPing: Awaited<ReturnType<typeof chatCompletions>> | undefined;

  for (const base of hosts) {
    const trial = { ...account, baseUrl: base };
    const probe = await listModels(trial, secret, fetchFn);
    lastProbe = probe;
    if (probe.ok) {
      persistWorkingBaseUrl(account, base);
      account.status = "healthy";
      account.verifiedAt = Date.now();
      account.lastError = undefined;
      account.models = probe.models;
      ensureProviderFreeModels(store.data.settings);
      setProviderFreeModels(
        store.data.settings,
        account.provider,
        mergeProbeModels(getFreeEntry(store.data.settings, account.provider), account.provider, probe.models),
      );
      if (!account.preferredModel || !probe.models.includes(account.preferredModel)) {
        account.preferredModel = pickPreferredModel(account, probe.models);
      }
      store.clearCooldown(account.id);
      store.save();
      return { ok: true, models: probe.models };
    }

    const fallbackModel = resolveDefaultModel(account.provider);
    const ping = await chatCompletions(
      trial,
      secret,
      { model: fallbackModel, messages: [{ role: "user", content: "ping" }], max_tokens: 1 },
      fetchFn,
    ).catch(() => undefined);
    lastPing = ping;
    if (ping && ping.status >= 200 && ping.status < 300) {
      persistWorkingBaseUrl(account, base);
      account.status = "healthy";
      account.verifiedAt = Date.now();
      account.lastError = tr("模型列表失败，对话可用，先用目录模型");
      account.models = account.models?.length ? account.models : undefined;
      if (!account.preferredModel) account.preferredModel = fallbackModel;
      store.clearCooldown(account.id);
      store.save();
      return { ok: true, models: account.models ?? [fallbackModel] };
    }
  }

  const probe = lastProbe ?? { ok: false, status: 0, models: [], error: tr("验证失败") };
  const ping = lastPing;
  if (probe.status === 401 || probe.status === 403 || ping?.status === 401 || ping?.status === 403) {
    account.status = "invalid";
  } else {
    account.status = "error";
  }
  account.lastError = ping
    ? describeUpstreamError(account.provider, ping.status, ping.body)
    : (probe.error ?? `HTTP ${probe.status}`);
  store.save();
  return { ok: false, error: account.lastError, models: [] };
}


function planRouteSteps(
  store: Store,
  pool: Account[],
  wantModel: string,
  policy: RoutePolicy,
): Array<{ account: Account; model: string; kind: "pin" | "auto" }> {
  if (isFreeAutoRequest(wantModel, policy)) {
    return buildFreeAutoAttempts(store, policy, pool).map((step) => ({
      account: step.account,
      model: step.model,
      kind: "auto" as const,
    }));
  }
  const steps: Array<{ account: Account; model: string; kind: "pin" | "auto" }> = [];
  for (const account of pool) {
    const seq = modelSequence(account, wantModel, {
      freeOnly: policy.freeOnly || wantModel === FREE_AUTO,
      exclude: policy.excludeModels,
    });
    for (const step of seq) steps.push({ account, model: step.model, kind: step.kind });
  }
  return steps;
}

export async function routeChat(
  store: Store,
  request: ChatRequest,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
  source: LogSource = "openai",
): Promise<RouteOutcome> {
  const routed = resolveRequestRoute(store, request);
  const pool = candidates(store, routed.wantProvider, now, routed.model, routed.policy);
  const attempts: RouteAttempt[] = [];

  if (pool.length === 0) {
    return { ok: false, attempts, exhaustion: emptyPoolMessage(store, now, routed.policy, routed.model) };
  }

  const routeSteps = planRouteSteps(store, pool, routed.model, routed.policy);
  if (routeSteps.length === 0) {
    return { ok: false, attempts, exhaustion: excludedAutoMessage(routed.policy) ?? emptyPoolMessage(store, now, routed.policy, routed.model) };
  }

  accountLoop: for (const planned of routeSteps) {
    const account = planned.account;
    const seq = [{ model: planned.model, kind: planned.kind }];
    for (const step of seq) {
      const model = step.model;
      const started = Date.now();
      try {
        const result = await chatWithHostFallback(account, store.secret(account), { ...request, model }, fetchFn);
        const ms = Date.now() - started;
        if (result.status >= 200 && result.status < 300) {
          account.status = "healthy";
          account.lastUsedAt = Date.now();
          account.lastError = undefined;
          store.clearCooldown(account.id);
          store.recordUsage({ accountId: account.id, kind: "request", tokens: 0, at: Date.now() });
          const usage = usageFromJson(result.json);
          const prompt = usage.totalTokens > 0 ? usage.promptTokens : estimatePrompt(request);
          const total = usage.totalTokens > 0 ? usage.totalTokens : prompt;
          store.recordUsage({ accountId: account.id, kind: "tokens", tokens: total, at: Date.now() });
          attempts.push({ accountId: account.id, provider: account.provider, name: account.name, model, ok: true, status: result.status, ms });
          store.recordLog(makeLog({
            account,
            model,
            ok: true,
            status: result.status,
            ms,
            promptTokens: prompt,
            completionTokens: usage.completionTokens,
            totalTokens: total,
            finishReason: usage.finishReason,
            source,
            hops: attempts.length,
          }));
          store.save();
          return { ok: true, account, model, result, attempts };
        }

        const reason = extractError(result);
        attempts.push({
          accountId: account.id,
          provider: account.provider,
          name: account.name,
          model,
          ok: false,
          status: result.status,
          ms,
          error: reason,
        });
        if (result.status === 429 && step.kind === "pin") continue;
        applyFailure(store, account, result.status, reason);
        if (isProviderBusy429(result.status, reason)) break accountLoop;
      } catch (error) {
        const ms = Date.now() - started;
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({
          accountId: account.id,
          provider: account.provider,
          name: account.name,
          model,
          ok: false,
          ms,
          error: message,
        });
        applyFailure(store, account, 0, message);
      }
    }
  }
  const last = attempts.at(-1);
  if (last && !last.ok) {
    const acc = store.data.accounts.find((a) => a.id === last.accountId);
    if (acc) {
      store.recordLog(makeLog({
        account: acc,
        model: last.model,
        ok: false,
        status: last.status,
        ms: last.ms,
        promptTokens: estimatePrompt(request),
        completionTokens: 0,
        totalTokens: 0,
        source,
        error: last.error,
        hops: attempts.length,
      }));
    }
  }

  store.save();
  return {
    ok: false,
    attempts,
    exhaustion: attempts.length ? formatExhaustion(store, attempts, now) : (excludedAutoMessage(routed.policy) ?? emptyPoolMessage(store, now, routed.policy, routed.model)),
  };
}

export interface StreamOutcome {
  ok: boolean;
  account?: Account;
  model?: string;
  response?: Response;
  attempts: RouteAttempt[];
  exhaustion?: string;
}

export async function routeStream(
  store: Store,
  request: ChatRequest,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
  source: LogSource = "stream",
): Promise<StreamOutcome> {
  const routed = resolveRequestRoute(store, request);
  const pool = candidates(store, routed.wantProvider, now, routed.model, routed.policy);
  const attempts: RouteAttempt[] = [];
  if (pool.length === 0) {
    return { ok: false, attempts, exhaustion: emptyPoolMessage(store, now, routed.policy, routed.model) };
  }

  const routeSteps = planRouteSteps(store, pool, routed.model, routed.policy);
  if (routeSteps.length === 0) {
    return { ok: false, attempts, exhaustion: excludedAutoMessage(routed.policy) ?? emptyPoolMessage(store, now, routed.policy, routed.model) };
  }

  accountLoop: for (const planned of routeSteps) {
    const account = planned.account;
    const seq = [{ model: planned.model, kind: planned.kind }];
    for (const step of seq) {
      const model = step.model;
      const started = Date.now();
      try {
        const response = await streamWithHostFallback(account, store.secret(account), { ...request, model }, fetchFn);
        const ms = Date.now() - started;
        if (response.ok) {
          account.status = "healthy";
          account.lastUsedAt = Date.now();
          account.lastError = undefined;
          store.clearCooldown(account.id);
          const prompt = estimatePrompt(request);
          store.recordUsage({ accountId: account.id, kind: "request", tokens: 0, at: Date.now() });
          store.recordUsage({ accountId: account.id, kind: "tokens", tokens: prompt, at: Date.now() });
          attempts.push({ accountId: account.id, provider: account.provider, name: account.name, model, ok: true, status: response.status, ms });
          store.recordLog(makeLog({
            account,
            model,
            ok: true,
            status: response.status,
            ms,
            promptTokens: prompt,
            completionTokens: 0,
            totalTokens: prompt,
            source,
            hops: attempts.length,
          }));
          store.save();
          return { ok: true, account, model, response, attempts };
        }
        const body = await response.text();
        const reason = extractError({ body, json: tryJson(body) });
        attempts.push({ accountId: account.id, provider: account.provider, name: account.name, model, ok: false, status: response.status, ms, error: reason });
        if (response.status === 429 && step.kind === "pin") continue;
        applyFailure(store, account, response.status, reason);
        if (isProviderBusy429(response.status, reason)) break accountLoop;
      } catch (error) {
        const ms = Date.now() - started;
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({ accountId: account.id, provider: account.provider, name: account.name, model, ok: false, ms, error: message });
        applyFailure(store, account, 0, message);
      }
    }
  }
  const last = attempts.at(-1);
  if (last && !last.ok) {
    const acc = store.data.accounts.find((a) => a.id === last.accountId);
    if (acc) {
      store.recordLog(makeLog({
        account: acc,
        model: last.model,
        ok: false,
        status: last.status,
        ms: last.ms,
        promptTokens: estimatePrompt(request),
        completionTokens: 0,
        totalTokens: 0,
        source,
        error: last.error,
        hops: attempts.length,
      }));
    }
  }
  store.save();
  return {
    ok: false,
    attempts,
    exhaustion: attempts.length ? formatExhaustion(store, attempts, now) : (excludedAutoMessage(routed.policy) ?? emptyPoolMessage(store, now, routed.policy, routed.model)),
  };
}

function tryJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

async function chatWithHostFallback(
  account: Account,
  apiKey: string,
  request: ChatRequest,
  fetchFn: typeof fetch,
): Promise<Awaited<ReturnType<typeof chatCompletions>>> {
  const first = await chatCompletions(account, apiKey, request, fetchFn);
  if (first.status >= 200 && first.status < 300) return first;
  if (account.provider !== "siliconflow" || (first.status !== 401 && first.status !== 403)) return first;
  const current = resolveBaseUrl(account.provider, account.baseUrl);
  for (const base of candidateBaseUrls(account.provider, account.baseUrl)) {
    if (base === current) continue;
    const alt = await chatCompletions({ ...account, baseUrl: base }, apiKey, request, fetchFn);
    if (alt.status >= 200 && alt.status < 300) {
      persistWorkingBaseUrl(account, base);
      return alt;
    }
  }
  return first;
}

async function streamWithHostFallback(
  account: Account,
  apiKey: string,
  request: ChatRequest,
  fetchFn: typeof fetch,
): Promise<Response> {
  const first = await chatCompletionsStream(account, apiKey, request, fetchFn);
  if (first.ok || account.provider !== "siliconflow" || (first.status !== 401 && first.status !== 403)) {
    return first;
  }
  const current = resolveBaseUrl(account.provider, account.baseUrl);
  for (const base of candidateBaseUrls(account.provider, account.baseUrl)) {
    if (base === current) continue;
    const alt = await chatCompletionsStream({ ...account, baseUrl: base }, apiKey, request, fetchFn);
    if (alt.ok) {
      persistWorkingBaseUrl(account, base);
      return alt;
    }
  }
  return first;
}

function applyFailure(store: Store, account: Account, status: number, reason: string): void {
  account.lastError = reason;
  if (status === 401 || status === 403) {
    account.status = "invalid";
    return;
  }
  if (status === 402) {
    account.status = "error";
    return;
  }
  if (status === 429 || status >= 500 || status === 0) {
    const until = isProviderBusy429(status, reason) ? Date.now() + 15_000 : cooldownFromStatus(status);
    store.setCooldown({
      accountId: account.id,
      until,
      reason: `${status || "net"} ${reason}`.trim(),
    });
  } else {
    account.status = "error";
  }
}

function excludedAutoMessage(policy?: RoutePolicy): string | undefined {
  if (!policy?.excludeModels?.length) return undefined;
  return tr("自动模式下可用模型都被排除了。请在排除列表中移除，或改为指定模型。");
}

function emptyPoolMessage(store: Store, now: number, policy?: RoutePolicy, wantModel?: string): string {
  if (policy?.account && !store.find(policy.account)) {
    return tr("路由规则固定了账号 {0}，但账号池里没有。请在面板修改固定账号，或请求带 X-FreeAll-Account / ?account=。", policy.account);
  }
  if (wantModel && (wantModel === FREE_AUTO || isFreeAutoRequest(wantModel, policy))) {
    const freeAcc = store.data.accounts.filter((a) => a.enabled && accountIsFree(a) && a.status !== "invalid" && a.status !== "error");
    if (!freeAcc.length) {
      return tr("free-auto 需要至少一把用户标成「免费档」的账号。请在账号池编辑里勾选免费档。");
    }
    return tr("free-auto 没有可打的免费模型。请在供应商免费模型表里手填或刷新，并确认免费号已声明这些模型。");
  }
  if (wantModel && wantModel !== "auto" && wantModel !== FREE_AUTO) {
    const alive = store.data.accounts.filter((a) => a.enabled && a.status !== "invalid" && a.status !== "error");
    const matched = alive.filter((a) => accountMatchesPolicyModel(a, wantModel));
    if (!matched.length) {
      return tr("没有账号声明支持模型 {0}。请在账号池编辑里写入可用模型/首选模型，或改用 auto / free-auto。", wantModel);
    }
    if (policy?.providers?.length) {
      const inScope = matched.filter((a) => policy.providers.includes(a.provider));
      if (!inScope.length) {
        const where = matched.map((a) => `${a.provider}/${a.name}`).join("、");
        return tr("模型 {0} 只在 {1}，但路由供应商限定为 {2}。请在设置里勾选对应供应商，或试一句里直接选该账号。", wantModel, where, policy.providers.join("、"));
      }
    }
    const paidMatch = matched.some((a) => !accountIsFree(a));
    const freeModel = matched.some((a) => isFreeModel(a.provider, wantModel, store.data.settings));
    if (!freeModel && !paidMatch) {
      return tr("模型 {0} 不在免费模型表里（按收费处理），但没有付费账号（免费档请取消勾选）。", wantModel);
    }
  }
  const cooling = store.data.cooldowns.filter((c) => c.until > now);
  const busy = cooling.filter((c) => /429/.test(c.reason));
  if (busy.length && busy.length === cooling.length) {
    const wait = Math.max(1, ...busy.map((c) => Math.ceil((c.until - now) / 1000)));
    return tr("刚才免费模型 429 了，号还在冷却 {0}s。不是 key 坏了，也不是代码坏了。换一个 :free 模型，或等冷却结束再试。", wait);
  }
  const reasons = blockedReasons(store, now);
  if (wantModel && wantModel !== "auto" && wantModel !== FREE_AUTO && reasons.every((r) => r.endsWith(tr("可用")))) {
    return tr("有账号在线，但按当前路由规则选不出能打 {0} 的号。请检查设置里的供应商范围 / 免费档，或在试一句里指定账号。", wantModel);
  }
  return reasons.join("\n");
}

function formatExhaustion(store: Store, attempts: RouteAttempt[], now: number): string {
  const busy = attempts.filter((a) => isProviderBusy429(a.status ?? 0, a.error ?? ""));
  if (busy.length) {
    const model = busy[0]?.model ?? tr("这个模型");
    const provider = busy[0]?.provider ?? tr("上游");
    const triedAuto = attempts.some((a) => !isProviderBusy429(a.status ?? 0, a.error ?? "") || a.model !== model);
    return [
      tr("{0} 的 {1} 上游忙（429），不是 key 坏了。", provider, model),
      attempts.some((a) => a.model !== model)
        ? tr("指定模型失败后已改 auto 再试（{0}），还是不行。", [...new Set(attempts.map((a) => a.model))].join(" → "))
        : triedAuto
          ? tr("auto 兜底也 429 了。")
          : tr("已停手。"),
      tr("换一个 :free 模型，或等一会儿再试。"),
    ].join("\n");
  }
  return [
    tr("全部账号都没打通。"),
    ...attempts.map((a) => `  ${a.provider}/${a.name} → ${a.status ?? "err"} ${a.error ?? ""}`.trimEnd()),
    ...blockedReasons(store, now),
  ].join("\n");
}

function extractError(result: { body: string; json?: unknown }): string {
  if (result.json && typeof result.json === "object") {
    const err = (result.json as { error?: { message?: string } | string }).error;
    if (typeof err === "string") return err;
    if (err?.message) return err.message;
  }
  const one = result.body.replace(/\s+/g, " ").trim();
  return one.length > 180 ? `${one.slice(0, 177)}…` : one || "empty body";
}

function estimatePrompt(request: ChatRequest): number {
  const text = request.messages
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join("\n");
  return estimateTokens(text);
}
