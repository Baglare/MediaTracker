import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { validateDisposableTarget } from './native-disposable-relay.mjs';

const id='a'.repeat(64),networkId='b'.repeat(64),name=`mt-p1-${'c'.repeat(36)}`;
const identity={containerId:id,runName:name,networkId,localEndpoint:'unix:///var/run/docker.sock'};
function fixture() {
  return {container:{Id:id,Name:`/${name}`,Config:{Labels:{'mt.p1.proof':name}},State:{Running:true},
    HostConfig:{NetworkMode:name,Privileged:false,PublishAllPorts:false,PortBindings:{}},
    NetworkSettings:{Ports:{'5432/tcp':null},Networks:{[name]:{IPAddress:'172.20.0.2',NetworkID:networkId}}},
    Mounts:[{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}]},
    network:{Id:networkId,Name:name,Driver:'bridge',Internal:true,Labels:{'mt.p1.proof':name},
      Containers:{[id]:{Name:name,IPv4Address:'172.20.0.2/16'}}}};
}
for(const [description,mutate] of [
  ['wrong container ID',c=>{c.Id='f'.repeat(64);}],
  ['wrong label',c=>{c.Config.Labels['mt.p1.proof']='other';}],
  ['stopped container',c=>{c.State.Running=false;}],
  ['wrong IP',c=>{c.NetworkSettings.Networks[name].IPAddress='172.20.0.3';}],
  ['public IP',c=>{c.NetworkSettings.Networks[name].IPAddress='8.8.8.8';}],
  ['different network',c=>{c.HostConfig.NetworkMode='other';}],
  ['wrong network ID',c=>{c.NetworkSettings.Networks[name].NetworkID='d'.repeat(64);}],
  ['second attachment',c=>{c.NetworkSettings.Networks.other={};}],
  ['external network',(_c,n)=>{n.Internal=false;}],
  ['wrong network label',(_c,n)=>{n.Labels['mt.p1.proof']='other';}],
  ['extra member',(_c,n)=>{n.Containers['e'.repeat(64)]={};}],
  ['external published port',c=>{c.NetworkSettings.Ports['5432/tcp']=[{HostIp:'0.0.0.0',HostPort:'12345'}];}],
  ['loopback publication',c=>{c.HostConfig.PortBindings={'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'12345'}]};}],
  ['publish all',c=>{c.HostConfig.PublishAllPorts=true;}],
  ['privileged',c=>{c.HostConfig.Privileged=true;}],
  ['volume mount',c=>{c.Mounts[0].Type='volume';}],
  ['missing tmpfs',c=>{c.Mounts=[];}],
  ['bind mount',c=>{c.Mounts.push({Type:'bind'});}],
]) {
  test(`rejects ${description}`,()=>{
    const {container,network}=fixture();mutate(container,network);
    assert.throws(()=>validateDisposableTarget(container,network,identity),/unsafe_disposable_target/);
  });
}
test('null Docker port mapping is accepted only for the isolated tmpfs target',()=>{
  const {container,network}=fixture();
  assert.equal(validateDisposableTarget(container,network,identity).targetPort,5432);
});
test('rejects remote Docker and a different runner-created network ID',()=>{
  const {container,network}=fixture();
  for(const bad of [{...identity,localEndpoint:'tcp://example.invalid:2375'},{...identity,networkId:'d'.repeat(64)}])
    assert.throws(()=>validateDisposableTarget(container,network,bad),/unsafe_disposable_target/);
});
test('privacy capability remains bound to the exact verified pg client',async()=>{
  class Client {connectionParameters={database:'mt_p1_proof',host:'127.0.0.1',port:54321};}
  const proof={controlPort:54322,token:'d'.repeat(64)},calls=[];
  let reject=false;
  const source=readFileSync(new URL('./native-disposable-capability.mjs',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const api=runInNewContext(`${source}\n({attestNativeDisposableClient,assertNativeDisposableClient})`,{
    Client,process:{env:{NATIVE_P1_RELAY_PROOF:JSON.stringify(proof)}},
    verifyDisposableRelay:async(...args)=>{calls.push(args);if(reject)throw Error('private diagnostic');},
  });
  const client=new Client(),token=await api.attestNativeDisposableClient(client,identity);
  assert.equal(calls[0][0].containerId,id);
  assert.equal(calls[0][0].networkId,networkId);assert.equal(calls[0][1].token,proof.token);
  assert.equal(calls[0][2],'127.0.0.1');assert.equal(calls[0][3],54321);
  api.assertNativeDisposableClient(client,token);
  assert.throws(()=>api.assertNativeDisposableClient(new Client(),token),/native_privacy_target_unproven/);
  assert.throws(()=>api.assertNativeDisposableClient(client,{}),/native_privacy_target_unproven/);
  reject=true;
  await assert.rejects(api.attestNativeDisposableClient(client,identity),/native_privacy_target_unproven/);
  const other=new Client();other.connectionParameters.database='production';
  await assert.rejects(api.attestNativeDisposableClient(other,identity),/native_privacy_target_unproven/);
});

// Actual loopback listeners, HTTP attestation and asynchronous TCP transport;
// Docker and the private destination are synthetic, with no Docker/DB contact.
test('relay binds loopback, forwards a fixed target, rejects forged metadata and destroys active sockets',async()=>{
  const state=fixture(),destinations=[],dockerCalls=[],listeners=[];
  const backend=net.createServer(socket=>socket.pipe(socket));
  backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const source=readFileSync(new URL('./native-disposable-relay.mjs',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const api=runInNewContext(`${source}\n({startDisposableRelay,verifyDisposableRelay})`,{
    net:{...net,createServer:handler=>{const server=net.createServer(handler);listeners.push(server);return server;},connect:options=>{destinations.push(options);return net.connect({host:'127.0.0.1',port:backend.address().port});}},
    http:{...http,createServer:handler=>{const server=http.createServer(handler);listeners.push(server);return server;}},randomBytes,process:{env:{DOCKER_HOST:'tcp://forbidden.invalid:2375'}},fetch,AbortSignal,
    spawnSync:(_cmd,args,options)=>{dockerCalls.push({args,options});return {status:0,stdout:JSON.stringify([args[2]==='inspect'?state.container:state.network])};},
  });
  let relay,socket;
  try {
    relay=await api.startDisposableRelay(identity);
    const {port,host}=relay.descriptor;
    assert.equal(host,'127.0.0.1');assert.ok(port>0);
    assert.ok(listeners.every(server=>server.address().address==='127.0.0.1'));
    await api.verifyDisposableRelay(identity,relay.proof,host,port);
    socket=net.connect({host,port});await once(socket,'connect');
    const received=once(socket,'data');socket.write('synthetic');
    assert.equal((await received)[0].toString(),'synthetic');
    assert.equal(destinations.length,1);assert.equal(destinations[0].host,'172.20.0.2');assert.equal(destinations[0].port,5432);
    const child=spawn(process.execPath,['--input-type=module','-e',
      `import net from 'node:net';const socket=net.connect(${port},'127.0.0.1',()=>socket.write('child'));socket.on('data',data=>{process.exitCode=data.toString()==='child'?0:1;socket.end();});socket.on('error',()=>process.exitCode=1);`],
      {stdio:'ignore',timeout:5000,killSignal:'SIGKILL'});
    assert.equal((await once(child,'close'))[0],0,'child DB traffic must progress while the parent relay runs');
    for(const [key,bad] of [['containerId','f'.repeat(64)],['targetHost','172.20.0.3'],['targetPort',5433],['host','0.0.0.0']]) {
      const previous=relay.descriptor[key];relay.descriptor[key]=bad;
      await assert.rejects(api.verifyDisposableRelay(identity,relay.proof,host,port));relay.descriptor[key]=previous;
    }
    for(const [proof,bind,boundPort] of [
      [{...relay.proof,token:'f'.repeat(64)},host,port],
      [relay.proof,'0.0.0.0',port],[relay.proof,host,port===65535?port-1:port+1],
      [{...relay.proof,controlPort:0},host,port],
    ]) await assert.rejects(api.verifyDisposableRelay(identity,proof,bind,boundPort));
    state.container.NetworkSettings.Networks[name].IPAddress='172.20.0.3';
    state.network.Containers[id].IPv4Address='172.20.0.3/16';
    await assert.rejects(api.verifyDisposableRelay(identity,relay.proof,host,port));
    assert.ok(dockerCalls.every(c=>c.args[0]==='--host' && c.args[1]===identity.localEndpoint && !c.options.env.DOCKER_HOST));
    const closed=once(socket,'close');await relay.close();await closed;
    await assert.rejects(api.verifyDisposableRelay(identity,relay.proof,host,port));
  } finally {
    socket?.destroy();await relay?.close();await new Promise(resolve=>backend.close(resolve));
  }
});
