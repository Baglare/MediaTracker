import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultD8EnvFile = path.join(applicationRoot, ".env.local");

export function resolveD8EnvFile(args = process.argv.slice(2), env = process.env) {
  const inline = args.find((arg) => arg.startsWith("--d8-env-file="));
  const flagIndex = args.indexOf("--d8-env-file");
  const override = inline?.slice("--d8-env-file=".length)
    || (flagIndex >= 0 ? args[flagIndex + 1] : undefined)
    || env.D8_ENV_FILE;
  return override ? path.resolve(override) : defaultD8EnvFile;
}

export function loadD8Environment({
  args = process.argv.slice(2),
  env = process.env,
  envFile = resolveD8EnvFile(args, env),
} = {}) {
  if (!existsSync(envFile)) {
    throw new Error("D8 environment file was not found at the resolved application root");
  }

  const parsed = parseEnv(readFileSync(envFile, "utf8"));
  for (const [name, value] of Object.entries(parsed)) {
    if (env[name] === undefined) env[name] = value;
  }
  return env;
}
