import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { validateDisposableTarget } from './native-disposable-relay.mjs';

// Exercise the actual runner with inert process boundaries; never contact Docker/DB.
const source=readFileSync(new URL('./native-postgres-proof.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'')
  .replaceAll('import.meta.url',"'file:///synthetic/scripts/native-postgres-proof.mjs'");
const id='a'.repeat(64),network='b'.repeat(64),name=`mt-p1-${'c'.repeat(36)}`;
const privateDiagnostic='synthetic-private-diagnostic';
async function run({fail,mutate=()=>{},p2=false,endpoint='unix:///var/run/docker.sock',interrupt=false}={}) {
  const calls=[],logs=[];
  const target={Id:id,State:{Running:true},Name:`/${name}`,Config:{Labels:{'mt.p1.proof':name}},
    HostConfig:{NetworkMode:name,Privileged:false,PublishAllPorts:false,PortBindings:{}},NetworkSettings:{Ports:{'5432/tcp':null},Networks:{[name]:{NetworkID:network,IPAddress:'172.20.0.2'}}},
    Mounts:[{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}]};
  const net={Id:network,Name:name,Driver:'bridge',Internal:true,Labels:{'mt.p1.proof':name},Containers:{[id]:{Name:name,IPv4Address:'172.20.0.2/16'}}};
  mutate(target,net);
  const process=Object.assign(new EventEmitter(),{argv:['node','proof.mjs',...(p2?['--p2']:[])],env:{NODE_OPTIONS:'--existing-option'},execPath:'node',cwd:()=>'/synthetic'});
  const spawnSync=(command,args,options)=>{
    if(command==='docker' && args[0]==='--host') args=args.slice(2);
    assert.equal(command,'docker','Vitest must be asynchronous so the relay can run');
    const key=args.slice(0,2).join(' ');
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
    spawnSync,process,URL,validateDisposableTarget,
    startDisposableRelay:async()=>{calls.push({key:'relay start'});if(fail==='relay start')throw Error('redacted');return {descriptor:{port:54321},proof:{controlPort:54322,token:'d'.repeat(64)},close:async()=>{calls.push({key:'relay close'});if(fail==='relay close')throw Error('redacted');}};},
    verifyDisposableRelay:async()=>{calls.push({key:'relay verify'});if(fail==='relay verify')throw Error('redacted');},
    Client:class {async connect(){calls.push({key:'pg connect'});if(fail==='pg connect')throw Error('redacted');}async query(){}async end(){calls.push({key:'pg end'});}},
    spawn:(command,args,options)=>{calls.push({key:'auth',args:Array.from(args),options});const child=new EventEmitter();child.kill=signal=>{assert.equal(signal,'SIGKILL');queueMicrotask(()=>child.emit('close',null));};queueMicrotask(()=>interrupt?process.emit('SIGTERM'):child.emit('close',fail==='auth'?1:0));return child;},randomUUID:()=>name.slice(6),randomBytes:()=>({toString:()=>privateDiagnostic}),
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
  ['TARGET_VALIDATION',{mutate:target=>{target.Config.Labels['mt.p1.proof']='other';}}],
  ['TARGET_VALIDATION',{mutate:(_target,net)=>{net.Internal=false;}}],
  ['TARGET_VALIDATION',{mutate:target=>{target.Id='f'.repeat(64);}}],
  ['TARGET_VALIDATION',{mutate:target=>{target.NetworkSettings.Ports['5432/tcp']=[{HostIp:'0.0.0.0',HostPort:'54321'}];}}],
  ['TARGET_VALIDATION',{mutate:target=>{target.Mounts[0].Type='volume';}}],
  ['RELAY_START',{fail:'relay start'}],
  ['RELAY_VALIDATION',{fail:'relay verify'}],
  ['RELAY_VALIDATION',{fail:'pg connect'}],
  ['DATABASE_READY',{fail:`exec ${id}`}],
  ['SQL_PROOF',{fail:'exec -i'}],
  ['AUTH_INTEGRATION',{fail:'auth'}],
]) {
  test(`failure reports only safe ${stage} stage and cleans both resources (${options.fail??'validation'})`,async()=>{
    const result=await run(options);
    assert.equal(result.process.exitCode,1);
    assert.deepEqual(result.logs,[`FAIL: disposable proof; stage=${stage}; diagnostics redacted`]);
    assert.deepEqual(result.calls.slice(-2).map(call=>call.args),[['rm','--force',id],['network','rm',network]]);
    if(stage==='TARGET_VALIDATION') assert.ok(!result.calls.some(call=>call.key.startsWith('exec')));
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
    assert.ok(!create.includes('--publish'));
    assert.ok(result.calls.find(call=>call.key==='relay verify'));
    assert.ok(result.calls.find(call=>call.key==='pg connect'));
    assert.ok(result.calls.find(call=>call.key==='relay close'));
    assert.equal(create[create.indexOf('--mount')+1],'type=tmpfs,destination=/var/lib/postgresql/data');
    const auth=result.calls.find(call=>call.key==='auth');
    assert.equal(!!auth,!p2);
    if(auth) {assert.equal(auth.options.stdio,'ignore');assert.ok(auth.options.env.NODE_OPTIONS.startsWith('--existing-option '));assert.match(auth.options.env.DATABASE_URL,/@127\.0\.0\.1:54321\/mt_p1_proof$/);}
  });
}

test('relay cleanup failure still cleans container and network and fails closed',async()=>{
  const result=await run({fail:'relay close'});
  assert.equal(result.process.exitCode,1);
  assert.ok(result.logs.includes('FAIL: disposable proof; stage=RELAY_CLEANUP; diagnostics redacted'));
  assert.deepEqual(result.calls.slice(-2).map(call=>call.args),[['rm','--force',id],['network','rm',network]]);
});

test('interruption kills Vitest and closes relay before Docker cleanup',async()=>{
  const result=await run({interrupt:true});
  assert.equal(result.process.exitCode,1);
  assert.deepEqual(result.calls.slice(-3).map(c=>c.key),['relay close','rm --force','network rm']);
});
test('P2 rejects an unverified relay and cleans every owned resource',async()=>{
  const result=await run({p2:true,fail:'relay verify'});
  assert.equal(result.process.exitCode,1);
  assert.deepEqual(result.logs,['FAIL: disposable proof; stage=RELAY_VALIDATION; diagnostics redacted']);
  assert.deepEqual(result.calls.slice(-3).map(c=>c.key),['relay close','rm --force','network rm']);
});
