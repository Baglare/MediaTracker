import { safeOpsError } from "./safe-ops-error.mjs";
import { loadD8Environment } from "./d8-staging-env.mjs";
import { runReadOnlySql } from "./d8-staging-target.mjs";

try {
  loadD8Environment();
} catch (error) {
  console.error(safeOpsError(error, "D8 environment could not be loaded"));
  process.exit(1);
}

runReadOnlySql("supabase/d8_staging_rollback_check.sql").catch((error) => {
  console.error(safeOpsError(error, "staging rollback check failed"));
  process.exitCode = 1;
});
