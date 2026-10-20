import { tr } from "../i18n.js";
import { aboutView } from "./about.js";
export type PanelPath = "/" | "/pool" | "/settings" | "/try" | "/connect" | "/logs" | "/about";

export function pageId(path: string): "home" | "pool" | "settings" | "logs" | "about" {
  if (path === "/about") return "about";
  if (path === "/pool") return "pool";
  if (path === "/settings") return "settings";
  if (path === "/logs") return "logs";
  return "home";
}

export function pageTitle(path: string): string {
  const map = { home: tr("看板"), pool: tr("账号池"), settings: tr("设置"), logs: tr("日志"), about: tr("关于") };
  return map[pageId(path)];
}

export function viewBody(path: string): string {
  const id = pageId(path);
  if (id === "about") return aboutView();
  if (id === "pool") return poolView();
  if (id === "settings") return settingsView();
  if (id === "logs") return logsView();
  return homeView();
}

function homeView(): string {
  return `
<section class="empty-hero" id="home-empty" hidden>
  <p>${tr("还没有账号。")}</p>
  <div class="jumps"><a href="/pool">${tr("去账号池添加 Key")}</a></div>
</section>
<div id="home-main" class="home-board">
  <section class="card home-overview" id="dash">
    <div class="pagehead">
      <h2>${tr("近 24 小时")}</h2>
      <a class="tiny-link" href="/logs">${tr("看日志")}</a>
    </div>
    <div class="stats-bar" id="stats"></div>
    <div class="log-chart" id="dashchart"></div>
    <div class="poolbar" id="dashbreak"></div>
  </section>
  <div class="split home-workspace">
    ${tryBlock()}
    ${connectView()}
  </div>
</div>`;
}


function settingsView(): string {
  return `
<section class="card settings-page">
  <div class="pagehead">
    <h2>${tr("设置")}</h2>
    <div class="queries">
      <span class="ver-chip" id="settings-ver">—</span>
      <button type="button" class="tiny ghost" id="upd-check">${tr("检查更新")}</button>
      <span class="hint" id="upd-status">${tr("正在读取版本…")}</span>
    </div>
  </div>
  <div class="settings-grid">
    <section class="settings-col">
      <h3>${tr("路由规则")}</h3>
      <p class="hint" id="policyhint">${tr("不选供应商=全部。选号：钉账号→供应商→免费档→指定模型→优先级→余量。")}</p>
      <div class="field compact">
        <label>${tr("默认供应商")}</label>
        <div class="checks" id="gatescope"></div>
      </div>
      <div class="pair">
        <div class="field"><label>${tr("默认模型")}</label><select id="gatemodel"></select></div>
        <div class="field"><label>${tr("固定账号")}</label><select id="gateacc"></select></div>
      </div>
      <div class="checks"><label><input type="checkbox" id="gatefree" />${tr(" 只用免费账号（auto ≈ free-auto）")}</label></div>
      <div class="field compact">
        <label>${tr("账号可用模型")}</label>
        <p class="hint" id="gatemodelshint">${tr("随上方供应商 / 固定账号变化，来自账号池声明。")}</p>
        <div id="gatemodels" class="model-roster" role="list" aria-live="polite"></div>
      </div>
      <div class="field compact">
        <label>${tr("排除模型")}</label>
        <textarea id="gatex" rows="2" spellcheck="false" autocomplete="off" placeholder="${tr("每行一个模型 ID，auto 会跳过")}"></textarea>
      </div>
      <p class="ok" id="gateok"></p>
    </section>
    <section class="settings-col">
      <h3>${tr("访问令牌 / 端口")}</h3>
      <p class="hint">${tr("换令牌后 Agent 需同步。改端口：")}<code>freeall stop && freeall ui</code></p>
      <div class="chip"><span>OpenAI</span><code id="out-openai"></code><button type="button" class="tiny ghost" data-copy-from="out-openai">${tr("复制")}</button></div>
      <div class="chip"><span>Anthropic</span><code id="out-anth"></code><button type="button" class="tiny ghost" data-copy-from="out-anth">${tr("复制")}</button></div>
      <div class="chip">
        <span>${tr("令牌")}</span>
        <code id="out-token"></code>
        <span class="actions">
          <button type="button" class="tiny ghost" id="tokeye">${tr("显示")}</button>
          <button type="button" class="tiny ghost" data-copy-secret="out-token">${tr("复制")}</button>
          <button type="button" class="tiny ghost" id="tokrot">${tr("重新生成")}</button>
        </span>
      </div>
      <div class="gate-tools">
        <div class="field" style="margin:0"><label>${tr("自定义令牌")}</label><input id="tokcustom" placeholder="${tr("至少 12 位")}" autocomplete="off" /></div>
        <button type="button" class="tiny ghost" id="tokset">${tr("使用")}</button>
      </div>
      <div class="gate-tools">
        <div class="field" style="margin:0"><label>${tr("端口")}</label><input id="gateport" type="number" min="1" max="65535" /></div>
        <button type="button" class="tiny ghost" id="portsave">${tr("保存")}</button>
      </div>
      <p class="ok" id="gatecfgok"></p>
      <p class="err" id="gatecfgerr"></p>
    </section>
    <section class="settings-col free-board">
      <div class="free-head">
        <div>
          <h3>${tr("供应商免费模型表")}</h3>
          <p class="hint">${tr("供 free-auto 使用。手填优先于探测；剔除的永不回潮。")}</p>
        </div>
        <div class="free-toolbar">
          <label class="free-prov">
            <span>${tr("供应商")}</span>
            <select id="freeprev"></select>
          </label>
          <button type="button" class="tiny ghost" id="freerefresh">${tr("从账号刷新")}</button>
          <span class="free-count" id="freecount">${tr("生效 0")}</span>
        </div>
      </div>
      <div class="free-edit">
        <div class="free-pane">
          <label>${tr("手填优先")}</label>
          <textarea id="freemanual" rows="4" spellcheck="false" autocomplete="off" placeholder="${tr("每行一个，排在最前")}"></textarea>
        </div>
        <div class="free-pane">
          <label>${tr("剔除")}</label>
          <textarea id="freeexcl" rows="4" spellcheck="false" autocomplete="off" placeholder="${tr("每行一个，从生效列表去掉")}"></textarea>
        </div>
      </div>
      <div class="free-live">
        <label>${tr("生效列表 · free-auto")}</label>
        <div id="freeeff" class="chip-row" role="list"></div>
      </div>
      <p class="ok" id="freeok"></p>
      <p class="err" id="freeerr"></p>
    </section>
  </div>
</section>`;
}

function poolView(): string {
  return `
<section class="card">
  <div class="pagehead">
    <h2>${tr("账号池")}</h2>
    <div class="queries">
      <button type="button" class="tiny ghost" id="exportopen">${tr("导出")}</button>
      <button type="button" class="tiny ghost" id="importopen">${tr("导入")}</button>
      <button type="button" class="tiny" id="addtoggle">${tr("添加 Key")}</button>
    </div>
  </div>
  <p class="hint" id="syncmsg"></p>
  <p class="hint" id="poolroutehint">${tr("选号：钉账号 → 供应商范围 → 免费档（账号自配）→ 指定模型（硬过滤；收费模型排除免费号）→ 优先级 → 余量。选模：free-auto 走免费模型表；否则请求指定 → 账号首选 → 可用模型列表。")}</p>
  <div id="addwrap" hidden>
    <div class="pills" id="pills"></div>
    <form id="add">
      <div class="pair">
        <div class="field"><label>${tr("供应商")}</label><select id="provider" name="provider"></select></div>
        <div class="field"><label>${tr("账号名")}</label><input name="name" placeholder="work / home" autocomplete="off" /></div>
      </div>
      <p class="hint" id="provhint"></p>
      <div class="pair">
        <div class="field"><label>API Key</label><input name="apiKey" type="password" placeholder="${tr("官网申请的 Key")}" autocomplete="off" /></div>
        <div class="field"><label>${tr("备注")}</label><input name="note" maxlength="240" placeholder="${tr("邮箱 / 用途")}" /></div>
      </div>
      <div class="field"><label>Base URL</label><input id="baseUrl" name="baseUrl" placeholder="${tr("选供应商后自动填写")}" /></div>
      <div class="pair" id="addmodelwrap" hidden>
        <div class="field"><label>${tr("首选模型（可选）")}</label><input id="addmodel" name="preferredModel" placeholder="${tr("如 gpt-4o-mini")}" autocomplete="off" /></div>
        <div class="field"><label>${tr("可用模型（可选，每行一个）")}</label><textarea id="addmodels" name="models" rows="3" placeholder="${tr("探测失败时可手填")}" spellcheck="false"></textarea></div>
      </div>
      <div class="checks">
        <label><input type="checkbox" id="addfree" name="free" checked />${tr(" 免费档（自配，不从模型推断）")}</label>
        <label id="addboostwrap" hidden><input type="checkbox" id="addboost" name="boost" />${tr(" OpenRouter 充值 ≥$10（本机日限 1000）")}</label>
      </div>
      <button type="submit" id="submit">${tr("添加")}</button>
      <div class="err" id="adderr"></div>
      <div class="ok" id="addok"></div>
    </form>
  </div>
  <div class="toolbar">
    <div class="field grow"><label>${tr("搜索")}</label><input id="q" placeholder="${tr("账号 / 备注")}" /></div>
    <div class="field"><label>${tr("供应商")}</label><select id="f-prov"></select></div>
    <div class="field"><label>${tr("状态")}</label><select id="f-stat">
      <option value="all">${tr("全部")}</option>
      <option value="usable">${tr("可用")}</option>
      <option value="cooldown">${tr("冷却中")}</option>
      <option value="bad">${tr("异常")}</option>
    </select></div>
    <div class="field"><label>${tr("档位")}</label><select id="f-free">
      <option value="all">${tr("全部")}</option>
      <option value="free">${tr("免费")}</option>
      <option value="paid">${tr("付费")}</option>
    </select></div>
    <div class="field"><label>${tr("参与轮换")}</label><select id="f-on">
      <option value="all">${tr("全部")}</option>
      <option value="on">${tr("已开启")}</option>
      <option value="off">${tr("已关闭")}</option>
    </select></div>
    <div class="field" style="align-self:end"><button type="button" class="tiny ghost" id="filterclear">${tr("清除筛选")}</button></div>
  </div>
  <div class="poolbar" id="poolstats"></div>
  <div class="table-wrap" id="table"></div>
</section>
<div class="modal-back" id="editdlg" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="edittitle">
    <div class="pagehead">
      <h2 id="edittitle">${tr("编辑账号")}</h2>
      <button type="button" class="tiny ghost" id="editx">${tr("关闭")}</button>
    </div>
    <p class="hint" id="editref"></p>
    <form id="edit">
      <div class="pair">
        <div class="field"><label>${tr("账号名")}</label><input id="editname" name="name" autocomplete="off" /></div>
        <div class="field">
          <label>${tr("首选模型")}</label>
          <input id="editmodel" list="editmodellist" placeholder="${tr("可手填模型 ID")}" autocomplete="off" />
          <datalist id="editmodellist"></datalist>
        </div>
      </div>
      <div class="field">
        <label>API Key</label>
        <div class="key-row">
          <input id="editkey" type="password" autocomplete="off" placeholder="${tr("留空则不改")}" spellcheck="false" />
          <button type="button" class="tiny ghost" id="editkeyshow">${tr("显示")}</button>
          <button type="button" class="tiny ghost" id="editkeycopy">${tr("复制")}</button>
        </div>
        <p class="hint" id="editkeyhint">${tr("当前 Key 脱敏显示；点「显示」需本机解锁。")}</p>
      </div>
      <div class="field"><label>Base URL</label><input id="editbase" placeholder="https://api.example.com/v1" autocomplete="off" /></div>
      <div class="field" id="editmodelswrap">
        <label>${tr("可用模型（每行一个，可手填）")}</label>
        <textarea id="editmodels" rows="4" placeholder="${tr("保存后用于号池硬过滤与下拉候选")}" spellcheck="false"></textarea>
      </div>
      <div class="pair">
        <div class="field">
          <label>${tr("优先级")}</label>
          <input id="editprio" type="number" min="-99" max="99" step="1" placeholder="0" />
        </div>
        <div class="field"><label>${tr("备注")}</label><input id="editnote" name="note" maxlength="240" placeholder="${tr("邮箱 / 用途")}" /></div>
      </div>
      <p class="hint">${tr("优先级越大越先用；同级随机挑。默认 0，范围 -99～99。")}</p>
      <div class="checks">
        <label><input type="checkbox" id="editfree" />${tr(" 免费档（自配，不从模型推断）")}</label>
        <label><input type="checkbox" id="editen" />${tr(" 参与轮换")}</label>
        <label id="editboostwrap" hidden><input type="checkbox" id="editboost" />${tr(" OpenRouter 充值 ≥$10")}</label>
      </div>
      <div class="pair">
        <div class="field"><label>${tr("本机每分钟上限")}</label><input id="editrpm" type="number" min="1" placeholder="${tr("目录默认")}" /></div>
        <div class="field"><label>${tr("本机每日上限")}</label><input id="editrpd" type="number" min="1" placeholder="${tr("目录默认")}" /></div>
      </div>
      <p class="hint" id="edithint">${tr("留空=使用目录默认值。只改本机限额估算，不读取官网账单。")}</p>
      <div class="modal-foot">
        <button type="button" class="tiny ghost" id="editcancel">${tr("取消")}</button>
        <button type="submit" id="editsave">${tr("保存")}</button>
      </div>
      <div class="err" id="editerr"></div>
    </form>
  </div>
</div>
<div class="modal-back" id="importdlg" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="importtitle">
    <div class="pagehead">
      <h2 id="importtitle">${tr("导入账号池")}</h2>
      <button type="button" class="tiny ghost" data-close-dlg="importdlg">${tr("关闭")}</button>
    </div>
    <p class="hint">${tr("选择本机导出的同步包。导入时会要求本机解锁（指纹或密码）。")}</p>
    <form id="importform">
      <div class="field"><label>${tr("同步包")}</label><input id="imp-file" type="file" accept=".json,application/json" /></div>
      <div class="checks"><label><input type="checkbox" id="imp-replace" />${tr(" 全部覆盖")}</label></div>
      <div class="modal-foot">
        <button type="button" class="tiny ghost" data-close-dlg="importdlg">${tr("取消")}</button>
        <button type="submit" id="impgo">${tr("导入")}</button>
      </div>
      <div class="err" id="imperr"></div>
      <div class="ok" id="impok"></div>
    </form>
  </div>
</div>`;
}

function logsView(): string {
  return `
<section class="card">
  <div class="pagehead">
    <h2>${tr("日志")}</h2>
    <div class="queries" id="logrange">
      <button type="button" class="tiny ghost" data-range="1">${tr("1 小时")}</button>
      <button type="button" class="tiny ghost on" data-range="24">${tr("24 小时")}</button>
      <button type="button" class="tiny ghost" data-range="48">${tr("48 小时")}</button>
      <button type="button" class="tiny ghost" id="logreload">${tr("刷新")}</button>
    </div>
  </div>
  <p class="hint">${tr("本机请求记录，保留 48 小时。费用按免费档记 $0，不是官网账单。")}</p>
  <div class="log-chart" id="logchart"></div>
  <div class="toolbar">
    <div class="field grow"><label>${tr("搜索")}</label><input id="lq" placeholder="${tr("模型 / 账号 / 来源")}" /></div>
    <div class="field"><label>${tr("供应商")}</label><select id="l-prov"><option value="all">${tr("全部")}</option></select></div>
    <div class="field"><label>${tr("账号")}</label><select id="l-acc"><option value="all">${tr("全部")}</option></select></div>
    <div class="field"><label>${tr("来源")}</label><select id="l-src">
      <option value="all">${tr("全部")}</option>
      <option value="ask">${tr("试一句")}</option>
      <option value="cli">CLI</option>
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
      <option value="stream">${tr("流式")}</option>
    </select></div>
    <div class="field"><label>${tr("结果")}</label><select id="l-ok">
      <option value="all">${tr("全部")}</option>
      <option value="ok">${tr("成功")}</option>
      <option value="fail">${tr("失败")}</option>
    </select></div>
  </div>
  <div class="poolbar" id="logstats"></div>
  <div class="table-wrap" id="logtable"></div>
</section>`;
}

function tryBlock(): string {
  return `
<section class="card trybox" id="trybox">
  <div class="pagehead">
    <h2>${tr("试一句")}</h2>
    <div class="queries" id="queries">
      <button type="button" class="tiny ghost" data-query="${tr("只回一个字：好")}">${tr("连通")}</button>
      <button type="button" class="tiny ghost" data-query="${tr("用一句话介绍 Rust")}">Rust</button>
      <button type="button" class="tiny ghost" data-query="${tr("你现在用的是哪家模型？只回模型名")}">${tr("模型")}</button>
      <button type="button" class="tiny ghost" data-query="${tr("1+1等于几？只回数字")}">${tr("算术")}</button>
    </div>
  </div>
  <div class="thread" id="thread"><div class="empty">${tr("还没有对话。")}</div></div>
  <form id="ask" class="composer">
    <textarea id="prompt" name="prompt" maxlength="2000" placeholder="${tr("回车发送，Shift+回车换行")}" rows="2"></textarea>
    <div class="composer-row">
      <select id="askacc" aria-label="${tr("账号")}"></select>
      <select id="askmodel" aria-label="${tr("模型")}"></select>
      <button type="submit" id="askgo">${tr("发送")}</button>
      <button type="button" class="tiny ghost" id="askclear">${tr("清空")}</button>
    </div>
    <div class="err" id="askerr"></div>
  </form>
</section>`;
}

function connectView(): string {
  return `
<section class="card connectbox" id="connectbox">
  <div class="pagehead">
    <h2>${tr("接 Agent")}</h2>
    <p class="hint">${tr("网关按账号池自动选号；模型 auto 时用各账号首选模型。custom 需先填好 Base URL 与可用模型。")}</p>
    <div class="dock-tabs" id="docktabs">
      <button type="button" class="tiny ghost on" data-dock="freeall">freeall</button>
      <button type="button" class="tiny ghost" data-dock="openai">OpenAI</button>
      <button type="button" class="tiny ghost" data-dock="anthropic">Anthropic</button>
      <button type="button" class="tiny ghost" data-dock="claude">claude</button>
      <button type="button" class="tiny ghost" data-dock="codex">codex</button>
      <button type="button" class="tiny ghost" data-dock="opencode">opencode</button>
    </div>
  </div>
  <div id="dock"></div>
</section>`;
}
