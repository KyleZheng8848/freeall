import { tr } from "./i18n.js";
import { readFreeAllMeta } from "./app-meta.js";
import type { Store } from "./store.js";
import {
  evaluateUpdate,
  parseUpdateManifest,
  pickReleaseAsset,
  shouldNotifyUpdate,
  shouldShowUpdateBanner,
  type UpdateCheckResult,
} from "./update-check.js";

const FETCH_MS = 8_000;

export async function checkForUpdate(
  store: Store,
  opts: { platform?: string; arch?: string } = {},
): Promise<UpdateCheckResult & { showBanner: boolean; notify: boolean }> {
  const meta = readFreeAllMeta();
  const current = meta.version;
  const manifestUrl =
    process.env.FREEALL_UPDATE_MANIFEST_URL?.trim() || meta.updateManifest || "";

  if (!manifestUrl) {
    return {
      status: "not-configured",
      current,
      releasesUrl: meta.downloadPage,
      message: tr("未配置更新清单地址。"),
      showBanner: false,
      notify: false,
    };
  }

  let raw: unknown;
  try {
    const res = await fetch(manifestUrl, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    return {
      status: "error",
      current,
      releasesUrl: meta.downloadPage,
      message: tr("检查更新失败：{0}", err instanceof Error ? err.message : String(err)),
      showBanner: false,
      notify: false,
    };
  }

  const parsed = parseUpdateManifest(raw);
  if (!parsed) {
    return {
      status: "error",
      current,
      releasesUrl: meta.downloadPage,
      message: tr("更新清单格式不对。"),
      showBanner: false,
      notify: false,
    };
  }

  const platform = opts.platform || process.platform;
  const arch = opts.arch || process.arch;
  const asset = pickReleaseAsset(parsed.assets, platform, arch);
  const releasesUrl = parsed.releasesUrl || meta.downloadPage;
  const result = evaluateUpdate({
    current,
    latest: parsed.version,
    releasesUrl,
    downloadUrl: asset?.url,
  });

  const settings = store.data.settings;
  return {
    ...result,
    showBanner: shouldShowUpdateBanner({
      status: result.status,
      latest: result.latest,
      dismissedVersion: settings.updateBannerDismissedVersion,
    }),
    notify: shouldNotifyUpdate({
      status: result.status,
      latest: result.latest,
      seenVersion: settings.updateNoticeSeenVersion,
    }),
  };
}

export function dismissUpdateBanner(store: Store, version: string): void {
  const v = String(version || "").trim().replace(/^v/i, "");
  if (!v) return;
  store.data.settings.updateBannerDismissedVersion = v;
  store.data.settings.updateNoticeSeenVersion = v;
  store.save();
}

export function markUpdateNotified(store: Store, version: string): void {
  const v = String(version || "").trim().replace(/^v/i, "");
  if (!v) return;
  store.data.settings.updateNoticeSeenVersion = v;
  store.save();
}
