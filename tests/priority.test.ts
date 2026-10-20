import assert from "node:assert/strict";
import { test } from "node:test";
import { panelState, panelUpdate } from "../src/panel-data.js";
import { accountPriority, candidates, normalizePriority } from "../src/router.js";
import { addPlain, tempStore } from "./helpers.js";

test("normalizePriority clamps to -99..99", () => {
  assert.equal(normalizePriority(12.7), 12);
  assert.equal(normalizePriority(999), 99);
  assert.equal(normalizePriority(-999), -99);
  assert.equal(normalizePriority(""), 0);
  assert.equal(accountPriority({}), 0);
  assert.equal(accountPriority({ priority: 3 }), 3);
});

test("candidates prefer higher priority first", () => {
  const { store, dispose } = tempStore();
  try {
    const low = addPlain(store, "groq", "low");
    const high = addPlain(store, "groq", "high");
    const mid = addPlain(store, "groq", "mid");
    for (const a of [low, high, mid]) a.status = "healthy";
    low.priority = 0;
    mid.priority = 5;
    high.priority = 10;
    for (let i = 0; i < 15; i += 1) {
      const pool = candidates(store, "groq");
      assert.equal(pool[0]?.name, "high");
      assert.deepEqual(
        new Set(pool.map((a) => a.name)),
        new Set(["high", "mid", "low"]),
      );
    }
  } finally {
    dispose();
  }
});

test("same priority randomly leads", () => {
  const { store, dispose } = tempStore();
  try {
    const a = addPlain(store, "groq", "a");
    const b = addPlain(store, "groq", "b");
    const c = addPlain(store, "groq", "c");
    for (const x of [a, b, c]) {
      x.status = "healthy";
      x.priority = 3;
    }
    c.priority = 0;
    const leaders = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      leaders.add(candidates(store, "groq")[0]!.name);
    }
    assert.ok(leaders.has("a"));
    assert.ok(leaders.has("b"));
    assert.equal(leaders.has("c"), false);
  } finally {
    dispose();
  }
});

test("panelUpdate persists priority into state", () => {
  const { store, dispose } = tempStore();
  try {
    const acc = addPlain(store, "groq", "p1");
    acc.status = "healthy";
    panelUpdate(store, acc.id, { priority: 7 });
    assert.equal(store.find(acc.id)?.priority, 7);
    assert.equal(panelState(store).accounts.find((row) => row.id === acc.id)?.priority, 7);
  } finally {
    dispose();
  }
});
