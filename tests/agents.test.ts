import assert from "node:assert/strict";
import { test } from "node:test";
import { exitBanner, hasCommand, installCommands, installHint, launchBanner, missingCliText } from "../src/agents.js";

test("missing Codex CLI text tells you how to install and what to run next", () => {
  const text = missingCliText("codex");
  assert.match(text, /本机没有 codex 命令/);
  assert.match(text, /npm install -g @openai\/codex/);
  assert.match(text, /brew install --cask codex/);
  assert.match(text, /hash -r/);
  assert.match(text, /freeall use codex/);
  assert.match(text, /freeall ask 你好/);
  assert.equal(text.includes("freeall_"), false);
});

test("missing Claude CLI text tells you how to install", () => {
  const text = missingCliText("claude");
  assert.match(text, /npm install -g @anthropic-ai\/claude-code/);
  assert.match(text, /freeall use claude/);
});

test("install remarks pair with the same install commands", () => {
  assert.match(installHint("opencode"), /本机要先有 opencode 命令/);
  assert.equal(installHint("opencode").includes("hash -r"), false);
  assert.equal(installCommands("opencode").includes("npm install -g opencode-ai && hash -r"), true);
  assert.equal(installCommands("codex").includes("brew install --cask codex"), true);
  assert.equal(installHint("claude").includes("npm install"), false);
});

test("missing OpenCode CLI text tells you how to install", () => {
  const text = missingCliText("opencode");
  assert.match(text, /本机没有 opencode 命令/);
  assert.match(text, /npm install -g opencode-ai/);
  assert.match(text, /brew install anomalyco\/tap\/opencode/);
  assert.match(text, /freeall use opencode/);
});

test("launch and exit banners explain the pool and leftover gateway", () => {
  const start = launchBanner("codex", true, "http://127.0.0.1:8787");
  assert.match(start, /已自动拉起本地网关/);
  assert.match(start, /走账号池/);
  assert.match(start, /不扣 ChatGPT/);
  assert.match(start, /freeall stop/);
  assert.equal(start.includes("freeall_"), false);
  assert.match(exitBanner("codex", "http://127.0.0.1:8787"), /已退出/);
  assert.match(launchBanner("claude", false, "http://127.0.0.1:8787"), /网关已在跑/);
  assert.match(launchBanner("opencode", true, "http://127.0.0.1:8787"), /OpenCode CLI/);
});

test("hasCommand sees node and not a fake binary", () => {
  assert.equal(hasCommand("node"), true);
  assert.equal(hasCommand("freeall-not-a-real-cli-zzzz"), false);
});
