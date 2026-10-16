import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertReleaseArtifact } from './native-release-artifact.mjs';
import { nativeMigrationManifest } from './native-migrations.mjs';

test('release binding refuses old manifest, wrong SHA, dirty source and Windows artifact',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mt-release-binding-'));
  const sha='a'.repeat(40),m={sourceGitSha:sha,dirtyWorktree:false,publicSignupEnabled:true,buildPlatform:'linux',buildArchitecture:'x64',migrations:nativeMigrationManifest().map(({name,checksum})=>({name,checksum}))};
  const save=record=>writeFile(join(root,'deployment-manifest.json'),JSON.stringify(record));
  try {
    await save(m);await assertReleaseArtifact(root,sha);
    for(const change of [{publicSignupEnabled:false},{publicSignupEnabled:undefined},{publicSignupEnabled:'true'},{sourceGitSha:'b'.repeat(40)},{dirtyWorktree:true},{buildPlatform:'win32'},{migrations:m.migrations.slice(0,12)},{migrations:m.migrations.slice(0,14)},{migrations:m.migrations.map((e,i)=>i===14?{...e,checksum:'0'.repeat(64)}:e)}]) {
      await save({...m,...change});await assert.rejects(assertReleaseArtifact(root,sha),/identity_invalid/);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
