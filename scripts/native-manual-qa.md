# Manual QA accounts — private test operator only

Prepared against artifact/source `0257c85a36360cffd8d3125e5293fe5a4a52165a`.
This preparation did not connect to hosting or create users. Live permissions,
PostgreSQL/TLS, HTTP login and browser E2E remain **NOT_RUN / LIVE_UNVERIFIED**.

## Reuse and boundaries

`native-manual-qa.mjs` reuses acceptance configuration, migration/checksum and
hosting contract checks, independent runtime/cleanup identity checks, seed role
inspection, safe filesystem absence checks and Better Auth's `hashPassword`.
Credential provider/accountId/userId match the acceptance tool exactly. The
existing Auth/lifecycle triggers apply. No signup, web endpoint, grants, migration
or runtime code changes. The original acceptance tool still requires an empty
Auth database and still performs immediate cleanup; its safety contract is unchanged.

The new CLI checks only its two exact UUID/email/name identities; unrelated Auth
users are allowed and preserved. Both inserts commit together. A collision always
blocks; no existing user is adopted or updated. Creation keeps accounts until
explicit cleanup. Run IDs must be unique across QA/acceptance work. The UUIDs use
the existing deterministic fixture helper with distinct manual-QA email/name markers.

Cleanup requires the run ID **and both exact UUIDs**, rechecks identity, target,
permissions, migrations, freeze and runtime checks, and uses `nativePrivacyAdapter`
and `runErasure`: lifecycle lock, session revocation, application cleanup,
filesystem absence verification, Auth-last deletion and final residual verification.
Both accounts are checked before any lifecycle transition, then checked again
under lifecycle locks. All DB changes for both accounts are one transaction.
Already absent users succeed only with no scoped residuals. No broad email deletion,
raw DELETE, cascading shortcut or filesystem deletion is used by this CLI.

**Narrow first-pass scope:** personal library/progress/goals/profile/themes/XP
and owner-only activity are supported. Assets/files and relationships, notifications,
comments or other records involving another UUID block cleanup before deletion.
Do not upload avatar/banner files or interact socially with other users in this
first pass. If residuals exist, stop and inspect the existing scoped privacy
operator workflow; do not loosen this tool or grant permissions. Browser data,
downloaded exports, vendor logs and backups need separate handling.

## Before SSH execution

**Dependency correction:** the real server release trees omit Better Auth.
The legacy `OLD/node_modules` symlink reuse below is therefore BLOCKED on that
server. Use the separate locked Linux dependency archive and safe link replacement
in [native-manual-qa-dependencies.md](native-manual-qa-dependencies.md) and its
concrete delivery instructions. Preserve the existing `qa-plan.json`; do not run
the old setup block again or overwrite the plan. Creation/cleanup contracts stay
unchanged.

Use a new **private operator directory pinned to the QA commit SHA**, with the
existing Node 24 dependencies and CA, not Passenger's standalone runtime directory.
Do not copy a new script into the old source tree. The delivered Git source archive
contains the QA script's complete relative module closure, 001–012 migration inputs,
the baseline JSON, lockfile and instructions; no node_modules, secrets or env files.
It does not contain an application release and must not be deployed.

Local comparison with old operator source
`627f0b6fb6db311b8893a09c8053b80434240fb7` found no changes in the QA module closure,
migration inputs or package lock before the QA additions. This proves source-level
compatibility only; the server's actual files and installed dependencies remain
unverified. On SSH compare the old/new lockfiles and installed `pg`, `better-auth`
and `sharp` versions before reusing only the old dependency directory. Every
executable source file comes from the new archive. Do not grant roles or install
packages to resolve a mismatch.

Use the existing private operator process environment described in
[native-auth-rls-acceptance.md](native-auth-rls-acceptance.md). Required contracts:

| Input | Required value |
| --- | --- |
| `NATIVE_ROLE_PROFILE` / `NATIVE_HOSTING_CAPABILITY` | `hosting-test` / existing capability |
| `NATIVE_OPS_ENVIRONMENT` / `NATIVE_OPS_ROLE_KIND` | `disposable` / `migrator` |
| `NATIVE_OPS_DATABASE_URL` | Existing secret `mt_test_migrator`, `127.0.0.1:5433/mt_p4_test` |
| `NATIVE_ACCEPTANCE_RUNTIME_URL` | Existing secret `mt_test_runtime`, same target |
| `NATIVE_ACCEPTANCE_CLEANUP_URL` | Existing secret `mt_test_privacy_login`, same target |
| `NATIVE_OPS_SSL_MODE` / `NATIVE_OPS_SSL_CA_FILE` | `verify-full` / existing absolute CA path |
| `NATIVE_OPS_EXPECTED_FINGERPRINT` | Independent, verified 64-character test fingerprint |
| `NATIVE_ACCEPTANCE_HTTP_ORIGIN` | Verified canonical test HTTPS origin, without trailing slash |
| `NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT` | Same pin after application-to-test-DB review |
| `NATIVE_STORAGE_ROOT` | Actual test storage root; safe read-only operator access |

Verify the effective test application's DATABASE_URL, role profile, Better Auth
origin and storage root independently; the DB fingerprint alone cannot bind an
HTTP virtual host. Public signup must remain disabled. Use a quiet operator test
window: no concurrent acceptance, account changes, asset writes or other writers.
Stop without granting anything if existing credentials/SET/INSERT/EXECUTE or safe
storage access are missing. In particular, stage-record EXECUTE is required too.

Do not pass passwords via CLI, env, pipe, shell `read`, files or redirects. Passwords
are entered twice at the CLI's raw TTY prompt with echo disabled (8–128 characters,
Better Auth defaults); plaintext stays in process memory and only hashes go to the
credential table. Use an interactive SSH PTY, without terminal/session input
recording or debugger/instrumentation. The CLI never prints password/hash/SQL errors.
External terminal recording cannot be controlled by the CLI. Do not launch with
`script`, input logging or tracing; disable such recording before entry.

## Short Linux SSH sequence (later, explicit test execution)

First upload the delivered `mediatracker-manual-qa-<SHA>.tar` and `.tar.sha256`
via the existing SFTP/Plesk transfer method into the private
`$HOME/mt-manual-qa-transfer` directory (outside the web root). Use the full commit
SHA from the successful CI delivery. No connection/transfer was performed by Codex.
In the existing Plesk SSH terminal, run setup in a subshell; any error stops setup:

```bash
(
set -Eeuo pipefail
umask 077
read -r -p 'Delivered full QA commit SHA: ' SHA
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]]
cd "$HOME/mt-manual-qa-transfer"
sha256sum -c "mediatracker-manual-qa-$SHA.tar.sha256"
OPS="$HOME/mt-manual-qa-operator-$SHA"
OLD="$HOME/mt-v1-operator-627f0b6fb6db311b8893a09c8053b80434240fb7"
test ! -e "$OPS" && test ! -L "$OPS"
mkdir -m 700 "$OPS"
tar --no-same-owner --no-same-permissions -xf "mediatracker-manual-qa-$SHA.tar" -C "$OPS"
cmp "$OLD/package-lock.json" "$OPS/package-lock.json"
test -d "$OLD/node_modules"
ln -s "$OLD/node_modules" "$OPS/node_modules"
cd "$OPS"
/opt/plesk/node/24/bin/node --input-type=module <<'JS'
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const lock=JSON.parse(fs.readFileSync('package-lock.json'));
const req=createRequire(path.join(fs.realpathSync('node_modules'),'__qa_check__.cjs'));
for(const name of ['pg','better-auth','sharp']) {
  let dir=path.dirname(req.resolve(name)),found;
  while(dir!==path.dirname(dir)) {
    const file=path.join(dir,'package.json');
    if(fs.existsSync(file)){const p=JSON.parse(fs.readFileSync(file));if(p.name===name){found=p.version;break;}}
    dir=path.dirname(dir);
  }
  assert.equal(found,lock.packages['node_modules/'+name].version,'dependency mismatch: '+name);
}
console.log('DEPENDENCIES_MATCH_LOCK');
JS
/opt/plesk/node/24/bin/node scripts/native-manual-qa.mjs --plan > qa-plan.json
printf 'Operator ready: %s\n' "$OPS"
)
```

Retain the printed operator directory. In the same SSH terminal set up the test
commands (not the production env). Select only an existing private test operator
env containing all acceptance inputs above; never copy a runtime env wholesale:

```bash
set -Eeuo pipefail
umask 077
read -r -p 'Prepared operator directory: ' OPS
cd "$OPS"
NODE=/opt/plesk/node/24/bin/node
read -r -p 'Existing private test QA operator env absolute path: ' QA_ENV
[[ "$QA_ENV" = /* && -f "$QA_ENV" ]]
RUN_ID=$("$NODE" -p 'JSON.parse(require("fs").readFileSync("qa-plan.json")).runId')
QA_A_UUID=$("$NODE" -p 'JSON.parse(require("fs").readFileSync("qa-plan.json")).users[0].id')
QA_B_UUID=$("$NODE" -p 'JSON.parse(require("fs").readFileSync("qa-plan.json")).users[1].id')
QA_PIN=$("$NODE" --env-file="$QA_ENV" -p 'process.env.NATIVE_OPS_EXPECTED_FINGERPRINT || ""')
QA_ORIGIN=$("$NODE" --env-file="$QA_ENV" -p 'process.env.NATIVE_ACCEPTANCE_HTTP_ORIGIN || ""')
```

The private `qa-plan.json` retains the run ID, UUIDs and synthetic emails, never
passwords. Verify the test target/pin/origin independently before this command.
Do not pipe stdin or redirect stderr: the password prompts require a private TTY.
Only the sanitized JSON report on stdout is saved:

```sh
"$NODE" --env-file="$QA_ENV" scripts/native-manual-qa.mjs --create --run-id "$RUN_ID" \
  --confirmation "CREATE_MANUAL_QA mt_p4_test $QA_PIN $QA_ORIGIN $RUN_ID" > qa-create.json
"$NODE" -p 'JSON.parse(require("fs").readFileSync("qa-create.json"))'
```

Wait for target preflight, then type the two passwords directly into the hidden
prompts. `creation: PASS` means DB creation only, not browser login acceptance.
Never rerun creation to reset a password. On interruption/uncertain commit retain
the same run/UUIDs and use cleanup below before a fresh plan. On abrupt process kill,
restore the terminal with `stty sane` if needed.

## Manual browser E2E after creation

1. Open the verified test HTTPS site in two isolated browser profiles. Sign in
   normally with QA-A and QA-B emails/passwords. Signup stays unavailable; the
   existing signup route must remain closed. Pace sign-in attempts by at least
   11 seconds; retain the existing limiter and do not reset its global buckets.
2. Confirm each profile displays its own identity. Give A and B distinct synthetic
   library items, progress, favorites/notes, goals and theme choices. Confirm Cloud
   persistence after refresh and a fresh login; record local-only and HTTP Cloud
   results separately. A visible local item alone is not Cloud proof.
3. Confirm B never receives A's private items/notes/goals/preferences and vice
   versa. In one browser sign out A, sign in B, and confirm no previous owner flash
   or stale local data. Do not use real existing accounts/data for these probes.
4. Check ordinary wrong-password denial, sign-out and session invalidation. Record
   request status only; keep credentials, cookies, session tokens and response data
   out of screenshots/logs. Avoid asset uploads and cross-user social actions here.
5. Record PASS/FAIL/NOT_RUN separately for login, session, local owner isolation,
   Cloud persistence/isolation and theme behavior. This checklist does not replace
   the original automated Auth/RLS acceptance or prove backup/restore.

## Exact cleanup after all browsers stop writing

Use the same verified operator environment. No passwords are needed. Enter the
two UUIDs retained from the plan/creation report (never derive targets by email LIKE):

```sh
"$NODE" --env-file="$QA_ENV" scripts/native-manual-qa.mjs --cleanup --run-id "$RUN_ID" \
  --confirmation "CLEANUP_MANUAL_QA mt_p4_test $QA_PIN $QA_ORIGIN $RUN_ID" \
  --user-a "$QA_A_UUID" --user-b "$QA_B_UUID"
```

Require `cleanup: PASS` / `ACCOUNTS_REMOVED`. Any failure retains the run/UUIDs;
retry only after the operator resolves the exact blocker. A connection loss at
COMMIT can leave an uncertain outcome; same-target exact cleanup is idempotent.
Finally confirm both browser sessions are invalid and remove the isolated browser
profiles/downloaded synthetic exports manually. Production is excluded throughout.

## Local validation evidence

- PASS: 53 Node tests across manual QA, unchanged Auth/RLS acceptance, hosting
  acceptance and native privacy operator tests. SQL clients are synthetic; real
  Better Auth hash verification is used. The filesystem test passed with a unique
  workspace-local TEMP/TMP directory after the default sandbox TEMP path denied access.
- PASS: Node syntax, offline plan, targeted ESLint and whitespace checks for new files.
- PASS: all six stale preflight assertions corrected to 12 total / 10 remaining;
  terminal migration `012_public_signup.sql` is explicitly asserted. No safety
  assertion was removed or skipped; migrations and runtime code are unchanged.
- PASS: 34 neighboring Vitest tests, including the real loopback HTTP/Better Auth
  route with a synthetic DB, auth boundaries, browser adapter, password capacity
  and filesystem checks. No Windows symlink/FIFO error occurred in this targeted run.
- PASS: TypeScript `--noEmit --incremental false`; full `npm run lint` on a clean
  checkout-index copy of all tracked source (same ESLint config, no scope reduction),
  zero errors and one existing Next.js navigation warning in recommendation-composer.
  The first lint against the accumulated local scratch tree was interrupted.
  Full build/suite, hosted DB/TLS/permissions and browser E2E remain NOT_RUN locally.
  No live mutation occurred.
