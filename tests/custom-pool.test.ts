import assert from "node:assert/strict";
import { test } from "node:test";
import { accountBaseUrl, persistWorkingBaseUrl } from "../src/catalog.js";
import { panelState, panelUpdate } from "../src/panel-data.js";
import { parseProviders } from "../src/policy.js";
import { candidates } from "../src/router.js";
import { addPlain, tempStore } from "./helpers.js";

test("persistWorkingBaseUrl keeps custom base without catalog lookup", () => {
  const account = { provider: "custom" as const, baseUrl: "http://bad.local/v1" };
  persistWorkingBaseUrl(account, "http://127.0.0.1:11434/v1/");
  assert.equal(account.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(accountBaseUrl(account), "http://127.0.0.1:11434/v1");
});

test("panelUpdate can fix custom baseUrl and hand-fill models", () => {
  const { store, dispose } = tempStore();
  try {
    const acc = store.addAccount({
      name: "local",
      provider: "custom",
      apiKey: "sk-local",
      baseUrl: "http://wrong.example/v1",
    });
    acc.status = "healthy";
    const row = panelUpdate(store, acc.id, {
      baseUrl: "http://127.0.0.1:11434/v1",
      preferredModel: "llama3.2",
      models: ["llama3.2", "qwen2.5"],
      enabled: true,
    });
    assert.equal(store.find(acc.id)?.baseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(store.find(acc.id)?.preferredModel, "llama3.2");
    assert.deepEqual(store.find(acc.id)?.models, ["llama3.2", "qwen2.5"]);
    assert.equal(row.baseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(row.preferredModel, "llama3.2");
    assert.ok(row.models.includes("llama3.2"));
    assert.ok(row.keyHint);
    assert.equal(row.keyHint.includes(store.secret(acc)), false);
    const state = panelState(store);
    assert.equal(state.accounts.find((a) => a.id === acc.id)?.baseUrl, "http://127.0.0.1:11434/v1");
  } finally {
    dispose();
  }
});

test("panelUpdate and reveal can rotate API key", async () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "groq", "work", "sk-old-key-aaaa");
    acc.status = "healthy";
    const before = panelState(store).accounts.find((a) => a.id === acc.id);
    assert.ok(before?.keyHint);
    assert.equal(before?.keyHint.includes("sk-old-key-aaaa"), false);
    assert.equal(store.secret(acc), "sk-old-key-aaaa");
    panelUpdate(store, acc.id, { apiKey: "sk-new-key-bbbb" });
    assert.equal(store.secret(acc), "sk-new-key-bbbb");
    const { panelRevealKey } = await import("../src/panel-data.js");
    const revealed = await panelRevealKey(store, acc.id);
    assert.equal(revealed.apiKey, "sk-new-key-bbbb");
    assert.equal(revealed.hint.includes("sk-new-key-bbbb"), false);
  } finally {
    dispose();
  }
});

test("candidates hard-filter specified model instead of soft fallback", () => {
  const { store, dispose } = tempStore();
  try {
    const a = addPlain(store, "groq", "g1");
    a.status = "healthy";
    a.models = ["llama-3.3-70b-versatile"];
    a.preferredModel = "llama-3.3-70b-versatile";
    const pool = candidates(store, undefined, Date.now(), "totally-unknown-model");
    assert.deepEqual(pool, []);
  } finally {
    dispose();
  }
});

test("specified model overrides provider scope when only custom declares it", () => {
  const { store, dispose } = tempStore();
  try {
    const or = addPlain(store, "openrouter", "8848");
    or.status = "healthy";
    or.free = true;
    or.models = ["openrouter/free"];
    const custom = store.addAccount({
      name: "custom-work",
      provider: "custom",
      apiKey: "sk-test-custom",
      baseUrl: "https://example.invalid/v1",
      free: true,
    });
    custom.status = "healthy";
    custom.models = ["custom-flash"];
    custom.preferredModel = "custom-flash";
    store.data.settings.policy = { providers: ["openrouter"], model: "auto", freeOnly: true };
    const pool = candidates(store, undefined, Date.now(), "custom-flash");
    assert.equal(pool.length, 1);
    assert.equal(pool[0]?.name, "custom-work");
  } finally {
    dispose();
  }
});

test("parseProviders accepts custom", () => {
  assert.deepEqual(parseProviders("custom,groq"), ["custom", "groq"]);
});
