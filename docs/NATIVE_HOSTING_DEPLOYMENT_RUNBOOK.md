# Native hosting deployment runbook

2026-10-07 source procedure; hosting status updated 2026-10-08 from user-reported
disposable probes. Target: TürkHosting/shared Node hosting; untested provider
properties remain unverified. This document authorizes no connection,
deployment, database mutation, real-user migration or Production cutover.
P3 source/validation evidence: [P3 deployment](NATIVE_BACKEND_P3_DEPLOYMENT.md).
Supabase fallback and historical migrations remain intact until P4 acceptance.

## Historical P4 access qualification — earlier on 2026-10-08

`P4_STATUS=BLOCKED_ACCESS`, `P5_READY=NO`, `REAL_DB_PROOF=BLOCKED`.
The scoped local configuration inventory exposed no usable TürkHosting/native
operator access or confirmed disposable application/database target. No remote
connection, deployment or SQL was attempted. Provisioning and all provider runtime
facts remained `UNVERIFIED`; none became `PROVEN` or `FAILED` in that attempt.
The exact access prerequisites and pending proof register are recorded in
[P4 hosting proof](NATIVE_BACKEND_P4_HOSTING_PROOF.md). The earlier instruction was
to resume at access qualification and independent target fingerprinting without
substituting the existing staging DB. That attempt preserved an uncommitted P3
workspace authorized for disposable proof. Pin source/artifact manifests; the
clean committed artifact requirement remains a Production/P5 gate.

## Current P4 hosting prechecks — later on 2026-10-08

`P4_STATUS=ACCESS_QUALIFIED`, `P5_READY=NO`, `REAL_DB_PROOF=BLOCKED`.
All remote evidence here was supplied by the user; Codex did not independently
run SSH/Plesk/DB/Actions tests in this documentation update. Only disposable P4
work was performed. Detailed outputs, targets and limits are in the
[current P4 proof register](NATIVE_BACKEND_P4_HOSTING_PROOF.md).

- TürkHosting/Plesk/Passenger at `mediatracker.baglare.com.tr`: application
  `x86_64`, glibc 2.28, Node 24.21.0, artifact Next 16.3.8, PostgreSQL 18.6.
  Plesk mode `production`, document root `/mediatracker.baglare.com.tr/public`,
  application root `/mediatracker.baglare.com.tr`; panel mode is not acceptance.
- Actions validation/artifact jobs PASS for commit
  `f81d30586011ebbe476725684facff3b82332796` on `release/v1-hardening`,
  run `37806188211`, artifact `mediatracker-native-linux-f81d30586011`.
  SSH archive transfer checksum was OK; extraction only into
  `~/mt-p4-artifact/release-test`. Required entry files and Sharp were present.
  ABI comparison and Sharp image probe PASS (Sharp 0.35.5 / libvips 8.18.7).
  This is scoped native-library proof; actual Next standalone startup is NOT_RUN.
- Temporary independent `app.js` HTTP server PASS through Passenger/HTTPS and
  received `BACKEND_PROVIDER=native`; explicit `PORT` was absent. Real
  MediaTracker `app.cjs`, liveness/readiness and domain behavior remain NOT_RUN.
- DB BLOCKED at test endpoint `127.0.0.1:5433`: `PG_TLS=NOT_SUPPORTED` conflicts
  with production `verify-full`; test login `mt_p4_runtime` differs from required
  `mt_runtime`; its direct public CREATE grant is rejected by native pool checks.
  Database `mt_p4_test` is owned by `postgres`; public by `pg_database_owner`.
  TLS/runtime privilege/role provisioning support request sent; reply pending.
  No migration, role privilege change or application DB readiness test occurred.
- `~/mt-p4-storage` layout, directory `0700`/owner `wfdqewrm`, Node exclusive
  write/link/fsync and probe persistence across Passenger restart PASS. Probe
  file cleaned, directories retained. Real app file authorization, server reboot,
  disaster durability and backup/restore remain UNVERIFIED / NOT_RUN.
- Plesk package shows 10 GB disk / 200 GB monthly traffic; uncollected `0 MB`
  statistics are not usage proof. `ulimit -v=unlimited`, `ulimit -u=191898`,
  cgroup memory limits inaccessible. Temporary app RSS `54336 KB` is not
  MediaTracker usage. Recalled 1–2 GB RAM / two cores are unverified estimates;
  official limits, 1 GB budget, workers, peak RSS/concurrency and CPU remain open.

Next safe step: review the pending support reply against existing DB contracts,
without weakening TLS/role/CREATE checks. Real deployment still needs a
canonical-origin rebuild (current artifact uses `https://app.example.invalid`),
independent target fingerprinting and separately authorized disposable runtime
proof. DB/RLS/Auth, ingress, resources, maintenance, privacy and recovery gates
remain open; Production/P5 conditions and Supabase rollback procedures below remain.

## Experimental Linux artifact pipeline — 2026-10-08

Initially implemented locally with GitHub execution `NOT_RUN` at that time.
The later user-reported successful run is pinned in the current prechecks above.
Historical Phase 0 evidence remains an account of the earlier attempt.
This job is packaging only, not hosting acceptance or deployment.

- A push to `release/v1-hardening` starts CI; `native-linux-artifact` runs only
  after `validate` succeeds. Main, pull requests and other release branches do
  not run packaging. Existing Supabase validation remains unchanged.
- Ubuntu 24.04 / Node 24.21.0 performs `npm ci`, validates synthetic production
  configuration and builds native standalone with the existing offline preload.
  The DB is unreachable loopback port 1; auth/limiter strings are synthetic,
  app origin is `https://app.example.invalid`, AI/research/cache remain disabled.
  No repository secrets, Supabase configuration, migrations or email/provider
  calls are used. These build values are never valid hosting credentials.
- P3 `native-package.mjs create` and `verify` use a new run/attempt directory.
  An additional safety check rejects private paths, env, dumps/archives, token
  signatures, embedded build credentials, dev-only packages and non-Linux native
  binaries. Signature scanning is a guard, not proof against every possible secret.
  `readelf` records all packaged ELF x64 libraries, dependencies, search paths
  and GLIBC/GLIBCXX/CXXABI symbol versions. Packaged Sharp/libvips processes a
  generated pixel on the builder; no application or database is started.
- Repository **Actions → CI → successful run for the exact branch/SHA → Artifacts**:
  download `mediatracker-native-linux-<12-character-sha>` within seven days.
  Unzip the GitHub download wrapper to obtain `.tar.gz`, `.tar.gz.sha256` and
  `native-abi.json`. The packaging job itself does not upload to TürkHosting;
  the later disposable SSH transfer is recorded above.
- From that download directory on Linux, run
  `sha256sum -c mediatracker-native-linux-<sha>.tar.gz.sha256` before extraction.
  On Windows, compare `Get-FileHash <archive> -Algorithm SHA256` to the checksum.
  Inspect `tar -tzf <archive>`; extract into a NEW empty directory with
  `tar -xzf <archive> -C <new-directory>`. Tar contains directory contents including
  `.next`. Inspect `deployment-manifest.json`: source SHA/branch, clean worktree,
  native selector, Linux/x64/buildLibc, lockfile/migration/file checksums.
  From a matching source checkout, run `node scripts/native-package.mjs verify
  <extracted-directory>` to verify the inner file inventory. Outer hash proves
  transfer integrity, not independently trusted provenance; match the Actions SHA.
- Later, only with separate target/upload authorization, transfer these verified
  contents to a new release folder and reverify checksums. Preserve `.next`, public
  assets and traced modules; configure real runtime secrets privately outside the
  archive. Synthetic public app origin is compiled: a real-host release requires
  a separately approved rebuild with its canonical origin before deployment.
- `HOST_ABI_COMPATIBILITY = PARTIAL`: the later host ABI comparison and Sharp
  smoke passed within their reported scope; full standalone/native-path acceptance
  remains UNVERIFIED. Ubuntu success alone is not hosting proof.
  Obtain the APPLICATION runtime's glibc, loader, libstdc++, CPU/OS/architecture
  and Node 24.21.0 facts; compare ELF requirements and prove Sharp/libvips loading
  on the separately authorized disposable host. A Red Hat PostgreSQL SERVER build
  cannot establish the application glibc. Musl variants, other native modules and
  shared-library resolution also need review. `native-abi.json` records builder
  evidence only. Real PostgreSQL/RLS acceptance remains pending.
- Deployment and ordered database migration are separate authorized operations
  with their own fingerprints, backups and rollback gates below. Downloading an
  artifact authorizes neither operation; Supabase fallback/history stay intact.

## Environment contract

Web environment and operator environment are separate. The machine contract is
`scripts/ops/release-policy.mjs` / `docs/V1_HARDENING_06_ENV_CONTRACT.json`.
`nativeDeploymentConfig` validates boot; `nativeConfig` validates infrastructure.
Builds use synthetic secrets and an unreachable loopback DB, never production secrets.

| Variable | Native production class | Allowed value / default | Owner |
| --- | --- | --- | --- |
| `BACKEND_PROVIDER` | REQUIRED, server PUBLIC selector | `native`; build/runtime must agree | release |
| `NEXT_PUBLIC_BACKEND_PROVIDER` | PUBLIC, build generated | generated from selector; no manual override | build |
| `NODE_ENV` | REQUIRED, PUBLIC runtime | `production` (startup sets it) | platform |
| `DATABASE_URL` | REQUIRED, SECRET | PostgreSQL URL, `mt_runtime`, explicit DB, no query/hash | database |
| `DATABASE_SSL_MODE` | REQUIRED, PUBLIC server config | `verify-full`; local development can use `disable` | database |
| `DATABASE_POOL_MAX` | OPTIONAL, PUBLIC server config | default 2, integer 1–5 **per process** | database |
| `DATABASE_CONNECTION_TIMEOUT_MS` | OPTIONAL, PUBLIC server config | default 3000, 250–5000 | database |
| `DATABASE_IDLE_TIMEOUT_MS` | OPTIONAL, PUBLIC server config | default 10000, 1000–30000 | database |
| `DATABASE_STATEMENT_TIMEOUT_MS` | OPTIONAL, PUBLIC server config | default 5000, 250–5000; query deadline +1000 | database |
| `BETTER_AUTH_SECRET` | REQUIRED, SECRET | independent high-entropy secret, at least 32 characters | auth |
| `BETTER_AUTH_URL` | REQUIRED, PUBLIC origin | canonical HTTPS origin, no path/query/credentials | auth |
| `NEXT_PUBLIC_APP_URL` | REQUIRED, PUBLIC build value | exact canonical auth origin; no localhost | release |
| `NATIVE_STORAGE_ROOT` | REQUIRED, PRIVATE server path | absolute persistent private root outside source/releases/build/public; no symlinks | storage |
| `TRUSTED_INGRESS_MODE` | REQUIRED, PUBLIC server config | `passenger` or `unconfigured`; no header trusted by default | security |
| `TRUSTED_INGRESS_HEADER` / `TRUSTED_INGRESS_PROOF_SHA256` / `TRUSTED_INGRESS_DIRECT_ACCESS_BLOCKED` | OPTIONAL complete tuple, server non-secret | P4-proven single overwritten lowercase x-* IP header, independently reviewed proof SHA-256, `1`; absent throughout P3 | security |
| `RATE_LIMIT_IDENTITY_HMAC_KEY` | REQUIRED, SECRET | at least 32 characters; independent | security |
| `RATE_LIMIT_RPC_SIGNING_KEY` | REQUIRED, SECRET | at least 32 characters; independent | security |
| `RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY` | OPTIONAL, SECRET | independent previous key, at least 32 characters | security |
| `RATE_LIMIT_RPC_KEY_VERSION` | REQUIRED, PUBLIC server config | 1–32 alphanumeric/underscore/hyphen | security |
| `RATE_LIMIT_RPC_AUDIENCE` | REQUIRED, PUBLIC server config | 1–96 alphanumeric/colon/underscore/hyphen | security |
| `NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE` / `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED` | OPTIONAL capability pair, PUBLIC | `d2c1` / `true` only after matching ledger proof | release |
| `NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE` / `NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED` | OPTIONAL capability pair, PUBLIC | `v1` / `true`, requiring the Media pair | release |
| `MEDIA_TRACKER_PROVIDER_USER_AGENT` | OPTIONAL, PUBLIC provider identity | real reviewed contact; otherwise Open Library disabled | provider |

Required fixed v1 values: `AI_SERVER_ACCESS_MODE=disabled`,
`D7_RESEARCH_ROLLOUT_MODE=disabled`, `D7_RESEARCH_SHADOW_ENABLED=0`,
`D7_RESEARCH_PUBLIC_CITATIONS_ENABLED=0`, `D7_RESEARCH_EVIDENCE_CACHE_ENABLED=0`,
`MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE=off`. Signup remains denied.
Existing release checks still reject paid keys, fixture/live-smoke/staging variables,
invalid capability pairs and unreviewed variables. Native web boot additionally
rejects Supabase, Vercel, `PG*`, privacy/DR and `NATIVE_OPS_*` credentials/config.
Never upload `.env.local`, use runtime credentials for migrations, or place operator
credentials into Passenger. No production AI key is needed.

## Sequential operator procedure (remaining separately authorized P4 work)

Current prechecks above qualify only their stated probes. The following acceptance
and safety procedure remains in force; probe success does not complete a step's
broader application/runtime contract.

1. **Hosting prerequisites:** obtain an exact account/application/database target,
   TLS hostname, architecture/OS/libc, SSH/operator execution access, upload limits,
   persistent quota and app stop/restart mechanism. Node 24, Next 16, SSR/App Router,
   RSC/Route Handlers, 1 GB RAM, 4 GB persistent disk, sleep/cold start, outbound
   HTTPS and Türkiye residence/backups are `REQUIRES_P4_PROOF`. No guessed panel fields.
2. **Node version:** verify the actual worker Node 24 and process architecture.
   Build on a matching Linux/architecture/libc builder outside hosting. The Windows
   P3 package is a diagnostic artifact; its DLLs cannot run on Linux.
   Start conservatively with one worker and pool max 2 if the panel permits;
   additional workers need measured aggregate RSS/DB capacity, not a guessed limit.
3. **PostgreSQL creation:** first use a fresh isolated disposable database, never
   an existing real-user database. PostgreSQL 18.6, TLS certificate validation,
   extension rights, standard pg connectivity and total connection limits are
   `REQUIRES_P4_PROOF`. Version/role/database mismatch stops the operator runner.
4. **Environment:** supply the table above through the panel's verified secret
   mechanism. Public Cloud flags are build-time values and require a rebuild.
   Review the release-policy result separately from host/runtime evidence.
5. **DB roles:** migration login requires database ownership, CREATEROLE/extension
   provisioning and SET ROLE membership. Migrations create restricted `mt_owner`,
   `mt_auth_owner`, `mt_auth_access`, `mt_privacy_operator`, `mt_limiter`, and
   `mt_runtime` (connection limit 5). Set runtime password out-of-band. Provision
   an independent operator login/member of `mt_privacy_operator`; never grant its
   membership to runtime. Role creation/ownership are `REQUIRES_P4_PROOF` and may
   be a hosting blocker. Restore requires these exact roles precreated separately.
6. **pgcrypto:** inspect provider extension availability/rights (`REQUIRES_P4_PROOF`).
   Current native 001–009 uses PostgreSQL built-in hashes and does not install or
   require pgcrypto. Do not create an unused extension or treat its absence as a
   current runtime blocker. Any future extension prerequisite needs explicit review.
7. **Migration runner:** run operators from a private, verified source checkout
   with its existing locked Node dependencies, outside the web release. For jobs
   needing files, that checkout must execute on the machine with the data volume.
   The web artifact intentionally contains no privileged operator scripts.
   `node scripts/native-migration-runner.mjs` is offline inventory only.
   For a separately authorized inspection set `NATIVE_OPS_DATABASE_URL` (SECRET),
   `NATIVE_OPS_ENVIRONMENT` (`development/disposable/staging/production`), and
   `NATIVE_OPS_SSL_MODE` (`verify-full`; local disposable can use `disable`), then
   add `--connect`. Record the actual non-secret fingerprint independently.
   Set `NATIVE_OPS_EXPECTED_FINGERPRINT` to that verified SHA-256. Inspect again
   to validate the ledger/list pending migrations; apply needs
   `--connect --apply --confirmation "MIGRATE <environment> <fingerprint>"`.
   Unknown/checksum-changed/non-prefix history fails closed. Migrations 001–009
   run transactionally under one migration advisory lock. No automatic boot DDL.
8. **Persistent data directory:** verify a private absolute path, Unix permission
   isolation, writable/executable directories, same-volume link/fsync and quota.
   Use the existing P2 layout: `<NATIVE_STORAGE_ROOT>/users/<uuid>/{avatar,banner}`
   and `temporary-uploads/`. Do not rename it to a parallel asset layout. Boot
   creates these two directories safely; readiness is read-only. Data must survive
   release replacement and Passenger sleep. Paths/permissions are `REQUIRES_P4_PROOF`.
9. **Standalone build:** use the locked dependencies on a matching builder.
   Build `BACKEND_PROVIDER=native` with synthetic DB/auth/limiter values, disabled
   AI flags, canonical public flags and offline network isolation. Use the
   installed Next standalone behavior, not a custom application server. Do not
   run `next build` on the 1 GB host. Package with
   `BACKEND_PROVIDER=native node scripts/native-package.mjs create dist/<new-release>`;
   verify with `node scripts/native-package.mjs verify dist/<new-release>`.
   Output is an uploadable directory, not a required archive format. Never reuse
   an existing output directory. Preserve the manifest and optional outer archive hash.
10. **Artifact upload:** upload only the verified directory contents to a NEW
    release folder. Preserve `.next/static`, `public`, generated server and traced
    modules/native libraries. No `.git`, `.codex`, tests, env, caches, source trees,
    backups or bulk development dependencies. Verify checksums after transfer.
    For disposable P4, the authorized dirty workspace may be packaged with its
    source fingerprint and artifact checksums pinned. Production/P5 release
    acceptance still requires a clean tested committed SHA.
11. **Passenger startup:** panel application root `<UPLOADED_RELEASE_ROOT>`, startup
    file `app.cjs`, Node `<VERIFIED_NODE_24_PATH>`, runtime env `<VERIFIED_PANEL_ENV>`.
    These are placeholders, not provider answers. Entry delegates to Next `server.js`,
    sets production and reverse-proxy bind `0.0.0.0`, and respects provided `PORT`.
    Passenger auto-install/listen interception/socket behavior, worker count and
    buffering are `REQUIRES_P4_PROOF`. Do not rewrite Next HTTP/RSC/CSP behavior.
12. **Liveness:** GET `/api/health/live` must return 200/alive, no-store; proves
    process response only. It does not prove database availability or domain behavior.
13. **Readiness:** GET `/api/health/ready` must return 200/ready only with valid
    native configuration, safe writable filesystem, verified runtime pg role,
    exact 001–009 checksums and unfrozen admission. DB failure/missing migration/
    frozen state yields 503/unavailable. No public environment/SQL/role dump.
14. **Synthetic users:** create only explicit disposable A/B fixtures with the
    established proof/operator mechanism. Public signup stays disabled; no new
    invitation/admin system. Never use real accounts or real assets for P4 proof.
15. **Better Auth:** prove native SQL sessions/cookies, fixed origin, signup denial,
    password verification after worker restart, lifecycle/session revocation,
    and no Supabase Auth call. Scrypt format/cost is unchanged; at most two native
    password operations per process, excess work fails without an unbounded queue.
16. **RLS A/B:** run current native proof SQL in disposable transactions; test
    cross-owner reads/writes, anonymous writes, spoofed identity and role membership.
    Catalog/trigger/function grants and actual PostgreSQL behavior are required.
17. **Social:** prove profile/visibility/block/follow/notifications/comments,
    participant barriers and absence of forged-user privilege.
18. **Cloud Media:** prove atomic RPC, receipts, revision/tombstone/CAS, transfer,
    conflict behavior and rollback on concurrent failures.
19. **Goals:** prove owner/CAS/receipt/idempotency behavior and account freeze.
20. **XP/theme:** prove immutable event/reconciliation and route-scoped theme,
    revision conflict and visitor theme preservation.
21. **Limiter/ingress:** prove durable quotas/replay/cooldowns across workers/restarts.
    Native ingress currently fails closed with no trusted IP. Provider statements
    do not prove header authenticity. Direct-access denial and proxy overwrite of
    the actual client-IP/header must be demonstrated before a narrowly reviewed
    ingress adapter is enabled. After independently reviewing real evidence, set
    the optional header/proof-hash/direct-access-blocked tuple. Source validates
    its shape only; an arbitrary hash or `1` does not establish proxy safety.
    Missing/partial tuple and comma-separated IP chains fail closed. This is
    `REQUIRES_P4_PROOF`; do not whitelist
    `x-forwarded-for`/`x-real-ip` by assumption. Better Auth trusts no forwarding header.
22. **Filesystem:** prove upload/decode limits, exclusive publication, authorization,
    no direct private-file access, crash/orphan retry and release replacement.
    Pool slots bound simultaneous transactional image work; Sharp has one decoder
    thread and a 16 MiB cache. Avatar 5 MiB/banner 10 MiB, 8192-axis/16,777,216-pixel
    limits remain. Read delivery allocates only the authorized bounded metadata size.
    Native Next optimizer also caps remote source bodies at 10 MiB, input pixels at
    16,777,216 and optimizer time at five seconds; Next memory cache is 16 MiB.
23. **Cold start:** stop the process/wait for actual provider sleep; first request
    must boot/configure/verify session/limiter/domain correctly. No permanent loop
    owns cleanup or correctness. Measure first-request latency and RSS/heap under
    concurrent login/upload/export; the 1 GB budget is `REQUIRES_P4_PROOF`.
24. **Maintenance/cron:** `node scripts/native-maintenance.mjs` is offline inventory.
    Authorized `--connect` plans bounded work; apply requires exact
    `"MAINTAIN <environment> <fingerprint>"`, `--apply`, and `--storage <PRIVATE_ROOT>`.
    Default job retries at most 500 asset intents, scans at most 500 temp entries
    and cleans at most 500 limiter rows. Temp deletion requires age >1 hour plus
    DB intent revalidation; cycle `--cursor <returned nextCursor>` back to zero.
    Operation receipts retain business idempotency history; no invented expiry.
    `--job inspect` reads freeze state; `--job freeze/unfreeze --revision <observed>`
    uses CAS. Unfreeze only after reconciliation/approval, never automatically.
    `--job privacy` remains runner-owned disposable only: requires actual Docker
    container/run/local-endpoint proof plus user/email, dedicated erasure confirmation
    and participant-loss acknowledgement; it never logs exports. Production erasure
    authority remains P5. Host cron, job deadlines and operator access are
    `REQUIRES_P4_PROOF`; required work never relies on Passenger staying awake.
25. **Backup:** private operator login must have dump privileges for ALL schemas,
    including FORCE-RLS and native Auth, plus privacy-operator membership. An
    underprivileged dump must fail; never use `--no-owner`, `--no-acl`, filtered
    application-only tables or claim a complete backup. Use PostgreSQL 18 tooling.
    `node scripts/native-recovery.mjs backup` is offline. Future authorized plan/apply
    uses `--connect`, `--storage`, `--output <NEW_PRIVATE_OUTSIDE_SOURCE_PATH>`, exact
    `"BACKUP <environment> <fingerprint>"`, `--apply`, and
    `--quiesced ALL_WORKERS_AND_OPERATORS_STOPPED` after actually stopping ALL web
    workers/scheduled writers. Tool acquires maintenance lock, establishes the existing
    global DB write freeze, dumps, copies private regular files, checks copy hashes,
    ledger and referenced file sizes, then writes a secret-free pinned manifest.
    It leaves writes FROZEN on success/failure. The DB+filesystem are not one atomic
    transaction; operator quiescence is an attestation, not a machine-proven host fact.
    Backup contains personal data, auth hashes and sessions: keep private/encrypt with
    operator-managed storage encryption, separate keys, access and retention policy.
    Runtime auth/limiter/DB secrets are not included. Filesystem/dump total budget
    2 GiB, 10,000 files; large installations require a reviewed higher-capacity plan.
    External pg tool deadline is 180 seconds. Free disk for app+data+backup is a gate;
    4 GB does not promise room for all copies. Provider daily/weekly/four retained
    Türkiye backups and restoration scope are `REQUIRES_P4_PROOF`.
26. **Restore rehearsal:** independently pin the backup fingerprint. Offline verify:
    `node scripts/native-recovery.mjs verify --input <BACKUP_PATH>`. Restore permits
    only new EMPTY development/disposable DB and EMPTY private storage; refuses
    staging/production or existing data. Plan/apply require exact target, pinned
    `--backup-fingerprint`, `--input`, `--storage`, same quiescence attestation and
    `"RESTORE <environment> <fingerprint>"`. Precreate restricted roles with the
    approved ownership/membership graph, then preserve dump owners/ACLs using
    single-transaction `pg_restore --exit-on-error`. Verify ledger, hashes, DB/asset
    references and retained freeze. Pending account/participant/privacy states,
    role/RLS catalog equality, authenticated restored sessions, complete residual
    reconciliation and provider restoration must be proven before any unfreeze.
    Tools report `RESTORED_FROZEN`, never legal/privacy/global DR closure.
27. **Privacy proof:** run explicit native export/delete on synthetic accounts,
    interruption/retry, concurrent recreation, pending upload lease and Auth-last
    residual checks. Web export transport is capped at 16 MiB; oversized export
    fails without truncation and needs an operator procedure. DB JSON construction
    itself remains subject to query deadline and requires realistic P4 load proof.
28. **Rollback:** keep fallback source/dependencies/Supabase history. Stop traffic,
    freeze writers, preserve incident state/backups, and select an independently
    verified previous provider/data snapshot. Source selector rollback alone does
    not synchronize native/Supabase databases or migrate new native users/files.
    No blind down migration, dual-write improvisation or automatic unfreeze.
29. **Production cutover:** only after P4 hosting/database/RLS/auth/domain/storage/
    cold-start/ingress/maintenance/restore proofs and remaining legal/operator/vendor
    gates. Then separately authorized P5 targets, migration strategy for real users/
    password hashes/assets, clean tested committed artifact, backup/change window,
    production env, bounded acceptance and rollback authority. No P3 permission
    implies Production deployment or real-user/data migration.
