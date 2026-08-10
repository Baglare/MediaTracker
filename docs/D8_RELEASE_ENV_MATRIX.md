# D8 release environment matrix

Gerçek değer, secret, project ref, database URL veya fixture credential bu belgede tutulmaz. Aynı env adı Vercel Preview ve Production scope'larında bağımsız değer almalıdır; Preview hiçbir zaman production Supabase hedefini kullanmaz.

## REQUIRED_PREVIEW

| Env adı | Preview contract | Eksik/çelişkili davranış |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | staging browser/server URL | Cloud/auth yerine local mode; UAT BLOCKED |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | aynı staging projesinin public anon key'i | Cloud/auth yerine local mode; UAT BLOCKED |
| `NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE` | staging D2C.1 seviyesiyle aynı | unknown/incompatible ise sync fail-closed |
| `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED` | staging D2C.1 ile V2 istemci | stage uyumsuzsa sync fail-closed |
| `NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE` | staging Goal V1 seviyesiyle aynı | Goal sync fail-closed, local Goal korunur |
| `NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED` | staging Goal V1 UAT için açık | kapalıysa Goal Cloud senaryoları BLOCKED |
| `NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE` | normal UAT'ta kapalı | açıkken queue korunur, mutation gönderilmez |
| `NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH` | Preview artifact/rollout ile uyumlu public epoch | mismatch reload-required |
| `NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION` | current client contract ile uyumlu | mismatch reload-required |
| `AI_SERVER_ACCESS_MODE` | `admin_only` | unset/unknown = disabled; admin AI UAT BLOCKED |
| `D7_RESEARCH_ROLLOUT_MODE` | `disabled` | conflict = disabled; release baseline değişmez |
| `MEDIA_TRACKER_PROVIDER_USER_AGENT` | `MediaTracker` adı ile gerçek operator contact içeren bounded UA | Open Library capability `missing_configuration`; ilgili UAT BLOCKED |

## OPTIONAL_PREVIEW

| Env adı | Ne zaman gerekir | Yoksa davranış |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Explicit absolute URL/OpenRouter referer UAT'ı | server candidate path platform `VERCEL_URL` fallback'ini kullanır |
| `AI_PROVIDER` | admin provider-backed recommendation UAT'ı | mock/deterministic yol |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI admin UAT'ı | OpenAI unavailable; ücretli fallback yok |
| `GROQ_API_KEY`, `GROQ_MODEL` | Groq admin UAT'ı | Groq unavailable |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | OpenRouter admin UAT'ı | OpenRouter unavailable |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini admin UAT'ı | Gemini unavailable |
| `MEDIA_TRACKER_ANILIST_MODE` | `preview_test` yalnız izinli Preview UAT; aksi halde `disabled` | unset/invalid = disabled; Production `preview_test` reddedilir |
| `MEDIA_TRACKER_TMDB_MODE` | `noncommercial` yalnız non-commercial karar + approved logo + notice hazırsa | unset/invalid = disabled |
| `TMDB_READ_ACCESS_TOKEN` | TMDB mode ve attribution/logo kapıları birlikte hazırsa | TMDB `missing_configuration`; başka provider'lar korunur |
| `MEDIA_TRACKER_EMBEDDING_MODEL` | server embedding modeli explicit seçilecekse | code default/mock fallback |

## MUST_BE_DISABLED

Preview RC baseline'ında aşağıdakiler unset/`0`/`off`/`disabled` kalır. Conditional research UAT ancak ayrı onaylı kısa pencere, bütçe ve geri-kapatma adımıyla yapılır.

- `SUPABASE_SERVICE_ROLE_KEY`
- `MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE`
- `MEDIA_TRACKER_EMBEDDING_CACHE`
- `D7_ANNOTATION_TOOL_ENABLED`
- `MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED`
- `D7_OPENAI_WEB_DISCOVERY_ENABLED`
- `D7_GROQ_WEB_DISCOVERY_ENABLED`
- `D7_OPENROUTER_WEB_DISCOVERY_ENABLED`
- `D7_RESEARCH_DISCOVERY_PROVIDER`
- `D7_RESEARCH_EXTRACTION_PROVIDER`
- `D7_GROQ_GROUNDED_EXTRACTION_ENABLED`
- `D7_OPENAI_GROUNDED_EXTRACTION_ENABLED`
- `D7_OPENROUTER_GROUNDED_EXTRACTION_ENABLED`
- `D7_RESEARCH_SHADOW_ENABLED`
- `D7_RESEARCH_PUBLIC_CITATIONS_ENABLED`
- `D7_RESEARCH_EVIDENCE_CACHE_ENABLED`
- `MEDIA_TRACKER_ANILIST_MODE` — explicit Preview UAT yoksa `disabled`
- `MEDIA_TRACKER_TMDB_MODE` — approved logo asset yokken `disabled`

## LOCAL_ONLY

Bu adlar Vercel Preview/Production runtime env'ine taşınmaz.

- `MEDIA_TRACKER_ML_SERVICE_URL`
- `D7_ANNOTATION_DATA_DIR`
- `D8_STAGING_CUTOVER_ENABLED`
- `D8_STAGING_MIGRATION_ALLOWED`
- `D8_STAGING_PROJECT_REF`
- `D8_PRODUCTION_PROJECT_REF`
- `D8_STAGING_DATABASE_URL`
- `SUPABASE_PRODUCTION_URL`
- `OMDB_API_KEY` — yalnız legacy/local adapter teşhisi; public search/fallback her ortamda policy ile kapalı

## TEST_ONLY

Fixture credential'ları tracked dosyaya, Vercel Preview'a veya Production'a konmaz; yalnız kontrollü local/live test runner secret store'unda tutulur.

- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_ANON_KEY`
- `SUPABASE_TEST_USER_A_EMAIL`
- `SUPABASE_TEST_USER_A_PASSWORD`
- `SUPABASE_TEST_USER_B_EMAIL`
- `SUPABASE_TEST_USER_B_PASSWORD`
- `D7_RESEARCH_LIVE_SMOKE`
- `D7_OPENAI_WEB_DISCOVERY_LIVE_SMOKE`
- `D7_GROQ_WEB_DISCOVERY_LIVE_SMOKE`
- `D7_OPENROUTER_WEB_DISCOVERY_LIVE_SMOKE`
- `D7_GROQ_GROUNDED_EXTRACTION_LIVE_SMOKE`
- `D7_OPENAI_GROUNDED_EXTRACTION_LIVE_SMOKE`
- `D7_OPENROUTER_GROUNDED_EXTRACTION_LIVE_SMOKE`
- `D7_R4_SHADOW_LIVE_SMOKE`
- `D7_R5A_EVIDENCE_GAP_LIVE_SMOKE`
- `D7_R5B_STABILITY_LIVE_SMOKE`
- `D7_R5B1_EXTRACTION_STABILITY_LIVE_SMOKE`
- `D7_R5B2_DOCUMENT_LIVE_SMOKE`
- `D7_R5C_CACHE_LIVE_SMOKE`
- `D7_R6_FINAL_LIVE_SMOKE`

## PRODUCTION_ONLY

Bu env adlarının Production-scope değerleri Preview'dan kopyalanmaz; D8-4B hold queue ve target verification sonrasında bağımsız atanır.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE`
- `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED`
- `NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE`
- `NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED`
- `NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE`
- `NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH`
- `NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION`
- `AI_SERVER_ACCESS_MODE`
- `D7_RESEARCH_ROLLOUT_MODE`
- `MEDIA_TRACKER_PROVIDER_USER_AGENT`
- `MEDIA_TRACKER_ANILIST_MODE` — yalnız `disabled` veya yazılı izin sonrası `authorized`; `preview_test` yasak
- `MEDIA_TRACKER_TMDB_MODE` — approved logo + notice + non-commercial karar kapanmadan `disabled`
- `TMDB_READ_ACCESS_TOKEN`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `GROQ_API_KEY`, `GROQ_MODEL`
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `SUPABASE_SERVICE_ROLE_KEY` — yalnız mandatory hold sonucu gerçekten gerekliyse

İlk Production release için AI satırları sabittir: `AI_SERVER_ACCESS_MODE=disabled`, `D7_RESEARCH_ROLLOUT_MODE=disabled`, `D7_RESEARCH_SHADOW_ENABLED=0`, `D7_RESEARCH_PUBLIC_CITATIONS_ENABLED=0`, `D7_RESEARCH_EVIDENCE_CACHE_ENABLED=0` ve `MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE=off`. Preview'daki mevcut admin UAT ayarı Production'a kopyalanmaz; provider key provision edilmez.

## Fail-closed kombinasyonlar

- Preview Supabase hedefi production hedefiyle aynıysa deploy kabul edilmez.
- Media V2 açık + schema stage legacy/unknown ise sync durur.
- Goal V1 açık + schema stage `v1` değilse yalnız Goal sync durur.
- Research rollout disabled iken discovery/extraction/citation flag'leri açılmaz.
- Provider key/model eksikse ücretli fallback yapılmaz.
- AniList mode unset/invalid veya Production'da `preview_test` ise provider çağrısı başlamaz.
- TMDB `noncommercial` olsa bile token, approved logo asset ve attribution birlikte yoksa provider çağrısı başlamaz.
- OMDb public arama/fallback capability'si env/key'den bağımsız olarak kapalıdır; legacy `externalSource: "omdb"` kayıtları okunmaya devam eder.
- Open Library gerçek contact içeren `MEDIA_TRACKER_PROVIDER_USER_AGENT` olmadan çağrılmaz.
- Persistent embedding cache ve service-role key mandatory privacy/security kararı kapanmadan Preview/Production'da açılmaz.
