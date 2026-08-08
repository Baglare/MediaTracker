# D7-R1 Research Cache Policy

Tarih: 8 Ağustos 2026
Durum: Owner-independent evidence port'u, D7-R2A Wikimedia metadata cache'i ve D7-R2B request-only discovery coalescing hazır; DB/localStorage yoktur.

## Stable key

`ResearchEvidenceCacheKey` şu exact alanlardan türetilir:

```text
versionScope.scopeKey
+ aspectId
+ researchPolicyVersion
+ sourceRegistryVersion
+ extractionPolicyVersion
```

String key `research-evidence-cache:v1:` prefix'i ve encoded bileşenler taşır. Owner/user ID, rating, favorite, progress, note, feedback, prompt veya raw query key'e giremez. Season/installment/edition scope'ları doğal olarak farklı key üretir; policy/registry/extraction version değişimi eski entry'yi ayırır.

## Value

`ResearchEvidenceCacheEntry`; key, decision, bounded claims/citations, created/expires timestamps, source revision fingerprint, cache status ve warnings taşır.

Yasak alanlar:

- transient document ve `boundedText`;
- search result/snippet;
- OpenAI/Brave response;
- search query/output text/action ID/discovered source/result;
- full Wikipedia text veya raw passage;
- owner/private kullanıcı alanları.

Runtime validator nested yasak alanları, invalid citation/claim'i, key-decision scope/aspect mismatch'ini ve timestamp/fingerprint sorunlarını fail-closed reddeder.

## Policy class

- `direct_source_long`: supported/contradicted direct-source decision; exact TTL D7-R2'de source revision davranışıyla belirlenecek.
- `unknown_short`: `no_source_found`, `source_not_allowed`, `passage_insufficient` gibi gerçek unknown; kısa TTL adayı.
- `not_cacheable`: `adapter_unavailable` ve `budget_exhausted`; upstream hata negative-cache edilmez.

## D7-R2A teknik metadata cache'i

- `WikimediaIdentityCache`: exact scope + property registry version + property/external ID anahtarı; yalnız entity-verified QID/sitelink/revision metadata, başlangıç 6 saat.
- `WikipediaRevisionMetadataCache`: scope/QID/project anahtarı; page ID, revision ID ve canonical URL, başlangıç 15 dakika.
- Aynı identity/page/revision HTTP request'i in-flight coalesce edilir.
- Loader/network/security/adapter hatası cache'e yazılmaz. `identity_not_found|ambiguous` bu aşamada negative-cache edilmez.
- `TransientResearchDocument`, bounded extract, raw WDQS/Action response ve request header hiçbir evidence/metadata cache'e girmez.

## Port

`ResearchEvidenceCachePort`: `get`, `set`, `delete`, `invalidateByScope`, `invalidateBySourceRevision`.

D7-R1 `MemoryResearchEvidenceCache` yalnız saf/test kullanımı için max 128 entry bounded LRU-benzeri adapter sağlar. Production route'a singleton olarak bağlanmaz. Scope ve source revision invalidation'ı executable testlidir.

## D7-R2B ephemeral discovery

OpenAI Responses payload'ı, output item'ları, output text, query, source array, snippet, action/response ID ve `DiscoveredResearchSource` persistent cache'e girmez. Aynı exact scope/aspect/role/domain/query fingerprint yalnız in-flight process promise'i paylaşır; tamamlanınca entry silinir. Network/provider/security/decoder failure negative-cache edilmez. SHA-256 query fingerprint query metnini geri taşımayan request-local dedupe/lineage token'ıdır; persisted citation değildir.

İlgili belgeler: [Domain Contract](D7_RESEARCH_DOMAIN_CONTRACT.md), [Planner](D7_RESEARCH_PLANNER.md), [Source Registry](D7_RESEARCH_SOURCE_REGISTRY.md).
