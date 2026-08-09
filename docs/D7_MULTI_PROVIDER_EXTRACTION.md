# D7-R3B Multi-Provider Grounded Extraction

Tarih: 2026-08-09  
Durum: Groq contract-tested ve live-verified; OpenAI/OpenRouter contract-tested fakat explicit extraction model olmadığı için live-unverified; bütün provider'lar varsayılan kapalıdır.

## Ayrı provider registry

Extraction registry discovery registry'den ayrıdır. Her entry feature/live flag, key/model env, fixed endpoint class, strict-schema/no-tools capability, `store:false` desteği, contract status, exact model allowlist, 6 saniye timeout, 128 KiB response sınırı ve `response_ephemeral_only` policy taşır. Env veya UI string'inden capability tahmini yapılmaz.

| Provider | Endpoint/contract | Allowlisted model | Contract durumu | Özel guard |
| --- | --- | --- | --- | --- |
| Groq | Stable Chat Completions + strict `json_schema` | `openai/gpt-oss-20b`, `openai/gpt-oss-120b` | stable | tools/stream kapalı; reasoning istenmez/tüketilmez |
| OpenAI | Responses + `text.format` strict JSON Schema | `gpt-5.4-mini`, versionlı mini, `gpt-5.4` | stable | `store:false`; tools/web/file/function yok |
| OpenRouter | Chat Completions strict `response_format` | explicit code allowlist | partial | `require_parameters:true`, `allow_fallbacks:false`, `data_collection:deny`; plugin/`:online`/tools yok |

Resmî kontrat kaynakları: [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [OpenRouter Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection).

## Request ve decoder sınırı

Her adapter yalnız minimized public passage input'unu fixed HTTPS endpoint'e POST eder. Authorization server-only'dir. Tool listesi, web search, function, retrieval, plugin ve candidate identity yoktur. Assistant content ancak provider envelope codec'i geçtikten sonra exact `JSON.parse` ve ortak strict model-output codec'ine girer. Free-form content, markdown fence, refusal, incomplete output veya unknown field claim olamaz. Raw response/request body loglanmaz veya persist edilmez.

## Selection ve fallback

`D7_RESEARCH_EXTRACTION_PROVIDER=disabled|groq|openai|openrouter|auto` server-only selector'dır. Explicit provider seçimi yalnız o adapter'ı dener; flag/key/explicit allowlisted model yoksa disabled/model_unsupported döner. Sessiz ücretli fallback yoktur. `auto`, yalnız valid provider'lar arasında `groq → openai → openrouter` sırasından en fazla bir provider seçer; adapter/schema/grounding/no-claim sonucu ikinci çağrı başlatmaz. Bu sıra production rollout değildir; R4'e kadar route'a bağlı değildir.

## Environment

Provider flag/key/model env'lerinin hiçbiri `NEXT_PUBLIC_` değildir. Production model default'u yoktur. Conditional Groq live smoke, key varsa yalnız child process'te `openai/gpt-oss-20b` kullanabilir; config dosyasına yazmaz. OpenAI/OpenRouter explicit extraction modeli olmadan live-verified sayılmaz.

2026-08-09 canlı kapısında synthetic significant-romance packet `claims_extracted` üretti. Aynı koşudaki gerçek Steins;Gate R3A packet'i strict schema/grounding'i geçti ve `no_claims_extracted` (bir assessment, sıfır claim) döndü; bu sonuç missing mention'ın support/absence'a çevrilmediğini gösterir. İlk koşuda görülen finding/level/basis kombinasyon drift'i, validator gevşetilmeden exact combination instruction'larıyla düzeltildi.
