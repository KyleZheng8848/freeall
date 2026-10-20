import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFreeAutoAttempts,
  effectiveFreeModels,
  FREE_AUTO,
  getFreeEntry,
  isFreeModel,
  mergeProbeModels,
  patchFreeEntry,
  setProviderFreeModels,
} from "../src/free-models.js";
import { effectiveModel, accountIsFree } from "../src/policy.js";
import { panelRefreshFreeModels, panelUpdateFreeModels } from "../src/panel-data.js";
import { candidates } from "../src/router.js";
import { addPlain, tempStore } from "./helpers.js";

test("accountIsFree is user-config only (default true, free:false paid)", () => {
  assert.equal(accountIsFree({}), true);
  assert.equal(accountIsFree({ free: true }), true);
  assert.equal(accountIsFree({ free: false }), false);
});

test("free list: manual first, then models, excluded dropped; seeds when empty", () => {
  const entry = patchFreeEntry(
    { models: ["b", "c", "a"], manual: ["z", "b"], excluded: ["c"] },
    {},
  );
  assert.deepEqual(effectiveFreeModels(entry, "groq"), ["z", "b", "a"]);
  const empty = effectiveFreeModels({ models: [], manual: [], excluded: [] }, "openrouter");
  assert.ok(empty.length > 0);
  assert.ok(empty.every((id) => id.endsWith(":free") || id.includes("free")));
});

test("mergeProbeModels keeps excluded and manual order", () => {
  const base = { models: ["old"], manual: ["pin"], excluded: ["skip-me"] };
  const next = mergeProbeModels(base, "openrouter", ["pin", "skip-me", "meta/llama-3.3-70b-instruct:free", "paid/model"]);
  assert.ok(next.manual.includes("pin"));
  assert.ok(!next.models.includes("skip-me"));
  assert.ok(!next.manual.includes("skip-me"));
  assert.ok(next.models.includes("meta/llama-3.3-70b-instruct:free") || next.manual.includes("meta/llama-3.3-70b-instruct:free"));
});

test("freeOnly maps to free-auto via effectiveModel", () => {
  assert.equal(effectiveModel("auto", { providers: [], model: "auto", freeOnly: true }), FREE_AUTO);
  assert.equal(effectiveModel("auto", { providers: [], model: FREE_AUTO, freeOnly: false }), FREE_AUTO);
  assert.equal(effectiveModel("gpt-x", { providers: [], model: "auto", freeOnly: true }), "gpt-x");
});

test("buildFreeAutoAttempts: provider → free list → priority", () => {
  const { store, dispose } = tempStore();
  try {
    store.data.settings.policy = { providers: ["groq", "openrouter"], model: FREE_AUTO, freeOnly: true };
    setProviderFreeModels(store.data.settings, "groq", {
      models: ["llama-3.3-70b-versatile"],
      manual: ["llama-3.1-8b-instant"],
      excluded: [],
    });
    setProviderFreeModels(store.data.settings, "openrouter", {
      models: ["meta/llama-3.3-70b-instruct:free"],
      manual: [],
      excluded: [],
    });

    const low = addPlain(store, "groq", "low");
    low.status = "healthy";
    low.free = true;
    low.priority = 1;
    low.models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];

    const high = addPlain(store, "groq", "high");
    high.status = "healthy";
    high.free = true;
    high.priority = 10;
    high.models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];

    const or = addPlain(store, "openrouter", "or1");
    or.status = "healthy";
    or.free = true;
    or.models = ["meta/llama-3.3-70b-instruct:free"];

    const paid = addPlain(store, "groq", "paid");
    paid.status = "healthy";
    paid.free = false;
    paid.priority = 99;
    paid.models = ["llama-3.1-8b-instant"];

    const steps = buildFreeAutoAttempts(store, store.data.settings.policy, [low, high, or, paid]);
    assert.ok(steps.length >= 3);
    // first free-list model on groq: manual llama-3.1-8b-instant, higher priority first
    assert.equal(steps[0].provider, "groq");
    assert.equal(steps[0].model, "llama-3.1-8b-instant");
    assert.equal(steps[0].account.name, "high");
    assert.equal(steps[1].model, "llama-3.1-8b-instant");
    assert.equal(steps[1].account.name, "low");
    // paid free:false never appears
    assert.ok(!steps.some((s) => s.account.name === "paid"));
    // after groq list, openrouter
    const orStep = steps.find((s) => s.provider === "openrouter");
    assert.ok(orStep);
    assert.equal(orStep!.model, "meta/llama-3.3-70b-instruct:free");
  } finally {
    dispose();
  }
});

test("named paid model excludes free accounts", () => {
  const { store, dispose } = tempStore();
  try {
    const freeAcc = addPlain(store, "groq", "freeie");
    freeAcc.status = "healthy";
    freeAcc.free = true;
    freeAcc.models = ["premium-model", "llama-3.1-8b-instant"];
    freeAcc.preferredModel = "premium-model";

    const paidAcc = addPlain(store, "groq", "payer");
    paidAcc.status = "healthy";
    paidAcc.free = false;
    paidAcc.models = ["premium-model"];
    paidAcc.preferredModel = "premium-model";

    // mark premium as not free in registry
    setProviderFreeModels(store.data.settings, "groq", {
      models: ["llama-3.1-8b-instant"],
      manual: [],
      excluded: ["premium-model"],
    });
    assert.equal(isFreeModel("groq", "premium-model", store.data.settings), false);

    const pool = candidates(store, undefined, Date.now(), "premium-model");
    assert.deepEqual(
      pool.map((a) => a.name),
      ["payer"],
    );
  } finally {
    dispose();
  }
});

test("panelUpdateFreeModels / refresh persist manual and excluded", () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "groq", "g1");
    acc.status = "healthy";
    acc.models = ["llama-3.1-8b-instant", "mystery-paid"];
    panelUpdateFreeModels(store, "groq", {
      manual: "hand-first\nllama-3.1-8b-instant",
      excluded: "mystery-paid",
    });
    const entry = getFreeEntry(store.data.settings, "groq");
    assert.deepEqual(entry.manual, ["hand-first", "llama-3.1-8b-instant"]);
    assert.ok(entry.excluded.includes("mystery-paid"));

    panelRefreshFreeModels(store, "groq");
    const after = getFreeEntry(store.data.settings, "groq");
    assert.ok(after.manual.includes("hand-first"));
    assert.ok(after.excluded.includes("mystery-paid"));
    assert.ok(!after.models.includes("mystery-paid"));
  } finally {
    dispose();
  }
});
