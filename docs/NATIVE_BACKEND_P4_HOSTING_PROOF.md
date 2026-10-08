# Native backend P4 hosting proof

2026-10-08. Updated with later user-reported disposable TürkHosting tests.
The earlier local-only Phase 0 attempt is retained below as historical evidence.

## Current P4 summary — later tests on 2026-10-08

```text
P4_STATUS = ACCESS_QUALIFIED
P5_READY = NO
REAL_DB_PROOF = BLOCKED
NEXT_STANDALONE_RUNTIME = NOT_RUN
DB_RLS_AUTH_ACCEPTANCE = NOT_RUN
```

Evidence provenance: the SSH/Plesk/Actions observations and outputs below were
supplied by the user. Codex did not independently execute these remote tests or
verify the Actions run in this documentation update. `PASS` is scoped to the
reported probe, not complete application or production acceptance. Only
disposable P4 work was performed; the real MediaTracker application has not started.

### Qualified environment

| Property | User-reported observation |
| --- | --- |
| Hosting / ingress | TürkHosting / Plesk / Passenger |
| Domain | `mediatracker.baglare.com.tr` |
| Application architecture / glibc | `x86_64` / `2.28` |
| Node.js / artifact Next.js | `24.21.0` / `16.3.8` |
| PostgreSQL / test endpoint | `18.6` / `127.0.0.1:5433` |
| Plesk application mode | `production`; panel mode is not Production acceptance |
| Document root / application root | `/mediatracker.baglare.com.tr/public` / `/mediatracker.baglare.com.tr` |

Access is now qualified. Independent operator target fingerprinting, ownership,
empty-state and mutation gates remain required before any future DB operation.

### Linux artifact and ABI probes — PASS within probe scope

Branch `release/v1-hardening`, Actions commit
`f81d30586011ebbe476725684facff3b82332796`, run `37806188211`, artifact
`mediatracker-native-linux-f81d30586011`: validation and native Linux artifact
jobs succeeded according to the user. The `.tar.gz` and `.sha256` were transferred
over SSH; `sha256sum -c` returned `OK`. Extraction was limited to
`~/mt-p4-artifact/release-test`; `app.cjs`, `server.js` and Sharp were present.
Reported ABI GLIBC requirements fit glibc 2.28; required `GLIBCXX_3.4.22` and
`CXXABI_1.3.11` symbols were available. Plesk Node.js 24 ran the Sharp probe:

```text
SHARP_SMOKE_OK
PNG bytes: 96
Sharp: 0.35.5
libvips: 8.18.7
```

This proves the tested native image-processing scenario on this host. It does
not prove all native paths or Next.js standalone startup. The artifact was built
with synthetic `https://app.example.invalid`; real deployment requires a new
build with the canonical origin.

### Plesk / Passenger probes — PASS within probe scope

Node.js was enabled in Plesk. A temporary independent `app.js` HTTP server,
not MediaTracker, returned over HTTPS:

```text
MediaTracker P4 Passenger test OK
BACKEND_PROVIDER: OK
PORT: absent
```

Plesk stored `BACKEND_PROVIDER=native` and passed it to the Node process. The
temporary server worked through Passenger without an explicit `PORT` environment
variable. These observations prove temporary startup, HTTPS forwarding and env
delivery only; actual standalone `app.cjs` startup and health endpoints are NOT_RUN.

### PostgreSQL blockers — unresolved

Disposable database `mt_p4_test` and test roles `mt_p4_owner` / `mt_p4_runtime`
were created. An SSLRequest to `127.0.0.1:5433` returned `PG_TLS=NOT_SUPPORTED`:
this tested endpoint did not accept TLS negotiation. Current production code
requires `DATABASE_SSL_MODE=verify-full`; do not relax that gate.

The code expects login `mt_runtime`, whereas the test login is `mt_p4_runtime`.
An env-only substitution does not resolve role and migration contracts.
Read-only PostgreSQL results were:

```text
database_name: mt_p4_test
connected_role: mt_p4_runtime
database_owner: postgres
public_schema_owner: pg_database_owner
can_create: true
```

| public CREATE granted to | Granted by |
| --- | --- |
| `pg_database_owner` | `pg_database_owner` |
| `mt_p4_owner` | `pg_database_owner` |
| `mt_p4_runtime` | `pg_database_owner` |

`mt_p4_runtime` has a direct public CREATE grant, which the native pool safety
check rejects. A TürkHosting technical support request covering TLS, runtime
privileges and role/provisioning options was sent; **the reply is pending**.
No migration was run, no role privilege was changed, and no actual application
DB readiness test or hosted DB/RLS/Auth acceptance was completed.

### Private storage probes — PASS within probe scope

`~/mt-p4-storage/users/` and `~/mt-p4-storage/temporary-uploads/` were verified
with directory mode `0700` and owner `wfdqewrm`. Node exclusive creation, write,
hard link, fsync and content verification returned `P4_STORAGE_WRITE_LINK_FSYNC_OK`.
A separate probe file survived a Plesk Passenger application restart with its
content intact: `P4_PERSISTENCE_AFTER_RESTART_OK`. The probe file was safely
removed (`P4_PROBE_CLEANED`); storage directories were preserved.

This proves persistence across that Passenger restart only. Server reboot,
hosting disaster, backup/restore, long-term durability and actual MediaTracker
file operations remain UNVERIFIED / NOT_RUN.

### Resource observations — capacity UNVERIFIED

Plesk displayed package limits of 10 GB disk and 200 GB/month traffic. Statistics
had not been collected; displayed `0 MB` is not measured consumption. SSH reported
`ulimit -v: unlimited`, `ulimit -u: 191898` and cgroup memory limit files
`NOT_ACCESSIBLE`. Temporary Node Passenger RSS was `54336 KB`, not MediaTracker RSS.
The user's recollection of approximately 1–2 GB RAM and two CPU cores is an
unverified estimate, not an official limit or accepted capacity. The 1 GB budget,
worker count, peak RSS, concurrent load and CPU limits still require proof.

## Historical Phase 0 attempt — earlier on 2026-10-08

The following status and source/access inventory describe only the earlier
local attempt. They do not describe the later qualified access above.

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

### Historical source and access evidence

Branch `release/v1-hardening`, HEAD
`cc2acf8e1a6c933a51439dcb2054f9e7293a2c2e` matched that attempt's checkpoint.
The worktree then contained uncommitted P3 changes; those were authoritative
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

This register reflects the later user-reported tests. Unexecuted acceptance is
`NOT_RUN`; unknown capability is `UNVERIFIED`; measured DB contract obstacles
are `BLOCKED`. Prior P3 local evidence remains distinct from hosted proof.

| # | Proof | Current result |
| --- | --- | --- |
| 1 | Access / target fingerprint | ACCESS_QUALIFIED; disposable targets identified above; operator fingerprint/empty-state acceptance still pending |
| 2 | Node / Passenger capability | PASS for Node 24.21.0 temporary HTTP/HTTPS/env probe; actual Next startup NOT_RUN |
| 3 | PostgreSQL version / capabilities | 18.6 reported; BLOCKED: tested endpoint TLS unsupported; provisioning/connection limits UNVERIFIED |
| 4 | Actual DB role separation | BLOCKED: mt_p4_runtime differs from required mt_runtime and has direct public CREATE; contract acceptance NOT_RUN |
| 5 | pgcrypto availability / privileges | UNVERIFIED / NOT RUN; current runbook says native 001–009 does not require it |
| 6 | Native migrations / ledger / checksums / lock | UNVERIFIED / NOT RUN |
| 7 | RLS A/B/anonymous isolation | UNVERIFIED / NOT RUN; all 14 requested proofs pending |
| 8 | Better Auth sessions / cookies / denial | UNVERIFIED / NOT RUN; SMTP availability also unverified |
| 9 | Linux native artifact / disposable deployment | PASS for reported Actions jobs, transfer checksum, ABI comparison and Sharp probe; canonical-origin rebuild pending; actual deployment NOT_RUN |
| 10 | Hosted liveness / readiness | NOT_RUN for MediaTracker; temporary HTTP response is not health acceptance; DB readiness BLOCKED |
| 11 | Trusted ingress / IP spoof rejection | UNVERIFIED / NOT RUN; no ingress tuple enabled |
| 12 | Cloud Media | UNVERIFIED / NOT RUN |
| 13 | Goals | UNVERIFIED / NOT RUN |
| 14 | Social | UNVERIFIED / NOT RUN |
| 15 | XP / themes / preferences | UNVERIFIED / NOT RUN |
| 16 | Persistent rate limiter | UNVERIFIED / NOT RUN |
| 17 | Filesystem security / persistence | PASS for private directory mode/owner, exclusive write/link/fsync and probe persistence; real app authorization/file operations NOT_RUN |
| 18 | Cold start / Passenger restart | PASS for probe-file persistence after temporary app restart; real application restart/cold-start/session behavior NOT_RUN |
| 19 | Resource / RSS / connections / disk | Package disk/traffic and temporary RSS observed; app capacity, CPU/RAM limits, workers/peak load/connections UNVERIFIED; no 1 GB verdict |
| 20 | Cron / maintenance independent of worker sleep | UNVERIFIED / NOT RUN |
| 21 | Actual PostgreSQL + asset backup | UNVERIFIED / NOT RUN |
| 22 | Restore into new disposable target | UNVERIFIED / NOT RUN; second-target limit unknown |
| 23 | Privacy export | UNVERIFIED / NOT RUN |
| 24 | Privacy erasure / barrier / residuals / Auth-last | UNVERIFIED / NOT RUN |
| 25 | Backup / erasure recovery interaction | UNVERIFIED / NOT RUN; historical backups may resurrect erased data; reconciliation proof required before recovery unfreeze |
| 26 | Hosted security regression / disabled providers | UNVERIFIED / NOT RUN; no provider or paid AI enablement |
| 27 | P4 source fixes | NOT_APPLICABLE; this update changes documentation only |
| 28 | Final local regression | Historical diff check PASS; current update verification recorded separately below; suites, lint, typecheck and builds NOT_RUN |
| 29 | External / manual issues | Support reply pending for TLS/runtime grants/role provisioning; canonical-origin rebuild and capacity evidence pending |
| 30 | Exact P5 blockers | DB TLS/role/CREATE obstacles plus actual Next startup and mandatory DB/RLS/Auth/domain/ingress/maintenance/privacy/recovery/resource proofs remain open; P5_READY=NO |

Historical Phase 0 cleanup note: no synthetic accounts, rows, files, backups or
remote resources were created during that earlier local attempt. Later disposable
state includes the reported test DB/roles, extracted artifact, temporary app and
storage directories; only the storage probe file is reported cleaned. Do not infer
that all later test resources were removed. No alternative provider was substituted.

## Historical access prerequisites — earlier Phase 0 attempt

Retained for traceability; access, target paths and Linux artifact delivery have
since been qualified as described above. This list is not the current blocker list.

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
Historical note: no canonical Vault update was made; the blocked access attempt introduced no
implemented architecture or durable behavior change requiring a Vault candidate.

## Current next safe step

Await and review the TürkHosting support response against the unchanged TLS,
role/provisioning and public CREATE safety contracts. Do not treat the request as
resolution or bypass checks. Once those blockers are resolved and separately
authorized disposable targets are fingerprinted, prepare a canonical-origin
artifact and prove real standalone startup/readiness before DB/RLS/Auth and the
remaining acceptance sequence. No Production/P5 authorization follows from this report.

## Documentation update verification — 2026-10-08

Codex locally verified branch `release/v1-hardening` and HEAD
`f81d30586011ebbe476725684facff3b82332796`; the initial worktree was clean.
`git diff --check`: PASS. Changed-file scope: PASS, limited to this proof and
`NATIVE_HOSTING_DEPLOYMENT_RUNBOOK.md`. Historical/current status and probe versus
application acceptance were reviewed for consistency; unexecuted acceptance is
not marked PASS. Suites, lint, typecheck and builds: NOT_RUN (documentation only).
No SSH, PostgreSQL connection, deployment, deletion, commit or push was performed
by Codex. No secrets were recorded; Supabase and rollback mechanisms were unchanged.
No Vault write was performed under this task's two-file-only scope.
