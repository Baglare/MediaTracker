import { loadEnvFile } from "node:process";
import { resolveSafeStagingTarget } from "./d8-staging-target.mjs";

try {
  loadEnvFile(".env.local");
} catch {
  // CI/ops may inject the same contract directly into process.env.
}

const env = process.env;
const present = (name) => Boolean(env[name]?.trim());
const host = (name) => {
  try { return new URL(env[name]).hostname.toLowerCase(); } catch { return ""; }
};
const stagingRef = env.D8_STAGING_PROJECT_REF?.trim() ?? "";
const productionRef = env.D8_PRODUCTION_PROJECT_REF?.trim() ?? "";

let databaseTargetSafe = false;
try {
  resolveSafeStagingTarget(env, { requireMigrationPermission: true });
  databaseTargetSafe = true;
} catch {
  databaseTargetSafe = false;
}

const summary = {
  cutoverEnabled: env.D8_STAGING_CUTOVER_ENABLED === "1",
  migrationAllowed: env.D8_STAGING_MIGRATION_ALLOWED === "1",
  refsPresentAndDistinct: Boolean(stagingRef && productionRef && stagingRef !== productionRef),
  appUrlMatchesStaging: Boolean(stagingRef && host("NEXT_PUBLIC_SUPABASE_URL").startsWith(`${stagingRef}.`)),
  testUrlMatchesStaging: Boolean(stagingRef && host("SUPABASE_TEST_URL").startsWith(`${stagingRef}.`)),
  databaseTargetSafe,
  appKeysPresent: present("NEXT_PUBLIC_SUPABASE_ANON_KEY") && present("SUPABASE_SERVICE_ROLE_KEY"),
  testKeysPresent: present("SUPABASE_TEST_ANON_KEY"),
  fixturesCompleteAndDistinct: [
    "SUPABASE_TEST_USER_A_EMAIL",
    "SUPABASE_TEST_USER_A_PASSWORD",
    "SUPABASE_TEST_USER_B_EMAIL",
    "SUPABASE_TEST_USER_B_PASSWORD",
  ].every(present) && env.SUPABASE_TEST_USER_A_EMAIL !== env.SUPABASE_TEST_USER_B_EMAIL,
};

const passed = Object.values(summary).every(Boolean);
console.log(JSON.stringify({ passed, checks: summary }));
if (!passed) process.exitCode = 1;
