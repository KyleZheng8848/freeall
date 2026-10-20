/**
 * OSS 静态下载页。版式对齐 CPET / 音悦台：固定名下载、changelog、历史版本。
 * 配色跟本机面板：纸色、墨色、灯丝橙。
 */

const PLATFORMS = [
  {
    id: "mac-arm",
    label: "macOS · Apple Silicon",
    hint: "M1 / M2 / M3 / M4",
    button: "DMG",
    match: (n) => /mac-arm64\.dmg$/i.test(n) || (/arm64\.dmg$/i.test(n) && !/x64/i.test(n)),
    zip: (n) => /mac-arm64\.zip$/i.test(n) || (/arm64\.zip$/i.test(n) && !/x64/i.test(n)),
  },
  {
    id: "mac-intel",
    label: "macOS · Intel",
    hint: "x64",
    button: "DMG",
    match: (n) => /mac-x64\.dmg$/i.test(n) || /(x64|intel)\.dmg$/i.test(n),
    zip: (n) => /mac-x64\.zip$/i.test(n) || /(x64|intel)\.zip$/i.test(n),
  },
  {
    id: "win",
    label: "Windows · x64",
    hint: "安装程序",
    button: "安装程序",
    match: (n) => /\.exe$/i.test(n),
    zip: () => false,
  },
  {
    id: "linux-x64",
    label: "Linux · x64",
    hint: "AppImage",
    button: "AppImage",
    match: (n) => /(x86_64|x64|amd64)\.AppImage$/i.test(n),
    zip: () => false,
  },
  {
    id: "linux-arm",
    label: "Linux · ARM64",
    hint: "AppImage",
    button: "AppImage",
    match: (n) => /(arm64|aarch64)\.AppImage$/i.test(n),
    zip: () => false,
  },
]

import {
  APP_ACCENTS,
  releaseAppHeader,
  releaseHubFooter,
  releasePageCss,
  releasePageDecor
} from './release-page-theme.mjs'

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

/** 发布页界面截图（本地路径相对仓库根） */
export const DOWNLOAD_SCREENSHOTS = [
  {
    localRel: "assets/screenshots/ui-main.png",
    remoteName: "ui-main.png",
    alt: "FreeAll 看板界面",
    caption: "看板：管理免费额度和切换模型",
  },
]

/** 发布页固定文案：一句话副标题 + 基础介绍 */
const PAGE_COPY = {
  tagline: "菜单栏里的免费模型额度池",
  intro:
    "FreeAll 把多个 AI 账号的免费额度管在一起，从菜单栏一键打开。适合想省成本、又想随时切换模型试用的开发者。",
}

const mb = (n) => `${(n / 1048576).toFixed(0)} MB`

export function renderDownloadPage(input) {
  const {
    version,
    publishedAt,
    assets = [],
    highlights = [],
    manifestUrl,
    iconUrl,
    history = [],
  } = input
  const stable = input.stableUrl ?? ((name) => assets.find((a) => a.name === name)?.url ?? "")
  const screenshots = Array.isArray(input.screenshots)
    ? input.screenshots.filter((s) => s && s.url)
    : []

  const cards = []
  for (const p of PLATFORMS) {
    const main = assets.find((a) => p.match(a.name))
    if (!main) continue
    const zip = assets.find((a) => p.zip(a.name))
    cards.push(`
      <div class="card">
        <div class="card-head">
          <span class="card-title">${esc(p.label)}</span>
          <span class="card-hint">${esc(p.hint)}</span>
        </div>
        <a class="btn" href="${esc(stable(main.name))}" download>
          下载 ${esc(p.button)}
          ${main.size ? `<span class="size">${esc(mb(main.size))}</span>` : ""}
        </a>
        ${
          zip
            ? `<a class="alt" href="${esc(stable(zip.name))}" download>免挂载 zip · ${esc(mb(zip.size ?? 0))}</a>`
            : ""
        }
      </div>`)
  }

  const missing = PLATFORMS.filter((p) => !assets.some((a) => p.match(a.name))).map((p) => p.label)
  const date = publishedAt ? new Date(publishedAt).toLocaleDateString("zh-CN") : ""

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreeAll ${esc(version)} · 下载</title>
<meta name="color-scheme" content="light">
<style>${releasePageCss(APP_ACCENTS.freeall)}</style>
</head>
<body>
${releasePageDecor()}
<div class="page">
${releaseAppHeader({
  titleHtml: 'Free<span style="color:var(--coral)">All</span>',
  appName: 'FreeAll',
  version,
  tagline: PAGE_COPY.tagline,
  date,
  iconUrl,
  esc
})}
  <p class="intro">${esc(PAGE_COPY.intro)}</p>

  ${
    screenshots.length
      ? `<section>
    <h2>界面预览</h2>
    <div class="shots">${screenshots
      .map(
        (s) => `<figure>
      <img src="${esc(s.url)}" alt="${esc(s.alt || "界面截图")}" loading="lazy">
      ${s.caption ? `<figcaption>${esc(s.caption)}</figcaption>` : ""}
    </figure>`
      )
      .join("\n    ")}</div>
  </section>`
      : ""
  }

  <section>
    <div class="grid">${cards.join("") || '<p class="sub">这一版还没有可下载的安装包。</p>'}</div>
    ${missing.length ? `<p class="sub" style="margin-top:14px">暂未提供：${esc(missing.join("、"))}</p>` : ""}
  </section>

  <section>
    <h2>装好怎么用</h2>
    <div class="note">
      <p style="margin:0 0 8px">打开 <strong>FreeAll.app</strong> 后，菜单栏会出现 <strong>FA</strong> 图标，点一下再选「打开 FreeAll」。</p>
      <p style="margin:0 0 8px">第一次打开若被拦：系统设置 → 隐私与安全性 → <strong>仍要打开</strong>。或终端执行：</p>
      <pre>xattr -cr /Applications/FreeAll.app
open -a FreeAll</pre>
    </div>
  </section>

  ${
    highlights.length
      ? `<section>
    <h2>${esc(version)} 更新了什么</h2>
    <ul>${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
  </section>`
      : ""
  }

  ${
    history.length
      ? `<section>
    <h2>全部版本</h2>
    <div class="note">
      <p style="margin:0 0 14px; color:var(--moss)">最新版在最上面。只留最近若干版。</p>
      <ul class="history">${history
        .map((h) => {
          const isCurrent = h.version === version
          return `<li>
            <span class="hv">${esc(h.version)}${isCurrent ? '<span class="now">最新</span>' : ""}</span>
            <span class="hfiles">${h.files
              .map((f) => `<a class="hchip" href="${esc(f.url)}">${esc(f.label)}<span class="size">${esc(mb(f.size))}</span></a>`)
              .join("")}</span>
          </li>`
        })
        .join("")}</ul>
    </div>
  </section>`
      : ""
  }

  ${releaseHubFooter({
    manifestUrl,
    extraHtml: "<p>下载链接固定指向最新版。不要导入来路不明的 token。</p>",
    esc,
  })}
</div>
</body>
</html>
`
}

export function changelogHighlights(markdown, version) {
  const lines = String(markdown || "").split("\n")
  const out = []
  let inTarget = false
  for (const line of lines) {
    const head = /^##\s+(.+?)\s+[—–-]\s+\d{4}-\d{2}-\d{2}\s*$/.exec(line)
    if (head) {
      if (inTarget) break
      inTarget = head[1].trim() === version
      continue
    }
    if (!inTarget) continue
    const bullet = /^[-*]\s+(.*\S)\s*$/.exec(line)
    if (bullet) out.push(bullet[1].replace(/`/g, ""))
  }
  return out
}
