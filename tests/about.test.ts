import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { startProxy } from "../src/proxy.js";
import { COPYRIGHT, PROJECT_REPOSITORY } from "../src/identity.js";
import { readFreeAllMeta } from "../src/app-meta.js";
import { tempStore } from "./helpers.js";

test("About is a local panel route in both languages and does not expose account keys", async () => {
  const { store, dispose } = tempStore();
  store.data.settings.port = 0;
  const privateKey = "not-a-real-provider-key-for-about-isolation";
  store.addAccount({ provider: "groq", name: "private-account", apiKey: privateKey });
  const server = startProxy(store, async () => { throw new Error("About must not call a provider"); });
  try {
    if (!server.listening) await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    for (const [lang, label] of [["en", "About FreeAll"], ["zh-CN", "关于 FreeAll"]]) {
      const response = await fetch(`http://127.0.0.1:${address.port}/about`, { headers: { "Accept-Language": lang! } });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, new RegExp(`<html lang="${lang}"`));
      assert.ok(html.includes(label!));
      assert.ok(html.includes(PROJECT_REPOSITORY));
      assert.ok(html.includes(COPYRIGHT));
      assert.ok(html.includes(`v${readFreeAllMeta().version}`));
      assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
      assert.equal(html.includes(privateKey), false);
      assert.equal(html.includes(store.data.settings.gatewayToken), false);
      assert.equal(html.includes("private-account"), false);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dispose();
  }
});
