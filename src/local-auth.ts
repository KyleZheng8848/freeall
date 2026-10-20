import { tr } from "./i18n.js";
import { spawn } from "node:child_process";

const HOLD_MS = 5 * 60 * 1000;
let unlockedUntil = 0;

export function shouldSkipLocalAuth(): boolean {
  if (process.env.FREEALL_SKIP_LOCAL_AUTH === "1") return true;
  if (process.env.NODE_TEST_CONTEXT) return true;
  if (process.execArgv.includes("--test") || process.argv.includes("--test")) return true;
  return false;
}

export function resetLocalUnlock(): void {
  unlockedUntil = 0;
}

export async function assertLocalOwner(reason: string): Promise<void> {
  if (shouldSkipLocalAuth()) return;
  if (Date.now() < unlockedUntil) return;
  if (process.platform !== "darwin") return;
  await promptMacLogin(reason);
  unlockedUntil = Date.now() + HOLD_MS;
}

function promptMacLogin(reason: string): Promise<void> {
  return runOsascript(macOwnerAuthScript(), reason).catch((error) => {
    const msg = error instanceof Error ? error.message : describeUnlockError(error);
    if (msg === tr("已取消本机解锁") || msg === tr("本机解锁超时")) throw new Error(msg);
    return runOsascript(macAdminUnlockScript(), reason);
  });
}

function runOsascript(script: string, reason: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-l", "JavaScript", "-", reason], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(describeUnlockError({ killed: true, message: "timeout" })));
    }, 120_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(describeUnlockError(error)));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(describeUnlockError({ stderr, stdout, message: `exit ${code ?? 1}` })));
    });
    child.stdin.end(script);
  });
}

/** System owner unlock: Touch ID / Watch / login password. Not admin elevation. */
export function macOwnerAuthScript(): string {
  return `ObjC.import("LocalAuthentication");
ObjC.import("Foundation");

function run(argv) {
  var reason = argv && argv.length ? String(argv[0]) : "FreeAll";
  var ctx = $.LAContext.alloc.init;
  try { ctx.localizedCancelTitle = ${JSON.stringify(tr("取消"))}; } catch (e) {}
  var policy = $.LAPolicyDeviceOwnerAuthentication;
  if (!policy) policy = 2;
  var canErr = Ref();
  if (!ctx.canEvaluatePolicyError(policy, canErr)) {
    throw new Error(${JSON.stringify(tr("本机无法弹出解锁"))});
  }
  var state = { done: false, ok: false, err: "" };
  ctx.evaluatePolicyLocalizedReasonReply(policy, reason, function (success, error) {
    state.ok = !!success;
    if (!state.ok && error) {
      try { state.err = ObjC.unwrap(error.localizedDescription); } catch (e) { state.err = "failed"; }
    }
    state.done = true;
  });
  var loop = $.NSRunLoop.currentRunLoop;
  var limit = $.NSDate.dateWithTimeIntervalSinceNow(120);
  while (!state.done) {
    if ($.NSDate.date.compare(limit) === $.NSOrderedDescending) throw new Error("timeout");
    loop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
  }
  if (!state.ok) throw new Error(state.err || ${JSON.stringify(tr("已取消"))});
}
`;
}

function macAdminUnlockScript(): string {
  return `function run(argv) {
  var reason = argv && argv.length ? String(argv[0]) : "FreeAll";
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  try {
    app.doShellScript("true", { administratorPrivileges: true, prompt: reason });
  } catch (e) {
    var text = String(e);
    if (/-128|User canceled|cancelled/i.test(text)) throw new Error(${JSON.stringify(tr("已取消"))});
    throw e;
  }
}
`;
}

export function describeUnlockError(error: unknown): string {
  const err = error as { killed?: boolean; stderr?: string; stdout?: string; message?: string };
  const text = `${err.stderr ?? ""} ${err.stdout ?? ""} ${err.message ?? ""}`;
  if (err.killed || /ETIMEDOUT|timeout/i.test(text)) return tr("本机解锁超时");
  if (/已取消|User canceled|user cancel|LAErrorUserCancel|-128/i.test(text)) return tr("已取消本机解锁");
  if (/本机登录密码不对|Authentication failed|eDSAuthFailed|LAErrorAuthenticationFailed/i.test(text)) {
    return tr("本机密码不对");
  }
  if (/ENOENT/i.test(text)) return tr("本机无法弹出解锁");
  return tr("本机解锁失败");
}
