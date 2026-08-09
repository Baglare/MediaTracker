# D7-R3A Research Source Acquisition

Tarih: 9 Ağustos 2026
Durum: Internal secure Wikimedia acquisition contract'ı hazırdır; production Recommendation route'una bağlı değildir.

## Amaç ve sınır

R3A, R2A'nın verified direct Wikimedia document'ı ile R2B/R2C'nin ephemeral discovered URL'sini aynı server-only acquisition sınırında toplar. Çıktı evidence kararı değil, R3B extractor'ına verilebilecek revision-bound transient passage packet'ıdır. Search provider, model, embedding, generic HTML parser, claim, decision ve ranking bu aşamada yoktur.

## Request ve result contract'ı

`ResearchSourceAcquisitionRequest` v1 yalnız public candidate kimliği, exact `ResearchVersionScope`, verified `ResolvedWikimediaIdentity`, aspect/role/minimum level, direct document+citation envelope'ları, validated discovered sources, bütçeler ve policy version'larını kabul eder. Unknown alanlar ile owner/user/rating/note/progress/raw prompt/search query/snippet/provider output alanları fail-closed reddedilir.

`ResearchAcquisitionResult.status` yalnız şunlardan biridir: `packet_ready`, `no_eligible_source`, `source_identity_mismatch`, `version_scope_unresolved`, `source_policy_blocked`, `security_rejected`, `adapter_unavailable`, `budget_exhausted`, `passage_insufficient`. `supported`, `contradicted`, `unknown`, claim, confidence veya decision üretilmez.

## Source çözümü ve exact kimlik

- Direct R2A document; document/citation, page/revision, content hash, source ve verified QID ilişkisi yeniden codec/policy kontrolünden geçer. Aynı zinciri tekrar network'ten çözmek zorunlu değildir.
- Discovered source yalnız R1 registry version'ı güncel, `sourceId=wikipedia`, HTTPS ve exact `en.wikipedia.org|tr.wikipedia.org` hostunda ise işlenir.
- Yalnız `/wiki/<title>` article yolu kabul edilir. Fragment canonicalization sırasında atılır; query string, userinfo, non-default port, malformed percent encoding ve deceptive host reddedilir.
- URL title'ı yalnız MediaWiki Action API `titles=` parametresidir. Title identity değildir; search, opensearch, fuzzy ve parent fallback yoktur.
- Action API sonucu canonical page ID/title, latest revision/timestamp, disambiguation/missing/redirect metadata ve `pageprops.wikibase_item` taşır. Son QID candidate'ın verified Wikidata QID'siyle byte-exact eşleşmezse source reddedilir.
- Redirect Action API içinde normalize edilebilir; redirect sonrası QID yeniden doğrulanır. Normal Wikipedia HTML'i fetch veya parse edilmez.

## Related page ve version scope

R3A yalnız exact-QID primary work page'i kabul eder. Character/episode/franchise/adaptation/reception sayfası, ayrı season/installment/edition veya fan wiki; title/link benzerliğine bakılmadan reddedilir. Related-page desteği ileride code-controlled Wikidata relation registry ve ayrı policy version gerektirir.

`work` exact entity kabul edilebilir. `season|installment|edition` ancak resolved QID ve scope envelope'u exact o sürümü temsil ediyorsa kabul edilir. Work page'i alt scope'a miras bırakılmaz; parent veya sibling fallback yoktur.

## Bütçe, sıra ve dedupe

- En çok 2 document, publisher başına 2 document, 2 source language ve 2 network acquisition.
- Global acquisition budget 8 saniye; R2A host concurrency=1 ve global research concurrency=2 sınırları korunur.
- Direct source önce, discovered exact-QID Wikipedia ikinci sıradadır.
- Aynı `sourceId + pageId + revisionId` tek document olur; direct/discovered aynı canonical page ise discovery network çağrısından önce elenir.
- Aynı request key in-flight coalesce edilir. Discovered title metadata key'i scope/QID/project/title ile ayrılır; network/security hatası cache edilmez.

## Citation, persistence ve telemetry

Document ancak revision ID zorunlu CC BY-SA citation'la packet'a girebilir. Citation canonical revision URL, page locator, attribution/license, accessedAt ve source content hash taşır. Full/normalized document ve passage text `transient_only` kalır; evidence cache codec'i bunları reddeder.

Telemetry direct/discovered input, accepted/rejected URL, registry/QID/missing/disambiguation/revision, bytes/characters/segments/passages, security flag, network/cache/coalescing ve duration sayılarıyla sınırlıdır. Full URL query, response, document, passage, prompt, secret ve user data loglanmaz.

İlgili belgeler: [Passage Packet](D7_RESEARCH_PASSAGE_PACKET.md), [Wikipedia Direct Source](D7_WIKIPEDIA_DIRECT_SOURCE.md), [Network Foundation](D7_RESEARCH_NETWORK_FOUNDATION.md), [Security Model](D7_RESEARCH_SECURITY_MODEL.md).
