import { afterEach,beforeEach,expect,it } from 'vitest';
import { mkdtemp,rm,writeFile,mkdir,symlink,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve,relative } from 'node:path';
import sharp from 'sharp';
import { assetPath,storageRoot,validateAndStage,publishAsset,readAsset,removeAsset,safeDirectory,removeTemporary } from '@/lib/backend/filesystem-core.mjs';
let root:string;
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'mt-native-assets-'));});
afterEach(async()=>{
  const parent=resolve(tmpdir()),target=resolve(root),rel=relative(parent,target);
  if(!rel || rel.startsWith('..') || !rel.startsWith('mt-native-assets-'))throw new Error('unsafe_test_cleanup');
  await rm(target,{recursive:true,force:true});
});
async function image(format:'jpeg'|'png'|'webp',width=8,height=8) {
  return sharp({create:{width,height,channels:3,background:'#abcdef'}}).toFormat(format).toBuffer();
}
it.each([['jpeg','image/jpeg','jpg'],['png','image/png','png'],['webp','image/webp','webp']] as const)('validates, normalizes and safely serves real %s bytes',async(format,mime,extension)=>{
  const bytes=await image(format),key=`${owner}/avatar/${id}.${extension}`;
  const staged=await validateAndStage(root,id,'avatar',bytes,mime);expect(staged.extension).toBe(extension);
  await publishAsset(root,staged.path,key);
  const actual=await readAsset(root,key,staged.size);expect((await sharp(actual).metadata()).format).toBe(format);
  await removeAsset(root,key);await removeAsset(root,key);
});
it('rejects MIME spoofing and removes an incomplete staging file',async()=>{
  await expect(validateAndStage(root,id,'avatar',await image('png'),'image/jpeg')).rejects.toThrow();
  expect(await readdir(join(root,'temporary-uploads'))).toEqual([]);
});
it('rejects invalid bytes, HTML and SVG regardless of declared image type',async()=>{
  for(const value of ['this is not an image','<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>','<html>synthetic</html>'])await expect(validateAndStage(root,id,'avatar',Buffer.from(value),'image/png')).rejects.toThrow();
});
it('rejects oversized avatar input and unsupported formats before disk work',async()=>{
  await expect(validateAndStage(root,id,'avatar',Buffer.alloc(5*1024*1024+1),'image/png')).rejects.toThrow('invalid_image');
  await expect(validateAndStage(root,id,'banner',Buffer.alloc(16),'image/gif')).rejects.toThrow('invalid_image');
});
it('rejects unbounded dimensions',async()=>{
  await expect(validateAndStage(root,id,'banner',await image('png',8193,1),'image/png')).rejects.toThrow('invalid_image');
});
it.each(['../avatar/x.png',`${owner}/../${id}.png`,`${owner}/avatar/${id}.svg`,`${owner}\\avatar\\${id}.png`,`${owner}/avatar/%2e%2e.png`])('denies traversal or unsafe key %s',async key=>{
  await expect(assetPath(root,key,true)).rejects.toThrow('storage_path_unsafe');
});
it('rejects roots inside replaceable or public application directories',()=>{
  for(const value of ['relative',resolve('public','data'),resolve('.next','data'),resolve('dist','data'),process.cwd()])expect(()=>storageRoot(value)).toThrow('storage_configuration_invalid');
});
it('rejects symlink/junction directories before asset publication',async()=>{
  const target=join(root,'external');await mkdir(target);
  await symlink(target,join(root,'users'),process.platform==='win32'?'junction':'dir');
  await expect(assetPath(root,`${owner}/avatar/${id}.png`,true)).rejects.toThrow('storage_path_unsafe');
});
it('prevents exclusive publication from overwriting an existing asset',async()=>{
  const key=`${owner}/avatar/${id}.png`,staged=await validateAndStage(root,id,'avatar',await image('png'),'image/png');
  const path=await assetPath(root,key,true);await writeFile(path,'old synthetic asset');
  await expect(publishAsset(root,staged.path,key)).rejects.toThrow();
  expect((await readAsset(root,key,19)).toString()).toBe('old synthetic asset');
});
it('fails safely when the storage directory cannot be created',async()=>{
  const blocked=join(root,'blocked');await writeFile(blocked,'synthetic disk obstruction');
  await expect(validateAndStage(blocked,id,'avatar',await image('png'),'image/png')).rejects.toThrow();
});
it('detects corrupt/truncated files before delivery',async()=>{
  const key=`${owner}/avatar/${id}.png`,path=await assetPath(root,key,true);await writeFile(path,'short');
  await expect(readAsset(root,key,10)).rejects.toThrow('storage_path_unsafe');
});
it('never follows an asset symlink during read or cleanup',async()=>{
  const key=`${owner}/avatar/${id}.png`,path=await assetPath(root,key,true),outside=join(root,'target');
  if(process.platform==='win32')await mkdir(outside);else await writeFile(outside,'target');
  await symlink(outside,path,process.platform==='win32'?'junction':'file');
  await expect(readAsset(root,key,6)).rejects.toThrow('storage_path_unsafe');await expect(removeAsset(root,key)).rejects.toThrow('storage_path_unsafe');
});
it('temporary cleanup remains idempotent after an interrupted publication',async()=>{
  await safeDirectory(join(root,'temporary-uploads'),true);await writeFile(join(root,'temporary-uploads',`${id}.tmp`),'synthetic');
  await removeTemporary(root,id);await removeTemporary(root,id);expect(await readdir(join(root,'temporary-uploads'))).toEqual([]);
});
