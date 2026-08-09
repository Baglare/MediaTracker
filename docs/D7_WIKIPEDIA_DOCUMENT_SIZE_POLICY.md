# D7-R5B.2 Wikipedia Document Size Policy

## Önceki davranış

Wikipedia full-plaintext yolu aynı 24.000 sınırını üç farklı anlamda kullanıyordu: adapter decoded extract'i UTF-8 byte sayısıyla, transient document codec'i JavaScript karakter sayısıyla ve R3A normalizer normalize edilmiş karakter sayısıyla sınırlıyordu. MediaWiki JSON response ise genel Wikipedia API `256 KiB` cap'ini kullanıyordu. Bu nedenle 24 KB üstündeki exact-QID ve revision-bound tam extract, packet üretilmeden `wikipedia_extract_oversized` ile reddediliyordu.

## Extended full-document policy

- `WIKIPEDIA_EXTRACT_RESPONSE_MAX_BYTES`: `96 KiB`. Yalnız Wikipedia full-extract Action API isteğinde kullanılır; generic HTTP foundation limiti veya page metadata limiti değiştirilmedi.
- `WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES`: `64 KiB` UTF-8. `24–64 KiB` aralığı full document olarak kabul edilir.
- R3A normalization sonrasında UTF-8 byte uzunluğu yeniden doğrulanır. NFKC büyümesi limiti aşarsa document reddedilir.
- `64 KiB + 1` ve üzeri extract `wikipedia_extract_oversized` ile fail-closed kalır. Document, passage veya claim üretilmez.

Stream reader decompressed body sayısını izler; limit aşımında kaynak ve decode stream'lerini kapatır ve partial body döndürmez. Başarı yolu `slice`, sessiz truncation, lead fallback, `action=parse`, HTML veya wikitext parser kullanmaz. QID, page ID, revision race, canonical URL, content hash, UTF-8, content-type, DNS pinning ve transient-only kuralları değişmedi.

## Downstream bütçeler

Extended document yalnız deterministic segmentation için daha geniş source coverage sağlar. R3A packet hard cap'i `12.000` karakter ve en fazla sekiz passage olarak kaldı. R3B provider working set'i en fazla 16 evidence unit ve 6.000 evidence karakteri olarak kaldı. Document count, concurrency ve research deadline değiştirilmedi.

## Canlı fixture sonucu

Tracked iki exact identity process-local Wikimedia live kabulünde geçti:

| Fixture | JSON response | Full extract UTF-8 | Normalized karakter | Sonuç | Passage / packet karakteri | Model working set |
| --- | --- | --- | --- | --- | --- | --- |
| Steins;Gate | `<=64 KiB` | `<=24 KB` | `<=24.000` | `document_ready` | 5 / 4.648 | 16 unit / 2.529 karakter |
| IMDb fixture | `<=64 KiB` | `24–64 KiB` | `24.000–65.536` | `document_ready` | 3 / 3.367 | 16 unit / 2.332 karakter |

Ham sayfa metni veya URL query'si kaydedilmedi. İlk telemetry tekrarında Steins;Gate size ile ilgisiz transient `adapter_unavailable` verdi; aynı hard assertion ikinci tekrarda geçti. IMDb entity'sindeki çok sayıdaki non-primary sitelink metadata anahtarı, R3A'nın mevcut bounded-list contract'ına uygun biçimde sıralı ilk 32 anahtarla sınırlandı; exact external ID, QID, enwiki/trwiki ve revision doğrulaması etkilenmedi.

Steins;Gate end-to-end extraction regresyonu ayrıca mevcut compacted Groq runner ile geçti: beş attempt içinde üç valid response, üç grounding-valid `supported/significant`, iki ayrı `rate_limited` attempt ve sıfır grounding-invalid elde edildi.

## Section-aware kararı

Mevcut tracked anchor'larda `document_size_limit` kalmadığı için MediaWiki section-aware acquisition şu anda gerekli değildir. Gelecekte exact revision-bound bir extract `64 KiB` sınırını aşarsa fail-closed sonuç korunur ve section-aware tasarım ayrı audit gerektirir; bu aşama section parser veya fallback eklemez.
