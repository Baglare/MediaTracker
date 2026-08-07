# D7 ML Deferred Plan

Tarih: 8 Ağustos 2026
Durum: Post-release opsiyonel backlog; D7 veya D8 release blocker değildir.

## 1. Yeni rol

ML artık eksik internet kanıtının yerine geçen primary verifier değildir. Grounded Research Engine yeterli, lisanslı ve revision-bound evidence ürettikten sonra opsiyonel bir student model şu sınırlı amaçlarla değerlendirilebilir:

- araştırma gerekecek candidate/aspect çiftini önceden tahmin etmek;
- citation'lı teacher claim'lerini düşük maliyetli shadow classifier'a distill etmek;
- source fetch yapılamadığında karar vermek için değil, research priority/abstention önerisi üretmek;
- latency/cost deneyinde yalnız kanıtlı aspect'lerde shadow karşılaştırma yapmak.

Student output tek başına `supported`, `contradicted` veya `absent` authority değildir. Citation-bound evidence yoksa hard decision için `unknown` kalır. LLM/student final ranking yapmaz.

## 2. Release bağımsızlığı

- Human gold dataset, yeni annotation, model download, training, calibration ve model serving D7/D8 release kabulünün zorunlu girdisi değildir.
- Annotation workspace/tooling silinmez; archived calibration/evaluation artifact olarak korunur.
- D7-R1..R5 ML olmadan tamamlanabilir.
- D8 structured-only D6 veya grounded research feature kapalı halde yayınlanabilir.

## 3. Opsiyonel giriş kapıları

Post-release ML deneyi ancak:

1. Grounded claim schema/source revision/citation contract'ı stabilse;
2. source policy her training record için training/distillation hakkını açıkça veriyorsa;
3. search snippet/result payload'ı corpus dışında tutuluyorsa;
4. train/validation/test identity + franchise + season leakage kontrolü varsa;
5. personal data ve user prompt/profile alanlarının yokluğu codec ile doğrulanıyorsa;
6. baseline research accuracy, coverage, latency ve cost ölçülmüşse;
7. rollback yalnız student'ı kapatıp grounded/deterministic yolu koruyorsa

başlayabilir.

## 4. İzinli ve yasak veri

İzinli adaylar: Wikidata CC0 facts; uygun attribution/ShareAlike ve ayrı training audit'i tamamlanmış direct-source passages; insan tarafından bağımsız yazılmış ve contributor agreement taşıyan artifact'lar; source/citation lineage'i tam derived claim'ler.

Yasak veya ayrı izne bağlı: AniList bulk/runtime payload corpus'u, TMDB content, OMDb plot, storage hakkı belirsiz OpenAI/Brave search snippet'leri, Gemini grounding output'u, kişisel library/note/rating/favorite/progress/feedback/prompt ve lisansı belirsiz ANN/diğer domain içeriği.

## 5. Deney sırası

1. No-model baseline: grounded research + deterministic V2.
2. Classical abstention/research-priority baseline.
3. Frozen multilingual encoder + küçük head, yalnız lisans kapıları açık veride.
4. Distilled student shadow mode.
5. Yalnız citation-backed teacher kararlarıyla selective prediction; hard decision authority verilmez.

Generative model, personal reranker ve end-to-end recommendation ranker kapsam dışıdır.

## 6. Ölçüm ve kabul

- `supported/contradicted/unknown` macro/per-aspect ölçümleri;
- ordinal level error yalnız supported claims'te;
- abstention coverage/selective accuracy;
- false-safe rate: unknown/avoid riskini absent sayma oranı mutlak 0;
- source/season leakage ve citation lineage coverage;
- research call reduction, p50/p95 latency, cost ve cache etkisi;
- D6 hard violation ve deterministic ordering regression'ı.

Modelin değeri yalnız research maliyetini azaltmasıyla ölçülmez. Citation coverage düşerse, false-safe üretirse, source policy lineage'i koparsa veya hard violation'ı artırırsa production'a açılmaz.

## 7. Eski D7 işlerinin statüsü

- `D7_ANNOTATION_*` belgeleri ve local workspace sistemi: archived calibration/evaluation tooling.
- D7-1B calibration pilot: historical internal evaluation evidence; gold/training datası değil.
- 40–60 work ana pilot, %20 double annotation ve 120–200 gold hedefi: iptal edilmiş release önkoşulu; yeni annotation beklenmez.
- TF-IDF/ordinal/frozen encoder planı: yalnız bu post-release giriş kapıları açılırsa yeniden değerlendirilecek experiment backlog'u.
- `/v2/aspect/verify` model service: aktif mimari hedef değil; ileride student shadow port'u için yeni contract gerekir.

İlgili belgeler: [Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md), [Research Source Policy](D7_RESEARCH_SOURCE_POLICY.md), [eski model planının arşiv durumu](D7_MODEL_EXPERIMENT_PLAN.md).
