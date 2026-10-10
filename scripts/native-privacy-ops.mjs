// Operator-scoped job adapter; no default URL, discovery, CLI credentials or web import.
import { authorizeTarget, assertHostedOperatorClient } from './native-ops-target.mjs';
import { nativeRoles } from '../lib/backend/native-roles.mjs';
import { readdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assertUser, runErasure, accountExport } from './privacy-account-model.mjs';
import { cleanupNativeAssets } from './native-assets-maintenance.mjs';
import { safeDirectory, storageRoot } from '../lib/backend/filesystem-core.mjs';
import { assertNativeDisposableClient } from './native-disposable-capability.mjs';

export async function verifyNativeFilesystemAbsent(root,user) {
  assertUser(user);
  const path=join(root,'users',user);
  try {await safeDirectory(path);}catch(error){if(error.code==='ENOENT')return;throw error;}
  // No recursive delete: only known empty kind directories can be removed.
  for(const entry of await readdir(path,{withFileTypes:true})) {
    if(!['avatar','banner'].includes(entry.name) || !entry.isDirectory() || entry.isSymbolicLink())throw new Error('privacy_storage_residual');
    const kind=join(path,entry.name);await safeDirectory(kind);
    if((await readdir(kind)).length)throw new Error('privacy_storage_residual');
    await rmdir(kind);
  }
  if((await readdir(path)).length)throw new Error('privacy_storage_residual');
  await rmdir(path);
}
export function nativePrivacyAdapter(client,root,user,roles = nativeRoles()) {
  assertUser(user);
  // Runtime credentials fail before any target mutation.
  const admitted=async()=>{
    const row=(await client.query("SELECT session_user AS login,pg_has_role(session_user,$1::text,'USAGE') AS operator",[roles.privacy_operator])).rows[0];
    if(!row?.operator || row.login===roles.runtime)throw new Error('privacy_ops_denied');
  };
  const query=async(sql,values=[])=>{await admitted();return client.query(sql,values);};
  return {
    environment:roles.profile==='hosting-production'?'production':'disposable',
    async inspect(){return (await query('SELECT app.native_privacy_inspect($1::uuid) AS result',[user])).rows[0].result;},
    async transition(id,state){if(id!==user)throw new Error('privacy_target_changed');await query('SELECT app.transition_account($1::uuid,$2,$3)',[user,state,`PRIVACY ${user}`]);},
    async assertLocked(id){if(id!==user)throw new Error('privacy_target_changed');const snapshot=await this.inspect();if(snapshot.auth.length && !['ERASURE_PENDING','ERASING'].includes(snapshot.lifecycle?.[user]))throw new Error('privacy_lock_missing');},
    async cleanupApplication(id){if(id!==user)throw new Error('privacy_target_changed');await query('SELECT app.native_privacy_cleanup($1::uuid)',[user]);},
    async removeAssets(id){if(id!==user)throw new Error('privacy_target_changed');await admitted();
      for(let batch=0;batch<100;batch++) {
        const result=await cleanupNativeAssets(client,root,user);
        if(result.pending)throw new Error('privacy_storage_cleanup_pending');
        if(!result.removed)return;
      }
      throw new Error('privacy_storage_capacity');
    },
    async verifyAssets(id){if(id!==user)throw new Error('privacy_target_changed');await verifyNativeFilesystemAbsent(root,user);await query('SELECT app.native_privacy_filesystem_verified($1::uuid)',[user]);},
    async deleteAuth(id){if(id!==user)throw new Error('privacy_target_changed');await query('SELECT app.native_privacy_finish($1::uuid,$2)',[user,`ERASE ACCOUNT ${user}`]);},
    async recordStage(id,stage,status){if(id!==user)throw new Error('privacy_target_changed');await query('SELECT app.native_privacy_record_stage($1::uuid,$2,$3)',[user,stage,status==='PASS']);},
  };
}
/** Local jobs require the runner-owned disposable capability. Hosted jobs
 * require the exact client/config/target bound by withOperator, plus confirmations. */
export async function runNativePrivacyJob({hostingConfig,hostingTarget,operatorConfirmation,roles = nativeRoles(),client,disposableProof,storage,user,email,execute=false,confirmation,acceptParticipantLoss=false}) {
  if(roles.hosted) {
    if(hostingConfig?.roles?.profile!==roles.profile || hostingConfig.kind!=='privacy_login')throw new Error('privacy_ops_denied');
    assertHostedOperatorClient(client,hostingConfig,hostingTarget);
    authorizeTarget(hostingTarget,hostingConfig,{operation:'MAINTAIN',apply:execute,confirmation:operatorConfirmation,operator:true});
  } else assertNativeDisposableClient(client,disposableProof);
  const root=storageRoot(storage),adapter=nativePrivacyAdapter(client,root,user,roles);
  if(!execute)return {export:accountExport(await adapter.inspect(),user,email,new Date().toISOString()),erasure:await runErasure(adapter,user)};
  return runErasure(adapter,user,{execute,confirmation,acceptParticipantLoss});
}
