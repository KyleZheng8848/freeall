import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import type { Account, ProviderId } from "../src/types.js";

export function tempStore(): { store: Store; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), "freeall-"));
  const store = new Store({
    root,
    store: join(root, "store.json"),
    masterKey: join(root, "master.key"),
    pid: join(root, "daemon.pid"),
  }).loadOrCreate();
  return {
    store,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function addPlain(store: Store, provider: ProviderId, name: string, key = "sk-test"): Account {
  return store.addAccount({ name, provider, apiKey: key });
}

export function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
