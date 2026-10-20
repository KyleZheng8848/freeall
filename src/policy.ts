import { isOpenRouterFreeModel, parseModelRef, resolveProvider } from "./catalog.js";
import type { Store } from "./store.js";
import type { Account, ChatRequest, ProviderId, RoutePolicy } from "./types.js";

export function defaultPolicy(): RoutePolicy {
  return { providers: [], model: "auto", freeOnly: false };
}

export function parseModelLines(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.flatMap((item) => String(item).split(/[\n,]+/))
    : typeof raw === "string"
      ? raw.split(/[\n,]+/)
      : [];
  const out: string[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (!t || t === "auto" || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

export function normalizePolicy(raw: unknown): RoutePolicy {
  const obj = raw && typeof raw === "object" ? (raw as { providers?: unknown; model?: unknown; freeOnly?: unknown; account?: unknown; excludeModels?: unknown }) : {};
  const providers = Array.isArray(obj.providers)
    ? obj.providers.filter((id): id is ProviderId => typeof id === "string" && isProvider(id))
    : [];
  const model = typeof obj.model === "string" && obj.model.trim() ? obj.model.trim() : "auto";
  const account = typeof obj.account === "string" && obj.account.trim() ? obj.account.trim() : undefined;
  const excludeModels = parseModelLines(obj.excludeModels);
  return {
    providers,
    model,
    freeOnly: Boolean(obj.freeOnly),
    ...(account ? { account } : {}),
    ...(excludeModels.length ? { excludeModels } : {}),
  };
}

/** 是否免费档：只认用户勾选的 account.free（缺省 true；付费号请显式取消勾选）。不从模型列表/账单推断。 */
export function accountIsFree(account: { free?: boolean }): boolean {
  return account.free !== false;
}

export function policyOf(store: Store): RoutePolicy {
  return normalizePolicy(store.data.settings.policy);
}

export function parseProviders(raw: unknown): ProviderId[] {
  if (raw == null || raw === "") return [];
  const parts = Array.isArray(raw) ? raw.flatMap((item) => String(item).split(/[,+\s]+/)) : String(raw).split(/[,+\s]+/);
  return parts
    .map((part) => part.trim())
    .filter((part) => part && part !== "auto")
    .filter((part): part is ProviderId => {
      try {
        resolveProvider(part);
        return true;
      } catch {
        return false;
      }
    });
}

export function policyForRequest(
  store: Store,
  request: { model?: string; provider?: unknown; providers?: unknown; account?: unknown },
): RoutePolicy {
  const base = policyOf(store);
  const pinned = parseProviders(request.provider ?? request.providers);
  const raw = typeof request.model === "string" ? request.model.trim() : "";
  const parsed = parseModelRef(raw || "auto");
  const bareProvider = Boolean(raw && raw !== "auto" && parsed.provider && parsed.model === "auto");
  const model = !raw || raw === "auto" || bareProvider ? base.model : raw;
  const account = typeof request.account === "string" && request.account.trim() ? request.account.trim() : base.account;
  const excludeModels = base.excludeModels;
  return {
    providers: pinned.length ? pinned : base.providers,
    model,
    freeOnly: base.freeOnly,
    ...(account ? { account } : {}),
    ...(excludeModels?.length ? { excludeModels } : {}),
  };
}

export function resolveRequestRoute(
  store: Store,
  request: { model?: string; provider?: unknown; providers?: unknown; account?: unknown },
): { policy: RoutePolicy; model: string; wantProvider?: ProviderId; wantAccount?: string } {
  const policy = policyForRequest(store, request);
  const incoming = typeof request.model === "string" ? request.model.trim() : "";
  const pinned = parseProviders(request.provider ?? request.providers);
  const fromModel = requestPinsProvider(incoming);
  const wantProvider = pinned.length === 1 ? pinned[0] : pinned.length > 0 ? undefined : fromModel;
  const ref = parseModelRef(effectiveModel(incoming || "auto", policy));
  return { policy, model: ref.model, wantProvider, wantAccount: policy.account };
}

export function applyGatewayHints(
  request: ChatRequest,
  hints: {
    headerProvider?: string;
    headerModel?: string;
    headerAccount?: string;
    queryProvider?: string | null;
    queryModel?: string | null;
    queryAccount?: string | null;
  },
): ChatRequest {
  return {
    ...request,
    provider: firstNonEmpty(hints.headerProvider, hints.queryProvider ?? undefined, request.provider, request.providers),
    model: (firstNonEmpty(hints.headerModel, hints.queryModel ?? undefined, request.model) as string | undefined) ?? "auto",
    account: (firstNonEmpty(hints.headerAccount, hints.queryAccount ?? undefined, request.account) as string | undefined),
  };
}

function firstNonEmpty(...values: Array<string | string[] | undefined | null>): string | string[] | undefined {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }
  return undefined;
}

export function effectiveModel(requestModel: string | undefined, policy: RoutePolicy, fallback = "auto"): string {
  const raw = requestModel?.trim() || fallback;
  if (!raw || raw === "auto") {
    const fromPolicy = policy.model || "auto";
    // 旧 freeOnly 勾选等价 free-auto
    if ((fromPolicy === "auto" || fromPolicy === "free-auto") && policy.freeOnly) return "free-auto";
    return fromPolicy;
  }
  return raw;
}

export function requestPinsProvider(requestModel: string | undefined): ProviderId | undefined {
  const raw = requestModel?.trim();
  if (!raw || raw === "auto") return undefined;
  return parseModelRef(raw).provider;
}

export function accountMatchesPolicyModel(account: Account, model?: string): boolean {
  if (!model || model === "auto" || model === "free-auto") return true;
  if (account.preferredModel === model) return true;
  if ((account.models ?? []).includes(model)) return true;
  return account.provider === "openrouter" && isOpenRouterFreeModel(model);
}

export function providerOrder(policy: RoutePolicy, accounts: Account[]): ProviderId[] {
  if (policy.providers.length) return policy.providers;
  return [...new Set(accounts.map((a) => a.provider))];
}

function isProvider(id: string): id is ProviderId {
  try {
    resolveProvider(id);
    return true;
  } catch {
    return false;
  }
}
