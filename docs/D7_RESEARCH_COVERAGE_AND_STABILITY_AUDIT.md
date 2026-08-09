# D7-R5B Research Coverage and Stability Audit

## Kapsam ve yöntem

Audit yalnız tracked fixture'larda mevcut exact identity'leri ve mevcut Wikimedia/Groq hattını kullandı. Yeni title-to-ID mapping, source adapter, model fallback veya response repair eklenmedi. Ham source metni, passage, prompt ve provider response kaydedilmedi.

R5A terminolojisi `lead_only_document` olarak düzeltildi: `exintro=1` yalnız lead extract üretiyordu; kanıt lead dışındaydı ve full Steins;Gate belgesi 24 KB limitinin altındaydı.

## Groq three-run stability

| Packet | Schema valid | Grounding valid | Support | Invalid output | Provider unavailable | Sonuç |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Deterministic synthetic | 3/3 | 3/3 | 3/3 | 0 | 0 | Beklenen support kararlı |
| Real Steins;Gate R3A | 0/3 | 0/3 | 0/3 | 1 grounding-invalid | 2 rate-limited | Active rollout blocker |

Synthetic koşuları bir saniyenin altındaki duration bucket'ındaydı. İzole Steins;Gate koşusunda ilk çağrı 1–3 saniye bucket'ında grounding-invalid, sonraki iki çağrı bir saniyenin altında HTTP 429 olarak sınıflandı. Schema/grounding contract'ı gevşetilmedi ve invalid output onarılmaya çalışılmadı.

Bu eski aggregate tek bir semantik sınıf değildi: bounded tekrar ilk invalid'in `wrong_passage`, diğer iki denemenin HTTP 429 `rate_limited` olduğunu gösterdi. R5B.1 deterministic passage derivation, input compaction ve capacity-aware runner ile aynı packet'te üç grounding-valid sonuç elde etti ([R5B.1 audit](D7_EXTRACTION_STABILITY_AND_CAPACITY.md)).

## Wikimedia document coverage

Tracked gerçek identity kapsamı iki kayıtla sınırlıydı: AniList `9253` ve IMDb `tt0137523`. İki kayıtta da exact QID ve Wikipedia revision metadata çözüldü.

| Aggregate | Sonuç |
| --- | ---: |
| Vaka | 2 |
| Exact identity + page available | 2 |
| Document ready | 1 |
| 24 KB altı | 1 |
| 24 KB üstü fail-closed | 1 |
| Unavailable | 0 |
| Hazır packet passage/unit toplamı | 5 / 28 |

Steins;Gate `under_12kb` byte/character bucket'ında document-ready oldu. IMDb fixture'ının exact Wikipedia extract'i `over_24kb` sınıfında `wikipedia_extract_oversized` ile fail-closed kaldı. Raw uzunluk veya metin saklanmadı.

## Anchor ve source kararı

- Steins;Gate: source evidence ve passage hazır; extractor stability kapısı geçmedi.
- Kakegurui-like sentetik omission: claim yok, absence üretilmedi, karar `unknown/passage_insufficient`.
- Political intrigue, love triangle ve character-driven: tracked fixture'lar deterministic contract davranışını koruyor; ek live exact identity sağlamadıkları için gerçek Wikimedia coverage sonucu olarak sunulmadı.

Coverage kararı `insufficient_evidence_to_decide` olarak kalır. Mevcut veri yeni source expansion gereksinimini kanıtlamıyor; bir vaka extractor varyansı, diğer teknik blocker document-size limitidir. Fandom, Reddit, MAL, TMDB veya Trakt adapter'ı eklenmedi.

## Section-aware ve rollout kararı

Tracked IMDb identity 24 KB sınırının gerçek blocker olabildiğini gösterdi. Bununla birlikte exact QID/revision koruyan ve HTML/wikitext parser gerektirmeyen güvenli MediaWiki section yolu bu audit kapsamında doğrulanmadı. İkinci uygulama koşulu kapanmadığı için section-aware acquisition yazılmadı.

R5B.1 aynı real packet için grounding/capacity acceptance'ını kapattı. R5B.2 backlog'unda oversized exact-revision sayfaları için güvenli bounded acquisition contract'ı kalır. D6 authoritative kalır; active research kapalıdır.
