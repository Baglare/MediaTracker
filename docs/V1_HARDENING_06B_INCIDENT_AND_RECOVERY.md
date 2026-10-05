# V1-HARDENING-06B — incident and recovery

CURRENT_SOURCE_FACT, 2026-10-06. [06D](V1_HARDENING_06D_RELEASE_OPERATIONS.md) controls source release planning; [06E](V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md) controls current holds. No incident, rollback or remote operation was executed here.

## Severity, lifecycle and evidence

One operator owns incident decisions, with vendor/security/legal assistance when needed. SEV-1: confirmed cross-owner exposure, privileged key leak, unauthorized account access, corrupted DB/destructive migration. SEV-2: auth unavailable, Cloud writes unavailable, widespread provider failure, limiter rejects legitimate writes, interrupted privacy erasure. SEV-3: one noncritical provider degraded, stale Calendar metadata, UI-only regression, nonsensitive telemetry problem. Escalate uncertainty about exposure to SEV-1 investigation, not public speculation.

DETECT → CONTAIN → PRESERVE EVIDENCE → CLASSIFY → RECOVER/FAIL-FORWARD → VERIFY → COMMUNICATE IF REQUIRED → POSTMORTEM. Record restricted timestamps, accepted/deployed SHA, affected route class, generated request IDs, safe codes/status/latency, aggregate counts, definition/ACL hashes and operator decision. Keep access and retention bounded; legal notification obligations/timing require case-specific advice. Public issues contain no user identifiers, raw rows/request bodies/credentials/provider queries or mailbox contents.

Do not blindly delete logs, rotate every secret without its dependency map, disable RLS/triggers/barriers/limiter, execute destructive down migrations, retry uncertain destructive work, unlock partially erased accounts, or deploy from a dirty tree. Preserve log/settings evidence before approved changes. Isolation is containment, not permission to read other owners' data.

## Playbooks

Each verification requires a safely scoped authorized target; no playbook grants remote mutation authority.

| Incident / signal | Immediate containment; safe disable | Evidence | Rollback vs fail-forward | Verification | Manual/external escalation |
| --- | --- | --- | --- | --- | --- |
| A Privileged/API secret disclosure; scanner/unauthorized use | Isolate affected runtime/credential use; stop ops; identify consumers before selective revoke/rotation | Key class/version/access timeline, redacted consumer/deploy map; never key value | Rotate affected dependency with overlap only where safe; no broad secret rollback | No leaked credential use; consumer auth/limiter recovery; RLS still enforced | Vendor/security operator; legal exposure assessment |
| B RLS/cross-owner response | Remove affected surface from service at platform boundary; preserve DB access controls | Safe request IDs, policy/function definitions, counts and artifact identity | Forward ACL/RLS fix; no permissive previous policy restore | Two-owner read/write isolation, private projections, unaffected B continuity | Security/vendor/legal, notification decision |
| C Signup unexpectedly enabled | Disable hosted new signup via separately approved Auth control; preserve existing sign-in when safe | Current Auth setting/timestamp and aggregate unexpected signup signal | Configuration correction; source hiding is insufficient | Provider direct signup denial using authorized synthetic case; existing sign-in | Auth operator/vendor; assess new-account data |
| D Migration fails | Stop pending chain, keep affected-write containment, record transaction outcome | Actual ledger, locks, SQLSTATE class, definition/ACL hashes | Abort uncommitted transaction; committed objects get reviewed forward repair | Exact prefix/definition/postchecks, PK/FK/RLS/privacy/limiter | DB operator/vendor; approved maintenance window |
| E Cloud client/schema mismatch | Pause Media queue dispatch and Goals Cloud separately; keep local owner data | Stage/epoch/client version and safe queue counters; no payloads | Compatible artifact/flags only; owner-PK path never regresses | Reload/epoch handling; CAS/idempotency/tombstones and queues survive | Release operator; no manual owner-data rewrite |
| F Asset exposure | Isolate public profile/assets and uploads at platform; retain exact-path policies | Bucket/policy hashes, aggregate referenced/unreferenced object counts | Forward policy repair; never reopen wildcard/old broad visibility | A/B referenced path/signed URL/revision/invalidation/account switch | Storage vendor/security/legal |
| G Limiter 503/timeouts | Stop provider/affected writes, preserve fail-closed 503; never Map fallback | Safe route/status/latency, key-version/audience presence classes, capacity/scheduler aggregates | Repair Vault/config/SQL forward; accepted artifact only if no bypass | Signed RPC reject/replay/concurrency, ingress identity, no upstream on denial | DB/Vercel/security operator; targeted key rotation |
| H Provider 429/5xx | Respect Retry-After/shared cooldown; disable optional Open Library by removing identity config only if approved; TVMaze has no general env kill switch | Provider class/status/latency/cooldown aggregate; no query/body | Keep policies; narrow forward repair, no retries escalating traffic | Bounded calls/cooldown, enabled-only Hepsi, attribution, disabled-provider zero network | Provider contact only by operator authorization |
| I Vercel regression/error spike | Pause rollout/promotions; contain affected route; retain healthy local-first | Exact deployment/SHA/env classes, request IDs/status aggregate | Previously accepted artifact only after DB/security/privacy compatibility review | SHA/env/CSP/auth/cloud/social/assets/provider smoke and monitor | Release/Vercel operator |
| J Cloud data corruption | Stop affected writes; quarantine recovery target and device replay | Aggregate invariants, backup manifest hashes, operation/revision boundaries | Recovery from verified backup or owner-safe forward repair; no blind overwrite | PK/FK, revisions/tombstones/event integrity; two-owner continuity | DB/vendor; legal erased-person reconciliation |
| K Erasure interrupted / failed stage | Keep ERASURE_PENDING/ERASING lock, prohibit runtime replay; stop unsafe retry | Exact safe stage/outcome, scoped restricted ops report; no personal exports in public issue | Controlled idempotent completion. Only genuine pre-destruction ERASURE_PENDING abort is allowed by 05F; never partial rollback | DB/participant/XP/Storage absence, same stale-identity denial, Auth-last/absence, B continuity | Privacy operator/vendor; request-response deadline review |
| L Backup integrity failure | Reject package/restore; retain failed artifact restricted; do not reuse/overwrite | Manifest pin/hash, artifact class/size and failing stage only | Recreate from safe source; never ignore checksum or pretend existing file is restore point | Missing/corrupt/duplicate/zero-byte tests; independent trusted digest and actual rehearsal | Backup operator/vendor; hold cutover |
| M Operator mailbox/privacy requests compromised | Operator isolates mailbox sessions/handlers and protects channel; no mailbox access by this task | Restricted access/recipient/timestamp classes; minimize copies | Provider-supported selective recovery; preserve deadlines/evidence; do not publish correspondence | Operator checks MFA/session revocation/rules/forwarding/delivery/retention | Mail vendor/privacy/legal; communication and notification decision |

## Rollback matrix

| Surface | Decision / preconditions |
| --- | --- |
| App artifact | Roll back only to previously accepted clean artifact compatible with current DB and mandatory security/privacy/provider contracts; older pre-barrier/limiter binary can bypass source controls and is not acceptable |
| Env | Reviewed before/after value classes and code compatibility; NEXT_PUBLIC values need a new build/deployment; no wholesale `.env.local` copying |
| Additive schema | Leave objects, contain affected subsystem, forward repair. Do not drop populated tables/RPCs |
| Non-additive schema / PK/FK | Transaction abort before commit; postcommit reviewed fail-forward with bounded locks and checks; never reopen legacy global-ID DML |
| Security/RLS/asset policies | Never rollback into known weaker isolation or expose private schemas |
| Data mutation/corruption | Verified backup recovery/quarantine or explicit owner-safe repair; operation/event history matters; no automatic reverse mutation |
| Storage | Verified separate metadata/binary backup required; DB dump does not recover objects |
| Auth | Supported vendor recovery prerequisite; public schema dump does not recover credentials/users |
| Privacy erasure | Never casually restore erased personal data. Restore quarantine + current erased-identity reconciliation before serving; locks persist through failure; Auth deletion last |

## Migration fail-forward matrix

The [current manifest](V1_HARDENING_06_MIGRATIONS.json) inventories **every** source migration, ordered version, normalized hash, purpose, prior-prefix dependency, classification, precondition, failure signal, rollback suitability, fail-forward and maintenance requirement. This is a conservative dependency floor; definitions of actual prerequisites must be verified before applying. Production applied/pending set is LIVE_UNVERIFIED.

| Family | Classification / prerequisites | Failure / recovery / maintenance |
| --- | --- | --- |
| Core/social/profile/XP/theming baseline | ADDITIVE_WITH_RUNTIME_DEPENDENCY; Auth roles/schema, preceding RPC/trigger types | Missing role/function/ownership/reconcile path → transaction abort; definition/ACL forward repair; contain affected writes |
| Progress relation repair / owner-scoped PK | NON_ADDITIVE + SECURITY_CRITICAL; duplicate/orphan/owner counts zero, physical identities and owner-aware FK prerequisite | Lock/invariant failure → retain Media containment, reviewed forward repair; maintenance window; no old direct DML grant |
| Goal Cloud | ADDITIVE_WITH_RUNTIME_DEPENDENCY; D2C.1 progress sync RPC required | Postcheck failure → Goals flag off, local goals survive; forward only |
| Public theme/assets/Advisor | SECURITY_CRITICAL with runtime dependency; preceding projection/path/ACL definitions | Isolation/signature failure → keep hidden/affected surface isolated; never old permissive policy |
| `20261004120000` limiter | ADDITIVE_WITH_RUNTIME_DEPENDENCY + SECURITY_CRITICAL; pgcrypto, Vault, limiter role, selected secret refs and policies | Provision mismatch/503/capacity → no bypass; runtime deployment after DB/key acceptance; affected-write containment |
| `20261004123000`, `20261004124000` forward fixes | SECURITY_CRITICAL; preceding limiter definitions | Preserve applied history; exact function/alias/hash and signed-wrapper checks; no broad reapplication/down |
| `20261005120000` XP ops cleanup | PRIVACY_CRITICAL + SECURITY_CRITICAL; immutable XP model and target/transaction context | Unauthorized delete/RESTRICT dependency → abort; context-bound forward fix; no trigger disable |
| `20261005130000` account barrier | PRIVACY_CRITICAL + SECURITY_CRITICAL; all previous families + real Auth trigger/grants/concurrency | Missing helper/guard/stale-token writes → keep full affected-write freeze; correct append-only; no unlock of ERASING |
| `20261005140000` participant detachment | NON_ADDITIVE + PRIVACY_CRITICAL + SECURITY_CRITICAL; prior barrier/XP context; changes reply FK and immutable XP trigger | Participant attribution/XP grouping/deferred-trigger residual → keep erasure lock; forward cleanup after scoped proof |

## Maintenance audit / cutover constraint

`lib/cloud-rollout.ts` and `lib/sync-manager.ts` stop ordinary Media queue flush when rollout status is not ready; queue and local library stay owner-scoped. Stage/epoch/reload contract also protects old clients. This is **not** a DB-wide write lock: stale clients/direct Supabase RPC, manual transfer paths, Goals (`features/goals/cloud/rollout.ts` has its own stage/flag), social/profile/theme/XP/assets and Auth are not proven frozen by Media env maintenance. Reads/local guest use can continue, subject to their separate policy/auth limits.

No broad outage implementation is introduced. If cutover requires full-write quiescence, operator must establish a separately approved platform/DB write freeze that covers stale JWT/direct RPC/Storage/Auth and records reversible grant/function/config preimages. Pausing only Vercel does not freeze direct Supabase clients. It must retain RLS/privacy locks and avoid data deletion; fresh proof of all mutation families and queued replay is required. Until proven, write-freeze readiness remains BLOCKED_MANUAL and cutover is frozen. The per-account privacy barrier is erasure authority, not a global maintenance shortcut.
