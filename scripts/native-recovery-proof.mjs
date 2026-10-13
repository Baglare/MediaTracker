// Real PostgreSQL 18 recovery, runner-owned local Docker only; never pull an image.
// --proof uses synthetic two-user fixtures. --input verifies an actual private backup.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm, writeFile, copyFile, chmod, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { nativeRoles } from '../lib/backend/native-roles.mjs';
import { hostingSchemas, hostingMemberships, inspectHostingContract } from './native-hosting-contract.mjs';
import { startDisposableRelay, localEndpoints, inspectDisposableTarget } from './native-disposable-relay.mjs';
import { inspectTarget } from './native-ops-target.mjs';
import { digest } from './native-ops-target.mjs';
import { recoverySourceFingerprint, attestRecoveryRunner } from './native-recovery-proof-contract.mjs';
import { runMigrations, migrationHistory, validateHistory } from './native-migration-runner.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { backupNative, verifyBackup, verifyNativeDatabase, fileDigest, assetsVerified } from './native-recovery.mjs';
import { inspectBackupCoverage, recoveryInventory, recoveryRoles, recoveryDatabaseContract, assertRecoveryInventory, quoteIdentifier as qi } from './native-recovery-evidence.mjs';
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const args=process.argv.slice(2),synthetic=args.length===1&&args[0]==='--proof';
if(!synthetic && !(args.length===4&&args[0]==='--input'&&args[2]==='--backup-fingerprint'))throw new Error('native_recovery_proof_arguments_invalid');
const image='postgres:18-alpine',runName=`mt-p1-${randomUUID()}`,password=randomBytes(32).toString('hex');
const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
let localEndpoint,containerId,networkId,relay,workspace,stage='DOCKER',started=false,result,interrupted=false,lastConnectionCode,sourceCatalog,restoredCatalog,inventoryDifferences;
const safeErrorCode=error=>['Connection terminated due to connection timeout','timeout expired'].includes(error?.message)?'PG_CONNECTION_TIMEOUT':
  /^(?:[0-9A-Z]{5}|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPERM|EACCES|ENOENT)$/.test(error?.code??'')?error.code:
  /^(?:native_[a-z_]+|unsafe_disposable_target|storage_configuration_invalid)$/.test(error?.message??'')?error.message:'REDACTED';
const interrupt=()=>{interrupted=true;};
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
const clients=new Set();
function docker(args,input,binary=false) {
  if(interrupted&&!['rm','network'].includes(args[0]))throw new Error('native_recovery_interrupted');
  const result=spawnSync('docker',['--host',localEndpoint,...args],{input,env,encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:2*1024*1024*1024,windowsHide:true});
  if(result.status!==0)throw new Error('native_recovery_proof_failed');return result.stdout;
}
async function connect(user='postgres',database='postgres') {
  const client=new Client({host:'127.0.0.1',port:relay.descriptor.port,user,password,database,connectionTimeoutMillis:3000,query_timeout:120000});
  const query=client.query.bind(client);
  client.query=async(...args)=>{
    try{
      const scopeFix=synthetic&&typeof args[0]==='string'&&args[0].startsWith('-- Legacy social SELECT/ALL policies');
      const policyQuery=`SELECT c.relname AS relation,p.polname AS name,p.polcmd AS command,p.polpermissive AS permissive,
        pg_get_expr(p.polqual,p.polrelid) AS predicate,pg_get_expr(p.polwithcheck,p.polrelid) AS "check",
        (SELECT array_agg(r.rolname::text ORDER BY r.rolname::text) FROM pg_roles r WHERE r.oid=ANY(p.polroles)) AS roles
        FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='app' ORDER BY c.relname::text,p.polname::text`;
      const policies=scopeFix?(await query(policyQuery)).rows:undefined;
      const result=await query(...args);
      if(scopeFix) {
        const after=(await query(policyQuery)).rows;
        if(!policies.length||policies.length!==after.length)throw new Error('native_recovery_policy_semantics_changed');
        for(const [i,before] of policies.entries()) {
          const publicRead=before.roles===null&&before.permissive&&['r','*'].includes(before.command);
          const expected={...before,...(publicRead?{roles:['mt_test_owner','mt_test_runtime']}: {})};
          if(JSON.stringify(expected)!==JSON.stringify(after[i]))throw new Error('native_recovery_policy_semantics_changed');
        }
      }
      if(synthetic&&typeof args[0]==='string'&&args[0].startsWith('SELECT kind,identity,definition')) {
        if(stage==='SOURCE_DUMP')sourceCatalog=result.rows;
        if(stage==='RESTORE_INVENTORY')restoredCatalog=result.rows;
      }
      return result;
    }catch(error){
      const text=typeof args[0]==='string'?args[0]:'';
      for(const [match,label] of [['SELECT app.native_ops_lifecycle_state()','LIFECYCLE_READ'],['SELECT app.native_ops_assets()','ASSET_REFERENCES'],
        ['SELECT app.native_ops_state()','FREEZE_STATE'],['SELECT name,checksum FROM native_migrations.ledger','LEDGER_READ'],
        ['DECLARE native_recovery_rows','DATA_CURSOR_OPEN'],['FETCH 500','DATA_CURSOR_FETCH'],['SELECT kind,identity,definition','CATALOG_INVENTORY'],
        ['SELECT r.rolname AS name','ROLE_SETTINGS'],['SELECT rolname AS name','ROLE_ATTRIBUTES']])
        if(text.startsWith(match))error.proofOperation=label;
      if(synthetic&&error.proofOperation==='DATA_CURSOR_OPEN') {
        const match=text.match(/FROM "(app|native_auth|private_privacy_ops|private_rate_limit|native_migrations)"\."([a-zA-Z_]{1,63})"/);
        if(match)error.proofRelation=match[1]+'.'+match[2];
      }
      throw error;
    }
  };
  client.on('error',()=>{});clients.add(client);
  try{await client.connect();return client;}catch(error){await client.end().catch(()=>{});clients.delete(client);throw error;}
}
async function bootstrap(admin,roles,roleState,databaseContract) {
  for(const role of roleState.attributes)await admin.query(`CREATE ROLE ${qi(role.name)} ${role.login?'LOGIN':'NOLOGIN'} ${role.inherit?'INHERIT':'NOINHERIT'} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT ${role.limit}${role.login?' PASSWORD '+quote(password):''}`);
  for(const edge of hostingMemberships(roles))await admin.query(`GRANT ${qi(edge.role)} TO ${qi(edge.member)} WITH ADMIN FALSE, INHERIT ${edge.inherit}, SET ${edge.set}`);
  for(const name of databaseContract?[databaseContract.owner,...databaseContract.acl.flatMap(a=>[a.grantor,a.grantee])]:[]) {
    if(name==='PUBLIC'||(await admin.query('SELECT EXISTS(SELECT FROM pg_roles WHERE rolname=$1) AS present',[name])).rows[0].present)continue;
    // Reproduce provider-owned database names/ACL principals, never provider powers/secrets.
    await admin.query(`CREATE ROLE ${qi(name)} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
  }
  await admin.query(`CREATE DATABASE ${qi(roles.database)} OWNER ${qi(databaseContract?.owner??'postgres')}`);
  if(databaseContract)await restoreDatabaseAcl(admin,databaseContract);
  for(const setting of roleState.settings)for(const value of setting.config) {
    const equal=value.indexOf('='),key=value.slice(0,equal);
    if(!['search_path','statement_timeout','lock_timeout','idle_in_transaction_session_timeout'].includes(key))throw new Error('native_recovery_role_settings_invalid');
    await admin.query(`ALTER ROLE ${qi(setting.name)}${setting.database?' IN DATABASE '+qi(roles.database):''} SET ${qi(key)} TO ${quote(value.slice(equal+1))}`);
  }
}
async function restoreDatabaseAcl(admin,contract) {
  await admin.query(`REVOKE ALL ON DATABASE ${qi(contract.name)} FROM PUBLIC,${qi(contract.owner)}`);
  let pending=[...contract.acl];
  for(let round=0;pending.length&&round<=contract.acl.length;round++) {
    const next=[];
    for(const grant of pending) {
      if(!['CONNECT','CREATE','TEMPORARY'].includes(grant.privilege))throw new Error('native_restore_database_acl_invalid');
      const allowed=(await admin.query('SELECT has_database_privilege($1,$2,$3) AS allowed',[grant.grantor,contract.name,grant.privilege+' WITH GRANT OPTION'])).rows[0].allowed;
      if(!allowed){next.push(grant);continue;}
      await admin.query(`SET ROLE ${qi(grant.grantor)}`);
      try{await admin.query(`GRANT ${grant.privilege} ON DATABASE ${qi(contract.name)} TO ${grant.grantee==='PUBLIC'?'PUBLIC':qi(grant.grantee)}${grant.grantable?' WITH GRANT OPTION':''}`);}
      finally{await admin.query('RESET ROLE');}
    }
    if(next.length===pending.length&&next.length)throw new Error('native_restore_database_acl_invalid');pending=next;
  }
}
function sourceRoleState(roles) {
  const keys=['runtime','migrator','privacy_login','owner','auth_owner','auth_access','privacy_operator','limiter','backup','restore','database_owner','ledger_owner'];
  return {attributes:keys.map(key=>({name:roles[key],login:['runtime','migrator','privacy_login','backup','restore'].includes(key),inherit:key==='runtime',limit:key==='runtime'?5:['migrator','privacy_login','backup','restore'].includes(key)?2:-1})),
    settings:[{name:roles.runtime,database:null,config:['search_path=native_auth, pg_catalog, pg_temp','statement_timeout=5s','lock_timeout=2s','idle_in_transaction_session_timeout=10s']}]};
}
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function runtimeIsolation(roles) {
  const runtime=await connect(roles.runtime,roles.database);
  for(const user of [a,b]) {
    await runtime.query('BEGIN');await runtime.query("SELECT set_config('app.user_id',$1,true)",[user]);
    const rows=(await runtime.query('SELECT user_id::text,id,title FROM app.media_items')).rows;
    if(rows.length!==1||rows[0].user_id!==user||rows[0].title!==(user===a?'Recovered A':'Recovered B'))throw new Error('native_recovery_cross_owner');
    const other=user===a?b:a;
    if((await runtime.query('SELECT count(*)::integer AS n FROM app.media_items WHERE user_id=$1',[other])).rows[0].n!==0)throw new Error('native_recovery_cross_owner');
    const goals=(await runtime.query('SELECT user_id::text FROM app.goals')).rows;
    if(goals.length!==1||goals[0].user_id!==user)throw new Error('native_recovery_cross_owner');
    // Cross-owner UPDATE must affect zero rows; privilege denial is also safe.
    await runtime.query('SAVEPOINT denied_write');
    try {if((await runtime.query('UPDATE app.media_items SET title=$1 WHERE user_id=$2',['forged',other])).rowCount!==0)throw new Error('native_recovery_cross_owner');}
    catch(error){if(error.code!=='42501')throw error;await runtime.query('ROLLBACK TO denied_write');}
    await runtime.query('ROLLBACK');
  }
  try {await runtime.query(`SET ROLE ${qi(roles.backup)}`);throw new Error('native_recovery_runtime_privilege');}
  catch(error){if(error.code!=='42501')throw error;}
  const safe=(await runtime.query(`SELECT NOT pg_has_role(current_user,$1,'MEMBER') AND NOT has_function_privilege(current_user,'app.set_release_freeze(boolean,bigint)','EXECUTE') AS safe`,[roles.backup])).rows[0]?.safe;
  if(safe!==true)throw new Error('native_recovery_runtime_privilege');
  await runtime.end();clients.delete(runtime);
}
async function recoveredOwnerIsolation(admin,roles) {
  const owners=(await admin.query(`SELECT user_id::text,count(*)::integer AS count FROM app.media_items
    GROUP BY user_id ORDER BY user_id LIMIT 2`)).rows;
  if(owners.length<2)return 'NOT_RUN';
  const runtime=await connect(roles.runtime,roles.database);
  for(const owner of owners) {
    await runtime.query('BEGIN READ ONLY');await runtime.query("SELECT set_config('app.user_id',$1,true)",[owner.user_id]);
    const rows=(await runtime.query('SELECT user_id::text,count(*)::integer AS count FROM app.media_items GROUP BY user_id')).rows;
    if(rows.length!==1||rows[0].user_id!==owner.user_id||rows[0].count!==owner.count)throw new Error('native_recovery_cross_owner');
    await runtime.query('ROLLBACK');
  }
  await runtime.end();clients.delete(runtime);return 'PASS';
}
try {
  const context=spawnSync('docker',['context','inspect'],{env,encoding:'utf8',timeout:5000,windowsHide:true});
  localEndpoint=context.status===0?JSON.parse(context.stdout)[0]?.Endpoints?.docker?.Host:undefined;
  if(!localEndpoints.includes(localEndpoint))throw new Error('native_recovery_environment');
  stage='IMAGE_INSPECT';docker(['image','inspect',image]);stage='NETWORK_CREATE';
  networkId=docker(['network','create','--internal','--label',`mt.p1.proof=${runName}`,runName]).trim();
  stage='CONTAINER_CREATE';containerId=docker(['run','--detach','--name',runName,'--label',`mt.p1.proof=${runName}`,'--network',runName,
    '--mount','type=tmpfs,destination=/var/lib/postgresql','--mount','type=tmpfs,destination=/var/lib/postgresql/data',
    '-e',`POSTGRES_PASSWORD=${password}`,'-e','PGDATA=/var/lib/postgresql/data/pgdata','-e','POSTGRES_DB=mt_p1_proof',image]).trim();
  started=true;
  stage='RELAY_ATTESTATION';relay=await startDisposableRelay({containerId,networkId,runName,localEndpoint},{transport:process.platform==='win32'?'docker-exec':'tcp'});
  let admin;
  stage='DATABASE_READY';
  const deadline=Date.now()+60000;
  while(!interrupted&&Date.now()<deadline) {
    try{admin=await connect();await admin.query('SELECT 1');break;}
    catch(error){lastConnectionCode=safeErrorCode(error);if(admin){await admin.end().catch(()=>{});clients.delete(admin);admin=undefined;}await new Promise(r=>setTimeout(r,250));}
  }
  if(!admin)throw new Error('native_recovery_environment');
  workspace=await mkdtemp(join(tmpdir(),'mt-shared-recovery-'));
  let input,manifest,roles;
  if(synthetic) {
    stage='SYNTHETIC_SHARED_SOURCE';roles=nativeRoles('hosting-test','shared-managed');
    stage='SOURCE_ROLE_BOOTSTRAP';
    await bootstrap(admin,roles,sourceRoleState(roles));
    stage='SOURCE_SCHEMA_BOOTSTRAP';
    const setup=await connect('postgres',roles.database);
    await setup.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    for(const schema of hostingSchemas(roles))await setup.query(`CREATE SCHEMA ${qi(schema.schema)} AUTHORIZATION ${qi(schema.owner)}`);
    const migrator=await connect(roles.migrator,roles.database);
    const configuration={url:new URL(`postgresql://${roles.migrator}@127.0.0.1:${relay.descriptor.port}/${roles.database}`),roles,kind:'migrator',environment:'disposable'};
    stage='SOURCE_TARGET_ATTESTATION';
    const target=await inspectTarget(migrator,configuration);configuration.expected=target.fingerprint;
    stage='SOURCE_MIGRATIONS';
    await runMigrations(migrator,configuration,target,{apply:true,confirmation:`MIGRATE disposable ${target.fingerprint}`});
    stage='SOURCE_AUTH_FIXTURES';
    await setup.query(`INSERT INTO native_auth."user"(id,name,email) VALUES($1,'Recovery A','recovery-a@example.invalid'),($2,'Recovery B','recovery-b@example.invalid')`,[a,b]);
    stage='SOURCE_BUSINESS_FIXTURES';
    const runtime=await connect(roles.runtime,roles.database);
    for(const user of [a,b]) {
      await runtime.query('BEGIN');await runtime.query("SELECT set_config('app.user_id',$1,true)",[user]);
      const payload={title:user===a?'Recovered A':'Recovered B',type:'movie',status:'planning',current_progress:0,total_progress:1,favorite:false,tags:[],metadata:{},identity_status:'unresolved'};
      const result=(await runtime.query("SELECT app.apply_media_item_sync_operation($1,'same-id','upsert',0,$2::jsonb) AS r",['recovery-'+user,payload])).rows[0]?.r;
      if(result?.reason!=='created')throw new Error('native_recovery_fixture_failed');await runtime.query('COMMIT');
      await runtime.query('BEGIN');await runtime.query("SELECT set_config('app.user_id',$1,true)",[user]);
      const goal={id:'same-goal',title:'Recovery goal',origin:'manual',lifecycle:'active',scope:{},metric:{},schedule:{},createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'};
      const resultGoal=(await runtime.query('SELECT app.apply_cloud_goal_v1($1,$2,0,$3::jsonb,false) AS r',[user,'same-goal',goal])).rows[0]?.r;
      if(resultGoal?.status!=='applied')throw new Error('native_recovery_fixture_failed');await runtime.query('COMMIT');
    }
    stage='SOURCE_RUNTIME_ISOLATION';
    await runtimeIsolation(roles);
    stage='SOURCE_ASSET_FIXTURES';
    const storage=join(workspace,'private-source'),output=join(workspace,'backup');await mkdir(storage);
    for(const user of [a,b]) {
      const id=user===a?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      const key=`${user}/avatar/${id}.jpg`,bytes=Buffer.from('synthetic private asset '+user);
      await mkdir(join(storage,'users',user,'avatar'),{recursive:true,mode:0o700});await writeFile(join(storage,'users',key),bytes,{mode:0o600});
      await setup.query("INSERT INTO app.native_asset_objects(id,user_id,kind,file_key,state,mime,size) VALUES($1,$2,'avatar',$3,'published','image/jpeg',$4)",[id,user,key,bytes.length]);
      await setup.query('INSERT INTO app.profiles(id,display_name,avatar_path) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET avatar_path=excluded.avatar_path',[user,'Recovery profile',key]);
    }
    stage='SOURCE_FREEZE';
    await setup.query('UPDATE app.release_write_state SET frozen=true,revision=revision+1 WHERE singleton');
    const backup=await connect(roles.backup,roles.database);
    stage='SOURCE_BACKUP_COVERAGE';
    await inspectBackupCoverage(backup,roles);
    if((await backup.query('SELECT count(*)::integer AS n FROM app.media_items')).rows[0]?.n!==2)throw new Error('native_recovery_fixture_failed');
    // Negative checks ensure permissive SELECT never silently overrides restrictive policy.
    stage='SOURCE_NEGATIVE_POLICY_PROBES';
    await setup.query(`CREATE POLICY recovery_deny ON app.media_items AS RESTRICTIVE FOR SELECT TO ${qi(roles.backup)} USING(false)`);
    let denied=false;try{await inspectBackupCoverage(backup,roles);}catch{denied=true;}
    await setup.query('DROP POLICY recovery_deny ON app.media_items');if(!denied)throw new Error('native_recovery_policy_fail_open');
    await setup.query('CREATE POLICY recovery_public_eval ON app.media_items FOR SELECT USING(app.current_user_id()=user_id)');
    denied=false;try{await inspectBackupCoverage(backup,roles);}catch{denied=true;}
    await setup.query('DROP POLICY recovery_public_eval ON app.media_items');if(!denied)throw new Error('native_recovery_policy_fail_open');
    await setup.query('DROP POLICY native_backup_select ON app.media_items');
    denied=false;try{await inspectBackupCoverage(backup,roles);}catch{denied=true;}
    await setup.query(`CREATE POLICY native_backup_select ON app.media_items FOR SELECT TO ${qi(roles.backup)} USING(current_user=${quote(roles.backup)} AND session_user=${quote(roles.backup)})`);
    if(!denied)throw new Error('native_recovery_policy_fail_open');
    try {await backup.query('DELETE FROM app.media_items');throw new Error('native_recovery_backup_write');}
    catch(error){if(error.code!=='42501')throw error;}
    const bc={...configuration,kind:'backup',url:new URL(`postgresql://${roles.backup}@127.0.0.1:${relay.descriptor.port}/${roles.database}`)};
    const bt=await inspectTarget(backup,bc);bc.expected=bt.fingerprint;
    await attestRecoveryRunner(backup,{containerId,networkId,runName,localEndpoint},relay.proof);
    stage='SOURCE_DUMP';
    await backupNative(backup,bc,bt,{apply:true,confirmation:`BACKUP disposable ${bt.fingerprint}`,quiesced:'ALL_WORKERS_AND_OPERATORS_STOPPED',storage,output},async(tool,config,path)=>{
      inspectDisposableTarget({containerId,networkId,runName,localEndpoint});
      const version=docker(['exec',containerId,'pg_dump','--version']);if(!/^pg_dump \(PostgreSQL\) 18\./.test(version))throw new Error('native_postgres_18_required');
      const bytes=docker(['exec',containerId,'pg_dump','-U',roles.backup,'-d',roles.database,'--no-password','--format=custom','--enable-row-security','--exclude-schema=public',`--snapshot=${config.snapshot}`],undefined,true);
      await writeFile(path,bytes,{flag:'wx',mode:0o600});
    });
    stage='SOURCE_BACKUP_VERIFY';
    input=output;manifest=await verifyBackup(input);
    for(const client of clients)if(client!==admin){await client.end().catch(()=>{});clients.delete(client);}
    await admin.query(`DROP DATABASE ${qi(roles.database)}`);
    // Same role names/ACL graph remain in the isolated cluster, as on recovery bootstrap.
    await admin.query(`CREATE DATABASE ${qi(roles.database)} OWNER postgres`);
  } else {
    input=resolve(args[1]);manifest=await verifyBackup(input);
    if(manifest.fingerprint!==args[3]||manifest.capability!=='shared-managed')throw new Error('native_restore_backup_unconfirmed');
    roles=nativeRoles(manifest.roleProfile,'shared-managed');
    await bootstrap(admin,roles,manifest.roleState,manifest.databaseContract);
  }
  stage='PG18_RESTORE';
  inspectDisposableTarget({containerId,networkId,runName,localEndpoint});
  if(!/^pg_restore \(PostgreSQL\) 18\./.test(docker(['exec',containerId,'pg_restore','--version'])))throw new Error('native_postgres_18_required');
  // Fresh runner-owned empty database; superuser exists ONLY in this isolated cluster.
  // Preserve ownership and ACLs; no --no-owner, --no-acl, --clean or hosting restore login.
  docker(['exec','-i',containerId,'pg_restore','-U','postgres','-d',roles.database,'--no-password','--exit-on-error','--single-transaction'],await readFile(join(input,'database.dump')));
  const restored=await connect('postgres',roles.database);
    stage='RESTORE_CONTRACT';
  await inspectHostingContract(restored,roles,false,true);
  if(validateHistory(await migrationHistory(restored,roles),nativeMigrationManifest(roles.profile)).length)throw new Error('native_restore_schema_mismatch');
  await verifyNativeDatabase(restored,roles);
    stage='RESTORE_INVENTORY';
  await restored.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const recoveredInventory=await recoveryInventory(restored,roles);
  if(synthetic&&JSON.stringify(recoveredInventory)!==JSON.stringify(manifest.inventory)) {
    inventoryDifferences={tables:recoveredInventory.tables.filter((t,i)=>JSON.stringify(t)!==JSON.stringify(manifest.inventory.tables[i])).map(t=>t.schema+'.'+t.name),
      sequences:JSON.stringify(recoveredInventory.sequences)!==JSON.stringify(manifest.inventory.sequences),
      catalog:(restoredCatalog??[]).filter((c,i)=>JSON.stringify(c)!==JSON.stringify(sourceCatalog?.[i])).slice(0,10).map(c=>{
        const original=sourceCatalog?.find(e=>e.kind===c.kind&&e.identity===c.identity);
        return {kind:c.kind,identity:c.identity,...(c.kind==='constraint'?{sourceNotValid:original?.definition.endsWith(' NOT VALID'),restoredNotValid:c.definition.endsWith(' NOT VALID')}: {})};
      })};
    if(process.env.NATIVE_RECOVERY_DIAGNOSTICS==='1') {
      const directory=resolve('.codex/native-shared-recovery');await mkdir(directory,{recursive:true,mode:0o700});
      // Only static CHECK definitions from our synthetic schema, never rows/passwords.
      const differences=(restoredCatalog??[]).filter(c=>c.kind==='constraint').flatMap(c=>{
        const original=sourceCatalog?.find(e=>e.kind===c.kind&&e.identity===c.identity);
        return original&&original.definition!==c.definition?[{identity:c.identity,source:original.definition,restored:c.definition}]:[];
      });
      await writeFile(join(directory,'constraint-differences.json'),JSON.stringify(differences,null,2)+'\n',{mode:0o600});
    }
  }
  assertRecoveryInventory(recoveredInventory,manifest.inventory);
  if(JSON.stringify(await recoveryRoles(restored,roles))!==JSON.stringify(manifest.roleState))throw new Error('native_restore_roles_mismatch');
  if(JSON.stringify(await recoveryDatabaseContract(restored))!==JSON.stringify(manifest.databaseContract))throw new Error('native_restore_database_acl_invalid');
  await restored.query('ROLLBACK');
    stage='RESTORE_ASSETS';
  const storage=join(workspace,'private-restored');await mkdir(storage,{mode:0o700});
  for(const file of manifest.files.filter(f=>f.path.startsWith('storage/'))) {
    const path=join(storage,file.path.slice(8));await mkdir(join(path,'..'),{recursive:true,mode:0o700});
    await copyFile(join(input,file.path),path);
    await chmod(path,0o600);
    if(process.platform!=='win32' && ((await lstat(path)).mode & 0o077)!==0)throw new Error('native_restore_file_permissions');
    if(JSON.stringify(await fileDigest(path))!==JSON.stringify({size:file.size,checksum:file.checksum}))throw new Error('native_restore_file_mismatch');
  }
  await assetsVerified(restored,storage);
  let twoUserIsolation;
  if(synthetic)await runtimeIsolation(roles);
  twoUserIsolation=synthetic?'PASS':await recoveredOwnerIsolation(restored,roles);
  const proof={format:'MediaTrackerNativeRecoveryProofV1',status:'PASS',kind:synthetic?'SYNTHETIC_PG18_ROUNDTRIP':'PRIVATE_BACKUP_PG18_RESTORE',pgMajor:18,
    sourceFingerprint:await recoverySourceFingerprint(),ledger:'PASS',rows:'PASS',ownershipAcl:'PASS',roleSettings:'PASS',files:'PASS',twoUserIsolation,live:'NOT_RUN'};
  proof.fingerprint=digest(proof);result=proof;
} catch(error) {
  result={status:started?'FAIL':'NOT_RUN',stage,reason:started?'RECOVERY_PROOF_FAILED':'LOCAL_DOCKER_PG18_REQUIRED',errorCode:safeErrorCode(error),
    ...(['LIFECYCLE_READ','ASSET_REFERENCES','FREEZE_STATE','LEDGER_READ','DATA_CURSOR_OPEN','DATA_CURSOR_FETCH','CATALOG_INVENTORY','ROLE_SETTINGS','ROLE_ATTRIBUTES'].includes(error.proofOperation)?{operation:error.proofOperation}:{}),
    ...(synthetic&&error.proofRelation?{relation:error.proofRelation}:{}),
    ...(synthetic&&inventoryDifferences?{inventoryDifferences}:{}),
    ...(stage==='DATABASE_READY'&&lastConnectionCode?{connectionCode:lastConnectionCode}:{}),live:'NOT_RUN'};process.exitCode=1;
} finally {
  try {
    for(const client of clients)await client.end().catch(()=>{});
    if(relay)await relay.close();
    if(containerId&&/^[a-f0-9]{64}$/.test(containerId))docker(['rm','--force',containerId]);
    if(networkId&&/^[a-f0-9]{64}$/.test(networkId))docker(['network','rm',networkId]);
    if(workspace)await rm(workspace,{recursive:true,force:true});
    if(interrupted)throw new Error('native_recovery_interrupted');
  }catch{result={status:'FAIL',stage:'CLEANUP',reason:'LOCAL_RECOVERY_CLEANUP_FAILED',live:'NOT_RUN'};process.exitCode=1;}
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
}
console.log(JSON.stringify(result));
