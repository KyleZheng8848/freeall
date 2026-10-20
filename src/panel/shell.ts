import { browserI18n } from "./i18n.js";
import { tr, currentLocale } from "../i18n.js";
import { panelApp } from "./app.js";
import { panelCss } from "./styles.js";
import { pageId, pageTitle, viewBody } from "./views.js";

const NAV: Array<{ href: string; id: string; label: string }> = [
  { href: "/", id: "home", label: "看板" },
  { href: "/pool", id: "pool", label: "账号池" },
  { href: "/settings", id: "settings", label: "设置" },
  { href: "/logs", id: "logs", label: "日志" },
  { href: "/about", id: "about", label: "关于" },
];

export function renderPanel(path = "/"): string {
  const id = pageId(path);
  const nav = NAV.map((item) =>
    `<a href="${item.href}" class="${item.id === id ? "on" : ""}">${tr(item.label)}</a>`,
  ).join("");
  return `<!DOCTYPE html>
<html lang="${currentLocale()}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeAll · ${pageTitle(path)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Oxanium:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>${panelCss}</style>
</head>
<body data-page="${id}">
  <div id="update-banner" class="update-banner" hidden role="status"></div>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="/" aria-label="FreeAll">
        <span class="mark-ring" aria-hidden="true">F</span>
        <span class="brand-copy">
          <strong>FreeAll</strong>
          <span class="brand-sub">${tr("本机额度池")}</span>
        </span>
      </a>
      <nav>${nav}</nav>
      <div class="meta">
        <label class="language-control"><span>${tr("语言")}</span><select id="language-select" aria-label="${tr("语言")}">
          <option value="auto">${tr("跟随系统")}</option>
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select></label>
        <span class="ver" id="app-ver">—</span>
        <button type="button" class="upd-btn" id="upd-btn" hidden title="${tr("有新版本")}">${tr("更新")}</button>
        <div class="avail-chip" title="${tr("当前可用账号")}">
          <span class="avail-label">${tr("能用")}</span>
          <strong id="count">—</strong>
        </div>
      </div>
    </header>
    ${viewBody(path)}
  </div>
  <script>${browserI18n(currentLocale())}
${panelApp}</script>
</body>
</html>`;
}
