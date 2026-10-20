import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { matchLocale, resolveLocale, translate } from "../src/i18n/core.js";
import { english } from "../src/i18n/messages.js";
import { tr, withLocale, requestLocale } from "../src/i18n.js";
import { startProxy } from "../src/proxy.js";
import { panelApp } from "../src/panel/app.js";
import { renderPanel } from "../src/panel/shell.js";
import { addPlain, tempStore, mockFetch, jsonResponse } from "./helpers.js";

const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

test("language matching handles weighted browser headers and POSIX environments", () => {
  assert.equal(resolveLocale("zh_TW.UTF-8"), "zh-CN");
  assert.equal(resolveLocale("en_GB.UTF-8"), "en");
  assert.equal(resolveLocale("fr-FR,zh;q=0.7,en;q=0.9"), "en");
  assert.equal(resolveLocale("en;q=0,zh-CN;q=0.5"), "zh-CN");
  assert.equal(resolveLocale("C.UTF-8", "zh-CN"), "en");
  assert.equal(matchLocale("english"), undefined);
  assert.equal(resolveLocale("ja-JP"), "en");
  assert.equal(resolveLocale("invalid", "zh-CN"), "zh-CN");
  assert.equal(requestLocale({ cookie: "foo=1; freeall-lang=zh-CN", "accept-language": "en-US" }), "zh-CN");
  assert.equal(requestLocale({ cookie: "freeall-lang=zh-CN", "x-freeall-language": "en" }), "en");
});

test("translations preserve placeholders, Unicode and unknown user text", () => {
  for (const [source, target] of Object.entries(english)) {
    const slots = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
    assert.deepEqual(slots(target), slots(source), source);
    assert.doesNotMatch(target, /[\u3400-\u9fff]/, source);
  }
  assert.equal(translate("en", "已删除 {0}/{1}", "groq", "中文 {0}"), "Removed groq/中文 {0}");
  assert.equal(translate("zh-CN", "已删除 {0}/{1}", "groq", "work"), "已删除 groq/work");
  assert.equal(translate("en", "用户输入保持原样 🙂"), "用户输入保持原样 🙂");
});

test("concurrent language contexts stay isolated across asynchronous work", async () => {
  const results = await Promise.all(["en", "zh-CN", "en", "zh-CN"].map((lang) =>
    withLocale(lang as "en" | "zh-CN", async () => { await pause(); return tr("账号池"); })));
  assert.deepEqual(results, ["Accounts", "账号池", "Accounts", "账号池"]);
});

test("localized pages and API errors use request language without altering account data", async () => {
  const { store, dispose } = tempStore();
  store.data.settings.port = 0;
  const account = addPlain(store, "groq", "work");
  account.note = "中文备注 · English · 日本語";
  const server = startProxy(store, mockFetch(() => jsonResponse(404, {})));
  try {
    await new Promise<void>((resolve) => server.listening ? resolve() : server.once("listening", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const root = `http://127.0.0.1:${address.port}`;
    for (const [lang, title, suffix] of [["en", "Accounts", "/day"], ["zh-CN", "账号池", "/日"]]) {
      const response = await fetch(root + "/pool", { headers: { "Accept-Language": lang } });
      assert.equal(response.headers.get("Content-Language"), lang);
      const html = await response.text();
      assert.ok(html.includes(`FreeAll · ${title}`));
      assert.ok(html.includes(`<html lang="${lang}">`));
      const state = await (await fetch(root + "/api/panel", { headers: { "Accept-Language": lang } })).json();
      assert.equal(state.accounts[0].note, account.note);
      assert.ok(state.accounts[0].remaining.includes(suffix));
      const error = await (await fetch(root + "/api/panel/ask", { method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": lang }, body: JSON.stringify({ prompt: "" }) })).json();
      assert.equal(error.error.message, lang === "en" ? "Enter a prompt first" : "先写一句要问的话");
    }
    const pinned = await (await fetch(root + "/settings", { headers: { Cookie: "freeall-lang=en", "Accept-Language": "zh-CN" } })).text();
    assert.match(pinned, /FreeAll · Settings/);
    const explicit = await (await fetch(root + "/settings?lang=zh-CN", { headers: { Cookie: "freeall-lang=en" } })).text();
    assert.match(explicit, /FreeAll · 设置/);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); dispose(); }
});

test("both panel scripts run their locale bootstrap without missing runtime helpers", () => {
  for (const lang of ["en", "zh-CN"] as const) {
    for (const path of ["/", "/pool", "/settings", "/logs", "/about"]) {
      const html = withLocale(lang, () => renderPanel(path));
      const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]; assert.ok(script);
      new vm.Script(script);
      // Run only the bootstrap; it must be self-contained when embedded in a browser.
      const bootstrap = script.slice(0, script.indexOf("const $ ="));
      const sandbox = { document: { getElementById: () => null }, Intl };
      vm.runInNewContext(bootstrap + ';globalThis.result = tr("账号池");', sandbox);
      assert.equal((sandbox as { result?: string }).result, lang === "en" ? "Accounts" : "账号池");
    }
  }
});

test("CLI flags override environment and POSIX locales select English", () => {
  for (const [args, env, expected] of [
    [["--help"], { FREEALL_LANG: "en" }, "Quick start"],
    [["--help", "--lang", "zh-CN"], { FREEALL_LANG: "en" }, "最快路径"],
    [["--help"], { FREEALL_LANG: "", LC_ALL: "C.UTF-8" }, "Quick start"],
  ] as const) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { env: { ...process.env, ...env }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(expected));
  }
});

test("all source translation calls have English catalog entries", () => {
  const files = [...readdirSync("src").filter((file) => file.endsWith(".ts")).map((file) => join("src", file)), "src/panel/views.ts", "src/panel/shell.ts", "src/panel/about.ts"];
  for (const file of [...files, "panel-runtime", "desktop/popover.html", "desktop/main.cjs"]) {
    const source = file === "panel-runtime" ? panelApp : readFileSync(file, "utf8");
    for (const match of source.matchAll(/tr\(("(?:[^"\\]|\\.)*")/g)) {
      const key = JSON.parse(match[1]);
      if (/[\u3400-\u9fff]/.test(key)) assert.ok(key in english, `${file}: ${key}`);
    }
  }
});

test("popover translates status and opens Accounts by state rather than label text", async () => {
  const html = readFileSync("desktop/popover.html", "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]; assert.ok(script);
  for (const locale of ["en", "zh-CN"] as const) {
    const elements = new Map<string, { textContent: string; innerHTML: string; hidden: boolean; className: string }>();
    const get = (id: string) => {
      if (!elements.has(id)) elements.set(id, { textContent: "", innerHTML: "", hidden: false, className: "" });
      return elements.get(id)!;
    };
    let opened = "";
    const document = { getElementById: get, querySelectorAll: () => [], documentElement: { lang: "" }, body: { style: { visibility: "hidden" } } };
    const sandbox = { document, setInterval: () => 0, window: { freeall: {
      summary: async () => ({ scene: "empty", up: true, locale, messages: locale === "en" ? english : {}, accounts: [] }),
      open: (path: string) => { opened = path; },
    } } };
    vm.runInNewContext(script, sandbox);
    await pause();
    assert.equal(document.documentElement.lang, locale);
    assert.equal(get("open").textContent, locale === "en" ? "Open Accounts" : "打开账号池");
    assert.equal(get("gate").textContent, locale === "en" ? "On" : "开");
    (get("open") as unknown as { onclick: () => void }).onclick();
    assert.equal(opened, "/pool");
  }
});
