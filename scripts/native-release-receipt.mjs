// Writes ONLY validated synthetic receipts. Child diagnostics/dumps never upload.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { assertRecoveryProof } from './native-recovery-proof-contract.mjs';
import { pathToFileURL } from 'node:url';
import { digest } from './native-ops-target.mjs';
const directory='dist/release-proof';
async function releaseSourceFingerprint() {
  const files=['native-postgres-proof.mjs','native-release-pg18.mjs','native-release-receipt.mjs','native-email-verification-pg18.mjs','../lib/auth/email-verification-proof.ts','../lib/auth/native.ts','../tests/native-postgres-live.integration.test.ts'];
  return digest(await Promise.all(files.map(async file=>({file,checksum:digest((await readFile(new URL(file,import.meta.url),'utf8')).replaceAll('\r\n','\n'))}))));
}
export async function verifyReceipt(directory) {
  const proof=JSON.parse(await readFile(`${directory}/recovery.json`,'utf8'));
  await assertRecoveryProof({'recovery-proof':`${directory}/recovery.json`,'recovery-proof-fingerprint':proof.fingerprint});
  const release=JSON.parse(await readFile(`${directory}/release.json`,'utf8'));
  const migrations=nativeMigrationManifest().map(({name,checksum})=>({name,checksum}));
  if(release.format!=='MediaTrackerReleasePg18V1'||release.status!=='PASS'||release.pgMajor!==18
    ||JSON.stringify(release.migrations)!==JSON.stringify(migrations)||migrations.length!==15
    ||release.recoveryFingerprint!==proof.fingerprint||release.sourceFingerprint!==await releaseSourceFingerprint()
    ||release.fingerprint!==digest({...release,fingerprint:undefined})
    ||['fresh','upgrade','independentConnections','guestLimits','authenticatedQuotas','rlsCasTombstone'].some(k=>release[k]!=='PASS')
    ||release.sourceGitSha!==process.env.GITHUB_SHA)throw new Error('release_receipt_invalid');
}
async function create() {
  if(!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA??''))throw new Error('release_sha_required');
  for(const argument of [[],['--p2'],['--release']]) {
    const r=spawnSync(process.execPath,['scripts/native-postgres-proof.mjs',...argument],{encoding:'utf8',timeout:180000});
    if(r.status!==0||r.error||!r.stdout.includes('PASS:')) {
      const stage=r.stderr?.match(/stage=([A-Z0-9_]{1,64})(?:;|$)/)?.[1];
      if(stage)console.error(`PG18_STAGE=${stage}`);
      const check=r.stderr?.match(/check=([a-z_]{1,64})(?:;|$)/)?.[1];
      if(check)console.error(`PG18_CHECK=${check}`);
      const sqlstate=r.stderr?.match(/sqlstate=([0-9A-Z]{5})(?:;|$)/)?.[1];
      const assertion=r.stderr?.match(/assertion=(guest_[a-z_]{1,64})(?:;|$)/)?.[1];
      if(sqlstate)console.error(`PG18_SQLSTATE=${sqlstate}`);
      const sqlLine=r.stderr?.match(/sql_line=([1-9][0-9]{0,5})(?:;|$)/)?.[1];
      if(sqlLine)console.error(`PG18_SQL_LINE=${sqlLine}`);
      if(assertion)console.error(`PG18_ASSERTION=${assertion}`);
      const authLine=r.stderr?.match(/auth_line=([1-9][0-9]{0,5})(?:;|$)/)?.[1];
      if(authLine)console.error(`PG18_AUTH_ASSERTION_LINE=${authLine}`);
      const authStatus=r.stderr?.match(/auth_status=([1-5][0-9]{2})(?:;|$)/)?.[1];
      if(authStatus)console.error(`PG18_AUTH_RESPONSE_STATUS=${authStatus}`);
      const authError=r.stderr?.match(/auth_error=(pool_acquisition_timeout|schema_mismatch|api_error|unknown)(?:;|$)/)?.[1];
      if(authError)console.error(`PG18_AUTH_ERROR=${authError}`);
      throw new Error('release_pg18_failed');
    }
    console.log(`PG18_${argument[0]??'P1'}=PASS`);
  }
  const result=spawnSync(process.execPath,['scripts/native-recovery-proof.mjs','--proof'],{encoding:'utf8',timeout:240000});
  if(result.status!==0||result.error) {
    try {
      const failure=JSON.parse(result.stdout.trim());
      if(/^[A-Z0-9_]{1,64}$/.test(failure.stage??''))console.error(`RECOVERY_STAGE=${failure.stage}`);
      if(/^(?:[0-9A-Z]{5}|native_[a-z_]{1,80})$/.test(failure.errorCode??''))console.error(`RECOVERY_CODE=${failure.errorCode}`);
    } catch { /* Never relay arbitrary child diagnostics. */ }
    throw new Error('release_recovery_failed');
  }
  const proof=JSON.parse(result.stdout.trim());
  // Rebuild the allowlisted record rather than saving raw child output.
  const keys=['format','status','kind','pgMajor','sourceFingerprint','ledger','rows','ownershipAcl','roleSettings','files','twoUserIsolation','live','fingerprint'];
  if(Object.keys(proof).some(k=>!keys.includes(k)))throw new Error('release_recovery_receipt_invalid');
  await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(`${directory}/recovery.json`,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
  await assertRecoveryProof({'recovery-proof':`${directory}/recovery.json`,'recovery-proof-fingerprint':proof.fingerprint});
  const release={format:'MediaTrackerReleasePg18V1',status:'PASS',sourceGitSha:process.env.GITHUB_SHA,sourceFingerprint:await releaseSourceFingerprint(),pgMajor:18,
    fresh:'PASS',upgrade:'PASS',independentConnections:'PASS',guestLimits:'PASS',authenticatedQuotas:'PASS',rlsCasTombstone:'PASS',
    migrations:nativeMigrationManifest().map(({name,checksum})=>({name,checksum})),recoveryFingerprint:proof.fingerprint,live:'NOT_RUN'};
  release.fingerprint=digest(release);
  await writeFile(`${directory}/release.json`,JSON.stringify(release,null,2)+'\n',{flag:'wx',mode:0o600});
  await verifyReceipt(directory);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length===2)await create();
    else if(process.argv.length===3&&process.argv[2]==='--verify')await verifyReceipt(directory);
    else throw new Error('release_receipt_arguments_denied');
    console.log('PG18_RELEASE_RECEIPT=PASS');
  } catch {console.error('PG18_RELEASE_RECEIPT=FAIL; diagnostics redacted');process.exitCode=1;}
}
