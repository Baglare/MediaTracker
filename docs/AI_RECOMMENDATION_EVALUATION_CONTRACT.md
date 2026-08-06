# AI Recommendation — D7 Evaluation Contract

> Bu belge ve seed'ler gerçek kalite dataset'i değildir. D6 davranışını ölçülebilir yapan versioned sözleşme ve sentetik contract fixture'larıdır. Yeni model planı [D7 Aspect Verifier Planı](D7_ASPECT_VERIFIER_PLAN.md) içindedir.

## Kod yüzeyi

`features/recommendations/evaluation/`:

- `types.ts`: `RecommendationEvaluationCase`, candidate label ve label-source contract'ları.
- `codec.ts`: version, exact identity, V2 request, snapshot ve label invariant'larını runtime'da doğrular.
- `metrics.ts`: saf metric matematiği; ranking/model çağrısı yapmaz.

`tests/fixtures/recommendations-v2/contract-seeds.ts` 15 sentetik senaryo içerir: romance primary/incidental, love-triangle avoid, episode ≤13, unknown length, exploratory near-match, TVMaze anime exclusion, Batı animasyonu, Open Library subject-only, exact dismissal, unresolved reference, cross-media, provider unavailable, contradiction, forced-fill yasağı ve deterministic order.

## Fixture semantiği

Her case `version`, `id`, locale/query, doğrulanmış `structuredRequest`, strictness, sentetik profile fixture, provider evidence snapshot adayları, expected constraint anahtarları, candidate labels, primary/near-match kimlikleri ve notlar taşır. Candidate identity exact provider ID'dir; title/yıl benzerliği gold identity değildir.

Candidate label:

- `relevanceGrade`: 0 irrelevant, 1 weak, 2 acceptable, 3 strong.
- `hardConstraintPass`: objective/aspect hard uygunluk gerçeği.
- `expectedAspectLevels`: `unknown` ve `absent` ayrı değerlerdir.
- `expectedConfidenceBounds`: tahmini certainty değil, kabul edilebilir etiket aralığıdır.
- supported/forbidden explanation claims groundedness kontrolüdür.
- `expectedResultKind`: primary, near-match veya excluded.
- `labelSource`: provider metadata, human annotation veya synthetic contract.

Objective fact (bölüm sayısı, exact ID, yayın yılı) ile subjective label (romance merkeziyeti, relevance) ayrı alanlarda tutulur. Human annotation'da iki annotator etiketi, gerekçe ve adjudication sonucu kaybolmadan saklanmalıdır.

## Metric contract

| Metrik | Hesap |
|---|---|
| Constraint extraction P/R/F1 | Gold ve çıkarılan constraint anahtarlarının TP/FP/FN'i |
| Hard violation rate | Primary dönenler içinde `hardConstraintPass=false` oranı |
| Aspect ordinal error/accuracy | `absent→incidental→significant→primary`; unknown ayrı confusion bucket |
| Aspect precision | İddia edilen aspect/level'in human gold karşılığı |
| Precision@K / Recall@K | Grade ≥2 relevant kabulü; Recall yalnız uygun payda varsa |
| NDCG@K | 0–3 relevance grade ile discounted cumulative gain |
| Unsupported explanation rate | Supported claim listesinde bulunmayan açıklama iddiası oranı |
| Hallucinated/unverified title rate | Exact provider identity'siz sonuç oranı; hedef sıfır |
| Provider/result coverage | Provider/type bazında verified candidate ve doğru sonuç üretimi |
| Duplicate/franchise/diversity | Exact canonical key, franchise ve media-type dağılımı |
| Fallback/verifier usage | İstek başına effective mode ve fail-soft oranı |
| Latency summary | Aşama bazında count/mean/p50/p95/max; kırılgan zaman pass/fail'i değildir |

Doğru biçimde 0 sonuç beklenen strict case `resultCoverage` paydasına körlemesine başarısız olarak girmez. Latency, provider/verifier modu ve cache sıcaklığıyla kırılır.

## Dataset sınırları

- Sentetik fixture invariant, güvenlik ve regression doğrular; gerçek relevance/aspect precision kanıtlamaz.
- Provider snapshots discovery/normalizer drift'ini doğrular; snapshot tarihi, schema version ve exact identity taşımalıdır.
- İnsan etiketli gold set aspect merkeziyeti, relevance ve açıklama desteği için zorunludur.
- Provider metadata değişirse fixture immutable snapshot olarak yeni sürüm alır; eski gold sessizce güncellenmez.
- Telifli uzun synopsis kopyalanmaz; bounded provider metadata veya sentetik kısa özet kullanılır.
- Gerçek kullanıcı library/note/prompt/feedback public dataset'e girmez.
- Exact provider identity ile snapshot/dataset/model version birlikte tutulur; sentetik fixture gold kalite etiketi sayılmaz.

## D7 karşılaştırmaları

1. Legacy V1 rule/hybrid yalnız deprecation karşılaştırma baseline'ı.
2. Deterministic V2 structured-only authoritative baseline.
3. D7 local aspect verifier + abstention.
4. Structured/model contradiction ve fail-soft karşılaştırması.
5. Yalnız veri yeterliyse opsiyonel personalized reranker shadow deneyi; production varsayılanı değildir.

Rapor constraint extraction precision/recall/F1, aspect ordinal error/level accuracy, hard-constraint violation, Precision@K, NDCG@K, unsupported explanation, abstention coverage/accuracy, calibration error, provider/model fallback ve p50/p95 latency metriklerini taşır. Production threshold, confidence veya ranking ancak human-labeled gold set, tekrar üretilebilir metric raporu ve regression gate kanıtıyla değiştirilebilir. D6.6-1 genel strength/confidence threshold'larını düşürmez.
