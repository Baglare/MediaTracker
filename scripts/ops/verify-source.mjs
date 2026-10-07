import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root, migrationManifest, requireSafe } from "./recovery.mjs";
import { environmentContract } from "./release-policy.mjs";
import { checkRetentionCompleteness } from "../privacy-retention-ops.mjs";

export function checkOperationalSources(repository=root) {
  checkRetentionCompleteness(repository);
  const read=(name)=>readFileSync(path.join(repository,name),"utf8");
  const migrations=JSON.parse(read("docs/V1_HARDENING_06_MIGRATIONS.json"));
  requireSafe(migrations.classification==="CURRENT_SOURCE_FACT" && migrations.productionPending==="LIVE_UNVERIFIED"
    && JSON.stringify(migrations.migrations)===JSON.stringify(migrationManifest(repository)));
  requireSafe(JSON.stringify(JSON.parse(read("docs/V1_HARDENING_06_ENV_CONTRACT.json")))===JSON.stringify(environmentContract()));
  for(const part of ["06A_BACKUP_AND_RESTORE","06B_INCIDENT_AND_RECOVERY","06C_MONITORING_AND_ALERTS","06D_RELEASE_OPERATIONS","06E_OPERATIONAL_RELEASE_GATE"])
    requireSafe(read(`docs/V1_HARDENING_${part}.md`).includes("CURRENT_SOURCE_FACT") || part.startsWith("06E"));
  for(const name of ["D8_STAGING_CUTOVER_AND_OPERATIONS","D8_PRODUCTION_CUTOVER_RUNBOOK","D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD","D8_POST_DEPLOY_SMOKE_CHECKLIST","D8_RELEASE_CANDIDATE_ACCEPTANCE","D8_RELEASE_ENV_MATRIX"]) {
    const text=read(`docs/${name}.md`);
    requireSafe(text.includes("HISTORICAL_EVIDENCE") && text.includes("FROZEN") && text.includes("V1_HARDENING_06D_RELEASE_OPERATIONS.md") && text.includes("V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md"));
  }
  const gates=read("docs/V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md");
  for(const name of ["Phase 5 real disposable DB/Auth/Storage proof","Disposable restore rehearsal","Preview acceptance","Staging acceptance","Production read-only preflight","Backup before cutover","Article 9","VERBIS","Final immutable RC","Production cutover"]) {
    const row=gates.split(/\r?\n/).find(line=>line.startsWith(`| ${name} |`));
    requireSafe(row && !row.includes("| CLOSED |"));
  }
  requireSafe(gates.includes("ACCOUNT_WRITE_BARRIER / ACCOUNT_ERASURE_WORKFLOW source complete"));
  const visit=(dir)=>readdirSync(path.join(repository,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
  // Existing CI TS AST policy also validates import/export/require/import edges.
  for(const file of ["app","lib","features","components","hooks"].flatMap(visit).filter(p=>/\.[cm]?[jt]sx?$/.test(p)))
    requireSafe(!read(file).match(/(?:scripts\/ops|scripts\\\\ops|MEDIATRACKER_DR_ENCRYPTION_KEY)/));
  requireSafe(read("next.config.ts").includes('"./scripts/ops/**"'));
  return {status:"PASS",migrations:migrations.migrations.length,execution:"SOURCE_ONLY"};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(checkOperationalSources())); }
  catch {console.error("Operational source contract failed; no external checks attempted.");process.exitCode=1;}
}
