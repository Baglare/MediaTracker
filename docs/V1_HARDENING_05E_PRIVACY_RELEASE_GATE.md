# V1-HARDENING-05E — Privacy release gate consolidation

Date: 2026-10-05. Phase order: 05C source/synthetic acceptance → 05D retention design acceptance → 05E consolidation. This is the Phase 5 privacy matrix; it does not supersede or close existing D8 production/security hold gates.

**V1-HARDENING-05 STILL BLOCKED — PostgreSQL role/concurrency enforcement and the real Auth-service erasure sequence remain LIVE UNVERIFIED.** [05F operational closure](V1_HARDENING_05F_OPERATIONAL_ERASURE_CLOSURE.md) implements the DB write barrier, operational disposable adapter and deterministic participant policy with offline proof. No safe disposable stack was available to execute migrations/role/concurrency/Storage/Auth integration. This is not Production privacy approval.

Canonical unresolved values:

- `ARTICLE_9_MECHANISM = MANUAL_LEGAL_GATE`
- `VERBIS_STATUS = MANUAL_OPERATOR_CONFIRMATION`
- `LEGAL_BASIS_MATRIX = PROVISIONAL_PENDING_LEGAL_REVIEW`
- `RETENTION_LEGAL_POLICY = MANUAL_LEGAL_REVIEW`
- `MAILBOX_RETENTION = OPERATOR_POLICY_REQUIRED`

## 1. Starting baseline

PASS: `release/v1-hardening`, initial clean tree, HEAD/local origin tracking SHA `2edd8af879bccbad64530abeb5b7c7f891bba0ac`, 05B committed, 05A and 05B present, [exact-HEAD CI run 37353642634](https://github.com/Baglare/MediaTracker/actions/runs/37353642634) completed/success, verified using read-only GitHub API. Prior phase commits/reports remain intact. New working changes are uncommitted and have no exact-SHA CI claim.

## 2–4. 05C account export, erasure and verdict

Canonical details: [05C account export/erasure](V1_HARDENING_05C_ACCOUNT_EXPORT_ERASURE.md). Export v1 includes 36 account-associated source categories, safe Auth summary, owned asset metadata and explicit external/device/binary limitations. A/B fixtures verify own data/visible shared messages, excluded B private data/hidden messages and platform credential fields. No real source/credential/data file is accepted. Export output is distinct from portable backup/device data.

Current 05F order: target/plan → durable ERASURE_PENDING → same-identity denial probe → ERASING → dependency-aware application/XP cleanup → Storage remove/verify → application/participant/barrier verification → Auth last → final verification. Cross-owner XP and unknown residuals fail closed. Dependent participant loss requires acknowledgement; independent B replies/XP are detached and preserved; target-attributed reply text is anonymized with plan acknowledgement. Failure keeps the lock and retry does not reopen it. Source/mock proof does not establish live DB/search/CDN behavior.

05F supplies private lifecycle/transition helpers, DB statement/row guards including SECURITY DEFINER side effects and Storage, target-scoped SQL/Storage/Auth transports, participant provenance detachment, and residual verification. No arbitrary-target admin HTTP endpoint or runtime credential is introduced. Source/permission/ordering/immutability and mocked adapter checks pass; **operational acceptance remains BLOCKED_VALIDATION** until actual isolated PostgreSQL/Storage/Auth execution. `LIVE_DISPOSABLE_DB_PROOF = NOT_RUN`; no Staging/Production substitution is permitted.

## 5–6. 05D retention and verdict

Canonical details: [05D retention/cleanup](V1_HARDENING_05D_RETENTION_AND_CLEANUP.md). All public/private/device/mail/vendor domains have explicit classes; exact source TTLs are distinguished from physical erase. No arbitrary statutory/user-content periods or tombstone/ledger purge. Offline replay correctness has no proven finite horizon.

Synthetic cleanup tool defaults dry-run, validates cutoff, caps a shared bucket/receipt batch at 500, requires flag/confirmation, refuses active content and never deletes Auth. Existing private_rate_limit.cleanup_v1 is the future real implementation boundary; no parallel SQL cleanup/scheduler is deployed. **05D source/design verdict: CLOSED**; legal policy MANUAL_LEGAL_REVIEW, real cleanup adapter/deployed physical retention LIVE UNVERIFIED.

## 7. Final privacy release matrix

| Gate | Status | Evidence / exact remaining scope |
| --- | --- | --- |
| Factual data inventory | CLOSED | 05A + 05C/05D ordered-schema recheck; no live data/state proof |
| Article 10 notice | MANUAL_LEGAL_GATE | 05B technical representation exists; actual controller/bases/recipient/transfer sufficiency unapproved |
| Article 11 notice | CLOSED | Technical nine-rights representation/conditions in 05B; legal adequacy remains review |
| Request process | BLOCKED_MANUAL | Documented identity/scope/deadline/response procedure; staffing/channel/operation evidence missing |
| Account write barrier | BLOCKED_MANUAL | 05F DB lifecycle/guards implemented; same-identity/all-family source/model proof PASS; actual PostgreSQL privileges/concurrency LIVE UNVERIFIED |
| Account export | BLOCKED_MANUAL | Scoped operational source adapter and A/B export proof implemented; actual disposable query execution unverified; real delivery remains manual |
| Account erasure | BLOCKED_MANUAL | Operational adapter, lock-first/Auth-last/failure/retry/residual checks implemented and mocked; actual DB/Storage/GoTrue integration unverified |
| Shared-content erasure policy | CLOSED | 05F DELETE/DETACH/ANONYMIZE/RETAIN_NON_IDENTIFYING policy and implementation; independent B reply/XP tests PASS; no invented legal retention |
| Profile asset erasure | BLOCKED_MANUAL | Exact-prefix metadata/recursive API list/remove/verify implemented and mocked; no live Storage operation |
| Auth deletion | BLOCKED_MANUAL | Admin deletion stays last; empty-cascade session exception/absence tested statically and mocked; actual GoTrue role behavior unverified |
| Retention technical policy | CLOSED | 05D source inventory/classes/conservative cleanup design; no automatic user purge |
| Retention legal confirmation | MANUAL_LEGAL_GATE | Purpose-based periods/holds/rights evidence unapproved |
| Provider/privacy disclosures | MANUAL_EXTERNAL_GATE | 05B factual APIs/CDNs; TVMaze/Open Library operator/legal/license/registration gates not closed |
| Browser-direct external resources | MANUAL_LEGAL_GATE | 05A exact legacy host inventory/05B disclosure; independent foreign processing remains |
| Article 9 transfer mechanism | MANUAL_LEGAL_GATE | Recipient-specific evidence absent; production acceptance HOLD |
| VERBIS | BLOCKED_MANUAL | MANUAL_OPERATOR_CONFIRMATION; no exemption/registration assertion |
| Mailbox procedure | BLOCKED_MANUAL | Mail channel/identity/deadline policy documented; access/MFA/handlers/security/delivery/retention unverified |
| Vendor contracts/DPA | MANUAL_EXTERNAL_GATE | Account-specific contractual roles/terms/locations/subprocessors unverified; DPA alone does not close Article 9 |
| Hosted Auth signup setting | BLOCKED_MANUAL | Intended disabled target; repository/page cannot prove hosted switch |
| Hosted provider/AI/runtime settings | BLOCKED_MANUAL | Verify enabled provider contact, disabled paid AI/research, absent forbidden credentials separately |
| Platform logs/retention | MANUAL_EXTERNAL_GATE | Actual vendor logging/access/retention/delete capabilities unknown |
| Backup/restore privacy implications | BLOCKED_MANUAL | Vendor copies/restore quarantine/erase reconciliation not operationally proven |
| Disabled paid AI/research/AniList/TMDB/OMDb new public enablement | POST_RELEASE_GATE | V1 dormant APIs; legacy/direct image flows remain separately assessed |
| Self-service account delete UI | NOT_APPLICABLE | Operator-assisted accepted architecture; no privileged UI/API needed |

Status does not mean legal compliance. CLOSED technical rows are scoped to source/synthetic evidence. Existing D8 production target, migration/backup/change-window, Advisor and security gates remain governed by their canonical acceptance/runbook.

## 8. Migration candidate

Ordered candidates: `20261005120000_privacy_xp_ops_cleanup.sql` (supplied 05C candidate, preserved), then `20261005130000_account_privacy_write_barrier.sql`, then `20261005140000_privacy_participant_detachment.sql` (05F). Tracked historical SQL unchanged; fixed search_path/revokes and exact-target private contexts; no normal-runtime erasure invocation. **Not applied anywhere by 05F.** Role denial, row-lock/concurrency, immutable XP/participant grouping, deferred XP reconciliation flush, rollback, cross-owner refusal, actual Auth cascade and retry remain disposable execution gates. Production deployment/migration needs separate authorization.

## 9. Files changed

- Added `scripts/privacy-account-model.mjs`, `privacy-account-ops.mjs`, `privacy-synthetic-fixture.mjs`, `privacy-retention-ops.mjs`.
- Added `tests/privacy-account-ops.test.mjs`, `privacy-retention-ops.test.mjs`, `v1-hardening-05-lifecycle.test.ts`.
- Added XP migration candidate and canonical 05C/05D/05E docs.
- Updated only `scripts/ci-policy.test.mjs`: missing-required-migration negative case now removes the required migration by identity rather than assuming the last directory entry is critical. Assertion preserved; CI workflow/policy implementation unchanged.
- `/privacy` unchanged: current factual wording says full account technical scope is being verified and retention/mailbox policy is incomplete. No synthetic-only capability is promoted to public availability.

## 10. Validation

The results below are the retained **05C–05E validation baseline**. Final 05F candidate results and remaining live proof are recorded in [05F](V1_HARDENING_05F_OPERATIONAL_ERASURE_CLOSURE.md); no new dirty-tree Actions CI claim is made.

Final results are recorded after validation below. Initial 05C: 15 Node checks PASS. Initial 05D: seven Node checks PASS. Focused Vitest: 17 files / 270 tests PASS, zero skipped. Sandbox SSR temporary-file rename failed before test collection; same offline credential-free focused tests passed outside sandbox. Windows preload initially needed a file URL; corrected without changing tests.

First full Vitest attempt: 199 files PASS, two existing endpoint AST scans timed out at their unchanged 5-second limit, 18 existing live files skipped; 2,956 tests PASS, two failed, 56 skipped. Reduced worker concurrency rerun preserves all assertions/timeouts; results recorded at completion. Initial CI helper failure after adding a forward migration exposed its last-entry assumption; fixed negative-test target and all 40 tests passed.

No test deleted/skipped/weakened, no timeout increased, no ESLint/tsconfig relaxation. Existing conditional live skips remain LIVE UNVERIFIED. New Node tests run under a Vitest wrapper and also directly with the existing offline guard. All credentials/live flags removed from validation child environments without printing values. Build/typegen must run in a source snapshot without local env/private data.

| Final check | Result / practical scope |
| --- | --- |
| Direct lifecycle Node tests | PASS: 22 tests, zero fail/skip/todo (15 account, seven retention) |
| Targeted neighboring Vitest | PASS: 17 files, 270 tests, zero skip; includes privacy, ownership, backup/goals, Cloud/social/XP schema and provider/limiter contracts |
| Full Vitest | PASS: 201 files / 2,958 tests passed, 18 existing live files / 56 tests skipped; offline `--maxWorkers=4`, unchanged assertions/timeouts |
| CI helper tests | PASS: 40 tests, zero fail/skip; required-migration negative assertion retained |
| CI repository/migrations/test integrity | PASS: `node scripts/ci-checks.mjs --repository-only` plus explicit new-file contracts/AST checks; old critical migrations unchanged |
| Typecheck | PASS: installed Next typegen and independent tsc --noEmit --incremental false in credential-free source snapshot; build TypeScript also passed |
| Source lint | PASS: full app/components/features/hooks/lib/scripts/tests and root TS/MJS with unchanged ESLint; zero errors, one existing recommendation-composer navigation warning; changed files separately linted |
| Build | PASS: npm build in source snapshot; no env/private datasets copied; installed dependency junction only; executable snapshot hashes match 852 source files |
| Build limitations | Existing annotation-tool dynamic tracing warnings (15) plus nested-snapshot workspace-root warning; 51 trace manifests checked: zero env/private references and zero outside-snapshot nondependency references; no config/ignore weakening |
| Runtime npm audit | PASS: audit --omit=dev --audit-level=high, zero High/Critical and zero total runtime advisories; not a full dev dependency clearance |
| Secret/hygiene/new skip scan | PASS: current changed/new files through existing high-specificity secret/hygiene and AST test integrity checks; no new skip/todo/only |
| Executable privacy boundary | PASS: zero privacy ops imports in app/components/features/hooks/lib; no new application route or web credential; fixed private SQL permissions source contract |
| Whitespace | PASS: tracked diff and every new file with no-index diff --check; Git LF/CRLF notices are not whitespace failures |
| Browser/live/disposable DB | NOT_RUN; no public UI/routing behavior change; no target established or live SQL/Storage/Auth role proof |
| Vault | Read-only context returned VAULT_GIT_INVALID; no guessed candidate path/write/commit/push |

Raw repository-wide npm lint was not used to silently include/ignore `.codex` validation artifacts; source lint coverage is explicit and the ESLint configuration is unchanged. The initial empty root TSX glob was a command-selection failure, corrected by selecting existing source patterns. Root env cleanliness cannot be claimed for the actual local checkout; validation environment cleanliness is scoped to the copied source snapshot and credential-free subprocesses. No local env value was read/copied into evidence.

## 11–12. Remaining release blockers and exact operator checklist

Technical first: execute the implemented 05F candidates/adapter on an independently confirmed isolated disposable synthetic target, proving actual roles, concurrent/stale writes, deferred XP cleanup, Storage and Auth-last cascades/absence. Implementation/source/mock evidence is in 05F; do not repeat completed source work or classify legal retention as invented. No real account operation is authorized by this report.

05C records the original Cloud/Goal/XP resurrection race and dependent CASCADE loss. 05F replaces the source-level absence with a central DB barrier and deterministic DELETE/DETACH policy; actual enforcement remains unexecuted. A public arbitrary-user RPC, trigger disable, early Auth delete or invented retention period remains unacceptable.

Article 9 evidence checklist (use 05A's recipient/host inventory, current official KVKK material and legal review; no instrument submitted):

| Recipient | Data and pattern | Required evidence / operator action | Release effect |
| --- | --- | --- | --- |
| Supabase | Auth/account/profile/assets/selected Cloud/social/themes/XP/security; recurring infrastructure | Actual region/subprocessors/roles/contract/delete/log/backup scope; recipient-specific Turkish Article 9 mechanism and required formal action evidence | MANUAL_LEGAL_GATE HOLD |
| Vercel | Page/API metadata and requested hosting/provider/deterministic payload; continuous hosting | Account-specific hosting/log/region/subprocessor/contract/role evidence plus applicable Article 9 mechanism | MANUAL_LEGAL_GATE HOLD |
| Gmail/mail infrastructure | Sender/email/body/necessary identity/case/export/response; requests occasional, service recurring | Mailbox control/handlers/MFA/security/retention; contractual geography/role and applicable Article 9 evidence | MANUAL_LEGAL_GATE plus mailbox manual HOLD |
| TVMaze | Server query/show ID and operator identity; repeated user-triggered requests | Actual license/attribution/recipient-role/region/log terms and relevant Article 9 assessment/evidence | Active-flow manual/legal HOLD |
| Open Library | Server search/ID/operator identity; conditional repeated requests | Production capability/contact and registration decision; recipient terms/role/geography and applicable transfer evidence | Enabled-flow manual/legal HOLD, or explicitly disable under separate authority |
| Browser-direct CDN/image hosts | Browser IP/UA/referrer/image path; repeated rendering including legacy saved covers | Enumerate actual 05A host/use paths; independent recipient/terms/geography/log review and Article 9 mechanism/alternative processing decision | Independent manual/legal HOLD; disabled metadata API does not remove images |

No EU-region/DPA/SCC/consent assertion automatically satisfies Turkish Article 9. Operator/legal determines applicable mechanism, scope, actual signed/submitted evidence and action; no substitute paperwork created by this task.

VERBIS: confirm actual natural/legal person controller, employee count, applicable-year annual financial balance, actual main activity and whether special-category processing is that main activity, relevant exemption category, current official regulatory thresholds/year and applicability. Retain determination evidence; do not infer exemption from source/app purpose. No registration performed.

Hosted checklist under separate authority: exact Production Supabase/Vercel targets; hosted signup disabled; provider env/capabilities/contact; no unnecessary web service-role/admin Auth credential/fixture/staging variables; AI/research/persistent cache disabled; actual regions/subprocessors; log access/retention settings; backup/restore erase reconciliation; real Supabase Security Advisor review. Source cannot prove hosted values.

Request operator: confirm identity/controller/contact/formal channels; responsible/backup handler; proportional identity/representation verification; original-receipt deadline tracking without automatic reset; lawful scope/other-subject protection; secure export delivery; response/notification evidence; minimal attachments, closure/deletion/legal-hold policy. Mailbox operations/vendor tickets/contracts/VERBIS actions require separate human execution.

## 13. Next step

Close 05F's actual disposable DB/Storage/Auth validation gap; retain independent legal/manual HOLDs. D8-4B stays frozen. No deploy/Production privacy acceptance follows from source/mock tests or migration candidates.

## 14. Final verdict

**V1-HARDENING-05 STILL BLOCKED — PostgreSQL role/concurrency enforcement and the real Auth-service erasure sequence remain LIVE UNVERIFIED.** 05F source implementation/offline proof replaces the previous absence blocker. Master technical acceptance is not claimed; legal/external evidence remains independently open.

## 15. Safety confirmation

No Production access, no Staging mutation, no real personal data read, no real user export/account deletion, no Storage object deletion, no Auth Admin live call. No Article 9 submission, VERBIS action, mailbox/vendor action, provider live request, Vercel env mutation, remote migration, deploy, commit or push. Only read-only GitHub CI metadata and npm runtime advisory metadata were requested over the network; application/provider TCP/UDP is blocked during tests/build.

## Public privacy claim fact check

| Page claim | Class | Evidence / boundary |
| --- | --- | --- |
| Named controller/contact | MANUAL | Literal name/mail exists; actual entity/mail control not independently verified |
| Local-first/optional Cloud categories | VERIFIED | Current source and 05A; browser-only data not server-exportable |
| Auth/profile/social/theme/XP/metadata processing | VERIFIED | Domain source inventory; deployed rows/settings unverified |
| Purposes/methods/recipient groups | CONDITIONAL | Feature and actual hosted configuration dependent |
| Legal bases | MANUAL | Provisional matrix; not selected/approved by code |
| Article 11 nine rights/conditions | VERIFIED | Technical public representation; procedural/legal sufficiency manual |
| Formal applications/contact/30-day handling | MANUAL | Procedure described, channel breadth/operator execution incomplete |
| Provider APIs versus direct images | CONDITIONAL | Disabled APIs do not disable saved cover rendering; actual hosted enablement manual |
| Paid AI/research disabled target | CONDITIONAL | V1 source contract, hosted values not verified |
| Foreign processing/transfer uncertainty | MANUAL | No actual geography/mechanism evidence |
| Partial portable backup/separate themes | VERIFIED | Existing tests/controls; not comprehensive account export |
| Comprehensive account technical scope being verified/operator assistance | VERIFIED | 05C synthetic candidate + exact operational blocker; no self-service/live claim |
| Retention/lifecycle/tombstone/physical deletion distinction | VERIFIED | 05D source TTLs and conservative no-age-purge policy |
| Mailbox/vendor retention not finalized | MANUAL | Uncontrolled/unknown external settings |
| Logout/mock reset not full erase | VERIFIED | Existing local semantics |
| Article 9/VERBIS/legal approval incomplete | MANUAL | Canonical unresolved values unchanged |

No material claim needs REMOVE/REWRITE on the basis of these synthetic-only additions. Page remains conservative; binary/device/vendor/actual lifecycle limitations stay explicit in operator documentation. No public readiness wording is broadened.
