import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FreeAllMeta {
  version: string;
  updateManifest?: string;
  downloadPage?: string;
  downloadBaseUrl?: string;
}

const require = createRequire(import.meta.url);

function candidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(process.cwd(), "package.json"),
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
    process.env.FREEALL_PACKAGE_JSON || "",
  ].filter(Boolean);
}

export function readFreeAllMeta(): FreeAllMeta {
  for (const path of candidates()) {
    try {
      if (!existsSync(path)) continue;
      const pkg = JSON.parse(readFileSync(path, "utf8")) as {
        version?: string;
        freeall?: Record<string, unknown>;
      };
      const fa = pkg.freeall || {};
      return {
        version: String(pkg.version || "0.0.0"),
        updateManifest:
          typeof fa.updateManifest === "string" ? fa.updateManifest : undefined,
        downloadPage: typeof fa.downloadPage === "string" ? fa.downloadPage : undefined,
        downloadBaseUrl: typeof fa.downloadBaseUrl === "string" ? fa.downloadBaseUrl : undefined,
      };
    } catch {
      /* try next */
    }
  }
  try {
    const pkg = require("../package.json") as { version?: string; freeall?: Record<string, unknown> };
    const fa = pkg.freeall || {};
    return {
      version: String(pkg.version || "0.0.0"),
      updateManifest: typeof fa.updateManifest === "string" ? fa.updateManifest : undefined,
      downloadPage: typeof fa.downloadPage === "string" ? fa.downloadPage : undefined,
      downloadBaseUrl: typeof fa.downloadBaseUrl === "string" ? fa.downloadBaseUrl : undefined,
    };
  } catch {
    return { version: "0.0.0" };
  }
}
