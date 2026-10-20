import { tr, currentLocale } from "./i18n.js";
import { OPENROUTER_CREDITS_RPD, resolveProvider } from "./catalog.js";
import type { Account, Cooldown, LimitOverride, ProviderSpec, UsageEvent } from "./types.js";

const MINUTE = 60_000;
const DAY = 86_400_000;

export interface WindowUse {
  requests: number;
  tokens: number;
}

export function usageWindow(usage: UsageEvent[], since: number, accountId?: string): WindowUse {
  let requests = 0;
  let tokens = 0;
  for (const event of usage) {
    if (event.at < since) continue;
    if (accountId && event.accountId !== accountId) continue;
    if (event.kind === "request") requests += 1;
    else tokens += event.tokens;
  }
  return { requests, tokens };
}

export function windowUse(usage: UsageEvent[], accountId: string, since: number): WindowUse {
  return usageWindow(usage, since, accountId);
}

export function startOfLocalDay(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function catalogLimits(account: Pick<Account, "provider">): ProviderSpec["limits"] {
  return resolveProvider(account.provider).limits;
}

export function accountLimits(account: Pick<Account, "provider" | "limitOverride">): ProviderSpec["limits"] {
  const base = catalogLimits(account);
  const o = account.limitOverride;
  if (!o) return base;
  return {
    ...base,
    ...(o.rpm !== undefined ? { rpm: o.rpm } : {}),
    ...(o.rpd !== undefined ? { rpd: o.rpd } : {}),
    ...(o.tpm !== undefined ? { tpm: o.tpm } : {}),
    ...(o.tpd !== undefined ? { tpd: o.tpd } : {}),
  };
}

export function isOpenRouterCreditsBoost(account: Pick<Account, "provider" | "limitOverride">): boolean {
  return account.provider === "openrouter" && account.limitOverride?.rpd === OPENROUTER_CREDITS_RPD;
}

const MAX_CAP = 10_000_000;

/** undefined = 不改；"catalog" = 回到目录；null = 这项不限；正整数 = 覆盖。 */
export function parseCap(raw: unknown): number | null | "catalog" | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === 0 || raw === "none" || raw === "unlimited") return null;
  if (raw === "" || raw === "catalog" || raw === "reset") return "catalog";
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_CAP) {
    throw new Error(tr("次数上限必须是 1–10000000 的整数，空=用目录，none=不限"));
  }
  return n;
}

function writeCap(current: LimitOverride | undefined, key: keyof LimitOverride, value: number | null | "catalog"): LimitOverride | undefined {
  const next: LimitOverride = { ...current };
  if (value === "catalog") delete next[key];
  else next[key] = value;
  return Object.values(next).some((v) => v !== undefined) ? next : undefined;
}

export function patchAccountLimits(
  account: Account,
  patch: { rpm?: unknown; rpd?: unknown; boost?: unknown },
): void {
  let next = account.limitOverride ? { ...account.limitOverride } : undefined;
  if (patch.boost === true || patch.boost === "credits") {
    if (account.provider !== "openrouter") {
      throw new Error(tr("充值档只对 OpenRouter：累计买过 ≥$10 后 :free 日限按 1000 估"));
    }
    next = { ...next, rpd: OPENROUTER_CREDITS_RPD };
  } else if (patch.boost === false || patch.boost === "none") {
    next = writeCap(next, "rpd", "catalog");
  }
  const rpm = parseCap(patch.rpm);
  const rpd = parseCap(patch.rpd);
  if (rpm !== undefined) next = writeCap(next, "rpm", rpm);
  if (rpd !== undefined) next = writeCap(next, "rpd", rpd);
  if (next) account.limitOverride = next;
  else delete account.limitOverride;
}

function shortNum(n: number): string {
  if (currentLocale() === "en") return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  if (n >= 10_000) return `${Math.round(n / 1000) / 10}万`.replace(/\.0万$/, "万");
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`.replace(/\.0k$/, "k");
  return String(n);
}

export function remainingHint(
  account: Account,
  usage: UsageEvent[],
  now = Date.now(),
): { label: string; score: number } {
  const limits = accountLimits(account);
  const day = windowUse(usage, account.id, now - DAY);
  const minute = windowUse(usage, account.id, now - MINUTE);
  const parts: string[] = [];
  let score = 1;

  const push = (used: number, cap: number | null, phrase: (left: number) => string) => {
    if (cap == null) return;
    const left = Math.max(0, cap - used);
    parts.push(phrase(left));
    score = Math.min(score, left / cap);
  };

  push(minute.requests, limits.rpm, (left) => `${shortNum(left)}/${currentLocale() === "en" ? "min" : "分"}`);
  push(day.requests, limits.rpd, (left) => `${shortNum(left)}/${currentLocale() === "en" ? "day" : "日"}`);
  push(minute.tokens, limits.tpm, (left) => `${shortNum(left)} tok/${currentLocale() === "en" ? "min" : "分"}`);
  push(day.tokens, limits.tpd, (left) => `${shortNum(left)} tok/${currentLocale() === "en" ? "day" : "日"}`);

  if (parts.length === 0) {
    return { label: tr("记{0}次 · 上限未知", day.requests), score: 0.5 };
  }
  return { label: parts.join(" · "), score };
}

export function wouldExceed(
  account: Account,
  usage: UsageEvent[],
  tokensNeeded: number,
  now = Date.now(),
): string | null {
  const limits = accountLimits(account);
  const minute = windowUse(usage, account.id, now - MINUTE);
  const day = windowUse(usage, account.id, now - DAY);
  if (limits.rpm != null && minute.requests >= limits.rpm) return tr("RPM 已满 {0}/min", limits.rpm);
  if (limits.rpd != null && day.requests >= limits.rpd) return tr("RPD 已满 {0}/day", limits.rpd);
  if (limits.tpm != null && minute.tokens + tokensNeeded > limits.tpm) {
    return tr("TPM 不够（还需 ~{0}）", tokensNeeded);
  }
  if (limits.tpd != null && day.tokens + tokensNeeded > limits.tpd) {
    return tr("TPD 不够（还需 ~{0}）", tokensNeeded);
  }
  return null;
}

export function activeCooldown(cooldowns: Cooldown[], accountId: string, now = Date.now()): Cooldown | undefined {
  return cooldowns.find((c) => c.accountId === accountId && c.until > now);
}

/** OpenRouter 把上游机房忙也包成 429，再换同模型的下一把 key 只会冻光整池。 */
export function isProviderBusy429(status: number, reason = ""): boolean {
  return status === 429 && /provider returned error/i.test(reason);
}

export function cooldownFromStatus(status: number, retryAfterSec?: number, now = Date.now()): number {
  if (retryAfterSec && retryAfterSec > 0) {
    return now + Math.min(retryAfterSec, 86_400) * 1000;
  }
  if (status === 429) return now + 90_000;
  if (status === 401 || status === 403) return now + 5 * 60_000;
  if (status === 402) return now + 30_000;
  return now + 30_000;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
