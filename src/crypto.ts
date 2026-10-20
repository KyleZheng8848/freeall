import { tr } from "./i18n.js";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { EncBlob } from "./types.js";

const ALGO = "aes-256-gcm";

export function randomKey(): Buffer {
  return randomBytes(32);
}

export function keyToHex(key: Buffer): string {
  return key.toString("hex");
}

export function keyFromHex(hex: string): Buffer {
  const buf = Buffer.from(hex.trim(), "hex");
  if (buf.length !== 32) {
    throw new Error(tr("master key 必须是 32 字节 hex"));
  }
  return buf;
}

export function encrypt(plain: string, key: Buffer): EncBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
}

export function decrypt(blob: EncBlob, key: Buffer): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(blob.ct, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function derivePassphraseKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

export interface SyncEnvelope {
  v: 1;
  salt: string;
  blob: EncBlob;
}

export function wrapWithPassphrase(plain: string, passphrase: string): SyncEnvelope {
  if (passphrase.length < 8) {
    throw new Error(tr("同步口令至少 8 个字符"));
  }
  const salt = randomBytes(16);
  const key = derivePassphraseKey(passphrase, salt);
  return { v: 1, salt: salt.toString("base64"), blob: encrypt(plain, key) };
}

export function unwrapWithPassphrase(envelope: SyncEnvelope, passphrase: string): string {
  const salt = Buffer.from(envelope.salt, "base64");
  const key = derivePassphraseKey(passphrase, salt);
  return decrypt(envelope.blob, key);
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "****";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
