import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkArtifactFile, parseElfEvidence } from './native-artifact-check.mjs';
import { verifyNativePackage } from './native-package.mjs';

test('artifact rejects private paths, dumps, caches and non-Linux native modules', () => {
  for (const path of ['.env', '.env.production', '.git/config', '.codex/x', 'backup/db.dump', 'public/fixtures/user.json',
    'public/private/users.json', '.next/cache/a', 'node_modules/pkg/a.dll', 'data.sql', 'backup.zip'])
    assert.throws(() => checkArtifactFile(path, Buffer.from('synthetic')));
  checkArtifactFile('.next/static/chunks/a.js', Buffer.from('compiled'));
  checkArtifactFile('node_modules/pkg/addon.node', Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
});
test('artifact rejects known build credentials and token signatures without disclosing values', () => {
  for (const value of ['synthetic-auth-value', 'ghp_' + 'a'.repeat(36), '-----BEGIN ' + 'PRIVATE KEY-----',
    'postgresql://example:synthetic@localhost/test']) {
    assert.throws(() => checkArtifactFile('server.js', Buffer.from(value), ['synthetic-auth-value']),
      error => error.message === 'artifact_credential_material');
  }
  checkArtifactFile('server.js', Buffer.from('process.env.BETTER_AUTH_SECRET'));
});
test('ELF evidence rejects wrong architecture and records shared libraries and version requirements', () => {
  const header = 'Class: ELF64\nMachine: Advanced Micro Devices X86-64';
  assert.throws(() => parseElfEvidence('Class: ELF32\nMachine: ARM', '', ''));
  assert.deepEqual(parseElfEvidence(header, '(NEEDED) Shared library: [libc.so.6]\n(RUNPATH) Library runpath: [$ORIGIN]',
    'Name: GLIBC_2.17\nName: GLIBCXX_3.4.21\nName: GLIBC_2.17'), {
    needed: ['libc.so.6'], searchPaths: ['$ORIGIN'], requiredSymbolVersions: ['GLIBCXX_3.4.21', 'GLIBC_2.17'],
  });
});
test('P3 verifier checks synthetic package checksums and rejects tampering or residual env', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mt-artifact-check-'));
  const sha = value => createHash('sha256').update(value).digest('hex');
  const contents = 'synthetic checksum fixture';
  const files = [{ path: 'server.js', size: Buffer.byteLength(contents), checksum: sha(contents) }];
  const manifest = { format: 'MediaTrackerDeploymentV1', backendProvider: 'native',
    buildPlatform: 'synthetic', files, artifactChecksum: sha(JSON.stringify(files)) };
  manifest.manifestFingerprint = sha(JSON.stringify(manifest));
  try {
    await writeFile(join(root, 'server.js'), contents);
    await writeFile(join(root, 'deployment-manifest.json'), JSON.stringify(manifest));
    assert.equal((await verifyNativePackage(root)).status, 'VERIFIED');
    await writeFile(join(root, 'server.js'), 'tampered');
    await assert.rejects(verifyNativePackage(root), /checksum_mismatch/);
    await writeFile(join(root, 'server.js'), contents);
    await writeFile(join(root, '.env'), 'synthetic');
    await assert.rejects(verifyNativePackage(root), /unsafe/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
