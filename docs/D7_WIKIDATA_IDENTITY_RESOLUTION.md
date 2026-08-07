# D7-R2A Exact Wikidata Identity Resolution

Tarih: 8 Ağustos 2026  
Durum: Exact external-ID resolver ve entity revalidation hazır; title/fuzzy arama yoktur.

## Merkezi property registry

Registry version: `d7-r2a.1`.

| Mapping | Media/scope | Property | Durum | Resmî property entity |
| --- | --- | --- | --- | --- |
| AniList anime | anime `work|season` | P8729 | Enabled | [P8729](https://www.wikidata.org/wiki/Property:P8729) |
| AniList manga | manga/manhwa/manhua `work` | P8731 | Enabled | [P8731](https://www.wikidata.org/wiki/Property:P8731) |
| IMDb secondary ID | anime/tv/movie `work|installment` | P345 | Enabled | [P345](https://www.wikidata.org/wiki/Property:P345) |
| TMDB movie | movie `work|installment` | P4947 | Enabled | [P4947](https://www.wikidata.org/wiki/Property:P4947) |
| TMDB TV | tv `work` | P4983 | Enabled | [P4983](https://www.wikidata.org/wiki/Property:P4983) |
| TVMaze | tv | — | Disabled/unresolved | Doğrulanmış local property contract yok |
| Open Library work | book | P648 | Disabled | [P648](https://www.wikidata.org/wiki/Property:P648); mevcut `/works/` normalizasyonu ve scope semantiği live contract bekliyor |
| Open Library edition | book edition | — | Disabled/unresolved | Ayrı doğrulanmış edition mapping yok |

UI label veya provider adı property tahmini üretmez. `queryEnabled=false` kayıt QID lookup açamaz. IMDb, candidate'ın exact secondary identity kaydından gelir; title/year kullanılmaz.

## Exact query ve verification

Resolver önce R1 `RecommendationCandidateIdentity + ResearchVersionScope` eşleşmesini doğrular. Registry normalizer'ı digits/IMDb gibi bounded exact biçimi kabul ederse WDQS sorgusu yalnız code-controlled property ve escaped literal kullanır:

```sparql
SELECT ?item WHERE { ?item wdt:P8729 "9253". } LIMIT 2
```

`REGEX`, label service, title veya fuzzy search yoktur. Sonuç codec'i malformed row'u warning ile atlayabilir; bütün response shape bozuksa adapter error verir.

- 0 QID: bir sonraki izinli exact bridge denenebilir; hepsi boşsa `identity_not_found`.
- 1 QID: entity JSON ile aynı property/external ID yeniden doğrulanır.
- 2 QID: `identity_ambiguous`; biri otomatik seçilmez.

Entity codec QID regex'ini, claims/snak string değerini, `enwiki|trwiki` sitelink shape'ini ve resmî response varsa `lastrevid/modified` alanını doğrular. WDQS sonucu tek başına evidence değildir. Entity property mismatch `identity_unverified` üretir.

## Version scope

AniList anime ID'si exact media/season entity olabildiği için `season` scope izinlidir; resolved identity aynı `versionScopeKey`i taşır. TMDB TV veya IMDb series ID'si season'a sessiz düşmez. IMDb/TMDB movie exact title ID'si installment scope alabilir. Open Library work/edition ve TVMaze mapping'leri doğrulanana kadar resolver kapalıdır. Parent ve title fallback yoktur.

Sitelink tercihi metadata policy'sidir: varsayılan `enwiki`, sonra `trwiki`. Sitelink yoksa verified Wikidata identity `wikidata_only` olarak kalabilir; Wikipedia document uydurulmaz.

## WDQS etiquette

GET, JSON Accept, proje User-Agent/Api-User-Agent, 3000 ms ve iki attempt kullanılır. Sorgu `LIMIT 2` ile bounded'dır. Interactive direct-source çağrıda `maxlag` eklenmez; background batch policy'si gelecekte ayrı ele alınır. Full SPARQL/external ID production loguna yazılmaz.

İlgili belgeler: [network foundation](D7_RESEARCH_NETWORK_FOUNDATION.md), [Wikipedia direct source](D7_WIKIPEDIA_DIRECT_SOURCE.md).

