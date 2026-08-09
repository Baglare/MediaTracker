# D7-R5C Evidence Cache ve Shadow Transparency

## Kapsam

D7-R5C, doğrulanmış Grounded Research sonucunu owner-independent process memory içinde yeniden kullanır. Research hâlâ `D7_RESEARCH_SHADOW_ENABLED` arkasında non-authoritative çalışır; cache hit eligibility, ranking, near-match, public API response veya UI davranışını değiştirmez.

## Feature flag ve yaşam döngüsü

`D7_RESEARCH_EVIDENCE_CACHE_ENABLED=1` yalnız server process'inde cache lookup/write açar. Varsayılan `0` iken cache portuna erişilmez ve mevcut shadow zinciri değişmeden çalışır. Adapter en fazla 256 entry tutan deterministic LRU'dur; process-local olduğundan restart, deployment ve cold start sonrasında boş olabilir. DB, Supabase, filesystem, localStorage veya cross-instance paylaşım yoktur.

## Key, value ve TTL

Mevcut `ResearchEvidenceCacheKey` exact `versionScope.scopeKey + aspectId + researchPolicyVersion + sourceRegistryVersion + extractionPolicyVersion` birleşimini kullanır. Owner/user ID, rating, note, progress, favorite, feedback, prompt, secret ve discovery query key'e girmez.

Cache value yalnız validated `AspectResearchDecision`, `PersistedResearchClaim[]`, `PersistedResearchCitation[]`, bounded `GroundedExtractionProvenance`, source revision fingerprint, timestamps, versions ve warnings taşır. Supported/contradicted direct-source evidence 6 saat; claim'siz `passage_insufficient` unknown 15 dakika yaşar. Entry read sırasında expired ise silinir. Scope, source revision veya key'deki policy/registry/extraction version değişimi invalidate/miss üretir; TTL içinde her hit öncesi yeni Wikimedia revision çağrısı yapılmaz.

`adapter_unavailable`, timeout, budget exhaustion, rate limit, output/grounding invalid, refusal, security reject, version-scope/identity mismatch cache'e yazılmaz. Raw document, normalized text, packet, passage, evidence unit, prompt, model input/output, provider response/error, search query/snippet veya discovered URL listesi codec/policy sınırında reddedilir.

## Shadow hit/miss ve coalescing

Shadow job başlamadan stable key okunur. Valid hit direct source, discovery, acquisition ve extraction çağrılarını atlar; cached decision aynı deterministic handoff mapper ile yalnız hypothetical effect üretir. Miss mevcut zinciri çalıştırır ve sadece final result cacheable/validated ise tek write yapar. Aynı exact scope/aspect/role/minimum in-flight operation process içinde tek promise paylaşır.

## Internal transparency

`ResearchShadowTransparencySummary`; bounded candidate reference, aspect, cache/stage status, decision status/level/confidence, source/citation count, hypothetical effect, provider ID, duration bucket ve safe warning code taşır. Title, URL, passage, evidence unit, claim text, prompt/response, raw error ve owner/private veri taşımaz. Bu model yalnız existing internal shadow observer/test yüzeyindedir; public response'a, UI'a veya DB'ye gönderilmez.

## Rollout sınırı

`D7_R5C_CACHE_LIVE_SMOKE=1` normal suite dışında explicit miss→hit kabul kapısıdır. Kalıcı, instance'lar arası shared evidence cache; retention, revision refresh ve operasyonel invalidation ile birlikte D8 rollout kapısı olarak kalır.

9 Ağustos 2026 canlı Steins;Gate kabulünde ilk shadow çalışma `miss` ile gerçek Wikimedia acquisition + Groq extraction çalıştırdı ve `supported/significant` yazdı. Aynı process içindeki ikinci çalışma `hit` oldu; extraction toplam bir kez çağrıldı, hypothetical effect aynı kaldı ve public baseline değişmedi. Raw source/passage/unit/provider payload saklanmadı.
