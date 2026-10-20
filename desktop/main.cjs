"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, Notification, shell } = require("electron");

// 菜单栏 UI 很轻；关 GPU 可避免远程桌面 / 托管 macOS 上 GPU 进程崩溃。
app.disableHardwareAcceleration();

const { existsSync, unlinkSync, readFileSync } = require("node:fs");
const http = require("node:http");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

app.setName("FreeAll");
if (process.platform === "darwin") app.dock?.hide();

let tray = null;
let popover = null;
let panel = null;
let store = null;
let server = null;
let core = null;
let desktopSystemLocale = "en";
let applicationMenuLocale = null;
function tr(message, ...params) { return core?.tr(message, ...params) ?? message; }
async function syncLanguage() {
  if (!core) return;
  const { session } = require("electron");
  const cookies = await session.defaultSession.cookies.get({ url: panelUrl(), name: "freeall-lang" });
  core.setLocale(core.resolveLocale(cookies[0]?.value, desktopSystemLocale));
  installApplicationMenu();
}

function installApplicationMenu() {
  const locale = core.currentLocale();
  if (applicationMenuLocale === locale) return;
  const about = { label: tr("关于 FreeAll"), click: () => openPanel("/about") };
  const appMenu = process.platform === "darwin"
    ? [{ label: "FreeAll", submenu: [about, { type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }]
    : [{ label: tr("关于"), submenu: [about, { role: "quit" }] }];
  Menu.setApplicationMenu(Menu.buildFromTemplate([...appMenu, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]));
  applicationMenuLocale = locale;
}
let pendingUpdate = null;
let updateFirstTimer = null;
let updateRecheckTimer = null;
let updateRetryTimer = null;

const POPOVER_MESSAGES = ["本机网关", "今日", "可用", "关", "开", "打开 FreeAll", "开启网关", "网关运行中", "网关未开启", "还没有账号。请先去账号池添加 Key。", "打开账号池", "路由规则在面板里设置，开启网关后才会使用。", "待命", "还有 ", " 个", "路由 ", "停止网关"];

const UPDATE_FIRST_MS = 8_000;
const UPDATE_RECHECK_MS = 4 * 60 * 60 * 1000;
const UPDATE_RETRY_MS = 15 * 60 * 1000;

function appRoot() {
  return app.isPackaged ? app.getAppPath() : join(__dirname, "..");
}

function asset(name) {
  return join(appRoot(), "assets", name);
}

async function loadCore() {
  if (core) return core;
  const storeMod = await import(pathToFileURL(join(appRoot(), "dist", "store.js")).href);
  const proxyMod = await import(pathToFileURL(join(appRoot(), "dist", "proxy.js")).href);
  const daemonMod = await import(pathToFileURL(join(appRoot(), "dist", "daemon.js")).href);
  const panelMod = await import(pathToFileURL(join(appRoot(), "dist", "panel-data.js")).href);
  const i18n = await import(pathToFileURL(join(appRoot(), "dist", "i18n.js")).href);
  const messages = await import(pathToFileURL(join(appRoot(), "dist", "i18n", "messages.js")).href);
  core = {
    ...i18n,
    english: messages.english,
    Store: storeMod.Store,
    startProxy: proxyMod.startProxy,
    stopDaemon: daemonMod.stopDaemon,
    writeOwnPid: daemonMod.writeOwnPid,
    panelState: panelMod.panelState,
  };
  return core;
}

function localBase() {
  const host = store?.data.settings.host || "127.0.0.1";
  const port = store?.data.settings.port || 8787;
  return { host, port };
}

/** 不用 fetch：Electron 44 + undici 对本机 HTTP 会抛 setTypeOfService EINVAL。 */
function localGet(path, timeoutMs = 800) {
  return new Promise((resolve) => {
    const { host, port } = localBase();
    const req = http.get({ host, port, path, timeout: timeoutMs, headers: { "Accept-Language": core?.currentLocale() || desktopSystemLocale } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

function localOk(path, timeoutMs = 800) {
  return new Promise((resolve) => {
    const { host, port } = localBase();
    const req = http.get({ host, port, path, timeout: timeoutMs, headers: { "Accept-Language": core?.currentLocale() || desktopSystemLocale } }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function localPost(path, body, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const { host, port } = localBase();
    const payload = Buffer.from(JSON.stringify(body || {}));
    const req = http.request(
      {
        host,
        port,
        path,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: true });
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.end(payload);
  });
}

function openUpdateDownload(result) {
  const url = result?.downloadUrl || result?.releasesUrl;
  if (url) shell.openExternal(url);
  else openPanel("/");
}

function notifyUpdateAvailable(result) {
  pendingUpdate = result;
  if (tray) {
    tray.setToolTip(tr("FreeAll · 有新版本 {0}", result.latest));
  }
  if (!result.notify) return;
  void localPost("/api/panel/update/seen", { version: result.latest });
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: tr("FreeAll {0} 可以更新了", result.latest),
    body: tr("当前 {0}。点这里打开下载页。", result.current),
    silent: true,
  });
  n.on("click", () => openUpdateDownload(result));
  n.show();
}

async function runUpdateCheck() {
  const result = await localGet("/api/panel/update", 10_000);
  if (!result) {
    if (!updateRetryTimer) {
      updateRetryTimer = setTimeout(() => {
        updateRetryTimer = null;
        void runUpdateCheck();
      }, UPDATE_RETRY_MS);
    }
    return;
  }
  if (result.status === "error") {
    if (!updateRetryTimer) {
      updateRetryTimer = setTimeout(() => {
        updateRetryTimer = null;
        void runUpdateCheck();
      }, UPDATE_RETRY_MS);
    }
    return;
  }
  if (result.status !== "update-available") {
    pendingUpdate = null;
    return;
  }
  notifyUpdateAvailable(result);
}

function startUpdateWatch() {
  stopUpdateWatch();
  updateFirstTimer = setTimeout(() => {
    updateFirstTimer = null;
    void runUpdateCheck();
  }, UPDATE_FIRST_MS);
  updateRecheckTimer = setInterval(() => {
    void runUpdateCheck();
  }, UPDATE_RECHECK_MS);
}

function stopUpdateWatch() {
  if (updateFirstTimer) {
    clearTimeout(updateFirstTimer);
    updateFirstTimer = null;
  }
  if (updateRecheckTimer) {
    clearInterval(updateRecheckTimer);
    updateRecheckTimer = null;
  }
  if (updateRetryTimer) {
    clearTimeout(updateRetryTimer);
    updateRetryTimer = null;
  }
}

async function readPanelState() {
  await syncLanguage();
  if (server && store) {
    try {
      const { panelState } = await loadCore();
      return panelState(store);
    } catch {
      /* fall through */
    }
  }
  return localGet("/api/panel");
}

function panelUrl() {
  const host = store?.data.settings.host || "127.0.0.1";
  const port = store?.data.settings.port || 8787;
  return `http://${host}:${port}/`;
}

async function startGateway() {
  const { Store, startProxy, stopDaemon, writeOwnPid } = await loadCore();
  if (!store) {
    store = new Store();
    store.loadOrCreate();
  }
  if (server) return true;
  stopDaemon(store);
  try {
    server = startProxy(store);
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    writeOwnPid(store);
    return true;
  } catch (error) {
    server = null;
    if (error && error.code === "EADDRINUSE") {
      if (await localOk("/livez")) return true;
    }
    console.error(error);
    return false;
  }
}

function stopGateway() {
  if (server) {
    server.close();
    server = null;
  }
  if (store && existsSync(store.paths.pid)) unlinkSync(store.paths.pid);
}

function sceneFromState(state, up) {
  if (!up) return "down";
  if (!state || !state.total) return "empty";
  const { available } = trayAccounts(state);
  if (available === 0) return "busy";
  if (state.accounts?.some((a) => a.status === "cooldown") && available < 2) return "busy";
  return "live";
}

function trayImage(scene) {
  const file = join(appRoot(), "assets", `tray-${scene}.png`);
  if (!existsSync(file)) return nativeImage.createEmpty();
  // 资源 32×32；scaleFactor:2 → 逻辑 16×16pt（系统菜单栏常见体量；旧 44px≈22pt 偏大）
  const img = nativeImage.createFromBuffer(readFileSync(file), { scaleFactor: 2 });
  if (process.platform === "darwin") img.setTemplateImage(true);
  return img;
}

/** 与 panelState.available 同一口径：启用且非 invalid/error/cooldown。 */
function isUsableAccount(a) {
  return Boolean(a?.enabled) && a.status !== "invalid" && a.status !== "error" && a.status !== "cooldown";
}

function trayAccounts(state) {
  const all = state?.accounts ?? [];
  // 列表与「可用」同口径：只列真正能接单的号，避免角标 4、列表 3
  const usable = all.filter(isUsableAccount);
  const max = 8;
  return {
    available: usable.length,
    accounts: usable.slice(0, max).map((a) => ({
      ref: a.ref,
      remaining: a.remaining,
      status: a.status,
    })),
    more: Math.max(0, usable.length - max),
  };
}

async function refreshTray() {
  if (!tray) return;
  let up = false;
  let state = null;
  state = await readPanelState();
  if (state) up = true;
  else up = Boolean(server);
  const scene = sceneFromState(state, up);
  const { available } = trayAccounts(state);
  tray.setImage(trayImage(scene));
  // 不设 title：菜单栏数字会占一整块宽度，可用数放 tooltip / 弹出层即可
  tray.setTitle("");
  tray.setToolTip(up ? tr("FreeAll · {0} 个可用", available) : tr("FreeAll · 网关未开启"));
}

function placePopover() {
  if (!tray || !popover) return;
  const bounds = tray.getBounds();
  const { width, height } = popover.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  let x = Math.round(bounds.x + bounds.width / 2 - width / 2);
  let y = Math.round(bounds.y + bounds.height + 6);
  const maxX = display.workArea.x + display.workArea.width - width - 8;
  x = Math.min(Math.max(display.workArea.x + 8, x), maxX);
  popover.setPosition(x, y, false);
}

function ensurePopover() {
  if (popover && !popover.isDestroyed()) return;
  createPopover();
}

function togglePopover() {
  ensurePopover();
  if (popover.isVisible()) {
    popover.hide();
    return;
  }
  placePopover();
  popover.show();
  popover.focus();
}

function createPopover() {
  popover = new BrowserWindow({
    width: 268,
    height: 340,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#d8e4f0",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popover.on("blur", () => popover.hide());
  popover.loadFile(join(__dirname, "popover.html"));
}

function openPanel(path = "/") {
  const url = `${panelUrl().replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  if (process.platform === "darwin") app.dock?.show();
  if (panel && !panel.isDestroyed()) {
    panel.loadURL(url);
    panel.show();
    panel.focus();
    popover?.hide();
    return;
  }
  panel = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: "FreeAll",
    backgroundColor: "#d8e4f0",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  panel.on("closed", () => {
    panel = null;
    if (process.platform === "darwin") app.dock?.hide();
  });
  panel.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === "https:") void shell.openExternal(url);
    } catch { /* Reject malformed and non-web popup destinations. */ }
    return { action: "deny" };
  });
  panel.loadURL(url);
  popover?.hide();
}

function createTray() {
  tray = new Tray(trayImage("down"));
  tray.setToolTip("FreeAll");
  tray.on("click", () => togglePopover());
  tray.on("right-click", () => {
    const items = [
      { label: tr("打开 FreeAll"), click: () => openPanel("/") },
      { label: tr("打开账号池"), click: () => openPanel("/pool") },
      { label: tr("关于 FreeAll"), click: () => openPanel("/about") },
    ];
    if (pendingUpdate?.latest) {
      items.push({ type: "separator" });
      items.push({
        label: tr("↑ 有新版本 {0}", pendingUpdate.latest),
        click: () => openUpdateDownload(pendingUpdate),
      });
    }
    items.push(
      { type: "separator" },
      { label: tr("开网关"), click: () => startGateway().then(refreshTray) },
      { label: tr("停网关"), click: () => { stopGateway(); refreshTray(); } },
      { type: "separator" },
      { label: tr("退出"), click: () => app.quit() },
    );
    const menu = Menu.buildFromTemplate(items);
    tray.popUpContextMenu(menu);
  });
}

ipcMain.handle("freeall:summary", async () => {
  let up = Boolean(server);
  const state = await readPanelState();
  if (state) up = true;
  const listed = trayAccounts(state);
  return {
    locale: core.currentLocale(),
    messages: Object.fromEntries(POPOVER_MESSAGES.map(message => [message, tr(message)])),
    up,
    scene: sceneFromState(state, up),
    url: panelUrl(),
    available: listed.available,
    total: state?.total ?? 0,
    today: state?.usage?.today?.requests ?? 0,
    policy: state?.policy?.model || "auto",
    accounts: listed.accounts,
    more: listed.more,
  };
});

ipcMain.handle("freeall:open", (_e, path) => {
  openPanel(typeof path === "string" ? path : "/");
});

ipcMain.handle("freeall:start", async () => {
  const ok = await startGateway();
  await refreshTray();
  return ok;
});

ipcMain.handle("freeall:stop", async () => {
  stopGateway();
  await refreshTray();
});

app.whenReady().then(async () => {
  // 开机自启仍可隐藏；手动打开时先出面板界面。
  const atLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  await loadCore();
  desktopSystemLocale = core.resolveLocale(process.env.FREEALL_LANG, app.getPreferredSystemLanguages().join(","), app.getLocale());
  await syncLanguage();
  createTray();
  await startGateway();
  await refreshTray();
  if (!atLogin) openPanel("/");
  startUpdateWatch();
  setInterval(() => {
    void refreshTray();
  }, 12_000);
});

app.on("before-quit", () => {
  stopUpdateWatch();
  stopGateway();
});

app.on("window-all-closed", () => {
  /* 菜单栏应用关窗不退出 */
});
