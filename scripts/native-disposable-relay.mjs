import net from 'node:net';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const localEndpoints=['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine','unix:///var/run/docker.sock'];
const unsafe=()=>{throw new Error('unsafe_disposable_target');};
function validateIdentity({containerId,runName,localEndpoint,networkId}) {
  if(!localEndpoints.includes(localEndpoint) || !/^[a-f0-9]{64}$/.test(containerId??'')
    || !/^[a-f0-9]{64}$/.test(networkId??'') || !/^mt-p1-[a-f0-9-]{36}$/.test(runName??'')) unsafe();
}
export function validateDisposableTarget(container,network,identity) {
  validateIdentity(identity);
  const {containerId,runName,localEndpoint,networkId}=identity;
  const attachment=container?.NetworkSettings?.Networks?.[runName];
  const ip=attachment?.IPAddress;
  const octets=ip?.split('.').map(Number);
  if(net.isIP(ip??'')!==4 || !(octets[0]===10 || (octets[0]===172 && octets[1]>=16 && octets[1]<=31) || (octets[0]===192 && octets[1]===168))) unsafe();
  if(container.Id!==containerId || container.Name!==`/${runName}` || container.Config?.Labels?.['mt.p1.proof']!==runName
    || container.State?.Running!==true || container.HostConfig?.NetworkMode!==runName
    || container.HostConfig?.Privileged!==false || container.HostConfig?.PublishAllPorts!==false
    || Object.keys(container.HostConfig?.PortBindings??{}).length!==0
    || Object.values(container.NetworkSettings?.Ports??{}).some(binding=>binding!==null)
    || Object.keys(container.NetworkSettings?.Networks??{}).length!==1
    || !Array.isArray(container.Mounts) || !container.Mounts.some(m=>m.Type==='tmpfs' && m.Destination==='/var/lib/postgresql/data')
    || container.Mounts.some(m=>m.Type!=='tmpfs')
    || network?.Name!==runName || network.Id!==networkId || attachment.NetworkID!==networkId
    || network.Internal!==true || network.Driver!=='bridge' || network.Labels?.['mt.p1.proof']!==runName
    || Object.keys(network.Containers??{}).length!==1 || network.Containers[containerId]?.Name!==runName
    || network.Containers[containerId]?.IPv4Address?.split('/')[0]!==ip) unsafe();
  return Object.freeze({containerId,runName,localEndpoint,networkId:network.Id,targetHost:ip,targetPort:5432});
}
export function inspectDisposableTarget(identity) {
  validateIdentity(identity);
  const env={...process.env};
  for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete env[key];
  const inspect=args=>{
    const result=spawnSync('docker',['--host',identity.localEndpoint,...args],{env,encoding:'utf8',timeout:5000});
    if(result.status!==0) unsafe();
    return JSON.parse(result.stdout)[0];
  };
  return validateDisposableTarget(inspect(['inspect',identity.containerId]),inspect(['network','inspect',identity.runName]),identity);
}
const listen=server=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve(server.address().port);});
});
export async function startDisposableRelay(identity) {
  // Authority comes from pinned local Docker inspect, never an arbitrary proxy destination.
  const target=inspectDisposableTarget(identity),sockets=new Set();
  const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));return socket;};
  const relay=net.createServer(socket=>{
    track(socket);
    const upstream=track(net.connect({host:target.targetHost,port:5432}));
    upstream.setTimeout(60000,()=>upstream.destroy());
    for(const [a,b] of [[socket,upstream],[upstream,socket]]) {
      a.on('error',()=>{a.destroy();b.destroy();});a.on('close',()=>b.destroy());
    }
    socket.pipe(upstream).pipe(socket);
  });
  const token=randomBytes(32).toString('hex');
  let descriptor;
  const control=http.createServer((req,res)=>{
    if(req.method!=='GET' || req.url!=='/' || req.headers.authorization!==`Bearer ${token}`) {res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(descriptor));
  });
  control.on('connection',track);
  const close=async()=>{
    for(const socket of sockets)socket.destroy();
    await Promise.all([relay,control].map(server=>new Promise((resolve,reject)=>{
      if(!server.listening)return resolve();
      server.close(error=>error?reject(error):resolve());
    })));
  };
  try {
    const port=await listen(relay);
    descriptor={...target,host:'127.0.0.1',port};
    const controlPort=await listen(control);
    return {descriptor,proof:{controlPort,token},close};
  } catch(error) {await close();throw error;}
}
export async function verifyDisposableRelay(identity,proof,host,port) {
  if(host!=='127.0.0.1' || !Number.isInteger(Number(port)) || Number(port)<1 || Number(port)>65535
    || !Number.isInteger(proof?.controlPort) || proof.controlPort<1 || proof.controlPort>65535 || !/^[a-f0-9]{64}$/.test(proof.token??'')) unsafe();
  const response=await fetch(`http://127.0.0.1:${proof.controlPort}/`,{headers:{authorization:`Bearer ${proof.token}`},redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok) unsafe();
  const descriptor=await response.json(),target=inspectDisposableTarget(identity);
  if(descriptor.host!==host || descriptor.port!==Number(port)
    || Object.entries(target).some(([key,value])=>descriptor[key]!==value)) unsafe();
  return target;
}
