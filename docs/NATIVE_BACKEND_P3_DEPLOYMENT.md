# Native backend P3 deployment preparation

2026-10-07. SOURCE_ONLY / LIVE_UNVERIFIED. No hosting/provider claim is accepted
as executed proof. Baseline `release/v1-hardening` at
`cc2acf8e1a6c933a51439dcb2054f9e7293a2c2e`, initial worktree CLEAN; P1/P2 preserved.
No branch/history change, commit, push, tag, deployment, remote SQL/mutation or
real-account/file migration. Historical native 001–008 and Supabase migrations,
dependencies/lockfile and accepted dev-only advisory exception are retained.

Operational sequence, configuration classes and all external gates are maintained
once in [native hosting runbook](NATIVE_HOSTING_DEPLOYMENT_RUNBOOK.md).
The legacy Supabase env contract remains separate; the generated current env JSON
is updated from its source. Frozen historical D8 prose is not rewritten.

## P3 source changes

- Native production boot validates explicit selector, mt_runtime DB/TLS/auth origin,
  private persistent root, independent limiter secrets and disabled AI flags;
  rejects Supabase/Vercel/operator assumptions. Passenger ingress remains untrusted.
  A complete server-configured single-header/P4-proof-reference/direct-access-denial
  tuple prepares the adapter without guessing provider headers. Its shape is not
  actual host proof; all three remain absent in P3/default startup.
- Official Next standalone output and a delegating CommonJS Passenger entry;
  runtime provider must match the built manifest. No independent HTTP server.
- Deterministic NEW-directory packaging preserves compiled Next/static/public,
  traced runtime modules and dynamically loaded Sharp native libraries. It
  dereferences verified module junctions into portable files and omits source,
  ops, tests, docs, env, backups, validation trees and caches. Manifest records
  SHA/branch/dirty source fingerprint, lock/migration/artifact checksums, build
  timestamp, Node/Next version and actual binary platform/architecture.
- Existing process pg singleton remains default 2/max 5, bounded acquisition,
  idle/query/statement/transaction deadlines and restrictive actual-role checks.
  No per-request pool or in-memory authority is added.
- Existing filesystem layout and authorization remain; precise path containment
  additionally rejects dot-prefix lookalikes, source ancestors and .git/.codex.
  Boot verifies/creates private required directories, with redacted failure codes.
- Additive native 009 exposes non-secret migration/readiness state, restricted
  operator freeze/reference/temp helpers, explicit search_path and grants.
  `native-migration-state.json` pins all nine current normalized checksums.
- Separate executable migration runner defaults OFFLINE, requires independent
  operator URL/environment/fingerprint and exact apply confirmation; ordered
  checksum history, rollback/ledger verification and a run-wide advisory lock.
- Shared operator target inspection uses actual DB/role/OID/address/version and
  configured host/environment; no runtime URL fallback or credential logging.
- One-shot bounded maintenance retries durable asset cleanup, stale temp and
  limiter expiry. CAS freeze/unfreeze and state inspection are explicit. Existing
  privacy job is exposed only with its real runner-issued disposable capability,
  preserving staged/Auth-last behavior; export/identity content is never logged.
- Native directory backup streams PostgreSQL dump, copies bounded private assets,
  validates hashes/checksums/references and leaves the existing write barrier
  frozen. It requires actual operator quiescence and never promises DB+FS atomicity.
- Restore requires a separately pinned complete backup and EMPTY development/
  disposable DB/filesystem, preserves ownership/ACLs, checks contents/ledger/refs
  and returns FROZEN for reconciliation. Production/staging restore is refused.
- Safe-route wrapped no-store health: liveness 200 independent of DB, readiness
  503 for invalid config/unusable FS/missing or mismatched migration/frozen state/
  unavailable or unsafe pg role. Detailed DB/operator identity is not public.
- Resource caps: unchanged bounded bodies/assets/pixels/delivery; Sharp one
  decoder thread/16 MiB cache; two simultaneous unchanged Better Auth scrypt
  operations with no wait queue; web privacy result <=16 MiB with no truncation;
  streamed backup <=2 GiB/10,000 files. These are bounds, not a measured 1 GB SLA.
  Native Next image optimization additionally caps source bodies at 10 MiB,
  decoded pixels at 16,777,216 and optimizer time at five seconds, with one decoder
  thread/no operation cache. Next response memory cache is 16 MiB. Supabase Next
  defaults remain unchanged; version-specific optimizer controls require review
  when updating the pinned framework.
- Limiter Supabase SDK/server-client imports are lazy in the fallback branch.
  Existing native isolation/domain tests cover Auth/pg/storage/limiter selection.
  Dormant fallback packages/compiled code may be traced; native requests must not
  construct/call their transport. Vercel identity API is not called in native mode.

## Cold-start and logging review

Better Auth sessions/quotas, limiter receipts/buckets, account lifecycle/admission,
domain revisions/receipts, asset intents/current references and cleanup retry state
are durable. Process caches and password capacity counters affect performance only.
Transactions drain bounded external work and release/discard connections. No
required timer loop, permanent queue or fire-and-forget erasure was introduced.
Transient timeout timers are cleared; ops commands exit. Process death must roll
back DB transactions; hosted failure/late IO remains a P4 fault-injection proof.

Native Auth logger is disabled; pool idle errors and operator/subprocess failures
are categorized without original error/SQL/credentials. Safe-route correlation
and existing logging allowlists remain. Manifests contain file/checksum metadata,
not runtime secrets. Backup personal data/hashes/sessions require private operator
storage/encryption and the P4/P5 retention/reconciliation procedure.

## Validation record

P3_STATUS = COMPLETE (deployment source/tooling and local dry run only)
P4_READY = YES
EXPECTED_BASELINE_MATCHED = YES
BASELINE_COMMIT_PRESERVED = YES
INITIAL_WORKTREE_STATUS = CLEAN

- Full offline Vitest: **3115 PASS, 57 SKIP, 0 FAIL** (+34 P3 tests).
  Skip accounting remains 56 historical/environment/live plus one native disposable
  PostgreSQL integration proof. No new skips or weakened assertions.
- Canonical Node selection: **148 PASS, 0 FAIL, 0 SKIP** (+14 P3 operator tests).
  Includes synthetic filesystem backup/restore round-trip; PostgreSQL tools/queries
  are mocked in that test. It does not establish real dump/restore/RLS semantics.
- TypeScript `--noEmit --incremental false`: PASS; both build typechecks PASS.
- Tracked plus new source ESLint: **0 errors, 9 existing warnings/notices**.
- CI/source/migration/security/privacy/release contracts, CLI syntax, offline operator
  plans and `git diff --check`: PASS. Tests retain exact assertions; route inventory
  now counts the two read-only health routes and tracing checks require all exclusions.
- Offline Supabase production build: PASS. Offline native production build: PASS.
  Each has 17 dynamic-filesystem tracing warnings (15 historical, two instrumentation
  traces). Package allowlist and native-library validation handle over/under tracing.
- Runtime dependency audit: **0 vulnerabilities**. Full advisory verification:
  **5 unchanged dev-only High, 0 Critical**, accepted under V1-SEC-EXCEPTION-001,
  expiry 2026-11-03. Package/lockfile and exception scope are unchanged.
- Standalone directory verified locally: compiled server/static/public, required
  modules and Sharp libraries; no source/ops/tests/env/backups/.git/.codex/cache/
  bulk dev dependencies. Machine/human manifests distinguish dirty P3 source from
  the baseline SHA and record Windows x64 ABI; matching Linux build is a P4 gate.
- Packaged process run outside the source/node_modules ancestry: liveness 200,
  homepage 200 with nonce CSP, readiness 503 and anonymous Auth request 503 with
  unavailable synthetic DB; restart retained a synthetic private file. No Auth/DB
  success is inferred from startup. Supabase environment was absent, external TCP
  blocked; no real account/file was used. Final content/secret safety scan is local.
- REAL_DB_PROOF = **BLOCKED_ENVIRONMENT**. Existing isolated Docker proof runner
  reports local Docker/image unavailable; no remote/staging/production substitute.
- Hosting/SQL/RLS/session/real backup restore/cron/RSS under load: **NOT RUN /
  REQUIRES_P4_PROOF**. No GUI/browser/E2E, hosted smoke or provider access occurred.

No known source-level P3 deployment work remains; P4 proof can reveal defects or
an unsupported proxy/platform contract. This verdict does not
prove legal compliance, Türkiye residence/retention, backup atomicity, 1 GB capacity,
real hosted domain correctness or Production acceptance.

## P4-only proof and durable knowledge

Runbook items 1–29 enumerate actual provider role/pgcrypto/TLS/connection capacity,
ingress, Passenger/streaming/sleep, filesystem/link/fsync/permissions/quota, cron,
backup/restore and native Auth/RLS/domain/concurrency/privacy proofs. The Windows
artifact is locally runnable evidence; hosting requires a matching Linux build.
Production identity/data migration and cutover remain separately authorized P5.

This adds durable deployment/operations knowledge. Configured Vault context lookup
returned `VAULT_GIT_INVALID`; no canonical Vault edit/sync/commit/push occurred.
The two P3 documents are the reviewable knowledge source; a Vault update is
proposed only after its own router/protection protocol becomes available.
The existing project routing map now includes health/bootstrap/P3 docs/tests.
Generated AGENTS was not rebuilt because this request forbids editing AGENTS;
its adapter metadata refresh remains outside the authorized source work.
