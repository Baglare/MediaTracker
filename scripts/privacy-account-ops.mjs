// Default offline. Disposable transport is lazy, ops-only and independently fenced.
import { pathToFileURL } from "node:url";
import { accountExport, erasePlan, runErasure, syntheticAdapter, verifyErasure, resolveIdentity } from "./privacy-account-model.mjs";
import { fixture } from "./privacy-synthetic-fixture.mjs";

export function parseOptions(argv) {
  const allowed = new Set(["mode", "source", "environment", "supabase-url", "fingerprint", "user-id", "email", "confirm", "execute", "accept-participant-loss", "cutoff", "batch-size"]);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (!argv[i].startsWith("--") || !allowed.has(key) || Object.hasOwn(options, key)) throw new Error("Unknown/duplicate option");
    if (["execute", "accept-participant-loss"].includes(key)) options[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("Missing option value");
      options[key] = argv[++i];
    }
  }
  return options;
}
export function requireSyntheticTarget(options) {
  // Existing d8-staging-target guards ONLY staging and must not be reused to
  // authorize privacy mutation. This narrower contract admits no DB connection.
  if (options.source !== "synthetic" || options.environment !== "synthetic"
    || options.fingerprint !== "mediatracker-privacy-fixture-v1"
    || options["supabase-url"] !== "http://127.0.0.1:54321") throw new Error("Target refused: only the bundled synthetic source is supported; no network connection");
}
export async function main(argv) {
  const options = parseOptions(argv);
  const disposable = options.source === "disposable";
  if (disposable) {
    if (options.environment !== "disposable" || options.fingerprint !== "mediatracker-privacy-disposable-v1"
      || options["supabase-url"] !== "http://127.0.0.1:54321") throw new Error("Target refused");
  } else requireSyntheticTarget(options);
  if (!["inspect", "export", "erase-plan", "erase", "verify"].includes(options.mode)) throw new Error("Explicit mode required");
  if (options.execute && options.mode !== "erase") throw new Error("Execution is only valid for erase");
  const adapter = disposable
    ? await (await import("./privacy-disposable-adapter.mjs")).connectDisposableAdapter(options["user-id"])
    : syntheticAdapter(fixture());
  const snapshot = await adapter.inspect();
  if (options.mode !== "verify" && snapshot.auth.length) resolveIdentity(snapshot, options["user-id"], options.email);
  if (options.mode === "export") {
    if (options.execute) throw new Error("Export execution flag invalid");
  }
  if (options.mode === "export") return accountExport(snapshot, options["user-id"], options.email, new Date().toISOString());
  if (options.mode === "verify") return verifyErasure(snapshot, options["user-id"]);
  if (options.mode === "erase") return runErasure(adapter, options["user-id"], {
    execute: options.execute === true, confirmation: options.confirm, acceptParticipantLoss: options["accept-participant-loss"] === true,
  });
  if (options.mode === "inspect") return { plan: erasePlan(snapshot, options["user-id"]), accountState: snapshot.lifecycle?.[options["user-id"]] ?? "ABSENT", operation: snapshot.stageState?.[options["user-id"]] ?? null };
  return erasePlan(snapshot, options["user-id"]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.completed === false || report.applicationControlledAbsent === false || report.blocked?.length) process.exitCode = 1;
  }).catch(() => { console.error("Privacy ops refused/failed. See exact target/source contract; no error details are logged."); process.exitCode = 1; });
}
