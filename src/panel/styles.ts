export const panelCss = `
.card.about-page { max-width: 760px; margin: 40px auto; padding: clamp(24px, 5vw, 48px); }
.about-page h1 { margin: 6px 0; font: 700 36px/1.2 var(--font-display); }
.about-page .about-eyebrow { color: var(--muted); margin: 0; }
.about-version { color: var(--muted); margin: 18px 0 28px; }
.studio-publisher { display: flex; align-items: center; gap: 16px; padding: 24px 0; border-block: 1px solid var(--line-strong); }
.studio-symbol { width: 72px; flex: 0 0 72px; }
.studio-symbol svg { display: block; width: 100%; }
.about-page .studio-publisher h2 { margin: 0 0 5px; font: 700 22px/1.3 ui-rounded, system-ui, sans-serif; text-transform: none; letter-spacing: normal; }
.studio-publisher p { margin: 0; color: var(--muted); }
.about-summary { max-width: 56ch; line-height: 1.8; margin: 24px 0; }
.about-repository { display: inline-flex; align-items: center; gap: 16px; min-height: 44px; color: var(--ink); font-weight: 600; text-underline-offset: 4px; }
.about-repository:focus-visible { outline: 2px solid var(--ink); outline-offset: 6px; border-radius: 2px; }
.about-copyright { margin-top: 26px; overflow-wrap: anywhere; }
:root {
  --bg: #d8e4f0;
  --bg-deep: #c5d4e6;
  --surface: rgba(255, 255, 255, 0.48);
  --surface-2: rgba(255, 255, 255, 0.72);
  --glass: rgba(255, 255, 255, 0.55);
  --glass-edge: rgba(255, 255, 255, 0.78);
  --ink: #152033;
  --muted: #5a6f88;
  --dim: #8496ab;
  --line: rgba(40, 90, 140, 0.12);
  --line-strong: rgba(40, 90, 140, 0.22);
  --signal: #0d9f6e;
  --signal-bright: #12c98a;
  --signal-dim: rgba(13, 159, 110, 0.12);
  --accent: #e85a2a;
  --accent-dim: rgba(232, 90, 42, 0.12);
  --live: #0d9f6e;
  --dead: #d63d5c;
  --cool: #c4880a;
  --glow: 0 8px 32px rgba(40, 90, 140, 0.08);
  --glass-shadow: 0 4px 24px rgba(40, 70, 110, 0.06), inset 0 1px 0 rgba(255,255,255,0.7);
  --radius: 14px;
  --font-display: "Oxanium", "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--ink);
  background:
    radial-gradient(980px 480px at 6% -12%, rgba(18, 201, 138, 0.18), transparent 55%),
    radial-gradient(860px 420px at 96% -4%, rgba(232, 90, 42, 0.12), transparent 52%),
    radial-gradient(700px 360px at 50% 100%, rgba(90, 150, 220, 0.14), transparent 55%),
    linear-gradient(165deg, #eaf2fa 0%, #d5e3f2 48%, #c9d8ea 100%);
  animation: boot-fade .55s ease both;
}
body[data-page="home"] {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
body[data-page="home"] .wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 10px;
  max-width: none;
}
body[data-page="home"] .home-board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
body[data-page="home"] .home-overview {
  margin-bottom: 0;
  flex-shrink: 0;
}
body[data-page="home"] .home-overview {
  padding: 8px 12px;
}
body[data-page="home"] .home-overview .pagehead { margin-bottom: 6px; }
td.prio { font-family: var(--font-display); font-weight: 700; color: var(--signal); }

body[data-page="home"] .stats-bar {
  margin: 0 0 6px;
  padding: 6px 10px;
  gap: 4px 16px;
}
body[data-page="home"] .stats-bar b { font-size: 15px; }
body[data-page="home"] .log-chart {
  height: 44px;
  margin: 0 0 4px;
  padding: 4px 4px 3px;
}
body[data-page="home"] .poolbar { margin: 0; }
body[data-page="home"] .home-workspace {
  flex: 1;
  min-height: 0;
  gap: 8px;
  align-items: stretch;
}
body[data-page="home"] .home-workspace > .card {
  margin-bottom: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
body[data-page="home"] .trybox .thread { min-height: 0; flex: 1; }
body[data-page="home"] .pagehead { flex-shrink: 0; margin-bottom: 6px; }
body[data-page="home"] .composer {
  flex-shrink: 0;
  margin-top: 6px;
}
body[data-page="home"] .composer textarea {
  min-height: 40px;
  max-height: 64px;
}
body[data-page="home"] .queries { gap: 3px; }
body[data-page="home"] .queries button { padding: 3px 7px; font-size: 10px; }
body[data-page="home"] header.top {
  margin-bottom: 8px;
  padding: 8px 12px;
  flex-shrink: 0;
}
body[data-page="home"] .update-banner { flex-shrink: 0; margin-bottom: 8px; }
body[data-page="home"] #home-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
body[data-page="home"] #home-empty[hidden] { display: none; }
body[data-page="home"] #home-main[hidden] { display: none; }
.connectbox { display: flex; flex-direction: column; min-height: 0; }
.connectbox #dock {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.connectbox .snippet { flex: 0 0 auto; }
.connectbox .snippet:last-child { flex: 1; }
.dock-tabs {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  max-width: min(100%, 520px);
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--glass-edge);
  border-radius: 10px;
  background: rgba(255,255,255,0.4);
}
.dock-tabs button { white-space: nowrap; flex-shrink: 0; margin: 0; }
@keyframes boot-fade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@keyframes pulse-signal {
  0%, 100% { box-shadow: 0 0 0 0 rgba(18, 201, 138, 0.35); }
  50% { box-shadow: 0 0 0 6px rgba(18, 201, 138, 0); }
}
.wrap { width: 100%; max-width: none; margin: 0; padding: 10px 12px 12px; position: relative; box-sizing: border-box; }
.wrap::before {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background:
    linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px) 0 0 / 100% 48px,
    radial-gradient(circle at 20% 30%, rgba(255,255,255,0.25), transparent 40%);
  opacity: .55;
}
.wrap > * , .update-banner { position: relative; z-index: 1; }
header.top {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px 16px;
  padding: 8px 12px; margin-bottom: 12px;
  border: 1px solid var(--glass-edge); border-radius: var(--radius);
  background: linear-gradient(135deg, rgba(255,255,255,0.72), rgba(255,255,255,0.38));
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  box-shadow: var(--glass-shadow);
}
.brand {
  display: inline-flex; align-items: center; gap: 10px;
  text-decoration: none; color: var(--ink); flex-shrink: 0; min-width: 0;
}
.mark-ring {
  width: 30px; height: 30px; border-radius: 9px;
  display: grid; place-items: center;
  font-family: var(--font-display); font-weight: 700; font-size: 14px;
  color: #fff; letter-spacing: 0; line-height: 1;
  background: linear-gradient(145deg, var(--signal-bright), var(--signal));
  box-shadow: 0 4px 16px rgba(13, 159, 110, 0.35);
  animation: pulse-signal 2.8s ease-in-out infinite;
}
.brand-copy {
  display: flex; flex-direction: column; gap: 1px; line-height: 1.15;
}
.brand-copy strong {
  font-family: var(--font-display); font-size: 16px; font-weight: 700;
  letter-spacing: .02em;
}
.brand-sub {
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
}
.meta {
  display: flex; flex-direction: row; align-items: center; justify-content: flex-end;
  gap: 8px; flex-wrap: wrap; text-align: right;
}
.meta .ver,
.ver-chip {
  display: inline-flex; align-items: center;
  padding: 3px 9px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: rgba(255,255,255,0.72);
  font-size: 11px; letter-spacing: .04em; color: var(--ink);
  font-family: var(--font-mono); font-weight: 600;
}
.ver-chip { font-size: 12px; }
.avail-chip {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 4px 10px 5px;
  border: 1px solid var(--glass-edge); border-radius: 999px;
  background: rgba(255,255,255,0.5);
  backdrop-filter: blur(8px);
}
.avail-chip .avail-label {
  font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
}
.avail-chip strong {
  font-size: 15px; font-family: var(--font-display); font-weight: 700;
  letter-spacing: .02em; color: var(--signal); line-height: 1;
}
.upd-btn {
  margin: 0; padding: 3px 10px; border: 1px solid rgba(232,90,42,.35); border-radius: 8px;
  background: rgba(255,255,255,0.55); color: var(--accent);
  font-family: var(--font-display); font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  cursor: pointer; backdrop-filter: blur(8px); transition: background .15s, transform .15s;
}
.upd-btn:hover { background: var(--accent-dim); transform: translateY(-1px); }
.update-banner {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px;
  padding: 12px 16px; margin: 0 0 10px;
  border: 1px solid rgba(232,90,42,.28); border-radius: var(--radius);
  background: linear-gradient(90deg, rgba(255,255,255,0.65), rgba(255,220,200,0.45));
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--glass-shadow); color: var(--ink);
}
.update-banner[hidden] { display: none !important; }
.update-banner-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.update-banner-main strong { font-family: var(--font-display); font-size: 14px; letter-spacing: .04em; color: var(--accent); }
.update-banner-sub { font-size: 11px; color: var(--muted); }
.update-banner-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.update-banner-actions button {
  margin: 0; padding: 6px 12px; border: 1px solid var(--line-strong); border-radius: 8px;
  background: rgba(255,255,255,0.65); color: var(--ink);
  font-family: var(--font-display); font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
  cursor: pointer; backdrop-filter: blur(8px);
}
.update-banner-actions button.primary {
  background: linear-gradient(135deg, var(--accent), #ff8a5c); border-color: transparent; color: #fff;
}
.update-banner-actions button.ghost { background: transparent; }
nav {
  display: inline-flex; border: 1px solid var(--glass-edge); border-radius: 999px;
  background: rgba(255, 255, 255, 0.42); overflow: hidden; justify-self: center;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
  padding: 2px;
}
nav a {
  padding: 6px 14px; text-decoration: none; color: var(--muted);
  border: 0; border-radius: 999px; font-family: var(--font-display);
  letter-spacing: .1em; text-transform: uppercase; font-size: 11px; font-weight: 600;
  transition: color .15s, background .15s, box-shadow .15s;
}
nav a.on, nav a:hover {
  background: rgba(255,255,255,0.78); color: var(--signal);
  box-shadow: 0 1px 4px rgba(40,70,110,0.08);
}
.card {
  background: linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32));
  border: 1px solid var(--glass-edge); border-radius: var(--radius);
  padding: 12px 14px; margin-bottom: 12px;
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
}
.pagehead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.pagehead h2 { margin: 0; }
.now { font-size: 11px; margin: 0; color: var(--muted); }
.settings-page h3 {
  font-family: var(--font-display); font-size: 12px; margin: 0 0 6px;
  letter-spacing: .1em; text-transform: uppercase; color: var(--signal);
}
.settings-grid {
  display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 14px 22px;
  padding-top: 10px; border-top: 1px solid var(--line); margin-top: 8px;
}
.settings-col { min-width: 0; }
.settings-page .field { margin-top: 6px; }
.settings-page .field.compact { margin-top: 6px; }
.settings-page textarea { min-height: 0; }
.settings-page .hint { margin: 0 0 6px; }
.settings-page .chip { margin-top: 6px; }
.settings-page .pagehead .hint { margin: 0; font-size: 11px; }
body[data-page="settings"] {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
body[data-page="settings"] .wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 10px;
}
body[data-page="settings"] .settings-page {
  flex: 1;
  min-height: 0;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
body[data-page="settings"] .settings-grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  align-content: start;
}
#upd-status { margin: 0; }
details summary { cursor: pointer; font-family: var(--font-display); letter-spacing: .06em; text-transform: uppercase; }
.empty-hero {
  background: linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32));
  border: 1px solid var(--glass-edge); border-radius: var(--radius);
  padding: 36px 16px; text-align: center;
  backdrop-filter: blur(16px); box-shadow: var(--glass-shadow);
}
.empty-hero p { margin: 0 0 12px; color: var(--muted); }
.dock-tabs {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 4px;
  border: 1px solid var(--glass-edge); border-radius: 10px;
  background: rgba(255,255,255,0.4); backdrop-filter: blur(10px);
}
.dock-tabs button {
  margin: 0; border: 0; border-radius: 7px; background: transparent; color: var(--muted);
}
.dock-tabs button.on {
  background: rgba(255,255,255,0.75); color: var(--signal);
  box-shadow: 0 1px 8px rgba(13,159,110,0.12), inset 0 0 0 1px rgba(13,159,110,0.2);
}
.snippet {
  position: relative;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid var(--glass-edge); border-radius: 10px;
  padding: 12px 44px 12px 12px;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
}
.snippet + .snippet { margin-top: 8px; }
.snippet pre {
  margin: 0; font: inherit; font-size: 11px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-all; color: #2a3d55;
}
#dock { flex: 1; display: flex; flex-direction: column; min-height: 0; }
#dock .snippet:last-child { flex: 1; }
.snippet [data-copy-snippet] { position: absolute; top: 8px; right: 8px; }
#addwrap { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
h2 {
  font-family: var(--font-display); font-size: 15px; margin: 0 0 6px;
  text-transform: uppercase; letter-spacing: .08em; font-weight: 600;
}
.hint { font-size: 11px; line-height: 1.45; margin: 0 0 8px; color: var(--muted); }
.hint a { color: var(--accent); }
.err { color: var(--dead); font-size: 11px; margin-top: 6px; white-space: pre-wrap; }
.ok { color: var(--live); font-size: 11px; margin-top: 6px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; }
.field { margin-top: 6px; }
label {
  display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
  margin: 0 0 4px; color: var(--dim);
}
#editmodels, #addmodels { min-height: 72px; font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12px; }
input, select, button, textarea {
  font: inherit; width: 100%;
  border: 1px solid var(--line); border-radius: 9px;
  background: rgba(255, 255, 255, 0.62); color: var(--ink); padding: 7px 10px;
  backdrop-filter: blur(8px);
  transition: border-color .15s, box-shadow .15s, background .15s;
}
input:focus, select:focus, textarea:focus {
  outline: none; border-color: rgba(13,159,110,.45);
  box-shadow: 0 0 0 3px rgba(13,159,110,.12);
  background: rgba(255,255,255,0.85);
}
button {
  cursor: pointer;
  background: linear-gradient(135deg, rgba(18,201,138,0.18), rgba(13,159,110,0.1));
  color: var(--signal);
  border-color: rgba(13,159,110,.3);
  font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; margin-top: 8px;
  font-weight: 600;
}
button:hover {
  border-color: rgba(13,159,110,.5);
  background: linear-gradient(135deg, rgba(18,201,138,0.28), rgba(13,159,110,0.14));
  box-shadow: 0 4px 16px rgba(13,159,110,.12);
}
button.ghost { background: rgba(255,255,255,0.35); color: var(--muted); border-color: var(--line); }
button.ghost:hover { color: var(--ink); border-color: var(--line-strong); background: rgba(255,255,255,0.65); }
button.danger { background: rgba(214,61,92,.1); color: var(--dead); border-color: rgba(214,61,92,.28); width: auto; margin: 0; padding: 4px 8px; }
button.tiny { width: auto; margin: 0; padding: 4px 8px; font-size: 10px; }
button:disabled { opacity: .45; cursor: wait; }
.checks { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 4px 0; }
.checks label, .toggles label {
  display: flex; align-items: center; gap: 5px; margin: 0;
  text-transform: none; letter-spacing: 0; font-size: 12px; color: var(--ink);
}
.checks input, .toggles input { width: auto; margin: 0; }
.pills { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px; }
.pill {
  border: 1px solid var(--line); border-radius: 999px; padding: 3px 9px; font-size: 10px;
  text-decoration: none; color: var(--muted); background: rgba(255,255,255,.45);
}
.pill.rec { border-color: rgba(232,90,42,.4); color: var(--accent); background: var(--accent-dim); }
.chip { display: grid; grid-template-columns: 72px 1fr auto; gap: 6px; align-items: center; margin-top: 6px; }
.key-row {
  display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center;
}
.key-row input { margin: 0; font-family: var(--font-mono); }
.key-row button { margin: 0; white-space: nowrap; }
#editkeyhint { margin-top: 4px; }
.chip span { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); }
.chip code {
  display: block; font: inherit; font-size: 11px;
  background: rgba(255,255,255,.65); border: 1px solid var(--line); border-radius: 8px;
  padding: 6px 8px; word-break: break-all; color: #2a3d55;
}
.actions { display: flex; gap: 4px; flex-wrap: wrap; }
.stats-bar {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 22px;
  background: rgba(255,255,255,0.35);
  border: 1px solid var(--line); border-radius: 10px;
  padding: 8px 12px; margin-bottom: 8px; font-size: 11px; color: var(--muted);
  letter-spacing: .04em; text-transform: uppercase;
}
.stats-bar b {
  font-family: var(--font-display); font-size: 16px; color: var(--ink);
  letter-spacing: 0; margin-right: 4px; text-transform: none; font-weight: 600;
}
.toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: end; margin-bottom: 8px; }
.toolbar .field { margin: 0; min-width: 110px; width: 128px; }
.toolbar .field.grow { flex: 1; min-width: 160px; width: auto; }
.toolbar input, .toolbar select { width: 100%; }
.poolbar { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--muted); margin: 0 0 8px; }
.poolbar b { color: var(--ink); }
.table-wrap {
  overflow: auto; border: 1px solid var(--glass-edge); border-radius: 12px;
  background: rgba(255, 255, 255, 0.48);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--glass-shadow);
}
table.ledger { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 880px; }
table.ledger th, table.ledger td {
  text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; white-space: nowrap;
}
table.ledger label { display: inline-flex; align-items: center; gap: 4px; margin: 0; }
table.ledger .actions { flex-wrap: nowrap; }
table.ledger th {
  position: sticky; top: 0; background: rgba(240, 246, 252, 0.92); color: var(--signal);
  font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-family: var(--font-display);
  backdrop-filter: blur(10px);
}
table.ledger tr:hover td { background: rgba(13,159,110,.05); }
table.ledger tr.off td { opacity: .45; }
td.remain, td.today, td.note { color: var(--muted); }
table.ledger td.note { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
table.ledger td.model { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.tag {
  display: inline-block; border: 1px solid currentColor; border-radius: 4px;
  padding: 0 5px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
}
.tag.on { color: var(--live); }
.tag.off { color: var(--dim); }
.modal-back {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(180, 200, 220, .45);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.modal-back[hidden] { display: none; }
.modal {
  width: min(540px, 100%); max-height: 90vh; overflow: auto;
  background: linear-gradient(165deg, rgba(255,255,255,0.82), rgba(255,255,255,0.58));
  border: 1px solid var(--glass-edge); border-radius: 16px;
  box-shadow: 0 24px 80px rgba(40,70,110,.18), var(--glass-shadow);
  backdrop-filter: blur(22px) saturate(1.3); -webkit-backdrop-filter: blur(22px) saturate(1.3);
  padding: 14px 16px 16px;
}
.modal .pagehead { margin-bottom: 4px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.modal-foot button { margin: 0; width: auto; }
.stamp {
  display: inline-block; border: 1px solid currentColor; border-radius: 4px; padding: 0 5px;
  font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; font-size: 10px;
}
.healthy, .unknown { color: var(--live); }
.cooldown { color: var(--cool); }
.invalid, .error { color: var(--dead); }
.empty { padding: 22px 10px; color: var(--muted); text-align: center; }
.queries { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
.queries button { margin: 0; }
.queries button.on { border-color: rgba(232,90,42,.4); color: var(--accent); background: var(--accent-dim); }
.split { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: 12px; align-items: stretch; }
.split > .card { margin-bottom: 0; min-width: 0; align-self: stretch; display: flex; flex-direction: column; }
.trybox .thread { min-height: 120px; flex: 1; }
.thread {
  flex: 1; min-height: 80px; overflow: auto;
  background: rgba(255, 255, 255, 0.42); border: 1px solid var(--glass-edge); border-radius: 12px;
  padding: 10px; display: flex; flex-direction: column; gap: 8px;
  backdrop-filter: blur(12px);
}
.thread .empty { margin: auto; padding: 16px 8px; }
.bubble {
  max-width: 82%; padding: 8px 10px; border-radius: 12px;
  border: 1px solid var(--line); font-size: 12px; line-height: 1.45;
  white-space: pre-wrap; word-break: break-word;
  backdrop-filter: blur(8px);
}
.bubble.user {
  align-self: flex-end;
  background: linear-gradient(135deg, rgba(18,201,138,.22), rgba(13,159,110,.08));
  border-color: rgba(13,159,110,.28); color: var(--ink);
}
.bubble.bot { align-self: flex-start; background: rgba(255,255,255,.7); }
.bubble.err { align-self: flex-start; background: rgba(214,61,92,.1); border-color: rgba(214,61,92,.28); color: var(--dead); }
.bubble .who { display: block; font-size: 10px; letter-spacing: .06em; opacity: .7; margin-bottom: 2px; }
.bubble .meta { display: block; font-size: 10px; color: var(--muted); margin-bottom: 4px; letter-spacing: 0; text-transform: none; }
.bubble .cursor {
  display: inline-block; width: 0.55em; margin-left: 1px;
  color: var(--signal); animation: blink-cursor .9s step-end infinite;
}
@keyframes blink-cursor {
  50% { opacity: 0; }
}
.composer { margin-top: 8px; }
#gatex, #freemanual, #freeexcl {
  resize: vertical; line-height: 1.45; white-space: pre; overflow: auto; cursor: text;
}
#gatex { min-height: 72px; max-height: 180px; }
#freemanual, #freeexcl { min-height: 96px; max-height: 220px; }

/* 设置 · 账号模型花名册 */
.model-roster {
  display: flex; flex-direction: column; gap: 8px;
  max-height: 320px; overflow: auto; padding: 2px;
  border: 1px solid var(--line); border-radius: 12px;
  background: rgba(255,255,255,0.35);
}
.roster-empty, .roster-miss {
  margin: 0; padding: 14px 12px; color: var(--muted); font-size: 12px;
}
.roster-empty a, .roster-miss a { color: var(--signal); }
.roster-card {
  margin: 0 6px; padding: 10px 12px;
  border: 1px solid var(--line); border-radius: 11px;
  background: rgba(255,255,255,0.72);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
}
.roster-card.skipped { opacity: .72; background: rgba(255,255,255,0.45); }
.roster-top {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.roster-id { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.roster-id strong {
  font-family: var(--font-display); font-size: 13px; letter-spacing: .02em;
  color: var(--ink);
}
.roster-prov {
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--dim);
}
.roster-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.roster-n { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.roster-pref {
  margin-top: 4px; font-size: 11px; color: var(--muted);
}
.roster-pref code {
  font-family: var(--font-mono); font-size: 11px; color: var(--signal);
  background: var(--signal-dim); padding: 1px 6px; border-radius: 6px;
}
.tag {
  display: inline-flex; align-items: center; height: 18px; padding: 0 7px;
  border-radius: 999px; font-size: 10px; letter-spacing: .06em;
  text-transform: uppercase; font-family: var(--font-display);
}
.tag.free { background: var(--signal-dim); color: var(--signal); }
.tag.paid { background: var(--accent-dim); color: var(--accent); }
.tag.muted { background: rgba(90,111,136,.12); color: var(--muted); }
.chip-row {
  display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;
}
.mchip {
  display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 3px 8px; border-radius: 7px; font-size: 11px;
  background: rgba(21,32,51,0.05); color: var(--ink); border: 1px solid var(--line);
}
.mchip.on {
  background: var(--signal-dim); border-color: rgba(13,159,110,.35); color: var(--signal);
  font-weight: 600;
}
.mchip.more {
  background: transparent; color: var(--muted); border-style: dashed;
}
.dim { color: var(--dim); font-size: 11px; }

/* 设置 · 免费模型表 */
.settings-col.free-board {
  grid-column: 1 / -1;
  margin-top: 4px;
  padding: 14px 16px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background:
    linear-gradient(145deg, rgba(255,255,255,0.7), rgba(255,255,255,0.42)),
    radial-gradient(500px 160px at 0% 0%, rgba(13,159,110,0.08), transparent 60%);
}
.free-head {
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 10px 16px; margin-bottom: 10px;
}
.free-head h3 { margin: 0 0 2px; }
.free-head .hint { margin: 0; }
.free-toolbar {
  display: flex; flex-wrap: wrap; align-items: end; gap: 8px;
}
.free-prov {
  display: flex; flex-direction: column; gap: 3px;
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
}
.free-prov select { min-width: 148px; margin: 0; }
.free-count {
  display: inline-flex; align-items: center; height: 28px; padding: 0 10px;
  border-radius: 999px; font-family: var(--font-display); font-size: 11px;
  letter-spacing: .06em; text-transform: uppercase;
  background: var(--signal-dim); color: var(--signal); border: 1px solid rgba(13,159,110,.25);
}
.free-edit {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.free-pane label {
  display: block; margin-bottom: 4px;
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
}
.free-pane textarea {
  width: 100%; margin: 0;
  background: rgba(255,255,255,0.7);
}
.free-live { margin-top: 10px; }
.free-live > label {
  display: block; margin-bottom: 6px;
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
}
.free-live .chip-row {
  min-height: 40px; max-height: 120px; overflow: auto;
  padding: 8px; margin-top: 0;
  border: 1px dashed var(--line-strong); border-radius: 10px;
  background: rgba(255,255,255,0.4);
}
@media (max-width: 900px) {
  .free-edit { grid-template-columns: 1fr; }
  .settings-col.free-board { grid-column: auto; }
}

.composer textarea { min-height: 44px; resize: vertical; }
.composer-row { display: grid; grid-template-columns: 1fr 1fr 1fr auto auto; gap: 6px; align-items: center; margin-top: 6px; }
.composer-row button { margin: 0; width: auto; }
.blurb { margin: 0 0 6px; font-size: 11px; line-height: 1.35; color: var(--muted); }
.gate-tools { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: end; margin-top: 8px; }
.gate-tools button { margin: 0; }
.jumps { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; justify-content: center; }
.jumps a {
  display: inline-block; padding: 7px 12px; border: 1px solid rgba(13,159,110,.28);
  border-radius: 9px; text-decoration: none; color: var(--signal);
  background: rgba(255,255,255,0.55); font-family: var(--font-display);
  letter-spacing: .08em; text-transform: uppercase; font-size: 12px;
  backdrop-filter: blur(8px); box-shadow: var(--glass-shadow);
}
.jumps a:hover { box-shadow: 0 6px 20px rgba(13,159,110,.18); background: rgba(255,255,255,0.8); }
.tiny-link {
  font-family: var(--font-display); font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--accent); text-decoration: none;
}
.tiny-link:hover { text-decoration: underline; }
.log-chart {
  display: flex; align-items: flex-end; gap: 2px; height: 52px;
  border: 1px solid var(--glass-edge); border-radius: 12px;
  background: rgba(255, 255, 255, 0.45); padding: 6px 6px 4px; margin: 0 0 6px;
  backdrop-filter: blur(10px);
}
.log-chart i {
  flex: 1; min-width: 4px; background: #a8bdd4; opacity: .45; display: block; border-radius: 2px 2px 0 0;
}
.log-chart i.ok { background: linear-gradient(180deg, var(--signal-bright), var(--signal)); opacity: .95; }
.log-chart i.zero { opacity: .15; height: 3px !important; }
table.ledger.logbook { min-width: 1100px; }
table.ledger.logbook td.fail { color: var(--dead); }
table.ledger.logbook .model { max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
table.ledger.logbook button.acc-pin {
  margin: 0; padding: 0; width: auto; border: 0; background: none;
  font: inherit; color: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
}
table.ledger.logbook button.acc-pin:hover { color: var(--signal); }
.dash .poolbar { margin-bottom: 0; }
@media (max-width: 900px) {
  header.top { grid-template-columns: 1fr auto; }
  header.top nav { grid-column: 1 / -1; }
  .pair, .chip, .gate-tools, .split, .settings-grid, .composer-row, .key-row { grid-template-columns: 1fr; }
  .meta { text-align: right; }
  .chip > span:first-child { grid-column: 1 / -1; }
}

/* Allow translated labels and long provider/model names to reflow. */
.language-control { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.language-control > span { font-size: 11px; color: var(--muted); }
.language-control select { width: auto; min-width: 100px; padding: 5px 8px; }
nav { flex-wrap: wrap; min-width: 0; }
.pagehead, .free-toolbar, .free-head, .queries, .dock-tabs { flex-wrap: wrap; }
.settings-col, .card, .field, .brand-copy { min-width: 0; }
.hint, .blurb, .roster-pref { overflow-wrap: anywhere; }
button { white-space: normal; height: auto; }
@media (max-width: 900px) {
  body[data-page="home"] { height: auto; overflow: auto; }
  body[data-page="home"] .home-workspace { display: grid; grid-template-columns: 1fr; }
  body[data-page="home"] .trybox { min-height: 350px; }
  header.top { grid-template-columns: 1fr; }
  header.top .meta { grid-column: 1; justify-content: flex-start; text-align: left; }
  .language-control select { min-height: 36px; }
}
`;
