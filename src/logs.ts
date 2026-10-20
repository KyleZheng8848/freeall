import { tr } from "./i18n.js";
import { randomBytes } from "node:crypto";
import type { Account, GenerationLog, LogSource } from "./types.js";

const HOUR = 60 * 60 * 1000;

export function newLogId(): string {
  return `log_${randomBytes(8).toString("hex")}`;
}

export function usageFromJson(json: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
} {
  if (!json || typeof json !== "object") {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  const obj = json as {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    choices?: Array<{ finish_reason?: string }>;
  };
  const usage = obj.usage;
  const prompt = Number(usage?.prompt_tokens) || 0;
  const completion = Number(usage?.completion_tokens) || 0;
  const total = Number(usage?.total_tokens) || prompt + completion;
  const finishReason = obj.choices?.[0]?.finish_reason;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total, finishReason };
}

export function speedTokS(log: Pick<GenerationLog, "completionTokens" | "ms">): number | null {
  if (!log.completionTokens || !log.ms) return null;
  return log.completionTokens / (log.ms / 1000);
}

export function makeLog(input: {
  account: Account;
  model: string;
  ok: boolean;
  status?: number;
  ms: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
  source: LogSource;
  error?: string;
  hops: number;
  at?: number;
}): GenerationLog {
  return {
    id: newLogId(),
    at: input.at ?? Date.now(),
    accountId: input.account.id,
    provider: input.account.provider,
    accountName: input.account.name,
    model: input.model,
    ok: input.ok,
    status: input.status,
    ms: input.ms,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
    finishReason: input.finishReason,
    source: input.source,
    error: input.error,
    hops: input.hops,
  };
}

export interface LogSummary {
  requests: number;
  ok: number;
  fail: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  avgMs: number;
  tokPerSec: number | null;
}

export function summarizeLogs(logs: GenerationLog[]): LogSummary {
  let ok = 0;
  let fail = 0;
  let tokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let ms = 0;
  for (const log of logs) {
    if (log.ok) ok += 1;
    else fail += 1;
    tokens += log.totalTokens;
    promptTokens += log.promptTokens;
    completionTokens += log.completionTokens;
    ms += log.ms;
  }
  const requests = logs.length;
  return {
    requests,
    ok,
    fail,
    tokens,
    promptTokens,
    completionTokens,
    avgMs: requests ? Math.round(ms / requests) : 0,
    tokPerSec: completionTokens && ms ? Math.round((completionTokens / (ms / 1000)) * 10) / 10 : null,
  };
}

export function groupLogs(
  logs: GenerationLog[],
  key: (log: GenerationLog) => string,
): Array<{ key: string; requests: number; tokens: number; ok: number; fail: number }> {
  const map = new Map<string, { requests: number; tokens: number; ok: number; fail: number }>();
  for (const log of logs) {
    const id = key(log);
    const row = map.get(id) ?? { requests: 0, tokens: 0, ok: 0, fail: 0 };
    row.requests += 1;
    row.tokens += log.totalTokens;
    if (log.ok) row.ok += 1;
    else row.fail += 1;
    map.set(id, row);
  }
  return [...map.entries()]
    .map(([k, n]) => ({ key: k, ...n }))
    .sort((a, b) => b.requests - a.requests);
}

export function hourBuckets(
  logs: GenerationLog[],
  since: number,
  now: number,
): Array<{ t: number; n: number; ok: number }> {
  const start = Math.floor(since / HOUR) * HOUR;
  const end = Math.floor(now / HOUR) * HOUR;
  const buckets: Array<{ t: number; n: number; ok: number }> = [];
  for (let t = start; t <= end; t += HOUR) {
    buckets.push({ t, n: 0, ok: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.t, i]));
  for (const log of logs) {
    if (log.at < since || log.at > now) continue;
    const t = Math.floor(log.at / HOUR) * HOUR;
    const i = index.get(t);
    if (i == null) continue;
    buckets[i]!.n += 1;
    if (log.ok) buckets[i]!.ok += 1;
  }
  return buckets;
}

export function logsSince(logs: GenerationLog[], since: number): GenerationLog[] {
  return logs.filter((log) => log.at >= since);
}

export function logAccountRef(log: Pick<GenerationLog, "provider" | "accountName">): string {
  return `${log.provider}/${log.accountName}`;
}

export function sourceLabel(source: LogSource): string {
  const map: Record<LogSource, string> = {
    ask: tr("试打"),
    cli: "cli",
    openai: "OpenAI",
    anthropic: "Anthropic",
    stream: tr("流式"),
  };
  return map[source] ?? source;
}
