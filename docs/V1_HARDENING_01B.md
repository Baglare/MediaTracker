# MediaTracker V1-HARDENING-01B — security baseline, 2026-10-03

**Verdict: V1-HARDENING-01 COMPLETE_WITH_DOCUMENTED_DEV_EXCEPTION.** This closes the local 01/01A security baseline with an accepted temporary dev-tooling exception. It does not accept a new immutable RC, verify a deployment, or unfreeze D8-4B. The [acceptance hold table](D8_RELEASE_CANDIDATE_ACCEPTANCE.md#d8-4a5d-kanonik-production-hold-tablosu) remains the single Production hold inventory. The earlier [01 report](V1_HARDENING_01.md) retains its historical failed checks; the results and audit policy below supersede that report's open local test/type/dependency disposition.

## Starting state and comparison boundary

- Branch: `release/v1-hardening`; HEAD: `657cfba66167c8a8493768614ed9348d14563967`. Dirty tree contains prior 01/01A changes; no committed 01A checkpoint exists. Audit compares all 54 modified tracked test files against HEAD, with a separate review of the new image-boundary test. Changes made in 01B are listed below.
- Installed Next and eslint-config-next `16.3.8`; React/ReactDOM `19.2.4`; Node `24.14.0`, npm `11.19.1`, Vitest `4.1.11`; Node contract `24.x`.
- Expected prior 01A result was 2,373 PASS, 59 conditional skips, lint/build PASS, runtime audit clean. These are independently revalidated below, not inferred from prior prose.
- Application paths `app`, `components`, `features`, `hooks`, `lib`, SQL sources, README, `tsconfig.json` and Vitest configuration are unchanged against HEAD. Existing 01 config/dependency/Node changes are outside the 01B application-source boundary.

## Test integrity audit

All hunks in the 54 tracked tests were read, including assertion operands, fixture values, failure branches, SQL source slicing and environment defaults. File classification is exclusive, using the highest applicable class; files may also contain B corrections or checkout EOL changes.

| Class | Files | Interpretation |
| --- | ---: | --- |
| A | 6 | EOL-only normalization of SQL test inputs; exact assertions and slice boundaries retained |
| B | 39 | Contract-typed fixture/mock corrections and explicit fail-fast narrowing |
| C | 8 | Stale fixture/expectation values corrected against current canonical sources |
| D | 1 | Live coverage branch change, reviewed and repaired below |

AST inspection of chained `expect` matcher calls found 1,684 before / 1,685 after. No assertion deletion or exact-to-partial matcher replacement. The only matcher-count increase is the Goal documentation assertion. Per-file inventory follows at the end of this document.

### Seven historical failures

1. `goal-documentation-contract`: README already declares `D1–D7` (README:412) and explicitly keeps Goal Cloud Production rollout in D8 (README:25). Updating the stale `D1–D5` literal follows unchanged canonical text. The added D5 row regex asserts local/test completion and the Production limitation; existing D8 assertions remain. No README rewrite.
2. `p6-theme-transfer-sync`: schema P6.1 slice still uses `toBe(migration)`; only CRLF is mapped to LF. 01B normalizes the migration side too.
3. `social-phase2-schema-contract`: exact schema-phase/migration equality, function extraction, RLS/ownership/security checks and markers are retained. 01B normalizes the migration side too.
4. `social-recommendation-feedback-schema-contract`: both SQL inputs normalize CRLF; the full selected section equality and security assertions remain.
5. `social-recommendation-listing-regression`: both SQL inputs normalize CRLF; selected migration equality and listing/privacy assertions remain.
6. `xp-reversible-schema-contract`: both SQL inputs normalize CRLF; full marked block equality, reversible state and owner/revision assertions remain.
7. `xp-schema-contract`: both SQL inputs normalize CRLF; full marked block equality and progression/security assertions remain.

Normalization removes only CR in CRLF pairs. It does not remove SQL tokens, whitespace generally, lines, statements, function bodies or assertions. Byte-identical checkout EOL is not a SQL semantics contract; schema and migration content must still match exactly after that single transform.

### Canonical C corrections

| Test | Correction | Unchanged canonical evidence |
| --- | --- | --- |
| d4-performance-state | absent `selectedTitle`: null → undefined | `lib/xp/types.ts` optional string; validation normalizes non-string to undefined; progression uses the same nullish fallback |
| goal-documentation-contract | D1–D5 → D1–D7 plus D5 limitation assertion | README current scope and D5 row, above |
| p4-library-architecture | localized unit `bölüm` → `episode` | `lib/types.ts` `ProgressLogUnit`; display labels do not define persisted units |
| recommendation-d7-r4a-shadow | `explicit_source_absence` → `explicit_source_contradiction` | research domain types/decisions; contradictory claim must use a contradiction reason, hypothetical effect assertion stays exact |
| recommendation-d7-r6b-final | objective `releaseYear` → `release_year` | domain constraints/codec; release-year numeric validation now exercises the actual canonical field |
| recommendation-provider-pipeline | intent `general` → `general_recommendation` | `lib/ai/types.ts` `AiIntentKind` |
| recommendation-v2-d65-manual-regressions | same intent correction | same production intent union; ranking/privacy expectations unchanged |
| release-calendar-month | `film`/`anime_series` → `movie`/`anime_tv` | `lib/types.ts` `MediaSubType` and classification; same movie/anime input families and month expectations |

### Every D change

`recommendation-d7-r5b-stability-live.integration` has three changed branches:

- The Steins packet guard now rejects missing acquisition/packet before extraction. This strengthens failure behavior for the optional `ResearchAcquisitionResult.packet`; the exact document/status and three-run grounding assertions remain.
- The coverage loop previously entered on acquisition `packet_ready`; 01A additionally required a packet in the condition. That could silently omit evidence work on an inconsistent result. 01B restores the `packet_ready` branch and throws `r5b_coverage_packet_unavailable` when its packet is absent. No fallback, swallow, skip or zero-count success is introduced by 01B.
- Union narrowing checks actual `prepared.acquired` rather than only property existence. No acquisition means the same pre-existing aggregate coverage path; `packet_ready` without data now fails explicitly. Canonical acquisition types declare packet optional; acquisition orchestration supplies it for successful packet creation.

This is one D-class file with a documented, stricter final outcome, not a relaxed assertion. Live execution is CONDITIONAL/SKIP without explicit live flags/keys; its runtime branch remains LIVE UNVERIFIED here.

### B quality and unsafe-pattern audit

- Owner/result/theme/provider guards throw on unexpected discriminants; they do not use optional chaining or defaults to turn failures into successes. Existing optional assertions remain unchanged.
- `vi.fn<typeof fetch>` keeps real fetch signatures; mocks and maps use production `Parameters`, field-selection and aspect types. Canonical media-row fixture includes required `deleted_at: null`; goal queue/conflict and shadow result fixtures supply required fields.
- ProcessEnv fixtures now supply literal `NODE_ENV: "test"`; this meets existing Next ProcessEnv typing. Research readers do not branch on NODE_ENV; public-provider policy distinguishes development explicitly, so these formerly absent values still do not enable preview/development provider paths. Existing production-denial cases remain intact.
- New `as any`, unsafe double-cast, `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, unconditional skip/todo: **0**. No new try/catch swallow or fallback. Some broad casts already existed in the baseline, particularly malformed-input/provider mocks; this is not a claim that all legacy tests are cast-free.
- 01B removes the redundant `plan as never` from the now production-typed planner mock. Its return uses canonical `planResearch` defaults, with the same deliberately empty jobs and same exact unresolved-constraint assertions.
- 01B bounds the sensitive metadata test fixture to `Record<string, unknown>` rather than arbitrary unknown. Metadata is intentional extra input for a leakage regression, passed structurally through `ensureMediaIdentity`; the returned item still has the production `MediaItem` contract. It is not a permissive replacement model.

## Type-fix audit: 155 errors

A read-only TypeScript CompilerHost overlay loaded the HEAD versions of the 54 tests in memory against current installed dependencies and generated Next types: **155 diagnostics / 47 test files / 0 application files**. The final fixture set typechecks without errors. No temporary baseline overwrite of source files was needed.

`tsconfig.json` is byte/content unchanged: `strict: true`; `skipLibCheck: true` was already present at HEAD and was not added; include still covers all `**/*.ts`, `**/*.tsx`, `**/*.mts`, next-env and generated route types; only node_modules is excluded. No `ignoreBuildErrors`, strictness reduction, build/test exclusion or suppression was introduced. First standalone incremental typecheck encountered a sandbox EPERM writing the existing ignored cache; `tsc --noEmit --incremental false` passed with the same semantic checks, and the ordinary Next build's TypeScript step also passed.

## Generated Next types

Installed `next@16.3.8` guide `node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`, section `next-env.d.ts`, explicitly requires generation by Next, gitignore, removal from tracking, and continued tsconfig inclusion. `next dev`, `next build` and `next typegen` regenerate it.

Final index: no tracked `next-env.d.ts` or `.next/**`. The earlier staged deletion remains; HEAD history naturally still contains the old file until a separately authorized commit. Both next-env and .next are ignored, `next typegen` and build regenerated local types, and the source file is not manually edited. No tracked generated/temp output was added.

## Canonical security exception: V1-SEC-EXCEPTION-001

| Field | Value |
| --- | --- |
| ID | `V1-SEC-EXCEPTION-001` |
| Advisory | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| CVE / weakness | `CVE-2026-93687` / `CWE-674` uncontrolled recursion |
| Package / installed | `braces@3.0.3` |
| Affected range | `<=3.0.3` |
| Patched version | None as reviewed 2026-10-03; registry latest also `3.0.3` |
| Status | `ACCEPTED_DEV_TOOLING_UNPATCHED` |
| Disposition | accepted temporary dev-tooling exception; vulnerability remains unpatched |
| Runtime reachability | `RUNTIME_REACHABLE=false` for the audited local production build and installed dependency graph |
| Consequence | Deeply nested brace patterns can exhaust the call stack and terminate the tooling Node process; development/CI availability risk |
| Confidentiality / integrity / availability | Advisory C=None, I=None, A=High; no confidentiality/integrity impact demonstrated in current use |
| Review owner | MediaTracker maintainer / release approver |
| Review deadline / expiry | Review no later than **2026-11-03**; no automatic renewal; acceptance expires unless explicitly re-reviewed |

The GHSA currently uses CVSS 4.0 8.7; npm JSON uses CVSS 3.1 7.5 (`C:N/I:N/A:H`). They describe the same finding, not two advisories. Reasons: upstream patch unavailable, dependency dev-only, no application/runtime input path found, consequence limited to tooling availability in this usage. A breaking eslint-config-next downgrade proposed by readable npm audit is not a patched braces release and was not applied.

### Actual dependency and reachability evidence

`npm ls braces micromatch fast-glob @next/eslint-plugin-next eslint-config-next`:

```text
eslint-config-next@16.3.8 (devDependency)
└── @next/eslint-plugin-next@16.3.8
    └── fast-glob@3.3.1
        └── micromatch@4.0.8
            └── braces@3.0.3
```

ESLint `9.39.4` loads this configuration through `eslint.config.mjs`; npm does not show eslint as the package parent of eslint-config-next. The actual fast-glob call is Next ESLint `dist/utils/get-root-dirs.js`, using tooling `context.settings.next.rootDir`. This project does not configure an untrusted rootDir pattern.

- Lock entry is dev-only; `npm ls --omit=dev braces` returns the expected empty tree (npm empty-filter exit 1).
- Application/server-route/browser source contains no import/require of braces, micromatch, fast-glob or the ESLint integration; no HTTP/search/profile/media input reaches their tooling rootDir pattern.
- Fresh build inspection: 52 NFT traces / 8,529 referenced entries; zero dev-chain package references. 590 server/static JS/JSON bundle files have zero package markers or braces walker signature markers. Installed Next has no compiled braces/micromatch/fast-glob module found in the inspected compiled directory.
- Runtime audit contains no vulnerability. This is evidence for the local artifact, not a claim that a remotely deployed artifact or container filesystem was inspected. A deployment must use the tested artifact/runtime without relying on dev-only packages.

### Compensating controls and review triggers

Established locally: production artifact/runtime imports do not depend on braces; runtime audit Critical/High = 0; exact full-audit dependency chain reviewed and recorded. Enforce at every dependency update and release, retaining both full and runtime audit evidence.

Required for later CI implementation (not implemented or live-verified in 01B): minimal permissions, no Production secrets, bounded job timeout, and no Production deployment credentials for untrusted PR code. Until then, run tooling only without Production credentials and do not interpret this exception as permission for privileged untrusted-code execution.

Re-review on any Next/eslint dependency update, advisory update, each dependency update/release, or patched braces publication. Remove/replace this exception immediately when upstream supplies a patched release; apply the compatible update and revalidate before release. Changes in dependency paths, runtime reachability, advisory scope or controls invalidate acceptance. A compatible patched version left unapplied is a blocker; expiry is a blocker without renewed review.

## Explicit release audit contract

This deliberately replaces the former unconditional full-audit `High = 0` gate from 01's proposed CI contract. It is an explicit reviewed exception policy, not an unreported relaxation or suppression.

BLOCKER:

- Runtime Critical > 0 or High > 0.
- Any reachable unreviewed Critical/High.
- Any Critical/High with an upstream patch available but unapplied.
- Any untracked/unapproved, expired or changed exception.

ALLOWABLE ONLY WITH EXCEPTION: dev-only, non-runtime-reachable, upstream patch unavailable, exact advisory reviewed, compensating controls documented, owner and expiry/review date present.

Runtime command: `npm audit --omit=dev --audit-level=high` must pass. Full `npm audit --json` and readable audit remain reported in release/CI evidence; do not hide their nonzero status or suppress the finding. Full audit is informational **plus approved-exception enforcement**, not ignored: resolve each `via` chain to its advisory, reject additional entries/advisories or reachable findings, verify versions/dev classification, current upstream patch status, controls and deadline. At this baseline only the five inherited package entries above resolving to the exact GHSA are accepted. A changed set requires explicit new review, not blanket acceptance of High findings. CI implementation is deferred; the exact JSON set was checked locally in this task.

## Final validation

| Check | Result |
| --- | --- |
| `npm ci`, Node 24 | PASS; package-lock unchanged by installation |
| `npm ls --all`, peer/dependency graph | PASS; exit 0, no invalid required dependency state; platform optional omissions remain expected |
| Targeted 54 modified tests + image boundary | PASS: 55 files, 675 passed, 10 existing conditional skips, 0 fail |
| Full Vitest | PASS: 206 files, 2,373 passed, 59 existing conditional skips, 0 fail; 0 new unconditional skips |
| `next typegen`; TypeScript noEmit contract | PASS; generated types and unchanged test-inclusive strict scope |
| Lint | PASS: 0 errors, 1 existing Next internal-navigation warning |
| Build | PASS; TypeScript included; 15 existing dormant annotation dynamic-filesystem trace warnings retained |
| Runtime npm audit JSON and high gate | PASS: 0 Critical, 0 High, 0 total |
| Full npm audit JSON/readable | 0 Critical, 5 High, 0 Moderate/Low; raw audit nonzero; exact single advisory accepted only through V1-SEC-EXCEPTION-001 |
| Diff / test weakening / tracked generated-temp / secret and absolute-path scans | PASS within documented static-scan limits; no new unsafe test pattern, confirmed secret, personal path or tracked generated artifact |
| Preview/Staging/Production/browser/live provider/DB checks | NOT RUN; no deployment or remote mutation |

Static secret scan reviews current indexed text plus nonignored new report/test files, not Git history or every possible secret format. Four database URL hits are synthetic safety fixtures. Absolute-path hits are historical backup examples, synthetic rejection fixtures, or regex syntax; no new personal workstation path is introduced. Only `.env.example` is tracked. Local evidence/log/cache files remain ignored.

## Files changed in 01B and remaining gates

- `tests/recommendation-d7-r5b-stability-live.integration.test.ts`: fail explicitly for missing ready packet.
- `tests/recommendation-d7-r4a-shadow.test.ts`: remove redundant planner cast.
- `tests/local-data-integrity-repair.test.ts`: bound extra metadata fixture type.
- `tests/p6-theme-transfer-sync.test.ts`, `tests/social-phase2-schema-contract.test.ts`: normalize both SQL equality operands symmetrically.
- This report and `docs/D8_RELEASE_CANDIDATE_ACCEPTANCE.md`: canonical exception, explicit release audit policy and accurate current local gate status. `docs/ROADMAP.md`: short baseline status link.

No remaining local blocker to this baseline under the documented exception. New clean committed immutable RC, Node 24 CI/Preview validation, artifact warning review and the existing Production manual/external holds remain separate gates. Existing historical August evidence is not current acceptance. Exception re-review is due by 2026-11-03. CI safeguards above are future implementation requirements, not a claimed completed workflow.

Vault context was retrieved read-only through project routing; it gives release-layer context, not current dependency evidence. A durable test/release-policy note may need an update candidate, but no canonical Vault write, autopilot apply or Vault commit/push was performed under this task's no-commit/push/no-external-mutation scope.

Production and Staging untouched. No Supabase/Vercel mutation, migration, deployment, backup, branch switch, commit or push.

## Audited test inventory

Class labels are defined above; the new `v1-image-remote-boundary.test.ts` is a separate 01 test addition and is outside the 54-file 01A repair count.

| Class | Test file |
| --- | --- |
| B | `tests/canonical-media-identity.test.ts` |
| B | `tests/cloud-media-v2-client.test.ts` |
| B | `tests/cloud-media-v2-conflicts-live.integration.test.ts` |
| B | `tests/cloud-media-v2-conflicts.test.ts` |
| B | `tests/cloud-media-v2-sync-manager.test.ts` |
| B | `tests/cloud-v2-browser-smoke-script.test.ts` |
| C | `tests/d4-performance-state.test.ts` |
| B | `tests/d8-discovery-provider-release-policy.test.ts` |
| B | `tests/d8-profile-theme-asset-discovery.test.ts` |
| B | `tests/d8-release-rehearsal-contract.test.ts` |
| B | `tests/d8-staging-env-loader.test.ts` |
| B | `tests/duplicate-merge.test.ts` |
| C | `tests/goal-documentation-contract.test.ts` |
| B | `tests/goal-system-acceptance.test.ts` |
| B | `tests/local-data-integrity-repair.test.ts` |
| B | `tests/manual-release-calendar.test.ts` |
| C | `tests/p4-library-architecture.test.ts` |
| A | `tests/p6-theme-transfer-sync.test.ts` |
| B | `tests/recommendation-d7-r2a-network.test.ts` |
| B | `tests/recommendation-d7-r2a-wikipedia.test.ts` |
| B | `tests/recommendation-d7-r2b-openai.test.ts` |
| B | `tests/recommendation-d7-r2c-groq.test.ts` |
| B | `tests/recommendation-d7-r2c-openrouter.test.ts` |
| B | `tests/recommendation-d7-r2c-provider-selection.test.ts` |
| B | `tests/recommendation-d7-r3a-acquisition.test.ts` |
| B | `tests/recommendation-d7-r3b-providers.test.ts` |
| B | `tests/recommendation-d7-r3b-service-persistence.test.ts` |
| C | `tests/recommendation-d7-r4a-shadow.test.ts` |
| B | `tests/recommendation-d7-r4b-lifecycle.test.ts` |
| B | `tests/recommendation-d7-r5a-live.integration.test.ts` |
| B | `tests/recommendation-d7-r5a-pipeline.test.ts` |
| D | `tests/recommendation-d7-r5b-stability-live.integration.test.ts` |
| B | `tests/recommendation-d7-r5b-stability.test.ts` |
| B | `tests/recommendation-d7-r5b2-live.integration.test.ts` |
| B | `tests/recommendation-d7-r5c-shadow.test.ts` |
| B | `tests/recommendation-d7-r6a1-active.test.ts` |
| B | `tests/recommendation-d7-r6a2-public.test.ts` |
| C | `tests/recommendation-d7-r6b-final.test.ts` |
| C | `tests/recommendation-provider-pipeline.test.ts` |
| B | `tests/recommendation-v2-d6-acceptance.test.ts` |
| C | `tests/recommendation-v2-d65-manual-regressions.test.ts` |
| B | `tests/recommendation-v2-d653-core-genre.test.ts` |
| B | `tests/recommendation-v2-d661r-ranked-tag-retrieval.test.ts` |
| B | `tests/recommendation-v2-ranking.test.ts` |
| B | `tests/release-calendar-domain.test.ts` |
| C | `tests/release-calendar-month.test.ts` |
| B | `tests/social-interactions.test.ts` |
| A | `tests/social-phase2-schema-contract.test.ts` |
| A | `tests/social-recommendation-feedback-schema-contract.test.ts` |
| A | `tests/social-recommendation-listing-regression.test.ts` |
| B | `tests/supabase-test-target.test.ts` |
| B | `tests/unified-profile-editor-unblock.test.ts` |
| A | `tests/xp-reversible-schema-contract.test.ts` |
| A | `tests/xp-schema-contract.test.ts` |
