import { readFreeAllMeta } from "../app-meta.js";
import { COPYRIGHT, PROJECT_REPOSITORY, STUDIO_MARK, STUDIO_NAME } from "../identity.js";
import { tr } from "../i18n.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function aboutView(): string {
  return `<section class="card about-page" aria-labelledby="about-title">
  <p class="about-eyebrow">${tr("关于 FreeAll")}</p>
  <h1 id="about-title">FreeAll</h1>
  <p class="hint">${tr("本机额度池与 AI 网关")}</p>
  <p class="about-version">v${escapeHtml(readFreeAllMeta().version)} · MIT</p>
  <div class="studio-publisher">
    <div class="studio-symbol">${STUDIO_MARK}</div>
    <div><h2>${STUDIO_NAME}</h2><p>${tr("SofunAI 工作室出品并维护")}</p></div>
  </div>
  <p class="about-summary">${tr("管理你自己的官方 API Key，在本机统一路由。账号、备注和密钥保存在你的设备上。")}</p>
  <a class="about-repository" href="${PROJECT_REPOSITORY}" target="_blank" rel="noopener noreferrer">${tr("GitHub 开源主页")} <span aria-hidden="true">↗</span></a>
  <p class="hint about-copyright">${COPYRIGHT}</p>
</section>`;
}
