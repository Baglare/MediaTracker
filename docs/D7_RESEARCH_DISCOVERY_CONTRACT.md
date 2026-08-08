# D7-R2B Research Discovery Contract

Tarih: 8 Ağustos 2026  
Durum: Saf request/result, deterministic query, allowlist ve ephemeral handoff contract'ı hazırdır.

## Güven sınırı

Discovery yalnız source URL bulur. Search adapter source/evidence publisher değildir; snippet, assistant output, provider rank ve missing result aspect kararı değildir. D6 deterministic engine authoritative kalır.

## `ResearchDiscoveryRequest` v1

Zorunlu public alanlar:

- exact verified `candidateIdentity` ve eşleşen `versionScope`;
- bounded `titleSnapshot`, optional `releaseYear`, exact `mediaType`;
- registry `aspectId`, `must|avoid|prefer`, optional minimum level;
- planner tarafından taşınan `allowedSourceIds`, `allowedDomains`, `maxSources`;
- opaque bounded `requestId` ve exact `researchPolicyVersion`.

`allowedSourceIds/domains` güvenilir kabul edilmez; orchestrator bunları server policy ile exact karşılaştırır. İlk active policy yalnız `sourceId=wikipedia` ve provider filter token'ı `wikipedia.org` üretir. Registry'deki exact accepted host'lar `en.wikipedia.org` ve `tr.wikipedia.org` olarak kalır.

Unknown alanlar fail-closed'dur. Owner/user ID, username/email, rating/favorite/progress/note/feedback, personal library, recommendation history, raw prompt/conversation, arbitrary query veya URL contract'ta bulunmaz.

## Deterministic query

Query builder yalnız public exact title snapshot, yıl/media type, registry `labelEn` ve en fazla iki code-controlled `aliasesEn` girdisi kullanır. Role/minimum level yalnız bounded `plot|story|theme` qualifier'ını etkiler. Control character ve uzunluk ihlali reddedilir; title quoted/escaped edilir. Aynı request aynı, en fazla iki query üretir. LLM query yazmaz.

## `SearchDiscoveryPort`

Port adapter bağımsızdır. `queries`, server-derived domains, max source, request ID ve public candidate/aspect envelope alır. `completed|unavailable|budget_exhausted|response_invalid`, URL/rank listesi, bounded telemetry ve warnings döndürür.

OpenAI mevcut implementasyondur. Brave ileride aynı port'u implemente edebilir; bugün code, key, env veya network çağrısı yoktur. Brave Search API de source değil discovery adapter olur ve storage-rights olmayan planda sonuç/snippet request-lifetime kalır.

## `DiscoveredResearchSource` v1

Ephemeral çıktı:

- gerçek `sourceId`, canonical URL ve hostname;
- `discoveryAdapter=openai_web_search`;
- request-local rank ve discovery time;
- query içeriğini taşımayan SHA-256 fingerprint;
- source registry version ve bounded warnings.

Bu model citation, claim, passage, trust kararı veya persisted evidence değildir. Fragment silinir; duplicate canonical URL tekleştirilir. URL sırasıyla parse, HTTPS, credentials, IP literal, port, length, hostname/domain ve exact source registry validation alır.

## Result status

- `sources_discovered`: en az bir accepted real URL.
- `no_source_discovered`: sağlıklı tool call var ama accepted URL yok; `absent` değildir.
- `disabled`: feature/key/model fail-closed.
- `adapter_unavailable`: HTTP/provider/decoder başarısız.
- `budget_exhausted`: timeout/parent abort.
- `source_policy_blocked`: boş veya server policy ile uyuşmayan allowlist.
- `invalid_request`: codec, scope, aspect veya policy version ihlali.

Result claim, `AspectResearchDecision`, citation veya ranking handoff'u taşımaz.

## Ephemeral/persistent invariant

OpenAI response payload, response/output ID, output text, query, action ID, title/snippet, rank ve raw source array evidence cache/DB/localStorage'a yazılmaz. Yalnız içeriksiz telemetry tutulabilir. `ResearchEvidenceCacheEntry` validator'ı bu discovery/search alanlarını nested olarak reddeder.

## D7-R3 handoff

R3 başlamadan önce:

1. accepted discovery URL'sinin R2A secure GET/DNS boundary'sine source-specific acquisition olarak verilmesi;
2. redirect sonrası identity/version scope'un yeniden doğrulanması;
3. HTML gerekiyorsa streaming limit, sanitizer ve prompt-injection isolation;
4. lisans/retention policy'sine uygun transient passage üretimi;
5. yalnız supplied passage üzerinden citation-required claim extraction;
6. no document/no citation durumunun `unknown` kalması

zorunludur. Discovery URL tek başına extraction input'u veya evidence değildir.

İlgili belgeler: [OpenAI Adapter](D7_OPENAI_WEB_DISCOVERY.md), [Planner](D7_RESEARCH_PLANNER.md), [Cache Policy](D7_RESEARCH_CACHE_POLICY.md).
