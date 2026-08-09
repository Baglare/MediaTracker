import { runReadOnlySql } from "./d8-staging-target.mjs";

runReadOnlySql("supabase/d8_staging_rollback_check.sql").catch((error) => {
  console.error(error instanceof Error ? error.message : "staging rollback check failed");
  process.exitCode = 1;
});
