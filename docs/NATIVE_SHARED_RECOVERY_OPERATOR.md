# Shared-managed native recovery operator package

Status: LOCAL_PG18_RECOVERY_VERIFIED. The packaged PG18_RECOVERY_PROOF.json records
a real synthetic PG18 dump/restore PASS for this exact recovery source. Hosting
migration, real hosting backup and off-host copy remain NOT_RUN. Existing live Auth/RLS/HTTP Cloud
Sync acceptance is retained; this package does not repeat or replace it.

## Scope and prerequisites

This is an operator source overlay, not a web deployment. Use the existing private
operator workspace with its installed `pg` and `sharp` dependencies. Verify the ZIP
SHA-256 through a trusted independent channel, then the internal SHA256SUMS before
copying sources. Never copy this package into a public/static directory. It contains
no credentials, CA files, real account data or database backups.

001â€“009 source SQL and execution checksums are unchanged. Only
`010_backup_select_policies.sql` is appended to both checksum manifests. Updating
the manifests in a running web release before 010 is installed would fail its
readiness check: do not deploy the web application as part of this operation.

No BYPASSRLS, hosting restore database, database ownership change, new role graph,
or runtime grants are requested. Use the already separated backup login. Existing
role/schema graph must satisfy `native-hosting-contract.mjs`. Unknown or extra
memberships fail closed; runtime cannot inherit or SET backup. 010 revokes backup's
old direct freeze-function grant; the existing privacy operator remains responsible
for an independently approved maintenance window.

## 1. Produce local PostgreSQL 18 evidence first

On a local machine with Docker running and an **already local** `postgres:18-alpine`
image, run from the source repository/operator package root:

```sh
node scripts/native-recovery-proof.mjs --proof > /private/recovery-proof.json
```

The runner never pulls/builds an image or reads hosting connection variables. It
creates its own internal network, tmpfs database and attested loopback relay; no
published ports, bind mounts or external service mutation. Windows Docker Desktop
uses a container-pinned exec/BusyBox TCP tunnel because its bridge IP is not routable
from the Windows host; other platforms retain the original TCP relay. It provisions the exact
hosting-test role graph with NOBYPASSRLS logins, applies 001â€“010, seeds two synthetic
users with the same media/goal IDs and separate private profile assets, checks owner
isolation, denies backup writes, rejects missing/restrictive backup policies, dumps
as the backup login and restores as an isolated local administrator. The same
backup implementation is used under an attested runner capability.

Success requires matching full table counts/content digests (including Auth,
lifecycle, receipts, social, limiter and ledger), sequence state, schema/table/
function ownership and ACLs, policy/FORCE RLS, constraints, triggers, indexes, role
settings, database owner/ACL and all private file hashes. Both users' own reads,
cross-owner reads/writes and runtime SET-backup denial are checked after restore.
PASS is emitted only after cleanup. Missing Docker/PG18 returns NOT_RUN and nonzero
exit. Preserve the successful JSON and independently pin its `fingerprint`.

The shared backup apply gate requires that PASS record, its independently approved
fingerprint and an exact fingerprint of the recovery source/migration version.
NOT_RUN, modified sources, missing evidence or a failed roundtrip keep it closed.
The synthetic record verifies the recovery mechanism, not a real hosting backup.

## 2. Inspect the hosting target read-only

In the private hosting operator environment, select the existing actual profile
(`hosting-test` or `hosting-production`), `NATIVE_HOSTING_CAPABILITY=shared-managed`
and `NATIVE_OPS_ROLE_KIND=backup`. Supply the **backup** connection through the
existing secret environment, never a command argument or runtime URL fallback.
Keep `verify-full`, the absolute CA path and the correct environment classification.

```sh
node scripts/native-recovery-preflight.mjs --connect
```

This reports the actual target fingerprint, pending migrations, coverage, existing
freeze and local pg_dump 18 availability in a read-only transaction. The first
inspection may report identity without expected fingerprint; later apply requires
an independently confirmed `NATIVE_OPS_EXPECTED_FINGERPRINT`. A migrator fingerprint
does not confirm the backup login's target identity.

Inspect the pending 010/011 mapped SQL and approve it separately on the
actual target. The existing migration runner, using the existing migrator login,
its own exact target fingerprint and explicit `MIGRATE <environment> <fingerprint>`
confirmation, applies only missing entries under lock/transaction/checksum checks.
Do not reapply/edit 001â€“009 or manually rewrite the ledger. No migration was applied
by preparation of this package.

010 adds only schema USAGE, table/sequence SELECT and identity-guarded permissive
SELECT policies for backup on already RLS-enabled tables. It does not change
ENABLE/FORCE RLS or existing owner/runtime policies. Applicable restrictive SELECT/
ALL policies cause migration rejection; they are never removed or broadened.
At backup time every managed table/sequence grant, exact backup policy, FORCE RLS,
role membership, column write grant, grant option and executable function is checked
again. New uncovered tables, new restrictive policies or unexpected rights block it.

011 limits legacy permissive PUBLIC SELECT/ALL social policies to their existing
owner/runtime callers, preserving every USING/WITH CHECK expression. Otherwise
those policies also apply to backup and invoke business helpers it cannot execute.
Unexpected existing direct SELECT readers block 011. The real local test compares
all policy expressions and role scopes immediately before/after 011; runtime
permissions are unchanged and backup gains no business-function EXECUTE.

Catalog comparison keeps full text identities (not 63-character PostgreSQL name
values), casts internal char fields explicitly and canonicalizes only nested AND
grouping in CHECK definitions, which pg_dump/reparse can flatten. All operands,
literals, operators, ordering and other catalog/ACL/ownership assertions remain.

## 3. Consistent private backup, only in an approved maintenance window

Stop the web/Passenger workers, Auth writers, scheduled jobs and every operator that
can change DB or storage. The release write barrier alone does not stop all Auth/
filesystem writers. The existing privacy operator must already have set the release
freeze. The backup login cannot set/clear it and the backup leaves it frozen.
Never assert quiescence while the site or jobs are still running.

Keep output outside the application and storage roots, under an operator-only parent
directory (Linux 0700; backup files 0600). On Windows use a private parent with an
operator-only NTFS ACL; chmod is not an NTFS ACL proof. A new output is exclusive;
partial failed output is not a valid backup. Existing limits remain 2 GiB/10,000
files and 180 seconds per child tool; inventory additionally bounds one million rows.
Exceeding a limit fails, never truncates or skips.

With target, proof fingerprint and absolute private paths supplied as non-secret
operator variables:

```sh
node scripts/native-recovery.mjs backup --connect --apply \
  --confirmation "BACKUP $NATIVE_OPS_ENVIRONMENT $NATIVE_OPS_EXPECTED_FINGERPRINT" \
  --quiesced ALL_WORKERS_AND_OPERATORS_STOPPED \
  --storage "$NATIVE_STORAGE_ROOT" --output "$NATIVE_RECOVERY_OUTPUT" \
  --recovery-proof "$NATIVE_RECOVERY_PROOF" \
  --recovery-proof-fingerprint "$NATIVE_RECOVERY_PROOF_FINGERPRINT"
```

The backup holds the maintenance and migration locks. pg_dump **18.x** imports the
same exported REPEATABLE READ snapshot used for table digests. Before/after DB,
role/database contracts and storage trees must match. Referenced assets must exist
with the correct size; all private assets and temporary uploads are included.

`--enable-row-security` is necessary here but does not establish completeness on
its own. The structural all-row backup SELECT proof, exact role graph, absence of
applicable restrictive policies, shared snapshot and independently checked restored
inventory provide the evidence. See [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)
and [row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

## 4. Encrypt and copy outside hosting

Use an independently generated 32-byte binary AES key in a private 0600 file outside
the backup/application. Supply only its path via `NATIVE_RECOVERY_KEY_FILE`. Never
print the key/password or include either in this ZIP or the sealed backup. Keep the
key in a separately controlled off-host location. The existing MTDR1 AES-256-GCM
envelope is streamed per file with random IVs, tags and ciphertext hashes.

```sh
node scripts/native-recovery-seal.mjs seal "$NATIVE_RECOVERY_OUTPUT" "$NATIVE_RECOVERY_SEALED"
```

Record the SEALED fingerprint through an independent trusted channel. Copy **only**
the sealed directory to your explicitly chosen, independently administered off-host
destination using authenticated SSH/SCP (or your existing secure transfer tool):

```sh
scp -pr "$NATIVE_RECOVERY_SEALED" "$NATIVE_RECOVERY_OFFSITE_DESTINATION"
```

Do not infer the destination, host key or operator account. This preparation has
not run that command. Confirm private destination ACLs and retention separately.
Retrieve the off-host copy locally and authenticate/decrypt it with the independently
stored key and pinned SEALED fingerprint into a fresh private directory:

```sh
node scripts/native-recovery-seal.mjs unseal "$NATIVE_RECOVERY_OFFSITE_COPY" "$NATIVE_RECOVERY_LOCAL_PLAIN" "$NATIVE_RECOVERY_SEALED_FINGERPRINT"
node scripts/native-recovery-proof.mjs --input "$NATIVE_RECOVERY_LOCAL_PLAIN" --backup-fingerprint "$NATIVE_RECOVERY_BACKUP_FINGERPRINT"
```

Restore is only into a newly created isolated local PG18 container. Exact hosting
role names, managed ownership/ACL, role settings and database owner/ACL are reproduced;
provider-only database ACL principals are recreated locally without provider powers.
Passwords/provider privileges and hosting OS/TLS/deployment configuration are not
exported: reprovision those separately. pg_restore retains ownership/ACL, runs one
transaction and exits on error. The hosting `restore` operation remains unavailable
in shared-managed mode. Do not use --no-owner, --no-acl or restore into hosting.

For a real backup the runner compares every recovered row/file to the captured
inventory and checks two recovered media owners' runtime reads if two exist. Fewer
than two yields `twoUserIsolation: NOT_RUN`, not PASS. The synthetic two-user proof
remains mandatory for enabling this path. A private-backup restore PASS cannot be
substituted for the source-bound synthetic gate.

Only an authenticated off-host roundtrip and the actual backup's PG18 restore close
the backup acceptance gate. Preserve recovery evidence and key access/retention
records. Do not reopen traffic, erase plaintext or change production as an automatic
consequence of these scripts. Browser-local data, vendor logs and hosting secrets
are outside this DB/private-storage recovery package.
