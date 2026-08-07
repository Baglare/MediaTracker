# D7-R2A Secure Research Network Foundation

Tarih: 8 Ağustos 2026  
Durum: Server-side HTTP/DNS foundation tamamlandı; Recommendation V2 production akışına bağlı değildir.

## Audit sonucu

Mevcut provider request policy timeout, iki attempt, bounded `Retry-After` ve evidence-cache coalescing sağlıyordu. Ancak adapter'ların kullandığı global `fetch`, DNS preflight sonucu ile gerçek socket hedefini bağlamaz; redirect/DNS rebinding sınırı ve decompressed streaming limiti sağlamaz. D7-R2A bu nedenle mevcut helper'ı genişletmek yerine yalnız research için ayrı `server-only` transport kurar. Exact candidate identity ve R1 source URL registry tekrar kullanılır; app route eklenmez.

## Server sınırı ve port

`SecureResearchHttpClient.request` yalnız şu bounded contract'ı kabul eder: enabled `sourceId`, HTTPS URL, literal `GET`, kontrollü `User-Agent/Api-User-Agent/Accept/Accept-Encoding`, timeout, decompressed byte limiti, content-type allowlist, manual redirect policy ve opaque request ID. Request body, `Authorization`, `Cookie` ve arbitrary header runtime codec'te reddedilir.

Node uygulaması `node:https` kullanır. Universal domain/planning barrel'ı Node modülü import etmez; gerçek transport [server export'u](../features/recommendations/research/server.ts) üzerinden erişilir.

## Pinned DNS ve SSRF

Her hop için akış:

1. R1 URL policy exact source host allowlist'ini doğrular.
2. `node:dns/promises` ile A ve AAAA sonuçları bounded 1250 ms içinde çözülür.
3. Sonuçların tamamı public/global policy'den geçer; tek private/special sonuç mixed DNS'i fail-closed reddeder.
4. Deterministik public adres seçilir ve `https.request.lookup` callback'ine pinlenir.
5. TLS `servername` ve HTTP Host canonical hostname olarak kalır; sertifika hostname'e göre doğrulanır.
6. Redirect veya retry yeni request sayılır ve DNS sıfırdan doğrulanır.

IPv4 policy unspecified, RFC1918, CGNAT, loopback, link-local/metadata, special-use, documentation, benchmark, multicast ve reserved aralıkları reddeder. IPv6 policy unspecified/loopback, IPv4-mapped private, NAT/special-use, benchmark/documentation, 6to4, unique-local, link/site-local ve multicast aralıklarını reddeder. IP-literal URL R1 URL policy'de zaten yasaktır.

## Redirect, timeout ve retry

- Otomatik redirect kapalı; yalnız `301|302|303|307|308`, en çok iki hop.
- Relative `Location` canonical URL'ye göre çözülür. Loop, missing Location, HTTPS downgrade, registry dışı host, userinfo, port veya IP literal reddedilir.
- Wikidata timeout 3000 ms; Wikipedia 3500 ms; direct-source global abort 8000 ms.
- `429|502|503|504` ve transient network/timeout en fazla bir retry alır.
- `Retry-After` en çok 1000 ms uygulanır. Permanent 4xx, DNS/security, codec, content-type ve size hatası retry edilmez.
- Global transport concurrency 2, hostname concurrency 1'dir. Aynı canonical request in-flight map ile coalesce edilir.

## Streaming ve response policy

Transport `Content-Length` değerine güvenmez. `identity|gzip|deflate` stream decompressed halde sayılır; limit aşımında stream durdurulur ve partial body kullanılmaz. Wikimedia Action API ve WDQS yalnız `application/json` kabul eder. JSON response limiti 256 KiB'dir. Wikipedia plaintext limiti R1 transient-document invariant'ıyla aynı kalmak için 24.000 UTF-8 byte'tır. JSON decode fatal UTF-8 kullanır; plaintext control karakteri fail-closed reddedilir.

## Environment ve User-Agent

- `MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED=1`: internal adapter'ı açar; varsayılan `0`/missing kapalıdır.
- `MEDIA_TRACKER_RESEARCH_USER_AGENT`: `Product/version (contact)` biçiminde anlamlı client ve HTTPS/e-posta contact taşımalıdır.
- `D7_RESEARCH_LIVE_SMOKE=1`: yalnız conditional integration testini açar; product feature flag değildir.

`NEXT_PUBLIC_` environment kullanılmaz. User-Agent secret değildir fakat raw environment veya request headers loglanmaz.

## Telemetry ve açık sınırlar

Counter'lar DNS count/duration, private/redirect rejects, request/retry/429/timeout, decompressed bytes, size/content-type rejects ve coalescing taşır. Raw body, Wikipedia text, full SPARQL query, external ID, header, owner/user veya secret loglanmaz.

D7-R2A HTML fetch/sanitizer, proxy desteği, OpenAI/Brave discovery, LLM extraction, DB cache, UI veya production route entegrasyonu içermez.

İlgili belgeler: [Wikidata identity](D7_WIKIDATA_IDENTITY_RESOLUTION.md), [Wikipedia direct source](D7_WIKIPEDIA_DIRECT_SOURCE.md), [live smoke](D7_RESEARCH_LIVE_SMOKE.md), [security model](D7_RESEARCH_SECURITY_MODEL.md).
