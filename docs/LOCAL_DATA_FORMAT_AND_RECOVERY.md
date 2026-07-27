# Local Data Format and Recovery

## Kapsam

Bu belge D1B.1 local media library ve progress-log persistence sözleşmesini tanımlar. D1B.2A owner namespace entegrasyonu, auth geçişi ve queue izolasyonu [LOCAL_DATA_OWNERSHIP_AND_NAMESPACES.md](./LOCAL_DATA_OWNERSHIP_AND_NAMESPACES.md) belgesinde tanımlanır. D1C.1 schema v3 identity migration'ı ve compatibility alias sözleşmesi [CANONICAL_MEDIA_IDENTITY.md](./CANONICAL_MEDIA_IDENTITY.md) belgesindedir. Duplicate birleştirme, cloud revision/tombstone, trash UI ve taşınabilir backup formatı bu sözleşmenin parçası değildir.

## Envelope formatı

Media ve progress log kayıtları ayrı domain envelope'larında saklanır:

```json
{
  "format": "mediatracker-local-data",
  "domain": "media-library",
  "schemaVersion": 3,
  "writerVersion": "D1C.1",
  "ownerScope": "guest",
  "datasetOrigin": "user",
  "writtenAt": "2026-07-23T10:00:00.000Z",
  "recordCount": 1,
  "records": []
}
```

Desteklenen domain'ler:

- `media-library`
- `progress-logs`

Domain karışıklığı, `records` dışı veri biçimi, owner uyuşmazlığı ve `recordCount` uyuşmazlığı ayrı doğrulama sonuçları üretir. Bilinmeyen üst seviye metadata alanları geriye/ileriye dönük uyumluluk için yok sayılır. Aktif owner-scoped sürüm `schemaVersion: 3`'tür; scoped v2 sequential migration kaynağıdır, daha yeni sürüm `unsupported_version` sonucudur.

## Anahtarlar ve slotlar

| Domain | Scoped current | Temp | Backup | Unscoped/legacy |
|---|---|---|---|---|
| Media | `mediaTracker:data:v2:<scope>:media` | `...:temp` | `...:backup` | `mediaTracker:data:media:v1`, `media-tracker-list` |
| Progress | `mediaTracker:data:v2:<scope>:progressLogs` | `...:temp` | `...:backup` | `mediaTracker:data:progressLogs:v1`, `media-tracker-logs` |

Legacy raw backup anahtarları `mediaTracker:legacyBackup:<domain>:v1` biçimindedir. Anahtar adındaki `v2` owner key-layout sürümüdür; envelope içindeki current schema sürümü `3`'tür.

## Read result durumları

- `missing`: Current ve legacy key yoktur.
- `empty`: Geçerli envelope vardır ve `records` boştur.
- `valid`: Geçerli envelope en az bir kayıt içerir.
- `corrupt`: JSON, envelope veya record codec doğrulanamamıştır.
- `unsupported_version`: Envelope desteklenenden daha yeni sürümdedir.
- `migration_failed`: Legacy/eski sürüm migration güvenli biçimde tamamlanamamıştır.
- `storage_unavailable`: Web Storage okunamıyor veya kullanılamıyordur.

Bu durumlar birbirine dönüştürülmez. Özellikle empty ile corrupt aynı değildir.

## MediaItem runtime codec

Codec zorunlu record ID, başlık, type, status, progress ve cover alanlarını; rating, favorite, notes, external identity, Canonical Identity V2, classification, grup ve kaynak metadata alanlarını runtime'da doğrular.

Kayıpsız normalizasyonlar repair olarak raporlanır:

- desteklenen legacy numeric string dönüşümü;
- `rating` değerinin `userRating` alias'ına taşınması;
- eksik `favorite` için `false`;
- eksik cover için type placeholder'ı;
- eksik classification için mevcut saf classification helper'ı;
- bilinen legacy seri grup inference'ı;
- negatif sıfırın sıfıra çevrilmesi.

Bilinmeyen status/type, boş title, negatif veya finite olmayan progress ve geçersiz rating reddedilir. `totalProgress: 0`, personal note ve data URL korunur. Geçersiz kayıt sessizce düşürülmez.

## ProgressLog runtime codec

Codec `id`, `mediaId`, snapshot title/type, action, amount/unit, previous/new progress ve `createdAt` alanlarını doğrular. Bilinmeyen action, negatif/finite olmayan progress, eksik mediaId ve geçersiz tarih reddedilir.

Eksik snapshot title güvenli fallback, eksik snapshot mediaType ise bilinen unit üzerinden repairable olabilir. Media kaydının bugün library içinde bulunmaması logu invalid yapmaz; orphan analizi D1D bütünlük taramasına aittir.

## Legacy dual-read migration

1. Önce versioned current key okunur.
2. Current missing ise legacy key okunur.
3. Legacy array runtime codec ile doğrulanır.
4. Raw legacy payload migration öncesi ayrı backup key'e kopyalanır.
5. Normalleştirilmiş kayıtlar versioned envelope'a safe-write edilir.
6. Current read-back doğrulaması yapılır.
7. Başarılı migration sonrasında current canonical kaynaktır.

Legacy key silinmez. Current oluştuğunda ikinci read migration'ı tekrar çalıştırmaz.

Legacy JSON veya record bozuksa current üretilmez, demo veri yazılmaz ve raw payload quarantine edilir. Migration/backup yazımı başarısızsa legacy kaynak korunur.

## Quarantine

Corrupt raw payload şu biçimde ayrı bir kayıtta korunur:

`mediaTracker:quarantine:<domain>:<timestamp>`

Quarantine metadata'sı domain, source key, capture zamanı, error code listesi ve raw payload içerir. Quarantine yazımı quota nedeniyle başarısız olsa bile source/current key silinmez. Görüntüleme ve retention politikası D1D/D1F kapsamındadır.

## Safe-write protokolü

Her domain için:

1. Yeni envelope serialize edilir.
2. Temp slotuna yazılır.
3. Temp geri okunup envelope ve record codec ile doğrulanır.
4. Mevcut current yalnız geçerliyse backup slotuna kopyalanır ve doğrulanır.
5. Temp payload current'a yazılır.
6. Current read-back doğrulanır.
7. Başarıda temp temizlenir.

Current doğrulaması başarısızsa önceki raw current geri yüklenir. Backup yalnız doğrulanmış eski current olabilir.

Media ve progress log mutation'ları `saveLibrarySnapshot` koordinatöründen geçer. Progress domain yazımı başarısız olursa aynı mutation içinde yazılan media current eski değere döndürülür. Web Storage gerçek transaction sağlamadığı için elektrik kesintisi veya tarayıcı process crash'i karşısında tam transaction garantisi yoktur; current/backup/temp slotları kurtarma adayı sağlar.

## Write result ve mutation sırası

Write sonucu `ok`, `writtenAt`, `backupCreated` veya şu kontrollü hata kodlarından birini taşır:

- `quota_exceeded`
- `serialization_failed`
- `verification_failed`
- `storage_unavailable`

`useMediaLibrary` politikası:

1. Yeni media+log snapshot'ını hesapla.
2. Snapshot'ı local storage'a yaz ve doğrula.
3. Yalnız başarılıysa React memory state'ini güncelle.
4. Yalnız başarılıysa cloud queue, XP outbox ve social outbox side-effect'lerini üret.

Write başarısızsa mutation memory state'e de kabul edilmez ve kullanıcı kontrollü warning görür. Böylece memory/persisted state sessizce ayrışmaz.

## Missing, empty, corrupt ve demo davranışı

- Missing media key açık ilk kurulum kabul edilir ve mevcut ürün kararı gereği demo data kullanılır. Bu başlangıç snapshot'ı hemen versioned current'a yazılmaya çalışılır.
- Geçerli empty envelope kullanıcının bilinçli boş kütüphanesidir; demo data gösterilmez.
- Corrupt, unsupported, migration-failed ve storage-unavailable durumlarında library recovery ekranı gösterilir; otomatik save ve dış side-effect'ler kapatılır.

## XP full-sync guard

XP `replace: true` tam eşitlemesi yalnız media read sonucu `valid` veya gerçek `empty` ise çalışabilir.

Blok nedenleri:

- `library_data_unavailable`
- `library_data_corrupt`
- `library_migration_required`

Bu kapı bozuk local payload'ın boş library olarak yorumlanıp cloud XP entitlements'ı topluca revoke etmesini engeller.

## Recommendation adapter

Recommendation inbox artık legacy media key'e doğrudan yazmaz. Küçük domain adapter'ı aynı codec ve media+log snapshot protokolünü kullanır. Cloud/XP/social side-effect'leri yalnız başarılı local write sonrasında üretilir; tekrar ekleme ID/external identity üzerinden idempotent davranır.

## D1B.2A namespace entegrasyonu

D1B.1 unscoped schema v1 anahtarları artık sahipliği belirsiz migration kaynağıdır. Aktif media/log persistence, owner metadata ve `datasetOrigin` taşıyan scoped schema v2 envelope kullanır. Unscoped kaynak authenticated kullanıcıya otomatik verilmez; guest migration veya explicit ownership gate kararından önce kaynak ve raw backup korunur.

Scoped key ile envelope `ownerScope` uyuşmazlığı `owner_mismatch` sonucudur ve corrupt/quarantine akışına dönüştürülmez. Safe-write current/temp/backup protokolü her owner scope içinde aynı şekilde uygulanır.

## D1C.1 schema v3 entegrasyonu

Scoped v2 media envelope ilk başarılı read sırasında v3'e migrate edilir. Runtime codec external kayıtlar için deterministik V2 identity türetir, manuel kayda bir kez UUID verir ve unresolved/exact-collision kayıtları silmeden issue olarak korur. Progress record formatı değişmez; envelope sürümü media ile birlikte v3 olur.

Media current ile owner-scoped `mediaIdentityAliases` registry birlikte doğrulanır. Alias registry safe-write başarısızsa v3 media current kabul edilmez ve önceki current geri yüklenir; backup slotları recovery adayı olarak korunur. Ayrıntılı identity ve consumer compatibility sözleşmesi [CANONICAL_MEDIA_IDENTITY.md](./CANONICAL_MEDIA_IDENTITY.md) belgesindedir.

## D1C.2A duplicate review registry

Duplicate scanner kararı media envelope'a yazılmaz. Owner-scoped
`duplicateReviewDecisions` personal-data domain'i yalnız candidate/evidence
fingerprint, scan version, record ID listesi, karar ve zamanı saklar. Personal
note, başlık, overview veya provider payload registry'ye kopyalanmaz.

Registry aynı temp/current/backup ve read-back verification protokolünü
kullanır. Corrupt veya foreign-owner current quarantine/owner-mismatch sonucu
üretir; recovery kararı olmadan overwrite edilmez. Candidate evidence veya
record üyeliği değiştiğinde eski karar uygulanmaz. Ayrıntılar
[DUPLICATE_SCANNER_AND_REVIEW.md](./DUPLICATE_SCANNER_AND_REVIEW.md)
belgesindedir.

## Bilinen sınırlamalar

- Local profile, custom theme ve AI state namespace'i D1B.2B ile
  [LOCAL_PERSONAL_DATA_OWNERSHIP.md](./LOCAL_PERSONAL_DATA_OWNERSHIP.md)
  sözleşmesine taşınmıştır.
- Checksum, taşınabilir backup manifesti ve restore UI D1E kapsamıdır.
- Quarantine görüntüleme/retention ve integrity repair D1D/D1F kapsamıdır.
- Duplicate tarama/review D1C.2A ile sağlanmıştır; merge D1C.2B kapsamındadır.
- Web Storage gerçek multi-key transaction veya multi-tab lock sağlamaz.
- Cloud revision, tombstone ve composite ownership D2 kapsamıdır.
