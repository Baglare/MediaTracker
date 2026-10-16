// Only invoked by the attested, runner-owned disposable PG18 harness.
// No environment URL, hosted target, backup or real account is accepted.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { nativeMigrationSteps } from './native-migrations.mjs';
import { nativePrivacyAdapter } from './native-privacy-ops.mjs';
import { runErasure, erasePlan, verifyErasure } from './privacy-account-model.mjs';
import { mapNativeSql } from './native-hosting-sql.mjs';
import { nativeRoles } from '../lib/backend/native-roles.mjs';

const tables=['media_items','progress_logs','cloud_media_sync_operations','goals','goal_sync_operations'];
const expected=[2,2,6,1,1]; // active + tombstone, including operation receipts
export async function privacyCloudPg18(config,applySql) {
  assert.equal(config.database,'mt_p1_proof');
  assert.equal(config.host,'127.0.0.1');
  const steps=nativeMigrationSteps();
  for(const step of steps.slice(0,-1)) {
    if(step.name==='010_backup_select_policies.sql')applySql(`
      CREATE ROLE mt_backup LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT mt_privacy_operator TO mt_backup WITH INHERIT FALSE, SET FALSE;
      GRANT CONNECT ON DATABASE mt_p1_proof TO mt_backup;`);
    applySql(step.sql);
  }
  assert.equal(steps.at(-1).name,'015_privacy_cloud_policies.sql');
  const clients=[];
  const connect=async(user)=>{
    const c=new Client({...config,user,ssl:false,connectionTimeoutMillis:3000,query_timeout:5000});
    clients.push(c);await c.connect();return c;
  };
  const root=await mkdtemp(join(tmpdir(),'mt-privacy-pg18-'));
  try {
    const admin=await connect('postgres');
    assert.ok(Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num)>=180000);
    assert.ok(Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num)<190000);
    // A genuine non-superuser login, with no membership in the function owner.
    await admin.query(`CREATE ROLE mt_privacy_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
      GRANT mt_privacy_operator TO mt_privacy_login WITH INHERIT TRUE, SET FALSE;
      GRANT CONNECT ON DATABASE mt_p1_proof TO mt_privacy_login;
      GRANT mt_privacy_operator TO postgres;`);
    await admin.query('ALTER ROLE mt_privacy_login PASSWORD $password$'+config.password+'$password$');
    await admin.query('ALTER ROLE mt_runtime PASSWORD $password$'+config.password+'$password$');
    await admin.query('ALTER ROLE mt_backup PASSWORD $password$'+config.password+'$password$');
    const operator=await connect('mt_privacy_login'),backup=await connect('mt_backup'),a=await connect('mt_runtime'),b=await connect('mt_runtime');
    const users=[randomUUID(),randomUUID()];
    for(const id of users) {
      await admin.query('INSERT INTO native_auth."user"(id,name,email) VALUES($1,$2,$3)',[id,'Synthetic privacy',id+'@example.invalid']);
      await admin.query('INSERT INTO native_auth.session("userId",token,"expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',[id,randomUUID()]);
    }
    for(const [i,c] of [a,b].entries()) {
      await c.query("SELECT set_config('app.user_id',$1,false)",[users[i]]);
      const payload={title:'Synthetic',type:'movie',status:'planning',current_progress:0,total_progress:1,favorite:false,tags:[],metadata:{},identity_status:'unresolved'};
      for(const record of ['live','tombstone']) {
        const r=(await c.query("SELECT app.apply_media_item_sync_operation($1,$2,'upsert',0,$3) AS r",['create-media-'+record,record,payload])).rows[0].r;
        assert.equal(r.reason,'created');
        const log={media_title:'Synthetic',media_type:'movie',action:'added',amount:1,unit:'movie',previous_progress:0,new_progress:1,created_at:'2026-10-01T00:00:00Z'};
        assert.equal((await c.query("SELECT app.apply_progress_log_sync_operation($1,$2,'upsert',0,$3) AS r",['create-progress-'+record,record,log])).rows[0].r.reason,'created');
      }
      for(const entity of ['media_item','progress_log'])await c.query(`SELECT app.apply_${entity}_sync_operation($1,'tombstone','delete',1,NULL)`,['delete-'+entity]);
      const goal={id:'goal',title:'Synthetic goal',origin:'manual',lifecycle:'active',scope:{},metric:{},schedule:{},createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
      assert.equal((await c.query("SELECT app.apply_cloud_goal_v1($1,'goal',0,$2,false) AS r",[randomUUID(),goal])).rows[0].r.status,'applied');
    }
    const raw=async(id)=>{
      const result={};
      for(const table of tables)result[table]=(await admin.query(`SELECT * FROM app.${table} WHERE user_id=$1 ORDER BY 1,2`,[id])).rows;
      return result;
    };
    const otherBefore=await raw(users[1]);
    const adapter=nativePrivacyAdapter(operator,root,users[0]);
    const baseline=erasePlan(await adapter.inspect(),users[0]);
    const backupBefore=[];
    for(const t of tables)backupBefore.push((await backup.query(`SELECT * FROM app.${t} ORDER BY user_id,1,2`)).rows);
    const privileges=async()=> (await admin.query(`SELECT r.rolname,c.relname,
      has_table_privilege(r.oid,c.oid,'SELECT') AS read,
      has_table_privilege(r.oid,c.oid,'INSERT') AS insert,
      has_table_privilege(r.oid,c.oid,'UPDATE') AS update,
      has_table_privilege(r.oid,c.oid,'DELETE') AS delete
      FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname IN ('mt_runtime','mt_privacy_login','mt_backup')
      AND c.oid=ANY($1::regclass[]) ORDER BY r.rolname,c.relname`,[tables.map(t=>'app.'+t)])).rows;
    const privilegesBefore=await privileges();
    assert.deepEqual(tables.map(t=>baseline.counts[t]),[0,0,0,0,0]);
    assert.deepEqual(tables.map(t=>otherBefore[t].length),expected);
    console.log('PASS: pre-015 defect reproduced: operator inventory 0/0/0/0/0 despite stored Cloud rows');
    applySql(steps.at(-1).sql);
    assert.deepEqual(await privileges(),privilegesBefore);
    for(const [i,t] of tables.entries()) {
      assert.deepEqual((await backup.query(`SELECT * FROM app.${t} ORDER BY user_id,1,2`)).rows,backupBefore[i]);
      assert.equal(backupBefore[i].length,expected[i]*2);
      await assert.rejects(operator.query(`SELECT * FROM app.${t}`),{code:'42501'});
      await assert.rejects(backup.query(`DELETE FROM app.${t} WHERE user_id=$1`,[users[0]]),{code:'42501'});
    }
    // MEMBER alone is insufficient: the hosted backup edge grants neither
    // inherited function privileges nor SET ROLE, despite MEMBER being true.
    assert.deepEqual((await admin.query("SELECT pg_has_role('mt_backup','mt_privacy_operator','MEMBER') AS member,pg_has_role('mt_backup','mt_privacy_operator','USAGE') AS usage,pg_has_role('mt_backup','mt_privacy_operator','SET') AS set")).rows[0],{member:true,usage:false,set:false});
    await assert.rejects(backup.query('SET ROLE mt_privacy_operator'),{code:'42501'});
    await assert.rejects(backup.query('SELECT app.native_privacy_inspect($1)',[users[0]]),{code:'42501'});
    await assert.rejects(backup.query('SELECT app.native_privacy_cleanup($1)',[users[0]]),{code:'42501'});
    await assert.rejects(backup.query('SELECT app.native_privacy_finish($1,$2)',[users[0],'ERASE ACCOUNT '+users[0]]),{code:'42501'});
    await assert.rejects(operator.query('SET ROLE mt_owner'),{code:'42501'});
    // Also execute the new policy DDL with hosted role names, in an isolated
    // schema transaction. This checks the mapper, without contacting hosting.
    await admin.query('BEGIN');
    try {
      for(const role of ['mt_test_owner','mt_test_runtime','mt_test_privacy_operator'])await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      await admin.query('CREATE SCHEMA hosted_policy_proof AUTHORIZATION mt_test_owner; GRANT USAGE ON SCHEMA app TO mt_test_owner; GRANT EXECUTE ON FUNCTION app.current_user_id() TO mt_test_owner;');
      for(const table of tables)await admin.query(`CREATE TABLE hosted_policy_proof.${table}(user_id uuid); ALTER TABLE hosted_policy_proof.${table} OWNER TO mt_test_owner; ALTER TABLE hosted_policy_proof.${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE hosted_policy_proof.${table} FORCE ROW LEVEL SECURITY;`);
      const source=(await import('node:fs')).readFileSync(new URL('../database/native/015_privacy_cloud_policies.sql',import.meta.url),'utf8');
      const mapped=mapNativeSql(source,nativeRoles('hosting-test')).replace(/^BEGIN;|^COMMIT;/gm,'').replace('ON app.%I','ON hosted_policy_proof.%I');
      await admin.query(mapped);
      const policies=(await admin.query("SELECT qual,roles::text[] AS roles,cmd FROM pg_policies WHERE schemaname='hosted_policy_proof'")).rows;
      assert.equal(policies.length,10);
      for(const p of policies) {assert.deepEqual(p.roles,['mt_test_owner']);assert.match(p.qual,/mt_test_runtime/);assert.match(p.qual,/mt_test_privacy_operator/);assert.ok(['SELECT','DELETE'].includes(p.cmd));}
    } finally {await admin.query('ROLLBACK');}
    const snapshot=await adapter.inspect(),plan=erasePlan(snapshot,users[0]);
    assert.deepEqual(tables.map(t=>plan.counts[t]),expected);
    assert.deepEqual(plan.blocked,[]);
    for(const t of tables)assert.ok(snapshot.tables[t].every(r=>r.user_id===users[0]));
    for(const [i,c] of [a,b].entries()) {
      for(const t of tables)assert.ok((await c.query(`SELECT user_id FROM app.${t}`)).rows.every(r=>r.user_id===users[i]));
      const exported=(await c.query('SELECT app.native_account_export_snapshot() AS r')).rows[0].r;
      for(const t of tables)assert.equal(exported.tables[t].length,expected[tables.indexOf(t)]);
      await assert.rejects(c.query('SELECT app.native_privacy_inspect($1)',[users[1-i]]),{code:'42501'});
    }
    await a.query("SELECT set_config('app.user_id','',false),set_config('app.privacy_operator','true',false)");
    for(const t of tables)assert.equal((await a.query(`SELECT * FROM app.${t}`)).rows.length,0);
    await assert.rejects(a.query('SET ROLE mt_owner'),{code:'42501'});
    await assert.rejects(a.query('SELECT app.native_privacy_cleanup($1)',[users[1]]),{code:'42501'});
    await operator.query("SELECT set_config('app.user_id',$1,false)",[users[1]]);
    await assert.rejects(adapter.inspect(),/privacy_ops_denied/);
    await operator.query("SELECT set_config('app.user_id','',false)");
    // Each Cloud category independently prevents Auth-last, even when all the
    // other Cloud categories are absent. Roll back every synthetic probe.
    for(const retained of tables) {
      await admin.query('BEGIN');
      try {
        await admin.query("UPDATE app.account_lifecycle SET state='ERASING',destructive_started=true,filesystem_clean=true WHERE user_id=$1",[users[0]]);
        await admin.query('DELETE FROM native_auth.session WHERE "userId"=$1',[users[0]]);
        for(const t of tables.filter(t=>t!==retained))await admin.query(`DELETE FROM app.${t} WHERE user_id=$1`,[users[0]]);
        await admin.query('SAVEPOINT finish_probe');
        await assert.rejects(admin.query('SELECT app.native_privacy_finish($1,$2)',[users[0],'ERASE ACCOUNT '+users[0]]),/privacy_residual_before_auth/);
        await admin.query('ROLLBACK TO SAVEPOINT finish_probe');
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM native_auth."user" WHERE id=$1',[users[0]])).rows[0].n,1);
      } finally {await admin.query('ROLLBACK');}
    }
    const cleanup=adapter.cleanupApplication.bind(adapter);
    adapter.cleanupApplication=async(id)=>{
      await cleanup(id);
      const actual=await raw(id);
      assert.deepEqual(tables.map(t=>actual[t].length),[0,0,0,0,0]);
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM native_auth."user" WHERE id=$1',[id])).rows[0].n,1);
    };
    const locked=adapter.assertLocked.bind(adapter);
    adapter.assertLocked=async(id)=>{
      await locked(id);
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM native_auth.session WHERE "userId"=$1',[id])).rows[0].n,0);
      await a.query("SELECT set_config('app.user_id',$1,false)",[id]);
      await assert.rejects(a.query("SELECT app.apply_media_item_sync_operation('blocked-write','live','delete',1,NULL)"),/account_write_locked/);
    };
    const result=await runErasure(adapter,users[0],{execute:true,confirmation:'ERASE DISPOSABLE '+users[0]});
    assert.equal(result.completed,true,JSON.stringify(result));
    assert.equal(result.stages.length,10);
    assert.equal(verifyErasure(await adapter.inspect(),users[0]).applicationControlledAbsent,true);
    assert.deepEqual(tables.map(t=>(result.plan?.counts??plan.counts)[t]),expected);
    assert.deepEqual(await raw(users[1]),otherBefore);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM native_auth."user" WHERE id=$1',[users[1]])).rows[0].n,1);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM native_auth.session WHERE "userId"=$1',[users[1]])).rows[0].n,1);
    for(const t of tables) {
      const r=(await admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['app.'+t])).rows[0];
      assert.deepEqual(r,{relrowsecurity:true,relforcerowsecurity:true});
    }
    for(const role of ['mt_runtime','mt_privacy_login','mt_backup','mt_owner']) {
      const r=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];
      assert.deepEqual(r,{rolsuper:false,rolbypassrls:false});
    }
    assert.equal((await admin.query("SELECT pg_has_role('mt_runtime','mt_privacy_operator','MEMBER') AS member")).rows[0].member,false);
    console.log('PASS: post-015 inventory 2/2/6/1/1; unchanged role ACLs, read-only backup, privacy-login/runtime boundaries, tombstones, receipts, five Auth-last residual refusals, hosted policy mapping, ten erasure stages, B rows/Auth/session preserved');
  } finally {
    await Promise.allSettled(clients.map(c=>c.end()));
    await rmdir(root); // only the runner-created empty synthetic storage directory
  }
}
