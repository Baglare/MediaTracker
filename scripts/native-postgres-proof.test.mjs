import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the actual runner with inert process boundaries; never contact Docker/DB.
const source=readFileSync(new URL('./native-postgres-proof.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'')
  .replaceAll('import.meta.url',"'file:///synthetic/scripts/native-postgres-proof.mjs'");
const id='a'.repeat(64),network='b'.repeat(64),name=`mt-p1-${'c'.repeat(36)}`;
const privateDiagnostic='synthetic-private-diagnostic';
async function run({fail,mutate=()=>{},p2=false,endpoint='unix:///var/run/docker.sock'}={}) {
  const calls=[],logs=[];
  const target={Name:`/${name}`,Config:{Labels:{'mt.p1.proof':name}},
    HostConfig:{NetworkMode:name},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'54321'}]}},
    Mounts:[{Type:'tmpfs'}]};
  const net={Internal:true,Labels:{'mt.p1.proof':name}};
  mutate(target,net);
  const process={argv:['node','proof.mjs',...(p2?['--p2']:[])],env:{},execPath:'node',cwd:()=>'/synthetic'};
  const spawnSync=(command,args,options)=>{
    if(command==='docker' && args[0]==='--host') args=args.slice(2);
    const key=command==='node'?'auth':args.slice(0,2).join(' ');
    calls.push({key,args:Array.from(args),options});
    const response={status:0,stdout:'',stderr:privateDiagnostic};
    if(key===fail) return {...response,status:1,stdout:privateDiagnostic};
    if(key==='context inspect') response.stdout=JSON.stringify([{Endpoints:{docker:{Host:endpoint}}}]);
    if(key==='network create') response.stdout=network;
    if(key==='run --detach') response.stdout=id;
    if(key===`inspect ${id}`) response.stdout=JSON.stringify([target]);
    if(key==='network inspect') response.stdout=JSON.stringify([net]);
    if(key==='exec -i') response.stdout=p2?'P2_CLOUD_GOALS_PROOF_PASS':'P1_RLS_PROOF_PASS';
    return response;
  };
  await runInNewContext(`(async()=>{${source}\n})()`,{
    spawnSync,process,URL,randomUUID:()=>name.slice(6),randomBytes:()=>({toString:()=>privateDiagnostic}),
    readFileSync:()=>privateDiagnostic,nativeMigrationPlan:()=>privateDiagnostic,
    pathToFileURL:()=>({href:'file:///synthetic/offline.mjs'}),setTimeout:resolve=>resolve(),
    console:{log:line=>logs.push(line),error:line=>logs.push(line)},
  });
  assert.ok(logs.every(line=>!line.includes(privateDiagnostic)));
  return {calls,logs,process};
}

for(const [stage,options] of [
  ['CONTAINER_INSPECT',{fail:`inspect ${id}`}],
  ['NETWORK_INSPECT',{fail:'network inspect'}],
  ['CONTAINER_VALIDATION',{mutate:target=>{target.Config.Labels['mt.p1.proof']='other';}}],
  ['NETWORK_VALIDATION',{mutate:(_target,net)=>{net.Internal=false;}}],
  ['PORT_VALIDATION',{mutate:target=>{target.NetworkSettings.Ports['5432/tcp']=null;}}],
  ['PORT_VALIDATION',{mutate:target=>{target.NetworkSettings.Ports['5432/tcp'][0].HostIp='0.0.0.0';}}],
  ['MOUNT_VALIDATION',{mutate:target=>{target.Mounts[0].Type='volume';}}],
  ['DATABASE_READY',{fail:`exec ${id}`}],
  ['SQL_PROOF',{fail:'exec -i'}],
  ['AUTH_INTEGRATION',{fail:'auth'}],
]) {
  test(`failure reports only safe ${stage} stage and cleans both resources (${options.fail??'validation'})`,async()=>{
    const result=await run(options);
    assert.equal(result.process.exitCode,1);
    assert.deepEqual(result.logs,[`FAIL: disposable proof; stage=${stage}; diagnostics redacted`]);
    assert.deepEqual(result.calls.slice(-2).map(call=>call.args),[['rm','--force',id],['network','rm',network]]);
    if(stage.endsWith('VALIDATION')) assert.ok(!result.calls.some(call=>call.key.startsWith('exec')));
  });
}
test('container cleanup failure still attempts network cleanup and remains redacted',async()=>{
  const result=await run({fail:'rm --force'});
  assert.equal(result.process.exitCode,1);
  assert.ok(result.logs.includes('FAIL: disposable proof; stage=CONTAINER_CLEANUP; diagnostics redacted'));
  assert.equal(result.calls.at(-1).key,'network rm');
});
test('network cleanup failure makes the runner fail',async()=>{
  const result=await run({fail:'network rm'});
  assert.equal(result.process.exitCode,1);
  assert.ok(result.logs.includes('FAIL: disposable proof; stage=NETWORK_CLEANUP; diagnostics redacted'));
});
test('failed container creation still cleans its network without removing by name',async()=>{
  const result=await run({fail:'run --detach'});
  assert.equal(result.process.exitCode,1);
  assert.deepEqual(result.logs,['BLOCKED_ENVIRONMENT: disposable proof; stage=CONTAINER_CREATE; diagnostics redacted']);
  assert.deepEqual(result.calls.at(-1).args,['network','rm',network]);
  assert.ok(!result.calls.some(call=>call.key==='rm --force'));
});
test('remote Docker endpoint is rejected before engine operations',async()=>{
  const result=await run({endpoint:'tcp://example.invalid:2375'});
  assert.equal(result.process.exitCode,1);
  assert.deepEqual(result.logs,['BLOCKED_ENVIRONMENT: disposable proof; stage=DOCKER_CONTEXT; diagnostics redacted']);
  assert.equal(result.calls.length,1);
});
for(const p2 of [false,true]) {
  test(`synthetic P${p2?2:1} path preserves proof command and suppresses raw auth output`,async()=>{
    const result=await run({p2});
    assert.equal(result.process.exitCode,undefined);
    assert.ok(result.calls.find(call=>call.key==='exec -i').args.includes('ON_ERROR_STOP=1'));
    assert.ok(result.calls.find(call=>call.key==='network create').args.includes('--internal'));
    const create=result.calls.find(call=>call.key==='run --detach').args;
    assert.equal(create[create.indexOf('--publish')+1],'127.0.0.1::5432');
    assert.equal(create[create.indexOf('--mount')+1],'type=tmpfs,destination=/var/lib/postgresql/data');
    const auth=result.calls.find(call=>call.key==='auth');
    assert.equal(!!auth,!p2);
    if(auth) assert.equal(auth.options.stdio,'pipe');
  });
}
