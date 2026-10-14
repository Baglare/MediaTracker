import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkClientChunks, checkRuntimeRoute } from './cloud-build-contract.mjs';

const sha = '012345abcdef012345abcdef012345abcdef0123';
const epoch = `v1-${sha.slice(0, 12)}`;
function chunks(v2 = 'v2', goals = true, signup = true) {
  return [`TURBOPACK.push([1, e => e.s(["getCloudRolloutContract",0, () => ({
    adapter: ${JSON.stringify(v2)}, schemaStage: "d2c1", status: "ready", code: null, message: null, requiresReload: false
  })])]); const epoch = ${JSON.stringify(epoch)};`,
  `TURBOPACK.push([2, e => e.s(["getGoalCloudRolloutContract",0, () => ({
    enabled: ${goals}, schemaStage: "v1", status: "ready", code: null, message: null
  })])]);`, `TURBOPACK.push([3, e => e.s(["useAuth",0, () => ({signupEnabled:${signup}})])]);`];
}
test('compiled browser getters and actual signup hook work without process.env', () => {
  assert.equal(checkClientChunks(chunks(), sha), epoch);
  assert.equal(checkClientChunks([...chunks(), `TURBOPACK.push([4, e => e.s(["nativeSignupEnabled",0,
    env => env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED === 'true'])]);`], sha), epoch);
});
test('unresolved signup in the hook cannot pass through inert imports',()=>{
  const unresolved=chunks().slice(0,2).concat(`TURBOPACK.push([3,e=>{const p=e.i(1);e.s(["useAuth",0,
    ()=>({signupEnabled:p.default.env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED==='true'})]);}]);`);
  assert.throws(()=>checkClientChunks(unresolved,sha),/client_signup_disabled/);
});
test('missing, disabled or unresolved compiled public configuration fails', () => {
  for (const sources of [[], chunks('legacy'), chunks('v2', false), chunks('v2', true, false), chunks().slice(0,2),
    [...chunks(), 'const unresolved = process.env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED;'],
    [...chunks(), 'const unresolved = process.env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE;'],
    chunks().map(source => source.replace(epoch, 'old-epoch'))]) {
    assert.throws(() => checkClientChunks(sources, sha));
  }
});
test('runtime probe detects an endpoint frozen at build time', async () => {
  await assert.rejects(checkRuntimeRoute(() => Response.json({ schemaStage: 'd2c1', maintenance: false }), epoch));
});
