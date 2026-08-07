# D7-R2A Conditional Wikimedia Live Smoke

Tarih: 8 Ağustos 2026  
Durum: Test contract'ı hazır; varsayılan standard test koşusunda skip edilir.

## Kapı

Gerçek Wikimedia network testi yalnız üç koşul birlikte sağlanırsa çalışır:

```text
D7_RESEARCH_LIVE_SMOKE=1
MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED=1
MEDIA_TRACKER_RESEARCH_USER_AGENT=MediaTracker/0.1 (https://contact.example/...; contact@example.com)
```

Flag veya anlamlı User-Agent eksikse live dosya skip edilir. Standard unit/contract testleri fake DNS, pinned transport ve sentetik kısa JSON/plaintext kullanır; network açmaz. Live flag Recommendation V2 route'unu açmaz.

Komut:

```powershell
npm.cmd run test:run -- tests/recommendation-d7-r2a-wikimedia-live.integration.test.ts
```

## Senaryolar

1. Steins;Gate AniList exact ID `9253`: QID entity property revalidation, varsa enwiki/trwiki page ID/revision, bounded transient plaintext ve content hash. Romance claim aranmaz.
2. IMDb exact ID `tt0137523`: P345 exact lookup ve entity verification; title search yok.
3. Bilinmeyen bounded AniList ID: `identity_not_found`; fuzzy fallback yok.
4. Ambiguous sonuç live drift'e bağlanmaz; sentetik codec fixture'ında test edilir.

Sabit paragraf, metin boyu, revision ID veya zorunlu sitelink assertion'ı yoktur. Conditional kapı açıkken network/contract başarısızsa test controlled failure verir; başarı gibi raporlanmaz. Bu teslimde environment kapalı olduğu için live smoke çalıştırılmamış/skip edilmiştir.

İlgili belgeler: [network foundation](D7_RESEARCH_NETWORK_FOUNDATION.md), [Wikidata identity](D7_WIKIDATA_IDENTITY_RESOLUTION.md), [Wikipedia direct source](D7_WIKIPEDIA_DIRECT_SOURCE.md).

