# D7-R1 Research Source Registry

Tarih: 8 Ağustos 2026
Durum: Saf versioned registry contract'ı; fetch/search adapter implementasyonu yoktur.

Registry version: `d7-r1.1` (`RESEARCH_SOURCE_REGISTRY_VERSION`).

## Registry

| Source ID | Class / trust | Hosts | License | Evidence uses | Persistence | Enabled |
| --- | --- | --- | --- | --- | --- | --- |
| `wikidata` | structured knowledge / high | `www.wikidata.org`, `query.wikidata.org` | CC0 | identity, presence, contradiction | metadata, derived claim, transient passage | Evet |
| `wikipedia` | encyclopedia / medium | `en.wikipedia.org`, `tr.wikipedia.org` | CC BY-SA | presence, centrality, contradiction, explicit absence | metadata, derived claim, transient passage | Evet |
| `official` | official / high | Boş | provider terms | contract hazır | metadata, transient passage | Hayır; host/terms audit bekliyor |
| `editorial` | editorial / medium | Boş | unknown | contract hazır | metadata, transient passage | Hayır |
| `community_reference` | community / low | Boş | unknown | contract hazır | transient only | Hayır |
| `forum` | forum / low | Boş | unknown | presence/contradiction contract'ı | transient only | Hayır |

Wikidata narrative centrality için tek başına yeterli kabul edilmez. Wikipedia revision ID ve attribution zorunludur; ham uzun metin kalıcı değildir.

## Search adapter ayrımı

`openai_web_search` ve `brave_search`, `ResearchSourceRegistryEntry` değildir. Sabit `SEARCH_DISCOVERY_ADAPTER_IDS` listesi yalnız bu ayrımı test etmek içindir. Search sonucu:

1. enabled registry source'a resolve edilir;
2. URL saf allowlist policy'sinden geçer;
3. direct source passage/citation oluşursa claim'e girebilir.

Search snippet'i, rank'i veya OpenAI/Brave response'u persistent claim/citation yerine kullanılamaz.

## URL policy

Yalnız HTTPS, exact allowlisted lowercase host, userinfo'suz, default portlu ve bounded URL kabul edilir. Fragment canonical URL'den kaldırılır. HTTP/file/data/javascript, localhost/`.local`, bütün IP literal'lar, private/reserved/link-local IP biçimleri, Unicode/punycode hostlar, deceptive subdomain ve registry dışı redirect hedefi reddedilir.

D7-R1 DNS çözmez veya network yapmaz; DNS rebinding/private resolved address kontrolü D7-R2 fetch boundary blocker'ıdır.

## Validation

- Enabled source boş host listesi taşıyamaz.
- Host wildcard kullanamaz.
- Revision isteyen source metadata persistence taşır.
- Search adapter registry source olamaz.
- Disabled source claim/citation üretemez.
- Citation license/revision/attribution registry entry ile eşleşir.

İlgili belgeler: [Source Policy](D7_RESEARCH_SOURCE_POLICY.md), [Security Model](D7_RESEARCH_SECURITY_MODEL.md), [Domain Contract](D7_RESEARCH_DOMAIN_CONTRACT.md).

