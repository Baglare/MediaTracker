# Native backend P1 foundation

Date: 2026-10-07. Classification: CURRENT_SOURCE_FACT, SOURCE_IMPLEMENTED / LIVE_UNVERIFIED.

P1_STATUS = PARTIAL. The source foundation is implemented; real native PostgreSQL,
Better Auth credential/session and RLS integration proof is BLOCKED_ENVIRONMENT.
This is not production readiness or authorization to deploy, migrate users or data.

## Baseline and preservation

Work began on `release/v1-hardening`, HEAD `a68317b8b719600e3731912d05ef3cc97c184b94`,
with an intentionally dirty tree. Current local source was authoritative.
Initial modified/untracked file hashes were captured before changes. Only two of
those pre-existing dirty files received P1 edits: `package-lock.json` (additive
dependency resolution) and `tests/v1-operations.test.mjs` (explicit Supabase selector
in the hosted environment fixture). Other initial dirty files remained byte-identical.
The pre-existing source-map-js 1.2.2 remediation remains in the lockfile.
The backup archive was only read for a scoped dependency-version comparison;
it was not extracted, restored, modified, moved or overwritten.
No reset, restore, checkout, stash, clean, commit, push, merge, tag or remote mutation.

## Architecture

Browser -> application `useAuth` contract -> selected auth adapter -> same-origin
Next.js auth handler -> Better Auth database sessions -> one controlled server-only
pg Pool. Future protected repositories use `withAuthenticatedTransaction(callback)`:
verified server session -> checked-out client -> BEGIN -> transaction-local identity
-> callback queries on that client -> COMMIT, or ROLLBACK and discard.

`getCurrentUser()` returns a minimal UUID application identity. Neither UI nor domain
code needs Better Auth session types. `user_metadata` is retained only as a narrow
display-name compatibility field; it never conveys privileges. Client state remains
presentation state; server session verification alone authorizes database identity.

Existing Supabase packages, adapters, routes and historical migrations remain.
No domain repository was translated. Native mode suppresses the Supabase client/env
boundary even when old Supabase variables remain in a local shell. Existing Cloud,
social, XP, theme, assets, lifecycle and distributed provider limiter operations are
not native implementations and cannot be treated as supported native features.
Local owner UUID namespaces still derive from `useAuth().user.id`.

## Provider selection and environment contract

`lib/backend/provider.ts` is the sole selector. `BACKEND_PROVIDER` accepts exactly
`supabase` or `native`. Missing selection defaults to Supabase only outside production.
Missing/invalid production selection fails closed. Existing production deployments
must intentionally set `BACKEND_PROVIDER=supabase` before building this source.
No hosted configuration was changed in P1.

Next config exposes only a derived `NEXT_PUBLIC_BACKEND_PROVIDER` build constant.
Do not set that mirror independently. Server/build selector mismatch is rejected;
changing provider requires a matching build and process restart. Native configuration
is checked lazily before a pool/auth instance is used. Missing credentials do not
silently fall back to Supabase.

| Variable | Supabase | Native LOCAL | Native PREVIEW/PRODUCTION | Visibility / owner |
| --- | --- | --- | --- | --- |
| BACKEND_PROVIDER | explicit hosted `supabase`; local absent allowed | `native` | explicit `native` | non-secret selector; release operator |
| DATABASE_URL | forbidden runtime/release env | required disposable PostgreSQL URL; login `mt_runtime`; no query/hash | required independently reviewed native target; same login | server secret; DB operator |
| DATABASE_SSL_MODE | forbidden | required `disable` or `verify-full` | required `verify-full`, certificate verification enabled | server non-secret; DB operator |
| DATABASE_POOL_MAX | forbidden | optional integer 1-5, default 2 | optional integer 1-5, default 2 | server non-secret; DB operator |
| BETTER_AUTH_SECRET | forbidden | required synthetic secret, at least 32 characters | required independent high-entropy secret, at least 32 characters | server secret; security operator |
| BETTER_AUTH_URL | forbidden | required canonical HTTP(S) origin | required canonical HTTPS origin | server non-secret; release operator |
| NEXT_PUBLIC_APP_URL | existing Supabase contract | if supplied, equals Better Auth origin | required, equals Better Auth origin | public build value; release operator |
| PG* | forbidden | forbidden in release env | forbidden | no implicit alternative connection settings |
| NEXT_PUBLIC_SUPABASE_URL / ANON_KEY | existing pairing required when enabled | not used | forbidden native release targets | public Supabase configuration |

`scripts/ops/release-policy.mjs` now permits/requires DATABASE_URL only in valid
native mode. Existing forbidden credentials, paid AI/provider gates, fixed disabled
policy, CI credential absence and Supabase pairing remain enforced. Native env
validation describes foundation configuration, not native production feature
acceptance. Native Cloud flags cannot enable deferred Supabase transports.
The generated `V1_HARDENING_06_ENV_CONTRACT.json` matches its source contract.

Total connection budget is per PostgreSQL login, not per Passenger worker. Each
process has one reusable Pool; default max is 2. Bootstrap limits `mt_runtime` to
5 connections across processes. Tune worker count and pool max together; saturation
fails closed. Passenger restart creates a fresh pool without session identity.
TLS URL query options cannot override certificate verification. No credentials,
queries, request bodies or raw database errors are logged.

## Transactions and remaining identity trust

The transaction API has no caller-provided userId argument. It obtains identity
from `getCurrentUser()`, parameterizes `set_config('app.user_id', $1, true)`, and
exposes queries bound to the same checked-out connection. A WeakSet validates real,
live transaction contexts; leaked/forged contexts are rejected. Callback lifetime
is bounded to 10 seconds. Database operations have 5-second statement, 6-second
client query and 10-second idle-transaction timeouts; connections have a 3-second
connection timeout. Failure expires the context, attempts rollback and discards the
client. No independent pool.query calls occur inside the authenticated primitive.

Source import validation confines pg to server infrastructure, pool access to auth
and transaction infrastructure, and Better Auth SDK imports to auth adapters. P2
protected repositories must require an AuthenticatedTransaction and validate it
with `requireAuthenticatedTransaction`, never accept a raw client/pool or owner UUID
as authenticated identity. SQL parameters may contain target IDs; RLS still checks
the verified transaction identity.

**Trust limitation:** a custom GUC can be written by SQL executing as the runtime.
This is not an independent JWT-verifying or signed identity authority. Trusted
server/repository SQL, parameterized inputs and prevention of SQL injection remain
necessary. A server compromise or arbitrary runtime SQL could impersonate another
UUID or write the private auth store. No signed-context equivalence is claimed.
Signature/key-management infrastructure was deliberately not invented in P1.

## Native bootstrap and RLS

`database/native/001_security_foundation.sql` is a separate fresh-database bootstrap,
not a Supabase migration or an automatic startup migration. Existing role names
cause failure; it must not be applied to an existing hosted database.

Provisioning requires database ownership and CREATEROLE with authority to grant/set
the created owner roles. Runtime does not require superuser, CREATEROLE, CREATEDB,
replication or BYPASSRLS. Runtime passwords are provisioned separately. Migration
operators receive explicit owner-role membership; web runtime does not.

- `mt_owner`: non-login owner of `app`; future domain tables/functions.
- `mt_auth_owner`: non-login owner of the private Better Auth schema.
- `mt_auth_access`: non-login DML role for the private credential/session store.
- `mt_runtime`: limited login; auth-access membership only, no table/schema ownership.
- `mt_privacy_operator`: non-login placeholder with no P1 access or RLS bypass.

Public schema creation and default PUBLIC function execution are revoked. Runtime
cannot create application/auth/public schemas or tables. `app.current_user_id()` is
a STABLE SECURITY INVOKER function with fixed `pg_catalog` search_path; absent or
empty identity returns NULL. Malformed UUID context fails the SQL operation.
There is no assumed `auth.uid()`, `auth.users`, `supabase_auth_admin`, Supabase Vault,
service-role or managed `postgres` authority in the native runtime design.

New physical pool connections check the actual session/current role, dangerous
attributes, privileged memberships, schema creation permissions and app table
ownership/RLS/FORCE RLS. Failed checks destroy the connection before use.
P2 grants must be explicit per table/function. Protected app tables must ENABLE
and FORCE RLS with USING and WITH CHECK. Auth tables are private server DML tables,
not owner-RLS domain tables: Better Auth must find sessions before user identity
exists. Runtime auth-store write authority is an explicit trusted-server boundary.
Lifecycle barriers and retention for this new auth store still need P2/P5 transport.

## Better Auth

Direct dependencies: better-auth 1.7.7, pg 8.23.1; dev types: @types/pg 8.23.1.
Zod resolves from 4.3.6 to 4.6.5 because Better Auth requires ^4.5.4. Other existing
dependency versions are preserved. Better Auth's own transitive SQL/adaptor packages
are present; no Prisma/Drizzle ORM or application ORM schema was introduced.

`002_better_auth.sql` contains the installed Better Auth core user/session/account/
verification/rateLimit schema, UUID primary/foreign keys, and credential/session
indexes. Default UUID generation preserves the possibility of explicitly importing
existing user UUIDs later. No real user, Supabase hash or existing session was imported.
Better Auth owns password hashing and credential verification.

Same-origin App Router handlers use the Node runtime. Database-backed sessions have
cookie cache disabled. Cookies are HttpOnly, SameSite=Lax, Secure in production,
with an independent native prefix. Trusted origins contain exactly the configured
origin. No privilege columns or editable admin metadata are configured.

Public signup is disabled in Better Auth in every runtime mode, including local.
The HTTP allowlist exposes only GET get-session and POST sign-in/email, sign-out,
get-session refresh. Signup, update-user, admin/plugin routes and extra fields are
denied before auth/database work. POST requires the existing canonical same-origin
and Fetch Metadata boundary, with bounded JSON admission (8 KiB); bodyless refresh/
signout still require Origin. GET uses deferred refresh and is read-only; server
current-user verification also disables refresh. Errors are stable/redacted;
successful cookies are preserved and responses use no-store and safe correlation.

Native browser auth maps SDK responses to the application identity, uses the SDK's
cross-tab/focus machinery, and revalidates with POST. Async request versions prevent
older native reads overwriting newer auth state. Supabase subscription/sign-in/
sign-out logic remains behind the same hook. No provider access tokens are exposed
through that application contract.

Better Auth authentication throttling is database-backed. Unverified forwarded IP
headers are not trusted: P1 uses a conservative shared bucket. This can constrain
availability and is not the existing distributed provider limiter's migration.
Native ingress/client identity and multi-process throttle proof remain required
before native deployment. Existing Supabase limiter code and semantics are preserved.

## Executable proofs and validation

`node scripts/native-postgres-proof.mjs` accepts no database target or credentials.
It requires an already-local postgres:17-alpine image, creates its own labelled
container on a fresh internal network, publishes only a random loopback port, uses
tmpfs storage and verifies the exact container/network/port/mount properties.
It never pulls an image or contacts Supabase. Cleanup identifies only resources
created by that invocation. Do not point the SQL files at an existing database.

`rls-proof.sql` verifies owner SELECT/INSERT/UPDATE, INSERT/UPDATE WITH CHECK,
cross-user SELECT/write denial, anonymous denial, A -> B reuse on one physical
connection, COMMIT/ROLLBACK identity cleanup and privileged-role/schema separation.
The runner then executes `native-postgres-live.integration.test.ts`: fresh synthetic
users provisioned through a test-only Better Auth instance with no HTTP listener,
runtime signup denial, sign-in cookies, verified current user, real pg transaction
RLS and max-1 pool reuse. The test independently re-inspects the disposable target
before any DB contact. Missing runner configuration is an explicit live test SKIP.

Current environment: Docker executable exists but daemon is unavailable; psql is
unavailable. The runner stopped before creating a container or contacting a DB.
**Real DB integration proof: BLOCKED_ENVIRONMENT / NOT EXECUTED.** Neither bootstrap
execution, schema/adapter compatibility nor live RLS/cookie/session behavior is PASS.

Validation results (source/units only):

- Native focused Vitest: 23 PASS; native release/source-boundary Node tests: 3 PASS.
- Final full offline Vitest: 3003 PASS, 57 SKIP (56 existing live tests plus native
  proof), including the transaction-timeout proof.
- Operational/release/CI Node tests: 67 PASS, including 3 native policy/import tests.
- TypeScript: PASS (`tsc --noEmit --incremental false`).
- Tracked + untracked source ESLint: PASS, 0 errors; one existing navigation warning
  and eight ignored design-reference notices. Ignored .codex artifacts were excluded
  without weakening ESLint configuration.
- Final Production build: Supabase PASS and native PASS using synthetic/empty env values
  and the existing offline preload; no deployment. Existing 15 annotation filesystem
  tracing warnings remain outside P1 scope. Both builds include final runtime changes.
- Runtime dependency audit: PASS, 0 vulnerabilities. Full audit: 5 High dev-only
  entries, accepted by unchanged V1-SEC-EXCEPTION-001; no new runtime advisory.
- Existing release-policy/source/migration validation and git diff --check: PASS.

Windows sandbox initially denied temporary renames/junctions and Turbopack pg
junction creation. Unrestricted local validation with the same offline network
guard resolved these environment failures; assertions were not weakened. Temporary
ops backups were kept outside the repository. No browser/GUI/E2E or hosted smoke ran.

## Files changed by P1

Added:

- `lib/backend/provider.ts`, `native-config.ts`, `postgres.ts`, `transaction.ts`.
- `lib/auth/identity.ts`, `native-options.ts`, `native.ts`, `current-user.ts`, `browser.ts`.
- `app/api/auth/[...all]/route.ts`.
- `database/native/001_security_foundation.sql`, `002_better_auth.sql`, `rls-proof.sql`.
- `scripts/native-postgres-proof.mjs`.
- `tests/native-backend-foundation.test.ts`, `native-auth-boundary.test.ts`,
  `native-auth-browser-adapter.test.ts`, `native-postgres-pool.test.ts`,
  `native-postgres-live.integration.test.ts`, `native-release-policy.test.mjs`.
- `docs/NATIVE_BACKEND_P1_FOUNDATION.md`.

Modified:

- `package.json`, `package-lock.json`, `next.config.ts`.
- `hooks/use-auth.ts`, `lib/supabase/status.ts`, `lib/supabase/client.ts`.
- `features/settings/components/settings-feature.tsx`,
  `components/cloud-data-status-card.tsx`, `lib/profile-preferences.ts` (application identity types).
- `scripts/ops/release-policy.mjs`, `docs/V1_HARDENING_06_ENV_CONTRACT.json`.
- `scripts/ci-checks.mjs`, `.github/workflows/ci.yml` (source import boundaries and explicit
  credential-free Supabase production-build selector; all previous checks preserved).
- `tests/authenticated-mutation-boundary.test.ts`, `tests/v1-operations.test.mjs`
  (new protected auth route inventory and explicit Supabase release fixture).
- `.ai/project-map.json` (existing cloud/auth domain routing for native source/proofs).

Ignored local validation scripts/logs are not product source. Historical Supabase
migrations, README, AGENTS, existing hard-disable/lifecycle/queue/CAS/tombstone logic
and all other pre-existing release-hardening edits were preserved.

## Blockers and exact P2 decision

P2 implementation planning/source work can use these interfaces. **P2 runtime/domain
transport acceptance is NOT_READY** until the disposable PostgreSQL runner passes
both SQL and Better Auth/pg proofs. No production readiness is claimed.

Remaining risks: unsigned runtime-writable identity GUC; trusted shared auth-store
write authority; unexecuted native bootstrap/adapter/RLS proof; verified native
ingress/throttle behavior; aggregate Passenger connections; new native auth retention
and lifecycle containment. The existing hosted/legal/RC release gates remain open.

Deferred: full business schema/function/trigger/RLS translation, Cloud Media, Goals,
social, XP, theme sync, distributed provider limiter, filesystem assets, privacy
export/delete/retention, real UUID/hash/session import, real users/files/data,
production target/change window/backup/cutover/rollback. These require later phases
and separately authorized local/live targets.

The configured Vault retrieval returned VAULT_GIT_INVALID. No canonical Vault,
AGENTS regeneration, autopilot apply, Vault commit/push or guessed candidate path
was used. This report preserves the durable P1 decision locally; Vault sync remains
unperformed under the no-remote-mutation constraint.

References: [Better Auth options](https://better-auth.com/docs/reference/options),
[database/UUID contract](https://better-auth.com/docs/concepts/database).
Installed Better Auth 1.7.7 schema/source and installed Next.js 16 App Router/environment
guides were inspected for implementation; executable repository code is authoritative.
