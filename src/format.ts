import { tr } from "./i18n.js";
import { remainingHint } from "./quota.js";
import { activeCooldown } from "./quota.js";
import type { Store } from "./store.js";
import { extractText } from "./anthropic.js";
import type { RouteAttempt } from "./types.js";

export function printStatus(store: Store, now = Date.now()): string {
  store.prune(now);
  const rows = store.data.accounts.map((account) => {
    const cd = activeCooldown(store.data.cooldowns, account.id, now);
    const hint = remainingHint(account, store.data.usage, now);
    const state = cd
      ? tr("冷却 {0}s", Math.max(1, Math.ceil((cd.until - now) / 1000)))
      : account.status;
    return `${pad(`${account.provider}/${account.name}`, 28)} ${pad(state, 14)} ${hint.label}`;
  });
  const available = store.data.accounts.filter((a) => {
    if (!a.enabled || a.status === "invalid" || a.status === "error") return false;
    return !activeCooldown(store.data.cooldowns, a.id, now);
  }).length;
  const policy = store.data.settings.policy;
  const scope = policy?.providers?.length ? policy.providers.join(",") : tr("全部");
  const head = tr("池 {0} 账号 · {1} 可用 · 策略 {2}/{3} · 网关 http://{4}:{5}", store.data.accounts.length, available, scope, policy?.model ?? "auto", store.data.settings.host, store.data.settings.port);
  if (rows.length === 0) return tr("{0}\n（空）freeall add groq gsk_… --name work", head);
  const tail = available === 0 ? tr("\n0 可用。再添加 Key，或等冷却结束。") : "";
  return [head, ...rows].join("\n") + tail;
}

export function printAsk(text: string, via?: string, ms?: number, attempts?: RouteAttempt[]): string {
  const meta = [via, ms != null ? `${ms}ms` : null].filter(Boolean).join(" · ");
  const trail = attempts && attempts.length > 1
    ? tr("\n切换轨迹：{0}", attempts.map((a) => `${a.provider}/${a.name}${a.ok ? "" : `×${a.status ?? ""}`}`).join(" → "))
    : "";
  return `${meta ? `（${meta}）\n` : ""}${text}${trail}`;
}

export function answerFromOutcome(json: unknown): string {
  return extractText(json) || JSON.stringify(json);
}

function pad(value: string, n: number): string {
  return value.length >= n ? value : `${value}${" ".repeat(n - value.length)}`;
}
