# AI Recommendation V2 Provider Enrichment

> Durum: D6-2 tamamlandı. Bu katman provider kimliği, ham yapılandırılmış evidence, recommendation-only TVMaze anime filtresi, exact-ID linking ve bounded public metadata cache sağlar. D6-3 consumer/aggregation ve final ranking de uygulanmıştır.

D6-5 regresyon sonucu için [D6 Kabul Raporu](AI_RECOMMENDATION_V2_ACCEPTANCE.md), ölçüm sınırı için [Evaluation Contract](AI_RECOMMENDATION_EVALUATION_CONTRACT.md) belgesine bakın.

## Klasör ve sınır

```text
features/recommendations/providers/
  types.ts                    # identity, objective metadata, snapshot ve telemetry
  candidate-identity.ts       # exact identity/link policy
  evidence-mappers.ts         # registry-driven raw claim mapping
  evidence-cache.ts           # bounded in-memory public metadata cache
  anilist-adapter.ts
  tvmaze-adapter.ts
  tmdb-adapter.ts
  omdb-adapter.ts
  openlibrary-adapter.ts
  pipeline.ts                 # recommendation-only orchestration
  tvmaze-anime-classifier.ts
```

Domain modülleri fetch/React/Next.js bağımlılığı taşımaz. Adapter katmanı provider normalizer tiplerini tüketir; ham upstream payload V2 domain'e sızmaz. `app/api/ai/recommend/route.ts` yalnız `prepareProviderEvidencePipeline` çağrısını yapar. Sidecar snapshot scorer'a, LLM prompt'una veya public recommendation response'una eklenmez.

## Candidate identity

`RecommendationCandidateIdentity`, `primaryProvider + primaryExternalId + mediaType` ile doğrulanır. `canonicalKey` yalnız bu exact kimlikten üretilir. Secondary ID namespace'leri `imdb`, `tmdb`, `tvmaze`, `anilist`, `openlibrary_work`, `openlibrary_edition`, `thetvdb`dır.

Güvenli bağlar:

- Aynı provider ve aynı external ID.
- TMDB movie ↔ OMDb: aynı IMDb ID.
- TMDB TV ↔ TVMaze: aynı IMDb veya TheTVDB ID.
- Open Library edition ↔ work: edition'ın exact work ilişkisi.

Başlık, yıl, yazar veya synopsis benzerliği identity değildir. Aynı exact köprü yanında çelişen başka exact ID varsa merge yapılmaz ve conflict telemetry üretilir. AniList anime ile TVMaze identity fusion yasaktır. Primary provider sırası filmde TMDB→OMDb, TV'de TVMaze→TMDB, Doğu medyasında AniList, kitapta Open Library'dir.

## Provider evidence snapshot

`CandidateProviderEvidenceSnapshot` şunları taşır:

- doğrulanmış candidate identity;
- format/status/yıl/dil/ülke/uzunluk/genre/keyword/tag/popularity/community score gibi objektif metadata;
- provider alanı, raw/normalized değer, reliability ve registry ile eşleşen aspect ID'lerini koruyan raw claim'ler;
- provider coverage, eksik alanlar, fetch/cache durumu ve warning'ler.

Snapshot bir `AspectEvidence` aggregation sonucu değildir. Reliability kaynak güvenilirliğidir; aspect strength/level değildir. Genre/tag/keyword bulunması `primary` veya `significant` üretmez. Bilinmeyen alias boş `mappedAspectIds` ile kalır. Kullanıcı rating/favorite/progress/not/feedback verileri snapshot ve cache contract'ında yoktur.

## Provider adapter'ları

### AniList

Search ve details GraphQL alanlarına backward-compatible `tags { id name rank category isGeneralSpoiler isMediaSpoiler isAdult }` eklendi. Mevcut title sırası, structured discover, adult filtresi ve anime/manga/manhwa/manhua sahipliği korunur. Genre, format, status, episode/chapter, ülke, score, popularity ve synopsis normalize sonuçta kalır. Tag rank yalnız provider relevance sinyalidir.

### TVMaze

Global search normalizer exact external ID'leri, show type, dil, network/webChannel ülke kodu ve tarihleri opsiyonel taşır; route filtre uygulamaz. Recommendation TV pipeline'ında:

- `Anime` genre → confirmed ve elenir;
- `Animation` + Japanese/JP → likely ve elenir;
- yalnız `Animation` elenmez;
- unknown sırf belirsizlikten elenmez.

Sayaçlar: `tvmaze_anime_excluded`, `tvmaze_anime_likely_excluded`, `tvmaze_anime_unknown`, `tvmaze_non_anime_kept`. Anime hedef planında TVMaze çağrısı yapılmaz. Global Search, TVMaze details/Quick Add ve Release Calendar classifier policy'sinden bağımsızdır.

### TMDB

Search route varsayılan movie davranışını korur; recommendation için backward-compatible `mediaType=tv` desteği vardır. Details route movie/TV için `external_ids,keywords` alır. Snapshot; genre, keyword, overview, original language, ülke, yıl, runtime/episode-season sayısı, vote/popularity ve exact IMDb/TheTVDB ID'lerini taşıyabilir. Token yokluğu veya partial details hatası fail-soft evidence unavailable sonucudur; keyword uydurulmaz.

### OMDb

OMDb filmde IMDb exact identity ve partial secondary evidence kaynağıdır. Genre/plot/runtime/rating TMDB alanlarını sessizce ezmez. Başlık tek başına bridge değildir; identity conflict merge edilmez.

### Open Library

Search normalizer work ID ile ilk exact edition ID'yi ayrı alanlarda korur. Author, subject, description availability, page/language/year/edition/ISBN metadata taşınır. Bounded work detail enrichment açıklamayı raw metadata claim olarak saklar; semantic aspect eşlemesi yapmaz. Aynı exact work içindeki edition'lar work seviyesinde gruplanabilir; Quick Add external ID'si work olarak korunur.

## Bounded enrichment ve cache

- En fazla `8` aday enrichment'a girer.
- Concurrency `3`, aday başına timeout `2500 ms`.
- In-memory cache en fazla `256` entry; schema version cache key'dedir.
- TTL: AniList/TMDB 6 saat, TVMaze 30 dakika, OMDb/Open Library 24 saat.
- Aynı key için request coalescing vardır; bozuk snapshot ve `user_feedback` claim'i reddedilir.
- Pipeline `getOrLoadWithStatus` kullanır; eşzamanlı aynı key tek promise'e coalesce edilir ve `coalescedRequests` telemetry'sinde ayrılır.
- Başarısız loader kalıcı negative-cache edilmez.
- Cache best-effort ve process-local'dır; kalıcı olduğu varsayılmaz. D3 Release Calendar cache'iyle paylaşılmaz.

## Fail-soft ve V1 compatibility

Enrichment hatası mevcut doğrulanmış adayı düşürmez; identity üretilemeyen external aday ise recommendation havuzuna alınmaz. Provider/raw hata ve token kullanıcıya açılmaz. D6-2'nin kendi üretim etkisi recommendation candidate hijyeni, TVMaze anime exclusion, TMDB TV discovery ve exact-ID dedupe'dur; D6-3 sonrasında snapshot'lar deterministik scorer tarafından tüketilir.

Conditional live smoke `D6_PROVIDER_LIVE_SMOKE=1` olmadan tamamen skip edilir. TMDB ve OMDb kontrolleri ayrıca ilgili env anahtarını gerektirir; DB veya mutation yapmaz.

D6.6-2 merkezi request budget provider başına timeout, attempts, concurrency, retryable status, Retry-After, candidate/enrichment/query üst sınırlarını taşır. 429 ve 5xx bounded retry; permanent 4xx no-retry; abort stale-request korumasıdır. Ayrıntı [D6.6-2 Reliability](AI_RECOMMENDATION_V2_D662_LIVE_PROVIDER_RELIABILITY.md).

## D6-3 consumer sözleşmesi

Raw snapshot'lar [`aggregation.ts`](../features/recommendations/evidence/aggregation.ts) tarafından `AspectEvidence` read-model'ine çevrilir; D6-2 reliability değerleri strength değildir. Authoritative pipeline, aynı snapshot/cache sonucunu [`runDeterministicRecommendationV2`](../features/recommendations/orchestration/deterministic-engine.ts) içine sidecar olarak verir ve duplicate enrichment çağrısı yapmaz. Ayrıntı [V2 Ranking](AI_RECOMMENDATION_V2_RANKING.md) belgesindedir.

## D6-4/D6-5 sonucu

- Editable constraint/strictness, reason-level feedback, ayrı near-match ve sade transparency D6-4'te bağlandı.
- Request/cache/privacy/fail-soft regresyon guardrail'leri D6-5 kabulünde doğrulandı.
