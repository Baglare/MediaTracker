# V1-HARDENING-04B.3 — AniList v1 live access

Date: 2026-10-05. Local implementation and validation; no hosted CI, immutable RC,
Preview or Production acceptance is asserted by this document.

## Policy and baseline

Started clean on `release/v1-hardening`, HEAD/upstream local ref
`c4248b90e91369ded85a3355d9f197403e7cd4ef` (04B.2). Local history includes
01, 02A/B/C, 02D, 03 and 04B.1/2. Prior 02D acceptance, 04A audit readiness
and GitHub Actions PASS are supplied baselines, not remote checks performed here.

- `ANILIST_LIVE_ACCESS = DISABLED_PENDING_WRITTEN_AUTHORIZATION`
- `ANILIST_V1_LIVE_ACCESS = BLOCKED_EXTERNAL_AUTHORIZATION`
- `ANILIST_ENV_BYPASS = CLOSED`
- `ANILIST_LIVE_TEST_BYPASS = CLOSED`

AniList capability is always `{ enabled: false, reason: "authorization_required" }`
in Production, Preview, Development, CI and normal local runtime. Missing,
`disabled`, `preview_test`, `authorized` and arbitrary mode values have no effect;
NODE_ENV and VERCEL_ENV cannot grant access. Written authorization alone does not
change running code: post-release enablement requires a reviewed source change.
This external enablement gate is `POST_RELEASE_GATE`, not an enabled-v1 blocker.

Before: release-policy accepted `authorized` everywhere and `preview_test` in
Preview/development. The env-gated D6 integration test independently called AniList
GraphQL, bypassing release policy. Both paths are removed. No authorization file,
secret, alternative env switch, OAuth or account sync was added.

## Network inventory and route proof

The three `graphql.anilist.co` endpoint literals remain only in dormant route
implementations: `app/api/anilist/search/route.ts`,
`app/api/anilist/details/route.ts`, `app/api/calendar/anilist/route.ts`.
All already order validation -> capability -> distributed admission -> upstream.
No route reordering is needed. With real v1 policy, valid requests return controlled
503, `provider_unavailable`, `authorization_required`, `Cache-Control: no-store`;
fetch and admission calls are both zero, hence no provider debit.

The former fourth literal and AniList live tests were removed from
`tests/recommendation-provider-live.integration.test.ts`. TVMaze/Open Library and
existing TMDB/OMDb test gating remain unchanged. No direct AniList endpoint exists
in executable scripts/tooling/research/live smoke. Documentation references are
descriptive; historical D6/D8 live evidence is retained and explicitly superseded
for current release policy by the notes in current status documents.

The source-aware AST guard scans executable app/lib/features/components/tests/scripts
and allows endpoint literals only in the three dormant routes. Capability behavior
tests independently cover all mode/environment combinations. Fixture route tests
mock capability and fetch explicitly; they do not configure a runtime bypass.
An isolated evaluation of the live integration source with `D6_PROVIDER_LIVE_SMOKE=1`
executes all remaining cases using fixture transport (including synthetic TMDB/OMDb
keys): AniList transport invocations zero. This is offline regression proof, not
live-provider acceptance.

## Legacy, recommendation, discovery and Calendar

Normalizers, AniList types, evidence adapters, taxonomy/ranked-tag retrieval mapping,
relations, series grouping and candidate fixtures remain. Legacy normalized records
retain decode, local persistence, portable backup, cloud row mapping, classification,
saved card rendering and existing cover URL compatibility without API access.
`adaptAniListEvidence` still produces verified identity and genre/tag claims.

Capabilities publish AniList disabled. Existing capability-aware global categories
and advanced Discovery rendering exclude AniList live surfaces; no UI redesign or
internal authorization explanation was added. Anime/manga library surfaces remain.
Recommendation live proxy searches cannot obtain new AniList candidates. Calendar
can resolve a legacy AniList identity and call its internal route, which returns
unavailable before upstream. Existing stale-cache/fail-soft semantics are preserved.
TVMaze/Open Library production code is unchanged; TMDB/OMDb policies are unchanged.

## Environment and future authorization

`MEDIA_TRACKER_ANILIST_MODE` is removed from `.env.example`, README active env table
and both active release matrix tables. The matrix marks any old value ignored in
v1. Historical UAT/evidence is not rewritten. No populated env file or remote env was changed.

Future post-release gate, documentation only:
1. Obtain written AniList authorization evidence and exact approved use case.
2. Review whether OAuth/account integration is required for that use case.
3. Define import/sync/progress ownership and compatibility contracts.
4. Review rate limits and privacy/data flows.
5. Make an explicit source-code capability change under a separate authorized task.
6. Run authorized Preview live smoke, then CI and release acceptance.

Env-only enablement remains insufficient. Provider v1 status: TVMaze enabled with
its existing manual ShareAlike interpretation gate; Open Library requires valid UA
and retains its external registration gate; AniList hard-disabled in every runtime;
TMDB and OMDb remain disabled by current release policy.

## Validation

| Check | Result |
| --- | --- |
| AniList focused contracts + documentation links, final run | PASS: 73 tests, zero failures/skips |
| Full Vitest | PASS: 2938 passed, zero failed, 57 existing conditional live skips, zero TODO |
| 02D limiter / 02B CSP-URL / 02C logging-redaction | PASS in full suite; 45 limiter, 71 CSP, 15 safe-logging, 3 ops-redaction tests |
| TVMaze / Open Library regression | PASS: 62 / 50 tests in full suite; implementation unchanged |
| Calendar / recommendation / discovery regressions | PASS in full suite; static fixtures and dormant mocked routes preserved |
| TypeScript `tsc --noEmit --incremental false` | PASS |
| Tracked/new source ESLint via existing ESLint API and ignore rules | PASS: 848 files, zero errors; one existing warning in unrelated recommendation-composer |
| `npm run build` with offline preload | PASS |
| `npm audit --omit=dev --audit-level=high` | PASS: zero vulnerabilities, Critical/High zero |
| CI policy/helper tests | PASS: 40 tests |
| CI repository/migration/test-integrity checks (`--repository-only`) | PASS, no new unconditional skip/todo/only |
| `git diff --check` | PASS |
| Executable AniList endpoint AST inventory | PASS: only three dormant gated routes |
| `D6_PROVIDER_LIVE_SMOKE=1` isolated fixture evaluation | PASS: zero AniList invocations; five remaining cases execute offline |
| Hosted CI / clean CI environment / browser / external live smoke | NOT RUN; populated local env makes clean CI environment check inapplicable |

Initial sandbox validation failed before tests on temporary module-cache rename;
the validation process temp directory was moved inside ignored local evidence.
The first full run found an as-yet missing new document link, relative offline
preload resolution in a child with another cwd, and sandbox junction permissions.
The document was added, preload made an absolute file URI, and full Vitest rerun
with local junction permissions. No assertions or test skips were weakened.
Final targeted validation also covers the subsequent test-only type correction and
stronger anime/manga/novel exclusion assertions.

External TCP/UDP is blocked during Vitest/build by the existing CI offline preload. Runtime npm audit
contacts only the package registry advisory service. No AniList request, external
authorization action, hosted service access/mutation, deployment, migration,
commit or push is performed. Browser/GUI/live smoke is not run.

Vault contextual retrieval returned `VAULT_GIT_INVALID`. Durable provider policy
may warrant a later routed knowledge update; no Vault write/commit/push is performed
under this task's explicit no-commit/no-push boundary.

## Files changed

- `lib/providers/release-policy.ts`
- `tests/v1-anilist-hard-disable.test.ts` (new)
- `tests/d8-discovery-provider-release-policy.test.ts`
- `tests/anilist-global-search.test.ts`
- `tests/recommendation-v2-d661r-ranked-tag-retrieval.test.ts`
- `tests/recommendation-provider-live.integration.test.ts`
- `.env.example`
- `README.md`
- `docs/D8_RELEASE_ENV_MATRIX.md`
- `docs/D8_RELEASE_CANDIDATE_ACCEPTANCE.md`
- `docs/D8_PREVIEW_UAT.md`
- `docs/D8_PRODUCTION_CUTOVER_RUNBOOK.md`
- `docs/ROADMAP.md`
- `docs/V1_HARDENING_04B3.md` (new)

Verdict: `V1-HARDENING-04B.3 COMPLETE — ANILIST V1 LIVE ACCESS HARD-DISABLED`.
Remaining AniList external gate: written authorization and the separately accepted
post-release enablement plan above. Current Production cutover remains frozen
pending its existing immutable RC/CI/manual gates.
