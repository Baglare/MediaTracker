# D7-R1 Research Cache Policy

Tarih: 8 Ağustos 2026
Durum: Owner-independent port/policy ve bounded memory test adapter'ı hazır; DB/localStorage implementasyonu yoktur.

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
- full Wikipedia text veya raw passage;
- owner/private kullanıcı alanları.

Runtime validator nested yasak alanları, invalid citation/claim'i, key-decision scope/aspect mismatch'ini ve timestamp/fingerprint sorunlarını fail-closed reddeder.

## Policy class

- `direct_source_long`: supported/contradicted direct-source decision; exact TTL D7-R2'de source revision davranışıyla belirlenecek.
- `unknown_short`: `no_source_found`, `source_not_allowed`, `passage_insufficient` gibi gerçek unknown; kısa TTL adayı.
- `not_cacheable`: `adapter_unavailable` ve `budget_exhausted`; upstream hata negative-cache edilmez.

## Port

`ResearchEvidenceCachePort`: `get`, `set`, `delete`, `invalidateByScope`, `invalidateBySourceRevision`.

D7-R1 `MemoryResearchEvidenceCache` yalnız saf/test kullanımı için max 128 entry bounded LRU-benzeri adapter sağlar. Production route'a singleton olarak bağlanmaz. Scope ve source revision invalidation'ı executable testlidir.

İlgili belgeler: [Domain Contract](D7_RESEARCH_DOMAIN_CONTRACT.md), [Planner](D7_RESEARCH_PLANNER.md), [Source Registry](D7_RESEARCH_SOURCE_REGISTRY.md).

