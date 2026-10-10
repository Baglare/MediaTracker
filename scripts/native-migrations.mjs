// Emits a checked, transactional psql plan. Never opens a database connection.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nativeRoles } from '../lib/backend/native-roles.mjs';
import { hostingSql, sqlWithoutTransaction } from './native-hosting-sql.mjs';
export const nativeMigrationFiles = [
  '001_security_foundation.sql', '002_better_auth.sql',
  '003_account_admission.sql', '004_cloud_goals.sql',
  '005_social_xp_themes.sql', '006_distributed_limiter.sql',
  '007_filesystem_assets.sql', '008_privacy_lifecycle.sql',
  '009_deployment_operations.sql',
];
export function nativeMigrationManifest(profile = 'local') {
  const roles = nativeRoles(profile);
  return nativeMigrationFiles.map(name => {
    const source = readFileSync(new URL(`../database/native/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    if (roles.hosted) {
      const baseline = JSON.parse(readFileSync(new URL('../lib/backend/native-migration-state.json', import.meta.url),'utf8'));
      if (baseline.find(entry => entry.name===name)?.checksum !== createHash('sha256').update(source).digest('hex'))
        throw new Error('native_hosting_source_drift');
    }
    const sql = hostingSql(name, source, roles);
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
}
const quote = value => `'${value.replaceAll("'", "''")}'`;
export function nativeMigrationSteps(manifest = nativeMigrationManifest()) {
  let output = `\\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS native_migrations;
REVOKE ALL ON SCHEMA native_migrations FROM PUBLIC;
CREATE TABLE IF NOT EXISTS native_migrations.ledger (
  name text PRIMARY KEY, checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON native_migrations.ledger FROM PUBLIC;
`;
  const steps = [{ name: 'LEDGER_SETUP', sql: output }];
  for (const entry of manifest) {
    if (!/^\d{3}_[a-z_]+\.sql$/.test(entry.name) || !/^[a-f0-9]{64}$/.test(entry.checksum)
      || createHash('sha256').update(entry.sql).digest('hex') !== entry.checksum) throw new Error('native_migration_invalid');
    const name = quote(entry.name), checksum = quote(entry.checksum);
    // SQL files are explicit top-level transactions; the ledger owns that boundary.
    const sql = sqlWithoutTransaction(entry.sql);
    output = `BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(207403,1);
DO $ledger$ BEGIN
  IF EXISTS(SELECT FROM native_migrations.ledger WHERE name=${name} AND checksum<>${checksum})
    THEN RAISE EXCEPTION 'native_migration_checksum_mismatch'; END IF;
END; $ledger$;
SELECT ${quote(sql)} WHERE NOT EXISTS(SELECT FROM native_migrations.ledger WHERE name=${name})
\\gexec
INSERT INTO native_migrations.ledger(name,checksum) VALUES(${name},${checksum}) ON CONFLICT(name) DO NOTHING;
COMMIT;
`;
    steps.push({ name: entry.name, sql: output });
  }
  return steps;
}
export function nativeMigrationPlan(manifest = nativeMigrationManifest()) {
  return nativeMigrationSteps(manifest).map(step => step.sql).join('');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('native_migration_no_target_arguments');
  process.stdout.write(nativeMigrationPlan());
}
