# MediaTracker V1-HARDENING-01 — 2026-10-03

## 1. Baseline

- Starting branch: `release/v1-hardening`; starting HEAD and local main: `657cfba66167c8a8493768614ed9348d14563967`; starting tree: clean. Remote main was not refreshed.
- Next / eslint-config-next: `16.2.4`; React / ReactDOM: `19.2.4`; lockfileVersion: `3`.
- Local runtime: Node `24.14.0`, npm `11.19.1`. No starting engines, `.nvmrc`, `.node-version`, tracked Vercel runtime configuration or GitHub Actions workflow. Remote Vercel settings: LIVE UNVERIFIED.
- Provider policy: TVMaze enabled; Open Library requires contact/UA; AniList disabled by default (explicit authorization/Preview gates); TMDB disabled pending token/logo/policy; OMDb public search disabled, stored records supported. No enablement changed.

## 2. Release-state reset

- `3a847701e5161186cfb16ade0e625666120c5e29`: historical August RC/evidence only.
- `657cfba66167c8a8493768614ed9348d14563967`: October hardening baseline; not an accepted new RC.
- New immutable RC: **none**. D8-4B Production cutover: **FROZEN until new RC acceptance**.
- Acceptance, roadmap, env matrix and cutover runbook mark the freeze. The historical backup command block now throws before any operation. Historical evidence remains intact.
- August backup capability, migration ledger/pending set, asset counts, targets and deployment epoch must be remeasured/replaced during separately authorized fresh Production preflight. The acceptance document retains the single canonical hold inventory.

## 3. Next security patch

- `next` and `eslint-config-next`: exact `16.2.4` → exact `16.3.8`, installed with `--save-exact`; lock resolved by npm. React/ReactDOM remain exact `19.2.4` and satisfy the installed Next peer ranges.
- [Official September security release](https://nextjs.org/blog/september-2026-security-release): includes Image Optimization SSRF, GHSA-cjq9-62q9-8jv4. The allowlisted optimizer endpoint is relevant even when normal cover components use `unoptimized`.
- Read version-matched installed upgrade, installation, deployment, runtime and Image guides before/after updating. Node minimum remains `20.9`; Turbopack remains the default; build does not run lint. No router/cache architecture changes.
- Next regenerated `next-env.d.ts` to import production route types and root-param types. Generated AGENTS files were not edited.

## 4. Node runtime

- `package.json`: `engines.node = "24.x"`; `.nvmrc`: `24`; matching root lock metadata. Local checks ran on Node `24.14.0`.
- Installed dependency engine ranges accept this runtime for the installed Windows x64 dependency tree. The optional, uninstalled Windows ia32 sharp binary supports Node 20 only; Windows ia32 is not the validated target.
- [Vercel Node 20 deprecation](https://vercel.com/changelog/node-js-20-is-being-deprecated) confirms Node 24 and engines override for new deployments. No project setting/env was mutated; actual Preview/Production runtime execution remains unverified.

## 5. Image / remotePatterns audit

| Host | Classification / current consumer | Decision |
| --- | --- | --- |
| `image.tmdb.org` | B: disabled-provider stored TMDB covers; search/details routes construct `/t/p/w500` URLs; library/detail/social cover renderers accept stored URLs | Retain `/t/p/**` |
| `covers.openlibrary.org` | A: contact-gated v1 Open Library; search route emits `/b/id/<id>-M.jpg?default=false` | Retain `/b/id/**` |
| `s4.anilist.co` | B: disabled-provider stored AniList covers; `lib/anilist.ts` passes API coverImage through | Retain `/file/**` |
| `m.media-amazon.com` | B: stored OMDb Poster URLs pass through `normalizeOmdbDetail` and local/cloud cover mapping | Retain `/images/**` conservatively |
| `ia.media-imdb.com` | B: older stored OMDb Poster compatibility; no literal producer in current source | Retain `/images/**` conservatively; actual persisted-host inventory not available |

All hosts are exact HTTPS names with bounded path prefixes. Added `port: ""` to reject non-default ports. No host is proven stale from static source alone: dynamic cover strings survive local/cloud/import data. No owner data was read to invent an absence claim. No new hostname or broad `/**` root pattern. `dangerouslyAllowSVG` and `dangerouslyAllowLocalIP` remain default false. Query strings remain allowed for stored URL compatibility; default maximumRedirects remains 3. CSP wildcard Supabase origins are a separate existing policy, not optimizer host wildcards; CSP redesign is outside this task.

## 6. Dependency / supply-chain audit

Initial post-Next audit: 0 Critical, 10 High, 3 Moderate, 1 Low. Compatible npm updates of affected Babel/browser mapping/brace-expansion/js-yaml/nanoid/ws/Vitest chains reduced this to **0 Critical, 5 High, 0 Moderate, 0 Low**. Direct manifest ranges other than Next/eslint-config-next were preserved; Vitest resolves `4.1.11`, ws `8.22.0`, js-yaml `4.3.2`, nanoid `3.3.19`. Next resolves sharp `0.35.5`. No unrelated major upgrade, override, audit suppression or force remediation.

All remaining High entries refer to one unpatched advisory, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), stack-exhaustion DoS in `braces <=3.0.3`:

| Exact installed package | Dependency reason | Classification |
| --- | --- | --- |
| `braces@3.0.3` | Vulnerable implementation; registry latest is also 3.0.3 | RELEASE BLOCKER |
| `micromatch@4.0.8` | Depends on braces | RELEASE BLOCKER, inherited advisory |
| `fast-glob@3.3.1` | Depends on micromatch | RELEASE BLOCKER, inherited advisory |
| `@next/eslint-plugin-next@16.3.8` | Pins fast-glob | RELEASE BLOCKER, inherited advisory |
| `eslint-config-next@16.3.8` | Depends on Next ESLint plugin | RELEASE BLOCKER, inherited advisory |

This is a development/tooling chain, not five independent production vulnerabilities. It still fails the requested High gate. npm proposes a breaking downgrade to eslint-config-next 14.2.35; not applied. A compatible upstream fix or separately reviewed disposition is required.

Supply chain: all resolved entries remain under `https://registry.npmjs.org/` with integrity hashes; no git/file/custom-URL dependencies. Lock delta contains no new install hooks. Clean install executed existing `unrs-resolver@1.11.1` postinstall (`napi-postinstall ... check`); npm warned it is not covered by allowScripts. Optional macOS fsevents install hook remains in the cross-platform lock and was not executed on Windows. No new suspicious postinstall identified. Initial resolution used `--ignore-scripts`; subsequent clean `npm ci` ran reviewed lifecycle behavior.

## 7. Repository hygiene / security

- `.ai/project.md`, automation and map are retained: they are authority/routing sources for generated AGENTS. No credential or local absolute path found in these files or generated AGENTS. Operational `.knowledge-compiler` state is ignored, untracked, not required in the public source tree.
- Tracked env: only `.env.example`; populated values are configuration defaults/placeholders, not confirmed real credentials. No tracked real `.env.local`.
- Bounded tracked-text scan found no private-key, known provider-key/token or JWT secret match. Four DB URL occurrences are synthetic `.example.test` safety-test fixtures. Fixture emails/passwords are synthetic placeholders or env references, not confirmed live credentials. This is a pattern/static audit, not a guarantee that every possible secret format was detected; Git history was not scanned.
- Six existing absolute-path matches: three historical backup-root examples in the runbook, three synthetic path-rejection tests. No personal workstation path found in authority files; no new absolute path added to tracked documentation.
- No tracked temp/cache/log/live-smoke artifact. Diagnostics and npm cache are ignored operational files. No remote credential rotation needed from confirmed findings.

## 8. Validation

| Check | Result |
| --- | --- |
| Clean `npm ci`, Node 24 | PASS; lock SHA-256 unchanged across clean install |
| `npm ls` full tree and Next/React peers | PASS, exit 0; Next/React peers deduplicated, no invalid dependency state |
| Targeted config/request/provider/policy/Preview contracts | PASS: 5 files, 46 tests (14 new URL-boundary cases) |
| Full Vitest | FAIL: 206 files; 2,366 passed, 7 failed, 59 existing conditional live/key-gated skips across 20 files; new skips: 0 |
| `npm run lint` | PASS: 0 errors, 1 Next internal-navigation warning in recommendation-composer |
| `npm run build` | FAIL: Turbopack compiled; TypeScript reported 155 errors across 47 test files; no non-test TS error in output |
| Build warnings | 15 dynamic-filesystem tracing warnings in dormant annotation-tool imports; warnings are separate from the TS failure |
| npm audit JSON + readable report | FAIL: 5 High / 0 Critical; exact unresolved chain above |
| Diff / bounded secret, absolute-path, tracked-temp scans | PASS for changed-file whitespace and no confirmed credential leak/new personal path/temp artifact; existing synthetic/historical findings above |
| Browser, Preview, live Supabase/provider, Production | NOT RUN; no automation/deploy/live mutation authorized in this task |

Full suite failures: `goal-documentation-contract.test.ts` expects README text `D1–D5`; six SQL equality checks fail in `p6-theme-transfer-sync`, `social-phase2-schema-contract`, `social-recommendation-feedback-schema-contract`, `social-recommendation-listing-regression`, `xp-reversible-schema-contract`, `xp-schema-contract` tests (output includes CRLF/LF mismatches). These test sources, README and SQL sources remain unchanged from baseline. They were not weakened or repaired in this scope. The prior dependency/runtime suite was not rerun, so no prior PASS is claimed.

Vite also warns that the existing CommonJS-config/ESM syntax is incompatible with a future native config loader default. Warning not suppressed. The requested clean install/build gates were attempted; build failure is not a successful release build.

## 9. Files changed

`package.json`, `package-lock.json`, `.nvmrc`, `next.config.ts`, Next-generated `next-env.d.ts`, `tests/v1-image-remote-boundary.test.ts`, `docs/ROADMAP.md`, `docs/D8_RELEASE_CANDIDATE_ACCEPTANCE.md`, `docs/D8_PRODUCTION_CUTOVER_RUNBOOK.md`, `docs/D8_RELEASE_ENV_MATRIX.md`, this report.

## 10. Next hardening phase / proposed CI contract

No GitHub Actions workflow implemented. Proposed V1-HARDENING-02/03 contract:

1. PR/non-production branch validation on `ubuntu-latest`, Node `24.x`, npm `11.19.1` for initial parity; clean checkout and `npm ci` with dev dependencies.
2. `permissions: contents: read`; no write permissions, production/staging credentials, deployments or environment mutations. `persist-credentials: false` on checkout; dependency cache keyed by package-lock.
3. `actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803` (v6) and `actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38` (v6), immutable commit references verified from official repositories during this task. Reverify when implementing.
4. `npm run lint`, `npm run test:run`, `npm run build`, `npm audit --audit-level=high` including dev dependencies; any failure blocks acceptance. Preserve/report conditional live skips; CI must not turn them into live mutations.
5. Bounded job timeout, PR concurrency cancellation; no `pull_request_target` execution of untrusted PR code. Node 24 Preview verification remains a later explicit gate.

Remaining blockers: unpatched braces High chain; seven suite failures; test TypeScript build failures; review annotation tracing exposure/size before accepting an artifact; Node 24 CI/Preview verification and new clean committed immutable RC acceptance. Existing external/manual Production gates remain in the canonical acceptance table and require fresh evidence. Vault synchronization was not performed; this task remains repository-scoped without external writes/commits.

## 11. Verdict

**BLOCKED.** Security patch/runtime contract and release-state reset applied; dependency and validation gates remain open. No new RC accepted.

## 12. Explicit confirmation

No Production mutation; no Supabase Production/Staging DB/Auth/Storage mutation or migration; no remote Vercel env change; no Preview/Production deployment; no backup/restore; no commit/push.
