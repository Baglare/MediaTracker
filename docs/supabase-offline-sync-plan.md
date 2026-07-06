# MediaTracker Supabase + Offline-first Sync Notes

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

## Nasıl Çalışıyor?

### Local-first state

Uygulama ilk olarak `localStorage` anahtarlarını kullanır:

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

Kuyruk `localStorage` içinde saklanır. Aynı entity ve aynı payload id için bekleyen kayıtlar coalescing ile sadeleştirilir.

Queue item'ları `userId` taşıyabilir:

- `null` / `undefined`: login öncesi anonim item; giriş sonrası mevcut kullanıcıya uygulanabilir.
- mevcut kullanıcı id'si: flush edilebilir.
- başka kullanıcı id'si: orphan sayılır ve mevcut kullanıcıyla otomatik gönderilmez.

### Flush davranışı

Flush şu koşullarda çalışır:

- kullanıcı giriş yaptıysa,
- tarayıcı online ise,
- mevcut kullanıcıya uygun bekleyen item varsa.

Başarılı item kuyruktan çıkarılır. Başarısız item `retryCount` ve `lastError` ile kuyrukta kalır. Ağ geri geldiğinde veya kullanıcı "Şimdi Senkronize Et" dediğinde tekrar denenebilir.

## Neden Böyle Tasarlandı?

- Uygulama Supabase olmadan da tam kullanılabilir kalır.
- Yerel veriler cloud işlemlerinden bağımsız korunur.
- Cloud upload/download/merge kullanıcı onayına bağlıdır.
- Offline değişiklikler ağ geri gelene kadar kaybolmadan bekleyebilir.
- Farklı hesaplara ait bekleyen işlemler otomatik karışmaz.

## Sınırlamalar

- Cloud'dan otomatik real-time pull yoktur; download ve merge manuel aksiyonlardır.
- Conflict resolution UI yoktur.
- `progress_logs.detail` cloud'a yazılmaz; yerel-only alandır.
- Başka kullanıcıya ait orphan queue item'ları otomatik flush edilmez.
- Sync queue yalnızca desteklenen medya ve progress log operasyonlarını kapsar.

## Sonraki İyileştirme Alanları

- Daha ayrıntılı conflict resolution ekranı.
- Cloud -> local değişiklikleri için kontrollü refresh/pull akışı.
- Queue hata detayları için daha kapsamlı kullanıcı geri bildirimi.
- Hesap değişimlerinde orphan queue yönetimini daha görünür hâle getirme.
