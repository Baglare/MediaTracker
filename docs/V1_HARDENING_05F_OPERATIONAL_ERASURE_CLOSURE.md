# V1-HARDENING-05F — Operational account erasure closure

Date: 2026-10-05. Scope: source, forward migration candidates, synthetic fixtures and offline validation. No migration has been applied by this phase.

**V1-HARDENING-05 STILL BLOCKED — PostgreSQL role/concurrency enforcement and the real Auth-service erasure sequence remain LIVE UNVERIFIED.** Source implementation and offline operation proof are delivered. A successful mocked adapter or SQL text contract is not execution of PostgreSQL, Storage or GoTrue. Production release is not approved.

## Baseline and original race

- Branch `release/v1-hardening`; local HEAD and independently read remote HEAD `2edd8af879bccbad64530abeb5b7c7f891bba0ac`.
- Exact-SHA Actions [CI run 37353642634](https://github.com/Baglare/MediaTracker/actions/runs/37353642634): completed/success.
- Starting dirty files were exclusively the supplied 05C/05D/05E source/docs/tests, XP migration candidate and identity-based CI negative-test repair. They were retained; no unrelated dirty changes were found.
- Workspace/repository/Supabase instructions and structured authority were read. Configured Vault context returned `VAULT_GIT_INVALID`; no broad Vault search, guessed candidate, sync, commit or push.
- `tests/privacy-erasure-race.test.mjs` first reproduced the unfenced 05C interval. The retained test checks the immutable baseline Cloud SECURITY DEFINER INSERT path and models T0 authenticated A → cleanup → same identity INSERT before Auth deletion. **Architectural/model reproduction, not live SQL execution.** Baseline direct Cloud writes, Cloud Media/progress RPCs, Goal RPC, XP and social writes admitted an owner without account-wide erasure state. The original XP-only cleanup context did not quiesce them across systems.

## Canonical DB barrier and reads

`private_privacy_ops.account_lifecycle`: Auth UUID, `ACTIVE` / `ERASURE_PENDING` / `ERASING`, destructive marker and temporary target-scoped erasure context. Existing Auth users are initialized ACTIVE; an Auth insert trigger initializes subsequent users. No normal-role lifecycle table privileges, private-schema privileges or privileged function execute grants.

The volatile helper locks lifecycle rows **FOR SHARE** for the request identity and relevant OLD/NEW owners/participants, sorted within each guard. The privileged transition locks the same row **FOR UPDATE**. It waits for admitted transactions; subsequent writes see the committed state. Older repeatable-read/serializable snapshots must fail on the changed row rather than reuse ACTIVE. Cross-participant transactions may deadlock and be aborted by PostgreSQL; that does not admit locked writes. These are source-backed PostgreSQL semantics; actual wait/serialization/deadlock behavior has not been executed here.

BEFORE STATEMENT and BEFORE ROW triggers guard all application tables independently of RLS, including SECURITY DEFINER RPC side effects. RLS, owner predicates, Cloud CAS/revision/idempotency/tombstones, XP allocations and normal ACTIVE behavior are preserved. Ordinary TRUNCATE privileges are explicitly revoked. Storage JWT mutations have a row guard over exact path ownership. Missing lifecycle rows deny stale JWT writes after Auth deletion; no permanent identifying DELETED orphan is required.

Only a genuine direct postgres session with no Auth identity bypasses application guards. JWT role/custom metadata/GUC unlock flags cannot enable a bypass. GoTrue's `supabase_auth_admin` login may execute **only unauthenticated DELETE statement guards**, to permit empty FK cascades after cleanup; any remaining application row still fails its row guard. This role-specific exception is statically tested but needs real Auth-service execution.

Existing read authorization stays intact in both locked states. Operator inspection/export is allowed. Current ordinary read routes remain read-only. The historical authenticated `social_get_preferences()` RPC still contains default INSERTs: it is classified as DB_GUARDED and cannot silently recreate preferences while locked. No broader read grant was added.

The own-account `public.assert_account_write_allowed()` accepts no target and cannot change state. Profile/assets/relationships use it for HTTP preflight. Trigger checks remain authoritative after preflight. Social, XP, theme and Cloud/Goal adapters map an exact `account_write_locked` code; route responses reveal no target/state/SQL metadata. Other failures preserve existing generic contracts. Asset races can retain cleanup-pending blobs until the locked operator sweep; they cannot recreate profile metadata after admission closes.

## Mutation inventory

Adoption prerequisite: install/verify the ordered DB candidates before enabling the matching route preflights in any separately authorized environment. A missing helper fails closed with `account_write_unavailable`; source checks do not prove compatibility with an unmigrated hosted target.

Reproducible read-only inventory: `node scripts/privacy-mutation-inventory.mjs`. Tests compare every public table created by ordered migrations against the explicit barrier and inspect the latest function bodies/call graph and route write targets. This scanner is supplemental: overload privilege histories and computed RPC names were also checked against source. It does not attest deployed grants.

| Family / exact tables or source | Class / enforcement |
| --- | --- |
| Cloud Media/progress/logs: `media_items`, `progress_logs` | DB_GUARDED; direct writes and both Cloud sync RPCs |
| Cloud ledgers: `cloud_media_sync_operations`, `goal_sync_operations` | DB_GUARDED; ledger writes cannot precede unchecked account mutation |
| Goals: `goals` | DB_GUARDED; `apply_cloud_goal_v1` and direct owner writes |
| Profile: `profiles`, `profile_username_history` | DB_GUARDED; profile routes additionally ROUTE_GUARDED_AND_DB_GUARDED |
| Modules/showcase/stats/progression/notes: `profile_modules`, `profile_media_showcase`, `profile_stats_snapshots`, `profile_progression_snapshots`, `profile_shared_notes` | DB_GUARDED; direct upsert, RPC and derived XP effects |
| Theme: `user_theme_preferences` | DB_GUARDED; save/delete RPC and theme route |
| Follows/blocks: `profile_follows`, `profile_blocks` | DB_GUARDED for both participants; relationship route additionally ROUTE_GUARDED_AND_DB_GUARDED |
| Preferences: `social_activity_preferences`, `social_notification_preferences` | DB_GUARDED; save RPC and legacy read-with-write RPC |
| Activity/comments/reactions: `social_activity_events`, `social_activity_comments`, `social_reactions` | DB_GUARDED; actor, OLD/NEW owners and referenced parents |
| Recommendations: `social_recommendations`, `social_recommendation_events`, `social_recommendation_messages` | DB_GUARDED; sender/recipient, actor/author and container participants |
| Notifications/reports: `social_notifications`, `social_reports` | DB_GUARDED; recipient/actor/reporter and referenced content |
| XP: `xp_events`, `xp_event_allocations`, `xp_user_totals`, `xp_user_world_totals`, `xp_user_branch_totals`, `xp_legacy_imports`, `xp_user_quest_progress`, `xp_user_badges`, `xp_media_entitlements`, `xp_local_state_conversions` | DB_GUARDED; request actor plus beneficiary/event owner; immutable-event guard remains |
| Storage `profile-assets` metadata/upload/overwrite/delete | DB_GUARDED; assets route additionally ROUTE_GUARDED_AND_DB_GUARDED |
| Calendar/account payload in media metadata | DB_GUARDED when hosted in Cloud; browser-only calendar is outside server erasure |
| Device library/goals/history/themes/queues/recovery/outboxes | Device-owned; no hosted mutation bypass. Browser writes/copies cannot be removed remotely. Their Cloud replay is DB_GUARDED |
| Deterministic recommendation/interpret/provider compute without persistence; current read routes | READ_ONLY with respect to account storage; existing policy/auth/rate limits unchanged |
| `recommendation_feedback` | DB_GUARDED including JSON metadata |
| `xp_quest_definitions`, `xp_badge_definitions`; private limiter security pseudonyms | NOT_ACCOUNT_OWNED; no A-owned identity ledger introduced; 05D expiry policy unchanged |
| `embedding_cache`; paid AI/research/new AniList/TMDB/OMDb enablement | DISABLED_V1; public table also guarded defensively; enablement remains post-release |

Mutation RPC families covered: Cloud Media/progress/Goal; theme save/delete; social profile/unified profile, follow/action/block/unblock, showcase/shared notes/preferences, activity/publish/delete, comment/action/reaction/report, recommendation/send/message/transition, notification action; XP sync/badge/title plus nested award/reconcile/quest triggers. No normal application admin-delete endpoint was added.

## Ops adapter and operation order

`scripts/privacy-account-ops.mjs`: inspect/export/erase-plan/erase/verify. Explicit source/target required. Default erase is dry-run; destructive work requires `--execute`, exact UUID confirmation and explicit acknowledgement of dependent participant-container deletion. Export remains an explicit read action; it never starts erasure implicitly.

`scripts/privacy-disposable-adapter.mjs` implements the operational transports: scoped repeatable-read PostgreSQL snapshot/cleanup through Docker psql; paginated recursive Storage listing/removal/verification; hard Auth Admin deletion and subsequent absence verification. SQL relation/column lists are fixed in `privacy-account-sql.mjs`; only validated UUID enters literals. Snapshot output is capped and fails rather than truncating an export. Auth credentials/metadata/passwords/tokens are excluded; binary assets require a separate delivery process.

Only a separately provisioned dedicated local fixture is admitted: exact fixture labels/containers, `privacy_05f_disposable` database and independent marker, one isolated internal Docker network, exact loopback port, local Auth/Storage images and audited Kong upstreams. Loopback alone is insufficient. SDK requests refuse other origins and redirects. There is no production/staging/unknown URL fallback. Ops credentials use only `PRIVACY_DISPOSABLE_SERVICE_ROLE_KEY`; none was read or supplied in this phase.

Provisioning requirements are intentional safety checks, **not evidence that such a stack exists**. `tests/fixtures/privacy-disposable-identity.sql` is fixture-only, not a migration or permission to execute against another database. No dependency installation, stack provisioning or Docker build occurred.

1. Resolve unique exact UUID/email and inspect target/plan.
2. Commit ERASURE_PENDING; capture target-scoped provenance; probe denial through authenticated role with the same UUID.
3. Export may be requested separately while pending, before destructive work.
4. Commit ERASING; transactionally mark destructive work, detach participant provenance, clean application/XP rows in dependency order.
5. Remove exact owned Storage paths; verify metadata and recursive API listing.
6. Verify application/participant residuals and active write barrier.
7. Delete Auth **last**; verify Auth absence and final residuals. Lifecycle/context cascade away; stale JWT admission still fails on missing row.

No fake cross-system transaction. Failure reports the exact failed stage, retries safely, and never automatically unlocks. Private `last_completed_stage`/`failed_stage` fields make interrupted operation state available through inspect; they cascade away after Auth deletion. If DB stage reporting itself fails, the returned report retains the exact failure rather than claiming a persisted record. Lock retention is reported only after checking it. If admission itself fails, no destructive stage starts. A privileged deliberate abort is available only in ERASURE_PENDING before destructive work: `private_privacy_ops.transition_account_v1(target_uuid,'ACTIVE','PRIVACY '||target_uuid::text)` from a genuine postgres/no-JWT session. ERASING/partial deletion cannot be unlocked through this procedure.

## Shared/participant policy and JSON

| Record | Decision |
| --- | --- |
| A private/profile/library/progress/goals/themes/feedback/XP/ledgers/preferences | DELETE |
| A↔B follows/blocks | DELETE |
| A-authored activity/comments/reactions/notes/messages | DELETE |
| B replies to an A comment on B's surviving activity | DETACH parent; preserve B author/body unless it contains captured A identifiers, then ANONYMIZE body to generic application text with explicit plan acknowledgement. Forward FK changes parent deletion to SET NULL |
| Content dependent on A's deleted activity or A↔B recommendation container | DELETE children/container; explicit plan reports participant loss; B independent library/Auth/assets remain |
| Notifications to A, by A, or referencing erased containers/typed A actor payload | DELETE; no stale entity/payload/dedupe provenance retained |
| Reports by A or about erased A content | DELETE. B's unrelated reports survive; no invented legal/moderation retention |
| B automatic activity derived from erased recommendation | DETACH source/dedupe, remove attributed snapshot/text; preserve B-owned event |
| B earned XP linked to erased recommendation/messages | RETAIN_NON_IDENTIFYING: scrub source/dedupe/metadata; preserve awards/effect/time/trust/allocations/totals. Preserve independent media canonical keys; fallback participant keys become B-owned grouping keys so quest grouping does not inflate |

All A-owned JSON/text disappears with its row. Known participant snapshots/provenance are explicitly deleted or scrubbed, including UUID, actor metadata, username/display/avatar fields, entity IDs, nested payload and recommendation source IDs. Verification uses target ownership/FK scopes plus pre-cleanup context IDs and typed notification/XP fields. Captured surviving reply IDs restrict text checks to replies attached to A's erased comments; known A attribution there is anonymized and rechecked after detachment. It does not globally inspect arbitrary unrelated B-authored free text. Unknown fixture residual UUID references fail closed. These are application-schema guarantees, not deletion of recipient downloads, browser queues, backups or vendor logs.

## XP, Storage and retention

Previous `20261005120000_privacy_xp_ops_cleanup.sql` remains byte-identical to the supplied candidate; tracked historical migrations remain unchanged. Target-bound backend/transaction context permits privileged XP DELETE only; normal immutable behavior stays. Cross-owner XP RESTRICT dependencies abort. New participant detachment allows only exact context-bound provenance UPDATE, with every other event field unchanged; no anon/auth/service-role transition/cleanup execute grant.

Cleanup deletes showcase/review inputs, explicitly flushes their existing deferred reconciliation constraint triggers, and only then erases A's XP. This prevents an end-of-transaction reversal/entitlement trigger from recreating XP after cleanup. No trigger is disabled; actual PostgreSQL deferred-trigger behavior remains part of the execution gate.

Assets require exact first path component UUID, `profile-assets`, safe segments and matching owner metadata. Traversal, encoded separators, backslashes, sibling/substring prefixes and B assets are rejected. Missing objects/already absent rows are harmless; API/metadata verification must both finish before Auth deletion.

05D's retention classes/TTLs remain. No automatic scheduler, new period, tombstone age purge or unlock job. Lifecycle/context follows Auth cascade; temporary XP contexts are transaction-scoped and removed on success/rollback. Interrupted accounts stay locked until controlled completion or the permitted pre-destruction abort. External backup/restore erase reconciliation remains manual.

## Validation and remaining proof

Source and mocked adapter proof cover admission, same identity after lock, all 36 account families, B isolation, permission/search_path/order contracts, historical immutability, export isolation, shared JSON/text cleanup, XP/Storage isolation, Auth-last, failure/retry, residual checks, privacy facts, retention and ops import separation.

| Final candidate check | Result / limits |
| --- | --- |
| Targeted Node lifecycle/security/migration/retention | PASS: 39 tests, zero skips |
| Full offline Vitest | PASS: 202 files / 2,961 tests; 18 existing live files / 56 tests SKIP; no new skip/todo/only |
| Type generation and separate typecheck | PASS; incremental writes disabled for typecheck |
| Source lint | PASS: zero errors; one existing recommendation-composer navigation warning |
| Credential-free offline Next production build | PASS; existing annotation filesystem tracing warnings and workspace-root warning remain |
| Runtime npm audit | PASS: zero vulnerabilities, High/Critical = 0 |
| CI helper tests / repository policy | PASS: 40 helper tests; migration ordering, hygiene, test integrity, credential/import boundaries |
| Migration permissions/search_path/history | PASS source contracts; historical tracked SQL and supplied 120000 candidate preserved; SQL NOT EXECUTED |
| Secret scan and test skip/todo/only scan | PASS repository policy and untracked source checks; no test integrity weakening |
| Ops runtime separation | PASS source graph and 51 built trace manifests; no privacy ops script, private env file or ops credential/Admin helper in compiled browser/server JS |
| Diff whitespace | PASS tracked and all 22 untracked candidate files |
| Browser / live DB / Storage / Auth | NOT RUN; no live safety target established |

Validation ran against an allowlisted source copy with credential variables removed and the existing offline guard enabled. Exact-SHA remote CI above belongs to the baseline; these uncommitted candidates have local validation only. The final script-only participant-attribution change was rerun through full Vitest and source lint; runtime source did not change after the successful typecheck/build.

## Files changed by 05F

- Runtime helper/contracts: `lib/api/account-write-barrier.ts`, `lib/supabase/safe-error.ts`, `lib/supabase/types.ts`, `lib/social/route-response.ts`, `lib/cloud-media-v2-client.ts`, `features/goals/cloud/client.ts`.
- Existing mutation routes: `app/api/social/assets/route.ts`, `app/api/social/profile/route.ts`, `app/api/social/relationships/route.ts`, `app/api/xp/route.ts`, `app/api/personalization/themes/sync/route.ts`; narrow ops tracing exclusion in `next.config.ts`.
- Ops source: `scripts/privacy-account-model.mjs`, `scripts/privacy-account-ops.mjs`, `scripts/privacy-account-sql.mjs`, `scripts/privacy-disposable-adapter.mjs`, `scripts/privacy-mutation-inventory.mjs`, `scripts/privacy-synthetic-fixture.mjs`.
- Forward candidates: `20261005130000_account_privacy_write_barrier.sql`, `20261005140000_privacy_participant_detachment.sql` under `supabase/migrations/`.
- Tests/fixture: `tests/privacy-erasure-race.test.mjs`, `tests/privacy-write-barrier.test.mjs`, `tests/v1-hardening-05f-barrier.test.ts`, `tests/privacy-account-ops.test.mjs`, `tests/v1-hardening-05-lifecycle.test.ts`, `tests/fixtures/privacy-disposable-identity.sql`.
- Gate documentation: this file and `docs/V1_HARDENING_05E_PRIVACY_RELEASE_GATE.md`. Supplied 05C/05D documents, retention scripts/tests, 120000 XP candidate and CI negative-test identity repair remain in the working tree; they were not replaced by unrelated work.

`LIVE_DISPOSABLE_DB_PROOF = NOT_RUN`: Docker daemon was unavailable; no positively safe stack/project was established. No database connection or SQL migration execution occurred. Remaining essential proof: apply candidates on that isolated stack; verify actual grants, helper/trigger existence, A active writes and stale-identity denial through every DB family, in-flight transaction/lock ordering and repeatable-read behavior, B continuity, XP participant invariants, real Storage list/remove/verify, GoTrue empty cascade behavior and Auth-last absence/idempotency. This gap is not a request to use Staging/Production.

Build tracing discovered that existing development annotation filesystem access included unused ops scripts in its server file manifest. The narrow `next.config.ts` trace exclusion removes only `scripts/privacy-*.mjs`; no lint rule, assertion, API authority or runtime privilege was relaxed. Installed Next output-tracing guidance was read. Final manifests and compiled browser/server code are checked separately from the source import graph.

`/privacy` remains unchanged: it correctly says account technical scope is being verified/operator-assisted. No claim that vendor copies, browser copies or backups are instantly erased; Article 9/VERBIS/legal approval is not asserted.

## Current gates and safety

- `ACCOUNT_WRITE_BARRIER = SOURCE_SYNTHETIC_PASS / LIVE_UNVERIFIED`
- `ACCOUNT_EXPORT_TECHNICAL_PROOF = SOURCE_SYNTHETIC_PASS / LIVE_UNVERIFIED`
- `ACCOUNT_ERASURE_TECHNICAL_PROOF = BLOCKED_VALIDATION`
- `SHARED_CONTENT_ERASURE_POLICY = CLOSED` (implementation source/offline scope)
- `RETENTION_TECHNICAL_POLICY = CLOSED` (05D design/source scope)
- `ARTICLE_9_MECHANISM = MANUAL_LEGAL_GATE`; `VERBIS_STATUS = MANUAL_OPERATOR_CONFIRMATION`.
- `LEGAL_BASIS_MATRIX = PROVISIONAL_PENDING_LEGAL_REVIEW`; `RETENTION_LEGAL_POLICY = MANUAL_LEGAL_REVIEW`.
- Mailbox, request handling/delivery, vendor/DPA/regions, active providers/direct images, hosted signup/env/logging, backup/restore, Production targets/Advisor/change window remain independent manual/external gates in 05E/D8.

No Production access; no Staging mutation; no real personal-data read/export/deletion; no live Storage/Auth Admin action; no remote DB mutation; no mailbox/vendor/legal submission/VERBIS action; no deploy, env mutation, commit or push. GitHub CI/ref and npm advisory reads were the only task network metadata checks. Test/build subprocesses use a credential-free source snapshot and offline network guard. No Vault write was attempted.
