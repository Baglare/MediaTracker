# D7 Aspect Verifier Planı

Tarih: 6 Ağustos 2026
Durum: D7-0/D7-1A tamamlandı; D7-1B calibration mini-pilot ve D7-1B.1 provenance/hash/sufficiency hardening tamamlandı. Gold veri, model indirme veya training başlamadı.

## Kesin ürün kararı

Yeni modelin tek görevi `CandidateTextBundle + aspect → ordinal probabilities + calibrated confidence + abstention` üretmektir. Çıktı candidate/aspect `AspectEvidence` girdisi olabilir; model candidate seçmez, sıralamaz, must/prefer/avoid veya personal fit uygulamaz. Deterministic V2 eligibility ve ranking üretim karar makamıdır.

Hash/mock embedding semantic evidence değildir. Legacy embedding similarity, lexical similarity ve additive hybrid scorer yeni verifier'ın temeli değildir. Kullanıcı kişisel verileri model input'una, training dataset'ine veya public dataset'e girmez. D7-0 yalnız contract, audit ve plan aşamasıdır.

## D7-0 çıktıları

- [Data and License Audit](D7_DATA_AND_LICENSE_AUDIT.md): provider/source kullanım sınıfları, retention, telif ve açık izin soruları.
- [Dataset Provenance](D7_DATASET_PROVENANCE.md): manifest, source policy, provenance, annotation ve verifier codec invariant'ları.
- [Annotation Guidelines](D7_ANNOTATION_GUIDELINES.md): beş label, 16 aspect ve zorunlu kavram ayrımları.
- [Model Experiment Plan](D7_MODEL_EXPERIMENT_PLAN.md): 12-aspect MVP, 40–60 pilot, 120–200 gold hedefi, split, baseline, ordinal/calibration planı.
- [ML Migration Plan](D7_ML_MIGRATION_PLAN.md): legacy uçtan uca audit, removal map, local annotation tool ve D7-0..D7-5 gates.
- Saf code: `features/recommendations/evaluation/dataset/` ve sentetik contract testleri.

## MVP kapsamı

Seçilen 12 aspect:

- Core control: `romance`, `fantasy`, `action`, `comedy`.
- Ranked ambiguity: `political_intrigue`, `power_progression`, `love_triangle`, `fanservice`, `dark`.
- Semantic: `slow_burn`, `character_driven`, `plot_driven`.

Pilot 6–8 aspect ile başlar. `revenge`, `academy`, `horror`, `mystery` post-MVP/holdout adayıdır. 43 aspect'in tamamı ilk model kapsamı değildir.

## Veri ve annotation sınırı

- Pilot: 40–60 unique work; guideline validation, training yeterliliği iddiası yok.
- MVP gold: yaklaşık 120–200 unique work; sparse work/aspect matrix, balanced positive/negative/uncertain ve hard negatives.
- Minimum %15–25 double annotation. İkinci insan yoksa limitation açıkça belgelenir; aynı kişinin ikinci turu bağımsız annotator değildir.
- Franchise/series/exact identity aware split; alternate title ve duplicate provider identity aynı split'te kalır.
- Frozen gold test threshold tuning veya active learning'e geri beslenmez.

Gerçek kullanıcı note/rating/favorite/progress/feedback/prompt, private library, raw provider payload, long synopsis/description/plot, image ve API secret yasaktır. Provider runtime reference provider metninin dataset'e kopyalanması değildir.

## Model ve ordinal karar

Baseline sırası:

1. TF-IDF + logistic/ordinal classifier.
2. Frozen multilingual encoder + linear/cumulative ordinal heads.
3. Yalnız veri yeterliyse encoder fine-tuning.

4-class softmax kontrol baseline'ıdır; doğal sınıf sırası nedeniyle ordinal regression/cumulative heads önceliklidir. Calibration ve abstention ayrı ölçülür; aspect başına class balance/threshold farklı olabilir. Devasa veya generative LLM classifier başlangıç modeli değildir. Model seçimi/indirme D7-2 öncesinde yapılmaz.

## Evaluation ve acceptance

Deterministic structured-only baseline korunur. Verifier için macro/micro/per-aspect F1, mean ordinal error, quadratic weighted kappa, ECE, Brier, abstention coverage, selective accuracy, confidence-error curve, confusion matrix, CPU p50/p95, RAM ve model size raporlanır. Sistem seviyesinde hard violation, Precision@K/NDCG@K, unsupported explanation, provider coverage ve diversity regression kapıları kalır.

Model her aspect'te kazanmak zorunda değildir; yalnız ölçülebilir iyileşme sağladığı aspect'ler adapter'a açılabilir. Hard-constraint violation kötüleşirse model kabul edilmez. Calibration kötüyse confidence eligibility'de kullanılmaz. Gold test'te threshold tuning yapılmaz.

## Aşamalar

| Aşama | Kapsam | Varsayılan rollback |
| --- | --- | --- |
| D7-0 | Data/license/provenance/annotation contract | Saf yeni contract/docs kaldırılır; V2 davranışı değişmez |
| D7-1A | Local-only annotation tool, private artifact/atomic storage, import-export/adjudication/revocation contract | Flag kapatılır; last-good bounded backup korunur |
| D7-1B | Calibration mini-pilot tamamlandı; sırada 40–60 work, 6-aspect independent-human ana pilot, ikinci annotator/agreement ve guideline revision | Pilot internal-only kalır; assisted/legacy labels gold sayılmaz |
| D7-2 | Classical + frozen multilingual baseline, ordinal heads, offline runner | Model artifact kaldırılır; dataset korunur |
| D7-3 | Calibration, abstention, local verifier API v2, AspectEvidence adapter, fail-soft | Verifier disabled; structured-only V2 |
| D7-4 | Yalnız yeterli ve izinli veri varsa optional personalized reranker shadow | Experiment silinir; production default hiç açılmaz |
| D7-5 | Benchmark, model/data card, browser/live integration, final acceptance | Verifier feature kapalı; deterministic V2 authoritative |

Her aşamanın giriş/çıktı/test/blocker/scope dışı/rollback matrisi [ML Migration Plan](D7_ML_MIGRATION_PLAN.md) içindedir.

## D7-1A çıktısı ve D7-1B blocker'ları

D7-1A [tool architecture](D7_ANNOTATION_TOOL_ARCHITECTURE.md), [private artifact policy](D7_PRIVATE_ARTIFACT_POLICY.md) ve [workflow](D7_ANNOTATION_WORKFLOW.md) ile tamamlandı. Tool yalnız development + explicit flag + loopback host koşulunda çalışır; production'da 404, public navigation'da görünmez. Gerçek workspace/dataset/model artifact repoya eklenmedi.

- Annotator agreement, pseudonymous session ve revocation/deletion akışı.
- İkinci annotator bulunabilirliği veya single-annotator limitation kararı.
- Sentetik/human-rewritten source policy ve private artifact saklama yeri.
- TMDB yazılı izni olmadan TMDB content yok; AniList/OMDb corpus yok; TVMaze/Open Library training field audit tamamlanmadan yok.
- Annotation tool'un production build'e girmediğini garanti eden packaging kararı.

## D7-1B.1 calibration kararı

[Aggregate calibration raporu](D7_1B_CALIBRATION_PILOT_REPORT.md), 10 record/27 annotation/8 task-aspect mini-pilotun assistance provenance'i olmadığı için `unknown_legacy` ve calibration-only kaldığını belgeler. Gold agreement yalnız explicit `independent_human` annotation'larla hesaplanır. Manifest dataset hash lifecycle ve task-derived aspect scope reconcile edilmeden candidate export kabul edilmez.

Sonraki ana pilot 6 aspect ile başlar: `romance`, `fantasy`, `political_intrigue`, `power_progression`, `love_triangle`, `character_driven`. `dark` geçici deferred; `fanservice` insufficient-sample/presentation-dependent backlog'dur. Registry, 12-aspect tool capability ve Recommendation V2 davranışı değişmez.
