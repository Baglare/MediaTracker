# V1-HARDENING-02A — authenticated HTTP mutation boundary

2026-10-03. **V1-HARDENING-02A COMPLETE** for the local application HTTP boundary. Deployment/live acceptance is not implied; D8-4B remains frozen and the existing release hold table is unchanged.

## Baseline and audit

Started on `release/v1-hardening`, clean tree, committed HEAD `87028452e4d75d603fe2b30bd8b2131b24f8623c` (V1-HARDENING-01 baseline). Installed Next `16.3.8`, Node `24.14.0`. The committed 01B report records 2,373 passing tests and 59 conditional skips; the full suite was independently run on this patch, below.

Audit covered all 35 `app/api/**/route.ts` files: 48 method handlers (23 GET, 19 POST, 1 PUT, 2 DELETE, 3 PATCH), every request-security consumer and directly relevant auth/caller/RPC contracts. Audit preceded edits. Classification is by behavior, not HTTP verb:

| Route under `/api` | Methods / classification |
| --- | --- |
| `ai/capabilities` | GET B, guest-safe entitlement read |
| `ai/interpret` | POST A, deterministic analysis/policy read |
| `ai/recommend` | POST A library-only; C conditional privileged provider/research execution |
| `anilist/details` | GET E |
| `anilist/search` | POST E |
| `calendar/anilist` | GET E |
| `calendar/tmdb` | GET E |
| `calendar/tvmaze` | GET E |
| `cloud/rollout` | GET A |
| `dev/recommendation-annotation` | GET/POST D |
| `omdb/details` | GET E |
| `omdb/search` | POST E |
| `openlibrary/search` | POST E |
| `personalization/themes/sync` | GET B; PUT/DELETE C |
| `providers/capabilities` | GET A |
| `social/assets` | POST/DELETE C |
| `social/comments` | POST/PATCH C |
| `social/connections` | GET A, visibility-scoped RPC |
| `social/feed` | GET B; POST C |
| `social/notifications` | GET B; PATCH C |
| `social/people` | GET/POST A, visibility-scoped reads |
| `social/preferences` | GET B; POST C |
| `social/profile/hero` | GET B |
| `social/profile` | GET B; POST C |
| `social/profile/summary` | GET B |
| `social/profile/[username]` | GET A, visibility-scoped public profile |
| `social/reactions` | POST C |
| `social/recommendations` | GET B; POST/PATCH C |
| `social/relationships` | POST C |
| `social/reports` | POST C |
| `tmdb/details` | GET E |
| `tmdb/search` | POST E |
| `tvmaze/details` | GET E |
| `tvmaze/search` | POST E |
| `xp` | GET B; POST C |

A = public read/search (may use viewer identity); B = authenticated/viewer read; C = authenticated mutation/privileged execution; D = local internal/dev; E = provider proxy, all read/search. F unknown/manual classification: **0**. Classification does not enable disabled providers/features.

### State-changing endpoint contracts, before → after

| Endpoint/method | Authentication boundary | Existing parser | Origin before → after |
| --- | --- | --- | --- |
| social/assets POST | server getUser + owner Storage/DB | multipart FormData + image limits | none → strict |
| social/assets DELETE | server getUser + owner Storage/DB | bounded kind enum in URL, no body | none → strict |
| social/comments POST/PATCH | RPC auth.uid/ownership | readJsonBody + domain validation | none → strict |
| social/feed POST | RPC auth.uid/ownership | readJsonBody + action/domain validation | none → strict |
| social/notifications PATCH | RPC auth.uid/ownership | readJsonBody + action/domain validation | none → strict |
| social/preferences POST | RPC auth.uid/ownership | readJsonBody + preference validation | none → strict |
| social/profile POST | server getUser + owner RPC/RLS | request.json + action/domain validation | none → strict |
| social/reactions POST | RPC auth.uid/ownership | readJsonBody + domain validation | none → strict |
| social/recommendations POST/PATCH | RPC auth.uid/ownership | readJsonBody + domain/transition validation | none → strict |
| social/relationships POST | server getUser + owner RPC | request.json + action/domain validation | none → strict |
| social/reports POST | RPC auth.uid/ownership | readJsonBody + domain validation | none → strict |
| personalization/themes/sync PUT | server getUser + owner/revision RPC | request.json + exact fields/canonical theme validation | none → strict |
| personalization/themes/sync DELETE | server getUser + owner RPC | no body | none → strict |
| xp POST | server getUser + owner RPC | request.json + action/media-state validation | none → strict |
| ai/recommend POST non-library branch | server-verified entitlement | strict JSON, 1 MiB, exact top-level fields | optional same-origin → strict |
| dev/recommendation-annotation POST | development flag + local Host gate, no cookie auth | bounded JSON + service validation | unchanged; separate local-tool boundary |

The original `validateSameOrigin` accepts missing Origin and ignores Fetch Metadata. `readStrictJsonObject` enforces JSON content type, declared/actual byte limits, object shape and allowed top-level fields; those checks remain unchanged. Public search allows absent Origin for existing non-browser/internal callers. Legacy social/XP/theme parsers are not all strict JSON parsers; this patch preserves their validation rather than claiming absent controls already existed.

Audit also found GET social/preferences calling a write-on-read RPC. At the user's direction, it now uses verified-user, owner-filtered RLS SELECTs. Missing profile/username retains unconfigured defaults; missing preference rows return configured virtual defaults with the identical camelCase response contract. Real query errors fail rather than masquerading as missing rows. Consumers use values, not persisted-row existence; notification/recommendation SQL already has matching absent-row defaults. Only actual preference POST uses `social_save_preferences`, which persists the selected group and initializes missing groups inside that authenticated mutation. No SQL/migration change is required for the HTTP route.

## Threat model and enforced policy

Supabase server route auth reads session cookies (`lib/supabase/server.ts`). A victim browser can attach ambient credentials to an attacker-triggered request; a response being unreadable by CORS does not prevent a write. Cross-origin forms, including multipart uploads, and same-site sibling origins are relevant. SameSite cookie rules, JSON preflight and browser-generated headers provide defense in depth, not sole authorization.

`validateAuthenticatedMutationRequest` requires a serialized HTTP(S) Origin, parses both origins canonically, and compares with `new URL(request.url).origin`. Malformed/opaque/multiple origins, credentials, paths/query/fragments, different host/scheme/port and missing Origin return the existing `{code:"invalid_origin"}` / 403 / no-store contract. Equivalent hostname case/default ports canonicalize normally. Host/forwarded headers and hard-coded deployment-domain allowlists are not trust inputs; each Preview/Production/local target must match itself.

If Sec-Fetch-Site exists, only `same-origin` is accepted. `cross-site`, `same-site`, `none`, empty and unknown values are rejected. There is no cross-origin same-site mutation workflow or user-navigation mutation requiring `none`. Absent Fetch Metadata is accepted only with valid matching Origin, retaining older/non-browser clients without falling back to Referer or accepting missing Origin. This does not exempt them from session authentication or owner authorization.

Origin and Sec-* are browser-controlled forbidden request headers; attacker page JavaScript cannot forge a matching Origin or Fetch Metadata. A direct non-browser client can forge headers but must independently possess valid authentication; the helper is a CSRF boundary, not credential proof. It does not defend against same-origin XSS or stolen sessions. Browser protections and explicit server rejection jointly prevent cross-site forms/fetch from reaching writes. References: [MDN Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin), [MDN Fetch Metadata](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Fetch_metadata), [MDN Sec-Fetch-Site](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Explicit getUser routes retain prior authentication/configuration errors before boundary checking. RPC-auth social routes reject invalid boundaries before body parsing/auth RPC, so invalid-boundary requests now receive 403 rather than their former parser/auth error. With a valid boundary, existing parser/auth/RPC status and messages remain. Multipart and body-less DELETE are protected without imposing JSON on them. Conditional AI protection runs after existing entitlement denial and before any privileged work; deterministic guest/library-only requests remain available.

Direct browser Supabase Cloud/Goal/auth calls use explicit bearer credentials and RLS, outside the app cookie HTTP boundary. No helper was injected into them. Dev annotation remains a distinct local filesystem boundary; its guard was not redesigned.

## Verification and negative matrix

| Input | Expected / actual |
| --- | --- |
| Matching Origin + same-origin | PASS |
| Matching Origin + absent Sec-Fetch-Site | PASS |
| Equivalent canonical default port/hostname case | PASS |
| Matching local/Preview/Production target origin; spoofed Host/forwarded host | PASS; target URL remains authority |
| Absent/malformed/opaque/attacker/multiple/path/credential Origin | 403 |
| Different port or HTTP/HTTPS | 403 |
| cross-site/same-site/none/empty/unknown Fetch Metadata | 403 |
| Strict parser content type / actual or declared oversized body / unknown field | Existing 415/413/400 preserved |
| Valid-boundary unauthenticated request or RPC auth denial | Existing 401 preserved |

Every one of the 16 ordinary mutation handlers has executable negative tests asserting 403, zero RPC/DB/Storage writes and unconsumed body. Privileged AI negative tests assert no upstream fetch. Positive RPC controls, multipart existing upload regression, authenticated theme save/conflict/delete, XP and read-only preference default/saved/error/auth controls pass. Post-patch inventory covers every exported unsafe method: **unprotected authenticated mutation boundary count = 0**, **authenticated mutation missing-Origin acceptance = 0**, **cross-site acceptance = 0**. The GET preference initialization exception has been removed from the app route.

| Check actually run | Result |
| --- | --- |
| Targeted Vitest: helper/API/auth/social/cloud/XP/theme/provider/guest contracts | PASS, 16 files / 514 tests |
| Full `npm.cmd run test:run` | PASS, 208 files: 190 passed / 18 conditional skipped; 2,667 tests passed / 59 existing conditional skipped / 0 fail |
| `npm.cmd exec -- tsc --noEmit --incremental false` | PASS after correcting a new test header-fixture type; no type suppression |
| `npm.cmd run lint` | PASS, 0 errors; 1 existing internal-navigation warning |
| `npm.cmd run build` | PASS; 15 existing dormant annotation filesystem-tracing warnings |
| `npm.cmd audit --omit=dev --json` | PASS, 0 Critical / High / total |
| `git diff --check` | PASS |
| Changed/new tests skip/todo/only scan against HEAD | PASS, 0 additions; full-suite conditional skip count unchanged |
| Changed/new file static credential/private-key/JWT scan | PASS, no matches; pattern scan is not proof of all possible secrets |
| Independent read-only boundary investigation and candidate review | No surviving app mutation bypass found; invalid-boundary error precedence documented above |
| Browser / live Supabase / Preview / Production smoke | NOT RUN / LIVE UNVERIFIED; no browser automation or remote action |

TVMaze/Open Library searches, provider capabilities/policy, AI disabled/guest deterministic behavior and local-first/cloud neighboring tests pass. Provider/search code and feature flags are unchanged. Initial header-fixture typing failure was repaired; final typecheck/build pass.

## Changed files and remaining boundaries

- `lib/api/request-security.ts`: reusable mutation guard; existing public parser/rate limiter unchanged.
- `app/api/social/{assets,comments,feed,notifications,preferences,profile,reactions,recommendations,relationships,reports}/route.ts`, `app/api/xp/route.ts`, `app/api/personalization/themes/sync/route.ts`, `app/api/ai/recommend/route.ts`: 13 route files with correct mutation guards.
- `lib/social/interactions-server.ts`, `lib/supabase/types.ts`: read-only preference loader and narrow existing-table types.
- `tests/authenticated-mutation-boundary.test.ts`, `tests/social-preferences-read-only.test.ts`: negative/positive and inventory/default/auth coverage.
- `tests/social-avatar.test.ts`, `tests/p6-theme-transfer-sync.test.ts`: legitimate Request/Origin fixtures; assertions retained.
- This document: canonical task policy, inventory, threat model and local evidence.

Remaining scoped observations: legacy social/XP/theme JSON parsers lack some common content-type/byte/unknown-field controls; local dev annotation boundary remains separate; same-origin XSS/session theft are outside this CSRF fix. Raw Supabase `social_get_preferences` still initializes rows when called directly; no app runtime read calls it now, and it remains used inside the authenticated preference-save RPC. Changing that DB function is a separate SQL boundary task, not an applied migration here. Hosted authenticated SELECT privileges/RLS behavior for the newly used preference-table reads require bounded live verification; code errors fail closed. Existing lint/build warnings remain documented, without expanding this task.

No Production/Staging mutation, Supabase/Vercel operation, migration application, deploy, commit or push. No CSP, rate-limiter, provider enablement, AI enablement, privacy, CI or D8 cutover change. Next release gate remains the existing controlled/manual D8 sequence; this local patch is not a clean committed RC.
