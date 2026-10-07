# Native backend P4 hosting proof

2026-10-08. Phase 0 access qualification only. No remote connection or mutation.

```text
P4_STATUS = BLOCKED_ACCESS
P5_READY = NO
REAL_DB_PROOF = BLOCKED
HOST_TARGET = AMBIGUOUS
SUPABASE_MUTATED = NO
REAL_USER_DATA_TOUCHED = NO
PRODUCTION_MUTATED = NO
DNS_CHANGED = NO
```

## Current source and access evidence

Branch `release/v1-hardening`, HEAD
`cc2acf8e1a6c933a51439dcb2054f9e7293a2c2e` match the requested checkpoint.
The current worktree contains uncommitted P3 changes; these remain authoritative
and were preserved. No reset, stash, restore, checkout, clean, commit, push, merge
or tag was performed. The existing pre-migration rollback backup was not modified.

Read-only qualification inspected the two local env files and relevant process
environment keys without printing values. No native DB/operator or hosting access
configuration was found there. An existing staging database variable is present;
it is outside P4 authority and was not used. The user SSH directory contains only
known_hosts files, with no config or private key file. SSH/SFTP executables are
available; their presence does not prove account access. No hosting-specific
configuration was found in the scoped workspace root/configuration inventory.
No password store, browser session or unrelated filesystem was searched.

No exact account, application hostname/path, disposable database or authenticated
access route is available in the inspected configuration or request. Hosting
purchase/provisioning status is **UNVERIFIED**, not presumed absent. Known-host
entries do not establish target ownership or disposable authority and were not
used to select a host. Phase 0 therefore stops before remote access and Phase 1.

## Proof register

`UNVERIFIED / NOT RUN` below means execution was blocked by access qualification;
it is not a failed hosting capability test. No `BLOCKED_PROVIDER` finding exists
because no provider limitation was measured. Prior P3 local evidence remains
historical and is not P4 hosted proof.

| # | Proof | Current result |
| --- | --- | --- |
| 1 | Access / target fingerprint | BLOCKED_ACCESS; no confirmed disposable target or fingerprint |
| 2 | Node / Passenger capability | UNVERIFIED / NOT RUN |
| 3 | PostgreSQL version / capabilities | UNVERIFIED / NOT RUN |
| 4 | Actual DB role separation | UNVERIFIED / NOT RUN |
| 5 | pgcrypto availability / privileges | UNVERIFIED / NOT RUN; current runbook says native 001–009 does not require it |
| 6 | Native migrations / ledger / checksums / lock | UNVERIFIED / NOT RUN |
| 7 | RLS A/B/anonymous isolation | UNVERIFIED / NOT RUN; all 14 requested proofs pending |
| 8 | Better Auth sessions / cookies / denial | UNVERIFIED / NOT RUN; SMTP availability also unverified |
| 9 | Linux native artifact / disposable deployment | UNVERIFIED / NOT RUN; Windows P3 package is local evidence only |
| 10 | Hosted liveness / readiness | UNVERIFIED / NOT RUN |
| 11 | Trusted ingress / IP spoof rejection | UNVERIFIED / NOT RUN; no ingress tuple enabled |
| 12 | Cloud Media | UNVERIFIED / NOT RUN |
| 13 | Goals | UNVERIFIED / NOT RUN |
| 14 | Social | UNVERIFIED / NOT RUN |
| 15 | XP / themes / preferences | UNVERIFIED / NOT RUN |
| 16 | Persistent rate limiter | UNVERIFIED / NOT RUN |
| 17 | Filesystem security / persistence | UNVERIFIED / NOT RUN |
| 18 | Cold start / Passenger restart | UNVERIFIED / NOT RUN |
| 19 | Resource / RSS / connections / disk | UNVERIFIED / NOT RUN; no 1 GB capacity verdict |
| 20 | Cron / maintenance independent of worker sleep | UNVERIFIED / NOT RUN |
| 21 | Actual PostgreSQL + asset backup | UNVERIFIED / NOT RUN |
| 22 | Restore into new disposable target | UNVERIFIED / NOT RUN; second-target limit unknown |
| 23 | Privacy export | UNVERIFIED / NOT RUN |
| 24 | Privacy erasure / barrier / residuals / Auth-last | UNVERIFIED / NOT RUN |
| 25 | Backup / erasure recovery interaction | UNVERIFIED / NOT RUN; historical backups may resurrect erased data; reconciliation proof required before recovery unfreeze |
| 26 | Hosted security regression / disabled providers | UNVERIFIED / NOT RUN; no provider or paid AI enablement |
| 27 | P4 source fixes | NOT_APPLICABLE; no runtime source change in this attempt |
| 28 | Final local regression | git diff --check PASS; suites, lint, typecheck and builds NOT RUN (documentation-only attempt) |
| 29 | External / manual issues | Account provisioning, access, exact test targets and builder access pending |
| 30 | Exact P5 blockers | All mandatory hosted proofs and safe recovery evidence remain open |

No synthetic accounts, rows, files, backups or remote resources were created;
there is no P4 synthetic state to clean. No alternative provider was substituted.

## Minimum information needed to resume Phase 0

1. Confirm the TürkHosting account is provisioned and identify its exact access
   endpoint and username. Provide an authenticated SSH/operator execution route
   and upload route (SFTP or hosting-panel equivalent). Put credentials in a
   private local configuration or secret mechanism; do not paste secrets into
   the report or tracked files.
2. Identify the explicitly disposable application label, HTTPS hostname, new
   application/release path and private persistent storage path, plus the allowed
   application stop/restart mechanism. If not created, identify the account scope
   in which these test resources may be created.
3. Supply test-only PostgreSQL operator access (host, port, TLS requirements and
   private credentials), the intended new disposable database name or creation
   scope, and whether database/role creation is permitted. Ownership, actual
   capabilities, empty state and fingerprint must still be verified before SQL.
4. Identify an accessible matching Linux builder, or a hosting-compatible build
   route, for the current uncommitted workspace. A second empty restore DB/storage
   target must be qualified separately when recovery proof is reached.

These are access prerequisites, not a request to reauthorize already authorized
disposable work. No Production, Supabase, Vercel or real-user credentials are needed.
P4 resumes at Phase 0, then independently fingerprints the target before mutation.
P5 remains closed until required runtime and recovery evidence exists.

Operational procedure: [native hosting runbook](NATIVE_HOSTING_DEPLOYMENT_RUNBOOK.md).
No canonical Vault update was made; this blocked access attempt introduces no
implemented architecture or durable behavior change requiring a Vault candidate.
