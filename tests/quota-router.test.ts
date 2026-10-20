import assert from "node:assert/strict";
import { test } from "node:test";
import { accountModelChoices, modelSequence, parseModelRef, resolveAccountModel } from "../src/catalog.js";
import { describeUpstreamError } from "../src/client.js";
import { remainingHint, wouldExceed, windowUse, patchAccountLimits, accountLimits } from "../src/quota.js";
import { blockedReasons, candidates, routeChat, verifyAccount } from "../src/router.js";
import { isQuotaProbe } from "../src/probe.js";
import { addPlain, jsonResponse, mockFetch, tempStore } from "./helpers.js";

test("windowUse only counts one account", () => {
  const now = 1_000_000;
  const use = windowUse(
    [
      { accountId: "a", kind: "request", tokens: 0, at: now },
      { accountId: "b", kind: "request", tokens: 0, at: now },
      { accountId: "a", kind: "tokens", tokens: 40, at: now },
    ],
    "a",
    now - 10,
  );
  assert.deepEqual(use, { requests: 1, tokens: 40 });
});

test("wouldExceed rpm", () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "groq", "work");
    for (let i = 0; i < 30; i += 1) {
      store.recordUsage({ accountId: acc.id, kind: "request", tokens: 0, at: Date.now() });
    }
    assert.match(wouldExceed(acc, store.data.usage, 1) ?? "", /RPM/);
    const hint = remainingHint(acc, store.data.usage);
    assert.match(hint.label, /0\/分/);
  } finally {
    dispose();
  }
});

test("candidates skip cooldown/invalid and prefer more remaining", () => {
  const { store, dispose } = tempStore();
  try {
    const work = addPlain(store, "groq", "work");
    const home = addPlain(store, "groq", "home");
    addPlain(store, "groq", "dead").status = "invalid";
    store.setCooldown({ accountId: work.id, until: Date.now() + 60_000, reason: "429" });
    for (let i = 0; i < 10; i += 1) {
      store.recordUsage({ accountId: home.id, kind: "request", tokens: 0, at: Date.now() });
    }
    const pool = candidates(store, "groq");
    assert.deepEqual(pool.map((a) => a.name), ["home"]);
    assert.ok(blockedReasons(store).some((l) => l.includes("dead") && l.includes("不可用")));
    assert.ok(blockedReasons(store).some((l) => l.includes("work") && l.includes("冷却")));
  } finally {
    dispose();
  }
});

test("policy providers failover in listed order", async () => {
  const { store, dispose } = tempStore();
  try {
    addPlain(store, "groq", "g1", "g");
    addPlain(store, "openrouter", "o1", "o").status = "healthy";
    store.data.accounts.find((a) => a.name === "g1")!.status = "healthy";
    store.data.settings.policy = { providers: ["openrouter", "groq"], model: "auto" };
    const seen: string[] = [];
    const fetchFn = mockFetch((url) => {
      if (url.includes("openrouter") && url.endsWith("/chat/completions")) {
        seen.push("openrouter");
        return jsonResponse(429, { error: { message: "rate" } });
      }
      if (url.includes("groq") && url.endsWith("/chat/completions")) {
        seen.push("groq");
        return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
      }
      return jsonResponse(404, {});
    });
    const outcome = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.account?.provider, "groq");
    assert.deepEqual(seen, ["openrouter", "groq"]);
  } finally {
    dispose();
  }
});

test("policy model keeps only matching accounts", () => {
  const { store, dispose } = tempStore();
  try {
    const or = addPlain(store, "openrouter", "o1");
    or.status = "healthy";
    or.models = ["openrouter/free", "z-ai/glm-5.2:free"];
    or.preferredModel = "openrouter/free";
    const groq = addPlain(store, "groq", "g1");
    groq.status = "healthy";
    groq.models = ["llama-3.3-70b-versatile"];
    store.data.settings.policy = { providers: ["openrouter", "groq"], model: "z-ai/glm-5.2:free" };
    const pool = candidates(store, undefined, Date.now(), "z-ai/glm-5.2:free");
    assert.deepEqual(pool.map((a) => a.name), ["o1"]);
  } finally {
    dispose();
  }
});

test("routeChat rotates to next key after 429", async () => {
  const { store, dispose } = tempStore();
  try {
    const empty = addPlain(store, "groq", "empty", "k1");
    const full = addPlain(store, "groq", "full", "k2");
    empty.priority = 10;
    full.priority = 0;
    let hits = 0;
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/chat/completions")) {
        hits += 1;
        if (hits === 1) return jsonResponse(429, { error: { message: "rate limited" } });
        return jsonResponse(200, {
          choices: [{ message: { content: "pong" } }],
          usage: { total_tokens: 9 },
        });
      }
      return jsonResponse(404, {});
    });
    const outcome = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.account?.name, "full");
    assert.equal(hits, 2);
    assert.equal(store.data.cooldowns.length, 1);
  } finally {
    dispose();
  }
});

test("openrouter provider-busy 429 does not freeze the rest of the pool", async () => {
  const { store, dispose } = tempStore();
  try {
    const a = addPlain(store, "openrouter", "a", "k1");
    const b = addPlain(store, "openrouter", "b", "k2");
    a.status = "healthy";
    b.status = "healthy";
    a.priority = 10;
    b.priority = 0;
    let hits = 0;
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/chat/completions")) {
        hits += 1;
        return jsonResponse(429, { error: { message: "Provider returned error" } });
      }
      return jsonResponse(404, {});
    });
    const outcome = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(outcome.ok, false);
    assert.equal(hits, 1);
    assert.match(outcome.exhaustion ?? "", /上游忙/);
    assert.equal(store.data.cooldowns.length, 1);
    assert.equal(store.data.cooldowns.some((c) => c.accountId === a.id), true);
    assert.equal(store.data.cooldowns.some((c) => c.accountId === b.id), false);
  } finally {
    dispose();
  }
});

test("empty pool exhaustion is actionable", async () => {
  const { store, dispose } = tempStore();
  try {
    const outcome = await routeChat(store, { messages: [{ role: "user", content: "hi" }] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.exhaustion ?? "", /freeall add/);
  } finally {
    dispose();
  }
});

test("expired cooldown is selectable again", () => {
  const { store, dispose } = tempStore();
  try {
    const work = addPlain(store, "groq", "work");
    store.setCooldown({ accountId: work.id, until: Date.now() - 1000, reason: "429" });
    assert.equal(work.status, "cooldown");
    const pool = candidates(store, "groq");
    assert.deepEqual(pool.map((a) => a.name), ["work"]);
    assert.equal(store.data.accounts[0]?.status, "healthy");
  } finally {
    dispose();
  }
});

test("verify stores live models and auto uses preferred", async () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "groq", "work");
    const fetchFn = mockFetch((url, init) => {
      if (url.endsWith("/models")) {
        return jsonResponse(200, { data: [{ id: "llama-3.1-8b-instant" }, { id: "llama-3.3-70b-versatile" }] });
      }
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { model?: string } : {};
      return jsonResponse(200, { choices: [{ message: { content: body.model ?? "" } }] });
    });
    const verified = await verifyAccount(store, acc, fetchFn);
    assert.deepEqual(verified.models, ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]);
    assert.equal(acc.preferredModel, "llama-3.3-70b-versatile");
    acc.preferredModel = "llama-3.1-8b-instant";
    store.save();
    const outcome = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.model, "llama-3.1-8b-instant");
  } finally {
    dispose();
  }
});

test("403 models then working chat still counts as healthy", async () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "groq", "work");
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/models")) return jsonResponse(403, { error: { message: "Forbidden" } });
      return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
    });
    const verified = await verifyAccount(store, acc, fetchFn);
    assert.equal(verified.ok, true);
    assert.equal(acc.status, "healthy");
  } finally {
    dispose();
  }
});

test("describeUpstreamError reads Forbidden without dumping JSON", () => {
  const text = describeUpstreamError("groq", 403, JSON.stringify({ error: { message: "Forbidden" } }));
  assert.match(text, /到不了 Groq/);
  assert.equal(text.includes('{"error"'), false);
});

test("siliconflow 401 on .cn then succeeds on .com", async () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "siliconflow", "main");
    const fetchFn = mockFetch((url) => {
      if (url.includes("siliconflow.cn")) {
        return jsonResponse(401, { code: 30014, message: "Token is invalid." });
      }
      if (url.includes("siliconflow.com") && url.endsWith("/models")) {
        return jsonResponse(200, { data: [{ id: "Qwen/Qwen2.5-7B-Instruct" }] });
      }
      return jsonResponse(404, {});
    });
    const verified = await verifyAccount(store, acc, fetchFn);
    assert.equal(verified.ok, true);
    assert.equal(acc.status, "healthy");
    assert.equal(acc.baseUrl, "https://api.siliconflow.com/v1");
    assert.deepEqual(verified.models, ["Qwen/Qwen2.5-7B-Instruct"]);
  } finally {
    dispose();
  }
});

test("describeUpstreamError explains siliconflow empty balance", () => {
  const text = describeUpstreamError(
    "siliconflow",
    402,
    JSON.stringify({ code: 30001, message: "Sorry, your account balance is insufficient" }),
  );
  assert.match(text, /没有注册即送/);
  assert.match(text, /智谱/);
});

test("bare provider id means pin that house and auto model", () => {
  assert.deepEqual(parseModelRef("openrouter"), { provider: "openrouter", model: "auto" });
  assert.deepEqual(parseModelRef("zhipu"), { provider: "zhipu", model: "auto" });
});

test("request provider pins without writing store policy", async () => {
  const { store, dispose } = tempStore();
  try {
    addPlain(store, "groq", "g1", "g").status = "healthy";
    addPlain(store, "openrouter", "o1", "o").status = "healthy";
    store.data.settings.policy = { providers: [], model: "auto" };
    const seen: string[] = [];
    const fetchFn = mockFetch((url, init) => {
      if (url.endsWith("/chat/completions")) {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        seen.push(url.includes("openrouter") ? "openrouter" : url.includes("groq") ? "groq" : url);
        assert.equal(body.provider, undefined);
        assert.equal(body.providers, undefined);
        return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
      }
      return jsonResponse(404, {});
    });
    const outcome = await routeChat(
      store,
      { provider: "openrouter", model: "auto", messages: [{ role: "user", content: "hi" }] },
      fetchFn,
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.account?.provider, "openrouter");
    assert.deepEqual(seen, ["openrouter"]);
    assert.deepEqual(store.data.settings.policy, { providers: [], model: "auto" });
  } finally {
    dispose();
  }
});

test("freeOnly skips paid keys", async () => {
  const { store, dispose } = tempStore();
  try {
    addPlain(store, "groq", "paid", "p").status = "healthy";
    store.data.accounts[0]!.free = false;
    addPlain(store, "openrouter", "free", "f").status = "healthy";
    store.data.settings.policy = { providers: [], model: "auto", freeOnly: true };
    const seen: string[] = [];
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/chat/completions")) {
        seen.push(url.includes("openrouter") ? "openrouter" : "groq");
        return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
      }
      return jsonResponse(404, {});
    });
    const outcome = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.account?.name, "free");
    assert.deepEqual(seen, ["openrouter"]);
  } finally {
    dispose();
  }
});

test("omitted model is auto and follows GUI policy", async () => {
  const { store, dispose } = tempStore();
  try {
    addPlain(store, "groq", "g1", "g").status = "healthy";
    addPlain(store, "openrouter", "o1", "o").status = "healthy";
    store.data.settings.policy = { providers: ["openrouter"], model: "auto" };
    const seen: string[] = [];
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/chat/completions")) {
        seen.push(url.includes("openrouter") ? "openrouter" : "other");
        return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
      }
      return jsonResponse(404, {});
    });
    const outcome = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.account?.provider, "openrouter");
    assert.deepEqual(seen, ["openrouter"]);
  } finally {
    dispose();
  }
});

test("openrouter model list is free-only when asked, full otherwise", () => {
  const account = {
    provider: "openrouter" as const,
    preferredModel: "openrouter/free",
    models: ["openrouter/free", "z-ai/glm-5.2:free", "anthropic/claude-sonnet-4", "openai/gpt-4o"],
  };
  const free = accountModelChoices(account, true);
  const all = accountModelChoices(account, false);
  assert.equal(free.includes("openrouter/free"), true);
  assert.equal(free.includes("z-ai/glm-5.2:free"), true);
  assert.equal(free.includes("openai/gpt-4o"), false);
  assert.equal(all.includes("openai/gpt-4o"), true);
  assert.equal(all.includes("anthropic/claude-sonnet-4"), true);
});

test("openrouter/free is sent as-is; openrouter/auto expands locally", () => {
  assert.deepEqual(parseModelRef("openrouter/free"), { provider: "openrouter", model: "openrouter/free" });
  assert.deepEqual(parseModelRef("openrouter/auto"), { provider: "openrouter", model: "openrouter/auto" });
  assert.deepEqual(parseModelRef("qwen/qwen3-8b:free"), { model: "qwen/qwen3-8b:free" });
  const account = {
    provider: "openrouter" as const,
    preferredModel: "openrouter/free",
    models: ["openrouter/free", "z-ai/glm-5.2:free"],
  };
  assert.equal(resolveAccountModel(account, "auto"), "openrouter/free");
  assert.equal(resolveAccountModel(account, "openrouter/free"), "openrouter/free");
  assert.equal(resolveAccountModel(account, "openrouter/auto"), "z-ai/glm-5.2:free");
  assert.equal(resolveAccountModel(account, "z-ai/glm-5.2:free"), "z-ai/glm-5.2:free");
  assert.equal(resolveAccountModel(account, "claude-sonnet-4"), "claude-sonnet-4");
  assert.equal(resolveAccountModel(account, "claude-sonnet-4", { freeOnly: true }), "openrouter/free");
  assert.deepEqual(modelSequence(account, "z-ai/glm-5.2:free"), [
    { model: "z-ai/glm-5.2:free", kind: "pin" },
    { model: "openrouter/free", kind: "auto" },
  ]);
  assert.deepEqual(modelSequence(account, "auto"), [{ model: "openrouter/free", kind: "auto" }]);
  assert.deepEqual(modelSequence(account, "openrouter/free"), [{ model: "openrouter/free", kind: "auto" }]);
  assert.deepEqual(modelSequence(account, "openrouter/auto"), [{ model: "z-ai/glm-5.2:free", kind: "auto" }]);
  assert.equal(resolveAccountModel(account, "auto", { exclude: ["openrouter/free"] }), "z-ai/glm-5.2:free");
  assert.equal(resolveAccountModel(account, "openrouter/auto", { exclude: ["z-ai/glm-5.2:free"] }), "qwen/qwen3-8b:free");
  assert.deepEqual(modelSequence(account, "auto", { exclude: accountModelChoices(account) }), []);
});

test("auto skips excluded models and explains when none left", async () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "openrouter", "8848", "k1");
    acc.status = "healthy";
    acc.preferredModel = "openrouter/free";
    acc.models = ["openrouter/free", "z-ai/glm-5.2:free"];
    store.data.settings.policy = { providers: [], model: "auto", excludeModels: ["openrouter/free"] };
    const seen: string[] = [];
    const fetchFn = mockFetch((_url, init) => {
      if (String(_url).includes("/chat/completions")) {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { model?: string }) : {};
        seen.push(String(body.model));
        return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
      }
      return jsonResponse(404, {});
    });
    const out = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(out.ok, true);
    assert.equal(out.model, "z-ai/glm-5.2:free");
    assert.deepEqual(seen, ["z-ai/glm-5.2:free"]);

    store.data.settings.policy = { providers: [], model: "auto", excludeModels: accountModelChoices(acc) };
    const empty = await routeChat(store, { messages: [{ role: "user", content: "hi" }] }, fetchFn);
    assert.equal(empty.ok, false);
    assert.match(empty.exhaustion ?? "", /排除/);
    assert.deepEqual(seen, ["z-ai/glm-5.2:free"]);
  } finally {
    dispose();
  }
});

test("describeUpstreamError explains Gemini location block", () => {
  const text = describeUpstreamError(
    "gemini",
    400,
    JSON.stringify({ error: { message: "User location is not supported for the API use." } }),
  );
  assert.match(text, /地区/);
  assert.match(text, /智谱/);
});

test("openrouter credits boost raises local rpd from 50 to 1000", () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "openrouter", "paid");
    const now = Date.now();
    for (let i = 0; i < 50; i += 1) {
      store.recordUsage({ accountId: acc.id, kind: "request", tokens: 0, at: now - 2 * 60_000 - i });
    }
    assert.match(wouldExceed(acc, store.data.usage, 1) ?? "", /RPD 已满 50/);
    patchAccountLimits(acc, { boost: true });
    assert.equal(accountLimits(acc).rpd, 1000);
    assert.equal(wouldExceed(acc, store.data.usage, 1), null);
    assert.match(remainingHint(acc, store.data.usage).label, /950\/日/);
    patchAccountLimits(acc, { rpd: 40 });
    assert.equal(accountLimits(acc).rpd, 40);
    assert.match(wouldExceed(acc, store.data.usage, 1) ?? "", /RPD 已满 40/);
    patchAccountLimits(acc, { boost: false });
    assert.equal(accountLimits(acc).rpd, 50);
  } finally {
    dispose();
  }
});

test("quota probe catches agent pings, not real questions", () => {
  assert.equal(
    isQuotaProbe({ max_tokens: 1, messages: [{ role: "user", content: "quota" }] }),
    true,
  );
  assert.equal(
    isQuotaProbe({ max_tokens: 256, messages: [{ role: "user", content: "quota 是什么" }] }),
    false,
  );
});
