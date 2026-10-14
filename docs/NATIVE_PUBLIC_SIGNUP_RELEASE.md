# Native Public Signup V1 release candidate

Scope: existing Plesk/Passenger native runtime, PostgreSQL 18, unchanged migrations 001–013. No migration, production connection, production credentials, panel change or deployment is part of candidate preparation. The operator reports production release `af4b414f1b3b`, database `mediatracker_prod` OID `35830`, and verified encrypted offsite backup; these are operator-provided facts, not a new live verification.

## Candidate contracts

- Only the native Linux artifact job builds `NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED=true`, with synthetic credentials and offline network protection. Release validation and source-bound PG18/recovery remain prerequisite jobs. No CI deployment job is added.
- The existing compiled Cloud check also executes the actual browser `useAuth` hook with inert React/imports and no signup env, rejecting disabled/missing/unresolved signup configuration. No session subscriptions or network calls are mounted. The deployment manifest binds `publicSignupEnabled=true`; Passenger refuses a different/missing runtime value before starting. Existing legacy manifests remain usable for the previous signup-closed release.
- Better Auth keeps database sessions, UUID identity, strict origin/JSON/field admission, HttpOnly cookies, password capacity bounds and database-backed limiting. Signup uses a shared 5-attempt rolling one-hour quota across visitors and workers; unsuccessful admitted attempts consume it. Login retains the existing shared 3-attempt/10-second quota. No submitted email, cookie, IP header or user ID chooses a bucket. `Retry-After` preserves Better Auth's full wait.
- This conservative quota is appropriate only for low-volume opening: any visitor can exhaust shared registration/login capacity and deny others admission. It bounds automation; it is not CAPTCHA or proof of personhood. Raising capacity requires a separate justified abuse-control decision.
- Native email/password authentication now requires verified email and never auto-signs in a new registration. Verification/resend and password reset use operator-configured TLS SMTP, bounded same-origin POST and shared DB quotas. Tokens are single-use; reset revokes existing sessions. See [Native SMTP configuration and acceptance](NATIVE_AUTH_EMAIL.md). Metadata/admin/update-email endpoints remain closed. Source implementation is not live SMTP delivery or public signup approval; submitted mail alone is not sufficient identity for privacy support actions. Existing unverified accounts must verify before application access; never bulk-mark them verified.
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

2026-10-14 reconciliation: answered TürkHosting region/subprocessor/personnel and
daily/~four-week backup questions are `OPERATOR_REPORTED_WRITTEN`, not blanket
UNKNOWN or independently authenticated contractual proof. Exact log retention,
backup private-file coverage/coherence, offsite copies, Gmail/API/CDN and legal
approvals remain separate. Use the purpose-by-purpose matrix in
[native privacy gate, section 4](NATIVE_V1_PROVIDER_PRIVACY_RETENTION_GATE.md#4-final-privacy--public-signup-uzlaştırması--2026-10-14).
05A–F/06E historical and synthetic results remain scoped to their original target.

## Recommended public-launch security closure

Source reviewed: `lib/auth/native-options.ts`, native password wrapper, strict
Auth route, browser adapter, `hooks/use-auth.ts`, transaction/Cloud and native
privacy/filesystem paths. There is no verified minimal auth defect here requiring
a new migration, provider or altered session contract. UUID/server session owns
Cloud, not submitted email, headers or user metadata; revoked cookies cannot
grant server identity. Origin, bounded JSON/fields/password, HttpOnly/SameSite,
database sessions/limits, lifecycle/freeze and RLS remain unchanged.

Prioritized public-opening blockers:

1. **P1 — email ownership/recovery:** any admitted attacker can pre-register another
   person's address and obtain a session/Cloud account while `emailVerified=false`.
   Current authenticated UUID isolation still works; ownership of that email is
   not proven. No automatic merge/reclaim/password reset by email or support
   mailbox alone is safe. Require verification for the recommended launch and an
   identity-safe recovery/reclamation policy. Password reset mail is absent;
   recovery can only remain manual if its independent proof/delivery process is
   explicitly approved and disclosed.
2. **P1 — legal/retention/disclosure:** select actual bases, retention criteria,
   enabled recipient/transfer and provider decisions; approve the final notice
   and secure rights workflow. Candidate text and hosting statements are not
   legal approval. Closed provider/AI enablement is not a blocker.
3. **P1 — controlled acceptance/approval:** same-SHA CI/artifact and separately
   authorized hosted registration/session/Cloud/logout/cross-user acceptance,
   safe cleanup, matching runtime/build and explicit operator opening approval.
   Reuse previous valid proofs; source/memory/disposable DB is not hosted UI/TLS.
4. **P2 — shared quota denial:** 5 signup attempts/hour and 3 login attempts/10 sec
   are global, across workers; admitted failures consume capacity. Five visitors
   or an attacker can block registration for the window; login can be repeatedly
   saturated. It is neither per-email/IP nor reliable proof of personhood.
   Keep current limits; operator must accept low-volume availability or approve
   a separately tested abuse control with verified ingress. No client header
   identity, quota increase, CAPTCHA service or weakened fail-closed path added.

Smallest future implementation after an approved sender/transport exists: reuse
Better Auth `emailAndPassword.requireEmailVerification=true` plus
`emailVerification.sendVerificationEmail`/`sendOnSignUp`; keep unverified signups
sessionless, reject unverified login, admit only the required verify/resend routes
with strict fields/origin where applicable and bounded quotas. Existing native
verification schema is present; validate existing grants/token-expiry/one-use
behavior before deciding whether any permission change is necessary. Do not
change schema speculatively. Reject unsafe redirect targets and redact token/URL
logs. Add `sendResetPassword` and narrowly admitted recovery routes if self-service
recovery is chosen; expire/consume tokens and invalidate prior sessions as required
by the approved policy. No provider selection, credentials or implementation of
this incomplete mail feature is part of this closure.

Required future tests: unverified signup creates no session/Cloud authority;
unverified login denied; verified one-use/expired token and resend/duplicate
address enumeration cases; pre-registered-address resolution without account
data takeover; reset replay/expiry/session revocation; shared quotas/concurrency;
verified A/B registration → fresh session → own Cloud → foreign denial → logout
and revoked-cookie denial. Synthetic tests first, hosted acceptance under separate
authorization. No new real accounts in this task.

Primary references: [KVKK illumination requirements](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-), [illumination procedure](https://www.kvkk.gov.tr/Icerik/4132/aydinlatma-yukumlulugunun-yerine-getirilmesinde-uyulacak-usul-ve-esaslar-hakkinda-teblig). Unknown vendor or legal facts must be supplied and approved by the operator; no blanket compliance claim.

## Shortest controlled Plesk deployment plan (authorization required)

1. Close the legal gates and recommended email-verification/recovery gate (or record an explicit operator exception with those risks), and decide shared-quota availability. Obtain explicit production opening approval; candidate CI/push approval does not authorize opening.
2. Select the exact successful CI SHA and `mediatracker-native-linux-<SHA12>` artifact plus checksum/ABI and same-SHA PG18/recovery receipts. Verify download/package integrity and actual host OS/architecture/libc/Node compatibility. Preserve the prior 013-compatible release and its runtime configuration for rollback.
3. In the approved change window, read-only revalidate exact database/role/TLS target (`mediatracker_prod`, OID 35830, PG18), unchanged 13-entry ledger/checksums and current coherent DB/files backup coverage. No SQL migration or fixture insertion is needed for deployment.
4. Extract to a fresh release directory; keep existing secrets, TLS/role/storage paths and provider/AI policy. Set runtime `NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED=true` and same-SHA Cloud deployment epoch, atomically select the verified release and restart Passenger once. This step is the public-opening action and is **not performed by candidate preparation**.
5. With separately authorized bounded test accounts/cleanup, manually verify signup → logout → login → session → Cloud upload/download → browser refresh → second-user denial → logout/revoked-cookie denial, plus health/provider availability. Until then hosted B4 is NOT_RUN. Local-first owner switching and UI hydration require actual browser acceptance.
6. On failure, select the preserved `af4b414f1b3b` release with its original signup=false/Cloud epoch configuration and restart; preserve newly created accounts/data for authorized recovery. Do not restore a 12-migration runtime, delete users or restore a DB backup just to toggle signup. For the new artifact, runtime=false alone refuses startup; close registration by rolling back the matching release/configuration.

Vault retrieval during preparation returned `VAULT_GIT_INVALID`; no canonical Vault write/apply is authorized or performed.

## Final privacy closure validation — 2026-10-14

Starting clean candidate `aaf95f030e57d45ff73680d6888fe38ece7e394b`; six changed
files: privacy page, auth panel, privacy-notice test and the native privacy/signup
and 06E gate documents. No Auth runtime, database, migration, dependency or CI change.

- PASS: targeted Vitest 7 files / 40 tests; targeted Node 3 files / 31 tests;
  0 failures/skips. Real Better Auth with synthetic memory storage/local HTTP;
  mocked DB and erasure transports. Not hosted PostgreSQL/TLS/erasure acceptance.
- PASS: Next typegen, `tsc --noEmit --incremental false`, full source ESLint
  (0 errors, 1 unchanged recommendation-composer navigation warning), offline
  native Next build (19 warnings in unchanged instrumentation/annotation sources,
  plus nested-copy workspace-root warning). Signup build value **false**.
- PASS: local documentation links, 05A–F unchanged, dated native evidence preserved,
  `git diff --check`. No full suite, E2E, browser or repeated PG18/recovery proof.
- Validation used an ignored source copy without local env/private state and an
  allowlisted subprocess environment, existing offline TCP/UDP guard, synthetic
  native configuration and workspace-local temp. Windows junction creation first
  failed EPERM before tests; the authorized local validation retry passed.
- NOT_RUN / LIVE_UNVERIFIED: hosted signup/Cloud/isolation/erasure/restore and
  actual Production settings; no production DB, Plesk, secrets, deployment,
  signup enablement or real account creation. Approval remains a separate gate.

Next technical step: operator SMTP configuration and controlled mail-delivery acceptance, then same-SHA CI/Linux artifact and separately
authorized hosted A/B acceptance. Legal/vendor decisions above remain open;
source closure is complete, **public signup readiness is blocked**.
