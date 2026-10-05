import { requireSafe } from "./recovery.mjs";
import { isValidProviderUserAgent } from "../../lib/api/provider-identity.ts";

// Source contract, not an env export or hosted-setting assertion.
const fixed = {
  AI_SERVER_ACCESS_MODE:"disabled", D7_RESEARCH_ROLLOUT_MODE:"disabled",
  D7_RESEARCH_SHADOW_ENABLED:"0", D7_RESEARCH_PUBLIC_CITATIONS_ENABLED:"0",
  D7_RESEARCH_EVIDENCE_CACHE_ENABLED:"0", MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE:"off",
};
const core = ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE","NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED",
  "NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE","NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED",
  "NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE","NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH",
  "NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION","RATE_LIMIT_IDENTITY_HMAC_KEY",
  "RATE_LIMIT_RPC_SIGNING_KEY","RATE_LIMIT_RPC_KEY_VERSION","RATE_LIMIT_RPC_AUDIENCE"];
const optional=["MEDIA_TRACKER_PROVIDER_USER_AGENT","RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY","MEDIA_TRACKER_EMBEDDING_CACHE"];
export const forbidden = /^(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_TEST_.*|SUPABASE_PRODUCTION_URL|D8_.*|PRIVACY_.*|MEDIATRACKER_DR_.*|.*LIVE_SMOKE.*|.*FIXTURE.*|RATE_LIMIT_LOCAL_TEST_IP|(?:OPENAI|GROQ|GEMINI|OPENROUTER)_.*|TMDB_.*|ANILIST_.*|OMDB_.*|AI_PROVIDER|AI_.*SEMANTIC.*|MEDIA_TRACKER_ML_.*|MEDIA_TRACKER_EMBEDDING_MODEL|MEDIA_TRACKER_WIKIMEDIA_.*|MEDIA_TRACKER_RESEARCH_.*|D7_ANNOTATION_.*|D7_(?:OPENAI|GROQ|OPENROUTER)_.*|D7_RESEARCH_(?:DISCOVERY|EXTRACTION)_.*|DATABASE_URL|PG.*|VERCEL_TOKEN|NEXT_PUBLIC_.*(?:SECRET|PASSWORD|SERVICE_ROLE|HMAC|SIGNING).*)$/;
export function environmentContract() {
  return [...core,...Object.keys(fixed),...optional].map(name => ({name,
    LOCAL:"optional isolated offline/local; explicit values required for enabled Cloud/distributed mode",
    CI:"absent: credential-free offline suite",
    PREVIEW:optional.includes(name)?"optional":"required isolated approved target",
    PRODUCTION:optional.includes(name)?"optional":"required independently verified target",
    allowed:fixed[name] ?? (name.includes("HMAC") || name.includes("SIGNING") ? ">=32 chars; independent; secret never recorded"
      : name.includes("SCHEMA_STAGE") ? "matches verified ledger" : "source-validated value class; see 06D"),
    visibility:name.startsWith("NEXT_PUBLIC_")?"public build-time":/(?:KEY)$/.test(name)?"server secret":"server non-secret",
    owner:/RATE_LIMIT/.test(name)?"security operator":/PROVIDER/.test(name)?"provider operator":"release operator",
    failure:"unset/invalid keeps capability disabled or blocks acceptance; no substitute target"}));
}
export function validateReleaseEnvironment(env,scope) {
  requireSafe(["LOCAL","CI","PREVIEW","PRODUCTION"].includes(scope) && env && typeof env === "object" && !Array.isArray(env));
  const errors=[];
  const allowed=new Set([...core,...Object.keys(fixed),...optional,"VERCEL","VERCEL_URL","VERCEL_ENV","NODE_ENV","CI","GITHUB_ACTIONS","NEXT_TELEMETRY_DISABLED"]);
  for(const [name,value] of Object.entries(env)) {
    requireSafe(/^[A-Z][A-Z0-9_]*$/.test(name) && typeof value==="string");
    if(forbidden.test(name)) errors.push({name,reason:"forbidden"});
    if(scope==="CI" && !["CI","GITHUB_ACTIONS","NEXT_TELEMETRY_DISABLED","NODE_ENV"].includes(name)) errors.push({name,reason:"CI requires absence"});
    if(!allowed.has(name)) errors.push({name,reason:"unreviewed variable"});
  }
  const hosted=["PREVIEW","PRODUCTION"].includes(scope);
  if(hosted) {
    for(const name of [...core,...Object.keys(fixed)]) if(!env[name]) errors.push({name,reason:"required"});
  }
  for(const [name,value] of Object.entries(fixed)) if(env[name] !== undefined && env[name]!==value) errors.push({name,reason:"v1 disabled policy"});
  for(const name of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_APP_URL"]) if(env[name]) {
    try {
      const u=new URL(env[name]);
      if(u.username || u.password || u.search || u.hash || !["https:",...(scope==="LOCAL"?["http:"]:[])].includes(u.protocol)
        || (hosted && /^(?:localhost|127\.|\[::1\])/.test(u.hostname))) throw new Error();
    } catch {errors.push({name,reason:"invalid origin"});}
  }
  if(Boolean(env.NEXT_PUBLIC_SUPABASE_URL)!==Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) errors.push({name:"NEXT_PUBLIC_SUPABASE_ANON_KEY",reason:"target pair required"});
  const lim=core.filter(name=>name.startsWith("RATE_LIMIT_"));
  if(lim.some(name=>env[name])) {
    for(const name of lim) if(!env[name]) errors.push({name,reason:"complete limiter contract required"});
    for(const name of ["RATE_LIMIT_IDENTITY_HMAC_KEY","RATE_LIMIT_RPC_SIGNING_KEY","RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY"])
      if(env[name] && env[name].length<32) errors.push({name,reason:"key too short"});
    const keys=[env.RATE_LIMIT_IDENTITY_HMAC_KEY,env.RATE_LIMIT_RPC_SIGNING_KEY,env.RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY].filter(Boolean);
    if(new Set(keys).size!==keys.length) errors.push({name:"RATE_LIMIT_RPC_SIGNING_KEY",reason:"keys must be independent"});
    if(!/^[a-zA-Z0-9_-]{1,32}$/.test(env.RATE_LIMIT_RPC_KEY_VERSION??"")) errors.push({name:"RATE_LIMIT_RPC_KEY_VERSION",reason:"invalid version"});
    if(!/^[a-zA-Z0-9:_-]{1,96}$/.test(env.RATE_LIMIT_RPC_AUDIENCE??"")) errors.push({name:"RATE_LIMIT_RPC_AUDIENCE",reason:"invalid audience"});
  }
  if(env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE!==undefined && !["legacy","d2b1","d2c1"].includes(env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE)) errors.push({name:"NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE",reason:"unknown stage"});
  if(env.NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE!==undefined && !["absent","v1"].includes(env.NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE)) errors.push({name:"NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE",reason:"unknown stage"});
  for(const name of ["NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED","NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED","NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE"])
    if(env[name]!==undefined && !["true","false"].includes(env[name])) errors.push({name,reason:"invalid boolean"});
  if(env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE==="d2c1" && env.NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED!=="true") errors.push({name:"NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED",reason:"post-PK schema requires V2"});
  if(env.NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED==="true" && env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE==="legacy") errors.push({name:"NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE",reason:"V2 requires additive schema"});
  if(env.NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED==="true" && (env.NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE!=="v1" || env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE!=="d2c1")) errors.push({name:"NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE",reason:"Goals prerequisites absent"});
  if(env.NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION && env.NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION!=="d2c2") errors.push({name:"NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION",reason:"unsupported client minimum"});
  if(env.NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH && !/^v1-[a-f0-9]{12}$/.test(env.NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH)) errors.push({name:"NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH",reason:"derive fresh epoch from accepted SHA"});
  if(env.MEDIA_TRACKER_EMBEDDING_CACHE && env.MEDIA_TRACKER_EMBEDDING_CACHE!=="off") errors.push({name:"MEDIA_TRACKER_EMBEDDING_CACHE",reason:"v1 cache must remain off"});
  // Operator supplies a reviewed UA; syntactic validity is separately verified by
  // lib/api/provider-identity.ts and actual registration is a manual gate.
  if(env.MEDIA_TRACKER_PROVIDER_USER_AGENT && !isValidProviderUserAgent(env.MEDIA_TRACKER_PROVIDER_USER_AGENT)) errors.push({name:"MEDIA_TRACKER_PROVIDER_USER_AGENT",reason:"invalid provider identity/contact contract"});
  return {valid:errors.length===0,scope,errors,limits:["No hosted target/key pairing, Vault provisioning, registration, Auth or ledger proof","Platform-managed variables require separate provenance; user overrides forbidden"]};
}
