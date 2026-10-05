import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { root, assertTarget, requireSafe, migrationManifest, verifyPackage, createPackage, rehearse, restoreOrder, exclusions } from "./recovery.mjs";
import { validateReleaseEnvironment } from "./release-policy.mjs";

export function parse(argv) {
  const allowed = new Set(["mode","environment","fingerprint","production-fingerprint","staging-fingerprint","output","package","manifest-hash","env-file","execute","ack-quiescent","ack-trusted-backup","ack-quarantine"]);
  const options = {};
  for (let i=0;i<argv.length;i++) {
    const key = argv[i].slice(2);
    requireSafe(argv[i].startsWith("--") && allowed.has(key) && !Object.hasOwn(options,key));
    if (["execute","ack-quiescent","ack-trusted-backup","ack-quarantine"].includes(key)) options[key]=true;
    else { requireSafe(argv[i+1] && !argv[i+1].startsWith("--")); options[key]=argv[++i]; }
  }
  requireSafe(["backup","restore","verify","migrations","env"].includes(options.mode)); return options;
}
export async function main(argv) {
  const o = parse(argv);
  if (o.mode === "migrations") { requireSafe(!o.execute); return {classification:"CURRENT_SOURCE_FACT",productionPending:"LIVE_UNVERIFIED",migrations:migrationManifest(root)}; }
  if (o.mode === "env") { requireSafe(!o.execute); return validateReleaseEnvironment(JSON.parse(readFileSync(o["env-file"],"utf8")),o.environment); }
  if (o.mode === "verify") { requireSafe(!o.execute); const m=verifyPackage(o.package,o["manifest-hash"]); return {integrity:"PASS",artifacts:m.artifacts.length,disasterRecovery:"LIVE_UNVERIFIED"}; }
  const options={environment:o.environment,fingerprint:o.fingerprint,productionFingerprint:o["production-fingerprint"],
    stagingFingerprint:o["staging-fingerprint"],execute:o.execute,acknowledgeTrustedBackup:o["ack-trusted-backup"],acknowledgeQuarantine:o["ack-quarantine"]};
  assertTarget(options);
  if (o.mode === "backup" && !o.execute) return {status:"PLAN_ONLY",schemas:["public","private_rate_limit","private_privacy_ops","supabase_migrations"],exclusions,order:restoreOrder};
  const key=process.env.MEDIATRACKER_DR_ENCRYPTION_KEY;
  if (o.mode === "restore" && !o.execute) return rehearse({directory:o.package,manifestHash:o["manifest-hash"],options});
  requireSafe(process.env.CI !== "true" && process.env.GITHUB_ACTIONS !== "true");
  const {createDisposableDrAdapter}=await import("./disposable-dr.mjs");
  const adapter=createDisposableDrAdapter();
  if (o.mode === "restore") return rehearse({directory:o.package,manifestHash:o["manifest-hash"],options,key,adapter});
  requireSafe(o["ack-quiescent"] === true);
  await adapter.prove(o.fingerprint);
  const before=await adapter.inspect(),versions=await adapter.versions(),database=await adapter.dump(),after=await adapter.inspect();
  requireSafe(JSON.stringify(before) === JSON.stringify(after));
  return createPackage({output:o.output,key,fingerprint:o.fingerprint,database,verification:before,roles:before.roles,versions});
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(report => {console.log(JSON.stringify(report,null,2)); if(report.valid===false) process.exitCode=1;})
    .catch(() => {console.error("Operational command refused/failed; sensitive subprocess details suppressed.");process.exitCode=1;});
}
