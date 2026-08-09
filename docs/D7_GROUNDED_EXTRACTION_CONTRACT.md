# D7-R3B Grounded Extraction Contract

Tarih: 2026-08-09  
Durum: Internal provider-neutral contract ve test adapter'ları hazır; Recommendation V2 production akışına bağlı değildir.

## Amaç ve yetki sınırı

R3B, yalnız R3A `GroundedResearchPacket` içindeki revision-bound passage'ları sınıflandırır. Model recommendation, eligibility, `must|avoid|prefer` sonucu veya ranking üretmez. D6 Deterministic V2 authoritative kalır; R4 yalnız doğrulanmış R3B claim/decision çıktısını deterministik biçimde entegre edebilir.

`GroundedExtractionRequest`; packet, server registry'den üretilen aspect definition, schema/extractor policy version, opaque request ID ve 64 unit/8 assessment bütçesini taşır. Codec exact-field çalışır; packet identity/scope/hash/retention, aspect eşleşmesi ve bütün policy sürümleri doğrulanır. Owner/user/rating/note/progress/raw prompt/search payload ve bilinmeyen alanlar reddedilir.

## Minimized model input

Domain request doğrudan provider'a gönderilmez. Model yalnız şunları görür:

- anonim `candidateRef: candidate-1`;
- aspect ID ve code-controlled semantic/centrality/explicit-absence tanımları;
- unit/passage grup metadata'sı, dil, source trust sınıfı ve supplied unit text.

Title, provider/external ID, Wikidata QID, URL/revision, `role`, `minimumLevel`, structured pre-result, popularity ve kişisel veri model input'unda yoktur. Böylece ezber tetikleme ve kullanıcı beklentisine göre centrality şişirme riski azaltılır.

## Evidence unit

Passage'lar deterministik sentence/semantic sınırlarında hedef 80–500, hard 700 karakterlik unit'lere ayrılır; toplam hard limit 64'tür. Stable unit ID; packet hash, passage ID, unit order, text hash ve `d7-r3b.unit.1` policy'sinden türetilir. Her unit mevcut passage/citation zincirine bağlıdır ve `transient_only`dır. Security flag taşıyan unit modele verilmez ve sonradan referanslanırsa bütün output reddedilir.

## Strict output ve grounding

Model yalnız `version` ve en fazla sekiz `assessments` döndürür. Assessment exact alanları `passageId`, `finding`, `level`, `confidence`, `evidenceUnitIds`, `basis`'tir. `additionalProperties:false` bütün seviyelerde uygulanır.

- `supports_presence`: non-null level, en az bir unit ve presence-compatible basis.
- `supports_explicit_absence`: null level, en az bir unit ve yalnız `explicit_absence_statement`.
- `irrelevant`: null level, boş unit listesi ve `unrelated_context`.
- `insufficient`: null level, boş unit listesi ve `context_insufficient`.

İkinci grounding validator passage/unit varlığını, unit-passage-citation ilişkisini, duplicate'leri ve quarantine durumunu kontrol eder. Tek invalid assessment bütün output'u fail-closed `grounding_invalid` yapar; fence temizleme, regex salvage veya ikinci repair prompt'u yoktur. Mention yokluğu explicit absence değildir.

## Result, bütçe ve lifecycle

`GroundedExtractionResult`; controlled status, provider/model, validated assessments, deterministik claims/decision, bounded provenance, telemetry ve warning taşır. Provider/config/network failure fake unknown evidence üretmez. Bir packet için en fazla bir provider/call vardır; explicit seçim fallback yapmaz, `auto` yalnız valid provider'lar arasında deterministik ilk provider'ı seçer. In-flight key packet hash + aspect + provider + model + policy'dir.

Timeout provider başına 6 saniye, response hard limit 128 KiB, extraction-stage global concurrency en fazla iki ve retry 429/502/503/504/transient network için en fazla birdir. Permanent 4xx, schema/refusal, parent abort ve grounding hatası retry edilmez. Bu stage sınırı R4 tasarlanmadan end-to-end 8 saniye garantisi olarak sunulmaz.

## Persistence

Persist edilebilir: validated claim, mevcut citation metadata, deterministic decision ve bounded extraction provenance. Persist edilemez: packet/document/passage/unit text, model input/output, prompt/instruction, raw response, reasoning, request headers veya provider search payload. İlgili ayrım [Cache Policy](D7_RESEARCH_CACHE_POLICY.md) ve [Decision Aggregation](D7_RESEARCH_DECISION_AGGREGATION.md) belgelerinde sabittir.
