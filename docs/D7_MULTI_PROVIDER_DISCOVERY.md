# D7-R2C Multi-Provider Discovery

Tarih: 8 Ağustos 2026  
Durum: Provider-neutral internal discovery, Groq Compound ve kontrollü OpenRouter beta adapter'ları hazırdır; production Recommendation route'una bağlı değildir.

## Provider capability registry

Capability env/model adından tahmin edilmez; `ResearchDiscoveryProviderEntry` registry source-of-truth'tur.

| Provider | Contract | Canlı durum | Hard domain filtresi | URL sinyali | Search vendor | Kalıcılık |
|---|---|---|---:|---:|---|---|
| OpenAI | stable Responses `web_search`; contract-tested | live-unverified | Evet, `filters.allowed_domains` | action source + citation URL | OpenAI | `ephemeral_only` |
| Groq | Compound built-in `web_search`; contract-tested | live-verified | Evet, `search_settings.include_domains` | `executed_tools[].search_results.results[].url` | Tavily | `ephemeral_only` |
| OpenRouter | beta Responses server tool; contract-tested | live-unverified, beta | Evet, yalnız `engine=exa` + `allowed_domains` sabitken | `url_citation.url` | Exa | `ephemeral_only` |

Üç provider da source/evidence publisher değildir. Claim, provider response'una, response ID'sine, Tavily/Exa metadata'sına veya synthesized answer'a bağlanmaz. Accepted URL aynı ortak R1 registry ve URL policy'den yeniden geçer.

## Resmî contract denetimi

Groq'nun [Web Search](https://console.groq.com/docs/tool-use/built-in-tools/web-search) belgesi `groq/compound` ve `groq/compound-mini`, `search_settings.include_domains`, Tavily-backed sonuçlar ve `executed_tools[].search_results` sözleşmesini tanımlar. [Built-in Tools](https://console.groq.com/docs/compound/built-in-tools) belgesi `compound_custom.tools.enabled_tools` ile tam tool sınırını doğrular. Adapter bu nedenle yalnız `web_search` açar; `visit_website`, `code_interpreter` ve diğer built-in tool'lar kullanılamaz. Groq rate-limit header/429 davranışı [resmî rate-limit belgesine](https://console.groq.com/docs/rate-limits) göre bounded retry'la ele alınır.

OpenRouter'ın [Web Search server tool](https://openrouter.ai/docs/guides/features/server-tools/web-search) sözleşmesi beta `openrouter:web_search`, Responses desteği, engine seçimi, `allowed_domains`, `max_uses` ve URL citation output'unu tanımlar. Eski `plugins:[{id:"web"}]` ve `:online` yolları deprecated'dır. Native provider domain-filter davranışı farklı olduğundan adapter yalnız `engine:"exa"` ile açılır; `auto`, `native` ve `site:` query güvenlik sınırı değildir. [Responses web-search](https://openrouter.ai/docs/api_reference/responses/web-search) URL annotation shape'ini, [error contract](https://openrouter.ai/docs/api_reference/responses/error-handling) beta/stateless error sınıflarını tanımlar.

## Provider seçimi

`D7_RESEARCH_DISCOVERY_PROVIDER=disabled|openai|groq|openrouter|auto` server-side seçimdir. Unset/invalid değer `disabled` olur.

- Explicit seçim yalnız seçilen adapter'ı dener; flag/key/model eksikliği başka ücretli provider'a düşmez.
- `auto` yalnız kendi feature flag'i açık ve key/model'i geçerli provider'ları kullanır.
- Deterministic sıra önce mevcut `AI_PROVIDER` ile eşleşen enabled adapter, sonra `openai -> groq -> openrouter` sırasıdır.
- Fallback yalnız config/adapter unavailable için mümkündür. `no_source_discovered` diğer provider'larda aynı ücretli aramayı tekrarlamaz.
- `attemptedProviders` ve provider ID bounded telemetry'de görünür; key/model gösterilmez.

## Request sınırları

Ortak port yalnız deterministic query, server-derived domains, max source, request ID ve public candidate/aspect envelope alır. Owner/user ID, rating, favorite, progress, note, feedback, library, raw prompt ve conversation hiçbir adapter body’sine giremez.

Groq body özeti:

```json
{
  "model": "groq/compound-mini",
  "messages": [{ "role": "user", "content": "<public deterministic instruction>" }],
  "compound_custom": { "tools": { "enabled_tools": ["web_search"] } },
  "search_settings": { "include_domains": ["wikipedia.org", "*.wikipedia.org"] }
}
```

OpenRouter body özeti:

```json
{
  "model": "openai/o4-mini",
  "store": false,
  "input": "<public deterministic instruction>",
  "tools": [{
    "type": "openrouter:web_search",
    "parameters": {
      "engine": "exa",
      "max_results": 5,
      "max_total_results": 5,
      "max_uses": 1,
      "search_context_size": "low",
      "allowed_domains": ["wikipedia.org"]
    }
  }]
}
```

OpenRouter model env'i arbitrary değildir; yalnız code-controlled, resmî contract ile denenebilir model listesi kabul edilir. Beta sözleşme değişirse codec fail-closed `response_invalid` üretir.

## Bütçe, persistence ve telemetry

Job en fazla iki query, provider başına bir request, beş accepted URL, 256 KiB response ve bir transient retry kullanır. OpenAI/OpenRouter operation timeout'u 5 saniye, gerçek Compound latency uyumluluğu için Groq timeout'u 7,5 saniyedir; ikisi de global 8 saniye tavanının altındadır. Global concurrency iki, aynı research key in-flight coalesced'dır.

Query, discovered URL listesi, response, assistant text, reasoning, snippet/content/highlight, response/action ID ve Tavily/Exa metadata'sı DB/localStorage/evidence cache'e yazılmaz. Cache validator bunları reddeder. Telemetry yalnız provider, status class, bounded request ID, süre/byte/retry/rate-limit/timeout ve source/reject/malformed/coalescing sayıları taşır.

## Conditional live smoke

Normal suite network açmaz. Her provider live testi yalnız kendi enable/live flag'i, key'i, allowlisted model'i ve explicit `D7_RESEARCH_DISCOVERY_PROVIDER` seçimiyle çalışır. Scenario Steins;Gate + romance + `wikipedia.org` olup `sources_discovered`, gerçek tool call, en az bir accepted HTTPS/credential-free Wikipedia URL'si ve `sourceId=wikipedia` bekler; exact path, count, text veya citation sırası beklemez. Claim/decision üretimi yasaktır.

D7-R2C.1 koşusunda Groq `groq/compound-mini` process-local model ayarıyla canlı geçmiştir. İlk koşu 5 saniyelik ortak timeout'ta geçerli provider cevabını kesmiş; sanitize teşhis 200/JSON, bir tool call ve URL sinyalleri döndüğünü göstermiştir. Groq'a özel 7,5 saniyelik bounded timeout sonrası strict live test `1 passed / 0 failed / 0 skipped` olmuştur. OpenAI ve OpenRouter açık research model bulunmadığından çağrılmamış ve live-unverified kalmıştır. R3 discovery giriş kapısı en az bir live-verified provider bulunduğu için açıktır; bu durum production auto-selection'ı etkinleştirmez.

## D7-R3A handoff sınırı

Discovery sonucu evidence değildir ve kendi başına persist edilmez. R3A yalnız supplied `DiscoveredResearchSource` içindeki enabled Wikipedia URL'sini ortak URL/registry policy'sinden tekrar geçirir; sonra normal HTML'i değil MediaWiki Action API'yi kullanır. Son page `pageprops.wikibase_item` exact candidate QID'sine eşleşmeden, revision-bound citation ve bounded plaintext alınmadan passage üretilemez. Search provider request/response/snippet/output'u R3A packet'ına taşınmaz ve R3A hiçbir discovery network çağrısı yapmaz.

## R3B ile registry ayrımı

Discovery ve extraction provider registry'leri ayrıdır. Bir provider'ın live-verified discovery yapması extraction capability/flag/model veya live doğrulaması anlamına gelmez. R3B search provider response'unu değil yalnız R3A'nın exact-QID, revision-bound transient packet'ını tüketir; extraction request'inde web/search tool yoktur. Ayrıntı: [Multi-Provider Extraction](D7_MULTI_PROVIDER_EXTRACTION.md).

İlgili belgeler: [Discovery Contract](D7_RESEARCH_DISCOVERY_CONTRACT.md), [OpenAI Adapter](D7_OPENAI_WEB_DISCOVERY.md), [Source Expansion Matrix](D7_RESEARCH_SOURCE_EXPANSION_MATRIX.md), [Source Acquisition](D7_RESEARCH_SOURCE_ACQUISITION.md), [Security Model](D7_RESEARCH_SECURITY_MODEL.md).
