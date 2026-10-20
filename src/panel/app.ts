export const panelApp = `
const $ = (id) => document.getElementById(id);
const page = document.body.dataset.page || "home";
let state = null;
let updateInfo = null;
let showToken = true;
let dockTab = "freeall";
try { dockTab = sessionStorage.getItem("fa-dock") || "freeall"; } catch { dockTab = "freeall"; }
if (!["freeall", "openai", "anthropic", "claude", "codex", "opencode"].includes(dockTab)) dockTab = "freeall";
let dockCopy = { use: "", install: "", raw: "" };
let thread = [];
try {
  const raw = localStorage.getItem("fa-thread") || sessionStorage.getItem("fa-thread") || "[]";
  thread = JSON.parse(raw);
  sessionStorage.removeItem("fa-thread");
} catch { thread = []; }
if (!Array.isArray(thread)) thread = [];

function saveThread() {
  try { localStorage.setItem("fa-thread", JSON.stringify(thread.slice(-40))); } catch {}
}

async function api(path, opts) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json", "X-FreeAll-Language": locale }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.message || res.statusText);
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function isFreeModel(id) {
  return id === "auto" || id === "openrouter/free" || id === "openrouter/auto" || String(id).endsWith(":free");
}
function accountModels(a, freeOnly) {
  const list = a.models || [];
  if (!freeOnly || a.provider !== "openrouter") return list;
  const free = list.filter(isFreeModel);
  const keep = a.preferredModel && !free.includes(a.preferredModel) ? [a.preferredModel] : [];
  return free.length || keep.length ? keep.concat(free) : list;
}
function collectModels(accounts, freeOnly) {
  const seen = {};
  const out = [];
  for (const a of accounts) {
    if (freeOnly && !a.free) continue;
    for (const m of accountModels(a, freeOnly)) {
      if (seen[m]) continue;
      seen[m] = 1;
      out.push(m);
    }
  }
  return out;
}

function accountModelLines(accounts, freeOnly) {
  if (!accounts.length) return tr("当前范围没有账号。去账号池添加 Key。");
  return accounts.map((a) => {
    if (freeOnly && !a.free) return a.ref + tr(" · 已跳过（非免费档）");
    const models = accountModels(a, freeOnly);
    const preferred = a.preferredModel || tr("未选首选");
    if (!models.length) {
      return a.ref + " · " + a.provider + tr(" · 首选 ") + preferred + tr(" · 未声明模型（去账号池编辑写入）");
    }
    const head = models.slice(0, 4).join(", ");
    const more = models.length > 4 ? " …+" + (models.length - 4) : "";
    return a.ref + " · " + a.provider + (a.free ? tr(" · 免费") : "") + tr(" · 首选 ") + preferred + " · " + models.length + tr(" 个（") + head + more + "）";
  }).join("\\n");
}

function renderAccountRoster(accounts, freeOnly) {
  if (!accounts.length) {
    return ("<div class=\\"roster-empty\\">" + tr("当前范围没有账号。") + "<a href=\\"/pool\\">" + tr("去账号池添加 Key") + "</a>" + "</div>");
  }
  return accounts.map((a) => {
    if (freeOnly && !a.free) {
      return '<article class="roster-card skipped" role="listitem">' +
        '<div class="roster-top"><strong>' + escapeHtml(a.ref) + '</strong>' +
        ("<span class=\\"tag muted\\">" + tr("已跳过 · 非免费档") + "</span>" + "</div>" + "</article>");
    }
    const models = accountModels(a, freeOnly);
    const preferred = a.preferredModel || "";
    const preview = models.slice(0, 8);
    const rest = models.length - preview.length;
    const chips = preview.map((m) =>
      '<span class="mchip' + (m === preferred ? " on" : "") + '" title="' + escapeAttr(m) + '">' + escapeHtml(m) + "</span>"
    ).join("");
    const more = rest > 0 ? '<span class="mchip more">+' + rest + "</span>" : "";
    return '<article class="roster-card" role="listitem">' +
      '<div class="roster-top">' +
        '<div class="roster-id"><strong>' + escapeHtml(a.ref) + '</strong>' +
          '<span class="roster-prov">' + escapeHtml(a.provider) + "</span></div>" +
        '<div class="roster-meta">' +
          (a.free ? ("<span class=\\"tag free\\">" + tr("免费") + "</span>") : ("<span class=\\"tag paid\\">" + tr("付费") + "</span>")) +
          '<span class="roster-n">' + models.length + (tr(" 模型") + "</span>") +
        "</div>" +
      "</div>" +
      '<div class="roster-pref">' + (preferred
        ? ((tr("首选 ") + "<code>") + escapeHtml(preferred) + "</code>")
        : ("<span class=\\"dim\\">" + tr("未设首选") + "</span>")) + "</div>" +
      (models.length
        ? '<div class="chip-row">' + chips + more + "</div>"
        : ("<p class=\\"roster-miss\\">" + tr("未声明模型 · 去") + "<a href=\\"/pool\\">" + tr("账号池") + "</a>" + tr("编辑写入") + "</p>")) +
      "</article>";
  }).join("");
}

function renderFreeChips(models) {
  const list = models || [];
  if (!list.length) return ("<span class=\\"dim\\">" + tr("还没有生效模型。手填或点「从账号刷新」。") + "</span>");
  return list.map((m) => '<span class="mchip" role="listitem" title="' + escapeAttr(m) + '">' + escapeHtml(m) + "</span>").join("");
}

function stamp(status) {
  const map = { healthy: tr("可用"), unknown: tr("未验证"), cooldown: tr("冷却中"), invalid: tr("Key 无效"), error: tr("出错") };
  return '<span class="stamp ' + status + '">' + (map[status] || status) + "</span>";
}
function maskToken(token) {
  if (!token) return "";
  if (token.length <= 14) return token.slice(0, 4) + "••••";
  return token.slice(0, 10) + "••••" + token.slice(-4);
}
function flash(el, text) {
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => { el.textContent = old === text ? tr("复制") : old; }, 900);
}
function ago(ts) {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (sec < 60) return relative.format(-sec, "second");
  if (sec < 3600) return relative.format(-Math.floor(sec / 60), "minute");
  if (sec < 86400) return relative.format(-Math.floor(sec / 3600), "hour");
  return relative.format(-Math.floor(sec / 86400), "day");
}

function fillConnect() {
  if (!$("out-openai") || !state) return;
  const g = state.gateway;
  $("out-openai").textContent = g.openaiBase;
  if ($("out-anth")) $("out-anth").textContent = g.url;
  const box = $("out-token");
  if (box) {
    box.dataset.secret = g.token;
    box.textContent = g.token;
  }
  if ($("tokeye")) $("tokeye").hidden = true;
  if ($("gateport") && document.activeElement !== $("gateport")) $("gateport").value = String(g.port || 8787);
  if ($("gatenow")) {
    $("gatenow").textContent = (g.host || "127.0.0.1") + ":" + (g.port || 8787) + " · " + g.token;
  }
}

function fillVersion() {
  const ver = state?.app?.version ? "v" + state.app.version : "";
  if ($("app-ver") && ver) $("app-ver").textContent = ver;
  if ($("settings-ver") && ver) $("settings-ver").textContent = ver;
  if ($("vernow") && ver) $("vernow").textContent = tr("版本 ") + ver;
}

function updateStatusText() {
  const el = $("upd-status");
  if (!el) return;
  if (!updateInfo) {
    el.textContent = tr("正在读取版本…");
    return;
  }
  const cur = updateInfo.current || (state && state.app && state.app.version) || "—";
  if (updateInfo.status === "update-available" && updateInfo.latest) {
    el.textContent = tr("有新版本 ") + updateInfo.latest + tr("（当前 ") + cur + tr("）。点顶栏「更新」或下方按钮打开下载页。");
    return;
  }
  if (updateInfo.status === "up-to-date") {
    el.textContent = tr("已是最新版（当前 ") + cur + "）。";
    return;
  }
  if (updateInfo.status === "not-configured") {
    el.textContent = updateInfo.message || tr("未配置更新检查。");
    return;
  }
  el.textContent = updateInfo.message || (tr("检查更新失败（当前 ") + cur + "）。");
}

function fillUpdate() {
  const banner = $("update-banner");
  const btn = $("upd-btn");
  if (!banner) return;
  const show = updateInfo && updateInfo.showBanner && updateInfo.status === "update-available" && updateInfo.latest;
  if (btn) {
    btn.hidden = !(updateInfo && updateInfo.status === "update-available" && updateInfo.latest);
    if (!btn.hidden) {
      btn.title = tr("有新版本 ") + updateInfo.latest + tr("（当前 ") + (updateInfo.current || "") + "）";
    }
  }
  updateStatusText();
  if (!show) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }
  banner.hidden = false;
  banner.innerHTML =
    ("<div class=\\"update-banner-main\\">" + "<strong>" + tr("有新版本 ")) + escapeHtml(updateInfo.latest) + '</strong>' +
    ("<span class=\\"update-banner-sub\\">" + tr("当前 ")) + escapeHtml(updateInfo.current || "") +
    (tr(" · 浏览器下载后安装（不会静默替换）") + "</span>" + "</div>") +
    '<div class="update-banner-actions">' +
    ("<button type=\\"button\\" class=\\"primary\\" data-upd=\\"go\\">" + tr("更新") + "</button>") +
    ("<button type=\\"button\\" class=\\"ghost\\" data-upd=\\"page\\">" + tr("详情") + "</button>") +
    ("<button type=\\"button\\" class=\\"ghost\\" data-upd=\\"later\\">" + tr("稍后") + "</button>" + "</div>");
}

function openUpdateUrl(preferDownload) {
  if (!updateInfo) return;
  const url = (preferDownload && updateInfo.downloadUrl) || updateInfo.releasesUrl || (state && state.app && state.app.downloadPage);
  if (url) window.open(url, "_blank", "noopener");
}

async function dismissUpdate() {
  if (!updateInfo?.latest) return;
  try {
    await api("/api/panel/update/dismiss", { method: "POST", body: JSON.stringify({ version: updateInfo.latest }) });
  } catch { /* ignore */ }
  updateInfo = { ...updateInfo, showBanner: false, notify: false };
  fillUpdate();
}

async function checkUpdate(quiet) {
  try {
    if ($("upd-status") && !quiet) $("upd-status").textContent = tr("正在检查更新…");
    updateInfo = await api("/api/panel/update");
    fillUpdate();
  } catch (err) {
    if ($("upd-status")) $("upd-status").textContent = tr("检查更新失败：") + (err && err.message ? err.message : String(err));
    if (!quiet) console.warn(err);
  }
}

function fillHome() {
  if (!state) return;
  const empty = state.total === 0;
  if ($("home-empty")) $("home-empty").hidden = !empty;
  if ($("home-main")) $("home-main").hidden = empty;
}

function fillHomeAccounts() {
  if (!$("homeacc") || !state) return;
  const rows = [...(state.accounts || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name));
  if (!rows.length) {
    $("homeacc").innerHTML = ("<div class=\\"empty\\">" + tr("还没有账号。") + "<a href=\\"/pool\\">" + tr("去账号池添加") + "</a>" + "</div>");
    return;
  }
  $("homeacc").innerHTML = rows.map((a) => {
    const model = a.preferredModel
      ? escapeHtml(a.preferredModel === "openrouter/free" || a.preferredModel.endsWith(":free") ? tr("免费") : a.preferredModel)
      : tr("未选模型");
    const prio = (a.priority || 0) !== 0 ? "<span class='home-acc-prio'>P" + a.priority + "</span>" : "";
    return "<a class='home-acc' href='/pool'>" +
      "<span class='home-acc-name'>" + escapeHtml(a.name) + prio + "</span>" +
      "<span class='home-acc-meta'>" + escapeHtml(a.provider) + " · " + model + "</span>" +
      "<span class='home-acc-remain'>" + escapeHtml(a.remaining || "—") + "</span>" +
      stamp(a.status) +
      "</a>";
  }).join("");
}

function fillStats() {
  if (!$("stats") || !state) return;
  const u = state.usage || { today: { requests: 0, tokens: 0, ok: 0, fail: 0, avgMs: 0, tokPerSec: null } };
  const t = u.today || {};
  const free = (state.accounts || []).filter((a) => a.free).length;
  const bad = (state.accounts || []).filter((a) => a.status === "invalid" || a.status === "error").length;
  $("stats").innerHTML = [
    [tr("次"), t.requests || 0],
    [tr("成功"), t.ok || 0],
    [tr("失败"), t.fail || 0],
    ["tok", (t.promptTokens || 0) + "→" + (t.completionTokens || 0)],
    [tr("均耗时"), t.avgMs ? t.avgMs + "ms" : "—"],
    [tr("均速"), t.tokPerSec != null ? t.tokPerSec + " tok/s" : "—"],
    [tr("可用 / 异常"), state.available + " / " + bad],
    [tr("免费"), free + " / " + state.total],
  ].map(([k, n]) => "<span><b>" + n + "</b>" + k + "</span>").join("");
}

function renderChart(el, buckets) {
  if (!el) return;
  const rows = buckets || [];
  if (!rows.length) {
    el.innerHTML = ("<div class=\\"empty\\" style=\\"width:100%;padding:8px\\">" + tr("还没有请求记录。") + "</div>");
    return;
  }
  const max = Math.max(1, ...rows.map((b) => b.n || 0));
  el.innerHTML = rows.map((b) => {
    const h = Math.max(3, Math.round(((b.n || 0) / max) * (document.body.dataset.page === "home" ? 36 : 64)));
    const cls = !b.n ? "zero" : (b.ok === b.n ? "ok" : "");
    const when = new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(b.t));
    return "<i class='" + cls + "' style='height:" + h + "px' title='" + when + " " + (b.n || 0) + (tr(" 次") + "'>" + "</i>");
  }).join("");
}

function fillDash() {
  if (!state) return;
  renderChart($("dashchart"), (state.usage && state.usage.buckets) || []);
  if ($("dashbreak")) {
    const rows = (state.usage && state.usage.byProvider) || [];
    const models = (state.usage && state.usage.byModel) || [];
    $("dashbreak").innerHTML = rows.length
      ? rows.map((r) => "<span>" + escapeHtml(r.provider) + " <b>" + r.requests + "</b> / " + r.tokens + " tok</span>").join("") +
        (models[0] ? ("<span>" + tr("最多 ")) + escapeHtml(models[0].model) + " <b>" + models[0].requests + "</b></span>" : "")
      : ("<span>" + tr("今天还没有请求。去试一句或让 Agent 走网关。") + "</span>");
  }
}

function logRangeHours() {
  const on = document.querySelector("#logrange button.on");
  return Number((on && on.dataset.range) || 24);
}

function filteredLogs() {
  const hours = logRangeHours();
  const since = Date.now() - hours * 3600 * 1000;
  const q = (($("lq") && $("lq").value) || "").trim().toLowerCase();
  const prov = ($("l-prov") && $("l-prov").value) || "all";
  const acc = ($("l-acc") && $("l-acc").value) || "all";
  const src = ($("l-src") && $("l-src").value) || "all";
  const ok = ($("l-ok") && $("l-ok").value) || "all";
  return (state.logs || []).filter((l) => {
    if (l.at < since) return false;
    if (prov !== "all" && l.provider !== prov) return false;
    if (acc !== "all" && l.accountId !== acc && (l.provider + "/" + l.accountName) !== acc) return false;
    if (src !== "all" && l.source !== src) return false;
    if (ok === "ok" && !l.ok) return false;
    if (ok === "fail" && l.ok) return false;
    if (q) {
      const hay = [l.model, l.provider, l.accountName, l.source, l.finishReason, l.error].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function fmtWhen(ts) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

function fillLogs() {
  if (!$("logtable") || !state) return;
  const ids = [...new Set((state.logs || []).map((l) => l.provider))];
  if ($("l-prov") && $("l-prov").options.length <= 1) {
    $("l-prov").innerHTML = ("<option value=\\"all\\">" + tr("全部") + "</option>") + ids.map((id) => '<option value="' + id + '">' + id + "</option>").join("");
  }
  if ($("l-acc")) {
    const prev = $("l-acc").value;
    const seen = new Map();
    for (const l of state.logs || []) {
      if (!seen.has(l.accountId)) seen.set(l.accountId, l.provider + "/" + l.accountName);
    }
    $("l-acc").innerHTML = ("<option value=\\"all\\">" + tr("全部账号") + "</option>") +
      [...seen].map(([id, label]) => "<option value='" + escapeAttr(id) + "'>" + escapeHtml(label) + "</option>").join("");
    if (prev && [...$("l-acc").options].some((o) => o.value === prev)) $("l-acc").value = prev;
  }
  const rows = filteredLogs();
  const ok = rows.filter((l) => l.ok).length;
  const tokIn = rows.reduce((n, l) => n + (l.promptTokens || 0), 0);
  const tokOut = rows.reduce((n, l) => n + (l.completionTokens || 0), 0);
  const ms = rows.length ? Math.round(rows.reduce((n, l) => n + (l.ms || 0), 0) / rows.length) : 0;
  if ($("logstats")) {
    $("logstats").innerHTML =
      "<b>" + rows.length + ("</b>" + tr(" 次 · 成功 ") + "<b>") + ok + ("</b>" + tr(" · 失败 ") + "<b>") + (rows.length - ok) +
      "</b> · " + tokIn + "→" + tokOut + tr(" tok · 均 ") + (rows.length ? ms + "ms" : "—");
  }
  const since = Date.now() - logRangeHours() * 3600 * 1000;
  const buckets = ((state.usage && state.usage.buckets) || []).filter((b) => b.t >= since - 3600000);
  renderChart($("logchart"), buckets);
  if (!rows.length) {
    $("logtable").innerHTML = ("<div class=\\"empty\\">" + tr("这段时间没有请求记录。看板试一句或 Agent 走网关后会出现。") + "</div>");
    return;
  }
  const srcMap = { ask: tr("试一句"), cli: "CLI", openai: "OpenAI", anthropic: "Anthropic", stream: tr("流式") };
  $("logtable").innerHTML = '<table class="ledger logbook"><thead><tr>' +
    ("<th>" + tr("时间") + "</th>" + "<th>" + tr("模型") + "</th>" + "<th>" + tr("供应商") + "</th>" + "<th>" + tr("账号") + "</th>" + "<th>" + tr("来源") + "</th>" + "<th>" + tr("入") + "</th>" + "<th>" + tr("出") + "</th>" + "<th>" + tr("费用") + "</th>" + "<th>" + tr("速度") + "</th>" + "<th>" + tr("耗时") + "</th>" + "<th>" + tr("结束") + "</th>" + "<th>" + tr("结果") + "</th>") +
    "</tr></thead><tbody>" + rows.map((l) => {
      const speed = l.completionTokens && l.ms ? (l.completionTokens / (l.ms / 1000)).toFixed(1) + " tok/s" : "—";
      const model = (isFreeModel(l.model) && l.model !== "auto" ? tr("免费 · ") : "") + l.model;
      return "<tr class='" + (l.ok ? "" : "off") + "'>" +
        "<td>" + fmtWhen(l.at) + "</td>" +
        "<td class='model' title='" + escapeAttr(l.model) + "'>" + escapeHtml(model) + "</td>" +
        "<td>" + escapeHtml(l.provider) + "</td>" +
        "<td><button type='button' class='acc-pin' data-logacc='" + escapeAttr(l.accountId) + "'>" + escapeHtml(l.accountName) + "</button></td>" +
        "<td>" + escapeHtml(srcMap[l.source] || l.source) + "</td>" +
        "<td>" + (l.promptTokens || 0) + " tok</td>" +
        "<td>" + (l.completionTokens || 0) + " tok</td>" +
        "<td>$0.00</td>" +
        "<td>" + speed + "</td>" +
        "<td>" + (l.ms || 0) + " ms</td>" +
        "<td>" + escapeHtml(l.finishReason || (l.ok ? "stop" : "—")) + "</td>" +
        "<td class='" + (l.ok ? "" : "fail") + "'>" + (l.ok ? tr("成功") : (tr("失败") + (l.status ? " " + l.status : ""))) +
          (l.error ? "<div class='err'>" + escapeHtml(l.error) + "</div>" : "") + "</td>" +
        "</tr>";
    }).join("") + "</tbody></table>";
}

function fillGate() {
  if (!$("gatescope") || !state) return;
  const policy = state.policy || { providers: [], model: "auto", freeOnly: false };
  const counts = {};
  for (const a of state.accounts) counts[a.provider] = (counts[a.provider] || 0) + 1;
  $("gatescope").innerHTML = state.providers.map((p) => {
    const n = counts[p.id] || 0;
    return '<label><input type="checkbox" data-pol="' + p.id + '"' + (policy.providers.includes(p.id) ? " checked" : "") + " />" +
      p.id + (n ? " · " + n : "") + "</label>";
  }).join("");
  const chosen = new Set(policy.providers);
  if ($("gatefree") && document.activeElement !== $("gatefree")) $("gatefree").checked = Boolean(policy.freeOnly);
  const freeOnly = $("gatefree") ? $("gatefree").checked : Boolean(policy.freeOnly);
  const scoped = (state.accounts || []).filter((a) => !chosen.size || chosen.has(a.provider));
  let listAccs = scoped;
  const pinned = policy.account
    ? (state.accounts || []).find((a) => a.ref === policy.account || a.id === policy.account)
    : null;
  if (pinned) listAccs = [pinned];
  const models = ["auto", "free-auto", ...collectModels(listAccs, freeOnly)];
  if (policy.model && policy.model !== "auto" && policy.model !== "free-auto" && !models.includes(policy.model)) models.push(policy.model);
  $("gatemodel").innerHTML = models.map((m) =>
    "<option value='" + escapeAttr(m) + "'" + (m === (policy.model || "auto") ? " selected" : "") + ">" +
    (m === "auto" ? tr("auto · 不指定") : m === "free-auto" ? tr("free-auto · 按免费模型表") : escapeHtml(m)) + "</option>"
  ).join("");
  if ($("gatemodels")) {
    $("gatemodels").innerHTML = renderAccountRoster(listAccs, freeOnly);
  }
  if ($("gatemodelshint")) {
    const n = collectModels(listAccs, freeOnly).length;
    const who = pinned ? (tr("固定账号 ") + pinned.ref) : (chosen.size ? (tr("供应商 ") + [...chosen].join(", ")) : tr("全部账号"));
    $("gatemodelshint").textContent = who + " · " + listAccs.length + tr(" 个账号 · ") + n + tr(" 个模型");
  }
  if ($("gatex") && document.activeElement !== $("gatex")) {
    $("gatex").value = (policy.excludeModels || []).join("\\n");
  }
  if ($("gateacc")) {
    const all = state.accounts || [];
    let accs = all.filter((a) => !chosen.size || chosen.has(a.provider));
    if (pinned && !accs.some((a) => a.id === pinned.id)) accs = [pinned, ...accs];
    $("gateacc").innerHTML = ("<option value=\\"\\">" + tr("不固定 · 自动轮换") + "</option>") + accs.map((a) =>
      "<option value='" + escapeAttr(a.ref) + "'" + (pinned && a.id === pinned.id ? " selected" : "") + ">" +
      escapeHtml(a.ref) + "</option>"
    ).join("");
  }
  const scope = policy.providers.length ? policy.providers.join(" → ") : "auto";
  const accLine = policy.account ? " · " + policy.account : "";
  const dropped = (policy.excludeModels || []).length;
  const line = tr("路由 ") + scope + accLine + " · " + (policy.model || "auto") + (policy.freeOnly ? tr(" · 免费") : "") + (dropped ? tr(" · 排除 ") + dropped : "");
  if ($("routenow")) $("routenow").textContent = line;
  if ($("policyhint")) {
    $("policyhint").textContent = tr("不选供应商=全部（含 custom）。选号：钉账号→供应商→免费档（自配）→指定模型硬过滤→优先级→余量。free-auto 走免费模型表。单次请求可覆盖 provider/account");
  }
  fillFreeList();
}

let freeListProv = "";
try { freeListProv = sessionStorage.getItem("fa-free-prov") || ""; } catch { freeListProv = ""; }

function fillFreeList() {
  if (!$("freeprev") || !state) return;
  const map = state.providerFreeModels || {};
  const ids = (state.providers || []).map((p) => p.id);
  if (!freeListProv || !ids.includes(freeListProv)) freeListProv = ids[0] || "openrouter";
  $("freeprev").innerHTML = ids.map((id) =>
    "<option value='" + escapeAttr(id) + "'" + (id === freeListProv ? " selected" : "") + ">" + escapeHtml(id) + "</option>"
  ).join("");
  const entry = map[freeListProv] || { models: [], manual: [], excluded: [], effective: [] };
  const active = document.activeElement;
  if ($("freemanual") && active !== $("freemanual")) $("freemanual").value = (entry.manual || []).join("\\n");
  if ($("freeexcl") && active !== $("freeexcl")) $("freeexcl").value = (entry.excluded || []).join("\\n");
  if ($("freeeff")) $("freeeff").innerHTML = renderFreeChips(entry.effective || []);
  if ($("freecount")) $("freecount").textContent = tr("生效 ") + ((entry.effective || []).length);
}

async function saveFreeList() {
  if (!$("freeprev") || !state) return;
  const provider = $("freeprev").value || freeListProv;
  freeListProv = provider;
  try { sessionStorage.setItem("fa-free-prov", provider); } catch {}
  const out = await api("/api/panel/free-models", {
    method: "PATCH",
    body: JSON.stringify({
      provider,
      manual: ($("freemanual") && $("freemanual").value) || "",
      excluded: ($("freeexcl") && $("freeexcl").value) || "",
    }),
  });
  state = out.state || state;
  fillFreeList();
  if ($("freeok")) {
    $("freeok").textContent = tr("已保存");
    setTimeout(() => { if ($("freeok")) $("freeok").textContent = ""; }, 1400);
  }
  if ($("freeerr")) $("freeerr").textContent = "";
}

async function refreshFreeList() {
  if (!$("freeprev") || !state) return;
  const provider = $("freeprev").value || freeListProv;
  freeListProv = provider;
  try { sessionStorage.setItem("fa-free-prov", provider); } catch {}
  const out = await api("/api/panel/free-models/refresh", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
  state = out.state || state;
  fillFreeList();
  if ($("freeok")) {
    $("freeok").textContent = tr("已刷新");
    setTimeout(() => { if ($("freeok")) $("freeok").textContent = ""; }, 1400);
  }
  if ($("freeerr")) $("freeerr").textContent = "";
}

function parseExcludeModels(text) {
  const seen = [];
  for (const line of String(text || "").split(/\\n/)) {
    const t = line.trim();
    if (!t || t === "auto" || seen.includes(t)) continue;
    seen.push(t);
  }
  return seen;
}

async function savePolicy(extra) {
  if (!$("gatescope")) return;
  const boxes = [...document.querySelectorAll("#gatescope input[data-pol]")];
  const body = {
    providers: boxes.filter((b) => b.checked).map((b) => b.dataset.pol),
    model: ($("gatemodel") && $("gatemodel").value) || "auto",
    freeOnly: $("gatefree") ? $("gatefree").checked : false,
    account: ($("gateacc") && $("gateacc").value) || "",
  };
  if (extra && extra.excludeModels !== undefined) body.excludeModels = extra.excludeModels;
  const out = await api("/api/panel/policy", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  state = out.state || state;
  render();
  if ($("gateok")) {
    $("gateok").textContent = tr("已保存");
    setTimeout(() => { if ($("gateok")) $("gateok").textContent = ""; }, 1400);
  }
}

function fillAsk() {
  if (!$("askacc") || !state) return;
  const saved = restoreAskPick();
  const prevA = ($("askacc").value) || (saved && saved.account) || "";
  const prevM = ($("askmodel") && $("askmodel").value && $("askmodel").value !== "auto" ? $("askmodel").value : "") || (saved && saved.model) || "auto";
  fillAskAccounts(prevA);
  fillAskModels(prevM || "auto");
}

function fillAskAccounts(keep) {
  if (!$("askacc") || !state) return;
  const alive = (state.accounts || []).filter((a) => a.enabled && a.status !== "invalid" && a.status !== "error");
  $("askacc").innerHTML = ("<option value=\\"\\">" + tr("默认账号 · 按路由") + "</option>") + alive.map((a) =>
    "<option value='" + escapeAttr(a.ref) + "'>" + escapeHtml(a.ref) + "</option>"
  ).join("");
  if (keep && [...$("askacc").options].some((o) => o.value === keep)) $("askacc").value = keep;
}

function fillAskModels(keep) {
  if (!$("askmodel") || !state) return;
  const accRef = $("askacc") ? $("askacc").value : "";
  // 试一句要能显式点付费模型；免费档只约束「默认/auto」路由，不裁剪下拉
  let pool = (state.accounts || []).filter((a) => a.enabled && a.status !== "invalid" && a.status !== "error");
  if (accRef) pool = pool.filter((a) => a.ref === accRef || a.id === accRef);
  const models = ["auto", "free-auto", ...collectModels(pool, false)];
  $("askmodel").innerHTML = models.map((m) => {
    const freeTag = m !== "auto" && m !== "free-auto" && isFreeModel(m) ? tr(" · 免费") : "";
    const label = m === "auto" ? (accRef ? tr("该账号自动") : tr("默认模型 · 按路由")) : m === "free-auto" ? tr("free-auto · 按免费模型表") : m + freeTag;
    return "<option value='" + escapeAttr(m) + "'>" + escapeHtml(label) + "</option>";
  }).join("");
  if (keep && models.includes(keep)) $("askmodel").value = keep;
}

function renderThread() {
  const box = $("thread");
  if (!box) return;
  if (!thread.length) {
    box.innerHTML = ("<div class=\\"empty\\">" + tr("还没有对话。") + "</div>");
    return;
  }
  box.innerHTML = thread.map((m) => {
    if (m.role === "user") return ("<div class=\\"bubble user\\">" + "<span class=\\"who\\">" + tr("你") + "</span>") + escapeHtml(m.text) + "</div>";
    if (m.error) {
      const errMeta = m.ms != null ? '<span class="meta">' + m.ms + "ms</span>" : "";
      return ("<div class=\\"bubble err\\">" + "<span class=\\"who\\">" + tr("请求失败") + "</span>") + errMeta + escapeHtml(m.error) + "</div>";
    }
    const who = [m.via, m.model].filter(Boolean).join(" · ") || (m.streaming ? tr("生成中…") : tr("网关"));
    const tok = (!m.streaming && (m.promptTokens != null || m.completionTokens != null))
      ? ((m.promptTokens || 0) + "→" + (m.completionTokens || 0) + " tok")
      : "";
    const speed = (!m.streaming && m.tokPerSec != null) ? m.tokPerSec + " tok/s" : "";
    const meta = [tok, speed, !m.streaming && m.ms != null ? m.ms + "ms" : ""].filter(Boolean).join(" · ");
    const body = escapeHtml(m.text || "") + (m.streaming ? '<span class="cursor">▍</span>' : "");
    return '<div class="bubble bot' + (m.streaming ? " streaming" : "") + '"><span class="who">' + escapeHtml(who) + "</span>" +
      (meta ? '<span class="meta">' + escapeHtml(meta) + "</span>" : "") +
      body + "</div>";
  }).join("");
  box.scrollTop = box.scrollHeight;
}

function filteredAccounts() {
  const q = (($("q") && $("q").value) || "").trim().toLowerCase();
  const prov = ($("f-prov") && $("f-prov").value) || "all";
  const stat = ($("f-stat") && $("f-stat").value) || "all";
  const free = ($("f-free") && $("f-free").value) || "all";
  const on = ($("f-on") && $("f-on").value) || "all";
  return (state.accounts || []).filter((a) => {
    if (q && !(a.ref + " " + (a.note || "")).toLowerCase().includes(q)) return false;
    if (prov !== "all" && a.provider !== prov) return false;
    if (free === "free" && !a.free) return false;
    if (free === "paid" && a.free) return false;
    if (on === "on" && !a.enabled) return false;
    if (on === "off" && a.enabled) return false;
    if (stat === "usable" && (!a.enabled || a.status === "invalid" || a.status === "error" || a.status === "cooldown")) return false;
    if (stat === "cooldown" && a.status !== "cooldown") return false;
    if (stat === "bad" && a.status !== "invalid" && a.status !== "error") return false;
    return true;
  }).sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name));
}

function fillPoolFilters() {
  if (!$("f-prov") || !state) return;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("fa-filters") || "{}"); } catch { return {}; } })();
  const cur = $("f-prov").value || saved.prov || "all";
  const ids = [...new Set((state.accounts || []).map((a) => a.provider))];
  $("f-prov").innerHTML = ("<option value=\\"all\\">" + tr("全部供应商") + "</option>") + ids.map((id) => '<option value="' + id + '">' + id + "</option>").join("");
  if ([...$("f-prov").options].some((o) => o.value === cur)) $("f-prov").value = cur;
  if (saved.q && $("q") && !$("q").value) $("q").value = saved.q;
  if (saved.stat && $("f-stat")) $("f-stat").value = saved.stat;
  if (saved.free && $("f-free")) $("f-free").value = saved.free;
  if (saved.on && $("f-on")) $("f-on").value = saved.on;
}

function rememberFilters() {
  if (!$("q")) return;
  sessionStorage.setItem("fa-filters", JSON.stringify({
    q: $("q").value, prov: $("f-prov").value, stat: $("f-stat").value, free: $("f-free").value, on: $("f-on").value,
  }));
}

function clearFilters() {
  if ($("q")) $("q").value = "";
  if ($("f-prov")) $("f-prov").value = "all";
  if ($("f-stat")) $("f-stat").value = "all";
  if ($("f-free")) $("f-free").value = "all";
  if ($("f-on")) $("f-on").value = "all";
  try { sessionStorage.removeItem("fa-filters"); } catch {}
  renderTable();
}

function renderTable() {
  if (!$("table") || !state) return;
  const rows = filteredAccounts();
  const usable = rows.filter((a) => a.enabled && a.status !== "invalid" && a.status !== "error" && a.status !== "cooldown").length;
  const free = rows.filter((a) => a.free).length;
  const reqs = rows.reduce((n, a) => n + (a.todayRequests || 0), 0);
  const toks = rows.reduce((n, a) => n + (a.todayTokens || 0), 0);
  if ($("poolstats")) {
    $("poolstats").innerHTML =
      "<b>" + rows.length + ("</b>" + tr(" 个 · 可用 ") + "<b>") + usable + ("</b>" + tr(" · 免费 ") + "<b>") + free +
      ("</b>" + tr(" · 今天 ") + "<b>") + reqs + "</b> / <b>" + toks + "</b>";
  }
  if (!state.accounts.length) {
    $("table").innerHTML = ("<div class=\\"empty\\">" + tr("还没有账号。点右上角添加 Key。") + "</div>");
    return;
  }
  if (!rows.length) {
    $("table").innerHTML = ("<div class=\\"empty\\">" + tr("没有符合筛选的。") + "<button type=\\"button\\" class=\\"tiny ghost\\" id=\\"filterclear2\\">" + tr("清除筛选") + "</button>" + "</div>");
    return;
  }
  $("table").innerHTML = '<table class="ledger"><thead><tr>' +
    ("<th>" + tr("账号") + "</th>" + "<th>" + tr("优先") + "</th>" + "<th>" + tr("供应商") + "</th>" + "<th>" + tr("档位") + "</th>" + "<th>" + tr("轮换") + "</th>" + "<th>" + tr("状态") + "</th>" + "<th>" + tr("首选模型") + "</th>" + "<th>" + tr("剩余 分/日") + "</th>" + "<th>" + tr("今天") + "</th>" + "<th>" + tr("备注") + "</th>" + "<th>" + "</th>") +
    "</tr></thead><tbody>" + rows.map((a) => {
      const model = a.preferredModel
        ? escapeHtml((isFreeModel(a.preferredModel) && a.preferredModel !== "auto" ? tr("免费 · ") : "") + a.preferredModel)
        : ("<span class='hint'>" + tr("未选") + "</span>");
      return "<tr class='" + (a.enabled ? "" : "off") + "'>" +
        "<td>" + escapeHtml(a.name) + "</td>" +
        "<td class='prio'>" + (a.priority || 0) + "</td>" +
        "<td>" + escapeHtml(a.provider) + "</td>" +
        "<td><span class='tag " + (a.free ? "on" : "off") + "'>" + (a.free ? tr("免费") : tr("付费")) +
          (a.boosted ? tr(" · 充$10") : "") + "</span></td>" +
        "<td><span class='tag " + (a.enabled ? "on" : "off") + "'>" + (a.enabled ? tr("开") : tr("关")) + "</span></td>" +
        "<td>" + stamp(a.status) + (a.cooldownSec ? tr(" · 冷却 ") + a.cooldownSec + "s" : "") +
          (a.lastError ? "<div class='err'>" + escapeHtml(a.lastError) + "</div>" : "") + "</td>" +
        "<td class='model' title='" + escapeAttr(a.preferredModel || "") + "'>" + model + "</td>" +
        "<td class='remain'>" + escapeHtml(a.remaining) + "</td>" +
        "<td class='today'>" + a.todayRequests + " · " + a.todayTokens + "</td>" +
        "<td class='note' title='" + escapeAttr(a.note || "") + "'>" + escapeHtml(a.note || "—") + "</td>" +
        "<td><div class='actions'>" +
          "<button type='button' class='tiny' data-edit='" + a.id + ("'>" + tr("编辑") + "</button>") +
          "<button type='button' class='tiny ghost' data-refresh='" + a.id + ("'>" + tr("刷新") + "</button>") +
          "<button type='button' class='danger' data-ref='" + a.id + "' data-label='" + escapeAttr(a.ref) + ("'>" + tr("删除") + "</button>") +
        "</div></td></tr>";
    }).join("") + "</tbody></table>";
}

let editingId = "";
let editKeyPlain = "";
let editKeyOriginal = "";
let editKeyVisible = false;

function fillEditModels() {
  if (!$("editmodel") || !editingId || !state) return;
  const a = state.accounts.find((x) => x.id === editingId);
  if (!a) return;
  const free = $("editfree") ? $("editfree").checked : a.free;
  const list = accountModels(a, free);
  const keep = $("editmodel").value || a.preferredModel || "";
  if (!$("editmodel").value) $("editmodel").value = keep;
  if ($("editmodellist")) {
    $("editmodellist").innerHTML = list.map((m) => "<option value='" + escapeAttr(m) + "'></option>").join("");
  }
  if ($("editmodels") && document.activeElement !== $("editmodels")) {
    const lines = (a.models && a.models.length) ? a.models : list;
    $("editmodels").value = lines.join("\\n");
  }
}

function syncEditKeyField() {
  if (!$("editkey")) return;
  if (editKeyPlain) {
    $("editkey").value = editKeyPlain;
    $("editkey").type = editKeyVisible ? "text" : "password";
    $("editkey").placeholder = tr("可直接修改后保存");
  } else {
    $("editkey").value = "";
    $("editkey").type = "password";
    $("editkey").placeholder = tr("留空则不改 · 点「显示」查看");
  }
  if ($("editkeyshow")) $("editkeyshow").textContent = editKeyVisible ? tr("隐藏") : tr("显示");
}

async function revealEditKey() {
  if (!editingId) return;
  if (editKeyPlain) {
    editKeyVisible = !editKeyVisible;
    syncEditKeyField();
    return;
  }
  if ($("editerr")) $("editerr").textContent = "";
  if ($("editkeyshow")) $("editkeyshow").disabled = true;
  try {
    const out = await api("/api/panel/accounts/" + encodeURIComponent(editingId) + "/key");
    editKeyPlain = out.apiKey || "";
    editKeyOriginal = editKeyPlain;
    editKeyVisible = true;
    if ($("editkeyhint")) $("editkeyhint").textContent = tr("已解锁 · ") + (out.hint || "");
    syncEditKeyField();
  } catch (err) {
    if ($("editerr")) $("editerr").textContent = err.message;
  } finally {
    if ($("editkeyshow")) $("editkeyshow").disabled = false;
  }
}

async function copyEditKey() {
  if (!editingId) return;
  if ($("editerr")) $("editerr").textContent = "";
  try {
    if (!editKeyPlain) {
      const out = await api("/api/panel/accounts/" + encodeURIComponent(editingId) + "/key");
      editKeyPlain = out.apiKey || "";
      editKeyOriginal = editKeyPlain;
      if ($("editkeyhint")) $("editkeyhint").textContent = tr("已解锁 · ") + (out.hint || "");
      syncEditKeyField();
    }
    await navigator.clipboard.writeText(editKeyPlain);
    if ($("editkeycopy")) flash($("editkeycopy"), tr("已复制"));
  } catch (err) {
    if ($("editerr")) $("editerr").textContent = err.message;
  }
}

function openEdit(id) {
  if (!state) return;
  const a = state.accounts.find((x) => x.id === id);
  if (!a || !$("editdlg")) return;
  editingId = a.id;
  editKeyPlain = "";
  editKeyOriginal = "";
  editKeyVisible = false;
  $("edittitle").textContent = tr("编辑 ") + a.ref;
  $("editref").textContent = a.provider + " · " + (a.remaining || "") + (a.lastError ? " · " + a.lastError : "");
  $("editname").value = a.name;
  if ($("editprio")) $("editprio").value = a.priority != null ? a.priority : 0;
  $("editnote").value = a.note || "";
  $("editfree").checked = Boolean(a.free);
  $("editen").checked = Boolean(a.enabled);
  if ($("editboostwrap")) $("editboostwrap").hidden = a.provider !== "openrouter";
  if ($("editboost")) $("editboost").checked = Boolean(a.boosted);
  $("editrpm").value = a.limits && a.limits.rpm != null ? a.limits.rpm : "";
  $("editrpm").placeholder = a.catalogLimits && a.catalogLimits.rpm != null ? String(a.catalogLimits.rpm) : tr("不限");
  $("editrpd").value = a.limits && a.limits.rpd != null ? a.limits.rpd : "";
  $("editrpd").placeholder = a.catalogLimits && a.catalogLimits.rpd != null ? String(a.catalogLimits.rpd) : tr("不限");
  $("edithint").textContent = a.provider === "openrouter"
    ? tr("留空=使用目录默认（OpenRouter 默认 20/分 · 50/日）。勾选充值 ≥$10 时日限按 1000。只改本机限额估算。")
    : tr("留空=使用目录默认。只改本机限额估算，不读取官网账单。");
  if ($("editbase")) $("editbase").value = a.baseUrl || "";
  if ($("editmodels")) $("editmodels").value = (a.models || []).join("\\n");
  if ($("editkeyhint")) $("editkeyhint").textContent = tr("当前 ") + (a.keyHint || "****") + tr(" · 点「显示」需本机解锁；改完保存即更换");
  syncEditKeyField();
  $("editerr").textContent = "";
  fillEditModels();
  $("editdlg").hidden = false;
  $("editname").focus();
}

function closeEdit() {
  editingId = "";
  editKeyPlain = "";
  editKeyOriginal = "";
  editKeyVisible = false;
  if ($("editdlg")) $("editdlg").hidden = true;
}

function openDlg(id) {
  if ($(id)) $(id).hidden = false;
}

function closeDlg(id) {
  if (id === "editdlg") closeEdit();
  else if ($(id)) $(id).hidden = true;
}

function downloadText(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function fillAdd() {
  if (!$("provider") || !state) return;
  $("pills").innerHTML = state.providers.filter((p) => p.signup).map((p) =>
    '<a class="pill' + (p.recommended ? " rec" : "") + '" href="' + p.signup + '" target="_blank" rel="noreferrer">' +
    (p.recommended ? tr("先开 · ") : "") + p.id + "</a>"
  ).join("");
  const cur = $("provider").value;
  $("provider").innerHTML = state.providers.map((p) =>
    '<option value="' + p.id + '">' + (p.recommended ? "★ " : "") + p.id + " · " + p.label + "</option>"
  ).join("");
  if (cur) $("provider").value = cur;
  else {
    const rec = state.providers.find((p) => p.recommended);
    if (rec) $("provider").value = rec.id;
  }
  hint();
}

function hint() {
  if (!$("provider") || !state) return;
  const p = state.providers.find((x) => x.id === $("provider").value);
  if (!p) return;
  $("baseUrl").value = p.baseUrl || "";
  $("baseUrl").placeholder = p.id === "custom" ? tr("必填，如 http://127.0.0.1:11434/v1") : tr("官方地址，一般不用改");
  $("provhint").innerHTML = p.signup
    ? '<a href="' + p.signup + '" target="_blank" rel="noreferrer">' + p.signup + "</a> · " + p.keyHint
    : tr("custom 必填 Base URL；模型可手填。");
  if ($("addmodelwrap")) $("addmodelwrap").hidden = p.id !== "custom";
  if ($("addboostwrap")) $("addboostwrap").hidden = p.id !== "openrouter";
}

function maskRecipe(text) {
  // 本机网关令牌：接 Agent 片段直接给全文，方便复制，不做脱敏
  return text;
}

function askPick() {
  const account = $("askacc") ? $("askacc").value : "";
  const model = $("askmodel") ? ($("askmodel").value || "auto") : "auto";
  let provider = "";
  if (account && state && state.accounts) {
    const a = state.accounts.find((x) => x.ref === account || x.id === account);
    if (a) provider = a.provider || "";
  }
  return {
    provider,
    account: account || "",
    model: model || "auto",
  };
}

function liveGateway() {
  const g = state && state.gateway ? state.gateway : {};
  const pick = askPick();
  return {
    url: g.url || ("http://127.0.0.1:" + (g.port || 8787)),
    openaiBase: g.openaiBase || ((g.url || ("http://127.0.0.1:" + (g.port || 8787))) + "/v1"),
    token: g.token || "",
    model: pick.model,
    provider: pick.provider,
    account: pick.account,
  };
}

function routeHeaderLines(g) {
  const lines = [];
  if (g.provider) lines.push("  -H 'X-FreeAll-Provider: " + g.provider + "' \\\\");
  if (g.account) lines.push("  -H 'X-FreeAll-Account: " + g.account + "' \\\\");
  return lines;
}

function askJson(g) {
  const parts = [tr("\\"prompt\\":\\"你好\\""), '"model":"' + g.model + '"'];
  if (g.provider) parts.push('"provider":"' + g.provider + '"');
  if (g.account) parts.push('"account":"' + g.account + '"');
  return "{" + parts.join(",") + "}";
}

function chatJson(g) {
  const parts = ['"model":"' + g.model + '"', '"messages":[{"role":"user","content":"hi"}]'];
  if (g.provider) parts.push('"provider":"' + g.provider + '"');
  if (g.account) parts.push('"account":"' + g.account + '"');
  return "{" + parts.join(",") + "}";
}

function messagesJson(g) {
  const parts = ['"model":"' + g.model + '"', '"max_tokens":256', '"messages":[{"role":"user","content":"hi"}]'];
  if (g.provider) parts.push('"provider":"' + g.provider + '"');
  if (g.account) parts.push('"account":"' + g.account + '"');
  return "{" + parts.join(",") + "}";
}

function liveUseCommand(kind, g) {
  if (kind === "curl" || kind === "openai" || kind === "anthropic") return "";
  if (kind === "freeall") {
    const parts = ["freeall ask"];
    if (g.provider) parts.push("--provider " + g.provider);
    if (g.account) parts.push("--account " + g.account);
    if (g.model && g.model !== "auto") parts.push("--model " + g.model);
    parts.push(tr("你好"));
    return parts.join(" ");
  }
  return "freeall use " + kind;
}

function liveRecipeBody(kind, g) {
  if (kind === "freeall") {
    return ["curl " + g.url + "/v1/ask \\\\", "  -H 'Authorization: Bearer " + g.token + "' \\\\"].concat(routeHeaderLines(g)).concat([
      "  -H 'Content-Type: application/json' \\\\",
      "  -d '" + askJson(g) + "'",
    ]).join("\\n");
  }
  if (kind === "claude") {
    const lines = ["export ANTHROPIC_BASE_URL=" + g.url, "export ANTHROPIC_AUTH_TOKEN=" + g.token];
    if (g.provider) lines.push("export FREEALL_PROVIDER=" + g.provider);
    if (g.account) lines.push("export FREEALL_ACCOUNT=" + g.account);
    if (g.model && g.model !== "auto") lines.push(tr("# 当前试一下选的模型：") + g.model);
    lines.push("claude");
    return lines.join("\\n");
  }
  if (kind === "codex") {
    return [
      "export OPENAI_BASE_URL=" + g.openaiBase,
      "export OPENAI_API_KEY=" + g.token,
      g.provider ? "export FREEALL_PROVIDER=" + g.provider : "",
      g.account ? "export FREEALL_ACCOUNT=" + g.account : "",
      "codex -c 'model_provider=\\"freeall\\"' \\\\",
      "  -c 'model_providers.freeall.base_url=\\"" + g.openaiBase + "\\"' \\\\",
      "  -c 'model_providers.freeall.env_key=\\"OPENAI_API_KEY\\"' \\\\",
      "  -c 'model_providers.freeall.wire_api=\\"chat\\"' \\\\",
      "  -c 'model=\\"" + g.model + "\\"'",
    ].filter(Boolean).join("\\n");
  }
  if (kind === "opencode") {
    const cfg = JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      model: "freeall/" + g.model,
      provider: {
        freeall: {
          npm: "@ai-sdk/openai-compatible",
          name: "FreeAll",
          options: { baseURL: g.openaiBase, apiKey: "{env:OPENAI_API_KEY}" },
          models: { [g.model]: { name: g.model === "auto" ? "FreeAll auto" : g.model } },
        },
      },
    });
    return [
      "export OPENAI_API_KEY=" + g.token,
      "export OPENAI_BASE_URL=" + g.openaiBase,
      g.provider ? "export FREEALL_PROVIDER=" + g.provider : "",
      g.account ? "export FREEALL_ACCOUNT=" + g.account : "",
      "export OPENCODE_CONFIG_CONTENT='" + cfg + "'",
      "opencode -m freeall/" + g.model,
    ].filter(Boolean).join("\\n");
  }
  if (kind === "anthropic") {
    return [
      "# Anthropic Messages API",
      "curl " + g.url + "/v1/messages \\\\",
      "  -H 'x-api-key: " + g.token + "' \\\\",
      "  -H 'anthropic-version: 2023-06-01' \\\\",
    ].concat(routeHeaderLines(g)).concat([
      "  -H 'Content-Type: application/json' \\\\",
      "  -d '" + messagesJson(g) + "'",
      "",
      "# Claude / Anthropic SDK",
      "export ANTHROPIC_BASE_URL=" + g.url,
      "export ANTHROPIC_API_KEY=" + g.token,
    ]).join("\\n");
  }
  return [
    "# OpenAI Chat Completions",
    "curl " + g.openaiBase + "/chat/completions \\\\",
    "  -H 'Authorization: Bearer " + g.token + "' \\\\",
  ].concat(routeHeaderLines(g)).concat([
    "  -H 'Content-Type: application/json' \\\\",
    "  -d '" + chatJson(g) + "'",
    "",
    tr("# 任意 OpenAI SDK"),
    "export OPENAI_BASE_URL=" + g.openaiBase,
    "export OPENAI_API_KEY=" + g.token,
  ]).join("\\n");
}

function liveDockHint(kind, g) {
  const bits = [];
  if (g.model && g.model !== "auto") bits.push(tr("模型 ") + g.model);
  if (g.provider) bits.push(tr("供应商 ") + g.provider);
  if (g.account) bits.push(tr("账号 ") + g.account);
  const base = (state.recipes && state.recipes.hint && state.recipes.hint[kind]) || "";
  if (!bits.length) return base;
  const live = tr("已跟「试一下」联动：") + bits.join(" · ");
  return base ? live + "。" + base : live;
}

function syncAskToDock() {
  try {
    sessionStorage.setItem("fa-ask", JSON.stringify(askPick()));
  } catch {}
  dock();
}

function restoreAskPick() {
  try {
    const raw = sessionStorage.getItem("fa-ask");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function snippetCard(key, text) {
  if (!text) return "";
  return '<div class="snippet"><button type="button" class="tiny ghost" data-copy-snippet="' + key + ('">' + tr("复制") + "</button>" + "<pre>") +
    escapeHtml(maskRecipe(text)) + "</pre></div>";
}

function dock() {
  if (!$("dock") || !state || !state.recipes) return;
  document.querySelectorAll("[data-dock]").forEach((b) => b.classList.toggle("on", b.dataset.dock === dockTab));
  const g = liveGateway();
  const use = liveUseCommand(dockTab, g);
  const raw = liveRecipeBody(dockTab, g);
  const install = state.recipes.install && state.recipes.install[dockTab];
  const note = liveDockHint(dockTab, g);
  dockCopy = { use: use || "", install: install || "", raw: raw };
  $("dock").innerHTML = snippetCard("use", use) + (note ? '<p class="hint">' + escapeHtml(note) + "</p>" : "") + snippetCard("install", install) + snippetCard("raw", raw);
}

function render() {
  if (!state) return;
  if ($("count")) $("count").textContent = state.available + " / " + state.total;
  fillVersion();
  fillUpdate();
  fillHome();
  fillHomeAccounts();
  fillConnect();
  fillStats();
  fillDash();
  fillLogs();
  fillGate();
  fillAsk();
  fillPoolFilters();
  renderTable();
  fillAdd();
  dock();
  renderThread();
}

async function load() {
  state = await api("/api/panel");
  render();
  void checkUpdate(true);
}

function gateMsg(ok, err) {
  if ($("gatecfgok")) $("gatecfgok").textContent = ok || "";
  if ($("gatecfgerr")) $("gatecfgerr").textContent = err || "";
}

async function patchAccount(ref, body) {
  await api("/api/panel/accounts/" + encodeURIComponent(ref), { method: "PATCH", body: JSON.stringify(body) });
  await load();
}

if ($("provider")) $("provider").addEventListener("change", hint);
if ($("gatex")) $("gatex").addEventListener("blur", () => {
  savePolicy({ excludeModels: parseExcludeModels($("gatex").value) }).catch((err) => { if ($("adderr")) $("adderr").textContent = err.message; });
});
if ($("freeprev")) $("freeprev").addEventListener("change", () => {
  freeListProv = $("freeprev").value || "";
  try { sessionStorage.setItem("fa-free-prov", freeListProv); } catch {}
  fillFreeList();
});
if ($("freemanual")) $("freemanual").addEventListener("blur", () => {
  saveFreeList().catch((err) => { if ($("freeerr")) $("freeerr").textContent = err.message; });
});
if ($("freeexcl")) $("freeexcl").addEventListener("blur", () => {
  saveFreeList().catch((err) => { if ($("freeerr")) $("freeerr").textContent = err.message; });
});
if ($("freerefresh")) $("freerefresh").addEventListener("click", () => {
  refreshFreeList().catch((err) => { if ($("freeerr")) $("freeerr").textContent = err.message; });
});
if ($("askacc")) $("askacc").addEventListener("change", () => { fillAskModels($("askmodel") ? $("askmodel").value : ""); syncAskToDock(); });
if ($("askmodel")) $("askmodel").addEventListener("change", () => syncAskToDock());
if ($("tokeye")) $("tokeye").addEventListener("click", () => { showToken = !showToken; fillConnect(); dock(); });
if ($("askclear")) $("askclear").addEventListener("click", () => { thread = []; saveThread(); renderThread(); if ($("askerr")) $("askerr").textContent = ""; });
["q", "f-prov", "f-stat", "f-free", "f-on", "lq", "l-prov", "l-acc", "l-src", "l-ok"].forEach((id) => {
  const el = $(id);
  const paint = () => { rememberFilters(); renderTable(); fillLogs(); };
  if (el) el.addEventListener("input", paint);
  if (el) el.addEventListener("change", paint);
});
if ($("addtoggle")) $("addtoggle").addEventListener("click", () => {
  const wrap = $("addwrap");
  wrap.hidden = !wrap.hidden;
  $("addtoggle").textContent = wrap.hidden ? tr("添加 Key") : tr("收起");
});
if ($("exportopen")) $("exportopen").addEventListener("click", async () => {
  if ($("syncmsg")) $("syncmsg").textContent = tr("等本机解锁…");
  $("exportopen").disabled = true;
  try {
    const out = await api("/api/panel/sync/export", { method: "POST", body: JSON.stringify({}) });
    downloadText(out.filename, out.pack);
    if ($("syncmsg")) $("syncmsg").textContent = tr("已导出 ") + out.accounts + tr(" 个账号");
  } catch (err) {
    if ($("syncmsg")) $("syncmsg").textContent = err.message;
  } finally {
    $("exportopen").disabled = false;
  }
});
if ($("importopen")) $("importopen").addEventListener("click", () => { if ($("imperr")) $("imperr").textContent = ""; if ($("impok")) $("impok").textContent = ""; openDlg("importdlg"); });
if ($("importform")) $("importform").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ($("imperr")) $("imperr").textContent = "";
  if ($("impok")) $("impok").textContent = "";
  const file = $("imp-file").files && $("imp-file").files[0];
  if (!file) { $("imperr").textContent = tr("先选一个同步包"); return; }
  if ($("imp-replace").checked && !confirm(tr("全部覆盖会删除本机多出来的账号。确定？"))) return;
  $("impgo").disabled = true;
  $("imperr").textContent = tr("等本机解锁…");
  try {
    const pack = await file.text();
    const out = await api("/api/panel/sync/import", { method: "POST", body: JSON.stringify({ pack, replace: $("imp-replace").checked }) });
    state = out.state;
    $("imp-file").value = "";
    render();
    $("imperr").textContent = "";
    $("impok").textContent = out.replaced ? (tr("已替换，共 ") + out.added + tr(" 个账号")) : (tr("已合并：新增 ") + out.added + tr("，更新 ") + out.updated);
  } catch (err) {
    $("imperr").textContent = err.message;
  } finally {
    $("impgo").disabled = false;
  }
});
if ($("prompt")) $("prompt").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("ask").requestSubmit();
  }
});
if ($("tokrot")) $("tokrot").addEventListener("click", async () => {
  if (!confirm(tr("重新生成访问令牌？Agent 端旧的会立刻失效。"))) return;
  try {
    const out = await api("/api/panel/gateway", { method: "PATCH", body: JSON.stringify({ rotate: true }) });
    state = out.state; render(); gateMsg(tr("已重新生成访问令牌。"), "");
  } catch (err) { gateMsg("", err.message); }
});
if ($("tokset")) $("tokset").addEventListener("click", async () => {
  try {
    const out = await api("/api/panel/gateway", { method: "PATCH", body: JSON.stringify({ token: $("tokcustom").value }) });
    state = out.state; $("tokcustom").value = ""; render(); gateMsg(tr("已使用自定义令牌。"), "");
  } catch (err) { gateMsg("", err.message); }
});
if ($("portsave")) $("portsave").addEventListener("click", async () => {
  try {
    const out = await api("/api/panel/gateway", { method: "PATCH", body: JSON.stringify({ port: $("gateport").value }) });
    state = out.state; render(); gateMsg(out.restart || tr("端口没变。"), "");
  } catch (err) { gateMsg("", err.message); }
});
async function streamAsk(prompt, account, model) {
  const bot = { role: "bot", text: "", via: "", model: "", streaming: true };
  thread.push(bot);
  renderThread();
  const res = await fetch("/api/panel/ask/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FreeAll-Language": locale },
    body: JSON.stringify({ prompt, model: model || "auto", account: account || undefined }),
  });
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("text/event-stream")) {
    const out = await res.json().catch(() => ({}));
    bot.streaming = false;
    if (!res.ok || out.ok === false) {
      bot.error = (out.error && out.error.message) || out.error || out.message || res.statusText || tr("网关请求失败");
      bot.ms = out.ms;
      return;
    }
    bot.text = out.text || "";
    bot.via = out.via || "";
    bot.model = out.model || "";
    bot.ms = out.ms;
    bot.promptTokens = out.promptTokens;
    bot.completionTokens = out.completionTokens;
    bot.tokPerSec = out.tokPerSec;
    return;
  }
  if (!res.ok || !res.body) throw new Error(res.statusText || tr("流式请求失败"));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = "message";
  while (true) {
    const { done, value } = await reader.read();
    buf += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parts = buf.split(/\\n/);
    buf = done ? "" : (parts.pop() || "");
    for (const line of parts) {
      const raw = line.replace(/\\r$/, "");
      if (raw.startsWith("event:")) {
        event = raw.slice(6).trim() || "message";
        continue;
      }
      if (!raw.startsWith("data:")) {
        if (!raw) event = "message";
        continue;
      }
      let data = {};
      try { data = JSON.parse(raw.slice(5).trim() || "{}"); } catch { data = {}; }
      if (event === "meta") {
        bot.via = data.via || bot.via;
        bot.model = data.model || bot.model;
      } else if (event === "delta") {
        bot.text = (bot.text || "") + (data.text || "");
      } else if (event === "done") {
        bot.streaming = false;
        if (data.text != null && data.text !== "") bot.text = data.text;
        bot.ms = data.ms;
        bot.promptTokens = data.promptTokens;
        bot.completionTokens = data.completionTokens;
        bot.tokPerSec = data.tokPerSec;
      } else if (event === "error") {
        bot.streaming = false;
        bot.error = data.error || tr("流式失败");
      }
      renderThread();
      event = "message";
    }
    if (done) break;
  }
  bot.streaming = false;
}

if ($("ask")) $("ask").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("askerr").textContent = "";
  const text = $("prompt").value.trim();
  if (!text) { $("askerr").textContent = tr("先写一句。"); return; }
  thread.push({ role: "user", text });
  $("prompt").value = "";
  saveThread();
  renderThread();
  $("askgo").disabled = true;
  try {
    const account = $("askacc") ? $("askacc").value : "";
    await streamAsk(text, account, $("askmodel") ? $("askmodel").value : "auto");
  } catch (err) {
    const last = thread[thread.length - 1];
    if (last && last.role === "bot" && last.streaming) {
      last.streaming = false;
      last.error = err.message;
    } else {
      thread.push({ role: "bot", error: err.message });
    }
  } finally {
    $("askgo").disabled = false;
    saveThread();
    renderThread();
  }
});
if ($("editkeyshow")) $("editkeyshow").addEventListener("click", () => {
  revealEditKey().catch((err) => { if ($("editerr")) $("editerr").textContent = err.message; });
});
if ($("editkeycopy")) $("editkeycopy").addEventListener("click", () => {
  copyEditKey().catch((err) => { if ($("editerr")) $("editerr").textContent = err.message; });
});
if ($("edit")) $("edit").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingId) return;
  $("editerr").textContent = "";
  $("editsave").disabled = true;
  const rpm = $("editrpm").value.trim();
  const rpd = $("editrpd").value.trim();
  const editingSaved = editingId;
  const prevAcc = state && state.accounts.find((x) => x.id === editingId);
  const prevBase = prevAcc && prevAcc.baseUrl;
  const typedKey = $("editkey") ? $("editkey").value.trim() : "";
  const apiKeyPatch = typedKey && typedKey !== editKeyOriginal ? typedKey : undefined;
  try {
    await api("/api/panel/accounts/" + encodeURIComponent(editingId), {
      method: "PATCH",
      body: JSON.stringify({
        name: $("editname").value,
        note: $("editnote").value,
        free: $("editfree").checked,
        enabled: $("editen").checked,
        preferredModel: $("editmodel").value || undefined,
        baseUrl: $("editbase") ? $("editbase").value : undefined,
        models: $("editmodels") ? $("editmodels").value.split(/\\n/).map((s) => s.trim()).filter(Boolean) : undefined,
        priority: $("editprio") ? Number($("editprio").value || 0) : 0,
        boost: $("editboostwrap") && !$("editboostwrap").hidden ? $("editboost").checked : undefined,
        rpm: rpm === "" ? "catalog" : Number(rpm),
        rpd: rpd === "" ? "catalog" : Number(rpd),
        apiKey: apiKeyPatch,
      }),
    });
    const baseChanged = $("editbase") && String($("editbase").value || "").replace(new RegExp("/+$"), "") !== String(prevBase || "").replace(new RegExp("/+$"), "");
    closeEdit();
    await load();
    if (baseChanged || apiKeyPatch) {
      try {
        await api("/api/panel/accounts/" + encodeURIComponent(editingSaved) + "/models", { method: "POST" });
        await load();
      } catch (refreshErr) {
        if ($("adderr")) $("adderr").textContent = tr("已保存，但刷新模型失败：") + refreshErr.message;
        else if ($("syncmsg")) $("syncmsg").textContent = tr("已保存，但刷新模型失败：") + refreshErr.message;
      }
    }
  } catch (err) {
    $("editerr").textContent = err.message;
  } finally {
    $("editsave").disabled = false;
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("editdlg") && !$("editdlg").hidden) closeEdit();
  else if ($("importdlg") && !$("importdlg").hidden) closeDlg("importdlg");
});
if ($("add")) $("add").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("adderr").textContent = "";
  $("addok").textContent = "";
  $("submit").disabled = true;
  const fd = new FormData($("add"));
  try {
    const out = await api("/api/panel/accounts", {
      method: "POST",
      body: JSON.stringify({
        provider: fd.get("provider"), name: fd.get("name"), apiKey: fd.get("apiKey"),
        baseUrl: fd.get("baseUrl"), note: fd.get("note"), free: $("addfree").checked,
        preferredModel: $("addmodel") && !$("addmodelwrap").hidden ? $("addmodel").value : undefined,
        models: $("addmodels") && !$("addmodelwrap").hidden
          ? $("addmodels").value.split(/\\n/).map((s) => s.trim()).filter(Boolean)
          : undefined,
        boost: $("addboost") && $("addboost").checked,
      }),
    });
    $("add").reset();
    $("addfree").checked = true;
    if ($("addboost")) $("addboost").checked = false;
    $("addok").textContent = out.warning || (tr("已入账 ") + out.account.ref);
    if ($("addwrap")) { $("addwrap").hidden = true; $("addtoggle").textContent = tr("添加 Key"); }
    await load();
  } catch (err) {
    $("adderr").textContent = err.message;
  } finally {
    $("submit").disabled = false;
  }
});

document.body.addEventListener("change", async (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && (t.id === "gatefree" || t.dataset.pol)) {
    if (state && state.policy) {
      if (t.id === "gatefree") state.policy.freeOnly = t.checked;
      if (t.dataset.pol) {
        const boxes = [...document.querySelectorAll("#gatescope input[data-pol]")];
        state.policy.providers = boxes.filter((b) => b.checked).map((b) => b.dataset.pol);
      }
      fillGate();
    }
    savePolicy().catch((err) => { if ($("adderr")) $("adderr").textContent = err.message; });
    return;
  }
  if (t instanceof HTMLSelectElement && (t.id === "gatemodel" || t.id === "gateacc")) {
    if (t.id === "gateacc" && state && state.policy) {
      state.policy.account = t.value || "";
      fillGate();
    }
    savePolicy().catch((err) => { if ($("adderr")) $("adderr").textContent = err.message; });
    return;
  }
  if (t instanceof HTMLInputElement && t.id === "editfree") {
    fillEditModels();
    return;
  }
  if (t instanceof HTMLInputElement && t.id === "editboost") {
    const a = state && state.accounts.find((x) => x.id === editingId);
    if (t.checked) $("editrpd").value = "1000";
    else $("editrpd").value = a && a.catalogLimits && a.catalogLimits.rpd != null ? String(a.catalogLimits.rpd) : "";
  }
});

document.body.addEventListener("click", async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.id === "upd-check" || t.closest?.("#upd-check")) {
    void checkUpdate(false);
    return;
  }
  if (t.id === "filterclear" || t.id === "filterclear2" || t.closest?.("#filterclear") || t.closest?.("#filterclear2")) {
    clearFilters();
    return;
  }
  if (t.id === "upd-btn" || t.closest?.("#upd-btn")) {
    openUpdateUrl(true);
    return;
  }
  const updAct = t.closest?.("[data-upd]");
  if (updAct) {
    const kind = updAct.getAttribute("data-upd");
    if (kind === "go") openUpdateUrl(true);
    else if (kind === "page") openUpdateUrl(false);
    else if (kind === "later") void dismissUpdate();
    return;
  }
  if (t.dataset.closeDlg) {
    closeDlg(t.dataset.closeDlg);
    return;
  }
  if (t.dataset.dock) {
    dockTab = t.dataset.dock;
    try { sessionStorage.setItem("fa-dock", dockTab); } catch {}
    dock();
    return;
  }
  if (t.dataset.copySnippet) {
    await navigator.clipboard.writeText(dockCopy[t.dataset.copySnippet] || "");
    flash(t, tr("已复制"));
    return;
  }
  if (t.dataset.copyFrom) {
    const el = $(t.dataset.copyFrom);
    await navigator.clipboard.writeText(el ? el.textContent : "");
    flash(t, tr("已复制"));
    return;
  }
  if (t.dataset.copySecret) {
    const el = $(t.dataset.copySecret);
    await navigator.clipboard.writeText(el && el.dataset.secret ? el.dataset.secret : "");
    flash(t, tr("已复制"));
    return;
  }
  if (t.dataset.copy) { await navigator.clipboard.writeText(t.dataset.copy); flash(t, tr("已复制")); }
  if (t.dataset.edit) {
    openEdit(t.dataset.edit);
    return;
  }
  if (t.id === "editx" || t.id === "editcancel") {
    closeEdit();
    return;
  }
  if (t.id === "editdlg") {
    closeEdit();
    return;
  }
  if (t.dataset.refresh) {
    t.disabled = true;
    try {
      await api("/api/panel/accounts/" + encodeURIComponent(t.dataset.refresh) + "/models", { method: "POST" });
      await load();
    } catch (err) {
      if ($("adderr")) $("adderr").textContent = err.message;
    } finally { t.disabled = false; }
    return;
  }
  if (t.dataset.logacc) {
    if ($("l-acc")) $("l-acc").value = t.dataset.logacc;
    fillLogs();
    return;
  }
  if (t.dataset.range) {
    document.querySelectorAll("#logrange button[data-range]").forEach((b) => b.classList.toggle("on", b === t));
    fillLogs();
    return;
  }
  if (t.id === "logreload") {
    load().catch((err) => { if ($("askerr")) $("askerr").textContent = err.message; });
    return;
  }
  if (t.dataset.query) {
    $("prompt").value = t.dataset.query;
    $("prompt").focus();
    document.querySelectorAll(".queries button").forEach((b) => b.classList.toggle("on", b === t));
    return;
  }
  if (t.dataset.ref) {
    if (!confirm(tr("删除账号 ") + (t.dataset.label || t.dataset.ref) + "？")) return;
    await api("/api/panel/accounts/" + encodeURIComponent(t.dataset.ref), { method: "DELETE" });
    await load();
  }
});

load().catch((err) => {
  const box = $("adderr") || $("askerr") || $("gatecfgerr");
  if (box) box.textContent = err.message;
});

setInterval(() => { void checkUpdate(true); }, 4 * 60 * 60 * 1000);
`;
