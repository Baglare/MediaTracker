# D7 Grounded Research Acceptance Cases

Tarih: 8 Ağustos 2026
Durum: D7-R1 karar, D7-R2A direct-document ve D7-R2B ephemeral discovery contract kabulü tamamlandı; conditional live varsayılan kapalıdır.

## Ortak kabul invariant'ları

Her senaryoda candidate exact provider identity ve doğru version/season scope ile başlar. Search title/popularity evidence değildir. Research yalnız unresolved hard constraint için çalışır. Extractor yalnız supplied passages kullanır; `supported|contradicted` citation zorunludur; citation/source yoksa `unknown`. Son uygunluk ve sıra D6 deterministic V2'ye aittir.

## 1. Steins;Gate — romance rescue

İstek: anime; `sci_fi must`, `time_travel must`, `romance must` (`significant+`).

1. AniList high-recall retrieval exact Steins;Gate identity'sini ve doğru seri/season scope'unu döndürür.
2. Structured evidence sci-fi/time travel koşullarını destekler; romance alanı eksik veya merkezilik için yetersizdir.
3. Candidate elenmez; yalnız `romance must` için `research_pending` olur.
4. Wikidata identity mapping doğru Wikipedia/MediaWiki sayfasına bağlanır. Allowlisted direct revision'dan ilişki gelişiminin olay kararlarını etkilediğini gösteren bounded pasaj seçilir.
5. Extractor `romance=supported`, `level=significant` veya `primary`, yeterli confidence ve passage citation döndürür.
6. Citation candidate/season/revision ile doğrulanır; grounded evidence structured aggregation'a eklenir.
7. D6 hard filter romance must'u geçirir. Candidate normal sonuç listesine girebilir; sırası LLM değil mevcut deterministic sort key ile belirlenir.

Beklenen başarısızlıklar: citation yoksa, yalnız başka Steins;Gate season/adaptation sayfası varsa veya passage yalnız bir karakterin “love interest” olduğunu söyleyip merkezilik göstermiyorsa romance `unknown/incidental` kalır ve must geçmez.

## 2. Kakegurui — popularity romance kanıtı değildir

İstek: anime; `romance must` (`significant+`).

1. Kakegurui başka queryable koşullarla high-recall havuza girebilir.
2. Title, popularity, okul/drama taxonomy'si romance kanıtı sayılmaz.
3. Targeted romance research yalnız allowlisted direct sources üzerinde çalışır.
4. Kaynak pasajları significant romance desteklemiyorsa extractor `unknown` veya açık source contradiction varsa `contradicted` üretir.
5. `unknown`, `absent`e çevrilmez; popularity must açığını telafi etmez.
6. Candidate primary sonuçtan geçmez. Exploratory modda ancak `romance evidence unknown/failed` gerekçeli near-match olabilir.

Kabul: source-backed significant romance olmadan normal öneri yoktur.

## 3. Political intrigue — taxonomy recall, research centrality

İstek: `political_intrigue must`.

1. AniList canonical `Politics` tag mapping'i candidate retrieval'ı sahiplenir; generic title fallback çalışmaz.
2. Politics tag'i high-recall query signalidir; tek başına intrigue centrality veya `primary` kanıtı değildir.
3. Top-N Politics adaylarında unresolved centrality targeted research'e girer.
4. Gizli ittifak, ihanet, şantaj veya stratejik güç manevrasının tekrarlı anlatı rolünü gösteren citation'lı passage significant/primary evidence'i güçlendirebilir.
5. Politics query'sinden gelmeyen, exact identity/taxonomy bağı olmayan alakasız title candidate research ile havuza sokulmaz.

Kabul: retrieval provenance Politics mapping'ini, research provenance merkezilik citation'ını ayrı taşır.

## 4. Love triangle avoid — yokluk otomatik güvenli değildir

İstek: `love_triangle avoid` (`significant+`).

1. Structured veya grounded research evidence significant/primary love triangle gösterirse candidate reject edilir.
2. Source hiç triangle'dan söz etmiyorsa bu absence kanıtı değildir; verdict `unknown` kalır.
3. Search result bulunmaması, provider timeout veya kısa synopsis candidate'a “love triangle yok” etiketi vermez.
4. Unknown avoid mevcut D6 unknown/risk policy'siyle işlenir; candidate'a güven bonusu verilmez ve explanation “yok” demez.

Kabul: pozitif evidence kesin reject; evidence yokluğu otomatik `absent` değil.

## 5. Character-driven — kısa synopsis yetersiz

İstek: `character_driven must` (`significant+`).

1. Candidate diğer queryable/objective koşullarla havuza girer.
2. Kısa synopsis yalnız olayları listeliyor ve olay dönemeçlerinin karakter seçimlerinden doğduğunu göstermiyorsa structured result `unknown`dur.
3. Targeted research; karar, iç çatışma ve ilişki dönüşümünü anlatan direct passage arar.
4. Yeterli citation'lı passage varsa `supported + significant/primary`; olay örgüsü dış olaylarla sürükleniyorsa açık passage `contradicted` olabilir.
5. Research sonrası hâlâ yeterli kanıt yoksa `unknown` korunur ve must primary listeden geçmez.

Kabul: model world knowledge ile boşluğu doldurmaz; unknown açık kalır.

## 6. Cross-cutting negatif senaryolar

| Durum | Beklenen sonuç |
| --- | --- |
| OpenAI/Brave search citation URL'si allowlist dışında | Source reddedilir; task başka source dener veya unknown |
| Search snippet var, direct source fetch yok | Persistent claim yok; unknown |
| Wikipedia revision candidate'ın başka season'ına ait | Identity/version mismatch; claim reddedilir |
| Passage içinde prompt injection | Talimat olarak yürütülmez; riskli passage quarantine edilebilir |
| Extractor `supported` ama citation array boş | Codec reject; unknown |
| İki güvenilir source çelişiyor | Contradiction korunur; confidence düşer veya unknown |
| Research provider rate-limited | `provider_unavailable/rate_limited`; absent değil |
| Aynı research task eşzamanlı iki request'te | Tek upstream iş; ikinci request coalesced telemetry alır |
| Cache policy/revision değişmiş | Stale entry serving'de kullanılmaz; revalidation gerekir |

## 7. Fixture çıktısı

D7-R1'de Steins;Gate, Kakegurui, political intrigue, love triangle avoid, character-driven ve no-source→unknown senaryoları sentetik contract testlerine çevrilmiştir. D7-R2A fake DNS/transport/Action API direct-document zincirini; D7-R2B ise strict request privacy, deterministic query, OpenAI request/decoder, allowlist revalidation, ephemeral cache sınırı, retry/budget/concurrency/coalescing zincirini test eder. Wikimedia ve OpenAI conditional live testleri ilgili environment kapalıyken skip edilir.

R2A Steins;Gate fixture'ı yalnız AniList exact ID → QID property verification → verified sitelink → page/revision → bounded transient document + citation metadata zincirini doğrular. Romance veya başka aspect claim'i çıkarmak D7-R3 kapsamıdır. Sabit Wikipedia cümlesi, revision ID veya metin uzunluğu acceptance assertion'ı değildir.

R2B Steins;Gate fixture'ı aynı exact identity/work scope ve unresolved romance aspect'inden en fazla iki public deterministic query üretir. OpenAI request yalnız `wikipedia.org` provider filter'ı taşır. Accepted URL'nin `en.wikipedia.org|tr.wikipedia.org` exact registry host'larından gelmesi gerekir. Discovery sonucu romance kararı değildir; no-result `absent` yapmaz. Conditional live test exact URL veya claim değil, gerçek `web_search_call` ve accepted URL policy'sini sınar.

İlgili belgeler: [Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md), [Research Source Policy](D7_RESEARCH_SOURCE_POLICY.md), [Research Security Model](D7_RESEARCH_SECURITY_MODEL.md).
