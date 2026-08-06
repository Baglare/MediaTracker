# D7 Aspect Verifier Planı

> Bu belge plan sözleşmesidir. D6.6-1 kapsamında model eğitimi, inference, provider ağı veya dependency kurulumu yapılmaz.

## Amaç ve görev sınırı

Yeni modelin tek görevi:

`Candidate metadata + aspect → absent | incidental | significant | primary + calibrated confidence`

Kanıt yetersizse model `abstain/unknown` üretir. Model recommendation seçmez, final sıra vermez, hard eligibility'yi atlamaz ve açıklama için taşımadığı claim'i üretmez. Çıktısı versioned `AspectEvidence` girişidir; deterministic V2 final karar sahibi olarak kalır.

Öncelikli aspect'ler: romance, fantasy, action, comedy, horror, mystery, political_intrigue, power_progression, revenge, academy, love_triangle, fanservice, dark, slow_burn, character_driven, plot_driven.

## Korunacak ve aktif gelecek yoldan çıkarılacak yaklaşım

Korunacak:

- deterministic V2 baseline ve hard eligibility
- dondurulmuş 43 aspect registry
- exact provider identity ve versioned evidence snapshots
- must/prefer/avoid, strictness ve Feedback V2
- grounded explanation
- evaluation fixture codec ve mevcut saf metric fonksiyonları

Aktif gelecek yoldan çıkarılacak:

- hash/mock embedding'in semantic sistem gibi sunulması
- genel text similarity'nin aspect merkeziyeti yerine kullanılması
- V1 additive hybrid scorer'ın recommendation authority olması
- ML modelinin doğrudan final ranking yapması
- LLM reranking'in production varsayılanı olması

## Dosya haritası

| Mevcut yüzey | D7 kararı | Korunacak rol / replacement |
|---|---|---|
| `lib/ai/embedding-provider.ts` | Deprecate | Mock fallback semantic evidence değildir; yeni verifier port'una taşınmaz. |
| `lib/ai/embedding-cache.ts`, `persistent-embedding-cache.ts` | Legacy/cache audit sonrası deprecate adayı | Yeni model cache'i exact model/dataset/snapshot version anahtarıyla ayrı tasarlanır. |
| `lib/ai/embedding-similarity-scorer.ts`, `embedding-text-builder.ts`, `embedding-types.ts` | Final aspect yolundan çıkar | Genel profil benzerliği aspect merkeziyeti değildir. |
| `lib/ai/text-similarity-scorer.ts` | Aspect evidence için kaldır | Yalnız kontrollü legacy/shadow karşılaştırma. |
| `lib/ai/hybrid-feature-builder.ts`, `hybrid-scorer.ts` | V1 additive ranking deprecate | Deterministic V2 breakdown authoritative kalır. |
| `lib/ai/candidate-scorer.ts`, `feedback-aware-scorer.ts` | Legacy adapter/shadow | Exact feedback semantiği V2 personal-fit'te korunur. |
| `ml-service/app.py`, `embedding.py`, `models.py`, `requirements.txt` | Mevcut genel embedding servisi deprecate | Yeni local aspect verifier ayrı versioned service contract'ı kullanır. |
| `features/recommendations/domain/*` | Koru | Registry, request, evidence ve eligibility contract'ı. |
| `features/recommendations/providers/*` | Koru | Exact identity ve bounded provider snapshots. |
| `features/recommendations/evaluation/*` | Koru/genişlet | Gold label codec ve metric girişleri. |
| `features/recommendations/orchestration/deterministic-engine.ts` | Koru | Model fail-soft olsa da final seçim/sıra sahibi. |

Bu dosyalar D6.6-1'de silinmez. Fiziksel kaldırma, tüm çağrı noktaları ve migration/shadow ihtiyaçları D7 acceptance'ta doğrulandıktan sonra ayrı değişikliktir.

## Aşamalar

### D7-0 — Veri/lisans audit'i

- provider alanları ve lisans/retention koşulları
- annotation guideline ve ordinal level örnekleri
- priority aspect sırası
- dataset/version/snapshot manifest contract'ı
- PII ve telif sınırı

### D7-1 — Annotation ve gold set

- küçük annotation aracı
- human-labeled gold set
- iki bağımsız annotator
- anlaşmazlık kaydı ve adjudication
- franchise-aware train/validation/test split; aynı franchise farklı split'e sızmaz

### D7-2 — Model ve local inference

- multilingual encoder değerlendirmesi
- ordinal head veya calibrated one-vs-rest aspect heads
- versioned local inference service
- model unavailable/timeout/invalid output için structured-only fail-soft

### D7-3 — Calibration ve AspectEvidence entegrasyonu

- probability calibration
- aspect/provider bazında abstention threshold
- model output → `AspectEvidence`
- structured/model contradiction policy; bir kaynak diğerini sessizce ezmez
- latency/concurrency/cache bütçesi

### D7-4 — Opsiyonel personalized reranker deneyi

- yalnız yeterli consented veri ve offline acceptance varsa
- deterministic baseline'a karşı shadow/offline deney
- production ranking varsayılanı yapılmaz
- kişisel note/rating/progress training dataset'ine girmez

### D7-5 — Benchmark ve kabul

- benchmark ve immutable sonuç manifest'i
- model card, lisans ve intended-use/limitation
- p50/p95 latency, memory ve fallback ölçümü
- deterministic baseline karşılaştırması
- rollback/fail-soft ve acceptance gate

## Dataset sınırları

- Gerçek kullanıcı prompt'u, notu, rating'i, progress'i veya private feedback'i kullanılmaz.
- Provider'dan alınan uzun telifli açıklamalar dataset'e kopyalanmaz; kısa bounded alan veya sentetik özet tercih edilir.
- Exact provider identity, snapshot schema/version ve observation time tutulur.
- Sentetik contract fixture gerçek kalite dataset'i veya gold label diye sunulmaz.
- Aynı eserin farklı edition/season/franchise kayıtları leakage audit'inden geçer.
- Annotation guideline spoiler ve hassas içerik label'larında ayrıntı ifşasını sınırlar.

## Metrikler

- constraint extraction precision, recall, F1
- aspect ordinal error ve aspect level accuracy
- hard-constraint violation rate
- Precision@K ve NDCG@K
- unsupported explanation rate
- abstention coverage/accuracy
- calibration error
- provider/model fallback rate
- p50/p95 latency ve peak memory

Metrikler provider/media/aspect slice'larıyla raporlanır. Ortalama iyileşme tek bir hard-constraint veya güvenlik slice'ındaki gerilemeyi gizleyemez.

## Acceptance gate

1. Veri/lisans ve PII audit'i tamamlanmış olmalı.
2. Gold set iki annotator + adjudication ve franchise-aware split taşımalı.
3. Model calibration ve abstention raporu versioned olmalı.
4. Hard-constraint violation deterministic baseline'dan kötüleşmemeli.
5. Unsupported explanation ve fallback davranışı kabul sınırında olmalı.
6. Model unavailable iken deterministic structured-only yol aynı request için güvenli sonuç/unknown üretmeli.
7. LLM veya model final recommendation authority olmamalı.
