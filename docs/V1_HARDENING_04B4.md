# V1-HARDENING-04B.4 — TMDB v1 live access

Date: 2026-10-05. Local implementation/validation only; no hosted CI, immutable
RC, Preview, Staging or Production acceptance is asserted here.

## Baseline and policy

Started clean on `release/v1-hardening`, HEAD and local remote-tracking ref
`61843b46090fdbd4b7536e411a7a7d88457c31a8`. History includes 01, 02A/B/C/D,
03 and 04B.1/2/3. Prior acceptance, 04A audit readiness and GitHub Actions PASS
are supplied baselines, not independently rechecked remote results.

- `TMDB_V1_LIVE_ACCESS = HARD_DISABLED`
- `TMDB_ENV_ENABLEMENT = CLOSED`
- `TMDB_LIVE_TEST_BYPASS = CLOSED`
- `TMDB_RETENTION = POST_RELEASE_ENABLEMENT_PREREQUISITE`
- `TMDB_AI_ISOLATION = POST_RELEASE_ENABLEMENT_PREREQUISITE`
- `TMDB_ATTRIBUTION_BRANDING = POST_RELEASE_ENABLEMENT_PREREQUISITE`

Capability is always `{ enabled: false, reason: "disabled_by_policy" }` in
LOCAL, DEVELOPMENT, CI, PREVIEW and PRODUCTION. Previously `noncommercial`
mode + token + approved-logo option could enable TMDB; that branch, logo constant
and options parameter are removed. No token, mode, NODE_ENV, VERCEL_ENV or logo
option grants live access. Future enablement requires a separate source change.

## Environment and route proof

`MEDIA_TRACKER_TMDB_MODE` is removed from `.env.example`, README active env table
and both active release env matrices; old values are ignored. Token is unnecessary
for normal LOCAL runtime and forbidden/unset in CI/PREVIEW/PRODUCTION v1. No
populated env file or remote env was changed; synthetic tokens exist only in tests.

Search, details and Calendar already order input validation -> capability ->
limiter -> token -> upstream. Their implementation/normalizers remain dormant.
Real-policy tests with valid input and a synthetic token verify all three return
503, `provider_unavailable`, `disabled_by_policy`, `Cache-Control: no-store`;
upstream fetch and distributed admission are zero, hence no provider debit.
Token reading after denial is unreachable and is not an operational dependency.

## Direct network inventory

| Class | Inventory/disposition |
| --- | --- |
| A — dormant API routes | `api.themoviedb.org` only in `app/api/tmdb/search/route.ts`, `app/api/tmdb/details/route.ts`, `app/api/calendar/tmdb/route.ts`; denied before upstream |
| B — image compatibility | `image.tmdb.org` in dormant search/details normalizers, `next.config.ts`, CSP allowlist and fixture cover tests; saved covers retained |
| C — tests | Direct TMDB live block removed from `recommendation-provider-live.integration.test.ts`; synthetic token/mock/fixture coverage remains |
| D — scripts/tooling | No direct TMDB metadata endpoint/token network path found |
| E — docs | Env/current policy updated; historical evidence retained |
| F — recommendation/internal | Candidate search uses internal search route; evidence adapter uses internal details route; both fail closed under real policy |

The deterministic TypeScript AST guard scans executable app/lib/features/components/
tests/scripts, allowing metadata endpoint literals only in the three dormant routes.
Behavioral tests cover mode/token/environment combinations. An isolated execution
of the live integration source with live flag and synthetic tokens runs its four
remaining cases against fixture transport: zero AniList/TMDB invocations. No new
live flag, test bypass or unconditional skip was added. Image CDN browser requests
for saved posters are distinct from metadata API enablement.

## Offline compatibility and UI/Calendar

Normalizers, `adaptTmdbEvidence`, fixture adapters, stored snapshots and exact
identity/IMDb bridges remain. Tests preserve decode, local persistence, portable
backup, cloud row mapping, movie classification, progress/rating/personal notes,
saved card/detail markup and poster URLs without TMDB API calls.

Real capability endpoint excludes movie live search; existing capability-aware
Discovery/global search and About attribution guards remain. The dormant online
search wording now states v1 disabled and separate future review. Film library,
manual entry and stored records are retained.

Recommendation search cannot acquire live TMDB candidates; attempted internal
details enrichment returns unavailable and preserves an existing verified fixture
candidate fail-soft. `offline compatibility != live provider enablement`.
Legacy Calendar identity still resolves; real route denies new upstream work while
existing stale cache is retained. Manual events and TVMaze/AniList behavior remain
covered by neighboring tests.

## Future prerequisites and risk disposition

04A `TMDB_V1_ENABLEMENT_BLOCKED_BY_RETENTION` is not remediated here. Live
acquisition is hard-disabled, so retention is a post-release enablement prerequisite,
not an enabled-v1 blocker. No fetched-at field, purge engine, cloud cleanup, backup
rewrite, schema change or legacy deletion is introduced. Existing records still
require future provider/legal review.

Stored TMDB data can still traverse offline evidence/verifier/research logic;
hard-disable is not provenance isolation. V1 AI server access/research disabled
policies remain unchanged. No new live TMDB acquisition is possible. Before future
enablement, provider-provenance hard isolation must be reviewed and implemented.
No attribution gate is called CLOSED, and no approved/fake logo is supplied.

Future enablement requires provider/legal review, retention remediation, AI/ML
isolation, attribution/branding, a separate reviewed source change and release
acceptance. Provider v1 status: TVMaze enabled with existing manual ShareAlike gate;
Open Library requires valid contact UA and retains external registration gate;
AniList hard-disabled pending authorization; TMDB hard-disabled; OMDb public disabled.

## Validation

| Check | Result |
| --- | --- |
| Focused policy/routes/network guard/legacy/recommendation/Calendar/limiter/images/logging | PASS: 218 tests; four existing conditional live skips |
| TVMaze/Open Library/CSP/ops-redaction regressions | PASS: 186 tests, zero skips/failures |
| Full Vitest, final run | PASS: 2950 passed, zero failed, 56 existing conditional live skips, zero TODO |
| Typecheck `tsc --noEmit --incremental false`, final run | PASS |
| Tracked/new source ESLint with existing ignore rules | PASS: 849 files, zero errors; one unrelated existing recommendation-composer warning; ESLint config unchanged |
| Build with offline preload | PASS; 15 existing dynamic-filesystem tracing warnings in unchanged annotation tooling |
| Runtime `npm audit --omit=dev --audit-level=high` | PASS: zero vulnerabilities, Critical/High zero |
| CI helper tests | PASS: 40 tests, zero failures/skips |
| CI repository/migration/test-integrity checks, `--repository-only` | PASS; no new unconditional skip/todo/only |
| Executable TMDB endpoint AST inventory | PASS: only three dormant gated routes |
| Live-test source evaluated offline with live flag + synthetic tokens | PASS: four remaining cases; zero TMDB/AniList transport invocations |
| `git diff --check` | PASS |

The first focused run caught a wrong fixture field (`notes` instead of the actual
`personalNotes` contract). The first full run caught a view-wrapper assertion in
the new stale-cache test and an existing D7 junction sandbox EPERM. The fixture and
assertion were corrected, and full Vitest was rerun with local junction permission;
no runtime contract, assertion strength or test skip was relaxed.

Hosted CI, clean credential-
free CI environment, browser/GUI and live smoke are NOT RUN. External TCP/UDP is
blocked during Vitest/build with existing `scripts/ci-offline.mjs`; runtime npm
audit contacts only the package registry advisory service. No TMDB live request,
token/env provisioning, remote mutation, migration, deployment, commit or push.

Vault contextual retrieval returned `VAULT_GIT_INVALID`. Durable provider policy
warrants a routed knowledge update when available; no Vault write/commit/push is
performed under this task's explicit boundary. Production cutover remains frozen
pending existing immutable RC/CI/manual gates.

## Files changed and verdict

- `lib/providers/release-policy.ts`
- `components/online-search.tsx`
- `tests/v1-tmdb-hard-disable.test.ts` (new)
- `tests/d8-discovery-provider-release-policy.test.ts`
- `tests/recommendation-provider-live.integration.test.ts`
- `tests/v1-anilist-hard-disable.test.ts` (shared isolated live-source proof)
- `.env.example`, `README.md`
- `docs/D8_RELEASE_ENV_MATRIX.md`, `docs/D8_RELEASE_CANDIDATE_ACCEPTANCE.md`
- `docs/D8_PREVIEW_UAT.md`, `docs/D8_PRODUCTION_CUTOVER_RUNBOOK.md`, `docs/ROADMAP.md`
- `docs/AI_PROVIDER_EVIDENCE_MATRIX.md`, `docs/AI_RECOMMENDATION_V2_PROVIDER_ENRICHMENT.md`
- `docs/V1_HARDENING_04B4.md` (new)

Verdict: `V1-HARDENING-04B.4 COMPLETE — TMDB V1 LIVE ACCESS HARD-DISABLED`.
This is local technical completion, not hosted CI or Production release acceptance.
No TMDB-specific enabled-v1 blocker remains; future prerequisites above remain open.
