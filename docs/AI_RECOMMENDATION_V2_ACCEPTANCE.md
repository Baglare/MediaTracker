# AI Recommendation V2 — D6 Kabul Raporu

> Durum: D6-0–D6.6-1R kod ve sentetik sözleşme kapsamı tamamlandı; D6.6-2 live provider reliability ve final D6 kabulü bekleniyor. Bu ifade canlı provider/verifier kalite garantisi veya production-ready iddiası değildir.

## Kabul özeti

| Alan | Sonuç | Kod/test kanıtı |
|---|---|---|
| Domain | Kabul | 43 benzersiz registry kaydı ve evidence strategy; `unknown !== absent`; profile+must codec reddi; capability-unsafe hard rol server policy ile kontrollü reddedilir. |
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

## D6-5.2 ek kabul — 5 Ağustos 2026

- Romance claim hattı trace edildi: parser → approved request → AniList Romance discover → genre/tag claim → aggregation → eligibility zinciri fixture'larla doğrulandı.
- Genre-only Romance `significant/medium`; genre + orta tag `significant/high`; genre + yüksek tag `primary/high`; low tag-only `incidental`; claim yoksa `unknown` üretir.
- Balanced registry-strong structured genre baseline'ını kabul eder; Strict medium confidence'ı kabul etmez. Popularity/community/personal fit must ihlalini telafi etmez.
- UI primary/significant minimum seviyesini Türkçe ve editable gösterir; legacy/session missing level `significant` canonicalize edilir.
- Interpret mesajın tek history sahibidir. Production browser parse ve reload boyunca mesaj bir kez göründü; aynı metin yeni stable ID ile tekrar yazılabilir.
- Primary/near-match ortak header kullanır; near-match fixture'ı ihlal ve confidence read-model'ini raw code/score göstermeden taşır.
- Lint, build ve `git diff --check` temiz; 1646 testin 1612'si geçti, 34 koşullu test skip. Beş viewport'ta overflow ve console error görülmedi.
- `D6_PROVIDER_LIVE_SMOKE` kapalıydı; live provider trace ve live near-match kalite kabulü skip edildi. Bu durum D7 kalite kalibrasyonunu ikame etmez.

## D6-5.3 ek kabul — 5 Ağustos 2026

- Romance'a özel structured genre tabanı registry-driven `core + strong provider support + exact genre` policy'sine genelleştirildi; 13 core aspect sentetik fixture'larla aynı contract altında doğrulanır.
- Fantasy genre-only `significant/medium`; genre + orta tag `significant/high`; genre + güçlü tag `primary/high`; düşük tag-only `incidental`; claim yoksa `unknown` üretir.
- Niche aspect koruması Fantasy/Romance/Drama/Action genre claim'lerinin `political_intrigue`, `love_triangle`, `fanservice` veya `character_driven` için significant taban üretmesini engeller.
- Open Library subject evidence artık `provider_keyword` / `field=subjects` taşır; subject exact provider genre veya otomatik strong baseline değildir. OMDb partial genre primary üretmez.
- Engine status planning provider/policy/fallback bilgisini deterministic final engine'den ayrı taşır. Fixed provider ortamında OpenAI tercihi uygulanmaz ve UI bunu açıkça gösterir; final ranking her durumda Deterministik V2'dir.
- Lint ve production build geçti. Tam pakette 132 test dosyasının 127'si geçti, 5'i koşullu skip; 1.673 testin 1.639'u geçti, 34'ü skip edildi.
- Yerel browser smoke `AI_PROVIDER=auto` ile Fantasy taslağı, editable must/significant, OpenAI kontrolü ve 1366×768, 1536×864, 375×812 overflow/console kontrolünü geçti. Candidate retrieval çalıştırılmadı; fixed-provider browser senaryosu ortam sabit olmadığı için unit/contract kanıtıyla sınırlıdır.
- `D6_PROVIDER_LIVE_SMOKE` kapalı olduğundan live provider trace skip edildi; bu sentetik kabul canlı recommendation kalite kabulü değildir.
- Ayrıntılı kanıt ve smoke kaydı [D6-5.3 Core Genre Kalibrasyonu](AI_RECOMMENDATION_V2_D653_CORE_GENRE_CALIBRATION.md) belgesindedir.

İlgili belgeler: [Mimari](AI_RECOMMENDATION_V2_ARCHITECTURE.md), [Domain](AI_RECOMMENDATION_V2_DOMAIN.md), [Provider](AI_RECOMMENDATION_V2_PROVIDER_ENRICHMENT.md), [Ranking](AI_RECOMMENDATION_V2_RANKING.md), [UI ve Feedback](AI_RECOMMENDATION_V2_UI_AND_FEEDBACK.md), [Evaluation](AI_RECOMMENDATION_EVALUATION_CONTRACT.md), [Manuel testler](AI_RECOMMENDATION_V2_MANUAL_TESTS.md).

## D6.6-1 ek kabul — 6 Ağustos 2026

- Registry'nin 43 kaydının tamamı strategy sahibidir: 13 exact taxonomy, 21 ranked tag, 9 semantic required; provider override çözümü her provider için deterministiktir.
- Türkçe NFKC/locale/apostrophe/token normalizer ve longest-match registry phrase matcher kontrollü ek fixture'larını ve false-positive korumalarını geçer.
- Explicit hard constraint sessizce prefer'e düşürülmez. Interpret capability read-model taşır; recommendation route policy'yi yeniden doğrular ve unsupported hard role için raw 500 yerine kontrollü 422 üretir.
- AniList ranked-tag bantları, duplicate/contradiction, TMDB keyword ve Open Library subject policy'leri sentetik contract testleriyle doğrulanır. Missing evidence absent değildir; popularity/community aspect evidence değildir.
- D6-5.2 Romance ve D6-5.3 Fantasy exact-taxonomy davranışı korunur.
- Deterministik tuple evidence confidence'ı personal fit'in önüne alır; weighted explicit coverage requestFit/read-model'e girer, yüzde-50 hard gate eklenmez.
- Yeni model/provider/dependency eklenmedi; D7 model planı [D7 Aspect Verifier Planı](D7_ASPECT_VERIFIER_PLAN.md) içinde belgelendi. Legacy ML dosyaları silinmedi veya authoritative V2 yoluna bağlanmadı.
- `D6_PROVIDER_LIVE_SMOKE` çalıştırılmadı. Canlı provider drift/rate-limit/latency ve final D6 kabulü D6.6-2 blocker'ıdır.
- D6.6-1 doğrulaması: `npm run lint` geçti; standard `npm run test:run` 134 dosyada 1.731 test keşfetti, 1.697 geçti ve 34 koşullu test skip edildi; `npm run build`, Markdown link contract'ı ve `git diff --check` geçti. D6.6-1 kaynak değişikliği 59 yeni test case ekledi.

## D6.6-1R ek kabul — 6 Ağustos 2026

- Read-only audit, initial retrieval'ın onaylı `structuredRequestV2` yerine provider title planıyla başladığını ve narrative ranked-tag aspect'lerin AniList discover filtresine girmediğini doğruladı.
- Registry canonical provider retrieval mapping'i UI label/alias'tan ayrıdır. Political intrigue AniList `Politics`, revenge `Revenge` tag'ini kullanır; 43 ID ve `13/21/9` strategy dağılımı değişmez.
- Explicit ranked-tag must strict `40`, yetersizse aynı tag ile relaxed `20` pass'ine gider. Mapping missing, no-candidate ve provider-unavailable durumlarında generic title/source/web fallback ile havuz doldurulmaz.
- Requested tag pass'i veya enrichment evidence'i olmayan title-only/popularity adayları ranked-tag pool gate'inde elenir. Missing tag absent değildir; quality/community tag evidence değildir.
- Çoklu ranked-tag must bounded ayrı pass union'ı kullanır; bütün must'lar post-evidence hard eligibility'de zorunludur. Deterministik ranking tuple ve LLM-final-ranking=false değişmez.
- Koşullu live smoke sabit başlık/ilk sonuç/rank/count assertion'ı kullanmadan canonical tag, strict/relaxed rank, finite evidence ve identity kontrol eder. Flag kapalıysa skip sonucu açıkça raporlanır.
- Ayrıntılı sözleşme ve test matrisi [D6.6-1R Ranked-Tag Retrieval](AI_RECOMMENDATION_V2_D661R_RANKED_TAG_RETRIEVAL.md) belgesindedir.
- D6.6-1R doğrulaması: `npm run lint` ve `npm run build` geçti; standard `npm run test:run` 135 dosyada 1.756 test keşfetti, 1.721 geçti ve 35 koşullu test skip edildi. Yeni paket 24 sentetik test ve flag-gated 1 live smoke case ekledi. Markdown link contract'ı ile `git diff --check` geçti. `D6_PROVIDER_LIVE_SMOKE` etkin olmadığı için gerçek provider ve browser sonuç smoke'u çalıştırılmadı; D6.6-2 blocker'ı olarak kaldı.

## D6.6-2 final provider kabulü — 6 Ağustos 2026

- Önceki TVMaze canlı hatası classifier değil, ambiguous `One Piece` singlesearch first-result ve `genres` içinde `Animation` bekleyen kırılgan test varsayımıydı. Test metadata invariant'ına geçirildi; threshold/classifier değiştirilmedi.
- 21 ranked-tag aspect × 5 provider coverage read-model'i eksiksizdir. Queryable canonical mapping yalnız `Politics` ve `Revenge`; 10 aspect evidence-only, 9 aspect semantic confirmation gerektirir.
- Merkezi timeout/retry/Retry-After/request-count budget, provider request telemetry, recommendation-only malformed-record recovery ve schema-drift unavailable ayrımı eklendi.
- Public live contract paketi AniList, TVMaze ve Open Library için geçti; TMDB/OMDb anahtar olmadığı için kontrollü skip edildi.
- Cache max 256/TTL/schema key/negative-cache yasağı korunur; pipeline eşzamanlı enrichment için gerçek coalescing yolunu kullanır.
- Ayrıntılı karar [D6 Final Acceptance](AI_RECOMMENDATION_V2_FINAL_ACCEPTANCE.md), coverage [Ranked-Tag Coverage](AI_RECOMMENDATION_RANKED_TAG_COVERAGE.md), canlı kanıt [D6.6-2 Reliability](AI_RECOMMENDATION_V2_D662_LIVE_PROVIDER_RELIABILITY.md) belgelerindedir.
