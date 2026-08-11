# D8 release environment matrix

Gerçek değer, secret, project ref, database URL veya fixture credential bu belgede tutulmaz. `.env.local` Vercel'e topluca kopyalanmaz. `LOCAL`, `PREVIEW` ve `PRODUCTION` değerleri bağımsız atanır; final local cleanup D8-4B sonrasıdır.

Sınıflar: `R` required, `O` optional, `F` forbidden, `S` platform/system managed. Visibility `public` yalnız browser bundle'a bilerek giren `NEXT_PUBLIC_*` değerleridir; diğerleri server-only/secret veya server-only/non-secret'tır.

## Core, Auth ve Cloud

| Env | LOCAL | PREVIEW | PRODUCTION | Allowed/default | Visibility | Owner ve fail-closed davranış |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | O | R staging | R production | HTTPS Supabase origin; unset | public | Auth/Cloud; eksikse local mode, hedef karışırsa deploy durur |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | O | R staging | R production | Aynı project public anon key; unset | public | Auth/Cloud; URL ile project eşleşmesi zorunlu |
| `NEXT_PUBLIC_APP_URL` | O localhost | O immutable Preview | R canonical production | Absolute HTTPS (localde HTTP); unset | public | App/platform; yanlış origin absolute callback/referer smoke'u durdurur |
| `NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE` | O | R | R | `legacy`/`d2b1`/`d2c1`; fail default `legacy` | public | Cloud Media; v2 ile stage uyuşmazsa sync durur |
| `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED` | O | R | R | boolean; default false | public | Cloud Media; Production `d2c1` post-check sonrası true |
| `NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE` | O | R | R | `absent`/`v1`; default absent | public | Goal; V1 uyuşmazsa yalnız Goal sync durur |
| `NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED` | O | R | R | boolean; default false | public | Goal; Production post-check sonrası true |
| `NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE` | O | R | R | boolean; default false | public | Cutover; true iken queue korunur, mutation gönderilmez |
| `NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH` | O | R | R | Bounded deploy epoch | public | Client rollout; mismatch reload-required |
| `NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION` | O | R | R | Code-controlled version | public | Client rollout; eski client mutation'ı fail-closed |
| `VERCEL_URL` | F | S | S | Vercel host | server/non-secret | Platform tarafından yönetilir; kullanıcı env kopyası değildir |
| `VERCEL_ENV` | F | S | S | `preview`/`production` | server/non-secret | Provider preview/production ayrımı |
| `NODE_ENV` | S | S | S | `development`/`production` | build/runtime | Next/Vercel yönetir; debug route production'da 404 |

Supabase Auth **Allow new users to sign up** bir env değildir. İlk release Production projesinde disabled olmalı; repo signup UI/action kaldırılmış olsa da direct provider boundary deny ayrı D8-4B manuel smoke'udur.

## Public provider policy

| Env | LOCAL | PREVIEW | PRODUCTION | Allowed/default | Visibility | Owner ve fail-closed davranış |
| --- | --- | --- | --- | --- | --- | --- |
| `MEDIA_TRACKER_PROVIDER_USER_AGENT` | O | R | R | Exact value class: `MediaTracker/1.0 (mediatracker.contact@gmail.com)` | server/non-secret | Provider ops; Preview smoke PASS. Aynı değer Production scope'una yalnız D8-4B env adımında atanır; eksik/geçersizse Open Library çağrılmaz |
| `MEDIA_TRACKER_ANILIST_MODE` | O | O | R | `disabled`, Preview'da `preview_test`, izin sonrası `authorized`; default disabled | server/non-secret | Production v1 exact `disabled`; invalid/Preview mode prod'da deny |
| `MEDIA_TRACKER_TMDB_MODE` | O | O | R | `disabled`/`noncommercial`; default disabled | server/non-secret | Production v1 exact `disabled`; logo/notice/token hazır değilse deny |
| `TMDB_READ_ACCESS_TOKEN` | O | O | F v1 | Token | server/secret | TMDB disabled iken provision edilmez |
| `OMDB_API_KEY` | O legacy diagnosis | F | F | Key | server/secret | Yeni public search/fallback policy ile daima kapalı; legacy data okunur |

TVMaze için enable env yoktur; attribution/source-link code contract'ıyla açıktır. Open Library contact kararı ve Preview smoke'u `CLOSED`; Production Vercel env uygulaması D8-4B final env operasyonunun parçasıdır.

## AI, Research ve cache

| Env | LOCAL | PREVIEW | PRODUCTION | Allowed/default | Visibility | Owner ve fail-closed davranış |
| --- | --- | --- | --- | --- | --- | --- |
| `AI_SERVER_ACCESS_MODE` | O | R | R | `disabled`/`admin_only`/`authenticated`; default disabled | server/non-secret | Production v1 exact `disabled`; invalid deny |
| `AI_PROVIDER` | O | O protected UAT | F v1 | `mock` veya registry provider | server/non-secret | Paid AI disabled iken gerekli değil |
| `OPENAI_API_KEY` | O | O protected UAT | F v1 | Key | server/secret | Ücretli fallback yok |
| `OPENAI_MODEL` | O | O protected UAT | F v1 | Bounded model id | server/non-secret | Key/policy yoksa kullanılmaz |
| `GROQ_API_KEY` | O | O protected UAT | F v1 | Key | server/secret | Ücretli fallback yok |
| `GROQ_MODEL` | O | O protected UAT | F v1 | Bounded model id | server/non-secret | Policy yoksa kullanılmaz |
| `OPENROUTER_API_KEY` | O | O protected UAT | F v1 | Key | server/secret | Ücretli fallback yok |
| `OPENROUTER_MODEL` | O | O protected UAT | F v1 | Bounded model id | server/non-secret | Policy yoksa kullanılmaz |
| `GEMINI_API_KEY` | O | O protected UAT | F v1 | Key | server/secret | Ücretli fallback yok |
| `GEMINI_MODEL` | O | O protected UAT | F v1 | Bounded model id | server/non-secret | Policy yoksa kullanılmaz |
| `D7_RESEARCH_ROLLOUT_MODE` | O | R | R | `disabled`/gated modes; default disabled | server/non-secret | Production v1 exact `disabled` |
| `D7_RESEARCH_SHADOW_ENABLED` | O | R | R | `0`/`1`; default 0 | server/non-secret | Production v1 exact `0`; conflict rollout disabled |
| `D7_RESEARCH_PUBLIC_CITATIONS_ENABLED` | O | R | R | `0`/`1`; default 0 | server/non-secret | Production v1 exact `0` |
| `D7_RESEARCH_EVIDENCE_CACHE_ENABLED` | O | R | R | `0`/`1`; default 0 | server/non-secret | Production v1 exact `0` |
| `MEDIA_TRACKER_EMBEDDING_CACHE` | O | O | O | `off` veya in-memory default | server/non-secret | Process-local only; persistent garanti değildir |
| `MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE` | O | R | R | Yalnız exact `on` açar; default off | server/non-secret | Production v1 exact `off`; off iken DB client/read/write yok |
| `SUPABASE_SERVICE_ROLE_KEY` | O ops-only | F | F | Secret key | server/secret | Web runtime'a girmez; RLS bypass blast radius'i nedeniyle forbidden |
| `MEDIA_TRACKER_ML_SERVICE_URL` | O localhost | F | F | Local HTTP URL | server/non-secret | Local-only; Vercel'de localhost request yok |
| `MEDIA_TRACKER_EMBEDDING_MODEL` | O | F v1 | F v1 | Model id | server/non-secret | Persistent/paid ML disabled iken gerekmez |
| `AI_RECOMMENDATION_SEMANTIC_MODE` | O | F v1 | F v1 | Code-supported mode | server/non-secret | İlk release deterministic/library-only |
| `AI_LOCAL_SEMANTIC_VERIFIER_URL` | O | F | F | Local URL | server/non-secret | Local-only |
| `AI_REMOTE_SEMANTIC_VERIFIER_URL` | O | F v1 | F v1 | HTTPS URL | server/non-secret | İlk release disabled |

Araştırma adapter/model env'lerinin tamamı LOCAL conditional test dışında Preview/Production v1'de forbidden ve unset/disabled kalır: `MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED`, `MEDIA_TRACKER_RESEARCH_USER_AGENT`, `D7_OPENAI_WEB_DISCOVERY_ENABLED`, `OPENAI_RESEARCH_MODEL`, `D7_RESEARCH_DISCOVERY_PROVIDER`, `D7_GROQ_WEB_DISCOVERY_ENABLED`, `GROQ_RESEARCH_MODEL`, `D7_OPENROUTER_WEB_DISCOVERY_ENABLED`, `OPENROUTER_RESEARCH_MODEL`, `D7_RESEARCH_EXTRACTION_PROVIDER`, `D7_GROQ_GROUNDED_EXTRACTION_ENABLED`, `GROQ_RESEARCH_EXTRACTION_MODEL`, `D7_OPENAI_GROUNDED_EXTRACTION_ENABLED`, `OPENAI_RESEARCH_EXTRACTION_MODEL`, `D7_OPENROUTER_GROUNDED_EXTRACTION_ENABLED`, `OPENROUTER_RESEARCH_EXTRACTION_MODEL`. Bunlar server-only'dır; unset/invalid fail-closed davranır.

## Development, staging ops ve test-only

| Env grubu | LOCAL | PREVIEW | PRODUCTION | Visibility | Owner/failure |
| --- | --- | --- | --- | --- | --- |
| `D7_ANNOTATION_TOOL_ENABLED`, `D7_ANNOTATION_DATA_DIR` | O | F | F | server/local | Production-mode route her durumda 404; private artifact yolu deploy edilmez |
| `D8_STAGING_CUTOVER_ENABLED`, `D8_STAGING_MIGRATION_ALLOWED`, `D8_STAGING_PROJECT_REF`, `D8_PRODUCTION_PROJECT_REF`, `D8_STAGING_DATABASE_URL` | O ops | F | F | server/secret mixed | Yalnız local staging scripts; hard gate fail-closed |
| `SUPABASE_PRODUCTION_URL` | O target compare | F | F | server/secret | Yalnız local target-safety karşılaştırması |
| `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_USER_A_EMAIL`, `SUPABASE_TEST_USER_A_PASSWORD`, `SUPABASE_TEST_USER_B_EMAIL`, `SUPABASE_TEST_USER_B_PASSWORD` | O test | F | F | test secret | Fixture runner dışında yasak |
| `D7_RESEARCH_LIVE_SMOKE`, `D7_OPENAI_WEB_DISCOVERY_LIVE_SMOKE`, `D7_GROQ_WEB_DISCOVERY_LIVE_SMOKE`, `D7_OPENROUTER_WEB_DISCOVERY_LIVE_SMOKE`, `D7_GROQ_GROUNDED_EXTRACTION_LIVE_SMOKE`, `D7_OPENAI_GROUNDED_EXTRACTION_LIVE_SMOKE`, `D7_OPENROUTER_GROUNDED_EXTRACTION_LIVE_SMOKE`, `D7_R4_SHADOW_LIVE_SMOKE`, `D7_R5A_EVIDENCE_GAP_LIVE_SMOKE`, `D7_R5B_STABILITY_LIVE_SMOKE`, `D7_R5B1_EXTRACTION_STABILITY_LIVE_SMOKE`, `D7_R5B2_DOCUMENT_LIVE_SMOKE`, `D7_R5C_CACHE_LIVE_SMOKE`, `D7_R6_FINAL_LIVE_SMOKE` | O test; default 0 | F | F | server/test | Conditional live test dışında forbidden |

## Production v1 fixed set

Production review şu exact değer sınıfını doğrular: `AI_SERVER_ACCESS_MODE=disabled`, `D7_RESEARCH_ROLLOUT_MODE=disabled`, `D7_RESEARCH_SHADOW_ENABLED=0`, `D7_RESEARCH_PUBLIC_CITATIONS_ENABLED=0`, `D7_RESEARCH_EVIDENCE_CACHE_ENABLED=0`, `MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE=off`, `MEDIA_TRACKER_ANILIST_MODE=disabled`, `MEDIA_TRACKER_TMDB_MODE=disabled`. Paid AI/provider keys, `SUPABASE_SERVICE_ROLE_KEY`, test/staging/fixture/local-ML/live-smoke env'leri bulunmaz.

Çelişkili kombinasyonlarda feature açılmaz: unknown AI/signup/provider mode, Cloud stage/flag mismatch, research conflict, missing Open Library contact, TMDB readiness eksikliği veya Production'da AniList `preview_test` fail-closed'dur.
