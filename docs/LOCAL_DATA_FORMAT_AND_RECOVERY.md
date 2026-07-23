# Local Data Format and Recovery

## Kapsam

Bu belge D1B.1 local media library ve progress-log persistence sözleşmesini tanımlar. Kullanıcı namespace'i, canonical identity, duplicate birleştirme, cloud revision/tombstone, trash UI ve taşınabilir backup formatı bu sözleşmenin parçası değildir.

## Envelope formatı

Media ve progress log kayıtları ayrı domain envelope'larında saklanır:

```json
{
  "format": "mediatracker-local-data",
  "domain": "media-library",
  "schemaVersion": 1,
  "writerVersion": "D1B.1",
  "writtenAt": "2026-07-23T10:00:00.000Z",
  "recordCount": 1,
  "records": []
}
```

Desteklenen domain'ler:

- `media-library`
- `progress-logs`

Domain karışıklığı, `records` dışı veri biçimi ve `recordCount` uyuşmazlığı corrupt kabul edilir. Bilinmeyen üst seviye metadata alanları geriye/ileriye dönük uyumluluk için yok sayılır. Yalnız `schemaVersion: 1` desteklenir; daha yeni sürüm `unsupported_version` sonucudur.

## Anahtarlar ve slotlar

| Domain | Current | Temp | Backup | Legacy |
|---|---|---|---|---|
| Media | `mediaTracker:data:media:v1` | `...:temp` | `...:backup` | `media-tracker-list` |
| Progress | `mediaTracker:data:progressLogs:v1` | `...:temp` | `...:backup` | `media-tracker-logs` |

Legacy raw backup anahtarları `mediaTracker:legacyBackup:<domain>:v1` biçimindedir. D1B.2 user namespace'i `buildLocalDataKeys` sınırına eklenecektir; D1B.1 anahtarlarında user ID bulunmaz.

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

Codec zorunlu kimlik, başlık, type, status, progress ve cover alanlarını; rating, favorite, notes, external identity, classification, grup ve kaynak metadata alanlarını runtime'da doğrular.

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

## Bilinen sınırlamalar

- Anahtarlar henüz user-scoped değildir; D1B.2 kapsamıdır.
- Checksum, taşınabilir backup manifesti ve restore UI D1E kapsamıdır.
- Quarantine görüntüleme/retention ve integrity repair D1D/D1F kapsamıdır.
- Canonical identity ve duplicate çözümü D1C kapsamıdır.
- Web Storage gerçek multi-key transaction veya multi-tab lock sağlamaz.
- Cloud revision, tombstone ve composite ownership D2 kapsamıdır.
