# mt_p4_test acceptance commands

This tool never applies migrations or changes roles. Production URLs/profiles,
non-loopback endpoints, unpinned fingerprints and non-verify-full TLS are rejected
before connection. Run on the existing hosting environment with PostgreSQL at
127.0.0.1:5433; do not copy credentials into commands, output or source.

Reuse the private migrator preflight environment: `NATIVE_ROLE_PROFILE=hosting-test`,
`NATIVE_HOSTING_CAPABILITY=shared-managed`, `NATIVE_OPS_ENVIRONMENT=disposable`,
`NATIVE_OPS_ROLE_KIND=migrator`, `NATIVE_OPS_DATABASE_URL`,
`NATIVE_OPS_SSL_MODE=verify-full`, absolute `NATIVE_OPS_SSL_CA_FILE`, and the independently
verified `NATIVE_OPS_EXPECTED_FINGERPRINT`. Add `NATIVE_ACCEPTANCE_RUNTIME_URL` with
the test runtime login and the exact same host, port and mt_p4_test database.

Read-only catalog, runtime connection and checksum acceptance:

```sh
node scripts/native-hosting-acceptance.mjs --read-only
```

This checks all nine ledger checksums, no pending migrations, exact live identities,
TLS, the closed hosting role graph, runtime boundaries, Auth adapter columns/session
DML permissions, FORCE RLS/policy presence and required native/limiter function ACLs.
It reads catalogs, not existing user rows. Both connections end their read-only
transactions with ROLLBACK. It does not prove password login, cookies, HTTP origin
checks, pooled session identity, limiter signature execution or disaster recovery.

Synthetic rollback probe, requiring separately approved execution:

```sh
node scripts/native-hosting-acceptance.mjs --rollback-test --confirmation "ROLLBACK_TEST mt_p4_test <verified-fingerprint>"
```

**Currently BLOCKED_ROLE_TOPOLOGY:** the closed migrator graph cannot SET ROLE to
runtime; runtime cannot INSERT Auth identities. The tool checks this capability
before inserting fixtures and rolls back on denial. No memberships/grants are
added by the tool. The current hosting contract also rejects extra migrator/runtime
membership, so granting it would not make the acceptance CLI pass. Resolve this
test-harness authorization conflict explicitly with the operator/provider before
claiming that a single-transaction live runtime test is executable. Do not relax
the production graph or use real users as a shortcut.

The rollback probe body covers fresh UUID/example.invalid identities, session
storage, A/B/anonymous filtered reads, cross-owner RPC rejection, Media idempotency
and tombstones, Goals create/tombstone. Every path rolls back. SET ROLE probes
retain the migrator session_user and cannot prove a true runtime login; real
Better Auth HTTP/password/session acceptance remains a separate outstanding gate.

Corrected hosting-test 009 SHA-256:
`5ed5a095be0c42a4ca6ef1db0a01d092b8f28c41fa76eef8e8bd6b6c808c240a`.
2026-10-11 operator report: migrations 001–009 were applied to the real TürkHosting
mt_p4_test database and this 009 ledger checksum was verified. This is user-reported
hosting evidence; no database connection or migration was performed in this source review.
001–008 and local historical SQL/checksums are unchanged. Compare this checksum
with the server ledger using the read-only command; server SQL/ledger was not
retrieved during source preparation.

The existing CI builds `native-linux-artifact` after `validate` on a push to
release/v1-hardening. It emits the commit-bound tar.gz, SHA-256 file and native ABI
report without deploying. Commit/push needs separate user authorization. Verify
that exact clean SHA's CI/artifact and hosting Node/ABI compatibility before a
separately approved Plesk/Passenger deployment. Keep real signup/Cloud Sync closed
until Auth/RLS and provider backup/restore acceptance are proven; guest/local-first
release remains possible. Supabase/provider disabled policies are unchanged.
