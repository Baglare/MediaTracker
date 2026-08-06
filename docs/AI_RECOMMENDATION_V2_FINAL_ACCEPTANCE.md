# Recommendation V2 — D6 Final Acceptance

Tarih: 6 Ağustos 2026

## Karar

D6 kod, fixture ve public-provider canlı contract kapıları bakımından kapatılabilir. Bu karar “production-ready AI”, genel öneri doğruluğu veya 21 aspect için tam query coverage iddiası değildir. Yalnız iki ranked-tag aspect doğrulanmış queryable mapping taşır; geri kalan boşluklar evidence-only veya semantic-confirmation olarak kalır.

## Kabul özeti

- 43 aspect ve `13 exact / 21 ranked / 9 semantic` dağılımı korunur.
- Türkçe morphology/false-positive, Romance/Fantasy exact taxonomy ve Politics ranked-tag regression'ları korunur.
- `ranked_tag_supported` yalnız canonical query mapping bulunan `political_intrigue` ve `revenge` için mümkündür.
- Structured hard constraint generic title, popularity veya LLM idea ile doldurulmaz.
- Request fit → evidence confidence → personal fit → quality → novelty → stable identity sırası değişmez; 20 tekrar deterministiktir.
- Semantic hard request verifier yoksa kontrollü capability validation üretir; kullanıcı aspect adı, kaynak desteği, tercihe çevir/kaldır ve yalnız mevcutsa verifier seçimi görür.
- Public live AniList, TVMaze ve Open Library geçti. TMDB/OMDb key olmadığı için kontrollü skip edildi.
- Standart test live flag olmadan network testini skip eder.
- DB/migration/RPC, Global Search, Release Calendar, kartlar ve D7 model yolu değişmedi.

## Doğrulama kaydı

- `npm run lint`: geçti.
- Standard `npm run test:run`: 136 dosya; 1.771 toplam, 1.735 pass, 36 koşullu skip. Live flag kapalıydı.
- Conditional provider live: 5 pass, 2 key-gated skip.
- `npm run build`: geçti.
- Browser smoke: üç viewport overflow/console temiz; Politics, Fantasy, character-driven ve Romance/love-triangle senaryoları çalıştırıldı.
- Markdown link, secret/scope ve `git diff --check` sonuçları final teslim raporuyla birlikte kaydedilir.

## Açık provider kapıları

- TMDB movie/TV details, keyword ve external ID canlı kontratı token bulunan ortamda çalıştırılmalı.
- OMDb exact IMDb ve TMDB↔OMDb same-ID bridge canlı kontratı key bulunan ortamda çalıştırılmalı.
- Provider taxonomy drift'i nedeniyle mapping listesi ancak repository contract + bounded live gözlem ile genişletilebilir.
- Provider-unavailable ve owner-switch browser fixture'ları bu koşuda çalıştırılmadı; ilgili fail-soft/abort contract testleri korunur.

## D7-0 giriş koşulları

Provider coverage matrisi ve live drift sonucu hazırdır; semantic-required aspect listesi sabittir; evaluation codec ve metric fonksiyonları mevcuttur. Veri/lisans audit'i, annotation guideline ve human-labeled gold set henüz başlamamıştır. D7 modeli final recommendation seçmeyecek, yalnız calibrated ordinal `AspectEvidence` ve abstain/unknown üretecektir.

İlgili belgeler: [D6.6-2 reliability](AI_RECOMMENDATION_V2_D662_LIVE_PROVIDER_RELIABILITY.md), [ranked-tag coverage](AI_RECOMMENDATION_RANKED_TAG_COVERAGE.md), [D7 planı](D7_ASPECT_VERIFIER_PLAN.md).
