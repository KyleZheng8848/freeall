import assert from "node:assert/strict";
import { test } from "node:test";
import { opencodeConfigContent, recipeBody, useCommand } from "../src/recipes.js";

const g = {
  url: "http://127.0.0.1:8787",
  openaiBase: "http://127.0.0.1:8787/v1",
  token: "freeall_test",
  model: "auto",
};

test("part2 use commands match the agent names", () => {
  assert.equal(useCommand("curl"), null);
  assert.equal(useCommand("freeall"), "freeall ask 你好");
  assert.equal(useCommand("claude"), "freeall use claude");
  assert.equal(useCommand("codex"), "freeall use codex");
  assert.equal(useCommand("opencode"), "freeall use opencode");
});

test("recipe bodies are copyable commands", () => {
  assert.match(recipeBody("freeall", g), /\/v1\/ask/);
  assert.match(recipeBody("curl", g), /curl http:\/\/127.0.0.1:8787\/v1\/chat\/completions/);
  assert.match(recipeBody("openai", g), /OPENAI_BASE_URL=/);
  assert.match(recipeBody("openai", g), /chat\/completions/);
  assert.match(recipeBody("anthropic", g), /\/v1\/messages/);
  assert.match(recipeBody("anthropic", g), /ANTHROPIC_API_KEY=/);
  assert.match(recipeBody("anthropic", g), /x-api-key/);
  assert.match(recipeBody("claude", g), /ANTHROPIC_AUTH_TOKEN=freeall_test/);
  assert.match(recipeBody("codex", g), /model_provider="freeall"/);
  assert.match(recipeBody("opencode", g), /OPENCODE_CONFIG_CONTENT=/);
  assert.match(recipeBody("opencode", g), /opencode -m freeall\/auto/);
  assert.match(recipeBody("opencode", g), /@ai-sdk\/openai-compatible/);
  assert.equal(recipeBody("opencode", g).includes("freeall_test"), true);
});

test("recipe bodies follow try-it overrides", () => {
  const pinned = { ...g, model: "openrouter/free", provider: "openrouter", account: "openrouter/8848" };
  const body = recipeBody("freeall", pinned);
  assert.match(body, /"model":"openrouter\/free"/);
  assert.match(body, /X-FreeAll-Provider: openrouter/);
  assert.match(body, /X-FreeAll-Account: openrouter\/8848/);
  assert.match(body, /"provider":"openrouter"/);
  assert.match(useCommand("freeall", pinned)!, /--provider openrouter/);
  assert.match(useCommand("freeall", pinned)!, /--model openrouter\/free/);
  assert.match(recipeBody("openai", pinned), /"model":"openrouter\/free"/);
  assert.match(recipeBody("codex", pinned), /model="openrouter\/free"/);
});

test("opencode config points at the local gateway without baking the token", () => {
  const raw = opencodeConfigContent(g, ["openrouter/free"]);
  const cfg = JSON.parse(raw) as {
    model: string;
    provider: { freeall: { options: { baseURL: string; apiKey: string }; models: Record<string, { name: string }> } };
  };
  assert.equal(cfg.model, "freeall/auto");
  assert.equal(cfg.provider.freeall.options.baseURL, "http://127.0.0.1:8787/v1");
  assert.equal(cfg.provider.freeall.options.apiKey, "{env:OPENAI_API_KEY}");
  assert.equal("auto" in cfg.provider.freeall.models, true);
  assert.equal("openrouter/free" in cfg.provider.freeall.models, true);
  assert.equal(raw.includes("freeall_test"), false);
});
