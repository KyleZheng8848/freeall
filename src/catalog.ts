import { tr } from "./i18n.js";
import type { ProviderId, ProviderSpec } from "./types.js";

export const CATALOG: Record<Exclude<ProviderId, "custom">, ProviderSpec> = {
  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b"],
    keyHint: "gsk_…",
    signup: "https://console.groq.com/keys",
    limits: { rpm: 30, rpd: 14400, tpm: 6000, tpd: 500_000, monthlyHint: "~15M" },
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    keyHint: "AIza…",
    signup: "https://aistudio.google.com/apikey",
    limits: { rpm: 10, rpd: 250, tpm: 250_000, tpd: null, monthlyHint: "~15M" },
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (free)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    models: ["openrouter/free", "openrouter/auto", "qwen/qwen3-8b:free", "meta-llama/llama-3.3-70b-instruct:free"],
    keyHint: "sk-or-…（只选 :free）",
    signup: "https://openrouter.ai/keys",
    limits: { rpm: 20, rpd: 50, tpm: null, tpd: null, monthlyHint: ":free 零余额" },
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama3.1-8b",
    models: ["llama3.1-8b", "llama-3.3-70b", "qwen-3-coder-480b"],
    keyHint: "csk-…",
    signup: "https://cloud.cerebras.ai",
    limits: { rpm: 30, rpd: null, tpm: 60_000, tpd: 1_000_000, monthlyHint: "~30M" },
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-large-latest", "codestral-latest"],
    keyHint: "…",
    signup: "https://console.mistral.ai/api-keys",
    limits: { rpm: 2, rpd: null, tpm: 500_000, tpd: null, monthlyHint: "~50M" },
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.1-8b-instruct",
    models: ["meta/llama-3.1-8b-instruct", "meta/llama-3.1-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
    keyHint: "nvapi-…",
    signup: "https://build.nvidia.com/settings/api-keys",
    limits: { rpm: 40, rpd: null, tpm: null, tpd: null, monthlyHint: "credits" },
  },
  together: {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    models: ["meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", "Qwen/Qwen2.5-7B-Instruct-Turbo"],
    keyHint: "…",
    signup: "https://api.together.ai/settings/api-keys",
    limits: { rpm: 60, rpd: null, tpm: null, tpd: null, monthlyHint: "free credits" },
  },
  siliconflow: {
    id: "siliconflow",
    label: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen3-8B",
    models: ["Qwen/Qwen3-8B", "Qwen/Qwen3-32B", "deepseek-ai/DeepSeek-V3"],
    keyHint: "sk-…（只要国内站，国际站没免费额度）",
    signup: "https://cloud.siliconflow.cn/account/ak",
    limits: { rpm: 60, rpd: null, tpm: null, tpd: null, monthlyHint: "国内站领券" },
  },
  zhipu: {
    id: "zhipu",
    label: "Zhipu / Z.ai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4.7-flash",
    models: ["glm-4.7-flash", "glm-4-flash", "glm-4.5-flash"],
    keyHint: "…（选 Flash，模型本身免费）",
    signup: "https://open.bigmodel.cn/usercenter/apikeys",
    limits: { rpm: null, rpd: null, tpm: null, tpd: 1_000_000, monthlyHint: "Flash 免费" },
  },
};

/** OpenRouter 累计买过 ≥$10 credits 后，:free 日限从 50 提到 1000；每分钟仍是 20。 */
export const OPENROUTER_CREDITS_RPD = 1000;

export function listProviders(): ProviderSpec[] {
  return Object.values(CATALOG).map(localizedProvider);
}

export function resolveProvider(id: string): ProviderSpec {
  if (id === "custom") {
    return {
      id: "custom",
      label: "Custom OpenAI-compatible",
      baseUrl: "",
      defaultModel: "gpt-4o-mini",
      models: [],
      keyHint: "sk-…",
      signup: "",
      limits: { rpm: null, rpd: null, tpm: null, tpd: null, monthlyHint: "unknown" },
    };
  }
  const spec = CATALOG[id as Exclude<ProviderId, "custom">];
  if (!spec) {
    throw new Error(
      tr("未知供应商 '{0}'。可用：{1}", id, [...Object.keys(CATALOG), "custom"].join(", ")),
    );
  }
  return localizedProvider(spec);
}

export function resolveBaseUrl(provider: ProviderId, override?: string): string {
  if (override) return override.replace(/\/+$/, "");
  if (provider === "custom") {
    throw new Error(tr("custom 供应商必须提供 --base-url"));
  }
  return CATALOG[provider].baseUrl;
}

export function candidateBaseUrls(provider: ProviderId, override?: string): string[] {
  const primary = resolveBaseUrl(provider, override);
  const extras = provider === "siliconflow"
    ? ["https://api.siliconflow.cn/v1", "https://api.siliconflow.com/v1"]
    : [];
  return [...new Set([primary, ...extras.map((url) => url.replace(/\/+$/, ""))])];
}

export function persistWorkingBaseUrl(account: { provider: ProviderId; baseUrl?: string }, working: string): void {
  const clean = working.replace(/\/+$/, "");
  // custom 没有目录默认地址，不能走 resolveBaseUrl(provider)
  if (account.provider === "custom") {
    account.baseUrl = clean;
    return;
  }
  const catalog = resolveBaseUrl(account.provider);
  if (clean === catalog) delete account.baseUrl;
  else account.baseUrl = clean;
}

/** 面板展示用：custom 只看账号上的 override，其它供应商可回落到目录。 */
export function accountBaseUrl(account: { provider: ProviderId; baseUrl?: string }): string {
  if (account.baseUrl) return account.baseUrl.replace(/\/+$/, "");
  if (account.provider === "custom") return "";
  return resolveBaseUrl(account.provider);
}

export function resolveDefaultModel(provider: ProviderId, override?: string): string {
  if (override && override !== "auto") return override;
  if (provider === "custom") return "gpt-4o-mini";
  return CATALOG[provider].defaultModel;
}

export function isOpenRouterRouterAlias(id: string): boolean {
  return id === "openrouter/free" || id === "openrouter/auto";
}

export function isOpenRouterFreeModel(id: string): boolean {
  return isOpenRouterRouterAlias(id) || id.endsWith(":free");
}

/** OpenRouter 本机 auto：具体 :free 裸名，跳过路由别名和剔除列表。不把 openrouter/auto 发给上游。 */
export function openRouterAutoModels(
  account: { provider: ProviderId; models?: string[]; preferredModel?: string },
  opts?: { freeOnly?: boolean; exclude?: string[] },
): string[] {
  if (account.provider !== "openrouter") return [];
  const skip = new Set(
    [...(opts?.exclude ?? []), "auto", "openrouter/free", "openrouter/auto"]
      .map((id) => id.trim())
      .filter(Boolean),
  );
  return accountModelChoices(account, Boolean(opts?.freeOnly)).filter((id) => !skip.has(id) && !isOpenRouterRouterAlias(id));
}

export function accountModelChoices(
  account: { provider: ProviderId; models?: string[]; preferredModel?: string },
  freeOnly = false,
): string[] {
  const catalog = resolveProvider(account.provider).models;
  const all = [...new Set([account.preferredModel, ...(account.models ?? []), ...catalog].filter((id): id is string => Boolean(id)))];
  if (!freeOnly || account.provider !== "openrouter") return all;
  const free = all.filter(isOpenRouterFreeModel);
  const extra = account.preferredModel && !free.includes(account.preferredModel) ? [account.preferredModel] : [];
  return free.length || extra.length ? [...new Set([...extra, ...free])] : all;
}

export function resolveAccountModel(
  account: { provider: ProviderId; models?: string[]; preferredModel?: string },
  requested?: string,
  opts?: { freeOnly?: boolean; exclude?: string[] },
): string {
  const skip = new Set((opts?.exclude ?? []).map((id) => id.trim()).filter((id) => id && id !== "auto"));
  const pick = (id?: string) => (id && !skip.has(id) ? id : undefined);
  if (requested === "openrouter/auto") return openRouterAutoModels(account, opts)[0] ?? "";
  if (requested && requested !== "auto") {
    if (opts?.freeOnly && account.provider === "openrouter" && !isOpenRouterFreeModel(requested)) {
      if (pick(account.preferredModel) && isOpenRouterFreeModel(account.preferredModel!)) return account.preferredModel!;
      const free = (account.models ?? []).find((id) => isOpenRouterFreeModel(id) && !skip.has(id));
      if (free) return free;
      return openRouterAutoModels(account, opts)[0] ?? "";
    }
    return requested;
  }
  if (pick(account.preferredModel)) return account.preferredModel!;
  const fallback = resolveDefaultModel(account.provider);
  const live = account.models ?? [];
  if (live.includes(fallback) && pick(fallback)) return fallback;
  if (account.provider === "openrouter") {
    const next = openRouterAutoModels(account, opts)[0];
    if (next) return next;
  }
  const alt = accountModelChoices(account, Boolean(opts?.freeOnly)).find((id) => !skip.has(id));
  return alt ?? live.find((id) => !skip.has(id)) ?? "";
}

/** 指定模型 429 时按这个顺序改 auto。指定和 auto 相同则只打一枪。 */
export function modelSequence(
  account: { provider: ProviderId; models?: string[]; preferredModel?: string },
  requested?: string,
  opts?: { freeOnly?: boolean; exclude?: string[] },
): Array<{ model: string; kind: "pin" | "auto" }> {
  const local = requested === "openrouter/auto";
  const auto = resolveAccountModel(account, local ? "openrouter/auto" : "auto", opts);
  if (!requested || requested === "auto" || local) return auto ? [{ model: auto, kind: "auto" }] : [];
  const pin = resolveAccountModel(account, requested, opts);
  if (!auto || pin === auto) return pin ? [{ model: pin, kind: pin === auto ? "auto" : "pin" }] : [];
  return [
    { model: pin, kind: "pin" },
    { model: auto, kind: "auto" },
  ];
}

export function pickPreferredModel(account: { provider: ProviderId }, live: string[]): string {
  if (account.provider === "openrouter") {
    if (live.includes("openrouter/free")) return "openrouter/free";
    const free = live.find((id) => id.endsWith(":free"));
    if (free) return free;
  }
  const fallback = resolveDefaultModel(account.provider);
  if (live.includes(fallback)) return fallback;
  return live[0] ?? fallback;
}

export function parseModelRef(raw: string | undefined): { provider?: ProviderId; model: string } {
  if (!raw || raw === "auto") return { model: "auto" };
  try {
    resolveProvider(raw);
    if (raw !== "custom") return { provider: raw as ProviderId, model: "auto" };
  } catch {
    // not a bare provider id
  }
  const slash = raw.indexOf("/");
  if (slash > 0) {
    const head = raw.slice(0, slash);
    const rest = raw.slice(slash + 1);
    try {
      resolveProvider(head);
      if (head === "openrouter" && (rest === "free" || rest === "auto")) {
        return { provider: "openrouter", model: `openrouter/${rest}` };
      }
      return { provider: head as ProviderId, model: rest };
    } catch {
      return { model: raw };
    }
  }
  return { model: raw };
}

function localizedProvider(spec: ProviderSpec): ProviderSpec {
  return { ...spec, keyHint: tr(spec.keyHint), limits: { ...spec.limits, monthlyHint: tr(spec.limits.monthlyHint) } };
}
