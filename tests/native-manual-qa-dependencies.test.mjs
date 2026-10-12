import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runtimeGraph,resolvePackage,verifyIntegrity,build} from '../scripts/native-manual-qa-dependencies.mjs';
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
test('exact operator graph retains nested Better Auth versions and Linux glibc Sharp',()=>{
  const graph=runtimeGraph(lock),byPath=new Map(graph.map(row=>[row.location,row]));
  assert.equal(byPath.get('node_modules/better-auth').version,'1.7.7');
  assert.equal(byPath.get('node_modules/better-auth/node_modules/@better-auth/core').version,'1.7.7');
  assert.equal(byPath.get('node_modules/@better-auth/utils').version,'0.4.2');
  assert.equal(byPath.get('node_modules/better-call/node_modules/@better-auth/utils').version,'0.5.0');
  assert(byPath.has('node_modules/sharp/node_modules/semver'));
  assert(byPath.has('node_modules/@img/sharp-linux-x64'));
  assert(byPath.has('node_modules/@img/sharp-libvips-linux-x64'));
  assert(!graph.some(row=>/next$|react$|vitest$|eslint$|linuxmusl|win32/.test(row.location)));
  assert.equal(resolvePackage(lock,'node_modules/better-auth','@better-auth/core'),'node_modules/better-auth/node_modules/@better-auth/core');
});
test('missing dependency, forbidden registry, linked package and wrong Better Auth version fail closed',()=>{
  for(const mutate of [copy=>delete copy.packages['node_modules/@noble/hashes'],
    copy=>copy.packages['node_modules/better-auth'].resolved='https://example.invalid/package.tgz',
    copy=>copy.packages['node_modules/better-auth'].link=true,
    copy=>copy.packages['node_modules/better-auth'].version='1.7.8']) {
    const copy=structuredClone(lock);mutate(copy);assert.throws(()=>runtimeGraph(copy));
  }
  for(const name of ['../secret','foo/../../secret','@x/../secret'])assert.throws(()=>resolvePackage(lock,'',name));
});
test('registry bytes must match exact SHA512 lock integrity; corrupted cache cannot be reused',()=>{
  const bytes=Buffer.from('synthetic registry tarball'),sri='sha512-'+createHash('sha512').update(bytes).digest('base64');
  verifyIntegrity(bytes,sri);
  assert.throws(()=>verifyIntegrity(Buffer.from('tampered'),sri),/mismatch/);
  assert.throws(()=>verifyIntegrity(bytes,'sha1-anything'),/invalid/);
});
test('Linux-only packager rejects Windows before downloads or destination creation',async()=>{
  if(process.platform!=='linux')await assert.rejects(build(JSON.stringify(lock),'unused','unused'),/linux_x64/);
  else assert.equal(runtimeGraph(lock).length,43);
});
