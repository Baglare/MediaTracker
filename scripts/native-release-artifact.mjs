// Additional release binding after the existing package/ELF/secret checks.
import { readFile } from 'node:fs/promises';
import { nativeMigrationManifest } from './native-migrations.mjs';
import { pathToFileURL } from 'node:url';
export async function assertReleaseArtifact(directory,sha) {
  const m=JSON.parse(await readFile(`${directory}/deployment-manifest.json`,'utf8'));
  const migrations=nativeMigrationManifest().map(({name,checksum})=>({name,checksum}));
  if(!/^[a-f0-9]{40}$/.test(sha??'')||m.sourceGitSha!==sha||m.dirtyWorktree
    ||migrations.length!==15||migrations[14].name!=='015_privacy_cloud_policies.sql'
    ||JSON.stringify(m.migrations)!==JSON.stringify(migrations)
    ||m.buildPlatform!=='linux'||m.buildArchitecture!=='x64'||m.publicSignupEnabled!==true)throw new Error('release_artifact_identity_invalid');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==4)throw new Error('release_artifact_arguments');
    await assertReleaseArtifact(process.argv[2],process.argv[3]);
    console.log('RELEASE_SHA_MANIFEST15=PASS; HOST_ABI_COMPATIBILITY=UNVERIFIED');
  } catch {console.error('RELEASE_SHA_MANIFEST15=FAIL');process.exitCode=1;}
}
