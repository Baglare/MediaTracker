# MediaTracker Sosyal Profil Temeli

## Amaç ve sınır

Sosyal Faz 1, Supabase hesabına bağlı public/protected/personal profilleri, asimetrik takip ilişkilerini, kullanıcı aramasını ve açıkça yayımlanan profil snapshot’larını sağlar. Aktivite akışı, yorum, tepki, DM, bildirim, ortak liste, zevk uyumu ve XP V2 bu temelin parçası değildir.

## Local-first / cloud-social ayrımı

Yerel medya kütüphanesi ve kişisel profil tercihleri ana veri kaynağı olmaya devam eder. Sosyal profile giriş yapmak cloud media upload başlatmaz, sync tercihini değiştirmez ve favori/not/istatistik yayımlamaz. Yerel profil adı, tagline ve unvan ilk formu yalnızca ön doldurur; kullanıcı `Kaydet` demeden cloud’a yazılmaz. Yerel avatar data URL’si otomatik yüklenmez.

Cloud’a yalnızca kullanıcının açıkça seçtiği şu veriler gider:

- En fazla 5 favori ve 6 güncel medya için güvenli vitrin snapshot’ı.
- Ham kayıtlar yerine toplu kütüphane istatistikleri.
- Server-authoritative kabul edilmeyen, sürümlü progression snapshot’ı.
- İki aşamalı onayla kopyalanan paylaşılmış not snapshot’ı.

## Profil türleri

| Tür | Arama | Anonim temel kimlik | Yeni takip | Kabul edilmiş ilişkiler |
|---|---|---|---|---|
| `public` | Var | Var | Anında `accepted` | Korunur |
| `protected` | Var | Var | `pending` | Korunur |
| `personal` | Yok | Yalnızca minimal kişisel durum | Engellenir | Saklanır fakat görünür değildir |

`public/protected → personal` geçişi inbound pending istekleri siler, accepted ilişkileri korur. Profil tekrar açıldığında accepted ilişkiler yeniden geçerli olur. `protected → public` mevcut pending istekleri otomatik kabul etmez.

## Modül görünürlüğü

| Modül ayarı | Anonim | Giriş yapmış yabancı | Kabul edilmiş takipçi | Karşılıklı | Profil sahibi |
|---|---:|---:|---:|---:|---:|
| `public` | Evet | Evet | Evet | Evet | Evet |
| `followers` | Hayır | Hayır | Evet | Evet | Evet |
| `mutual` | Hayır | Hayır | Hayır | Evet | Evet |
| `self` | Hayır | Hayır | Hayır | Hayır | Evet |

Personal profil modunda kayıtlı tercihler silinmez ancak bütün modüller fiilen yalnızca sahibine görünür. `get_social_profile` RPC’si gizli modül satırlarını, grid config’ini, snapshot’ları ve not içeriğini response’a eklemeden önce filtreler; istemci CSS’i güvenlik sınırı değildir.

## Takip lifecycle ve Yin/Yang

Takip asimetriktir. Public profil için `accepted`, protected profil için `pending` kayıt oluşur. Self-follow, duplicate, personal profil ve iki yönlü block durumu RPC’de reddedilir. Pending kayıt gönderici tarafından iptal; alıcı tarafından kabul/ret edilebilir. Accepted kayıt takip eden tarafından bırakılabilir veya profil sahibi follower’ı kaldırabilir. Karşı yön etkilenmez.

Yin/Yang göstergesinde sol Yin profil sahibinin görüntüleyeni takip etmesini, sağ Yang görüntüleyenin profil sahibini takip etmesini temsil eder. İki accepted yön tam bağlantıdır. Pending yön kesik/soluk gösterilir. Her parça sınırlı palette ilgili kullanıcının bağlantı rengini kullanır; durum ayrıca metin, tooltip ve `aria-label` ile verilir.

## Block davranışı

`social_block` tek transaction içinde block kaydını ekler ve iki yöndeki accepted/pending follow kayıtlarını siler. Sonraki follow engellenir; arama, profil çözümü ve listeler iki yönlü block için generic unavailable/gizli sonuç üretir. Unblock eski ilişkileri geri getirmez. Client’a “seni engelledi” bilgisi gönderilmez.

## Profil grid’i

Desktop düzeni doğrulanan 12 sütun koordinatları kullanır. Modüller HTML drag/drop ile yeniden sıralanabilir, küçük/orta/geniş/tam genişlik preset’leriyle boyutlandırılabilir ve sıfırlanabilir. Yukarı/aşağı taşıma ile boyut butonları klavye ve dokunmatik alternatifi sağlar. Düzenleme sonrası kontrollü reflow kartların üst üste binmesini engeller. Mobilde `mobile_order` ile tek sütun akışı kullanılır; desktop koordinatları mobil overflow üretmez. Ziyaretçi önizlemesi backend yetkilendirmesinin yerine geçmez.

Hazır modül anahtarları: favoriler, şu anda, istatistik, progression, rozet altyapısı, takip listeleri, paylaşılan liste altyapısı ve paylaşılan notlar. Rozet ve paylaşılan listeler veri üretmez; boş public placeholder gösterilmez.

## Shared note güvenliği

Yerel `personalNotes` hiçbir sosyal sorguya açılmaz. Kullanıcı önce notu seçer, sonra ayrı onay adımında metni düzenler, görünürlük ve spoiler durumunu belirler. `social_share_note` RPC’si `confirmed = true` olmadan insert yapmaz. Authenticated rolün tabloya doğrudan insert/update/delete yetkisi kaldırılmıştır. Snapshot oluşturulduktan sonra yerel not değişse bile otomatik güncellenmez; unshare yalnızca snapshot’ı siler.

## Storage

Migration private `profile-assets` bucket’ını oluşturur. Yol düzeni `{user_id}/avatar/{uuid}.{ext}` ve `{user_id}/banner/{uuid}.{ext}` şeklindedir. JPG/PNG/WebP kabul edilir; route avatar için 5 MB, banner için 10 MB sınırı uygular. Kullanıcı yalnızca kendi klasörüne yazabilir. Public/protected asset erişimi kısa ömürlü signed URL ile, personal ve block durumlarıyla tutarlı security-definer görünürlük kontrolü üzerinden sağlanır. Yeni upload veya profil update başarısızsa eski görsel korunur; başarıdan sonra eski object temizlenir. Service role kullanılmaz.

## Supabase kurulumu

1. Mevcut Supabase projesinde `supabase/migrations/20260721_social_profile_foundation.sql` dosyasını Supabase CLI migration akışı veya SQL Editor ile uygula.
2. Migration’ın tabloları, RPC’leri, RLS politikalarını ve private `profile-assets` bucket/policy’lerini oluşturduğunu doğrula.
3. `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` değerlerini mevcut yöntemle tanımla.
4. İki test hesabıyla public/protected/personal, follow request, block ve asset erişimini doğrula.

Bu repository turu migration’ı uzak Supabase’e otomatik uygulamaz. `SUPABASE_SERVICE_ROLE_KEY` sosyal profile gerekmez ve browser’a taşınmaz.

## Manuel test listesi

- Supabase env yokken `/`, `/people` ve `/u/test` kontrollü fallback verir; local uygulama çalışır.
- İlk setup yalnızca formu ön doldurur ve kaydetmeden network write yapmaz.
- Username kuralları, 30 günlük cooldown, 90 günlük rezervasyon ve eski URL redirect’i çalışır.
- Anonymous public/protected kimlik görür; personal yalnız minimal mesaj döndürür.
- Public follow accepted, protected follow pending olur; kabul/ret/iptal/takibi bırak çalışır.
- Mutual ve pending Yin/Yang durumları metin ve renk dışında erişilebilir işaret taşır.
- Block iki yönlü ilişkileri siler ve profil/aramanın generic duruma düşmesini sağlar.
- Grid drag, preset, sıfırlama ve klavye kontrolleri; mobil taşma kontrol edilir.
- Avatar/banner değiştirme başarısında eski object temizlenir; hata durumunda korunur.
- Vitrinde yalnızca seçilen kayıtlar; istatistikte yalnızca aggregate veri bulunur.
- Shared note `confirmed: true` olmadan oluşmaz ve unshare yerel notu silmez.

## Bilinen sınırlamalar ve sonraki faz

- RLS/RPC için yerel Supabase integration suite yoktur; canlı projede iki hesaplı manuel doğrulama gerekir.
- Grid kontrollü preset + drag/reorder yaklaşımıdır; serbest pointer resize değildir.
- Storage tarafında sunucu yeniden encode/crop yapmaz; MIME ve boyut doğrular, orijinal JPG/PNG/WebP’yi saklar.
- Takip listeleri offset pagination kullanır; çok büyük ağlarda cursor pagination’a geçilmelidir.
- Soft-delete UI bu fazda yoktur; veri modeli ve public filtreler hazırdır.
- Aktivite feed, yorum/tepki, öneri, bildirim, DM, ortak liste, XP V2 ve yeni rozet sistemi sonraki fazlara bırakılmıştır.
