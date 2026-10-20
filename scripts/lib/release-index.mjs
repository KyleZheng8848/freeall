/** FreeAll 发布产物命名：FreeAll-${version}-${os}-${arch}.${ext} */

export const ARTIFACT_RE =
  /^FreeAll-(\d+\.\d+\.\d+)-(?:mac|win|linux)-.+\.(?:dmg|zip|exe|AppImage)(?:\.blockmap)?$/i

export function compareVersions(a, b) {
  const split = (v) => {
    const [core, ...pre] = v.split("-")
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre.join("-") }
  }
  const x = split(a)
  const y = split(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre > y.pre ? 1 : -1
}

export function stableName(name) {
  return name.replace(/^FreeAll-\d+\.\d+\.\d+-/, "FreeAll-latest-")
}

export function groupRemoteArtifacts(items, keyPrefix) {
  const byVersion = new Map()
  for (const { key, size, lastModified } of items) {
    const name = key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : key
    if (name.includes("/")) continue
    const hit = ARTIFACT_RE.exec(name)
    if (!hit) continue
    if (!byVersion.has(hit[1])) byVersion.set(hit[1], [])
    byVersion.get(hit[1]).push({ name, size, lastModified })
  }
  return { byVersion, versions: [...byVersion.keys()].sort(compareVersions).reverse() }
}

export function artifactLabel(name) {
  if (/\.dmg$/i.test(name)) {
    if (/arm64/i.test(name)) return "mac arm64"
    if (/x64|intel/i.test(name)) return "mac Intel"
    return "mac"
  }
  if (/\.exe$/i.test(name)) return "Windows"
  if (/\.AppImage$/i.test(name)) {
    if (/arm64|aarch64/i.test(name)) return "Linux arm64"
    if (/x86_64|x64|amd64/i.test(name)) return "Linux x64"
    return "Linux"
  }
  return name
}

export function historyEntries({ byVersion, versions }, { exclude, limit, baseUrl }) {
  return versions
    .filter((v) => (exclude ? v !== exclude : true))
    .slice(0, limit)
    .map((v) => ({
      version: v,
      files: byVersion
        .get(v)
        .filter((f) => /\.(dmg|exe|AppImage)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({
          label: artifactLabel(f.name),
          url: `${baseUrl}${f.name}`,
          size: f.size,
        })),
    }))
    .filter((h) => h.files.length)
}
