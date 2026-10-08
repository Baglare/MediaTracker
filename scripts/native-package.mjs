import { cp, mkdir, readFile, writeFile, lstat, opendir, readdir, readlink } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname, sep } from 'node:path';
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
    || /(?:^|\/)(?:tsconfig\.tsbuildinfo|\.DS_Store|npm-debug\.log)$/.test(path)
    || /(?:^|[\\/])(?:fixtures?|private|coverage|\.ai|\.claude|\.knowledge-compiler|\.npm|\.pnpm-store|\.vscode)(?:[\\/]|$)/i.test(path)
    || /\.(?:sql|dump|bak|zip|tar|gz|7z|tsbuildinfo|pem|key)$/i.test(path);
}
const sha = data => createHash('sha256').update(data).digest('hex');
// Diagnostics use fixed vocabulary and validated lock-owned npm identities;
// never paths, arbitrary filenames, messages, stacks or env.
const failureStages = new WeakMap();
const dependencyFailures = new WeakMap();
const approvedErrors = new Set([
  'deployment_native_build_required', 'deployment_destination_invalid',
  'deployment_build_provider_mismatch', 'deployment_trace_link_unsafe',
  'deployment_trace_link_dangling', 'deployment_trace_link_chain_unsafe',
  'deployment_trace_dependency_untrusted',
  'deployment_artifact_unsafe', 'deployment_required_file_missing',
  'deployment_runtime_incomplete', 'deployment_native_library_missing',
  'deployment_migration_state_stale', 'deployment_artifact_checksum_mismatch',
  'deployment_package_arguments_invalid', 'deployment_git_failed', 'storage_path_unsafe',
]);
const filesystemErrors = new Set(['ENOENT','EEXIST','EACCES','EPERM','ENOTDIR','EISDIR','ELOOP','ENOSPC','EINVAL','ENAMETOOLONG']);
const copyErrors = new Set(['ERR_FS_CP_EINVAL','ERR_FS_CP_DIR_TO_NON_DIR','ERR_FS_CP_NON_DIR_TO_DIR',
  'ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY','ERR_FS_CP_FIFO_PIPE','ERR_FS_CP_SOCKET','ERR_FS_CP_UNKNOWN']);
function inside(root,path) {
  const name=relative(root,path);
  return name!== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name);
}
// Only the installed production lock graph and its traced standalone copy are
// trusted. Validate every hop, including symlinks in parent directories, before
// fs.cp dereferences it; realpath alone hides unsafe intermediate hops.
export async function dependencyCopyFilter(cwd,standalone) {
  const roots=[join(standalone,'node_modules'),join(cwd,'node_modules')];
  // Turbopack also emits hashed dependency aliases under compiled .next.
  // These are permitted link origins, never additional trusted target roots.
  const traceModules=join(standalone,'.next','node_modules');
  const sourceRoots=[...roots,traceModules];
  await safeDirectory(roots[1]);
  const lock=JSON.parse(await readFile(join(cwd,'package-lock.json'),'utf8'));
  const packages=Object.entries(lock.packages??{}).filter(([name])=>name.startsWith('node_modules/'));
  const packageNames=new Set(packages.map(([name])=>name));
  const ownerKey=path=>{
    const root=roots.find(root=>inside(root,path));
    if(!root)return null;
    const key=`node_modules/${relative(root,path).replaceAll('\\','/')}`;
    return packages.filter(([pkg])=>key===pkg||key.startsWith(pkg+'/'))
      .sort(([a],[b])=>b.length-a.length)[0]?.[0]??null;
  };
  const identity=path=>{
    const key=ownerKey(path);
    if(!key)return null;
    const name=lock.packages[key].name??key.split('node_modules/').at(-1);
    return approvedPackageIdentity(name)?name:null;
  };
  function reject(path,reason) {
    const error=new Error('deployment_trace_dependency_untrusted');
    dependencyFailures.set(error,{identity:identity(path),key:ownerKey(path),path,reason});
    throw error;
  }
  // Reviewed Next 16.3.8 trace residue: root semver 6 is dev-only and
  // contributes only package metadata; Sharp 0.35.5 resolves its own runtime
  // semver 7. Keep this omission exact and fail closed on version/layout drift.
  // No dev package file is accepted, including a newly added runtime sibling.
  const rootSemver=lock.packages?.['node_modules/semver'];
  const sharpSemver=lock.packages?.['node_modules/sharp/node_modules/semver'];
  const reached=productionLockGraph(lock);
  const metadataRoot=join(standalone,'node_modules','semver');
  const metadataFile=join(metadataRoot,'package.json');
  const reviewedMetadata=lock.packages?.['node_modules/next']?.version==='16.3.8'
    &&lock.packages?.['node_modules/sharp']?.version==='0.35.5'
    &&rootSemver?.dev===true&&rootSemver.version==='6.3.1'&&rootSemver.link!==true
    &&sharpSemver?.dev!==true&&sharpSemver?.link!==true&&sharpSemver?.version==='7.8.5'
    &&!reached.has('node_modules/semver')&&reached.has('node_modules/sharp/node_modules/semver');
  async function metadataOnly() {
    if(!reviewedMetadata)return false;
    const directory=await lstat(metadataRoot).catch(()=>null);
    if(!directory?.isDirectory()||directory.isSymbolicLink())return false;
    await safeDirectory(metadataRoot);
    const children=await readdir(metadataRoot);
    if(children.length!==1||children[0]!=='package.json')return false;
    if(!(await lstat(metadataFile)).isFile())return false;
    const metadata=JSON.parse(await readFile(metadataFile,'utf8'));
    return metadata.name==='semver'&&metadata.version===rootSemver.version;
  }
  function trusted(path,allowRoot=false) {
    const root=roots.find(root=>inside(root,path));
    if(!root&&allowRoot&&inside(traceModules,path)) {
      if(forbiddenArtifactPath(relative(standalone,path).replaceAll('\\','/')))throw new Error('deployment_trace_link_unsafe');
      return traceModules;
    }
    if(!root)throw new Error('deployment_trace_link_unsafe');
    const name=relative(root,path).replaceAll('\\','/');
    if(forbiddenArtifactPath(name))throw new Error('deployment_trace_link_unsafe');
    if(!name && allowRoot)return root;
    const key=`node_modules/${name}`;
    const parts=key.split('/'),index=parts.lastIndexOf('node_modules');
    const owner=parts.slice(0,index+(parts[index+1]?.startsWith('@')?3:2)).join('/');
    const owners=packages.filter(([pkg])=>key===pkg||key.startsWith(pkg+'/'));
    const container=parts.length===index+1 || (parts.length===index+2&&parts[index+1].startsWith('@'));
    // node_modules and @scope directories are traversal containers, not
    // packages. Their ancestors still require production lock ownership; each
    // child is checked independently at its exact installed (possibly nested) key.
    if(owners.some(([,entry])=>entry.link===true))reject(path,'linked_package');
    if(owners.some(([,entry])=>entry.dev===true))reject(path,'development_package');
    if(container&&(allowRoot||owners.length)) {
      if(!packages.some(([pkg])=>pkg.startsWith(key+'/')))reject(path,'unlisted_container');
    } else if(!packageNames.has(owner))reject(path,'unlisted_package');
    return root;
  }
  async function inspect(path,seen=new Set()) {
    const root=trusted(path,true),parts=relative(root,path).split(sep).filter(Boolean);
    let current=root;
    for(let i=0;i<parts.length;i++) {
      current=join(current,parts[i]);
      let info;
      try {info=await lstat(current);} catch(error) {
        if(error.code==='ENOENT'||error.code==='ENOTDIR')throw new Error('deployment_trace_link_dangling');
        throw error;
      }
      if(info.isSymbolicLink()) {
        if(seen.has(current)||seen.size>=40)throw new Error('deployment_trace_link_chain_unsafe');
        seen.add(current);
        const link=await readlink(current);
        // Check raw components too: normalization must not hide private paths.
        if(forbiddenArtifactPath(link))throw new Error('deployment_trace_link_unsafe');
        if(!isAbsolute(link)) {
          let hop=dirname(current),descended=false;
          for(const part of link.split(/[\\/]/)) {
            // Resolving name/.. lexically can hide a symlink at name. Permit
            // leading parent traversal only, within the verified workspace.
            // Generated .next aliases can cross its build directories on the
            // way to node_modules; the final target still requires trusted().
            if(part==='..'&&descended)throw new Error('deployment_trace_link_unsafe');
            if(part&&part!=='.'&&part!=='..')descended=true;
            hop=resolve(hop,part||'.');
            if(!inside(cwd,hop))throw new Error('deployment_trace_link_unsafe');
          }
        } else if(link.split(/[\\/]/).includes('..'))throw new Error('deployment_trace_link_unsafe');
        const target=resolve(dirname(current),link);
        trusted(target);
        const resolved=await inspect(target,seen);
        return inspect(join(resolved,...parts.slice(i+1)),seen);
      }
      if(!info.isDirectory() && !(i===parts.length-1&&info.isFile()))
        throw new Error('deployment_trace_link_unsafe');
    }
    trusted(current,true);
    return current;
  }
  const filter=async path=>{
    if((path===metadataRoot||path===metadataFile)&&await metadataOnly()) {
      // Traverse the ordinary directory so any new file still gets checked.
      return path===metadataRoot;
    }
    const name=relative(standalone,path).replaceAll('\\','/');
    if(inside(standalone,path)) {
      if(name && !['.next','node_modules','server.js','package.json'].includes(name.split('/')[0]))return false;
      if(forbiddenArtifactPath(name))return false;
    }
    if(sourceRoots.some(root=>inside(root,path))) {
      // A scoped namespace is a container, not a package. Its children still
      // require lock-graph membership, and the namespace itself cannot be a link.
      const root=sourceRoots.find(root=>inside(root,path));
      const dep=relative(root,path);
      if(!dep||/^@[a-z0-9._-]+$/i.test(dep)) {
        if(!(await lstat(path)).isDirectory())throw new Error('deployment_trace_link_unsafe');
        return true;
      }
      await inspect(path);
    } else {
      const info=await lstat(path);
      if(info.isSymbolicLink()||(!info.isDirectory()&&!info.isFile()))throw new Error('deployment_trace_link_unsafe');
    }
    return true;
  };
  filter.inspect=inspect;
  filter.identity=identity;
  filter.ownerKey=ownerKey;
  filter.omission=path=>path===metadataFile?{identity:'semver',reason:'reviewed_development_metadata'}:null;
  return filter;
}

function approvedPackageIdentity(name) {
  return typeof name==='string' && name.length<=214
    && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name);
}
// npm resolution is location based: prefer a consumer's nested installation,
// then walk ancestor node_modules. Aliases retain their installed lock key.
function productionLockGraph(lock) {
  const entries=lock.packages??{},reached=new Set(),pending=[''];
  function dependency(consumer,name) {
    let location=consumer;
    while(true) {
      const candidate=`${location?location+'/':''}node_modules/${name}`;
      if(entries[candidate])return candidate;
      if(!location)return null;
      const index=location.lastIndexOf('node_modules/');
      location=index>0?location.slice(0,index-1):'';
    }
  }
  while(pending.length) {
    const key=pending.pop(),entry=entries[key];
    if(!entry||reached.has(key))continue;
    reached.add(key);
    // Optional peers can be installed by dev tooling. They are not proof of
    // production need merely because an installed lock entry exists.
    const peers=Object.fromEntries(Object.entries(entry.peerDependencies??{})
      .filter(([name])=>entry.peerDependenciesMeta?.[name]?.optional!==true));
    for(const name of Object.keys({...entry.dependencies,...entry.optionalDependencies,...peers})) {
      if(!approvedPackageIdentity(name))continue;
      const target=dependency(key,name);
      if(target)pending.push(target);
    }
  }
  return reached;
}
// Read-only audit: never logs file names, paths, environment, link text or
// arbitrary errors. Output is capped; scanning continues after that cap.
export async function preflightDependencies(cwd=process.cwd()) {
  const standalone=join(cwd,'.next','standalone');
  await safeDirectory(standalone);
  const filter=await dependencyCopyFilter(cwd,standalone);
  const lock=JSON.parse(await readFile(join(cwd,'package-lock.json'),'utf8'));
  const reached=productionLockGraph(lock),traced=new Set();
  let manifests=0,traceErrors=0,visited=0,rejected=0,excluded=0,unsafeLinksNotFollowed=0;
  const groups=new Map(),omissions=new Map(),limit=80;
  function record(path,error,reason) {
    rejected++;
    const detail=dependencyFailures.get(error),key=detail?detail.key:filter.ownerKey(path);
    const identity=detail?detail.identity:filter.identity(path);
    const category=reason??detail?.reason??packageFailureDiagnostic(error).category;
    const productionGraph=key!==null&&reached.has(key);
    const groupKey=JSON.stringify([identity,category,productionGraph]);
    if(!groups.has(groupKey))groups.set(groupKey,{identity,reason:category,count:0,
      tracedFiles:0,productionGraph});
    const group=groups.get(groupKey);group.count++;
    if(traced.has(path)||traced.has(detail?.path))group.tracedFiles++;
  }
  async function traceFile(path) {
    try {
      const data=JSON.parse(await readFile(path,'utf8'));
      if(!Array.isArray(data.files)||!data.files.every(file=>typeof file==='string'))throw new SyntaxError();
      manifests++;
      for(const file of data.files) {
        const source=resolve(dirname(path),file);
        if(inside(cwd,source)) {
          traced.add(source);
          traced.add(join(standalone,relative(cwd,source)));
        }
      }
    } catch {traceErrors++;}
  }
  async function traces(directory) {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      const path=join(directory,entry.name);
      if(entry.isDirectory())await traces(path);
      else if(entry.isFile()&&entry.name.endsWith('.nft.json'))await traceFile(path);
      else if(entry.isSymbolicLink())traceErrors++;
    }
  }
  // Only build manifests: do not enter standalone, caches or arbitrary repo dirs.
  for(const entry of await readdir(join(cwd,'.next'),{withFileTypes:true})) {
    const path=join(cwd,'.next',entry.name);
    if(entry.name==='server'&&entry.isDirectory())await traces(path);
    else if(entry.isFile()&&entry.name.endsWith('.nft.json'))await traceFile(path);
    else if(entry.isSymbolicLink()&&(entry.name==='server'||entry.name.endsWith('.nft.json')))traceErrors++;
  }
  async function walk(path,ancestors=new Set()) {
    visited++;
    let accepted=true,resolved=path,info;
    try {
      accepted=await filter(path);
      info=await lstat(path);
      if(info.isSymbolicLink())resolved=await filter.inspect(path);
    } catch(error) {
      record(path,error);
      // Rejected ordinary containers must not hide other rejected classes.
      // Never follow a rejected symlink or a symlink in a parent directory.
      info=await lstat(path).catch(()=>null);
      if(info?.isSymbolicLink())unsafeLinksNotFollowed++;
      if(!info?.isDirectory()||info.isSymbolicLink())return;
    }
    if(!accepted){
      excluded++;const omission=filter.omission(path);
      if(omission)omissions.set(omission.identity,{...omission,traced:traced.has(path)});
      return;
    }
    if(ancestors.has(resolved)){record(path,null,'deployment_trace_link_chain_unsafe');return;}
    if((await lstat(resolved)).isDirectory()) {
      const next=new Set(ancestors);next.add(resolved);
      for(const entry of await readdir(resolved,{withFileTypes:true}))await walk(join(resolved,entry.name),next);
    }
  }
  await walk(standalone);
  const rows=[...groups.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {event:'deployment_dependency_preflight',status:rejected||traceErrors?'REJECTED':'PASS',
    entireTreeAudited:unsafeLinksNotFollowed===0,unsafeLinksNotFollowed,visited,rejected,excluded,traceManifests:manifests,
    traceStatus:traceErrors?'INVALID':manifests?'AVAILABLE':'MISSING',traceErrors,
    rejectedClasses:rows.length,truncated:rows.length>limit,rejections:rows.slice(0,limit),
    omissions:[...omissions.values()]};
}
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
  const dependencyFilter=await dependencyCopyFilter(cwd,standalone);
  await cp(standalone,root,{recursive:true,dereference:true,filter:dependencyFilter});
  // NFT can trace sharp.node while missing its dynamically loaded libvips DLL/SO.
  // Copy only installed sharp native optional packages, never bulk node_modules.
  stage='sharp_dependencies';
  for(const name of (await readdir(join(cwd,'node_modules','@img'))).filter(name=>/^sharp-(?:libvips-)?[a-z0-9-]+$/.test(name))) {
    await cp(join(cwd,'node_modules','@img',name),join(root,'node_modules','@img',name),{recursive:true,dereference:true,filter:dependencyFilter});
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
    if(!((process.argv.length===3&&process.argv[2]==='preflight')
      ||(process.argv.length===4&&['create','verify'].includes(process.argv[2]))))throw new Error('deployment_package_arguments_invalid');
    const result=process.argv[2]==='preflight'?await preflightDependencies()
      :process.argv[2]==='create'?await packageNative(process.argv[3]):await verifyNativePackage(process.argv[3]);
    if(result.status==='REJECTED')process.exitCode=1;
    console.log(JSON.stringify({...result,directory:undefined},null,2));
  } catch(error) {
    const diagnostic=packageFailureDiagnostic(error);
    // A failed create on CI still reports every discoverable class without
    // altering the workflow, accepting anything, or changing the failure code.
    if(process.argv[2]==='create'&&diagnostic.category.startsWith('deployment_trace_')) {
      try {diagnostic.dependencyPreflight=await preflightDependencies();}
      catch {diagnostic.preflightStatus='UNAVAILABLE';}
    }
    console.error(JSON.stringify(diagnostic));process.exitCode=1;
  }
}
