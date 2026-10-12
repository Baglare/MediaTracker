// Offline graph by default. Linux dependency packaging only; no app build, DB or npm scripts.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const sourceSha='f853f95acac6dde3abe3880df8d26de517354645';
export const roots=['better-auth','pg','sharp'];
const assert=(ok,code)=>{if(!ok)throw new Error(code);};
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function resolvePackage(lock,parent,name) {
  assert(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name),'dependency_name_invalid');
  for(let dir=parent;;dir=path.posix.dirname(dir)) {
    if(path.posix.basename(dir)!=='node_modules') {
      const key=dir==='.'||!dir?`node_modules/${name}`:`${dir}/node_modules/${name}`;
      if(lock.packages[key])return key;
    }
    if(dir==='.'||!dir)break;
  }
  throw new Error('locked_dependency_missing');
}
function matches(values,target) {
  if(!values)return true;
  return !values.includes(`!${target}`) && (!values.some(value=>!value.startsWith('!'))||values.includes(target));
}
export function runtimeGraph(lock,{os='linux',cpu='x64',libc='glibc'}={}) {
  assert(lock.lockfileVersion===3 && lock.packages,'lockfile_invalid');
  const selected=new Map();
  function visit(key) {
    if(selected.has(key))return;
    const entry=lock.packages[key];
    assert(entry && !entry.link && entry.version && entry.integrity,'locked_package_invalid');
    assert(matches(entry.os,os)&&matches(entry.cpu,cpu)&&matches(entry.libc,libc),'dependency_platform_mismatch');
    const url=new URL(entry.resolved);
    assert(url.protocol==='https:'&&url.hostname==='registry.npmjs.org'&&!url.username&&!url.password&&!url.search&&!url.hash,'dependency_registry_invalid');
    selected.set(key,entry);
    for(const name of Object.keys(entry.dependencies??{}))visit(resolvePackage(lock,key,name));
    for(const name of Object.keys(entry.optionalDependencies??{})) {
      const optional=resolvePackage(lock,key,name),item=lock.packages[optional];
      if(matches(item.os,os)&&matches(item.cpu,cpu)&&matches(item.libc,libc))visit(optional);
    }
    for(const name of Object.keys(entry.peerDependencies??{})) {
      // Optional frameworks/database adapters are not needed by this operator.
      if(!entry.peerDependenciesMeta?.[name]?.optional)visit(resolvePackage(lock,key,name));
    }
  }
  for(const name of roots)visit(resolvePackage(lock,'',name));
  assert(selected.get('node_modules/better-auth').version==='1.7.7','better_auth_version_mismatch');
  return [...selected].sort(([a],[b])=>a.localeCompare(b)).map(([location,entry])=>({location,...entry}));
}
export function verifyIntegrity(buffer,integrity) {
  assert(/^sha512-[A-Za-z0-9+/]+=*$/.test(integrity),'dependency_integrity_invalid');
  assert(createHash('sha512').update(buffer).digest('base64')===integrity.slice(7),'dependency_integrity_mismatch');
}
function files(root,relative='') {
  const result=[];
  for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const name=path.posix.join(relative,entry.name);
    assert(!entry.isSymbolicLink(),'dependency_symlink_denied');
    if(entry.isDirectory())result.push(...files(root,name));
    else {assert(entry.isFile(),'dependency_special_file_denied');result.push(name);}
  }
  return result;
}
const smoke=`import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {hashPassword,verifyPassword} from 'better-auth/crypto';
import pg from 'pg';
import sharp from 'sharp';
const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'DEPENDENCIES.json')));
assert.equal(process.platform,manifest.platform.os);assert.equal(process.arch,manifest.platform.cpu);
assert.equal(process.versions.node.split('.')[0],'24');
assert(process.report.getReport().header.glibcVersionRuntime,'glibc required');
function walk(dir,prefix='') {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    assert(!entry.isSymbolicLink(),'symlink denied');
    const relative=path.posix.join(prefix,entry.name);
    if(entry.isDirectory())return walk(path.join(dir,entry.name),relative);
    assert(entry.isFile(),'special file denied');return [relative];
  });
}
const expected=new Set();
for(const line of fs.readFileSync(path.join(root,'FILES.sha256'),'utf8').trim().split('\\n')) {
  const match=line.match(/^([a-f0-9]{64})  (.+)$/);assert(match,'invalid file checksum');
  const relative=match[2];assert(!path.posix.isAbsolute(relative)&&!relative.includes('\\\\')&&!relative.split('/').includes('..'));
  assert(!expected.has(relative));expected.add(relative);
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex'),match[1],'file checksum mismatch');
}
assert.deepEqual(walk(root).filter(file=>file!=='FILES.sha256').sort(),[...expected].sort());
for(const item of manifest.packages)assert.equal(JSON.parse(fs.readFileSync(path.join(root,item.location,'package.json'))).version,item.version);
assert.equal(manifest.sourceSha,'${sourceSha}');
assert.equal(manifest.packages.find(item=>item.location==='node_modules/better-auth').version,'1.7.7');
assert.equal(typeof pg.Client,'function');
const password=randomBytes(32).toString('base64url'),hash=await hashPassword(password);
assert(await verifyPassword({password,hash}));assert.equal(await verifyPassword({password:randomBytes(32).toString('base64url'),hash}),false);
assert.notEqual(await hashPassword(password),hash);
await sharp({create:{width:1,height:1,channels:3,background:'#abcdef'}}).png().toBuffer();
console.log('PASS: file integrity, Better Auth 1.7.7 hash/verify, pg import, Linux sharp');
`;
export async function build(lockText,destination,cache) {
  assert(process.platform==='linux'&&process.arch==='x64'&&process.versions.node.split('.')[0]==='24'
    &&process.report.getReport().header.glibcVersionRuntime,'linux_x64_glibc_node24_required');
  destination=path.resolve(destination);cache=path.resolve(cache);
  assert(!fs.existsSync(destination),'dependency_destination_exists');
  process.umask(0o077);
  const graph=runtimeGraph(JSON.parse(lockText));
  fs.mkdirSync(destination,{recursive:true});fs.mkdirSync(cache,{recursive:true});
  const queue=[...graph];
  async function worker() {
    while(queue.length) {
      const entry=queue.shift();
      const cached=path.join(cache,sha256(entry.integrity)+'.tgz');
      let bytes;
      if(fs.existsSync(cached)){bytes=fs.readFileSync(cached);verifyIntegrity(bytes,entry.integrity);}
      else {
        const response=await fetch(entry.resolved,{redirect:'error',signal:AbortSignal.timeout(60000)});
        assert(response.ok,'dependency_download_failed');
        bytes=Buffer.from(await response.arrayBuffer());verifyIntegrity(bytes,entry.integrity);fs.writeFileSync(cached,bytes);
      }
      const names=execFileSync('tar',['-tzf',cached],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n');
      assert(names.every(name=>name.startsWith('package/')&&!name.includes('\\')&&!name.split('/').some(part=>part==='..')),'dependency_tar_path_invalid');
      const types=execFileSync('tar',['-tvzf',cached],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n');
      assert(types.every(line=>line.startsWith('-')||line.startsWith('d')),'dependency_tar_link_or_special_file');
      const directory=path.join(destination,entry.location);fs.mkdirSync(directory,{recursive:true});
      execFileSync('tar',['--no-same-owner','--no-same-permissions','-xzf',cached,'--strip-components=1','-C',directory]);
      assert(JSON.parse(fs.readFileSync(path.join(directory,'package.json'))).version===entry.version,'package_version_mismatch');
    }
  }
  await Promise.all(Array.from({length:4},worker));
  const manifest={schemaVersion:1,sourceSha,sourceLockSha256:sha256(lockText),platform:{os:'linux',cpu:'x64',libc:'glibc',nodeMajor:24},
    roots,packages:graph.map(({location,version,resolved,integrity})=>({location,version,resolved,integrity}))};
  fs.writeFileSync(path.join(destination,'DEPENDENCIES.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(destination,'SOURCE-PACKAGE-LOCK.json'),lockText);
  fs.writeFileSync(path.join(destination,'VERIFY-DEPENDENCIES.mjs'),smoke);
  const sums=files(destination).map(name=>`${sha256(fs.readFileSync(path.join(destination,name)))}  ${name}`).join('\n')+'\n';
  fs.writeFileSync(path.join(destination,'FILES.sha256'),sums);
  execFileSync(process.execPath,[path.join(destination,'VERIFY-DEPENDENCIES.mjs')],{stdio:'inherit'});
  const archive=destination+'.tar.gz';
  assert(!fs.existsSync(archive),'dependency_archive_exists');
  // Fixed order/timestamps/ownership; gzip carries no timestamp or source filename.
  const tar=execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','--format=gnu','-cf','-','-C',destination,'.'],{maxBuffer:128*1024*1024});
  const compressed=execFileSync('gzip',['-n','-9'],{input:tar,maxBuffer:128*1024*1024});
  fs.writeFileSync(archive,compressed);
  fs.writeFileSync(archive+'.sha256',`${sha256(compressed)}  ${path.basename(archive)}\n`);
  return {archive,sha256:sha256(compressed),packageCount:graph.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  assert(args.length===0||args.join(' ')==='--plan'||(args.length===3&&args[0]==='--build-linux'),'dependency_arguments_invalid');
  // Read exact immutable source lock, not a resolved/new npm graph or local node_modules.
  const lockText=execFileSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/')}`,'-C',repo,'show',`${sourceSha}:package-lock.json`],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(args[0]==='--build-linux')console.log(JSON.stringify(await build(lockText,args[1],args[2]),null,2));
  else console.log(JSON.stringify({sourceSha,platform:'linux-x64-glibc',packages:runtimeGraph(JSON.parse(lockText)).map(({location,version})=>({location,version})),mutation:'NOT_PERFORMED'},null,2));
}
