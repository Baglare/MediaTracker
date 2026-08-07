# D7 ML Migration Plan — Grounded Research Pivot

Tarih: 8 Ağustos 2026
Durum: D7-R0 contract; production kodu, DB ve migration değişmemiştir.

## 1. Mevcut authoritative durum

`app/api/ai/recommend/route.ts`, provider retrieval/evidence hazırlığından sonra sabit açık `DETERMINISTIC_RECOMMENDATION_V2_ENABLED` yoluyla `runDeterministicRecommendationV2` çağırır. Bu erken dönüş:

- identity doğrulanmış candidate ve structured evidence kullanır;
- unknown-aware `must/prefer/avoid` policy uygular;
- near-match'i normal sonuçtan ayırır;
- request fit → evidence confidence → personal fit → quality → novelty → stable identity sırasını korur;
- LLM final-ranking ve legacy embedding/hybrid branch'ini authoritative akıştan çıkarır.

Bu D7 pivotunda korunacak source of truth budur.

## 2. Mevcut web fallback audit'i

`searchWebResearchCandidates` gerçek aspect research yapmaz:

1. DuckDuckGo HTML endpoint'ini çağırır.
2. `result__a/result__snippet` selector'larını regex ile parse eder.
3. Sonuç title'larından yeni provider title query'leri türetir.
4. AniList/TVMaze/TMDB/OMDb/Open Library aramalarından exact provider candidate toplamaya çalışır.
5. Web sayfasını direct content olarak okumaz; source revision, license, passage veya citation-bound aspect claim üretmez.

Bu yüzden kırılgan HTML discovery hint'i olarak bile sınırlıdır; romance, political intrigue centrality, love triangle absence veya character-driven gibi hard evidence boşluklarını çözemez. D7-R3 sonrası kaldırma/compatibility kararı ayrı küçük production change set'idir; D7-R0'da kod değişmez.

## 3. Korunacak ve genişletilecek seam'ler

| Mevcut yüzey | D7 kararı |
| --- | --- |
| `features/recommendations/domain` | Constraint, aspect registry, unknown/absent ve policy source of truth olarak korunur |
| `features/recommendations/providers` | Exact identity, version/season isolation, structured evidence ve telemetry temelidir |
| `provider evidence cache` | Owner-independent ve coalesced yaklaşım korunur; research cache ayrı policy/revision key ister |
| `features/recommendations/evidence` | Aggregation/contradiction seam'i citation-bound research claim'leri için genişletilir |
| `semantic-verifier.ts` | Bounded top-N/concurrency/fail-soft ilkeleri referanstır; generic endpoint contract'ı aktif hedef değildir |
| `deterministic-engine.ts` | Final eligibility/ranking authority; yalnız research evidence adapter'ını tüketir |
| `features/recommendations/evaluation` | Fixture/metric/annotation araçları evaluation-only kalır |
| `lib/ai/providers/openai-compatible-provider.ts` | Chat Completions planning/legacy ranking adapter'ıdır; Responses web_search yerine reuse edilmez |
| legacy embedding/hybrid | V1 compatibility/evaluation; Grounded Research Engine'e taşınmaz |

## 4. Hedef feature sınırı

```text
features/recommendations/research/
  domain/          # task, source, passage, citation, extraction codecs
  planning/        # unresolved hard constraints + bounded top-N
  sources/         # wikidata, mediawiki, openai-search, optional brave ports
  security/        # URL policy, SSRF, sanitization, size/redaction
  extraction/      # supplied-passage-only structured extractor
  persistence/     # owner-independent evidence cache port + policy invalidation
  orchestration/   # coalescing, concurrency, timeout, fail-soft telemetry
```

Kesin dosya isimleri D7-R1 implementation discovery'sinde mevcut desenlere göre daraltılır; yeni ikinci ranking sistemi kurulmaz.

## 5. Entegrasyon sırası

1. Retrieval exact identity'li high-recall pool üretir.
2. Structured provider pipeline mevcut snapshot/evidence'i hazırlar.
3. Deterministic pre-evaluation unresolved explicit `must`/`avoid` çiftlerini belirler.
4. Yalnız top-N unresolved çiftler research planner'a gider.
5. Source adapters direct licensed passages ve revision metadata'sı üretir.
6. Extractor citation-bound JSON claim döndürür; invalid/no-source sonuç `unknown`dur.
7. Research evidence mevcut aggregation'a ayrı provenance ile eklenir.
8. Aynı D6 eligibility/ranking/explanation katmanı çalışır.

Research failure mevcut structured evidence'i silmez. Provider unavailable, no source ve gerçek contradiction farklı reason code taşır. LLM hiçbir aşamada candidate count, eligibility veya sort key üretmez.

## 6. Cache ve telemetry migration kararı

Mevcut provider cache memory-only, max 256, TTL ve in-flight coalescing taşır. Research cache bunun key'ini reuse etmez; `canonicalIdentity + versionScope + aspectId + sourcePolicyVersion + extractorSchemaVersion + sourceRevisionFingerprint` gerekir.

Public evidence owner-independent kalır. Direct licensed content ile search-result payload ayrı storage class'tır. Search snippet'i rights olmadan persistence'a girmez. Derived claim source revision'ından koparılamaz.

Telemetry; research requested/completed/coalesced, cache hit/miss/stale, provider unavailable/rate-limit/timeout, source trust, citation validation ve no-result reason sayar. Raw passage, secret, personal data veya kullanıcı prompt'u taşımaz.

## 7. Eski ML hattı

Legacy embedding/cache/service dosyaları bu aşamada silinmez; D8 compatibility cleanup'ı ayrı scope'tur. Yeni research engine:

- hash/mock embedding kullanmaz;
- `personalNotes` veya user profile text'i almaz;
- `/embed` veya eski additive hybrid score'u reuse etmez;
- `/v2/aspect/verify` model service'ini D7 hedefi saymaz.

Gelecek ML rolü yalnız [post-release deferred plan](D7_ML_DEFERRED_PLAN.md) kapsamındadır.

## 8. D7-R1 kapısı ve rollback

D7-R1 saf domain/source registry/planner/cache interface ve fixture aşamasıdır; network çağrısı veya production route bağlantısı yoktur. Giriş koşulları [D7 Aspect Verifier Pivot Kaydı](D7_ASPECT_VERIFIER_PLAN.md) içinde sabittir.

Her sonraki aşamanın rollback'i research feature'ını kapatıp structured-only D6'ya dönmektir. D6 constants, provider identity rules, existing tests ve production response contract'ı D7-R0'da değişmez.
