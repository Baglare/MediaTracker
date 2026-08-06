# AI Recommendation V2 Architecture

> Durum: D6-0–D6.6-1R uygulanmıştır. D6 kabul sonucu [AI_RECOMMENDATION_V2_ACCEPTANCE.md](AI_RECOMMENDATION_V2_ACCEPTANCE.md), parser/capability sözleşmesi [D6.6-1](AI_RECOMMENDATION_V2_D661_CAPABILITY_AND_PARSER.md), ranked-tag retrieval sözleşmesi [D6.6-1R](AI_RECOMMENDATION_V2_D661R_RANKED_TAG_RETRIEVAL.md), D7 planı [D7_ASPECT_VERIFIER_PLAN.md](D7_ASPECT_VERIFIER_PLAN.md) içindedir.

## 1. Amaç ve değişmez kararlar

AI Recommendation V2'nin amacı, doğrulanmış provider kimliğine ve izlenebilir kanıta dayanan, hard constraint'leri deterministik uygulayan bir öneri sistemi kurmaktır.

- AniList anime, manga, manhwa ve manhua için öneri kaynağıdır.
- TVMaze anime dışı TV dizileri ile yayın/bölüm metadata'sının kaynağıdır.
- TMDB film ve TV discovery ile genre/keyword zenginleştirmesinin kaynağıdır.
- OMDb film kimliği ve ikincil doğrulama kaynağıdır.
- Open Library kitap kimliği ve bibliyografik metadata kaynağıdır.
- Provider kimliği doğrulanmamış eser önerilmez.
- Structured provider evidence her modda temel katmandır.
- Final uygunluk ve sıra kararı deterministik scorer'a aittir.
- LLM yalnız intent yapılandırma, clarification ve mevcut kanıtı doğal dile çevirme görevlerinde kullanılabilir.
- D6 baseline'ında LLM reranking yoktur; karşılaştırmalı deney D7'ye bırakılır.

Aspect registry sözleşmesi [AI_ASPECT_TAXONOMY.md](AI_ASPECT_TAXONOMY.md), provider alanlarının yetkisi [AI_PROVIDER_EVIDENCE_MATRIX.md](AI_PROVIDER_EVIDENCE_MATRIX.md), aşamalı uygulama ve D7 ölçüm planı [AI_RECOMMENDATION_V2_MIGRATION_PLAN.md](AI_RECOMMENDATION_V2_MIGRATION_PLAN.md) içindedir.

## 2. Mevcut sistem akış haritası

### 2.1 Üst seviye akış

> Bu alt bölüm D6-0 read-only audit tarihindeki V1 akış kaydıdır; güncel authoritative external recommendation akışı bölüm 11'deki deterministik V2 motorudur.

`components/ai-advisor.tsx:runApi` owner-scoped yerel feedback ile kütüphane verisini `POST /api/ai/recommend` isteğine koyar. `route.ts:POST` intent ve profili üretir; library-only modunu erken ve deterministik döndürür. Dış kaynak modlarında LLM provider'ından retrieval plan almayı dener, provider API route'larından aday toplar, provider kimliği ve medya türü hijyenini uygular, feedback/rule/text/embedding/hybrid skorlarını hesaplar ve mevcut durumda aday kümesini yeniden seçip sıralaması için LLM provider'ına verir. Son adım `retainVerifiedRecommendations` ile yalnız aday havuzundaki `source:id` kayıtlarını tutar. Provider başarısızsa mock provider mevcut aday sırasının ilk üçünü döndürür.

### 2.2 Aşamalar

| Aşama | Mevcut dosya / fonksiyon | Girdi | Çıktı | Side effect | Fallback | Güvenilirlik | D6 V2 kararı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Request validation | [`route.ts:POST`](../app/api/ai/recommend/route.ts) | JSON body | `AiRecommendRequest` veya 400 | Yok | Array olmayan library/log/feedback alanları boş diziye çevrilir | Düşük-orta; yalnız JSON ve boş `message` doğrulanıyor, settings/mode/alan codec'i yok | Değişecek: ortak runtime codec, boyut sınırı ve enum validation |
| Client request mapping | [`ai-advisor.tsx:runApi`](../components/ai-advisor.tsx) | Prompt, library, logs, settings, owner feedback | POST payload | Network isteği; istemci timeout'u | API başarısızsa library-only modunda client fallback, dış kaynak modlarında boş sonuç | Orta; client/server tipleri kopyalı | Korunacak, ortak contract'a taşınacak |
| Intent parsing | [`intent-analyzer.ts:analyzeIntent`](../lib/ai/intent-analyzer.ts) | Kullanıcı mesajı | `AiIntent` | Yok | Heuristik general/mood/reference sınıflaması | Düşük-orta; `avoid` daima `[]`, constraint/strength/source yok | Değişecek: registry-driven constraint parser; LLM opsiyonel yapılandırıcı |
| Follow-up merge | [`route.ts:buildProviderMessage`](../app/api/ai/recommend/route.ts), [`ai-advisor.tsx:buildFollowUpRequest`](../components/ai-advisor.tsx) | Aktif konuşma ve kısa cevap | Birleşik prompt/context | Client session state | Açık yeni görevde bağlam atılır | Orta; client ve server heuristikleri dağınık | Compatibility adapter ile korunacak, intent katmanına taşınacak |
| Library profile | [`profile-builder.ts:buildLibraryProfile`](../lib/ai/profile-builder.ts) | `MediaItem[]`, logs, settings | Top genre/tag, rating/favorite/progress grupları | Yok | Toggle kapalıysa ilgili grup boş | Orta; tüketim sıklığı ile beğeni ayrışmıyor | Değişecek: exposure ve affinity ayrı profiller |
| Provider planning | [`provider.ts:getProviderSequence`](../lib/ai/provider.ts), `route.ts:runPlanningWithProviders`, provider `generateRetrievalPlan` | Mesaj, intent, profil, settings | `AiRetrievalPlan` | Remote LLM çağrısı olabilir | Deterministik plan veya clarification/safe fallback | Orta; plan guardrail'i tür/kaynak uyumunu sınırlar, aspect constraint'i yok | Değişecek: deterministik provider plan ana yol; LLM yalnız intent/clarification |
| Candidate retrieval | [`candidate-search.ts:searchCandidatesWithDebug`](../lib/ai/candidate-search.ts), `searchSourceApiCandidates` | Onaylı structured request, intent, plan, scope | `AiCandidate[]` + telemetry | Dahili API route fetch'leri | Ranked-tag hard request'te canonical tag strict/relaxed; generic isteklerde provider planı | Yüksek; provider ID ve requested tag kaynağı izlenir | D6.6-1R'de structured ranked-tag must havuz sahipliğini alır; title plan hard constraint'i silemez |
| Web fallback | [`candidate-search.ts:searchWebResearchCandidates`](../lib/ai/candidate-search.ts), `searchWeb` | Web query | HTML hit'lerinden türetilen query; sonra provider adayları | DuckDuckGo HTML fetch | Source API aggregator | Düşük; HTML selector/scraping kırılgan | Baseline'dan çıkarılacak veya ayrı deneysel discovery adapter'ı olacak; kimlik kanıtı sayılmayacak |
| Verification | Provider API route'ları; [`engine-status.ts:retainVerifiedRecommendations`](../lib/ai/engine-status.ts) | Provider sonuçları ve LLM seçimi | Kaynak kimlikli aday / seçim | Provider fetch | Kimliksiz/aday havuzu dışı LLM seçimi atılır | Orta; kimlik doğrulanır, ancak aktif POST akışında `verifyCandidateIdeasWithDebug` kullanılmıyor ve telemetry boş nesneden geliyor | Değişecek: explicit `IdentityEvidence`; doğrulanmamış eser fail-closed |
| TVMaze anime policy | Şu an yok; [`tvmaze/search/route.ts`](../app/api/tvmaze/search/route.ts) her sonucu `tv` normalize eder | TVMaze show | Sıradan TV adayı | Yok | Yok | Düşük | D6-2'de yalnız recommendation TV havuzuna classifier uygulanacak |
| Dedupe | [`candidate-search.ts:dedupeCandidates`](../lib/ai/candidate-search.ts) | Aday listeleri | Aynı `source:id` tek kayıt | Yok | Yok | Düşük-orta; cross-provider duplicate çözülmez | Değişecek: canonical identity graph + exact/secondary IDs |
| Library exclusion | `route.ts` `libIndex`; [`candidate-scorer.ts:scoreCandidates`](../lib/ai/candidate-scorer.ts) | Library external ID'leri ve aday | Library'de olan dış adaylar reject | Yok | Başlık tabanlı cross-provider fallback yok | Orta; yalnız aynı provider kimliği | Değişecek: canonical identity üzerinden kesin exclusion |
| Rule scoring | [`candidate-scorer.ts:scoreCandidates`](../lib/ai/candidate-scorer.ts) | Aday, profil, intent, mesaj | `score`, `scoreReasons`, reject listesi | Yok | Skor 0'dan başlar | Orta-düşük; additive, regex tekrarları ve genre centrality varsayımları var | Yerine hard filters + ayrı skor boyutları gelecek |
| Feedback scoring | [`feedback-aware-scorer.ts:applyFeedbackAwareScoring`](../lib/ai/feedback-aware-scorer.ts) | Adaylar ve son 300 event | Exact reject, benzer/source/type boost/ceza | Yok | Feedback yoksa değişiklik yok | Orta; exact dismissal güvenli, geniş source/type genellemesi riskli | Değişecek: exact item ve reason/aspect feedback ayrılacak |
| Embedding similarity | [`embedding-provider.ts:embedManyWithFallback`](../lib/ai/embedding-provider.ts), [`embedding-similarity-scorer.ts`](../lib/ai/embedding-similarity-scorer.ts) | Candidate/profile metni | Gerçek Python vektörü varsa embedding score | Memory/persistent embedding cache; local service çağrısı | Hash tabanlı local mock | Karma: scorer yalnız gerçek 384-boyut Python vektörünü kabul eder; mock skor üretmez | Korunacak ilke; mock test-only olacak, gerçek model yoksa skor 0 |
| Text similarity | [`text-similarity-scorer.ts:applyTextSimilarityScoring`](../lib/ai/text-similarity-scorer.ts) | Tokenize candidate/profile metni | Jaccard tabanlı -3..3 | Yok | Profil yoksa 0 | Orta-düşük; lexical sinyaldir, semantik kanıt değildir | Soft personal-fit sinyali olarak değişecek; aspect evidence sayılmayacak |
| Hybrid scoring | [`hybrid-feature-builder.ts`](../lib/ai/hybrid-feature-builder.ts), [`hybrid-scorer.ts`](../lib/ai/hybrid-scorer.ts) | Rule, feedback, content, behavior, popularity, text, embedding | Tek additive `finalScore` | Yok | Eksik boyut 0 | Düşük-orta; hard/soft ayrımı yok | Kaldırılacak; breakdown + deterministik sort key gelecek |
| Final ranking | `runDeterministicRecommendationV2`; legacy `runRankingWithProviders` production branch değildir | Doğrulanmış aday, structured request, evidence sidecar | Hard-filter sonucu, score breakdown, deterministik sıra ve grounded açıklama | Opsiyonel verifier dışında yok | Structured-only ile devam | Deterministik; confidence/coverage provider metadata'ya bağlı | D6-3'te uygulandı; LLM final seçim/sıra vermez |
| Safe fallback | `route.ts` deterministic plan/empty response; [`mock-provider.ts`](../lib/ai/providers/mock-provider.ts); client local fallback | Provider/retrieval/ranking hatası | Mevcut havuzdan deterministik öneri veya boş sonuç | Yok | Katmanlı fallback | Orta; dış kaynak modunda library fallback yapılmaması doğru | Korunacak, fakat engine mode ve confidence açık olacak |
| Response mapping | Provider mapper'ları, `retainVerifiedRecommendations`, `buildAiEngineStatus`, client `runApi` | Aday/LLM çıktısı | `AiRecommendResponse` ve UI model | Yok | Geçersiz shape client'ta null/fallback | Orta; public response ile geniş debug tipi iç içe | Değişecek: public read-model, internal trace ve ops telemetry ayrılacak |
| Feedback persistence | [`ai-advisor.tsx:recordRecommendationFeedback`](../components/ai-advisor.tsx), [`recommendation-feedback.ts`](../lib/ai/recommendation-feedback.ts), [`local-state.ts`](../lib/ai/local-state.ts) | shown/dismissed/added/similar/open events | Owner-scoped local state, en çok 1000 event | Yerel personal-data storage yazımı | Yazma hatası UI uyarısı | Orta-yüksek; owner scope var, reason-level veri yok | Korunacak; schema version ve reason/aspect alanları eklenecek |

## 3. Mevcut teknik borç audit'i

Önem: `Kritik` yanlış eser/hard constraint ihlali veya gizlilik riski; `Yüksek` kullanıcı güvenini/sıralamayı doğrudan bozar; `Orta` bakım ve açıklanabilirlik riski; `Düşük` sınırlı temizlik.

| Bulgu | Önem | Kullanıcı etkisi | D6 aşaması | Önerilen çözüm |
| --- | --- | --- | --- | --- |
| `route.ts:POST` validation, follow-up, planning, retrieval, fallback, policy, beş scorer, LLM ranking, debug ve response mapping'i tek fonksiyonda topluyor | Yüksek | Bir kural değişikliği başka modu sessizce etkileyebilir | D6-1…D6-3 | Compatibility route'u ince orchestration facade yap; domain use-case'leri sırayla çıkar |
| `Game of Thrones` ve `Solo Leveling` için `buildExcludedSourceTitles` / `extractDeterministicTaste` içinde eser-spesifik listeler ve regex'ler var | Yüksek | Bazı başlıklara ayrıcalıklı/öngörülemez davranış, franchise aşırı dışlama | D6-1/D6-3 | Eser-spesifik kodu kaldır; canonical franchise identity ve registry-driven aspect evidence kullan |
| Aynı romance/dark/fantasy/action vb. regex'leri intent, retrieval, AniList filters, candidate scorer ve hybrid builder'da tekrarlanıyor | Yüksek | Aynı istek farklı aşamalarda farklı yorumlanır | D6-1 | Merkezi aspect registry + ayrı provider mapping modülleri |
| `AiSettings`, `AiRecommendation`, active context ve debug tipleri client ile `lib/ai/types.ts` arasında kopyalı | Orta | Contract drift ve eksik alanların sessiz kaybı | D6-1 | Tek shared public contract; client view-state tiplerini ayrı tut |
| `intent-analyzer.ts` her zaman `avoid: []` döndürüyor; LLM planındaki `avoidSignals` retrieval/debug'da var ama deterministik avoid filtresi yok | Kritik | “Aşk üçgeni olmasın” gibi açık yasaklar garanti edilmez | D6-1/D6-3 | `Constraint(kind=avoid, source=explicit)` parse et; evidence-aware hard filter uygula |
| Genre/tag/subject kesişimi aspect merkeziliği gibi puanlanıyor; genre varlığı primary/significant olduğunu kanıtlamıyor | Kritik | “Güçlü romantizm” isteğinde incidental romance yüksek sayılabilir | D6-1/D6-3 | `strength/level/confidence` aggregation; provider rank/relevance ve verifier ayrımı |
| Local hash/mock embedding vektörü üretiliyor ve engine mode'da gösteriliyor | Orta | “Embedding çalıştı” algısı doğabilir | D6-3 | Mock yalnız test altyapısı; üretim semantic score 0 ve status `structured_only`/`model_unavailable` |
| Pozitif nokta: `embedding-similarity-scorer` yalnız `python_service`, 384 boyut gerçek vektörleri skorlar; hash/mock final embedding score'u etkilemiyor | Düşük | Mevcut false semantic score riski azaltılmış | D6-1/D6-3 | Davranışı sözleşmeye bağla ve regresyon testi ekle |
| Hybrid score additive; popularity, behavior, text ve embedding aynı toplamda hard constraint ayrımı olmadan birleşiyor | Kritik | Popüler veya profile yakın eser, açık must/avoid ihlaline rağmen yükselebilir | D6-3 | Hard filter sonucu ile soft score breakdown'ı ayır |
| LLM provider havuzdan 3-5 adayı serbestçe seçip sıralıyor; ön-skor sadece prompt tavsiyesi | Kritik | Deterministik sıra bozulabilir, aynı girdide sonuç oynar | D6-3 | Final deterministic scorer; LLM yalnız grounded explanation wording |
| DuckDuckGo HTML scraping `result__a`/`result__snippet` selector'larına bağlı | Yüksek | Sessiz 0 sonuç, kırılganlık ve değişken latency | D6-2 veya scope dışı | Baseline discovery'den çıkar; gerekiyorsa deneysel ve source-verified query hint olarak izole et |
| TVMaze tüm sonuçları `type: tv` normalize ediyor; anime exclusion yok | Kritik | Anime TV öneri havuzuna sıradan dizi olarak girebilir | D6-1 contract, D6-2 uygulama | Recommendation-only classifier + `tvmaze_anime_excluded` sayacı |
| TVMaze raw tipinde `network/webChannel.country.code` var; `show.type` yok. Normalized result country/type'ı kaybediyor | Yüksek | Önerilen yüksek-olasılıklı anime sınıflandırması mevcut contract ile kurulamaz | D6-1/D6-2 | Raw tipe `type`; recommendation adapter'a classification inputs ekle; global route davranışını değiştirme |
| AniList arama query'si tag rank/relevance çekmiyor; candidate adapter synonyms, country, popularity ve relations'ı daraltıyor | Yüksek | Aspect strength ve franchise dedupe kanıtı kayboluyor | D6-2 | Tags `{name, rank, isGeneralSpoiler...}` ve gerekli identity fields için bounded enrichment |
| TMDB search film-only; genre IDs, vote/popularity normalizer'da atılıyor; TV discovery ve keyword fetch yok | Yüksek | Film/TV evidence zayıf, provider sahipliği hedefi karşılanmıyor | D6-2 | Recommendation adapter'ında multi/discover + genres/keywords; global search contract'ını adapter ile koru |
| Open Library subjects ilk 5'e kırpılıyor, description çoğunlukla yok; edition/ISBN candidate domain'e taşınmıyor | Orta | Kitap aspect evidence ve cross-provider identity zayıf | D6-2 | Work/edition ayrımı, ISBN/author/subject provenance ve description enrichment |
| Dedupe yalnız `source:id`; TMDB/OMDb aynı film, farklı provider kimlikleriyle iki aday olabilir | Kritik | Duplicate öneri ve library exclusion kaçışı | D6-2/D6-3 | Canonical identity: IMDb, ISBN, provider relations ve kontrollü title/year fallback |
| `runRetrievalPlan` içinde planner `tmdb` seçse bile `searchOmdb` çağrılıyor | Yüksek | Debug/plan ile gerçek provider farklılaşır | D6-1/D6-2 | Provider dispatch tek registry'den; contract testi |
| `verifyCandidateIdeasWithDebug` mevcut fakat POST akışında kullanılmıyor; `emptyVerificationResult` debug sayılarını sıfır tutuyor | Orta | “Verification” telemetry gerçek aşamayı temsil etmiyor | D6-1/D6-2 | Identity verification'ı explicit stage yap; ölü candidate-idea yolunu adapter olarak kaldır/taşı |
| Public response `debug` içinde provider hata kodları, query'ler, source title'ları ve internal notlar taşıyor; UI public engine status ile aynı response'u tüketiyor | Yüksek | Contract şişmesi ve yanlışlıkla iç ayrıntı gösterme riski | D6-1/D6-4 | `RecommendationReadModel`, `EngineStatus`, internal `RecommendationTrace` ayrımı |
| Feedback exact dismissal güvenli; fakat aynı source+type her event için -2, olumlu aynı type/source için toplu boost veriyor | Yüksek | Bir adayı reddetmek bütün provider/type ailesini kör cezalandırabilir | D6-3/D6-4 | Exact item feedback ve reason/aspect feedback ayrı; decay/cap; source tek başına preference değil |
| Profil `topGenres/topTags/byType` değerlerini tüketim sayısından çıkarıyor; beğenilme ve maruz kalma ayrımı eksik | Yüksek | Çok tüketilen ama sevilmeyen tür kişisel uyum sanılabilir | D6-1/D6-3 | `ExposureProfile` ve `AffinityProfile`; rating/favorite/completion/dismissal ayrı ağırlık ve provenance |
| Global Search ile recommendation search aynı API route'larını kullanıyor fakat normalize/mapping kodunu ayrı ayrı kopyalıyor | Orta | Aynı provider alanı bir akışta korunup diğerinde kaybolabilir | D6-2 | Ortak provider client + normalize domain; global/recommendation policy adapter'ları ayrı |
| `CLAUDE.md` web modunu “gerçek web search yok”, TMDB'yi pasif diye anlatıyor; mevcut kod DuckDuckGo scraping ve aktif TMDB source-API yoluna sahip | Orta | Teknik sözleşme yanlış yönlendirebilir | D6-5 | D6 kodu tamamlandıktan sonra teknik doküman hizalama; bu aşamada protected/read-only kabul edildi |
| `AI_RECOMMENDATION_DEMO.md` “aday doğrulama aşaması”nı genelliyor ve local mock embedding'i engine modu olarak sunuyor | Orta | Demo kanıtı, gerçek semantic/verification garantisinden güçlü algılanabilir | D6-5 | D6 V2 engine status ve evidence terminology'sine göre güncelle |

## 4. V2 domain sözleşmesi

### 4.1 Constraint

```ts
type ConstraintKind = "must" | "prefer" | "avoid";
type ConstraintSource = "explicit" | "inferred" | "profile";
type Strictness = "strict" | "balanced" | "exploratory";

interface RecommendationConstraint {
  id: string;
  kind: ConstraintKind;
  source: ConstraintSource;
  field: "media_type" | "length" | "year" | "language" | "status" | "aspect";
  operator: "eq" | "lte" | "gte" | "contains" | "level_at_least";
  value: string | number;
  aspectId?: AspectId;
  threshold?: "primary" | "significant" | "incidental";
  originalText?: string;
}
```

Kurallar:

- Explicit `must`, strictness tarafından `prefer`e indirgenmez.
- Profile sinyali otomatik `must` olamaz; en fazla `prefer` olur.
- `avoid`, yokluğu kanıtlanamayan unsupported aspect için “absent” varsaymaz.
- Exploratory mod explicit must ihlal eden adayı normal sonuçlara karıştırmaz.
- Yakın eşleşmeler ayrı `nearMatches` read-model'ında gösterilebilir; ihlal edilen constraint ve evidence durumu açıkça yazılır.
- Popularity, quality veya personal fit bir must ihlalini telafi edemez.

### 4.2 Örnek parse

İstek: “Güçlü romantizmi olan, 13 bölümden kısa fantastik anime öner; aşk üçgeni olmasın.”

```json
{
  "strictness": "balanced",
  "constraints": [
    { "field": "media_type", "operator": "eq", "value": "anime", "kind": "must", "source": "explicit" },
    { "field": "aspect", "aspectId": "romance", "operator": "level_at_least", "threshold": "significant", "value": "significant", "kind": "must", "source": "explicit" },
    { "field": "length", "operator": "lte", "value": 13, "kind": "must", "source": "explicit" },
    { "field": "aspect", "aspectId": "fantasy", "operator": "level_at_least", "threshold": "incidental", "value": "incidental", "kind": "prefer", "source": "explicit" },
    { "field": "aspect", "aspectId": "love_triangle", "operator": "level_at_least", "threshold": "significant", "value": "significant", "kind": "avoid", "source": "explicit" }
  ]
}
```

`fantasy` doğrudan söylendiği için baseline gold label `explicit`tir. İleride yalnız bağlamdan çıkarılırsa aynı `prefer` constraint `inferred` olabilir.

### 4.3 Strictness semantiği

| Mod | Must | Unknown | Avoid | Near match |
| --- | --- | --- | --- | --- |
| Strict | Structured high confidence veya birbirinden bağımsız medium-confidence çoklu kanıt gerekir | Elenir | `significant+` ve high/medium confidence elenir; düşük güven de riskli kabul edilir | Ayrı liste, varsayılan kapalı |
| Balanced | Explicit must yine zorunludur; high veya tutarlı çoklu medium kabul edilir | Explicit must için elenir | `significant+` high/medium elenir; low confidence uyarı üretir | Ayrı liste gösterilebilir |
| Exploratory | Normal listede explicit must aynen korunur | Normal listede elenir | Kesin avoid ihlali normal listeden elenir | Ayrı read-model; ihlal ve belirsizlik görünür |

## 5. Aspect evidence aggregation

```ts
type AspectLevel = "primary" | "significant" | "incidental" | "absent" | "unknown";
type EvidenceConfidence = "high" | "medium" | "low" | "unknown";
type VerifierMode = "structured_only" | "local_enhanced" | "remote_enhanced" | "not_run";

interface AspectEvidenceSource {
  kind:
    | "provider_genre"
    | "provider_tag_rank"
    | "provider_keyword"
    | "provider_subject"
    | "synopsis_classifier"
    | "local_semantic_verifier"
    | "remote_llm_verifier"
    | "user_feedback";
  provider?: "anilist" | "tvmaze" | "tmdb" | "omdb" | "openlibrary";
  field?: string;
  rawValue?: string | number | boolean;
  normalizedStrength?: number;
  confidence: EvidenceConfidence;
  observedAt?: string;
}

interface AspectEvidence {
  aspectId: AspectId;
  strength: number | null;
  level: AspectLevel;
  confidence: EvidenceConfidence;
  sources: AspectEvidenceSource[];
  supportingEvidence: AspectEvidenceSource[];
  contradictoryEvidence: AspectEvidenceSource[];
  verifierMode: VerifierMode;
  warnings: string[];
}
```

Aggregation kuralları:

- `strength` internal 0–1 değeridir; kullanıcı contract'ı `level` ve `confidence` üzerinden okunur.
- Başlangıç eşikleri: `primary >= 0.75`, `significant >= 0.50`, `incidental >= 0.20`, `absent < 0.20`. Bu eşikler D7 gold setiyle kalibre edilmeden kalite iddiası değildir.
- `absent` yalnız provider/verifier bu aspect'i değerlendirebiliyor ve yeterli negatif kanıt üretiyorsa kullanılabilir. Alanın eksikliği `unknown`dur.
- Provider ve verifier kanıtları ayrı listelerde kalır; verifier provider kanıtını sessizce ezmez.
- Bağımsız destekler confidence'ı yükseltebilir; açık çelişki confidence'ı düşürür ve warning üretir.
- Unsupported aspect için sahte `absent` veya sıfır strength üretilmez: `strength=null`, `level=unknown`, `confidence=unknown`.
- `user_feedback` kişisel uyumu etkileyebilir; provider gerçekliğini değiştiren metadata kanıtı değildir.

### 5.1 Evidence cache ve kişisel veri sınırı

Persistence bu aşamada uygulanmaz. D6-2'de iki ayrı read-model tasarlanır:

1. `ProviderEvidenceCache`: yalnız public provider metadata ve türetilmiş aspect evidence. Anahtar `provider + externalId + providerPayloadFingerprint + registryVersion + extractorVersion`. TTL provider/alan bazlıdır; provider `updatedAt` varsa önceliklidir.
2. `PersonalRecommendationState`: owner-scoped profile/feedback. Provider cache anahtarına veya payload'una kullanıcı rating, favorite, progress, note, prompt ya da feedback girmez.

Verifier sonucu cache'lenirse anahtara ayrıca `verifierMode + modelId + modelVersion + prompt/schemaVersion + inputFingerprint` eklenir. Registry, extractor veya model değişince sonuç invalid olur. Remote verifier'a kişisel notlar varsayılan olarak gönderilmez.

## 6. TVMaze anime exclusion sözleşmesi

### 6.1 Koddan doğrulanan alanlar ve gap

[`lib/tvmaze-types.ts`](../lib/tvmaze-types.ts) raw show için `genres`, `language`, `network.country.code` ve `webChannel.country.code` alanlarını modeller. TVMaze response'unda kullanılmak istenen `show.type` mevcut TypeScript tipinde yoktur. [`app/api/tvmaze/search/route.ts`](../app/api/tvmaze/search/route.ts) her sonucu `type: "tv"` yapar; normalized result ülke kodunu ve show type'ını taşımaz. Bu nedenle D6-1 contract'ında `show.type?: string | null` ve recommendation-classification input'u eklenmeden yüksek-olasılıklı sınıflandırma uygulanamaz.

### 6.2 Sınıflandırma

```ts
definiteAnime = genres.some(caseInsensitiveEquals("Anime"));
probableAnime = show.type === "Animation" && (
  language === "Japanese" ||
  network?.country?.code === "JP" ||
  webChannel?.country?.code === "JP"
);
excludeFromRecommendationTvPool = definiteAnime || probableAnime;
```

- Yalnız `Animation` olmak anime sayılmaya yetmez; Batı animasyonu tutulur.
- Anime hedefinde provider planı TVMaze'i hiç çağırmaz; kaynak AniList'tir.
- TV hedefinde classifier `definite` ve `probable` anime kayıtlarını yalnız recommendation havuzundan eler.
- Bu kayıtlar AniList havuzuna dönüştürülmez; TVMaze ID'si AniList kimliği değildir ve metadata kapsamları aynı değildir.
- Debug/trace sayacı `tvmaze_anime_excluded` olur; public response'ta zorunlu değildir.
- False positive riski: Japon yapımı fakat anime olmayan animasyon. Azaltma: `Animation AND (Japanese/JP)` koşulu ve ayrı classifier reason.
- False negative riski: `genres` Anime değil, type/language/country eksik veya uluslararası ortak yapım. Sonuç `unknown/non-excluded` olabilir; D7 fixture'larıyla ölçülür.
- Global manuel arama ve Release Calendar farklı use-case'lerdir. Recommendation filtresi ortak route'a gömülmez; recommendation adapter/policy katmanında uygulanır. Böylece kullanıcı anime kaydını manuel aramada bulmaya ve takvim metadata'sını görmeye devam eder.

## 7. Ranking sözleşmesi

```ts
interface RecommendationScoreBreakdown {
  requestFit: number;           // 0..1, evidence confidence ile cap'lenmiş
  personalFit: number;          // 0..1
  evidenceConfidence: number;   // 0..1
  qualitySignal: number;        // 0..1, sınırlı
  novelty: number;              // 0..1
  diversityContribution: number;// 0..1, rerank aşamasında
}

interface RankedCandidate {
  identityVerified: true;
  hardFilter: {
    eligible: boolean;
    failedConstraints: string[];
    warnings: string[];
  };
  scores: RecommendationScoreBreakdown;
  deterministicSortKey: readonly (string | number)[];
}
```

Pipeline sırası:

1. Kimlik ve metadata hijyeni.
2. Medya türü ve objektif filtreler.
3. Must aspect filtreleri.
4. Avoid filtreleri.
5. `requestFit`.
6. `personalFit`.
7. `evidenceConfidence`.
8. `novelty`, ardından sınırlı `qualitySignal/popularity` tie-break.
9. Franchise/season-aware diversity reranking.

Deterministik sort key örneği:

```ts
[
  requestFitBucketDesc,
  personalFitDesc,
  evidenceConfidenceDesc,
  noveltyDesc,
  qualitySignalDesc,
  canonicalIdentityAsc
]
```

- Must ihlal eden aday scored listesine girmez.
- `requestFit`, destekleyen evidence confidence ile cap'lenir; unknown kanıt yüksek request fit üretemez.
- Popularity yalnız eşit veya çok yakın uygunlukta sınırlı tie-break'tir.
- Exact item feedback, aynı item'i suppress/reject edebilir. Aspect-level feedback yalnız açık reason seçimiyle ilgili aspect'e etki eder.
- Dismissal source/type geneline kör ceza vermez.
- Aynı franchise/season ilk sonuçları dolduruyorsa diversity rerank uygulanabilir; bu rerank daha düşük request-fit bucket'ını daha yükseğin önüne geçirmez.
- Sonuç sayısı kaliteyi 5'e tamamlamak için zorlanmaz; 0–5 doğrulanmış normal sonuç geçerlidir.

## 8. Semantic verifier modları

### Structured only

- Her zaman çalışır; ücretsiz ve deterministiktir.
- Provider genre/tag/keyword/subject/identity/length/status kanıtını kullanır.
- Unsupported veya eksik alan `unknown` üretir.

### Local enhanced

- Opsiyonel yerel Python servisi, yalnız structured evidence ile belirsiz kalan top-N adayda synopsis/aspect classification veya gerçek embedding çalıştırır.
- Bounded input, top-N ve timeout kullanır; hata/timeout structured-only sonuca düşer.
- Kullanıcı verisi cihaz sınırında kalır; servis ayrı process olsa bile payload allowlist uygulanır.
- Model unavailable bir istek hatası değil, düşük confidence/structured-only modudur.

### Remote enhanced

- Opsiyonel remote LLM verifier yalnız candidate public metadata'sını alır; kişisel notlar varsayılan olarak gönderilmez.
- JSON schema ile `aspectId`, destek/çelişki span'ları, strength önerisi ve confidence döndürür.
- Başlık üretmez, aday eklemez, final filtre/sıra kararı vermez.
- Top-N, günlük/istek başı bütçe, concurrency, timeout, rate-limit ve maliyet tavanları zorunludur.

Ortak kararlar:

- Gerçek model yoksa embedding score `0`dır.
- Hash/mock vector semantic evidence değildir ve production explanation'da anılmaz.
- Engine status kullanıcıya `structured_only`, `local_enhanced`, `remote_enhanced` veya `model_unavailable` gerçek modunu gösterir.
- Verifier başarısızlığında provider evidence korunur; confidence düşer veya `unknown` olur.

## 9. Hedef feature mimarisi

```text
features/recommendations/
  domain/          # identity, constraints, aspects, evidence, ranking contracts
  intent/          # parser, codec, clarification
  retrieval/       # provider plan, query strategy, candidate pool
  providers/       # source adapters and capability mappings
  evidence/        # aggregation, verifier ports, cache/read-model
  ranking/         # hard filters, score breakdown, deterministic sort, diversity
  feedback/        # owner-scoped exact/reason-level feedback
  explanation/     # deterministic templates + optional grounded wording
  orchestration/   # use-case pipeline and trace
  ui/              # client read-model and editable constraints
```

### 9.1 Mevcut dosya geçiş haritası

| Mevcut dosya | Hedef | Bölünme / korunacak contract | Geçici adapter |
| --- | --- | --- | --- |
| `app/api/ai/recommend/route.ts` | `orchestration/recommend.ts` + ince route | Request/response HTTP contract geçici korunur | Eski payload'ı V2 command'a çeviren route codec |
| `lib/ai/types.ts` | `domain/*` + `ui/read-model.ts` | Public `AiRecommendRequest/Response` V1 adapter ile korunur | `legacy-contract-adapter.ts` |
| `lib/ai/intent-analyzer.ts` | `intent/heuristic-parser.ts` | `analyzeIntent` çağrısı önce wrapper kalır | Eski `AiIntent` -> V2 constraints adapter |
| `lib/ai/candidate-search.ts` | `retrieval/*`, `providers/*`, `evidence/identity.ts` | Provider fetch/normalize davranışı parça parça taşınır | Eski export'lar yeni use-case'lere delegate eder |
| `lib/ai/provider.ts` | `intent/llm-intent-provider.ts`, `explanation/llm-wording-provider.ts` | Env/provider sırası korunur; ranking port'u kaldırılır | V1 provider facade |
| `lib/ai/providers/*` | `intent/providers/*`, `explanation/providers/*` | JSON parsing ve timeout ortaklaştırılır | Mevcut `AiProvider.generate` D6-3'e kadar adapter |
| `lib/ai/candidate-scorer.ts` | `ranking/request-fit.ts`, `ranking/hard-filters.ts` | Mevcut score telemetry karşılaştırma için shadow hesaplanabilir | V1 scorer adapter, D6-3'te emekli |
| `feedback-aware-scorer.ts` | `feedback/signals.ts`, `ranking/personal-fit.ts` | Exact dismissal korunur | Legacy event -> reason-aware event adapter |
| `hybrid-feature-builder.ts`, `hybrid-scorer.ts` | `ranking/score-breakdown.ts`, `ranking/sort.ts` | Public candidate score alanları geçici map edilir | Shadow comparison adapter |
| `text-similarity-scorer.ts` | `ranking/personal-fit/text-similarity.ts` | Soft lexical sinyal; evidence değildir | Aynı fonksiyon wrapper'ı |
| `embedding-*` | `evidence/verifiers/local/*` ve `ranking/personal-fit/*` | Gerçek model gate/caching korunur | Mock yalnız test adapter'ı |
| `profile-builder.ts` | `feedback/profile/exposure.ts`, `affinity.ts` | Settings toggle semantiği korunur | V1 `LibraryProfile` projection |
| `recommendation-feedback.ts`, `local-state.ts` | `feedback/storage/*` | Owner scope, bounded events ve local-first davranış korunur | Schema v1 -> v2 codec |
| `components/ai-advisor.tsx` | `ui/advisor/*` | Kullanıcı akışı, sessions ve Quick Add contract'ı korunur | V1 response -> V2 read-model adapter |
| Provider search route'ları | `providers/*/adapter.ts` tarafından tüketilir | Global Search public response'ları korunur | Recommendation-only enrichment endpoint/port; global behavior değişmez |
| `components/global-search.tsx` | Discovery feature sınırında kalır | Ortak provider client/normalizer kullanır, policy paylaşmaz | Global-specific mapping adapter |

Big-bang rewrite yapılmaz. Her D6 alt aşamasında route ve UI çalışır kalır; yeni domain önce adapter arkasında, sonra shadow/read-model, en son authoritative path olarak devreye alınır.

## 10. Public read-model ile internal trace ayrımı

Public response yalnız kullanıcı için gerekli alanları taşır:

- Parsed/editable constraints.
- Normal recommendations ve ayrı `nearMatches`.
- Her sonuç için grounded reason, warnings ve sınırlı score breakdown.
- Gerçek engine/verifier mode ve fallback özeti.

Internal trace; query listeleri, provider hata kodları, filtre sayaçları, cache istatistikleri ve model teknik ayrıntılarını kapsar. Development-only gated telemetry'dir; public API'nin zorunlu contract'ı değildir ve kişisel not/prompt/raw provider body içermez.

## 11. D6-1/D6-2/D6-3 uygulama durumu ve D6-4 sınırı

D6-1 tamamlandı; domain ayrıntıları [AI Recommendation V2 Domain](AI_RECOMMENDATION_V2_DOMAIN.md) belgesindedir.

- Ortak tipler, 43-aspect registry, strength/evidence/constraint/request codec'leri ve strictness/near-match policy'leri `features/recommendations/domain/` altında izoledir.
- D6-2 provider adapter'ları, exact identity policy, raw evidence sidecar ve bounded cache `features/recommendations/providers/` altındadır; ayrıntı [Provider Enrichment](AI_RECOMMENDATION_V2_PROVIDER_ENRICHMENT.md) belgesindedir.
- TVMaze classifier yalnız recommendation candidate pipeline'ına bağlandı. Global search route'u, details/Quick Add ve release calendar filtrelenmez.
- D6-3 raw claim normalization, `AspectEvidence` aggregation, objective/aspect hard filter, ayrı score breakdown, deterministik sort key, diversity rerank ve grounded açıklamayı `features/recommendations/` içinde uygulamıştır. Ayrıntı [AI Recommendation V2 Ranking](AI_RECOMMENDATION_V2_RANKING.md) belgesindedir.
- External recommendation final seçimi artık `runDeterministicRecommendationV2` tarafından yapılır; LLM retrieval planning için kalabilir fakat final aday/sıra kararı vermez. V1 scorer/embedding yolu authoritative production branch değildir.
- D6-4 tamamlandı: `/api/ai/interpret`, onaylı structured request transport'u, editable constraint/strictness UI, ayrı near-match ve reason-level owner feedback eklendi. D6-3 deterministik sıra anahtarı korunmuştur.
- D6.6-1 tamamlandı: Türkçe morphology-aware longest-match parser, 43 aspect evidence strategy, provider override'ları, capability read-model/server validation, ranked-tag band policy ve weighted explicit coverage eklendi. Deterministik sıra `requestFit → evidenceConfidence → personalFit → qualitySignal → novelty → exact identity` olarak güncellendi; LLM final ranking'e girmedi.
- D6.6-1R tamamlandı: `AspectProviderRetrievalMapping`, AniList canonical tag allowlist'i, `minimumTagRank=40/20` strict/relaxed discovery, bounded çoklu must pass'i, ranked-tag candidate-pool gate'i ve kontrollü no-result ayrımı eklendi. Structured tag yolu havuzun sahibiyken LLM/provider title fallback çalışmaz.
