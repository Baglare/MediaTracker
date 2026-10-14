// Operator-only, existing migrator login. Never accepts secret CLI arguments.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { authorizeTarget, withOperator } from './native-ops-target.mjs';
import { parseOperatorArgs, migrationHistory, validateHistory } from './native-migration-runner.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';

export async function installEmailVerificationKey(client, roles, { key, epoch, mode }) {
  if (!/^[0-9a-f]{64}$/.test(key ?? '') || !/^[1-9][0-9]{0,9}$/.test(epoch ?? '')
    || Number(epoch) > Math.floor(Date.now()/1000) || !['install','rotate','restore'].includes(mode))
    throw new Error('native_email_key_configuration_invalid');
  const bytes=Buffer.from(key,'hex'), hash=createHash('sha256').update(bytes).digest();
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${roles.owner}`);
    const frozen=(await client.query('SELECT frozen FROM app.release_write_state WHERE singleton FOR SHARE')).rows[0]?.frozen;
    if(frozen!==true)throw new Error();
    await client.query(`SET LOCAL ROLE ${roles.auth_owner}`);
    await client.query('LOCK TABLE native_auth.email_verification_key,native_auth.email_verification_epoch IN ACCESS EXCLUSIVE MODE');
    const pin=(await client.query('SELECT epoch,key_hash FROM native_auth.email_verification_epoch WHERE singleton')).rows[0];
    if(mode==='install' && pin || mode==='rotate' && (!pin || Number(epoch)<=Number(pin.epoch))
      || mode==='restore' && (!pin || Number(pin.epoch)!==Number(epoch) || !hash.equals(pin.key_hash)))throw new Error();
    await client.query('INSERT INTO native_auth.email_verification_key(singleton,epoch,key) VALUES(true,$1,$2) ON CONFLICT(singleton) DO UPDATE SET epoch=excluded.epoch,key=excluded.key',[epoch,bytes]);
    await client.query('INSERT INTO native_auth.email_verification_epoch(singleton,epoch,key_hash) VALUES(true,$1,$2) ON CONFLICT(singleton) DO UPDATE SET epoch=excluded.epoch,key_hash=excluded.key_hash',[epoch,hash]);
    await client.query('COMMIT');
  } catch {await client.query('ROLLBACK');throw new Error('native_email_key_install_refused');}
  finally {bytes.fill(0);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const options=parseOperatorArgs(process.argv.slice(2),['--mode']);
    if(!['install','rotate','restore'].includes(options.mode))throw new Error();
    if(!options.connect)console.log('EMAIL_KEY_PLAN=freeze; stop writers; verify logging; use existing migrator; install paired key/epoch; restart; verify; unfreeze');
    else await withOperator(process.env,async(client,config,target)=>{
      authorizeTarget(target,config,{...options,operation:'EMAIL_KEY',provisioner:true});
      if(config.kind!=='migrator')throw new Error();
      if(validateHistory(await migrationHistory(client,config.roles),nativeMigrationManifest(config.roles.profile)).length)throw new Error();
      // Parameter logging must be disabled BEFORE secret parameters are sent.
      const logging=(await client.query(`SELECT current_setting('log_parameter_max_length_on_error')='0'
        AND (current_setting('log_parameter_max_length')='0' OR
          (current_setting('log_statement')='none' AND current_setting('log_min_duration_statement')='-1'
            AND current_setting('log_min_duration_sample')='-1' AND current_setting('log_transaction_sample_rate')::numeric=0
            AND current_setting('log_duration')='off'))
        AND coalesce(current_setting('pgaudit.log_parameter',true),'off')='off' AS safe`)).rows[0]?.safe;
      if(logging!==true)throw new Error();
      if(options.apply)await installEmailVerificationKey(client,config.roles,{key:process.env.NATIVE_EMAIL_VERIFICATION_KEY,epoch:process.env.NATIVE_EMAIL_VERIFICATION_EPOCH,mode:options.mode});
      console.log(options.apply?'EMAIL_KEY=INSTALLED':'EMAIL_KEY=PREFLIGHT_PASS');
    });
  } catch {console.error('EMAIL_KEY=REFUSED; diagnostics redacted');process.exitCode=1;}
}
