import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_REF = /^[a-z0-9-]{6,64}$/;
export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`D8 staging safety gate missing: ${name}`);
  return value;
}

export function resolveSafeStagingTarget(env = process.env, { requireMigrationPermission = false } = {}) {
  if (env.D8_STAGING_CUTOVER_ENABLED !== "1") {
    throw new Error("D8 staging safety gate closed: D8_STAGING_CUTOVER_ENABLED must be 1");
  }
  if (requireMigrationPermission && env.D8_STAGING_MIGRATION_ALLOWED !== "1") {
    throw new Error("D8 staging migration permission is not explicit");
  }

  const stagingRef = required(env, "D8_STAGING_PROJECT_REF");
  const productionRef = required(env, "D8_PRODUCTION_PROJECT_REF");
  if (!PROJECT_REF.test(stagingRef) || !PROJECT_REF.test(productionRef)) {
    throw new Error("D8 project refs have an invalid format");
  }
  if (stagingRef === productionRef) {
    throw new Error("D8 staging target refused: staging and production refs match");
  }

  const databaseUrl = new URL(required(env, "D8_STAGING_DATABASE_URL"));
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("D8 staging database URL must use PostgreSQL");
  }
  const databaseIdentity = `${databaseUrl.hostname}:${decodeURIComponent(databaseUrl.username)}`.toLowerCase();
  const stagingBound = databaseUrl.hostname.toLowerCase().includes(stagingRef)
    || decodeURIComponent(databaseUrl.username).toLowerCase().split(".").includes(stagingRef);
  if (!stagingBound || databaseIdentity.includes(productionRef)) {
    throw new Error("D8 staging database host is not bound to the explicit staging ref");
  }

  return { databaseUrl };
}

export async function runReadOnlySql(relativeFile, env = process.env) {
  const { databaseUrl } = resolveSafeStagingTarget(env);
  const sqlFile = path.resolve(repositoryRoot, relativeFile);
  if (!sqlFile.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error("SQL path escaped repository root");

  const childEnv = {
    ...env,
    PGHOST: databaseUrl.hostname,
    PGPORT: databaseUrl.port || "5432",
    PGDATABASE: databaseUrl.pathname.slice(1),
    PGUSER: decodeURIComponent(databaseUrl.username),
    PGPASSWORD: decodeURIComponent(databaseUrl.password),
    PGSSLMODE: databaseUrl.searchParams.get("sslmode") || "require",
  };
  delete childEnv.D8_STAGING_DATABASE_URL;

  await new Promise((resolve, reject) => {
    const child = spawn("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--file", sqlFile], {
      cwd: repositoryRoot,
      env: childEnv,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", () => reject(new Error("psql is unavailable; no database operation was performed")));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`staging check failed with exit code ${code ?? "unknown"}`)));
  });
}
