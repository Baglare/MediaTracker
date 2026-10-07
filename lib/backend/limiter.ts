import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { identityEpochs, subjectDigest, type LimiterIdentity } from '../api/rate-limit-identity';
import { withReadTransaction, type AuthenticatedTransaction } from './transaction';

export function nativeSocialSubjects(userId:string,env:Record<string,string|undefined>=process.env,now=Date.now()) {
  const key=env.RATE_LIMIT_IDENTITY_HMAC_KEY, previous=env.RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY, audience=env.RATE_LIMIT_RPC_AUDIENCE;
  if(!key || key.length<32 || key===env.RATE_LIMIT_RPC_SIGNING_KEY || !audience || !/^[a-zA-Z0-9:_-]{1,96}$/.test(audience) || (previous && (previous.length<32 || previous===key || previous===env.RATE_LIMIT_RPC_SIGNING_KEY)))return null;
  return (previous?[previous,key]:[key]).flatMap(k=>identityEpochs(now).map(epoch=>({epoch,digest:subjectDigest(k,audience,'social_domain',epoch,{kind:'user',value:userId})})));
}
export function verifyNativeLimiterEnvelope(text:string,signature:string,key:string) {
  if(key.length<32 || Buffer.byteLength(text)>2048 || !/^[a-f0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(createHmac('sha256',key).update(text).digest(),Buffer.from(signature,'hex'));
}
export async function bindNativeSocialLimiter(tx:AuthenticatedTransaction) {
  const subjects=tx.userId?nativeSocialSubjects(tx.userId):null;
  if(subjects)await tx.query("SELECT set_config('app.social_subjects',$1,true)",[JSON.stringify(subjects)]);
}
export async function nativeSignedLimiter(operation:'consume'|'cooldown',payload:{p_envelope:string;p_signature_hex:string},config:{signingKey:string;audience:string;keyVersion:string},identity:LimiterIdentity) {
  if(!verifyNativeLimiterEnvelope(payload.p_envelope,payload.p_signature_hex,config.signingKey))throw new Error('rate_limit_proof_invalid');
  return withReadTransaction(async tx=>{
    if(identity.kind==='user' && tx.userId!==identity.value)throw new Error('owner_context_changed');
    await tx.query("SELECT set_config('app.limiter_audience',$1,true),set_config('app.limiter_key_version',$2,true)",[config.audience,config.keyVersion]);
    const name=operation==='consume'?'consume_application_rate_limit_v1':'report_provider_cooldown_v1';
    return (await tx.query(`SELECT app.${name}($1::text,$2::text) AS result`,[payload.p_envelope,payload.p_signature_hex])).rows[0]?.result;
  });
}
