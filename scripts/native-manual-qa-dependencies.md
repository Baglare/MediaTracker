# Private QA dependencies for source f853f95

The application standalone release is NOT an operator dependency tree. The server
reported that both release trees omit Better Auth; pointing QA node_modules at
either release cannot satisfy `better-auth/crypto`. Do not install into or modify
the old operator/release node_modules target.

The Linux dependency archive is reconstructed from the exact Git lockfile at
`f853f95acac6dde3abe3880df8d26de517354645`. Its roots are Better Auth 1.7.7,
pg 8.23.1 and sharp 0.35.5; all 43 declared runtime/transitive packages retain their
locked nested locations, including Better Auth core 1.7.7 and both utils versions.
Only Linux x64 glibc Sharp/libvips optional binaries are included. Optional framework
peers (Next/React/Vitest/etc.) are excluded. No app build, npm lifecycle scripts,
secret/env files, account data or credentials are used.

Every downloaded npm tarball must match the original lockfile's SHA512 integrity.
Tar paths, links and special files are checked before extraction. The final archive
has a SHA256 sidecar, and `FILES.sha256` verifies every payload file. The bundled
`VERIFY-DEPENDENCIES.mjs` checks the complete file set, locked versions, Linux x64
glibc + Node 24, actual Better Auth hash/verify/wrong-password/random-salt behavior,
pg import and native Sharp image encoding. It never connects to a DB.

## Reproduce locally on Linux (Node 24, GNU tar and gzip)

Use only a trusted checkout containing the f853f95 Git object and this builder;
destination must not exist. A cache tarball is always rechecked against lock SRI.

```bash
node scripts/native-manual-qa-dependencies.mjs --plan
node scripts/native-manual-qa-dependencies.mjs --build-linux "$PRIVATE_NEW_OUTPUT_DIR" "$PRIVATE_CACHE_DIR"
```

Build twice into different new directories to check identical archive SHA256.
No package version resolution or server npm installation is needed. Local Linux
validation must also unpack the dependency and original f853f95 source archives
outside the repository, link only those new private node_modules and run `--plan`
with a cleared environment. This proves no fallback to development dependencies.

## Server installation after delivery verification

Use the delivery's concrete SHA256/path instructions. Upload only the dependency
archive and its SHA256 sidecar to an existing private incoming directory, outside
the web root. Extract into a **new separate** dependency directory. Before switching
anything, run `sha256sum -c` and the bundled verifier using the existing Plesk Node 24.
Linux/CPU/glibc/native-load mismatch means STOP; do not rebuild or npm install there.

The only existing entry replaced is the QA operator's `node_modules` symlink.
Verify it is actually a symlink, copy that link itself with `cp -P` to an unused
backup name, then atomically replace it with a new symlink using GNU `mv -T`.
Never use a path with a trailing slash on the symlink, recursive delete, `cp -L`,
or install commands against the old operator/release. The old target stays intact.

Record and compare the checksum of the existing `qa-plan.json` before and after.
Run `--plan` as a dependency smoke test into a *different* report file; never overwrite
the existing plan. Account creation/cleanup must continue using that original run ID
and exact two UUIDs, the verified test-only acceptance env and hidden TTY prompts.
The replacement link can be rolled back with `mv -T` of its saved link; that also
replaces only the QA link, never its old/new directory targets.

Public signup, production runtime/source/env, roles, migrations and security gates
are unchanged. No server connection, DB mutation, install or deploy is part of this
local packaging work. Server-side import/ABI validation remains LIVE_UNVERIFIED
until the operator runs the supplied verification commands.

## Delivered local evidence

- Linux WSL, Node 24.14.0, x64/glibc: two independent reconstructions from the same
  f853f95 lockfile produced byte-identical archives; all 43 npm SHA512 pins verified.
- Archive SHA256: `4d683c0470843ceaea49554c95a5f4bf5d0d2f79300a14239b72ddf016e9ab78`.
- Extracted outside the repository under Linux `/tmp`, using only the new dependency
  tree and a cleared environment: original f853f95 QA `--plan`, real Better Auth
  hash/verify, wrong-password denial, independent salts, pg and native Sharp PASS.
- 14 targeted Node tests, targeted ESLint, Node syntax and SSH Bash syntax PASS.
- No application build, server connection, DB operation, npm install, commit or push.
