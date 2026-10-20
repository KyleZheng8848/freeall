import { tr } from "./i18n.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, keyFromHex, keyToHex, randomKey } from "./crypto.js";
import { normalizeProviderFreeModels } from "./free-models.js";
import { defaultPolicy, normalizePolicy } from "./policy.js";
import type { Account, Cooldown, GenerationLog, Settings, StoreData, UsageEvent } from "./types.js";

export interface Paths {
  root: string;
  store: string;
  masterKey: string;
  pid: string;
}

export function defaultPaths(home = homedir()): Paths {
  const root = process.env.FREEALL_HOME || join(home, ".freeall");
  return {
    root,
    store: join(root, "store.json"),
    masterKey: join(root, "master.key"),
    pid: join(root, "daemon.pid"),
  };
}

function emptyStore(settings?: Partial<Settings>): StoreData {
  return {
    version: 1,
    accounts: [],
    usage: [],
    logs: [],
    cooldowns: [],
    settings: {
      port: 8787,
      host: "127.0.0.1",
      gatewayToken: newGatewayToken(),
      defaultModel: "auto",
      ...settings,
      policy: normalizePolicy(settings?.policy ?? defaultPolicy()),
      providerFreeModels: normalizeProviderFreeModels(settings?.providerFreeModels),
    },
  };
}

export class Store {
  readonly paths: Paths;
  private key!: Buffer;
  data!: StoreData;

  constructor(paths: Paths = defaultPaths()) {
    this.paths = paths;
  }

  loadOrCreate(): this {
    mkdirSync(this.paths.root, { recursive: true, mode: 0o700 });
    if (!existsSync(this.paths.masterKey)) {
      writeFileSync(this.paths.masterKey, keyToHex(randomKey()), { mode: 0o600 });
    }
    chmodSync(this.paths.masterKey, 0o600);
    this.key = keyFromHex(readFileSync(this.paths.masterKey, "utf8"));
    if (!existsSync(this.paths.store)) {
      this.data = emptyStore();
      this.save();
      return this;
    }
    this.data = JSON.parse(readFileSync(this.paths.store, "utf8")) as StoreData;
    if (this.data.version !== 1) throw new Error(tr("不支持的 store 版本 {0}", this.data.version));
    if (!Array.isArray(this.data.logs)) this.data.logs = [];
    this.data.settings.policy = normalizePolicy(this.data.settings.policy);
    this.data.settings.providerFreeModels = normalizeProviderFreeModels(this.data.settings.providerFreeModels);
    this.prune();
    return this;
  }

  save(): void {
    mkdirSync(dirname(this.paths.store), { recursive: true, mode: 0o700 });
    writeFileSync(this.paths.store, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    chmodSync(this.paths.store, 0o600);
  }

  secret(account: Account): string {
    return decrypt(account.key, this.key);
  }

  seal(plain: string) {
    return encrypt(plain, this.key);
  }

  get masterKey(): Buffer {
    return this.key;
  }

  machineWrapPass(): string {
    return `fa-local-1:${keyToHex(this.key)}`;
  }

  prune(now = Date.now()): void {
    const keepAfter = now - 48 * 60 * 60 * 1000;
    this.data.usage = this.data.usage.filter((e) => e.at >= keepAfter);
    this.data.logs = (this.data.logs ?? []).filter((e) => e.at >= keepAfter);
    const expired = this.data.cooldowns.filter((c) => c.until <= now);
    this.data.cooldowns = this.data.cooldowns.filter((c) => c.until > now);
    for (const cooldown of expired) {
      const account = this.data.accounts.find((a) => a.id === cooldown.accountId);
      if (account && account.status === "cooldown") account.status = "healthy";
    }
  }

  addAccount(input: {
    name: string;
    provider: Account["provider"];
    apiKey: string;
    baseUrl?: string;
    note?: string;
    free?: boolean;
  }): Account {
    const name = assertAccountName(input.name);
    if (this.data.accounts.some((a) => a.provider === input.provider && a.name === name)) {
      throw new Error(tr("已存在 {0}/{1}。换个 --name，或先 freeall rm", input.provider, name));
    }
    const account: Account = {
      id: `acc_${randomBytes(8).toString("hex")}`,
      name,
      provider: input.provider,
      key: this.seal(input.apiKey.trim()),
      baseUrl: input.baseUrl,
      enabled: true,
      status: "unknown",
      createdAt: Date.now(),
      note: clipNote(input.note),
      free: input.free !== false,
    };
    this.data.accounts.push(account);
    this.save();
    return account;
  }

  removeAccount(ref: string): Account {
    const idx = this.findIndex(ref);
    if (idx < 0) throw new Error(tr("找不到账号 '{0}'。用 freeall ls 查看", ref));
    const [removed] = this.data.accounts.splice(idx, 1);
    this.data.usage = this.data.usage.filter((e) => e.accountId !== removed.id);
    this.data.logs = (this.data.logs ?? []).filter((e) => e.accountId !== removed.id);
    this.data.cooldowns = this.data.cooldowns.filter((c) => c.accountId !== removed.id);
    this.save();
    return removed;
  }

  find(ref: string): Account | undefined {
    const idx = this.findIndex(ref);
    return idx < 0 ? undefined : this.data.accounts[idx];
  }

  findIndex(ref: string): number {
    return this.data.accounts.findIndex(
      (a) => a.id === ref || a.name === ref || `${a.provider}/${a.name}` === ref,
    );
  }

  recordUsage(event: UsageEvent): void {
    this.data.usage.push(event);
  }

  recordLog(log: GenerationLog): void {
    if (!this.data.logs) this.data.logs = [];
    this.data.logs.push(log);
  }

  setCooldown(cooldown: Cooldown): void {
    this.data.cooldowns = this.data.cooldowns.filter((c) => c.accountId !== cooldown.accountId);
    this.data.cooldowns.push(cooldown);
    const acc = this.data.accounts.find((a) => a.id === cooldown.accountId);
    if (acc) acc.status = "cooldown";
  }

  clearCooldown(accountId: string): void {
    this.data.cooldowns = this.data.cooldowns.filter((c) => c.accountId !== accountId);
  }

  replaceFromSnapshot(next: StoreData): void {
    this.data = next;
    this.prune();
    this.save();
  }
}

export function assertAccountName(raw: string): string {
  const name = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(name)) {
    throw new Error(tr("账号名只能用字母数字、点、下划线、连字符，最长 40"));
  }
  return name;
}

export function newGatewayToken(): string {
  return `freeall_${randomBytes(24).toString("hex")}`;
}

export function clipNote(note?: string): string | undefined {
  const text = note?.trim();
  if (!text) return undefined;
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

export function snapshotForSync(store: Store): {
  accounts: Array<Account & { apiKey: string }>;
  usage: UsageEvent[];
  logs: GenerationLog[];
  cooldowns: Cooldown[];
  settings: Settings;
} {
  return {
    accounts: store.data.accounts.map((a) => ({ ...a, apiKey: store.secret(a) })),
    usage: store.data.usage,
    logs: store.data.logs ?? [],
    cooldowns: store.data.cooldowns,
    settings: store.data.settings,
  };
}
