import { loadD8Environment } from "./d8-staging-env.mjs";
import { runReadOnlySql } from "./d8-staging-target.mjs";

try {
  loadD8Environment();
} catch (error) {
  console.error(error instanceof Error ? error.message : "D8 environment could not be loaded");
  process.exit(1);
}

const checks = Object.freeze({
  d2c1: "supabase/d2c1_owner_scoped_pk_preflight.sql",
  goal: "supabase/d5_goal_cloud_v1_preflight.sql",
  final: "supabase/d2c3_production_preflight.sql",
});

const name = process.argv[2];
if (!Object.hasOwn(checks, name)) {
  console.error(`Usage: node scripts/d8-staging-preflight.mjs <${Object.keys(checks).join("|")}>`);
  process.exitCode = 2;
} else {
  runReadOnlySql(checks[name]).catch((error) => {
    console.error(error instanceof Error ? error.message : "staging preflight failed");
    process.exitCode = 1;
  });
}
