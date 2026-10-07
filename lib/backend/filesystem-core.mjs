// Shared server/operator filesystem boundary. No web-server static mount.
import { constants } from 'node:fs';
import { lstat, mkdir, realpath, open, unlink, link } from 'node:fs/promises';
import { isAbsolute, resolve, relative, sep, parse, join } from 'node:path';
import sharp from 'sharp';
// Constrained per-process decoder footprint; upload work also holds a bounded pg slot.
sharp.concurrency(1);
sharp.cache({memory:16,files:0,items:16});
export const assetKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(avatar|banner)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
export function storageRoot(value = process.env.NATIVE_STORAGE_ROOT, cwd = process.cwd()) {
  if (!value || !isAbsolute(value)) throw new Error('storage_configuration_invalid');
  const root = resolve(value);
  const outside=path=>path==='..'||path.startsWith(`..${sep}`)||isAbsolute(path);
  if (root === parse(root).root || root.split(/[\\/]/).some(s => ['.next','public','dist','build','out','.git','.codex'].includes(s.toLowerCase()))
    || !outside(relative(resolve(cwd),root)) || !outside(relative(root,resolve(cwd)))) throw new Error('storage_configuration_invalid');
  return root;
}
function contains(root,path) { const rel=relative(root,path);return rel!=='' && !rel.startsWith(`..${sep}`) && rel!=='..' && !isAbsolute(rel); }
async function syncDirectory(path) {
  // Windows does not support opening directories for fsync; hosted Linux does.
  if(process.platform==='win32')return;
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {await handle.sync();} finally {await handle.close();}
}
export async function safeDirectory(path,create=false) {
  const absolute=resolve(path),base=parse(absolute).root;
  let current=base;
  for(const part of absolute.slice(base.length).split(sep).filter(Boolean)) {
    current=join(current,part);
    if(create)await mkdir(current,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const info=await lstat(current);
    if(!info.isDirectory() || info.isSymbolicLink() || resolve(await realpath(current))!==current)throw new Error('storage_path_unsafe');
  }
  return absolute;
}
export async function assetPath(root,key,create=false) {
  if(!assetKeyPattern.test(key))throw new Error('storage_path_unsafe');
  const path=resolve(root,'users',...key.split('/'));
  if(!contains(root,path))throw new Error('storage_path_unsafe');
  await safeDirectory(join(path,'..'),create);
  return path;
}
export async function validateAndStage(root,id,kind,bytes,mime) {
  if(!/^[0-9a-f-]{36}$/.test(id) || !['avatar','banner'].includes(kind))throw new Error('storage_path_unsafe');
  const limit=kind==='avatar'?5*1024*1024:10*1024*1024;
  if(!Buffer.isBuffer(bytes) || bytes.length<12 || bytes.length>limit)throw new Error('invalid_image');
  const formats={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'};
  if(!formats[mime])throw new Error('invalid_image');
  await safeDirectory(root,true);
  const dir=await safeDirectory(join(root,'temporary-uploads'),true),path=join(dir,`${id}.tmp`);
  const handle=await open(path,'wx',0o600);
  await handle.close();
  try {
    const image=sharp(bytes,{limitInputPixels:16_777_216,failOn:'warning',sequentialRead:true});
    const metadata=await image.metadata();
    if(metadata.format!==formats[mime] || !metadata.width || !metadata.height || metadata.width>8192 || metadata.height>8192
      || metadata.width*metadata.height>16_777_216 || (metadata.pages??1)!==1)throw new Error('invalid_image');
    // Decode and re-encode: no client EXIF/SVG/polyglot/trailing payload is published.
    await image.rotate().toFormat(formats[mime]).toFile(path);
    const stat=await lstat(path);
    if(!stat.isFile() || stat.isSymbolicLink() || stat.size>limit)throw new Error('invalid_image');
    const file=await open(path,constants.O_RDWR | (constants.O_NOFOLLOW??0));
    try {await file.sync();} finally {await file.close();}
    return {path,size:stat.size,mime,extension:mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp'};
  } catch(error) {await unlink(path).catch(()=>{});throw error;}
}
export async function publishAsset(root,temporary,key) {
  const dir=await safeDirectory(join(root,'temporary-uploads'));
  if(!contains(dir,temporary) || join(dir,temporary.split(/[\\/]/).at(-1))!==temporary)throw new Error('storage_path_unsafe');
  const info=await lstat(temporary);
  if(!info.isFile() || info.isSymbolicLink())throw new Error('storage_path_unsafe');
  const path=await assetPath(root,key,true);
  // Atomic, exclusive link: no overwrite of an existing filename. Same persistent volume.
  await link(temporary,path);
  await syncDirectory(join(path,'..'));
  await unlink(temporary);
  await syncDirectory(dir);
}
export async function readAsset(root,key,expectedSize) {
  if(!Number.isSafeInteger(expectedSize) || expectedSize<1 || expectedSize>10*1024*1024)throw new Error('storage_path_unsafe');
  const path=await assetPath(root,key);
  const before=await lstat(path);
  if(!before.isFile() || before.isSymbolicLink() || before.size!==expectedSize || resolve(await realpath(path))!==path)throw new Error('storage_path_unsafe');
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {
    const after=await file.stat();
    if(after.ino!==before.ino || after.dev!==before.dev || after.size!==expectedSize || resolve(await realpath(path))!==path)throw new Error('storage_path_unsafe');
    // Never allocate/read beyond the authorized metadata size, even if a file grows.
    const bytes=Buffer.alloc(expectedSize);let offset=0;
    while(offset<expectedSize) {
      const part=await file.read(bytes,offset,expectedSize-offset,offset);
      if(!part.bytesRead)throw new Error('storage_path_unsafe');
      offset+=part.bytesRead;
    }
    const extra=await file.read(Buffer.alloc(1),0,1,expectedSize);
    if(extra.bytesRead || (await file.stat()).size!==expectedSize)throw new Error('storage_path_unsafe');
    return bytes;
  } finally {await file.close();}
}
export async function removeAsset(root,key) {
  let path;
  try {path=await assetPath(root,key);} catch(error) {if(error.code==='ENOENT')return;throw error;}
  let info;try{info=await lstat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(!info.isFile() || info.isSymbolicLink() || resolve(await realpath(path))!==path)throw new Error('storage_path_unsafe');
  await unlink(path);
  await syncDirectory(join(path,'..'));
}
export async function removeTemporary(root,id) {
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('storage_path_unsafe');
  let dir;try{dir=await safeDirectory(join(root,'temporary-uploads'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  const path=join(dir,`${id}.tmp`);
  let info;try{info=await lstat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(!info.isFile() || info.isSymbolicLink())throw new Error('storage_path_unsafe');
  await unlink(path);
  await syncDirectory(dir);
}
