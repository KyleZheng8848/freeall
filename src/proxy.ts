import { tr, withLocale, requestLocale } from "./i18n.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  anthropicClose,
  anthropicDelta,
  anthropicPreamble,
  anthropicToOpenAI,
  openAISseDelta,
  openAIToAnthropic,
} from "./anthropic.js";
import { accountModelChoices } from "./catalog.js";
import { panelAdd, panelAsk, panelExport, panelImport, panelRefreshFreeModels, panelRefreshModels, panelRemove, panelRevealKey, panelState, panelUpdate, panelUpdateFreeModels, panelUpdateGateway, panelUpdatePolicy } from "./panel-data.js";
import { checkForUpdate, dismissUpdateBanner, markUpdateNotified } from "./panel-update.js";
import { panelPage } from "./panel-page.js";
import { isCountTokensPath, isQuotaProbe, mockAnthropicCount, mockChat } from "./probe.js";
import { accountIsFree, applyGatewayHints } from "./policy.js";
import { routeChat, routeStream } from "./router.js";
import { assertLocalOwner } from "./local-auth.js";
import type { Store } from "./store.js";
import type { ChatRequest } from "./types.js";

export function startProxy(store: Store, fetchFn: typeof fetch = fetch): Server {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void withLocale(requestLocale(req.headers, url), async () => {
      res.setHeader("Content-Language", requestLocale(req.headers, url));
      res.setHeader("Vary", "Accept-Language, Cookie");
      await handle(store, req, res, fetchFn);
    }).catch((error) => {
      if (!res.headersSent) {
        json(res, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
      } else {
        res.end();
      }
    });
  });
  const { host, port } = store.data.settings;
  server.listen(port, host);
  return server;
}

async function handle(
  store: Store,
  req: IncomingMessage,
  res: ServerResponse,
  fetchFn: typeof fetch,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  if (req.method === "GET" && (url.pathname === "/livez" || url.pathname === "/health")) {
    return json(res, 200, { ok: true, accounts: store.data.accounts.length });
  }
  if (await handlePanel(store, req, res, url, fetchFn)) return;
  if (!authorize(store, req)) {
    return json(res, 401, { error: { message: tr("需要 Bearer <freeall serve 打印的网关 token>") } });
  }
  if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/v1beta/models")) {
    return json(res, 200, listGatewayModels(store));
  }
  if (req.method === "POST" && isCountTokensPath(url.pathname)) {
    return json(res, 200, mockAnthropicCount("auto"));
  }

  if (req.method !== "POST") {
    return json(res, 404, { error: { message: tr("不支持 {0} {1}", req.method, url.pathname) } });
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return json(res, 400, { error: { message: tr("JSON 无法解析") } });
  }

  if (url.pathname === "/v1/ask" || url.pathname === "/ask") {
    const prompt = typeof body.prompt === "string"
      ? body.prompt
      : typeof body.message === "string"
        ? body.message
        : "";
    try {
      const out = await panelAsk(store, {
        prompt,
        model: headerText(req.headers["x-freeall-model"]) ?? (typeof body.model === "string" ? body.model : undefined) ?? url.searchParams.get("model") ?? undefined,
        provider: headerText(req.headers["x-freeall-provider"]) ?? (typeof body.provider === "string" ? body.provider : undefined) ?? url.searchParams.get("provider") ?? undefined,
        account: headerText(req.headers["x-freeall-account"]) ?? (typeof body.account === "string" ? body.account : undefined) ?? url.searchParams.get("account") ?? undefined,
      }, fetchFn);
      return json(res, out.ok ? 200 : 503, out);
    } catch (error) {
      return json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
  }

  const anthropic = url.pathname.endsWith("/messages") || url.pathname.includes("/v1/messages");
  const converted: ChatRequest = anthropic
    ? anthropicToOpenAI(body as Parameters<typeof anthropicToOpenAI>[0])
    : (body as ChatRequest);
  const request = applyGatewayHints(converted, {
    headerProvider: headerText(req.headers["x-freeall-provider"]),
    headerModel: headerText(req.headers["x-freeall-model"]),
    headerAccount: headerText(req.headers["x-freeall-account"]),
    queryProvider: url.searchParams.get("provider") ?? url.searchParams.get("providers"),
    queryModel: url.searchParams.get("model"),
    queryAccount: url.searchParams.get("account"),
  });

  if (!request.messages || request.messages.length === 0) {
    return json(res, 400, { error: { message: tr("messages 不能为空") } });
  }

  if (isQuotaProbe(request)) {
    const model = typeof request.model === "string" ? request.model : "auto";
    if (anthropic) {
      return json(res, 200, openAIToAnthropic(mockChat(model), model));
    }
    return json(res, 200, mockChat(model));
  }

  if (request.stream) {
    const streamed = await routeStream(store, request, fetchFn, Date.now(), "stream");
    if (!streamed.ok || !streamed.response?.body) {
      return json(res, 503, {
        error: { message: streamed.exhaustion ?? tr("池耗尽"), type: "freeall_exhausted" },
        attempts: streamed.attempts,
      });
    }
    const via = `${streamed.account?.provider}/${streamed.account?.name}`;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "x-routed-via": via,
      "x-fallback-trail": streamed.attempts.map((a) => `${a.provider}/${a.name}:${a.ok ? "ok" : a.status}`).join(","),
    });
    if (anthropic) {
      await pipeOpenAIToAnthropic(streamed.response, res, streamed.model ?? "auto");
      return;
    }
    await pipeRaw(streamed.response, res);
    return;
  }

  const outcome = await routeChat(store, { ...request, stream: false }, fetchFn, Date.now(), anthropic ? "anthropic" : "openai");
  if (!outcome.ok || !outcome.result?.json) {
    return json(res, 503, {
      error: { message: outcome.exhaustion ?? tr("池耗尽"), type: "freeall_exhausted" },
      attempts: outcome.attempts,
    });
  }

  const via = `${outcome.account?.provider}/${outcome.account?.name}`;
  res.setHeader("x-routed-via", via);
  res.setHeader("x-fallback-trail", outcome.attempts.map((a) => `${a.provider}/${a.name}:${a.ok ? "ok" : a.status}`).join(","));

  if (anthropic) {
    return json(res, 200, openAIToAnthropic(outcome.result.json, outcome.model ?? "auto"));
  }
  return json(res, 200, outcome.result.json);
}

function isLoopback(req: IncomingMessage): boolean {
  const ip = req.socket.remoteAddress ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

async function handlePanel(
  store: Store,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  fetchFn: typeof fetch,
): Promise<boolean> {
  const pages = url.pathname === "/" || url.pathname === "/pool" || url.pathname === "/settings" || url.pathname === "/try" || url.pathname === "/connect" || url.pathname === "/logs" || url.pathname === "/about";
  const panel = pages || url.pathname.startsWith("/api/panel");
  if (!panel) return false;
  if (!isLoopback(req)) {
    json(res, 403, { error: { message: tr("面板只允许本机打开（127.0.0.1）") } });
    return true;
  }
  if (req.method === "GET" && pages) {
    const html = panelPage(url.pathname);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(html) });
    res.end(html);
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/panel") {
    json(res, 200, panelState(store));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/panel/update") {
    try {
      json(res, 200, await checkForUpdate(store));
    } catch (error) {
      json(res, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/update/dismiss") {
    const raw = await readBody(req);
    let body: { version?: string };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    dismissUpdateBanner(store, String(body.version ?? ""));
    json(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/update/seen") {
    const raw = await readBody(req);
    let body: { version?: string };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    markUpdateNotified(store, String(body.version ?? ""));
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "PATCH" && url.pathname === "/api/panel/free-models") {
    const raw = await readBody(req);
    let body: { provider?: string; manual?: string[] | string; excluded?: string[] | string; models?: string[] | string };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      const entry = panelUpdateFreeModels(store, String(body.provider ?? ""), body);
      json(res, 200, { entry, state: panelState(store) });
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/free-models/refresh") {
    const raw = await readBody(req);
    let body: { provider?: string };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      const entry = panelRefreshFreeModels(store, String(body.provider ?? ""));
      json(res, 200, { entry, state: panelState(store) });
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "PATCH" && url.pathname === "/api/panel/policy") {
    const raw = await readBody(req);
    let body: { providers?: string[]; model?: string; freeOnly?: boolean; account?: string | null; excludeModels?: string[] | null };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      json(res, 200, { policy: panelUpdatePolicy(store, body), state: panelState(store) });
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "PATCH" && url.pathname === "/api/panel/gateway") {
    const raw = await readBody(req);
    let body: { host?: string; port?: number | string; token?: string; rotate?: boolean };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      const out = panelUpdateGateway(store, body);
      json(res, 200, { ...out, state: panelState(store) });
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/ask") {
    const raw = await readBody(req);
    let body: { prompt?: string; model?: string; provider?: string; account?: string };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      const out = await panelAsk(store, body, fetchFn);
      json(res, 200, out);
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/ask/stream") {
    const raw = await readBody(req);
    let body: { prompt?: string; model?: string; provider?: string; account?: string };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      json(res, 400, { error: { message: tr("先写一句要问的话") } });
      return true;
    }
    const started = Date.now();
    const streamed = await routeStream(
      store,
      {
        model: body.model?.trim() || store.data.settings.defaultModel || "auto",
        provider: body.provider?.trim() || undefined,
        account: body.account?.trim() || undefined,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      },
      fetchFn,
      Date.now(),
      "ask",
    );
    if (!streamed.ok || !streamed.response?.body) {
      json(res, 200, { ok: false, ms: Date.now() - started, error: streamed.exhaustion ?? tr("请求失败") });
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const via = streamed.account ? `${streamed.account.provider}/${streamed.account.name}` : "";
    const model = streamed.model || "";
    writeSse(res, "meta", { via, model });
    await pipeAskStream(streamed.response, res, started);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/accounts") {
    const raw = await readBody(req);
    let body: {
      provider?: string;
      apiKey?: string;
      name?: string;
      baseUrl?: string;
      note?: string;
      preferredModel?: string;
      models?: string[] | string;
      skipVerify?: boolean;
      free?: boolean;
      boost?: boolean;
      rpm?: unknown;
      rpd?: unknown;
    };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      const out = await panelAdd(
        store,
        {
          provider: String(body.provider ?? ""),
          apiKey: String(body.apiKey ?? ""),
          name: body.name ? String(body.name) : undefined,
          baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
          note: body.note ? String(body.note) : undefined,
          preferredModel: body.preferredModel ? String(body.preferredModel) : undefined,
          models: body.models == null
            ? undefined
            : Array.isArray(body.models)
              ? body.models.map(String)
              : String(body.models).split(/[\n,]+/),
          skipVerify: Boolean(body.skipVerify),
          free: body.free !== false,
          boost: Boolean(body.boost),
          rpm: body.rpm,
          rpd: body.rpd,
        },
        fetchFn,
      );
      json(res, 200, out);
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname.endsWith("/models") && url.pathname.startsWith("/api/panel/accounts/")) {
    const ref = decodeURIComponent(url.pathname.slice("/api/panel/accounts/".length).replace(/\/models$/, ""));
    try {
      json(res, 200, { account: await panelRefreshModels(store, ref, fetchFn) });
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "GET" && url.pathname.endsWith("/key") && url.pathname.startsWith("/api/panel/accounts/")) {
    const ref = decodeURIComponent(url.pathname.slice("/api/panel/accounts/".length).replace(/\/key$/, ""));
    try {
      json(res, 200, await panelRevealKey(store, ref));
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "PATCH" && url.pathname.startsWith("/api/panel/accounts/")) {
    const ref = decodeURIComponent(url.pathname.slice("/api/panel/accounts/".length));
    const raw = await readBody(req);
    let body: {
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
    };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      if (body.apiKey !== undefined) {
        const key = String(body.apiKey).trim();
        if (!key) delete body.apiKey;
        else {
          body.apiKey = key;
          await assertLocalOwner(tr("FreeAll 要更换账号 API Key"));
        }
      }
      json(res, 200, { account: panelUpdate(store, ref, body) });
    } catch (error) {
      json(res, 404, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/panel/accounts/")) {
    const ref = decodeURIComponent(url.pathname.slice("/api/panel/accounts/".length));
    try {
      json(res, 200, panelRemove(store, ref));
    } catch (error) {
      json(res, 404, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/sync/export") {
    const raw = await readBody(req);
    let body: { pass?: string; keepToken?: boolean };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      json(res, 200, await panelExport(store, Boolean(body.keepToken)));
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/panel/sync/import") {
    const raw = await readBody(req);
    let body: { pack?: string; pass?: string; replace?: boolean };
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: { message: tr("JSON 无法解析") } });
      return true;
    }
    try {
      if (!body.pack) throw new Error(tr("先选一个同步包"));
      const out = await panelImport(store, body.pack, Boolean(body.replace));
      json(res, 200, { ...out, state: panelState(store) });
    } catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }
  json(res, 404, { error: { message: tr("不支持 {0} {1}", req.method, url.pathname) } });
  return true;
}

function authorize(store: Store, req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const xKey = String(req.headers["x-api-key"] ?? "").trim();
  const token = store.data.settings.gatewayToken;
  return bearer === token || xKey === token;
}

function headerText(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

function listGatewayModels(store: Store) {
  const ids = new Set<string>(["auto"]);
  const freeOnly = Boolean(store.data.settings.policy?.freeOnly);
  for (const account of store.data.accounts.filter((a) => a.enabled && (!freeOnly || accountIsFree(a)))) {
    ids.add(account.provider);
    ids.add(`${account.provider}/${account.name}`);
    for (const model of accountModelChoices(account, freeOnly)) {
      ids.add(model);
      ids.add(`${account.provider}/${model}`);
    }
  }
  return {
    object: "list",
    data: [...ids].map((id) => ({ id, object: "model", owned_by: "freeall" })),
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function pipeRaw(upstream: Response, res: ServerResponse): Promise<void> {
  const body = upstream.body;
  if (!body) {
    res.end();
    return;
  }
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function pipeAskStream(upstream: Response, res: ServerResponse, started: number): Promise<void> {
  const body = upstream.body;
  if (!body) {
    writeSse(res, "error", { error: tr("上游没有返回内容") });
    res.end();
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let leftover = "";
  let text = "";
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      leftover += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = leftover.split(/\r?\n/);
      leftover = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const piece = json.choices?.[0]?.delta?.content ?? "";
          if (piece) {
            text += piece;
            writeSse(res, "delta", { text: piece });
          }
          if (json.usage) {
            if (json.usage.prompt_tokens != null) promptTokens = Number(json.usage.prompt_tokens) || 0;
            if (json.usage.completion_tokens != null) completionTokens = Number(json.usage.completion_tokens) || 0;
          }
        } catch {
          // ignore malformed chunks
        }
      }
      if (done) break;
    }
    const ms = Date.now() - started;
    if (completionTokens == null && text) completionTokens = Math.max(1, Math.ceil(text.length / 4));
    const tokPerSec =
      completionTokens && ms > 0 ? Math.round((completionTokens / (ms / 1000)) * 10) / 10 : null;
    writeSse(res, "done", {
      ok: true,
      text,
      ms,
      ...(promptTokens != null ? { promptTokens } : {}),
      ...(completionTokens != null ? { completionTokens } : {}),
      tokPerSec,
    });
  } catch (error) {
    writeSse(res, "error", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
}

async function pipeOpenAIToAnthropic(upstream: Response, res: ServerResponse, model: string): Promise<void> {
  res.write(anthropicPreamble(model));
  const body = upstream.body;
  if (!body) {
    res.write(anthropicClose());
    res.end();
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let leftover = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      leftover += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = leftover.split(/\r?\n/);
      leftover = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const delta = openAISseDelta(line);
        if (delta) res.write(anthropicDelta(delta));
      }
      if (done) break;
    }
  } finally {
    res.write(anthropicClose());
    res.end();
  }
}
