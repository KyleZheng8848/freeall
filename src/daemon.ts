import { tr } from "./i18n.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Store } from "./store.js";

export function readPid(store: Store): number | undefined {
  if (!existsSync(store.paths.pid)) return undefined;
  const n = Number(readFileSync(store.paths.pid, "utf8").trim());
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function daemonRunning(store: Store): number | undefined {
  const pid = readPid(store);
  if (pid && isAlive(pid)) return pid;
  if (existsSync(store.paths.pid)) unlinkSync(store.paths.pid);
  return undefined;
}

export async function waitLive(host: string, port: number, token: string, ms = 4000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host}:${port}/livez`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(400),
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

export async function ensureDaemon(store: Store): Promise<{ pid: number; started: boolean }> {
  const existing = daemonRunning(store);
  if (existing) return { pid: existing, started: false };

  const self = fileURLToPath(new URL("./cli.js", import.meta.url));
  const src = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const useTs = existsSync(src) && !existsSync(self);
  const child = spawn(
    process.execPath,
    useTs ? [fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)), src, "serve", "--foreground"] : [self, "serve", "--foreground"],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, FREEALL_HOME: store.paths.root },
    },
  );
  child.unref();
  if (child.pid) writeFileSync(store.paths.pid, String(child.pid), { mode: 0o600 });
  const ok = await waitLive(store.data.settings.host, store.data.settings.port, store.data.settings.gatewayToken);
  if (!ok) {
    throw new Error(tr("网关没起来。看 freeall doctor，或前台跑 freeall serve"));
  }
  return { pid: child.pid ?? 0, started: true };
}

export function writeOwnPid(store: Store): void {
  writeFileSync(store.paths.pid, String(process.pid), { mode: 0o600 });
}

export function stopDaemon(store: Store): boolean {
  const pid = daemonRunning(store);
  if (!pid) return false;
  process.kill(pid, "SIGTERM");
  if (existsSync(store.paths.pid)) unlinkSync(store.paths.pid);
  return true;
}
