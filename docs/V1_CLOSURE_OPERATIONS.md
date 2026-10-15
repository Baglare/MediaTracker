# Production v1 closure — 2026-10-15

This current overlay does not rewrite dated acceptance records. Production SHA
`f50efbe370778d0757ca665f97e28989554cb282` is operator supplied; this work makes no
Production request, deployment, restart, migration, backup or configuration change.
The operator confirms public signup and required email verification are open.
Source defaults remain fail-closed; an enabled flag is not legal approval.

## Delivery and branches

[Phase 2 PR #1](https://github.com/Baglare/MediaTracker/pull/1) contains the TMDB
preparation, README/ROADMAP corrections and main CI contract. Its head is
`fc912874605bff9570be0b2a746172503e447c18`; [CI 38777636367](https://github.com/Baglare/MediaTracker/actions/runs/38777636367)
passed (3609 tests, 58 conditional skips). These are PR/source results, not main
Linux artifact, PG18, recovery or hosting acceptance. Do not duplicate that patch.

Repository Actions contain no deployment step. However, the connected GitHub API
does not permit repository webhook/deployment administration reads, and Plesk Git
configuration is unavailable. **MAIN_MERGE = BLOCKED_EXTERNAL_DEPLOY_TRIGGER_PROOF**.
Absence of a workflow is not proof that external automation is absent. Before
merging, obtain redacted read-only evidence of Plesk Git deployment mode, selected
branch, deployment actions and automatic-deployment hooks; check GitHub delivery
webhooks, installed deployment integrations and any outside CI. Do not share webhook
secrets or signed URLs. If any target can deploy/restart, keep the merge blocked.
No administrative setting is changed by this procedure.

After that gate and a separately authorized merge, require the exact main merge
SHA's Release validation, native PG18 proof/recovery receipts and Linux artifact
jobs to succeed. Skipped jobs do not count. Inspect artifact source SHA, recovery
fingerprint and all acceptance fields, including two-user isolation. A successful
artifact build never authorizes deploying it. The new closure PR remains unmerged.

Keep `release/v1-hardening`: existing main-source CI still depends on that ref;
PR #1 preserves it while adding main. Keep `develop` and `test`: no deletion is
needed for v1, and remote preview/recovery dependencies are not proven absent.
No branch is renamed or removed.

## Closure security evidence — 2026-10-16

The scoped `lib/auth` review found a reset/sign-in race in the baseline: an old
password verification could resume after reset deleted sessions and then insert
a new session. A deterministic synthetic HTTP/memory-adapter test reproduced it
before the patch (200 instead of the required 401). The closure patch binds each
request's verified credential hash to a final canonical credential read **after**
session insertion. A changed hash revokes the new session and withholds cookies
and the successful body. A reset occurring later deletes the already inserted
session. No new hashing, migration, schema or dependency is introduced.

Regression coverage includes reset to a different/same plaintext password,
replacement-password success, concurrent distinct users, cross-origin signout
denial and revocation of only the signed-out session. Independent source review
found no surviving bypass in that candidate. Source/synthetic evidence is not
Production or real PostgreSQL concurrency acceptance; the fix is not deployed.
Existing owner-RLS, privacy/Auth-last, CSRF and limiter contracts are preserved.

Local typecheck, lint (two existing warnings) and synthetic offline native build
passed. The complete Windows test run encountered link-permission failures and
source-copy path/git-context failures under `dist`; it is not a full-suite PASS.
Use the exact closure PR's Linux CI for authoritative full-suite results. Local
Docker CLI exists but the explicit local engine pipe is unavailable; disposable
PG18 and real-copy restore were NOT_RUN. Do not substitute earlier CI or backup
evidence for those missing results.

## Maintenance and monitoring — prepared, not installed

Reuse `scripts/native-maintenance.mjs`; do not create a second cleanup service.
Offline inventory: `node scripts/native-maintenance.mjs` (no connection).
In a future authorized private operator session, use `--connect --job inspect`
and `--connect --job cleanup` **without `--apply`** to inspect/plan. Required role,
target fingerprint, ledger and TLS checks must pass. Do not copy runtime credentials
or print connection variables. The source defaults to a 500-item bounded plan.
Apply requires separate authorization for the exact target, storage root and batch;
it uses an advisory lock, rejects release freeze, validates asset intents and stale
temporary files, and calls the existing limiter-expiry cleanup. Unknown paths,
symlinks, participant loss and privacy barriers are stop conditions. Ordinary cleanup
is not account erasure. Never schedule freeze/unfreeze or privacy erasure as cleanup.

Proposed operator schedule: inspect daily, review the bounded plan weekly and after
capacity alerts; choose an apply window only after reviewing load and rollback.
This is an operational proposal, not measured capacity or a retention commitment.
No cron/Plesk Scheduled Task has been created or asserted to exist.

Configure a future external monitor with no auth cookie, provider calls or request
body. `GET /api/health/live` returns only `alive`; it proves process liveness.
`GET /api/health/ready` returns `ready`/200 or `unavailable`/503 with no-store; it
checks native configuration, required storage directories and database readiness.
These routes exist in source; their deployed availability is LIVE_UNVERIFIED.
Suggested initial policy: liveness every 5 minutes; readiness every 15 minutes;
timeout 10 seconds; alert after 3 consecutive failures, notify recovery once.
Rate/backoff readiness probes if database load rises. Do not automatically restart,
deploy or restore in response. Operator: correlate sanitized error codes and hosting
capacity; record timestamps/status only, never URLs carrying tokens or user content.
Monitoring/alert delivery is MANUAL_ACTION_REQUIRED, not an active service.

## Backup and isolated restore

Supported host answers: daily hosting backups and approximately four-week rotation;
hosting processing in Türkiye, no foreign hosting subprocessor, Türkiye-based
authorized infrastructure access. These are operator-reported written answers.
Do not ask them again as unanswered gates. The operator also reports the post-014
encrypted backup was verified and copied off-server. Preserve it; do not recreate,
open, copy, delete or re-encrypt it in this task.

Still unverified: current Plesk automatic-task success, selected subscription/DB/
private-storage coverage, DB/file coherence, restore permissions, encryption/access
for hosting copies, log rotation and retention/access of independent offsite copies.
Read-only operator evidence should include redacted backup settings and last-success
time, selected databases/private files and restore capabilities. A backup filename
or four-week policy does not establish recoverability or freshness.

Use the existing [recovery operator package](NATIVE_SHARED_RECOVERY_OPERATOR.md)
and `scripts/native-recovery-proof.mjs`; its historical migration counts are not
authority for a newer ledger. For a future isolated rehearsal:

1. Obtain a dedicated disconnected PG18 target, separate roles, empty storage and
   explicit authorization to handle the chosen copy. Deny outbound SMTP/providers,
   public ingress and Production connection values. Prefer synthetic fixtures.
2. Pin the recovery-source fingerprint, exact migration manifest (including 014),
   envelope/authentication digest and independent expected fingerprint. Missing or
   mismatched proof is STOP. Do not alter a proof to match the current source.
3. With local Docker Linux engine and an already local `postgres:18-alpine` image,
   `node scripts/native-recovery-proof.mjs --proof` creates synthetic two-user
   dump/restore evidence. It does not prove restoration of the real hosting copy.
   No pull/build or Production fallback is permitted. Missing tooling is NOT_RUN.
4. For a real copy, follow the existing private input/unseal workflow only under
   separate exact-copy authorization. Compare ledger, schema/ACL/FORCE RLS,
   full content and private-file hashes; verify A/B read/write denial and normal
   owner reads, session/reset/revocation and asset permissions on the isolated target.
5. Reconcile approved erasures after the backup timestamp before any use of restored
   data. Record source SHA, fingerprint, timestamps and individual outcomes without
   account content; preserve sealed original evidence. Cleanup only runner-owned
   disposable resources. Any unknown field leaves restore acceptance PARTIAL.

No real restore is performed here. No suitable authorized isolated real-copy target
or decryption authority was supplied. Never test restoration over Production.

## Privacy and provider decision ledger

**MANUAL_ACTION_REQUIRED**: operator/legal approval of each processing purpose and
Article 5 basis; Article 9 mechanism for Gmail/providers/CDNs and other foreign
recipients; Article 10 notice completeness; VERBİS applicability; formal request
channel coverage. [KVKK's notice requirements](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-)
are the reference, not a claim of compliance. Existing manual request procedure and
its 30-day response tracking remain applicable. Collect only necessary identity
evidence; never ask users for passwords, cookies or full unnecessary ID copies.

| Data/lifecycle | Current technical position | Decision still required |
| --- | --- | --- |
| Browser library/exports | Owner-scoped local data and downloaded copies; logout is not erasure | User-controlled copies and offline-device limits disclosed |
| Account/Cloud/social/assets | Existing operator export and Auth-last guarded deletion; no self-service full erase UI | Purpose-specific retention, participant/legal-hold policy and completion evidence |
| Sessions/tokens/limiter | Technical expiry and bounded cleanup exist | Expiry is not a legal retention basis or physical-delete proof |
| Hosting logs/support mailbox | Sanitized app errors; hosting may retain IP/time/UA; email support is separate | Actual log/support retention, access and destruction criteria; no invented days |
| Hosting/offsite backups | Host daily/~4 weeks; post-014 encrypted offsite copy operator reported | Last-copy erasure, independent-copy retention and restore reconciliation |

Provider review uses official sources checked 2026-10-15; no key is requested or used:

| Provider | Decision and evidence |
| --- | --- |
| TMDB | Keep `disabled_by_policy`. PR #1 branding/provenance preparation is not enablement. Written permission covers the asked deterministic, non-revenue use only; ambiguous retention answer does not extend six months. [Official FAQ](https://developer.themoviedb.org/docs/faq) requires approved branding/notice. [Terms page](https://www.themoviedb.org/api-terms-of-use) was inaccessible to the review tool; preserve the prior terms review and recheck the account's actual contract before enablement. |
| TVMaze | Keep existing enabled integration/attribution and source links. [API licensing](https://www.tvmaze.com/api#licensing) specifies CC BY-SA. Review redistribution/transformations and exported metadata ShareAlike requirements; existing access is not blanket legal approval. |
| Open Library | Existing real User-Agent/contact gate remains. [Official API guidance](https://openlibrary.org/developers/api) asks application registration and identified frequent requests; review applicable content/image rights and load limits before activation. Leave production unset pending that evidence; manual books remain available. |
| AniList | Keep disabled. [Current terms](https://docs.anilist.co/guide/terms-of-use) prohibit competing anime/manga trackers; free/noncommercial status alone is insufficient. No authorization was supplied. |
| OMDb | Keep new public search disabled; retain existing legacy compatibility. [Official terms](https://www.omdbapi.com/legal.htm) restrict personal/noncommercial use and redistribution. No new key or paid plan is needed while disabled. |

Smallest future TMDB lifecycle: retain independently authored user progress/ratings/
notes and stable application identity separately from provider fields; store genuine
provider provenance plus fetchedAt/expiresAt and remove/refetch provider fields by
six calendar months at the latest (a conservative earlier deadline is acceptable).
Re-obtaining metadata must not merely reset the age of the old payload. Do not
relabel TMDB descriptions, titles or images as manual user data. This is a design,
not an implemented migration or authorization to retain identifiers indefinitely.
Offline devices, Cloud revisions/tombstones, export/import/restore and backup expiry
must all enforce the same deletion semantics without losing user-authored records.
That full lifecycle is not established; **TMDB_ENABLEMENT = POST_RELEASE_GATE**.
Neither a TTL on transient search nor a periodic refresh alone closes that gate.

For portfolio/demo text and synthetic screenshot guidance see [portfolio kit](V1_PORTFOLIO_KIT.md).
