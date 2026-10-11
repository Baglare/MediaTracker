// Operator-pinned, source-bound evidence; a neighboring checksum is not approval.
import { readFile, lstat } from 'node:fs/promises';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { digest } from './native-ops-target.mjs';
import { Client } from 'pg';
import { verifyDisposableRelay } from './native-disposable-relay.mjs';
const localRunners=new WeakMap();
export async function attestRecoveryRunner(client,identity,proof) {
  if(!(client instanceof Client)||client.connectionParameters.user!=='mt_test_backup'||client.connectionParameters.database!=='mt_p4_test')throw new Error('native_recovery_runner_unproven');
  await verifyDisposableRelay(identity,proof,client.connectionParameters.host,client.connectionParameters.port);
  localRunners.set(client,digest({kind:'runner-owned-local',containerId:identity.containerId}));
}
export async function recoverySourceFingerprint() {
  const files=['native-recovery.mjs','native-recovery-evidence.mjs','native-recovery-proof.mjs',
    'native-recovery-proof-contract.mjs','native-hosting-contract.mjs','native-hosting-sql.mjs',
    'native-migrations.mjs','native-migration-runner.mjs','native-ops-target.mjs','native-disposable-relay.mjs','native-recovery-seal.mjs',
    '../lib/backend/native-roles.mjs','../lib/backend/filesystem-core.mjs','../lib/backend/postgres-tls.mjs'];
  const source=[];
  for(const file of files)source.push({file,checksum:digest((await readFile(new URL(file,import.meta.url),'utf8')).replaceAll('\r\n','\n'))});
  const migrations=Object.fromEntries(['hosting-test','hosting-production'].map(p=>[p,nativeMigrationManifest(p).map(({name,checksum})=>({name,checksum}))]));
  return digest({source,migrations});
}
export async function assertRecoveryProof(options,client) {
  if(localRunners.has(client))return localRunners.get(client);
  if(!options['recovery-proof']||!/^[a-f0-9]{64}$/.test(options['recovery-proof-fingerprint']??''))throw new Error('native_shared_recovery_proof_required');
  const info=await lstat(options['recovery-proof']);
  if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw new Error('native_shared_recovery_proof_invalid');
  const proof=JSON.parse(await readFile(options['recovery-proof'],'utf8'));
  if(proof.format!=='MediaTrackerNativeRecoveryProofV1'||proof.status!=='PASS'||proof.kind!=='SYNTHETIC_PG18_ROUNDTRIP'
    ||proof.pgMajor!==18||proof.twoUserIsolation!=='PASS'||proof.rows!=='PASS'||proof.ledger!=='PASS'
    ||proof.ownershipAcl!=='PASS'||proof.roleSettings!=='PASS'||proof.files!=='PASS'
    ||proof.sourceFingerprint!==await recoverySourceFingerprint()
    ||proof.fingerprint!==options['recovery-proof-fingerprint']||digest({...proof,fingerprint:undefined})!==proof.fingerprint)
    throw new Error('native_shared_recovery_proof_invalid');
  return proof.fingerprint;
}
