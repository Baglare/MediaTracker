// AES-256-GCM, compatible with the existing MTDR1 ops envelope, streamed per file.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile, mkdir, open, lstat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { keyBytes } from './ops/recovery.mjs';
import { verifyBackup, fileDigest, validateBackupManifest } from './native-recovery.mjs';
import { safeDirectory } from '../lib/backend/filesystem-core.mjs';
import { digest } from './native-ops-target.mjs';
export async function recoveryKey(path) {
  const info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size!==32 || (process.platform!=='win32'&&(info.mode&0o077)))throw new Error('native_recovery_key_invalid');
  return keyBytes((await readFile(path)).toString('hex'));
}
async function outputDirectory(input,output) {
  if(!isAbsolute(output))throw new Error('native_recovery_path_invalid');
  const a=relative(resolve(input),resolve(output)),b=relative(resolve(output),resolve(input));
  if(!a||!b||(!a.startsWith('..')&&!isAbsolute(a))||(!b.startsWith('..')&&!isAbsolute(b)))throw new Error('native_recovery_path_invalid');
  const repo=relative(process.cwd(),resolve(output));
  if(!repo||(!repo.startsWith('..')&&!isAbsolute(repo)))throw new Error('native_recovery_path_invalid');
  await safeDirectory(dirname(output));await mkdir(output,{mode:0o700});
}
async function cryptFile(input,output,key,decrypt=false) {
  const info=await lstat(input);
  if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024*1024+33)throw new Error('native_recovery_file_invalid');
  await safeDirectory(dirname(output),true);
  if(!decrypt) {
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    await writeFile(output,Buffer.concat([Buffer.from('MTDR1'),iv]),{flag:'wx',mode:0o600});
    await pipeline(createReadStream(input),cipher,createWriteStream(output,{flags:'a',mode:0o600}));
    await writeFile(output,cipher.getAuthTag(),{flag:'a'});
  } else {
    if(info.size<33)throw new Error('native_recovery_envelope_invalid');
    const handle=await open(input,'r');const header=Buffer.alloc(17),tag=Buffer.alloc(16);
    try {await handle.read(header,0,17,0);await handle.read(tag,0,16,info.size-16);}finally{await handle.close();}
    if(header.subarray(0,5).toString()!=='MTDR1')throw new Error('native_recovery_envelope_invalid');
    const cipher=createDecipheriv('aes-256-gcm',key,header.subarray(5));cipher.setAuthTag(tag);
    await pipeline(info.size===33?Readable.from([]):createReadStream(input,{start:17,end:info.size-17}),cipher,createWriteStream(output,{flags:'wx',mode:0o600}));
  }
}
export async function sealBackup(input,output,key) {
  const manifest=await verifyBackup(input);await outputDirectory(input,output);
  const files=[];
  for(const file of [...manifest.files,{path:'manifest.json'}]) {
    const name=file.path+'.aes';await cryptFile(join(input,file.path),join(output,name),key);
    files.push({path:name,...await fileDigest(join(output,name))});
  }
  const envelope={format:'MediaTrackerNativeSealedV1',encryption:'AES-256-GCM',backupFingerprint:manifest.fingerprint,files};
  envelope.fingerprint=digest(envelope);
  await writeFile(join(output,'sealed.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx',mode:0o600});
  // Plaintext is retained privately until independently verified off-host recovery.
  return {status:'SEALED',fingerprint:envelope.fingerprint,offHost:'NOT_RUN'};
}
export async function unsealBackup(input,output,key,expected) {
  await safeDirectory(input);
  const info=await lstat(join(input,'sealed.json'));
  if(!info.isFile()||info.isSymbolicLink()||info.size>4*1024*1024)throw new Error('native_recovery_envelope_invalid');
  const envelope=JSON.parse(await readFile(join(input,'sealed.json'),'utf8'));
  if(envelope.format!=='MediaTrackerNativeSealedV1'||envelope.encryption!=='AES-256-GCM'||envelope.fingerprint!==expected
    ||digest({...envelope,fingerprint:undefined})!==expected||!Array.isArray(envelope.files)||envelope.files.length>10002)throw new Error('native_recovery_envelope_invalid');
  // Authenticate the manifest first, then reuse the existing strict path allowlist.
  const manifestFile=envelope.files.find(f=>f.path==='manifest.json.aes');
  if(!manifestFile || (await fileDigest(join(input,manifestFile.path))).checksum!==manifestFile.checksum)throw new Error('native_backup_content_mismatch');
  await outputDirectory(input,output);
  await cryptFile(join(input,'manifest.json.aes'),join(output,'manifest.json'),key,true);
  const manifest=validateBackupManifest(JSON.parse(await readFile(join(output,'manifest.json'),'utf8')));
  if(manifest.fingerprint!==envelope.backupFingerprint || envelope.files.length!==manifest.files.length+1)throw new Error('native_backup_content_mismatch');
  for(const file of manifest.files) {
    const name=file.path+'.aes',encrypted=envelope.files.filter(f=>f.path===name);
    if(encrypted.length!==1 || JSON.stringify(await fileDigest(join(input,name)))!==JSON.stringify({size:encrypted[0].size,checksum:encrypted[0].checksum}))throw new Error('native_backup_content_mismatch');
    await cryptFile(join(input,name),join(output,file.path),key,true);
  }
  await verifyBackup(output);return {status:'UNSEALED_VERIFIED',fingerprint:manifest.fingerprint};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [command,input,output,expected]=process.argv.slice(2);
    if(!['seal','unseal'].includes(command)||!input||!output||process.argv.length>(command==='seal'?5:6))throw new Error('native_recovery_command_invalid');
    const key=await recoveryKey(process.env.NATIVE_RECOVERY_KEY_FILE);
    console.log(JSON.stringify(command==='seal'?await sealBackup(resolve(input),resolve(output),key):await unsealBackup(resolve(input),resolve(output),key,expected)));
  }catch{console.error('native_recovery_seal_failed');process.exitCode=1;}
}
