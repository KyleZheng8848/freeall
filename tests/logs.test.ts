import assert from "node:assert/strict";
import { test } from "node:test";
import { hourBuckets, summarizeLogs, usageFromJson } from "../src/logs.js";
import { panelState } from "../src/panel-data.js";
import { routeChat } from "../src/router.js";
import { addPlain, jsonResponse, mockFetch, tempStore } from "./helpers.js";

test("usageFromJson reads prompt/completion/finish", () => {
  const u = usageFromJson({
    choices: [{ finish_reason: "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
  });
  assert.deepEqual(u, { promptTokens: 12, completionTokens: 34, totalTokens: 46, finishReason: "stop" });
});

test("summarizeLogs and hourBuckets roll up generations", () => {
  const now = Date.parse("2026-09-02T12:00:00+08:00");
  const logs = [
    { id: "a", at: now - 30 * 60 * 1000, accountId: "1", provider: "openrouter" as const, accountName: "main", model: "x:free", ok: true, ms: 200, promptTokens: 2, completionTokens: 10, totalTokens: 12, source: "ask" as const, hops: 1 },
    { id: "b", at: now - 90 * 60 * 1000, accountId: "1", provider: "openrouter" as const, accountName: "main", model: "x:free", ok: false, ms: 80, promptTokens: 2, completionTokens: 0, totalTokens: 0, source: "openai" as const, hops: 1 },
  ];
  const sum = summarizeLogs(logs);
  assert.equal(sum.requests, 2);
  assert.equal(sum.ok, 1);
  assert.equal(sum.fail, 1);
  assert.equal(sum.tokens, 12);
  const buckets = hourBuckets(logs, now - 3 * 60 * 60 * 1000, now);
  assert.ok(buckets.some((b) => b.n === 1 && b.ok === 1));
  assert.ok(buckets.some((b) => b.n === 1 && b.ok === 0));
});

test("routeChat writes a generation log", async () => {
  const { store, dispose } = tempStore();
  try {
    addPlain(store, "groq", "work", "k1").status = "healthy";
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/chat/completions")) {
        return jsonResponse(200, {
          choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
        });
      }
      return jsonResponse(404, {});
    });
    const out = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn, Date.now(), "ask");
    assert.equal(out.ok, true);
    assert.equal(store.data.logs.length, 1);
    const log = store.data.logs[0]!;
    assert.equal(log.ok, true);
    assert.equal(log.source, "ask");
    assert.equal(log.totalTokens, 8);
    assert.equal(log.completionTokens, 5);
    assert.equal(log.finishReason, "stop");
    assert.equal(log.accountName, "work");
    const state = panelState(store);
    assert.equal(state.usage.from, "logs");
    assert.equal(state.usage.today.requests, 1);
    assert.equal(state.usage.today.ok, 1);
    assert.equal(state.usage.today.tokens, 8);
    assert.equal(state.logs.length, 1);
  } finally {
    dispose();
  }
});

test("failed hop is not logged when a later hop succeeds", async () => {
  const { store, dispose } = tempStore();
  try {
    const first = addPlain(store, "groq", "empty", "k1");
    first.status = "healthy";
    first.priority = 1; // Equal-priority accounts are intentionally randomized.
    addPlain(store, "groq", "full", "k2").status = "healthy";
    let hits = 0;
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/chat/completions")) {
        hits += 1;
        if (hits === 1) return jsonResponse(429, { error: { message: "rate limited" } });
        return jsonResponse(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { total_tokens: 4 } });
      }
      return jsonResponse(404, {});
    });
    await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn, Date.now(), "openai");
    assert.equal(store.data.logs.length, 1);
    assert.equal(store.data.logs[0]?.ok, true);
    assert.equal(store.data.logs[0]?.source, "openai");
    assert.equal(store.data.logs[0]?.accountName, "full");
    assert.equal(store.data.logs[0]?.hops, 2);
  } finally {
    dispose();
  }
});

test("pinned model 429 falls back to auto and logs the winner", async () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "openrouter", "8848", "k1");
    acc.status = "healthy";
    acc.preferredModel = "openrouter/free";
    acc.models = ["openrouter/free", "z-ai/glm-5.2:free"];
    const seen: string[] = [];
    const fetchFn = mockFetch((_url, init) => {
      if (String(_url).includes("/chat/completions")) {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { model?: string }) : {};
        seen.push(String(body.model));
        if (body.model === "z-ai/glm-5.2:free") {
          return jsonResponse(429, { error: { message: "Provider returned error" } });
        }
        return jsonResponse(200, {
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        });
      }
      return jsonResponse(404, {});
    });
    const out = await routeChat(
      store,
      { model: "z-ai/glm-5.2:free", messages: [{ role: "user", content: "hi" }] },
      fetchFn,
      Date.now(),
      "ask",
    );
    assert.equal(out.ok, true);
    assert.equal(out.model, "openrouter/free");
    assert.deepEqual(seen, ["z-ai/glm-5.2:free", "openrouter/free"]);
    assert.equal(store.data.logs.length, 1);
    assert.equal(store.data.logs[0]?.ok, true);
    assert.equal(store.data.logs[0]?.model, "openrouter/free");
    assert.equal(store.data.logs[0]?.hops, 2);
    assert.equal(store.data.cooldowns.length, 0);
  } finally {
    dispose();
  }
});

test("pin then auto both fail logs only the last model", async () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "openrouter", "8848", "k1");
    acc.status = "healthy";
    acc.preferredModel = "openrouter/free";
    const fetchFn = mockFetch((url) => {
      if (url.includes("/chat/completions")) {
        return jsonResponse(429, { error: { message: "Provider returned error" } });
      }
      return jsonResponse(404, {});
    });
    const out = await routeChat(
      store,
      { model: "z-ai/glm-5.2:free", messages: [{ role: "user", content: "hi" }] },
      fetchFn,
      Date.now(),
      "ask",
    );
    assert.equal(out.ok, false);
    assert.match(out.exhaustion ?? "", /已改 auto|auto/);
    assert.equal(store.data.logs.length, 1);
    assert.equal(store.data.logs[0]?.ok, false);
    assert.equal(store.data.logs[0]?.model, "openrouter/free");
    assert.equal(store.data.logs[0]?.hops, 2);
    assert.equal(store.data.cooldowns.length, 1);
  } finally {
    dispose();
  }
});

test("policy.account only uses that key", async () => {
  const { store, dispose } = tempStore();
  try {
    addPlain(store, "openrouter", "8848", "k1").status = "healthy";
    addPlain(store, "openrouter", "56", "k2").status = "healthy";
    const fetchFn = mockFetch((url) => {
      if (url.includes("/chat/completions")) {
        return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
      }
      return jsonResponse(404, {});
    });
    store.data.settings.policy = { providers: [], model: "auto", account: "openrouter/56" };
    const pinned = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(pinned.ok, true);
    assert.equal(pinned.account?.name, "56");
    const override = await routeChat(
      store,
      { account: "openrouter/8848", messages: [{ role: "user", content: "hi" }] },
      fetchFn,
    );
    assert.equal(override.account?.name, "8848");
  } finally {
    dispose();
  }
});
