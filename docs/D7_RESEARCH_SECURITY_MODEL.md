# D7 Research Security Model

Tarih: 8 Ağustos 2026
Durum: D7-R2A.1 secure direct-source network ve D7-R2B fixed-endpoint allowlisted OpenAI discovery hazırdır; genel web HTML acquisition/sanitizer yoktur.

## 1. Güven sınırları

Güvenilmeyen girdiler: kullanıcı metni, LLM/search query önerisi, search result URL/snippet'i, redirect, DNS cevabı, remote HTML/JSON, sayfa içi instruction ve extractor model output'u. Exact provider identity ve registry/policy sabitleri de runtime codec'ten geçmeden URL veya cache key üretmez.

Research katmanı üç ayrı boundary kullanır:

1. Planner yalnız bounded `candidateKey + versionScope + aspectId` task üretir.
2. Fetcher yalnız allowlisted source adapter'ının server-chosen URL template'ini çağırır.
3. Extractor yalnız sanitised passage envelope görür; network, secret, system prompt veya tool erişimi yoktur.

## 2. Domain allowlist ve SSRF

- Scheme yalnız `https`.
- URL kullanıcıdan veya LLM'den doğrudan fetch edilmez; parse/canonicalize sonrası adapter route template'i kullanılır.
- Username/password, fragment, non-default port, IP literal ve encoded/alternative IP biçimleri reddedilir.
- DNS çözümü OS-compatible `dns.lookup(..., { all: true, verbatim: true })` kullanır. Dönen bütün adreslerde loopback, link-local, private, carrier-grade NAT, multicast, reserved ve metadata service aralıkları reddedilir; IPv4/IPv6 birlikte kontrol edilir ve mixed public/private fail-closed'dur.
- Her redirect yeniden scheme/domain/DNS validation'dan geçer; en çok 2 redirect.
- DNS rebinding'e karşı tek kontrollü OS lookup sonucu doğrulanır; retry aynı prevalidated pin'i kullanır, redirect yeni validation alır ve socket custom lookup yalnız exact pinned family/address döndürür. Node auto-family selection kapalıdır; `all:true` callback yolu da yalnız aynı pin'in tek-elemanlı dizisini döndürür.
- TLS `servername` ve internal Host header canonical allowlisted hostname olarak kalır; sertifika doğrulaması kapatılmaz.
- Proxy ortamında da nihai hedef policy'si uygulanır; `localhost`, `.local`, intranet ve file/data/blob URI'ları yasaktır.

## 3. Content sanitization

- MIME allowlist: beklenen JSON veya text/html; binary, archive, PDF ve media D7-R1 scope dışıdır.
- Compressed ve decompressed byte limitleri ayrı uygulanır; zip bomb/çoklu encoding reddedilir.
- HTML parser yalnız görünür metni alır. `script`, `style`, `template`, `noscript`, iframe, form, SVG, event handler, comment ve hidden content çıkarılır.
- Entity decode/Unicode normalization sonrası control character ve bidi spoofing denetlenir.
- DOM, JSON depth, node count, line ve passage boyutu bounded'dır.
- Passage her zaman immutable `sourceId/revisionId/passageId` envelope'u içinde tutulur; raw HTML extractor'a verilmez.

D7-R2A direct adapter limitleri: WDQS/Action API decompressed JSON 256 KiB, Wikipedia plaintext 24.000 UTF-8 byte, DNS 1250 ms, Wikidata 3000 ms, Wikipedia 3500 ms ve global direct-source 8000 ms. `Content-Length` güven sınırı değildir; gzip/deflate decompressed stream sayılır. Daha geniş HTML/passage limitleri R2B/R3'te sanitizer ile ayrıca tanımlanacaktır.

## 4. Prompt injection isolation

- Remote content yalnız veri olarak işaretlenir; içindeki “talimat”, role marker, tool çağrısı veya JSON schema değiştirme isteği yürütülmez.
- System/developer instruction ile passage ayrı message/content block'larında tutulur.
- Extractor'a candidate kimliği, aspect tanımı, izinli verdict enum'u ve passage listesi dışında application context verilmez.
- Model candidate ekleyemez, URL açamaz, query kuramaz, rank/eligibility kararı veremez.
- Passage'ta prompt injection paterni bulunması tek başına source claim'i değildir; telemetry warning üretir ve yüksek riskte passage quarantine edilir.
- Output strict JSON schema + unknown-field rejection + citation referential integrity kontrolünden geçer.

## 5. Secret ve kişisel veri koruması

- API key yalnız server-side provider adapter'ında bulunur; query, prompt, telemetry, citation veya error body'ye yazılmaz.
- Authorization/cookie/header seti allowlist'tir; direct publisher fetch'e search/LLM secret'ı taşınmaz.
- Error ve telemetry redaction; bearer token, API key pattern, e-posta, owner/user ID ve request prompt parçalarını siler.
- User library, note, rating, favorite, progress ve feedback research passage/extractor/cache'e girmez.
- Query template kullanıcı cümlesini aynen taşımaz; registry aspect label'ı + exact public title/identity ile server'da üretilir.

## 6. Rate limit, timeout ve abuse

- Request başına global research bütçesi, candidate/aspect/source/query limitleri uygulanır.
- Owner/IP bazlı endpoint rate limit ile provider/domain bazlı token bucket ayrıdır.
- Concurrency global ve request-local cap taşır; in-flight identical task coalescing vardır.
- 429 `Retry-After` bounded uygulanır; request budget'ı aşan retry yapılmaz.
- Timeout/abort bütün child fetch ve extraction işlerine yayılır.
- Circuit breaker `provider_unavailable` üretir; bunu `no evidence` veya `absent` ile birleştirmez.

## 7. Citation URL validation

Her citation:

- input passage setindeki gerçek `sourceId + passageId` çiftine çözülür;
- canonical URL'si fetch edilen nihai allowlisted URL ile byte-normalized eşleşir;
- candidate exact identity/versionScope ile source mapping kaydı taşır;
- revision/fingerprint'i source envelope ile eşleşir;
- `javascript:`, redirector, tracking-only ve mismatched domain URL'lerini reddeder;
- kullanıcıya gösterilmeden güvenli link serialization'dan geçer.

Citation doğrulanamazsa ilgili `supported/contradicted` claim reddedilir ve sonuç `unknown`a düşer.

## 8. Failure taxonomy ve logging

Minimum internal reason code'ları:

- `source_provider_unavailable`
- `source_rate_limited`
- `source_timeout`
- `source_not_allowlisted`
- `source_identity_mismatch`
- `source_content_too_large`
- `source_content_unsafe`
- `source_license_blocked`
- `no_relevant_passage`
- `extractor_invalid_json`
- `extractor_citation_missing`
- `extractor_citation_invalid`
- `extractor_contradictory`

Log yalnız reason code, source class/domain tokenı, süre, byte bucket, cache state ve request-scoped opaque trace ID taşır. Raw URL query, content, prompt, output, secret veya kişisel kimlik taşımaz.

## 9. D7-R2B sonucu ve D7-R3 güvenlik kapısı

D7-R1 saf URL/content/citation contract'larını tanımladı. D7-R2A.1 gerçek socket hedefini OS resolver'ın döndürdüğü ve tamamı doğrulanmış address setinden deterministik seçilen adrese pinler. c-ares `resolve4/resolve6` hatalarını boş sonuç gibi yutan eski uyumluluk kusuru kaldırılmıştır. Mixed public/private DNS ve special-use IPv4/IPv6 fail-closed kalır. Retry ikinci DNS açmaz; manual redirect en çok iki hop ve her hop tam URL/DNS validation alır. TLS SNI/Host canonical hostname olarak korunur.

D7-R2B yalnız sabit `https://api.openai.com/v1/responses` endpoint'ine server-side POST yapar; endpoint env/user girdisi değildir. API key client'a çıkmaz. Request codec kişisel alanları ve arbitrary query/URL'yi reddeder. Provider filter yalnız server-derived `wikipedia.org` token'ıdır; boş filter ile unrestricted search açılmaz. Dönen URL HTTPS ve exact R1 source registry host policy'sinden tekrar geçer. R2B bu URL'yi fetch etmediği için search-result SSRF bağlantısı açmaz.

5 saniye timeout, 256 KiB streaming response cap, bir retry, bounded `Retry-After`, global concurrency=2 ve same-job coalescing uygulanır. Raw response/output text/snippet/query/error body/header loglanmaz; yalnız bounded status/count/byte/duration ve `x-request-id` tutulabilir.

D7-R3 discovered-source acquisition veya HTML I/O açılmadan önce ayrıca şunlar gerekir:

- gerçek HTML/script/style/hidden-content sanitizer'ı;
- DOM ve passage limitlerinin streaming uygulaması;
- discovered URL'nin R2A allowlist/DNS pinning boundary'sinden geçmesi;
- proxy ortamında pinned connect-target politikasının operasyonel doğrulaması.

R2A koruması yalnız internal direct Wikimedia adapter'ı için geçerlidir; henüz Recommendation route güvenlik kanıtı değildir.

İlgili belgeler: [Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md), [Research Source Policy](D7_RESEARCH_SOURCE_POLICY.md).
