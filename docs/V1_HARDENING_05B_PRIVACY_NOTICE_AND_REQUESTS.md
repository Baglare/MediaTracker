# V1-HARDENING-05B — Privacy notice and data-subject requests

Date: 2026-10-05. Deliverable: factual Turkish public notice and a documented manual request procedure. **Not a legal opinion, legal approval or production release acceptance.**

## 1. Baseline

| Check | Evidence |
| --- | --- |
| Branch | `release/v1-hardening` |
| Local HEAD / live remote branch HEAD | `043451a0c05832b5903de6eb784900229b200f54`; independently checked using `git ls-remote` |
| Initial working tree | Clean; `git status --short` empty before edits |
| Latest exact-SHA Actions CI | [CI run 37345733994](https://github.com/Baglare/MediaTracker/actions/runs/37345733994), push, same branch/SHA, completed/success; updated 2026-10-05 20:06:39 Europe/Istanbul |
| Prior phases | History confirms 01, 02A/B/C, 02D, 03, 04B.1–04B.4 and 05A commits; 05A records prior acceptance. No previous live experiment repeated |
| Instructions | Workspace/root AGENTS, `.ai/project.md`, `.ai/automation.json`, relevant map domains; installed Next.js page and static metadata guides |
| Vault | Read-only configured `kc vault context` returned `VAULT_GIT_INVALID`; no broad search, candidate write or autopilot sync. Explicit no-commit/push scope takes precedence over automatic Vault sync |

## 2. Source and legal scope

Primary factual authority: [05A privacy data map](V1_HARDENING_05A_PRIVACY_DATA_MAP.md), particularly inventory, purpose, recipient, retention, export/delete and dependency sections. Historical privacy prose is not authority where it conflicts. Existing route/test establish approved identity **Batuhan Parıltı**, a natural person, and **mediatracker.contact@gmail.com**; mailbox operation and civil identity were not independently verified.

Official sources checked read-only on 2026-10-05:

- [Article 10 notice topics](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-): identity, purposes, recipients/transfer purposes, methods/legal bases and rights.
- [Article 11 rights](https://www.kvkk.gov.tr/Icerik/2036/Ilgili-Kisinin-Haklari).
- [Article 5 conditions](https://www.kvkk.gov.tr/Icerik/2050/Kisisel-Veriler) and [Article 6 / special-category explanation](https://www.kvkk.gov.tr/Icerik/2051/Ozel-Nitelikli-Kisisel-Veriler).
- [Application procedure and particulars](https://www.kvkk.gov.tr/Icerik/6938/Kurumumuza-Yapilan-Sikayetlerin-Usul-Sartlarina-Iliskin-Kamuoyu-Duyurusu), [application right](https://www.kvkk.gov.tr/Icerik/2062/Basvuru-Hakki) and [written/electronic response evidence notice, 1 October 2026](https://www.kvkk.gov.tr/Icerik/9024/ilgili-kisilerin-basvurularina-verilecek-cevabin-bildirim-usulune-iliskin-kamuoyu-duyurusu).
- [Current law including amended Article 9](https://www.kvkk.gov.tr/Icerik/6649/Personal-Data-Protection-Law); Turkish original controls over translation. 05A contains the transfer mechanism and VERBIS evidence gaps.

The notice is not consent. No checkbox, acceptance prerequisite, cookie banner, identity-number form or universal consent basis is added. No account-wide export/erasure, retention cleanup, migration, legal instrument or vendor submission is implemented.

## 3. Public notice changes and Article 10 coverage

`app/privacy/page.tsx` remains a Server Component with static metadata and existing public shell/links from authentication, settings and public topbar. Existing panel styling is reused with semantic h1/h2/h3, definition lists and a readable rights list. The page adds no auth, tracking, data loading, input form or API calls.

| Article 10 topic | Public representation / limitation |
| --- | --- |
| Identity | Existing natural-person name and privacy/support email; no invented company/address/KEP/representative |
| Purposes | Ten processing groups; specific requested tracking/sync/profile/social/recommendation/search/security/support purposes |
| Recipients and transfer purposes | Group destination/recipient fields plus named infrastructure, API and browser-direct image flows |
| Collection and basis | User forms/input/import, SDK, local storage/cookies, optional sync, uploads, interactions, queries, automatic metadata and correspondence; provisional basis paragraph |
| Article 11 | Nine rights, conditions on erasure, recipient notification and application method |

This closes technical representation only. Candidate bases and partial formal channel coverage prevent interpreting it as legally finalized Article 10 compliance.

## 4. Processing-group map

The ten user-facing groups replace a raw database-table dump. Each page group includes data, purpose, collection method and destination/recipient. Source pointers below refer to 05A domains A–M and purposes P01–P13, not live records.

| Group | 05A map | Method / destination / recipients |
| --- | --- | --- |
| G01 Account/authentication | A; P01/P02 | Form/SDK, automatic session work → Supabase Auth; Vercel requests |
| G02 Local library/progress/notes/goals | B/C/I/J/K; P03/P11/P13 | Input/import/generated progress, browser storage → browser, local recovery copies and downloaded supported backups |
| G03 Optional Cloud | B/C/K; P04/P11 | Requested sync and automatic queues → browser/Supabase records, revisions/tombstones/operations |
| G04 Profile/assets | D/I; P05/P13 | Profile input/upload/generated projections → local preferences, Vercel, Supabase Postgres/Storage, visibility-scoped viewers |
| G05 Social | E/I; P06/P10/P13 | Interactions and generated notifications/XP → Vercel/Supabase/local queues, participants/authorized viewers |
| G06 Preferences/themes | F; P07 | Settings/storage/cookies; chosen theme sync/public snapshot → browser, conditional Supabase/Vercel, profile viewers |
| G07 Recommendation/local AI state | G; P08 | Prompt/selected library/context, deterministic computation, sessions/feedback → browser and Vercel when server calculation requested |
| G08 Provider lookup/render | H/J; P09 | Query/IDs, automatic details/calendar/render → Vercel, TVMaze, conditional Open Library, external image hosts; saved metadata browser/Cloud |
| G09 Security/abuse | E/L; P02/P10 | Generated request IDs, route/code/time, transient IP/user input → HMAC pseudonyms/limiter state in Supabase, safe application events/Vercel, vendor logs |
| G10 Support/privacy requests | P12, mailbox inventory | User correspondence and partly automatic operator review → Gmail/operator minimum case records |

No normal special-category collection feature was found. Free-text notes, bio, comments, recommendation messages, reports or correspondence may contain voluntarily supplied sensitive content. Ordinary media taste is not itself special-category data. Do not solicit unnecessary health, biometric, political, religious or criminal information. Development annotation tools are not a v1 hosted-user feature; their operator-specific purpose remains outside this notice's normal feature inventory.

## 5. Provisional legal-basis matrix

`LEGAL_BASIS_MATRIX = PROVISIONAL_PENDING_LEGAL_REVIEW`

All rows are candidates, not selections confirmed as lawful. Necessity, actual service relationship, data minimization and legitimate-interest balancing need operator/legal evidence. Device-local controller scope also requires review. Feature choice/public visibility is not proof of consent; public disclosure does not automatically license reuse. Article 5 conditions do not settle Article 6 or Article 9.

| Activity | Factual purpose | Candidate condition | Rationale | Uncertainty | Final status |
| --- | --- | --- | --- | --- | --- |
| G01 Account/authentication | Existing-user login/session; account security | Art. 5(2)(c) contract; 5(2)(f) legitimate interest for security | Requested account function; access protection | Service relationship, necessary fields, platform independent purposes and balancing unconfirmed | MANUAL_LEGAL_REVIEW_REQUIRED |
| G02 Local media/progress/notes/goals | Requested tracking, recovery and XP calculation | 5(2)(c); 5(2)(f) for necessary recovery safeguards | Tracking needs chosen records; recovery preserves integrity | Local-only controller scope, recovery-copy necessity/duration and XP retention unconfirmed | MANUAL_LEGAL_REVIEW_REQUIRED |
| G03 Optional Cloud | Requested sync and conflict/idempotency handling | 5(2)(c) | Selected synchronization needs owner data/revisions | Optionality alone is not consent; scope/ledger retention and foreign mechanism require review | MANUAL_LEGAL_REVIEW_REQUIRED |
| G04 Profile/assets | Publish configured fields/assets/projections | 5(2)(c); 5(2)(d) only for deliberately public data within its purpose | User requests publication | Visibility is not blanket public-data authority or consent; private fields/public stats and Article 6 risk need separate judgment | MANUAL_LEGAL_REVIEW_REQUIRED |
| G05 Social | Deliver requested interactions/notifications/XP; handle reports | 5(2)(c); 5(2)(f) for necessary abuse handling | Social delivery and protection of participants | Other subjects, report access, notification residues, public/private boundaries and balancing unconfirmed | MANUAL_LEGAL_REVIEW_REQUIRED |
| G06 Preferences/themes | Apply appearance; requested sync/public theme | 5(2)(c) | Feature operation uses chosen settings | Device-local scope and optional publication conditions unconfirmed | MANUAL_LEGAL_REVIEW_REQUIRED |
| G07 Recommendation/local AI state | Deterministic recommendations and sessions | 5(2)(c) | Respond to chosen input/context | Necessity of persisted prompt/history, analysis implications and server payload minimization unconfirmed | MANUAL_LEGAL_REVIEW_REQUIRED |
| G08 Provider lookup/render | Requested search/details/calendar/image display | 5(2)(c) | Fulfil catalogue/display operation | Direct image metadata, recipient purposes/roles and foreign processing unconfirmed | MANUAL_LEGAL_REVIEW_REQUIRED |
| G09 Security/abuse | Authorization, quota protection, limited evidence | 5(2)(f); 5(2)(e) only necessary rights evidence | Protect service/users and substantiate disputes | Formal balancing, necessity and duration needed; no unspecified legal obligation assumed | MANUAL_LEGAL_REVIEW_REQUIRED |
| G10 Support/privacy requests | Answer support; verify and respond to rights requests | 5(2)(c) for support; 5(2)(ç) for applicable rights obligation; 5(2)(e) for necessary response evidence | Requested assistance and statutory response process | Channel validity, identity minimization, evidence duration and mailbox role require review | MANUAL_LEGAL_REVIEW_REQUIRED |
| Incidental sensitive free text across groups | No dedicated intended purpose; assess particular submission | Article 6: no generic candidate assigned | Ordinary feature does not establish a sensitive-data condition | Necessity/condition/safeguards must be decided per case; explicit consent is not an automatic fallback | MANUAL_LEGAL_REVIEW_REQUIRED |

Public wording presents candidate categories with explicit uncertainty. Final production acceptance requires operator/legal confirmation per activity and corresponding final notice review. If a condition cannot reasonably be mapped, leave `MANUAL_LEGAL_REVIEW_REQUIRED`; do not silently choose consent.

## 6. Recipient map

| Recipient group | Data / factual purpose | V1 boundary |
| --- | --- | --- |
| Supabase | Auth, selected Cloud, profiles/assets/social/themes/XP and limiter state; account/storage/sync/security services | Configuration/use dependent; actual hosted settings unverified |
| Vercel | Page/API requests, metadata, selected recommendation context/uploads/social/provider queries; hosting/runtime | Architecture fact; no actual env/region or vendor log review |
| TVMaze | Server query/show IDs and operator identity; catalogue/details/calendar | Technical policy enabled; manual legal/license gate remains; source does not forward browser-user IP header |
| Open Library | Server query and approved provider identity; catalogue search | Capability needs valid identity; manual registration gate separate |
| Gmail/operator mailbox | Request sender/body/necessary particulars and response; handling support/rights | Mailbox availability, safeguards and retention require operator evidence |
| Profile/social recipients | Chosen public fields/assets, participant messages/notifications | Visibility/authorization governs delivery; protect other subjects in a response |
| Browser-direct provider/CDN hosts | Browser IP/request metadata and image URL; cover display | Legacy AniList/TMDB/OMDb-related hosts may remain even when metadata APIs disabled |
| Supabase signed asset host | Browser request metadata and signed asset URL; profile display | Signed URL expiry is not deletion of the file |
| Disabled API/paid AI/research | AniList/TMDB hard-disabled, OMDb public API disabled; paid AI/research v1 policy target disabled | Hosted AI settings unverified; future enablement separate from legacy images |

Recipient/external-service terminology is used deliberately. No universal processor classification is claimed; roles depend on contracts/purposes and require legal review. Local-only data does not automatically flow to these recipients; user-requested server recommendation/Cloud is a separate flow.

## 7. Foreign-transfer disclosure

`ARTICLE_9_MECHANISM = MANUAL_LEGAL_GATE`

The page explains possible processing outside Türkiye by hosting/cloud/mail/external services depending on actual infrastructure. Browser-direct image requests can reveal IP/request metadata independently of proxy/API policy. Source cannot establish regions/subprocessors, vendor log retention or a lawful transfer mechanism. No EU-region, DPA, SCC or consent shortcut is asserted. Production release remains held pending separate operator/legal recipient-specific evidence; this phase neither signs nor submits an instrument.

## 8. Article 11 rights

The public list represents all nine rights: processing inquiry, information, purpose/use conformity, domestic/foreign recipients, correction, conditional erasure/destruction, recipient notification of correction/erasure, objection to adverse exclusively automated analysis and remedy for unlawful-processing damage. A rights request can be received even when its requested implementation is not currently complete. Do not reject merely because a one-click control is absent. Protect others' data and explain lawful/technical limits in the response. Complaint information uses applicable statutory periods without publishing unverified exact complaint deadlines.

## 9. Application channel and required content

`FORMAL_APPLICATION_CHANNEL_COVERAGE = PARTIAL`

Current actual published channel: `mediatracker.contact@gmail.com` for privacy/support intake. For ordinary email to meet the registered-email channel rule, the address must have been previously provided by the subject and recorded in MediaTracker's systems. Account holders should write from their account's registered email. An unmatched sender, guest, changed/lost email or representative is intake/support pending proportionate matching and a valid-channel assessment; do not declare arbitrary email formally sufficient or make rights contingent on purchasing/creating an account.

No KEP, postal address, e-signature/mobile-signature endpoint or application-specific formal web channel is available from repository evidence. Wider valid-channel coverage needs real operator details/legal review; never invent a route. Mailbox identity/access/MFA, authorized handler and backup coverage must be established operationally before release; the code does not implement monitoring.

For formal applications the operator checks applicable Tebliğ particulars: name/surname, written-application signature, Turkish citizen identity number where required; foreign applicant nationality/passport or identity number as applicable; notification residential/work address; notification email/phone/fax if provided; and request subject, with supporting documents only where necessary. This document is a checklist, not permission to collect extra identifiers. Explain missing required items and arrange a proportionate secure means before asking for identity material. Do not add a national-ID table or web form.

## 10. Identity-verification rules

Registered sender matching is a channel check, not conclusive identity by itself. Evaluate mismatch/compromise/representation indicators; use authorized account matching when operationally authorized, without revealing whether another person's account exists. Ask only what the request's risk requires. Representation needs proportionate authority evidence and legal escalation; loss of account access needs a valid alternative process reviewed by operator/legal.

Never ask for password, session token, authentication cookie, API key, full exported dataset or unnecessary full ID-card scans. Do not email datasets to an unverified/new destination. No account disclosure or destructive action before matching and scope authorization. Use metadata describing verification outcome rather than copies of documents wherever sufficient. Identity and source verification are described future/manual operations, **not performed in 05B**.

## 11. Operator response workflow / runbook

`DATA_SUBJECT_REQUEST_PROCESS = MANUAL_WITH_TECHNICAL_PROCEDURE`

`DATA_SUBJECT_REQUEST_PROCEDURE = DOCUMENTED_MANUAL`

| Phase | Concrete operator action / stop condition |
| --- | --- |
| 1. Intake | Receive at published mailbox; assign opaque case reference; acknowledge receipt without confirming/disclosing account data |
| 2. Timestamp | Record original receipt with timezone, handler and due date no later than receipt + 30 calendar days; monitor manually with a responsible backup handler |
| 3. Channel validity check | Check previously notified/registered email condition and required particulars; distinguish formal application from unmatched support intake; escalate partial channel coverage |
| 4. Identity/account matching | Match claimed subject/registered account using separately authorized operator access; no unrelated-account search/data disclosure |
| 5. Minimum necessary verification | Resolve uncertainty proportionately; do not request secrets/unnecessary scans; handle representatives/lost access with operator/legal review |
| 6. Scope classification | Information/access, correction, deletion/destruction, recipient/transfer, automated-result objection, compensation/other rights; separate local-only and account/Cloud scope |
| 7. Data-source inventory | Use 05A groups and account dependency map; identify Auth, DB, Storage, XP, social residuals, queues/tombstones, browser-only data, mailbox and vendor logs; record unsupported sources, not guessed completeness |
| 8. Export-before-delete | If requested, establish available export coverage first and arrange secure delivery to verified recipient; 05C owns account-wide proof. Do not export credentials, unrelated persons or delete before agreed requested delivery |
| 9. Technical action handoff | Prepare source-by-source authorized work order; account export/erasure → 05C; retention → 05D; vendor log deletion → vendor/manual capability; Article 9 → legal/manual gate. No implicit production authority from this runbook |
| 10. Verification | For separately approved actions, compare intended scope to actual result/residual evidence; no blanket cleanup verdict. Do not bypass XP immutable triggers/RESTRICT or delete another owner's notifications silently |
| 11. Response | Written/electronic, as soon as possible and at most 30 days under applicable procedure; acceptance, partial result or reasoned rejection; explain limits and actions, give complaint information and retain delivery proof |
| 12. Minimal request-log retention | Keep only necessary case metadata/evidence with restricted operator access; remove unnecessary attachments/material when no longer necessary, subject to finalized legal retention policy; do not invent a duration |
| 13. Closure | Record outcome/completion and delivery date; close the case only for the documented outcome, keep unexecuted accepted action visibly pending with owner/escalation |

Receipt is not fulfillment. Clarification or verification does not automatically pause/reset the original clock; record both original receipt and any later complete/verified date, escalate uncertainty before the deadline. Review open cases daily and escalate pending legal/technical issues ahead of due date. Technical unavailability does not justify silent delay: give a timely reasoned response and separately track accepted work. Statutory duties and actual mailbox staffing require operator acceptance. No MediaTracker fee is invented.

Written/electronic response record should identify the subject/case, request, decision/reason, actual actions and material limits, response date and delivery evidence. Phone-only discussion is not the documented final response. For failed delivery or incomplete verification, preserve minimal evidence and escalate; do not mark a successful disclosure/action without proof.

### Request logging design — documentation only

Minimum future/manual fields: `request_reference_id`, `received_timestamp`, `channel`, `identity_verification_state`, `request_category` (high level), `due_date`, `resolution_state`, `completed_timestamp`. Possible states: received, verification_pending, scoped, action_pending, responded, closed; distinguish refusal/partial acceptance from technical completion. Use a restricted operator record, not a public spreadsheet or a new database implementation.

Keep body/identity documents separately only if necessary, with limited access and deletion assessment. The case log must not contain passwords, session tokens, cookies/API keys, full exported user datasets or unnecessary national-ID copies. Minimal response/delivery evidence is different from retaining an entire dataset. Retention/access/secure-delivery policy remains operator/05D work; no DB table/migration is added.

## 12. Current export/delete limitations

Portable v3 covers six local domains (`mediaItems`, `progressLogs`, `identityAliases`, `recordRedirects`, `recommendationLinks`, `goals`); portable notes are optional and themes use a separate exporter. Backup is not a complete account export, and imported/downloaded copies need separate protection. Account/social/Auth/assets/XP/operational data do not become a verified full export merely by reading UI pages or Cloud-hydrating current records.

Account-wide export and account-wide erasure are **operator-assisted request processes with partial technical coverage pending 05C**, not proven operator capabilities. 05A identified immutable XP delete triggers, XP `RESTRICT` dependencies, residual notification payloads, separate Storage cleanup and ownerless/operational records. Do not claim the operator already exports all data, deletes all rows/assets/Auth and verifies cleanup. A logical deletion/hidden item is not destruction. Vendor logs/backups may need separate vendor/manual handling.

Browser-local contents may never have reached the backend. Application/browser controls manage supported local data; current-record deletion can leave recovery copies. Logout is not account deletion; mock reset inserts samples and is not erasure. Account/Cloud requests require identity/authorization and operator handling separately from browser controls. No user data was read or action executed to implement this text.

## 13. Retention boundary

05D owns policy/design and any separately authorized implementation. No exact period is invented. Local data generally persists until user/browser/site-data or relevant application action; recovery copies differ. Account/Cloud data has feature/account lifecycle dependencies, not guaranteed full purge on account closure. Tombstones, revisions/operation ledgers, security limiter state and physical cleanup have distinct lifecycles. Limiter expiry eligibility is not guaranteed physical/vendor deletion. Vendor logs/backups follow platform conditions; mailbox retention needs operator policy. Current technical time-to-live figures in 05A are not global legal retention periods.

## 14. Canonical status and open manual/legal gates

| Status | Value / remaining evidence |
| --- | --- |
| `PRIVACY_NOTICE_TECHNICAL_STRUCTURE = CLOSED` | Public implementation, rendered contracts and unauthenticated local HTTP route verified; legal acceptance remains separate |
| `LEGAL_BASIS_MATRIX = PROVISIONAL_PENDING_LEGAL_REVIEW` | Per-activity necessity/basis, local controller scope, balancing and incidental sensitive-data handling need operator/legal review |
| `DATA_SUBJECT_REQUEST_PROCESS = MANUAL_WITH_TECHNICAL_PROCEDURE` | Procedure documented; staffing/mailbox operation is manual |
| `DATA_SUBJECT_REQUEST_PROCEDURE = DOCUMENTED_MANUAL` | Runbook, identity rules, scope, response clock and minimal record design |
| `FORMAL_APPLICATION_CHANNEL_COVERAGE = PARTIAL` | Registered-email route only; broader legitimate coverage/operator details unresolved |
| `ARTICLE_9_MECHANISM = MANUAL_LEGAL_GATE` | Recipient-specific transfer evidence absent; production acceptance HOLD |
| `VERBIS_STATUS = MANUAL_OPERATOR_CONFIRMATION` | Actual operator circumstances and registration/exception determination not established; no exemption assertion |

Further unchanged boundaries: 05C export/erasure technical proof; 05D retention; vendor region/role/log/delete capabilities; TVMaze legal/license gate; Open Library manual registration; hosted signup/AI policy settings live-unverified. This is a phase-specific evidence table, not a second release hold register. Existing canonical D8 release gates remain unchanged.

## 15. Tests and validation

Focused privacy tests include actual static HTML rendering without request/account context, ten groups, nine rights, semantic structure, discoverability, registered-email procedure, 30-day clock, secret minimization, no consent UI and factual limitation/provider regressions. Existing D8 privacy contract replaces the 05A-disproved absolute signup assertion with the UI-scoped fact. The operator-contact assertion now detects invented operator telephone channels/numbers while allowing required applicant notification particulars; word boundaries prevent `postal` falsely matching Turkish `e-postaları`. No meaningful identity/compliance/secret assertions are removed.

| Check | Actual result |
| --- | --- |
| Focused tests | **PASS** — 9 files, 393 tests, 0 fail/skip; privacy route/05B notice, local personal and local data ownership, portable backup/domain/UI, provider capabilities, public shell, authenticated mutation boundary |
| Full Vitest | **PASS** — 200 passed files, 18 existing env-gated skipped files; 2,957 passed tests, 56 skipped, 0 failed (218 files / 3,013 tests). Skipped live checks remain LIVE UNVERIFIED; no new skip |
| CI helper tests | **PASS** — `node --test scripts/ci-policy.test.mjs`: 40 tests, 0 fail/skip |
| Repository/migration/test integrity | **PASS** — `node scripts/ci-checks.mjs --repository-only`; AST skip/todo/only and migration fingerprints/workflow/hygiene covered |
| Typecheck | **PASS** — installed Next `typegen`; independent `tsc --noEmit --incremental false`, source-only credential-free snapshot; build's own TypeScript also passed |
| Source lint | **PASS** — full Git tracked/untracked source list through existing ESLint configuration, excluding existing non-runtime design/ML scope; 0 errors, 1 warning in unchanged `recommendation-composer.tsx`. No lint configuration changes; ignored `.codex` artifacts are excluded from source list |
| Build | **PASS** — `npm run build`, default Turbopack, credential-free source snapshot with existing dependencies and offline guard. 15 dynamic filesystem tracing warnings in unchanged dev annotation storage plus nested-snapshot workspace-root warning; not remediated in this phase |
| Local route availability | **PASS** — local production build bound to literal loopback; one unauthenticated/cookie-free HTTP GET `/privacy` returned 200 with no Location redirect, Turkish HTML, notice/rights/request/mail/metadata and CSP. Server stopped after check; no browser automation |
| Runtime audit | **PASS** — `npm audit --omit=dev --audit-level=high --json`: all severity counts 0 |
| Full advisory policy | **PASS WITH EXISTING DEV EXCEPTION** — `node scripts/ci-audit.mjs`: High=5, Critical=0, five accepted dev-only chain entries under `V1-SEC-EXCEPTION-001`, expiry 2026-11-03; distinct from clean runtime audit |
| Diff and modifier scan | **PASS** — `git diff --check`; changed-test skip/todo/only/skipIf/runIf scan found none; repository AST check passed |
| Browser/visual / deployed live checks | **NOT RUN / LIVE UNVERIFIED** — no browser authorization, remote environments/user records excluded |

Infrastructure attempts were not concealed: initial sandbox Vitest failed before collection on temp-file rename EPERM; same offline tests outside sandbox ran. Initial full suite had three synthetic env-loader subprocess failures because a relative preload could not resolve from other working directories; a Windows `file:` absolute URL fixed the harness, and full rerun passed without test weakening. CI default environment guard correctly refused local env files/inherited credential variable names; repository-only contracts passed and build/typecheck used a source snapshot without env files, with forbidden process env removed without revealing values. No local secret-bearing env file was read/copied. Build source hash matched the edited public page.

Run offline synthetic tests through existing `scripts/ci-offline.mjs`; no live fixture credentials or local user datasets. Required checks: focused route/ownership/portable/provider/shell/auth tests, CI policy/contracts, full Vitest, typecheck, source lint, build, runtime audit, diff whitespace and test modifier integrity. Browser/visual verification is NOT RUN without explicit browser authorization; build/render/contract coverage is reported separately from deployed behavior.

## 16. Files changed

- `app/privacy/page.tsx`: factual Turkish notice and rights/request/limitation sections.
- `tests/d8-privacy-route.test.ts`: factual signup scope correction.
- `tests/v1-hardening-05b-privacy-notice.test.ts`: rendered notice and manual-procedure regression tests.
- `docs/V1_HARDENING_05B_PRIVACY_NOTICE_AND_REQUESTS.md`: this canonical internal matrix/runbook and phase verdict.

No provider/auth/Cloud/social/ownership/backup/limiter implementation or dependencies changed. Durable project knowledge is captured here; Vault retrieval was unavailable and source-scope no-commit/push prohibits autopilot writes. No canonical Vault note changed.

## 17. Verdict

**V1-HARDENING-05B COMPLETE — NOTICE/REQUEST PROCEDURE TECHNICALLY READY.** Technical phase completion does not close legal bases, Article 9, VERBIS, broader formal channels, mailbox operation, export/erase proof or retention policy. Next phase: 05C technical export/erasure proof, then 05D retention; legal/manual release gates remain parallel prerequisites. The modified working tree is locally verified, not a new committed exact-SHA CI candidate.

Safety: no personal user data read, Production/Staging access, remote mutation, legal/external submission, migration, deploy, commit or push. Read-only GitHub repository CI metadata and official legal publications only; no vendor/production account was opened.
