# Native backend P2 migration

Date: 2026-10-07. CURRENT_SOURCE_FACT / SOURCE_ONLY / LIVE_UNVERIFIED.

P2A_STATUS = PRESERVED
P2B_STATUS = COMPLETE
NATIVE_SOURCE_IMPLEMENTATION = COMPLETE
P3_READY = YES
REAL_DB_PROOF = BLOCKED_ENVIRONMENT

These are source-completion classifications under the P2B acceptance contract.
They do not establish executed PostgreSQL/RLS, Passenger, hosted authentication,
filesystem persistence, backup/restore or Production acceptance.

## Authoritative baseline and preservation

Work continued from the dirty local `release/v1-hardening` workspace at HEAD
`a68317b8b719600e3731912d05ef3cc97c184b94`. P2A baseline was 3023 Vitest PASS,
57 SKIP and 120 Node PASS. Existing hardening, P1 identity/transaction/provider
foundation and P2A Cloud/Goals were retained. Native migrations 001–004 and all
historical Supabase migrations remain unchanged by P2B. Package manifests and
lockfile were not edited during P2B. The verified rollback backup was untouched.
No reset, restore, checkout, stash, clean, commit, push, merge, tag, deployment,
remote mutation or real-user/asset migration occurred.

## P2A retained and regression-tested

P1 Better Auth UUID/session verification, signup denial, native pooling, provider
selection and authenticated transaction contexts remain. Cloud Media atomic RPC,
revision/receipt/snapshot/transfer/queue paths and Goals CAS/receipt/read paths
remain. Small shared additions support anonymous public reads, closed public
business-error codes, transaction-local pseudonyms and draining bounded external
file IO before rolling back a timed-out admission transaction.

Cloud conflict summaries now use the same native same-origin transport with an
expected-owner stale-session check; this value never proves authentication.
The existing release-policy prohibition on native Cloud/Goals was narrowed to
require the existing D2C.1 rollout contract. No Cloud/Goal redesign was performed.

## P2B native schema and domains

The separate migration manifest now contains eight migrations. New artifacts:

- `005_social_xp_themes.sql`: current effective Social/profile/participant/XP/theme
  behavior translated into native identity and roles. Includes modules, showcase,
  stats/history, follows/requests/blocks, notes/activity/comments/reactions,
  recommendations/messages/notifications/reports, visibility, XP definitions,
  immutable/reversible ledgers/reconciliation and theme revision functions.
- `006_distributed_limiter.sql`: persistent receipts, buckets/capacities, budgets,
  cooldowns and social abuse controls. Uses the corrected effective reservation
  function and native HMAC verification instead of Supabase Vault.
- `007_filesystem_assets.sql`: owner-scoped durable asset intents/current
  references, delivery visibility and operator cleanup functions.
- `008_privacy_lifecycle.sql`: write containment, explicit export, staged cleanup,
  participant detachment, XP cleanup, residual detection and Auth-last finalization.

Offline compilers for 005/008 consume the current local effective source and emit
separate static native SQL. Native execution never runs historical Supabase SQL.
FORCE RLS, owner WITH CHECK, restricted NOLOGIN function owners, explicit function
privileges, safe search paths, receipts and business invariants are retained.
The trusted runtime binds verified application identity; resource UUIDs are not
identity evidence. Privileged operator roles are not granted to `mt_runtime`.

Existing Social, XP and theme routes now select `getApplicationServerClient`.
Native dispatch uses a fixed parameterized RPC/table/column registry inside the
verified transaction; it permits neither arbitrary SQL nor caller-supplied viewer
identity. Direct owner tables reject cross-owner filters/upserts. Public reads use
visibility functions with an optional verified session. Existing route contracts
and UI remain. Only currently cloud-backed preferences moved to this provider;
local-only preferences remain local. Supabase fallback is retained.

## Persistent limiter and ingress boundary

Native limiter selection precedes Supabase construction. HMAC signing and subject
keys stay in server-only environment material, never SQL tables/browser/logs.
PostgreSQL receives pseudonyms and validated envelopes, not unrestricted secrets.
The native path retains replay/receipt checks, capacity, global/provider budgets,
cooldowns and durable social quotas; it has no in-memory-only fallback.
Missing signing material or a trusted client-IP source fails closed. Synthetic
trusted ingress adapters are test evidence only. Passenger header proof and the
final hosting environment contract remain P4/P3 work respectively.

## Filesystem storage and consistency

`NATIVE_STORAGE_ROOT` must be an absolute persistent directory outside the app,
public/build/output directories and drive root. Files use authenticated owner
UUIDs and server-generated random names. JPEG/PNG/WebP are actually decoded and
re-encoded through the installed sharp runtime, stripping metadata/trailing
payloads. Avatar remains 5 MiB; banner 10 MiB; dimensions are bounded to 8192 per
axis and 16,777,216 pixels. Paths reject traversal, symlinks/junctions, non-regular
files, containment/inode/size violations and overwrites. Linux publication/deletion
syncs directory entries; Windows directory-fsync support is unavailable.

A committed staging intent precedes file creation. Account admission and profile
locking remain held during bounded publication and reference commit. File IO is
drained before rollback releases admission. Files publish exclusively on the same
persistent volume. The previous asset remains until the new reference commits.
DB/file/disk failures leave discoverable intents; failed old-file deletion retains
cleanup state. Cleanup is explicit through the operator maintenance job, with no
permanent daemon. Fresh staging/orphan intents have a one-hour safety lease so
cleanup cannot race late bounded upload IO; erasure stays pending during this lease.

`/api/backend/assets` checks the current live DB reference plus visibility/block
semantics before bounded delivery. Responses are no-store with safe Content-Type,
Content-Length and nosniff. There is no direct static filesystem mount and the URL
is not a bearer capability. P4 must prove host permissions, link/fsync behavior,
persistent volume isolation, crash recovery and restart/sleep persistence.

## Full privacy source lifecycle

Owner export has no target-owner parameter and reuses the current explicit
allowlists/sanitizer from the extracted pure `lib/privacy/account-export.mjs`.
Credentials/internal security fields are excluded. The existing dirty hardened
erasure model remains authoritative. Native operator stages lock writes/revoke
sessions, clean participant/social/account rows, detach retained records, flush XP
reconciliation and remove filesystem assets. Known-empty directories only are
removed; residual files and pending metadata block finalization. Auth deletion is
last, after scoped DB/participant/session/filesystem residual checks.

`runNativePrivacyJob` accepts a supplied connection with a runner-issued,
connection-bound disposable capability, not arbitrary environment credentials or
a caller's claimed disposable flag. SQL also checks operator membership and login.
Normal web runtime has no operator credentials or admin erasure endpoint. Real
operator target authorization, user/password/asset migration and Production
execution remain P5. Source helpers do not establish legal/live privacy closure.

## Native transport isolation and packaging

Native normal routes select native Auth/pg/filesystem/limiter rather than Supabase
Auth, PostgREST, RPC transport, Storage or Vault. The compatibility client's
storage URL method delegates to the authorized native delivery route. Tests deny
unregistered/operator RPCs and prevent native SDK construction. Dormant Supabase
implementations/dependencies and historical migrations remain for fallback.
P3 must remove obsolete dependencies and declare/package the existing transitive
sharp image decoder deliberately; no dependency cleanup was attempted in P2B.

## Validation

- Full offline Vitest: 3081 PASS, 57 SKIP, 0 FAIL; 212 passed files, 19 skipped files.
  P2B adds 58 tests (35 domain/isolation, 19 real filesystem, 4 consistency workflow).
  Final bounded-read hardening was followed by 23 focused filesystem/workflow PASS.
- Node canonical selection: 134 PASS, 0 FAIL, 0 SKIP (+9 schema, +5 privacy/operator).
- P1/P2A targeted native regression selection: 43 PASS. The full run also covers
  Cloud/Goals, Better Auth, privacy hardening and release-policy regressions.
- TypeScript: PASS (`tsc --noEmit --incremental false` and both build typechecks).
- Tracked plus new source ESLint: 0 errors, 9 existing warnings/notices (one
  navigation warning and eight ignored design-reference notices). Default directory
  traversal lint was stopped; the completed source selection used ESLint API.
- CI/migration/security-source checks and `git diff --check`: PASS.
- Supabase production build: PASS, offline with synthetic environment overrides.
- Native production build: PASS, offline with synthetic unreachable DB configuration.
  Both report 15 existing annotation-tool tracing warnings; no hosted work occurred.
- Runtime dependency audit: 0 vulnerabilities. Full audit: 5 High, 0 Critical;
  existing dev-only V1-SEC-EXCEPTION-001 unchanged, expires 2026-11-03.
- Disposable PostgreSQL runner: BLOCKED_ENVIRONMENT (local Docker/image unavailable).
  No schema/RLS function was executed against PostgreSQL and no substitute target
  was contacted. SQL checks are static; domain transaction tests use mocked pg.
- Browser/GUI/E2E/live hosting/backup restore/Production acceptance: NOT RUN.

Skip accounting: historical 56 plus the existing native disposable proof test 1
= 57. P2B introduced zero skips. The full runner used a 15-second test deadline
for existing nested Node subprocess tests on Windows; business transaction timeout,
assertions and environment gates were not weakened. Initial new test-order/source
inventory failures were corrected and final full regression rerun.

## Remaining P3/P4/P5 gates

No known source-level Social/XP/themes/limiter/filesystem/privacy migration domain
remains. This does not certify absence of defects before real database execution.
P3: Supabase dependency cleanup, explicit sharp packaging, deployment/Passenger
package and hosted environment contract (including persistent root/trusted ingress).
P4: actual disposable schema/RLS/domain/concurrency proof, Better Auth DB/session
acceptance, trusted proxy contract, filesystem restart/crash/cleanup proof,
backup/restore and hosted bounded acceptance.
P5: separately authorized exact Production targets, real identity/password/user/
asset migration, backups/change window, operator target authority and cutover.
No Production authorization or acceptance is inferred from source completion.
