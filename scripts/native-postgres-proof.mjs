// No input target/credentials accepted. Creates an isolated, loopback-only,
// mount-free ephemeral Docker DB from an ALREADY LOCAL image; never pulls.
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nativeMigrationPlan } from './native-migrations.mjs';
const p2 = process.argv[2] === '--p2';
if (process.argv.slice(2).some(arg => arg !== '--p2') || process.argv.length > 3) throw new Error('proof_target_arguments_denied');
const image = 'postgres:17-alpine';
const name = `mt-p1-${randomUUID()}`;
let localEndpoint;
const dockerEnv = { ...process.env };
delete dockerEnv.DOCKER_HOST;
delete dockerEnv.DOCKER_CONTEXT;
delete dockerEnv.DOCKER_TLS_VERIFY;
delete dockerEnv.DOCKER_CERT_PATH;
function docker(args, input) {
  if (!localEndpoint) throw new Error('BLOCKED_ENVIRONMENT');
  const r = spawnSync('docker', ['--host',localEndpoint,...args], { input, env:dockerEnv, encoding:'utf8', timeout:15000 });
  if(r.status!==0) throw new Error('BLOCKED_ENVIRONMENT');
  return r.stdout.trim();
}
let id, network;
let stage='DOCKER_CONTEXT';
const password=randomBytes(32).toString('hex');
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
    '--network',name,'--publish','127.0.0.1::5432','--mount','type=tmpfs,destination=/var/lib/postgresql/data',
    '-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=mt_p1_proof',image]);
  stage='CONTAINER_INSPECT';
  const inspect=JSON.parse(docker(['inspect',id]))[0];
  stage='NETWORK_INSPECT';
  const net=JSON.parse(docker(['network','inspect',network]))[0];
  stage='CONTAINER_VALIDATION';
  if(inspect.Name!==`/${name}` || inspect.Config.Labels['mt.p1.proof']!==name) throw new Error('unsafe_disposable_target');
  stage='NETWORK_VALIDATION';
  if(inspect.HostConfig.NetworkMode!==name || net.Internal!==true || net.Labels['mt.p1.proof']!==name) throw new Error('unsafe_disposable_target');
  stage='PORT_VALIDATION';
  const bindings=inspect.NetworkSettings.Ports['5432/tcp'];
  if(bindings?.length!==1 || bindings[0].HostIp!=='127.0.0.1') throw new Error('unsafe_disposable_target');
  stage='MOUNT_VALIDATION';
  if(inspect.Mounts.some(m=>m.Type!=='tmpfs')) throw new Error('unsafe_disposable_target');
  stage='DATABASE_READY';
  let ready=false;
  for(let i=0;i<20;i++) {
    const r=spawnSync('docker',['--host',localEndpoint,'exec',id,'pg_isready','-U','postgres','-d','mt_p1_proof'],{env:dockerEnv,timeout:3000,stdio:'ignore'});
    if(r.status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready) throw new Error('BLOCKED_ENVIRONMENT');
  stage='SQL_PROOF';
  const sql=p2 ? nativeMigrationPlan() + '\n' + readFileSync(new URL('../database/native/cloud-goals-proof.sql',import.meta.url),'utf8')
    : ['001_security_foundation.sql','002_better_auth.sql','rls-proof.sql']
    .map(file=>readFileSync(new URL(`../database/native/${file}`,import.meta.url),'utf8')).join('\n');
  const output=docker(['exec','-i',id,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','mt_p1_proof'],
    sql+`\nALTER ROLE mt_runtime PASSWORD '${password}';`);
  if(!output.includes(p2 ? 'P2_CLOUD_GOALS_PROOF_PASS' : 'P1_RLS_PROOF_PASS')) throw new Error('proof_failed');
  if (p2) {
    console.log('PASS: disposable native Cloud/Goals SQL, receipts, owner reads and lifecycle admission; other P2 domains NOT PROVED');
  } else {
  stage='AUTH_INTEGRATION';
  const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/native-postgres-live.integration.test.ts','--maxWorkers=1'],
    {stdio:'pipe',env:{...dockerEnv,DOCKER_HOST:localEndpoint,BACKEND_PROVIDER:'native',DATABASE_URL:`postgresql://mt_runtime:${password}@127.0.0.1:${bindings[0].HostPort}/mt_p1_proof`,
      DATABASE_SSL_MODE:'disable',DATABASE_POOL_MAX:'1',BETTER_AUTH_URL:'http://localhost:3000',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),
      NATIVE_P1_PROOF_CONTAINER:id,NATIVE_P1_PROOF_NAME:name,
      NODE_OPTIONS:`--import=${pathToFileURL(`${process.cwd()}/scripts/ci-offline.mjs`).href}`},timeout:60000});
  if(result.status!==0) throw new Error('auth_or_pool_proof_failed');
  console.log('PASS: real disposable PostgreSQL RLS, Better Auth and pg transaction proof');
  }
} catch {
  console.error(`${id?'FAIL: disposable proof':'BLOCKED_ENVIRONMENT: disposable proof'}; stage=${stage}; diagnostics redacted`);
  process.exitCode=1;
} finally {
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
}
