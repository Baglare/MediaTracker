# Canonical Media Identity V2

## Amaç ve sınır

Canonical Media Identity V2, bir local kayıt instance'ı ile temsil edilen
medyanın mantıksal kimliğini birbirinden ayırır. Bu aşama local persisted
modeli ve compatibility altyapısını hazırlar; duplicate merge, remote primary
key değişikliği ve fuzzy eşleme yapmaz.

## Record ID ve canonical identity

`MediaItem.id` local record ID'dir. Progress log `mediaId` ilişkisi, UI
selection, React list key'i, edit/delete ve grup üyeliği bu değeri kullanmaya
devam eder. D1C.1 migration'ı record ID'leri veya `ProgressLog.mediaId`
değerlerini değiştirmez.

`MediaItem.identity` medyanın değişmez mantıksal kimliğidir. Exact duplicate
tespiti, gelecekteki XP/recommendation/social consumer migration'ları ve
cross-device logical identity için kullanılabilir. Owner scope identity
anahtarının parçası değildir; kullanıcı izolasyonu storage ve cloud ownership
katmanındadır.

## V2 key formatı

Format:

```text
v2:<source>:<namespace>:<stable-id>
```

Key, `source`, `namespace` ve stabil ID'den yeniden üretilir. Persisted `key`
alanına körlemesine güvenilmez. Format locale bağımsızdır; başlık, kullanıcı ID,
cover veya benzerlik skoru içermez.

| Source | Namespace | Stabil ID örneği |
|---|---|---|
| `tmdb` | `movie`, `tv` | `v2:tmdb:movie:123` |
| `anilist` | `anime`, `manga` | `v2:anilist:anime:456` |
| `tvmaze` | `show`, `season` | `v2:tvmaze:season:789-season-2` |
| `omdb` | `title` | `v2:omdb:title:tt0133093` |
| `openlibrary` | `work`, `edition` | `v2:openlibrary:work:OL45883W` |
| `manual` | `item` | `v2:manual:item:<uuid>` |
| `legacy` | `record` | `v2:legacy:record:<encoded-record-id>` |

## Source namespace registry

- TMDB numeric ID'leri `movie` ve `tv` namespace'lerinde ayrılır.
- AniList API entity türü `anime` veya `manga` namespace'ini belirler. Light
  novel subtype'ı AniList manga entity namespace'ini değiştirmez.
- TVmaze show ve season kimlikleri ayrıdır. Episode identity bu aşamada yoktur.
- OMDb yalnız doğrulanmış IMDb `tt...` ID'sini `title` namespace'inde kabul eder.
- Open Library `OL...W` work ve `OL...M` edition ID'lerini ayırır; edition
  bilgisi yoksa uydurulmaz.
- Manual kayıt güvenli random UUID alır. Başlık, type, status veya progress
  değişimi bu UUID'yi değiştirmez.
- External source/namespace güvenle çözülemiyorsa sahte identity üretilmez.
  Kayıt `identityStatus: "unresolved"` ve issue kodlarıyla görünür kalır.

## Runtime doğrulama

`lib/media-identity.ts` source/namespace allowlist'ini, stabil ID biçimini ve
key yeniden üretimini uygular. Key uyuşmazlığı repairable'dır. Bilinmeyen
source, namespace, version veya malformed stable ID unresolved olur.

Eksik legacy identity migration sırasında türetilebilir. Persisted fakat bozuk
manuel identity normal hydration sırasında yeni UUID ile değiştirilmez; böylece
kimlik her reload'da yeniden üretilemez.

Tanımlı issue kodları:

- `IDENTITY_MISSING`
- `IDENTITY_UNRESOLVED`
- `IDENTITY_INVALID_SOURCE`
- `IDENTITY_INVALID_NAMESPACE`
- `IDENTITY_KEY_MISMATCH`
- `IDENTITY_ALIAS_COLLISION`
- `IDENTITY_EXACT_COLLISION`
- `MANUAL_ID_MISSING`
- `MANUAL_ID_REGENERATED`

Son kod diagnostic rezervidir; normal runtime yeniden üretim yapmaz.

## Local schema migration

Owner-scoped media ve progress envelope current schema sürümü `3`'tür.
Sequential `v2 -> v3` media migration'ı:

1. v2 current'ı runtime codec ile doğrular.
2. External identity'yi source registry ile deterministik türetir.
3. Manuel kayda bir kez UUID üretir.
4. Unresolved kayıtları silmeden korur.
5. Exact identity collision issue'larını üretir; kayıtları birleştirmez.
6. v3 envelope'u temp/current/backup protokolüyle yazar ve read-back doğrular.
7. Owner-scoped alias registry'yi yazar.

Alias yazımı veya verification başarısızsa önceki media current geri yüklenir;
safe-write backup korunur. v3 read ikinci kez manual UUID üretmez.

## Compatibility alias registry

Registry owner-scoped `mediaIdentityAliases` personal-data domain'idir.
Her alias doğrudan bir V2 canonical key'e gider:

- `legacy-canonical-key`: eski `externalSource:externalId` veya manuel
  `local:type:normalizedTitle` sonucu;
- `record-id`: mevcut `MediaItem.id`;
- `previous-provider-key`: yalnız doğrulanmış gelecek migration'ları için
  ayrılmıştır.

Alias chain ve V2 key'in alias olarak eklenmesi reddedilir. Aynı alias farklı
V2 key'lere gidiyorsa mevcut eşleme overwrite edilmez ve
`IDENTITY_ALIAS_COLLISION` kaydedilir. Registry guest/User A/User B arasında
paylaşılmaz ve temp/current/backup read-back doğrulamasını kullanır.

## Compatibility resolver ve consumer sınırı

| Consumer | D1C.1 davranışı |
|---|---|
| Local record ilişkileri | `MediaItem.id` kullanır; değişmedi |
| Exact duplicate sinyali | V2 key kullanabilir; merge yapmaz |
| XP entitlement/outbox | Legacy canonical key ve remote sözleşme değişmedi |
| Social snapshot/dedupe | Legacy key ve payload değişmedi |
| Recommendation local lookup | V2, alias ve mevcut fallback ile dual-read |
| Cloud download | Local V2 identity türetir |
| Cloud upload | Remote tabloda olmayan identity kolonu göndermez |
| Cloud sync queue | Local record entity ID sözleşmesi değişmedi |
| Backup/import | Identity varsa korunur; yoksa codec/migration türetir |

`canonicalMediaKey` kaldırılmadı ve semantiği değiştirilmedi. Yeni kod
`getCanonicalMediaKeyV2`, `getLegacyCanonicalMediaKey` ve
`resolveCanonicalMediaAlias` ayrımını açık kullanır.

## XP, recommendation, social ve cloud

XP grant/revoke/restore ve full-sync state hash'i legacy canonical key ile
çalışmaya devam eder. D1C.1 migration'ı yeni entitlement veya XP olayı üretmez.

Recommendation local projection'ı migration sonrası önce V2 ve alias
eşleşmesini, sonra mevcut record/provider fallback'lerini deneyebilir. Remote
recommendation snapshot formatı değişmez.

Social activity, shared snapshot ve idempotency sözleşmeleri legacy key'i
korur; private note veya identity metadata remote payload'a eklenmez.

Cloud download external kayıt için deterministik V2 üretir. External kimliği
olmayan cloud legacy kayıt `row.id` tabanlı `legacy:record` identity alır ve her
download'da değişmez. Upload bilinmeyen kolon göndermez. Remote key migration,
revision ve tombstone D2 kapsamındadır.

## Collision ve unresolved davranışı

Aynı V2 key'e sahip iki local record bulunduğunda ikisi de korunur,
`IDENTITY_EXACT_COLLISION` üretilir ve progress log/XP state değiştirilmez.
Otomatik merge D1C.2 kapsamı dışındadır.

Başlık, yıl ve medya türü benzerliği canonical identity değildir. Bunlar yalnız
D1C.2 probable-duplicate sinyali olabilir. Cross-source alias ancak aynı içeriği
kanıtlayan güvenilir metadata ve ayrı bir migration kararıyla eklenebilir.

## Sonraki sınırlar

- D1C.2A: exact/strong/probable duplicate scanner, owner-scoped review kararı
  ve false-positive koruması
  [DUPLICATE_SCANNER_AND_REVIEW.md](./DUPLICATE_SCANNER_AND_REVIEW.md)
  sözleşmesinde uygulanmıştır.
- D1C.2B: kullanıcı kontrollü merge executor, survivor ve ilişki taşıma.
- D1D: issue raporlama, quarantine ve repair akışları.
- D1E: versioned portable backup/export sözleşmesi.
- D2: XP/social/cloud key consumer migration'ı, revision, tombstone ve remote
  primary key stratejisi.

## Manuel testler

1. D1C.1 öncesi external ve manuel kayıt içeren owner scope'u aç.
2. Migration sonrası media/log sayısı ile record ID ilişkilerinin değişmediğini
   kontrol et.
3. Manuel kaydın başlığını ve type'ını değiştir; V2 key'in aynı kaldığını
   doğrula.
4. Aynı TMDB numeric ID için movie ve TV fixture'larının farklı key aldığını
   kontrol et.
5. Logout/login sonrası identity ve owner alias registry'nin korunduğunu
   doğrula.
6. XP toplamı ve recommendation “kütüphanede” eşleşmesinin değişmediğini kontrol
   et.
