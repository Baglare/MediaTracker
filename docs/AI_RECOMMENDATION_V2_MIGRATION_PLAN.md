# AI Recommendation V2 Migration Plan

> Durum: D6-0 audit ve karar planı. D6 geliştirmesi başlamamıştır; bu belge rollout, migration veya üretim değişikliği yapmaz.

## Dönüşüm ilkeleri

- Big-bang rewrite yapılmaz. Her alt aşama mevcut public request/response contract'ını compatibility adapter ile korur ve uygulamayı çalışır bırakır.
- Provider identity ve objektif/must filtreler skorlamadan önce uygulanır. Bir must ihlali popularity veya personal fit ile telafi edilmez.
- Deterministik scorer son kararı verir. D6 baseline'ında LLM reranking yoktur.
- Structured provider evidence her zaman temel katmandır. Model yokluğu hata değil, daha düşük confidence/`unknown` modudur.
- Provider metadata ile kullanıcı profili/feedback'i farklı read-model ve cache sınırlarında tutulur.
- Aşamalar feature flag veya shadow comparison gerektirirse mevcut davranış varsayılan kalır; görünür davranış ancak ilgili aşamanın acceptance gate'iyle değiştirilir.

## Aşama özeti

| Aşama | Ana çıktı | Üretim davranışı |
|---|---|---|
| D6-0 | Audit, taxonomy, evidence, mimari ve ölçüm sözleşmeleri | Değişmez; tamamlandı. |
| D6-1 | Ortak domain/codec/registry ve compatibility contract'ları | Minimum; mevcut sonuç sırası korunur. |
| D6-2 | Provider enrichment, TV anime exclusion, evidence read-model/cache | Yalnız açık policy ve provider adaptörü acceptance'ı sonrası. |
| D6-3 | Aggregation, hard filter, deterministik ranking ve grounded explanation | V2 ranking baseline devreye alınır. |
| D6-4 | Düzenlenebilir constraints, strictness, reason feedback, near-match UI | Kullanıcı kontrolü ve şeffaflık açılır. |
| D6-5 | Regresyon, live smoke, performans, docs ve D7 fixture hazırlığı | D6 stabilizasyonu. |
| D7 | Offline kalite değerlendirmesi, kalibrasyon ve karşılaştırmalı deneyler | D6 baseline ölçülmeden model/LLM deneyi üretime alınmaz. |

## D6-1 — Ortak domain ve compatibility temeli

**Giriş koşulları**

- D6-0 belgeleri onaylı; 43 aspect ID'si, provider ownership ve strictness semantiği dondurulmuş olmalı.
- Mevcut `AiRecommendRequest`/`AiRecommendResponse` snapshot/contract fixture'ları oluşturulmalı.

**Çıktı**

- `features/recommendations/domain` altında ortak `MediaType`, constraint, strictness, evidence, score-breakdown ve public read-model tipleri.
- Registry-driven aspect sözleşmesinin TypeScript karşılığı; synonym ve provider mapping tek yerde.
- Client/server `AiSettings` ve recommendation type tekrarlarını kaldıracak ortak import; geçici re-export adapter'ları.
- Versioned intent codec: eski `RecommendationIntent` yeni constraint listesine kayıpsız/işaretli dönüşür.
- TVMaze anime classifier için saf input/output contract'ı ve fixture'lar; henüz recommendation filtresine bağlanmaz.
- Public response ile internal retrieval/debug trace'in ayrı tipleri.

**Test türleri**

- Typecheck; registry ID uniqueness ve schema testleri; codec round-trip; contract snapshot; classifier table-driven unit test.
- Mevcut route çıktısında seçilen candidate/order değişmediğini gösteren karakterizasyon testleri.

**Riskler**

- Client/server serialization farkı; eski localStorage feedback kayıtlarının kırılması; aynı ismin farklı anlamda kullanılması.

**Scope dışı**

- Provider çağrısı/enrichment, gerçek filtreleme, yeni scorer, UI, cache persistence, model entegrasyonu.

## D6-2 — Provider enrichment ve evidence read-model

**Giriş koşulları**

- D6-1 domain contract'ları ve compatibility testleri geçmeli.
- Her provider için raw → normalized → evidence alan kaybı fixture ile görünür olmalı.

**Çıktı**

- AniList tag ve tag rank/relevance; ilişkiler ve gerekli identity metadata'sı.
- TMDB film/TV discovery ayrımı, genres, keywords, language/country, runtime/episode ve vote/popularity alanları.
- TVMaze `show.type`, language ve network/webChannel country korunması; yalnız recommendation TV havuzunda anime exclusion ve `tvmaze_anime_excluded` sayacı.
- Open Library work/edition, author, subjects, description availability, page/ISBN/language kanıtlarının kayıpsız read-model'i.
- TMDB↔OMDb ve TVMaze↔TMDB cross-provider identity link'leri; unresolved conflict durumu.
- Provider metadata evidence cache/read-model. Önerilen invalidation: provider+externalId+schemaVersion anahtarı, alan bazlı `fetchedAt`, TTL ve schema bump; status/episode gibi hareketli alanlar kısa, work/author gibi durağan alanlar uzun TTL. Kullanıcı verisi ayrı kalır.

**Test türleri**

- Kaydedilmiş provider fixture'larıyla normalizer/adapter contract testleri; missing-field ve identity-conflict testleri.
- TVMaze definite/probable/western-animation tablosu; global search ve calendar çıktısının filtreden etkilenmediği regresyon testi.
- Yetkili ortamda sınırlı provider live smoke; rate-limit ve fallback telemetry kontrolü.

**Riskler**

- Provider schema/rate-limit değişimi; TMDB-TV ile TVMaze eşleşme yanlışları; anime false positive/negative; cache staleness.

**Scope dışı**

- Deterministik V2 ranking, editable constraint UI, semantic model seçimi, DB migration. Cache persistence gerekiyorsa ayrıca veri/saklama kararı alınmadan DB'ye yazılmaz.

## D6-3 — Evidence aggregation ve deterministik ranking

**Giriş koşulları**

- D6-2 provider evidence contract testleri ve identity hijyen gate'i geçmeli.
- Aspect registry/provider matrix sürümlenmiş olmalı.

**Çıktı**

- `AspectEvidence` aggregation: provider/verifier kaynakları ayrı, çelişki confidence düşürür, unsupported → `unknown`.
- Sıralı hard pipeline: identity/hijyen → media/objective → must aspects → avoid policy.
- Ayrı `requestFit`, `personalFit`, `evidenceConfidence`, `qualitySignal`, `novelty`, `diversityContribution` boyutları ve deterministik sort key.
- Exact-item feedback ile aspect-level reason feedback'in domain ayrımı; dismissed source/type için kör cezanın kaldırılması.
- Franchise/season diversity rerank; kalite yoksa sonuç sayısını zorla 5'e doldurmama.
- Grounded explanation builder; yalnız `supportingEvidence` ve warning'lerden açıklama.
- Mock/hash embedding'in semantic score'dan açıkça çıkarılması. Gerçek model yoksa embedding contribution `0`.
- Mevcut LLM ranking devre dışı; LLM yalnız intent/clarification/açıklama diline izin verilen sınırda.

**Test türleri**

- Hard-constraint invariant/property testleri; deterministic ordering; confidence cap; evidence conflict; feedback scope; duplicate/franchise fixture'ları.
- Mevcut örnek isteklerle golden candidate/filter/reason testleri ve güvenli fallback testleri.

**Riskler**

- Coverage düşüşü; overly strict unknown politikası; eski additive scorer ile sonuç farklılığı; yetersiz cross-provider dedupe.

**Scope dışı**

- Editable UI, LLM reranking, model eğitimi/indirme, otomatik threshold optimizasyonu.

## D6-4 — Kullanıcı kontrolü ve şeffaflık

**Giriş koşulları**

- D6-3 hard-filter/ranking invariants sabit; public/internal read-model ayrımı tamamlanmış olmalı.

**Çıktı**

- Parse edilen constraint'leri öneri çalışmadan önce düzenleme: `must`, `prefer`, `avoid`, source ve eşik.
- `strict`, `balanced`, `exploratory` seçimi; explicit must her modda korunur.
- Exploratory near-match sonuçları normal scored listeden ayrı; ihlal ve unknown alanları görünür.
- Exact item ve aspect/reason düzeyinde feedback; engine status gerçek `structured_only`, `local_enhanced`, `remote_enhanced` modunu gösterir.
- Grounded reason, evidence confidence ve veri eksikliği için sade public transparency; internal trace ayrıdır.

**Test türleri**

- Reducer/component testleri; request codec; accessibility; local-state geriye uyumluluk; near-match ayrım ve reason feedback testleri.
- Hedefli kullanıcı akışı smoke'u; tam E2E yalnız ayrıca planlanır.

**Riskler**

- UI karmaşıklığı; teknik confidence dilinin kullanıcıyı yanıltması; eski feedback event'lerinin dönüşümü.

**Scope dışı**

- LLM reranking, otomatik kişisel must üretimi, kişisel notların remote verifier'a gönderilmesi.

## D6-5 — Stabilizasyon ve D7 hazırlığı

**Giriş koşulları**

- D6-1–D6-4 acceptance kriterleri ve regression fixture'ları geçmeli.

**Çıktı**

- Provider/intent/ranking regresyon paketi; yetkili ortamda provider live smoke ve fallback senaryoları.
- Candidate count, retrieval, verification ve verifier top-N için latency bütçesi; rate-limit/maliyet guardrail'leri.
- Contract/docs güncellemesi; engine status ve debug privacy kontrolü.
- D7 fixture ve gold-label formatı; evaluation runner'a giriş sözleşmesi. D7 skorları/kalibrasyonu bu aşamada üretilmez.

**Test türleri**

- Hedefli unit/integration, provider contract/live smoke, performans bütçesi, failure injection, privacy/security review.

**Riskler**

- Fixture drift; canlı provider dalgalanması; latency ve rate-limit; gold label tutarsızlığı.

**Scope dışı**

- D7 model karşılaştırması, LLM rerank deneyi, A/B rollout, deployment ve DB migration.

## Semantic verifier operasyon sözleşmesi

| Mod | Çalışma | Veri sınırı | Timeout/fallback | Maliyet/rate-limit |
|---|---|---|---|---|
| `structured_only` | Her zaman provider evidence | Provider metadata | Verifier yok; unknown korunur | Provider limitleri dışında model maliyeti yok |
| `local_enhanced` | Yalnız belirsiz top-N synopsis/aspect classification veya gerçek embedding | Cihaz içi Python service; profil/not gerekmez | Kısa timeout; structured-only'e düşer | Top-N ve concurrency sınırı; model yoksa normal durum |
| `remote_enhanced` | Opsiyonel JSON evidence verifier | Yalnız candidate metadata; kişisel not varsayılan gönderilmez | Timeout/rate-limitte structured-only; confidence düşer | İstek/candidate/token bütçesi, günlük limit ve cache |

Verifier başlık/candidate üretmez ve provider evidence'ı sessizce ezmez. Uydurma semantic score yoktur. Local mock/hash yalnız test fixture'ı olabilir; engine status bunu gerçek semantic mod gibi göstermez.

## D7 değerlendirme sözleşmesi

### Metrikler

| Metrik | Tanım |
|---|---|
| Candidate verification rate | Provider kimliği doğrulanmış candidate / retrieval candidate |
| Hard-constraint violation rate | Normal sonuçlarda gold explicit must ihlali / değerlendirilen sonuç |
| Aspect precision | Aspect `significant+` tahminlerinin gold karşılığı; aspect/provider/MediaType kırılımı |
| Precision@K | İlk K sonuçta gold relevant oranı |
| NDCG@K | Dereceli relevance ve sıra kalitesi |
| Unsupported explanation rate | Açıklamadaki iddianın supporting evidence taşımama oranı |
| Hallucinated/unverified title rate | Provider identity'siz gösterilen eser oranı; hedef sıfır |
| Coverage | En az bir normal sonuç döndüren geçerli istek oranı |
| Provider coverage | Provider/MediaType başına doğrulanmış candidate ve sonuç dağılımı |
| Diversity | Tür/aspect/provider/creator çeşitliliği; tek franchise yoğunluğu ayrıca raporlanır |
| Duplicate/franchise rate | Aynı eser kimliği veya franchise/season tekrar oranı |
| Feedback acceptance/add rate | Gösterim başına olumlu geri bildirim ve kitaplığa ekleme |
| Latency | p50/p95/p99 toplam ve retrieval/evidence/verifier/ranking aşamaları |
| Provider/model fallback rate | Provider ve verifier moduna göre fallback/timeout/unavailable oranı |

Acceptance eşikleri D7 dataset'i oluşmadan bu belgede uydurulmaz. D6 telemetry alanları, payda ve kırılımları üretebilecek şekilde tasarlanır.

### Fixture ve gold-label şekli

```json
{
  "fixtureVersion": 1,
  "requestId": "anime-romance-short-001",
  "locale": "tr-TR",
  "request": "Güçlü romantizmi olan, 13 bölümden kısa fantastik anime öner; aşk üçgeni olmasın.",
  "profileFixtureId": "profile-neutral-v1",
  "expectedConstraints": [
    { "field": "mediaType", "operator": "eq", "value": "anime", "kind": "must", "source": "explicit" },
    { "field": "aspect", "aspectId": "romance", "minimumLevel": "significant", "kind": "must", "source": "explicit" },
    { "field": "episodes", "operator": "lte", "value": 13, "kind": "must", "source": "explicit" },
    { "field": "aspect", "aspectId": "fantasy", "minimumLevel": "significant", "kind": "prefer", "source": "explicit" },
    { "field": "aspect", "aspectId": "love_triangle", "minimumLevel": "significant", "kind": "avoid", "source": "explicit" }
  ],
  "candidateLabels": [
    {
      "provider": "anilist",
      "externalId": "123",
      "identityVerified": true,
      "relevance": 3,
      "normalEligible": true,
      "mustViolations": [],
      "aspectGold": {
        "romance": { "level": "primary", "confidence": "high", "evidenceRefs": ["anilist:tag:Romance:88"] },
        "love_triangle": { "level": "absent", "confidence": "medium", "evidenceRefs": ["review:label:42"] }
      },
      "franchiseKey": "fixture-franchise-a",
      "notes": "Gold label gerekçesi; kişisel kullanıcı verisi içermez."
    }
  ]
}
```

Gold label'lar en az iki değerlendirici veya uyuşmazlık çözümü, provider snapshot tarihi/sürümü ve evidence referansı taşır. Train/tune/test ayrımı request/franchise sızıntısını engeller. Kişisel üretim verisi fixture'a kopyalanmaz.

## D6 ve D7 sınırı

- **D6:** domain, provider evidence, hard-filter/ranking baseline, UI şeffaflığı, telemetry ve değerlendirme fixture contract'ını uygular.
- **D7:** gold dataset'i oluşturur, metrikleri hesaplar, threshold kalibrasyonu ve model/verifier karşılaştırması yapar. LLM reranking yalnız deterministik baseline'a karşı kontrollü deneydir; varsayılan D6 davranışı değildir.
- D6-1'e başlamak için model, provider canlı çağrısı veya D7 label seti gerekmez. Registry ve compatibility fixture'larının onayı yeterlidir.

Mimari kararların ayrıntısı [AI Recommendation V2 Architecture](AI_RECOMMENDATION_V2_ARCHITECTURE.md), aspect kayıtları [AI Aspect Taxonomy](AI_ASPECT_TAXONOMY.md), provider alan kuralları [AI Provider Evidence Matrix](AI_PROVIDER_EVIDENCE_MATRIX.md) belgesindedir.
