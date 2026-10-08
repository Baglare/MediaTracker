import { cp, mkdir, readFile, writeFile, lstat, opendir, realpath, readdir } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { safeDirectory } from '../lib/backend/filesystem-core.mjs';
export function forbiddenArtifactPath(path) {
  return path.split(/[\\/]/).some(part=>/^\.env(?:\.|$)/.test(part)
    || ['.git','.codex','.vercel','backups','backup','tests','__tests__','.cache'].includes(part.toLowerCase()))
    || /^\.next\/(?:cache|dev|diagnostics)(?:\/|$)/.test(path.replaceAll('\\','/'))
    || /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)
    || /(?:^|\/)(?:tsconfig\.tsbuildinfo|\.DS_Store|npm-debug\.log)$/.test(path);
}
const sha = data => createHash('sha256').update(data).digest('hex');
// Diagnostic fields are fixed vocabulary, never paths, messages, stacks or env.
const failureStages = new WeakMap();
const approvedErrors = new Set([
  'deployment_native_build_required', 'deployment_destination_invalid',
  'deployment_build_provider_mismatch', 'deployment_trace_link_unsafe',
  'deployment_artifact_unsafe', 'deployment_required_file_missing',
  'deployment_runtime_incomplete', 'deployment_native_library_missing',
  'deployment_migration_state_stale', 'deployment_artifact_checksum_mismatch',
  'deployment_package_arguments_invalid', 'deployment_git_failed', 'storage_path_unsafe',
]);
const filesystemErrors = new Set(['ENOENT','EEXIST','EACCES','EPERM','ENOTDIR','EISDIR','ELOOP','ENOSPC','EINVAL','ENAMETOOLONG']);
const copyErrors = new Set(['ERR_FS_CP_EINVAL','ERR_FS_CP_DIR_TO_NON_DIR','ERR_FS_CP_NON_DIR_TO_DIR',
  'ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY','ERR_FS_CP_FIFO_PIPE','ERR_FS_CP_SOCKET','ERR_FS_CP_UNKNOWN']);
export function packageFailureDiagnostic(error) {
  const category = approvedErrors.has(error?.message) ? error.message
    : filesystemErrors.has(error?.code) ? `filesystem_${error.code.toLowerCase()}`
    : copyErrors.has(error?.code) ? error.code.toLowerCase()
    : error instanceof SyntaxError ? 'invalid_json' : 'unexpected_error';
  return { event: 'deployment_package_failed', stage: failureStages.get(error)
    ?? (category==='deployment_package_arguments_invalid'?'arguments':'unknown'), category };
}
async function inventory(root) {
  const entries=[];
  async function walk(directory) {
    for await(const entry of await opendir(directory)) {
      const path=join(directory,entry.name),name=relative(root,path).replaceAll('\\','/');
      if(entry.isSymbolicLink()||forbiddenArtifactPath(name))throw new Error('deployment_artifact_unsafe');
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile())entries.push({path:name,size:(await lstat(path)).size,checksum:sha(await readFile(path))});
      else throw new Error('deployment_artifact_unsafe');
    }
  }
  await walk(root);return entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function git(...args) {
  // execFileSync otherwise forwards Git stderr, which can contain full paths.
  try {return execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}
  catch {throw new Error('deployment_git_failed');}
}
export async function packageNative(destination) {
  let stage='build_policy';
  try {
  if(process.env.BACKEND_PROVIDER!=='native')throw new Error('deployment_native_build_required');
  stage='destination_validation';
  const cwd=process.cwd(),root=resolve(destination);
  const rel=relative(cwd,root);
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||!rel.replaceAll('\\','/').startsWith('dist/'))throw new Error('deployment_destination_invalid');
  const standalone=join(cwd,'.next','standalone');
  stage='standalone_directory';
  await safeDirectory(standalone);
  stage='static_directory';
  await safeDirectory(join(cwd,'.next','static'));
  stage='standalone_server';
  const server=await readFile(join(standalone,'server.js'),'utf8');
  if(!server.includes('"NEXT_PUBLIC_BACKEND_PROVIDER":"native"'))throw new Error('deployment_build_provider_mismatch');
  stage='destination_create';
  await mkdir(join(cwd,'dist'),{recursive:true});await safeDirectory(join(cwd,'dist'));
  await mkdir(root,{recursive:false}); // Existing output is never overwritten/deleted.
  stage='standalone_copy';
  await cp(standalone,root,{recursive:true,dereference:true,filter:async path=>{
    const name=relative(standalone,path).replaceAll('\\','/');
    // Generated server consumes compiled .next + traced modules. Annotation
    // filesystem traces also copy source/docs/ops; they are never deployment input.
    if(name && !['.next','node_modules','server.js','package.json'].includes(name.split('/')[0]))return false;
    if(forbiddenArtifactPath(name))return false;
    if((await lstat(path)).isSymbolicLink()) {
      const destination=await realpath(path),rel=relative(join(cwd,'node_modules'),destination);
      if(rel.startsWith('..')||isAbsolute(rel)||!(await lstat(destination)).isDirectory())throw new Error('deployment_trace_link_unsafe');
    }
    return true;
  }});
  // NFT can trace sharp.node while missing its dynamically loaded libvips DLL/SO.
  // Copy only installed sharp native optional packages, never bulk node_modules.
  stage='sharp_dependencies';
  for(const name of (await readdir(join(cwd,'node_modules','@img'))).filter(name=>/^sharp-(?:libvips-)?[a-z0-9-]+$/.test(name))) {
    await cp(join(cwd,'node_modules','@img',name),join(root,'node_modules','@img',name),{recursive:true,dereference:true});
  }
  stage='static_copy';
  await cp(join(cwd,'.next','static'),join(root,'.next','static'),{recursive:true});
  stage='public_copy';
  await cp(join(cwd,'public'),join(root,'public'),{recursive:true,filter:path=>!forbiddenArtifactPath(relative(join(cwd,'public'),path))});
  stage='passenger_copy';
  await cp(join(cwd,'scripts','passenger-start.cjs'),join(root,'app.cjs'));
  stage='package_inventory';
  const entries=await inventory(root),names=new Set(entries.map(e=>e.path));
  stage='runtime_requirements';
  for(const file of ['server.js','app.cjs','.next/BUILD_ID','node_modules/next/package.json','node_modules/pg/package.json','node_modules/sharp/package.json'])
    if(!names.has(file))throw new Error('deployment_required_file_missing');
  if(!entries.some(e=>e.path.startsWith('.next/static/')) || !entries.some(e=>e.path.startsWith('.next/server/'))
    || !entries.some(e=>/sharp.*\.node$/.test(e.path)))throw new Error('deployment_runtime_incomplete');
  if(process.platform==='win32'&&!entries.some(e=>/libvips.*\.dll$/.test(e.path)))throw new Error('deployment_native_library_missing');
  stage='migration_state';
  const runtimeState=JSON.parse(await readFile(join(cwd,'lib','backend','native-migration-state.json'),'utf8'));
  stage='migration_manifest';
  const migrations=nativeMigrationManifest().map(({name,checksum})=>({name,checksum}));
  if(JSON.stringify(runtimeState)!==JSON.stringify(migrations))throw new Error('deployment_migration_state_stale');
  // Fingerprint tracked and new non-ignored source, never local env/build/backups.
  stage='source_listing';
  const paths=git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean).sort();
  const source=createHash('sha256');
  stage='source_fingerprint';
  for(const path of paths) {if(forbiddenArtifactPath(path))continue;source.update(path+'\0');source.update(await readFile(path));source.update('\0');}
  stage='git_identity';
  const sourceGitSha=git('rev-parse','HEAD'),branch=git('branch','--show-current'),dirtyWorktree=!!git('status','--porcelain');
  stage='build_metadata';
  const manifest={format:'MediaTrackerDeploymentV1',sourceGitSha,branch,
    dirtyWorktree,sourceTreeFingerprint:source.digest('hex'),backendProvider:'native',
    nodeTarget:'24.x',nextVersion:JSON.parse(await readFile(join(cwd,'node_modules/next/package.json'),'utf8')).version,
    buildPlatform:process.platform,buildArchitecture:process.arch,
    buildLibc:process.platform==='linux'?(process.report.getReport().header.glibcVersionRuntime??'musl-or-unknown'):null,
    portability:'Native binaries require the same OS/architecture/libc. Linux hosting requires a Linux build.',
    lockfileChecksum:sha(await readFile(join(cwd,'package-lock.json'))),migrations,migrationFingerprint:sha(JSON.stringify(migrations)),
    artifactChecksum:sha(JSON.stringify(entries)),buildTimestamp:(await lstat(join(cwd,'.next/BUILD_ID'))).mtime.toISOString(),files:entries};
  manifest.manifestFingerprint=sha(JSON.stringify(manifest));
  stage='manifest_write';
  await writeFile(join(root,'deployment-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  stage='deployment_note_write';
  await writeFile(join(root,'DEPLOYMENT.txt'),`MediaTracker native standalone\nSHA ${manifest.sourceGitSha}\nBranch ${manifest.branch}\nDirty ${manifest.dirtyWorktree}\nSource ${manifest.sourceTreeFingerprint}\nArtifact ${manifest.artifactChecksum}\nNode ${manifest.nodeTarget}; Next ${manifest.nextVersion}\nPlatform ${manifest.buildPlatform}/${manifest.buildArchitecture}\n${manifest.portability}\nStart: node app.cjs\nPersistent state must be outside this release directory.\n`,{flag:'wx'});
  return {...manifest,files:entries.length,bytes:entries.reduce((sum,e)=>sum+e.size,0),directory:root};
  } catch(error) { if(error instanceof Error)failureStages.set(error,stage);throw error; }
}
export async function verifyNativePackage(root) {
  let stage='verification_directory';
  try {
  await safeDirectory(resolve(root));
  stage='verification_manifest';
  const manifest=JSON.parse(await readFile(join(root,'deployment-manifest.json'),'utf8'));
  stage='verification_inventory';
  const entries=(await inventory(root)).filter(e=>!['deployment-manifest.json','DEPLOYMENT.txt'].includes(e.path));
  stage='verification_integrity';
  if(manifest.format!=='MediaTrackerDeploymentV1'||manifest.backendProvider!=='native'
    ||sha(JSON.stringify({...manifest,manifestFingerprint:undefined}))!==manifest.manifestFingerprint
    ||sha(JSON.stringify(entries))!==manifest.artifactChecksum||JSON.stringify(entries)!==JSON.stringify(manifest.files))throw new Error('deployment_artifact_checksum_mismatch');
  return {status:'VERIFIED',files:entries.length,checksum:manifest.artifactChecksum,platform:manifest.buildPlatform};
  } catch(error) { if(error instanceof Error)failureStages.set(error,stage);throw error; }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==4||!['create','verify'].includes(process.argv[2]))throw new Error('deployment_package_arguments_invalid');
    const result=process.argv[2]==='create'?await packageNative(process.argv[3]):await verifyNativePackage(process.argv[3]);
    console.log(JSON.stringify({...result,directory:undefined},null,2));
  } catch(error) {console.error(JSON.stringify(packageFailureDiagnostic(error)));process.exitCode=1;}
}
