# D7-R2B OpenAI Web Discovery

Tarih: 8 Ağustos 2026  
Durum: Internal, feature-gated ve ephemeral source discovery adapter hazır; Recommendation V2 route'una bağlı değildir.

## Resmî API contract denetimi

Uygulama, OpenAI'nin güncel [Web search guide](https://developers.openai.com/api/docs/guides/tools-web-search) sözleşmesini kullanır:

- endpoint `POST https://api.openai.com/v1/responses`;
- tool yalnız stable `web_search`; legacy `web_search_preview` fallback'i yok;
- `filters.allowed_domains` server-side source policy'den gelir;
- `search_context_size: "low"`;
- `tool_choice: "required"`;
- tam source listesi için `include: ["web_search_call.action.sources"]`;
- response decoder `web_search_call.action` içindeki `search`, `open_page` ve `find_in_page` URL'lerini tanır.

`search` action'ında bounded `queries` ve `sources[]`, URL source item'ında `type="url"` ve `url` beklenir. Message içindeki `url_citation` annotation URL'si yalnız ikincil discovery sinyali olabilir; metin, indeks ve title evidence değildir. Bilinmeyen output tipi bounded warning ile atlanır. Tek bozuk item sağlıklı tool call'u düşürmez; hiç sağlıklı `web_search_call` yoksa response invalid sayılır.

## Sabit request shape

İstek yalnız `OPENAI_RESEARCH_MODEL` veya açıkça yapılandırılmış `OPENAI_MODEL`, public candidate metadata, registry aspect metadata ve deterministic query'leri taşır. Body contract'ı:

```json
{
  "model": "<server-configured>",
  "store": false,
  "input": "<deterministic public discovery instruction>",
  "tools": [{
    "type": "web_search",
    "filters": { "allowed_domains": ["wikipedia.org"] },
    "search_context_size": "low"
  }],
  "tool_choice": "required",
  "include": ["web_search_call.action.sources"]
}
```

Tool listesine başka tool, unrestricted search veya custom base URL eklenmez. API key yalnız `Authorization` server header'ında bulunur; adapter response body, output text, snippet veya raw header loglamaz.

## Feature gate ve model

- `D7_OPENAI_WEB_DISCOVERY_ENABLED=1`: internal adapter çağrısını açar.
- `D7_OPENAI_WEB_DISCOVERY_LIVE_SMOKE=1`: yalnız conditional live testi açar.
- `OPENAI_API_KEY`: server-only secret.
- `OPENAI_RESEARCH_MODEL`: tercih edilen explicit web-search-capable model.
- Bu alan boşsa mevcut explicit `OPENAI_MODEL` kullanılabilir; ikisi de yok/geçersizse fail-closed `disabled`.

Flag kapalı, key/model eksik veya geçersizken network açılmaz. Hiçbir değişken `NEXT_PUBLIC_` değildir.

## Data minimization ve `store=false`

OpenAI'ye kabul edilen veri exact public title snapshot, yıl, media type, scope kind, canonical aspect ID/label, role/minimum level ve allowlisted domain token'ıdır. Owner/user ID, rating, favorite, progress, note, feedback, library, conversation veya raw prompt contract tarafından reddedilir.

`store:false`, response application-state saklamasını istemediğimizi açıkça belirtir. Bunun OpenAI platformundaki abuse-monitoring veya tool işleme retention'ını tek başına sıfırladığı varsayılmaz; [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) ayrıca değerlendirilir. Kod Zero Data Retention varmış gibi davranmaz. Bu yüzden gönderilen metadata public ve minimumdur.

## Bütçe, retry ve telemetry

- Job başına en çok iki deterministic query, bir Responses call ve beş accepted source.
- 256 KiB streaming response sınırı; `Content-Length` güven sınırı değildir.
- 5 saniye operation timeout; global discovery concurrency en çok iki.
- Aynı scope/aspect/role/domain/query policy in-flight request coalesce edilir.
- `429`, `500`, `502`, `503`, `504` ve transient network için en çok bir retry; `Retry-After` en çok 1000 ms.
- `400`, `401`, `403`, malformed JSON, yanlış content type ve oversized body retry edilmez.

Telemetry yalnız status class, bounded `x-request-id`, süre, retry/rate-limit/timeout, byte, tool-call/source/reject/malformed/coalesced sayıları taşır. API key, full query, output text, snippet ve raw error body taşınmaz.

## Evidence sınırı

OpenAI source değildir. Çıktı yalnız underlying allowlisted publisher URL'sini `DiscoveredResearchSource` olarak verir. `api.openai.com`, response ID, output text veya search rank citation/claim olmaz. Kabul edilen URL R1 source registry, HTTPS/userinfo/IP/port/length policy ve request domain policy'den tekrar geçer.

Bu aşama URL'yi fetch etmez, sanitize etmez, passage seçmez, claim/citation üretmez ve ranking'e teslim etmez. Direct acquisition ve grounded extraction [D7-R3](D7_RESEARCH_DISCOVERY_CONTRACT.md#d7-r3-handoff) kapısıdır.

## Conditional live smoke

Normal suite network açmaz. Live test ancak iki D7 flag'i `1`, key ve geçerli explicit model mevcutsa çalışır. Steins;Gate/romance/work-scope isteğinde en az bir `web_search_call` decode edilmesini; accepted URL'lerin HTTPS, `wikipedia.org` altında ve registry'de `wikipedia` olmasını doğrular. Sonuç `sources_discovered` veya kontrollü `no_source_discovered` olabilir. Exact URL, source sayısı, output text veya aspect claim assertion'ı yoktur.

İlgili belgeler: [Discovery Contract](D7_RESEARCH_DISCOVERY_CONTRACT.md), [Source Policy](D7_RESEARCH_SOURCE_POLICY.md), [Security Model](D7_RESEARCH_SECURITY_MODEL.md).
