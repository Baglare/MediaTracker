// No input target/credentials accepted. Creates an isolated, loopback-only,
// tmpfs-only ephemeral Docker DB from an ALREADY LOCAL image; never pulls.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nativeMigrationSteps } from './native-migrations.mjs';
import { startDisposableRelay, validateDisposableTarget, verifyDisposableRelay } from './native-disposable-relay.mjs';
import { Client } from 'pg';
import { performance } from 'node:perf_hooks';
import { prepareReleaseUpgrade, verifyReleaseUpgrade, proveReleaseConcurrency } from './native-release-pg18.mjs';
const release = process.argv[2] === '--release';
const p2 = process.argv[2] === '--p2' || release;
if (process.argv.slice(2).some(arg => !['--p2','--release'].includes(arg)) || process.argv.length > 3) throw new Error('proof_target_arguments_denied');
const image = 'postgres:18-alpine';
const name = `mt-p1-${randomUUID()}`;
let localEndpoint;
let interrupted=false,cleaning=false,activeChild;
const interrupt=()=>{interrupted=true;process.exitCode=1;activeChild?.kill('SIGKILL');};
process.once('SIGINT',interrupt);
process.once('SIGTERM',interrupt);
const dockerEnv = { ...process.env };
delete dockerEnv.DOCKER_HOST;
delete dockerEnv.DOCKER_CONTEXT;
delete dockerEnv.DOCKER_TLS_VERIFY;
delete dockerEnv.DOCKER_CERT_PATH;
function docker(args, input) {
  if (!localEndpoint || (interrupted && !cleaning)) throw new Error('BLOCKED_ENVIRONMENT');
  const r = spawnSync('docker', ['--host',localEndpoint,...args], { input, env:dockerEnv, encoding:'utf8', timeout:15000 });
  if(r.status!==0) throw new Error('BLOCKED_ENVIRONMENT');
  return r.stdout.trim();
}
let id, network, relay;
let stage='DOCKER_CONTEXT';
let sqlstate;
let assertion;
const fixtureAssertions=new Set([...readFileSync(new URL('../database/native/tvmaze-guest-proof.sql',import.meta.url),'utf8').matchAll(/RAISE EXCEPTION '(guest_[a-z_]+)'/g)].map(match=>match[1]));
// Only a five-character code from PostgreSQL's fixed error-class vocabulary may
// leave the runner. Never relay messages, query text, context, paths or values.
const allowedSqlstateClasses=new Set(['00','01','02','03','08','09','0A','0B','0F','0L','0P','0Z','20','21','22','23','24','25','26','27','28','2B','2D','2F','34','38','39','3B','3D','3F','40','42','44','53','54','55','57','58','F0','HV','P0','XX']);
function p2Sql(sql,fixture=false) {
  if(!localEndpoint || interrupted) throw new Error('proof_interrupted');
  const r=spawnSync('docker',['--host',localEndpoint,'exec','-i',id,'psql','-X','-v','ON_ERROR_STOP=1','-v',fixture?'VERBOSITY=verbose':'VERBOSITY=sqlstate','-U','postgres','-d','mt_p1_proof'],
    {input:sql,env:dockerEnv,encoding:'utf8',timeout:15000});
  if(r.status!==0 || r.error || r.signal) {
    const codes=[...(r.stderr??'').matchAll(/^(?:psql:<stdin>:\d+: )?ERROR:\s+([0-9A-Z]{5})(?::[^\n]*)?\s*$/gm)].map(match=>match[1]);
    if(r.status===3 && !r.error && !r.signal && codes.length===1 && allowedSqlstateClasses.has(codes[0].slice(0,2))) sqlstate=codes[0];
    const message=fixture?(r.stderr??'').match(/^(?:psql:<stdin>:\d+: )?ERROR:\s+P0001:\s+(guest_[a-z_]+)\s*$/m)?.[1]:undefined;
    if(r.status===3&&!r.error&&!r.signal&&fixtureAssertions.has(message))assertion=message;
    throw new Error('proof_failed');
  }
  return r.stdout;
}
const password=randomBytes(32).toString('hex');
async function waitForDatabase() {
  // Preserve the old maximum budget (20 * (3000ms + 250ms)), but enforce
  // a wall-clock deadline. The entrypoint's socket-only init server cannot
  // answer an authenticated query through this verified TCP relay.
  const deadline=performance.now()+65000;
  while(!interrupted && performance.now()<deadline) {
    const timeout=Math.max(1,Math.min(3000,Math.ceil(deadline-performance.now())));
    const client=new Client({host:'127.0.0.1',port:relay.descriptor.port,
      user:'postgres',password,database:'mt_p1_proof',ssl:false,
      connectionTimeoutMillis:timeout,query_timeout:timeout});
    let ready=false,timedOut=false;
    // Network errors between connect/query/end invalidate this attempt without
    // escaping as raw errors or becoming an unhandled EventEmitter error.
    client.on('error',()=>{ready=false;});
    const timer=setTimeout(()=>{timedOut=true;client.connection.stream.destroy();},timeout);
    try {
      await client.connect();
      const result=await client.query('SELECT 1 AS ready');
      ready=result.rows.length===1 && result.rows[0].ready===1;
    } catch {
      // Startup refusal, shutdown and authentication/database-not-yet-ready
      // failures are retried only within the fixed deadline.
    } finally {
      // Register end's completion before destroying the probe socket, including
      // failed handshakes and stalled queries; never retain a failed client.
      const ending=client.end();
      client.connection.stream.destroy();
      try {await ending;} finally {clearTimeout(timer);}
    }
    if(ready && !timedOut && !interrupted && performance.now()<deadline) return;
    const remaining=deadline-performance.now();
    if(!interrupted && remaining>0) await new Promise(resolve=>setTimeout(resolve,Math.min(250,remaining)));
  }
  throw new Error('database_not_ready');
}
try {
  // Context inspection reads local CLI metadata without contacting an engine.
  // Pin every subsequent command to a recognized local socket, never an
  // arbitrary configured TCP/SSH Docker daemon or a changed default context.
  const context = spawnSync('docker',['context','inspect'],{encoding:'utf8',timeout:5000});
  if (context.status !== 0) throw new Error('BLOCKED_ENVIRONMENT');
  localEndpoint = process.env.DOCKER_HOST || JSON.parse(context.stdout)[0]?.Endpoints?.docker?.Host;
  if (!['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine','unix:///var/run/docker.sock'].includes(localEndpoint)) {
    localEndpoint = undefined;
    throw new Error('BLOCKED_ENVIRONMENT');
  }
  stage='IMAGE_INSPECT';
  docker(['image','inspect',image]);
  stage='NETWORK_CREATE';
  network=docker(['network','create','--internal','--label',`mt.p1.proof=${name}`,name]);
  stage='CONTAINER_CREATE';
  id=docker(['run','--detach','--name',name,'--label',`mt.p1.proof=${name}`,
    '--network',name,'--mount','type=tmpfs,destination=/var/lib/postgresql',
    '--mount','type=tmpfs,destination=/var/lib/postgresql/data','-e','PGDATA=/var/lib/postgresql/data/pgdata',
    '-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=mt_p1_proof',image]);
  stage='CONTAINER_INSPECT';
  const inspect=JSON.parse(docker(['inspect',id]))[0];
  stage='NETWORK_INSPECT';
  const net=JSON.parse(docker(['network','inspect',network]))[0];
  stage='TARGET_VALIDATION';
  const identity={containerId:id,runName:name,localEndpoint,networkId:network};
  validateDisposableTarget(inspect,net,identity);
  stage='RELAY_START';
  relay=await startDisposableRelay(identity);
  stage='RELAY_VALIDATION';
  await verifyDisposableRelay(identity,relay.proof,'127.0.0.1',relay.descriptor.port);
  stage='DATABASE_READY';
  await waitForDatabase();
  stage='SQL_PROOF';
  let output;
  if(p2) {
    let upgrade;
    for(const step of nativeMigrationSteps()) {
      if(release && step.name.startsWith('013_')) {
        stage='PG18_UPGRADE_SEED';
        p2Sql(`ALTER ROLE mt_runtime PASSWORD '${password}';`);
        upgrade=await prepareReleaseUpgrade({host:'127.0.0.1',port:relay.descriptor.port,password,database:'mt_p1_proof'});
      }
      stage=step.name==='LEDGER_SETUP' ? 'P2_LEDGER_SETUP' : `P2_MIGRATION_${step.name.slice(0,3)}`;
      p2Sql(step.sql);
      console.log(`PASS: disposable proof; stage=${stage}`);
    }
    if(release) {
      stage='PG18_UPGRADE_PRESERVATION';
      await verifyReleaseUpgrade(upgrade);
      stage='PG18_CONCURRENCY';
      await proveReleaseConcurrency(upgrade);
      console.log('PASS: PG18 012-to-013 preservation, independent connection concurrency, limiter, RLS, CAS and tombstone');
    }
    stage='P2_FUNCTIONAL_PROOF';
    output=p2Sql(readFileSync(new URL('../database/native/cloud-goals-proof.sql',import.meta.url),'utf8'));
    if(!output.includes('P2_CLOUD_GOALS_PROOF_PASS')) throw new Error('proof_failed');
    console.log(`PASS: disposable proof; stage=${stage}`);
    stage='P2_TVMAZE_GUEST_PROOF';
    output=p2Sql(readFileSync(new URL('../database/native/tvmaze-guest-proof.sql',import.meta.url),'utf8'),true);
    if(!output.includes('TVMAZE_GUEST_POOL_PROOF_PASS'))throw new Error('proof_failed');
    console.log(`PASS: disposable proof; stage=${stage}`);
    stage='P2_RUNTIME_PASSWORD';
    p2Sql(`ALTER ROLE mt_runtime PASSWORD '${password}';`);
  } else {
  const sql=['001_security_foundation.sql','002_better_auth.sql','rls-proof.sql']
    .map(file=>readFileSync(new URL(`../database/native/${file}`,import.meta.url),'utf8')).join('\n');
  output=docker(['exec','-i',id,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','mt_p1_proof'],
    sql+`\nALTER ROLE mt_runtime PASSWORD '${password}';`);
  if(!output.includes(p2 ? 'P2_CLOUD_GOALS_PROOF_PASS' : 'P1_RLS_PROOF_PASS')) throw new Error('proof_failed');
  }
  stage='RELAY_VALIDATION';
  const databaseUrl=`postgresql://mt_runtime:${password}@127.0.0.1:${relay.descriptor.port}/mt_p1_proof`;
  await verifyDisposableRelay(identity,relay.proof,'127.0.0.1',relay.descriptor.port);
  const client=new Client({connectionString:databaseUrl,connectionTimeoutMillis:5000,query_timeout:5000});
  try {await client.connect();await client.query('SELECT 1');} finally {await client.end();}
  if(interrupted) throw new Error('proof_interrupted');
  if (p2) {
    console.log('PASS: disposable native Cloud/Goals and TVMaze guest pool SQL, receipts, owner reads and lifecycle admission; other P2 domains NOT PROVED');
  }
  if (!p2 || release) {
  stage='AUTH_INTEGRATION';
  const result=await new Promise((resolve,reject)=>{
  const child=activeChild=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/native-postgres-live.integration.test.ts','--maxWorkers=1'],
    {stdio:'ignore',env:{...dockerEnv,DOCKER_HOST:localEndpoint,BACKEND_PROVIDER:'native',DATABASE_URL:databaseUrl,
      DATABASE_SSL_MODE:'disable',DATABASE_POOL_MAX:'1',BETTER_AUTH_URL:'http://localhost:3000',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),
      NATIVE_P1_PROOF_CONTAINER:id,NATIVE_P1_PROOF_NAME:name,NATIVE_P1_PROOF_NETWORK:network,NATIVE_P1_RELAY_PROOF:JSON.stringify(relay.proof),
      NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED:release?'true':'false',
      NATIVE_SMTP_HOST:'smtp.example.invalid',NATIVE_SMTP_PORT:'465',NATIVE_SMTP_SECURITY:'tls',
      NATIVE_SMTP_USER:'synthetic-only',NATIVE_SMTP_PASSWORD:'synthetic-only',NATIVE_SMTP_FROM:'auth@example.invalid',
      ...(release?{TRUSTED_INGRESS_MODE:'unconfigured',RATE_LIMIT_IDENTITY_HMAC_KEY:randomBytes(32).toString('hex'),
        RATE_LIMIT_RPC_SIGNING_KEY:randomBytes(32).toString('hex'),RATE_LIMIT_RPC_KEY_VERSION:'v1',RATE_LIMIT_RPC_AUDIENCE:'mt:signup-proof'}:{}),
      NODE_OPTIONS:`${dockerEnv.NODE_OPTIONS??''} --import=${pathToFileURL(`${process.cwd()}/scripts/ci-offline.mjs`).href}`},timeout:60000,killSignal:'SIGKILL'});
  child.once('error',reject);
  child.once('close',(status)=>resolve({status}));
  });
  activeChild=undefined;
  if(result.status!==0 || interrupted) throw new Error('auth_or_pool_proof_failed');
  console.log('PASS: real disposable PostgreSQL RLS, Better Auth and pg transaction proof');
  }
} catch(error) {
  const checks=new Set(['connections','guest_lock_contention','guest_race','replay_and_ten_seconds','utc_daily_limit','provider_reserve','disabled_global_capacity','cooldown','envelope_negatives','authenticated_quota','authenticated_race','cloud_cas','tombstone','rls']);
  const check=checks.has(error.releaseCheck)?error.releaseCheck:undefined;
  if(check&&/^[0-9A-Z]{5}$/.test(error.code??'')&&allowedSqlstateClasses.has(error.code.slice(0,2)))sqlstate=error.code;
  console.error(`${id?'FAIL: disposable proof':'BLOCKED_ENVIRONMENT: disposable proof'}; stage=${stage}${check?`; check=${check}`:''}${sqlstate?`; sqlstate=${sqlstate}`:''}${assertion?`; assertion=${assertion}`:''}; diagnostics redacted`);
  process.exitCode=1;
} finally {
  cleaning=true;
  if(relay) {
    try {await relay.close();} catch {
      console.error('FAIL: disposable proof; stage=RELAY_CLEANUP; diagnostics redacted');process.exitCode=1;
    }
  }
  // ID originates only from this run; never remove by ambiguous existing name.
  for(const [target,args,cleanupStage] of [
    [id,['rm','--force',id],'CONTAINER_CLEANUP'],
    [network,['network','rm',network],'NETWORK_CLEANUP'],
  ]) {
    if(target && /^[a-f0-9]{64}$/.test(target)) {
      try { docker(args); } catch {
        console.error(`FAIL: disposable proof; stage=${cleanupStage}; diagnostics redacted`);
        process.exitCode=1;
      }
    }
  }
  process.removeListener('SIGINT',interrupt);
  process.removeListener('SIGTERM',interrupt);
}
