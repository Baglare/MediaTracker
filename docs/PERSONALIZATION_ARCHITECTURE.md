# Kişiselleştirme Mimarisi

## Amaç

Bu belge MediaTracker'ın temel uygulama görünümünü, dünya vurgusunu, cihaz tercihlerini ve public profil sunumunu birbirinden ayıran P0 sınırlarını; P1 tema motorunu ve P2 birleşik uygulama kabuğu/profil kimliği katmanını tanımlar. Bu aşamalar sayfa redesign'i değildir; mevcut özellikleri ortak, test edilebilir sınırlar altında toplar.

## Mevcut sorun

- Uygulama kabuğu ve bileşenlerin büyük kısmı sabit koyu `zinc` sınıflarına bağlıdır.
- Doğu, Kadraj ve Arşiv renkleri CSS `--w-*` değişkenlerinde ve bazı sunum kararlarında dağınıktır. Doğu kart accent sistemi anime, manga ve novel alt aileleri nedeniyle diğer dünyalardan daha ayrıntılıdır.
- Yerel profil tarayıcı `localStorage` verisidir; sosyal profil cloud-backed Supabase verisidir. Yerel alanlar sosyal profil formunu yalnız ön doldurur.
- Cloud avatar, kendi profil yüzeylerinde yerel avatar görseline düşebilir. Banner yalnız sosyal public profil tarafından sağlanır.
- Right Rail tamamlanan segment için dünya rengini, diğer durumlar için sabit durum renklerini kullanır.
- Kütüphane filtreleri, profil tercihleri ve Right Rail düzeni farklı local preference alanlarında tutulur; bunlar app appearance değildir.

## Temel kavramlar

### Base theme

Uygulama arka planı, yüzeyleri, metinleri, border, gölge, overlay, focus ve temel accent tokenlarını sağlar. Registry kimlikleri `system`, `obsidian`, `porcelain` ve `ocean`dır. P1'de dört seçenek de Ayarlar içinden seçilebilir. Sistem, `prefers-color-scheme` sonucuna göre Obsidyen veya Porselen tabanına çözülür ve sistem tercihi çalışma sırasında değişirse güncellenir.

### Accent mode ve world theme

Accent mode kullanıcının kendi cihazındaki vurgu davranışıdır: `auto`, `theme`, `east`, `screen`, `arch`, `neutral`. `auto` aktif dünyayı izler; `theme` temel temanın accent'ini kullanır; sabit dünya modları aktif dünya filtresinden etkilenmez.

World theme, uygulama temel teması değildir. `neutral`, `east`, `screen` ve `arch` kayıtları kimlik adı, kısa açıklama, ana/ikincil renk, border, glow, chart rengi, icon key ve motif key taşır. Mevcut `data-world` ve `--w-*` davranışı korunur.

### App appearance

`AppAppearancePreferences` yalnız cihazdaki uygulama deneyimini taşır: base theme, accent mode, effects level ve density. `mediaTracker:appearancePreferences:v1` anahtarında tutulur. Kütüphane filtresi, profil alanı, public sunum değeri veya ham CSS içermez.

### Profile identity

Kimlik görünen ad, tagline/bio, avatar, banner ve seçili ünvanı çözer. Giriş yapılmış sosyal profil varsa cloud alanları önceliklidir; eksik cloud alanları yerel profile, ardından güvenli varsayılanlara düşer. Cloud avatar yerel data URL'den önce gelir. Banner yalnız sosyal profilden gelebilir. Resolver DOM, React, localStorage, network veya kayıt side effect'i bilmez.

### Profile presentation

Public profil görsel kimliğidir: palette, banner mode/position, overlay, avatar frame, surface style ve motif intensity. P2 ile allowlist değerleri cloud profile'a bağlanmıştır. Bu alanlar yalnız `ProfileHero` ve profil modül vurgularını etkiler; base theme'i veya bütün sayfayı değiştirmez.

### Connection color

`connectionColor` Yin/Yang sosyal bağlantı gösterimine aittir. `profilePaletteId` public profil görsel kimliğidir. `accentMode` kullanıcının kendi uygulama görünümüdür. Bu üç alan birbirinin yerine kullanılmaz.

### Chart palette

Chart palette tamamlanan, devam eden, planlanan, duraklatılan ve bırakılan durumları için segment, aktif satır yüzeyi, metin ve dot tonu tanımlar. `standard` mevcut Right Rail renklerini temsil eder. `followWorldCompletedColor`, tamamlanan renginin dünya tokenını izlediğini açıkça belirtir. P0 chart palette seçimi için UI eklemez.

## Veri sahipliği

| Alan | Sahiplik | Görünürlük | Fallback |
| --- | --- | --- | --- |
| App appearance | Local-only `localStorage` | Private/device | Obsidyen default |
| Kütüphane filtreleri | Local-only mevcut UI preferences | Private/device | Mevcut filtre defaultları |
| Yerel profil/cache | Local-only mevcut profile preferences | Private/device | Girişsiz kullanım, offline/eksik cloud fallback |
| Birleşik profil identity | Cloud-backed ana kaynak | Public/protected/personal politikasına bağlı | Eksik alanda local cache, auth metadata, güvenli default |
| Profile presentation | Cloud-backed | Public loader görünürlük politikasına bağlı | Sade normalize edilmiş default |
| Connection color | Cloud-backed sosyal ilişki | İlişki görünümü | `neutral` |
| Chart palette | Gelecekte local-only app preference | Private/device | `standard` |

## Tema matrisi

| Tema | Renk şeması | P1 durumu |
| --- | --- | --- |
| Sistem | Sistem tercihi | Aktif; açıkta Porselen, koyuda Obsidyen |
| Obsidyen | Koyu zinc | Aktif; mevcut görünümün temel eşlemesi |
| Porselen | Kırık beyaz / stone | Aktif; açık yüzey ve koyu metin eşlemesi |
| Okyanus | Lacivert / mavi / turkuaz | Aktif; navy yüzey ve kontrollü cyan accent |

## Dünya matrisi

| Dünya | Kimlik | Mevcut davranış |
| --- | --- | --- |
| Nötr | Sessiz zinc | Dünya yok/uygunsuz bağlam fallback'i |
| Doğu | Sıcak altın + lake kırmızı | Anime/manga/novel alt accent sistemi korunur |
| Kadraj | Sinema mavisi + kontrollü kırmızı | Lens/projektör/film kimliği korunur |
| Arşiv | Parşömen altını + mum mührü | Kitap/raf kimliği korunur |

## Profil modeli

- **Identity:** Kim olduğu; authenticated cloud → local cache/fallback → auth metadata → güvenli default önceliği.
- **Presentation:** Profilin nasıl göründüğü; kimlik, uygulama teması ve ilişki renginden bağımsız cloud allowlist verisi.
- **Self view:** Aynı cloud kimliği ve banner'ı kullanır; düzenleme, XP ve yerel kütüphane özetleri gösterir.
- **Public view:** Aynı kimliği viewer görünürlük kurallarıyla sunar; yerel data URL sızdırmaz.
- **Preview:** Birleşik editördeki henüz kaydedilmemiş identity/presentation taslağını ortak hero ile gösterir.

## P1 tema motoru

### Root attribute modeli

Root layout ilk HTML'de `data-theme`, `data-base-theme`, `data-accent-mode`, `data-resolved-accent`, `data-effects` ve `data-density` attribute'larını yazar. `data-theme` her zaman çözülmüş `obsidian`, `porcelain` veya `ocean` değeridir. Client runtime yalnız doğrulanmış preference değerleriyle bu attribute'ları günceller ve `color-scheme` değerini temayla eşler.

### Persistence ve cookie mirror

`mediaTracker:appearancePreferences:v1` ana kaynak olmaya devam eder. Cookie yalnız `baseTheme`, çözülmüş tema ve `accentMode` kimliklerini taşır; profil, medya veya kullanıcı verisi içermez. Root layout allowlist parser ile cookie'yi okuyarak ilk HTML'i doğru temayla üretir. Client hydration sonrasında localStorage varsa önceliklidir; yoksa güvenli cookie kimliği kullanılır ve storage'a yazılır. Cookie client runtime tarafından aynı allowlist formatında mirror edilir.

### System tema davranışı

`system` açık sistem tercihinde Porselen, koyu sistem tercihinde Obsidyen olarak çözülür. Runtime `matchMedia('(prefers-color-scheme: dark)')` değişimini dinler ve listener'ı unmount sırasında temizler. Default preference hâlâ Obsidyen'dir.

### Base theme ve world accent ayrımı

Base theme `--app-*` tokenlarını sağlar. Kullanıcı accent tercihi `--app-accent*` tokenlarını çözer. İçerik sınıflandırması ve WorldHero `--w-*` tokenlarını kullanmaya devam eder. Bu nedenle sabit Kadraj app accent'i, Doğu içerik rozetini veya anime/manga/novel alt ailesini değiştirmez. Right Rail completed segmenti aktif içerik dünyasını izlemeyi sürdürür.

### Semantic token migration stratejisi

Gerçek tema renklerinin source of truth'u `app/globals.css` içindeki `[data-theme]` scope'larıdır. TypeScript registry kullanıcıya gösterilen metadata ve güvenli preview değerlerini taşır; testler temel değerlerin CSS ile aynı kaldığını kontrol eder. Shared kabuklarda `app-page`, `app-panel`, `app-card`, `app-input` ve az sayıdaki semantik action utility'si kullanılır. Kalan yaygın nötr zinc utility'leri Porselen/Okyanus scope'larında Tailwind renk değişkenleri üzerinden role göre eşlenir; domain/status renkleri topluca tema rengine çevrilmez.

### Tema ayar UI

Ayarlar içindeki Görünüm kartı Sistem, Obsidyen, Porselen ve Okyanus için ad, açıklama, token preview ve seçili durum gösterir. Dünya vurgusu Otomatik, Tema rengi, Doğu, Kadraj, Arşiv ve Nötr seçeneklerini ayrı sunar. Model anında kaydetmedir; seçim canlı uygulanır, sessiz durum mesajı gösterilir ve Varsayılana dön aksiyonu Obsidyen + Otomatik default'una döner. Density, effects, profile presentation ve chart palette P1 UI'ında gösterilmez.

### Erişilebilirlik

Tema scope'ları ana/muted metin, input, border, focus, overlay, danger, success ve warning rollerini tanımlar. Porselen için açıkta okunmayan düşük tonlar kontrollü koyulaştırılır. Obsidyen/Okyanus `dark`, Porselen `light` color-scheme kullanır. Seçili kartlar renk yanında check ikonu ve `aria-pressed` taşır. Tema geçişi kısa tutulur ve `prefers-reduced-motion` altında kapatılır.

### Henüz taşınmayan bileşenler

Ana sayfadaki tüm tekil className'ler mekanik olarak dönüştürülmedi. Shared shell/modal alanları doğrudan semantik utility kullanırken, eski kartların çoğu tema scope'undaki zinc eşlemesinden yararlanır. Domain accent'leri, rating, spoiler, lifecycle, hata ve başarı renkleri kendi anlamlarını korur.

## P2 birleşik kabuk ve profil

### Canonical AppShell

`AppShell` uygulama iskeletinin tek bileşim noktasıdır. `authenticated` modu sidebar, profil kartı, topbar, mobil navigasyon, içerik ve isteğe bağlı Right Rail'i taşır. `public` modu anonim `/u/[username]` erişiminde MediaTracker markası, tema scope'u, sınırlı navigasyon ve ortak içerik genişliğini korur; private menüleri göstermez. P1 appearance runtime root layout'ta kalır ve route shell içinde kopyalanmaz.

Dashboard içindeki eski bölümler tek turda route'a çevrilmemiştir. Merkezi, tipli navigation registry gerçek route'ları `Link` ile; eski dashboard bölümlerini `/?tab=...` adapter'ıyla açar. `/feed`, `/recommendations`, `/notifications`, `/people`, `/progression`, `/profile` ve `/u/[username]` URL'leri değişmemiştir. `SocialPageShell` yalnız feature başlığı ve içerik düzenidir; ikinci sidebar/topbar veya bağımsız site arka planı oluşturmaz.

### Unified profile identity

Cloud profil mevcut olduğunda görünen ad, kullanıcı adı, tagline, bio, avatar, banner, seçili unvan, görünürlük, modül düzeni, paylaşım tercihleri ve presentation alanlarının ana kaynağıdır. Local profil ikinci kimlik değildir; girişsiz kullanım, profil kurulmadan önceki prefill, offline fallback/son bilinen güvenli cache ve açık avatar migration'ından önceki yerel görsel için korunur. Cloud save sonrasında yalnız görünen ad ve tagline local cache'e yazılır; username, görünürlük, modüller veya private cloud state local preference'a kopyalanmaz.

Tagline ve bio ayrıdır: tagline en fazla 120 karakterlik kısa hero metnidir; bio en fazla 500 karakterlik detay alanıdır. Bio'dan otomatik tagline üretilmez. Cloud avatar yerel görselden önce gelir. Local data URL kullanıcı izni olmadan cloud'a yüklenmez. Banner cloud-backed kalır; görsel yoksa seçili palette'e ait güvenli gradient gösterilir.

Cloud isteği başarısızlığı “profil yok” sayılmaz. `/profile` mevcut local kimlikle çalışır ve cloud verisinin yenilenemediğini açıkça belirtir. `personal`, `unavailable`, `not configured` ve local-only durumları ayrı sunulur.

### ProfileHero ve viewer context

Tek `ProfileHero`, `self`, `public` ve `preview` varyantlarını destekler. Banner, avatar, ad, kullanıcı adı, tagline, unvan, seviye/tier ve profil palette markup'ı ortaktır. Self varyantı düzenleme ve public görünüm aksiyonlarını; public varyantı takip/Yin-Yang ve görünürlük bağlamını; preview varyantı edit taslağını sunar. Aynı profil `self`, `public`, `followers`, `mutual` ve `anonymous` viewer bağlamlarında farklı izinlerle gösterilir; bunlar ayrı kimlikler değildir.

Banner modu `none`, `gradient`, `world` veya `image` olabilir. Kullanıcı banner URL'si CSS string'ine gömülmez; güvenli image kaynağı olarak render edilir. Eksik image palette gradient'ine düşer. Overlay allowlist'i metin kontrastını korur. Avatar frame yalnız sunumdur ve avatar kaynağını değiştirmez. Motif metni kapatmaz ve sürekli animasyon üretmez.

### Birleşik editör

`UnifiedProfileEditor` kimlik, profil görseli, presentation, sosyal/gizlilik ve modül/paylaşım alanlarını tek deneyimde birleştirir. Kimlik ve presentation açık “Değişiklikleri kaydet” aksiyonuyla tek cloud isteğinde kaydedilir; `Vazgeç` taslağı son kaydedilen duruma döndürür. Mevcut layout, preference ve sharing editörleri yeniden kullanılır. Girişsiz mod yalnız local kimlik/avatar kontrollerini gösterir; username, banner upload, görünürlük ve cloud modülleri çalışıyormuş gibi sunulmaz.

### Migration ve güvenlik

`20260722110000_unified_profile_presentation.sql`, `profiles` tablosuna `tagline`, `profile_palette_id`, `banner_mode`, `banner_position`, `overlay_strength`, `avatar_frame`, `surface_style` ve `motif_intensity` alanlarını ekler. SQL constraint'leri P0 TypeScript allowlist'leriyle aynıdır. `social_save_unified_profile` kimliği `auth.uid()` içinden alır; client başka kullanıcı id'si seçemez. Direct profile insert/update kapalı kalır, mevcut avatar/banner asset kolon izni korunur. `get_unified_social_profile`, presentation alanlarını mevcut görünürlük güvenli loader sonucu `available` ise ekler. P2 migration'ı uygulanmış kabul edilir; P3.0 transform migration'ı bu turda yalnız repoya eklenir.

`connectionColor` değişmeden Yin/Yang ilişki sunumuna aittir. Profile palette, banner, app base theme, accent veya RLS kararında kullanılmaz.

### Manuel doğrulama matrisi

Uygulama çalıştırıldığında Dashboard, Feed, Öneriler, Bildirimler, Kullanıcı Ara, İlerleme, `/profile` ve `/u/[username]` arasında shell sürekliliği; kendi/diğer/anonim viewer aksiyonları; Obsidyen/Porselen/Okyanus altında banner kontrastı; offline fallback ve kompakt favori kontrolü birlikte kontrol edilmelidir. Statik kontrat testleri screenshot regression veya canlı RLS testi değildir.

## P3.0 profil stabilizasyonu

### Hero-first yükleme ve editör sınırı

`/profile` ilk görünümünde local kimlikten üretilen ortak `ProfileHero` hemen render edilir. Cloud tarafında yalnız kimlik, banner/avatar referansları, presentation ve kısa hero alanlarını taşıyan `/api/social/profile/hero` yüklenir. Favoriler, aktivite ve yerel kütüphane kendi client sınırında hazırlanır. Tam profil editor payload'ı, `SocialLayoutEditor`, `SocialSharingEditor`, `SocialPreferencesPanel` ve görsel konumlandırma UI'ı yalnız `mode=edit` olduğunda dynamic import ile yüklenir. Shell ve hero bu yüklemeyi beklemez. Eşzamanlı XP özet istekleri kullanıcı kimliği bazında tek in-flight promise üzerinden birleştirilir.

### Non-destructive görsel transform modeli

Banner ve avatarın orijinal cloud asset'i korunur; fiziksel crop veya her ayarda tekrar upload yapılmaz. Sunum metadata'sı `focalX`/`focalY` için 0–100, `zoom` için 1–3 aralığındadır ve varsayılanı `50/50/1` değeridir. Aynı saf render helper'ı self/public/preview hero banner'ında ve ortak avatar üzerinden sidebar, mobil topbar ve kullanıcı kartlarında kullanılır. Eski kayıtlarda banner transform yoksa `banner_position` top/center/bottom fallback'i korunur.

`ImagePositionEditor` pointer/touch sürükleme, yön tuşları ve görünür nudge butonları, zoom slider/butonları ve merkeze sıfırlama sunar. Yeni upload draft transformunu merkeze döndürür; transform ancak birleşik profil save ile kalıcılaşır. `Vazgeç`, son kaydedilmiş transformu geri getirir.

### Cloud persistence ve migration

`20260722120000_profile_image_transforms.sql`, banner/avatar için focal X/Y ve zoom kolonlarını, DB aralık constraint'lerini ve `auth.uid()` bağlı save RPC genişlemesini ekler. Public loader ve kişi özetleri yalnız izin verilen transform metadata'sını döndürür. Önceki `20260722110000_unified_profile_presentation.sql` değiştirilmez. Yeni migration remote'a bu turda uygulanmaz.

### Porselen kontrast tokenları

Cloud veri aksiyonları ve durum filtreleri için sınırlı `--app-action-success-*`, `--app-action-accent-*`, `--app-selected-*` ve `--app-disabled-*` tokenları tanımlanır. Disabled kartlarda bütün metni solduran parent opacity kullanılmaz; metin, border ve yüzey rolleri ayrı kalır. Aktif status pill'i okunabilir selected text, focus ring, `aria-pressed` ve görünür check işareti taşır. Bu düzenleme domain/status renklerini tek generic accent'e dönüştürmez.

### Manuel testler ve bilinen sınırlamalar

Tarayıcı smoke sırasında `/feed → /profile`, `/recommendations → /profile`, `/profile` yenileme ve doğrudan edit modu; ardından banner/avatar drag, zoom, reset ve self/public/sidebar tutarlılığı kontrol edilmelidir. Remote migration uygulanmadan cloud transform save testi tamamlanamaz. Bu tur ortak P3 sayfa tasarım sistemi, feed/people/progression redesign'ı veya chart/layout kişiselleştirmesi değildir.

## Gelecek aşamalar

- **P1 Tema motoru:** Tamamlandı; root runtime, cookie mirror, aktif tema/accent UI ve shared semantic uyumluluk eklendi.
- **P2 Birleşik profil ve ProfileHero:** Tamamlandı; canonical shell, `/profile`, ortak hero, cloud presentation ve local fallback/cache bağlandı.
- **P3 Grafik ve düzen kişiselleştirmesi:** Chart palette ve layout seçeneklerini UI/persistence ile bağlama.
- **P4 Ortak sayfa tasarım sistemi ve ana sayfa refactor'ı:** Semantik yüzey primitive'leriyle kontrollü sayfa dönüşümü.

## Bilinçli sınırlamalar

- Client preference modellerinde ham CSS ve sınırsız renk seçici yoktur.
- P1'de tema seçimi aktiftir; bütün `zinc` sınıfları mekanik olarak dönüştürülmemiştir.
- P2 migration uygulanmış kabul edilir; P3.0 transform migration'ı için remote Supabase işlemi veya migration apply yapılmamıştır.
- Dashboard'un diğer internal sekmeleri route'a taşınmamış, kütüphane/dashboard genel refactor'ı yapılmamıştır.
- Public profil modülleri ve sosyal feature'lar yeniden tasarlanmamış; header ve shell sınırları birleştirilmiştir.
- Chart palette, density/effects ve dashboard layout UI hâlâ P3 kapsamındadır.
