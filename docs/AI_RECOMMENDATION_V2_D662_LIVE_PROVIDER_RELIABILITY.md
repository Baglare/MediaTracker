# D6.6-2 — Live Provider Reliability

Tarih: 6 Ağustos 2026

## Karar

D6.6-2, Recommendation V2 provider katmanını gerçek public upstream verisi, sentetik fail-soft fixture'ları ve merkezi request budget ile doğrular. Bu kabul provider katalog kapsamının veya AI doğruluğunun genel kalite garantisi değildir; doğrulanan şey identity, schema, evidence ve bounded-failure invariant'larıdır.

## Önceki canlı hata

Başarısız test `TVMaze anime ve Batı animasyonu sinyallerini sınıflandırır` idi. Beklenen anime exclusion `true`, alınan değer `false` oldu. `/singlesearch/shows?q=One Piece` artık ilk eşleşme olarak `Scripted`, `English`, ülkesiz ve anime sinyali taşımayan live-action kaydı döndürüyordu. Classifier bu metadata için doğru biçimde `non_anime` kararı verdi.

Kök neden sınıfı provider kataloğunun doğal değişimi ile kırılgan first-result assertion bileşimidir. Production classifier veya threshold değiştirilmedi. Canlı test bounded `/search/shows` listesinde metadata invariant'ı sağlayan kayıtları arar; sabit ilk sonuç, sıra, rank, community score veya sonuç adedi beklemez.

## Merkezi request budget

| Provider | Timeout | Attempts | Concurrency | Candidate | Enrichment | Query |
|---|---:|---:|---:|---:|---:|---:|
| AniList | 4000 ms | 2 | 2 | 24 | 0 | 4 |
| TVMaze | 4000 ms | 2 | 1 | 16 | 0 | 4 |
| TMDB | 3500 ms | 2 | 2 | 16 | 8 | 4 |
| OMDb | 3500 ms | 2 | 2 | 8 | 8 | 4 |
| Open Library | 4500 ms | 2 | 1 | 12 | 8 | 4 |

`429`, `500`, `502`, `503`, `504` sınırlı retry alır. `Retry-After` en fazla 1000 ms uygulanır. Permanent 4xx retry edilmez. Parent abort stale request sonucunu durdurur. Hata sınıfı ve sayaçlar debug telemetry'ye girer; URL, body, anahtar veya raw upstream mesaj kullanıcı cevabına taşınmaz.

## Drift, fail-soft ve cache

- Structured AniList response'unda `results` array değilse katalog boş sayılmaz; `provider_tag_query_unavailable` üretilir.
- Malformed tek kayıt elenir, valid bounded kayıtlar kurtarılır.
- Exact provider ID veya geçerli media type yoksa kayıt verified candidate değildir.
- Büyük overview 2000 karakterle sınırlandırılır ve HTML tag'leri temizlenir.
- Optional metadata yokluğu adayı otomatik düşürmez; evidence `unknown` kalır.
- Missing tag absent değildir; score/popularity tag kanıtı değildir.
- Cache key provider/media/external ID/schema version'dır; max 256, TTL provider bazlıdır, negative cache yoktur.
- Enrichment `getOrLoadWithStatus` kullanır; eşzamanlı aynı key tek promise'e coalesce edilir ve telemetry'de ayrılır.

## Canlı sonuç

`D6_PROVIDER_LIVE_SMOKE=1` ile yalnız `tests/recommendation-provider-live.integration.test.ts` çalıştırıldı:

- AniList exact Fantasy identity/genre invariant'ı geçti.
- AniList `Politics` ve `Revenge`, minimum rank 40 ve 20 geçti; canonical tag ve finite `0..100` rank doğrulandı.
- TVMaze anime, Batı animasyonu ve live-action metadata sınıfları geçti.
- Open Library exact work ve varsa edition→work ilişkisi geçti.
- TMDB: `TMDB_READ_ACCESS_TOKEN` yok; kontrollü skip.
- OMDb: `OMDB_API_KEY` yok; kontrollü skip.

Paket 5 pass, 2 key-gated skip verdi. Public çağrılar seri ve bounded kaldı; DB, kullanıcı verisi, mutation veya kalıcı response dump'ı kullanılmadı.

## Latency gözlemi

Recommendation debug read-model'i `interpretation`, `planning`, `retrieval`, `enrichment`, `evidence`, `ranking`, `explanation` ve `total` sürelerini milisaniye olarak taşır. Evaluation katmanı count/mean/p50/p95/max üretir. Tek canlı smoke süreleri performans garantisi veya pass/fail eşiği değildir.

Global Search, Release Calendar, DB/migration/RPC, kartlar, D7 modeli, D8 işleri ve LLM final reranking değiştirilmedi.

## Browser smoke sonucu

Yerel development server ve in-app browser ile 1366×768, 1536×864 ve 375×812 kontrol edildi; yatay overflow ve console warning/error görülmedi.

- Politics sorgusu must/significant + AniList capability üretti; structured tag retrieval ile 5 doğrulanmış sonuç döndü. `FANTASY`/`Fantasy` başlığı yoktu. Şeffaflıkta Deterministic V2, structured tag retrieval ve LLM final sıralama kullanılmadı bilgileri görünüyordu.
- Fantasy exact-taxonomy sorgusu 5 sonuç üretti; genre-only kanıt UI'da significant/medium gösterildi.
- Character-driven sorgusu semantic verifier uyarısı verdi; yapılandırılmamış local verifier seçeneği göstermedi ve uydurma sonuç üretmedi.
- Romance must + love-triangle avoid doğru rollerde çözümlendi; 4 sonuçta love-triangle pozitif fit veya raw enum/code görünmedi. Quick Add ve Discover kontrolleri görünürdü; yerel kütüphaneyi değiştirmemek için tıklanmadı.
- Aynı kullanıcı prompt'u history'de bir kez göründü. Owner switch ve provider-unavailable browser fixture bu koşuda çalıştırılmadı; abort/fail-soft contract testleriyle sınırlı kaldı.
