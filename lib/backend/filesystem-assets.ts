import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '../auth/current-user';
import { withAuthenticatedTransaction, withReadTransaction,withTransactionExternalWork } from './transaction';
import { assetKeyPattern, storageRoot, validateAndStage, publishAsset, readAsset, removeAsset } from './filesystem-core.mjs';

export async function nativeAssetUrl(key:string):Promise<string> {
  if(!assetKeyPattern.test(key))throw new Error('asset_unavailable');
  const data=await withReadTransaction(async tx=>(await tx.query('SELECT app.native_asset_delivery($1::text) AS result',[key])).rows[0]?.result);
  if(!data)throw new Error('asset_unavailable');
  return `/api/backend/assets?key=${encodeURIComponent(key)}`;
}
export async function deliverNativeAsset(key:string) {
  if(!assetKeyPattern.test(key))throw new Error('asset_unavailable');
  // Keep the authorized DB snapshot through the bounded file read.
  return withReadTransaction(async tx=>{
    const data=(await tx.query('SELECT app.native_asset_delivery($1::text) AS result',[key])).rows[0]?.result;
    if(!data)throw new Error('asset_unavailable');
    return {bytes:await readAsset(storageRoot(),key,Number(data.size)),mime:String(data.mime)};
  });
}
export async function replaceNativeAsset(kind:'avatar'|'banner',file:File|null) {
  const user=await getCurrentUser();if(!user)throw new Error('authentication_required');
  const root=storageRoot(),id=randomUUID();
  let key:string|null=null, size=0, mime='';
  if(file) {
    const limit=kind==='avatar'?5*1024*1024:10*1024*1024;
    if(file.size<12 || file.size>limit || !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('invalid_image');
    mime=file.type;
    const ext=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
    key=`${user.id}/${kind}/${id}.${ext}`;
    // Intent committed before any file creation; crashes are discoverable by maintenance.
    await withAuthenticatedTransaction(async tx=>{
      if(tx.userId!==user.id)throw new Error('owner_context_changed');
      await tx.query('SELECT app.assert_account_write_allowed()');
      await tx.query("INSERT INTO app.native_asset_objects(id,user_id,kind,file_key,state,mime) VALUES($1::uuid,$2::uuid,$3,$4,'staging',$5)",[id,tx.userId,kind,key,mime]);
    });
  }
  let old:string|null=null;
  await withAuthenticatedTransaction(async tx=>{
    if(tx.userId!==user.id)throw new Error('owner_context_changed');
    // SHARE admission lock stays held over publication and reference commit.
    await tx.query('SELECT app.assert_account_write_allowed()');
    const column=kind==='avatar'?'avatar_path':'banner_path';
    const row=(await tx.query(`SELECT ${column} FROM app.profiles WHERE id=$1::uuid AND deleted_at IS NULL FOR UPDATE`,[tx.userId])).rows[0];
    if(!row)throw new Error('social_profile_required');
    old=row[column]??null;
    if(file && key) {
      await withTransactionExternalWork(tx,async()=>{
        const staged=await validateAndStage(root,id,kind,Buffer.from(await file.arrayBuffer()),mime);
        size=staged.size;
        // An expired transaction cannot publish a file after its admission lock is released.
        await tx.query('SELECT 1');
        await publishAsset(root,staged.path,key!);
      });
      await tx.query("UPDATE app.native_asset_objects SET state='published',size=$1 WHERE id=$2::uuid AND user_id=$3::uuid",[size,id,tx.userId]);
    }
    await tx.query(`UPDATE app.profiles SET ${column}=$1 WHERE id=$2::uuid`,[key,tx.userId]);
    if(old)await tx.query("UPDATE app.native_asset_objects SET state='cleanup' WHERE file_key=$1 AND user_id=$2::uuid",[old,tx.userId]);
  });
  let cleanupPending=Boolean(old);
  if(old) {
    try {
      // Cleanup intent remains durable even if account locking interrupts acknowledgement.
      await removeAsset(root,old);
      cleanupPending=false;
    } catch { /* durable cleanup state is retained */ }
  }
  return {ok:true,url:key?await nativeAssetUrl(key):undefined,cleanupPending};
}
