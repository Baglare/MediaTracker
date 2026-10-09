// Offline operator safety: a JSON object is never sufficient target authority.
import { verifyDisposableRelay } from './native-disposable-relay.mjs';
import { Client } from 'pg';
const proven=new WeakMap();
export async function attestNativeDisposableClient(client,{containerId,runName,localEndpoint,networkId=process.env.NATIVE_P1_PROOF_NETWORK}) {
  if(!(client instanceof Client) || client.connectionParameters.database!=='mt_p1_proof')throw new Error('native_privacy_target_unproven');
  try {
    const proof=JSON.parse(process.env.NATIVE_P1_RELAY_PROOF??'null');
    await verifyDisposableRelay({containerId,runName,localEndpoint,networkId},proof,client.connectionParameters.host,client.connectionParameters.port);
  } catch {throw new Error('native_privacy_target_unproven');}
  const token=Object.freeze({kind:'runner-owned-disposable',containerId});proven.set(token,client);return token;
}
export function assertNativeDisposableClient(client,token) {
  if(!token || proven.get(token)!==client)throw new Error('native_privacy_target_unproven');
}
