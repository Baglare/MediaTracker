# Portable Backup V2

## Amaç ve sınır

D1E.1, aktif local owner'ın doğrulanmış core veri grafiğini owner-neutral bir
JSON dosyasına aktarır ve seçilen dosyayı hiçbir local state yazmadan inceler.
Bu aşama restore, import merge/replace, cloud upload veya queue üretmez. Mevcut
`lib/backup.ts` legacy backup/import sözleşmesi geriye dönük uyumluluk için
korunur.

Domain modeli ve read-only inspector `lib/portable-backup.ts`, kullanıcı akışı
`components/portable-backup-panel.tsx` sınırındadır. Component raw storage key,
auth UID veya domain codec ayrıntısı bilmez.

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

## Bilinen sınırlamalar

- Restore/import write, replace/merge ve conflict çözümü D1E'nin sonraki
  aşamasıdır.
- Backup encryption ve parola koruması yoktur.
- Checksum dosyanın yetkili bir kaynaktan geldiğini kanıtlamaz.
- Portable backup cloud revision/tombstone veya cross-device transaction
  garantisi taşımaz.

## Manuel smoke

1. Guest ve authenticated owner için ayrı preview oluştur; manifestte UID
   bulunmadığını kontrol et.
2. Personal note checkbox kapalı/açık iki dosya indir ve privacy flag'ini
   doğrula.
3. Dosyayı read-only selector ile aç; count ve checksum sonucunu kontrol et.
4. Dosyada bir karakter değiştirip checksum mismatch uyarısını doğrula.
5. Legacy backup seçip yalnız tanı/uyumluluk özeti gösterildiğini doğrula.
6. Inspection öncesi/sonrası localStorage değerlerinin değişmediğini kontrol et.
