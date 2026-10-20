import { tr } from "./i18n.js";
import { readFileSync, writeFileSync } from "node:fs";
import { unwrapWithPassphrase, wrapWithPassphrase, type SyncEnvelope } from "./crypto.js";
import { normalizeProviderFreeModels } from "./free-models.js";
import { normalizePolicy } from "./policy.js";
import { snapshotForSync, type Store } from "./store.js";
import type { Account, Cooldown, GenerationLog, Settings, StoreData, UsageEvent } from "./types.js";

export interface SyncPayload {
  version: 1;
  exportedAt: number;
  accounts: Array<Account & { apiKey: string }>;
  usage: UsageEvent[];
  logs?: GenerationLog[];
  cooldowns: Cooldown[];
  settings: Omit<Settings, "gatewayToken"> & { gatewayToken?: string };
}

export function exportSync(store: Store, passphrase: string, keepGatewayToken = false): string {
  const snap = snapshotForSync(store);
  const payload: SyncPayload = {
    version: 1,
    exportedAt: Date.now(),
    accounts: snap.accounts,
    usage: snap.usage,
    logs: snap.logs,
    cooldowns: snap.cooldowns,
    settings: keepGatewayToken ? snap.settings : { ...snap.settings, gatewayToken: undefined },
  };
  const envelope = wrapWithPassphrase(JSON.stringify(payload), passphrase);
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function writeExport(store: Store, file: string, passphrase: string, keepGatewayToken = false): void {
  writeFileSync(file, exportSync(store, passphrase, keepGatewayToken), { mode: 0o600 });
}

export function parseExport(raw: string, passphrase: string): SyncPayload {
  let envelope: SyncEnvelope;
  try {
    envelope = JSON.parse(raw) as SyncEnvelope;
  } catch {
    throw new Error(tr("不是 FreeAll 同步包（不是 JSON）"));
  }
  if (envelope.v !== 1 || !envelope.salt || !envelope.blob) {
    throw new Error(tr("不是 FreeAll 同步包（缺 v/salt/blob）"));
  }
  let payload: SyncPayload;
  try {
    payload = JSON.parse(unwrapWithPassphrase(envelope, passphrase)) as SyncPayload;
  } catch {
    throw new Error(tr("口令不对，或同步包已损坏"));
  }
  if (payload.version !== 1 || !Array.isArray(payload.accounts)) {
    throw new Error(tr("同步包内容损坏"));
  }
  return payload;
}

export function readExport(file: string, passphrase: string): SyncPayload {
  return parseExport(readFileSync(file, "utf8"), passphrase);
}

export function importReplace(store: Store, payload: SyncPayload): { added: number } {
  const next: StoreData = {
    version: 1,
    accounts: payload.accounts.map((a) => stripKey(store, a)),
    usage: payload.usage ?? [],
    logs: payload.logs ?? [],
    cooldowns: payload.cooldowns ?? [],
    settings: {
      ...store.data.settings,
      ...payload.settings,
      gatewayToken: payload.settings.gatewayToken ?? store.data.settings.gatewayToken,
      policy: normalizePolicy(payload.settings.policy ?? store.data.settings.policy),
      providerFreeModels: normalizeProviderFreeModels(
        payload.settings.providerFreeModels ?? store.data.settings.providerFreeModels,
      ),
    },
  };
  store.replaceFromSnapshot(next);
  return { added: next.accounts.length };
}

export function importMerge(store: Store, payload: SyncPayload): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  const idMap = new Map<string, string>();
  for (const incoming of payload.accounts) {
    const existing = store.data.accounts.find(
      (a) => a.provider === incoming.provider && a.name === incoming.name,
    );
    const sealed = stripKey(store, incoming);
    if (existing) {
      idMap.set(incoming.id, existing.id);
      Object.assign(existing, sealed, { id: existing.id });
      updated += 1;
    } else {
      idMap.set(incoming.id, sealed.id);
      store.data.accounts.push(sealed);
      added += 1;
    }
  }
  const remapped = (payload.usage ?? []).map((event) => ({
    ...event,
    accountId: idMap.get(event.accountId) ?? event.accountId,
  }));
  store.data.usage = [...store.data.usage, ...remapped];
  const seen = new Set<string>();
  store.data.usage = store.data.usage.filter((e) => {
    const key = `${e.accountId}:${e.kind}:${e.at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const remappedLogs = (payload.logs ?? []).map((log) => ({
    ...log,
    accountId: idMap.get(log.accountId) ?? log.accountId,
  }));
  store.data.logs = [...(store.data.logs ?? []), ...remappedLogs];
  const seenLog = new Set<string>();
  store.data.logs = store.data.logs.filter((log) => {
    const key = log.id || `${log.accountId}:${log.at}:${log.model}`;
    if (seenLog.has(key)) return false;
    seenLog.add(key);
    return true;
  });
  for (const cd of payload.cooldowns ?? []) {
    const accountId = idMap.get(cd.accountId) ?? cd.accountId;
    const current = store.data.cooldowns.find((c) => c.accountId === accountId);
    if (!current || cd.until > current.until) store.setCooldown({ ...cd, accountId });
  }
  store.prune();
  store.save();
  return { added, updated };
}

function stripKey(store: Store, account: Account & { apiKey: string }): Account {
  const { apiKey, ...rest } = account;
  return { ...rest, key: store.seal(apiKey) };
}
