# D7 Grounded Aspect Research Engine Mimarisi

Tarih: 8 Ağustos 2026
Durum: D7-R3B provider-neutral grounded extraction ve deterministic research decision tamamlandı; production entegrasyonu yoktur.

## 1. Karar ve sınır

D7'nin aktif release hattı **Grounded Aspect Research Engine**'dir. D6 Deterministic Recommendation V2; candidate uygunluğu, hard constraint, near-match, skor ve final sıra için tek authoritative katman olarak kalır. LLM aday seçmez, aday eklemez, final sıralama yapmaz ve eksik kanıtı `absent` diye tahmin etmez.

Önceki Aspect Verifier, gold annotation ve training hattı release yolundan çıkarılmıştır. Annotation araçları calibration/evaluation artifact'i olarak korunur. ML yalnız [post-release opsiyonel student/distillation planı](D7_ML_DEFERRED_PLAN.md) olabilir.

Bu belge hedef contract'ı tanımlar; route, provider, DB, migration, dependency veya runtime davranışı değiştirmez.

## 2. Neden pivot

Mevcut D7 planı doğru bir alt problemi, `CandidateTextBundle + aspect` sınıflandırmasını, yanlış release katmanında çözüyordu. Recommendation V2'nin güncel açığı genel bir classifier eksikliği değil; yalnız kısa/structured provider alanlarıyla çözülemeyen belirli `must`/`avoid` iddiaları için source-backed kanıt eksikliğidir. Human gold ve model calibration:

- yeni/değişen eserler için çalışma zamanında kaynak bulmaz;
- source revision, citation ve contradiction zinciri üretmez;
- metadata yokluğunu negatif kanıttan ayırmayı tek başına garanti etmez;
- release'i annotator, lisanslı corpus ve training yeterliliğine gereksiz yere bağlar.

Mevcut web fallback de research engine değildir. `candidate-search.ts`, DuckDuckGo HTML sonuç başlıklarını regex ile yeni title query'lerine dönüştürür; sonra structured provider araması yapar. Sayfa içeriği okunmaz, pasaj/citation saklanmaz, source trust uygulanmaz ve aspect claim çıkarılmaz. Bu yol yalnız kırılgan bir discovery hint'tir; evidence authority olamaz.

## 3. Değişmez invariant'lar

1. `runDeterministicRecommendationV2` uygunluk ve final sıra otoritesidir.
2. Structured provider evidence ilk ve temel kanıt katmanıdır.
3. Research öncelikle unresolved explicit `must`/`avoid`, bütçe kalırsa explicit `prefer` constraint için çalışır; inferred/profile sinyalleri, kişisel uyum ve popülerlik research bütçesi açamaz.
4. Missing field, boş snippet, arama sonucu bulunamaması veya provider unavailable `absent` değildir.
5. Research yalnız retrieval ile exact identity'si doğrulanmış top-N aday üzerinde çalışır.
6. Research sonucu citation-bound `AspectEvidence` girdisidir; deterministic policy'yi değiştirmez.
7. LLM yalnız sağlanan, temizlenmiş pasajlardan structured claim çıkarır.
8. Her pozitif veya negatif claim en az bir doğrulanmış source citation taşır; citation yoksa `unknown`.
9. Kullanıcı profili, prompt geçmişi, kişisel not, rating, favorite, progress ve feedback public evidence cache'e girmez.

## 4. End-to-end akış

```text
Structured request
  -> constraint capability split
  -> high-recall provider retrieval
  -> exact identity + edition/season isolation
  -> structured evidence aggregation
  -> unresolved explicit must/avoid/prefer queue
  -> bounded top-N targeted research
  -> exact-QID source acquisition + deterministic passage preparation
  -> citation-bound structured extraction
  -> contradiction-aware evidence merge
  -> deterministic hard filters
  -> prefer/request fit + personal fit
  -> deterministic ranking + near matches/no-result reason
```

Research bir candidate'ı retrieval havuzuna title benzerliğiyle sokmaz. Candidate önce authoritative provider identity'siyle havuzda bulunur. Structured değerlendirmede hard constraint `unknown` ise candidate hemen elenmek yerine geçici `research_pending` durumuna alınabilir. Bounded research tamamlanınca aynı D6 policy'si candidate'ı geçirir, reddeder veya `unknown` nedeniyle primary listeden çıkarır.

## 5. A. Candidate retrieval

### 5.1 Constraint sınıfları

- `queryable`: provider query/filter contract'ı candidate havuzunu kurabilir. Örnek: AniList canonical `Politics` tag mapping'i.
- `research_required`: güvenli hard karar için narrative centrality veya ilişki yapısı gerekir. Örnek: `character_driven`, `love_triangle`.
- `queryable_then_research`: taxonomy yüksek recall sağlar, merkezilik research ile doğrulanır. Örnek: `political_intrigue` için Politics retrieval.
- `unsupported`: ne güvenilir query mapping ne de izinli source research yolu vardır; capability validation üretir.

### 5.2 Havuz politikası

- Queryable `must` filtreleri provider-side yüksek recall için kullanılır; kesin hard eligibility sayılmaz.
- Research-required constraint title query'ye dönüştürülmez. Diğer objektif/queryable koşullar candidate havuzunu kurar.
- Birden çok `must` için bounded union/intersection pass'leri ve provider başına kota kullanılır; popularity yalnız recall/tie-break sinyalidir.
- Generic LLM title listesi, search-engine başlığı veya popularity candidate identity değildir.
- Candidate yalnız exact provider ID ile kabul edilir. Cross-provider merge yalnız IMDb/ISBN/provider relation gibi exact bridge ile yapılır.
- Franchise, remake, adaptation, edition, season/cour ve special birbirine karıştırılmaz. Research key exact canonical identity ile `versionScope` taşır; başka sezonun romance kanıtı hedef sezona uygulanmaz.

## 6. B. Evidence acquisition

Öncelik sırası:

1. Mevcut structured provider evidence.
2. Wikidata exact identity/mapping ve CC0 facts.
3. Wikipedia/MediaWiki'den exact page/revision ve direct licensed content.
4. Provider-neutral port üzerinden OpenAI, Groq Compound veya forced-Exa OpenRouter ile allowlist içinden ephemeral URL discovery.
5. Opsiyonel Brave Search adapter ancak ayrı audit sonrası aynı port ile.

Search provider sonucu tek başına aspect evidence değildir. Search, izinli direct source URL'sini bulur; mümkünse direct source fetch edilir ve passage bu içerikten üretilir. Source/storage kararları [D7 Research Source Policy](D7_RESEARCH_SOURCE_POLICY.md), tehdit modeli [D7 Research Security Model](D7_RESEARCH_SECURITY_MODEL.md) içindedir.

### Trust sınıfları

- `T1_structured_authoritative`: exact identity/provider veya Wikidata fact; kimlik ve bounded fact için.
- `T2_direct_licensed_reference`: Wikipedia/MediaWiki revision'lı direct content; narrative aspect için.
- `T3_allowlisted_secondary`: terms audit'i tamamlanmış editoryal/resmî kaynak; destekleyici narrative evidence.
- `T4_discovery_only`: OpenAI/Brave search result/snippet; URL discovery ve query telemetry dışında claim authority değildir.
- `blocked`: allowlist dışı, user-generated, dynamic redirect, lisansı belirsiz veya kimliği eşleşmeyen kaynak.

## 7. C. Research orchestration

### 7.1 Eligibility

Research task ancak aşağıdaki koşulların tamamında oluşturulur:

- constraint explicit `must`, `avoid` veya `prefer`; planner sırası `must > avoid > prefer`;
- candidate exact identity doğrulanmış;
- structured aggregation sonucu constraint için `unknown` veya karar eşiğinin altında güven;
- aspect registry source-backed research'e izin veriyor;
- aynı `candidateIdentity + versionScope + aspectId + policyVersion` için fresh cache miss var.

### 7.2 Bounded çalışma

D7-R1 başlangıç bütçeleri contract sabitidir; ölçüm olmadan artırılmaz:

- en çok 8 candidate;
- candidate başına en çok 3 unresolved aspect;
- toplam en çok 12 research job;
- toplam en çok 6 external search reservation;
- concurrency 2;
- request toplam research timeout/bütçesi 8 saniye.

Aynı normalized research key için in-flight request coalescing yapılır. Her stage bağımsız timeout/error üretir. Bir source veya provider hatası diğer evidence'i silmez. `provider_unavailable`, `no_allowlisted_source`, `no_relevant_passage`, `contradictory_sources` ve gerçek `supported/contradicted/unknown` sonuçları ayrıdır.

### 7.3 Fail-soft

- Research kapalı/unavailable ise structured-only V2 çalışır.
- Hard `must` unknown ise primary sonuçtan geçmez; exploratory modda gerekçeli near-match olabilir.
- `avoid` unknown candidate'ı otomatik güvenli yapmaz; mevcut D6 policy'si risk/unknown olarak kalır. Pozitif avoid kanıtı varsa reject edilir.
- Hata, timeout veya rate limit negatif aspect kanıtına çevrilmez.

## 8. D. Evidence extraction contract'ı

Extractor girdisi yalnız server'ın seçtiği ve güvenlik katmanından geçmiş passage paketidir:

```ts
interface GroundedAspectExtraction {
  candidateKey: string;
  versionScope: string;
  aspectId: AspectId;
  verdict: "supported" | "contradicted" | "unknown";
  level: "incidental" | "significant" | "primary" | "unknown";
  confidence: "low" | "medium" | "high" | "unknown";
  citations: Array<{
    sourceId: string;
    canonicalUrl: string;
    revisionId?: string;
    passageId: string;
  }>;
  contradictions: Array<{
    sourceId: string;
    passageId: string;
    summary: string;
  }>;
  rationale: string;
}
```

Kurallar:

- Model internet erişimi yapmaz; supplied passages dışındaki bilgisini kullanamaz.
- `supported`/`contradicted` için en az bir citation zorunludur ve citation gerçekten input passage'a çözülmelidir.
- Level yalnız `incidental|significant|primary`; negatifliği belirtmek için sahte `absent` üretilmez. Kaynak açıkça absence iddiası taşısa bile deterministic evidence modeli bunu contradiction/negative claim olarak işler; kapsam yeterli değilse `unknown` kalır.
- Confidence source trust, identity match, passage specificity, çoklu bağımsız destek ve contradiction ile cap'lenir; modelin self-confidence değeri tek başına yeterli değildir.
- Çelişkiler kaybolmaz. Aynı source'un tekrarları bağımsız destek sayılmaz.
- JSON schema dışı alan, citation'sız verdict, bilinmeyen source/passage ID veya candidate mismatch fail-closed `unknown` olur.

## 9. E. Deterministic integration

- `must`: minimum level ve confidence karşılanırsa geçer. `unknown` primary sonuçtan geçmez; research sonrası da unknown ise aynı kalır.
- `prefer`: hard eligibility'yi değiştirmez. Explicit prefer, must/avoid sonrasında bütçe kalırsa research alabilir; evidence varsa request fit'e girer, yoksa contribution sıfır kalır.
- `avoid`: güvenilir evidence `rejectAtLevel` eşiğine ulaşırsa reject. Evidence yokluğu absence değildir; otomatik bonus veya güvenli etiketi üretmez.
- `unknown policy`: strict/balanced primary listede explicit must unknown elenir. Exploratory yalnız açık near-match reason ile gösterebilir.
- `near-match`: ihlal edilen constraint, verdict ve kaynak durumu açıkça taşınır; normal öneriyle karışmaz.
- `no-result reason`: en az `retrieval_empty`, `provider_unavailable`, `identity_unverified`, `research_unavailable`, `no_allowlisted_source`, `evidence_unknown_after_research`, `must_contradicted`, `avoid_triggered` ayrımı yapılır.
- Final sort key ve D6 score breakdown korunur. LLM score, rank, candidate count veya diversity kararı vermez.

## 10. F. Persistence

Research cache owner-independent public evidence içindir. Önerilen anahtar:

```text
canonicalIdentity + versionScope + aspectId + sourcePolicyVersion
+ extractorSchemaVersion + sourceRevisionFingerprint
```

Saklanan claim; verdict/level/confidence, normalized source IDs, exact revision/fingerprint, bounded derived rationale, citation/passages ve timestamps taşır. Owner ID, user prompt, library state veya feedback taşımaz.

- Wikidata CC0 structured facts kalıcı saklanabilir; entity/revision fingerprint korunur.
- Wikipedia direct content yalnız CC BY-SA attribution, canonical URL, page/revision ID ve license notice ile saklanır.
- Search result/snippet payload'ı storage hakkı açık değilse kalıcı saklanmaz. Yalnız non-content telemetry ve direct-source canonical URL tutulabilir.
- Derived claim, source revision'dan ayrı versionlanır. Source değişirse eski claim audit için superseded olabilir fakat serving'de stale sayılır.
- TTL source class'a göre belirlenir: identity/fact daha uzun; narrative passage ve derived claim daha kısa. Revision check TTL dolmadan da invalidation tetikleyebilir.
- Policy/allowlist/extractor schema değişimi affected keys'i invalid eder. Revoked/blocked domain sonuçları serving'den hemen çıkarılır.
- D7-R1 owner-independent persistence port'unu ve bounded in-memory test adapter'ını tanımlar; production DB adapter'ı veya migration içermez.

## 11. Telemetry ve privacy

Internal telemetry; research requested/completed/coalesced, source/provider unavailable, cache hit/miss/stale, source trust class, citation validation failure, timeout/rate limit, verdict ve no-result reason sayıları taşır. Raw passage, full prompt, secret, personal data ve unrestricted URL query loglanmaz. Public read-model yalnız gerçek effective mode, fallback özeti ve kullanıcıya yararlı citation'ları gösterir.

## 12. Aşama kapıları

| Aşama | Çıktı | Release etkisi |
| --- | --- | --- |
| D7-R0 | Mimari/source/security/acceptance/deferred-ML contract'ları | Davranış değişmez |
| D7-R1 | Saf domain codec'leri, source registry, research planner, cache port'u, fixture testleri | Production route'a bağlı değil |
| D7-R2A | Pinned DNS/HTTPS, exact Wikidata identity ve revision-bound Wikipedia direct document | Conditional live; route'a bağlı değil |
| D7-R2B | Ephemeral allowlisted OpenAI discovery; Brave deferred | Search source değildir; route'a bağlı değil |
| D7-R2C | Provider registry/seçim; Groq Compound + forced-Exa OpenRouter beta | Ortak URL revalidation; ephemeral-only; route'a bağlı değil |
| D7-R2D | İzin kapılı source expansion/direct community-review adapter'ları | Terms/source trust audit olmadan source eklenmez |
| D7-R3A | Exact-QID Wikimedia acquisition + transient passage packet | Claim/model yok; route'a bağlı değil |
| D7-R3B | Supplied-passage provider-neutral grounded extraction | Tamamlandı; strict schema/citation, deterministic claim/decision, D6 authoritative |
| D7-R4 | Deterministic evidence integration | Kontrollü opt-in; LLM ranking yok |
| D7-R5 | Runtime security/cache ve kullanıcı citation görünümü | Feature flag/shadow |
| D7-R6 | Live source compliance, fail-soft ve final acceptance | D8 research feature gate adayı |
| D7-ML | Opsiyonel post-release distillation/student shadow | Release blocker değil |

## 13. D7-R3A sonucu ve D7-R3B giriş koşulları

D7-R1; 43 aspect için versionlı capability matrisi, exact `work|season|installment|edition` scope codec'i, kapalı-varsayılan source registry, citation/no-source domain kararları, deterministic bounded planner ve owner-independent cache port'unu teslim etti. D7-R2A buna [pinned server HTTP/DNS](D7_RESEARCH_NETWORK_FOUNDATION.md), [exact external-ID Wikidata verification](D7_WIKIDATA_IDENTITY_RESOLUTION.md) ve [revision-bound Wikipedia plaintext/citation](D7_WIKIPEDIA_DIRECT_SOURCE.md) ekledi.

D7-R2A'da DNS/private-address/rebinding, manual redirect, JSON streaming limit, Wikimedia etiquette, exact QID entity revalidation ve transient-document ayrımı fixture seviyesinde kapanmıştır. Conditional live smoke ayrı environment kapısındadır.

D7-R2B; [strict discovery request/result contract'ı](D7_RESEARCH_DISCOVERY_CONTRACT.md), registry-backed deterministic query, server-derived `wikipedia.org` filter'ı, fixed-endpoint [OpenAI Responses `web_search` adapter'ı](D7_OPENAI_WEB_DISCOVERY.md), response item decoder, URL revalidation, 5 saniye/256 KiB/retry/concurrency bütçesi ve in-flight coalescing ekledi. Search output/snippet persistence veya claim üretimi yoktur. Brave gerçek adapter'ı ayrı terms/coverage audit'ine ertelenmiştir; Gemini eklenmemiştir.

D7-R2C; aynı port'u merkezi [provider capability registry ve seçim contract'ı](D7_MULTI_PROVIDER_DISCOVERY.md) ile genişletti. Groq yalnız `web_search` tool'u ve `include_domains` ile; OpenRouter yalnız beta server tool + forced Exa `allowed_domains` ile çalışır. Explicit seçim fallback yapmaz; `auto` yalnız explicit enabled/configured provider'larda unavailable fallback yapar ve `no_source_discovered` provider storm üretmez. Ortak URL/source-registry post-processing değişmez. [Source expansion matrix](D7_RESEARCH_SOURCE_EXPANSION_MATRIX.md) yeni source'ları R2D izin kapısına bağlar.

D7-R3A; [source acquisition contract'ı](D7_RESEARCH_SOURCE_ACQUISITION.md) ile direct R2A document ve supplied discovery URL'sini tek server-only boundary'de toplar. Discovered Wikipedia article normal HTML'den okunmaz; MediaWiki Action API ile exact title çözülür, `pageprops.wikibase_item` candidate QID'sine yeniden bağlanır ve latest revision/citation alınır. Farklı QID, disambiguation, missing ve work-to-season/installment/edition fallback fail-closed'dur.

[Passage packet](D7_RESEARCH_PASSAGE_PACKET.md) NFKC/plaintext normalization, stable paragraph/sentence offsets, registry lexicon sinyali, lead+lexical+distributed coverage ve prompt-injection quarantine uygular. Packet, document ve passage `transient_only`dır; yalnız revision-bound citation/hash metadata'sı persistence için uygundur. R3A model, claim, level, confidence veya decision üretmez.

D7-R3B giriş kapıları:

- extractor yalnız bu packet'taki supplied passages'ı untrusted-data delimiter'ları içinde görür;
- strict provider-neutral JSON codec ve passage/citation referential-integrity kontrolü;
- no-source/no-passage/provider-unavailable ayrımını `absent`e çevirmeyen unknown politikası;
- model network/tool erişimi, candidate/ranking yetkisi ve personal context olmaması;
- exact scope ve acquisition/passage policy version'larının extraction lineage'ında korunması.

## 14. D7-R3B sonucu ve R4 sınırı

R3B, packet passage'larını stable citation-linked evidence unit'lere böler ve modele yalnız anonim candidate reference, registry aspect definition ve supplied unit text verir. Candidate title/ID/QID/URL ile kullanıcı `role`/`minimumLevel` modelden saklanır. Provider yalnız strict assessment üretir; exact unit/passage grounding'i tutmayan tek item bütün output'u reddeder.

Validated observation'dan claim metni, citation bağları, confidence cap ve `supported|contradicted|unknown` decision yalnız deterministic kodla çıkar. Model eligibility veya ranking üretmez. Groq/OpenAI/OpenRouter adapter ayrıntıları [Multi-Provider Extraction](D7_MULTI_PROVIDER_EXTRACTION.md), wire/grounding şeması [Grounded Extraction Contract](D7_GROUNDED_EXTRACTION_CONTRACT.md), aggregation ise [Decision Aggregation](D7_RESEARCH_DECISION_AGGREGATION.md) belgesindedir.

R4 girişinde production feature gate hâlâ kapalıdır. R4; yalnız validated claim/citation/decision handoff'unu D6 `must|prefer|avoid|unknown|near-match` policy'sine bağlayabilir, model sıralaması ekleyemez ve missing mention'ı absent sayamaz.

Bu kapılar production route entegrasyonu izni değildir. D6 regression fixture'ları ve ranking sabitleri değişmeden kalır.

## 14. D8 etkisi

D8 artık human gold/model artifact beklemez. D8 release adayı için yalnız D7 research katmanı etkinleştirilecekse source compliance, secret/rate-limit operasyonu, cache retention/invalidation, live fail-soft ve acceptance senaryoları kapı olur. Bu kapılar yetişmezse D8, D6 structured-only authoritative moduyla çıkabilir; ML veya annotation eksikliği release blocker değildir.
