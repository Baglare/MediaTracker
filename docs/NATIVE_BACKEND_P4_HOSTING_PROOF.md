# Native backend P4 hosting proof

2026-10-09. Updated with additional user-reported disposable TürkHosting tests.
The earlier local-only Phase 0 attempt is retained below as historical evidence.

## Current P4 summary — evidence updated 2026-10-09

```text
P4_STATUS = ACCESS_QUALIFIED
P5_READY = NO
REAL_DB_PROOF = BLOCKED
NEXT_STANDALONE_RUNTIME = PASS_WITHIN_PROBE_SCOPE
DB_RLS_AUTH_ACCEPTANCE = NOT_RUN
```

Evidence provenance: the SSH/Plesk/Actions observations and outputs below were
supplied by the user. Codex did not independently execute these remote tests or
verify the Actions run in this documentation update. `PASS` is scoped to the
reported probe, not complete application or production acceptance. Only
disposable P4 work was reported; real Next.js standalone now has scoped runtime
proof, while real DB-backed application acceptance remains blocked.

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
not prove all native paths or Next.js standalone startup by itself. This historical
artifact used synthetic `https://app.example.invalid`; the later canonical-origin
build and runtime probes are recorded below.

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
delivery only. Later real standalone and health probes are recorded separately below.

### Real Next.js standalone — PASS within probe scope

The older Linux artifact returned localhost liveness HTTP 200, readiness HTTP 503
and homepage HTTP 200: PASS for those probes. These do not change its historical
synthetic-origin build limitation.

The new canonical-origin artifact is pinned to commit
`cfe7a98ba89e23aa7774d3b252fdce157ccdfb43`, GitHub Actions run `37843136347`.
CI validation and native Linux artifact jobs: PASS. Canonical origin:
`https://mediatracker.baglare.com.tr`. Transfer to the server and SHA-256
verification: PASS; manifest source SHA, native backend and Node 24.x were verified.

Real Next.js through Passenger 6.2.0 returned HTTPS homepage HTTP 200 and readiness
HTTP 503: PASS within probe scope. Without a database, 503 is the expected
fail-closed response, not successful DB readiness. Passenger liveness was not
separately recorded and remains NOT_RUN as a recorded proof. After testing, the
previous Passenger `app.js` was restored, the application restarted and the
previous response verified. Real DB connection, migrations, Auth and RLS remain
NOT_RUN / BLOCKED; these probes do not establish production readiness or full
hosting acceptance.

### Cron — scheduler PASS; real maintenance NOT_RUN

Plesk manual Node.js execution and actual `* * * * *` automatic scheduling: PASS.
A dedicated file verified execution at UTC `2026-10-08T20:25:02.065Z`.
The temporary Cron task and test file were removed. Real MediaTracker maintenance
through Cron remains NOT_RUN; scheduler proof does not prove job authority,
deadlines or DB-backed maintenance behavior.

### Reverse proxy / trusted IP — incomplete evidence

Normal requests contained `X-Forwarded-For` and `X-Real-IP`. A forged
`X-Forwarded-For: 198.51.100.77` reached the backend, so `X-Forwarded-For` cannot
be trusted directly. A forged `X-Real-IP: 203.0.113.88` did not arrive unchanged;
this is only a preliminary observation, not complete header-trust proof.
Node socket `remoteAddress` was loopback. Proxy overwrite and direct-access
denial acceptance remain incomplete. Preserve `TRUSTED_INGRESS_MODE=unconfigured`
as the safe default; no trusted ingress tuple is qualified by these observations.
The temporary test application was restored and restarted.

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
No migration was run, no role privilege was changed, and no real application
DB connection or hosted DB/RLS/Auth acceptance was completed. The readiness 503
probes above prove fail-closed responses only.

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
worker count, aggregate peak RSS, concurrent load and CPU limits still require proof.

The new canonical-origin artifact was also tested on localhost in a separate
temporary Node process. Liveness: PASS; readiness fail-closed: PASS. Eight homepage
HTTP requests, in pairs: 8/8 PASS. Measured idle RSS: 118.0 MiB; sampled peak RSS:
151.2 MiB. The temporary process was terminated after testing. These are light-load
measurements of that Node process only, not Passenger aggregate consumption,
official hosting RAM limits, Auth/DB load, long-duration or high-concurrency
capacity acceptance. They do not establish the 1 GB budget.

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
| 2 | Node / Passenger capability | PASS for historical temporary HTTP/HTTPS/env probe and scoped real Next.js HTTPS homepage/readiness through Passenger 6.2.0; full application acceptance open |
| 3 | PostgreSQL version / capabilities | 18.6 reported; BLOCKED: tested endpoint TLS unsupported; provisioning/connection limits UNVERIFIED |
| 4 | Actual DB role separation | BLOCKED: mt_p4_runtime differs from required mt_runtime and has direct public CREATE; contract acceptance NOT_RUN |
| 5 | pgcrypto availability / privileges | UNVERIFIED / NOT RUN; current runbook says native 001–009 does not require it |
| 6 | Native migrations / ledger / checksums / lock | UNVERIFIED / NOT RUN |
| 7 | RLS A/B/anonymous isolation | UNVERIFIED / NOT RUN; all 14 requested proofs pending |
| 8 | Better Auth sessions / cookies / denial | UNVERIFIED / NOT RUN; SMTP availability also unverified |
| 9 | Linux native artifact / disposable deployment | PASS for historical ABI/Sharp probes and new canonical-origin Actions run 37843136347, transfer SHA-256/manifest verification and temporary real Next.js runtime; full deployment acceptance open |
| 10 | Hosted liveness / readiness | Localhost liveness 200 PASS; Passenger HTTPS homepage 200 and readiness 503 fail-closed PASS; Passenger liveness recorded proof NOT_RUN; DB readiness BLOCKED |
| 11 | Trusted ingress / IP spoof rejection | INCOMPLETE: forged X-Forwarded-For reached backend; X-Real-IP preliminary only; socket loopback; TRUSTED_INGRESS_MODE=unconfigured preserved |
| 12 | Cloud Media | UNVERIFIED / NOT RUN |
| 13 | Goals | UNVERIFIED / NOT RUN |
| 14 | Social | UNVERIFIED / NOT RUN |
| 15 | XP / themes / preferences | UNVERIFIED / NOT RUN |
| 16 | Persistent rate limiter | UNVERIFIED / NOT RUN |
| 17 | Filesystem security / persistence | PASS for private directory mode/owner, exclusive write/link/fsync and probe persistence; real app authorization/file operations NOT_RUN |
| 18 | Cold start / Passenger restart | Historical probe-file persistence PASS; previous app.js restoration/restart/response verified after real Next test; real application cold-start/session behavior NOT_RUN |
| 19 | Resource / RSS / connections / disk | Separate new-artifact Node process: idle 118.0 MiB / sampled peak 151.2 MiB, homepage 8/8 PASS in pairs; Passenger aggregate, official RAM/CPU limits, Auth/DB and sustained/high-concurrency capacity UNVERIFIED; no 1 GB verdict |
| 20 | Cron / maintenance independent of worker sleep | Manual Node and actual `* * * * *` scheduling PASS via dedicated file; temporary task/file removed; real MediaTracker maintenance NOT_RUN |
| 21 | Actual PostgreSQL + asset backup | UNVERIFIED / NOT RUN |
| 22 | Restore into new disposable target | UNVERIFIED / NOT RUN; second-target limit unknown |
| 23 | Privacy export | UNVERIFIED / NOT RUN |
| 24 | Privacy erasure / barrier / residuals / Auth-last | UNVERIFIED / NOT RUN |
| 25 | Backup / erasure recovery interaction | UNVERIFIED / NOT RUN; historical backups may resurrect erased data; reconciliation proof required before recovery unfreeze |
| 26 | Hosted security regression / disabled providers | UNVERIFIED / NOT RUN; no provider or paid AI enablement |
| 27 | P4 source fixes | NOT_APPLICABLE; this update changes documentation only |
| 28 | Final local regression | Historical diff check PASS; current update verification recorded separately below; suites, lint, typecheck and builds NOT_RUN |
| 29 | External / manual issues | Support reply pending for TLS/runtime grants/role provisioning; full ingress and capacity acceptance pending; canonical-origin rebuild and scoped startup proved |
| 30 | Exact P5 blockers | DB TLS/role/CREATE obstacles plus mandatory DB/RLS/Auth/domain/ingress/real maintenance/privacy/recovery/resource acceptance remain open; Passenger liveness recorded proof pending; P5_READY=NO |

Historical Phase 0 cleanup note: no synthetic accounts, rows, files, backups or
remote resources were created during that earlier local attempt. Later disposable
state includes the reported test DB/roles, extracted artifact, temporary app and
storage directories. The storage probe file and temporary Cron task/file were
reported removed; the separate Node process was terminated and the prior Passenger
app restored/restarted. Do not infer that all later test resources were removed.
No alternative provider was substituted.

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
authorized disposable targets are fingerprinted, use the pinned canonical-origin
artifact for DB-backed readiness, DB/RLS/Auth and the remaining acceptance sequence.
Scoped standalone startup and fail-closed readiness are already reported above;
they do not close trusted ingress, real maintenance or capacity acceptance.
No Production/P5 authorization follows from this report.

## Historical documentation update verification — 2026-10-08

Codex locally verified branch `release/v1-hardening` and HEAD
`f81d30586011ebbe476725684facff3b82332796`; the initial worktree was clean.
`git diff --check`: PASS. Changed-file scope: PASS, limited to this proof and
`NATIVE_HOSTING_DEPLOYMENT_RUNBOOK.md`. Historical/current status and probe versus
application acceptance were reviewed for consistency; unexecuted acceptance is
not marked PASS. Suites, lint, typecheck and builds: NOT_RUN (documentation only).
No SSH, PostgreSQL connection, deployment, deletion, commit or push was performed
by Codex. No secrets were recorded; Supabase and rollback mechanisms were unchanged.
No Vault write was performed under this task's two-file-only scope.

## Documentation update verification — 2026-10-09

Codex locally verified branch `release/v1-hardening` and HEAD
`cfe7a98ba89e23aa7774d3b252fdce157ccdfb43`; the initial worktree was clean.
Changed-file scope and historical/current evidence consistency: PASS, limited
to this proof and `NATIVE_HOSTING_DEPLOYMENT_RUNBOOK.md`. `git diff --check`: PASS.
Remote evidence is user-reported, not independently re-executed in this update.
Passenger liveness, real maintenance and DB/Auth/RLS acceptance remain unproved;
TLS/role/CREATE blockers, unconfigured ingress and P5_READY=NO remain intact.
Suites, lint, typecheck and builds: NOT_RUN (documentation only). No SSH, hosting,
DB or live-application operation, source/workflow/test/migration/env change,
commit, push or Vault write was performed by Codex.
