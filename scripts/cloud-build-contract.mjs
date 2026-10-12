import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const publicKeys = ['NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE', 'NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED',
  'NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE', 'NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED',
  'NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE', 'NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH',
  'NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION'];

// Execute only the compiled contract exports in a browser-like sandbox with no
// process.env. Chunk registration does not mount React or start network work.
export function checkClientChunks(sources, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  const epoch = `v1-${sha.slice(0, 12)}`;
  const context = vm.createContext({ TURBOPACK: [] });
  for (const source of sources) {
    for (const key of publicKeys) assert.ok(!source.includes(key), 'public_cloud_env_not_inlined');
    // The Turbopack runtime boots the browser; only registration chunks are
    // executable here. All chunks still undergo the unresolved-env check.
    if (/^(?:\(globalThis\.TURBOPACK|TURBOPACK\.push)/.test(source)
      && !/globalThis\.TURBOPACK\s*=\s*\{/.test(source)) {
      vm.runInContext(source, context, { timeout: 1000 });
    }
  }
  assert.ok(sources.some(source => source.includes(JSON.stringify(epoch))), 'client_epoch_missing');
  const contracts = new Map();
  for (const registration of context.TURBOPACK) {
    for (const factory of registration) {
      if (typeof factory !== 'function'
        || !/"get(?:GoalCloud|Cloud)RolloutContract",0,/.test(factory.toString())) continue;
      // Imports are deliberately inert. These pure getters must depend only on
      // their compiled literals, never on runtime env or imported services.
      context.factory = factory;
      context.exports = {};
      vm.runInContext(`factory({ i: () => ({}), s: values => {
        for (let i = 0; i < values.length; i += 3) exports[values[i]] = values[i + 2];
      } });`, context, { timeout: 1000 });
      for (const name of ['getCloudRolloutContract', 'getGoalCloudRolloutContract']) {
        if (!context.exports[name]) continue;
        context.getter = context.exports[name];
        const result = JSON.parse(vm.runInContext('JSON.stringify(getter())', context, { timeout: 1000 }));
        contracts.set(name, result);
      }
    }
  }
  assert.deepEqual(contracts.get('getCloudRolloutContract'), {
    adapter: 'v2', schemaStage: 'd2c1', status: 'ready', code: null, message: null, requiresReload: false,
  });
  assert.deepEqual(contracts.get('getGoalCloudRolloutContract'), {
    enabled: true, schemaStage: 'v1', status: 'ready', code: null, message: null,
  });
  return epoch;
}

export async function checkRuntimeRoute(GET, epoch) {
  const saved = Object.fromEntries(publicKeys.map(key => [key, process.env[key]]));
  try {
    // Deliberately differ from the build: this must remain runtime configurable.
    Object.assign(process.env, {
      NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE: 'd2c1',
      NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE: 'true',
      NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH: `${epoch}-runtime-probe`,
      NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION: 'future-client',
    });
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.deepEqual(await response.json(), {
      format: 'mediatracker-cloud-rollout', version: 1, schemaStage: 'd2c1', maintenance: true,
      deploymentEpoch: `${epoch}-runtime-probe`, minimumClientVersion: 'future-client',
    });
    Object.assign(process.env, {
      NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE: 'false',
      NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH: epoch,
      NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION: 'd2c2',
    });
    assert.deepEqual(await (await GET()).json(), {
      format: 'mediatracker-cloud-rollout', version: 1, schemaStage: 'd2c1', maintenance: false,
      deploymentEpoch: epoch, minimumClientVersion: 'd2c2',
    });
    delete process.env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE;
    assert.equal((await (await GET()).json()).schemaStage, 'unknown');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function chunkSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? chunkSources(path) : entry.name.endsWith('.js') ? [readFileSync(path, 'utf8')] : [];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [directory, sha] = process.argv.slice(2);
    const root = resolve(directory);
    const epoch = checkClientChunks(chunkSources(join(root, 'static/chunks')), sha);
    const require = createRequire(import.meta.url);
    const route = require(join(root, 'server/app/api/cloud/rollout/route.js'));
    await checkRuntimeRoute(route.routeModule.userland.GET, epoch);
    console.info(JSON.stringify({ event: 'cloud_build_contract', client: 'PASS', runtime: 'PASS', epoch }));
  } catch {
    console.error('cloud_build_contract_failed');
    process.exitCode = 1;
  }
}
