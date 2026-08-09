# D7-R3A Grounded Research Passage Packet

Tarih: 9 Ağustos 2026
Durum: Provider-neutral transient packet ve deterministic passage preparation hazırdır; extraction R3B'ye ertelenmiştir.

## Packet contract'ı

`GroundedResearchPacket` v1; exact candidate identity/scope, aspect, role/minimum level, document metadata, revision-bound citations, selected passages, source/publisher sayıları, content hash, security flag'leri ve acquisition/passage policy version'larını taşır. `retention` daima `transient_only`dır.

Packet claim, verdict, confidence, centrality, decision, ranking, model output, user context, search query/snippet/provider response veya persistent full document contract'ı değildir. Lexical hit bulunmaması aspect'in absent olduğu anlamına gelmez.

## Deterministic normalization ve segmentation

Plaintext input; strict upstream UTF-8 sonrasında line-ending ve NFKC normalization, trailing whitespace temizliği, bounded blank-line azaltma ve sınırlı tekrar başlık temizliği alır. Control/unpaired Unicode veya script/HTML residue document'i fail-closed reddeder. Özetleme ve çeviri yapılmaz. Normalized content için SHA-256 üretilir; raw body saklanmaz.

Segmenter önce paragraph, gerekirse Türkçe/İngilizce/Unicode sentence boundary kullanır; kısa parçaları komşu cümlelerle birleştirir ve cümleyi ortadan kesmez. Aynı normalized input aynı order, offset, text hash ve passage ID üretir. Passage ID; source/document/revision, normalized offset'ler ve passage policy version'dan türetilir.

## Passage contract ve limitler

Her passage; `passageId`, `documentId`, `citationId`, source/language/page/revision, stable order, normalized-document offset'leri, text/text hash, selection reason, matched controlled aspect terms, security flag'leri ve `transient_only` retention taşır.

- Hedef passage: 250–1.200 karakter.
- Hard tek passage tavanı: 1.500 karakter.
- Varsayılan max passage: 8; hard max yine 8.
- Varsayılan packet text budget: 10.000 karakter; hard tavan 12.000.
- Seçim: document başına lead olmak üzere en çok 2 lead, en çok 4 lexical ve en çok 2 deterministic distributed coverage passage.

## Relevance ve coverage

Lexicon 43-aspect registry `labelEn/aliasesEn` alanlarını ve yalnız code-controlled bounded supplemental terimleri kullanır. Raw user prompt veya model skoru yoktur. Exact phrase/alias ve controlled co-occurrence yalnız selection sinyalidir; claim değildir.

Selection sadece lexical hit'lere kapanmaz. Lead ve belgenin farklı konumlarından deterministic distributed coverage, synonym dışı anlatımları R3B'ye taşıyabilir. Dedupe ve toplam karakter bütçesi bütün seçimlere uygulanır. Güvenli passage kalmazsa `passage_insufficient` döner.

## Untrusted-content policy

Source metni talimat değil veridir. `instruction_like_text`, `prompt_injection_pattern`, `role_marker_pattern`, `tool_call_pattern`, `encoded_payload_pattern`, `script_or_html_detected`, `oversized_fragment`, `malformed_unicode` ve `source_identity_mismatch` bounded flag'lerdir.

Script/HTML, malformed Unicode veya identity mismatch document seviyesinde reddedilir. Instruction/prompt-injection/role/tool/encoded pattern taşıyan segment packet selection'dan dışlanır ve telemetry/warning üretir. Sıradan tarihsel “instructions” kullanımı tek başına malicious sayılmaz. R3B, kalan passages'ı ayrıca açık untrusted-data delimiter içinde supplied-passage-only işlemelidir.

## Citation ve persistence

Her passage mevcut packet citation ID'sine ve aynı document revision'ına çözülür. Exact quote locator yerine stable order/offset metadata kullanılır; passage text derived claim'e otomatik kopyalanmaz. Persistent olabilir: canonical revision URL, page/revision, attribution/license, accessedAt, source hash ve policy version. Packet, full normalized document, passage text ve injection fragment'i evidence cache/DB/localStorage'a yazılamaz.

İlgili belgeler: [Source Acquisition](D7_RESEARCH_SOURCE_ACQUISITION.md), [Cache Policy](D7_RESEARCH_CACHE_POLICY.md), [Source Policy](D7_RESEARCH_SOURCE_POLICY.md), [Security Model](D7_RESEARCH_SECURITY_MODEL.md).
