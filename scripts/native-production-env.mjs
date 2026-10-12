// Operator-only: password arrives through stdin, never argv or logs.
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {isAbsolute,join} from 'node:path';
import {environmentContract,validateReleaseEnvironment} from './ops/release-policy.mjs';
import {operatorConfig} from './native-ops-target.mjs';
import {nativeRoles} from '../lib/backend/native-roles.mjs';
try {
  const [kind,template,output]=process.argv.slice(2);
  if(process.argv.length!==5||!['runtime','migrator','privacy_login','backup'].includes(kind)||!isAbsolute(template)||!isAbsolute(output))throw new Error();
  const info=await lstat(template);
  if(!info.isFile()||info.isSymbolicLink()||info.size>65536||(process.platform!=='win32'&&(info.mode&0o077)))throw new Error();
  const original=parseEnv(await readFile(template,'utf8'));
  let password='';for await(const chunk of process.stdin){password+=chunk;if(password.length>1024)throw new Error();}
  if(!password||/[\r\n\0]/.test(password))throw new Error();
  const roles=nativeRoles('hosting-production','shared-managed');
  const url=new URL('postgresql://127.0.0.1:5433/mediatracker_prod');url.username=roles[kind];url.password=password;
  const ca=join(process.env.HOME??'','.postgresql','root.crt');if(!isAbsolute(ca))throw new Error();
  let env;
  if(kind==='runtime') {
    const allowed=new Set(environmentContract().map(e=>e.name));
    env=Object.fromEntries(Object.entries(original).filter(([k])=>allowed.has(k)&&!k.startsWith('NEXT_PUBLIC_SUPABASE_')));
    Object.assign(env,{BACKEND_PROVIDER:'native',NATIVE_ROLE_PROFILE:'hosting-production',NATIVE_HOSTING_CAPABILITY:'shared-managed',
      DATABASE_URL:url.href,DATABASE_SSL_MODE:'verify-full',DATABASE_SSL_CA_FILE:ca,DATABASE_POOL_MAX:'2',
      BETTER_AUTH_URL:'https://mediatracker.baglare.com.tr',NEXT_PUBLIC_APP_URL:'https://mediatracker.baglare.com.tr',
      BETTER_AUTH_SECRET:randomBytes(48).toString('base64url'),RATE_LIMIT_IDENTITY_HMAC_KEY:randomBytes(48).toString('base64url'),
      RATE_LIMIT_RPC_SIGNING_KEY:randomBytes(48).toString('base64url'),RATE_LIMIT_RPC_KEY_VERSION:'v1',RATE_LIMIT_RPC_AUDIENCE:'mt-native-production',
      NATIVE_STORAGE_ROOT:join(process.env.HOME,'mt-production-storage'),TRUSTED_INGRESS_MODE:'unconfigured',
      NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED:'false',AI_SERVER_ACCESS_MODE:'disabled',D7_RESEARCH_ROLLOUT_MODE:'disabled',D7_RESEARCH_SHADOW_ENABLED:'0',
      D7_RESEARCH_PUBLIC_CITATIONS_ENABLED:'0',D7_RESEARCH_EVIDENCE_CACHE_ENABLED:'0',MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE:'off'});
    for(const key of ['MEDIA_TRACKER_PROVIDER_USER_AGENT','RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY','TRUSTED_INGRESS_HEADER','TRUSTED_INGRESS_PROOF_SHA256','TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED'])delete env[key];
    if(!validateReleaseEnvironment(env,'PRODUCTION').valid)throw new Error();
  } else {
    env={NATIVE_ROLE_PROFILE:'hosting-production',NATIVE_HOSTING_CAPABILITY:'shared-managed',NATIVE_OPS_ROLE_KIND:kind,
      NATIVE_OPS_ENVIRONMENT:'production',NATIVE_OPS_DATABASE_URL:url.href,NATIVE_OPS_SSL_MODE:'verify-full',NATIVE_OPS_SSL_CA_FILE:ca};
    operatorConfig(env);
  }
  const contents=Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n';
  const parsed=parseEnv(contents);if(Object.entries(env).some(([k,v])=>parsed[k]!==v))throw new Error();
  await writeFile(output,contents,{flag:'wx',mode:0o600});
  console.log('PRODUCTION_ENV_PREPARED_NO_OVERWRITE');
}catch{console.error('native_production_env_preparation_failed');process.exitCode=1;}
