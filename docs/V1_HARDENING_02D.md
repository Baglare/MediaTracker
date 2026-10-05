# V1-HARDENING-02D.2 — repository implementation

2026-10-04. Create-only migration; no Staging/Production mutation, remote SQL, deployment, key provisioning, commit or push. Release acceptance remains separate from repository implementation.

## Baseline / imported contract

Started clean on `release/v1-hardening`, SHA `dc06c7c93bad33b763c4c89ab130ee483a47c4eb`, Next 16.3.8 / Node 24.14.0. 01 retains its documented development exception; 02A/02B/02C are committed. External 02D.1 architecture report was read and left unchanged. Optional-cloud/local-first canonical context was retrieved read-only; no Vault synchronization or promotion was performed within this repository-only task.

02D.1 Option E: platform coarse protection plus private Supabase/Postgres authority and provider reservations/cooldown. This task implements the repository portion; it does not configure platform controls. The report overrides suggested provider fail-soft and proposed `MEDIA_TRACKER_RATE_LIMIT_HMAC_KEY`: providers fail closed, with separate `RATE_LIMIT_IDENTITY_HMAC_KEY` / `RATE_LIMIT_RPC_SIGNING_KEY`. The report specifies policy classes/budgets rather than frozen literal IDs; the names below freeze those classes for the signed contract.

## Identity, envelope and transport

- Verified `auth.getUser()` UUID has independent quota across IP changes. Body/query/header/metadata never selects owner or subject. UUID exists transiently and is never persisted in limiter state.
- `@vercel/functions` `ipAddress(request)` is used only when the server platform env `VERCEL=1`. The installed SDK uses the officially documented platform `x-real-ip` header. Header presence cannot establish off-platform trust. Preview/Production topologies and any additional proxy remain live gates.
- Node `isIP` validates complete addresses; WHATWG parsing canonicalizes IPv6; IPv4-mapped addresses collapse to IPv4; anonymous IPv6 shares its /64. Multi-value, zone, port, malformed and whitespace inputs fail unavailable. Off-platform production has no implicit fallback. LOCAL/test may explicitly set a synthetic `RATE_LIMIT_LOCAL_TEST_IP`.
- HMAC-SHA256 over compact `[1,audience,identityClass,policyScope,UTCday,canonicalIdentity]`. Identity/signing keys are separate, server-only, >=32 characters and never logged/bundled. Subjects are bounded 32-byte digests. IP/UUID/secret/envelope/nonce/full digest never enters responses or telemetry.
- First 60s at midnight checks/debits previous and current day. Previous-key rotation checks/debits both keys; at most four subjects and four ingress digests. The rolling overlap prevents a new instance resetting an old active quota.
- Exact UTF-8 envelope <=2 KiB: version, operation, audience, key_version, policy_id, identity_class, subjects, ingress, nonce, issued_at, expires_at, cost, cooldown. No arbitrary limit/window fields. Lifetime <=10s, clock skew <=5s. SQL validates fixed shape, signature, selected audience/key validity, policy/cost and subject bounds before admission writes.
- Existing supabase-js public-key transport, with persistence/session refresh disabled. No service-role, owner password, DB driver or new SaaS. One reservation call, no automatic retry; total decision deadline 750ms including identity resolution; late auth completion cannot initiate a DB call. The outstanding auth lookup itself cannot be canceled through the existing cookie SDK. DB function timeout target 500ms / lock timeout 100ms requires live enforcement verification.

Official ingress references checked 2026-10-04: [Vercel headers](https://vercel.com/docs/headers/request-headers), [Vercel Functions SDK](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package). They document the abstraction; they do not prove this deployment's topology.

## Database / atomicity / direct abuse

Migration: `supabase/migrations/20261004120000_application_rate_limit_v1.sql`. CREATE ONLY, not applied even locally. Requires approved `extensions.pgcrypto` HMAC/digest functions, `vault.decrypted_secrets` and migration-owner role capabilities; it enables no extension or cron. A dedicated NOLOGIN, non-superuser, NOINHERIT, NOBYPASSRLS role owns new SECURITY DEFINER limiter functions with empty search_path and schema-qualified application objects. Temporary migration membership/schema CREATE rights are revoked. Existing business-function owners and ACLs are preserved.

`private_rate_limit` is not to be added to exposed Data API/GraphQL schemas. Private tables have RLS enabled and PUBLIC/anon/authenticated direct table/sequence/schema/internal-function access revoked. No client SELECT/INSERT/UPDATE/DELETE policies. Objects:

| Object | Fixed/bounded state |
| --- | --- |
| policies | Static known policy/scope/limit/60s window/provider/cost/enabled mapping; no public mutation |
| buckets | scope + digest(32 bytes) + UTC epoch PK, bounded count, DB window_start, expires_at; expiry index |
| request_receipts | nonce UUID PK (random receipt, not user UUID), envelope digest, 60s expiry; expiry index |
| capacity | Two preseeded rows; buckets <=10,000 and receipts <=20,000; atomic insertion/deletion accounting |
| global_state | Five static rows: dynamic, TVMaze, Open Library, disabled AniList/TMDB; tokens/refill/cooldown/day state |
| secret_refs / selected_secrets | <=2 versions, kind, Vault secret reference, exact audience and validity; no literal key. Limiter can select only the restricted view of referenced secrets, not all Vault secrets |

Public `consume_application_rate_limit_v1(text,text)` and `report_provider_cooldown_v1(text,text)` intentionally grant EXECUTE to anon/authenticated. Their additional authorization is the server-only signature, not the public anon key. Arbitrary subjects/policies/costs cannot be authorized without that secret. Invalid/missing/cross-environment/expired/tampered proof rejects before writes. Duplicate nonce cannot grant twice. No public cleanup/reset/introspection or caller limit/window override.

One fixed advisory transaction lock serializes missing-row creation, capacity, receipts and every involved identity/ingress/global/provider bucket. This deliberately favors a small auditable all-or-none implementation over parallel throughput. Insert-on-conflict and locked checks precede debit; every budget must pass before counters/tokens/day budget are debited. Denial commits only bounded receipt/admission housekeeping. No lock extends over provider I/O. The single-lock contention/latency cost is a mandatory rehearsal gate, not a demonstrated performance result.

`consume_authenticated_v1(policy)` is internal-only, allowlists `social_domain`, derives auth.uid and HMAC in DB, uses active identity-key overlap and the same engine. Six preserved business functions invoke it in the same transaction: comment, react, send recommendation, send message, publish activity and recommendation transition. This serializes their existing stricter row-count/domain checks. Internal domain quota is distinct from HTTP quota and avoids double-debit of the dynamic global HTTP budget. Authorization, ownership, RLS, dedupe and domain checks remain. Denied domain transactions roll back; this is an admitted-mutation ceiling, not an attempted-request billing limit.

Unsigned calls still cost PostgREST/DB verification compute. HMAC is not volumetric DDoS protection. WAF, native Auth, direct Storage, other Data API/read/Cloud RPC resource controls remain separate gates. HTTP quota is never authorization.

## Frozen policies and route coverage

| Policy IDs | Identity budget | Shared actual-call budget / behavior |
| --- | --- | --- |
| tvmaze_search, openlibrary_search | Combined search scope 60/60s | TVMaze 1/s burst2, cost1; Open Library 1/s burst1, cost1; existing contact gate before admission |
| tvmaze_details, tvmaze_calendar | Combined provider_read 120/60s | Details reserves2 before both parallel calls; calendar1; all active consumers share TVMaze row |
| social_read | 60/60s | People search/lookup, profile API + public /u SSR, social reads, own-data read routes |
| social_write | 30/60s | Social mutation routes, after existing origin boundary; server/RLS authorization retained |
| asset_write | 6/60s | Upload/removal before multipart/file processing or side effects |
| xp_sync | 6/60s | XP POST; immutable event/validation contracts retained |
| settings_write | 30/60s | Theme PUT/DELETE; revision/conflict contracts retained |
| interpret, recommend | 30 / 20 per60s | Bounded deterministic library-only operations; best-effort local smoothing only on backend unavailable |
| social_domain | 30/60s | Six internal mutator guards; existing stricter SQL domain limits retained |
| funded_ai | Disabled | Future paid/research work fail-closed; entitlement/CSRF denial precedes budget; no v1 enablement |
| anilist_search/details/calendar | Disabled | Future global1/3s burst1; env-only enablement cannot pass disabled SQL policy |
| tmdb_search/details/calendar | Disabled | Future global1/s burst1; env-only enablement cannot pass disabled SQL policy |

Every distributed HTTP admission also reserves dynamic global10/s burst20 and <=5,000/day using DB time. Fixed identity windows are DB first-request anchored60s and may allow a boundary burst; shared token buckets constrain actual active-provider calls. Reservations are never refunded on lost response/upstream failure. Every HTTP retry requires a fresh nonce/reservation. AniList multi-call search/calendar enablement still requires per-actual-call reservations; disabled placeholders do not certify its future fanout implementation. OMDb stays disabled by existing release policy; its legacy Map is smoothing only, with no new API permission. Capabilities/rollout remain bounded static policy reads without limiter DB dependency.

## Failure matrix / upstream backoff

| Class | Budget unavailable | Exhausted |
| --- | --- | --- |
| Active provider search/details/calendar | 503 `{code:"rate_limit_unavailable"}`, Retry-After5; zero upstream | 429 `{code:"rate_limited"}`, positive bounded Retry-After; zero upstream |
| Social API / server writes / assets / XP / settings | 503 before domain effects; local verified state/queue remain | 429, no domain effects; auth/RLS still required |
| Public profile SSR | Safe unavailable rendering; no profile loader/visibility bypass | Same safe unavailable rendering (SSR does not promise API JSON/status429) |
| Deterministic library-only | Existing bounded Map BEST_EFFORT_SMOOTHING may admit; RAM-only ephemeral HMAC; not provider/paid authority | 429 on local/shared denial |
| Future funded AI/research/providers | Disabled policy remains closed | No enablement in this task |
| Static capabilities/rollout | No DB limiter dependency | Platform coarse controls are external |

Missing/malformed policy secrets, invalid DB response/proof, replay, cap exhaustion, transport error, uncertain timeout sanitize to503; no SQL/SDK errors leak. Responses are no-store and never reveal current count or subject. Upstream429 is reported via a new signed cooldown nonce: delta-seconds/HTTP-date parsed, invalid/missing =>30s, exponential cooldown capped at one day. Wait >=one day disables the shared provider until separately authorized recovery; it does not retry early. No sleep/retry loop. A lost cooldown report returns503; durable delivery cannot be guaranteed during DB outage, and no new work may bypass an unavailable reservation.

## Cleanup, retention, privacy and rotation

Identity expiry = active window_start+60s+15min. Receipts retained60s (>proof lifetime+skew). Private `cleanup_v1(batch)` clamps combined deletions <=500; updates capacity atomically under the admission lock. Admission opportunistically runs cleanup when its minute threshold expires; cap exhaustion never evicts a live identity to reset quota. Healthy scheduler target: minute batches, physical expired-state removal <=1h; idle cleanup and cron history pruning require external scheduling. No cron/extension configured here.

Counters are security-purpose pseudonymous personal data, not anonymized data. Raw IP is processed transiently at ingress; verified UUID transiently in identity resolution. Existing platform logs, WAL/backups and query/provider processing have separate retention realities. Table TTL does not erase backups. No legal notice rewrite or legal-compliance claim. Existing privacy inventory/operator/retention review remains a release gate.

Identity rotation: deploy dual old/new reservation to every new instance; DB-internal helpers retain both identity refs; wait until old writers drain plus >=60s before retiring previous identity key. Old pseudonyms expire under normal TTL. Signing rotation: <=2 versions, exact audience and validity; drain old writers and wait >=15s before removing old version. No emergency bypass/reset accepted. Keys live in isolated LOCAL/Preview/Production scopes and target Vault; none provisioned here. See `.env.example` and `D8_RELEASE_ENV_MATRIX.md`.

## Validation evidence

PASS: new identity/HMAC/adapter/route/migration-static tests: 44/44. PASS: targeted 02A/02B/02C/request-boundary/Calendar regressions: 5 files,383 tests,0 skips/failures. PASS: final full Vitest 195 passed files / 2,810 passed tests / 0 failures; existing 18 conditional skipped files / 59 skipped tests unchanged. New skip/todo/only declarations:0.

PASS: `npx tsc --noEmit --incremental false`; `npm run lint` (0 errors, existing recommendation-composer navigation warning); `npm run build` with Next16.3.8 (existing15 annotation-tool filesystem tracing warnings). The initial build output path under `.next` conflicted with build cleanup; the successful final build writes its log outside that build directory. No dependency auto-fix was run. Runtime `npm audit --omit=dev`: Critical0,High0,total0. The SDK addition changed only its dependency closure; existing locked package versions were preserved.

PASS: `git diff --check`; changed/untracked-source secret-pattern scan (private-key/API-token/JWT/credential-URL signatures):0 findings; new skip/todo/only scan:0. Scope-limited limiter source has0 logging calls,0 raw-IP/raw-user-ID columns and0 direct state-table client grants by static inspection. This is not an exhaustive secret audit or actual grant execution. Full runtime-source service-role scan found one existing dormant/default-off reference in `lib/ai/persistent-embedding-cache.ts`; no new limiter service-role reference/dependency. Active v1 dependency is0 **conditional on the canonical persistent cache remaining off**; it would be inaccurate to claim that every runtime source reference is absent. No unrelated cache change was made.

Offline migration assertions are source-contract checks; they do not execute SQL or prove actual grants, Vault isolation, timeout enforcement or multi-session atomicity. Existing regression tests use an admitted dependency fixture to isolate their original contracts; new tests exercise the actual adapter with mocked transport, never claim DB atomicity from mocks. No disposable DB/psql/Docker harness was available. SQL concurrency and direct-RPC rejection execution remain LIVE UNVERIFIED rather than skipped test PASS.

Verdict: **V1-HARDENING-02D.2 COMPLETE — STAGING REHEARSAL REQUIRED**, scoped to repository implementation/offline validation. This does not authorize or certify activation/deployment. Staging/Production untouched; remote migration0,deploy0,real secret provisioning0,commit/push0. The new routes must not be deployed before the approved target migration/key rehearsal.

## Exact 02D.3 staging rehearsal — requires separate explicit authorization

1. Pin a clean committed candidate SHA and exact isolated staging Vercel/Supabase targets; capture migration ledger, target schemas/functions/owners/grants, settings preimages and backup. Confirm no Production credentials/targets. This task does not supply commit or migration authorization.
2. Verify Postgres version, pgcrypto placement, Vault view behavior/RLS, role creation/ownership capabilities, exposed schemas and PostgREST function timeout behavior. Apply only the reviewed additive migration to the explicitly authorized target. Record all six business-function preimages for rollback, not just new schema objects.
3. Provision isolated audience/signing/identity keys through separately approved ops, with only selected Vault secret refs accessible to limiter role. Verify zero direct table/internal-function client privileges; anonymous/authenticated signed wrapper grants intentional. Do not copy `.env.local` wholesale.
4. Direct RPC abuse: missing/invalid/tampered signature; unknown policy; arbitrary limit/window/fields; changed cost/digest/identity class; cross-env/version; null/malformed fields; expired/future envelope; nonce replay; assert zero admission writes for proof rejection. Measure invalid-call compute/request-size rejection; if unbounded cost cannot fit supported DB budget, block transport enablement.
5. Real concurrency: use an isolated fresh subject, `asset_write` N=6 (no provider). Ten independent DB/PostgREST sessions released simultaneously in <60s, unique signed nonces: exactly6 allowed,4 limited, bucket count6, every Retry-After1..60. Keep global tokens/daily budget unsaturated; distinguish limiter denials from timeout/capacity failures. Repeat with replayed nonce (one allowance max), two app instances, midnight and dual-key overlap. Mixed/global/provider tests assert all-or-none debit; no mock substitutes.
6. Test TVMaze rate1/s burst2 and details cost2 across search/details/calendar/two instances; Open Library1/s burst1 with real contact. Realistic bounded calendar refresh batch: UX/retry fairness, request arrivals, lost responses, upstream429 delta/date/invalid/excessive wait, exponential shared cooldown and manual recovery. Do not enable AniList/TMDB/AI.
7. Failures: DB down, auth late, invalid key, RPC timeout, 100ms lock contention, 10,000/20,000 capacity, scheduler outage/recovery. Assert no fail-open provider/paid/domain effects; queues/local library survive; requests do not retry uncertain admission. Measure p95<=150ms / p99<=500ms targets, relation/index/WAL/bloat/autovacuum and rejected-call overhead at supported traffic. Single-lock contention must fit this budget.
8. Verify six direct valid-token social mutators cannot spoof owner/bucket or exceed domain quota concurrently; verify existing strict row-count ceilings, cross-owner/RLS/dedupe/idempotency and own-data behavior. Other Auth/Storage/read/Cloud endpoints remain separate resource gates.
9. Verify actual Vercel ingress overwrite/proxy topology for Preview and Production; off-platform forged headers and missing IP unavailable; test IPv4/mapped IPv6-/64/NAT fairness. Verify WAF plan/rule slots/regions and native Supabase Auth/signup/Storage/Security Advisor manually; no assumptions from code.
10. Choose approved pg_cron or manual scheduler; run cleanup minute/batch<=500, prove idle deletion<=1h and correct live_rows after concurrent admission/delete. Bound cron history. Record secret rotation rehearsal and privacy/backup retention. Rollback restores all six original business definitions/ACLs, app candidate and env preimages; remove new objects/role only after dependents are restored. Never unblock by falling back to Map/provider fail-open.

LIVE UNVERIFIED: `DB_ATOMICITY_LIVE_UNVERIFIED`, SQL execution/ACL/Vault/role and timeout behavior, direct-RPC abuse cost/domain concurrency, two-instance performance/capacity/disk, Vercel ingress/WAF, real secret provisioning/rotation, cleanup scheduling/idle retention and existing Auth/Storage/privacy release gates. No browser/GUI/E2E or live provider smoke was performed.

## Files changed (59)

- `.env.example`
- `app/api/ai/interpret/route.ts`
- `app/api/ai/recommend/route.ts`
- `app/api/anilist/details/route.ts`
- `app/api/anilist/search/route.ts`
- `app/api/calendar/anilist/route.ts`
- `app/api/calendar/tmdb/route.ts`
- `app/api/calendar/tvmaze/route.ts`
- `app/api/openlibrary/search/route.ts`
- `app/api/personalization/themes/sync/route.ts`
- `app/api/social/assets/route.ts`
- `app/api/social/comments/route.ts`
- `app/api/social/connections/route.ts`
- `app/api/social/feed/route.ts`
- `app/api/social/notifications/route.ts`
- `app/api/social/people/route.ts`
- `app/api/social/preferences/route.ts`
- `app/api/social/profile/[username]/route.ts`
- `app/api/social/profile/hero/route.ts`
- `app/api/social/profile/route.ts`
- `app/api/social/profile/summary/route.ts`
- `app/api/social/reactions/route.ts`
- `app/api/social/recommendations/route.ts`
- `app/api/social/relationships/route.ts`
- `app/api/social/reports/route.ts`
- `app/api/tmdb/details/route.ts`
- `app/api/tmdb/search/route.ts`
- `app/api/tvmaze/details/route.ts`
- `app/api/tvmaze/search/route.ts`
- `app/api/xp/route.ts`
- `app/u/[username]/page.tsx`
- `docs/D8_RELEASE_ENV_MATRIX.md`
- `docs/V1_HARDENING_02D.md`
- `lib/api/distributed-rate-limit.ts`
- `lib/api/rate-limit-identity.ts`
- `lib/api/request-security.ts`
- `lib/social/route-response.ts`
- `lib/supabase/safe-error.ts`
- `lib/supabase/types.ts`
- `package-lock.json`
- `package.json`
- `supabase/migrations/20261004120000_application_rate_limit_v1.sql`
- `tests/anilist-global-search.test.ts`
- `tests/authenticated-mutation-boundary.test.ts`
- `tests/d8-ai-access-security.test.ts`
- `tests/d8-api-request-boundary.test.ts`
- `tests/d8-discovery-provider-release-policy.test.ts`
- `tests/helpers/admitted-rate-limit.ts`
- `tests/p6-theme-transfer-sync.test.ts`
- `tests/recommendation-provider-adapters.test.ts`
- `tests/recommendation-v2-d6-acceptance.test.ts`
- `tests/recommendation-v2-d661r-ranked-tag-retrieval.test.ts`
- `tests/release-calendar-routes.test.ts`
- `tests/social-avatar.test.ts`
- `tests/social-preferences-read-only.test.ts`
- `tests/social-profile-loader.test.ts`
- `tests/v1-csp-xss.test.ts`
- `tests/v1-distributed-rate-limit.test.ts`
- `tests/v1-error-leakage.test.ts`
