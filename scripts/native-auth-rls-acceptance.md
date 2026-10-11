# Native HTTP Auth + RLS acceptance — test only

This companion is the execution plan for `native-auth-rls-acceptance.mjs`.
No hosted acceptance has been run during development. Production is excluded.

## Required operator approval

Run from the existing private operator checkout with its existing Node 24 dependencies,
CA and credentials. Do not upload `.env.local`, replace Plesk runtime secrets, grant
roles, install packages or change migrations for this test.

Before approving execution, independently inspect the **test Plesk application's**
effective `DATABASE_URL`, `BETTER_AUTH_URL`, `NATIVE_ROLE_PROFILE`, TLS and storage root.
The HTTPS origin must route to that application, using `mt_p4_test`, not the production
application. The fingerprint cannot bind an HTTP virtual host by itself. Assign
`NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT` only after this operator verification.
The tool subsequently checks that each HTTP session token actually exists in the
verified test runtime DB. No new diagnostic HTTP endpoint is introduced.

Use the existing private process environment; required inputs are:

| Variable | Contract |
| --- | --- |
| `NATIVE_ROLE_PROFILE` | `hosting-test` |
| `NATIVE_HOSTING_CAPABILITY` | Existing `shared-managed` or `dedicated` profile |
| `NATIVE_OPS_ENVIRONMENT` / `NATIVE_OPS_ROLE_KIND` | `disposable` / `migrator` |
| `NATIVE_OPS_DATABASE_URL` | Secret; `mt_test_migrator`, `127.0.0.1:5433/mt_p4_test` |
| `NATIVE_ACCEPTANCE_RUNTIME_URL` | Secret; existing `mt_test_runtime`, same host/port/DB |
| `NATIVE_ACCEPTANCE_CLEANUP_URL` | Secret; existing `mt_test_privacy_login`, same host/port/DB |
| `NATIVE_OPS_SSL_MODE` / `NATIVE_OPS_SSL_CA_FILE` | `verify-full` / existing absolute CA path |
| `NATIVE_OPS_EXPECTED_FINGERPRINT` | Independently verified 64-character test fingerprint |
| `NATIVE_ACCEPTANCE_HTTP_ORIGIN` | Independently verified canonical test HTTPS origin, no trailing slash |
| `NATIVE_ACCEPTANCE_HTTP_TARGET_FINGERPRINT` | Same fingerprint, after HTTP/application binding review |
| `NATIVE_STORAGE_ROOT` | Existing test runtime storage root, read-only operator access |

Missing existing privacy credentials/permissions or safe filesystem access means
**BLOCKED before any fixture insert**. Do not substitute migrator/runtime credentials
for privacy credentials. The old single-transaction rollback test remains blocked by
its closed role graph; this tool does not change that graph.

## Exact commands (Linux operator shell; do not execute without approval)

Offline default, no environment or connection needed:

```sh
node scripts/native-auth-rls-acceptance.mjs --plan
```

Retain the returned non-secret `runId`. Set `RUN_ID` to that value. After explicit
approval of test DB fingerprint, HTTP origin, fixture creation/deletion and run ID:

```sh
node scripts/native-auth-rls-acceptance.mjs --execute --run-id "$RUN_ID" --confirmation "AUTH_RLS mt_p4_test $NATIVE_OPS_EXPECTED_FINGERPRINT $NATIVE_ACCEPTANCE_HTTP_ORIGIN $RUN_ID"
```

Recovery after interruption, uncertain COMMIT acknowledgement or cleanup failure,
with the **same** run ID and fresh target checks/explicit recovery approval:

```sh
node scripts/native-auth-rls-acceptance.mjs --recover --run-id "$RUN_ID" --confirmation "RECOVER_AUTH_RLS mt_p4_test $NATIVE_OPS_EXPECTED_FINGERPRINT $NATIVE_ACCEPTANCE_HTTP_ORIGIN $RUN_ID"
```

Recovery performs no HTTP requests, creates no users and does not need their passwords.
It reconstructs only two deterministic UUID/email/name markers. It refuses mismatched
identities, unrecognized application data, social participants or storage artifacts.
Already removed users are an idempotent success only if no scoped residues remain.
Never use broad `LIKE`, email suffix deletion or manual cascade deletion as recovery.
If recovery is BLOCKED/FAIL, retain the run ID and resolve the exact test-target
permission/storage issue with the operator; do not loosen protections.

## One controlled process

1. Configuration/confirmation checks precede connections. Migrator target, TLS,
   server/OID, closed role graph and exact migration checksums must pass.
2. Cooperative advisory lock excludes concurrent runs of this tool. Check privacy
   login target/TLS and existing cleanup function EXECUTE rights; check unfrozen
   release, auth-owner INSERT/SELECT rights and owner SET capability. Require zero
   existing Auth users for a new run, and safe absence of both fixture filesystem paths.
3. Verify three independent runtime connections (A, B, anonymous) against the same
   target, FORCE RLS, grants and function contracts, before any fixture DML.
4. In one committed migrator/auth-owner transaction insert two unique
   `@example.invalid` users and credential accounts. UUID/email/name are run scoped;
   passwords are random and memory only. `better-auth/crypto.hashPassword` supplies
   the real unchanged scrypt format; provider is `credential`, accountId is user UUID.
   The existing initialization trigger creates ACTIVE lifecycle rows.
5. Normal HTTP sign-in for both users, secure host-only HttpOnly SameSite=Lax cookie,
   GET/POST get-session identity and DB session binding, incorrect password 401,
   anonymous null session, signup 404 and cross-origin 403. Pace accounts by 11s for
   the unchanged shared Better Auth limiter. Do not run other Auth probes concurrently;
   allow at least 11s since earlier sign-in probes. Unexpected 429 fails the run;
   the tool never deletes/reset shared rate-limit buckets or retries without bounds.
6. Bind only the HTTP-verified user UUIDs with transaction-local `app.user_id` on
   their separate runtime connections, matching the DB identity binding pattern.
   Commit media/progress/goal writes through existing RPCs; test media/progress replay;
   assert each owner sees only its rows and anonymous sees none. Check cross-owner
   UPDATE/DELETE/INSERT permission/RLS denial, cross-owner RPC CAS conflicts and
   anonymous RPC denial; re-read revisions/data afterward. Direct denial probes
   always roll back. This is **DB/RLS acceptance**, not HTTP Cloud authorization proof.
7. Sign-out, replay the original cookie to prove HTTP invalidation, and confirm
   original DB session token was removed. DB/RLS and HTTP Auth have separate outcomes.
8. In `finally`, recheck target and cleanup capability. Use existing privacy functions
   in one DB transaction: pending → erasing → application cleanup → filesystem absence
   check → filesystem verified → auth finish. This preserves the lifecycle/immutable
   data contracts. Only known run-owned media/progress/goals/receipts may be present;
   any other scoped rows block cleanup before deletion. No filesystem mutation occurs.
   Assert no remaining Auth/assets/application/scoped records before COMMIT.

Reports contain only run ID, fixed status/reason strings, and no password/hash,
cookie/token, DB URL or raw SQL/HTTP errors. Exit 0 for offline plan, successful
Auth+DB/RLS+cleanup, or successful recovery; otherwise exit 1. Exit 0 is **not** a
full P4 release gate: HTTP Cloud Sync and backup/restore remain BLOCKED explicitly.

## Remaining limits and local evidence

`TRUSTED_INGRESS_MODE=unconfigured` prevents HTTP Cloud Sync acceptance. The script
does not call Cloud HTTP or claim its success. It never changes ingress, signup,
CSRF, RLS, freeze state, grants or storage configuration. Better Auth's shared rate
limit bookkeeping is runtime-owned, not fixture-owned, and is deliberately retained.

Connection loss, process termination or server outage can prevent immediate cleanup;
no multi-connection process can guarantee rollback across committed HTTP sessions.
The same-run recovery handles these failures without retaining secrets. Run during
an operator-controlled test window, with no other writers and public signup closed.
Full database backup/restore remains unverified; synthetic cleanup is not restore
proof. No production, migration, commit, push or deploy is part of this plan.

Local tests cover safety gates, real hash compatibility, fault/rollback/recovery
sequencing and a real loopback HTTP server through the actual native Auth route
and Better Auth with a synthetic memory DB adapter. Synthetic SQL clients test
the RLS executor and failure handling; they do not prove actual PostgreSQL policies,
hosting TLS or the native pg Auth adapter. Those remain live unverified until the
approved test-only run. Full build/E2E/browser/live DB checks are not run here.
