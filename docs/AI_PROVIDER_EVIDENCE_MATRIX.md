# AI Provider Evidence Matrix

> Durum: D6-0 karar sözleşmesi. “Hedef” sütunları V2 yeteneğini, “mevcut boşluk” notları bugünkü adaptörleri anlatır. Bu belge canlı provider doğrulaması değildir.

## Kaynak sahipliği

| Medya/işlev | Birincil kaynak | İkincil rol |
|---|---|---|
| Anime, manga, manhwa, manhua önerisi | AniList | Verifier yalnız AniList kimliğine bağlı metadata'yı değerlendirir. |
| Anime dışı TV önerisi | TVMaze ve TMDB | TVMaze yayın/bölüm metadata'sı; TMDB genre/keyword discovery zenginleştirmesi sağlar. |
| Film önerisi | TMDB | OMDb IMDb kimliği ve ikincil doğrulama sağlar. |
| Kitap önerisi | Open Library | Work/edition ve bibliyografik metadata birlikte tutulur. |

Provider kimliği doğrulanmamış eser normal öneri havuzuna alınmaz. Web sonucu veya LLM başlığı tek başına kimlik değildir. Provider'lar arası eşleşme; normalize başlık, yıl, medya türü ve varsa IMDb/ilişki kimlikleriyle açıkça kaydedilir, sessiz birleştirme yapılmaz.

Gösterim: `Evet` doğrudan kullanım, `Koşullu` başka alan/kanıt gerektirir, `Hayır` bu amaçla kullanılmaz. Hard constraint kararı medium/high confidence ve alanın anlamına uygun olmalıdır. Eksik alan `unknown` üretir; `absent` üretmez.

## AniList

| Alan | Discovery | Hard constraint | Aspect strength | Yalnız soft signal | Confidence etkisi | Veri eksikliği davranışı |
|---|---|---|---|---|---|---|
| Exact identity (`id`, media type) | Evet | Evet: kimlik/tür | Hayır | Hayır | High | Kimlik yoksa aday elenir. |
| Genres | Evet | Koşullu: geniş genre must | Evet, partial/strong taxonomy'ye göre | Hayır | Medium; başka kanıtla high | Eksikse ilgili aspect unknown. |
| Tags | Evet | Koşullu | Evet | Hayır | Medium | Tag yoksa genre dışı aspect unknown. |
| Tag relevance/rank | Evet | Evet, registry eşiği varsa | Evet, merkezilik için temel | Hayır | High/medium | Rank yoksa tag en fazla partial. |
| Format | Evet | Evet | Hayır | Hayır | High | İstenen format must ise aday elenir. |
| Status | Evet | Evet | Hayır | Hayır | High | Status constraint'i varsa unknown/eliminasyon strictness'e göre. |
| Length (episodes/chapters/volumes) | Evet | Evet, exact alan olduğunda | Hayır | Hayır | High | Sayı yoksa explicit must karşılanmış sayılmaz. |
| Popularity/score | Evet | Hayır | Hayır | Evet | Sıralamayı doğrulamaz | Eksikse quality contribution sıfır. |
| Relations | Koşullu | Evet: franchise/season hijyeni | Hayır | Koşullu: diversity | High/medium | Dedupe franchise düzeyine çıkamaz; uyarı kaydedilir. |
| Synopsis | Evet | Tek başına hayır | Koşullu, classifier/verifier ile | Evet | Tek başına low | Eksikse synopsis tabanlı evidence unknown. |

Mevcut kod boşluğu: arama sorgusu genre/format/status/length/score/popularity taşırken tag ve tag rank istemiyor; candidate adaptörü popularity, synonym, country ve relations bilgisini kaybediyor. D6-2, tag rank'i ve gerekli ham kanıt referanslarını kayıpsız taşır.

## TVMaze

| Alan | Discovery | Hard constraint | Aspect strength | Yalnız soft signal | Confidence etkisi | Veri eksikliği davranışı |
|---|---|---|---|---|---|---|
| Exact identity (`id`) | Evet | Evet: kimlik | Hayır | Hayır | High | Kimlik yoksa aday elenir. |
| Show type | Evet | Evet: anime sınıflandırma bileşeni | Hayır | Hayır | Medium | Yoksa yalnız genre/dil/ülke sinyalleri kullanılır. |
| Genres | Evet | Koşullu: geniş genre ve `Anime` exclusion | Evet, partial | Hayır | Medium | Eksikse aspect unknown; anime olmadığı sonucu çıkarılmaz. |
| Language | Evet | Yalnız anime sınıflandırma bileşeni | Hayır | Evet | Low/medium | Yoksa probable-anime kuralının o kolu çalışmaz. |
| Network country | Evet | Yalnız anime sınıflandırma bileşeni | Hayır | Evet | Low/medium | Yoksa ülke sinyali unknown. |
| Status | Evet | Evet | Hayır | Hayır | High | İstenen status must ise unknown kabul edilmez. |
| Episode metadata | Evet | Evet: uzunluk/yayın koşulları | Episodic için tek başına hayır | Koşullu | High sayısal alanlarda | Eksikse bölüm hard constraint'i karşılanmış sayılmaz. |
| Synopsis | Evet | Tek başına hayır | Koşullu, verifier ile | Evet | Low | Eksikse semantic evidence unknown. |
| Anime exclusion signals | Evet | Evet: recommendation TV havuzu hijyeni | Hayır | Hayır | Genre `Anime`: high; birleşik sinyal: medium | Karar verilemiyorsa kayıt TV havuzunda kalabilir, debug riski taşır. |

Mevcut kod boşluğu: `TvmazeRawShow` tipi `show.type` alanını modellemiyor; country normalize sonuçta, language/status/network candidate adaptöründe kayboluyor. Bütün sonuçlar sıradan `tv` adayı oluyor ve recommendation'a özel anime exclusion yok.

### Recommendation'a özel anime exclusion

- **Kesin anime:** `genres` içinde case-insensitive `Anime` varsa recommendation TV havuzundan elenir.
- **Yüksek olasılıklı anime:** `show.type === "Animation"` ve ayrıca `language === "Japanese"` veya `network.country.code === "JP"` veya `webChannel.country.code === "JP"` ise elenir.
- **Batı animasyonu:** yalnız `Animation` olması elenme nedeni değildir.
- Her eleme `tvmaze_anime_excluded` debug sayacını artırır; kullanıcı contract'ında ham provider payload'ı açığa çıkarılmaz.
- False positive riski: Japon yapımı anime olmayan animasyon veya ortak yapım. False negative riski: genre/type/dil/ülke alanlarının eksik ya da hatalı olması. Bu nedenle kesin ve olasılıklı sınıflar trace'te ayrılır.
- TVMaze sonuçları AniList anime havuzuna taşınmaz; identity ve taxonomy kaynağı AniList olarak kalır.
- Bu filtre yalnız recommendation TV candidate pool policy'sidir. Global manuel arama ve release calendar kullanıcıya provider kataloğunu gösterdiği için bağımsız kalır; D6 değişikliği ortak normalizer'a görünmez bir eleme eklememelidir.

## TMDB

| Alan | Discovery | Hard constraint | Aspect strength | Yalnız soft signal | Confidence etkisi | Veri eksikliği davranışı |
|---|---|---|---|---|---|---|
| Movie/TV identity (`id`, media kind) | Evet | Evet: kimlik/tür | Hayır | Hayır | High | Kimlik yoksa aday elenir. |
| Genre | Evet | Koşullu: geniş genre | Evet, partial/strong eşlemeye göre | Hayır | Medium | İlgili aspect unknown. |
| Keyword | Evet | Koşullu, registry destek düzeyine göre | Evet | Hayır | Medium; çoklu kanıtla high | Eksik keyword absent anlamına gelmez. |
| Overview | Evet | Tek başına hayır | Koşullu, verifier ile | Evet | Low | Semantic evidence unknown. |
| Language/country | Evet | Evet: açık dil/ülke constraint'i | Hayır | Koşullu | Medium/high | Constraint yoksa nötr; varsa unknown strictness'e gider. |
| Popularity/vote | Evet | Hayır | Hayır | Evet | Evidence confidence artırmaz | Eksikse quality contribution sıfır. |
| Runtime/episode metadata | Evet | Evet, exact alan olduğunda | Hayır | Hayır | High | Explicit süre/bölüm must karşılanmış sayılmaz. |

Mevcut kod boşluğu: route yalnız `/search/movie` kullanıyor; TV discovery yok. Normalize edilen sonuç genre, keyword, vote/popularity ve runtime taşımıyor. Hedefte film ve TV discovery açıkça ayrılır; TVMaze metadata'sı ile cross-provider eşleşme kanıtı saklanır.

## OMDb

| Alan | Discovery | Hard constraint | Aspect strength | Yalnız soft signal | Confidence etkisi | Veri eksikliği davranışı |
|---|---|---|---|---|---|---|
| IMDb identity | Evet | Evet: film identity/secondary verification | Hayır | Hayır | High | IMDb doğrulaması yoksa TMDB kimliği kalır; OMDb doğrulandı denmez. |
| Title/year | Evet | Evet: cross-provider eşleşme bileşeni | Hayır | Hayır | Medium/high birlikte | Uyuşmazlık identity conflict üretir. |
| Genre | Evet | Koşullu: geniş genre | Evet, partial | Hayır | Medium | Aspect unknown. |
| Plot | Evet | Tek başına hayır | Koşullu, verifier ile | Evet | Low | Semantic evidence unknown. |
| Rating | Evet | Hayır | Hayır | Evet | Evidence confidence artırmaz | Quality contribution sıfır. |
| Secondary verification | Hayır | Evet: identity hijyeni | Hayır | Hayır | High eşleşme, low/unknown uyuşmazlık | Conflict sessizce çözülmez; aday karantinaya alınır veya TMDB-only gösterilir. |

OMDb film discovery için tek otorite değildir. V2'de TMDB candidate üretir; OMDb mevcut IMDb kimliği, title/year ve ikincil metadata ile doğrular. Provider erişilemezse doğrulanmış TMDB kimliği kullanılabilir, fakat OMDb kanıtı uydurulmaz.

## Open Library

| Alan | Discovery | Hard constraint | Aspect strength | Yalnız soft signal | Confidence etkisi | Veri eksikliği davranışı |
|---|---|---|---|---|---|---|
| Work/edition identity | Evet | Evet: identity/edition ayrımı | Hayır | Hayır | Work high; edition medium/high | Work key yoksa aday elenir; edition yoksa work-level kalır. |
| Authors | Evet | Evet: açık yazar constraint'i | Hayır | Hayır | High normalize eşleşmede | Eksikse yazar must karşılanmış sayılmaz. |
| Subjects | Evet | Koşullu | Evet, partial/strong mapping'e göre | Hayır | Medium | İlgili aspect unknown. |
| Description availability | Evet | Tek başına hayır | Koşullu, verifier ile | Evet | Varsa low/medium | Yoksa description evidence unknown. |
| Page/edition metadata | Evet | Evet: sayfa/edition constraint'i | Hayır | Koşullu | Sayfa medium/high; edition high | Eksik alan explicit must'i karşılamaz. |

Mevcut kod boşluğu: arama route'u work key, author, subject, edition count, ISBN, language ve median pages alıyor; candidate adaptörü subjects'i `genres` alanına sıkıştırıyor ve edition/ISBN/language ayrıntısını kaybediyor. Açıklama çoğu arama sonucunda yok. D6-2, subject taxonomy'sini genre gibi göstermeden evidence alanına taşır.

## Ortak veri eksikliği ve confidence kuralları

1. Provider'ın desteklemediği veya döndürmediği alan `unknown` olur. “Etiket yok” tek başına `absent` değildir.
2. Identity, objektif medya türü ve sayısal hard constraint alanlarında gereken veri yoksa explicit must karşılanmış sayılmaz.
3. Popularity, vote ve rating evidence confidence değildir; yalnız sınırlı quality tie-break girdisidir.
4. Synopsis/overview/plot/description doğrudan hard aspect kararı vermez. Structured taxonomy kanıtı ile verifier sonucu ayrı kaynaklar olarak saklanır.
5. Provider çatışması confidence'ı düşürür ve `contradictoryEvidence` üretir; bir provider diğerini sessizce ezmez.
6. Provider metadata cache'i kişisel profil, kullanıcı notu veya feedback taşımaz. Cache anahtarı provider, external ID, schema sürümü ve metadata sürümünü içerir.

Aspect eşlemelerinin tek doğruluk kaynağı [AI Aspect Taxonomy](AI_ASPECT_TAXONOMY.md), aggregation ve ranking sözleşmesi [AI Recommendation V2 Architecture](AI_RECOMMENDATION_V2_ARCHITECTURE.md) belgesidir.
