#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const version = pkg.version
const fa = pkg.freeall ?? {}
const releaseDir = join(root, fa.releaseDir || "release")

if (!existsSync(releaseDir)) {
  console.error("[gen-update-manifest] 没有 release/ 目录，先打包再生成清单。")
  process.exit(1)
}

const INSTALLER_RE = /\.(dmg|exe|AppImage)$/i
const ZIP_RE = /\.zip$/i

function collectAssets() {
  const out = []
  for (const name of readdirSync(releaseDir)) {
    if (!name.includes(version)) continue
    if (name.endsWith(".blockmap")) continue
    if (!INSTALLER_RE.test(name) && !ZIP_RE.test(name)) continue
    let st
    try {
      st = statSync(join(releaseDir, name))
    } catch {
      continue
    }
    if (!st.isFile() || st.size === 0) continue
    out.push({ name, size: st.size })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const found = collectAssets()
if (!found.length) {
  console.error(`[gen-update-manifest] release/ 里没有 ${version} 的安装包。先跑 npm run dist。`)
  process.exit(1)
}

const base = (process.env.FREEALL_DOWNLOAD_BASE_URL || fa.downloadBaseUrl || "").trim()
if (!base) {
  console.error("[gen-update-manifest] 缺少 downloadBaseUrl。")
  process.exit(1)
}
const prefix = base.endsWith("/") ? base : `${base}/`
const page = (process.env.FREEALL_DOWNLOAD_PAGE || fa.downloadPage || "").trim()

const manifest = {
  version,
  ...(page ? { releasesUrl: page } : {}),
  publishedAt: new Date().toISOString(),
  assets: found.map((f) => ({
    name: f.name,
    url: prefix + encodeURIComponent(f.name),
    size: f.size,
  })),
}

const outPath = join(releaseDir, "latest.json")
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`[gen-update-manifest] 已写出 ${outPath}（版本 ${version}）`)
for (const a of manifest.assets) {
  console.log(`  - ${a.name}  ${(a.size / 1024 / 1024).toFixed(1)} MB`)
}
