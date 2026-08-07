# D7-R2A Wikipedia Revision-Bound Direct Source

Tarih: 8 Ağustos 2026  
Durum: Verified Wikidata sitelink → page/revision → bounded plaintext adapter hazır; claim extraction yoktur.

## Page resolution

Wikipedia adapter yalnız `ResolvedWikimediaIdentity.sitelinks` içindeki `enwiki|trwiki` title'ını kullanır. `search`, `opensearch`, user query ve fuzzy lookup yasaktır. Varsayılan dil sırası `enwiki`, sonra `trwiki`; bu coverage tercihi kalite garantisi değildir.

MediaWiki Action API `action=query`, `formatversion=2`, `prop=info|pageprops|revisions`, `rvprop=ids|timestamp` ile page ID, latest revision ve canonical URL alır. Codec:

- missing/invalid page'i unavailable yapar;
- disambiguation page'i reddeder, ilk linki seçmez;
- `pageprops.wikibase_item` değerini exact QID ile eşleştirir;
- Wikimedia canonical redirect/normalization'ı warning olarak taşır;
- redirect sonrası QID değişirse reject eder;
- positive page ID, revision ID ve timestamp ister.

Canonical page URL ve `oldid=<revisionId>` stable revision URL yeniden Wikipedia allowlist policy'sinden geçer.

## Direct document

İkinci bounded Action API çağrısı aynı page ID için `extracts|revisions|pageprops` ister; `explaintext=1`, lead-only ve `exchars=24000` kullanır. Dönen latest revision ilk çözümdeki revision ile eşleşmezse race fail-closed `wikipedia_revision_changed` olur. HTML endpoint kullanılmaz.

Plaintext fatal UTF-8 decode edilmiş JSON içinden gelir; NFC/line-ending normalization dışında özetlenmez. R1 ile uyumlu 24.000 UTF-8 byte sınırı, transient-document codec'i, control-character ve content security flag'leri uygulanır.

Başarılı çıktı yalnız:

- `TransientResearchDocument`: deterministic page/revision/hash ID, `sha256:` content hash, bounded plaintext, `retention=transient_only`;
- `PersistedResearchCitation`: stable revision URL, revision ID, title locator, hash, access time, Wikipedia contributor attribution ve `cc_by_sa`.

Ham extract, document veya full response R1 evidence cache'e girmez. Citation metadata kalıcı olabilir; henüz `PersistedResearchClaim`, centrality veya aspect decision üretilmez.

## Internal orchestration

`researchDirectWikimediaSource` sırası: feature gate → exact scope → coalesced Wikidata resolve/verify → sitelink → page/revision → bounded document → citation metadata → telemetry. Sonuç status'ları `document_ready|wikidata_only|identity_not_found|identity_ambiguous|identity_unverified|wikipedia_unavailable|adapter_unavailable|security_rejected|budget_exhausted` olarak ayrılır.

İlgili belgeler: [source policy](D7_RESEARCH_SOURCE_POLICY.md), [cache policy](D7_RESEARCH_CACHE_POLICY.md), [live smoke](D7_RESEARCH_LIVE_SMOKE.md).
