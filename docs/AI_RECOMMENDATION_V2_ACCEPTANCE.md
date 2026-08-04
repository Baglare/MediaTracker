# AI Recommendation V2 — D6 Kabul Raporu

> Durum: D6-0–D6-5 kod ve sentetik sözleşme kapsamı tamamlandı. Bu ifade canlı provider/verifier kalite garantisi veya production-ready iddiası değildir.

## Kabul özeti

| Alan | Sonuç | Kod/test kanıtı |
|---|---|---|
| Domain | Kabul | 43 benzersiz registry kaydı; `unknown !== absent`; profile+must ve unsafe hard rol codec reddi; explicit must strictness'ten bağımsızdır. |
| Provider | Kabul | AniList sahipliği, recommendation-only TVMaze anime classifier, exact-ID linking ve verified identity gate fixture testleriyle korunur. Global Search/Release Calendar filtreden bağımsızdır. |
| Evidence | Kabul | Raw provider claim → bounded aggregation; tag rank strength değildir; structured/semantic claims ayrıdır; contradiction desteği silmez. |
| Ranking | Kabul | Hard eligibility soft boyutlardan önce; deterministic tuple + stable identity; en fazla 5 primary ve 3 ayrı near-match; LLM final reranking yoktur. |
| UI/feedback | Kabul | Parse → düzenle → öner; registry-driven editor; owner-scoped strictness/session/Feedback V2; exploratory-only near-match. |
| Privacy | Kabul | Interpret payload identity snapshot'ıyla sınırlı; recommendation personal alanları toggle ile minimize edilir; provider cache/verifier payload owner verisi taşımaz. |
| Performance bütçesi | Kabul | Enrichment top-N 8/concurrency 3/timeout 2500 ms; verifier top-N 8/concurrency 2/timeout 1800 ms; cache max 256. |
| D7 hazırlığı | Kabul | Version 1 evaluation codec'i, 15 sentetik contract seed'i ve saf metric matematik yardımcıları eklendi. |

## D6-5'te düzeltilen regresyonlar

- V2 request koleksiyonlarına makine-okunur üst sınırlar eklendi; unknown root/nested alanlar ve çelişkili objective constraint'ler reddedilir.
- Takip patch'i “Fantastik şart değil”, “Aşk üçgeni olabilir”, hedef tür değişimi, yayın durumu gevşetme, strictness gevşetme ve “Yeni konu” davranışlarını kapsar.
- Hedef medya türü değişince anlamsız length birimi kaldırılır; unresolved reference verified yapılmaz.
- V2 session codec, `structuredRequestV2` ve en fazla üç `nearMatches` öğesini doğrulayarak hydrate eder; V1 session okumayı sürdürür.
- Feedback V2 root/identity/metadata allowlist'i ve bounded aspect/constraint listeleri eklendi.
- Owner/reset değişiminde aktif recommendation isteği abort edilir; stale request ID guard'ı korunur.
- Interpret route kütüphanenin yalnız title/type/exact identity snapshot'ını alır. Recommendation payload rating/favorite/progress/note/profile tag toggle'larına göre küçültülür.

## Gizlilik ve owner izolasyonu

Provider evidence cache yalnız public metadata içerir; `ownerId`, `userId`, rating, favorite, progress, note ve feedback'i codec reddeder. Semantic verifier yalnız candidate identity/objective metadata/raw public claim allowlist'ini alır. Feedback V2 raw prompt veya title-only identity saklamaz. Owner değişimi eski state'i önce maskeler, aktif request'i abort eder ve yeni owner hydrate edilmeden taslak/sonuç göstermez.

## Doğrulama kaydı — 4 Ağustos 2026

- Otomatik: lint temiz geçti; 129 test dosyasının 124'ü geçti, 5'i koşullu olarak atlandı. Toplam 1619 testin 1585'i geçti, 34'ü atlandı. Production build ve `git diff --check` geçti. Tam suite'in ilk çalıştırmasında README'nin eski D5 contract assertion'ı tek hata verdi; D1-D5 ifadesi geriye uyumlu korunarak düzeltildi ve nihai suite hatasız tamamlandı.
- Gerçek local browser: doğal dil parse, structured summary, registry alias araması, klavyeyle aspect ekleme, must/prefer düzenleme, Dengeli seçimi, objective status label'ları, manga follow-up patch'i, “Yeni konu”, V2 session reload ve 5 viewport geçti.
- Viewport'lar: 1280×720, 1366×768, 1536×864, 1920×1080 ve 375×812; yatay overflow görülmedi. Console error/warning, hydration mismatch veya request loop görülmedi.
- Browser sonucu fixture/UI kabulüdür. Canlı provider sonucu olmadığı için gerçek near-match, feedback dialog, Quick Add ve Discover browser akışları canlı kabul olarak sayılmadı; unit/contract testleriyle sınırlı kaldı.
- `D6_PROVIDER_LIVE_SMOKE` tanımlı değildi; conditional provider/verifier smoke **skip** edildi. Hiçbir canlı provider/model/web/DB çağrısı yapılmadı.
- İkinci authenticated owner bulunmadığından live owner-switch senaryosu geçmiş sayılmadı; owner codec/state mask/abort regresyon kanıtı kullanıldı.

## Bilinen sınırlar ve D7 kapısı

Sentetik seed'ler sözleşme ve metric matematiğini doğrular; öneri kalitesini ölçmez. Aspect threshold, confidence ve ranking ağırlıkları ancak snapshot'lanmış provider örnekleri ve insan etiketli gold set ile D7'de değerlendirilebilir. D8 deployment, production provider secret/rate-limit, auth iki-owner ve production cutover kapıları bu kabulün dışındadır.

İlgili belgeler: [Mimari](AI_RECOMMENDATION_V2_ARCHITECTURE.md), [Domain](AI_RECOMMENDATION_V2_DOMAIN.md), [Provider](AI_RECOMMENDATION_V2_PROVIDER_ENRICHMENT.md), [Ranking](AI_RECOMMENDATION_V2_RANKING.md), [UI ve Feedback](AI_RECOMMENDATION_V2_UI_AND_FEEDBACK.md), [Evaluation](AI_RECOMMENDATION_EVALUATION_CONTRACT.md), [Manuel testler](AI_RECOMMENDATION_V2_MANUAL_TESTS.md).
