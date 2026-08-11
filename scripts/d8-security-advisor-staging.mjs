import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadD8Environment } from "./d8-staging-env.mjs";
import { repositoryRoot, resolveSafeStagingTarget } from "./d8-staging-target.mjs";

const mode = process.argv[2];
if (!new Set(["list", "up"]).has(mode)) {
  console.error("Usage: node scripts/d8-security-advisor-staging.mjs <list|up>");
  process.exit(1);
}

try {
  loadD8Environment();
} catch (error) {
  console.error(error instanceof Error ? error.message : "D8 environment could not be loaded");
  process.exit(1);
}

let databaseUrl;
try {
  ({ databaseUrl } = resolveSafeStagingTarget(process.env, {
    requireMigrationPermission: mode === "up",
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "D8 staging target was refused");
  process.exit(1);
}

const childEnv = { ...process.env };
delete childEnv.D8_STAGING_DATABASE_URL;

const npxArgs = [
  "--yes",
  "supabase@latest",
  "migration",
  mode === "up" ? "up" : "list",
  "--db-url",
  databaseUrl.href,
];
let command = "npx";
let args = npxArgs;
if (process.platform === "win32") {
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "npm", "bin", "npx-cli.js"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "nodejs", "node_modules", "npm", "bin", "npx-cli.js"),
  ].filter(Boolean);
  const npxCli = candidates.find((candidate) => existsSync(candidate));
  if (!npxCli) {
    console.error("npx-cli.js was not found; no database operation was performed.");
    process.exit(1);
  }
  command = process.execPath;
  args = [npxCli, ...npxArgs];
}

console.log(`D8 staging migration ${mode} started; target passed the masked ref-separation gate.`);
const child = spawn(command, args, {
  cwd: repositoryRoot,
  env: childEnv,
  stdio: "inherit",
  shell: false,
});

child.once("error", () => {
  console.error("Supabase CLI could not be started; no Production operation was attempted.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  if (code !== 0) {
    console.error(`D8 staging migration ${mode} failed with exit code ${code ?? "unknown"}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`D8 staging migration ${mode} completed; Production was not targeted.`);
});
