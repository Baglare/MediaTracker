# Native email verification (014)

No production operation has been performed. Public signup remains disabled.
Better Auth 1.7.7 issues HS256 JWTs containing email/iat/exp. Native verification
accepts only canonical base64url, the normal verification purpose, a matching
account and a live token. Only then does Node sign the bounded proof with a
separate 32-byte HMAC key. Before SMTP delivery, a purpose-separated authenticated
issuance binds the canonical JWT identity to the issuing UUID. Verification must
consume that protected issuance for the same UUID/epoch/time, so an old token
cannot verify a replacement account with the same email. SQL verifies HMAC using
RFC 2104 and PG18 SHA256. Runtime verification-table rows are not trusted. Issuance
consumption, replay insertion and verified update commit together; the existing
freeze/lifecycle trigger remains. Missing signing configuration or failed issuance
prevents delivery without changing generic HTTP address-existence responses.

## Controlled installation and rotation

Use the existing migrator login and existing exact-target/fingerprint/TLS operator
contract. Do not put keys in SQL, CLI arguments, shell history, Git, build inputs,
stdout or diagnostic output. Supply `NATIVE_EMAIL_VERIFICATION_KEY` (64 lowercase
hex characters from 32 cryptographically random bytes) and
`NATIVE_EMAIL_VERIFICATION_EPOCH` (positive Unix issuance cutoff in seconds) from
the operator's secret manager to the installer and the server process only.
Never reuse BETTER_AUTH_SECRET, limiter keys, SMTP passwords or archive keys.

1. Pin the tested SHA, artifact and 001–014 ledger. Preserve existing backup and
   user/password data. Stop all writers and freeze using the existing operator
   procedure. Verify PostgreSQL clocks and parameter logging: both
   `log_parameter_max_length_on_error` must be 0. Normal parameter logging must
   either be disabled (`log_parameter_max_length=0`) or all statement/duration/
   transaction-sampling logging must be off;
   audit/proxy/observability layers must also exclude bind values and process env.
   The installer refuses unsafe PostgreSQL parameter logging; do not relax it.
2. Apply migration014 through the existing migrator. It installs no actual key.
3. Review the offline plan:
   `node scripts/native-email-verification-key.mjs --mode install`.
   Use `--connect` for preflight, then `--connect --apply --mode install
   --confirmation "EMAIL_KEY <environment> <exact fingerprint>"` only in an
   independently authorized maintenance window. No new login or runtime grant.
4. Set the identical key and epoch in server-only process environment, restart
   workers, perform bounded authorized verification/negative checks, then unfreeze.
   Missing/wrong keys, mismatched epochs and JWTs issued before the cutoff fail closed.
5. For rotation, repeat while frozen with `--mode rotate`, a new random key and
   strictly increasing cutoff no later than current time. Old tokens are invalid;
   resend after restart. Existing verified users/passwords are unchanged.

## Backup and restore

The key table's data is excluded from every supported pg_dump invocation and
recovery row inventory. FORCE RLS exposes no key rows to backup (its SELECT
grant only permits schema-dump locking). Non-secret epoch/key SHA256
pin and replay receipts are included; archive sealing remains mandatory for user
data. Never copy the key into an unsealed backup or recovery receipt. Keep the
matching key/epoch version separately in the operator's encrypted secret store.

Restore leaves the key table empty. While still frozen, reinstall the matching
secret using `--mode restore`; it must match the restored epoch and key hash.
A missing, stale or wrong secret is rejected. Restore the matching server env,
restart and test before unfreezing. Alternatively authorize a new rotation with
a newer cutoff; all older outstanding verification links then expire by policy.
Never roll back to a 013 runtime against a 014 ledger. Existing Cloud/user data
and password hashes are preserved. A disposable proof is not hosted acceptance.
Issuance rows cascade on account deletion; replay receipts contain only a token
digest and expiry, with no account/email. Auth-owner maintenance may purge expired
issuances and receipts after their JWT expiry; never purge still-live receipts.

References: [PG18 binary functions](https://www.postgresql.org/docs/18/functions-binarystring.html),
[RFC 2104](https://www.rfc-editor.org/rfc/rfc2104),
[RFC 4231 vectors](https://www.rfc-editor.org/rfc/rfc4231).
