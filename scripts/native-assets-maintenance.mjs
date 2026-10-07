// Explicit offline operator job. Credentials are not imported by normal application runtime.
import { removeAsset, removeTemporary, storageRoot } from '../lib/backend/filesystem-core.mjs';
export async function cleanupNativeAssets(client,root,user=null) {
  const result=await client.query('SELECT * FROM app.native_asset_cleanup_candidates($1::uuid)',[user]);
  const outcome={removed:0,pending:0};
  for(const row of result.rows) {
    try {
      await removeAsset(root,row.file_key);
      await removeTemporary(root,row.id);
      await client.query('SELECT app.native_asset_cleanup_complete($1::uuid)',[row.id]);
      outcome.removed++;
    } catch {outcome.pending++;}
  }
  return outcome;
}
// The privacy runner supplies its proven operator connection. This module has
// no default database URL, remote discovery, timer or daemon.
export function nativeMaintenanceRoot(env) {return storageRoot(env.NATIVE_STORAGE_ROOT);}
