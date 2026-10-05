# V1-HARDENING-07 — Final source gap and security sweep

Date: 2026-10-06, Europe/Istanbul. **AUDIT ONLY.** Final verdict: **SOURCE_REMEDIATION_REQUIRED**.

One confirmed HIGH privacy source defect requires repair before RC. A known cutover containment gap has a concrete Auth initialization race. Two MEDIUM resource-boundary gaps and two LOW documentation/inventory gaps remain. No new cross-owner authorization bypass or independently justified RELEASE_BLOCKER was established. Passing source tests does not establish Production readiness.

Only this new report is an intended repository change. No existing source, tests, SQL, workflow, package, configuration or canonical document was edited. Findings below are recommendations for the separately authorized remediation phase.

## 1. Baseline and evidence boundaries

| Item | Current evidence |
| --- | --- |
| Branch | `release/v1-hardening` |
| HEAD | `47a22b82dc6618f43032bbc90dfe4e3efe2dd62d` |
| Initial tree/index | CLEAN; porcelain output empty; no unexpected dirty-tree continuation |
| Local upstream | `origin/release/v1-hardening`, same SHA; no fetch or remote-ref assertion |
| Exact-HEAD CI | User supplied PASS / run `37382240713`; **LIVE UNVERIFIED by this audit**, because no GitHub API was accessed |
| Runtime | Node `24.14.0`, npm `11.19.1`; manifest/lock require Node 24.x |
| Packages | Lock v3; 524 lock entries; Next/eslint-config-next `16.3.8`; React/ReactDOM `19.2.4`; Next peer range accepts React 19 |
| Migrations | **25** unique valid timestamped SQL files, ordered from `20260721100000` through `20261005140000` |
| Tracked tree | **1,107** files; signature scan read 1,099 text files and excluded eight binary files from text matching |
| Current release authority | `V1_HARDENING_06D_RELEASE_OPERATIONS.md`, `V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md`, 06 migration/env JSON contracts |
| Earlier claims | 01/01B, 02A/B/C/D, 03, 04B.1–4, 05A–F, 06A–E inspected as claims; historical D8 banners are not live/executable authority |

Instructions read: workspace/root AGENTS; Supabase and research AGENTS; `.ai/project.md`, `.ai/automation.json`, relevant routing map. No Vault write/sync, configuration repair, desktop/browser setup or external account interaction was performed. Security source review included independent read-only SQL/privacy, web-boundary and ops/local reviewers, with parent validation of reported candidates. Worker capacity was three; a skill preflight warning about a larger suggested capacity did not imply missing running workers or a failed source check.

Validation used an ignored, credential-free source archive of the exact HEAD with a clean `npm ci`. Application/fixture environment variables were removed from test/build processes; the existing `ci-offline.mjs` denied external Node TCP/UDP. Literal loopback/IPC remained available for build workers. The only network activity was the specifically requested npm package/advisory/upstream-version verification; **no application, GitHub, Vercel, Supabase, provider or vendor API** was accessed. This distinction qualifies any shorthand “no remote APIs” statement.

The archive uses Git blob LF bytes; 92 files differ from the original Windows checkout only by EOL. Comparison of all 1,107 files found **zero non-EOL source changes** after tools ran. Original Git tree/index remained clean before this report was written. Generated validation outputs are not source changes or deliverables.

## 2. Counts and prioritization

There are **13 classified records**: six source/document findings, six known gate records, one accepted exception. Reviewed/rejected concerns are separately listed and not counted as defects.

| Severity | Count |
| --- | ---: |
| RELEASE_BLOCKER | 0 |
| HIGH | 2 |
| MEDIUM | 2 |
| LOW | 2 |
| INFO | 7 |

| State | Count |
| --- | ---: |
| SOURCE_DEFECT | 1 |
| SOURCE_GAP | 3 |
| DOC_DRIFT | 2 |
| BLOCKED_ENVIRONMENT | 2 |
| LIVE_VALIDATION_REQUIRED | 1 |
| MANUAL_LEGAL_GATE | 1 |
| MANUAL_EXTERNAL_GATE | 2 |
| ACCEPTED_EXCEPTION | 1 |

### A. True release blockers

No newly established `RELEASE_BLOCKER` source finding. Existing release gates still prohibit cutover. This is neither approval to ship nor evidence that the HIGH defects can be ignored.

### B. HIGH — before RC

#### V1-GAP-001 — participant activity detachment violates the existing SQL CHECK

- **Severity:** HIGH. **State:** SOURCE_DEFECT. **Area:** Privacy / schema integrity. **Release impact:** FIX_BEFORE_RC.
- **Evidence:** `scripts/privacy-account-sql.mjs:81–84`, `cleanupSql`, replaces a surviving other-user activity snapshot with only `title` and `mediaType`. `supabase/migrations/20260721130000_social_interactions_recommendations.sql:65–72`, `social_activity_media_safe_check`, requires `canonicalKey` length 3–260. No later migration removes that constraint. The same migration's recommendation completion path produces the retained activity with a `recommendation:<id>` source (`:595–599`). The synthetic cleanup mirrors the incomplete snapshot at `scripts/privacy-account-model.mjs:306`.
- **Why it matters:** erasing A when B has a surviving recommendation-derived activity reaches this UPDATE; absent `canonicalKey` becomes length zero and fails the CHECK. The application cleanup transaction rolls back, leaving erasure unable to complete for a normal supported participant case. This is a deterministic static schema contradiction, **not a PostgreSQL execution reproduced here**.
- **Current mitigation:** Auth-last, residual verification and retained lifecycle lock prevent false completion or deleting Auth ahead of failed cleanup. Destructive tooling is fenced to the disposable environment; actual erasure proof was already held. No cross-user content disclosure or loss was demonstrated.
- **Test limitation:** `tests/privacy-write-barrier.test.mjs:152–183` checks SQL/order strings and routes the operational harness into the synthetic adapter. It does not execute PostgreSQL constraints. Its PASS therefore cannot support the 05F shared-content closure claim for this case. This is part of the same root cause, not a duplicate TEST_GAP finding.
- **Minimal remediation:** produce a bounded, non-identifying canonical key accepted by the existing schema while preserving B's participant policy; align synthetic semantics; test this exact retained B activity through real disposable PostgreSQL cleanup and rollback/retry. Do not weaken the CHECK or delete B's surviving activity to hide the mismatch.

#### V1-GAP-002 — Cloud maintenance does not contain all cutover writes

- **Severity:** HIGH. **State:** SOURCE_GAP. **Area:** Operations / migration concurrency. **Release impact:** MANUAL_GATE; containment must close before cutover. Known open item, now supported by source evidence.
- **Evidence:** `lib/cloud-rollout.ts:100–114` is Cloud Media maintenance only. `features/goals/cloud/rollout.ts:32–35` has no corresponding maintenance input. Profile/social/XP/theme/Storage operations and direct Supabase RPC clients do not share that switch. `20261005130000_account_privacy_write_barrier.sql:14` backfills `account_lifecycle` before installing the Auth INSERT trigger at `:23–24`; no Auth write lock precedes the backfill. Missing lifecycle is denied at `:31–36`.
- **Why it matters:** an Auth account created and committed after the backfill snapshot but before trigger installation can miss both initialization paths and then be permanently denied normal writes. UI signup absence does not stop operator/invite/managed Auth creation. Cloud-only maintenance also does not prove backup/cutover quiescence for other account data families.
- **Current mitigation:** `06D`/`06E` explicitly hold full affected-write containment; Production remains frozen. D2C1's media/progress constraint switch takes `ACCESS EXCLUSIVE` locks (`20260728120000_owner_scoped_primary_key_enforcement.sql:163–165`); that protects its transactional DDL and is not proof of an Auth or all-family freeze.
- **Evidence-based decision:** **B for the demonstrated migration race:** at least Auth creation requires containment during lifecycle initialization. **C is the existing operational requirement for the complete backup/migration/cutover window:** contain all affected account-backed writes, including Auth, direct RPC/table clients, Media, Goals, profile/social/XP, themes, Storage and privacy operations. The source does not prove a universal database race in every family; do not infer one from the policy. Guest local-only work and unrelated provider reads need not be frozen.
- **Minimal remediation:** separately design and prove reversible DB/platform containment that covers old clients and managed Auth, or close the specific Auth initialization race with a reviewed forward repair and prove the remaining cutover quiescence contract. Preserve applied-history migrations. Reopen only after barrier/ledger/owner/privacy postchecks; the Media flag alone is insufficient.

### C. MEDIUM — preferably before RC

#### V1-GAP-003 — input byte limits do not bound pre-parse consumption

- **Severity:** MEDIUM. **State:** SOURCE_GAP. **Area:** Input / abuse. **Release impact:** FIX_BEFORE_RC.
- **Evidence:** `lib/api/request-security.ts:61–90`, `readStrictJsonObject`, consumes `request.text()` before measuring actual bytes; Content-Length is only an early hint. TVMaze search calls it before distributed admission (`app/api/tvmaze/search/route.ts`, POST). AI interpret uses the same reader before admission. `lib/social/route-response.ts:22–23` consumes unrestricted `request.json()`; additional direct JSON readers are in social profile/relationships, XP and theme sync. Assets calls `request.formData()` before checking the uploaded file size (`app/api/social/assets/route.ts:31`).
- **Why it matters:** missing/misleading length or an oversized streamed body can allocate memory before the 4 KiB/1 MiB/domain limits reject it. Mutation readers can also parse irrelevant oversized fields. Request-count limits are not byte limits; public strict-parser work can precede admission.
- **Current mitigation:** content type/declared-size/domain checks, authentication and Origin for cookie mutations, admission on mutation/provider paths, and eventual rejection. Actual hosted ingress body/time limits are **LIVE UNVERIFIED**. No measured hosted exhaustion attack is claimed; 02A already acknowledges preserved legacy parsers.
- **Minimal remediation:** bounded stream consumption with route-specific byte/time limits, cancel on overflow, preserve stable client errors and field/domain validation; include no-length, misleading-length and chunked-overflow tests. Keep multipart limits effective before whole-payload allocation, using supported platform/framework controls where necessary.

#### V1-GAP-004 — provider timeout ends at headers; body bytes remain unbounded

- **Severity:** MEDIUM. **State:** SOURCE_GAP. **Area:** Provider / resource reliability. **Release impact:** FIX_BEFORE_RC.
- **Evidence:** `lib/api/request-security.ts:151–166`, `fetchWithTimeout`, clears its timer when `fetch()` returns headers. TVMaze search/details and Open Library search parse JSON afterward. `app/api/calendar/tvmaze/route.ts:71` also lacks a response byte bound, but its independent `AbortSignal.timeout` remains active: Calendar is **not** an example of the cleared-timer defect.
- **Why it matters:** a slow or oversized supplier body can hold the request beyond the nominal eight-second timeout or allocate excessive memory. The source URL is fixed/encoded, so this requires supplier/transport behavior; it is not an attacker-controlled arbitrary URL or a confirmed SSRF path.
- **Current mitigation:** trusted fixed provider hosts, distributed reservations/cooldowns and sanitized failures. Research has a separate bounded, pinned-DNS transport; do not generalize this defect to that implementation.
- **Minimal remediation:** keep deadline/cancellation active through a bounded response read; validate before JSON parsing; add slow-body, oversized-body and abort tests. Preserve existing response contracts and provider backoff.

### D. LOW / cleanup

#### V1-GAP-005 — retention inventory omits later private lifecycle/context tables

- **Severity:** LOW. **State:** DOC_DRIFT. **Area:** Privacy inventory. **Release impact:** CAN_DEFER_POST_RELEASE, provided release review does not rely on the incomplete inventory as exhaustive.
- **Evidence:** `docs/V1_HARDENING_05D_RETENTION_AND_CLEANUP.md:17` calls the 50-entry inventory complete. `scripts/privacy-retention-ops.mjs:8–25` includes `xp_cleanup_context` but omits `private_privacy_ops.account_lifecycle` (`20261005130000:3–10`) and `xp_detach_context` (`20261005140000:7–12`).
- **Why it matters:** identifying lifecycle/erasure-context/stage data and temporary event/canonical references are missing from the declared retention map.
- **Current mitigation:** no user-content age purge; bounded cleanup touches only expired limiter rows. Detachment context is transaction-scoped; lifecycle follows controlled completion/Auth cascade. No destructive retention bypass was established.
- **Minimal remediation:** extend the existing machine inventory and canonical classes/count; add a current-private-table completeness check. Do not invent legal periods or a second retention system.

#### V1-GAP-006 — README still directs operational readers to historical authority

- **Severity:** LOW. **State:** DOC_DRIFT. **Area:** Repository / release documentation. **Release impact:** CAN_DEFER_POST_RELEASE; use 06D/06E for current execution planning.
- **Evidence:** `README.md:23,265` retains unqualified Production D2B ledger statements; `:228` points to the historical D8 env matrix; `:265` links the old cutover document. Its AI key/env examples at `:243–244` are not the hosted-v1 allowed environment contract.
- **Why it matters:** readers can mistake older hosted facts/configuration guidance for current acceptance, although this audit cannot confirm any live ledger.
- **Current mitigation:** README explicitly says Production is unverified; historical D8 banners point to 06D/06E and freeze execution. No unrestricted executable authority was recovered.
- **Minimal remediation:** point current env/ops authority to 06D/06E and label old hosted facts as historical. No README rewrite was performed.

### E. Live validation and environment gates

#### V1-GAP-007 — disposable privacy execution proof remains absent

- **Severity:** INFO. **State:** BLOCKED_ENVIRONMENT. **Area:** Privacy validation. **Release impact:** MANUAL_GATE.
- **Evidence:** 05F and 06E hold real disposable DB/Auth/Storage proof. Current tests use synthetic adapters/string contracts; no database was connected in this audit.
- **Why it matters:** actual ACLs, stale-JWT denial, row locks/races, deferred XP constraints, participant cleanup, Storage list/remove/verify and Auth-last must execute together. V1-GAP-001 shows why source mocks are insufficient.
- **Current mitigation:** fail-closed fixture proof, explicit execution/identity/participant-loss confirmations, retained locks, no substitute target.
- **Remediation:** independently provision the named safe disposable environment; apply ordered migrations and prove active A/B controls, pending/erasing denial, failures/retries/residuals and other-user continuity after source repair. **LIVE_DISPOSABLE_DB_PROOF remains BLOCKED_ENVIRONMENT.** The prior Docker failure is historical; this audit did not recheck daemon availability or claim a current daemon failure.

#### V1-GAP-008 — restore rehearsal/full recovery capability remain unproven

- **Severity:** INFO. **State:** BLOCKED_ENVIRONMENT. **Area:** Recovery. **Release impact:** MANUAL_GATE.
- **Evidence:** 06A/06E; `scripts/ops/recovery.mjs` and `disposable-dr.mjs`; the passing suite uses synthetic PGDMP bytes and mocked transports.
- **Why it matters:** archive integrity and mocked restore ordering do not prove real PostgreSQL restore, managed Auth/roles/Vault, Storage binaries, vendor configuration or erased-person reconciliation.
- **Current mitigation:** positive local fixture fingerprints, AES-GCM, independent manifest pin, empty-target prerequisites, stop-on-error section order, quarantine. DB-only success explicitly remains `LIVE_UNVERIFIED` for full DR.
- **Remediation:** authorized disposable DB rehearsal plus separately proven Auth/Storage recovery and erasure reconciliation. No actual backup, restore or Docker DB operation was performed. Existing environmental gate remains open; no live claim was upgraded.

#### V1-GAP-009 — fresh hosted release acceptance is still required

- **Severity:** INFO. **State:** LIVE_VALIDATION_REQUIRED. **Area:** Release / security. **Release impact:** MANUAL_GATE.
- **Evidence:** 06D/06E, current CI workflow, provider/limiter/auth source. Exact-HEAD CI run is supplied, not fetched by this audit.
- **Why it matters:** source cannot prove deployed runtime/config, exact Vercel/Supabase targets/ledger, signup deny, anonymous Auth, nonce hydration, ingress identity, Vault signing audience/rotation, limiter capacity/concurrency/cleanup scheduling, platform logs, current Advisor, backup capability or hosted owner/asset smoke.
- **Current mitigation:** immutable-SHA acceptance plan, fail-closed policy, isolated env contracts and frozen cutover.
- **Remediation:** separately authorize exact-SHA CI verification, fresh Preview acceptance, fresh Staging acceptance, Production read-only preflight/Advisor and bounded synthetic browser smoke. No such environment was accessed here. `supabase/config.toml` has local Auth/email signup enabled and anonymous sign-in disabled; it is not evidence of hosted signup closure. UI absence alone does not close the hosted deny gate.

### F. Manual / legal / external gates

#### V1-GAP-010 — legal/operator approval remains provisional

- **Severity:** INFO. **State:** MANUAL_LEGAL_GATE. **Area:** Privacy / provider disclosures. **Release impact:** MANUAL_GATE.
- **Evidence:** 05B/05E and 06E explicitly retain Article 9, VERBIS determination, provisional legal bases/Article 10, retention and TVMaze ShareAlike interpretation.
- **Why it matters:** technical representations do not establish lawful transfer mechanisms, exemptions, finalized bases, periods or transformed/persisted metadata licensing.
- **Current mitigation:** notice identifies partial/unverified capabilities, makes no automatic compliance claim, and limits dormant features.
- **Remediation:** obtain actual controller/operator and legal review, recipient/transfer mechanism and retention/recovery decisions; retain TVMaze legal interpretation. No legal opinion, new legal research, filing, mailbox contact or vendor submission was performed.

#### V1-GAP-011 — external operation/registration evidence remains absent

- **Severity:** INFO. **State:** MANUAL_EXTERNAL_GATE. **Area:** Operations / providers. **Release impact:** MANUAL_GATE.
- **Evidence:** 06E rows for mailbox, vendor/DPA/regions, Open Library registration, platform access/log retention and env review.
- **Why it matters:** syntactically valid provider UA is not registration or contact ownership; source logger is not vendor retention/access proof; documented request delivery is not an operating secured mailbox.
- **Current mitigation:** Open Library is disabled without valid UA; existing operations remain manually gated; no invented vendor capability or contact assurance.
- **Remediation:** actual Open Library registration if enabling it, or keep it disabled; secured request channel/operator proof; account-specific vendor/DPA/regions/access/retention evidence; independently reviewed final env/targets/change window. AniList/TMDB/AI/admin future enablement remains POST_RELEASE_GATE, not a v1 enablement prerequisite.

#### V1-GAP-012 — final immutable RC and cutover authority do not exist

- **Severity:** INFO. **State:** MANUAL_EXTERNAL_GATE. **Area:** Release acceptance. **Release impact:** MANUAL_GATE.
- **Evidence:** 06E Final immutable RC and Production cutover rows remain held; current HEAD is the audit baseline, not an accepted new RC.
- **Why it matters:** local PASS does not authorize branch publication, tagging, migration, deployment, promotion or Production cutover.
- **Current mitigation:** no source publication or external mutation; report-only task.
- **Remediation:** complete narrow remediation and required proof, then user publication of a clean candidate and independently accepted exact-SHA CI/artifact/live/manual gates. Obtain separate named Production targets/change-window/backup/rollback acceptance before cutover.

### G. Accepted exception

#### V1-GAP-013 — narrowly bounded dev-only braces exception remains current

- **Severity:** INFO. **State:** ACCEPTED_EXCEPTION. **Area:** Supply chain. **Release impact:** CAN_DEFER_POST_RELEASE until expiry/review trigger; this is not a fix.
- **Evidence:** `scripts/ci-audit.mjs`, `verifyAudit` and `verifyUpstreamVersion`; current registry verification passed. Exact chain: `eslint-config-next@16.3.8 → @next/eslint-plugin-next@16.3.8 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`. Advisory `GHSA-vfj7-8cjw-p6xm`, five inherited High entries, zero Critical.
- **Why it matters:** tooling can still encounter recursive brace parsing; five entries represent one accepted advisory chain, not five production bugs.
- **Current mitigation:** every locked package is dev-only with the reviewed single-parent/version/node graph; runtime static/dynamic imports of the chain are forbidden by policy; production audit is zero; unknown/new/fixable/expired scope fails verification.
- **Remediation:** review no later than **2026-11-03 UTC**, inclusive expiry in code. A newer upstream patch/changed advisory chain requires review; registry latest checked by the verifier remained `3.0.3`. No dependency upgrade, downgrade, force remediation or exception renewal was performed.

### H. Reviewed and rejected concerns

| Concern | State / source counterevidence |
| --- | --- |
| Cross-owner RLS / public write grants | FALSE_POSITIVE in reviewed paths: ownership/RPC checks, revoked direct writes and lifecycle OLD/NEW/participant guards; intentional read-only definition policies are not broad writes |
| Old JWT bypasses erasure barrier | FALSE_POSITIVE at source: lifecycle lookup/row locks and missing/inactive-row denial, not client JWT freshness; real DB race proof remains V1-GAP-007 |
| AniList/TMDB env or token enables v1 calls | FALSE_POSITIVE: unconditional capability disable before upstream; no live-test enablement bypass found |
| OMDb becomes an alternate public fallback | FALSE_POSITIVE: policy disables new search/details; normalized stored records are compatibility only |
| Every POST without mandatory Origin is CSRF | FALSE_POSITIVE: deterministic/read-only search/people POSTs are not cookie mutations; actual cookie writes use the strict helper |
| Mock limiter admission helper is a runtime bypass | FALSE_POSITIVE: test-only fixture; actual denial/identity/transport suites remain separate; mocks are not DB/ingress proof |
| Prefetch header supplies a forged CSP nonce | FALSE_POSITIVE: proxy overwrites caller CSP/nonces, prefetch/RSC fails closed to script-src none; normal documents receive a fresh nonce |
| All `.ai` files are disposable/private agent state | FALSE_POSITIVE: three tracked files are intentional manifest/routing/tooling; local operational state is separately ignored |
| Disabled-provider image hosts enable metadata APIs | FALSE_POSITIVE: stored cover/CDN compatibility and metadata gate are distinct; browser image requests still need disclosure |
| Restored DB verification implies complete DR | FALSE_POSITIVE as a claim: tooling explicitly excludes managed Auth/Storage/Vault/vendor and reconciliation proof |

## 3. Source security architecture and SQL inventory

Protected assets: owner-local library/queues, authenticated account data and profile visibility, social participant messages, immutable XP/ledgers, private limiter keys/state, erasure contexts and privileged ops. Trust boundaries: browser/local state → server verified identity → RPC/RLS/DB lifecycle; provider results → bounded transforms/UI; operator CLI → independently identified disposable transports. Client flags, editable metadata and caller owner IDs do not supply admin/owner authority in reviewed paths.

### Tables: all 48 source-created application tables

All 39 public and nine private tables have RLS enabled in ordered migration source. Policy presence is not a live catalog assertion. Public account-linked count is 36; three ownerless tables are separately classified. The effective grants, including later revokes, matter more than earlier policies.

`S/I/U/D` below describe authenticated direct table rights after the migration chain; RPC-only means direct DML is revoked or not admitted, while listed functions/internal triggers may write after their own checks. No anonymous account-table DML was found. Public account projections occur through visibility-controlled functions, not blanket table SELECT.

| Public tables / owner | Authenticated direct access and mutation contract | Anonymous / public projection |
| --- | --- | --- |
| profiles / id | Own S; column-limited U for avatar/banner; profile identity/presentation RPCs | Visibility projection RPC; asset predicate |
| media_items, progress_logs / user_id | Own S; direct I/U/D revoked; revision/idempotency/tombstone RPCs | No account-table access |
| recommendation_feedback / user_id | Own S/I/U/D, lifecycle guarded | No account-table access |
| profile_modules, profile_media_showcase, profile_stats_snapshots, profile_progression_snapshots / user_id | Own policies for S/I/U/D, lifecycle guarded | Visibility projection RPCs |
| profile_shared_notes / user_id | Own policy; direct mutation revoked; share/unshare RPCs | Confirmed visibility projection |
| profile_username_history / user_id | Own S; identity RPC/internal writes | No raw history access |
| profile_follows / follower_id, following_id | Participant S; follow/action RPC writes | Visibility-scoped connections RPC |
| profile_blocks / blocker_id | Blocker-only S; block/unblock RPC | No raw graph access |
| social_activity_preferences, social_notification_preferences / user_id | Own S/I/U/D policies; lifecycle guarded | No account-table access |
| social_activity_events / actor_id; social_activity_comments / author_id; social_reactions / user_id | Visibility/own reads; direct writes revoked; social RPCs | Visibility-scoped profile activity |
| social_recommendations / sender_id,recipient_id | Participant S; recommendation RPC writes | No thread projection to anon |
| social_recommendation_events / participant parent; social_recommendation_messages / author/participant parent | Participant S; direct writes revoked, including despite historical message INSERT policy; RPC writes | No private thread/message access |
| social_notifications / recipient_id; social_reports / reporter_id | Own S; action/report/internal writes | No notification/report access |
| xp_events, xp_event_allocations, xp_user_totals, xp_user_world_totals, xp_user_branch_totals, xp_legacy_imports, xp_user_quest_progress, xp_user_badges, xp_media_entitlements, xp_local_state_conversions / user_id or event owner | Own S; direct DML revoked; XP authority/reconciliation triggers; constrained private erasure context | Public summary is visibility-controlled |
| user_theme_preferences, goals, cloud_media_sync_operations, goal_sync_operations / user_id | Own S; RPC-only mutation, CAS/revision/operation contracts | Published theme projection only |
| embedding_cache / no account owner | Client grants revoked, no client policy; dormant v1 | None |
| xp_quest_definitions, xp_badge_definitions / global | Intentional definition S; no permissive client write | Intentional anon/auth S using(true) |

Private tables: `private_rate_limit.{policies,buckets,request_receipts,capacity,global_state,secret_refs}`; `private_privacy_ops.{account_lifecycle,xp_cleanup_context,xp_detach_context}`. Private RLS and client grants are closed; limiter operations use their scoped owner role/selected-secret view, not unrestricted Vault access. Privacy transition/cleanup requires exact privileged session/context. `supabase/config.toml` exposes public/graphql_public, not either private schema. Hosted exposed schemas must still be checked.

Lifecycle coverage: 39 public statement triggers plus 39 row triggers (**78**), and one JWT-scoped Storage row trigger. Account mutation families terminate in guarded tables; ownerless definitions/dormant cache are separately handled. Missing/inactive lifecycle fails closed; privileged erasure helpers use narrowly bound contexts. OLD/NEW owners and participant references are included. Normal XP immutability remains; erasure deletes RESTRICT children and flushes deferred reconciliation before final XP cleanup. Actual trigger ordering/ACL execution remains unproven.

### Every effective SECURITY DEFINER signature

**81 effective functions**, counting overloads and applying later replacements/drops: public 70, private limiter five, private privacy six. Every declaration has a fixed search_path; a fixed path is not itself live proof of schema privileges. Grant authority anchors: `20260811120000_d8_security_advisor_hardening.sql:16–128`; limiter base `:285–300` and forward fix; Goal `20260803120000:199–202`; privacy barrier `:41,98,243,251–252`; XP cleanup `20261005120000:69–70`; participant detachment `20261005140000:76`.

PUBLIC_READ (7), anon/authenticated EXECUTE, PUBLIC revoked. Default path public,pg_temp, except get_social_profile also storage:

```text
public.get_social_profile(text)
public.get_unified_social_profile(text)
public.get_xp_public_summary(uuid)
public.list_profile_activity(uuid,integer)
public.list_social_connections(uuid,text,text,integer,integer)
public.search_social_profiles(text,integer,integer)
public.social_profile_asset_visible(text,text,uuid)
```

AUTH_READ (8), authenticated only, path public,pg_temp:

```text
public.get_social_person_summary(uuid)
public.get_social_recommendation_detail(uuid)
public.get_theme_sync_state()
public.get_xp_dashboard(integer)
public.list_social_blocks()
public.list_social_feed(timestamptz,uuid,integer)
public.list_social_notifications(timestamptz,uuid,integer)
public.list_social_recommendations(text,text,timestamptz,uuid,integer)
```

AUTH_ASSERTION (1), authenticated only, pg_catalog,pg_temp: `public.assert_account_write_allowed()`.

SIGNED_LIMITER (2), intentional anon/authenticated EXECUTE plus server signature, PUBLIC revoked; empty path: `public.consume_application_rate_limit_v1(text,text)`, `public.report_provider_cooldown_v1(text,text)`.

AUTH_MUTATION (29), authenticated only, current table/lifecycle guards. Default path public,pg_temp; Cloud/Goal apply functions use pg_catalog,public,pg_temp; comment/publish/react/send/transition replacements use empty path:

```text
public.apply_cloud_goal_v1(uuid,text,bigint,jsonb,boolean)
public.apply_media_item_sync_operation(text,text,text,bigint,jsonb)
public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)
public.delete_theme_sync_state()
public.save_theme_sync_state(bigint,jsonb,jsonb)
public.social_block(uuid)
public.social_comment(uuid,uuid,text,boolean,text)
public.social_comment_action(text,uuid,text,boolean)
public.social_delete_activity(uuid)
public.social_follow(uuid)
public.social_follow_action(text,uuid)
public.social_get_preferences()
public.social_notification_action(text,uuid,text,uuid)
public.social_publish_activity(text,text,jsonb,integer,text,text,text)
public.social_react(uuid,uuid,text)
public.social_recommendation_transition(uuid,text,text,boolean,text,text)
public.social_replace_showcase(text,jsonb)
public.social_report(uuid,uuid,text,text)
public.social_save_preferences(text,jsonb)
public.social_save_profile(text,text,text,text,text,text,text,text)
public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb)
public.social_send_recommendation(uuid,jsonb,text,text)
public.social_send_recommendation_message(uuid,text,text)
public.social_share_note(text,text,text,text,text,boolean,text,boolean)
public.social_unblock(uuid)
public.social_unshare_note(uuid)
public.xp_select_badges(text[])
public.xp_select_title(text)
public.xp_sync_media_states(jsonb,boolean)
```

`social_get_preferences` is deliberately counted as a mutation because its legacy body can initialize defaults, despite an old grant comment classifying it as a read. Current preferences GET instead uses owner-filtered SELECT and virtual defaults; it does not call this mutating RPC.

AUTH_NOOP_COMPATIBILITY (2), authenticated, public,pg_temp; effective bodies do not award/write: `public.xp_attest_local_event(text,text,jsonb,integer,text)`, `public.xp_import_legacy(integer,integer,integer,integer,integer,integer,jsonb)`.

PUBLIC_INTERNAL/TRIGGER (21), PUBLIC/anon/authenticated execution revoked; public,pg_temp:

```text
public.social_can_view_activity_row(uuid,text,uuid)
public.social_can_view_module(uuid,text,uuid)
public.social_ensure_activity_module()
public.social_insert_notification(uuid,uuid,text,text,uuid,jsonb,text)
public.social_insert_recommendation_message(uuid,uuid,text,text,boolean)
public.social_is_blocked(uuid,uuid)
public.social_notification_allowed(uuid,text)
public.social_profile_asset_visible(text,uuid)
public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric)
public.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean)
public.xp_apply_event(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean)
public.xp_award_recommendation_completion(uuid)
public.xp_convert_legacy_local_state(uuid)
public.xp_evaluate_quests(uuid)
public.xp_profile_entitlement_trigger()
public.xp_recommendation_event_trigger()
public.xp_recommendation_feedback_trigger()
public.xp_reconcile_entitlement(uuid,text,text,boolean,text,text,jsonb,jsonb)
public.xp_reconcile_media_state(uuid,jsonb)
public.xp_repair_selected_title(uuid)
public.xp_showcase_trigger()
```

PRIVATE_LIMITER (5), private/client execution revoked, empty path; role-owned state, internal consume/cleanup grant to postgres:

```text
private_rate_limit.auth_uid_v1()
private_rate_limit.cleanup_v1(integer)
private_rate_limit.consume_authenticated_v1(text)
private_rate_limit.reserve_v1(text,jsonb,jsonb,uuid,bytea,integer)
private_rate_limit.verify_v1(text,text,text)
```

PRIVATE_PRIVACY (6), client/PUBLIC/service-role execution revoked; pg_catalog,pg_temp; exact privileged transition/cleanup contexts:

```text
private_privacy_ops.assert_account_write_allowed_v1(uuid[])
private_privacy_ops.detach_participant_xp_v1(uuid)
private_privacy_ops.erase_xp_v1(uuid,text)
private_privacy_ops.guard_account_mutation_v1()
private_privacy_ops.initialize_account_v1()
private_privacy_ops.transition_account_v1(uuid,text,text)
```

No dynamic-SQL injection path or publicly executable privileged privacy helper was validated. General older public paths remain fixed but rely on correct public/storage schema privileges; actual hosted ACL/search_path/Advisor verification remains V1-GAP-009.

## 4. API, auth, network and env inventories

### Actual route methods

Recounted **35 route files / 48 handlers**: GET 23, POST 19, PUT one, DELETE two, PATCH three. All handlers use `runSafeApiRoute`. This happens to match 02A, but was not inferred from that report.

| `/api` route | Methods |
| --- | --- |
| ai/capabilities; ai/interpret; ai/recommend | GET; POST; POST respectively |
| anilist/details; anilist/search | GET; POST |
| calendar/anilist; calendar/tmdb; calendar/tvmaze | GET each |
| cloud/rollout | GET |
| dev/recommendation-annotation | GET, POST |
| omdb/details; omdb/search | GET; POST |
| openlibrary/search | POST |
| personalization/themes/sync | GET, PUT, DELETE |
| providers/capabilities | GET |
| social/assets | POST, DELETE |
| social/comments | POST, PATCH |
| social/connections | GET |
| social/feed | GET, POST |
| social/notifications | GET, PATCH |
| social/people | GET, POST |
| social/preferences | GET, POST |
| social/profile; social/profile/hero; social/profile/summary; social/profile/[username] | GET/POST; GET; GET; GET respectively |
| social/reactions | POST |
| social/recommendations | GET, POST, PATCH |
| social/relationships; social/reports | POST each |
| tmdb/details; tmdb/search; tvmaze/details; tvmaze/search | GET; POST; GET; POST |
| xp | GET, POST |

Cookie mutations use mandatory canonical same-origin and present Fetch-Metadata same-origin; server getUser/RPC auth.uid and owner/domain validation are retained. Login uses Supabase credentials; UI has no public signup workflow, but local config/hosted setting caveat above applies. Local owner namespaces/stale-async guards are not replaced by cookie state. Service-role use in runtime is only the default-off persistent embedding cache; ops/fixtures use separate isolated credentials. No caller user ID or user_metadata admin trust was established. Session/account-switch, hydration and hosted enumeration/throttling behavior still require synthetic browser/hosted acceptance.

CSP remains request nonce + strict-dynamic with production script unsafe-inline/eval absent, exact configured Supabase HTTP/WSS origins, no unsafe HTML/eval runtime sink found in searched runtime surfaces. Theme/style inline allowance is an accepted architectural residual, not a new script-XSS defect. Safe URL navigation and TVMaze provenance checks reject unsafe schemes/credentials/malformed source IDs. Signed asset URL expiry/revision/owner caches remain; no current owner asset bleed was validated statically.

### Actual outbound destinations and reachability

| Destination | Consumer / destination control / v1 status |
| --- | --- |
| api.tvmaze.com | Search/show/episodes/calendar; constant HTTPS host, encoded query/bounded IDs; enabled with shared actual-call reservation and attribution |
| openlibrary.org/search.json | User-requested lookup/candidate search; constant host, strict UA, shared admission then 64-entry/five-minute cache; no Work API enrichment/background crawl found |
| graphql.anilist.co | Three retained route implementations; source-hard-disabled before fetch |
| api.themoviedb.org | Search/detail/calendar code; source-hard-disabled before fetch |
| www.omdbapi.com | Retained legacy helper; public capability rejects before fetch; no public live fallback found |
| api.openai.com; api.groq.com; openrouter.ai; generativelanguage.googleapis.com | Retained paid/discovery/extraction adapters; server entitlement/provider/research policy, hosted-v1 forbidden keys and disabled funded limiter policy; deterministic library-only returns before these calls |
| duckduckgo.com | Retained AI candidate research HTML path, gated non-library execution; not an enabled v1 lookup |
| query.wikidata.org / www.wikidata.org; validated Wikipedia language hosts | Gated research sources; canonical HTTPS allowlist, reject private/unsafe IPs, pin DNS, revalidate redirects and bound bytes/deadlines in secure-http-client |
| Configured Supabase origin | Auth, RPC/PostgREST, private Storage signing/upload/remove and realtime; configured target, server verified identity/owner/RLS; direct browser clients included |
| Configured app origin from NEXT_PUBLIC_APP_URL/VERCEL_URL | Internal candidate/provider requests; configuration-derived, not arbitrary caller URL; exact env provenance remains a release check |
| MEDIA_TRACKER_ML_SERVICE_URL + /embed; AI_LOCAL_SEMANTIC_VERIFIER_URL; AI_REMOTE_SEMANTIC_VERIFIER_URL | Operator-configured legacy/enhanced services; hosted v1 forbids these variables; library-only path avoids embedding/enhanced execution. Source helpers are not universal URL allowlists and future enablement needs review |
| Browser/Next images: static.tvmaze.com, covers.openlibrary.org, image.tmdb.org, s4.anilist.co, m.media-amazon.com, ia.media-imdb.com; configured Supabase assets | Provider/DB/import-derived covers; CSP bounds browser destinations; optimizer exact HTTPS host/path/port rules. Stored legacy images remain requests despite disabled metadata API |
| Navigation only: www.tvmaze.com, openlibrary.org, anilist.co, www.themoviedb.org, www.imdb.com, www.kvkk.gov.tr | Source credits/external links; not server fetches. github.com appears in a source comment; example/invalid/local fixture literals are not forgotten live integrations |

No user-selected arbitrary server fetch was validated in enabled v1 routes. Generic active-provider fetch follows normal fetch redirects rather than the research transport's pinned redirect model; fixed host/HTTPS and supplier-controlled redirects are the present trust assumption, not a proven universal SSRF guarantee. Actual external image behavior, host inventory in saved data and ingress configuration were not read from users or deployments.

AniList/TMDB require source changes to enable, independent of env/token. OMDb legacy records do not grant live search. Paid AI/research helpers are configurable code, **not globally source-hard-disabled like AniList/TMDB**: v1 safety depends on the reviewed disabled env contract, server entitlement and disabled funded limiter policy. No stray-key-only public execution path was found. Actual deployed policy/SQL remains unverified; do not use this as permission to set non-v1 flags.

### Every source env use and policy classification

AST inspection found 36 literal `process.env.NAME` names and four computed accesses in the compatible-provider implementation. Resolving its closed configs, env-reader aliases, research constants/registry entries found **74 named uses** under app/lib/features/hooks/components and proxy/config, including five test-only target-helper names; **69 are non-test runtime names**. This is source inventory, not env values. No credential values were inspected or recorded.

| Classification / consumer | Exact names |
| --- | --- |
| Core public target/Cloud; required when accepting hosted contract | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE, NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED, NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE, NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH, NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION, NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE, NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED |
| Server limiter required; previous key optional | RATE_LIMIT_IDENTITY_HMAC_KEY, RATE_LIMIT_RPC_SIGNING_KEY, RATE_LIMIT_RPC_KEY_VERSION, RATE_LIMIT_RPC_AUDIENCE, RATE_LIMIT_IDENTITY_HMAC_PREVIOUS_KEY |
| Hosted v1 fixed disabled values | AI_SERVER_ACCESS_MODE, D7_RESEARCH_ROLLOUT_MODE, D7_RESEARCH_SHADOW_ENABLED, D7_RESEARCH_PUBLIC_CITATIONS_ENABLED, D7_RESEARCH_EVIDENCE_CACHE_ENABLED, MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE |
| Optional permitted server config | MEDIA_TRACKER_PROVIDER_USER_AGENT, MEDIA_TRACKER_EMBEDDING_CACHE (off if provided) |
| Platform managed/provenance | NODE_ENV, VERCEL, VERCEL_URL |
| Forbidden legacy/local/privileged runtime | RATE_LIMIT_LOCAL_TEST_IP, SUPABASE_SERVICE_ROLE_KEY, MEDIA_TRACKER_ML_SERVICE_URL, MEDIA_TRACKER_EMBEDDING_MODEL, AI_PROVIDER, AI_RECOMMENDATION_SEMANTIC_MODE, AI_LOCAL_SEMANTIC_VERIFIER_URL, AI_REMOTE_SEMANTIC_VERIFIER_URL, D7_ANNOTATION_DATA_DIR, D7_ANNOTATION_TOOL_ENABLED, OMDB_API_KEY, TMDB_READ_ACCESS_TOKEN |
| Forbidden paid provider key/models | OPENAI_API_KEY, OPENAI_MODEL, OPENAI_RESEARCH_MODEL, OPENAI_RESEARCH_EXTRACTION_MODEL; GROQ_API_KEY, GROQ_MODEL, GROQ_RESEARCH_MODEL, GROQ_RESEARCH_EXTRACTION_MODEL; OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_RESEARCH_MODEL, OPENROUTER_RESEARCH_EXTRACTION_MODEL; GEMINI_API_KEY, GEMINI_MODEL |
| Forbidden research discovery/extraction | D7_RESEARCH_DISCOVERY_PROVIDER, D7_RESEARCH_EXTRACTION_PROVIDER; D7_OPENAI_WEB_DISCOVERY_ENABLED, D7_OPENAI_WEB_DISCOVERY_LIVE_SMOKE, D7_OPENAI_GROUNDED_EXTRACTION_ENABLED, D7_OPENAI_GROUNDED_EXTRACTION_LIVE_SMOKE; D7_GROQ_WEB_DISCOVERY_ENABLED, D7_GROQ_WEB_DISCOVERY_LIVE_SMOKE, D7_GROQ_GROUNDED_EXTRACTION_ENABLED, D7_GROQ_GROUNDED_EXTRACTION_LIVE_SMOKE; D7_OPENROUTER_WEB_DISCOVERY_ENABLED, D7_OPENROUTER_WEB_DISCOVERY_LIVE_SMOKE, D7_OPENROUTER_GROUNDED_EXTRACTION_ENABLED, D7_OPENROUTER_GROUNDED_EXTRACTION_LIVE_SMOKE |
| Forbidden external-research config | MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED, MEDIA_TRACKER_RESEARCH_USER_AGENT, D7_RESEARCH_LIVE_SMOKE |
| Test-only target helper, forbidden hosted runtime | D8_PRODUCTION_PROJECT_REF, D8_STAGING_PROJECT_REF, D8_STAGING_CUTOVER_ENABLED, D8_STAGING_MIGRATION_ALLOWED, SUPABASE_PRODUCTION_URL; lib/supabase-test-target.ts, test callers |

06 env JSON intentionally enumerates current allowed variables and forbidden regex classes, rather than pretending dormant adapters have disappeared. Known runtime names are covered by allowed/fixed/platform or forbidden/reject-unreviewed classes; no secret NEXT_PUBLIC use was found. VERCEL_ENV appears in the ops validator's platform allowlist but no current app consumer was found: platform metadata acceptance is not feature enablement. CI-only/test-baseline/ops credentials are not normal runtime variables. Environment validation is an operator tool, not automatic boot enforcement of every forbidden variable; hosted proof is still required.

## 5. Privacy, local data and operations verdicts

Export: 36 account-linked categories, fixed Auth field allowlist, participant visibility filtering, unknown-table/category fail-closed behavior, recursive sensitive-key and signed/token URL sanitization, scoped Storage metadata rather than claimed binary export. No cross-user export leak was validated in reviewed source. Erasure resolves exact target identity, defaults dry-run, requires execution/identity/participant-loss confirmation, binds private lifecycle/context, deletes XP dependencies and checks residuals before Auth-last. Interruption never automatically unlocks; retry is controlled. **V1-GAP-001 prevents complete source closure**, and real services remain unproven.

`/privacy` technical fact check (app/privacy/page.tsx vs 05A/B/C/D/F and current source):

| Claim family | Assessment |
| --- | --- |
| Supabase auth/email, optional Cloud, local library/goals/themes/social and server deterministic processing | VERIFIED_SOURCE for represented architecture; actual targets/recipients LIVE_UNVERIFIED |
| Public signup target disabled / existing sign-in | PARTIAL; UI/source target policy is represented, hosted signup deny remains LIVE_UNVERIFIED |
| Portable export vs comprehensive account export | PARTIAL as explicitly stated; binary/vendor/browser copies not falsely included |
| Account erasure operator-assisted / scope being verified | PARTIAL and LIVE_UNVERIFIED; notice does not claim implemented self-service or proven immediate full erasure |
| Provider lookup, stored CDN images, disabled future metadata/AI | VERIFIED_SOURCE for conditional flows and policy target; actual env/provider legal gates remain open |
| Logical cache TTL vs physical deletion, platform/backups/recipient copies | VERIFIED_SOURCE distinction; vendor periods LIVE_UNVERIFIED |
| Controller/contact, request channel, bases, transfers, Article 9/VERBIS and retention approval | LEGAL_REVIEW_REQUIRED / manual operating proof; civil identity/mailbox ownership not checked here |

No unsupported complete-erasure/compliance promise was established. Technical consistency is not legal sufficiency. No arbitrary statutory retention period was invented. Tombstones/operation journals cannot be age-purged without a proven replay horizon; current bounded cleanup is limiter-only. Inventory completeness defect is V1-GAP-005.

Local-first/portable review: owner namespaces, codecs/version handling, corrupt-state recovery/quarantine, verified writes/readback, quota failure handling and optional-cloud separation retained. Portable v2/v3 uses a 10 MiB boundary, domain/field restrictions, sensitive-key scan, runtime codecs, checksum, owner/source fingerprint guard, additive import journal and rollback/recovery-required handling. No credible prototype-pollution merge, silent destructive reset or cross-owner import bypass was validated. Full local suites passed; arbitrary user backups, real browser quota/account switches and every storage backend were not exercised.

Ops source: fixed local Docker transports, scrubbed child environments, fixture/container/network/database identity proof, no shell-derived user command; Production/Staging/unknown classification refused. AES-GCM, independent manifest hash, path/symlink checks, atomic no-overwrite output, exact migration/catalog verification, prerequisite roles/extensions/Auth identity, restore section order and first-failure stop are preserved. CLI outputs redact subprocess details. Synthetic suite PASS proves those source/mock behaviors, not real archive validity or DR. No ops import/credential was found in 51 built server trace manifests or 426 compiled JS files. Native module-type, 15 existing annotation filesystem tracing warnings and the nested validation workspace-root warning remain; no warning was suppressed.

Frontend source inventory: **11 page files** including the development annotation page; main navigation destinations resolve actual routes/query tabs. Development page/API require development mode, explicit flag and local access; Production rejects. Source checks of error/empty/loading, disabled-provider fallback, cloud-disabled queues and auth gates found no additional credible release-impacting regression. Browser/visual behavior was not run and is not marked PASS.

## 6. Coverage and claim revalidation

| Area | Work actually performed / result |
| --- | --- |
| A dependency/build | Direct/dev/lock/engines/peers, clean install, installed graph, runtime/full advisory checks, typegen/typecheck/lint/tests/build; current exception accepted |
| B auth/RLS/SD | Auth/UI/server boundaries plus all ordered SQL objects, effective grants, 48 tables and 81 SD signatures; no validated cross-owner bypass; live ACL/signup gates retained |
| C barrier/erase/export | All account table families, RPC targets, row/statement/Storage guards, shared JSON/XP/participant cleanup and Auth-last source; confirmed detachment defect; no actual DB proof |
| D input/web | Recounted all routes/methods; CSRF/CSP/unsafe sinks/URLs/fetch/error source; inbound and upstream bounds gaps |
| E limiter | HMAC identity/signature/audience/replay/private grants, forward reserve definitions, atomic quota/capacity/TTL/cooldown/failure classification and route coverage; real ingress/rotation/performance/cron remains live |
| F providers | Actual source destination inventory and alternate paths, hard-disable gates, TVMaze provenance, Open Library UA/cache/manual lookup; no Work enrichment or metadata bypass found |
| G migrations/data | All 25 migrations ordered/read, replacements/drops/grants/RLS/FKs/CAS/trigger dependencies; source manifest and critical history hashes pass; canonicalKey schema mismatch confirmed |
| H local/recovery | Owner/local corruption/backup import contracts and recovery tooling/06A source; mocked operation checks pass; actual restore remains held |
| I env/release/freeze | Literal/computed/aliased env consumers classified against 06 policy; current vs historical authority; explicit Auth race and affected-write inventory |
| J logging/incidents | Runtime console/sink search finds only safe structured logger warning; no raw auth/provider/body error sink found; 06B/C separate available/manual signals and impossible full-DR rollback claims |
| K notice/retention | Technical claim-by-claim notice check; no legal compliance conclusion; later private-table inventory drift |
| L product | Actual page/navigation source, dev guards and major loading/error/fallback paths; no visual or deployed-route proof |
| M hygiene | All tracked filenames/text signatures, intentional tooling vs scratch, generated ignore policy and README authority drift |
| N legacy | Retained provider adapters and XP stubs classified as compatibility/dormant; no bypass-capable legacy path validated; future enablement requires new review |
| O tests | Offline suite + CI AST skip/only/todo policy; existing mock/string limits classified; privacy synthetic constraint blind spot explicitly recorded |
| P secrets/history | Current-tree signature scan; 225 reachable local commits; historical sensitive filename scan found only `.env.example` in selected env/secret/key/dump/db patterns; no history rewrite |
| Q validation | Full local validation below; initial harness failures separated from source defects; no live/GUI/E2E work |

Coverage is a source-led architectural/contract sweep with complete SQL/API/env inventories and current-tree signature scanning. It is **not** a claim that every line of all 1,107 files received independent semantic security review. No real account/device content, hosted schema/data/ledger, vendor access, full binary screenshot OCR, entropy-based secrets audit, or exhaustive all-blob Git-history secret scan was performed. No absence-of-secrets guarantee follows from patterns or filename history checks. All unresolved execution boundaries are retained rather than promoted to CLOSED.

Historical D8 source assumptions are behind frozen banners. 06 source manifest matches all 25 migrations; names/timestamps/order and the three frozen 02D hashes passed. No migration changes exist between the 05F committed baseline and current HEAD. This does not prove every historical file was never altered before that baseline, the hosted applied ledger, extension/prerequisite compatibility, SQL parse/execution or data-dependent cascade behavior.

## 7. Test quality and complete validation results

Final validation kept all assertions, skips, test config, lint config and source unchanged. 40 CI policy tests exercise negative audit/workflow/skip/credential/network contracts; they are more than self-defined constant equality. Existing SQL string checks and synthetic/mocked adapter proofs remain valid as source contracts, **not** SQL execution/security guarantees. Shallow-history-sensitive privacy/ops tests now use trusted current HEAD/baseline pins; current source checks do not require nonexistent old commits in shallow CI.

| Check actually run | Result |
| --- | --- |
| Clean npm ci | PASS; 421 installed packages; existing unrs-resolver postinstall warning retained, no new install hook/dependency |
| npm ls --all | PASS, exit 0; no invalid/undeclared installed graph reported |
| Lock source | PASS; all resolved entries registry.npmjs.org with integrity; no git/file/custom registry target; two existing dev install-script entries (optional fsevents, unrs-resolver) |
| Repository/workflow/migration/test/secret policy | PASS: `node scripts/ci-checks.mjs --repository-only` on original source; no live check |
| Clean validation env | PASS: `--environment-only` in credential-free archive |
| CI policy regression | PASS: 40 tests, zero fail/skip/todo |
| Runtime npm audit | PASS: zero total vulnerabilities |
| Full advisory/upstream verification | PASS under current exception: five dev-only High, zero Critical, exact reviewed chain; not zero-High full audit |
| Route typegen | PASS, fresh generated types |
| TypeScript | PASS: tsc --noEmit --incremental false |
| Source lint | PASS: zero errors; one existing internal-navigation warning in recommendation-composer |
| Full offline Vitest, final run | PASS: **203 passed files / 2,962 passed tests**, **18 skipped files / 56 skipped tests**, zero failure |
| Direct privacy/retention/race/barrier/ops Node suites | PASS: **63 tests**, zero fail/skip/todo; synthetic/mock/source scope only |
| Operational current-source manifest check | PASS: 25 migrations, SOURCE_ONLY |
| Offline production build | PASS: compile/typecheck/page generation; existing 15 tracing warnings and snapshot-root warning; no deploy |
| Built ops/secret boundary | PASS in 51 server .nft.json manifests and 426 compiled JS files; no ops module/private-env/ops credential hits in specified checks |
| Source stability | PASS: original tree/index unchanged; all 1,107 archive files unchanged relative to original after EOL normalization; generated types/build were ignored outputs |
| Current-tree secret signatures | No confirmed real secret; four credential-URL hits classified as synthetic redaction/target tests, filenames only in scan output |
| Git whitespace | PASS: original tracked/index checks and final report check; no source remediation |
| SQL execution / services / browser / E2E | NOT RUN; DB/Auth/Storage/restore proof BLOCKED_ENVIRONMENT or LIVE UNVERIFIED as above |
| Exact-HEAD hosted Actions | NOT RUN live verification; user-supplied PASS not upgraded |

Initial attempts: an absolute Windows preload path required a file URL (harness error); default sandbox temp rename caused 221 Vitest import failures/no executed tests; the next attempt had a sandbox junction denial, a five-second wrapper timeout under broad worker contention, and recovery safety refusal because test temp was inside its snapshot root. These are not reported as source vulnerabilities. The final authorized local run used a writable temporary directory outside the snapshot, the unchanged offline guard and `--maxWorkers=2`; necessary sandbox filesystem execution was approved. All original tests and default per-test assertions/timeouts remained intact. No failure was hidden by skip/config weakening.

### Every skipped family in the final run

| File family under tests/ | Skipped tests / reason |
| --- | --- |
| cloud-media-owner-scoped-pk-live.integration.test.ts | 7, isolated DB/live target absent |
| cloud-media-v2-client-live.integration.test.ts | 6, isolated DB/live target absent |
| cloud-media-v2-conflicts-live.integration.test.ts | 5, isolated DB/live target absent |
| cloud-media-v2-live.integration.test.ts | 10, isolated DB/live target absent |
| recommendation-d7-r2a-wikimedia-live.integration.test.ts | 3, explicit live network flag/config absent |
| recommendation-d7-r2b-openai-live.integration.test.ts | 1, paid/live flag/key absent |
| recommendation-d7-r2c-groq-live.integration.test.ts | 1, paid/live flag/key absent |
| recommendation-d7-r2c-openrouter-live.integration.test.ts | 1, paid/live flag/key absent |
| recommendation-d7-r3a-wikimedia-live.integration.test.ts | 1, explicit live network flag/config absent |
| recommendation-d7-r3b-groq-live.integration.test.ts | 2, paid/Wikimedia live config absent |
| recommendation-d7-r4b-shadow-live.integration.test.ts | 1, live research absent |
| recommendation-d7-r5a-live.integration.test.ts | 1, live research absent |
| recommendation-d7-r5b-stability-live.integration.test.ts | 3, live research absent |
| recommendation-d7-r5b1-stability-live.integration.test.ts | 2, live research absent |
| recommendation-d7-r5b2-live.integration.test.ts | 1, live research absent |
| recommendation-d7-r5c-cache-live.integration.test.ts | 1, live research absent |
| recommendation-d7-r6b-live.integration.test.ts | 1, live research absent |
| recommendation-provider-live.integration.test.ts | 4, live provider/credential config absent; hard-disabled providers have separate no-network proof |

All **56** skips are conditional live families, no new unconditional forgotten skip identified. Goal and Security Advisor guard tests run offline; their successful guards are not successful live integrations. Current CI AST policy rejects literal skips, only/todo and unreviewed runtime skips. Conditional provider tests for disabled/future features do not imply permission to enable them for v1.

## 8. Repository hygiene and final decisions

Hygiene verdict: **no confirmed current-tree credential leak or tracked private/generated operational artifact** in this bounded scan; README authority drift needs cleanup. Only `.env.example` is tracked; populated local env files were neither read nor copied into validation. `.ai/{project.md,automation.json,project-map.json}` are intentional repository instructions/routing, not agent transcripts. `.codex`, `.claude`, `.knowledge-compiler`, env files, node_modules/.next/tsbuildinfo and Supabase temp are operational/ignored surfaces; no tracked `.cursor`/Copilot scratch/session artifact was found. Ignore coverage is not universal for every possible new log/cache/tool name; CI's tracked-file guard and review are still needed. No binary secret absence, complete history cleanliness or public publication clearance is claimed.

Security architecture: owner/server/RLS/lifecycle boundaries remain coherent; no validated authorization bypass. Input/upstream resource bounds need narrow improvement and live security proof remains mandatory. Privacy architecture: fail-closed lifecycle/Auth-last is preserved, but participant cleanup's CHECK mismatch defeats a supported erasure case. Provider verdict: source gates/provenance intact, legal/registration/config acceptance separate. Operations/recovery verdict: safely fenced disposable tooling, coherent planning and honest DR exclusions; cutover containment and real recovery rehearsal remain open. Test-quality verdict: broad executable regressions pass, but mock/string security tests cannot substitute for SQL/service execution and demonstrably miss V1-GAP-001.

Recommended remediation scope: repair V1-GAP-001 and its real constraint test first; close specific migration admission/full cutover containment under a separately scoped plan; bound inbound and active-provider response consumption; update only the two affected retention/README authority areas. Re-run affected local contracts plus required broad acceptance after changes; then obtain the safe disposable/privacy/restore and exact-SHA hosted/manual gates. Do not upgrade dependencies or redesign auth/providers/local storage merely to perform this repair.

Final conclusion: **SOURCE_REMEDIATION_REQUIRED**. No final immutable RC accepted; Production cutover remains frozen.

Explicit safety: no Production, Staging or Preview access; no application/hosted/vendor APIs (npm supply-chain requests only); no deploy/promotion/env mutation; no migration apply or database connection; no real user data; no actual backup/restore; no browser/GUI/E2E; no commit, push, tag, merge or branch switch; no canonical/Vault write. **Only this new audit report is the repository deliverable.**
