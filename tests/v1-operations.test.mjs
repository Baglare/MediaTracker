import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertTarget, hash, encrypt, decrypt, migrationManifest, classification, createPackage, verifyPackage, rehearse, verifyDatabase, outsideOutput, root } from "../scripts/ops/recovery.mjs";
import { main, parse } from "../scripts/ops/cli.mjs";
import { checkOperationalSources } from "../scripts/ops/verify-source.mjs";
import { validateReleaseEnvironment } from "../scripts/ops/release-policy.mjs";
import { createDisposableDrAdapter, verificationSql, validateDrProof } from "../scripts/ops/disposable-dr.mjs";
import { checkFile, checkEnvironment } from "../scripts/ci-checks.mjs";

const key="a".repeat(64), fingerprint=hash("independently reviewed synthetic target");
const migrations=migrationManifest();
function sourceReport() {
  const table=name=>({schema:"public",name,rls:true,
    constraints:[[`${name}_pkey`,"p","PRIMARY KEY (id)",true],[`${name}_owner_fkey`,"f","FOREIGN KEY (user_id)",true]],
    triggers:[["a_privacy_row","O","BEFORE ROW"],["a_privacy_statement","O","BEFORE STATEMENT"]]});
  return {ledger:migrations.map(m=>m.version),tables:[...["profiles","media_items","progress_logs","goals"].map(table),
    {schema:"private_privacy_ops",name:"account_lifecycle",rls:true},{schema:"private_rate_limit",name:"buckets",rls:true}],
    functions:[{name:"assert_account_write_allowed"},{name:"consume_application_rate_limit_v1"}],
    roles:["anon","authenticated","postgres"],extensions:[["pgcrypto","1.3","extensions"]],authIdentityHash:hash("synthetic identities"),unsafePrivateGrants:false,
    managedBindings:["CREATE TRIGGER privacy_initialize_account AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.initialize_account_v1()",
      "CREATE TRIGGER a_privacy_storage BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION private_privacy_ops.guard_storage_v1()"]};
}
async function withPackage(fn) {
  const parent=mkdtempSync(path.join(tmpdir(),"mediatracker-dr-test-")),directory=path.join(parent,"package");
  const expected=sourceReport();
  try {
    const result=createPackage({output:directory,key,fingerprint,database:Buffer.from("PGDMP synthetic archive, never SQL execution"),verification:expected,
      roles:expected.roles,versions:{pg_dump:"15.8",pg_restore:"15.8",psql:"15.8"}});
    await fn({parent,directory,expected,manifestHash:result.manifestSha256});
  } finally {
    assert.ok(parent.startsWith(path.join(tmpdir(),"mediatracker-dr-test-")));
    rmSync(parent,{recursive:true,force:true});
  }
}
function mockAdapter(expected,overrides={}) {
  const calls=[];
  return {calls,async prove(f){assert.equal(f,fingerprint);calls.push("proof");},async prerequisites(){calls.push("empty");return {empty:true,roles:expected.roles,extensions:expected.extensions,authIdentityHash:expected.authIdentityHash};},
    async restore(section){calls.push(section);},async restoreBindings(){calls.push("bindings");},async inspect(){calls.push("verify");return expected;},...overrides};
}
const options={environment:"disposable",fingerprint,execute:true,acknowledgeTrustedBackup:true,acknowledgeQuarantine:true};

test("Production, Staging and unknown classifications cannot reach a transport",async()=>{
  for(const environment of ["production","staging","local","unknown",undefined]) {
    assert.throws(()=>assertTarget({environment,fingerprint}));
    await assert.rejects(main(["--mode","backup","--environment",String(environment),"--fingerprint",fingerprint,"--execute"]));
  }
});
test("missing, partial or forbidden target fingerprints are refused",()=>{
  for(const f of ["",undefined,"http://127.0.0.1:54321","a".repeat(10)]) assert.throws(()=>assertTarget({environment:"disposable",fingerprint:f}));
  assert.throws(()=>assertTarget({...options,productionFingerprint:fingerprint}));
  assert.throws(()=>assertTarget({...options,stagingFingerprint:fingerprint}));
});
test("positive Docker identity cannot be replaced by name, loopback, mounts or non-isolated networking",()=>{
  const fixtureLabel="mediatracker-privacy-disposable-v1",netName="mediatracker_privacy_05f_disposable";
  const db={Name:"/mediatracker_privacy_05f_db",Id:"d".repeat(64),Image:"sha256:synthetic",State:{Running:true},
    Config:{Image:"supabase/postgres:15",Labels:{"mediatracker.privacy.fixture":fixtureLabel,"mediatracker.privacy.database":"privacy_05f_disposable"}},
    Mounts:[],HostConfig:{Privileged:false,NetworkMode:netName},NetworkSettings:{Networks:{[netName]:{}},Ports:{}}};
  const api={Name:"/mediatracker_privacy_05f_api",State:{Running:true},Config:{Image:"kong:2",Labels:{"mediatracker.privacy.fixture":fixtureLabel}},
    NetworkSettings:{Networks:{[netName]:{}},Ports:{"8000/tcp":[{HostIp:"127.0.0.1",HostPort:"54321"}]}}};
  const network={Id:"f".repeat(64),Internal:true};
  const f=hash(JSON.stringify({container:db.Id,image:db.Image,network:network.Id,database:"privacy_05f_disposable",label:"mediatracker-dr-disposable-v1"}));
  assert.equal(validateDrProof(db,api,network,f),f);
  for(const mutate of [v=>v.Id="e".repeat(64),v=>v.Mounts=[{}],v=>v.HostConfig.Privileged=true,v=>v.NetworkSettings.Ports={"5432/tcp":[{HostIp:"127.0.0.1"}]}]) {
    const bad=structuredClone(db);mutate(bad);assert.throws(()=>validateDrProof(bad,api,network,f));
  }
  assert.throws(()=>validateDrProof(db,api,{...network,Internal:false},f));
});
test("default backup is offline plan, and duplicate/unknown flags cannot smuggle targets",async()=>{
  const r=await main(["--mode","backup","--environment","disposable","--fingerprint",fingerprint]);
  assert.equal(r.status,"PLAN_ONLY");assert.ok(r.exclusions.length>=6);
  assert.throws(()=>parse(["--mode","backup","--mode","restore"]));
  assert.throws(()=>parse(["--mode","backup","--database-url","postgres://example.invalid"]));
});
test("encryption authenticates ciphertext and key, keeps plaintext out of stored bytes",()=>{
  const plain=Buffer.from("synthetic sensitive fixture"),encrypted=encrypt(plain,key);
  assert.equal(encrypted.includes(plain),false);assert.deepEqual(decrypt(encrypted,key),plain);
  assert.throws(()=>decrypt(encrypted,"b".repeat(64)));
  encrypted[18]^=1;assert.throws(()=>decrypt(encrypted,key));
  assert.throws(()=>encrypt(plain,"short"));
});
test("backup output cannot land in repository or overwrite an existing directory",async()=>{
  assert.throws(()=>outsideOutput(path.join(root,"docs","bad")));
  await withPackage(({directory,expected})=>{
    assert.throws(()=>createPackage({output:directory,key,fingerprint,database:Buffer.from("PGDMP"),verification:expected,roles:expected.roles,versions:{pg_dump:"15.8",pg_restore:"15.8",psql:"15.8"}}));
  });
});
test("encrypted package verifies critical artifacts, migrations, relative path hashes",async()=>withPackage(({directory,manifestHash})=>{
  const m=verifyPackage(directory,manifestHash);
  assert.equal(m.migrations.length,25);assert.equal(m.storage.binariesIncluded,0);
  assert.equal(m.target.classification,"disposable");
  assert.equal(m.artifacts.some(a=>a.path.startsWith("operations/")),true);
}));
test("missing backup file fails before transport proof",async()=>withPackage(async({directory,manifestHash,expected})=>{
  rmSync(path.join(directory,"database.dump.aes"));
  const adapter=mockAdapter(expected);
  await assert.rejects(rehearse({directory,manifestHash,options,key,adapter}));assert.deepEqual(adapter.calls,[]);
}));
test("checksum and critical zero-byte failures reject restoration",async()=>withPackage(async({directory,manifestHash,expected})=>{
  writeFileSync(path.join(directory,"database.dump.aes"),"");
  const adapter=mockAdapter(expected);
  await assert.rejects(rehearse({directory,manifestHash,options,key,adapter}));assert.deepEqual(adapter.calls,[]);
}));
test("nonempty artifact corruption fails its checksum before decrypt/SQL",async()=>withPackage(({directory,manifestHash})=>{
  const p=path.join(directory,"database.dump.aes"),bytes=readFileSync(p);bytes[18]^=1;writeFileSync(p,bytes);
  assert.throws(()=>verifyPackage(directory,manifestHash));
}));
test("manifest tampering cannot pass independent pinned digest",async()=>withPackage(({directory,manifestHash})=>{
  const p=path.join(directory,"manifest.json"),m=JSON.parse(readFileSync(p));m.sourceCommit="0".repeat(40);writeFileSync(p,JSON.stringify(m));
  assert.throws(()=>verifyPackage(directory,manifestHash));
}));
test("duplicate path and traversal fail even with an explicitly trusted new manifest hash",async()=>withPackage(({directory})=>{
  const p=path.join(directory,"manifest.json"),original=JSON.parse(readFileSync(p));
  for(const edit of [m=>m.artifacts.push({...m.artifacts[0]}),m=>m.artifacts[0].path="../outside.dump",m=>m.artifacts[0].bytes=0]) {
    const m=structuredClone(original);edit(m);const b=Buffer.from(JSON.stringify(m));writeFileSync(p,b);assert.throws(()=>verifyPackage(directory,hash(b)));
  }
}));
test("restore defaults to integrity plan without even proving the target",async()=>withPackage(async({directory,manifestHash,expected})=>{
  const adapter=mockAdapter(expected),report=await rehearse({directory,manifestHash,options:{...options,execute:false},adapter});
  assert.equal(report.status,"PLAN_ONLY");assert.deepEqual(adapter.calls,[]);
}));
test("restore requires empty target, Auth/role/extension prerequisites and trusted quarantine acknowledgement",async()=>withPackage(async({directory,manifestHash,expected})=>{
  for(const patch of [{empty:false},{authIdentityHash:"different"},{roles:["postgres"]},{extensions:[]}]) {
    const adapter=mockAdapter(expected,{async prerequisites(){return {empty:true,authIdentityHash:expected.authIdentityHash,roles:expected.roles,extensions:expected.extensions,...patch};}});
    await assert.rejects(rehearse({directory,manifestHash,options,key,adapter}));assert.equal(adapter.calls.includes("pre-data"),false);
  }
  for(const field of ["acknowledgeTrustedBackup","acknowledgeQuarantine"]) await assert.rejects(rehearse({directory,manifestHash,options:{...options,[field]:false},key,adapter:mockAdapter(expected)}));
}));
test("restore orders dependencies, verifies DB, and cannot claim full disaster recovery",async()=>withPackage(async({directory,manifestHash,expected})=>{
  const adapter=mockAdapter(expected),report=await rehearse({directory,manifestHash,options,key,adapter});
  assert.deepEqual(adapter.calls,["proof","empty","pre-data","data","post-data","bindings","verify"]);
  assert.equal(report.database,"DB_RESTORE_VERIFIED");assert.equal(report.disasterRecovery,"LIVE_UNVERIFIED");
  assert.ok(report.remaining.includes("privacy-reconciliation-manual"));
}));
test("first SQL failure stops before constraints and success verification",async()=>withPackage(async({directory,manifestHash,expected})=>{
  const adapter=mockAdapter(expected,{async restore(section){this.calls.push(section);if(section==="data") throw new Error("synthetic failure");}});
  await assert.rejects(rehearse({directory,manifestHash,options,key,adapter}));
  assert.deepEqual(adapter.calls,["proof","empty","pre-data","data"]);
}));
test("DB exit-success alone does not mask ledger/RLS/PK/FK/barrier/grant corruption",()=>{
  const expected=sourceReport();
  for(const mutate of [r=>r.ledger.pop(),r=>r.tables[0].rls=false,r=>r.tables[0].constraints=[],r=>r.tables[2].constraints=r.tables[2].constraints.filter(c=>c[1]!=="f"),r=>r.tables[1].triggers=[],r=>r.unsafePrivateGrants=true,r=>r.functions.pop()]) {
    const actual=structuredClone(expected);mutate(actual);assert.throws(()=>verifyDatabase(expected,actual,migrations));
  }
});
test("unproven Docker adapter cannot inspect, dump or restore a database",async()=>{
  const adapter=createDisposableDrAdapter();
  await assert.rejects(adapter.inspect());await assert.rejects(adapter.dump());await assert.rejects(adapter.restore("data",Buffer.from("PGDMP")));
  assert.ok(verificationSql.includes("read only"));assert.ok(verificationSql.includes("pg_constraint"));assert.ok(verificationSql.includes("pg_policy"));
});
function hostedEnv() {return {NEXT_PUBLIC_SUPABASE_URL:"https://synthetic.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"synthetic-public",NEXT_PUBLIC_APP_URL:"https://release.example.invalid",
  NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE:"d2c1",NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED:"true",NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE:"v1",NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED:"true",
  NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE:"false",NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH:"v1-012345abcdef",NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION:"d2c2",
  RATE_LIMIT_IDENTITY_HMAC_KEY:"i".repeat(32),RATE_LIMIT_RPC_SIGNING_KEY:"s".repeat(32),RATE_LIMIT_RPC_KEY_VERSION:"v1",RATE_LIMIT_RPC_AUDIENCE:"synthetic:preview",
  AI_SERVER_ACCESS_MODE:"disabled",D7_RESEARCH_ROLLOUT_MODE:"disabled",D7_RESEARCH_SHADOW_ENABLED:"0",D7_RESEARCH_PUBLIC_CITATIONS_ENABLED:"0",D7_RESEARCH_EVIDENCE_CACHE_ENABLED:"0",MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE:"off"};}
test("env accepts intended classes but rejects missing/forbidden/unknown controls without printing values",()=>{
  assert.equal(validateReleaseEnvironment(hostedEnv(),"PREVIEW").valid,true);
  const e=hostedEnv();e.SUPABASE_SERVICE_ROLE_KEY="secret-never-output";e.D8_STAGING_DATABASE_URL="private-never-output";e.PRIVACY_DISPOSABLE_SERVICE_ROLE_KEY="private";e.AI_SERVER_ACCESS_MODE="authenticated";
  const r=validateReleaseEnvironment(e,"PRODUCTION");assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes("secret-never-output"),false);assert.equal(JSON.stringify(r).includes("private-never-output"),false);
  const missing=hostedEnv();delete missing.RATE_LIMIT_RPC_AUDIENCE;assert.equal(validateReleaseEnvironment(missing,"PRODUCTION").valid,false);
});
test("env rejects limiter key reuse, Cloud stage mismatch, stale epoch, paid/provider enablement, localhost",()=>{
  for(const patch of [{RATE_LIMIT_RPC_SIGNING_KEY:"i".repeat(32)},{NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE:"legacy"},{NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE:"absent"},
    {NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH:"d8-v1-3a847701"},{TMDB_READ_ACCESS_TOKEN:"synthetic"},{ANILIST_PUBLIC_ACCESS_MODE:"authorized"},{OMDB_API_KEY:"synthetic"},{NEXT_PUBLIC_APP_URL:"http://localhost:3000"}]) assert.equal(validateReleaseEnvironment({...hostedEnv(),...patch},"PRODUCTION").valid,false);
  assert.equal(validateReleaseEnvironment({},"CI").valid,true);assert.equal(validateReleaseEnvironment(hostedEnv(),"CI").valid,false);
  assert.equal(validateReleaseEnvironment({...hostedEnv(),MEDIA_TRACKER_PROVIDER_USER_AGENT:"MediaTracker/x (contact missing)"},"PRODUCTION").valid,false);
  assert.throws(()=>checkEnvironment(["package.json"],{MEDIATRACKER_DR_ENCRYPTION_KEY:key}));
  assert.throws(()=>checkEnvironment(["package.json"],{PRIVACY_DISPOSABLE_SERVICE_ROLE_KEY:"synthetic"}));
});
test("migration classes prohibit blind down/security/privacy rollback and source manifest matches",()=>{
  assert.ok(classification("20260728120000_owner_scoped_primary_key_enforcement.sql").includes("NON_ADDITIVE"));
  assert.ok(classification("20261005140000_privacy_participant_detachment.sql").includes("PRIVACY_CRITICAL"));
  assert.equal(checkOperationalSources().status,"PASS");
});
test("runtime static and dynamic imports cannot reach ops",()=>{
  for(const source of ["import x from '../../scripts/ops/cli.mjs'","export * from '@/scripts/ops/recovery.mjs'","require('../../scripts/ops/cli.mjs')","import('../../scripts/ops/cli.mjs')"]) assert.throws(()=>checkFile("lib/synthetic.ts",source));
});
test("historical D8 evidence is byte-preserved behind new frozen canonical banner",()=>{
  const originalHashes={
    D8_STAGING_CUTOVER_AND_OPERATIONS:"52d06216aa44a3a01b3bc4562ccf5473270d7ac64cea54bde001f874f730dd2a",
    D8_PRODUCTION_CUTOVER_RUNBOOK:"215d23da38289715df2cc51742ca779dd39f76040f5a921d810c91e04fb7b147",
    D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD:"e1731a609e90b83304f457584d6cf56d4e31a1f4222c2ccf27dd67655ca7a620",
    D8_POST_DEPLOY_SMOKE_CHECKLIST:"0bbafe479c41811caae6f441a0adfc58d05e6f9d8ba7302c5b47af602ebf0faf",
    D8_RELEASE_CANDIDATE_ACCEPTANCE:"2294eaea74b880e64bc4a80d63455022c05934da0c942f93e3fa940d44809c85",
    D8_RELEASE_ENV_MATRIX:"2acdd3fed6e261f970aea8c3acb8e27b879186b5f719b3f758d825b2f162e080",
  };
  for(const name of ["D8_STAGING_CUTOVER_AND_OPERATIONS","D8_PRODUCTION_CUTOVER_RUNBOOK","D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD","D8_POST_DEPLOY_SMOKE_CHECKLIST","D8_RELEASE_CANDIDATE_ACCEPTANCE","D8_RELEASE_ENV_MATRIX"]) {
    const filename=`docs/${name}.md`,current=readFileSync(filename,"utf8");
    // Trusted baseline pins work with shallow Actions history too.
    assert.equal(hash(current.slice(current.indexOf("\n\n")+2).replaceAll("\r\n","\n")),originalHashes[name]);
  }
});
test("CLI errors redact environment/subprocess diagnostics",()=>{
  const r=spawnSync(process.execPath,["scripts/ops/cli.mjs","--mode","verify","--package","private-never-print","--manifest-hash","bad"],{encoding:"utf8",env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}});
  assert.equal(r.status,1);assert.equal(r.stderr.includes("private-never-print"),false);
});
