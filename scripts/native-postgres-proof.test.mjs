import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { once } from 'node:events';
import { Client } from 'pg';
import { validateDisposableTarget } from './native-disposable-relay.mjs';
import { nativeMigrationSteps } from './native-migrations.mjs';

// Exercise the actual runner with inert process boundaries; never contact Docker/DB.
const source=readFileSync(new URL('./native-postgres-proof.mjs',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'')
  .replaceAll('import.meta.url',"'file:///synthetic/scripts/native-postgres-proof.mjs'");
const id='a'.repeat(64),network='b'.repeat(64),name=`mt-p1-${'c'.repeat(36)}`;
const privateDiagnostic='synthetic-private-diagnostic';
async function run({fail,sqlFailure,sqlStatus=3,sqlSignal=null,sqlSpawnError,sqlError=`ERROR:  42601\n${privateDiagnostic}`,missingProof=false,mutate=()=>{},p2=false,endpoint='unix:///var/run/docker.sock',interrupt=false,readinessFailures=0,queryFailures=0,badReady=false,interruptReady=false,lateReady=false,cleanupFailure=false}={}) {
  const calls=[],logs=[];
  let sqlCall=0,elapsed=0,attempt=0,timerId=0;
  const timers=new Map();
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
    if(key==='exec -i') {
      sqlCall++;
      if(sqlCall===sqlFailure) return {...response,status:sqlStatus,signal:sqlSignal,error:sqlSpawnError,stdout:privateDiagnostic,stderr:sqlError};
      response.stdout=missingProof ? '' : p2?'P2_CLOUD_GOALS_PROOF_PASS':'P1_RLS_PROOF_PASS';
    }
    return response;
  };
  await runInNewContext(`(async()=>{${source}\n})()`,{
    spawnSync,process,URL,validateDisposableTarget,
    startDisposableRelay:async()=>{calls.push({key:'relay start'});if(fail==='relay start')throw Error('redacted');return {descriptor:{port:54321},proof:{controlPort:54322,token:'d'.repeat(64)},close:async()=>{calls.push({key:'relay close'});if(fail==='relay close')throw Error('redacted');}};},
    verifyDisposableRelay:async()=>{calls.push({key:'relay verify'});if(fail==='relay verify')throw Error('redacted');},
    Client:class extends EventEmitter {
      constructor(config){super();this.config=config;this.probe=!config.connectionString;this.attempt=this.probe?++attempt:0;this.connection={stream:{destroy:()=>calls.push({key:'pg destroy',attempt:this.attempt})}};calls.push({key:'pg client',config,attempt:this.attempt});}
      async connect(){calls.push({key:'pg connect',attempt:this.attempt});if(this.probe && this.attempt<=readinessFailures){elapsed+=this.config.connectionTimeoutMillis;throw Error(privateDiagnostic);}if(!this.probe && fail==='pg connect')throw Error(privateDiagnostic);}
      async query(sql){calls.push({key:'pg query',sql,attempt:this.attempt});if(this.probe){if(interruptReady)process.emit('SIGTERM');if(lateReady)elapsed+=65000;if(this.attempt<=queryFailures){elapsed+=this.config.query_timeout;throw Error(privateDiagnostic);}return {rows:[{ready:badReady?0:1}]};}}
      async end(){calls.push({key:'pg end',attempt:this.attempt});if(this.probe && cleanupFailure)throw Error(privateDiagnostic);}
    },
    spawn:(command,args,options)=>{calls.push({key:'auth',args:Array.from(args),options});const child=new EventEmitter();child.kill=signal=>{assert.equal(signal,'SIGKILL');queueMicrotask(()=>child.emit('close',null));};queueMicrotask(()=>interrupt?process.emit('SIGTERM'):child.emit('close',fail==='auth'?1:0));return child;},randomUUID:()=>name.slice(6),randomBytes:()=>({toString:()=>privateDiagnostic}),
    readFileSync:()=>privateDiagnostic,nativeMigrationSteps,
    pathToFileURL:()=>({href:'file:///synthetic/offline.mjs'}),performance:{now:()=>elapsed},
    setTimeout:(callback,ms)=>{if(callback.toString().includes('[native code]')){elapsed+=ms;callback();return 0;}timers.set(++timerId,{callback,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    console:{log:line=>logs.push(line),error:line=>logs.push(line)},
  });
  assert.ok(logs.every(line=>!line.includes(privateDiagnostic)));
  assert.equal(timers.size,0,'every readiness watchdog must be cleared');
  return {calls,logs,process,elapsed};
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
  ['DATABASE_READY',{readinessFailures:Infinity}],
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
const p2PassStages=['P2_LEDGER_SETUP',...Array.from({length:9},(_,i)=>`P2_MIGRATION_${String(i+1).padStart(3,'0')}`),'P2_FUNCTIONAL_PROOF'];
test('P2 rejects an unverified relay and cleans every owned resource',async()=>{
  const result=await run({p2:true,fail:'relay verify'});
  assert.equal(result.process.exitCode,1);
  assert.deepEqual(result.logs,['FAIL: disposable proof; stage=RELAY_VALIDATION; diagnostics redacted']);
  assert.ok(!result.calls.some(call=>call.key==='pg connect' || call.key==='exec -i'));
  assert.deepEqual(result.calls.slice(-3).map(c=>c.key),['relay close','rm --force','network rm']);
});

for(const [index,stage] of p2PassStages.entries()) {
  test(`P2 failure identifies ${stage}, stops execution and never marks it PASS`,async()=>{
    const result=await run({p2:true,sqlFailure:index+1});
    assert.equal(result.process.exitCode,1);
    assert.deepEqual(result.logs,[...p2PassStages.slice(0,index).map(s=>`PASS: disposable proof; stage=${s}`),
      `FAIL: disposable proof; stage=${stage}; sqlstate=42601; diagnostics redacted`]);
    assert.equal(result.calls.filter(call=>call.key==='exec -i').length,index+1);
    assert.deepEqual(result.calls.slice(-3).map(call=>call.key),['relay close','rm --force','network rm']);
    assert.equal(result.calls.filter(call=>call.key==='relay verify').length,1);
    assert.ok(!result.calls.some(call=>call.key==='auth'));
  });
}
for(const sqlError of [`ERROR:  ZZ999\n${privateDiagnostic}`,`ERROR:  42601 ${privateDiagnostic}`,privateDiagnostic,'ERROR:  42601\nERROR:  42501']) {
  test(`P2 suppresses unknown, malformed or ambiguous SQLSTATE diagnostics (${sqlError.slice(0,12)})`,async()=>{
    const result=await run({p2:true,sqlFailure:2,sqlError});
    assert.equal(result.process.exitCode,1);
    assert.equal(result.logs.at(-1),'FAIL: disposable proof; stage=P2_MIGRATION_001; diagnostics redacted');
  });
}
test('P2 functional proof cannot pass on a zero exit without its success sentinel',async()=>{
  const result=await run({p2:true,missingProof:true});
  assert.equal(result.process.exitCode,1);
  assert.equal(result.logs.at(-1),'FAIL: disposable proof; stage=P2_FUNCTIONAL_PROOF; diagnostics redacted');
  assert.ok(!result.logs.includes('PASS: disposable proof; stage=P2_FUNCTIONAL_PROOF'));
});
test('P2 password failure is separate from migrations and functional proof',async()=>{
  const result=await run({p2:true,sqlFailure:12,sqlError:'ERROR:  42501'});
  assert.equal(result.process.exitCode,1);
  assert.equal(result.logs.at(-1),'FAIL: disposable proof; stage=P2_RUNTIME_PASSWORD; sqlstate=42501; diagnostics redacted');
});
test('P2 sends the actual ordered transactional plans and preserves SQLSTATE-only diagnostics',async()=>{
  const result=await run({p2:true}),calls=result.calls.filter(call=>call.key==='exec -i');
  const steps=nativeMigrationSteps();
  for(const [i,step] of steps.entries()) {
    assert.equal(calls[i].options.input,step.sql);
    assert.ok(calls[i].args.includes('ON_ERROR_STOP=1'));
    assert.ok(calls[i].args.includes('VERBOSITY=sqlstate'));
    assert.equal(calls[i].options.timeout,15000);
  }
  assert.equal(calls.length,12);
  assert.deepEqual(result.logs.slice(0,11),p2PassStages.map(stage=>`PASS: disposable proof; stage=${stage}`));
});
for(const failure of [{sqlStatus:null,sqlSignal:'SIGTERM'},{sqlStatus:0,sqlSpawnError:Error(privateDiagnostic)},{sqlStatus:1}]) {
  test('P2 transport and timeout failures cannot emit PASS or untrusted SQLSTATE',async()=>{
    const result=await run({p2:true,sqlFailure:6,...failure});
    assert.equal(result.process.exitCode,1);
    assert.equal(result.logs.at(-1),'FAIL: disposable proof; stage=P2_MIGRATION_005; diagnostics redacted');
    assert.ok(!result.logs.includes('PASS: disposable proof; stage=P2_MIGRATION_005'));
    assert.equal(result.calls.filter(call=>call.key==='exec -i').length,6);
    assert.deepEqual(result.calls.slice(-3).map(call=>call.key),['relay close','rm --force','network rm']);
  });
}

for(const p2 of [false,true]) {
  test(`P${p2?2:1}: socket-only init success cannot satisfy TCP readiness`,async()=>{
    // The synthetic Docker boundary returns success for every exec command,
    // including the old socket-only pg_isready. TCP never accepts a connection.
    const result=await run({p2,readinessFailures:Infinity});
    assert.equal(result.elapsed,65000);
    assert.deepEqual(result.logs,['FAIL: disposable proof; stage=DATABASE_READY; diagnostics redacted']);
    assert.ok(!result.calls.some(call=>call.args?.includes('pg_isready') || call.key==='exec -i' || call.key==='auth'));
    const clients=result.calls.filter(call=>call.key==='pg client');
    assert.ok(clients.length>1);
    for(const {config,attempt} of clients) {
      assert.equal(config.host,'127.0.0.1');assert.equal(config.port,54321);
      assert.equal(config.database,'mt_p1_proof');assert.equal(config.user,'postgres');
      assert.equal(config.password,privateDiagnostic);assert.equal(config.ssl,false);
      assert.ok(config.connectionTimeoutMillis>0 && config.connectionTimeoutMillis<=3000);
      assert.ok(result.calls.some(call=>call.key==='pg end' && call.attempt===attempt));
      assert.ok(result.calls.some(call=>call.key==='pg destroy' && call.attempt===attempt));
    }
    assert.deepEqual(result.calls.slice(-3).map(call=>call.key),['relay close','rm --force','network rm']);
  });
  test(`P${p2?2:1}: final TCP server must complete SELECT 1 before SQL starts`,async()=>{
    const result=await run({p2,readinessFailures:2,queryFailures:3});
    assert.equal(result.process.exitCode,undefined);
    const firstSql=result.calls.findIndex(call=>call.key==='exec -i');
    const probes=result.calls.slice(0,firstSql).filter(call=>call.key==='pg client');
    assert.equal(probes.length,4);
    assert.equal(result.calls.filter(call=>call.key==='pg query' && call.attempt===4)[0].sql,'SELECT 1 AS ready');
    assert.ok(result.calls.findIndex(call=>call.key==='relay verify')<result.calls.findIndex(call=>call.key==='pg connect'));
    assert.ok(result.calls.findIndex(call=>call.key==='pg end' && call.attempt===4)<firstSql);
  });
}
for(const options of [{queryFailures:Infinity},{badReady:true},{lateReady:true},{interruptReady:true},{cleanupFailure:true}]) {
  test(`readiness fails closed for query, result, deadline, interruption or cleanup (${Object.keys(options)[0]})`,async()=>{
    const result=await run({p2:true,...options});
    assert.equal(result.process.exitCode,1);
    assert.deepEqual(result.logs,['FAIL: disposable proof; stage=DATABASE_READY; diagnostics redacted']);
    assert.ok(!result.calls.some(call=>call.key==='exec -i'));
    assert.deepEqual(result.calls.slice(-3).map(call=>call.key),['relay close','rm --force','network rm']);
  });
}

test('installed pg cannot accept a TCP listener without an authenticated PostgreSQL response; deadline closes socket',{timeout:5000},async()=>{
  const sockets=new Set();
  let resolvePeerClose;
  const peerClosed=new Promise(resolve=>{resolvePeerClose=resolve;});
  const server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);resolvePeerClose();});socket.resume();});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  let expired=false,clients=0;
  class ProbeClient extends Client {
    constructor(config){super(config);clients++;}
    async end(){expired=true;return super.end();}
  }
  // Exercise the production function with installed pg and actual loopback TCP.
  // Leave only 100ms of the fixed deadline to test a stalled startup handshake.
  let ticks=0;
  const start=source.indexOf('async function waitForDatabase()');
  const end=source.indexOf('\ntry {',start);
  const wait=runInNewContext(`${source.slice(start,end)}\nwaitForDatabase`,{
    Client:ProbeClient,relay:{descriptor:{port:server.address().port}},password:privateDiagnostic,interrupted:false,
    performance:{now:()=>ticks++===0?0:expired?65000:64900},setTimeout,clearTimeout,
  });
  try {
    await assert.rejects(wait(),/database_not_ready/);
    assert.equal(clients,1);
    await peerClosed;
    assert.equal(sockets.size,0,'the probe must close the peer before test cleanup');
  } finally {
    for(const socket of sockets)socket.destroy();
    await new Promise(resolve=>server.close(resolve));
  }
});
