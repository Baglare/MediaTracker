# V1-HARDENING-06C — monitoring and alerts

CURRENT_SOURCE_FACT, 2026-10-06. [06B incidents](V1_HARDENING_06B_INCIDENT_AND_RECOVERY.md); [06E gates](V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md). No APM service or automated alert is installed/configured/claimed.

## Current coverage and safe contract

`lib/security/safe-logging.ts` drops unknown keys/values and does not invoke getters/toJSON. Allowlisted event/route/method/provider/error code, generated UUIDv4 request ID, bounded status/latency, optional exact 40-hex deploymentSha, schemaStage and rateLimited are safe fields. `lib/api/safe-route.ts` creates request correlation in AsyncLocalStorage, emits X-Request-Id and logs **error responses only** with elapsed route time and generic safe code. It does not provide all-request latency or a total-request denominator. No new telemetry/runtime behavior is added in 06C.

Never add email/username/notes/prompts/search query/raw IP/body/token/env value/raw UUID/Supabase error payload or provider response. DeploymentSha is allowed, not evidence all callers populate it. Provider-specific outcome/cooldown is not a new safe logger field and needs source review before structured logging. Browser error boundary/local Cloud status is not remote analytics; request IDs are correlation, not user identity or authenticated evidence.

| Signal | Availability; measurement | Incident / operator action |
| --- | --- | --- |
| HTTP 5xx rate | LOGGABLE_NOW error numerator via route/status; MANUAL_CHECK platform total denominator/coverage/retention | SEV-2/I; inspect counts by safe route and short window; cannot claim a percentage without denominator |
| Auth failures | LOGGABLE_NOW generic 401/403 in covered routes; MANUAL_CHECK Auth aggregates; no email/token | SEV-2 or SEV-1 unauthorized access; distinguish expected denies |
| Provider 429/5xx | LOGGABLE_NOW provider_error/status where emitted + HTTP failures; cooldown/remaining not uniformly logged | H; inspect provider classes and safe Retry-After, bounded cooldown; no extra upstream probes |
| Limiter 503/timeout | LOGGABLE_NOW route status 503; generic code may be internal_error; MANUAL_CHECK distinguishes rate_limit_unavailable vs other 503 via bounded safe response | G; Vault version/audience/ingress/capacity/cron checks separately authorized |
| Cloud mutation failure | LOGGABLE_NOW safe cloud_error where emitted; MANUAL_CHECK local sync status/queue aggregate, DB checks | E/J; do not upload queue payload/free text |
| Schema-stage mismatch | MANUAL_CHECK rollout endpoint + client status; safe schemaStage enum limited to D2C1/v1 | E; exact deployment/ledger/epoch comparison |
| Privacy write-lock error | MANUAL_CHECK safe account_write_locked response/private restricted ops stage report; no dedicated logger code | K; locks on pending/erasing expected; investigate ACTIVE rejection without identifiers in logs |
| Storage signed URL failure | LOGGABLE_NOW safe storage_error and route status where emitted; MANUAL_CHECK exact synthetic owner smoke | F; no signed URL in evidence |
| Unexpected public signup | MANUAL_CHECK hosted setting/aggregate; source UI hiding cannot detect provider-side signup | C/SEV-1 if exploitation; no automatic alert currently |
| CI failure | LOGGABLE_NOW GitHub workflow conclusion/exact SHA, existing workflow UI; notification preferences MANUAL_CHECK | I; block RC acceptance |
| Deployment mismatch | MANUAL_CHECK Vercel artifact metadata vs accepted clean SHA; platform env provenance | I; no public topology endpoint |
| Backup failure | LOGGABLE_NOW local nonzero exit/integrity hash/status; schedule/notification NOT_AVAILABLE | L; hold cutover, do not log path with user info or SQL output |
| Restore verification failure | LOGGABLE_NOW local failed command/report; actual DB/Storage/Auth proof unavailable | L/J; quarantine, never reopen |
| Full success latency, p95/p99 across every request | NOT_AVAILABLE from current error-only route logger; EXTERNAL_MONITORING_OPTIONAL using platform aggregates | No fabricated SLA/APM claim |

## Checks, thresholds and health decision

Before/after an authorized release: record exact SHA, time window, request/error counts (when platform denominator exists), error-route latency, enabled provider failures, 503 limiter trend and synthetic owner Cloud/asset/Auth result. During observation the operator reviews short safe aggregate windows and compares against the immediately preceding accepted deployment. Vendor retention/access/log export, platform request counts and notification delivery are LIVE_UNVERIFIED manual gates.

Any confirmed cross-owner disclosure/privileged credential use is SEV-1 immediately; integrity/restore failure blocks reopening. Sustained inability to complete ordinary synthetic auth/Cloud writes or repeated rate_limit_unavailable is SEV-2 investigation. For traffic percentages/latency/error-spike thresholds, operator selects a minimum sample and time window using measured current traffic. Example starting review window: 15 minutes, consecutive failures from 3 bounded synthetic attempts; OPERATOR_TUNABLE, not an authoritative SLA and not an automatic alert. Do not create polling that amplifies provider/DB load.

02D's historical local-to-Staging measurements can guide comparison only; transport and DB/RPC/adapter latency differ, forced statement timeout was not exercised, and historical p95 is not a permanent Production guarantee. Current Production latency baseline is LIVE_UNVERIFIED.

No health/readiness endpoint exists and none is needed for source release planning. Existing bounded page load and safe capability/rollout responses plus authenticated platform deployment metadata suffice for later checks. Do not publish DB versions, migration lists, project refs, env names/values, internal dependencies or provider tokens. A future external uptime/aggregate alert can monitor a static page and safe HTTP classes only after separate configuration/privacy review; no public DB/provider amplification probe.

Follow 06B containment, preserve restricted safe evidence, repair, verify and close with a short postmortem (trigger, scope, safe timeline, recovery evidence, prevention). Alerts remain proposed/manual, not operationally proven.
