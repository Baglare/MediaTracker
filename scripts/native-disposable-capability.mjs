// Offline operator safety: a JSON object is never sufficient target authority.
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
const proven=new WeakMap();
export async function attestNativeDisposableClient(client,{containerId,runName,localEndpoint}) {
  if(!(client instanceof Client) || !/^[a-f0-9]{64}$/.test(containerId??'') || !/^mt-p1-[a-f0-9-]{36}$/.test(runName??'')
    || !['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine','unix:///var/run/docker.sock'].includes(localEndpoint))throw new Error('native_privacy_target_unproven');
  const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
  const result=spawnSync('docker',['--host',localEndpoint,'inspect',containerId],{env,encoding:'utf8',timeout:5000});
  if(result.status!==0)throw new Error('native_privacy_target_unproven');
  const container=JSON.parse(result.stdout)[0],binding=container?.NetworkSettings?.Ports?.['5432/tcp'];
  const parameters=client.connectionParameters;
  if(container?.Id!==containerId || container.Name!==`/${runName}` || container.Config?.Labels?.['mt.p1.proof']!==runName
    || container.HostConfig?.NetworkMode!==runName || container.Mounts?.some(m=>m.Type!=='tmpfs')
    || binding?.length!==1 || binding[0].HostIp!=='127.0.0.1' || parameters.host!=='127.0.0.1'
    || String(parameters.port)!==binding[0].HostPort || parameters.database!=='mt_p1_proof')throw new Error('native_privacy_target_unproven');
  const network=spawnSync('docker',['--host',localEndpoint,'network','inspect',runName],{env,encoding:'utf8',timeout:5000});
  if(network.status!==0)throw new Error('native_privacy_target_unproven');
  const details=JSON.parse(network.stdout)[0];
  if(details.Internal!==true || details.Labels?.['mt.p1.proof']!==runName)throw new Error('native_privacy_target_unproven');
  const token=Object.freeze({kind:'runner-owned-disposable',containerId});proven.set(token,client);return token;
}
export function assertNativeDisposableClient(client,token) {
  if(!token || proven.get(token)!==client)throw new Error('native_privacy_target_unproven');
}
