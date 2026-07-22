# Sosyal Etkileşimler ve Medya Önerileri

> Recommendation `completed` event’i ile tamamlanma sonrası anlamlı recipient feedback’i XP V2 tarafından server-side ve idempotent biçimde tüketilir. Puanlar ve anti-abuse kuralları için [XP V2 ve İlerleme Sistemi](./XP_V2_PROGRESSION_SYSTEM.md) belgesine bakın.

## Kapsam

Sosyal Faz 2; Faz 1 profil, takip ve block temeli üzerinde `/feed`, `/recommendations` ve `/notifications` alanlarını sağlar. Medya kütüphanesi local-first kalır; cloud'a tam `MediaItem`, `personalNotes` veya ham localStorage kaydı gönderilmez. XP V2 ayrı progression katmanıdır; genel DM ve gerçek zamanlı sohbet bu kapsamda değildir.

## Feed ve etkileşimler

Yerel medya mutasyonları paylaşım tercihlerine göre `media_started`, `media_completed`, `rating_shared` ve `favorite_shared` sosyal outbox olaylarına dönüşebilir. Manuel paylaşım ayrı bir `manual_media_share` olayıdır. Feed yalnız kullanıcının kendi aktivitelerini ve accepted olarak takip ettiği hesapların görünür aktivitelerini cursor ile getirir. Profil görünürlüğü üst sınırdır; protected profilde minimum followers, personal profilde self uygulanır.

Yorumlar düz metindir, en fazla 1000 karakterdir ve soft delete destekler. Cevaplar tek seviyedir. Spoiler bir sunum aracıdır, güvenlik sınırı değildir. Aktivite veya yoruma `like`, `love`, `interesting`, `celebrate` tepkilerinden biri verilebilir. Block, görünürlük ve rate limit kontrolleri server/RPC katmanındadır.

## Yapılandırılmış recommendation modeli

Gönderim, canonical key taşıyan güvenli medya snapshot'ı kullanır. Personal profil, self recommendation ve iki yönlü block reddedilir. İki bağımsız durum grubu vardır:

- Cevap: `pending -> deferred | accepted | rejected`; sender pending/deferred kaydı `withdrawn` yapabilir.
- İlerleme: accepted öneride `none -> linked -> started -> completed`.

UI ham enum değerlerini göstermez. Cevap ve ilerleme durumları merkezi, tipli bir sunum katmanında Türkçe metin, ikon ve görsel tonla gösterilir. Pending kart ayrıntılı, deferred kart orta ayrıntılı; accepted, started, completed, rejected ve withdrawn kartlar varsayılan olarak kompakttır. Kritik lifecycle ve local-library aksiyonları kompakt görünümde erişilebilir kalır.

`social_recommendation_events`, sistem geçişlerini stabil kimlik ve recommendation-scoped dedupe key ile saklar. Detay görünümündeki “Durum geçmişi” bu ledger'ı kullanır.

## Recommendation geri bildirimleri

`social_recommendation_messages`, yalnız belirli bir recommendation içindeki iki katılımcılı geri bildirimleri saklar; genel DM değildir. Yalnız sender ve recipient geçmişi görebilir veya mesaj yazabilir. Mesajlar düz metindir, 1-500 karakterdir ve kullanıcı başına saatte 30 mesaj sınırı vardır. Block varsa yeni mesaj gönderilemez.

Recipient accept, defer veya reject sırasında opsiyonel bir `responseMessage` yazabilir; state transition ile mesaj aynı transaction içinde kaydedilir. Daha sonra pending, deferred, accepted, linked, started ve completed bağlamlarında iki taraf da geri bildirim yazabilir. Completed sonrasında geri bildirim açık kalır. Rejected ve withdrawn sonrasında thread kapanır; reject transition'ındaki tek opsiyonel recipient cevabı istisnadır.

Lifecycle eventleri ve kullanıcı mesajları ayrı tutulur. Liste RPC'si yalnız son event, son mesaj önizlemesi ve unread message sayısını döndürür; tam mesaj/event geçmişi detay açıldığında alınır. Diğer katılımcının mesajı `recommendation_message` bildirimi üretir; kullanıcı kendi mesajı için bildirim almaz.

## Local library bağlantısı

Kabul cloud durumudur. Client canonical source/id ile mevcut yerel medyayı arar; bulursa duplicate üretmeden bağlar. Bulamazsa kullanıcı açıkça kütüphaneye eklediğinde `planning` local item oluşturur. Cihaz bağlantısı `media-tracker-social-recommendation-links` içinde user id ile izole edilir. Social hata yerel medya mutasyonunu geri almaz.

## Bildirimler ve mark-on-view

Bildirimler cloud source of truth'tür. Recipient dışındaki kullanıcı select veya mark-read yapamaz; actor doğrudan notification insert edemez. `mark_entity_read`, yalnız `auth.uid()` recipient'ına ve verilen entity'ye bağlı unread kayıtları günceller. Feed'de ilgili aktivite/yorum alanı, recommendation'da detay kartı açıldığında ilgili bildirimler okundu olur.

Notification merkezi ve badge, `media-tracker:notifications-changed` browser custom event'iyle aynı sekmede senkronize olur. Tek okuma badge'i optimistic azaltır; tümünü okuma anında sıfırlar. Server sonucu authoritative count ile uzlaştırılır; hata veya belirsizlikte refetch yapılır. Mevcut 60 saniyelik polling ve focus refresh korunur. Viewer-specific route'lar `force-dynamic`, `revalidate = 0` ve `private, no-store` kullanır.

## Güvenlik ve migration

Yeni migration:

`supabase/migrations/20260721133000_recommendation_feedback_notification_ux.sql`

Bu migration, uygulanmış Sosyal Faz 2 migration'ından sonra çalıştırılmalıdır:

```bash
npx supabase db push --linked
```

Komut kullanıcı tarafından, hedef proje ve migration geçmişi doğrulandıktan sonra çalıştırılmalıdır. Repository geliştirme turu uzak Supabase'e migration uygulamaz.

## Manuel smoke listesi

1. Tek bildirimi aç; sidebar/topbar badge'in F5 olmadan azaldığını doğrula.
2. “Tümünü okundu yap” sonrası badge'in anında sıfırlandığını doğrula.
3. Feed'de notification'ın hedef activity/yorum alanını aç; yalnız ilgili entity bildirimlerinin okundu olduğunu doğrula.
4. Recommendation oluştururken kullanıcı seç; aramanın kapanıp avatar, ad, kullanıcı adı ve ilişki durumlu alıcı kartına dönüştüğünü doğrula.
5. Pending recommendation'ı mesajlı ve mesajsız accept/defer/reject et; transition ile geri bildirimin atomik sonucunu doğrula.
6. Accepted, started ve completed öneriye sonradan geri bildirim yaz; diğer katılımcıda `recommendation_message` bildirimi oluştuğunu doğrula.
7. Rejected/withdrawn thread'e yeni mesaj ve blocked katılımcı mesajı gönderilemediğini doğrula.
8. Kartların Türkçe durum etiketlerini, kompakt/expanded davranışını, timeline ve mesaj ayrımını doğrula.

## Bilinen sınırlamalar

- SQL/RPC sözleşme testleri statiktir; gerçek RLS ve transaction davranışı için canlı veya yerel Supabase smoke testi gerekir.
- Badge senkronizasyonu aynı sekmede custom event, sekmeler arasında polling/focus refresh kullanır; BroadcastChannel/realtime yoktur.
- Recommendation mesajlarında attachment, typing indicator, per-message read receipt veya reaction yoktur.
- Başka cihazdaki local recommendation link otomatik senkronize edilmez.
- Genel DM, kulüp, chat ve feed ranking bu fazın dışındadır.
