# V1-HARDENING-03 — CI validation contract

## Scope and baseline

2026-10-05. Starting clean `release/v1-hardening`, HEAD `3f3aae0238e9ec043e2fb63f70d8ceafe83b83bd`.
01 is complete with the documented dev exception; 02A/02B/02C are complete.
02D is **ACCEPTED WITH MEASURED TAIL LATENCY** per the task's supplied acceptance;
the older 02D.2 report retains its historical rehearsal-required state. CI neither
remeasures latency nor verifies a remote ledger. The three 02D migration sources
are present, including the two append-only rehearsal fixes.
No pre-existing GitHub workflow or package typecheck script exists.

## Workflow and reproducibility

`.github/workflows/ci.yml`: one `validate` job (display name `Release validation`),
Ubuntu 24.04, 20-minute timeout. Every `pull_request`; push to `main` and `release/**`.
`contents: read` only; ref concurrency cancels older runs. No deployment or write token.
Checkout does not persist credentials. Branch protection/required checks have **not**
been configured as repository settings by this task.

Node `24.x` is the package/lock/.nvmrc contract; npm `11.x`, lockfile v3. Local baseline
Node 24.14.0 / npm 11.19.1. setup-node selects Node 24 with its bundled npm; patch/minor
versions can advance and are printed for evidence. Dependencies remain frozen by
`npm ci`, never `npm install`; npm download cache uses `package-lock.json`, with no
node_modules, Next output or private operational cache restored.

Stages: clean install → helper regression tests → workflow/hygiene/migration checks
→ runtime audit → full advisory verifier → `next typegen` →
`tsc --noEmit --incremental false` → `npm run lint` → `npm run test:run` →
`npm run build` → tracked-source/lockfile stability.
`next typegen` creates ignored route declarations and `next-env.d.ts` on fresh checkout;
there is no dependency on an earlier dev/build session. Existing package scripts
remain the lint/full-test/build source of truth; no new package script/dependency.

## Credentials, network and tests

No application config or dummy public credential is necessary for build. Only
`CI=true` and `NEXT_TELEMETRY_DISABLED=1` are job env. Unset app policy remains
fail-closed, optional Supabase remains local-first. Preflight rejects local `.env*`
files except the empty credential template and inherited application/live secrets
or flags. Never copy local env into Actions or provision service-role, database,
provider, rate-limit signing/HMAC, fixture-password or Vercel deployment secrets.

Type generation, full tests and build preload `scripts/ci-offline.mjs` using an
absolute workspace path: external Node TCP/TLS socket connections and all UDP sends
fail before network I/O, including inherited Node workers with a different cwd.
IPC pipes and literal `127.0.0.1`/`::1` TCP remain available for Turbopack's PostCSS
worker IPC; DNS names and other addresses are rejected. npm ci/audit/Actions downloads still use
their public distribution services. This is a Node validation guard, not an OS
sandbox against malicious native code. No Staging/Production endpoint is supplied.

Full Vitest runs via `test:run`; failures propagate without count thresholds or
unconditional exclusions. Existing credential/flag-gated live suites stay conditional
because no live env exists; their skips are not live PASS. AST checks reject `.only`,
unconditional `.skip`/`.todo`, aliases/computed literal modifiers and literal
`skipIf`/`runIf` bypasses. Conditional declarations are restricted to existing live
filename semantics. The existing Goal schema-probe runtime skip is permitted only
under its specific error guard. Checks are bounded, not proof against arbitrary
obfuscated test code. Existing security regressions remain in full Vitest.

## Dependency security

Runtime: `npm audit --omit=dev --audit-level=high`; High/Critical must be zero.
Full: `scripts/ci-audit.mjs` captures `npm audit --json`, accepts audit exit 0/1 only
after parsing/validating the report, and prints counts without raw config/errors.
Registry failure or invalid report fails. Unknown High/Critical fails.

Only [V1-SEC-EXCEPTION-001](V1_HARDENING_01B.md#canonical-security-exception-v1-sec-exception-001)
is accepted: GHSA-vfj7-8cjw-p6xm / CVE-2026-93687, braces <=3.0.3 / CWE-674.
npm's report supplies the exact GHSA URL, not a CVE field. Exact dev-only chain:
`eslint-config-next@16.3.8 → @next/eslint-plugin-next@16.3.8 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.
All five audit entries must resolve solely through this chain with expected nodes,
versions and no new parents/runtime imports. The only permitted npm remediation
suggestion is the already reviewed major downgrade to eslint-config-next 14.2.35;
it removes the chain, not a patched braces release. `npm view braces version --json`
must also confirm that no newer upstream patch is available while this exception
is active. Registry unavailability fails closed. Any changed chain, advisory scope,
other reported fix, upstream patch or Critical escalation requires review. Acceptance
expires after **2026-11-03 UTC** with no automatic renewal. If the advisory disappears,
the verifier passes without requiring the exception even after that date. Low/Moderate
counts remain npm runtime-audit output; they are not silently promoted into exemptions.
Maintainer remains review owner; the canonical exception controls are unchanged.

## Repository and migration checks

Tracked files plus local non-ignored additions are checked. Only `.env.example` is
allowed, and its credential/target fields must remain empty. Bounded private-key,
GitHub/provider/AWS token signatures report only filenames. No tracked `.next`,
coverage/temp/benchmark, `.codex`, operational state, node_modules or log/cache artifacts.
Whitespace checks cover the working/index diff; Actions also checks the checkout's
last parent diff. A final `git diff --exit-code` rejects source/lock mutation by tools.
No Git-history secret scan or generic entropy claim is made.

Runtime service-role references are forbidden except the reviewed default-off
`lib/ai/persistent-embedding-cache.ts`, whose two disabling guards must remain.
CI supplies no service-role or cache-enabling env; existing regressions verify policy.
This exception is dormant code, not permission to activate it.

Migration names must contain valid unique UTC timestamps and lowercase ordered names.
Release/history docs' literal migration filenames must still exist. The critical
02D sources are frozen by SHA-256 of UTF-8 text with CRLF normalized to LF:

| Source | SHA-256 |
| --- | --- |
| `20261004120000_application_rate_limit_v1.sql` | `08e2c5b6798df8200820df3e2687a8f649fd45ae8a1ab775f735133bdd060ff9` |
| `20261004123000_application_rate_limit_forward_fix_v1.sql` | `7163173c55cfb9764d95929f83b8e3cae659414d5fa5e44d647535b740339d79` |
| `20261004124000_application_rate_limit_reserve_alias_fix_v1.sql` | `27fc11b118013897b913efecc62f382499416c2bf4ffb83f8d6386e98c027834` |

Dependency order is base → forward fix → alias fix. No SQL execution/remote ledger
connection; CI preserves source-history assumptions, not current applied-state claims.
New reviewed forward migrations remain allowed without rewriting these sources.

## Official immutable Actions

Verified against official GitHub repositories/tags on 2026-10-05:

- [checkout commit](https://github.com/actions/checkout/commit/d23441a48e516b6c34aea4fa41551a30e30af803): `d23441a48e516b6c34aea4fa41551a30e30af803`, official v6 tag at verification.
- [setup-node commit](https://github.com/actions/setup-node/commit/249970729cb0ef3589644e2896645e5dc5ba9c38): `249970729cb0ef3589644e2896645e5dc5ba9c38`, official v6 tag at verification.

Workflow uses full SHAs, not floating tags. Updates require explicit review.

## Validation and remaining gates

**LOCAL_VALIDATED** results (Windows, Node 24.14.0 / npm 11.19.1):

| Check actually executed | Result |
| --- | --- |
| Clean source install | PASS: `npm ci` with workspace-local cache and `--no-audit`; audits executed separately; 421 packages. Package/lock unchanged. |
| Helper policy/security tests | PASS: 40 tests, 0 fail/skip; includes expired/absent/unknown advisories, dev/runtime graph changes, workflow authority, skips, credential guards and worker IPC. |
| Existing targeted security regressions | PASS: 7 files / 432 tests, 0 fail/skip. |
| Full `npm run test:run` with final network guard | PASS: 195 passed files / 2,810 tests; 18 conditional skipped files / 59 skipped tests; 0 fail. |
| Fresh `next typegen`, `tsc --noEmit --incremental false` | PASS; no prior generated type dependency. |
| `npm run lint` | PASS: 0 errors, existing recommendation-composer navigation warning. |
| Clean production `npm run build` | PASS: Next 16.3.8, 35 dynamic API routes, Proxy; no application credential or external Node connection required. |
| Runtime npm audit | PASS: 0 total vulnerabilities, including 0 High/Critical. |
| Full audit verifier + upstream version | PASS: 5 High entries accepted only as V1-SEC-EXCEPTION-001; 0 Critical / unknown High; upstream braces 3.0.3. |
| YAML parse/workflow structure, helper syntax | PASS; reused locked js-yaml/TypeScript tooling, no added dependencies. |
| Hygiene/security/test-integrity, migration consistency | PASS; source/index scan and isolated credential-free environment check. |
| `git diff --check`, new-file whitespace, package-lock stability | PASS; original package-lock SHA-256 remains `d8502037e1e211818ff1a40178b2c543447c7e21145919004091d550c14b079a`. |

Validation used an ignored clean source export with no local env, credential
inheritance or generated types. `--repository-only` checks source/index in the
original tree; `--environment-only` checks the clean export. Actions uses the
default combined checks, with no bypass option. No application runtime file changed.

Initial install failed on sandbox access to the user npm cache; a workspace-local
cache resolved it. Initial validation-harness failures were corrected without changing
SQL or assertions: source export now uses `core.autocrlf=false`, preload is absolute
for unrelated-cwd children, and literal loopback IPC is permitted. After changing the
guard, a clean build removed cached Turbopack failure results. All final checks above
passed. Existing 15 dormant annotation-tool tracing warnings remain; the nested local
export also causes an inferred workspace-root warning. No framework warning was
suppressed or application config changed to accommodate the harness.

**GITHUB_ACTIONS_LIVE_UNVERIFIED**:
hosted Linux execution, Actions checkout/cache/token behavior, PR/push triggers and
concurrency require the first authorized GitHub CI run. A Windows local validation
cannot prove those behaviors. No push is performed to obtain that evidence.

Existing Production holds stay in the [canonical acceptance table](D8_RELEASE_CANDIDATE_ACCEPTANCE.md#d8-4a5d-kanonik-production-hold-tablosu).
CI does not close Node 24 Preview, immutable RC acceptance or artifact tracing review.
Existing external/manual holds require fresh evidence: Production direct signup deny;
approved security migration and Security Advisor rerun; manual legal review of the
existing privacy package; final Production env review; exact targets, backup/Storage
and change window. Open Library contact is already CLOSED in the canonical table;
disabled AI/AniList/TMDB/admin enablement remains post-release. No hold status changed.
No Production/Staging access, deployment,
repository settings mutation, migration, secret provisioning, commit/push or Vault
write/sync occurs in this repository-only task. Historical D8 evidence remains intact.

**Verdict: V1-HARDENING-03 COMPLETE — GITHUB CI LIVE RUN REQUIRED.**
Next gate: authorized publication of this source followed by an actual PR/release
branch CI run; hosted PASS and Preview/artifact review precede new immutable RC
acceptance. This statement does not authorize a push or Production cutover.
