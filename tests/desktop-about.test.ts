import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);

function desktopHarness() {
  const menus: any[] = [];
  const opened: string[] = [];
  const external: string[] = [];
  let popup: (details: { url: string }) => { action: string };
  const app = { disableHardwareAcceleration() {}, setName() {}, dock: { hide() {}, show() {} },
    whenReady: () => ({ then() {} }), on() {} };
  class Window {
    webContents = { setWindowOpenHandler(handler: typeof popup) { popup = handler; } };
    on() {}
    loadURL(url: string) { opened.push(url); }
  }
  const electron = { app, BrowserWindow: Window, Menu: {
    buildFromTemplate: (items: any[]) => items,
    setApplicationMenu: (items: any[]) => menus.push(items),
  }, ipcMain: { handle() {} }, shell: { openExternal: (url: string) => external.push(url) } };
  const context = vm.createContext({
    require: (id: string) => id === "electron" ? electron : require(id),
    process: { platform: "darwin", env: {} }, URL, menus, opened,
  });
  vm.runInContext(readFileSync("desktop/main.cjs", "utf8"), context);
  return { context, menus, opened, external, get popup() { return popup!; } };
}

test("native About menu follows locale and opens the actual About panel", () => {
  const harness = desktopHarness();
  vm.runInContext(`
    core = { currentLocale: () => "en", tr: message => message === "关于 FreeAll" ? "About FreeAll" : message };
    installApplicationMenu(); installApplicationMenu();
    menus[0][0].submenu[0].click();
  `, harness.context);
  assert.equal(harness.menus.length, 1);
  assert.equal(harness.menus[0][0].submenu[0].label, "About FreeAll");
  assert.deepEqual(harness.opened, ["http://127.0.0.1:8787/about"]);
  vm.runInContext(`
    core = { currentLocale: () => "zh-CN", tr: message => message };
    installApplicationMenu();
  `, harness.context);
  assert.equal(harness.menus.length, 2);
  assert.equal(harness.menus[1][0].submenu[0].label, "关于 FreeAll");
});

test("panel opens HTTPS links externally and rejects non-web popups", () => {
  const harness = desktopHarness();
  vm.runInContext('openPanel("/about")', harness.context);
  assert.equal(harness.popup({ url: "https://github.com/KyleZheng8848/freeall" }).action, "deny");
  for (const url of ["file:///tmp/private", "javascript:alert(1)", "invalid URL"]) {
    assert.equal(harness.popup({ url }).action, "deny");
  }
  assert.deepEqual(harness.external, ["https://github.com/KyleZheng8848/freeall"]);
});
