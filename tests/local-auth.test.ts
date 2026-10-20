import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertLocalOwner,
  describeUnlockError,
  macOwnerAuthScript,
  shouldSkipLocalAuth,
} from "../src/local-auth.js";

test("test runner skips macOS login prompt", () => {
  assert.equal(shouldSkipLocalAuth(), true);
});

test("assertLocalOwner is a no-op under the test runner", async () => {
  await assertLocalOwner("should not pop a dialog");
});

test("owner unlock uses system LocalAuthentication, not admin elevation", () => {
  const script = macOwnerAuthScript();
  assert.match(script, /LocalAuthentication/);
  assert.match(script, /LAPolicyDeviceOwnerAuthentication/);
  assert.equal(script.includes("administrator"), false);
});

test("unlock errors stay in human words and never echo a password", () => {
  assert.equal(describeUnlockError({ stderr: "已取消" }), "已取消本机解锁");
  assert.equal(describeUnlockError({ stderr: "LAErrorUserCancel" }), "已取消本机解锁");
  assert.equal(describeUnlockError({ stderr: "eDSAuthFailed" }), "本机密码不对");
  assert.equal(describeUnlockError({ stderr: "LAErrorAuthenticationFailed" }), "本机密码不对");
  assert.equal(describeUnlockError({ killed: true }), "本机解锁超时");
  assert.equal(describeUnlockError({ message: "secret-login-pass" }).includes("secret-login-pass"), false);
});
