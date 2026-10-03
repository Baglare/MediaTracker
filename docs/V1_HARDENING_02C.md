# V1-HARDENING-02C — safe application logging and error surfaces

2026-10-03–04. Local implementation on `release/v1-hardening`. Starting HEAD `0a32d4238f821b6943e73b23ad3a252e195236d1`; clean working tree. Installed Next **16.3.8**, Node **24.14.0**. Committed 01B records `COMPLETE_WITH_DOCUMENTED_DEV_EXCEPTION`; 02A/02B record COMPLETE. The 02B full-suite evidence records 2,738 passed / 59 conditional skips. Baseline full-suite success is historical evidence, not a separately rerun pre-edit suite. Installed Next route-handler and error-handling guides were read.

## Inventory and findings

Inventory preceded edits. Explicit runtime/browser/script/test searches covered console calls, logging helpers, serialization, headers/body/session/env handling, provider/Supabase exceptions and route catches. A subsequent committed-HEAD inventory records each original console location below. Classes: A runtime, B browser, C ops, D test, E dev-only, F documentation/example.

| Class | Original console call sites | Disposition |
| --- | ---: | --- |
| A runtime | 6 | Four provider detail handlers logged raw Error objects; AniList search logged a static empty-result notice; social parsing logged controlled count/reasons. Raw errors removed; empty-result noise removed; social notice uses allowlisted telemetry. API failure boundary now logs controlled metadata. |
| B browser | 7 | Global/discovery/TVMaze catches and cloud repository exposed arbitrary errors; storage/profile preferences emitted static warnings. All use closed telemetry. Cloud delete/RPC retry results and unknown auth errors no longer expose SDK messages. |
| C ops/scripts | 26 | Existing boolean/masked gate outputs, fixed notices, synthetic smoke checklist and cleanup summaries retained. Arbitrary catch messages replaced by a known diagnostic allowlist. DB/CLI subprocess stdout/stderr suppressed; only exit status is reported. |
| D test-only | 19 | Existing opt-in live fixtures report scenario/status/count/revision summaries. Test SDK errors remain test assertions, not imported production code. Live gates unchanged and not enabled. |
| E dev-only | 0 direct console calls | Annotation API/UI is guarded outside production; typed controlled diagnostics remain. No new debug logging. |
| F documentation/example | 0 console call sites in tracked Markdown baseline | Historical descriptions and serialization examples are explanatory, not runtime sinks; unchanged. |

Outbound `JSON.stringify(requestBody)` in candidate search and provider/research HTTP clients serializes necessary request payloads for transport, not logging. Internal errors used for exact application-code classification are distinguished from error output. No existing central logging/request-ID helper was found. ML service has no explicit application print/logger sink and remains outside the enabled v1 web path.

Additional findings: OMDb legacy detail returned upstream `Error`; AniList GraphQL exceptions embedded raw messages; AI provider exceptions embedded transport error/upstream body text; embedding/research warnings copied arbitrary exception messages; Supabase social server exceptions could reach framework logging. These paths now use fixed messages or closed internal diagnostic/application codes. Upstream body inspection needed for existing quota classification is preserved but never emitted. Supabase `details`/`hint` are not propagated; raw `message` is accepted only when exactly equal to an existing known application code. SDK SQLSTATE is not needed in current logs and is dropped.

## Application contract

`lib/security/safe-logging.ts` is the sole application console sink. `safeLog` emits a bounded JSON object with a generated ISO timestamp. Unknown keys, nested values, accessors, arbitrary strings, invalid/oversized values and Error objects are dropped. Input is never enumerated or recursively serialized; getters/toJSON are not invoked. Console/shape failure is swallowed. Redaction means omission, not partial masking of free text.

| Field | Accepted value |
| --- | --- |
| event | route_error, provider_error, cloud_error, client_error, storage_error, social_parse_skipped |
| requestId | Bounded UUID v4; API values generated internally, never copied from incoming headers |
| route | Exact code-owned API template allowlist, including `[username]`; no actual usernames/query strings |
| method | GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS |
| status | Integer 100–599 |
| latencyMs | Finite nonnegative number, rounded and capped at 3,600,000 |
| provider | Closed TVMaze/Open Library/TMDB/AniList/OMDb/OpenAI/Groq/Gemini/OpenRouter/Supabase identifiers |
| errorCode | request_rejected, unauthorized, forbidden, rate_limited, upstream_error, internal_error, operation_failed |
| deploymentSha | Exactly 40 lowercase hex characters; optional, no env dump/read |
| schemaStage | D2C1 or v1 |
| rateLimited | Boolean |

Forbidden by default: Authorization, Cookie/Set-Cookie, access/refresh/session/JWT/service-role/provider/API/Vercel keys, DB URLs/passwords, email, owner/user IDs, raw IP, notes/comments/messages/profile free text/search queries, AI prompt/response, request/provider bodies, raw headers, full URLs/query strings, SQL/details/hints and stacks. Sensitive values also fail field-value validation when deliberately supplied under allowlisted string keys. Logs contain operational classifications, never user content.

`lib/api/safe-route.ts` wraps every exported handler in all **35 API route files**. It creates a fresh request ID, uses AsyncLocalStorage for concurrent correlation and returns it as `X-Request-Id`, including denied/failure responses. Inbound IDs are ignored. No tracing vendor, request body parsing, authorization or rate-limit change is introduced. Existing response cache headers and controlled JSON contracts remain; unexpected throws become HTTP 500 `{ "error": "internal_error" }` with private/no-store. Existing stable `code` fields and deterministic Turkish `message` responses remain compatible with current UI. OMDb raw upstream error becomes `omdb_upstream_error`.

Route error logs contain application status/normalized code/latency/template/ID; they do not read the response body. Provider detail catches no longer log raw exceptions. Provider timeout/5xx errors retain existing bounded public behavior; provider search responses use `upstream_error`. AI/research stays disabled; mocked adapter tests prove dormant transport failures cannot carry raw upstream detail. Research diagnostics retain only existing allowlisted internal codes. No Retry-After header is copied into telemetry and no additional upstream work is introduced.

Browser Cloud Media/Goal RPC failures remain retryable with stable `cloud_operation_failed` / `goal_cloud_operation_failed`; owner, revision, idempotency, tombstone and queue behavior remain. The existing Cloud Media assertion was updated to the intentional stable-code contract without removing retry assertions. Auth still translates known user-facing failures; unknown SDK messages receive a generic Turkish fallback. Existing local validation and controlled API messages remain available to UI.

Ops logs may name known missing gate variables, but never their values. `safe-ops-error.mjs` preserves exact known safety diagnostics and drops unrecognized SDK/URL/credential strings. Masked boolean hard-gate output is unchanged. DB/CLI row/error output is intentionally no longer forwarded: command completion is exit-status evidence only, not approval of every SQL result. Detailed operational/advisor review needs a separately authorized secure review; no DB/CLI operation was executed in this task.

## Observability boundary and residuals

This is an application logging contract, not a log transport, retention/deletion policy or platform-level redactor. No external vendor/drain, dashboard, environment or retention setting was changed. Browser events stay in the local console; API events use the existing server console. Sink failure may lose telemetry and error-only logging is not a complete request/metric history. No historical log deletion or cleanup is claimed.

Vercel independently collects invocation/request/platform metadata and dependency/framework diagnostics; this helper cannot rewrite those or cover pre-handler crashes/fatal rendering. Actual deployed log content, account plan, access control and effective retention are **LIVE UNVERIFIED**. [Current Vercel runtime-log documentation](https://vercel.com/docs/logs/runtime#limits), checked 2026-10-04, gives plan-dependent retention (Hobby 1 hour, Pro 1 day, Enterprise 3 days; Observability Plus 30 days). Do not infer the project's actual retention from these limits. Future transport/retention/access/deletion decisions require separate authorization and retain no-PII-by-default.

## Validation

- PASS: redaction/error leakage/ops tests, 3 files / 28 tests, including malicious keys/values, JWT/email/DB URL/password/note/query fixtures, nesting/getters/oversize, sink failure, concurrent IDs, provider timeout/500, malformed JSON, auth, mocked RLS/DB and unexpected Error; mocked OpenAI/Gemini and research diagnostics.
- PASS: affected provider/Supabase/cloud/calendar tests plus 02A authenticated/request boundary and 02B CSP/XSS regressions, 15 files / 493 tests.
- PASS: full Vitest, **194 files passed / 18 conditional files skipped; 2,766 passed / 59 existing conditional tests skipped / 0 failed**. Live fixtures remain disabled. New skip/todo/only count: 0.
- Typecheck, lint, production build and final source/secret/diff scans: final ledger below.
- PASS: runtime `npm audit --omit=dev`: 0 Critical / High / total vulnerabilities. No package/lockfile edits.
- NOT RUN: browser automation/visual smoke, E2E, hosted Preview, Production/Staging calls, live auth/provider/DB checks. Their execution was not authorized for this task.

Initial targeted/full runs identified the intentional Cloud Media error-contract assertion and over-generalized ops diagnostics; both were corrected while retaining fail-closed/retry assertions. A temporary edit-script error in Gemini prompt/error substitution was corrected before final validation. Tests were not weakened, skipped or replaced by unconditional fallbacks.

## Release boundary

No 02C external action is required for the local application contract. Hosted log/retention review remains manual evidence, not a claim of deployed hardening. The existing [canonical D8 hold table](D8_RELEASE_CANDIDATE_ACCEPTANCE.md#d8-4a5d-kanonik-production-hold-tablosu) retains all release blockers; D8-4B stays frozen. No Production/Staging mutation, deploy, env change, migration, backup/restore, provider/AI enablement, rate-limiter change, legal/privacy rewrite, commit or push. No Vault mutation/autopilot was performed under the no-commit/push/no-external-mutation boundary.

## Original console locations (committed baseline)

| Class | File | Lines at starting HEAD |
| --- | --- | --- |
| A | `app/api/anilist/details/route.ts` | 133 |
| A | `app/api/anilist/search/route.ts` | 383 |
| A | `app/api/omdb/details/route.ts` | 33 |
| A | `app/api/tmdb/details/route.ts` | 140 |
| A | `app/api/tvmaze/details/route.ts` | 156 |
| B | `components/global-search.tsx` | 286 |
| B | `components/tvmaze-search.tsx` | 115, 138 |
| B | `features/discovery/hooks/use-discovery-controller.ts` | 231 |
| B | `lib/profile-preferences.ts` | 132 |
| A | `lib/social/interactions-server.ts` | 85 |
| B | `lib/storage.ts` | 191 |
| B | `lib/supabase/cloud-repository.ts` | 29 |
| C | `scripts/cloud-v2-browser-smoke.mjs` | 50, 52, 109, 123, 201, 229, 232, 260 |
| C | `scripts/d8-security-advisor-staging.mjs` | 10, 17, 27, 51, 58, 67, 72, 76 |
| C | `scripts/d8-staging-hard-gate.mjs` | 7, 45 |
| C | `scripts/d8-staging-postcheck.mjs` | 7, 18, 22 |
| C | `scripts/d8-staging-preflight.mjs` | 7, 19, 23 |
| C | `scripts/d8-staging-rollback-check.mjs` | 7, 12 |
| D | `tests/cloud-media-owner-scoped-pk-live.integration.test.ts` | 305, 633 |
| D | `tests/cloud-media-v2-client-live.integration.test.ts` | 255, 480 |
| D | `tests/cloud-media-v2-conflicts-live.integration.test.ts` | 354, 654 |
| D | `tests/cloud-media-v2-live.integration.test.ts` | 228, 522 |
| D | `tests/recommendation-d7-r3b-groq-live.integration.test.ts` | 52 |
| D | `tests/recommendation-d7-r4b-shadow-live.integration.test.ts` | 39 |
| D | `tests/recommendation-d7-r5a-live.integration.test.ts` | 82 |
| D | `tests/recommendation-d7-r5b-stability-live.integration.test.ts` | 76, 93, 120 |
| D | `tests/recommendation-d7-r5b1-stability-live.integration.test.ts` | 81, 97 |
| D | `tests/recommendation-d7-r5b2-live.integration.test.ts` | 83 |
| D | `tests/recommendation-d7-r5c-cache-live.integration.test.ts` | 40 |
| D | `tests/recommendation-d7-r6b-live.integration.test.ts` | 46 |

## Changed files

- `app/api/ai/capabilities/route.ts`
- `app/api/ai/interpret/route.ts`
- `app/api/ai/recommend/route.ts`
- `app/api/anilist/details/route.ts`
- `app/api/anilist/search/route.ts`
- `app/api/calendar/anilist/route.ts`
- `app/api/calendar/tmdb/route.ts`
- `app/api/calendar/tvmaze/route.ts`
- `app/api/cloud/rollout/route.ts`
- `app/api/dev/recommendation-annotation/route.ts`
- `app/api/omdb/details/route.ts`
- `app/api/omdb/search/route.ts`
- `app/api/openlibrary/search/route.ts`
- `app/api/personalization/themes/sync/route.ts`
- `app/api/providers/capabilities/route.ts`
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
- `components/global-search.tsx`
- `components/tvmaze-search.tsx`
- `docs/D8_FIRST_RELEASE_SECURITY_AND_PRIVACY.md`
- `docs/V1_HARDENING_02C.md`
- `features/discovery/hooks/use-discovery-controller.ts`
- `features/goals/cloud/client.ts`
- `features/recommendations/research/acquisition/wikipedia-acquirer.ts`
- `features/recommendations/research/adapters/wikidata/identity-resolver.ts`
- `features/recommendations/research/adapters/wikipedia/page-resolver.ts`
- `features/recommendations/research/discovery/orchestrator.ts`
- `features/recommendations/research/orchestration/direct-source-research.ts`
- `features/recommendations/research/passages/packet-builder.ts`
- `features/recommendations/research/shadow/orchestrator.ts`
- `hooks/use-auth.ts`
- `lib/ai/embedding-provider.ts`
- `lib/ai/providers/gemini-provider.ts`
- `lib/ai/providers/openai-compatible-provider.ts`
- `lib/api/safe-route.ts`
- `lib/cloud-media-v2-client.ts`
- `lib/profile-preferences.ts`
- `lib/security/safe-diagnostic.ts`
- `lib/security/safe-logging.ts`
- `lib/social/interactions-server.ts`
- `lib/storage.ts`
- `lib/supabase/cloud-repository.ts`
- `lib/supabase/safe-error.ts`
- `scripts/cloud-v2-browser-smoke.mjs`
- `scripts/d8-security-advisor-staging.mjs`
- `scripts/d8-staging-hard-gate.mjs`
- `scripts/d8-staging-postcheck.mjs`
- `scripts/d8-staging-preflight.mjs`
- `scripts/d8-staging-rollback-check.mjs`
- `scripts/d8-staging-target.mjs`
- `scripts/safe-ops-error.mjs`
- `tests/cloud-media-v2-client.test.ts`
- `tests/v1-error-leakage.test.ts`
- `tests/v1-ops-redaction.test.ts`
- `tests/v1-safe-logging.test.ts`

## Final ledger

| Check actually run | Result |
| --- | --- |
| Redaction/negative-leak/ops tests | PASS: 28 tests |
| Targeted provider/Supabase/02A/02B regressions | PASS: 15 files / 493 tests |
| Full Vitest | PASS: 194 files / 2,766 tests; 18 files / 59 existing conditional skips; 0 failed |
| Typecheck (`tsc --noEmit --incremental false`) | PASS |
| Lint | PASS: 0 errors; 1 pre-existing internal-navigation warning |
| Production build | PASS: existing dormant annotation filesystem tracing warnings; all 35 API routes remain dynamic |
| Runtime npm audit (`--omit=dev`) | PASS: 0 Critical / High / total |
| Changed ops `node --check` | PASS |
| New skip/todo/only scan | PASS: 0 additions |
| Logging AST + explicit source-pattern scan | PASS: sole console sink is safe-logging; 0 raw runtime request/header/body/env/error log sinks |
| Changed-file secret-pattern scan | PASS: runtime/non-test matches 0; 2 intentional synthetic credential-URL fixtures in new tests; no real credentials found |
| `git diff --check` | PASS |
| Request-security/rate-limiter baseline comparison | PASS: unchanged |
| Hosted/Production/Staging/browser/live | NOT RUN; untouched |

**Verdict: V1-HARDENING-02C COMPLETE** for local application implementation and the requested offline validation. No remaining local 02C hardening blocker. Platform logs, effective retention and live deployment remain unverified and do not imply D8-4B authorization.
