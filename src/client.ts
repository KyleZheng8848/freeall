import { tr } from "./i18n.js";
import { PROJECT_REPOSITORY } from "./identity.js";
import { resolveBaseUrl, resolveDefaultModel } from "./catalog.js";
import type { Account, ChatRequest } from "./types.js";

export interface UpstreamResult {
  status: number;
  headers: Headers;
  body: string;
  json?: unknown;
}

export type FetchFn = typeof fetch;

export function accountUrl(account: Account, path: string): string {
  const base = resolveBaseUrl(account.provider, account.baseUrl);
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}

export async function listModels(
  account: Account,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<{ ok: boolean; status: number; models: string[]; error?: string }> {
  try {
    const res = await fetchFn(accountUrl(account, "/models"), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, models: [], error: describeUpstreamError(account.provider, res.status, text) };
    }
    const parsed = JSON.parse(text) as { data?: Array<{ id?: string }> };
    const models = (parsed.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    return { ok: true, status: res.status, models };
  } catch (error) {
    return { ok: false, status: 0, models: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function chatCompletions(
  account: Account,
  apiKey: string,
  request: ChatRequest,
  fetchFn: FetchFn = fetch,
): Promise<UpstreamResult> {
  const model = resolveDefaultModel(account.provider, request.model);
  const payload = upstreamPayload(request, model, false);
  const res = await fetchFn(accountUrl(account, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": PROJECT_REPOSITORY,
      "X-Title": "FreeAll",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, body, json };
}

export async function chatCompletionsStream(
  account: Account,
  apiKey: string,
  request: ChatRequest,
  fetchFn: FetchFn = fetch,
): Promise<Response> {
  const model = resolveDefaultModel(account.provider, request.model);
  return fetchFn(accountUrl(account, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": PROJECT_REPOSITORY,
      "X-Title": "FreeAll",
    },
    body: JSON.stringify(upstreamPayload(request, model, true)),
    signal: AbortSignal.timeout(120_000),
  });
}

function upstreamPayload(request: ChatRequest, model: string, stream: boolean): Record<string, unknown> {
  const skip = new Set(["provider", "providers", "account"]);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(request)) {
    if (skip.has(key) || key === "model" || value === undefined) continue;
    payload[key] = value;
  }
  payload.model = model;
  payload.stream = stream;
  return payload;
}

export function describeUpstreamError(provider: string, status: number, body: string): string {
  const raw = extractErrorMessage(body);
  if (/location is not supported/i.test(raw || body)) {
    return tr("{0} 这把 key 能认出，但当前地区/出口 IP 不让用这家 API（大陆常见）。换智谱 Flash 或 OpenRouter 的 :free 模型，或走能出网的代理后再点重新验证。", provider);
  }
  if (status === 401) {
    if (provider === "siliconflow") {
      return tr("硅基流动认不出这把 key（401）。.com 和 .cn 是两套账号，已会自动换域名再试；仍失败就去申请页重建 sk- 开头的 key，不要填 Groq 的 gsk_。");
    }
    return tr("{0} 认不出这把 key（401）。到官网重新复制完整 key，前后不要空格。", provider);
  }
  if (status === 403) {
    if (provider === "groq" && /forbidden/i.test(raw || body)) {
      return tr("当前网络到不了 Groq（不带 key 也是 403 Forbidden）。换智谱 Flash 或 OpenRouter 的 :free 模型，或给本机走能访问 api.groq.com 的代理后再刷新。");
    }
    return tr("{0} 拒绝访问（403 Forbidden）。key 可能被关、免费额度用尽，或没权限。去申请页检查/重建后再点刷新。{1}", provider, raw ? tr(" 原文：{0}", raw) : "");
  }
  if (status === 429) {
    if (/provider returned error/i.test(raw || body)) {
      return tr("{0} 这个模型的上游忙（429），不是你的 key 坏了。换一个 :free 模型或等一会儿。不要连点——连点会把池子里每把号都冻住。", provider);
    }
    return tr("{0} 限流（429）。等一会儿或换另一个 Key。", provider);
  }
  if (status === 402 || /insufficient|balance/i.test(raw || body)) {
    if (provider === "siliconflow") {
      return tr("硅基流动国际站（.com）没有注册即送的免费额度，余额 0 就不能对话。这把不用再刷新。要免费：开智谱选 glm-4.7-flash，或 OpenRouter 选带 :free 的模型。");
    }
    return tr("{0} 账号没额度（402）。去官网充值或领免费额度后再问。", provider);
  }
  return raw || `HTTP ${status}`;
}

function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // plain text
  }
  return clip(body);
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 240 ? `${one.slice(0, 237)}…` : one;
}
