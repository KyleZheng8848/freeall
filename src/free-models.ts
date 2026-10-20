import { CATALOG, isOpenRouterFreeModel, resolveProvider } from "./catalog.js";
import { accountIsFree, providerOrder } from "./policy.js";
import type { Store } from "./store.js";
import type { Account, ProviderFreeModels, ProviderId, RoutePolicy, Settings } from "./types.js";

export const FREE_AUTO = "free-auto";

/** 目录种子：各供应商默认识别为免费的模型（可被手填/剔除覆盖）。 */
export function catalogFreeSeeds(provider: ProviderId): string[] {
  if (provider === "custom") return [];
  try {
    const spec = resolveProvider(provider);
    if (provider === "openrouter") {
      return spec.models.filter((id) => isOpenRouterFreeModel(id) && id !== "openrouter/auto");
    }
    // 其余目录供应商当前以免费档为主，种子用目录模型列表
    return [...spec.models];
  } catch {
    return [];
  }
}

export function looksLikeFreeModel(provider: ProviderId, id: string): boolean {
  const model = id.trim();
  if (!model) return false;
  if (provider === "openrouter") return isOpenRouterFreeModel(model);
  if (/:free\b/i.test(model) || /\bfree\b/i.test(model)) return true;
  if (/flash/i.test(model)) return true;
  const seeds = catalogFreeSeeds(provider);
  return seeds.includes(model);
}

export function emptyFreeEntry(): ProviderFreeModels {
  return { models: [], manual: [], excluded: [] };
}

export function normalizeFreeEntry(raw: unknown): ProviderFreeModels {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean);
  const manual = unique(list(obj.manual));
  const excluded = unique(list(obj.excluded));
  const models = unique(list(obj.models)).filter((id) => !excluded.includes(id));
  const source = obj.source === "probe" || obj.source === "manual" || obj.source === "mixed" ? obj.source : undefined;
  const updatedAt = typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt) ? obj.updatedAt : undefined;
  return {
    models,
    manual,
    excluded,
    ...(updatedAt ? { updatedAt } : {}),
    ...(source ? { source } : {}),
  };
}

export function normalizeProviderFreeModels(raw: unknown): Record<string, ProviderFreeModels> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, ProviderFreeModels> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue;
    out[key] = normalizeFreeEntry(value);
  }
  return out;
}

export function getFreeEntry(settings: Settings, provider: string): ProviderFreeModels {
  const map = settings.providerFreeModels ?? {};
  return normalizeFreeEntry(map[provider] ?? emptyFreeEntry());
}

/** 生效列表：manual 在前（保持顺序），再接 models 里其余项，去掉 excluded。 */
export function effectiveFreeModels(entry: ProviderFreeModels, provider?: ProviderId): string[] {
  const excluded = new Set(entry.excluded);
  const out: string[] = [];
  for (const id of entry.manual) {
    if (!excluded.has(id) && !out.includes(id)) out.push(id);
  }
  for (const id of entry.models) {
    if (!excluded.has(id) && !out.includes(id)) out.push(id);
  }
  if (out.length === 0 && provider) {
    for (const id of catalogFreeSeeds(provider)) {
      if (!excluded.has(id) && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

export function isFreeModel(provider: ProviderId, modelId: string, settings?: Settings): boolean {
  const model = modelId.trim();
  if (!model || model === "auto" || model === FREE_AUTO) return true;
  if (settings) {
    const entry = getFreeEntry(settings, provider);
    if (entry.excluded.includes(model)) return false;
    if (entry.manual.includes(model) || entry.models.includes(model)) return true;
    // 表外仍认启发式（如 openrouter :free）；要当收费请写入 excluded
    return looksLikeFreeModel(provider, model);
  }
  return looksLikeFreeModel(provider, model);
}

export function isFreeAutoRequest(model?: string, policy?: RoutePolicy): boolean {
  const raw = (model ?? "").trim();
  if (raw === FREE_AUTO) return true;
  if ((!raw || raw === "auto") && policy?.freeOnly) return true;
  if (policy?.model === FREE_AUTO && (!raw || raw === "auto")) return true;
  return false;
}

export function mergeProbeModels(
  entry: ProviderFreeModels,
  provider: ProviderId,
  probed: string[],
): ProviderFreeModels {
  const excluded = new Set(entry.excluded);
  const manual = [...entry.manual];
  const next = [...entry.models];
  for (const id of probed) {
    const model = id.trim();
    if (!model || excluded.has(model)) continue;
    if (!looksLikeFreeModel(provider, model)) continue;
    if (manual.includes(model) || next.includes(model)) continue;
    next.push(model);
  }
  const source = manual.length && next.length ? "mixed" : manual.length ? "manual" : "probe";
  return {
    models: next,
    manual,
    excluded: [...excluded],
    updatedAt: Date.now(),
    source,
  };
}

export function patchFreeEntry(
  entry: ProviderFreeModels,
  patch: { models?: string[]; manual?: string[]; excluded?: string[] },
): ProviderFreeModels {
  const next = normalizeFreeEntry({
    ...entry,
    ...(patch.models ? { models: patch.models } : {}),
    ...(patch.manual ? { manual: patch.manual } : {}),
    ...(patch.excluded ? { excluded: patch.excluded } : {}),
    updatedAt: Date.now(),
    source: patch.manual || patch.models || patch.excluded ? "manual" : entry.source,
  });
  if (patch.manual && !patch.models) {
    // 只改 manual 时，models 保持探测结果
    next.models = entry.models.filter((id) => !next.excluded.includes(id));
    next.source = next.manual.length && next.models.length ? "mixed" : next.manual.length ? "manual" : entry.source;
  }
  return next;
}

export function setProviderFreeModels(
  settings: Settings,
  provider: string,
  entry: ProviderFreeModels,
): void {
  if (!settings.providerFreeModels) settings.providerFreeModels = {};
  settings.providerFreeModels[provider] = normalizeFreeEntry(entry);
}

export function accountSupportsModel(account: Account, model: string): boolean {
  if (account.preferredModel === model) return true;
  if ((account.models ?? []).includes(model)) return true;
  // 尚未探测：非 custom 允许按目录/免费表试探
  if (!(account.models && account.models.length) && account.provider !== "custom") return true;
  return false;
}

export interface FreeAutoAttempt {
  account: Account;
  model: string;
  provider: ProviderId;
}

/** free-auto：供应商顺序 → free list → 账号 priority。 */
export function buildFreeAutoAttempts(
  store: Store,
  policy: RoutePolicy,
  accounts: Account[],
): FreeAutoAttempt[] {
  const settings = store.data.settings;
  const order = providerOrder(policy, accounts);
  const attempts: FreeAutoAttempt[] = [];
  for (const provider of order) {
    const freeList = effectiveFreeModels(getFreeEntry(settings, provider), provider);
    for (const model of freeList) {
      if (policy.excludeModels?.includes(model)) continue;
      const matched = accounts
        .filter((a) => a.provider === provider && accountIsFree(a) && accountSupportsModel(a, model))
        .sort((a, b) => accountPriorityDesc(a, b));
      for (const account of matched) {
        attempts.push({ account, model, provider });
      }
    }
  }
  return attempts;
}

function accountPriorityDesc(a: Account, b: Account): number {
  const pa = typeof a.priority === "number" && Number.isFinite(a.priority) ? Math.trunc(a.priority) : 0;
  const pb = typeof b.priority === "number" && Number.isFinite(b.priority) ? Math.trunc(b.priority) : 0;
  if (pb !== pa) return pb - pa;
  return Math.random() - 0.5;
}

function unique(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** 确保 settings 带上默认 free 表结构（惰性，不写盘）。 */
export function ensureProviderFreeModels(settings: Settings): Record<string, ProviderFreeModels> {
  if (!settings.providerFreeModels) settings.providerFreeModels = {};
  for (const id of Object.keys(CATALOG) as ProviderId[]) {
    if (!settings.providerFreeModels[id]) {
      const seeds = catalogFreeSeeds(id);
      settings.providerFreeModels[id] = {
        models: seeds,
        manual: [],
        excluded: [],
        source: seeds.length ? "probe" : "manual",
      };
    } else {
      settings.providerFreeModels[id] = normalizeFreeEntry(settings.providerFreeModels[id]);
    }
  }
  return settings.providerFreeModels;
}
