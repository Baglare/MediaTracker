# D7-R5B.1 Extraction Stability and Capacity

## Düzeltilmiş R5B sınıflandırması

Eski Steins;Gate 3-run sonucu tek bir semantik sınıf değildi. Bounded failure-code tekrarı şunu doğruladı:

- Strict-schema response sonrası grounding failure: `wrong_passage`.
- Diğer iki deneme: HTTP 429 `rate_limited`; model/grounding sonucu değil.

Bu nedenle eski aggregate `source_contains_evidence_but_extractor_varies` olarak kesinleştirilemez. Stability metriğine yalnızca strict-schema ve grounding-valid model cevapları girer; capacity denemeleri ayrı sayılır.

## Minimal grounding düzeltmesi

Claim-bearing assessment'larda passage/citation ilişkisinin authority'si evidence unit ID'dir. Modelin tekrar ürettiği passage ID, cited unit'lerin tek exact passage'undan deterministik olarak türetilir. Birden çok passage'a yayılan, unknown, citation-mismatch veya security-excluded unit referansları all-or-nothing reddedilmeye devam eder.

Groq strict schema, current request'te gönderilen unit ve passage ID'lerini dynamic enum allowlist olarak taşır. Decoder duplicate unit/assessment ve invalid finding kombinasyonlarını reddetmeye devam eder. Eser, title veya anime hardcode'u eklenmedi. Extraction policy version `d7-r5b1.extract.1` oldu.

## Deterministic input compaction

Provider working set'i packet'i değiştirmez. Güvenli unit'leri şu sırayla seçer:

1. lexical-relevance passage unit'leri,
2. lead-coverage context unit'leri,
3. distributed-coverage unit'leri.

Hard sınır 16 unit ve 6.000 evidence karakteridir. Aynı packet aynı ordered working set'i üretir; security-excluded unit geri alınmaz. Gerçek Steins;Gate packet'i 28 unit / 4.625 karakterden 16 unit / 2.529 karaktere indi. 13 lexical unit ve 3 lead-context unit korundu.

## Rate-limit ve capacity telemetry

Groq 429 artık `rate_limited` status'udur; `provider_unavailable`, `output_invalid` veya `grounding_invalid` değildir. Client `retry-after`, remaining request/token ve request/token reset header'larını bounded internal telemetry olarak decode eder. Existing tek HTTP retry ve en fazla 1 saniyelik `Retry-After` beklemesi korunur.

Live stability runner concurrency 1, en fazla 5 attempt ve 120 saniye wall budget kullanır. Capacity beklemesi bounded reset metadata'sından türetilir ve tek beklemede 30 saniyeyi aşmaz. Header, key, error body veya model response public/persistent olmaz.

## Live aggregate

| Packet | Attempts | Valid grounded responses | Support | No claims | Grounding invalid | Output invalid | Rate limited | Capacity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Synthetic | 4 | 3 | 3 | 0 | 0 | 0 | 1 | ready |
| Steins;Gate exact revision | 5 | 3 | 3 | 0 | 0 | 0 | 2 | ready |

Steins;Gate'in üç geçerli kararı da `supported/significant` oldu. Bu sonuç aspect için genel model garantisi değildir; aynı packet üzerindeki bounded stability kabulüdür.

## Kalan sınırlar

R5B.2, 24 KB üstü exact-revision belgeler için bounded section-aware acquisition backlog'udur ve bu aşamada uygulanmadı. Production active research kapalı, D6 authoritative ve public response değişmezdir.
