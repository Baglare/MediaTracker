import { runReadOnlySql } from "./d8-staging-target.mjs";

const checks = Object.freeze({
  d2c1: "supabase/d2c1_owner_scoped_pk_post_migration.sql",
  goal: "supabase/d5_goal_cloud_v1_post_migration.sql",
});

const name = process.argv[2];
if (!Object.hasOwn(checks, name)) {
  console.error(`Usage: node scripts/d8-staging-postcheck.mjs <${Object.keys(checks).join("|")}>`);
  process.exitCode = 2;
} else {
  runReadOnlySql(checks[name]).catch((error) => {
    console.error(error instanceof Error ? error.message : "staging post-check failed");
    process.exitCode = 1;
  });
}
