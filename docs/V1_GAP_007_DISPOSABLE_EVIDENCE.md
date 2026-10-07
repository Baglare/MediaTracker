# GAP-007 — Disposable DB/Auth/Storage evidence

Date: 2026-10-06. Verdict: **GAP-007 BLOCKED — NO PROVEN LOCAL DISPOSABLE TARGET**.

## 1. Starting workspace state

HEAD `a68317b8b719600e3731912d05ef3cc97c184b94`; authoritative candidate is the intentionally dirty local tree. Discovery recorded 29 modified tracked files and 8 untracked files, including the pre-existing V1-HARDENING-08 report, source fixes, lock remediation and forward migration. No clean-tree prerequisite was imposed. SHA-256 preimages were captured for all 37 files before GAP-007 edits; this task changes only this evidence document and the 06E gate row. Earlier validation in 08 is historical evidence, not a new run here.

## 2. Disposable environment discovery

- `supabase/config.toml` declares project `media-tracker`, API port 54321, DB port 54322, PostgreSQL major 17, enabled Auth and Storage and local SMTP. This configuration is not proof of a running disposable target.
- Docker client **29.6.2**, API 1.55, context `desktop-linux` exists. Server is unavailable: `dockerDesktopLinuxEngine` named pipe does not exist. No Docker engine was started or machine setting changed.
- Supabase CLI and host `psql` are absent from PATH; `node_modules/.bin/supabase.cmd` is absent. No CLI dependency/version is declared in package.json. The cached `.temp/cli-latest` value `v2.109.1` is neither an installed binary nor a repository version pin. Node **24.14.0** and npm **11.19.1** are available.
- Seed configuration refers to `supabase/seed.sql`, which is absent. No dedicated privacy stack provisioning/Compose script was found in the scoped infrastructure inspection. Package scripts provide hosted-capable live tests, not a local provisioning harness.
- Existing ops adapter requires independently provisioned `mediatracker_privacy_05f_db`, `_api`, `_auth`, `_storage`; fixture label `mediatracker-privacy-disposable-v1`; DB `privacy_05f_disposable`; internal network `mediatracker_privacy_05f_disposable`; loopback-only Kong port 54321; audited local Auth/Storage upstreams; schema guards and marker from `tests/fixtures/privacy-disposable-identity.sql`.
- Standard CLI container names/project identity do not satisfy that adapter. Do not weaken the target guard or assume `supabase start` alone establishes compatibility. PostgreSQL 17, local GoTrue and Storage plus Kong are needed; exact service image versions are not pinned by this adapter and must be recorded at provisioning.
- Existing D8 staging guards authorize a different target class and are not disposable authorization. `.env.example` has blank Supabase contracts and disabled live flags; populated local env files are not safe fixture credentials.

## 3. Target classification

| Candidate/configuration | Classification | Evidence / action |
| --- | --- | --- |
| Supabase local configuration | UNKNOWN | No running container identity, clean synthetic DB or local credential proof |
| Dedicated privacy fixture | UNKNOWN | Required infrastructure cannot be inspected without the daemon; no target proven |
| `.env.local` application, staging DB and test URLs | UNKNOWN | Non-loopback values; names are not verified project identity; not accessed |
| `.env.02d3.local` application URL | UNKNOWN | Non-loopback value; role unproven; not accessed |
| `.env.example` blank values | UNKNOWN | Templates only, no target |
| Existing `.temp/project-ref` link | UNKNOWN | Presence only recorded; no project lookup or linked operation |

No target qualifies as LOCAL_DISPOSABLE. No target was promoted to REMOTE_DISPOSABLE, STAGING, PREVIEW or PRODUCTION from its name. Endpoint values, project refs and credentials are intentionally omitted. No DB/Auth/Storage request was made.

## 4. Migration proof

**NOT RUN**: 26 migration files present; **0 applied by this task**. Source checks passed ordering/contracts, historical migration preservation and private privilege/import boundaries. Real schema, RLS, grants/revokes, SQL constraints, concurrency and managed-service execution remain unverified. No historical or forward migration was edited by GAP-007.

## 5. Synthetic fixture coverage

**Live users created: 0; live fixture rows created: 0; live objects uploaded: 0.** Offline tests reuse A/B under `example.invalid` in `privacy-synthetic-fixture.mjs`, spanning 36 classified domains: profile/modules/showcase/snapshots/shared notes/username history; media/progress/feedback; follows/blocks; activity/preferences/comments/reactions; recommendation threads/events/messages; notifications/preferences/reports; ten XP/progression domains; themes; goals; media/goal operation ledgers. Three ownerless tables are separately classified. This JavaScript fixture is not a schema-valid SQL seed and must not be treated as deployed coverage.

## 6. RLS / cross-user proof

**LIVE UNVERIFIED**: actual authenticated A-versus-B SELECT/INSERT/UPDATE/DELETE denial counts are **not measured**, not zero. Static owner/barrier coverage and synthetic preservation tests pass; neither establishes real RLS behavior.

## 7. Auth proof

**NOT RUN**: creation, profile linkage, normal-role admin deletion denial, privileged identity resolution and Auth-last service deletion. Offline exact UUID/email and duplicate identity refusal pass. No Auth user or session was created.

## 8. Storage proof

**NOT RUN**: real ownership, A/B isolation, plan inventory, removal and B preservation. Offline path-boundary and preservation checks pass. Existing export contract returns asset metadata and explicitly warns that binary assets require separate delivery; no binary or metadata service export was collected here.

## 9. Account export proof

**Live export artifact: none.** Offline tests inspect versioned export contents, A-owned/permitted participant inclusion, B-private exclusion and credential/signed-URL redaction. This does not establish actual SQL snapshot completeness or Storage service coverage. Local-device-only data and vendor records remain outside this account export; no vendor logs were fabricated.

## 10. Erasure-plan proof

**Live dry-run: NOT RUN.** Offline tests cover XP restrictive references, recommendations/participants, reports/notifications, retained activity shape, ledgers and assets; require participant-loss acknowledgement and Auth-last ordering. DELETE/ANONYMIZE/DETACH/RETAIN_NON_IDENTIFYING/EXTERNAL_VENDOR/LOCAL_DEVICE_ONLY remain technical classifications, not legal retention authority. Actual graph and FK behavior remain open.

## 11. Erasure execution proof

**NOT RUN; accounts erased: 0.** Required proof still includes identity resolution, optional export, lock/write denial, explicit application cleanup, Storage cleanup, application/Storage/barrier residual verification, then Auth deletion last. No reliance on Auth CASCADE was exercised.

## 12. Post-erasure residual counts

Auth A, profile A, core rows A, objects A, public state, prohibited references, detached/anonymized/retained identifiers and intact B rows/objects: **NOT MEASURED**. Do not substitute offline residual counts for DB counts.

## 13. Retry/idempotency proof

**Live retry: NOT RUN.** Offline already-erased no-op and interrupted Storage/application retry tests pass, including prevention of premature Auth deletion and preservation of unrelated B data. Real interrupted transactions/service retries remain open.

## 14. Target-safety negative tests

**PASS, offline only**: unsafe/hosted target options, malformed/partial fingerprints, unknown flags, duplicate identity, absent destructive confirmation, participant acknowledgement, Docker identity substitutions and unproven transport are rejected in existing tests. No test contacted the example hosted hostname. Missing privileged credential against an otherwise valid running fixture is **NOT RUN**; its existing adapter guard was inspected only.

## 15–16. Source changes and GAP-007-touched files

No executable source, dependency, env, migration or test change. Only:

- `docs/V1_GAP_007_DISPOSABLE_EVIDENCE.md` (new).
- `docs/V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md` (existing gate row updated).

The remaining working-tree changes predate GAP-007. No Vault publication/sync was performed.

## 17. Regression validation

| Check actually run | Result |
| --- | --- |
| Seven targeted Node privacy/lifecycle/retention/containment/ops files | PASS: 71 tests, 0 failures/skips/todos, offline network preload |
| CI policy Node tests | PASS: 40 tests, 0 failures/skips/todos; last confirmation rerun also PASS |
| `ci-checks.mjs --repository-only` | PASS: workflow, hygiene, test integrity/only/skip/todo, runtime imports/dependencies, migrations and operational source checks |
| Default CI environment check | REFUSED populated local env files as designed; used existing repository-only mode without changing tree/env files or validation policy |
| `git diff --check` and new evidence whitespace check | PASS |
| Starting candidate preimage preservation | PASS: all 36 other pre-existing dirty files byte-identical; only the gate file intentionally edited |
| Full Node/full Vitest/typegen/TypeScript/source lint/offline production build | NOT RUN this task: disposable proof blocked, documentation-only task changes; prior 08 results not re-labelled as current |
| Runtime audit/full advisory verifier | NOT RUN this task; no external requests; CI verifier policy tests are not a fresh advisory audit |

Existing 56 live-test skips provide **no GAP-007 evidence**. No new skips were introduced. Native Node's existing TypeScript module-type warning remains unchanged.

## 18. Environment requirements / bounded remote alternative

Local completion requires a running Docker Linux engine, independently provisioned synthetic-only fixture matching the exact adapter identities/isolated network, full PostgreSQL 17/Supabase roles+Auth+Storage prerequisites, all 26 migrations from an empty DB, a locally generated fixture-only service credential and inspected gateway routes. No global install, wide machine reconfiguration or hosted fallback is authorized. Supabase CLI is absent but not mandatory for the existing Docker/psql adapter; host psql is likewise unnecessary if container psql is present. Record exact selected tooling/image versions before provisioning; repository supplies no supported CLI version pin.

**Remote disposable Supabase is not inherently required to overcome this local blocker.** Current scoped privacy contracts require real disposable proof without demonstrating a remote-only requirement; hosted release acceptance remains a distinct gate. Current privacy adapter has no remote transport, so remote authorization alone would not make it runnable.

If the user elects a remote alternative later, separate explicit authorization must name a newly isolated non-Production/non-Staging/non-Preview project, independently attest empty/synthetic-only contents, provide project/DB/API fingerprint and scoped ops credentials, approve a narrowly reviewed remote transport, and authorize these exact mutations: apply all 26 migrations from scratch; create A/B example-domain Auth accounts and a third synthetic retry account if needed; seed schema-valid rows across the 36 domains/private lifecycle-context ledgers and necessary ownerless prerequisites; upload synthetic PNG avatar/banner objects under only those user prefixes in `profile-assets`; run authenticated isolation attempts; collect bounded exports/plans; lock/clean/erase A and retry account with Storage removal and Auth-last deletion; preserve and verify B; inspect residual/schema/grant counts. No real accounts, data, buckets or other project may be touched. Final deletion of B or teardown of a remote project must also be explicitly included in that future scope; no remote mutation is authorized now.

## 19–21. Exact next gate, verdict and boundaries

Next gate: establish and independently prove compatible LOCAL_DISPOSABLE infrastructure, then execute GAP-007 migrations/fixtures/isolation/export/erasure/residual/retry proof and the requested post-proof regression matrix. GAP-008 restore and GAP-009 hosted acceptance remain separate and open.

**GAP-007 BLOCKED — NO PROVEN LOCAL DISPOSABLE TARGET.** Neither local nor hosted DB/Auth/Storage closure is claimed.

No Production access; no Staging access/mutation; no Preview access/mutation; no remote disposable access/mutation; no real user data used; no real account or Storage deletion; no deployment; no reset/restore/checkout/stash/clean/discard/history rewrite; no commit/push/merge/tag/release. Discovery and tests used repository files, local Docker availability metadata and offline synthetic objects only.
