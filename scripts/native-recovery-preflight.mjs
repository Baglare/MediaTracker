// Read-only backup preflight; never migrate, freeze, copy storage or invoke pg_dump.
import { pathToFileURL } from 'node:url';
import { withOperator, authorizeTarget } from './native-ops-target.mjs';
import { migrationHistory, validateHistory } from './native-migration-runner.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { inspectBackupCoverage } from './native-recovery-evidence.mjs';
import { assertPostgres18Tool } from './native-recovery.mjs';
export async function recoveryPreflight(client,config,target) {
  if(config.kind!=='backup'||config.roles.capability!=='shared-managed')throw new Error('native_backup_profile_invalid');
  // A first read-only inspection can report identity without granting apply authority.
  if(config.expected)authorizeTarget(target,config,{operation:'BACKUP',operator:true});
  await client.query('BEGIN READ ONLY');
  try {
    const pending=validateHistory(await migrationHistory(client,config.roles),nativeMigrationManifest(config.roles.profile)).map(e=>e.name);
    const coverage=pending.length?'NOT_RUN':await inspectBackupCoverage(client,config.roles);
    const state=pending.length?undefined:(await client.query('SELECT app.native_ops_state() AS state')).rows[0]?.state;
    let pg18='PASS';try{assertPostgres18Tool('pg_dump');}catch{pg18='NOT_RUN';}
    return {target,pending,coverage,pg18,existingFreeze:state?.frozen===true?'PASS':'NOT_RUN',liveBackup:'NOT_RUN',restore:'NOT_RUN'};
  } finally {await client.query('ROLLBACK');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.slice(2).join(' ')!=='--connect')throw new Error('native_recovery_preflight_arguments_invalid');
    console.log(JSON.stringify(await withOperator(process.env,recoveryPreflight),null,2));
  }catch{console.error('native_recovery_preflight_failed');process.exitCode=1;}
}
