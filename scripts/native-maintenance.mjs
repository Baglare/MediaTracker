import { pathToFileURL } from 'node:url';
import { opendir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { authorizeTarget, withOperator } from './native-ops-target.mjs';
import { parseOperatorArgs, migrationHistory, validateHistory } from './native-migration-runner.mjs';
import { cleanupNativeAssets } from './native-assets-maintenance.mjs';
import { storageRoot, safeDirectory, removeTemporary } from '../lib/backend/filesystem-core.mjs';
import { attestNativeDisposableClient } from './native-disposable-capability.mjs';
import { runNativePrivacyJob } from './native-privacy-ops.mjs';
export async function runMaintenance(client,config,target,options) {
  authorizeTarget(target,config,{operation:'MAINTAIN',...options,operator:true});
  if(validateHistory(await migrationHistory(client)).length)throw new Error('native_schema_incomplete');
  const job=options.job??'cleanup';
  if(!['cleanup','freeze','unfreeze','inspect','privacy'].includes(job))throw new Error('native_maintenance_job_invalid');
  if(job==='privacy') {
    if(target.environment!=='disposable')throw new Error('native_privacy_target_unproven');
    const disposableProof=await attestNativeDisposableClient(client,{containerId:options['container-id'],runName:options['run-name'],localEndpoint:options['local-endpoint']});
    const result=await runNativePrivacyJob({client,disposableProof,storage:options.storage,user:options.user,email:options.email,
      execute:options.apply,confirmation:options['privacy-confirmation'],acceptParticipantLoss:options['participant-loss']==='acknowledged'});
    if(options.apply&&result.completed!==true)throw new Error('native_privacy_cleanup_pending');
    // Export/snapshot/UUID/email content is deliberately never sent to logs.
    return {status:options.apply?'PRIVACY_JOB_FINISHED':'PRIVACY_PLAN_VALIDATED',proof:'RUNNER_OWNED_DISPOSABLE'};
  }
  if(['freeze','unfreeze'].includes(job)) {
    if(!/^\d{1,15}$/.test(options.revision??''))throw new Error('native_freeze_revision_required');
    if(!options.apply)return {mode:'PLAN',job,revision:options.revision};
    return {job,revision:(await client.query('SELECT app.set_release_freeze($1::boolean,$2::bigint) AS revision',[job==='freeze',options.revision])).rows[0]?.revision};
  }
  if(job==='inspect')return {state:(await client.query('SELECT app.native_ops_state() AS state')).rows[0]?.state};
  if(!options.apply)return {mode:'PLAN',jobs:['asset-intents-and-failed-cleanup','stale-temporary','limiter-expiry'],batch:500};
  const root=storageRoot(options.storage);
  await safeDirectory(root);
  if(!(await client.query('SELECT pg_try_advisory_lock(207403,2) AS locked')).rows[0]?.locked)throw new Error('native_maintenance_busy');
  try {
    const state=(await client.query('SELECT app.native_ops_state() AS state')).rows[0]?.state;
    if(state?.frozen!==false)throw new Error('native_maintenance_frozen');
    const assets=await cleanupNativeAssets(client,root);
    const directory=await safeDirectory(join(root,'temporary-uploads'));
    const candidates=[];let scanned=0;
    const cursor=Number(options.cursor??0);
    if(!Number.isInteger(cursor)||cursor<0||cursor>10000)throw new Error('native_cursor_invalid');
    let visited=0,complete=true;
    // Numeric scan cursor is best-effort under directory mutation. Cycle to zero
    // after the end; deletion is always revalidated against durable DB intent.
    for await(const entry of await opendir(directory)) {
      if(visited++<cursor)continue;
      if(scanned===500){complete=false;break;}scanned++;
      if(!/^[a-f0-9-]{36}\.tmp$/.test(entry.name) || !entry.isFile() || entry.isSymbolicLink())continue;
      const info=await lstat(join(directory,entry.name));
      if(info.mtimeMs<Date.now()-3600000)candidates.push(entry.name.slice(0,-4));
    }
    const stale=candidates.length?(await client.query('SELECT * FROM app.native_ops_stale_temporary($1::uuid[]) AS id',[candidates])).rows:[];
    let temporary=0;
    for(const row of stale){await removeTemporary(root,row.id);temporary++;}
    const limiter=(await client.query('SELECT private_rate_limit.cleanup_v1(500) AS removed')).rows[0]?.removed;
    return {assets,temporary,limiter,scanned,nextCursor:complete?0:Math.min(10000,cursor+scanned)};
  } finally {await client.query('SELECT pg_advisory_unlock(207403,2)');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const options=parseOperatorArgs(process.argv.slice(2),['--storage','--cursor','--job','--revision','--container-id',
      '--run-name','--local-endpoint','--user','--email','--privacy-confirmation','--participant-loss']);
    console.log(JSON.stringify(options.connect?await withOperator(process.env,(c,e,t)=>runMaintenance(c,e,t,options)):
      {mode:'OFFLINE',jobs:['asset-intents','failed-cleanup','stale-temporary','limiter-expiry'],privacy:'explicit disposable privacy job; no automatic account erasure'}));
  } catch {console.error('native_maintenance_command_failed');process.exitCode=1;}
}
