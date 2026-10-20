import assert from "node:assert/strict";
import { test } from "node:test";
import { startProxy } from "../src/proxy.js";
import { addPlain, jsonResponse, mockFetch, tempStore } from "./helpers.js";

test("localhost panel lists, adds, and removes accounts", async () => {
  const { store, dispose } = tempStore();
  store.data.settings.port = 0;
  addPlain(store, "groq", "work", "k1");
  const fetchFn = mockFetch((url) => {
    if (url.includes("/models")) {
      return jsonResponse(200, { data: [{ id: "llama-3.3-70b-versatile" }] });
    }
    if (url.includes("/chat/completions")) {
      return jsonResponse(200, { choices: [{ message: { content: "pong" } }], usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 } });
    }
    return jsonResponse(404, {});
  });
  const server = startProxy(store, fetchFn);
  try {
    await onceListen(server);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const root = `http://127.0.0.1:${addr.port}`;

    const page = await fetch(root + "/");
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /mark-ring/);
    assert.match(html, /FreeAll · 看板/);
    assert.match(html, /账号池/);
    assert.match(html, /href="\/logs"/);
    assert.match(html, /近 24 小时/);
    assert.match(html, /id="dashchart"/);
    assert.equal(html.includes("接下游"), false);
    assert.match(html, /href="\/settings"/);
    assert.equal(html.includes("运行状态"), false);
    assert.equal(html.includes('id="homeacc"'), false);
    assert.equal(html.includes('id="vernow"'), false);
    assert.match(html, /试一句/);
    assert.equal(html.includes('id="gateacc"'), false);
    assert.equal(html.includes('id="gatemodels"'), false);
    assert.equal(html.includes("访问令牌 / 端口"), false);
    assert.match(html, /id="askacc"/);
    assert.match(html, /data-query/);
    assert.match(html, /接 Agent/);
    assert.match(html, /data-dock="freeall"/);
    assert.match(html, /data-dock="openai"/);
    assert.match(html, /data-dock="anthropic"/);
    assert.equal(html.includes('data-dock="cursor"'), false);
    assert.equal(html.includes('data-dock="curl"'), false);
    assert.match(html, /data-dock="codex"/);
    assert.match(html, /data-dock="opencode"/);
    assert.match(html, /X-FreeAll-Provider/);
    assert.match(html, /去账号池添加|设置/);
    assert.equal(/<div class="jumps">\s*<a href="\/pool">账号池<\/a>/.test(html), false);

    const settings = await (await fetch(root + "/settings")).text();
    assert.match(settings, /FreeAll · 设置/);
    assert.match(settings, /访问令牌 \/ 端口/);
    assert.match(settings, /id="gateacc"/);
    assert.match(settings, /id="gatemodels"/);
    assert.match(settings, /id="gatex"/);
    assert.match(settings, /可用模型|生效列表/);
    assert.match(settings, /排除模型/);
    assert.match(settings, /id="upd-check"/);
    assert.match(settings, /id="settings-ver"/);
    assert.match(settings, /id="upd-status"/);

    const pool = await (await fetch(root + "/pool")).text();
    assert.match(pool, /账号池/);
    assert.match(pool, /免费档/);
    assert.match(pool, /添加 Key/);
    assert.match(pool, /id="exportopen"/);
    assert.match(pool, /id="importopen"/);
    assert.equal(pool.includes('id="exportdlg"'), false);
    assert.equal(pool.includes('id="exp-pass"'), false);
    assert.match(pool, /id="importdlg"/);
    assert.equal(pool.includes('id="imp-pass"'), false);
    assert.match(pool, /本机解锁（指纹或密码）/);
    {
      const script = pool.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? "";
      assert.ok(script.length > 1000, "panel script missing");
      assert.doesNotMatch(script, /replace\(\/\r/, "template \\r must stay escaped as /\\\\r/");
      const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const { spawnSync } = await import("node:child_process");
      const dir = mkdtempSync(join(tmpdir(), "fa-panel-"));
      const file = join(dir, "panel.js");
      try {
        writeFileSync(file, script);
        const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
        assert.equal(check.status, 0, check.stderr || "panel JS syntax error");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    assert.match(pool, /参与轮换|筛选后|table class="ledger"/);
    assert.match(pool, /id="editdlg"/);
    assert.match(pool, /编辑账号/);
    assert.match(pool, /id="editkey"/);
    assert.match(pool, /id="editkeyshow"/);
    assert.match(pool, /id="editkeycopy"/);
    assert.equal(pool.includes("data-name="), false);
    assert.match(pool, /充过 ≥\$10|本机日限 1000/);

    const tryPage = await (await fetch(root + "/try")).text();
    assert.match(tryPage, /试一句/);
    assert.match(tryPage, /data-query/);
    assert.match(tryPage, /看板/);
    assert.equal(pool.includes('id="trybox"'), false);

    const logsPage = await (await fetch(root + "/logs")).text();
    assert.match(logsPage, /日志/);
    assert.match(logsPage, /id="logtable"/);
    assert.match(logsPage, /id="l-acc"/);
    assert.match(logsPage, /data-range="24"/);
    assert.equal(logsPage.includes('<h2>试一句</h2>'), false);
    assert.equal(pool.includes("id=\"logtable\""), false);

    const connect = await (await fetch(root + "/connect")).text();
    assert.match(connect, /试一句/);
    assert.match(connect, /接 Agent/);
    assert.match(connect, /X-FreeAll-Provider/);
    assert.equal(pool.includes('<h2>接 Agent</h2>'), false);

    const snap = await fetch(root + "/api/panel");
    assert.equal(snap.status, 200);
    const state = (await snap.json()) as { total: number; accounts: Array<{ ref: string }>; gateway: { token: string } };
    assert.equal(state.total, 1);
    assert.equal(state.accounts[0]?.ref, "groq/work");
    assert.ok(state.gateway.token.startsWith("freeall_"));
    const groq = (state as { providers: Array<{ id: string; baseUrl: string }> }).providers.find((p) => p.id === "groq");
    assert.equal(groq?.baseUrl, "https://api.groq.com/openai/v1");

    const added = await fetch(root + "/api/panel/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", name: "main", apiKey: "AIza-test", note: "个人 Gmail" }),
    });
    assert.equal(added.status, 200);
    const body = (await added.json()) as { account: { ref: string; note?: string; models: string[]; preferredModel: string } };
    assert.equal(body.account.ref, "gemini/main");
    assert.equal(body.account.note, "个人 Gmail");
    assert.ok(body.account.models.includes("llama-3.3-70b-versatile"));
    assert.equal(body.account.preferredModel, "llama-3.3-70b-versatile");

    const switched = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("gemini/main"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredModel: "gemini-2.5-flash-lite" }),
    });
    assert.equal(switched.status, 200);
    assert.equal(((await switched.json()) as { account: { preferredModel: string } }).account.preferredModel, "gemini-2.5-flash-lite");

    const patched = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("gemini/main"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "编码备用" }),
    });
    assert.equal(patched.status, 200);
    const row = ((await patched.json()) as { account: { note?: string } }).account;
    assert.equal(row.note, "编码备用");

    const renamed = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("gemini/main"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "studio" }),
    });
    assert.equal(renamed.status, 200);
    assert.equal(((await renamed.json()) as { account: { ref: string; name: string } }).account.ref, "gemini/studio");

    const patched2 = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("gemini/studio"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "改名后还能改" }),
    });
    assert.equal(patched2.status, 200);

    const snap2 = (await (await fetch(root + "/api/panel")).json()) as {
      recipes: {
        claude: string;
        curl: string;
        openai: string;
        anthropic: string;
        freeall: string;
        opencode: string;
        use: { claude: string | null; freeall: string | null; opencode: string | null };
        install: { claude: string; codex: string; opencode: string };
        hint: { openai?: string; anthropic?: string; opencode: string };
      };
      policy: { providers: string[]; model: string };
    };
    assert.match(snap2.recipes.claude, /ANTHROPIC_BASE_URL/);
    assert.match(snap2.recipes.curl, /chat\/completions/);
    assert.match(snap2.recipes.openai, /OPENAI_BASE_URL=/);
    assert.match(snap2.recipes.anthropic, /\/v1\/messages/);
    assert.match(snap2.recipes.hint.openai || "", /OpenAI Chat Completions/);
    assert.match(snap2.recipes.hint.anthropic || "", /Anthropic Messages/);
    assert.match(snap2.recipes.freeall, /\/v1\/ask/);
    assert.equal(snap2.recipes.use.freeall, "freeall ask 你好");
    assert.equal(snap2.recipes.use.claude, "freeall use claude");
    assert.equal(snap2.recipes.use.opencode, "freeall use opencode");
    assert.match(snap2.recipes.opencode, /OPENCODE_CONFIG_CONTENT=/);
    assert.match(snap2.recipes.install.claude, /npm install -g @anthropic-ai\/claude-code/);
    assert.match(snap2.recipes.install.codex, /npm install -g @openai\/codex/);
    assert.match(snap2.recipes.install.codex, /brew install --cask codex/);
    assert.match(snap2.recipes.install.opencode, /npm install -g opencode-ai/);
    assert.match(snap2.recipes.install.opencode, /brew install anomalyco\/tap\/opencode/);
    assert.match(snap2.recipes.hint.opencode, /本机要先有 opencode 命令/);
    assert.match(snap2.recipes.install.opencode, /hash -r/);
    assert.equal("cursor" in snap2.recipes.use, false);
    assert.equal("cursor" in snap2.recipes, false);
    assert.deepEqual(snap2.policy, { providers: [], model: "auto", freeOnly: false });
    assert.equal((await (await fetch(root + "/api/panel")).json() as { accounts: Array<{ free: boolean }> }).accounts[0]?.free, true);

    const native = await fetch(root + "/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.gateway.token}` },
      body: JSON.stringify({ prompt: "hi" }),
    });
    assert.equal(native.status, 200);
    assert.equal(((await native.json()) as { ok: boolean; text?: string }).ok, true);

    const asked = await fetch(root + "/api/panel/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    assert.equal(asked.status, 200);
    const reply = (await asked.json()) as { ok: boolean; text?: string; via?: string; promptTokens?: number; completionTokens?: number; tokPerSec?: number | null };
    assert.equal(reply.ok, true);
    assert.equal(reply.text, "pong");
    assert.match(reply.via ?? "", /gemini\/studio|groq\/work/);
    assert.equal(reply.promptTokens, 8);
    assert.equal(reply.completionTokens, 3);
    assert.ok(typeof reply.tokPerSec === "number" || reply.tokPerSec === null);

    const policy = await fetch(root + "/api/panel/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: ["openrouter", "zhipu"], model: "openrouter/free", freeOnly: true }),
    });
    assert.equal(policy.status, 200);
    const saved = (await policy.json()) as { policy: { providers: string[]; model: string; freeOnly: boolean } };
    assert.deepEqual(saved.policy, { providers: ["openrouter", "zhipu"], model: "openrouter/free", freeOnly: true });

    const excluded = await fetch(root + "/api/panel/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excludeModels: ["z-ai/glm-5.2:free", "auto", "z-ai/glm-5.2:free"] }),
    });
    assert.equal(excluded.status, 200);
    const excludedBody = (await excluded.json()) as { policy: { excludeModels?: string[] } };
    assert.deepEqual(excludedBody.policy.excludeModels, ["z-ai/glm-5.2:free"]);
    const afterScan = await fetch(root + "/api/panel/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openrouter/free" }),
    });
    assert.deepEqual(((await afterScan.json()) as { policy: { excludeModels?: string[] } }).policy.excludeModels, ["z-ai/glm-5.2:free"]);

    const flipped = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("gemini/studio"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ free: false, enabled: true }),
    });
    assert.equal(flipped.status, 200);
    assert.equal(((await flipped.json()) as { account: { free: boolean } }).account.free, false);

    const oldToken = state.gateway.token;
    const rotated = await fetch(root + "/api/panel/gateway", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotate: true }),
    });
    assert.equal(rotated.status, 200);
    const nextTok = ((await rotated.json()) as { state: { gateway: { token: string } } }).state.gateway.token;
    assert.ok(nextTok.startsWith("freeall_"));
    assert.notEqual(nextTok, oldToken);

    const gone = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("groq/work"), { method: "DELETE" });
    assert.equal(gone.status, 200);
    const after = (await (await fetch(root + "/api/panel")).json()) as { accounts: Array<{ ref: string }> };
    assert.deepEqual(after.accounts.map((a) => a.ref), ["gemini/studio"]);
  } finally {
    server.close();
    dispose();
  }
});

test("panel can boost openrouter daily cap and reset it", async () => {
  const { store, dispose } = tempStore();
  store.data.settings.port = 0;
  addPlain(store, "openrouter", "main", "sk-or-test");
  const server = startProxy(store, mockFetch(() => jsonResponse(404, {})));
  try {
    await onceListen(server);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const root = `http://127.0.0.1:${addr.port}`;
    const boosted = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("openrouter/main"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boost: true }),
    });
    assert.equal(boosted.status, 200);
    const row = ((await boosted.json()) as {
      account: { boosted: boolean; limits: { rpd: number | null }; remaining: string };
    }).account;
    assert.equal(row.boosted, true);
    assert.equal(row.limits.rpd, 1000);
    assert.match(row.remaining, /1k\/日|1000\/日/);

    const custom = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("openrouter/main"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpd: 200 }),
    });
    assert.equal(custom.status, 200);
    const customRow = ((await custom.json()) as { account: { limits: { rpd: number }; boosted: boolean } }).account;
    assert.equal(customRow.limits.rpd, 200);
    assert.equal(customRow.boosted, false);

    const reset = await fetch(root + "/api/panel/accounts/" + encodeURIComponent("openrouter/main"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpd: "catalog" }),
    });
    assert.equal(reset.status, 200);
    const back = ((await reset.json()) as { account: { limits: { rpd: number }; boosted: boolean } }).account;
    assert.equal(back.limits.rpd, 50);
    assert.equal(back.boosted, false);
  } finally {
    server.close();
    dispose();
  }
});

test("pool sync export/import uses the same encrypted pack as CLI", async () => {
  const { store, dispose } = tempStore();
  store.data.settings.port = 0;
  addPlain(store, "groq", "work", "secret-key-aaa");
  addPlain(store, "gemini", "home", "secret-key-bbb");
  const server = startProxy(store, mockFetch(() => jsonResponse(404, {})));
  try {
    await onceListen(server);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const root = `http://127.0.0.1:${addr.port}`;

    const exported = await fetch(root + "/api/panel/sync/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(exported.status, 200);
    const packBody = (await exported.json()) as { pack: string; filename: string; accounts: number };
    assert.equal(packBody.accounts, 2);
    assert.match(packBody.filename, /^freeall-\d{8}\.json$/);
    assert.equal(packBody.pack.includes("secret-key-aaa"), false);
    assert.match(packBody.pack, /"salt"/);

    assert.equal((await fetch(root + "/api/panel/accounts/" + encodeURIComponent("gemini/home"), { method: "DELETE" })).status, 200);
    assert.equal(((await (await fetch(root + "/api/panel")).json()) as { total: number }).total, 1);

    const bad = await fetch(root + "/api/panel/sync/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack: '{"v":1}' }),
    });
    assert.equal(bad.status, 400);

    const imported = await fetch(root + "/api/panel/sync/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack: packBody.pack }),
    });
    assert.equal(imported.status, 200);
    const merged = (await imported.json()) as {
      added: number;
      updated: number;
      state: { total: number; accounts: Array<{ ref: string }> };
    };
    assert.equal(merged.added, 1);
    assert.equal(merged.updated, 1);
    assert.equal(merged.state.total, 2);
    assert.equal(merged.state.accounts.some((a) => a.ref === "gemini/home"), true);
  } finally {
    server.close();
    dispose();
  }
});

function onceListen(server: import("node:http").Server): Promise<void> {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
}
