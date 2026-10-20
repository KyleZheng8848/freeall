import assert from "node:assert/strict";
import { test } from "node:test";
import { startProxy } from "../src/proxy.js";
import { addPlain, jsonResponse, mockFetch, tempStore } from "./helpers.js";

test("proxy mocks count_tokens and routes chat", async () => {
  const { store, dispose } = tempStore();
  store.data.settings.port = 0;
  addPlain(store, "groq", "work", "k1");
    const fetchFn = mockFetch((url, init) => {
    if (url.includes("/chat/completions")) {
      const streamed = typeof init?.body === "string" && init.body.includes('"stream":true');
      if (streamed) {
        return new Response('data: {"choices":[{"delta":{"content":"ok-via-pool"}}]}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return jsonResponse(200, { choices: [{ message: { content: "ok-via-pool" } }], usage: { total_tokens: 4 } });
    }
    return jsonResponse(404, {});
  });
  const server = startProxy(store, fetchFn);
  try {
    await onceListen(server);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const root = `http://127.0.0.1:${addr.port}`;
    const token = store.data.settings.gatewayToken;

    const denied = await fetch(`${root}/v1/models`);
    assert.equal(denied.status, 401);

    const models = await fetch(`${root}/v1/models`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(models.status, 200);
    const list = (await models.json()) as { data: Array<{ id: string }> };
    assert.ok(list.data.some((m) => m.id === "auto"));

    const counted = await fetch(`${root}/v1/messages/count_tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(counted.status, 200);

    const probe = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", max_tokens: 1, messages: [{ role: "user", content: "quota" }] }),
    });
    assert.equal(probe.status, 200);
    const probeJson = (await probe.json()) as { id: string };
    assert.equal(probeJson.id, "freeall-probe");

    const chat = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(chat.status, 200);
    assert.equal(chat.headers.get("x-routed-via"), "groq/work");
    const body = (await chat.json()) as { choices: Array<{ message: { content: string } }> };
    assert.equal(body.choices[0]?.message.content, "ok-via-pool");

    const streamed = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", stream: true, messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(streamed.status, 200);
    const sse = await streamed.text();
    assert.match(sse, /ok-via-pool/);

    const viaHeader = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-FreeAll-Provider": "groq",
        "X-FreeAll-Model": "auto",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(viaHeader.status, 200);
    assert.equal(viaHeader.headers.get("x-routed-via"), "groq/work");

    const viaQuery = await fetch(`${root}/v1/chat/completions?provider=groq&model=auto`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(viaQuery.status, 200);
    assert.equal(viaQuery.headers.get("x-routed-via"), "groq/work");

    const viaBody = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", provider: "groq", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(viaBody.status, 200);
    assert.equal(viaBody.headers.get("x-routed-via"), "groq/work");

    const anth = await fetch(`${root}/v1/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(anth.status, 200);
    const mapped = (await anth.json()) as { content: Array<{ text: string }> };
    assert.equal(mapped.content[0]?.text, "ok-via-pool");
  } finally {
    server.close();
    dispose();
  }
});

test("API request can pin provider over GUI policy", async () => {
  const { store, dispose } = tempStore();
  store.data.settings.port = 0;
  addPlain(store, "groq", "work", "k1").status = "healthy";
  addPlain(store, "openrouter", "free", "k2").status = "healthy";
  store.data.settings.policy = { providers: ["groq"], model: "auto" };
  const seen: string[] = [];
  const fetchFn = mockFetch((url, init) => {
    if (url.includes("/chat/completions")) {
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      seen.push(url.includes("openrouter") ? "openrouter" : "groq");
      assert.equal("provider" in body, false);
      return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
    }
    return jsonResponse(404, {});
  });
  const server = startProxy(store, fetchFn);
  try {
    await onceListen(server);
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const root = `http://127.0.0.1:${addr.port}`;
    const token = store.data.settings.gatewayToken;

    const models = await fetch(`${root}/v1/models`, { headers: { Authorization: `Bearer ${token}` } });
    const list = (await models.json()) as { data: Array<{ id: string }> };
    assert.ok(list.data.some((m) => m.id === "openrouter"));
    assert.ok(list.data.some((m) => m.id === "auto"));

    const pinned = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-FreeAll-Provider": "openrouter",
      },
      body: JSON.stringify({ model: "auto", provider: "groq", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(pinned.status, 200);
    assert.equal(pinned.headers.get("x-routed-via"), "openrouter/free");
    assert.deepEqual(seen, ["openrouter"]);
    assert.deepEqual(store.data.settings.policy, { providers: ["groq"], model: "auto" });

    const byAccount = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-FreeAll-Account": "openrouter/free",
      },
      body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(byAccount.status, 200);
    assert.equal(byAccount.headers.get("x-routed-via"), "openrouter/free");
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
