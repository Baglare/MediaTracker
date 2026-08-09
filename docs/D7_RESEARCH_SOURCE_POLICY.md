# D7 Research Source Policy

Tarih: 8 Ağustos 2026
Durum: D7-R3A exact-QID direct Wikipedia acquisition ve transient passage packet hazırdır; Brave/Gemini ve yeni source domain yoktur.

## 1. Temel kurallar

- Public erişim, persistent storage veya model training izni anlamına gelmez.
- Search provider ile evidence publisher aynı değildir. Search sonucu yalnız discovery olabilir; claim authority direct source ve lisans policy'sinden gelir.
- Her evidence kaydı exact candidate identity, version/season scope, canonical URL, source class, policy version, captured time ve mümkünse source revision taşır.
- Missing source, boş snippet, HTTP hata veya provider unavailable `absent` değildir; sonuç `unknown`dur.
- Domain allowlist fail-closed'dur. Redirect sonrası nihai URL de allowlist ve security validation'dan geçer.

## 2. Source matrisi

| Kaynak | D7 rolü | Trust | Runtime kullanım | Persistent storage | Training/distillation |
| --- | --- | --- | --- | --- | --- |
| AniList | High-recall retrieval, exact identity, bounded structured taxonomy | T1 (kendi alanlarında) | İzinli bounded runtime-only | Mevcut bounded TTL dışında corpus/bulk yok | Yasak; açık yeni izin olmadan yok |
| Wikidata | Exact mapping, QID, provider/external ID ve CC0 facts | T1 | D7-R2A conditional direct adapter | Verified mapping/sitelink + entity revision metadata kalıcı olabilir; raw response yok | Post-release ayrı dataset manifest'iyle değerlendirilebilir |
| Wikipedia / MediaWiki direct | Plot/relationship/theme için revision-bound direct passage | T2 | D7-R2A conditional direct adapter | Citation/revision/attribution saklanabilir; bounded plaintext `transient_only` | Bu plan otomatik training izni vermez; ShareAlike/data-card audit gerekir |
| OpenAI Responses `web_search` | Allowlist içinden source URL discovery | T4 search; bulunan direct source kendi trust sınıfını alır | D7-R2B internal adapter hazır; route'a bağlı değil | Request/response/output/snippet ephemeral; accepted real URL yalnız request handoff'u | Search output training corpus olmaz |
| Groq Compound `web_search` | Allowlist içinden source URL discovery | T4; Tavily search metadata authority değildir | D7-R2C internal adapter; yalnız web_search + include_domains | Request/response/reasoning/snippet/Tavily metadata ephemeral | Search output training corpus olmaz |
| OpenRouter `openrouter:web_search` | Allowlist içinden source URL discovery | T4; Exa citation metadata authority değildir | D7-R2C beta internal adapter; yalnız forced Exa hard filter | Request/response/output/highlight/Exa metadata ephemeral | Search output training corpus olmaz |
| Brave Search | Opsiyonel discovery adapter | T4 | D7-R2B sonrası opsiyonel; uygulanmadı | Storage-rights açık değilse result/snippet kalıcı saklanmaz | Yasak; ayrı yazılı hak olmadan yok |
| Gemini Grounding | Bu release hattında kullanılmaz | Yok | Persistent evidence yolu değil | Saklanmaz | Yok |
| Anime News Network ve diğer domainler | Terms audit backlog'u | blocked | Hard allowlist'e eklenmez | Saklanmaz | Yok |
| TMDB | Mevcut structured runtime evidence | T1 (kendi alanlarında) | Mevcut contract kadar | Mevcut bounded runtime cache; D7 research corpus yok | Yazılı izin olmadan yasak |
| OMDb | Secondary exact identity/partial runtime evidence | T1/T3 alan bazlı | Mevcut contract kadar | Mevcut bounded runtime cache; research corpus yok | Yasak |
| TVMaze | Structured runtime evidence | T1 alan bazlı | Mevcut contract kadar | Mevcut TTL; geniş snapshot yok | Ayrı CC BY-SA sonucu audit edilmeden yok |
| Open Library | Book identity/bibliographic facts | T1 alan bazlı | Mevcut contract kadar | Facts/text ayrımı; description için ayrı provenance | Field-level audit olmadan yok |

## 3. Discovery provider ve Gemini kararı

### OpenAI Responses web_search

Tercih edilen search orchestration adapter'ıdır çünkü tool output'u ile source citation zincirini aynı request içinde sağlayabilir. Yine de OpenAI citation'ı publisher lisansının yerine geçmez. Adapter:

- yalnız server-side çalışır;
- domain allowlist ve bounded query kullanır;
- candidate exact identity + hedef aspect sorgusu dışında serbest recommendation istemez;
- yalnız citation URL, title, source locator ve ephemeral snippet'i research session'a verir;
- persistent evidence için mümkünse direct allowlisted source fetch eder;
- citation'sız model özeti veya modelin genel bilgisini reddeder.

### Groq Compound web_search

Groq yalnız `groq/compound|groq/compound-mini`, `enabled_tools=[web_search]` ve server-derived `include_domains` ile kullanılır. Search Tavily tarafından sağlanır; Groq/Tavily source değildir. `message.content`, reasoning, result content/snippet, score ve tool metadata'sı ephemeral'dır. Yalnız underlying URL ortak registry validation'a girer.

### OpenRouter web-search server tool

OpenRouter server tool beta olduğundan yalnız Responses endpoint'i, `openrouter:web_search`, code-controlled model ve forced `engine=exa + allowed_domains` ile açılır. Deprecated plugin/`:online`, `auto|native` engine veya `site:` query hard allowlist yerine kullanılamaz. OpenRouter/Exa source değildir; output/highlight/citation metadata'sı ephemeral'dır.

### Brave Search

Opsiyonel, provider-independent discovery fallback'idir. Search result, ranking ve snippet storage hakkı ayrıca teyit edilmeden yalnız request-lifetime memory'de tutulur. Brave sonucu tek başına claim değildir. Direct allowlisted URL bulunursa publisher policy'siyle yeniden fetch edilir.

### Gemini Grounding

Gemini Grounding D7 persistent public evidence path'inde kullanılmaz. Citation/grounding output'unun retention ve yeniden kullanım sözleşmesi bu mimarinin derived claim + source revision ihtiyacını karşılayan açık policy olarak kabul edilmemiştir. İleride ayrı audit ile ephemeral shadow comparison olabilir; D7/D8 blocker değildir.

## 4. Allowlist başlangıcı

Hard allowlist başlangıçta:

- `www.wikidata.org`, `query.wikidata.org` — yalnız tanımlı Wikidata API/SPARQL yolları;
- `*.wikipedia.org` — desteklenen dil listesi ve tanımlı MediaWiki API/content yolları;
- gerekli Wikimedia static/API hostları — yalnız önceden tanımlı endpoint/path sözleşmesiyle.

Wildcard, DNS sonucu veya kullanıcı/LLM tarafından verilen domain otomatik allowlist değildir. ANN, fandom/wiki mirror, blog, forum, Reddit, sosyal medya, streaming katalogları ve genel haber siteleri terms/trust audit tamamlanmadan blocked kalır. Genişleme kararları [Source Expansion Matrix](D7_RESEARCH_SOURCE_EXPANSION_MATRIX.md) içindedir.

## 5. Source identity ve attribution

Her direct source kaydı:

- `sourceId`, canonical URL, normalized domain;
- page/entity ID ve revision ID/fingerprint;
- title ve content language;
- license ID/URL ve attribution text;
- captured/revalidated timestamp;
- candidate identity eşleme yöntemi;
- retained passage IDs ve byte/character limits;
- source policy version

taşır. Wikipedia evidence kullanıcıya gösterildiğinde attribution ve source link korunur. Wikidata CC0 etiketi Wikipedia prose'a uygulanmaz.

## 6. Storage sınıfları

- `persistent_direct`: R3A'da yalnız lisansı açık citation/revision/hash/attribution metadata'sı; full document veya passage değil.
- `persistent_derived`: Persistent direct source'a bağlı bounded claim/extraction; lineage zorunlu.
- `ephemeral_search`: Query, result/snippet ve search-provider tool output'u; request sonunda silinir veya yalnız içeriksiz metrik bırakılır.
- `runtime_structured_ttl`: Mevcut provider evidence cache contract'ı.
- `blocked`: Saklanmaz ve extraction'a verilmez.

Search sonucu içinden canonical URL saklamak, snippet veya result body saklama izni vermez. Direct fetch başarısızsa search snippet'inden persistent claim üretilmez.

## 7. TTL ve invalidation

- Wikidata identity/fact: en çok 30 gün; revision/fingerprint değişimi erken invalidation.
- Wikipedia derived claim (R3B sonrası): en çok 7 gün; revision değişimi anında stale. R3A passage text persistent değildir.
- Derived aspect claim: bağlı olduğu en kısa source TTL'sini aşamaz.
- Ephemeral search: request lifetime; debug log'da raw query/result yok.
- Policy/allowlist/license değişimi: etkilenen tüm cache keys fail-closed invalid.
- 404/redirect/domain ownership değişimi: source revalidation ve claim quarantine.

D7-R1 storage port'u `direct_source_long|unknown_short|not_cacheable` sınıflarını uygular. D7-R2A/R3A teknik metadata cache'i verified Wikidata identity için 6 saat, exact QID/project/title Wikipedia page/revision metadata için 15 dakika process-memory başlangıç politikası kullanır; transient extract, normalized document, passage veya packet saklamaz. D7-R2B/R2C OpenAI/Groq/OpenRouter request/response, output/reasoning, query, action/response ID, snippet/highlight, Tavily/Exa metadata ve discovered-source listesi için persistent cache açmaz; yalnız içeriksiz telemetry bırakabilir. Bu süreler conditional live gözlemle yalnız daha dar yapılabilir.

## 8. Yasaklar

- AniList mass collection, hoarding veya bulk training corpus.
- Search snippet'lerini lisanslı direct content gibi saklamak.
- Wikipedia attribution/revision olmadan passage persistence.
- Search engine rank/popularity'yi aspect kanıtı saymak.
- Title benzerliğiyle source'u candidate'a bağlamak.
- User prompt, library/profile/feedback bilgisini source query/cache key'ine kalıcı yazmak.
- Terms audit'i tamamlanmamış domaini hard allowlist'e almak.

İlgili belgeler: [Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md), [Research Security Model](D7_RESEARCH_SECURITY_MODEL.md), [D7 Data and License Audit](D7_DATA_AND_LICENSE_AUDIT.md).
