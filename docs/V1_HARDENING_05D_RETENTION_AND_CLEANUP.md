# V1-HARDENING-05D — Retention technical policy and cleanup design

Date: 2026-10-05. Executed after the 05C source/synthetic acceptance checkpoint. 05C's operational erasure blocker remains open; this design does not close it. No age-based user-content deletion, remote cleanup or cron deployment.

`RETENTION_TECHNICAL_POLICY = CLOSED` for source inventory, conservative lifecycle classes and synthetic bounded security cleanup design.

`RETENTION_LEGAL_POLICY = MANUAL_LEGAL_REVIEW`.

`MAILBOX_RETENTION = OPERATOR_POLICY_REQUIRED`.

`LIVE_DISPOSABLE_DB_PROOF = NOT_RUN`.

## Canonical classes and full inventory

`scripts/privacy-retention-ops.mjs` defines USER_CONTROLLED, ACCOUNT_LIFETIME, FEATURE_LIFETIME, SHORT_OPERATIONAL_TTL, SECURITY_TTL, SOFT_DELETE_GRACE, LEGAL_HOLD_OR_REVIEW, VENDOR_CONTROLLED and UNKNOWN. No class implies a statutory day count. SOFT_DELETE_GRACE is reserved for an approved future policy, **not a configured current purge window**.

The canonical machine inventory includes all 36 account-linked public tables, three ownerless public tables, six private limiter tables, private lifecycle/erasure stage and both transaction-only XP context tables, release-write singleton state, browser, recovery, mailbox and vendor boundaries (53 entries). Per-table ownership/FK/embedded reference/classification: [05C dependency inventory](V1_HARDENING_05C_ACCOUNT_EXPORT_ERASURE.md#dependency-inventory). Baseline factual storage and local key families: [05A sections 5–7](V1_HARDENING_05A_PRIVACY_DATA_MAP.md). Those facts were rechecked against migration definitions and listed source constants; no existing rows or device-local data were read.

| Category / exact tables | Current technical class | Physical deletion / policy boundary |
| --- | --- | --- |
| profiles; profile_modules; profile_media_showcase; profile_stats_snapshots; profile_progression_snapshots; profile_shared_notes | ACCOUNT_LIFETIME; public visibility is a feature choice | User/feature changes and approved account lifecycle; snapshots are identifying and not perpetual anonymous aggregates |
| media_items; progress_logs; goals | ACCOUNT_LIFETIME with USER_CONTROLLED individual records | Active notes/progress/calendar metadata never expire by arbitrary age; soft delete is not physical erase |
| user_theme_preferences; social_activity_preferences; social_notification_preferences | ACCOUNT_LIFETIME | User-controlled feature/preferences; approved account erase |
| profile_follows; profile_blocks; social_activity_events; social_activity_comments; social_reactions; social_recommendations; social_recommendation_events; social_recommendation_messages; social_notifications; social_reports | ACCOUNT_LIFETIME; feature lifecycle and report LEGAL_HOLD_OR_REVIEW before real erase | Relationship/thread/dependent participant semantics require approved handling; no automatic text/report purge |
| profile_username_history | ACCOUNT_LIFETIME | Claim/release/reservation state is not an expiry proof; no general age purge implemented |
| cloud_media_sync_operations; goal_sync_operations | ACCOUNT_LIFETIME | Keep account's operation identity/results while replay remains possible; erase with approved account lifecycle |
| xp_events; xp_event_allocations; xp_user_totals; xp_user_world_totals; xp_user_branch_totals; xp_legacy_imports; xp_user_quest_progress; xp_user_badges; xp_media_entitlements; xp_local_state_conversions | ACCOUNT_LIFETIME | Immutable/dedupe/conversion/reward correctness; private XP erasure candidate only, no periodic XP pruning |
| recommendation_feedback | ACCOUNT_LIFETIME | Schema supports prompts/metadata; absence of a current writer does not prove absence of historical records |
| xp_quest_definitions; xp_badge_definitions | FEATURE_LIFETIME | Global non-identifying definitions; referenced definitions not pruned by account tool |
| embedding_cache | UNKNOWN, dormant-v1 LEGAL_HOLD_OR_REVIEW | No owner key; no account guessing or age purge. Determine origin/content/need before a policy-backed legacy cleanup |
| private_rate_limit.buckets | SECURITY_TTL | Expiry eligibility plus bounded physical cleanup; HMAC is pseudonymous, not necessarily anonymous |
| private_rate_limit.request_receipts | SHORT_OPERATIONAL_TTL | Expiry eligibility plus bounded physical cleanup |
| private_rate_limit.policies; capacity; global_state | FEATURE_LIFETIME | Global configuration/counters; no account linkage/purge |
| private_rate_limit.secret_refs | LEGAL_HOLD_OR_REVIEW, ops key lifecycle | Key reference state; not exported or purged by account/retention tool |
| private_privacy_ops.xp_cleanup_context (new candidate) | SHORT_OPERATIONAL_TTL | Exists only within the successful helper transaction; explicitly removed before return, insertion rolled back on failure; no invented day count or scheduled purge |
| Browser media/personal/AI sessions/themes/calendar caches/queues | USER_CONTROLLED | Current key, legacy key, temporary/recovery copy and downloaded export are distinct; logout is not erasure |
| Local recovery/quarantine/import journals | LEGAL_HOLD_OR_REVIEW | Preserve recovery/integrity until policy approves safe scope; no broad browser-storage purge |
| Mail correspondence/verification/delivered exports/closure proof | LEGAL_HOLD_OR_REVIEW | Operator owns mailbox policy/minimization; tool cannot clean Gmail |
| Vercel/Supabase platform logs/backups; Gmail; provider/CDN/recipient copies | VENDOR_CONTROLLED or UNKNOWN | Actual policy/region/contracts not established from code; no invented durations |

## Exact source TTL/window evidence

| Source | Exact value | Logical expiry | Physical deletion |
| --- | --- | --- | --- |
| `lib/api/openlibrary-search-cache.ts` | 5 minutes; bounded Map | Cache entry unusable after expiresAt | Expired Map entries removed on prune/access/write; process lifetime also bounds memory; no user identity storage added |
| `features/calendar/data/release-cache.ts` | 12 hours | Release entry stale; provider horizon 90 days is a query horizon, not retention | Browser entry can remain stored stale until later cache actions/site clear; no promised 12-hour physical purge |
| `lib/social/own-profile-cache.ts` | 4 minutes | Memory/session snapshot validity | Expired entries removed on reads; unopened session keys may persist until session/site actions |
| `lib/social/server.ts` | Signed asset URL 300 seconds; cache 240,000 ms; max 256 entries | Bearer URL and cache validity | Does not delete binary object or instantly revoke recipient/CDN copies |
| `lib/personalization/appearance-cookie.ts` | Max-Age 31,536,000 seconds | Cookie expires subject to refresh/browser behavior | Not deletion of other theme/local storage; other SDK cookies have their own flow-specific contract |
| `lib/api/rate-limit-identity.ts` | 86,400-second identity epoch; previous epoch admitted first 60 seconds | Identity key epoch rotation | Not physical bucket/receipt cleanup |
| `lib/api/distributed-rate-limit.ts` and SQL verify_v1 | Envelope lifetime max 10 seconds; verification clock tolerances separate | Signed request freshness | Not application-content retention |
| Latest reserve alias migration `20261004124000_application_rate_limit_reserve_alias_fix_v1.sql` | Request receipt 60 seconds; bucket 16 minutes; quota window 60 seconds | Receipt/bucket replay/quota eligibility | Physical cleanup via existing helper; inactive target may retain expired rows |
| `20261004120000_application_rate_limit_v1.sql`, cleanup_v1 | Shared max 500 rows per call, buckets first then remaining receipts; next cleanup eligible after 1 minute | Scheduling/eligibility | Bounded physical DELETE and capacity counter update; not an independently deployed scheduler |

The forward/alias migrations replace reserve logic; use the latest effective reserve definition. `cleanup_v1` remains the baseline private implementation. Existing reserve checks `next_cleanup_at` and calls cleanup_v1(500). Traffic-driven cleanup can leave rows on quiet systems or with a backlog. No forced physical maximum retention is established. Logical expiry != physical deletion.

## Tombstone and correctness horizons

media_items/progress_logs/goals deleted_at, profile soft state, activities/comments/messages/notifications, recommendation withdrawal/response lifecycle and username releases are distinct from irreversible erasure. Cloud v2/Goal CAS revisions, operation IDs and retained tombstones reject stale writes. Offline clients/queues/exports can outlive any arbitrary age threshold; source establishes **no finite safe replay horizon** for deleting tombstones or operation/dedupe journals.

Therefore no age purge for Cloud operations, goal operations, XP dedupe, recommendation event/dedupe, username history or active content. Future finite policy requires a proven synchronization epoch/retired-client barrier, replay rejection after that barrier, recoverable migration and policy approval. Account-lifecycle cleanup likewise needs the 05C quiescence/resurrection barrier. Do not use a legal retention approval as a technical replay proof.

## Cleanup tooling and failure semantics

`scripts/privacy-retention-ops.mjs`: inspect / plan / execute / verify, bundled synthetic source only, same fail-closed target contract as account ops. Cutoff preview, eligible counts, batch 1..500 and a **shared** budget across bucket/receipt tables. Default dry-run; execute mode alone stays read-only. Both `--execute` and exact `CLEANUP SYNTHETIC EXPIRED SECURITY` are required. Future cutoffs, malformed expiry, unsupported classes and user-content/other-table state are refused. No Auth operation. Each invocation starts fresh synthetic security fixtures; no live/persistent cleanup journal.

Only expired security state is eligible. No approved operator duration is currently configured for user content, reports, mailbox, tombstones or ledgers; defaults preserve those domains. Existing database cleanup helper must be reused in a future adapter rather than direct deletes which desynchronize `capacity.live_rows`. No new retention SQL helper/migration is justified; existing helper already applies bounded input, private permissions and statement/lock limits. No cron, runtime endpoint, remote apply or scheduler was added.

One batch is a checkpoint: removed count and remaining eligibility are reported; bounded repeated calls are retryable and idempotent. Remaining expired rows mean more work, not a fabricated zero-residual result. Active buckets/receipts persist. Pure synthetic state is copied before mutation, so a validation failure leaves it unchanged. Real SQL atomicity/counters/retry/roles need a separately proven disposable target/adapter; this tool does not verify deployed cleanup.

## Mailbox, vendors and backups

Operator must approve limited authorized access, necessary identity material, timely attachment minimization, secure export delivery, case closure evidence and purpose-based deletion/legal-hold handling. No mailbox automation/access. Exact periods and legal preservation require review. Do not retain identity documents/export attachments merely because an email arrived.

Vercel, Supabase Auth/platform logs/backups, Gmail, TVMaze/Open Library and browser-direct image/CDN hosts may retain requests/copies under unknown vendor conditions. App erasure does not imply instant deletion from vendor backups/disaster recovery, browser caches, user's downloaded exports or other participants' legitimately received copies. Restore runbook must quarantine/reconcile erased accounts before restored data can be served; no restore-ledger integration is claimed here.

## Separate acceptance

Seven focused Node tests PASS (zero skipped/failed/todo): full class coverage, cutoff/count preview, bounded shared budget, confirmation/dry-run, retry/idempotency, active-content refusal and existing SQL expiry/counter contract. Consolidated tests/checks are recorded in 05E.

Technical inventory/design and synthetic security cleanup: CLOSED. Legal retention approval/mailbox/vendor settings: MANUAL. Real cleanup adapter, deploy/scheduler and measured physical retention: NOT IMPLEMENTED / LIVE UNVERIFIED. 05C operational erasure remains blocked, so this phase does not authorize deleting tombstones or closing the master acceptance.

08 source update: `checkRetentionCompleteness` compares migration-created application tables to this machine inventory in repository policy checks. `account_lifecycle`: ACCOUNT_LIFETIME, Auth cascade after verified erasure; `xp_cleanup_context` / `xp_detach_context`: transaction-only SHORT_OPERATIONAL_TTL, explicit delete or rollback; `release_write_state`: FEATURE_LIFETIME operational singleton/revision without account content. No legal retention period or new automatic purge is implied.
