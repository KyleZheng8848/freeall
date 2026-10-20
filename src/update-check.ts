import { tr } from "./i18n.js";
/**
 * 更新检查纯逻辑（不发请求、不碰 Electron，可单测）。
 * 对齐 CPET：只发现新版并引导下载，不做静默替换。
 */

export type UpdateStatus =
  | "update-available"
  | "up-to-date"
  | "not-configured"
  | "error";

export interface ReleaseAsset {
  name: string;
  url: string;
  size?: number;
}

export interface UpdateManifest {
  version: string;
  releasesUrl?: string;
  assets: ReleaseAsset[];
}

export interface UpdateCheckResult {
  status: UpdateStatus;
  current: string;
  latest?: string;
  releasesUrl?: string;
  downloadUrl?: string;
  message: string;
}

export function normalizeVersion(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^v/i, "");
}

/** 按数字逐段比较，避免 "0.2.9" > "0.2.10"。 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const split = (v: string) => {
    const [core, ...pre] = normalizeVersion(v).split("-");
    return {
      nums: core.split(".").map((n) => {
        const parsed = Number.parseInt(n, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      }),
      pre: pre.join("-"),
    };
  };
  const x = split(a);
  const y = split(b);
  const len = Math.max(x.nums.length, y.nums.length);
  for (let i = 0; i < len; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d > 0) return 1;
    if (d < 0) return -1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre > y.pre ? 1 : -1;
}

export function parseUpdateManifest(raw: unknown): UpdateManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const version = normalizeVersion(String(o.version ?? o.tag_name ?? o.latest ?? ""));
  if (!/^\d/.test(version)) return null;

  const rawAssets = Array.isArray(o.assets) ? o.assets : [];
  const assets: ReleaseAsset[] = [];
  for (const a of rawAssets) {
    if (!a || typeof a !== "object") continue;
    const item = a as Record<string, unknown>;
    const name = String(item.name ?? "");
    const url = String(item.url ?? item.browser_download_url ?? "");
    if (!name || !url) continue;
    const size = typeof item.size === "number" ? item.size : undefined;
    assets.push({ name, url, size });
  }

  const releasesUrl =
    typeof o.releasesUrl === "string" && o.releasesUrl
      ? o.releasesUrl
      : typeof o.html_url === "string" && o.html_url
        ? o.html_url
        : undefined;

  return { version, releasesUrl, assets };
}

export function pickReleaseAsset(
  assets: readonly ReleaseAsset[],
  platform: string,
  arch: string,
): ReleaseAsset | undefined {
  const named = assets.filter((a) => a.name && a.url);
  const match = (...res: RegExp[]) => named.find((a) => res.every((re) => re.test(a.name)));

  if (platform === "darwin") {
    const wantArm = arch === "arm64";
    return (
      match(/\.dmg$/i, wantArm ? /arm64/i : /x64|intel/i) ??
      match(/\.zip$/i, wantArm ? /arm64/i : /x64|intel/i) ??
      match(/\.dmg$/i)
    );
  }
  if (platform === "win32") {
    return match(/\.exe$/i) ?? match(/\.msi$/i);
  }
  if (platform === "linux") {
    const wantArm = arch === "arm64";
    return (
      match(/\.AppImage$/i, wantArm ? /arm64|aarch64/i : /x86_64|x64|amd64/i) ??
      match(/\.AppImage$/i)
    );
  }
  return undefined;
}

export function evaluateUpdate(input: {
  current: string;
  latest: string;
  releasesUrl?: string;
  downloadUrl?: string;
}): UpdateCheckResult {
  const current = normalizeVersion(input.current);
  const latest = normalizeVersion(input.latest);
  const base = {
    current,
    latest,
    releasesUrl: input.releasesUrl,
    downloadUrl: input.downloadUrl,
  };
  if (!latest) {
    return { ...base, status: "error", message: tr("没读到线上版本号，稍后再试。") };
  }
  if (compareVersions(latest, current) > 0) {
    return {
      ...base,
      status: "update-available",
      message: tr("有新版本 {0}（当前 {1}）。", latest, current),
    };
  }
  return {
    ...base,
    status: "up-to-date",
    downloadUrl: undefined,
    message: tr("已是最新版本 {0}。", current),
  };
}

export function shouldNotifyUpdate(input: {
  status: UpdateStatus;
  latest?: string;
  seenVersion?: string;
}): boolean {
  if (input.status !== "update-available") return false;
  const latest = normalizeVersion(input.latest ?? "");
  if (!latest) return false;
  const seen = normalizeVersion(input.seenVersion ?? "");
  return latest !== seen;
}

export function shouldShowUpdateBanner(input: {
  status: UpdateStatus;
  latest?: string;
  dismissedVersion?: string;
}): boolean {
  if (input.status !== "update-available") return false;
  const latest = normalizeVersion(input.latest ?? "");
  if (!latest) return false;
  const dismissed = normalizeVersion(input.dismissedVersion ?? "");
  return latest !== dismissed;
}
