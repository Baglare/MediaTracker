import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nativeMigrationManifest } from '../scripts/native-migrations.mjs';
import { nativeRoles } from '../lib/backend/native-roles.mjs';
import { acceptanceConfig, rollbackAcceptance, inspectRuntime } from '../scripts/native-hosting-acceptance.mjs';

const env = {NATIVE_ROLE_PROFILE:'hosting-test',NATIVE_HOSTING_CAPABILITY:'shared-managed',
  NATIVE_OPS_ENVIRONMENT:'disposable',NATIVE_OPS_ROLE_KIND:'migrator',
  NATIVE_OPS_SSL_MODE:'verify-full',NATIVE_OPS_SSL_CA_FILE:'/private/ca.pem',
  NATIVE_OPS_EXPECTED_FINGERPRINT:'a'.repeat(64),
  NATIVE_OPS_DATABASE_URL:'postgresql://mt_test_migrator:synthetic@127.0.0.1:5433/mt_p4_test',
  NATIVE_ACCEPTANCE_RUNTIME_URL:'postgresql://mt_test_runtime:synthetic@127.0.0.1:5433/mt_p4_test'};

test('009 maps appended role grants; 001-008 and all historical SQL remain pinned',()=>{
  const state = JSON.parse(readFileSync('lib/backend/native-hosting-migration-state.json','utf8'));
  assert.deepEqual(nativeMigrationManifest().map(({name,checksum})=>({name,checksum})),
    JSON.parse(readFileSync('lib/backend/native-migration-state.json','utf8')));
  for (const profile of ['hosting-test','hosting-production']) {
    const manifest = nativeMigrationManifest(profile),roles = nativeRoles(profile);
    assert.deepEqual(manifest.map(({name,checksum})=>({name,checksum})),state[profile]);
    const grants = manifest[8].sql.slice(manifest[8].sql.indexOf('COMMIT;')+7);
    for (const role of [roles.owner,roles.auth_owner,roles.limiter,roles.ledger_owner])
      assert.ok(grants.includes(`SET LOCAL ROLE ${role};`));
    assert.doesNotMatch(grants,/\bmt_(owner|auth_owner|limiter|ledger_owner)\b/);
  }
});
test('acceptance rejects production, wrong login, host, TLS and unpinned targets before connecting',()=>{
  assert.equal(acceptanceConfig(env).roles.database,'mt_p4_test');
  for (const patch of [{NATIVE_ROLE_PROFILE:'hosting-production'},{NATIVE_OPS_ENVIRONMENT:'production'},
    {NATIVE_OPS_SSL_MODE:'disable'},{NATIVE_OPS_EXPECTED_FINGERPRINT:''},
    {NATIVE_OPS_DATABASE_URL:env.NATIVE_OPS_DATABASE_URL.replace('127.0.0.1','example.invalid')},
    {NATIVE_ACCEPTANCE_RUNTIME_URL:env.NATIVE_ACCEPTANCE_RUNTIME_URL.replace('mt_p4_test','mediatracker_prod')},
    {NATIVE_ACCEPTANCE_RUNTIME_URL:env.NATIVE_OPS_DATABASE_URL}])
    assert.throws(()=>acceptanceConfig({...env,...patch}));
});
test('rollback requires explicit confirmation; closed graph blocks before fixture writes and rolls back',async()=>{
  const config = acceptanceConfig(env),calls=[];
  const client = {query:async sql=>{calls.push(sql);return {rows:[{safe:false}]};}};
  await assert.rejects(rollbackAcceptance(client,config,''),/confirmation_required/);
  assert.equal(calls.length,0);
  await assert.rejects(rollbackAcceptance(client,config,`ROLLBACK_TEST mt_p4_test ${config.expected}`),/blocked_runtime_set_role/);
  assert.equal(calls[0],'BEGIN'); assert.equal(calls.at(-1),'ROLLBACK');
  assert.equal(calls.some(sql=>/INSERT|GRANT|COMMIT/.test(sql)),false);
});
test('runtime connection mismatch and catalog errors always roll back without DML',async()=>{
  const config = acceptanceConfig(env);
  for (const failure of ['identity','catalog']) {
    const calls=[];
    const client = {query:async sql=>{
      calls.push(sql);
      if (sql.includes('pg_stat_ssl')) return {rows:[{database:failure==='identity'?'mediatracker_prod':'mt_p4_test',
        role:'mt_test_runtime',server:'127.0.0.1',port:5433,oid:'1',ssl:true}]};
      if (sql.includes('count(*)=5')) throw new Error('synthetic_catalog_failure');
      return {rows:[{safe:true}]};
    }};
    await assert.rejects(inspectRuntime(client,config,{server:'127.0.0.1',port:5433,oid:'1'}));
    assert.equal(calls.at(-1),'ROLLBACK');
    assert.ok(calls.every(sql=>sql.startsWith('SELECT')||['BEGIN READ ONLY','ROLLBACK'].includes(sql)));
  }
});
test('rollback still executes when synthetic seeding fails after the capability check',async()=>{
  const config = acceptanceConfig(env),calls=[];
  const client = {query:async sql=>{
    calls.push(sql);
    if (sql.startsWith('INSERT')) throw new Error('synthetic_seed_failure');
    return {rows:[{safe:true}]};
  }};
  await assert.rejects(rollbackAcceptance(client,config,`ROLLBACK_TEST mt_p4_test ${config.expected}`),/synthetic_seed_failure/);
  assert.ok(calls.some(sql=>sql.startsWith('INSERT')));
  assert.equal(calls.at(-1),'ROLLBACK');
  assert.equal(calls.includes('COMMIT'),false);
});
