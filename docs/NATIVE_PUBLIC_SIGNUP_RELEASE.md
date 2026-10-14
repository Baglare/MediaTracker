# Native Public Signup V1 release candidate

Scope: existing Plesk/Passenger native runtime, PostgreSQL 18, unchanged migrations 001–013. No migration, production connection, production credentials, panel change or deployment is part of candidate preparation. The operator reports production release `af4b414f1b3b`, database `mediatracker_prod` OID `35830`, and verified encrypted offsite backup; these are operator-provided facts, not a new live verification.

## Candidate contracts

- Only the native Linux artifact job builds `NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED=true`, with synthetic credentials and offline network protection. Release validation and source-bound PG18/recovery remain prerequisite jobs. No CI deployment job is added.
- The existing compiled Cloud check also executes the browser signup getter without `process.env`, rejecting disabled/missing/unresolved signup configuration. The deployment manifest binds `publicSignupEnabled=true`; Passenger refuses a different/missing runtime value before starting. Existing legacy manifests remain usable for the previous signup-closed release.
- Better Auth keeps database sessions, UUID identity, strict origin/JSON/field admission, HttpOnly cookies, password capacity bounds and database-backed limiting. Signup uses a shared 5-attempt rolling one-hour quota across visitors and workers; unsuccessful admitted attempts consume it. Login retains the existing shared 3-attempt/10-second quota. No submitted email, cookie, IP header or user ID chooses a bucket. `Retry-After` preserves Better Auth's full wait.
- This conservative quota is appropriate only for low-volume opening: any visitor can exhaust shared registration/login capacity and deny others admission. It bounds automation; it is not CAPTCHA or proof of personhood. Raising capacity requires a separate justified abuse-control decision.
- Email verification and password recovery mail are absent. New email addresses are **unverified**; address ownership, support identity and reclaiming a pre-registered address are unresolved risks. Existing metadata/plugin/admin/update-email/reset endpoints remain closed. Do not treat a submitted email or mail from that address alone as account ownership. Before public opening, explicitly accept this limited mode or require a separate approved mail-verification release. Do not fabricate a mail provider or mark users verified.
- Migration 012 already grants only user INSERT to the Auth access role; lifecycle/release freeze and account/session guards remain. Migration 013 and all manifest checksums remain unchanged. No new migration is needed for this candidate.

## B4 evidence and remaining gates

Targeted source/browser-adapter tests cover registration/login/session reload/logout and shared quota with synthetic storage. The release PG18 runner additionally uses real Better Auth through the native routes, Cloud write/read after a fresh session request, foreign-owner read/write denial, revoked-cookie denial and concurrent shared signup admission on migrations 001–013. This is disposable DB proof, not hosted UI/TLS acceptance. It models refresh by a new verified request; actual browser refresh remains a manual gate.

Release CI must PASS for the **same clean committed SHA**: validation, Linux artifact integrity/secret/ELF checks, compiled Cloud/signup contract, PG18 upgrade/concurrency/Auth isolation, source-bound recovery and receipt verification. A new artifact does not invalidate the operator's existing backup, but synthetic recovery does not attest that live backup. Host ABI compatibility and B4 hosted/manual acceptance remain separate.

### Short legal release-blocker list

The current `/privacy` explicitly leaves these matters unresolved; it does not establish public-signup legal readiness:

1. Select and approve the actual processing legal basis per account/registration, Cloud, social, security and support purpose. Candidate bases in the notice are not concluded bases.
2. Approve retention/deletion periods or defensible criteria for account/session/business data, tombstones/receipts, server logs, backups/offsite copies and support mailbox; establish execution responsibility.
3. Verify actual hosting/offsite/mail/provider recipients, regions, roles and contracts; settle applicable domestic/foreign transfer grounds and Article 9 mechanism. Better Auth/PostgreSQL/Plesk software names alone do not identify recipients or regions.
4. Confirm a working Article 11/13 request channel, secure identity verification, handling/deadline responsibilities and export/erasure scope, especially because signup emails are unverified. The source contains operator/contact details; this task does not independently verify them.

Primary references: [KVKK illumination requirements](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-), [illumination procedure](https://www.kvkk.gov.tr/Icerik/4132/aydinlatma-yukumlulugunun-yerine-getirilmesinde-uyulacak-usul-ve-esaslar-hakkinda-teblig). Unknown vendor or legal facts must be supplied and approved by the operator; no blanket compliance claim.

## Shortest controlled Plesk deployment plan (authorization required)

1. Close the legal gates and explicitly accept the no-verification/shared-quota limitations. Obtain explicit production opening approval; candidate CI/push approval does not authorize opening.
2. Select the exact successful CI SHA and `mediatracker-native-linux-<SHA12>` artifact plus checksum/ABI and same-SHA PG18/recovery receipts. Verify download/package integrity and actual host OS/architecture/libc/Node compatibility. Preserve the prior 013-compatible release and its runtime configuration for rollback.
3. In the approved change window, read-only revalidate exact database/role/TLS target (`mediatracker_prod`, OID 35830, PG18), unchanged 13-entry ledger/checksums and current coherent DB/files backup coverage. No SQL migration or fixture insertion is needed for deployment.
4. Extract to a fresh release directory; keep existing secrets, TLS/role/storage paths and provider/AI policy. Set runtime `NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED=true` and same-SHA Cloud deployment epoch, atomically select the verified release and restart Passenger once. This step is the public-opening action and is **not performed by candidate preparation**.
5. With separately authorized bounded test accounts/cleanup, manually verify signup → logout → login → session → Cloud upload/download → browser refresh → second-user denial → logout/revoked-cookie denial, plus health/provider availability. Until then hosted B4 is NOT_RUN. Local-first owner switching and UI hydration require actual browser acceptance.
6. On failure, select the preserved `af4b414f1b3b` release with its original signup=false/Cloud epoch configuration and restart; preserve newly created accounts/data for authorized recovery. Do not restore a 12-migration runtime, delete users or restore a DB backup just to toggle signup. For the new artifact, runtime=false alone refuses startup; close registration by rolling back the matching release/configuration.

Vault retrieval during preparation returned `VAULT_GIT_INVALID`; no canonical Vault write/apply is authorized or performed.
