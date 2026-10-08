// Additional CI safety/ABI evidence for the existing P3 package, not a packager.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { verifyNativePackage, forbiddenArtifactPath } from './native-package.mjs';

export function checkArtifactFile(path, buffer, secrets = []) {
  if (forbiddenArtifactPath(path)
    || /(?:^|\/)(?:fixtures?|private|coverage|\.ai|\.claude|\.knowledge-compiler|\.npm|\.pnpm-store|\.vscode)(?:\/|$)/i.test(path)
    || /\.(?:sql|dump|bak|zip|tar|gz|7z|tsbuildinfo)$/i.test(path)) throw new Error('artifact_forbidden_file');
  const text = buffer.toString('utf8');
  if (secrets.some(value => value && buffer.includes(Buffer.from(value)))
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,}\b|\bAKIA[A-Z0-9]{16}\b|\bAIza[A-Za-z0-9_-]{35}\b|\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}\b|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^/\s:@]+:[^/\s@]+@/.test(text))
    throw new Error('artifact_credential_material');
  if (/\.(?:node|dll|dylib)$|\.so(?:\.|$)/i.test(path)
    && !buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw new Error('artifact_non_linux_binary');
}

export function parseElfEvidence(header, dynamic, versions) {
  if (!/Class:\s+ELF64/.test(header) || !/Machine:\s+Advanced Micro Devices X86-64/.test(header))
    throw new Error('artifact_elf_architecture');
  return {
    needed: [...dynamic.matchAll(/\(NEEDED\).*\[([^\]]+)\]/g)].map(match => match[1]),
    searchPaths: [...dynamic.matchAll(/\((?:RPATH|RUNPATH)\).*\[([^\]]+)\]/g)].map(match => match[1]),
    requiredSymbolVersions: [...new Set(versions.match(/\b(?:GLIBC|GLIBCXX|CXXABI)_[0-9.]+\b/g) ?? [])].sort(),
  };
}

export async function checkNativeArtifact(directory, reportPath) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('artifact_linux_x64_required');
  const root = resolve(directory);
  await verifyNativePackage(root);
  const manifest = JSON.parse(await readFile(join(root, 'deployment-manifest.json'), 'utf8'));
  if (manifest.buildPlatform !== 'linux' || manifest.buildArchitecture !== 'x64'
    || manifest.dirtyWorktree || !manifest.buildLibc || manifest.buildLibc === 'musl-or-unknown') throw new Error('artifact_build_identity');
  if (!(await readFile(join(root, 'server.js'), 'utf8')).includes('"NEXT_PUBLIC_BACKEND_PROVIDER":"native"'))
    throw new Error('artifact_public_selector');
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const devOnlyPackages = Object.entries(lock.packages).filter(([name, entry]) => name && entry.dev === true).map(([name]) => name);
  const secrets = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'RATE_LIMIT_IDENTITY_HMAC_KEY', 'RATE_LIMIT_RPC_SIGNING_KEY']
    .map(key => process.env[key]).filter(Boolean);
  const binaries = [];
  for (const { path } of [...manifest.files, { path: 'deployment-manifest.json' }, { path: 'DEPLOYMENT.txt' }]) {
    const buffer = await readFile(join(root, path));
    checkArtifactFile(path, buffer, secrets);
    if (devOnlyPackages.some(name => path.startsWith(name + '/')))
      throw new Error('artifact_development_dependency');
    if (buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      // readelf reads metadata without executing the inspected binary (unlike ldd).
      const inspect = flag => execFileSync('readelf', [flag, join(root, path)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
      binaries.push({ path, ...parseElfEvidence(inspect('-h'), inspect('-d'), inspect('-V')) });
    }
  }
  if (!binaries.some(binary => /sharp.*\.node$/.test(binary.path))
    || !binaries.some(binary => /libvips.*\.so/.test(binary.path))) throw new Error('artifact_sharp_linux_missing');
  const require = createRequire(join(root, 'server.js'));
  const sharp = require('sharp');
  // Exercise only packaged Sharp/libvips with generated pixels; no app/DB startup.
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } }).png().toBuffer();
  const report = { format: 'MediaTrackerNativeAbiV1', sourceGitSha: manifest.sourceGitSha,
    platform: process.platform, architecture: process.arch, nodeVersion: process.versions.node,
    buildGlibc: manifest.buildLibc, artifactChecksum: manifest.artifactChecksum,
    sharpVersions: sharp.versions, binaries, builderSharpSmoke: 'PASS',
    HOST_ABI_COMPATIBILITY: 'UNVERIFIED',
    concerns: 'Host application glibc, libstdc++, dynamic loader, shared libraries and CPU capabilities remain unknown. ELF versions and builder smoke do not prove hosting compatibility. PostgreSQL server build is not application ABI evidence.' };
  if (resolve(reportPath).startsWith(root + '/')) throw new Error('artifact_report_inside_package');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('ARTIFACT_SECRET_SCAN=PASS; BUILDER_ABI_INSPECTION=PASS; HOST_ABI_COMPATIBILITY=UNVERIFIED');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('artifact_arguments');
    await checkNativeArtifact(process.argv[2], process.argv[3]);
  } catch { console.error('native_artifact_safety_failed'); process.exitCode = 1; }
}
