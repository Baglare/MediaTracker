# MediaTracker Supabase + Local-first Sync Sözleşmesi

Bu doküman güncel Supabase ve offline-first davranışını özetler. MediaTracker'ın ana veri kaynağı hâlâ tarayıcıdaki `localStorage` alanıdır; Supabase opsiyonel cloud aktarım ve senkronizasyon katmanı olarak çalışır.

## Ne Yapıyor?

- Supabase env değişkenleri yoksa uygulama yerel modda tam çalışır.
- Supabase yapılandırılırsa email/password auth paneli aktif olur.
- Yerel medya listesi ve aktivite logları arayüzün birincil state kaynağıdır.
- Ayarlar ekranında cloud kayıt sayıları görülebilir.
- Kullanıcı onayıyla üç manuel cloud işlemi yapılabilir:
  - Yerel -> Cloud upload
  - Cloud -> Yerel download
  - Cloud'dan Yerel'e merge
- Yerel mutasyonlar `media-tracker-sync-queue` kuyruğuna eklenir.
- Kullanıcı giriş yapmış ve ağ online ise uygun kuyruk item'ları Supabase'e flush edilir.
- Bekleyen işlemler Ayarlar ekranındaki cloud sync kartından görülebilir ve "Şimdi Senkronize Et" ile manuel tetiklenebilir.
- UI pending, canlı in-flight, retryable/blocked, adapter/rollout ve son sonuç değerlerini tek reaktif `SyncSnapshot` kaynağından okur.
- D2B.0 ve D2B.1 production veritabanına uygulanmıştır. D2C.1 enforcement/cutover D8'e bırakılmıştır.

## Nasıl Çalışıyor?

### Local-first state

Uygulama ilk olarak owner-scoped personal storage adapter'larını kullanır. Aşağıdaki eski düz anahtarlar legacy/import uyumluluğu için görülebilir; güncel kayıtlar owner scope ve versioned envelope kullanır:

- `media-tracker-list`: medya listesi
- `media-tracker-logs`: aktivite/progress logları
- `media-tracker-sync-queue`: cloud'a gönderilmeyi bekleyen işlemler

Supabase bağlı olsa bile kullanıcı arayüzü yerel state üzerinden çalışır. Cloud işlemleri bu state'i destekleyen ek aktarım ve senkronizasyon akışlarıdır.

### Manuel cloud aktarım

`CloudDataStatusCard` cloud ve yerel kayıt sayılarını karşılaştırır. Kullanıcı onayıyla:

- **Yerel -> Cloud**: Yerel medya ve logları Supabase'e upsert eder.
- **Cloud -> Yerel**: Cloud verisini indirir ve yerel state'in yerine koyar.
- **Cloud'dan Yerel'e Birleştir**: Cloud'da olup yerelde olmayan kayıtları yerel state'e ekler; yerel veriyi silmez ve cloud'a upload yapmaz.

Bu işlemler otomatik başlamaz; kullanıcı onayı ister.

### Sync queue

`lib/sync-manager.ts` yerel mutasyonlardan sonra kuyruk item'ı üretir:

- `media_item` için `upsert` ve `delete`
- `progress_log` için `upsert`

Kuyruk owner-scoped ve durable biçimde yerel depolamada saklanır. Aynı entity ve aynı payload id için bekleyen kayıtlar coalescing ile sadeleştirilir.

Guest ve authenticated owner kuyrukları ayrı scope'larda tutulur. Guest queue uzak servise gönderilmez; hesap değişiminde önceki owner snapshot'ı veya sonucu yeni owner'a uygulanmaz.

### Flush davranışı

Flush şu koşullarda çalışır:

- kullanıcı giriş yaptıysa,
- tarayıcı online ise,
- mevcut kullanıcıya uygun bekleyen item varsa.

Başarılı item kuyruktan çıkarılır. Canlı dispatch ID'leri process belleğinde in-flight olarak izlenir; durable `dispatchStartedAt` crash/retry işaretidir. Başarısız item retryable veya controlled conflict ise blocked olarak kuyrukta kalır. Aynı flush sırasında eklenen yeni uygun item bounded sonraki batch'te tüketilir; başarısız item agresif döngüye sokulmaz.

Cloud Media V2 adapter'ı stabil operation ID, expected revision, CAS, tombstone ve server idempotency sonucunu kullanır. Rollout sözleşmesi bilinmiyor, bakımda veya reload gerektiriyorsa mutation dispatch fail-closed durur; yerel state çalışmaya devam eder.

## Neden Böyle Tasarlandı?

- Uygulama Supabase olmadan da tam kullanılabilir kalır.
- Yerel veriler cloud işlemlerinden bağımsız korunur.
- Cloud upload/download/merge kullanıcı onayına bağlıdır.
- Offline değişiklikler ağ geri gelene kadar kaybolmadan bekleyebilir.
- Farklı hesaplara ait bekleyen işlemler otomatik karışmaz.

## Sınırlamalar

- Cloud'dan otomatik real-time pull yoktur; download ve merge manuel aksiyonlardır.
- Revision/tombstone/parent/record conflict'leri için kontrollü UI vardır; otomatik alan bazlı merge yoktur.
- `progress_logs.detail` cloud'a yazılmaz; yerel-only alandır.
- Başka kullanıcıya ait orphan queue item'ları otomatik flush edilmez.
- Sync queue yalnızca desteklenen medya ve progress log operasyonlarını kapsar.

## Sonraki İyileştirme Alanları

- Cloud -> local değişiklikleri için kontrollü refresh/pull akışı.
- Queue hata detayları için daha kapsamlı kullanıcı geri bildirimi.
- D8'de D2C.1 owner-scoped fiziksel primary key enforcement ve production cutover.

Production durumunun ve cutover sınırının canonical kaydı [CLOUD_MEDIA_SCHEMA_V2_MIGRATION_RUNBOOK.md](./CLOUD_MEDIA_SCHEMA_V2_MIGRATION_RUNBOOK.md) ile [PRODUCTION_CLOUD_V2_CUTOVER.md](./PRODUCTION_CLOUD_V2_CUTOVER.md) belgeleridir.
