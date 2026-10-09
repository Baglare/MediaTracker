import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nativeMigrationManifest, nativeMigrationPlan, nativeMigrationSteps } from '../scripts/native-migrations.mjs';
test('native ledger is explicit, checksum checked, transactional and has no connection target', () => {
  const manifest = nativeMigrationManifest();
  assert.equal(manifest.length,9);
  assert.equal(new Set(manifest.map(e=>e.name)).size,9);
  const plan = nativeMigrationPlan(manifest);
  assert.match(plan,/native_migration_checksum_mismatch/);
  assert.match(plan,/pg_advisory_xact_lock/);
  assert.match(plan,/\\gexec/);
  assert.equal((plan.match(/^BEGIN;$/gm)??[]).length,9);
  assert.equal((plan.match(/^COMMIT;$/gm)??[]).length,9);
  assert.throws(()=>nativeMigrationPlan([{...manifest[0],sql:manifest[0].sql+'\n'}]),/native_migration_invalid/);
  assert.throws(()=>nativeMigrationPlan([{...manifest[0],name:"001_bad';DROP.sql"}]),/native_migration_invalid/);
  assert.doesNotMatch(readFileSync('scripts/native-migrations.mjs','utf8'),/\b(?:Pool|DATABASE_URL|SUPABASE_URL|fetch\()\b/);
});

test('granular migration steps retain checksums, order, ledger and transaction boundaries', () => {
  const manifest=nativeMigrationManifest(),steps=nativeMigrationSteps(manifest);
  assert.deepEqual(steps.map(step=>step.name),['LEDGER_SETUP',...manifest.map(entry=>entry.name)]);
  assert.equal(steps.map(step=>step.sql).join(''),nativeMigrationPlan(manifest));
  for(const [i,step] of steps.slice(1).entries()) {
    assert.match(step.sql,/^BEGIN;/);
    assert.equal((step.sql.match(/^BEGIN;$/gm)??[]).length,1);
    assert.equal((step.sql.match(/^COMMIT;$/gm)??[]).length,1);
    assert.ok(step.sql.includes(manifest[i].checksum));
    assert.ok(step.sql.indexOf('\\gexec')<step.sql.indexOf('INSERT INTO native_migrations.ledger'));
    assert.ok(step.sql.endsWith('COMMIT;\n'));
  }
});

test('P2 functional assertions reject null or absent result fields', () => {
  const proof=readFileSync('database/native/cloud-goals-proof.sql','utf8');
  for(const expected of ['created','revision_mismatch','applied','idempotent_replay']) {
    assert.ok(proof.includes(`IS DISTINCT FROM '${expected}'`));
  }
  assert.equal((proof.match(/::integer IS DISTINCT FROM 1/g)??[]).length,2);
  assert.match(proof,/replay IS DISTINCT FROM r/);
});
test('native account admission denies runtime identity recreation and operator impersonation', () => {
  const sql=readFileSync('database/native/003_account_admission.sql','utf8');
  assert.match(sql,/REVOKE INSERT, UPDATE, DELETE ON native_auth\."user" FROM mt_auth_access/);
  assert.match(sql,/GRANT UPDATE\(name,image,"updatedAt"\)/);
  assert.match(sql,/session_user='mt_runtime' OR NOT pg_has_role\(session_user,'mt_privacy_operator','MEMBER'\)/);
  assert.match(sql,/FOR SHARE/);
  assert.match(sql,/state<>'ACTIVE'/);
  assert.match(sql,/DELETE FROM native_auth\.session/);
  assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION app\.transition_account[^;]*TO mt_runtime/);
  assert.match(sql,/guard_session_write BEFORE INSERT OR UPDATE/);
  assert.match(sql,/guard_credential_write BEFORE INSERT OR UPDATE/);
});
test('native atomic business function bodies retain current Supabase SQL semantics', () => {
  const native=readFileSync('database/native/004_cloud_goals.sql','utf8').replace(/\r\n/g,'\n');
  for(const [file,names] of [
    ['20260728120000_owner_scoped_primary_key_enforcement.sql',['apply_media_item_sync_operation','apply_progress_log_sync_operation']],
    ['20260803120000_goal_cloud_v1_additive.sql',['cloud_goal_v1_definition_is_valid','cloud_goal_v1_request_hash','apply_cloud_goal_v1']],
  ]) {
    const source=readFileSync(`supabase/migrations/${file}`,'utf8').replace(/\r\n/g,'\n');
    for(const name of names) {
      const fn=source.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$;`,'i'))[0];
      const translated=fn.replace(/auth\.uid\(\)/g,'app.current_user_id()').replace(/auth\.users/g,'native_auth."user"')
        .replace(/public\./g,'app.').replace(/pg_catalog,public,pg_temp/g,'pg_catalog,app,pg_temp');
      assert.ok(native.includes(translated),`${name}: SQL semantic drift`);
    }
  }
});
