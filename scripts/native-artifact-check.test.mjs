import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkArtifactFile, parseElfEvidence } from './native-artifact-check.mjs';
import { verifyNativePackage, packageFailureDiagnostic } from './native-package.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';

const packageCli = fileURLToPath(new URL('./native-package.mjs', import.meta.url));
async function packageFixture() {
  const root = await mkdtemp(join(tmpdir(), 'mt-package-diagnostic-'));
  const put = async (path, contents) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  };
  for (const [path, contents] of Object.entries({
    '.next/standalone/server.js': 'const config={"NEXT_PUBLIC_BACKEND_PROVIDER":"native"};',
    '.next/standalone/package.json': '{}',
    '.next/standalone/.next/BUILD_ID': 'synthetic',
    '.next/standalone/.next/server/compiled.js': 'synthetic',
    '.next/standalone/node_modules/next/package.json': '{}',
    '.next/standalone/node_modules/pg/package.json': '{}',
    '.next/standalone/node_modules/sharp/package.json': '{}',
    'node_modules/@img/sharp-synthetic/sharp.node': 'synthetic',
    'node_modules/@img/sharp-synthetic/libvips.dll': 'synthetic',
    '.next/static/chunk.js': 'synthetic',
    'public/icon.txt': 'synthetic',
    'scripts/passenger-start.cjs': 'synthetic',
    'lib/backend/native-migration-state.json': JSON.stringify(nativeMigrationManifest().map(({ name, checksum }) => ({ name, checksum }))),
  })) await put(path, contents);
  return { root, put };
}
function failedCli(root, ...args) {
  const result = spawnSync(process.execPath, [packageCli, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, BACKEND_PROVIDER: 'native' },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  // A single JSON record excludes raw errors, Git stderr, full paths and env.
  const diagnostic = JSON.parse(result.stderr);
  assert.deepEqual(Object.keys(diagnostic), ['event', 'stage', 'category']);
  assert.equal(diagnostic.event, 'deployment_package_failed');
  assert.ok(!result.stderr.includes(root));
  return diagnostic;
}

test('package diagnostics disclose only approved categories, never arbitrary messages or codes', () => {
  for (const error of [new Error('private path /home/operator/.env secret=value'),
    Object.assign(new Error('private content'), { code: 'PRIVATE_SECRET_VALUE' })]) {
    assert.deepEqual(packageFailureDiagnostic(error), {
      event: 'deployment_package_failed', stage: 'unknown', category: 'unexpected_error',
    });
  }
  assert.equal(packageFailureDiagnostic(new SyntaxError('private JSON content')).category, 'invalid_json');
});

for (const [label, alter, stage, category] of [
  ['missing standalone server', f => rm(join(f.root, '.next/standalone/server.js')), 'standalone_server', 'filesystem_enoent'],
  ['wrong build selector', f => f.put('.next/standalone/server.js', 'private selector'), 'standalone_server', 'deployment_build_provider_mismatch'],
  ['missing Sharp optional dependencies', f => rm(join(f.root, 'node_modules/@img'), { recursive: true }), 'sharp_dependencies', 'filesystem_enoent'],
  ['missing required runtime file', f => rm(join(f.root, '.next/standalone/node_modules/pg/package.json')), 'runtime_requirements', 'deployment_required_file_missing'],
  ['invalid migration JSON', f => f.put('lib/backend/native-migration-state.json', 'private invalid JSON'), 'migration_state', 'invalid_json'],
  ['stale migration state', f => f.put('lib/backend/native-migration-state.json', '[]'), 'migration_manifest', 'deployment_migration_state_stale'],
  ['Git failure with captured stderr', async () => {}, 'source_listing', 'deployment_git_failed'],
  ['existing output', f => mkdir(join(f.root, 'dist/package'), { recursive: true }), 'destination_create', 'filesystem_eexist'],
  ['unsafe traced directory link', f => symlink(join(f.root, 'public'), join(f.root, '.next/standalone/node_modules/unsafe'), 'junction'), 'standalone_copy', 'deployment_trace_link_unsafe'],
  ['unsafe Sharp optional package content', f => f.put('node_modules/@img/sharp-synthetic/.env', 'private fixture'), 'package_inventory', 'deployment_artifact_unsafe'],
]) {
  test(`packaging fails closed and reports ${label}`, async () => {
    const fixture = await packageFixture();
    try {
      await alter(fixture);
      const diagnostic = failedCli(fixture.root, 'create', 'dist/package');
      assert.equal(diagnostic.stage, stage);
      assert.equal(diagnostic.category, category);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
}

test('CLI argument and verification failures retain safe diagnostics and nonzero exit', async () => {
  const fixture = await packageFixture();
  try {
    assert.equal(failedCli(fixture.root, 'unexpected', 'private-path').category, 'deployment_package_arguments_invalid');
    const diagnostic = failedCli(fixture.root, 'verify', 'missing');
    assert.equal(diagnostic.stage, 'verification_directory');
    assert.equal(diagnostic.category, 'filesystem_enoent');
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

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
    await assert.rejects(verifyNativePackage(root), error => {
      assert.deepEqual(packageFailureDiagnostic(error), { event: 'deployment_package_failed',
        stage: 'verification_integrity', category: 'deployment_artifact_checksum_mismatch' });
      return /checksum_mismatch/.test(error.message);
    });
    await writeFile(join(root, 'server.js'), contents);
    await writeFile(join(root, '.env'), 'synthetic');
    await assert.rejects(verifyNativePackage(root), /unsafe/);
    await rm(join(root, '.env'));
    await mkdir(join(root, 'public'));
    await symlink(join(root, 'public'), join(root, 'unsafe-link'), 'junction');
    await assert.rejects(verifyNativePackage(root), error => {
      assert.deepEqual(packageFailureDiagnostic(error), { event: 'deployment_package_failed',
        stage: 'verification_inventory', category: 'deployment_artifact_unsafe' });
      return /unsafe/.test(error.message);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
