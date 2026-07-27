# Portable Backup V2

## Amaç ve sınır

D1E.1, aktif local owner'ın doğrulanmış core veri grafiğini owner-neutral bir
JSON dosyasına aktarır ve seçilen dosyayı hiçbir local state yazmadan inceler.
D1E.2 aynı doğrulanmış Portable V2 verisi için kontrollü, yalnız eklemeli import
sağlar. Replace, mevcut kayıt silme ve duplicate merge yapmaz. Mevcut
`lib/backup.ts` legacy backup/import sözleşmesi geriye dönük uyumluluk için
korunur ve Portable V2 additive coordinator'a yönlendirilmez.

Domain modeli ve read-only inspector `lib/portable-backup.ts`, kullanıcı akışı
`components/portable-backup-panel.tsx` sınırındadır. Component raw storage key,
auth UID veya domain codec ayrıntısı bilmez.

Additive plan/executor/journal sınırı `lib/portable-additive-import.ts` içindedir.
Panel yalnız dry-run seçeneklerini ve açık kullanıcı onayını iletir.

## Format

Kök obje yalnız `manifest` ve `data` alanlarını taşır. Format adı
`mediatracker-portable-backup`, sürüm `2`'dir.

```json
{
  "manifest": {
    "format": "mediatracker-portable-backup",
    "version": 2,
    "exportedAt": "2026-07-30T10:00:00.000Z",
    "application": {
      "name": "MediaTracker",
      "version": "0.1.0"
    },
    "schemas": {
      "mediaEnvelope": 3,
      "canonicalIdentity": 2,
      "progressLog": 1,
      "identityAliasRegistry": 1,
      "recordRedirectRegistry": 1,
      "recommendationLink": 1
    },
    "domains": ["mediaItems", "progressLogs"],
    "counts": {
      "mediaItems": 10,
      "progressLogs": 24,
      "identityAliases": 0,
      "recordRedirects": 0,
      "recommendationLinks": 0
    },
    "ownerType": "authenticated",
    "privacy": {
      "personalNotesIncluded": false,
      "rawProviderPayloadExcluded": true
    },
    "checksum": {
      "algorithm": "SHA-256",
      "value": "..."
    }
  },
  "data": {
    "mediaItems": [],
    "progressLogs": []
  }
}
```

Raw auth UID dosyaya yazılmaz. `ownerType` yalnız `guest` veya
`authenticated` değeridir. Object key'leri ve domain kayıtları kararlı biçimde
sıralanır; aynı kaynak, seçenek ve `exportedAt` aynı serialization/checksum
sonucunu üretir.

## Dahil edilen domain'ler

Varsayılan core seçim:

- `MediaItem`, Canonical Identity V2 ve MediaItem üzerindeki group/series
  ilişkileri;
- `ProgressLog`;
- identity alias registry;
- record redirect registry;
- owner-neutral recommendation local link projection'ı.

Recommendation link içindeki local `userId` taşınmaz. Duplicate review
kararları candidate/evidence fingerprint ve owner review akışına bağlı olduğu
için D1E.1 portable payload'a dahil edilmez.

## Hariç tutulan veriler

- auth session, raw owner UID, API key, token ve secret;
- cloud sync queue, XP/social outbox;
- duplicate merge ve integrity repair journal'ları;
- temp/current/backup slotları ve quarantine;
- pending cloud/theme metadata;
- raw provider payload ve serbest `metadata`;
- device-scoped appearance/layout/startup ayarları;
- profile/theme/AI personal-data domain'leri.

Media export'u canonical runtime codec üzerinden yeniden kurulur; bilinmeyen
runtime alanlar taşınmaz. Raw provider payload alanları ayrıca çıkarılır.

## Personal note privacy

`personalNotes`, MediaItem içinde özel veri olabilir. Export UI not içeren kayıt
sayısını gösterir ve notları varsayılan olarak dışarıda bırakır. Kullanıcı
yalnız açık checkbox seçimiyle notları dahil edebilir. Manifest bu seçimi
`privacy.personalNotesIncluded` ile kaydeder. File inspection hiçbir note
içeriğini summary veya issue mesajında göstermez.

## Checksum

Checksum, manifestin `checksum` alanı çıkarılmış haliyle `data` üzerinde
deterministik canonical serialization sonrası Web Crypto SHA-256 kullanılarak
hesaplanır. Yeni dependency yoktur. Inspection checksum'u yeniden hesaplar;
eşleşmeyen dosya restore adayı sayılmaz. Bu checksum bütünlük kontrolüdür,
şifreleme veya kimlik doğrulamalı imza değildir.

## Read-only inspection

Inspection yazma yapan storage reader kullanmaz ve sırayla şunları denetler:

1. UTF-8 byte boyutu için 10 MiB sınırı;
2. JSON parse;
3. format, version ve manifest;
4. SHA-256 checksum;
5. seçili domain varlığı ve manifest count eşleşmesi;
6. MediaItem/ProgressLog/alias/redirect runtime codec'leri;
7. duplicate media/log ID;
8. unresolved/exact identity ve group/relationship özetleri;
9. orphan log, missing alias/redirect/recommendation hedefleri;
10. unknown alanlar, yasak domain ve hassas owner/secret alan adları.

Desteklenmeyen ileri version tahmin edilmez. Eski `MediaTracker` backup dosyası
yalnız legacy olarak tanınır, mevcut codec ile uyumluluk özeti üretilir ve
Portable V2 checksum'u varmış gibi sunulmaz.

## UI davranışı

Settings içindeki Veri Yönetimi paneli domain seçimi, personal-note kararı ve
indirmeden önce count/boyut/owner-type özetini gösterir. Download yalnız
hazırlanmış ve checksum'u hesaplanmış snapshot'ı indirir. Ayrı dosya seçici
hata/uyarı sayaçları ile güvenli identity/ilişki özetini gösterir ve açıkça
“Dosya inceleme verilerinizi değiştirmez” mesajını taşır.

## Kontrollü additive import

Import yalnız `inspectPortableBackupText` ve domain codec'leri `valid` sonucu
verdikten sonra planlanır. SHA-256 içerik bütünlüğü kontrolüdür; dosyanın kim
tarafından üretildiğini veya güvenilir kaynaktan geldiğini kanıtlamaz. Manifest
`ownerType` alanı UI'da bilgi olarak gösterilir, raw owner ataması yapılmaz.

Plan aktif owner'ın media, log, alias, redirect, recommendation-link ve cloud
queue snapshot fingerprint'iyle backup checksum'una bağlıdır. Uygulama anında
backup tekrar doğrulanır, state yeniden okunur ve plan deterministik biçimde
yeniden üretilir. Owner veya kaynak state değişmişse stale plan reddedilir.

Varsayılan politika:

- aynı record ID ve aynı içerik: atla;
- aynı record ID ve farklı içerik: blocker;
- aynı Canonical Identity ve farklı record ID: exact duplicate, varsayılan atla;
- kullanıcı exact duplicate için açıkça ayrı kayıt seçerse checksum tabanlı
  deterministik local record ID üret ve aynı remap tablosunu log/recommendation
  ilişkilerinde kullan;
- aynı log ID ve aynı payload: atla; farklı payload: blocker;
- alias/redirect collision, cycle veya eksik ilişki hedefi: tahmin etmeden bloke et;
- backup not içermiyorsa mevcut record'un personal note alanını temizleme;
- unresolved identity'yi koru, yeni identity uydurma.

Aynı backup ikinci kez planlandığında mevcut deterministic copy/record/log
bulunur ve yeni kopya üretilmez. Domain ve record kararları dry-run listesinde
`add`, `skip`, `exact` veya `conflict` olarak görünür. Personal note içeriği
özet veya plan metadata'sında gösterilmez.

## Transaction, rollback ve undo

Owner-scoped `portableImportJournal` planı ve multi-domain before/after
snapshot'ını tutar. Sıra şöyledir:

1. backup, owner ve source fingerprint yeniden doğrulanır;
2. prepared/applying journal safe-write ile yazılır;
3. media/log envelope, alias, redirect ve recommendation linkleri uygulanır;
4. authenticated owner için yalnız eklenen media/log upsert'leri mevcut durable
   cloud queue'ya yazılır;
5. bütün domain'ler read-back fingerprint ile doğrulanır;
6. local commit receipt yazıldıktan sonra mevcut sync manager tetiklenebilir.

Local domain veya queue persistence hatasında network çağrısı başlamaz ve before
snapshot geri yüklenir. Rollback de doğrulanamazsa journal
`recovery-required` kalır. Network/flush hatasında local import korunur; durable
queue `sync-pending` olarak tekrar denenebilir.

Guest import, result fingerprint değişmemişse before snapshot üzerinden local
undo edilebilir. Authenticated importte undo yalnız importun durable queue
işlemleri hâlâ mevcut ve hiçbirinde `dispatchStartedAt` yoksa kullanılabilir;
bu durumda undo queue işlemlerini iptal edip before snapshot'ı geri yükler.
Sync manager ilk remote çağrıdan önce `dispatchStartedAt` alanını durable
yazar. Herhangi bir import upsert'i in-flight olmuşsa, queue'dan başarıyla
çıkarılmışsa veya remote sonucu belirsizse local undo bloke edilir ve nedeni
UI'da gösterilir. Böylece cloud'a ulaşmış kayıt localden silinip sahte başarı
gösterilmez. Undo XP/social state'e dokunmaz ve cloud delete üretmez.

## Bilinen sınırlamalar

- Additive import replace, record-level merge veya mevcut kayıt silme sağlamaz.
- Backup encryption ve parola koruması yoktur.
- Checksum dosyanın yetkili bir kaynaktan geldiğini kanıtlamaz.
- Portable backup cloud revision/tombstone veya cross-device transaction
  garantisi taşımaz.
- Legacy backup import akışı bu coordinator'ın dışında ve değişmeden kalır.

## Manuel smoke

1. Guest ve authenticated owner için ayrı preview oluştur; manifestte UID
   bulunmadığını kontrol et.
2. Personal note checkbox kapalı/açık iki dosya indir ve privacy flag'ini
   doğrula.
3. Dosyayı read-only selector ile aç; count ve checksum sonucunu kontrol et.
4. Dosyada bir karakter değiştirip checksum mismatch uyarısını doğrula.
5. Legacy backup seçip yalnız tanı/uyumluluk özeti gösterildiğini doğrula.
6. Inspection öncesi/sonrası localStorage değerlerinin değişmediğini kontrol et.
7. Portable V2 dosyasında dry-run sayaçlarını incele; exact duplicate seçimini
   açmadan yalnız yeni kayıtların eklendiğini doğrula.
8. Exact duplicate için “ayrı local kayıt” seç; log ve recommendation link
   remap'inin aynı hedef ID'yi kullandığını doğrula.
9. Aynı dosyayı ikinci kez uygula; yeni kopya oluşmadığını kontrol et.
10. Offline authenticated importta `sync-pending`, online dönüşte mevcut queue
    flush davranışını kontrol et.
11. Son importu undo et; import öncesi local state ve XP toplamının korunduğunu
    doğrula.
