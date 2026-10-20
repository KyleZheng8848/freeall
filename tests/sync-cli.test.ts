import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { isDirectCli, parseArgs } from "../src/cli.js";
import { anthropicToOpenAI, extractText, openAIToAnthropic } from "../src/anthropic.js";
import { importMerge, importReplace, readExport, writeExport } from "../src/sync.js";
import { addPlain, tempStore } from "./helpers.js";

test("direct cli entry follows npm-link style symlinks", () => {
  const dir = mkdtempSync(join(tmpdir(), "freeall-bin-"));
  const real = join(dir, "cli.js");
  const link = join(dir, "freeall");
  writeFileSync(real, "export {};\n");
  symlinkSync(real, link);
  const url = pathToFileURL(real).href;
  try {
    assert.equal(isDirectCli(link, url), true);
    assert.equal(isDirectCli(real, url), true);
    assert.equal(isDirectCli(join(dir, "other"), url), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseArgs keeps command and dashed flags", () => {
  const opts = parseArgs(["add", "groq", "--name", "work", "--skip-verify", "--base-url", "https://x/v1"]);
  assert.equal(opts.command, "add");
  assert.deepEqual(opts.args, ["groq"]);
  assert.equal(opts.flags.name, "work");
  assert.equal(opts.flags.skipverify, true);
  assert.equal(opts.flags.baseurl, "https://x/v1");
});

test("sync export is encrypted and merge keeps extra local account", () => {
  const dir = mkdtempSync(join(tmpdir(), "freeall-sync-"));
  const file = join(dir, "pack.json");
  const a = tempStore();
  const b = tempStore();
  try {
    addPlain(a.store, "groq", "work", "key-a");
    addPlain(b.store, "groq", "home", "key-b");
    writeExport(a.store, file, "password1");
    const raw = readFileSync(file, "utf8");
    assert.equal(raw.includes("key-a"), false);
    const payload = readExport(file, "password1");
    assert.equal(payload.accounts[0]?.apiKey, "key-a");
    const merged = importMerge(b.store, payload);
    assert.equal(merged.added, 1);
    assert.equal(b.store.data.accounts.length, 2);
    a.store.recordUsage({ accountId: a.store.data.accounts[0]!.id, kind: "tokens", tokens: 77, at: Date.now() });
    writeExport(a.store, file, "password1");
    const again = readExport(file, "password1");
    importMerge(b.store, again);
    const localWork = b.store.data.accounts.find((x) => x.name === "work");
    assert.ok(localWork);
    assert.ok(b.store.data.usage.some((e) => e.accountId === localWork.id && e.tokens === 77));
    importReplace(b.store, payload);
    assert.equal(b.store.data.accounts.length, 1);
    assert.equal(b.store.data.accounts[0]?.name, "work");
  } finally {
    a.dispose();
    b.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wrong passphrase cannot open pack", () => {
  const dir = mkdtempSync(join(tmpdir(), "freeall-sync-"));
  const file = join(dir, "pack.json");
  const a = tempStore();
  try {
    addPlain(a.store, "groq", "work", "key-a");
    writeExport(a.store, file, "password1");
    assert.throws(() => readExport(file, "password2"));
  } finally {
    a.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("anthropic mapping roundtrip text", () => {
  const req = anthropicToOpenAI({
    model: "claude-sonnet",
    system: "be brief",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  });
  assert.equal(req.messages[0]?.content, "be brief");
  assert.equal(req.messages[1]?.content, "hi");
  const back = openAIToAnthropic({ choices: [{ message: { content: "yo" } }] }, "auto");
  assert.equal(extractText({ choices: [{ message: { content: "yo" } }] }), "yo");
  assert.equal(back.content[0]?.text, "yo");
});
