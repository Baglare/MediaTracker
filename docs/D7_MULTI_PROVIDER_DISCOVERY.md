# D7-R2C Multi-Provider Discovery

Tarih: 8 Ağustos 2026  
Durum: Provider-neutral internal discovery, Groq Compound ve kontrollü OpenRouter beta adapter'ları hazırdır; production Recommendation route'una bağlı değildir.

## Provider capability registry

Capability env/model adından tahmin edilmez; `ResearchDiscoveryProviderEntry` registry source-of-truth'tur.

| Provider | Contract | Hard domain filtresi | URL sinyali | Search vendor | Kalıcılık |
|---|---|---:|---:|---|---|
| OpenAI | stable Responses `web_search` | Evet, `filters.allowed_domains` | action source + citation URL | OpenAI | `ephemeral_only` |
| Groq | Compound built-in `web_search` | Evet, `search_settings.include_domains` | `executed_tools[].search_results.results[].url` | Tavily | `ephemeral_only` |
| OpenRouter | beta Responses server tool | Evet, yalnız `engine=exa` + `allowed_domains` sabitken | `url_citation.url` | Exa | `ephemeral_only` |

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

Job en fazla iki query, provider başına bir request, beş accepted URL, 256 KiB response, 5 saniye timeout ve bir transient retry kullanır. Global concurrency iki, aynı research key in-flight coalesced'dır.

Query, discovered URL listesi, response, assistant text, reasoning, snippet/content/highlight, response/action ID ve Tavily/Exa metadata'sı DB/localStorage/evidence cache'e yazılmaz. Cache validator bunları reddeder. Telemetry yalnız provider, status class, bounded request ID, süre/byte/retry/rate-limit/timeout ve source/reject/malformed/coalescing sayıları taşır.

## Conditional live smoke

Normal suite network açmaz. Her provider live testi yalnız kendi enable/live flag'i, key'i, allowlisted model'i ve `D7_RESEARCH_DISCOVERY_PROVIDER` explicit/auto seçimiyle çalışır. Scenario Steins;Gate + romance + `wikipedia.org` olup exact URL, count, text veya claim beklemez. Live env yoksa controlled skip edilir.

İlgili belgeler: [Discovery Contract](D7_RESEARCH_DISCOVERY_CONTRACT.md), [OpenAI Adapter](D7_OPENAI_WEB_DISCOVERY.md), [Source Expansion Matrix](D7_RESEARCH_SOURCE_EXPANSION_MATRIX.md), [Security Model](D7_RESEARCH_SECURITY_MODEL.md).
