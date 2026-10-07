import { nativeConfig } from './native-config.ts';
import { storageRoot } from './filesystem-core.mjs';

export const nativeDeploymentVariables = ['NATIVE_STORAGE_ROOT', 'TRUSTED_INGRESS_MODE',
  'TRUSTED_INGRESS_HEADER','TRUSTED_INGRESS_PROOF_SHA256','TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED',
  'DATABASE_CONNECTION_TIMEOUT_MS', 'DATABASE_IDLE_TIMEOUT_MS', 'DATABASE_STATEMENT_TIMEOUT_MS'];
/** Runtime/startup contract. Build validation supplies synthetic values separately. */
export function nativeDeploymentConfig(env, cwd = process.cwd()) {
  try {
    const config = nativeConfig(env);
    if (env.BACKEND_PROVIDER !== 'native') throw new Error();
    const root = storageRoot(env.NATIVE_STORAGE_ROOT, cwd);
    if (!['passenger','unconfigured'].includes(env.TRUSTED_INGRESS_MODE ?? '')) throw new Error();
    const ingress=[env.TRUSTED_INGRESS_HEADER,env.TRUSTED_INGRESS_PROOF_SHA256,env.TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED];
    if(ingress.some(Boolean) && (env.TRUSTED_INGRESS_MODE!=='passenger'
      || !/^x-[a-z0-9-]{1,60}$/.test(ingress[0]??'') || !/^[a-f0-9]{64}$/.test(ingress[1]??'') || ingress[2]!=='1')) throw new Error();
    const keys = [env.BETTER_AUTH_SECRET, env.RATE_LIMIT_IDENTITY_HMAC_KEY, env.RATE_LIMIT_RPC_SIGNING_KEY];
    if (keys.some(key => !key || key.length < 32) || new Set(keys).size !== keys.length
      || !/^[a-zA-Z0-9_-]{1,32}$/.test(env.RATE_LIMIT_RPC_KEY_VERSION ?? '')
      || !/^[a-zA-Z0-9:_-]{1,96}$/.test(env.RATE_LIMIT_RPC_AUDIENCE ?? '')) throw new Error();
    if (env.RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY && (env.RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY.length < 32
      || keys.includes(env.RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY))) throw new Error();
    if (config.production) {
      if (env.NEXT_PUBLIC_APP_URL !== config.authUrl || /^(localhost|127\.|\[::1\])/.test(new URL(config.authUrl).hostname)) throw new Error();
      for (const [name, value] of Object.entries({ AI_SERVER_ACCESS_MODE:'disabled', D7_RESEARCH_ROLLOUT_MODE:'disabled',
        D7_RESEARCH_SHADOW_ENABLED:'0', D7_RESEARCH_PUBLIC_CITATIONS_ENABLED:'0', D7_RESEARCH_EVIDENCE_CACHE_ENABLED:'0',
        MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE:'off' })) if (env[name] !== value) throw new Error();
    }
    for (const [name, value] of Object.entries(env)) if (value && /^(?:SUPABASE_|NEXT_PUBLIC_SUPABASE_|VERCEL(?:_|$)|NATIVE_OPS_|PG[A-Z_]|D8_|PRIVACY_|MEDIATRACKER_DR_|(?:OPENAI|GROQ|GEMINI|OPENROUTER|TMDB|ANILIST|OMDB)_|.*LIVE_SMOKE|.*FIXTURE|NEXT_PUBLIC_.*(?:SECRET|PASSWORD|SERVICE_ROLE|HMAC|SIGNING))/.test(name)) throw new Error();
    return { ...config, storageRoot: root, ingress: env.TRUSTED_INGRESS_MODE };
  } catch { throw new Error('native_deployment_configuration_invalid'); }
}
