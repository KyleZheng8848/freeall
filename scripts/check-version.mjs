#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8")
const head = /^##\s+(\d+\.\d+\.\d+)\s+[—–-]\s+(\d{4}-\d{2}-\d{2})/m.exec(changelog)
if (!head) {
  console.error("[check:version] CHANGELOG.md 顶部没有「## x.y.z — YYYY-MM-DD」")
  process.exit(1)
}
if (head[1] !== version) {
  console.error(`[check:version] CHANGELOG ${head[1]} ≠ package.json ${version}`)
  process.exit(1)
}
console.log(`[check:version] ${version} · ${head[2]}`)
