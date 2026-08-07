# D7 Model Experiment Plan — Arşiv Durumu

Tarih: 8 Ağustos 2026
Durum: **Aktif release planı değildir; archived calibration/evaluation backlog'udur.**

## Pivot kararı

Eski plan `CandidateTextBundle + aspect → ordinal probabilities + confidence + abstention` modelini 40–60 work pilot, 120–200 work gold set, TF-IDF/frozen multilingual baseline ve calibration kapılarıyla D7 release hattına koyuyordu. Bu yol dondurulmuştur.

Gerekçe: model skoru source-backed runtime evidence değildir. Yeni veya değişmiş eser hakkında citation/revision üretmez; provider alanı yokluğunu negatif kanıttan ayırmaz ve unresolved hard constraint'i güncel izinli kaynağa bağlamaz. Recommendation V2'nin release açığı [Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md) ile çözülür.

## Dondurulan deneyler

- Yeni human annotation üretimi ve 40–60 work ana pilot.
- Gold set büyütme ve release öncesi inter-annotator agreement hedefi.
- 4-class softmax, ordinal regression ve cumulative head karşılaştırmaları.
- Multilingual encoder indirme/fine-tuning/export.
- Calibration/abstention threshold tuning ve model service benchmark'ı.
- Model çıktısını production `AspectEvidence` authority'si yapma.

Mevcut sentetik fixture'lar, calibration pilot raporu, codec, metric ve annotation tooling evaluation/development için korunur. Private workspaces silinmez veya dönüştürülmez; yeni annotation beklenmez.

## Gelecekteki opsiyonel deney rolü

ML yalnız post-release ve [D7 ML Deferred Plan](D7_ML_DEFERRED_PLAN.md) kapıları altında değerlendirilebilir:

- research priority veya abstention prediction;
- citation'lı, lisansı açık teacher claim'lerinden student distillation;
- shadow cost/latency deneyi;
- hard decision için her zaman grounded citation gerektiren selective prediction.

Student candidate seçmez, sıralamaz, `must/prefer/avoid` uygulamaz ve no-source durumunu `absent` saymaz. Human gold veya model başarısı D7/D8 release blocker'ı değildir.

## Yeniden açma koşulları

Bu belge ancak Grounded Research Engine post-release stabil olduktan; source/training hakları record-level manifestte açıklandıktan; identity/season leakage, citation lineage, personal-data exclusion ve deterministic regression kapıları tanımlandıktan sonra yeni bir experiment versionıyla yeniden açılabilir. Eski 12-aspect scope ve 120–200 work hedefi otomatik olarak devralınmaz.

İlgili belgeler: [Research Source Policy](D7_RESEARCH_SOURCE_POLICY.md), [Research Acceptance Cases](D7_RESEARCH_ACCEPTANCE_CASES.md), [Annotation Guidelines](D7_ANNOTATION_GUIDELINES.md).
