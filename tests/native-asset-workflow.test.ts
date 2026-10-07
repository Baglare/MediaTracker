import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({query:vi.fn(),release:vi.fn(),stage:vi.fn(),publish:vi.fn(),remove:vi.fn(),events:[] as string[]}));
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',old=`${owner}/avatar/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`;
vi.mock('@/lib/auth/current-user',()=>({getCurrentUser:async()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})}));
vi.mock('@/lib/backend/postgres',()=>({getNativePool:()=>({connect:async()=>({query:m.query,release:m.release})})}));
vi.mock('@/lib/backend/filesystem-core.mjs',()=>({
  storageRoot:()=>'/persistent-test',assetKeyPattern:/^[a-f0-9-]{36}\/(avatar|banner)\/[a-f0-9-]{36}\.png$/,
  validateAndStage:m.stage,publishAsset:m.publish,removeAsset:m.remove,readAsset:vi.fn(),
}));
import { replaceNativeAsset } from '@/lib/backend/filesystem-assets';
beforeEach(()=>{
  vi.resetAllMocks();m.events.length=0;
  vi.stubEnv('RATE_LIMIT_SUBJECT_CURRENT_KEY','');
  m.query.mockImplementation(async(sql:string)=>{
    m.events.push(sql);
    if(sql.startsWith('SELECT avatar_path'))return {rows:[{avatar_path:old}]};
    if(sql.includes('native_asset_delivery'))return {rows:[{result:{size:16,mime:'image/png'}}]};
    return {rows:[]};
  });
  m.stage.mockImplementation(async()=>{m.events.push('stage');return {path:'/persistent-test/temporary-uploads/test.tmp',size:16};});
  m.publish.mockImplementation(async()=>{m.events.push('publish');});
  m.remove.mockImplementation(async()=>{m.events.push('remove-old');});
});
afterEach(()=>vi.unstubAllEnvs());
const file=()=>new File([new Uint8Array(16)],'untrusted-path.png',{type:'image/png'});
it('commits a discoverable intent before file IO and replaces the reference before removing the old file',async()=>{
  const result=await replaceNativeAsset('avatar',file());
  const intent=m.events.findIndex(s=>s.startsWith('INSERT INTO app.native_asset_objects'));
  const reference=m.events.findIndex(s=>s.startsWith('UPDATE app.profiles'));
  expect(m.events.indexOf('COMMIT')).toBeGreaterThan(intent);
  expect(m.events.indexOf('stage')).toBeGreaterThan(m.events.indexOf('COMMIT'));
  expect(m.events.indexOf('publish')).toBeLessThan(reference);
  const referenceCommit=m.events.findIndex((s,i)=>i>reference && s==='COMMIT');
  expect(referenceCommit).toBeGreaterThan(reference);
  expect(referenceCommit).toBeLessThan(m.events.indexOf('remove-old'));
  expect(result.cleanupPending).toBe(false);
});
it('retains the old asset when reference commit fails after publication; the committed staging intent survives',async()=>{
  const normal=m.query.getMockImplementation()!;
  m.query.mockImplementation(async(sql:string,...args:unknown[])=>{
    if(sql.startsWith('UPDATE app.profiles'))throw new Error('synthetic_db_failure');
    return normal(sql,...args);
  });
  await expect(replaceNativeAsset('avatar',file())).rejects.toThrow('database_operation_failed');
  expect(m.publish).toHaveBeenCalledOnce();expect(m.remove).not.toHaveBeenCalled();
  expect(m.events).toContain('ROLLBACK');expect(m.events.filter(s=>s==='COMMIT')).toHaveLength(1);
});
it('keeps cleanup durably pending when deletion fails after the new reference commits',async()=>{
  m.remove.mockRejectedValue(new Error('synthetic_disk_failure'));
  expect((await replaceNativeAsset('avatar',file())).cleanupPending).toBe(true);
  expect(m.events.some(s=>s.includes("SET state='cleanup'"))).toBe(true);
  expect(m.events.filter(s=>s==='COMMIT')).toHaveLength(3);
});
it('does not change the old reference or delete it when bounded file staging fails',async()=>{
  m.stage.mockRejectedValue(new Error('synthetic_disk_full'));
  await expect(replaceNativeAsset('avatar',file())).rejects.toThrow('database_operation_failed');
  expect(m.publish).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
  expect(m.events.some(s=>s.startsWith('UPDATE app.profiles'))).toBe(false);
  expect(m.events).toContain('ROLLBACK');
});
