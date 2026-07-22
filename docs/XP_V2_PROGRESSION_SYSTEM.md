# XP V2 ve İlerleme Sistemi

## Amaç ve V1 farkı

XP V2, anlamlı medya takibi ile keşfi görünür kılar. Takip, takipçi, yorum, tepki, aktivite paylaşımı, recommendation gönderimi, yalnız kabul ve günlük giriş doğrudan XP üretmez. Sistem leaderboard veya doğrulanmış rekabet puanı değildir.

V1, `localStorage` içindeki medya ve progress loglarından anlık türetilen yerel bir hesaplamadır. V2’de miktarı server belirler; immutable event ledger ile değişimler açıklanabilir ve idempotent olur. Günlük XP kazanma kotası yoktur. V2 özeti bulunamazsa dashboard V1’i kontrollü fallback olarak gösterir.

Local XP, kullanıcının beyan ettiği mevcut kütüphane durumudur; içeriğin gerçekten tüketildiğini kanıtlamaz. Global leaderboard bulunmadığı için bu güven düzeyi rekabet puanı olarak sunulmaz. İleride leaderboard düşünülürse trust-level ayrımı ve doğrulama modeli yeniden değerlendirilmelidir.

## Güven seviyeleri ve event ledger

- `local_attested`: local-first kütüphanenin beyan ettiği başlangıç, tamamlama ve ilk puan.
- `social_verified`: recommendation event/message tablolarından server tarafından doğrulanan olaylar.
- `legacy_attested`: eski aggregate aktarımından kalan, yeni modelde tek seferlik correction ile dengelenen geçmiş.
- `system`: görev ve rozet ödülleri.

`xp_events` olay kimliği, kullanıcı, olay/güven/kaynak türü, canonical anahtar, `grant/revoke/restore` aksiyonu ve server-controlled `effect` taşır. `xp_event_allocations` pozitif puanı `general`, `world` ve `branch` eksenlerine ayırır; totals hesabında event etkisi uygulanır. Event ve allocation update/delete edilemez; her geri alma ve geri yükleme yeni bir ledger kaydıdır.

`xp_user_totals`, `xp_user_world_totals` ve `xp_user_branch_totals` aynı transaction içinde güncellenen okuma modelleridir. Client bu tabloları veya ödül miktarını güncelleyemez.

## Puan tablosu

| Olay | General | World | Branch |
|---|---:|---:|---|
| Aktif başlama durumu | 4 | 3 | İz Sürücü 4 |
| Aktif tamamlanma durumu | 25 + bonus | 20 | İz Sürücü 15 |
| Aktif geçerli puan | 5 | 0 | Eleştirmen 5 |
| Aktif vitrin seçimi | 2 | 0 | Küratör 4 |
| Recommendation’ı tamamlayan alıcı | 20 | 10 | Kaşif 12, Bağ Kurucu 8 |
| Recommendation’ı tamamlanan gönderici | 15 | 0 | Bağ Kurucu 20 |
| Tamamlama sonrası anlamlı alıcı feedback’i | 5 | 0 | Bağ Kurucu 5 |

Private note değerlendirme sayılmaz ve cloud’a XP amacıyla gönderilmez. Açıkça paylaşılmış en az 80 karakterlik profil değerlendirmesi `review_published` entitlement’ını etkinleştirir; paylaşım kaldırıldığında puan geri alınır.

### Commitment bonus

Güvenilir `totalProgress`; 2–12 için 3, 13–50 için 7, 51–200 için 10, 201+ için en fazla 15 general XP ekler. Bilinmeyen veya 1 olan toplam bonus üretmez.

## Current-state entitlement ve idempotency

`xp_media_entitlements`, `user + canonical media + entitlement type` için aynı anda en fazla bir aktif katkı tutar. Başlama, tamamlama, puan, paylaşılan değerlendirme ve vitrin durumu `grant`, `revoke` ve `restore` ile reconcile edilir. Aynı state tekrar gönderilirse no-op olur; completed → planning tamamlanma XP’sini geri alır, planning → completed yeniden getirir. Puan kaldırma/yeniden verme ve vitrin/review kaldırma/yeniden ekleme aynı modeli kullanır.

Medya silme tombstone’u o canonical medyaya ait bütün aktif local entitlement’ları geri alır. Aynı medya yeniden eklendiğinde yalnız yeni mevcut state’in uygun entitlement’ları restore edilir. Recommendation, quest, badge ve system XP bu işlemden etkilenmez.

Hiçbir olay için günlük XP kotası yoktur. Teknik request throttling ileride eklenirse yalnız transport güvenliği içindir; meşru batch eşitlemede kazanılabilir XP sayısını azaltamaz.

## Seviye, dünyalar ve uzmanlıklar

Genel formül V1 ile aynıdır: `floor(sqrt(totalXp / 100)) + 1`. Seviye başlangıcı `(level - 1)^2 * 100`, sonraki eşik `level^2 * 100` olur.

Dünya formülü `floor(sqrt(worldXp / 75)) + 1` kullanır. Doğu (`east`), Kadraj (`screen`) ve Arşiv (`arch`) server tarafından medya türünden türetilir. Baskın dünya en yüksek XP’dir; eşitlik `mixed` olur. Basic 1–5, refined 6–10, elite 11–20, master 21+ eşikleri ve mevcut dünya unvanları korunur.

Uzmanlıklar İz Sürücü, Kaşif, Eleştirmen, Küratör ve Bağ Kurucu’dur. Küratör V2’de yalnız düşük ağırlıklı vitrin olayıyla başlar; gelecekteki güvenli liste sistemiyle genişletilebilir.

## Legacy dönüşümü ve kütüphane eşitlemesi

Aggregate “Mevcut yerel ilerlememi XP V2’ye aktar” akışı deprecated edilmiştir. `/progression` sayfasındaki “Kütüphanemi XP V2 ile eşitle” işlemi her medya için canonical anahtar, tür, durum, progress, total progress ve puan varlığı gibi minimum güvenli state’i gönderir. Ham medya, private note, data URL, client XP miktarı veya allocation gönderilmez.

Eşitleme tekrar çalıştırılabilir ve idempotenttir. Daha önce aggregate legacy import veya eski lifetime local event oluşmuşsa ilk işlem tam kütüphane eşitlemesi olmalıdır; kısmi outbox isteği kontrollü biçimde bekler. Server eski net allocation’ı immutable bir system correction olayıyla bir kez dengeler, conversion marker yazar ve aynı transaction içinde per-media state’i reconcile eder. Eski eventler silinmez. Tarihsel local/legacy event’i olmayan kullanıcı doğrudan per-media state modeline geçer; böylece ghost XP kalmaz.

## Recommendation XP

`social_recommendation_events` içine ilk `completed` olayı yazıldığında trigger recommendation satırından sender/recipient kimliklerini türetir. Alıcı ve gönderici ayrı dedupe anahtarlarıyla ödüllenir. Completed recommendation’da recipient’ın en az 40 karakterlik ilk anlamlı mesajı feedback XP’si üretir; sender mesajı üretmez. Sonradan block geçmiş XP’yi geri almaz.

## Görevler ve rozetler

Evergreen görevler İlk İz, İlk Final, Üç Dünya, Dost Tavsiyesi, Önerin Yerini Buldu ve Profil Küratörü’dür. Eleştirel Bakış ilk sürümde pasiftir. Görev ödülü `system` event’idir ve idempotenttir. Görev veya rozet bir kez kazanıldıktan sonra local medya state’i geri alınsa bile kalır; aktif kütüphane ilerlemesi ile kalıcı başarılar ayrı kavramlardır.

Rozetler server evaluation ile verilir. Kullanıcı kazanmadığı rozeti seçemez; public profilde en fazla beş seçili rozet gösterilir. İlk rozetler Üç Dünya Gezgini, Tavsiyeye Açık, İsabetli Öneri, Vitrin Küratörü ve İlk Final’dir.

## Local-first outbox

`media-tracker-xp-outbox`, transition olayı yerine her canonical medya için son istenen state’i veya delete tombstone’unu tutar. Aynı kullanıcı + canonical medya için latest-state-wins uygulanır; offline delete ardından re-add yalnız son canlı state’i bırakır. Item XP miktarı, private note, tam `MediaItem` veya data URL taşımaz. Oturum kullanıcısına ait state’ler tek batch halinde flush edilir; başka kullanıcı item’ları korunur, başarısız batch retry metadata ile kalır. XP hatası local medya mutation’ını geri almaz.

## API, RLS ve gizlilik

`/api/xp` viewer-specific, `force-dynamic`, `private, no-store` bir route’tur. Özet okuma, per-media state batch reconciliation, seçili rozet ve kazanılmış unvan işlemlerini sunar. Client amount, effect, allocation, badge award veya beneficiary belirleyemez.

XP tablolarında RLS açıktır. Event, allocation, totals, quest progress ve badge award doğrudan yazılamaz. Public projection mevcut `get_social_profile` ile progression/badges module gate’ini yeniden kullanır; protected/personal görünürlük kuralları aşılmaz. Ayrıntılı event geçmişini yalnız hesap sahibi görür.

## Migration

`20260721140000_xp_v2_progression.sql` uygulanmış temel migration olarak korunur. Uzak Supabase’e kullanıcı tarafından uygulanacak yeni migration:

```text
supabase/migrations/20260721143000_xp_reversible_local_state.sql
```

Bu geliştirme turu remote migration uygulamaz.

## Manuel smoke listesi

1. “Kütüphanemi XP V2 ile eşitle” işlemini iki kez çalıştır; ikinci çalıştırmanın no-op olduğunu doğrula.
2. Planlanan medyaya başla, tamamla ve puan ver; current-state XP’nin geldiğini kontrol et.
3. Completed durumundan planning’e dön; completion XP’nin geri alındığını, tekrar completed olduğunda restore edildiğini doğrula.
4. Puanı kaldırıp yeniden ver; revoke/restore geçmişini ve net tek aktif katkıyı doğrula.
5. Medyayı offline silip yeniden ekle; outbox’ta latest-state-wins davranışını kontrol et.
6. İki hesapla recommendation tamamla; local medya silmenin iki tarafın sosyal XP’sini geri almadığını kontrol et.
7. Görev/rozet kazan, kaynak medyayı sil; local XP düşerken kalıcı başarının korunduğunu kontrol et.

## Bilinen sınırlamalar

- Local-attested state server miktarlı ve idempotent olsa da içeriğin gerçekten tüketildiğini kanıtlamaz.
- Leaderboard, sezonluk/günlük quest, fraud reversal ve moderasyon araçları yoktur.
- Eleştirel Bakış görevi ilk sürümde pasiftir.
- Küratör dalı yalnız mevcut vitrin state’iyle sınırlıdır; liste sistemiyle genişletilmesi beklenir.
- Statik SQL contract testi, gerçek PostgreSQL parser/RLS/transaction smoke testinin yerine geçmez.
