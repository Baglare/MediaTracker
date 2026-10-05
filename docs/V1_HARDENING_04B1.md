# V1-HARDENING-04B.1 — TVMaze attribution and source provenance

Date: 2026-10-05. Technical attribution/provenance: `IMPLEMENTATION_CLOSED`.
`TVMAZE_SHAREALIKE_INTERPRETATION = MANUAL_LEGAL_GATE` remains open.

## Baseline and scope

Started on `release/v1-hardening`, clean tree, HEAD
`a693b7c9746f159b487609cac47993085e41580d`. 01/02A/B/C and accepted 02D
are documented locally. 03 GitHub Actions live PASS and 04A PROVIDER AUDIT READY
are supplied task baselines; hosted CI was not reverified here (gh unavailable).
04A's supplied gaps were confirmed in current code: advanced-card backlink,
detail/mapper URL retention, saved legacy fallback, Calendar backlink, public
card credit and guaranteed portable source URL.

## Source contract and surfaces

`lib/providers/tvmaze-source-url.ts` owns pure browser/server-safe URL resolution.
Only exact `externalSource: "tvmaze"` is supported. External IDs are bounded
to 48 characters and accept a positive show ID (up to 15 digits), optionally
`-season-<positive number>` (up to 6 digits). The parent show URL is used for seasons.

Existing URLs are bounded to 2,048 characters and reuse `safeExternalUrl`.
They require HTTPS, exact `www.tvmaze.com`, no credentials/non-default port,
query/fragment/backslash, and a bounded `/shows/<id>[/slug]` path. A parseable
external ID must agree with the URL's show ID. Otherwise the helper derives
`https://www.tvmaze.com/shows/<id>` or returns no URL. No arbitrary URL is echoed.

- Search and detail normalization validate raw `show.url` or derive a show link.
- `mapTvmazeDetail` retains the URL in single and season items; advanced-search
  detail-failure fallback also carries provenance.
- Advanced TVMaze cards expose `Kaynak: TVMaze`; global discovery's existing
  attribution UI is preserved and consumes safe normalized search provenance.
- Saved detail and edit modals use the helper, including imported/legacy season IDs without
  `siteUrl`. Invalid identity/URL yields label-only display.
- Calendar agenda and month selected-day agenda expose a separate accessible
  TVMaze anchor outside the detail button. Priority: valid media URL, season
  providerShowId, media externalId, label only. Episode providerEventId is never
  used as a show ID. Manual and other-provider events retain their behavior.
- Public favorites/current title/cover cards derive links from existing source/ID;
  malformed IDs show a plain TVMaze credit. No profile-model extension or migration.
- About already visibly credits TVMaze, links to TVMaze and identifies its data
  as CC BY-SA. No duplicate footer or application-code licensing claim was added.

## Portable backup and legal residual

Portable Backup remains version 3; existing `siteUrl` codec/allowlist is reused.
Export preserves valid show provenance and derives it for legacy TVMaze items.
Invalid TVMaze URLs are replaced with a safe ID fallback or omitted. Export works
on decoded copies; source records are unchanged. Decode/inspection and checksum
determinism are regression-tested. No raw payload or strict-manifest license field
was added; other-provider URL behavior is unchanged.

The ShareAlike scope for persisted/transformed metadata and exports, and the
appropriate CC BY-SA/ShareAlike export notice, require separate manual/legal
review. Technical closure does not establish full license compliance.

## Validation

- Targeted: 10 files / 254 tests PASS, including 62 new attribution/provenance tests.
- Full Vitest: 196 passed files / 2,872 PASS, 18 conditional skipped files /
  59 existing conditional skips, zero failures. Offline guard uses an absolute
  file URL; local junction tests require execution outside the restricted sandbox.
- Typecheck (`tsc --noEmit --incremental false`), production build: PASS.
- Runtime `npm audit --omit=dev`: zero vulnerabilities, including High/Critical.
- Source lint: PASS, zero errors / one existing recommendation-composer warning,
  using `npm run lint -- --ignore-pattern .codex/**`. The unfiltered command
  failed on pre-existing Git-ignored `.codex/ci-validation` generated snapshots;
  no lint rule/config or tracked source scope was weakened.
- `git diff --check`, repository CI integrity checks and new skip/todo/only scan:
  PASS. Changed UI source scan: 5 anchors, zero unsafe literal/direct-provider
  URL sinks or missing safe rel; malicious-URL render regressions PASS.
- A concurrent full-suite/build/lint rerun timed out the existing 5-second CSP
  source scan; the final isolated full-suite run PASSed (2,872/59/0) without
  changing test limits.
- Browser/visual/manual keyboard smoke: NOT RUN; server-rendered markup verifies
  link names, native anchors and safe rel. Preview/staging/Production: NOT RUN.

Provider release policy and upstream request behavior are unchanged. No remote
mutation, deploy, migration, env/key mutation, commit or push was performed.
D8-4B remains frozen pending independent RC and manual/external release gates.

## Changed files

- `lib/providers/tvmaze-source-url.ts`, `lib/tvmaze-types.ts`
- `app/api/tvmaze/search/route.ts`, `app/api/tvmaze/details/route.ts`
- `features/discovery/domain/media-mappers.ts`
- `components/tvmaze-search.tsx`, `components/tvmaze-result-card.tsx`
- `components/media-detail-modal.tsx`, `components/media-modal.tsx`
- `features/calendar/domain/release-calendar.ts`
- `features/calendar/components/release-calendar-panel.tsx`
- `components/social/profile-grid.tsx`, `lib/portable-backup.ts`
- `tests/v1-tvmaze-attribution.test.ts`
- This report, `docs/D8_RELEASE_CANDIDATE_ACCEPTANCE.md`,
  `docs/D8_RELEASE_ENV_MATRIX.md`, `docs/PORTABLE_BACKUP_FORMAT.md`

Configured Vault context retrieval returned `VAULT_GIT_INVALID`; no canonical
Vault content, candidate, commit or push was produced. The durable provenance
contract is recorded in this repository report.
