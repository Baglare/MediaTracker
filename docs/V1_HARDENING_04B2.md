# V1-HARDENING-04B.2 — Open Library v1 usage boundary

Date: 2026-10-05. `OPEN_LIBRARY_TECHNICAL_GATE = CLOSED` (local source validation).
`OPEN_LIBRARY_APPLICATION_REGISTRATION = MANUAL_EXTERNAL_GATE` remains open.
This does not accept a new immutable RC, Production configuration or hosted CI.

## Baseline and network inventory

Started on `release/v1-hardening`, clean tree, HEAD
`eecdb8d53f1783b038e3bcd6b1621dba03b7008a`. Local history includes 01,
02A/B/C, 02D, 03 and 04B.1. 02D acceptance is the existing measured acceptance;
03/04B.1 GitHub CI PASS and 04A audit readiness are supplied task baselines,
not newly verified remote evidence.

Before: human-triggered global/advanced book search and user-requested candidate
search call `POST /api/openlibrary/search` -> `https://openlibrary.org/search.json`;
the recommendation evidence pipeline additionally fetched `/works/{id}.json`
per candidate. Browser images use `https://covers.openlibrary.org/b/id/...`.
The conditional live test also contains `/books/{id}.json`; it is test-only and
was not enabled. No other production upstream Open Library metadata path was found
in app/lib/features/components/scripts.

After: Search API is the sole production metadata fetch path, enabled only with
valid configuration and distributed admission. Work API fetch helper and its
pipeline loader are removed. Browser covers and source-page navigation remain.
No bulk harvesting, background refresh, alternate enrichment or crawling is added.

## Identity, cache and admission

`isValidProviderUserAgent` is shared by runtime `providerUserAgent`, Open Library
capability, and existing TVMaze UA use. The bounded printable ASCII contract requires
`MediaTracker/<numeric version> (<usable email>)`, rejects CR/LF/control characters,
arbitrary app/browser identities, malformed/contactless values and values over
256 characters. Intended deployment value:
`MediaTracker/1.0 (mediatracker.contact@gmail.com)`. No environment was changed.
TVMaze remains enabled; its route regressions pass with the shared helper.

Search retains POST JSON, strict bounded query, capability-before-admission,
max 12 results, timeout, safe stable errors and normalized metadata. Malformed
identities are discarded; retained text/arrays are bounded. Upstream fetch explicitly
uses `cache: no-store`, and client responses remain `no-store`.

The server-only ephemeral LRU cache stores successful nonempty normalized results:
64 entries, fixed five-minute TTL, schema key `openlibrary:search:v1` plus SHA-256
of the trimmed bounded query. No raw query logging or plaintext query Map keys;
hashing is not a secrecy guarantee. No DB, Redis, localStorage, persistent framework
cache, negative/error/429 cache or background refresh. Restart clears memory.

Order: validation -> capability/UA -> distributed `openlibrary_search` admission
-> cache -> upstream on miss -> shared cooldown -> normalize -> successful cache.
02D atomically binds application quota, provider debit and shared cooldown in one
RPC. Hits therefore still debit admission/provider budget, but make no upstream
request. Splitting this would require a new DB policy/migration; neither is needed
or authorized here. The existing conservative global Open Library policy stays
one request/second, burst one, under the supplied identified-client limit of three
requests/second; application search remains 60/60s.

All production Open Library metadata fetches now share this route's 429 boundary.
Existing Retry-After normalization caps at 86400 seconds, defaults invalid headers
to 30 seconds and reports `report_provider_cooldown_v1`. Shared reporting/admission
outage fails closed with 503; successful cooldown reporting yields stable 429.
Offline tests prove the signed Open Library cooldown policy and denial of the next
request before fetch. Existing SQL authority/backoff is unchanged, not re-tested live.

## Evidence, source attribution and covers

`adaptOpenLibraryEvidence` remains. Search subjects, page count, publication year,
language and exact Work/edition identity survive. Missing description remains
missing/partial and does not reject the candidate; no invented fields or fallback.
Open Library bypasses the secondary enrichment cache so old enrichment cannot be
reintroduced by that cache. Pipeline network spy observes zero fetch calls.

`openLibrarySourceUrl` permits only HTTPS exact `openlibrary.org`, bounded numeric
`/works/OL...W` or `/books/OL...M`, no credentials, non-default port, arbitrary path,
query, fragment or injection. Existing mismatched/unsafe URLs use valid identity
fallback or no link. Search results and the saved-book mapper use this helper.
Advanced results show visible Open Library attribution with accessible label and
`noopener noreferrer`; saved detail/edit reuse their existing source UI with the
same safe resolver, including legacy ID fallback. Global search consumes the safe
normalized site URL. About credit remains. No public profile expansion.

CSP already permits covers.openlibrary.org; Next Image allowlist already restricts
it to HTTPS `/b/id/**`. Advanced/global/library/detail images use `unoptimized`
direct browser fetching. No proxy, mirror, binary persistence or server harvesting
was introduced; existing image-boundary tests pass.

## Local validation and limits

- Targeted: 11 files, 297 tests PASS, including UA/search/cache/evidence/attribution,
  capabilities, 02D, TVMaze 04B.1, URL/XSS, logging/redaction and image boundaries.
- Full Vitest: 197 files PASS, 2923 tests PASS, 59 existing conditional tests SKIP
  in 18 live suites. Zero failures and zero newly added skip/todo/only markers.
- TypeScript `tsc --noEmit --incremental false`: PASS. Build: PASS with 15 existing
  annotation-tool dynamic-filesystem tracing warnings.
- Raw `npm run lint`: FAIL because ignored, untracked `.codex` diagnostics and old
  CI build output are traversed (874 errors). Source lint using the same command
  with `--ignore-pattern '.codex/**'`: PASS, zero errors, one existing unrelated
  recommendation-composer navigation warning. No ESLint configuration/rules changed;
  no source path excluded. Raw artifact-sensitive lint remains a local workspace
  limitation and should be run again on a clean RC checkout/CI.
- `npm audit --omit=dev`: PASS, all vulnerability counts zero.
- `git diff --check`, added test-marker scan, direct-network scan: PASS.
- Initial sandbox Vitest temp rename EPERM was resolved by running the same local
  tests with normal permissions. Test fixtures gained real UA/Work IDs, preserving
  existing assertions. No skipped/deleted/weakened tests.
- Browser/visual smoke NOT RUN. Provider live smoke NOT RUN. No fresh GitHub CI.
  No registration submission, remote mutation, env mutation, migration, deploy,
  commit or push. AniList/TMDB/OMDb implementation/policy unchanged.

## Manual registration and durable context

Registration is not CLOSED. Operator must register intended application name
**MediaTracker**, use case **human-facing personal/non-commercial media tracker,
book search/lookup, low-volume requests, no bulk harvesting**, with contact
**mediatracker.contact@gmail.com**, matching deployment UA contact. Codex submitted
no form and performed no account action. Production UA application remains the
separate D8-4B final-env operation. Provider-wide/legal approval is not inferred
from this technical gate.

Vault context retrieval returned `VAULT_GIT_INVALID`. No canonical Vault write or
autopilot mutation occurred. A future minimal existing-project-note candidate
should record the Search-only v1 metadata decision, absence of Work enrichment,
ephemeral cache/admission coupling and open registration gate from this document.

## Changed files

- Runtime: `app/api/openlibrary/search/route.ts`,
  `lib/api/provider-identity.ts`, `lib/api/openlibrary-search-cache.ts`,
  `lib/providers/release-policy.ts`, `lib/providers/openlibrary-source-url.ts`.
- Recommendation: `features/recommendations/providers/openlibrary-adapter.ts`,
  `features/recommendations/providers/pipeline.ts`.
- Attribution: `features/discovery/domain/media-mappers.ts`,
  `components/openlibrary-result-card.tsx`, `components/media-detail-modal.tsx`,
  `components/media-modal.tsx`.
- Tests: `tests/v1-openlibrary.test.ts`, `tests/v1-distributed-rate-limit.test.ts`,
  `tests/d8-api-request-boundary.test.ts`.
- Release docs: this document, `docs/D8_RELEASE_CANDIDATE_ACCEPTANCE.md`,
  `docs/D8_RELEASE_ENV_MATRIX.md`, `docs/D8_THIRD_PARTY_AND_NONCOMMERCIAL_COMPLIANCE.md`.
