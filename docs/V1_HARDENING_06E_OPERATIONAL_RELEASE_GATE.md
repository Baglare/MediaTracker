# V1-HARDENING-06E — operational master release gate

2026-10-06. This is the single **current** master hold matrix; older D8/05E tables retain historical/domain evidence, not current closure authority. [06D source release operations](V1_HARDENING_06D_RELEASE_OPERATIONS.md) and [06A backup/recovery](V1_HARDENING_06A_BACKUP_AND_RESTORE.md) govern execution planning. Status is scoped: SOURCE_READY does not prove hosted behavior or disaster recovery. No final immutable RC exists; Production cutover FROZEN.

Baseline: `release/v1-hardening`, HEAD `b48f5ee1fa2c9a9277ce3b0852e49a1e9de9830e`, initially clean, local `origin/release/v1-hardening` equal; exact-SHA [Actions PASS](https://github.com/Baglare/MediaTracker/actions/runs/37373905546). Candidate source validation is separate from that remote baseline.

| Gate | Status | Evidence / exact closure requirement |
| --- | --- | --- |
| Dependency/runtime hardening | CLOSED | 01/01B source + baseline CI; runtime High/Critical zero; dev exception V1-SEC-EXCEPTION-001 not a fix, expiry 2026-11-03 |
| CSRF/origin | CLOSED | 02A source contract retained; exact same-origin boundary; fresh hosted smoke still required |
| CSP/XSS | CLOSED | 02B nonce/URL source retained; fresh hosted browser acceptance remains |
| Safe logging | CLOSED | 02C allowlist/correlation retained; platform retention separately open |
| Distributed limiter source | CLOSED | 02D and forward fixes retained; historical measured acceptance not Production SLA |
| Distributed limiter live release config | LIVE_VALIDATION_REQUIRED | Fresh Vault/key-version/audience, ingress, concurrency/capacity/cron and failure proof |
| CI | CLOSED | Exact baseline SHA Actions success; candidates need own clean SHA after user commit/publication |
| Provider source gates | CLOSED | TVMaze attribution, conditional Open Library, AniList/TMDB/OMDb hard-disabled; no policy change |
| Privacy notice technical representation | SOURCE_READY | 05A/05B facts; final operator/legal sufficiency unapproved |
| Privacy export/erasure source work | SOURCE_READY | ACCOUNT_WRITE_BARRIER / ACCOUNT_ERASURE_WORKFLOW source complete; 05F synthetic proof only |
| Phase 5 real disposable DB/Auth/Storage proof | BLOCKED_ENVIRONMENT | LIVE_DISPOSABLE_DB_PROOF remains unproven; grants/concurrency/deferred XP/participant/Auth-last execution required |
| Backup tooling | SOURCE_READY | 06A disposable encrypted DB packaging/plan/integrity; actual hosted transport and Storage/Auth recovery excluded |
| Restore tooling | SOURCE_READY | 06A default plan, exact local proof, empty prerequisites, stop-on-error DB verifier; DB-only success never full DR |
| Disposable restore rehearsal | BLOCKED_ENVIRONMENT | NOT_RUN_ENVIRONMENT_BLOCKED: Docker daemon unavailable, no safe fixture established |
| Incident response | SOURCE_READY | 06B severity/lifecycle + A–M playbooks; external operations unexecuted |
| Rollback/fail-forward | SOURCE_READY | 06B every-source migration manifest and compatibility/privacy matrix |
| Monitoring | SOURCE_READY | 06C safe available/manual signal inventory; no automatic alerts/APM claimed |
| Preview acceptance | LIVE_VALIDATION_REQUIRED | Fresh immutable SHA/env/provider/CSP/browser/cloud/social/asset/limiter smoke |
| Staging acceptance | LIVE_VALIDATION_REQUIRED | Separate future authorization/target proof/current migration/security/privacy/owner smoke |
| Production read-only preflight | LIVE_VALIDATION_REQUIRED | Future explicit read-only authorization; exact target/ledger/config/Advisor/backup capability |
| Backup before cutover | LIVE_VALIDATION_REQUIRED | Fresh authorized encrypted DB/private/ledger + separate Storage + supported Auth recovery, independent manifest pin |
| Full affected-write freeze | BLOCKED_MANUAL | Media maintenance does not cover all direct RPC/Goals/social/XP/Storage/Auth writes; positive freeze proof required |
| Article 9 | MANUAL_LEGAL_GATE | Recipient/transfer mechanism evidence and legal approval; no filing/contact by this task |
| VERBIS | BLOCKED_MANUAL | Operator/legal exemption/registration determination; no assumed exemption |
| Legal basis / Article 10 final notice | MANUAL_LEGAL_GATE | Provisional matrix requires real controller/bases/recipients and approval |
| Legal retention / restored erasure reconciliation | MANUAL_LEGAL_GATE | Vendor/device/backup periods and recovery quarantine/erase reconciliation approved |
| Request/mailbox operation | BLOCKED_MANUAL | Actual secured channel/MFA/operator/deadlines/delivery/retention evidence |
| Vendor/DPA/regions/subprocessors | MANUAL_EXTERNAL_GATE | Account-specific evidence; DPA alone does not close Article 9 |
| Enabled-provider manual/legal gates | MANUAL_LEGAL_GATE | Actual operator/contact/disclosures + TVMaze interpretation; Open Library can remain disabled if registration not closed |
| Open Library registration | MANUAL_EXTERNAL_GATE | Explicit registration evidence if enabled; historical contact/Preview result insufficient |
| TVMaze ShareAlike interpretation | MANUAL_LEGAL_GATE | Persisted/transformed metadata and exports legal decision |
| Hosted signup / anonymous Auth | LIVE_VALIDATION_REQUIRED | Fresh hosted setting + provider-level deny proof; existing sign-in retained |
| Env review | BLOCKED_MANUAL | Current 06D classes, isolated targets/keys, forbidden absence and platform provenance |
| Security Advisor | LIVE_VALIDATION_REQUIRED | Fresh current target/database Advisor, grants/RLS/function/search_path and blocker resolution |
| Platform log/access/retention | MANUAL_EXTERNAL_GATE | Actual vendor capability/permissions/retention not inferred from logger source |
| Final browser smoke | LIVE_VALIDATION_REQUIRED | Approved exact-SHA Preview/target, safe synthetic accounts; not run here |
| Final immutable RC | BLOCKED_MANUAL | Final gap/security audit, user publication, clean SHA CI + all required live/manual gates; no tag now |
| Production cutover | BLOCKED_MANUAL | FROZEN; separate named target/change-window/deploy/migration authorization only after closure |
| AI/admin/AniList/TMDB/OMDb new public enablement | POST_RELEASE_GATE | Separate source/legal/security/permission/monitoring review; disabled features do not force v1 enablement |
| New Admin/Ops panel / self-service delete UI | NOT_APPLICABLE | Existing operator-assisted architecture retained |

## Validation (candidate)

| Candidate check | Actual result / scope |
| --- | --- |
| Direct operational Node suite | PASS: 24 scenarios; no fail/skip/todo. Real DB/archive execution is not simulated as live proof |
| Targeted neighboring Vitest | PASS: 8 files / 436 tests, including privacy barrier/lifecycle, CSRF, CSP, provider policy, limiter and leakage; final ops extensions additionally covered by final full suite |
| Final full offline Vitest | PASS: 203 files / 2,962 tests; 18 existing live files / 56 tests SKIP. These are LIVE_UNVERIFIED, no new skip/todo/only |
| Typegen + separate typecheck | PASS: installed Next typegen then tsc --noEmit --incremental false; runtime/type source unchanged after this check |
| Source lint | PASS: unchanged ESLint in clean source copy; zero errors, one existing recommendation-composer navigation warning |
| Local production build | PASS: offline/credential-free source copy; no deployment. Existing 15 annotation filesystem tracing warnings and nested workspace-root warning retained |
| Runtime npm audit | PASS: zero total vulnerabilities, High/Critical 0 |
| Full advisory verifier | PASS under existing exception: five dev-only High entries, zero Critical; V1-SEC-EXCEPTION-001 expires 2026-11-03. Not a full zero-High audit or remediation |
| CI helper tests / repository policy | PASS: 40 helper tests; workflow unchanged. Existing CI calls now also enforce operational docs/manifest/gates and ops/credential boundaries |
| Migration integrity | PASS: all 25 source versions ordered, critical applied-history hashes and every tracked SQL byte unchanged; no migration/package/lock changes or SQL execution |
| Test integrity / skip / secret scan | PASS: existing TS AST/hygiene/signature policies cover tracked and untracked additions; required assertions retained; no secret values copied |
| Ops/runtime/artifact boundaries | PASS: source graph policy; 53 built trace manifests and 426 compiled JS files contain no ops module, ops credential/Admin or private/env artifact leakage; 1,107-file allowlisted source snapshot matches current executable source |
| Diff / new-file whitespace | PASS: tracked diff and each untracked candidate independently checked |
| DB/Storage/Auth/restore/Preview/Staging/Production/browser | NOT RUN / LIVE_UNVERIFIED. No positive disposable environment; Docker Linux daemon unavailable; no substitute target |

Validation used an ignored allowlisted source copy with existing dependency junction, no local env/private assets and allowlisted subprocess environment. Node's existing offline network guard blocks external TCP/UDP; only literal loopback/IPC is allowed for build tooling. `PRIVACY_TEST_BASELINE_REPO` is a non-credential test path so historical migration tests check the real repo. It is not a runtime env or target credential. Build completed before final ops/CI-only safety additions; no runtime source/config changed afterward, and final source/compiled boundaries were verified separately.

Initial targeted run exposed the old test's exact tracing-array expectation and snapshot Git path assumption. The privacy assertion now requires **both** privacy and new ops exclusions, preserving its original protection; no test was removed/weakened. Snapshot Git routing uses the existing test hook. Sandbox temporary rename/junction EPERM was resolved through the approved local validation scope, without changing tests/lint/network guards. Native Node loading of the reused provider-identity TypeScript helper emits a module-type warning; no package/config suppression was added.

## Files changed / important limits

Added five canonical 06A–E documents, ordered migration/environment JSON manifests, five ops-only modules under `scripts/ops/`, and Node/Vitest operational tests. Six historical D8 docs gained only the frozen/current-canonical banner; their original text is hash-preserved. Existing files changed: `next.config.ts` (narrow ops tracing exclusion), `scripts/ci-checks.mjs` (additive ops source/env/import checks), `tests/privacy-write-barrier.test.mjs` (both required exclusions). Total: 14 added + 9 modified files. No package/dependency/SQL/runtime feature/policy changes.

Backup/restore SOURCE_READY refers to the explicitly bounded **disposable DB** tool and its local integrity/plan mechanisms. It does not authorize or implement an unrestricted hosted transport, managed-role/Auth restoration, Storage object recovery or automated erasure reconciliation. Those capability/proof/authorization gates remain explicit in 06A/06D. No disaster recovery or Production readiness is claimed.

## Safety / next gate

No Production access; no Staging access/mutation; no Vercel mutation/deploy; no remote migration; no real backup/restore/user data/Auth Admin/Storage operation; no vendor/mailbox/Article 9/VERBIS action; no commit/push/tag/main merge. GitHub metadata and npm advisory reads are permitted only. Docker availability inspection is local and no DB was connected.

Vault retrieval through configured project routing returned VAULT_GIT_INVALID. No canonical write/sync/commit/push was attempted. This durable operational phase merits a minimal future project-note update after Vault routing is valid and the user authorizes publication; no target path is guessed.

Recommended next step: final source gap/security sweep, followed by an independently provisioned safe disposable privacy + restore rehearsal. Then clean committed candidate CI/artifact/Preview/Staging acceptance under separate authorization. None of these grants Production cutover authority.

`RC_CANDIDATE_SOURCE_READY` — local source gates passed. Final verdict: **V1-HARDENING-06 SOURCE OPERATIONAL READINESS COMPLETE — LIVE RELEASE GATES REMAIN**. This is not an immutable or Production-approved RC.
