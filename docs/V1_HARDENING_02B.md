# V1-HARDENING-02B — Browser XSS containment

Scope: local CSP/XSS hardening on `release/v1-hardening`. Starting HEAD: `0bd6207ca7a94f7e37ca43b7a7b64ec75768e3f2` (committed 02A); working tree clean. Installed Next.js **16.3.8**, Node **24.14.0**. No package/lockfile, request-boundary, rate-limiter, provider enablement, AI, privacy, migration or cutover change. D8-4B remains frozen.

## Installed framework evidence and decision

Read the installed App Router CSP guide, Proxy convention/reference, headers references and caching guidance in `node_modules/next/dist/docs`. The current guide requires dynamic rendering for request nonces, reads the nonce from the **request CSP**, and attaches it to framework, page bundle and inline bootstrap/Flight scripts. `x-nonce` alone is insufficient. The current convention is root `proxy.ts`, using the Node runtime and `NextResponse.next({ request: { headers } })`.

Selected: **per-request nonce CSP**, following the documented nonce + `strict-dynamic` model. A trusted Next bootstrap can load its dependent bundles; modern CSP browsers ignore the host fallback when `strict-dynamic` is active. No third-party script hosts are granted. Older CSP implementations retain `self` plus nonce behavior. Development alone permits eval for React/Next debugging. Unknown environment values do not enable eval.

Alternatives: experimental App Router SRI hashes external build assets; it is not evidence that this Turbopack application's request-specific inline Flight/bootstrap scripts are hash-authorized. No experimental SRI/bundler change or custom build-output hash pipeline was introduced. A static/dynamic route hybrid has no static HTML product pages to preserve in this baseline.

## Rendering/cache evidence

Before and after `npm.cmd run build`: **12 dynamic HTML route entries (including not-found), 35 dynamic API routes, 2 static icon assets**. No static public product pages, ISR or PPR were present. Root `app/layout.tsx` already calls `await cookies()` for initial appearance; cacheComponents is not enabled. Dashboard/discovery/settings/auth live under `/` query tabs; there are no separate discovery or login page routes.

Public `/privacy` and `/u/[username]`, the client-heavy root shell, `/profile`, `/goals`, `/recommendations`, `/feed`, `/notifications`, `/people`, `/progression` and dormant dev annotation remain dynamic. Additional static product pages lost: **0**. Product-document HTML remains private/no-store in HTTP smoke. Hashed JS/CSS and icons keep their existing cache behavior. Proxy adds request work and a security header, not a new data-cache policy.

The framework's internal `/_global-error` emergency HTML artifact remains statically generated. Fatal root-render-error retry/hydration was not induced; its nonce-less scripts may be blocked by a strict document policy. This fail-closed emergency path is distinct from the tested dynamic not-found route. Future static pages/PPR or removing the root cookie dependency require a new CSP/rendering review.

## Previous exact production policy and classification

| Directive | Previous exact value | Assessment |
| --- | --- | --- |
| default-src | `'self'` | Necessary restrictive fallback |
| script-src | `'self' 'unsafe-inline'` | Broad framework compatibility; inline XSS containment weakness; replaced |
| style-src | `'self' 'unsafe-inline'` | Broad but necessary for existing theme/React style behavior |
| img-src | `'self' data: blob: https://image.tmdb.org https://covers.openlibrary.org https://s4.anilist.co https://m.media-amazon.com https://ia.media-imdb.com https://*.supabase.co` | Existing/legacy images necessary; Supabase wildcard broader than configured target; active TVMaze image host missing |
| font-src | `'self' data:` | Self necessary fallback; data-font use not found, retained as bounded compatibility allowance |
| connect-src | `'self' https://*.supabase.co` | Browser Supabase necessary; wildcard broader than necessary; exact realtime origin now explicit |
| frame-ancestors | `'none'` | Necessary framing protection |
| object-src | `'none'` | Necessary plugin/object denial |
| base-uri | `'self'` | Necessary base restriction |
| form-action | `'self'` | Necessary form target restriction |

Previous development added `'unsafe-eval'` to script-src and `ws: wss:` to connect-src when NODE_ENV was anything other than production. The new development exception is strictly `NODE_ENV === 'development'`.

## Final policy and authority

For each normal page/document request, Proxy obtains 32 CSPRNG bytes (`node:crypto.randomBytes`) encoded as base64. Caller CSP, report-only CSP and x-nonce are overwritten/removed. Next receives the same CSP as the response, and x-nonce upstream only. A missing/malformed nonce produces `script-src 'none'`, never an inline fallback.

```text
default-src 'self';
script-src 'self' 'nonce-<fresh-256-bit-base64>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://image.tmdb.org https://covers.openlibrary.org https://static.tvmaze.com https://s4.anilist.co https://m.media-amazon.com https://ia.media-imdb.com <configured Supabase HTTP(S) origin>;
font-src 'self' data:;
connect-src 'self' <configured Supabase HTTP(S) origin> <matching WS(S) origin>;
frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

Production permits only a valid configured HTTPS Supabase origin and its exact WSS origin. No config means no external Supabase allowance; malformed credentials/path/query/fragment/wildcard/unsafe-host configuration is omitted. Development additionally supports explicit loopback HTTP Supabase, adds script `'unsafe-eval'` and connect `ws: wss:` for dev tooling. Neither script unsafe-inline nor production unsafe-eval is present. No paid/server-only provider endpoints are in connect-src.

**One CSP authority:** `lib/security/content-security-policy.ts`, emitted by `proxy.ts`; no CSP remains in next.config. Referrer-Policy, Permissions-Policy, nosniff and legacy X-Frame-Options DENY remain global in next.config. API, `_next` and explicit public asset namespaces/files bypass Proxy. No broad file-extension exclusion exempts usernames or unknown documents containing dots.

The guide recommends excluding prefetch/static requests. Static/API exclusion follows its matcher approach. For RSC/prefetch, this implementation deliberately avoids a blanket matcher `missing` bypass: Accept/purpose can be forged on an HTML request. Proxy generates **no nonce** for identifiable RSC/prefetch, overwrites inbound CSP/nonces, and emits script-src none. These responses need no executable document scripts. Next strips internal Flight headers before exposing a request to Proxy; a standalone next-router-prefetch header stripped at runtime still gets a fresh safe document nonce, not an unprotected response. Purpose/Accept prefetch and actual navigation are tested separately. Cached/prefetched HTML with a forged prefetch marker fails closed.

## XSS/style/source inventory

| Surface / hit | Reachability, control and disposition |
| --- | --- |
| dangerouslySetInnerHTML / HTML DOM setters / insertAdjacentHTML / document.write | **0 runtime uses** in app/components/features/lib; media-detail hits are explanatory comments |
| eval / new Function / string timers / dynamic script creation / Script / raw script / srcDoc / DOMParser | **0 runtime sinks**; timers take functions, raw research markup pattern is a rejecting regex |
| SVG and inline handlers | Lucide/static SVG is code-owned markup; React event props take callbacks. No user-controlled SVG/raw markup insertion or emitted string-handler path found |
| Provider descriptions | TVMaze search/details and AniList strip markup; discovery SearchResultDescription normalizes bounded plain text and renders a React text child. Media-detail sanitizeOverview also renders a text child. Encoded or malformed markup can remain literal text, never reparsed HTML |
| User title, notes, bio, tags, comments/recommendation messages | React text children or controlled input values; no markdown/HTML renderer found. Actual detail/edit components and discovery descriptions tested with malicious strings |
| External source href | Provider strings and legacy/imported siteUrl were passed directly to React anchors. React 19 already blocks javascript URLs, but that is not a complete URL contract. New shared safeExternalUrl allows only absolute HTTP(S), rejecting controls, active schemes, relative/protocol-relative and credential URLs at the three source-link render boundaries |
| Other href/redirects | Internal prefix/allowlist/encoded routes; public username redirect is prefixed `/u/`. Privacy mailto is code-owned contact. Dormant research citations pass the existing source-specific HTTPS URL/provenance policy; feature stays disabled |
| Images | User/provider strings only enter img/Image, not executable markup. CSP retains active Open Library, new exact TVMaze static host and saved legacy TMDB/AniList/Amazon/IMDb images. Supabase signed avatar/banner origin is configured exactly; data-image local avatars and blob compatibility remain |
| Styles | Tailwind emits stylesheets; root/theme previews use semantic token maps; custom themes accept validated hex colors/corrections; public snapshot has exact 21-color allowlist/contrast checks; transforms clamp finite focal/zoom numbers; progress/grid geometry is numeric; palettes/gradients/clip paths are code-owned. No arbitrary user CSS string, cssText or user-authored stylesheet insertion found |

**Style residual:** style-src unsafe-inline remains intentionally separate. Removing it would break SSR React style attributes, semantic theme variables, profile positioning and Next-generated image styles. CSP does not restrict arbitrary CSS if a new unsafe style sink is later introduced. No style nonce claim is made; a separate style hardening task would require CSS/theme redesign and its own verification.

## Verification ledger

| Actually run | Result |
| --- | --- |
| Targeted CSP/XSS, 02A mutation boundary, provider, guest/library, profile/theme/asset and neighboring tests | PASS: 13 files / 533 tests |
| Full Vitest | PASS: 191 files passed / 18 existing conditional skipped; 2,738 passed / 59 existing conditional skipped / 0 failed |
| Typecheck (`tsc --noEmit --incremental false`) | PASS |
| Lint | PASS: 0 errors, 1 pre-existing internal-navigation warning |
| Before/after production build | PASS; 15 pre-existing dormant annotation filesystem tracing warnings |
| Runtime npm audit (`--omit=dev`) | PASS: 0 Critical / High / total |
| HTTP next-start document smoke | PASS: root, discovery/settings/auth query tabs, own/public profile, privacy, recommendations, goals, dotted not-found; all 15–21 emitted scripts per response match response nonce, 2+ requests differ, one CSP, private/no-store, inbound nonce/CSP forgery rejected |
| API/static/prefetch HTTP checks | PASS: nonce-free API/assets; forged purpose/component Accept HTML fails closed; stripped internal prefetch marker receives safe fresh nonce |
| New skip/todo/only and changed-file secret-pattern scans; diff --check | PASS; 0 new skips or credential/private-key/JWT pattern matches. Static patterns do not prove absence of every possible secret |
| Dangerous HTML/eval audit | PASS: repository search + TypeScript AST inventory test; non-runtime design references remain outside imported/public production paths |

Initial new-test failures were test-harness defects: installed 16.3.8 exports `unstable_doesMiddlewareMatch` despite the guide's `unstable_doesProxyMatch` example; text/quoted-attribute payloads were initially mistaken for event attributes; one header-fixture union needed proper typing. Assertions now examine actual rendered tags/attributes and real installed matcher behavior; no product assertion, conditional gate or existing test was removed/loosened.

**Production-like browser smoke: PASS.** In-app browser against the production build/next-start verified hydrated dashboard/guest library, discovery search and navigation, settings/auth form, own profile, existing published public profile, privacy, goals and recommendations. Existing Staging User A and User B signed in successfully; authenticated profile/recommendations rendered, and sessions were signed out. No new account or application-data mutation was performed. Existing published custom owner theme rendered within its public-route scope while the visitor root theme remained unchanged; anonymous public access and Supabase avatar loading also passed. TVMaze search returned eight results with eight loaded cover images. No unexpected CSP violations or console errors were observed.

An initial browser search on numeric loopback returned 403 invalid_origin: local Next requests used localhost as their target origin. Repeating the same POST with localhost Origin returned 200/eight results; browser smoke then used localhost. The Origin guard, provider code and CSP were not weakened. Live local mutation-boundary requests with a deliberately invalid preference kind returned missing Origin 403, cross-site 403 and same-origin 400 (expected payload rejection before any write); targeted/full tests additionally cover authenticated boundary behavior.

**Verdict: V1-HARDENING-02B COMPLETE** for local implementation and acceptance. No remaining 02B implementation blocker. The existing D8-4B manual/external release gates remain frozen; hosted Preview/Vercel verification and emergency root-error hydration are LIVE UNVERIFIED. CSP is defense in depth, not a replacement for React escaping, server authorization, 02A Origin/Fetch Metadata, RLS or validated content. Same-origin trusted-script compromise, future unsafe sinks and framework emergency-render behavior remain residual risks. Vercel/Preview hosted response headers and cost/latency are not live-verified; Proxy is a supported Node deployment convention, not a claim of an actual deployment.

Production remains untouched. Authorized Staging work is limited to existing fixture auth sessions and read-only application/profile smoke; no application-data/profile/theme/publication mutation, signup, reset, migration or deployment. No commit/push. This dirty working tree is not a clean committed release candidate.
