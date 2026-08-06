# AI Recommendation V2 — Evidence, Eligibility ve Deterministik Ranking

> Durum: D6-3 deterministik baseline D6.6-1 capability ve D6.6-1R ranked-tag retrieval ile güçlendirilmiştir. D7 modeli uygulanmamıştır. [D6.6-1](AI_RECOMMENDATION_V2_D661_CAPABILITY_AND_PARSER.md) · [D6.6-1R](AI_RECOMMENDATION_V2_D661R_RANKED_TAG_RETRIEVAL.md) · [D7 planı](D7_ASPECT_VERIFIER_PLAN.md)

## 1. Çalışan akış

External recommendation akışı şu sırayı kullanır:

1. V1 intent ve retrieval plan, version 2 yapılandırılmış request'e çevrilir.
2. Doğrulanmış provider identity ve D6-2 evidence snapshot alınır.
3. Raw claim'ler merkezi registry desteğine göre `AspectEvidence` olur.
4. Objective ve aspect must/avoid koşulları soft scoring'den önce uygulanır.
5. Uygun adaylar ayrı skor boyutları ve deterministik tuple ile sıralanır.
6. Exact franchise/provider bilgisi varsa diversity rerank uygulanır.
7. Açıklama yalnız taşınan provider/evidence alanlarından Türkçe üretilir.

Authoritative çağrı [`runDeterministicRecommendationV2`](../features/recommendations/orchestration/deterministic-engine.ts) fonksiyonudur. [`route.ts`](../app/api/ai/recommend/route.ts) retrieval sonrasında bu use-case'e delege eder ve response/Quick Add şekli korunur. Provider LLM'leri retrieval planning için kullanılabilir; final aday seçimi, sıra ve fit kararı LLM'ye verilmez.

## 2. Structured request adapter

[`constraint-extractor.ts`](../features/recommendations/intent/constraint-extractor.ts) aspect eşlemesini yalnız 43 kayıtlı aspect'in label/alias alanlarından yapar. Ayrı romance/action regex listesi taşımaz. Yerel context, constraint'i `must`, `prefer` veya `avoid` olarak sınıflandırır.

- Explicit must bütün strictness modlarında must kalır.
- Provider desteği `unsupported/experimental` veya registry `mustSafety=unsafe` ise otomatik hard karar uydurulmaz; constraint `prefer` olur ve warning taşır.
- Retrieval planning sinyalleri yalnız `inferred` kaynaktır ve explicit constraint'i ezmez.
- Kullanıcıca onaylanmış structured request, provider retrieval planının hedeflerini ve pozitif/avoid sinyallerini guardrail ile yeniden sabitler; provider clarification veya eski mesaj metni bu kararı silemez. AniList provider retrieval mapping'i exact constraint'i canonical genre'a, queryable ranked-tag must'ı canonical tag + `minimumTagRank` strict/relaxed pass'ine taşır. Ranked-tag havuz sahipliğinde generic title fallback yoktur.
- Reference yalnız exact provider + external ID ile `verified` olur. Title-only/fuzzy eşleşme `unresolved` kalır.
- Medya türü, length, release status/year, format, language ve country objective constraint'tir; aspect registry'ye gömülmez.

D6-3 adapter mevcut V1 request'i kabul eder. Editable parse, strictness seçimi ve unresolved reference çözümü D6-4'tedir.

## 3. Evidence aggregation

Raw provider claim reliability değeri aspect strength değildir. [`claim-normalizer.ts`](../features/recommendations/evidence/claim-normalizer.ts) şu merkezi katkı tablosunu uygular:

| Kaynak | Başlangıç katkısı | Not |
|---|---:|---|
| provider genre | 0.55 | Genre merkezilik garantisi değildir. |
| AniList tag rank | 0.62 | 0–100 rank ayrıca `0.50–1.00` faktörüne çevrilir. |
| provider keyword | 0.46 | Exact registry alias eşleşmesi gerekir. |
| provider metadata | 0.32 | Çoğunlukla objective kanıttır. |
| local semantic verifier | claim reliability | Tek başına provider kanıtını ezmez; contribution 0.65 ile sınırlıdır. |
| remote LLM verifier | claim reliability | Yalnız candidate metadata; aynı sınırlar. |
| user feedback | 0 | Provider evidence değildir; personal-fit katmanına gider. |

Katkı `source base × claim reliability × provider support × tag-rank factor` ile hesaplanır. Aynı provider/source/field/normalized value/aspect claim'i bir kez sayılır. En güçlü dört bağımsız katkı bounded noisy-or ile birleşir; sonuç `0.95` ile, provider support da `strong=0.90`, `partial=0.74`, `experimental=0.49`, `unsupported=0` ile sınırlıdır.

Bu sayılar D6 baseline sabitleridir; D7 gold label olmadan aspect/provider bazında değiştirilmez.

Registry-driven structured policy bu genel eşikleri bütün aspect'ler için düşürmez. Yalnız `group=core`, claim provider'ı için `support=strong` ve exact `provider_genre` koşulunda genre-only `significant/medium` tabanı uygulanır; aynı aspect'e ait orta tag ile `significant/high`, güçlü tag ile `primary/high` tabanı oluşabilir. Bu politika 13 core aspect'i kapsar; narrative/relationship/tone/experience aspect'leri genre tabanından güç kazanmaz. Exact başlangıç sabitleri tek aggregation modülündedir. Balanced bu strong structured baseline'ı kabul eder; Strict high-confidence varsayımını korur. Ayrıntı: [D6-5.3 Core Genre Kalibrasyonu](AI_RECOMMENDATION_V2_D653_CORE_GENRE_CALIBRATION.md).

### Unknown ve absent

- Hiç supporting claim yoksa veya provider/aspect `unsupported` ise `strength=null`, `level=unknown`, `confidence=unknown` üretilir.
- `absent` ancak sayısal, doğrulanmış düşük strength (`0.00–0.199…`) olduğunda anlamlıdır.
- Unknown otomatik sıfır veya absent değildir.
- Malformed reliability/tag rank claim'i atılır ve warning taşınır.

### Confidence

- İki bağımsız evidence ailesi ve en az `0.72` reliability: `high`.
- Tek güçlü (`>=0.55`) veya iki bağımsız claim: `medium`.
- Daha zayıf supporting evidence: `low`.
- Supporting evidence yok: `unknown`.
- Contradictory semantic evidence supporting claim'leri silmez; confidence bir kademe düşer.

## 4. Hard eligibility

Objective evaluator [`objective-filters.ts`](../features/recommendations/ranking/objective-filters.ts), aspect evaluator ise D6-1 [`policies.ts`](../features/recommendations/domain/policies.ts) sözleşmesini kullanır.

- Must seviye/confidence koşulu karşılanmıyorsa aday scored listeye girmez.
- Must evidence `unknown` ise aday elenir; popularity veya personal fit bunu telafi edemez.
- Yeni veya legacy eşiksiz `avoid` için varsayılan `rejectAtLevel=incidental` değeridir. Incidental veya daha güçlü medium/high-confidence kanıt primary adayı eler.
- Düşük güvenli avoid, primary sonucu otomatik elemez; warning/risk taşır.
- Avoid kararı `requestFit`, `evidenceConfidence`, fit etiketi, olumlu açıklama veya aspect kaynaklı `personalFit` bonusu üretmez.
- Prefer tek başına hard must değildir. Ancak en az bir explicit pozitif aspect bulunan istekte adayın bu explicit aspect'lerden en az biriyle incidental veya daha güçlü, supporting kanıtlı ilişkisi yoksa minimum relevance kapısını geçemez.
- Objective must'ta metadata yoksa sonuç `unknown` ve hard fail'dir.
- Exploratory modda must veya güvenilir avoid ihlali primary'ye girmez; kanıtlı ihlal en fazla üç öğelik ayrı near-match listesinde açıkça gösterilebilir. Tamamen kanıtsız explicit-aspect adayı near-match'e zorla eklenmez.

## 5. Personal fit

[`personal-profile.ts`](../features/recommendations/ranking/personal-profile.ts) iki sinyali ayırır:

- `consumed`: genre/subject/tag görülme sıklığı; küçük ağırlık.
- `loved`: favorite ve 8+ rating; güçlü pozitif ağırlık.
- `avoided`: dropped veya 4 ve altı rating; negatif ağırlık.

Aspect eşlemesi registry alias'larıyla yapılır. Feedback yalnız exact `externalSource + externalId` item'a uygulanır. Tek dismissal bütün source/type ailesini cezalandırmaz. Reason/aspect-level feedback D6-4'e bırakılmıştır.

## 6. Ranking boyutları ve sort key

Her eligible aday ayrı boyutlar taşır:

| Boyut | Aralık | Kullanım |
|---|---:|---|
| `requestFit` | 0–1 | Pozitif must/prefer ve objective karar sonucu; avoid pozitif katkı değildir. |
| `explicitRequestCoverage` | 0–1 | Explicit must=2.0, explicit prefer=1.0, inferred prefer=0.5 ağırlıklı kapsam; profile/avoid hariçtir. |
| `evidenceConfidence` | 0–1 | İstekle ilgili aspect confidence. |
| `personalFit` | -1–1 | Explicit beğeni/tüketim/avoid ve exact feedback. |
| `qualitySignal` | 0–1 | Community score ağırlıklı; popularity sınırlı katkı. |
| `novelty` | 0–1 | Exact library identity dışlamasından sonra 1. |
| `diversityContribution` | 0–1 | Rerank sırasında ayrı read-model alanı. |

Authoritative additive “score çorbası” yoktur. İlk deterministik sıra anahtarı:

```text
requestFit desc
evidenceConfidence desc
personalFit desc
qualitySignal desc
novelty desc
canonicalProviderIdentity asc
```

Bu tuple hard-filter sonrasında uygulanır. Quality/popularity yalnız daha güçlü istek, evidence ve personal boyutlarını geçemez. Diversity requestFit/evidenceConfidence eşitliğini bozamaz. Eşitlik exact canonical identity ile deterministik çözülür.

## 7. Diversity

[`diversity.ts`](../features/recommendations/ranking/diversity.ts) yalnız exact `seriesGroupId` varsa franchise tekrarına ceza uygular; title benzerliği franchise kimliği sayılmaz. Aynı provider tekrarına küçük bir dağılım cezası vardır. Sistem uygun aday sayısı kadar sonuç döndürür; listeyi beşe tamamlamak için hard koşul veya identity politikasını gevşetmez.

## 8. Grounded explanation

[`grounded-explanation.ts`](../features/recommendations/explanation/grounded-explanation.ts):

- Aspect label/level/confidence yalnız `AspectEvidence` içinden gelir.
- Length/community/popularity yalnız snapshot'ta gerçekten varsa söylenir.
- Supporting claim'de provider varsa kaynak adı gösterilir.
- Kanıt yoksa kesin olumlu/olumsuz aspect iddiası üretilmez.
- Spoiler raw tag açıklama metnine taşınmaz.
- Avoid aspect olumlu `fitLabel`, evidence chip veya “Neden önerildi” maddesi olamaz; yalnız risk/ihlal yüzeyinde görünür.
- Community score provider adı ve ölçeğiyle (`AniList topluluk puanı: 7.0/10`) gösterilir; AI relevance skoru değildir.

Baseline tamamen template-driven'dır. Opsiyonel LLM wording daha sonra eklenirse aynı evidence payload'a bağlı kalmalı; yeni fact, title, aspect veya sıra üretemez.

## 9. Semantic verifier modları

| Mod | Durum | Bütçe/fallback |
|---|---|---|
| `structured_only` | Varsayılan ve her zaman çalışır | Network/model çağrısı yok. |
| `local_enhanced` | `AI_LOCAL_SEMANTIC_VERIFIER_URL` varsa | Top-N 8, concurrency 2, timeout 1800 ms; hata structured-only confidence ile devam eder. |
| `remote_enhanced` | `AI_REMOTE_SEMANTIC_VERIFIER_URL` varsa | Aynı bütçe; yalnız public candidate metadata gönderilir. |

Verifier payload kişisel not, rating, progress veya profile içermez. Response versioned JSON claim contract'ına göre aspect ID, `0..1` score, confidence ve polarity doğrular. Hash/mock embedding evidence source değildir. Model yokluğu request hatası değil `unavailable` engine status/fallback bilgisidir.

## 10. Telemetry ve compatibility

Internal debug notları constraint source sayıları, evidence snapshot sayısı, hard-filter rejection sayısı, eligible count ve effective verifier mode taşır. D6-2 cache/TVMaze/identity sayaçları korunur.

D6.6-2 debug read-model'i provider request retry/timeout/rate-limit/unavailable/fallback sayaçlarını ve `interpretation/planning/retrieval/enrichment/evidence/ranking/explanation/total` latency aşamalarını taşır. Latency kırılgan pass/fail eşiği değildir; evaluation count/mean/p50/p95/max ile raporlar.

- V1 request ve `AiRecommendResponse` şekli korunur.
- `AiRecommendation.candidate` Quick Add için korunur.
- Engine provider `deterministic_v2`, embedding mode `disabled` olarak görünür.
- Retrieval planning provider'ı final engine'den ayrı raporlanır: actual/attempted planning provider, `auto|fixed|mock` policy, OpenAI preference uygulanma durumu ve planning fallback. Bu alanlar LLM'nin final sıralama yaptığı anlamına gelmez.
- Global Search, Release Calendar ve provider details/add akışları değişmez.
- Legacy scorer/embedding/LLM ranking sembolleri migration karşılaştırması için kaynakta kalabilir fakat authoritative production branch tarafından çağrılmaz.

## 11. D6-4 ve D7 sınırı

D6-4 tamamlandı: editable constraints, strict/balanced/exploratory, reason-level feedback, ayrı near-match UI ve kullanıcı şeffaflığı bağlandı. D6.6-1 evidence confidence'ı personal fit'in önüne aldı ve weighted explicit coverage'ı requestFit/read-model'e bağladı; yüzde-50 hard gate eklemedi. D7 learned aspect verifier planı [D7 Aspect Verifier](D7_ASPECT_VERIFIER_PLAN.md) belgesindedir.

D7: gold labels, aspect threshold/confidence kalibrasyonu, Precision@K/NDCG@K, hard-violation/unsupported-explanation ölçümü ve deterministik baseline'a karşı kontrollü verifier/LLM deneyleri. D7 hiçbir ölçüm sonucu olmadan D6 sabitlerini sessizce değiştirmez.
