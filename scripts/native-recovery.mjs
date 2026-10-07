// Native coherent directory backup/restore. Secrets are supplied only to child env.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, lstat, opendir, readFile, writeFile, copyFile, chmod } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { authorizeTarget, withOperator, digest } from './native-ops-target.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { parseOperatorArgs, migrationHistory, validateHistory } from './native-migration-runner.mjs';
import { safeDirectory, storageRoot, assetPath, assetKeyPattern } from '../lib/backend/filesystem-core.mjs';

const MAX_BYTES=2*1024*1024*1024, MAX_FILES=10000;
export async function fileDigest(path) {
  const before=await lstat(path);
  if(!before.isFile() || before.isSymbolicLink() || before.size>MAX_BYTES)throw new Error('native_recovery_file_invalid');
  const hash=createHash('sha256');let size=0;
  for await(const chunk of createReadStream(path)) {size+=chunk.length;if(size>MAX_BYTES)throw new Error('native_recovery_capacity');hash.update(chunk);}
  if(size!==before.size)throw new Error('native_recovery_file_changed');
  return {size,checksum:hash.digest('hex')};
}
async function tree(root) {
  await safeDirectory(root);const files=[];let bytes=0,nodes=0;
  async function visit(directory,depth=0) {
    if(depth>5)throw new Error('native_recovery_capacity');
    for await(const entry of await opendir(directory)) {
      if(++nodes>MAX_FILES*4)throw new Error('native_recovery_capacity');
      const path=join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error('native_recovery_path_unsafe');
      if(entry.isDirectory()){await safeDirectory(path);await visit(path,depth+1);}
      else if(entry.isFile()) {
        const info=await fileDigest(path);bytes+=info.size;
        if(files.length>=MAX_FILES || bytes>MAX_BYTES)throw new Error('native_recovery_capacity');
        files.push({path:relative(root,path).replaceAll('\\','/'),...info});
      } else throw new Error('native_recovery_path_unsafe');
    }
  }
  await visit(root);return files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
export function validateBackupManifest(manifest) {
  if(manifest?.format!=='MediaTrackerNativeBackupV1' || manifest.backend!=='native'
    || manifest.consistency!=='write-frozen-operator-quiesced' || !Array.isArray(manifest.files)
    || manifest.files.length>MAX_FILES || !Array.isArray(manifest.migrations)
    || validateHistory(manifest.migrations).length || manifest.fingerprint!==digest({...manifest,fingerprint:undefined}))throw new Error('native_backup_manifest_invalid');
  let bytes=0;const names=new Set();
  for(const file of manifest.files) {
    if(typeof file.path!=='string' || file.path.includes('\\') || file.path.split('/').some(p=>!p||p==='.'||p==='..')
      || !(file.path==='database.dump' || file.path.startsWith('storage/users/')&&assetKeyPattern.test(file.path.slice('storage/users/'.length))
        || /^storage\/temporary-uploads\/[a-f0-9-]{36}\.tmp$/.test(file.path))
      || !Number.isSafeInteger(file.size)||file.size<0||(file.path==='database.dump'&&file.size===0)||file.size>MAX_BYTES||!/^[a-f0-9]{64}$/.test(file.checksum)||names.has(file.path))throw new Error('native_backup_manifest_invalid');
    bytes+=file.size;names.add(file.path);
  }
  if(bytes>MAX_BYTES || !names.has('database.dump'))throw new Error('native_backup_manifest_invalid');
  return manifest;
}
function outside(value,roots) {
  if(!value || !isAbsolute(value))throw new Error('native_recovery_path_invalid');
  const path=resolve(value);
  for(const root of roots) {
    const a=relative(resolve(root),path),b=relative(path,resolve(root));
    if(!a||!b||(!a.startsWith('..')&&!isAbsolute(a))||(!b.startsWith('..')&&!isAbsolute(b)))throw new Error('native_recovery_path_invalid');
  }
  return path;
}
async function newDirectory(path) {
  await safeDirectory(resolve(path,'..'));
  await mkdir(path,{mode:0o700}); // Exclusive: never overwrite/reuse prior output.
  await safeDirectory(path);
}
export async function postgresTool(tool,config,path) {
  const url=config.url;
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,
    PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),
    PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),
    PGSSLMODE:config.ssl?'verify-full':'disable',PGCONNECT_TIMEOUT:'3',PGOPTIONS:'-c statement_timeout=120000 -c lock_timeout=2000'};
  const args=tool==='pg_dump'?['--format=custom','--no-password']:['--exit-on-error','--single-transaction','--no-password','--dbname',env.PGDATABASE,path];
  const child=spawn(tool,args,{env,stdio:['ignore',tool==='pg_dump'?'pipe':'ignore','ignore'],windowsHide:true});
  let deadline;
  const exit=new Promise((res,rej)=>{
    deadline=setTimeout(()=>{child.kill();rej(new Error('native_postgres_tool_timeout'));},180000);
    child.once('error',()=>rej(new Error('native_postgres_tool_unavailable')));
    child.once('exit',code=>code===0?res():rej(new Error('native_postgres_tool_failed')));
  });
  try {
    if(tool==='pg_dump') {
      let size=0;
      const bound=new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>MAX_BYTES?new Error('native_recovery_capacity'):null,chunk);}});
      await Promise.all([exit,pipeline(child.stdout,bound,createWriteStream(path,{flags:'wx',mode:0o600}))]);
    } else await exit;
  } catch {child.kill();throw new Error('native_postgres_tool_failed');}
  finally {clearTimeout(deadline);}
}
async function assetsVerified(client,root) {
  const rows=(await client.query('SELECT * FROM app.native_ops_assets()')).rows;
  if(rows.length>MAX_FILES)throw new Error('native_recovery_capacity');
  for(const row of rows) {
    const file=await assetPath(root,row.file_key);
    const info=await lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||info.size!==Number(row.size))throw new Error('native_asset_reference_mismatch');
  }
  return rows.length;
}
export async function verifyNativeDatabase(client) {
  const catalog=(await client.query(`SELECT
    EXISTS(SELECT FROM pg_roles WHERE rolname='mt_runtime' AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
    AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname IN ('mt_owner','mt_auth_owner','mt_privacy_operator','mt_limiter')
      AND pg_has_role('mt_runtime',oid,'MEMBER'))
    AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app'
      AND c.relkind IN ('r','p') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR c.relowner=(SELECT oid FROM pg_roles WHERE rolname='mt_runtime')))
    AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','native_auth') AND p.prosecdef
      AND NOT EXISTS(SELECT FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%')) AS safe`)).rows[0]?.safe;
  const lifecycle=(await client.query('SELECT app.native_ops_lifecycle_state() AS state')).rows[0]?.state;
  if(catalog!==true||!lifecycle||lifecycle.missing!==0||!Number.isSafeInteger(lifecycle.pending)||lifecycle.pending<0)throw new Error('native_recovery_catalog_invalid');
  return {catalog:'PASS',pendingPrivacyAccounts:lifecycle.pending};
}
export async function backupNative(client,config,target,options,tool=postgresTool) {
  authorizeTarget(target,config,{operation:'BACKUP',...options,operator:true,provisioner:true});
  if(validateHistory(await migrationHistory(client)).length)throw new Error('native_schema_incomplete');
  await verifyNativeDatabase(client);
  if(!options.apply)return {mode:'PLAN',consistency:'freeze; stop all workers and scheduled operators; dump; copy; verify; leave frozen'};
  if(options.quiesced!=='ALL_WORKERS_AND_OPERATORS_STOPPED')throw new Error('native_backup_quiescence_required');
  const root=storageRoot(options.storage),destination=outside(options.output,[root,process.cwd()]);
  await safeDirectory(root);
  if(!(await client.query('SELECT pg_try_advisory_lock(207403,2) AS locked')).rows[0]?.locked)throw new Error('native_maintenance_busy');
  try {
    const state=(await client.query('SELECT app.native_ops_state() AS state')).rows[0]?.state;
    if(!state || typeof state.frozen!=='boolean')throw new Error('native_freeze_state_invalid');
    if(!state.frozen)await client.query('SELECT app.set_release_freeze(true,$1::bigint)',[state.revision]);
    await newDirectory(destination);
    await tool('pg_dump',config,join(destination,'database.dump'));
    // No archive extraction/traversal; each regular private file is copied explicitly.
    const source=await tree(root);
    for(const file of source) if(!(file.path.startsWith('users/')&&assetKeyPattern.test(file.path.slice(6))
      || /^temporary-uploads\/[a-f0-9-]{36}\.tmp$/.test(file.path)))throw new Error('native_backup_storage_content_invalid');
    const storage=join(destination,'storage');await mkdir(storage,{mode:0o700});
    for(const file of source) {
      const path=join(storage,file.path);await safeDirectory(resolve(path,'..'),true);
      await copyFile(join(root,file.path),path);await chmod(path,0o600);
    }
    if(JSON.stringify(source)!==JSON.stringify(await tree(storage)))throw new Error('native_backup_copy_mismatch');
    const files=await tree(destination);
    const migrations=await migrationHistory(client);
    if(validateHistory(migrations).length)throw new Error('native_schema_incomplete');
    const references=await assetsVerified(client,storage);
    const databaseState=await verifyNativeDatabase(client);
    if(JSON.stringify(source)!==JSON.stringify(await tree(root)))throw new Error('native_backup_source_changed');
    const manifest={format:'MediaTrackerNativeBackupV1',backend:'native',createdAt:new Date().toISOString(),
      consistency:'write-frozen-operator-quiesced',targetFingerprint:target.fingerprint,migrations,files,references,databaseState};
    manifest.fingerprint=digest(manifest);validateBackupManifest(manifest);
    await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    return {status:'BACKUP_CREATED',fingerprint:manifest.fingerprint,files:files.length,writeState:'FROZEN'};
  } finally {await client.query('SELECT pg_advisory_unlock(207403,2)');}
}
export async function verifyBackup(path) {
  await safeDirectory(path);
  const info=await lstat(join(path,'manifest.json'));
  if(!info.isFile()||info.isSymbolicLink()||info.size>4*1024*1024)throw new Error('native_backup_manifest_invalid');
  const manifest=validateBackupManifest(JSON.parse(await readFile(join(path,'manifest.json'),'utf8')));
  const files=(await tree(path)).filter(file=>file.path!=='manifest.json');
  if(JSON.stringify(files)!==JSON.stringify(manifest.files))throw new Error('native_backup_content_mismatch');
  return manifest;
}
export async function restoreNative(client,config,target,options,tool=postgresTool) {
  authorizeTarget(target,config,{operation:'RESTORE',...options,operator:true,provisioner:true});
  const manifest=await verifyBackup(resolve(options.input));
  if(manifest.fingerprint!==options['backup-fingerprint'])throw new Error('native_restore_backup_unconfirmed');
  const exists=(await client.query(`SELECT EXISTS(SELECT FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%')
    OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m')) AS occupied`)).rows[0]?.occupied;
  if(exists!==false)throw new Error('native_restore_database_not_empty');
  const root=storageRoot(options.storage);outside(options.input,[root]);await safeDirectory(root);
  for await(const entry of await opendir(root)) {if(entry)throw new Error('native_restore_storage_not_empty');}
  if(!options.apply)return {mode:'PLAN',backup:manifest.fingerprint,files:manifest.files.length};
  if(options.quiesced!=='ALL_WORKERS_AND_OPERATORS_STOPPED')throw new Error('native_restore_quiescence_required');
  // pg_restore preserves role ownership/ACLs. Provision exact NOLOGIN/login roles
  // beforehand out-of-band; never restore using --no-owner or --no-acl.
  await tool('pg_restore',config,join(resolve(options.input),'database.dump'));
  if(validateHistory(await migrationHistory(client)).length)throw new Error('native_restore_schema_mismatch');
  const databaseState=await verifyNativeDatabase(client);
  for(const file of manifest.files.filter(f=>f.path.startsWith('storage/'))) {
    const path=join(root,file.path.slice('storage/'.length));await safeDirectory(resolve(path,'..'),true);
    await copyFile(join(options.input,file.path),path);await chmod(path,0o600);
    const actual=await fileDigest(path);if(actual.checksum!==file.checksum||actual.size!==file.size)throw new Error('native_restore_file_mismatch');
  }
  const references=await assetsVerified(client,root);
  const state=(await client.query('SELECT app.native_ops_state() AS state')).rows[0]?.state;
  if(state?.frozen!==true)throw new Error('native_restore_write_barrier_missing');
  return {status:'RESTORED_FROZEN',references,databaseState,privacy:'preserved; inspect pending lifecycle accounts before admitting traffic',proof:'REQUIRES_P4_PROOF'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const command=process.argv[2];
    if(!['backup','restore','verify'].includes(command))throw new Error('native_recovery_command_invalid');
    const options=parseOperatorArgs(process.argv.slice(3),['--storage','--output','--input','--backup-fingerprint','--quiesced']);
    const result=command==='verify'?{status:'VERIFIED',fingerprint:(await verifyBackup(resolve(options.input))).fingerprint}:
      options.connect?await withOperator(process.env,(c,e,t)=>command==='backup'?backupNative(c,e,t,options):restoreNative(c,e,t,options)):
      {mode:'OFFLINE',command,migrations:nativeMigrationManifest().map(({name,checksum})=>({name,checksum}))};
    console.log(JSON.stringify(result));
  } catch {console.error('native_recovery_command_failed');process.exitCode=1;}
}
