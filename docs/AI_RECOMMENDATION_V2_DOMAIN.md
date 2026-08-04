# AI Recommendation V2 Domain

> Durum: D6-1 domain sözleşmesi D6-5 kabulünden geçti. Provider/evidence/ranking/UI entegrasyonları tamamlandı; threshold kalibrasyonu D7'ye aittir.

## Klasör yapısı

```text
features/recommendations/
  domain/
    types.ts             # ortak enum/union tipleri ve codec result contract'ı
    aspect-registry.ts   # 43 aspect için tek doğruluk kaynağı
    aspect-strength.ts   # 0..1 strength ve merkezi level eşikleri
    constraints.ts       # aspect/objective constraint union'ları ve invariant'lar
    evidence.ts          # evidence claim ve AspectEvidence contract'ı
    providers.ts         # provider ownership/capability ve verified identity
    codec.ts             # registry, evidence, constraint ve request runtime codec'leri
    policies.ts          # strictness, eligibility, near-match ve length policy'leri
    index.ts              # domain public export yüzeyi
  providers/
    types.ts, candidate-identity.ts, evidence-mappers.ts, evidence-cache.ts
    anilist-adapter.ts, tvmaze-adapter.ts, tmdb-adapter.ts
    omdb-adapter.ts, openlibrary-adapter.ts, pipeline.ts
    tvmaze-anime-classifier.ts
  evaluation/
    types.ts, codec.ts, metrics.ts # D7 için üretim motorundan bağımsız sözleşme
```

Domain React, Next.js, localStorage ve provider fetch bağımlılığı taşımaz. TVMaze classifier yalnız provider raw tipini type-only olarak kullanır; ağ çağrısı veya filtre side effect'i yoktur.

## 43-aspect registry

[`aspect-registry.ts`](../features/recommendations/domain/aspect-registry.ts) 43 benzersiz kayıt içerir:

| Grup | Değer | Sayı |
|---|---|---:|
| Çekirdek | `core` | 13 |
| Tema/anlatı | `narrative` | 11 |
| İlişki | `relationship` | 5 |
| Ton/içerik | `tone_content` | 9 |
| Deneyim | `experience` | 5 |

Her kayıt Türkçe/İngilizce label ve alias, Türkçe açıklama, desteklenen V2 MediaType'ları, beş provider için explicit support seviyesi, must/avoid safety, semantic verifier gereksinimi ve gerekiyorsa kullanıcı notu taşır. `normalizeAspectAlias` ile alias eşlemesi deterministiktir. `validateAspectRegistry` aspect sayısı, ID, group, alias collision, MediaType, provider mapping completeness, support level ve safety/verifier invariant'larını doğrular.

Mevcut V1 regex'leri değiştirilmedi ve registry production intent/scoring'e bağlanmadı.

## Unknown ve absent

Tek eşik kaynağı [`aspect-strength.ts`](../features/recommendations/domain/aspect-strength.ts) dosyasıdır:

| Level | Strength |
|---|---|
| `primary` | `0.75–1.00` |
| `significant` | `0.50–0.749…` |
| `incidental` | `0.20–0.499…` |
| `absent` | `0.00–0.199…` |
| `unknown` | `null` |

`strengthToLevel`, NaN/Infinity/negatif/1 üzeri değerleri reddeder. Payload hem strength hem level taşıyorsa codec canonical level ile çelişkiyi reddeder. Unsupported veya eksik metadata otomatik sıfır/absent değildir. Başlangıç eşikleri D7 gold-label ölçümüyle kalibre edilebilir; başka modüllerde kopyalanmaz.

## Constraint contract'ı

Aspect constraint rolleri `must`, `prefer`, `avoid`; kaynakları `explicit`, `inferred`, `profile`dır.

- Must `minimumLevel`, avoid `rejectAtLevel` taşır; prefer eligibility'yi değiştirmez.
- `profile + must` geçersizdir. Profile yalnız prefer veya zorunlu `rationale` taşıyan avoid olabilir.
- Bilinmeyen aspect ID reddedilir.
- Aynı aspect'in birebir duplicate'i canonical olarak tekilleştirilir; farklı duplicate'ler conflict hatasıdır.
- Objektif constraint'ler registry dışında discriminated union'dır: `media_type`, `length`, `release_status`, `release_year`, `format`, `language`, `country`.
- Length birimleri `episode`, `chapter`, `page`, `minute`; operatörler `eq`, `lte`, `gte`, `between`dır. Negatif değer ve ters aralık reddedilir.
- Length/MediaType uyumu saf policy ile kontrol edilir.

## Strictness ve eligibility

[`policies.ts`](../features/recommendations/domain/policies.ts) tek aspect constraint/evidence çifti üzerinde karar verir; ranking veya popularity/personal-fit girdisi almaz.

- `strict`: explicit must unknown veya varsayılan high confidence şartını karşılamıyorsa primary sonuçtan elenir.
- `balanced`: explicit must korunur; iki bağımsız medium-confidence supporting claim kabul edilebilir. Düşük güvenli avoid yalnız risk üretir.
- `exploratory`: primary listede aynı must kuralı korunur. Must ihlali, güvenilir avoid ihlali yoksa ayrı near-match contract'ına girebilir.

`ConstraintDecision`, sonucu ve confidence/reason/warning bilgisini taşır. `CandidateEligibility` primary, near-match, failed must, triggered avoid ve unknown listelerini ayırır. Near match normal recommendation listesiyle ortak contract değildir ve must ihlalini açıklamada saklayamaz.

## Evidence domain'i

[`evidence.ts`](../features/recommendations/domain/evidence.ts) ve `decodeAspectEvidence` şu sınırları uygular:

- Structured kaynaklar: provider genre, tag rank, keyword ve metadata.
- Semantic kaynaklar: synopsis classifier, local semantic verifier ve remote LLM verifier.
- `user_feedback` yalnız `personal_fit` scope'undadır; provider metadata/AspectEvidence üretmez.
- Supporting ve contradictory claim'ler `sources` içinde bulunur ve aynı claim iki rolü birden alamaz.
- Contradiction supporting evidence'i silmez; aggregation D6-3'e bırakılmıştır.
- Boş supporting evidence high confidence üretemez.
- `hash/mock embedding` source kind değildir ve codec tarafından reddedilir.
- Unsupported provider/aspect eşleşmesi semantic kanıt yoksa sayısal level üretemez; `unknown` kullanır.

Bu aşamada evidence aggregation, persistence veya cache yazımı yoktur.

## Provider ownership ve identity

[`providers.ts`](../features/recommendations/domain/providers.ts) capability'leri `discovery`, `identity`, `objective_metadata`, `aspect_evidence`, `enrichment`, `secondary_verification` olarak ayırır.

- AniList: anime/manga/manhwa/manhua primary provider.
- TVMaze: anime dışı TV discovery ve operational metadata.
- TMDB: movie/TV discovery ve enrichment.
- OMDb: movie identity ve secondary verification; V2 primary discovery değildir.
- Open Library: book identity ve bibliographic metadata.

`createVerifiedRecommendationIdentity`, doğrulama false ise, external ID geçersizse veya provider/MediaType identity capability'si yoksa identity üretmez. Bu contract provider çağrısı yapmaz.

## Versioned request codec

`RecommendationRequestV2` yalnız `version: 2` kabul eder. Query mevcut ürün davranışıyla uyumlu olarak boş olamaz. Target MediaType duplicate'leri canonical olarak tekilleştirilir; boş liste henüz intent tarafından çözülmemiş genel hedefi temsil edebilir.

Verified reference için `provider + externalId + mediaType + titleSnapshot` zorunludur. Yalnız doğal dil başlığı `state: unresolved` olarak ayrı tutulur ve verified identity gibi kullanılamaz. Unknown alanlar ve malformed constraint'ler varsayılanlara çevrilmeden stabil issue code'larıyla reddedilir.

## TVMaze anime classifier

[`tvmaze-anime-classifier.ts`](../features/recommendations/providers/tvmaze-anime-classifier.ts) saf ve deterministiktir. [`TvmazeRawShow`](../lib/tvmaze-types.ts) gerçek API alanı için yalnız `type?: string | null` ile genişletildi; normalize route değişmedi.

- Genre `Anime` → `confirmed_anime`, high confidence, recommendation TV için exclude.
- `Animation` ve `Japanese` veya JP network/webChannel → `likely_anime`, medium confidence, exclude.
- `Animation + English + US` gibi açık Batı sinyali → `non_anime`, tutulur.
- Yalnız `Animation` veya yetersiz metadata → `unknown`, sırf belirsizlikten elenmez.

`tvmaze_anime_excluded`, `tvmaze_anime_likely_excluded`, `tvmaze_anime_unknown`, `tvmaze_non_anime_kept` recommendation debug telemetry'sine D6-2'de bağlandı. Filtre yalnız `prepareProviderEvidencePipeline` içindedir; global search route'u, details akışı ve release calendar davranışı değişmedi.

## V1 compatibility sınırı

- [`lib/ai/types.ts`](../lib/ai/types.ts) V1 public contract olarak kaldı.
- [`app/api/ai/recommend/route.ts`](../app/api/ai/recommend/route.ts), V1 intent, candidate search ve scorer'lar değiştirilmedi.
- [`components/ai-advisor.tsx`](../components/ai-advisor.tsx) yalnız birebir aynı `AiSettings` ve `AiRecommendation` tiplerini type-only import eder. Runtime shape, prop veya response mapping değişmedi.
- V2 constraint/strictness/near-match tipleri `features/recommendations/ui` ve versioned owner state'e bağlandı. V1 session/response alanları additive olarak okunmaya devam eder.

## D6-4 runtime bağlantıları

- `POST /api/ai/interpret`: retrieval yapmadan version 2 taslak üretir veya clarification döndürür.
- `/api/ai/recommend`: `structuredRequestV2` varsa codec ile doğrular ve message yerine domain kararlarını kaynak alır.
- `RecommendationFeedbackEventV2`: exact identity ve reason scope zorunluluklarını codec ile korur; V1 feedback ayrı compatibility dizisinde kalır.
- `nearMatches`: yalnız exploratory sonuç read-model'idir ve primary önerilerden ayrıdır.

## D6-2 provider katmanı ve D6-3 sınırı

- AniList tag rank, TMDB movie/TV keyword/external ID, OMDb secondary evidence ve Open Library work/edition metadata adapter'ları eklendi.
- `CandidateProviderEvidenceSnapshot` aggregation öncesi raw claim sidecar'ıdır; public response ve V1 scorer'a sızmaz.
- Exact identity link'leri ve bounded public metadata cache [Provider Enrichment](AI_RECOMMENDATION_V2_PROVIDER_ENRICHMENT.md) belgesinde tanımlıdır.
- Aspect aggregation, hard filters ve authoritative deterministic ranking D6-3'te; editable request/Feedback V2 D6-4'te; bounded request/session/privacy regresyonları D6-5'te tamamlandı.

D6 kapanış kanıtı [AI Recommendation V2 Acceptance](AI_RECOMMENDATION_V2_ACCEPTANCE.md), D7 fixture/metric sözleşmesi [AI Recommendation Evaluation Contract](AI_RECOMMENDATION_EVALUATION_CONTRACT.md) belgesindedir.
