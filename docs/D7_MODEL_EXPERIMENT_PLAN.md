# D7 Model Experiment Plan

Durum: D7-0 planı ve D7-1A araç sözleşmesi tamamlandı. Model seçilmez, indirilmez, eğitilmez veya benchmark skoru üretilmez.

## Görev

Girdi `CandidateTextBundle + aspectId`, çıktı versioned `AspectVerifierOutput`tur. Model yalnız candidate/aspect için `absent|incidental|significant|primary` probability, calibrated confidence ve gerekirse abstention üretir.

Model candidate seçmez/sıralamaz, must/prefer/avoid uygulamaz, personal fit veya popularity hesaplamaz. Kişisel rating, favorite, progress, note, feedback, prompt ve profile identity input değildir. Output runtime codec'ten geçmeden `AspectEvidence` adapter'ına giremez. Unknown/abstain absent değildir.

## MVP aspect kararı

| Seçenek | Kapsam | Güçlü yanı | Risk |
| --- | --- | --- | --- |
| A | 8 semantic/ambiguous aspect | Daha düşük annotation maliyeti | Core structured baseline ile model katkısını karşılaştırmak zor; provider boşluğu ve exact-taxonomy kontrol grubu aynı deneyde görünmez |
| B | 12–16 exact/ranked/semantic karışık | Baseline, ambiguous ve semantic slice aynı experiment contract'ta | Sparse sampling yapılmazsa annotation maliyeti büyür |

Karar: **Seçenek B'nin 12-aspect alt sınırı**, sparse work/aspect sampling ile.

MVP listesi:

- Core control: `romance`, `fantasy`, `action`, `comedy`.
- Ranked-tag ambiguity: `political_intrigue`, `power_progression`, `love_triangle`, `fanservice`, `dark`.
- Semantic: `slow_burn`, `character_driven`, `plot_driven`.

Gerekçe: core aspect'ler deterministic structured baseline sağlar; ranked-tag grubu mevcut provider evidence boşluğunu ölçer; semantic üçlü verifier'ın asıl değer hipotezidir. `revenge`, `academy`, `horror`, `mystery` guideline fixture ve holdout adayları olarak korunur fakat ilk MVP training kapsamına girmez. 43 aspect'in tamamı ilk model kapsamı değildir.

## Aşamalı dataset ve sampling

### Pilot

- 40–60 unique work.
- 6–8 aspect: ilk turda dört core + `political_intrigue`, `power_progression`, `slow_burn`, `character_driven`.
- Amaç guideline/codec/sampling anlaşılabilirliğini doğrulamaktır; model eğitimi için yeterli sayılmaz.
- Her work için bütün aspect matrisi zorunlu değildir. Annotator başına 2–4 hedef aspect önerilir.
- En az %20 double annotation; ikinci insan yoksa limitation kaydedilir.

### MVP gold set v1

- Yaklaşık 120–200 unique work.
- 8–12 priority aspect; 12 aspect açılması pilot label clarity kapısına bağlı.
- Her aspect için positive (`significant|primary`), negative (`absent`), boundary (`incidental`) ve uncertain (`insufficient_evidence`) örnekleri.
- Hard negative: surface taxonomy yakın ama merkezilik yok; örneğin Politics var/entrika yok, school scene var/academy yok, dark visual/dark tone yok.
- Provider/media dağılımı raporlanır; tek provider veya yalnız anime ağırlığı sonuçlarda slice olarak görünür.
- Gold test set tamamen adjudicated ve immutable olur; active learning havuzuna geri dönmez.

Sampling hedef oranı sabit gerçek dağılım iddiası değildir. İlk hedef aspect başına en az 20 positive, 20 negative/boundary ve 10 uncertain observation'dır; sparse matrix nedeniyle toplam annotation sayısı work × aspect çarpımı değildir. Sınıf çok nadirse zorla label üretilmez; underpowered slice olarak raporlanır.

## Split ve leakage

- Franchise/series group aware split zorunludur; aynı franchise train/test'e bölünmez.
- Alternate title, season/edition ve exact provider duplicate aynı split'te kalır.
- Exact provider identity title similarity'ye düşmez.
- İlk öneri `70/15/15 train/validation/test`; küçük slice'larda k-fold yalnız train/validation içinde değerlendirilebilir, frozen gold test değişmez.
- Time-based veya source-based holdout ikincil robustness deneyi olabilir; küçük pilotta zorunlu değildir.
- Threshold, calibration ve model seçim kararı validation set'te yapılır; gold test'te tuning yoktur.

## Aday model aileleri

| Aile | D7 rolü | Değerlendirme |
| --- | --- | --- |
| TF-IDF + logistic/ordinal linear | Baseline 1 | Küçük veri, CPU, açıklanabilir feature audit, çok düşük artifact boyutu |
| Frozen multilingual sentence encoder + linear/ordinal heads | Baseline 2 | TR/EN aktarımı, CPU/RAM/ONNX, encoder sabitken düşük overfit |
| Multilingual small transformer + frozen encoder | Baseline 2 varyantı | Pooling ve per-aspect head karşılaştırması |
| Small fine-tuned cross-encoder | Yalnız yeterli veri varsa | Candidate text + aspect interaction güçlü; latency/overfit maliyeti yüksek |
| Encoder fine-tuning | Baseline 3, koşullu | Pilot için yasak; gold set yeterli ve license audit tamamlanmışsa |

Generative LLM classifier ve devasa model başlangıç baseline'ı değildir.

Örnek adaylar yalnız D7-2 ön-audit listesidir:

- [`intfloat/multilingual-e5-small`](https://huggingface.co/intfloat/multilingual-e5-small): model card MIT, multilingual/384d/ONNX işaretleri; training-data transparency ve exact pinned revision ayrıca incelenir.
- [`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2): model card Apache-2.0, 50 dil/384d; source training data, Türkçe slice ve artifact boyutu ayrıca ölçülür.

Model Hub license etiketi tek başına kabul değildir. Model card, LICENSE, upstream/base model, training datasets, commercial/non-commercial hüküm, revision hash ve export artifact birlikte audit edilir. Final seçim D7-2 öncesinde yapılmaz.

## Karşılaştırma kriterleri

- License ve commercial/non-commercial uyumu.
- Model card ve training-data transparency.
- Türkçe/İngilizce destek ve cross-lingual slice sonucu.
- CPU p50/p95, peak RAM, model boyutu.
- ONNX/export kolaylığı ve local inference.
- Calibration, abstention ve per-aspect error.
- Reproducible pinned environment ve offline çalışma.

## Ordinal öğrenme kararı

| Yaklaşım | Artı | Eksi | Karar |
| --- | --- | --- | --- |
| 4-class softmax | Basit baseline | Sınıf sırasını loss içinde kullanmaz | Mutlaka baseline olarak çalıştır |
| Ordinal regression | Sıralı yapıyı doğrudan kullanır | Framework/export ayrıntısı daha karmaşık olabilir | Öncelikli learned objective |
| Cumulative binary heads | `P(level≥k)` ile doğal ordinal eşikler | Monotonicity ve calibration kontrolü gerekir | Öncelikli uygulama adayı |
| One-vs-rest threshold heads | Aspect bazında esnek | Tutarsız probability ve çok threshold riski | Karşılaştırma baseline'ı |

Öneri: TF-IDF logistic baseline'dan sonra cumulative ordinal heads veya eşdeğer ordinal regression öncelikli. Calibration ve abstention loss'tan ayrı değerlendirilir. Aspect sınıf dengeleri farklıdır; tek global threshold zorunlu değildir. Bütün yaklaşımlar aynı `AspectVerifierOutput` sözleşmesine map edilir.

## Calibration ve abstention

- Raw class probability calibrated confidence değildir.
- Calibration yalnız validation split'te; temperature scaling, isotonic veya Platt türü yöntemler veri miktarına göre karşılaştırılır.
- Aspect başına threshold ancak yeterli validation örneği varsa; aksi halde conservative family/global threshold ve açık limitation.
- Abstention sebepleri: `insufficient_evidence`, `low_calibrated_confidence`, `contradictory_inputs`, `unsupported_aspect`, `model_unavailable`.
- Coverage düşürülerek selective accuracy artırımı raporlanır; yalnız accuracy yükseldi diye aşırı abstention kabul edilmez.
- Calibration kötü ise model confidence eligibility'de kullanılmaz; model shadow/evaluation-only kalır.

## Evaluation contract

Mevcut sistem metrikleri korunur: constraint extraction P/R/F1, hard violation rate, aspect ordinal error/level accuracy, Precision@K, NDCG@K, unsupported explanation, provider coverage, duplicate/diversity ve latency.

Verifier metrikleri:

- Macro/micro F1 ve per-aspect F1.
- Mean ordinal error ve quadratic weighted kappa.
- Expected calibration error ve Brier score.
- Abstention coverage, selective accuracy ve confidence-vs-error curve.
- Per-aspect confusion matrix.
- Inference p50/p95, peak RAM ve model size.

Deterministic structured-only authoritative baseline'dır. Legacy V1 hybrid yalnız evaluation/deprecation karşılaştırmasıdır. Model her aspect'te kazanmak zorunda değildir; yalnız ölçülebilir iyileşme olan aspect'ler daha sonra adapter'a açılabilir. Hard-constraint violation'ı kötüleştiren model kabul edilmez. Gold test üzerinde threshold tuning yapılmaz. D7-0 gerçek skor üretmez.

## D7-2 deney çıktısı

D7-2 başlamadan önce D7-1B pilotunun guideline sorunları çözülmeli; private workspace validation critical issue üretmemeli; double-annotation subset/limitation ve frozen split kararı belgelenmelidir. D7-1A sanitised `training_candidate`/`evaluation_candidate` exportları yalnız contract artifact'tir ve kendi başına gerçek gold veya training yeterliliği kanıtı değildir.

Her run şu artifact'leri üretmelidir: immutable config, dataset/model hash, split manifest, environment lock, per-slice metrics, calibration plot verisi, confusion matrices, latency/memory ölçümü ve failure listesi. Model/data card olmadan release candidate sayılmaz; model weights normal Git history'ye yazılmaz.
