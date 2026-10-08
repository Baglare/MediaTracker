import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, cp, lstat, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { checkArtifactFile, parseElfEvidence } from './native-artifact-check.mjs';
import { verifyNativePackage, packageFailureDiagnostic, dependencyCopyFilter, preflightDependencies } from './native-package.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';

const packageCli = fileURLToPath(new URL('./native-package.mjs', import.meta.url));
async function packageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'mt-package-diagnostic-'));
  const put = async (path, contents) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  };
  for (const [path, contents] of Object.entries({
    '.next/standalone/server.js': 'const config={"NEXT_PUBLIC_BACKEND_PROVIDER":"native"};',
    '.next/standalone/package.json': '{}',
    '.next/standalone/.next/BUILD_ID': 'synthetic',
    '.next/standalone/.next/server/compiled.js': 'synthetic',
    '.next/standalone/node_modules/next/package.json': '{}',
    '.next/standalone/node_modules/pg/package.json': '{}',
    '.next/standalone/node_modules/sharp/package.json': '{}',
    'package-lock.json': JSON.stringify({lockfileVersion:3,packages:Object.fromEntries(
      ['next','pg','sharp','@img/sharp-synthetic','runtime','alias','unsafe','dev'].map(name=>[
        `node_modules/${name}`,{version:'1.0.0',...(name==='dev'?{dev:true}:{})}]))}),
    'node_modules/@img/sharp-synthetic/sharp.node': 'synthetic',
    'node_modules/@img/sharp-synthetic/libvips.dll': 'synthetic',
    '.next/static/chunk.js': 'synthetic',
    'public/icon.txt': 'synthetic',
    'scripts/passenger-start.cjs': 'synthetic',
    'lib/backend/native-migration-state.json': JSON.stringify(nativeMigrationManifest().map(({ name, checksum }) => ({ name, checksum }))),
  })) await put(path, contents);
  return { root, put };
}

async function copyDependencies(fixture) {
  const standalone=join(fixture.root,'.next/standalone'),output=join(fixture.root,'copied');
  const filter=await dependencyCopyFilter(fixture.root,standalone);
  await cp(standalone,output,{recursive:true,dereference:true,filter});
  return output;
}
async function assertOrdinaryTree(root) {
  for(const entry of await readdir(root,{withFileTypes:true})) {
    const path=join(root,entry.name),info=await lstat(path);
    assert.equal(info.isSymbolicLink(),false);
    if(info.isDirectory())await assertOrdinaryTree(path);
    else assert.equal(info.isFile(),true);
  }
}
test('creates and verifies a synthetic package with dereferenced dependency links',async()=>{
  const checkout=await mkdtemp(join(tmpdir(),'mt-package-checkout-'));
  const repository=fileURLToPath(new URL('..',import.meta.url));
  const git=(...args)=>{
    const result=spawnSync('git',args,{cwd:checkout,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  };
  let fixture;
  try {
    // Borrow existing objects in a disposable local checkout; create no commit
    // and never write to the source checkout or its refs.
    git('clone','--shared','--no-checkout',repository,checkout);
    git('read-tree','--empty');
    fixture=await packageFixture();
    await cp(fixture.root,checkout,{recursive:true});
    await writeFile(join(checkout,'.gitignore'),'.next/\nnode_modules/\ndist/\n');
    await mkdir(join(checkout,'node_modules/next'),{recursive:true});
    await writeFile(join(checkout,'node_modules/next/package.json'),'{"version":"synthetic"}');
    await writeFile(join(checkout,'.next/BUILD_ID'),'synthetic');
    await mkdir(join(checkout,'node_modules/runtime/lib'),{recursive:true});
    await writeFile(join(checkout,'node_modules/runtime/lib/value.js'),'runtime fixture');
    await mkdir(join(checkout,'.next/standalone/node_modules/alias'));
    const base=join(checkout,'.next/standalone/node_modules/alias');
    await symlink(join(checkout,'node_modules/runtime/lib/value.js'),join(base,'file.js'),'file');
    await symlink(join(checkout,'node_modules/runtime/lib'),join(base,'directory'),'dir');
    await symlink('file.js',join(base,'chain.js'),'file');
    await mkdir(join(checkout,'.next/standalone/.next/node_modules'));
    const traceLink=join(checkout,'.next/standalone/.next/node_modules/runtime-hash');
    await symlink(relative(dirname(traceLink),join(checkout,'node_modules/runtime/lib')),traceLink,'dir');
    const created=spawnSync(process.execPath,[packageCli,'create','dist/package'],{
      cwd:checkout,encoding:'utf8',env:{...process.env,BACKEND_PROVIDER:'native'},
    });
    assert.equal(created.status,0,created.stderr);
    const output=join(checkout,'dist/package');
    assert.equal(await readFile(join(output,'node_modules/alias/file.js'),'utf8'),'runtime fixture');
    assert.equal(await readFile(join(output,'node_modules/alias/directory/value.js'),'utf8'),'runtime fixture');
    assert.equal(await readFile(join(output,'node_modules/alias/chain.js'),'utf8'),'runtime fixture');
    assert.equal(await readFile(join(output,'.next/node_modules/runtime-hash/value.js'),'utf8'),'runtime fixture');
    await assertOrdinaryTree(output);
    assert.equal((await verifyNativePackage(output)).status,'VERIFIED');
    const verified=spawnSync(process.execPath,[packageCli,'verify',output],{cwd:checkout,encoding:'utf8'});
    assert.equal(verified.status,0,verified.stderr);
    assert.equal(JSON.parse(verified.stdout).status,'VERIFIED');
  } finally {
    if(fixture)await rm(fixture.root,{recursive:true,force:true});
    await rm(checkout,{recursive:true,force:true});
  }
});
for(const location of ['node_modules','.next/standalone/node_modules']) {
  for(const kind of ['file','dir']) {
    test(`dereferences legitimate ${kind} dependency links in ${location}`,async()=>{
      const fixture=await packageFixture();
      try {
        await fixture.put(`${location}/runtime/lib/value.js`,'runtime fixture');
        await fixture.put('.next/standalone/node_modules/alias/package.json','{}');
        const target=join(fixture.root,location,'runtime',kind==='file'?'lib/value.js':'lib');
        await symlink(target,join(fixture.root,'.next/standalone/node_modules/alias/linked'),kind);
        const output=await copyDependencies(fixture);
        const copied=join(output,'node_modules/alias/linked',...(kind==='dir'?['value.js']:[]));
        assert.equal(await readFile(copied,'utf8'),'runtime fixture');
        await assertOrdinaryTree(output);
      } finally {await rm(fixture.root,{recursive:true,force:true});}
    });
  }
}
for(const [label,target,category] of [
  ['external file','public/icon.txt','deployment_trace_link_unsafe'],
  ['dangling file','node_modules/runtime/missing.js','deployment_trace_link_dangling'],
  ['private target','node_modules/runtime/private/value.js','deployment_trace_link_unsafe'],
  ['env target','node_modules/runtime/.env.local','deployment_trace_link_unsafe'],
  ['test target','node_modules/runtime/value.test.js','deployment_trace_link_unsafe'],
  ['dump target','node_modules/runtime/data.sql','deployment_trace_link_unsafe'],
  ['development target','node_modules/dev/value.js','deployment_trace_dependency_untrusted'],
  ['unlisted target','node_modules/unknown/value.js','deployment_trace_dependency_untrusted'],
]) {
  test(`package creation rejects aliased ${label} with safe diagnostics`,async()=>{
    const fixture=await packageFixture();
    try {
      if(label!=='dangling file')await fixture.put(target,'synthetic private fixture');
      await fixture.put('.next/standalone/node_modules/alias/package.json','{}');
      await symlink(join(fixture.root,target),join(fixture.root,'.next/standalone/node_modules/alias/innocent.js'),'file');
      assert.deepEqual(failedCli(fixture.root,'create','dist/package'),{
        event:'deployment_package_failed',stage:'standalone_copy',category});
    } finally {await rm(fixture.root,{recursive:true,force:true});}
  });
}
for(const [label,alter,category] of [
  ['directory with private descendant',async f=>{
    await f.put('node_modules/runtime/private/value.js','private fixture');
    await symlink(join(f.root,'node_modules/runtime/private/value.js'),join(f.root,'node_modules/runtime/innocent.js'),'file');
    await symlink(join(f.root,'node_modules/runtime'),join(f.root,'.next/standalone/node_modules/alias/linked'),'dir');
  },'deployment_trace_link_unsafe'],
  ['directory with development descendant',async f=>{
    await f.put('node_modules/runtime/node_modules/dev/value.js','dev fixture');
    const lock=JSON.parse(await readFile(join(f.root,'package-lock.json'),'utf8'));
    lock.packages['node_modules/runtime/node_modules/dev']={dev:true};
    await f.put('package-lock.json',JSON.stringify(lock));
    await symlink(join(f.root,'node_modules/runtime'),join(f.root,'.next/standalone/node_modules/alias/linked'),'dir');
  },'deployment_trace_dependency_untrusted'],
  ['escaping intermediate chain',async f=>{
    await f.put('node_modules/runtime/value.js','runtime fixture');
    await symlink(join(f.root,'node_modules/runtime/value.js'),join(f.root,'public/intermediate'),'file');
    await symlink(join(f.root,'public/intermediate'),join(f.root,'.next/standalone/node_modules/alias/linked'),'file');
  },'deployment_trace_link_unsafe'],
  ['cyclic chain',async f=>{
    const base=join(f.root,'.next/standalone/node_modules/alias');
    await symlink('second',join(base,'linked'),'file');
    await symlink('linked',join(base,'second'),'file');
  },'deployment_trace_link_chain_unsafe'],
  ['directory cycle',async f=>{
    await f.put('node_modules/runtime/value.js','runtime fixture');
    await symlink(join(f.root,'node_modules/runtime'),join(f.root,'node_modules/runtime/self'),'dir');
    await symlink(join(f.root,'node_modules/runtime'),join(f.root,'.next/standalone/node_modules/alias/linked'),'dir');
  },'deployment_trace_link_chain_unsafe'],
  ['unsupported FIFO target',async f=>{
    await f.put('node_modules/runtime/package.json','{}');
    const target=join(f.root,'node_modules/runtime/pipe');
    const result=spawnSync('mkfifo',[target],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    await symlink(target,join(f.root,'.next/standalone/node_modules/alias/linked'),'file');
  },'deployment_trace_link_unsafe'],
  ['traversal outside dependency roots',async f=>{
    await symlink('../../../../public/icon.txt',join(f.root,'.next/standalone/node_modules/alias/linked'),'file');
  },'deployment_trace_link_unsafe'],
  ['traversal out and back into a trusted root',async f=>{
    await f.put('node_modules/runtime/value.js','runtime fixture');
    await symlink(join(f.root,'node_modules/runtime/value.js'),join(f.root,'.next/standalone/node_modules/alias/linked'),'file');
    await symlink('../../public/../node_modules/runtime/value.js',join(f.root,'node_modules/runtime/escape'),'file');
    await rm(join(f.root,'.next/standalone/node_modules/alias/linked'));
    await symlink(join(f.root,'node_modules/runtime/escape'),join(f.root,'.next/standalone/node_modules/alias/linked'),'file');
  },'deployment_trace_link_unsafe'],
  ['private traversal normalized away',async f=>{
    await f.put('node_modules/runtime/value.js','runtime fixture');
    await mkdir(join(f.root,'node_modules/runtime/private'));
    await symlink('private/../value.js',join(f.root,'node_modules/runtime/escape'),'file');
    await symlink(join(f.root,'node_modules/runtime/escape'),join(f.root,'.next/standalone/node_modules/alias/linked'),'file');
  },'deployment_trace_link_unsafe'],
  ['symlink parent traversal normalized away',async f=>{
    await f.put('node_modules/runtime/value.js','runtime fixture');
    await symlink(join(f.root,'public'),join(f.root,'node_modules/runtime/escape-directory'),'dir');
    await symlink('escape-directory/../value.js',join(f.root,'node_modules/runtime/escape'),'file');
    await symlink(join(f.root,'node_modules/runtime/escape'),join(f.root,'.next/standalone/node_modules/alias/linked'),'file');
  },'deployment_trace_link_unsafe'],
]) {
  test(`package creation rejects ${label}`,async()=>{
    const fixture=await packageFixture();
    try {
      await fixture.put('.next/standalone/node_modules/alias/package.json','{}');
      await alter(fixture);
      assert.equal(failedCli(fixture.root,'create','dist/package').category,category);
    } finally {await rm(fixture.root,{recursive:true,force:true});}
  });
}

async function nestedFixture() {
  const fixture=await packageFixture();
  const lock=JSON.parse(await readFile(join(fixture.root,'package-lock.json'),'utf8'));
  lock.packages['']={dependencies:{sharp:'1',runtime:'1'}};
  Object.assign(lock.packages,{
    'node_modules/sharp':{version:'1',optional:true,dependencies:{semver:'7', '@scope/addon':'1'}},
    'node_modules/semver':{version:'6',dev:true},
    'node_modules/sharp/node_modules/semver':{version:'7',optional:true},
    'node_modules/sharp/node_modules/@scope/addon':{version:'1',optional:true},
    'node_modules/runtime':{version:'1',dependencies:{renamed:'npm:@scope/real@1',shared:'1'}},
    'node_modules/runtime/node_modules/renamed':{name:'@scope/real',version:'1'},
    'node_modules/shared':{version:'1',devOptional:true},
  });
  await fixture.put('package-lock.json',JSON.stringify(lock));
  for(const name of ['sharp/node_modules/semver','sharp/node_modules/@scope/addon',
    'runtime/node_modules/renamed','shared'])
    await fixture.put(`.next/standalone/node_modules/${name}/package.json`,'{}');
  return fixture;
}

test('nested npm containers, scoped children, aliases, hoisted shared and optional runtime packages copy safely',async()=>{
  const fixture=await nestedFixture();
  try {
    const output=await copyDependencies(fixture);
    for(const name of ['sharp/node_modules/semver','sharp/node_modules/@scope/addon',
      'runtime/node_modules/renamed','shared'])
      assert.equal(await readFile(join(output,'node_modules',name,'package.json'),'utf8'),'{}');
    assert.equal((await preflightDependencies(fixture.root)).rejected,0);
  } finally {await rm(fixture.root,{recursive:true,force:true});}
});

for(const container of ['node_modules','node_modules/@scope']) {
  test(`Turbopack directory alias to a production nested ${container} retains child ownership checks`,async()=>{
    const fixture=await nestedFixture();
    try {
      await fixture.put('node_modules/sharp/node_modules/semver/package.json','{}');
      await fixture.put('node_modules/sharp/node_modules/@scope/addon/package.json','{}');
      await mkdir(join(fixture.root,'.next/standalone/.next/node_modules'));
      const link=join(fixture.root,'.next/standalone/.next/node_modules/dependency-hash');
      await symlink(relative(dirname(link),join(fixture.root,'node_modules/sharp',container)),link,'dir');
      const output=await copyDependencies(fixture);
      const report=await preflightDependencies(fixture.root);
      assert.equal(report.status,'PASS');assert.equal(report.entireTreeAudited,true);
      await assertOrdinaryTree(output);
      const lock=JSON.parse(await readFile(join(fixture.root,'package-lock.json'),'utf8'));
      lock.packages['node_modules/sharp/node_modules/@scope/addon'].dev=true;
      await fixture.put('package-lock.json',JSON.stringify(lock));
      await assert.rejects(copyDependencies(fixture),/dependency_untrusted/);
    } finally {await rm(fixture.root,{recursive:true,force:true});}
  });
}

async function reviewedSemverFixture() {
  const fixture=await nestedFixture();
  const lock=JSON.parse(await readFile(join(fixture.root,'package-lock.json'),'utf8'));
  lock.packages['node_modules/next'].version='16.3.8';
  lock.packages['node_modules/sharp'].version='0.35.5';
  lock.packages['node_modules/semver'].version='6.3.1';
  lock.packages['node_modules/sharp/node_modules/semver'].version='7.8.5';
  await fixture.put('package-lock.json',JSON.stringify(lock));
  await fixture.put('.next/standalone/node_modules/semver/package.json','{"name":"semver","version":"6.3.1"}');
  await fixture.put('.next/next-server.js.nft.json',JSON.stringify({version:1,files:[
    '../node_modules/semver/package.json','../node_modules/sharp/node_modules/semver/package.json']}));
  return fixture;
}

test('reviewed dev-only semver metadata is omitted while nested production semver is retained',async()=>{
  const fixture=await reviewedSemverFixture();
  try {
    const report=await preflightDependencies(fixture.root);
    assert.equal(report.status,'PASS');
    assert.deepEqual(report.omissions,[{identity:'semver',reason:'reviewed_development_metadata',traced:true}]);
    const output=await copyDependencies(fixture);
    await assert.rejects(readFile(join(output,'node_modules/semver/package.json')),error=>error.code==='ENOENT');
    assert.equal(await readFile(join(output,'node_modules/sharp/node_modules/semver/package.json'),'utf8'),'{}');
  } finally {await rm(fixture.root,{recursive:true,force:true});}
});

for(const change of ['runtime_sibling','metadata_link','version_drift','production_edge','external_dev_target']) {
  test(`reviewed metadata omission fails closed on ${change}`,async()=>{
    const fixture=await reviewedSemverFixture();
    try {
      const lock=JSON.parse(await readFile(join(fixture.root,'package-lock.json'),'utf8'));
      if(change==='runtime_sibling')await fixture.put('.next/standalone/node_modules/semver/index.js','runtime');
      if(change==='metadata_link') {
        await rm(join(fixture.root,'.next/standalone/node_modules/semver/package.json'));
        await symlink(join(fixture.root,'public/icon.txt'),join(fixture.root,'.next/standalone/node_modules/semver/package.json'),'file');
      }
      if(change==='version_drift')lock.packages['node_modules/sharp/node_modules/semver'].version='7.8.6';
      if(change==='production_edge')lock.packages[''].dependencies.semver='6.3.1';
      if(change==='external_dev_target') {
        await fixture.put('node_modules/semver/index.js','runtime');
        await symlink(join(fixture.root,'node_modules/semver/index.js'),join(fixture.root,'.next/standalone/node_modules/runtime/linked'),'file');
      }
      await fixture.put('package-lock.json',JSON.stringify(lock));
      await assert.rejects(copyDependencies(fixture),/dependency_untrusted/);
      assert.equal((await preflightDependencies(fixture.root)).status,'REJECTED');
    } finally {await rm(fixture.root,{recursive:true,force:true});}
  });
}

test('preflight compares exact nested ownership with NFT traces and the production graph; collects all classes',async()=>{
  const fixture=await nestedFixture();
  try {
    const lock=JSON.parse(await readFile(join(fixture.root,'package-lock.json'),'utf8'));
    lock.packages['node_modules/runtime/node_modules/dev']={dev:true};
    lock.packages['node_modules/runtime/node_modules/workspace']={link:true};
    await fixture.put('package-lock.json',JSON.stringify(lock));
    for(const name of ['semver','runtime/node_modules/dev','runtime/node_modules/workspace','not-approved'])
      await fixture.put(`.next/standalone/node_modules/${name}/package.json`,'{}');
    await fixture.put('.next/next-server.js.nft.json',JSON.stringify({version:1,files:[
      '../node_modules/semver/package.json','../node_modules/sharp/node_modules/semver/package.json']}));
    const report=await preflightDependencies(fixture.root);
    assert.equal(report.status,'REJECTED');assert.equal(report.entireTreeAudited,true);
    assert.equal(report.traceStatus,'AVAILABLE');assert.equal(report.truncated,false);
    const semver=report.rejections.find(row=>row.identity==='semver');
    assert.equal(semver.reason,'development_package');assert.equal(semver.tracedFiles,1);
    assert.equal(semver.productionGraph,false);
    assert.ok(report.rejections.some(row=>row.identity==='dev'&&row.reason==='development_package'));
    assert.ok(report.rejections.some(row=>row.identity==='workspace'&&row.reason==='linked_package'));
    assert.ok(report.rejections.some(row=>row.reason==='unlisted_package'));
    assert.ok(!JSON.stringify(report).includes('not-approved'));
    assert.ok(!JSON.stringify(report).includes(fixture.root));
    await assert.rejects(copyDependencies(fixture),/dependency_untrusted/);
    const cli=spawnSync(process.execPath,[packageCli,'preflight'],{cwd:fixture.root,encoding:'utf8'});
    assert.equal(cli.status,1);assert.equal(cli.stderr,'');assert.deepEqual(JSON.parse(cli.stdout),report);
    const create=spawnSync(process.execPath,[packageCli,'create','dist/rejected'],{
      cwd:fixture.root,encoding:'utf8',env:{...process.env,BACKEND_PROVIDER:'native'}});
    assert.equal(create.status,1);assert.deepEqual(JSON.parse(create.stderr).dependencyPreflight,report);
  } finally {await rm(fixture.root,{recursive:true,force:true});}
});

test('nested scope and dependency containers cannot bypass development ancestors or unknown children',async()=>{
  for(const devParent of [false,true]) {
    const fixture=await nestedFixture();
    try {
      const lock=JSON.parse(await readFile(join(fixture.root,'package-lock.json'),'utf8'));
      if(devParent)lock.packages['node_modules/sharp'].dev=true;
      else await fixture.put('.next/standalone/node_modules/sharp/node_modules/@scope/unlisted/package.json','{}');
      await fixture.put('package-lock.json',JSON.stringify(lock));
      await assert.rejects(copyDependencies(fixture),/dependency_untrusted/);
    } finally {await rm(fixture.root,{recursive:true,force:true});}
  }
});

test('preflight output is capped without stopping the audit and suppresses malformed package identities',async()=>{
  const fixture=await nestedFixture();
  try {
    const lock=JSON.parse(await readFile(join(fixture.root,'package-lock.json'),'utf8'));
    for(let index=0;index<95;index++) {
      const name=`dev-${index}`;lock.packages[`node_modules/${name}`]={dev:true};
      await fixture.put(`.next/standalone/node_modules/${name}/package.json`,'{}');
    }
    lock.packages['node_modules/dev-0'].name='secret=value/untrusted';
    await fixture.put('package-lock.json',JSON.stringify(lock));
    const report=await preflightDependencies(fixture.root);
    assert.equal(report.rejectedClasses,95);assert.equal(report.rejections.length,80);
    assert.equal(report.truncated,true);assert.ok(report.rejected>=190);
    assert.ok(!JSON.stringify(report).includes('secret=value'));
  } finally {await rm(fixture.root,{recursive:true,force:true});}
});

test('preflight audits safely dereferenced directories, rejects cycles and never follows escaping links',async()=>{
  const fixture=await nestedFixture();
  try {
    await fixture.put('node_modules/runtime/value.js','synthetic');
    await fixture.put('node_modules/dev/value.js','synthetic');
    await symlink(join(fixture.root,'node_modules/dev/value.js'),join(fixture.root,'node_modules/runtime/linked'),'file');
    await mkdir(join(fixture.root,'.next/standalone/.next/node_modules'));
    await symlink(join(fixture.root,'node_modules/runtime'),join(fixture.root,'.next/standalone/.next/node_modules/runtime-hash'),'dir');
    await symlink(join(fixture.root,'public'),join(fixture.root,'.next/standalone/node_modules/runtime/escape'),'dir');
    const report=await preflightDependencies(fixture.root);
    assert.equal(report.status,'REJECTED');
    assert.ok(report.rejections.some(row=>row.reason==='development_package'));
    assert.ok(report.rejections.some(row=>row.reason==='deployment_trace_link_unsafe'));
    assert.ok(!JSON.stringify(report).includes('escape'));
  } finally {await rm(fixture.root,{recursive:true,force:true});}
});

function failedCli(root, ...args) {
  const result = spawnSync(process.execPath, [packageCli, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, BACKEND_PROVIDER: 'native' },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  // A single JSON record excludes raw errors, Git stderr, full paths and env.
  const diagnostic = JSON.parse(result.stderr);
  if(diagnostic.dependencyPreflight) {
    assert.equal(typeof diagnostic.dependencyPreflight.entireTreeAudited,'boolean');
    delete diagnostic.dependencyPreflight;
  }
  assert.deepEqual(Object.keys(diagnostic), ['event', 'stage', 'category']);
  assert.equal(diagnostic.event, 'deployment_package_failed');
  assert.ok(!result.stderr.includes(root));
  return diagnostic;
}

test('package diagnostics disclose only approved categories, never arbitrary messages or codes', () => {
  for (const error of [new Error('private path /home/operator/.env secret=value'),
    Object.assign(new Error('private content'), { code: 'PRIVATE_SECRET_VALUE' })]) {
    assert.deepEqual(packageFailureDiagnostic(error), {
      event: 'deployment_package_failed', stage: 'unknown', category: 'unexpected_error',
    });
  }
  assert.equal(packageFailureDiagnostic(new SyntaxError('private JSON content')).category, 'invalid_json');
});

for (const [label, alter, stage, category] of [
  ['missing standalone server', f => rm(join(f.root, '.next/standalone/server.js')), 'standalone_server', 'filesystem_enoent'],
  ['wrong build selector', f => f.put('.next/standalone/server.js', 'private selector'), 'standalone_server', 'deployment_build_provider_mismatch'],
  ['missing Sharp optional dependencies', f => rm(join(f.root, 'node_modules/@img'), { recursive: true }), 'sharp_dependencies', 'filesystem_enoent'],
  ['missing required runtime file', f => rm(join(f.root, '.next/standalone/node_modules/pg/package.json')), 'runtime_requirements', 'deployment_required_file_missing'],
  ['invalid migration JSON', f => f.put('lib/backend/native-migration-state.json', 'private invalid JSON'), 'migration_state', 'invalid_json'],
  ['stale migration state', f => f.put('lib/backend/native-migration-state.json', '[]'), 'migration_manifest', 'deployment_migration_state_stale'],
  ['Git failure with captured stderr', async () => {}, 'source_listing', 'deployment_git_failed'],
  ['existing output', f => mkdir(join(f.root, 'dist/package'), { recursive: true }), 'destination_create', 'filesystem_eexist'],
  ['unsafe traced directory link', f => symlink(join(f.root, 'public'), join(f.root, '.next/standalone/node_modules/unsafe'), 'junction'), 'standalone_copy', 'deployment_trace_link_unsafe'],
  ['unsafe Sharp optional package content', f => f.put('node_modules/@img/sharp-synthetic/.env', 'private fixture'), 'sharp_dependencies', 'deployment_trace_link_unsafe'],
]) {
  test(`packaging fails closed and reports ${label}`, async () => {
    const fixture = await packageFixture();
    try {
      await alter(fixture);
      const diagnostic = failedCli(fixture.root, 'create', 'dist/package');
      assert.equal(diagnostic.stage, stage);
      assert.equal(diagnostic.category, category);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
}

test('CLI argument and verification failures retain safe diagnostics and nonzero exit', async () => {
  const fixture = await packageFixture();
  try {
    assert.equal(failedCli(fixture.root, 'unexpected', 'private-path').category, 'deployment_package_arguments_invalid');
    const diagnostic = failedCli(fixture.root, 'verify', 'missing');
    assert.equal(diagnostic.stage, 'verification_directory');
    assert.equal(diagnostic.category, 'filesystem_enoent');
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test('artifact rejects private paths, dumps, caches and non-Linux native modules', () => {
  for (const path of ['.env', '.env.production', '.git/config', '.codex/x', 'backup/db.dump', 'public/fixtures/user.json',
    'public/private/users.json', '.next/cache/a', 'node_modules/pkg/a.dll', 'data.sql', 'backup.zip'])
    assert.throws(() => checkArtifactFile(path, Buffer.from('synthetic')));
  checkArtifactFile('.next/static/chunks/a.js', Buffer.from('compiled'));
  checkArtifactFile('node_modules/pkg/addon.node', Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
});
test('artifact rejects known build credentials and token signatures without disclosing values', () => {
  for (const value of ['synthetic-auth-value', 'ghp_' + 'a'.repeat(36), '-----BEGIN ' + 'PRIVATE KEY-----',
    'postgresql://example:synthetic@localhost/test']) {
    assert.throws(() => checkArtifactFile('server.js', Buffer.from(value), ['synthetic-auth-value']),
      error => error.message === 'artifact_credential_material');
  }
  checkArtifactFile('server.js', Buffer.from('process.env.BETTER_AUTH_SECRET'));
});
test('ELF evidence rejects wrong architecture and records shared libraries and version requirements', () => {
  const header = 'Class: ELF64\nMachine: Advanced Micro Devices X86-64';
  assert.throws(() => parseElfEvidence('Class: ELF32\nMachine: ARM', '', ''));
  assert.deepEqual(parseElfEvidence(header, '(NEEDED) Shared library: [libc.so.6]\n(RUNPATH) Library runpath: [$ORIGIN]',
    'Name: GLIBC_2.17\nName: GLIBCXX_3.4.21\nName: GLIBC_2.17'), {
    needed: ['libc.so.6'], searchPaths: ['$ORIGIN'], requiredSymbolVersions: ['GLIBCXX_3.4.21', 'GLIBC_2.17'],
  });
});
test('P3 verifier checks synthetic package checksums and rejects tampering or residual env', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mt-artifact-check-'));
  const sha = value => createHash('sha256').update(value).digest('hex');
  const contents = 'synthetic checksum fixture';
  const files = [{ path: 'server.js', size: Buffer.byteLength(contents), checksum: sha(contents) }];
  const manifest = { format: 'MediaTrackerDeploymentV1', backendProvider: 'native',
    buildPlatform: 'synthetic', files, artifactChecksum: sha(JSON.stringify(files)) };
  manifest.manifestFingerprint = sha(JSON.stringify(manifest));
  try {
    await writeFile(join(root, 'server.js'), contents);
    await writeFile(join(root, 'deployment-manifest.json'), JSON.stringify(manifest));
    assert.equal((await verifyNativePackage(root)).status, 'VERIFIED');
    await writeFile(join(root, 'server.js'), 'tampered');
    await assert.rejects(verifyNativePackage(root), error => {
      assert.deepEqual(packageFailureDiagnostic(error), { event: 'deployment_package_failed',
        stage: 'verification_integrity', category: 'deployment_artifact_checksum_mismatch' });
      return /checksum_mismatch/.test(error.message);
    });
    await writeFile(join(root, 'server.js'), contents);
    await writeFile(join(root, '.env'), 'synthetic');
    await assert.rejects(verifyNativePackage(root), /unsafe/);
    await rm(join(root, '.env'));
    await mkdir(join(root, 'public'));
    await symlink(join(root, 'public'), join(root, 'unsafe-link'), 'junction');
    await assert.rejects(verifyNativePackage(root), error => {
      assert.deepEqual(packageFailureDiagnostic(error), { event: 'deployment_package_failed',
        stage: 'verification_inventory', category: 'deployment_artifact_unsafe' });
      return /unsafe/.test(error.message);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
