# V1-HARDENING-08 — final source remediation

2026-10-06, Europe/Istanbul. Six requested source/document repairs and the separately authorized source-map-js transitive patch are implemented. **V1-HARDENING-08 SOURCE REMEDIATION CLOSED** after renewed local acceptance. **NO_COMMIT_OR_PUSH — latest user instruction**. Source/synthetic checks do not prove hosted PostgreSQL/Auth/Storage behavior; GAP-007–012 remain open.

## 1. Baseline / Git publication

- Starting branch: `release/v1-hardening`; starting HEAD: `a68317b8b719600e3731912d05ef3cc97c184b94`; initial porcelain/index clean.
- Exact baseline [Actions run 37385667090](https://github.com/Baglare/MediaTracker/actions/runs/37385667090): read live, completed/success, exact starting SHA and branch.
- Initial 25 migrations through `20261005140000`; 07 finding baseline exists and remains unchanged.
- Final local HEAD remains the starting SHA; changes are uncommitted. Pushed SHA: NONE. Commit message: NOT USED; requested message would be `Close final v1 source remediation gaps`.
- Latest user instruction explicitly prohibits commit/push/merge/tag/release/deploy even after acceptance passes. No corrective CI commit, no candidate exact-SHA Actions run, no branch switch.

## 2. GAP-001 retained participant activity

Original contradiction: `cleanupSql` and synthetic cleanup retained only title/mediaType, while `social_activity_media_safe_check` requires canonicalKey length 3..260. Recommendation completion emits recommendation-linked activities and reaches this cleanup. Before implementation, the new regression failed specifically on missing canonicalKey.

The neutral snapshot now retains title/mediaType plus `privacy-detached-activity:<surviving activity ID>`. This is internal detached provenance, not invented provider/media identity; it never derives from erased UUID/email/username/profile path. Discarding the entire former snapshot preserves the existing neutral-content policy. B's activity survives; unrelated B activity remains byte-equivalent in the synthetic model; retries are idempotent. Operational and synthetic residual verifiers reject invalid/attributable detached snapshots. No SQL CHECK was weakened. Real constraint execution remains GAP-007.

## 3. GAP-002 Auth initialization forward repair

Historical backfill preceded trigger installation. The new migration acquires `SHARE ROW EXCLUSIVE` on `auth.users`, draining conflicting INSERTs, then inserts only genuinely missing lifecycle rows with conflict-do-nothing. It never updates existing non-ACTIVE states/context/destructive flags. After release, the already installed AFTER INSERT initializer remains responsible for future accounts. Missing state still denies writes.

## 4. GAP-002 canonical full affected-write containment

`private_privacy_ops.release_write_state`: singleton, frozen=false normal default, revision CAS, RLS, no normal-role access. The central account-write assertion checks the global gate first. Separate statement triggers cover all 39 current public application tables and all lifecycle/XP context mutations including TRUNCATE. Managed Auth INSERT/UPDATE/DELETE/TRUNCATE and profile Storage INSERT/UPDATE/DELETE, bucket transitions and Storage TRUNCATE are covered. These gates precede former postgres/service/JWT exceptions; privacy erasure cannot run while frozen either.

The assertion locks the singleton `FOR SHARE` until transaction end; freeze UPDATE waits for admitted writers. Missing singleton denies. Old JWT/direct table/RPC mutation paths encounter DB admission. No user/client claim/flag can toggle freeze. Safe SELECT/local guest persistence remain available; RPCs that initialize persisted data and Auth sign-in metadata updates are writes and may be denied during the window.

Ops-only `scripts/ops/release-freeze.mjs`: inspect, freeze-plan, freeze, verify, unfreeze-plan, unfreeze. Default is offline plan. Execution requires explicit flag, positively proven existing disposable transport, fingerprint, revision and confirmation. No hosted transport/web admin endpoint was added. Unfreeze requires acknowledgment plus same-transaction ledger/lifecycle/RLS/exact trigger masks/functions/conditions/private ACL postchecks. Failure never automatically unfreezes. Auth locks and singleton CAS protect the unfreeze transaction. Broader owner/privacy/security/smoke acceptance remains an operator prerequisite.

`CUTOVER_WRITE_CONTAINMENT = SOURCE_READY`; live lock-drain/managed-service/platform proof remains required. The mechanism must be installed before the backup window; its bootstrap cannot protect itself. Frozen postgres data DML is intentionally denied. Data-changing migrations need an independently proven external containment window before deliberate unfreeze; do not disable triggers or pretend the Media flag supplies that window. DDL remains possible. Hosted/bootstrap/data-migration containment is a live gate, not proven by source tests.

## 5. GAP-003 complete server body-reader inventory

`lib/api/bounded-body.ts` counts actual streamed bytes before parsing, uses declared length only for early rejection, cancels overflow/abort, retains at most admitted chunks, consumes once and decodes strict UTF-8. JSON parse occurs afterward. Multipart parses a local Response constructed from bounded bytes; no multipart dependency added. Existing domain validation/auth/origin/MIME/path/file-size rules remain.

| Entry points | Access / persistence | Parser and byte ceiling | Domain / admission order |
| --- | --- | --- | --- |
| TVMaze/Open Library/AniList/TMDB/OMDb search | Public, provider read-only; disabled-provider policy retained | strict JSON, 4,096 | query max 200, allowed fields; origin/type/declared-size then bounded parse, field/policy then coupled provider admission |
| social/people | Authenticated, read-only | strict JSON, 4,096 | query/offset validation; no body-derived identity |
| ai/interpret, ai/recommend | Public deterministic / server entitlement gated, no new persistence | strict JSON, 1,048,576 | existing codec/domain/entitlement checks and coupled admission retained; no paid permission change |
| social/feed, comments, preferences, recommendations, reactions, reports, notifications | Authenticated mutations | shared JSON, 16,384 | existing UUID/enums/text/pagination/snapshot validators and mutation admission before body read |
| social/profile, relationships | Authenticated mutations | JSON, 16,384 | existing profile/relationship validators; auth/origin/admission retained |
| xp | Authenticated mutation | JSON, 4,194,304 | existing max 1,000 states, 220-key/200-title/128-hash bounds; auth/origin/admission before parse; escaped Unicode maximum batch regression |
| personalization/themes/sync | Authenticated mutation | JSON, 1,048,576 | existing revision/schema/theme token and DB aggregate limits; auth/origin/admission retained |
| social/assets POST | Authenticated Storage/profile mutation | multipart, 10 MiB + 65,536 envelope bytes | auth/origin/account guard/admission first; existing 5 MiB avatar / 10 MiB banner, MIME and safe generated paths retained |
| dev/recommendation-annotation POST | Explicit development/local-only guard | bounded text then JSON, existing requestBytes constant | dev access guard before read; existing object/annotation domain checks retained |

No direct request.json/text/formData/arrayBuffer/blob reader remains in current server routes. Source inventory contract fails if one returns. Shared social parsing and strict JSON callers retain existing sanitized 400/413 contracts. Search/provider coupled admission stays after small bounded parse and validated policy so malformed/disabled requests do not debit a provider bucket. No split or second limiter was introduced. Hosted ingress/time behavior is not proven; application byte admission no longer depends on it.

## 6. GAP-004 provider response byte/deadline boundary

`fetchWithTimeout` now fetches and completely consumes bounded success bytes before returning a buffered Response; JSON parsing afterward is over those bounded bytes. The AbortController deadline remains active through the stream, with overflow/stall/abort cancellation and already-aborted caller handling. Error bodies are canceled unread; only status/headers survive for existing 429/cooldown contracts. HTTP/provider bodies are never dumped.

Ceilings: TVMaze search 2 MiB, show detail 1 MiB, episodes 8 MiB; Open Library 2 MiB; disabled AniList/TMDB compatibility adapters 4 MiB. Existing eight-second overall transport bound remains; Calendar's caller deadline also remains active. Active TVMaze search/details/Calendar and Open Library use this boundary; dormant AniList/TMDB detail/Calendar raw-fetch paths now reuse it. Separate stronger pinned research transport is untouched. Stable Calendar AbortError/504 classification is preserved.

Deterministic tests cover normal/exact/+1 bytes, slow headers, fast headers with stalled or unfinished body, abort, malformed JSON, canceled 429/5xx error streams, existing route errors/cache/cooldowns. No live provider call.

## 7. GAP-005 retention inventory completeness

Lifecycle ACCOUNT_LIFETIME and transaction-only XP detachment/cleanup contexts are classified with reasons; global release singleton is FEATURE_LIFETIME, without account content. Inventory now has 53 categories and covers all 49 migration-created application tables. No legal age/period or new purge invented. `checkRetentionCompleteness` compares actual migration CREATE TABLE names to classifications through the existing repository/ops policy check. Negative test proves an unclassified future table fails; no count-only substitute.

## 8. GAP-006 README authority

README current release/env links now reference 06D/06E; old D2B hosted ledger claims are historical/unverified. AI key/model/legacy ML examples explicitly prohibit Production v1 use and restrict to separate local development. No internal operations manual or feature/provider enablement was added.

## 9. Migrations / recovery integration

Only new forward migration: `20261006120000_release_write_containment.sql`; 26 total, ordered. All 25 prior Git SQL bytes match starting baseline after existing checkout EOL normalization, including the four protected historical migrations and 02D fixes. No remote apply, down/reset or CHECK relaxation.

Privileged functions have fixed pg_catalog/pg_temp search_path and PUBLIC/anon/authenticated/service_role revocation; no broad grants. Static table trigger declarations preserve existing no-dynamic-SQL tests. 06 migration JSON regenerated from source. Recovery retains/restores all five managed Auth/Storage privacy/release bindings; old packages without this migration retain their two-binding verification contract. No real archive or restore execution is claimed.

## 10. Security and independent review

Read-only boundary investigation plus one fresh candidate review were performed. The reviewer identified incomplete trigger-definition postchecks; implementation now also checks event mask/timing/level/function/conditions/arguments. Focused source assertions cover this addition; real corrupted-catalog refusal is still live-required.

Ownership, lifecycle, participant, Storage, SD permissions/search_path, origin/Fetch Metadata/CSRF, CSP/nonce, safe logging/errors, provider gates, SSRF/research transport and distributed limiter regressions remain passing in full offline suites. No privilege/credential/runtime ops import introduced. No test/assertion deletion, weakening or new unconditional skip/only/todo.

## 11. Explicit 07 finding revalidation

| Finding | Original evidence | Change / new proof | Remaining limitation | Status |
| --- | --- | --- | --- | --- |
| V1-GAP-001 | cleanup omitted canonicalKey required by existing CHECK | pre-fix regression failed; SQL/model/residual shape repaired; retained B/retry/control tests pass | actual PostgreSQL transaction/constraint/rollback | CLOSED_SOURCE_PENDING_LIVE_DB_PROOF |
| V1-GAP-002 | lifecycle backfill before Auth trigger; Media flag did not cover other writes | missing-only locked forward repair; singleton central/statement/Auth/Storage/private guards; source and two-user synthetic contracts plus ops failure/unfreeze checks | real locks/concurrency/managed Auth/Storage, bootstrap/data-DML window and hosted transport | CLOSED_SOURCE_PENDING_LIVE_PROOF; CUTOVER_WRITE_CONTAINMENT SOURCE_READY |
| V1-GAP-003 | unbounded pre-parse JSON/text/formData | all readers inventoried/migrated; missing/false length, stream cancel, multipart, field/error and maximum XP tests pass | platform resource/ingress behavior not measured | CLOSED_SOURCE |
| V1-GAP-004 | timeout stopped at headers; unbounded supplier body | bounded end-to-end helper and active paths, stall/overflow/abort/error/regression tests pass | actual vendor/network behavior unexecuted | CLOSED_SOURCE |
| V1-GAP-005 | later lifecycle/context tables missing | machine inventory + negative future-table completeness and current source checks pass | legal/vendor retention periods still manual | CLOSED |
| V1-GAP-006 | historical D8/ledger/key examples looked current | narrow README links/labels/key restrictions; source contract passes | hosted ledger not read | CLOSED |

## 12. Final validation / exact limits

| Check | Actual result |
| --- | --- |
| CI policy + privacy/lifecycle/participant/containment/retention/ops/source Node suites | PASS: 114 tests, zero fail/skip/todo; includes 40 CI policy tests |
| Full offline Vitest | PASS: 204 files / 2,980 tests; 18 existing live files / 56 tests SKIP, zero failure |
| Route typegen / separate tsc --noEmit --incremental false | PASS |
| Source lint | PASS: zero errors, one existing recommendation-composer navigation warning |
| Offline production build | PASS: compile/typecheck/27 pages; existing annotation tracing and workspace warnings retained |
| Repository/migration/retention contracts | PASS; existing CI policy also checks secrets/test integrity/skip/only/todo/source import boundaries |
| Historical SQL / package/lock policy stability | PASS: 25 historical migrations unchanged; package.json and braces exception source unchanged; exactly one lock entry patched, source-map-js 1.2.1 → 1.2.2 |
| Build ops/credential/trace boundary | PASS: 53 .nft.json traces / 427 compiled JS; only exact harmless tracing-exclusion configuration glob classified separately |
| Tracked/candidate source stability | PASS: 1,116 source files in credential-free validation copy; final report/gate prose refreshed after acceptance, generated outputs ignored |
| Dependency tree / installed graph | PASS: all source-map-js paths resolve 1.2.2; no vulnerable <1.2.2 resolution; no other lock package entry changed |
| Runtime npm audit | **PASS: zero vulnerabilities, High 0 / Critical 0**; no exception/suppression added |
| Full advisory exception verifier | **PASS**; full audit High 5 / Critical 0, exactly five existing dev-only braces-chain entries accepted; no new exception |
| git diff --check | PASS, including untracked additions checked separately |
| PostgreSQL/Auth/Storage/restore/hosted/browser/E2E | NOT RUN; no positively established disposable environment used, no alternate/unknown target connection |

Validation used an ignored source-only copy, no populated env/private files, allowlisted process environment and unchanged offline network preload. After the authorized three-field lock patch, `npm ci --ignore-scripts --no-audit --no-fund` installed 421 packages from the exact lock; dependency lifecycle scripts were not run. The validation copy uses that installed dependency graph via junction. All listed tests/typegen/typecheck/lint/build were rerun after installation. npm registry package/install/audit reads and the earlier baseline Actions/advisory reads were the only external reads. Initial harness sandbox junction/temp rename EPERM was resolved with approved local execution. A new malformed test assertion, new test header type and new migration dynamic-SQL violation were corrected without weakening existing tests. XP byte ceiling was increased after reviewing its legitimate 1,000-item contract. Existing warnings were not suppressed.

## 13. Changed files

Added: bounded-body helper, release-freeze ops tool, forward migration, retained-activity/containment/bounded-body/source-contract tests, this report. Modified: request-security and shared social parser; XP/theme/profile/relationship/assets/dev readers; provider detail/Calendar adapter fetch callers; privacy SQL/model; retention inventory; recovery/DR/source verifier and operational/retention tests; 05C/05D/05F participant/retention facts; 06D/06E/06 migration manifest; README; package-lock.json (only source-map-js resolution). No 07 history, historical SQL, package.json, other package resolution, CI workflow, AGENTS, README unrelated feature copy or generated source modifications. The dependency follow-up changed only the lock and this report/current 06E gate; no additional application source change was needed.

Exact changed files (37):

- `README.md`
- `app/api/anilist/details/route.ts`
- `app/api/calendar/anilist/route.ts`
- `app/api/calendar/tmdb/route.ts`
- `app/api/calendar/tvmaze/route.ts`
- `app/api/dev/recommendation-annotation/route.ts`
- `app/api/personalization/themes/sync/route.ts`
- `app/api/social/assets/route.ts`
- `app/api/social/profile/route.ts`
- `app/api/social/relationships/route.ts`
- `app/api/tmdb/details/route.ts`
- `app/api/xp/route.ts`
- `docs/V1_HARDENING_05C_ACCOUNT_EXPORT_ERASURE.md`
- `docs/V1_HARDENING_05D_RETENTION_AND_CLEANUP.md`
- `docs/V1_HARDENING_05F_OPERATIONAL_ERASURE_CLOSURE.md`
- `docs/V1_HARDENING_06D_RELEASE_OPERATIONS.md`
- `docs/V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md`
- `docs/V1_HARDENING_06_MIGRATIONS.json`
- `docs/V1_HARDENING_08_FINAL_SOURCE_REMEDIATION.md`
- `lib/api/bounded-body.ts`
- `lib/api/request-security.ts`
- `lib/social/route-response.ts`
- `package-lock.json`
- `scripts/ops/disposable-dr.mjs`
- `scripts/ops/recovery.mjs`
- `scripts/ops/release-freeze.mjs`
- `scripts/ops/verify-source.mjs`
- `scripts/privacy-account-model.mjs`
- `scripts/privacy-account-sql.mjs`
- `scripts/privacy-retention-ops.mjs`
- `supabase/migrations/20261006120000_release_write_containment.sql`
- `tests/privacy-retained-activity.test.mjs`
- `tests/privacy-retention-ops.test.mjs`
- `tests/release-write-containment.test.mjs`
- `tests/v1-bounded-body.test.ts`
- `tests/v1-operations.test.mjs`
- `tests/v1-source-remediation-contracts.test.mjs`

## 14. Remaining live/environment gates

GAP-007 disposable DB/Auth/Storage privacy proof: BLOCKED_ENVIRONMENT / LIVE_VALIDATION_REQUIRED. GAP-008 real restore rehearsal: BLOCKED_ENVIRONMENT. GAP-009 Preview/Staging/Production hosted acceptance: LIVE_VALIDATION_REQUIRED. Hosted containment/lock-drain/concurrent Auth/Storage and bootstrap/data-DML sequencing remain required. No fake live closure.

## 15. Remaining manual/legal/external gates

GAP-010 Article 9/VERBIS/bases/retention/TVMaze: MANUAL_LEGAL_GATE. GAP-011 Open Library registration/vendor/mailbox evidence: MANUAL_EXTERNAL_GATE. GAP-012 immutable RC/Production authority: MANUAL_EXTERNAL_GATE. Source changes do not satisfy these gates.

## 16. Accepted braces exception and resolved runtime advisory

GAP-013/V1-SEC-EXCEPTION-001 remains narrow and unchanged: eslint-config-next 16.3.8 → @next/eslint-plugin-next 16.3.8 → fast-glob 3.3.1 → micromatch 4.0.8 → braces 3.0.3; expiry/review 2026-11-03 UTC. No force upgrade/downgrade/extension or suppression.

The [GitHub-reviewed source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) initially caused runtime High 1 / full audit High 6 and a correctly failing verifier. The user then explicitly authorized only the transitive 1.2.2 patch. No suppression or new exception was used.

Before/after paths (all share the single root source-map-js resolution, **1.2.1 → 1.2.2**):

- Runtime: `next@16.3.8 → postcss@8.5.23 → source-map-js`.
- Dev: `@tailwindcss/postcss@4.2.4 → postcss@8.5.23 → source-map-js`.
- Dev: `@tailwindcss/postcss@4.2.4 → @tailwindcss/node@4.2.4 → source-map-js`.
- Dev: `vitest@4.1.11 → vite@8.3.2 → postcss@8.5.28 → source-map-js` (including Vitest's existing mocker/Vite edge).

Every immediate parent requests `^1.2.1`, which accepts 1.2.2. package.json therefore needs no change and no direct dependency/override was added. Only the root lock entry's version, registry tarball and registry-verified integrity changed: three removed/three added lines. Semantic comparison of all lock package entries found exactly that one change; no other package version changed. `npm explain`/`npm ls` confirmed the installed 1.2.2 graph. Runtime audit is now zero vulnerabilities; unchanged full verifier accepts only the pre-existing five dev entries. Existing skip totals remain 18 files / 56 tests.

## 17. Next gate / durable context

Source remediation acceptance is closed. Obtain separately authorized, independently safe disposable privacy/containment/restore proofs before hosted acceptance. Immutable RC publication and all hosted access remain separately gated; current instructions prohibit commit/push/deploy. No Production cutover authorization follows. Durable containment/retention knowledge merits a future minimal project-context update; no Vault write/sync/publication was performed because this phase forbids non-Git remote mutations.

## 18. Verdict

**V1-HARDENING-08 SOURCE REMEDIATION CLOSED.** Requested six source/doc repairs and the authorized transitive dependency patch pass renewed local acceptance, including runtime High=0 / Critical=0 and full advisory verifier PASS. GAP-007–012 remain open. **NO_COMMIT_OR_PUSH — latest user instruction**. This is source closure only; do not mark this candidate immutable/approved or CLOSED_LIVE.

## 19. Safety / publication confirmation

No Production access; no Staging access/mutation; no Preview/Vercel access/deploy/env mutation; no remote migration; no real user data/erasure/Auth Admin/Storage operation; no real backup/restore; no vendor/mailbox/Article 9/VERBIS operation. No commit/push/main merge/tag/release/PR, in accordance with the latest user instruction even after validation passed. No non-Git remote mutation and no canonical Vault/memory write occurred.
