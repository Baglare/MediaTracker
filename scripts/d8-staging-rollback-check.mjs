import { loadD8Environment } from "./d8-staging-env.mjs";
import { runReadOnlySql } from "./d8-staging-target.mjs";

try {
  loadD8Environment();
} catch (error) {
  console.error(error instanceof Error ? error.message : "D8 environment could not be loaded");
  process.exit(1);
}

runReadOnlySql("supabase/d8_staging_rollback_check.sql").catch((error) => {
  console.error(error instanceof Error ? error.message : "staging rollback check failed");
  process.exitCode = 1;
});
