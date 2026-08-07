# D7-R1 Research Domain Contract

Tarih: 8 Ağustos 2026
Durum: Saf contract/policy ve sentetik fixture aşaması tamamlandı; production bağlantısı ve network yoktur.

## 1. Read-only audit özeti

| Soru | Mevcut D6 sonucu | D7-R1 kararı |
| --- | --- | --- |
| Queryable constraint | 13 exact-taxonomy aspect provider taxonomy ile aranabilir. 21 ranked-tag aspect içinde canonical server-side mapping yalnız `political_intrigue/Politics` ve `revenge/Revenge` için vardır. 9 semantic aspect title query'ye çevrilmemelidir. | Queryability candidate recall içindir; hard centrality kararı değildir. |
| Structured hard decision | Exact taxonomy + yeterli confidence bazı hard kararları taşıyabilir; ranked tag çoğunlukla partial, semantic strategy unavailable'dır. | 43-aspect research capability matrisi mevcut registry/evidence strategy'den türetilir. |
| Candidate identity | `provider:mediaType:externalId`, exact IMDb/TheTVDB/OpenLibrary-work bridge ve anime fusion yasağı vardır. | Exact identity tekrar kullanılır; ayrıca work/season/installment/edition scope zorunludur. |
| Series/version isolation | `seriesGroupId` yalnız diversity metadata'sında; season/installment contract'ı yoktur. Open Library edition secondary ID olarak bulunabilir. | `ResearchVersionScope` season/film installment/book edition kanıt geçişini kapatır. |
| Cache key | Provider cache `provider:mediaType:externalId:schemaVersion` kullanır; registry/aspect/policy/source revision taşımaz. | Research cache ayrı exact scope/aspect/policy key kullanır. |
| No-result | Ranked-tag retrieval mapping/query/rank/no-candidate reason'larını ayırır; research sonucu yoktur. | `no_source_found`, `source_not_allowed`, `passage_insufficient`, `adapter_unavailable` gibi unknown reason'ları eklenmiştir. |
| Trace/read-model | Internal retrieval trace ve public engine status kavramsal olarak ayrıdır fakat aynı API response içindeki `debug`/public alanlarda taşınır. | D7-R1 yalnız internal handoff contract'ı tanımlar; route/read-model değiştirmez. |
| Web fallback | DuckDuckGo HTML title/snippet regex'i title-query üretir ve tekrar provider araması yapar. Direct passage/citation/claim yoktur. | Search adapter source değildir; underlying allowlisted URL resolve edilmeden evidence oluşmaz. |
| LLM planning input | Raw kullanıcı mesajı, intent, settings ve `summarizeProfile` çıktısı gider; bu özet rating ortalaması, yüksek puan/favori/in-progress title/progress bilgisi taşıyabilir. | Research candidate/job/cache tipleri message/profile/note/rating/progress/feedback alanı taşıyamaz; codec nested owner alanlarını fail-closed reddeder. |

## 2. Mevcut ve hedef çağrı zinciri

| Mevcut authoritative D6 | Hedef D7 (R2-R4 sonrası) |
| --- | --- |
| request → intent/LLM retrieval planning → provider candidate retrieval → exact identity/provider evidence cache → structured aggregation → deterministic hard filter/ranking → response | structured request → high-recall provider retrieval → exact identity + version scope → structured aggregation → unresolved constraint planner → direct allowlisted source passage → citation-bound claim/decision → research handoff → **aynı deterministic hard filter/ranking** → response |

D7-R1 ikinci zinciri çalıştırmaz. Yalnız production'dan bağımsız saf tip, codec, policy, planner, cache port'u ve sentetik fixture'ları hazırlar.

## 3. Modül ve bağımlılık sınırı

`features/recommendations/research/`:

- `domain/`: version scope, source registry, 43 capability, transient/persisted evidence, decision, codec ve handoff.
- `planning/`: sabit budget, priority ve deterministic planner.
- `cache/`: stable key, persistence policy, async port ve bounded process-memory test adapter'ı.
- `security/`: saf URL ve content flag policy'si.

Bu katmanlarda Next.js, React, `fetch`, localStorage, filesystem, DB veya Supabase bağımlılığı yoktur.

## 4. Exact `ResearchVersionScope`

Ortak alanlar: `version=1`, `scopeKind`, exact `canonicalKey`, opsiyonel exact `parentCanonicalKey`, `mediaType`, literal `sourceIdentityVerified=true` ve deterministik `scopeKey`. Mevcut D6 exact parent relation resolver taşımadığı için D7-R1 codec'i `parentCanonicalKey` kullanımını fail-closed reddeder; alan ancak kanıtlanabilir series/work relation port'u eklendiğinde açılabilir.

- `work`: scope detail taşımaz.
- `season`: yalnız pozitif `seasonNumber` taşır.
- `installment`: yalnız bounded exact `installmentKey` taşır.
- `edition`: yalnız `book`; `editionKey` candidate identity'nin exact `openlibrary_edition` relation'ında bulunmalıdır.

Canonical key mevcut provider identity builder ile tekrar doğrulanır. Title/year/fuzzy metin scope üretemez. Key biçimi `research-scope:v1:<kind>:<encoded-canonical-key>:<exact-detail>`dir; raw kullanıcı metni içermez.

## 5. Transient passage ve persisted evidence

`TransientResearchDocument`, revision-bound bounded text ve security flags taşır; literal `retention=transient_only`dir. Cache value codec'i `boundedText`, raw passage, search result/snippet ve provider response alanlarını reddeder.

`PersistedResearchCitation` yalnız enabled registry source, allowlisted canonical URL, gerekli revision/attribution ve source license'ını taşır. `PersistedResearchClaim` en çok 280 karakter paraphrase, polarity, ordinal level, confidence, citation ID, extraction method/policy ve warnings taşır. Ham passage claim'e kopyalanmaz.

## 6. Citation ve no-source invariant'ları

- `support` claim level ve en az bir valid citation ister.
- `contradict` claim explicit cited source ister; source omission contradiction değildir.
- `grounded_llm` citation olmadan kabul edilmez.
- Search adapter ID'si citation source olamaz.
- `unknown` claim/citation olmadan bulunabilir fakat unknown reason code zorunludur.
- Missing source veya missing mention `unknown`dur; `absent` değildir.
- Tek low-trust source hard constraint authority'si değildir.
- Çelişkili support/contradict claim'ler ayrı ID listelerinde korunur.

## 7. Decision ve deterministic handoff

`AspectResearchDecision`; supported/contradicted/unknown, level/confidence, supporting/contradicting claim ID'leri, source counts, policy/timestamps ve reason code taşır. `ResearchEvidenceHandoff` exact identity/scope, decisions, claims/citations, unresolved aspects, research status ve sınırlı cache metadata'sını bir araya getirir.

Saf mapping sözleşmesi:

- Must: supported + minimum level + hard trust gate geçerse primary eligibility'ye katkı; unknown yalnız near-match adayıdır.
- Prefer: supported ise request-fit katkısı; unknown katkı üretmez.
- Avoid: supported presence threshold'u reject; explicit contradicted/absence negatif evidence olabilir; unknown safe/absent değildir.
- LLM eligibility, candidate count veya rank üretmez.

## 8. 43-aspect capability sonucu

Kaynak: mevcut `ASPECT_REGISTRY.defaultEvidenceStrategy`, `semanticVerifier`, media support ve limitation alanlarıdır.

| Research mode | Sayı | Anlam |
| --- | ---: | --- |
| `none` | 2 | Structured exact evidence hard karar için yeterli (`fantasy`, `sci_fi`) |
| `fallback` | 16 | Structured evidence var/partial; unresolved durumda direct research değerli |
| `required_for_hard_decision` | 25 | Hard must/avoid için source-grounded research gerekir |
| `unsupported` | 0 global | Global source path var; candidate media type desteklenmiyorsa planner item-level unsupported issue üretir |

Matrix 43/43 completeness testiyle registry key'lerine exact bağlıdır; route/UI bu aşamada değişmez.

İlgili belgeler: [Source Registry](D7_RESEARCH_SOURCE_REGISTRY.md), [Planner](D7_RESEARCH_PLANNER.md), [Cache Policy](D7_RESEARCH_CACHE_POLICY.md), [Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md).
