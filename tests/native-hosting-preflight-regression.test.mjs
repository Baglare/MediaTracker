import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeRoles } from '../lib/backend/native-roles.mjs';
import { migrationHistory, validateHistory } from '../scripts/native-migration-runner.mjs';
import { hostingPreflight } from '../scripts/native-hosting-preflight.mjs';
import { inspectTarget, operatorConfig } from '../scripts/native-ops-target.mjs';
import { nativeMigrationManifest } from '../scripts/native-migrations.mjs';

const ledgerProbe="SELECT to_regclass('native_migrations.ledger') IS NOT NULL AS present";
const ledgerRead='SELECT name,checksum FROM native_migrations.ledger ORDER BY name';
function fixture({profile='hosting-test',capability='shared-managed',present=false,dirty=false,
  history=[],fail,resetFails=false,login,server='127.0.0.1',ssl=true}={}) {
  const roles=nativeRoles(profile,capability);
  login ??=roles.migrator;
  let role=login,closed=false;
  const calls=[];
  const client={end:async()=>{closed=true;role=null;},query:async sql=>{
    assert.equal(closed,false,'closed connection must not be reused');
    calls.push(sql);
    if(sql==='SELECT session_user AS login')return {rows:[{login}]};
    if(sql.startsWith('SET ROLE ')) {
      assert.equal(sql,`SET ROLE ${roles.ledger_owner}`);role=roles.ledger_owner;
    }
    if(sql===fail)throw new Error('synthetic_query_failure');
    if(sql==='RESET ROLE') {
      if(resetFails)throw new Error('synthetic_aborted_transaction');
      role=login;
    }
    if(sql===ledgerProbe || sql===ledgerRead) {
      // Reproduce schema-USAGE denial even when the relation does not exist.
      assert.equal(role,roles.ledger_owner,'ledger lookup/read needs owner role');
      return {rows:sql===ledgerProbe?[{present}]:history};
    }
    if(sql.includes(' AS dirty'))return {rows:[{dirty}]};
    if(sql.includes(' AS safe'))return {rows:[{safe:true}]};
    if(sql.includes('inet_server_addr()')) {
      assert.match(sql,/host\(inet_server_addr\(\)\)/);
      assert.doesNotMatch(sql,/inet_server_addr\(\)::text/);
      // Model PostgreSQL inet text /32 and /128 output, and SQL host() stripping it.
      const address=server.split('/')[0];
      return {rows:[{database:roles.database,role:login,version:180006,
        server:address,address,port:5433,oid:'123',ssl,operator:false,provisioner:false}]};
    }
    return {rows:[]};
  }};
  return {client,roles,calls,get role(){return role;},get closed(){return closed;}};
}

for(const profile of ['hosting-test','hosting-production']) {
  for(const present of [false,true])test(`${profile} ledger ${present?'present':'absent'} uses owner and resets`,async()=>{
    const roles=nativeRoles(profile,'shared-managed');
    const manifest=nativeMigrationManifest(profile);
    const history=present?manifest.slice(0,2).map(({name,checksum})=>({name,checksum})):[];
    const f=fixture({profile,present,history});
    assert.deepEqual(await migrationHistory(f.client,roles),history);
    assert.equal(validateHistory(history,manifest).length,present?9:11);
    assert.equal(f.role,roles.migrator);assert.equal(f.closed,false);
    assert.ok(f.calls.indexOf(`SET ROLE ${roles.ledger_owner}`)<f.calls.indexOf(ledgerProbe));
    assert.equal(f.calls.at(-1),'RESET ROLE');
    assert.equal(f.calls.some(sql=>/\b(GRANT|CREATE|ALTER|INSERT)\b/.test(sql)),false);
  });
}

for(const fail of ['SET ROLE mt_test_ledger_owner',ledgerProbe,ledgerRead]) {
  test(`ledger failure at ${fail.split(' ')[0]} resets session role`,async()=>{
    const f=fixture({present:true,fail});
    await assert.rejects(migrationHistory(f.client,f.roles),/synthetic_query_failure/);
    assert.equal(f.calls.at(-1),'RESET ROLE');assert.equal(f.role,f.roles.migrator);
  });
}
test('missing ledger with occupied managed schemas fails and resets role',async()=>{
  const f=fixture({dirty:true});
  await assert.rejects(migrationHistory(f.client,f.roles),/native_hosting_target_not_empty/);
  assert.equal(f.calls.at(-1),'RESET ROLE');assert.equal(f.role,f.roles.migrator);
});
test('RESET failure closes connection and fails closed on success or SQL error',async()=>{
  for(const fail of [undefined,ledgerProbe]) {
    const f=fixture({resetFails:true,fail});
    await assert.rejects(migrationHistory(f.client,f.roles),/native_migration_role_reset_failed/);
    assert.equal(f.closed,true);assert.equal(f.role,null);
  }
});
test('dedicated migrator uses owner; dedicated backup retains direct ledger grants',async()=>{
  const f=fixture({capability:'dedicated'});
  await migrationHistory(f.client,f.roles);assert.equal(f.role,f.roles.migrator);
  const calls=[],roles=nativeRoles('hosting-test');
  const client={query:async sql=>{
    calls.push(sql);
    if(sql==='SELECT session_user AS login')return {rows:[{login:roles.backup}]};
    if(sql===ledgerProbe)return {rows:[{present:true}]};
    assert.equal(sql,ledgerRead);return {rows:[]};
  }};
  assert.deepEqual(await migrationHistory(client,roles),[]);
  assert.deepEqual(calls,['SELECT session_user AS login',ledgerProbe,ledgerRead]);
});
test('local profile retains absent, occupied and existing ledger behavior without role SQL',async()=>{
  for(const roles of [undefined,nativeRoles()]) {
    for(const [present,dirty] of [[false,false],[false,true],[true,false]]) {
      const calls=[],history=[{name:'synthetic',checksum:'a'.repeat(64)}];
      const client={query:async sql=>{
        calls.push(sql);
        if(sql===ledgerProbe)return {rows:[{present}]};
        if(sql===ledgerRead)return {rows:history};
        assert.match(sql,/ AS dirty/);return {rows:[{dirty}]};
      }};
      if(dirty)await assert.rejects(migrationHistory(client,roles),/native_migration_ledger_missing/);
      else assert.deepEqual(await migrationHistory(client,roles),present?history:[]);
      assert.equal(calls.some(sql=>/\bROLE\b|session_user/.test(sql)),false);
    }
  }
});

for(const server of ['127.0.0.1/32','::1/128'])test(`preflight and operator fingerprint agree for ${server}`,async()=>{
  const config=operatorConfig({NATIVE_ROLE_PROFILE:'hosting-test',NATIVE_HOSTING_CAPABILITY:'shared-managed',
    NATIVE_OPS_ENVIRONMENT:'disposable',NATIVE_OPS_ROLE_KIND:'migrator',
    NATIVE_OPS_DATABASE_URL:'postgresql://mt_test_migrator:synthetic@127.0.0.1:5433/mt_p4_test',
    NATIVE_OPS_SSL_MODE:'verify-full',NATIVE_OPS_SSL_CA_FILE:'/private/root.crt'});
  const f=fixture({server});
  const preflight=await hostingPreflight(f.client,config);
  const target=await inspectTarget(f.client,config);
  assert.equal(preflight.target.server,server.split('/')[0]);
  assert.equal(preflight.target.fingerprint,target.fingerprint);
  assert.equal(preflight.contract,'PASS');assert.equal(preflight.empty,true);
  assert.equal(preflight.history,'EMPTY');assert.equal(preflight.pending.length,11);
  assert.equal(preflight.mutation,'NOT_PERFORMED');
  assert.equal(f.role,f.roles.migrator);
  assert.ok(f.calls.indexOf('RESET ROLE')<f.calls.indexOf('ROLLBACK'));
  assert.ok(f.calls.every(sql=>sql.startsWith('SELECT')||sql.startsWith('WITH')
    ||['BEGIN READ ONLY','ROLLBACK','SET ROLE mt_test_ledger_owner','RESET ROLE'].includes(sql)));
});
test('preflight still rejects non-loopback server addresses and non-TLS sessions',async()=>{
  const config={roles:nativeRoles('hosting-test','shared-managed'),kind:'migrator'};
  for(const options of [{server:'192.0.2.1/32'},{ssl:false}]) {
    const f=fixture(options);
    await assert.rejects(hostingPreflight(f.client,config),/native_target_identity_invalid/);
    assert.equal(f.calls.at(-1),'ROLLBACK');
  }
});
