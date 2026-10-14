# Native authentication email — SMTP and release acceptance

Better Auth installed version: **1.7.7**, official email/password endpoints and callbacks. This adds email verification and password recovery to native authentication only. Public signup stays **false**; no deployment or production access is authorized by this document.

## Runtime contract

- `requireEmailVerification=true`, signup `autoSignIn=false`, verification `autoSignInAfterVerification=false`. Unverified users cannot create sessions, resolve an application user or retrieve an application session, including previously issued cookies. Existing unverified accounts must request verification; never bulk-update `emailVerified`.
- Verification JWT expiry: 1 hour. An additional SHA-256 keyed record in the existing `native_auth.verification` table is atomically consumed before Better Auth validates/completes verification. Reset token expiry: 30 minutes; Better Auth consumes the token atomically. Stored identifiers are hashed. Tampering, expiry and reuse fail closed. Consumed tokens remain consumed if a later operation fails; request a fresh link.
- Tokens travel in the emailed URL **fragment**, then bounded JSON same-origin POST. Opening a link does not consume it: verification needs the explicit button, reset needs a new password (8–128 characters). No caller-supplied callback/redirect/query token, identity or email-change endpoint is admitted. No automatic sign-in after either completion. Successful reset revokes all existing sessions and does not mark an unverified email verified.
- Shared database quotas, independent of email/body/cookie/forged IP: signup, reset request and verification resend each 5/hour; reset completion 5/minute; verification 10/minute. Existing login 3/10 seconds remains. Denied and unknown-address admitted requests consume quota; `Retry-After` is retained. This conservative global quota can be exhausted by a visitor; trusted ingress/CAPTCHA capacity work is a separate decision.
- Reset/resend responses are generic for unknown, verified and unverified addresses. Resend ignores session cookies. SMTP delivery is scheduled with Next `after`, outside response timing; errors emit only `native_auth_mail_delivery_failed`, without SMTP diagnostics, recipient, password or token. Operators must monitor this fixed event. There is no durable mail queue or automatic retry: process interruption can lose delivery; request a fresh link after service recovery. This does not grant access.
- SMTP config is checked before account lookup for mail-request/signup endpoints; missing/invalid config returns the same 503 for every address. Other verified-account login/session/logout can remain available when SMTP is absent. Any partially supplied SMTP configuration invalidates native Auth initialization. Delivery failure never verifies an account or creates a session.
- No migration required: existing migrations **001–013 unchanged**. Verification rows store the owning user UUID in `value`, matching existing Auth-last privacy cleanup (008); reset rows already use that shape. Do not downgrade to a pre-013 runtime against a 13-entry ledger.

## Exact Plesk configuration

Use the operator's existing approved mail system. No provider is selected and no mailbox or credentials are invented here.

1. Plesk **Mail → Mail Accounts**: obtain an existing authorized sending mailbox (or have the operator create one), its full login and password. Confirm the mailbox/domain may send transactional verification/recovery messages and that the chosen `From` is authorized. Do not use the privacy support inbox unless the operator explicitly chooses it.
2. **Mail → mailbox → Connect Devices / Manual Setup**: obtain the actual outgoing SMTP hostname. It must resolve and match the mail service certificate; the web application domain is not automatically the SMTP hostname. Confirm mail service is enabled and authenticated submission is allowed.
3. In Plesk **Websites & Domains → application domain → Node.js → Environment Variables**, add this complete **server runtime only** set; never put it in `NEXT_PUBLIC_*`, frontend/build configuration, Git or an exported log:

| Variable | Required value |
|---|---|
| `NATIVE_SMTP_HOST` | Actual certificate-matching SMTP DNS hostname |
| `NATIVE_SMTP_PORT` | `465` for implicit TLS, or `587` for mandatory STARTTLS |
| `NATIVE_SMTP_SECURITY` | `tls` with 465, or `starttls` with 587 |
| `NATIVE_SMTP_USER` | Actual SMTP authentication login, usually full mailbox address |
| `NATIVE_SMTP_PASSWORD` | Actual mailbox/SMTP password, server secret |
| `NATIVE_SMTP_FROM` | Single bare authorized mailbox address, no display name |

Certificate verification and TLS >=1.2 are enforced. Plaintext port 25, certificate bypass and fallback transports are unavailable. Connection/greeting timeouts are 3 seconds each; socket timeout 5 seconds. File/URL content access and SMTP debug logging are disabled. The deployment env allowlist and artifact secret scanning include SMTP variables. Missing mail configuration is permitted for signup-closed source builds but is **not mail-delivery acceptance**; opening signup requires the complete config and separate existing legal/vendor gates. Runtime env preparation preserves supplied allowlisted values and validates them, never manufactures credentials.

4. Keep `NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED=false` in the existing release build/runtime. Keep validated `BETTER_AUTH_URL` equal to `NEXT_PUBLIC_APP_URL` and the canonical HTTPS application origin. Do not copy `.env.local` wholesale. Restart/reload the Node application only in a separately authorized change window; this task does not perform it.
5. Plesk admin **Tools & Settings → Mail Server Settings**: operator confirms authenticated submission port 465 or 587, valid mail TLS certificate and outbound relay/firewall limits. Shared hosting may require provider confirmation; do not relax TLS to work around it.

## DNS and actual delivery checks — MANUAL / LIVE_UNVERIFIED

- Verify SMTP hostname A/AAAA and reachable TLS port, hostname chain/expiry and STARTTLS availability when using 587. Confirm no broken advertised IPv6 path.
- Verify the sender domain's MX accepts mail and the sending host/IP has provider-managed PTR/reverse DNS matching appropriate forward DNS and SMTP greeting. Obtain actual sending IPs from the operator; do not invent records.
- Publish one correct SPF record authorizing the real outbound sender(s), within lookup limits. Plesk **Mail Settings → Use DKIM spam protection system to sign outgoing email messages**: enable signing and publish the actual Plesk-generated selector/key records at the authoritative DNS provider (external DNS is not automatically updated).
- Publish/review `_dmarc` TXT with an operator-approved policy/report address and SPF/DKIM alignment to `NATIVE_SMTP_FROM`. Roll out enforcement based on actual reports; do not invent an SPF include, DKIM key, DMARC mailbox or claim authentication PASS without received headers.
- Separately authorized synthetic existing account: request resend and reset; confirm inbox/spam delivery and received `Authentication-Results` SPF/DKIM/DMARC alignment. Verify one-time completion, expiry, old-cookie revocation and new-password login; do not open public signup for this check. A fake transport PASS does not prove DNS, mailbox, SMTP credentials, Plesk `after` lifecycle or live delivery.
- Record mail host/vendor, processing location, authorized purpose, access, retention and backups in the existing privacy/vendor inventory after obtaining evidence. This task does not assert lawful transfer, retention periods or legal closure.

## Source checks

Focused tests exercise the actual native Better Auth runtime with synthetic memory storage and fake Nodemailer; route/UI/browser adapter and release environment contracts are also checked offline. Typecheck, lint and build results are reported separately in the implementation report. Hosted PostgreSQL atomic consume, Linux packaging, SMTP delivery and manual browser acceptance require separate same-SHA evidence; historical PG18 PASS records are not silently reinterpreted as this feature's proof.

References: [Better Auth email APIs](https://better-auth.com/docs/concepts/email), [Plesk mailbox client configuration](https://support.plesk.com/hc/en-us/articles/12377322626327-How-to-configure-a-mail-client-for-a-mailbox-created-in-Plesk), [Plesk DKIM/SPF/DMARC](https://docs.plesk.com/en-US/obsidian/administrator-guide/mail/antispam-tools/dkim-spf-and-dmarc-protection.59433).

## Local implementation validation — 2026-10-14

- PASS: 97 focused Vitest checks (native email flows, registration, browser/server Auth boundaries, UI static render, mutation origin, foundation, local synthetic HTTP and current privacy notice). Final Auth/UI rerun after lint repairs: 23/23.
- PASS: 199 offline Node release/CI policy, synthetic PostgreSQL runner, Auth/RLS harness and SMTP environment contract checks; 1 targeted artifact credential-scan test. These are not real PostgreSQL or Linux packaging evidence.
- PASS: standalone `tsc --noEmit --incremental false`, ESLint across 993 tracked/new source files (0 errors, 1 existing recommendation-composer navigation warning), native Next/Turbopack production build and `git diff --check`. Build uses an ignored source copy without local env/private data, allowlisted synthetic configuration, signup false and the existing external TCP/UDP guard. Build warnings: 19 existing instrumentation/annotation warnings plus nested-copy workspace-root warning.
- Windows sandbox initially blocked temporary rename/junction operations; workspace-local TEMP/TMP and authorized isolated build retry resolved the requested checks. An exploratory full artifact suite was blocked by Windows symlink permissions / loader preconditions; its failures were not accepted as Linux evidence. The directly relevant credential-scan check passed separately.
- NOT_RUN / LIVE_UNVERIFIED: full suite, browser/E2E, hosted PostgreSQL, actual SMTP/DNS/Plesk delivery, same-SHA hosted/CI Linux artifact. No production access, real messages, migration, provider registration, signup enablement or deployment.
- Push dry-run using existing Git credentials failed with terminal prompts disabled / no usable authenticated identity. No credential prompt/bypass and no push.
- Vault context retrieval returned `VAULT_GIT_INVALID`; no canonical Vault edit or invented candidate destination was used.

Changed files:

- `.github/workflows/ci.yml`
- `app/api/auth/[...all]/route.ts`
- `app/auth/recovery/page.tsx`
- `app/auth/reset/page.tsx`
- `app/auth/verify/page.tsx`
- `app/privacy/page.tsx`
- `components/auth-panel.tsx`
- `components/auth-recovery-panel.tsx`
- `docs/NATIVE_AUTH_EMAIL.md`
- `docs/NATIVE_PUBLIC_SIGNUP_RELEASE.md`
- `lib/auth/browser.ts`
- `lib/auth/current-user.ts`
- `lib/auth/email-policy.ts`
- `lib/auth/native-email.ts`
- `lib/auth/native-options.ts`
- `lib/auth/native.ts`
- `lib/auth/smtp-config.ts`
- `package-lock.json`
- `package.json`
- `scripts/ci-checks.mjs`
- `scripts/native-artifact-check.mjs`
- `scripts/native-auth-rls-acceptance.md`
- `scripts/native-auth-rls-acceptance.mjs`
- `scripts/native-postgres-proof.mjs`
- `scripts/ops/release-policy.mjs`
- `tests/native-auth-boundary.test.ts`
- `tests/native-auth-browser-adapter.test.ts`
- `tests/native-auth-recovery-ui.test.ts`
- `tests/native-auth-rls-http.test.ts`
- `tests/native-backend-foundation.test.ts`
- `tests/native-email-flows.test.ts`
- `tests/native-postgres-live.integration.test.ts`
- `tests/native-public-signup.test.ts`
- `tests/native-release-policy.test.mjs`
- `tests/v1-hardening-05b-privacy-notice.test.ts`
