import assert from "node:assert/strict";
import { test } from "node:test";
import { decrypt, encrypt, maskSecret, randomKey, unwrapWithPassphrase, wrapWithPassphrase } from "../src/crypto.js";

test("encrypt/decrypt roundtrip", () => {
  const key = randomKey();
  const blob = encrypt("gsk_secret", key);
  assert.equal(decrypt(blob, key), "gsk_secret");
  assert.notEqual(blob.ct, "gsk_secret");
});

test("wrong key fails closed", () => {
  const blob = encrypt("gsk_secret", randomKey());
  assert.throws(() => decrypt(blob, randomKey()));
});

test("passphrase wrap rejects short pass", () => {
  assert.throws(() => wrapWithPassphrase("{}", "1234567"), /至少 8/);
});

test("passphrase wrap/unwrap", () => {
  const env = wrapWithPassphrase('{"ok":true}', "long-pass-word");
  assert.equal(unwrapWithPassphrase(env, "long-pass-word"), '{"ok":true}');
  assert.throws(() => unwrapWithPassphrase(env, "wrong-pass-word"));
});

test("mask never prints full secret", () => {
  assert.equal(maskSecret("gsk_abcdefghijk"), "gsk_…hijk");
  assert.equal(maskSecret("short"), "****");
});
