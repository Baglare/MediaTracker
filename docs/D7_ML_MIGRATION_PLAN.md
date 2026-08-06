# D7 ML Migration Plan

Bu plan eski embedding/additive hybrid hattını audit eder ve yeni Aspect Verifier'a geçiş sırasını tanımlar. D7-0'da hiçbir eski dosya silinmez; production recommendation davranışı değişmez.

## Mevcut yürütme sonucu

`app/api/ai/recommend/route.ts` external candidate retrieval ve provider evidence hazırlığından sonra `DETERMINISTIC_RECOMMENDATION_V2_ENABLED` kontrolüne gelir. Sabit `true` değeri `features/recommendations/orchestration/deterministic-engine.ts` içindedir. Engine V2 response'u döndürür; legacy rule/feedback/text/embedding/hybrid ve LLM final-ranking bloğu çalışmaz.

Sonuç:

- Hash/mock vector V2 `AspectEvidence` üretmez ve V2 final sırayı etkilemez.
- V2 engine status `embeddingMode=disabled`, final provider `deterministic_v2` olur.
- Güncel UI “Deterministik V2 / LLM final sıralama kullanılmadı” der; eski embedding'i aktif zekâ olarak göstermez.
- README ve `AI_RECOMMENDATION_DEMO.md` eski ML'yi hâlâ genel recommendation zekâsı gibi anlatır. README bu görevde korunmuştur; D7-5/D8 doküman cleanup blocker'ıdır.

## Legacy hattı başlangıçtan sonuca

1. `buildCandidateEmbeddingText` candidate title/type/world/format/genre/author/overview'dan en çok 2.400 karakter text ve FNV-1a hash üretir.
2. `buildLibraryItemEmbeddingText` aynı alanlara tag/subject ve **personalNotes (en çok 400 karakter)** ekler. Legacy branch aktif edilirse bu kişisel metin ML service input'una gidebilir; yeni D7 verifier bunu kesinlikle yeniden kullanmaz.
3. `embedManyWithFallback` `MEDIA_TRACKER_ML_SERVICE_URL` yoksa 8-boyut deterministik hash/mock vector üretir. URL varsa `/embed` çağırır; 2.5 saniye timeout.
4. Python service `sentence-transformers/all-MiniLM-L6-v2` ile 384-boyut normalized embedding üretir; ilk gerçek request model yükleyebilir/indirebilir.
5. Memory cache max 1.000 entry'dir. Persistent cache server-only Supabase `embedding_cache` tablosunda provider/model/hash/dimension/vector saklar; text saklamaz. D7 yeni model cache'i bunu reuse etmez.
6. `applyEmbeddingSimilarityScoring` yalnız `python_service` + bütün 384-boyut invariant'ı ile score üretir. Local mock/hash olduğunda `no_real_vectors` ile candidate'ı değiştirmez.
7. `applyTextSimilarityScoring` candidate ve positive/negative library text token setleri arasında Jaccard farkı üretir; aspect merkeziliği değildir.
8. `buildCandidateFeatureVectors` rule, feedback, content, behavior, popularity, text ve embedding sinyallerini birleştirir.
9. `applyHybridScoring` additive toplam kullanır: rule + feedback + content + behavior + popularity + `0.6×text` + `0.7×embedding`; candidate'ı final score ile sıralar.
10. Bu blok sabit-true V2 return'ünün arkasındadır; yalnız V1 compatibility/shadow kodudur.

## Dosya/fonksiyon sınıflandırması

| Yüzey | Sınıf | Kaldırma/koruma kararı |
| --- | --- | --- |
| `lib/ai/embedding-provider.ts` / providers / fallback | `remove_in_d7` | D7-5'te legacy branch çağrıları kalktıktan sonra. Hash/mock yeni verifier'a taşınmaz. |
| `lib/ai/embedding-types.ts` | `remove_in_d7` | Yalnız legacy `/embed` contract'ı; yeni v2 probability contract ayrıdır. |
| `lib/ai/embedding-text-builder.ts` | `remove_in_d7` | Personal note dahil profil-benzerlik text'i yeni verifier input'u değildir. |
| `lib/ai/embedding-similarity-scorer.ts` | `evaluation_only` | D7-2 offline legacy baseline raporu tamamlanana kadar; production authority değil. |
| `lib/ai/text-similarity-scorer.ts` | `evaluation_only` | TF-IDF aspect baseline ile aynı şey değildir; yalnız legacy karşılaştırma. |
| `lib/ai/hybrid-feature-builder.ts`, `hybrid-scorer.ts` | `evaluation_only` | D7 benchmark'ta legacy additive baseline; acceptance sonrası kaldırılır. |
| `lib/ai/embedding-cache.ts` | `remove_in_d7` | Legacy embedding kalkınca silinir; verifier cache key'i model/dataset/input schema version taşır. |
| `lib/ai/persistent-embedding-cache.ts` | `compatibility_until_d8` | DB/migration bu görevde yasak. Legacy kullanım bitince D8'de tablo/secret lifecycle ayrıca ele alınır. |
| `lib/ai/candidate-scorer.ts`, `feedback-aware-scorer.ts` | `compatibility_until_d8` | Embedding sistemi değildir; V1 request/session compatibility tamamen kalkmadan dokunulmaz. |
| `ml-service/app.py` | `compatibility_until_d8` | Mevcut `/embed` endpoint'i legacy client için kalır; yeni verifier ayrı `/v2/aspect/verify` contract'ı ister. |
| `ml-service/models.py`, `embedding.py` | `remove_in_d7` | D7-5 legacy client kapandıktan sonra; general embedding contract yeni verifier değildir. |
| `ml-service/requirements.txt` | `uncertain` | FastAPI/Pydantic/ML framework kararı D7-2'de; D7-0 dependency değişmez. |
| `app/api/ai/recommend/route.ts` legacy block/imports | `compatibility_until_d8` | D7-5 acceptance sonrası ayrı küçük cleanup; bu aşamada route değişmez. |
| `app/api/ai/interpret/route.ts` | `reusable_in_new_verifier` | Structured request/capability boundary korunur; model input veya kişisel veri taşımaz. |
| `features/recommendations/domain/*` | `reusable_in_new_verifier` | Aspect registry, unknown/absent ve eligibility source of truth. |
| `features/recommendations/providers/*` | `reusable_in_new_verifier` | Exact identity ve bounded provider metadata; D7 license policy daha dar uygulanır. |
| `features/recommendations/evaluation/*` | `evaluation_only` + `reusable_in_new_verifier` | Gold/metric/codec sözleşmesi genişletilir; production route'a bağlanmaz. |
| `tests/embedding-provider.test.ts`, `persistent-embedding-cache.test.ts` | `compatibility_until_d8` | Legacy code var oldukça regression; deletion change set'iyle birlikte kaldırılır. |
| `.env.example` embedding değişkenleri | `compatibility_until_d8` | Eski service var oldukça korunur; yeni verifier env'i D7-3'ten önce eklenmez. |
| README ve `AI_RECOMMENDATION_DEMO.md` eski ML anlatımı | `remove_in_d7` | Kod değil; D7-5/D8'de authoritative V2/verifier terminolojisine güncellenir. Bu görev README'yi değiştirmez. |

## Yeni service contract kararı

Mevcut `POST /embed` yalnız `{id,text,hash} → vector` döndürür; aspect ID, ordinal probability, calibration, abstention, model/input schema version veya warnings taşımaz. Bu nedenle yeni verifier için reuse edilmez.

D7-3 hedefi ayrı versioned endpoint'tir: `POST /v2/aspect/verify`. Request `CandidateTextBundle`, exact candidate key ve bounded aspect ID listesi; response her aspect için `AspectVerifierOutput` taşır. `/embed` compatibility süresince ayrı kalır. Endpoint fail-soft, local-only, bounded top-N/concurrency/timeout ve runtime codec zorunludur.

## D7-1 local annotation tool planı

Public production admin paneli yapılmaz. Tercih ayrı local-only dev tool/route'tur; production build'de route registration yoktur ve auth bypass ile açılamaz.

Özellikler: manifest/checksum ile kayıt yükleme, bounded short summary/metadata, aspect seçimi, 5 label, annotation confidence, kısa evidence note/span, önceki/sonraki, klavye kısayolları, progress, duplicate kontrolü, pseudonymous session, versioned JSON import/export ve disagreement/adjudication görünümü.

Tool raw provider fetch yapmaz; input yalnız validated dataset package'tan gelir. Autosave aynı volume'da temp file + fsync/atomic rename veya eşdeğer güvenli adapter kullanır; corrupt write önceki son-good artifact'i ezmez. Export manifest/content hash'i yeniden hesaplar.

## Security, privacy ve artifact policy

- Dataset önce private artifact; repo yalnız schema/test/docs taşır. Public subset ayrı publishable manifest gerektirir.
- Secrets, API keys, raw payload, image veya personal data hiçbir artifact/log/model card'a girmez.
- Provider terms değişimi source policy invalidation ve affected record/model lineage raporu üretir.
- Revocation record ID/source ID üzerinden dataset version'ını ve türetilmiş model lineage'ını işaretler; silme sonrası yeni hash/version gerekir.
- Reproducible environment lock, dataset/model SHA-256, data card ve model card zorunludur.
- Model weights normal Git history'ye girmez. Boyut ve dağıtım kararına göre private release artifact veya Git LFS; checksum doğrulaması zorunlu.

## Aşama kapıları

| Aşama | Giriş | Çıktı | Test | Blocker | Scope dışı | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| D7-0 | D6 final acceptance, 43-aspect registry, provider coverage | License/data audit, provenance/annotation/verifier codec, guideline, experiment/migration plan | Lint, full tests, build, diff/link/scope checks | Resmî terms belirsizliği source'u training_allowed yapmaz | Model/data indirme, training, provider calls, route/DB değişimi | Yeni saf files/docs geri alınır; V2 davranışı etkilenmez |
| D7-1 | D7-0 blocker'ları, annotator agreement/session plan | Local tool, 40–60 pilot, guideline revision, 120–200 hedefli gold v1 planı | Codec/import-export/checksum/atomic-save, duplicate/adjudication, manual local tool | İkinci annotator yoksa limitation; license/provenance eksik record dışarıda | Production admin UI, provider fetch, model training | Tool kapatılır; versioned artifact last-good'a dönülür |
| D7-2 | Pilot guideline stabil, gold train/validation split, model license audit | TF-IDF baseline, frozen multilingual encoder, ordinal heads, offline runner | Reproducibility, leakage, metrics, CPU/RAM/size | Veri azlığı, class imbalance, model license/training-data opacity | Production endpoint/ranking değişimi, giant/LLM model | Model artifact silinir; dataset/guideline korunur |
| D7-3 | D7-2 measurable aspect gains ve calibration planı | Calibration, abstention, `/v2/aspect/verify`, output codec, AspectEvidence adapter, fail-soft | Invalid payload/probability/version, timeout/unavailable, contradiction, structured-only regression | Bad calibration veya hard violation regression | Final ranking authority, DB cache | Verifier mode disabled; structured-only deterministic V2 aynı kalır |
| D7-4 | Yeterli non-personal/consented governance ve D7-3 stable shadow | Opsiyonel personalized reranker offline/shadow experiment | Baseline comparison, privacy/consent audit | Bu planın kişisel veri yasağı nedeniyle varsayılan olarak bloklu | Production default, personal notes/profile identity training | Experiment artifact silinir; production hiç açılmaz |
| D7-5 | Frozen gold test, versioned model/data card, D7-3 gates | Benchmark, model/data card, browser/live integration, final acceptance | Full suite/build, offline benchmark, p50/p95/RAM, fail-soft, browser smoke | Her aspect slice'ta kanıt yoksa yalnız kazanan aspect açılır | D8 deploy/cutover/migration | Verifier feature flag off; structured-only V2 ve eski compatible service kalır |

## D7-1 öncesi karar

D7-0 tamamlandıktan sonra başlanabilecek tek veri üretimi sentetik/bağımsız insan-yazımı pilot record'lardır. TMDB/OMDb/AniList corpus, provider bulk snapshot ve model download hâlâ blokludur. Annotation tool production uygulamasına eklenemez. D6 threshold/ranking sabitleri insan-gold ve acceptance sonucu olmadan değişmez.
