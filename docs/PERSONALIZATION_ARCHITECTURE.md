# Kişiselleştirme Mimarisi

> P3.1 ortak sayfa primitive'leri, surface hiyerarşisi ve dünya motif kuralları için [PAGE_DESIGN_SYSTEM.md](./PAGE_DESIGN_SYSTEM.md) belgesine bakın.

> **Güncel durum:** P1–P6 tarihsel aşamalarının üzerine D4 tema/UX stabilizasyonu tamamlandı. Güncel açık tema, logo, collapsible ve grafik kararları [D4_UI_THEME_POLISH.md](./D4_UI_THEME_POLISH.md) içinde; D4 kabul özeti [D4_STABILIZATION_AND_ACCEPTANCE.md](./D4_STABILIZATION_AND_ACCEPTANCE.md) içindedir.

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

Uygulama arka planı, yüzeyleri, metinleri, border, gölge, overlay, focus ve temel accent tokenlarını sağlar. Preset registry kimlikleri `system`, `obsidian`, `porcelain`, `ocean`, `dusty_rose`, `forest`, `lavender`, `polar` ve `sepia`dır. Sistem, `prefers-color-scheme` sonucuna göre Obsidyen veya Porselen tabanına çözülür ve sistem tercihi çalışma sırasında değişirse güncellenir.

### Accent mode ve world theme

Accent mode kullanıcının kendi cihazındaki vurgu davranışıdır: `auto`, `theme`, `east`, `screen`, `arch`, `neutral`. `auto` aktif dünyayı izler; `theme` temel temanın accent'ini kullanır; sabit dünya modları aktif dünya filtresinden etkilenmez.

World theme, uygulama temel teması değildir. `neutral`, `east`, `screen` ve `arch` kayıtları kimlik adı, kısa açıklama, ana/ikincil renk, border, glow, chart rengi, icon key ve motif key taşır. Mevcut `data-world` ve `--w-*` davranışı korunur.

### App appearance

`AppAppearancePreferences` yalnız cihazdaki uygulama deneyimini taşır: base theme, accent mode, effects level ve density. `mediaTracker:appearancePreferences:v1` anahtarında tutulur. Kütüphane filtresi, profil alanı, public sunum değeri veya ham CSS içermez.

### Profile identity

Kimlik görünen ad, tagline/bio, avatar, banner ve seçili ünvanı çözer. Giriş yapılmış sosyal profil varsa cloud alanları önceliklidir; eksik cloud alanları yerel profile, ardından güvenli varsayılanlara düşer. Cloud avatar yerel data URL'den önce gelir. Banner yalnız sosyal profilden gelebilir. Resolver DOM, React, localStorage, network veya kayıt side effect'i bilmez.

### Profile presentation

Public profil görsel kimliği palette, banner mode/position, overlay, avatar frame, surface style ve motif intensity alanlarını taşır. Profil sahibinin ayrıca açıkça yayımladığı `hidden`, `preset_only` veya `current_theme` tema snapshot'ı varsa allowlist semantic renkler `/u/[username]` route kökü, route-local public navigasyon, Hero ve profil modüllerinde uygulanır. Bu scope ziyaretçinin root appearance tercihini, cookie/localStorage değerini, authenticated sidebar/topbar'ını veya başka route'u değiştirmez. Profile palette yalnız motif/vurgu karakteridir; base theme değildir.

### Connection color

`connectionColor` Yin/Yang sosyal bağlantı gösterimine aittir. `profilePaletteId` public profil görsel kimliğidir. `accentMode` kullanıcının kendi uygulama görünümüdür. Bu üç alan birbirinin yerine kullanılmaz.

### Chart palette

Chart palette tamamlanan, devam eden, planlanan, duraklatılan ve bırakılan durumları için segment, aktif satır yüzeyi, metin ve dot tonu tanımlar. `standard` mevcut Right Rail renklerini temsil eder. P5B ile `standard`, `ocean`, `pastel`, `high_contrast`, `monochrome` ve `world_aware` registry kayıtları kullanıcı tarafından seçilebilir hâle gelmiştir. `followWorldCompletedColor`, tamamlanan renginin dünya `chartPrimary` değerini izlemesini ayrı bir uygulama tercihi olarak yönetir; diğer segmentler seçili palette kalır.

## Veri sahipliği

| Alan | Sahiplik | Görünürlük | Fallback |
| --- | --- | --- | --- |
| App appearance | Local-only `localStorage` | Private/device | Obsidyen default |
| Dashboard/Right Rail layout | Local-only `localStorage` | Private/device | Registry sırası ve görünürlüğü |
| Kütüphane filtreleri | Local-only mevcut UI preferences | Private/device | Mevcut filtre defaultları |
| Yerel profil/cache | Local-only mevcut profile preferences | Private/device | Girişsiz kullanım, offline/eksik cloud fallback |
| Birleşik profil identity | Cloud-backed ana kaynak | Public/protected/personal politikasına bağlı | Eksik alanda local cache, auth metadata, güvenli default |
| Profile presentation | Cloud-backed | Public loader görünürlük politikasına bağlı | Sade normalize edilmiş default |
| Connection color | Cloud-backed sosyal ilişki | İlişki görünümü | `neutral` |
| Chart palette | Local-only app appearance preference | Private/device | `standard` |
| Startup preference | Local-only `localStorage` | Private/device | Dashboard |

## Tema matrisi

| Tema | Renk şeması | P1 durumu |
| --- | --- | --- |
| Sistem | Sistem tercihi | Aktif; açıkta Porselen, koyuda Obsidyen |
| Obsidyen | Koyu zinc | Aktif; mevcut görünümün temel eşlemesi |
| Porselen | Kırık beyaz / stone | Aktif; açık yüzey ve koyu metin eşlemesi |
| Okyanus | Lacivert / mavi / turkuaz | Aktif; navy yüzey ve kontrollü cyan accent |
| Tozpembe | Gül kurusu / pembe-krem | Aktif; belirgin pudramsı yüzeyler |
| Orman | Çam / yosun / toprak | Aktif; koyu tema |
| Lavanta | Lila / erik | Aktif; soğuk açık tema |
| Kutup | Buz mavisi / arduvaz | Aktif; soğuk açık tema |
| Sepya | Parşömen / terracotta / mürekkep | Aktif; sıcak açık tema |

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

Root layout ilk HTML'de `data-theme`, `data-base-theme`, `data-accent-mode`, `data-resolved-accent`, `data-effects` ve `data-density` attribute'larını yazar. `data-theme` doğrulanmış preset kimliği veya `custom` değeridir. Client runtime yalnız doğrulanmış preference değerleriyle bu attribute'ları günceller ve `color-scheme` değerini temayla eşler.

### Persistence ve cookie mirror

`mediaTracker:appearancePreferences:v2` ana kaynaktır. Eski `v1` kaydı yalnız yeni anahtar yoksa okunur; tema, accent, yoğunluk ve efekt seçimleri korunurken yeni chart alanları default ile tamamlanır. Cookie yalnız `baseTheme`, çözülmüş tema ve `accentMode` kimliklerini taşır; profil, medya veya kullanıcı verisi içermez. Root layout allowlist parser ile cookie'yi okuyarak ilk HTML'i doğru temayla üretir. Client hydration sonrasında localStorage varsa önceliklidir; yoksa güvenli cookie kimliği kullanılır ve storage'a yazılır. Cookie client runtime tarafından aynı allowlist formatında mirror edilir.

### System tema davranışı

`system` açık sistem tercihinde Porselen, koyu sistem tercihinde Obsidyen olarak çözülür. Runtime `matchMedia('(prefers-color-scheme: dark)')` değişimini dinler ve listener'ı unmount sırasında temizler. Default preference hâlâ Obsidyen'dir.

### Base theme ve world accent ayrımı

Base theme `--app-*` tokenlarını sağlar. Kullanıcı accent tercihi `--app-accent*` tokenlarını çözer. İçerik sınıflandırması ve WorldHero `--w-*` tokenlarını kullanmaya devam eder. Bu nedenle sabit Kadraj app accent'i, Doğu içerik rozetini veya anime/manga/novel alt ailesini değiştirmez. Right Rail completed segmenti aktif içerik dünyasını izlemeyi sürdürür.

### Semantic token migration stratejisi

Preset token registry tema kimliğinin canonical modelidir; background, surface, elevated, text, border, input, hover, selected, focus ve durum rollerini birlikte tanımlar. `app/globals.css` preset scope'ları ilk paint/fallback ve Tailwind uyumluluğu için aynı semantic sözleşmeyi yansıtır; testler registry ile CSS contract'ının ayrışmasını engeller. Shared kabuklarda `app-page`, `app-panel`, `app-card`, `app-input` ve sınırlı semantik action utility'leri kullanılır. Domain/status renkleri topluca tema rengine çevrilmez.

### Tema ayar UI

Ayarlar içindeki Görünüm kartı bütün presetler için ad, açıklama, gerçek token preview ve seçili durum gösterir. Dünya vurgusu Otomatik, Tema rengi, Doğu, Kadraj, Arşiv ve Nötr seçeneklerini ayrı sunar. Grafik paleti, dünya rengini izleme, Rahat/Kompakt yoğunluk ve Kapalı/Hafif/Tam efekt kontrolleri aynı modelin ayrı alanlarıdır. Varsayılana dön görünüm modelinin bütün alanlarını güvenli varsayılana döndürür; profil sunumu ayrı kalır.

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

Banner modu `none`, `gradient`, `world` veya `image` olabilir. Kullanıcı banner URL'si CSS string'ine gömülmez; güvenli image kaynağı olarak render edilir. Gerçek image yüklenene kadar, URL eksikse veya load başarısızsa Hero `--app-*` surface/text tokenlarından theme-aware fallback üretir; profile palette yalnız kontrollü motif/vurgu ekler. Koyu image overlay ve beyaz foreground yalnız gerçekten yüklenmiş görselde kullanılır. `none` sade theme surface'tir. Avatar frame yalnız sunumdur ve avatar kaynağını değiştirmez.

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

D4 ile kendi profil `summary` ve `hero` okumaları process belleğinde owner-scoped cache'e bağlandı. Anahtar `ownerId + resource(summary|hero)`, TTL 5 dakikadır; aynı anahtarın eşzamanlı istekleri tek promise paylaşır. Cache yalnız güvenli parse edilmiş response değerini tutar, localStorage'a veya cache değerine blob/base64 görsel yazmaz. Profil save ve avatar/banner upload başarısı ilgili owner kaydını günceller veya geçersizleştirir; account switch yalnız aktif owner anahtarını okuyabilir.

### Non-destructive görsel transform modeli

Banner ve avatarın orijinal cloud asset'i korunur; fiziksel crop veya her ayarda tekrar upload yapılmaz. Sunum metadata'sı `focalX`/`focalY` için 0–100, `zoom` için 1–3 aralığındadır ve varsayılanı `50/50/1` değeridir. Aynı saf render helper'ı self/public/preview hero banner'ında ve ortak avatar üzerinden sidebar, mobil topbar ve kullanıcı kartlarında kullanılır. Eski kayıtlarda banner transform yoksa `banner_position` top/center/bottom fallback'i korunur.

`ImagePositionEditor` pointer/touch sürükleme, yön tuşları ve görünür nudge butonları, zoom slider/butonları ve merkeze sıfırlama sunar. Yeni upload draft transformunu merkeze döndürür; transform ancak birleşik profil save ile kalıcılaşır. `Vazgeç`, son kaydedilmiş transformu geri getirir.

### Cloud persistence ve migration

`20260722120000_profile_image_transforms.sql`, banner/avatar için focal X/Y ve zoom kolonlarını, DB aralık constraint'lerini ve `auth.uid()` bağlı save RPC genişlemesini ekler. Public loader ve kişi özetleri yalnız izin verilen transform metadata'sını döndürür. Önceki `20260722110000_unified_profile_presentation.sql` değiştirilmez. Yeni migration remote'a bu turda uygulanmaz.

### Porselen kontrast tokenları

Cloud veri aksiyonları ve durum filtreleri için sınırlı `--app-action-success-*`, `--app-action-accent-*`, `--app-selected-*` ve `--app-disabled-*` tokenları tanımlanır. Disabled kartlarda bütün metni solduran parent opacity kullanılmaz; metin, border ve yüzey rolleri ayrı kalır. Aktif status pill'i okunabilir selected text, focus ring, `aria-pressed` ve görünür check işareti taşır. Bu düzenleme domain/status renklerini tek generic accent'e dönüştürmez.

### Manuel testler ve bilinen sınırlamalar

Tarayıcı smoke sırasında `/feed → /profile`, `/recommendations → /profile`, `/profile` yenileme ve doğrudan edit modu; ardından banner/avatar drag, zoom, reset ve self/public/sidebar tutarlılığı kontrol edilmelidir. Remote migration uygulanmadan cloud transform save testi tamamlanamaz. Bu tur ortak P3 sayfa tasarım sistemi, feed/people/progression redesign'ı veya chart/layout kişiselleştirmesi değildir.

## P5A düzen ve panel kişiselleştirmesi

`LayoutPreferences` Dashboard ve Right Rail için stable widget kimliği, görünürlük ve normalize edilmiş sıra taşır. Model `version: 1` ile `mediaTracker:layoutPreferences:v1` anahtarında local-first saklanır. Runtime normalization bilinmeyen ve yinelenen kimlikleri atar, eksik yeni widget'ları registry varsayılanından tamamlar, sıra değerlerini kesintisiz hâle getirir ve zorunlu Dashboard özetinin gizlenmesine izin vermez. Giriş durumu veya tema seçimi bu modele dahil değildir.

Dashboard ve Right Rail metadata'sının source of truth'u `lib/personalization/widget-registry.ts` dosyasıdır. Registry label, açıklama, varsayılan sıra/görünürlük, zorunluluk, yüzey ve sunum span metadata'sı taşır; React state, render fonksiyonu, network veya tema kimliği taşımaz. Component eşlemesi presentation katmanında kalır. Görünmez Dashboard bölümleri ve Right Rail widget'ları render listesine girmez; preference hydration sırasında varsayılan widget'ların kısa süre görünüp kaybolması yerine sınırlı bir düzen loading durumu gösterilir.

Eski `media-tracker-right-rail-preferences` anahtarı yalnız yeni P5A kaydı yoksa bir defalık backward-compatible okuma kaynağıdır. Yeni değişiklikler tek P5A anahtarına yazılır; eski veya başka preference anahtarları silinmez. Merkezi Ayarlar içindeki **Düzen ve Paneller** alanı ile Dashboard/Right Rail bağlamsal bağlantıları aynı hook ve modele gider. Yukarı, aşağı, en üste ve en alta kontrolleri klavye ile çalışır; görünürlük label'lı checkbox ile, sıra değişimi `aria-live` mesajıyla açıklanır. Sağ panelin mobilde görünmediği UI içinde belirtilir.

P5A, chart palette, density, effects veya varsayılan açılış tabını layout modeline eklemez; bunlar P5B'nin ayrı preference alanlarıdır. RGB/HEX, custom theme, Tozpembe/Orman veya tema import/export da layout modelinden bağımsız P6 registry/token katmanında kalır.

## P5B grafik, yoğunluk, efekt ve başlangıç tercihleri

P5B ile `AppAppearancePreferences` `version: 2` olarak `chartPaletteId` ve `followWorldCompletedColor` alanlarını taşımaya başladı; P6 migration'ı aynı alanları koruyarak modeli `version: 3` preset/custom tema seçimine yükseltir. Mevcut `density` ve `effectsLevel` alanları root runtime tarafından aktif olarak uygulanır. Chart registry renk sunumunun tek kaynağıdır. Right Rail donut ve status listesi ile Dashboard durum dağılımı aynı resolver sonucunu tüketir. Grafik palette'i hata, başarı, recommendation lifecycle, notification severity, favori veya `connectionColor` anlamlarını değiştirmez.

Yoğunluk `data-density="comfortable|compact"` üzerinden yalnız ortak spacing tokenlarını değiştirir: sayfa/section aralığı, panel/card padding, toolbar gap ve list row padding. Compact mod fontları, poster oranlarını, modal formlarını veya erişilebilir kontrol hedeflerini küçültmez. Ortak primitive'ler, Dashboard composition, Right Rail, Feed/Öneriler kartları ve Bildirimler/Kullanıcı Ara satırları bu tokenları tüketir; eski tekil feature yüzeyleri kademeli olarak mevcut spacing'ini korur.

Efekt seviyesi `data-effects="off|subtle|full"` ile dekoratif motif, glow, yüzey gölgesi ve tek seferlik dünya geçişini kontrol eder. `off` dekoratif katmanları kaldırır, `subtle` önceki dengeli davranışa yakındır, `full` motifi ve gölgeyi kontrollü artırır. Sürekli loop eklenmez. `prefers-reduced-motion: reduce`, seçili seviye Full olsa bile animasyonu kapatır; focus ve loading geri bildirimi korunur.

Başlangıç tercihi appearance veya layout modeline eklenmez. `StartupPreferences version: 1`, `mediaTracker:startupPreferences:v1` içinde yalnız Dashboard, Kütüphane, Keşfet, Takvim veya Ayarlar default'unu saklar. Açık `?tab=` query her zaman preference'tan önceliklidir. Sidebar Dashboard bağlantısı `/?tab=dashboard`, gear `/?tab=settings` üretir; bu nedenle default tercih açık navigasyon niyetini ezmez. Bare `/` hydration sırasında yanlış feature'ı kısa süre göstermemek için startup state çözülene kadar yalnız içerik sınırını bekletir; kalıcı AppShell remount edilmez.

P5A `LayoutPreferences` yalnız stable widget görünürlüğü/sırasını taşımaya devam eder. P5B chart/spacing/motion/startup alanlarını layout anahtarına yazmaz. P6 RGB/HEX ve custom theme davranışı base theme registry/token katmanında kalır; chart palette ve startup modelleri tema kimliği veya ham CSS kabul etmez.

## P6 Gelişmiş Tema Stüdyosu

> D1B.2B sahiplik güncellemesi: preset registry ve density/effects/chart
> tercihleri device-scoped kalır. Kullanıcı tarafından oluşturulan custom tema
> kataloğu, aktif custom tema referansı ve theme cloud-sync local metadata'sı
> `LocalOwnerScope` ile guest/user namespace'lerine ayrılır. Owner bilinmeden
> custom cookie snapshot uygulanmaz; doğrulanmış owner hydration'ı tamamlanana
> kadar güvenli device preset kullanılır. Ayrıntılar:
> [LOCAL_PERSONAL_DATA_OWNERSHIP.md](./LOCAL_PERSONAL_DATA_OWNERSHIP.md).

### Preset + custom seçim modeli

`AppAppearancePreferences version: 3`, kapalı `baseTheme` alanı yerine ayrışmış `ThemeSelection` kullanır. Preset seçimleri `system`, `obsidian`, `porcelain`, `ocean`, `dusty_rose`, `forest`, `lavender`, `polar` ve `sepia` kimliklerini taşır; custom seçim yalnız güvenli `ct_*` kimliğine işaret eder. v1/v2 kayıtları alan bazında normalize edilir; accent, density, effects, chart palette ve world-aware completed seçimi korunur. Silinmiş veya bulunamayan custom kimliği Obsidyen'e düşer.

Yeni hazır temalar registry metadata'sı ve CSS semantic scope'ları üzerinden çalışır:

- **Tozpembe:** kırık beyaz/gül kurusu, sakin bordo vurgu.
- **Orman:** katmanlı çam ve yosun yüzeyleri, toprak ikincil vurgu.
- **Lavanta:** soluk lavanta, gri-mavi yüzey ve koyu erik vurgu.
- **Kutup:** buz mavisi/arduvaz yüzey ve kontrollü turkuaz.
- **Sepya:** parşömen, mürekkep kahvesi ve terracotta; Arşiv dünya kimliği değildir.

### Custom theme girdileri ve token üretimi

Kullanıcı `colorScheme`, `background`, `surface`, `accent` ve `secondaryAccent` değerlerini seçer. `textColorMode: auto` aynı girdilerden ana/ikincil/soluk metni, accent/selected/action foreground'unu, border ve focus'u deterministik olarak üretir; `custom` modu ana/ikincil/soluk metni ayrıca kabul eder. HEX girdisi `#RGB` veya `#RRGGBB`, RGB kanalları 0–255 aralığında kabul edilir ve kayıt öncesi canonical `#RRGGBB` biçimine çevrilir. CSS function, URL, gradient, alpha ve raw CSS kabul edilmez. Error/success/warning semantic renkleri custom accent'e dönüştürülmez.

`relativeLuminance`, `contrastRatio` ve `evaluateThemeContrast`; ana/ikincil metni background/surface/card/panel üzerinde, muted ve disabled metni, accent/selected/action foreground'larını, focus/border ayrımını ve success/warning/danger soft-surface çiftlerini denetler. Sonuç `valid`, `warning` veya `critical` sınıfındadır; critical çözülmeden tema etkinleştirilemez veya public yayımlanamaz. “Otomatik düzelt” yalnız effective metin/border/focus düzeltmelerini kaydeder; kullanıcının ham ana renklerini sessizce değiştirmez. Bu rapor yardımcı bir uygulama kontrolüdür, WCAG sertifikası değildir.

Public snapshot version 1 ve 21 renkli exact allowlist değişmemiştir. Selected, disabled, action ve status gibi ek runtime semantic roller bu güvenli snapshot'tan route scope'unda yeniden türetilir; custom theme ID, raw input, correction internals, CSS veya asset public payload'a eklenmez.

C3'te decode ve render aynı deterministik runtime-token tamamlama yolunu kullanır. Böylece geçerli persisted custom snapshot, eksik runtime rollerini Obsidyen/Porselen'den karıştırarak yanlışlıkla reddedilmez; owner snapshot viewer temasından bağımsız kalır ve yalnız public profile route scope'unda uygulanır.

### Persistence, runtime ve ilk paint

Custom katalog `mediaTracker:personal:v1:<scope>:customThemes` anahtarında owner-scoped local-first saklanır. Eski `mediaTracker:customThemes:v1` yalnız explicit ownership migration kaynağıdır. Runtime validation bozuk JSON/version/kayıtları atar, yinelenen kimlikleri temizler ve owner başına en fazla 20 temayı kabul eder. Tema adı 1–40 karakterdir; ID Web Crypto ile üretilir. Preset kayıtları düzenlenmez veya silinmez.

Root runtime custom temada `data-theme-source="custom"`, `data-theme="custom"` ve `data-custom-theme-id` uygular. Inline style yalnız `APP_THEME_TOKEN_CSS_VARIABLES` allowlist'indeki semantic property'leri kullanır; preset'e dönüldüğünde bu inline tokenlar temizlenir ve CSS `[data-theme]` scope'ları yeniden source of truth olur. World accent seçimi custom surface'i korur: `theme` custom accent'i, sabit Doğu/Kadraj/Arşiv world registry rengini kullanır.

İlk paint sırasında server owner scope'u doğrulayamadığı için custom cookie snapshot uygulanmaz. Root layout cookie'deki güvenli device preset ve accent kimliğini kullanır; owner-scoped custom seçim client hydration sonrasında katalog/owner eşleşmesi doğrulanınca uygulanır. Eski custom cookie parse edilebilse de başka owner'a inline token olarak taşınmaz ve client mirror yalnız device preset'i yazar.

### Tema Stüdyosu, güvenlik ve performans

Tema Stüdyosu preset listesini registry'den üretir; custom tema oluşturma, düzenleme/yeniden adlandırma, kopyalama, confirmation ile silme, yalnız kaydetme ve kaydet-uygula akışlarını sunar. Ortak `ColorField` native picker, HEX, RGB ve 36 renkli merkezi katalog arasında senkronizasyon sağlar. Mini preview gerçek semantic tokenları kullanır. “Uygulamada geçici önizle” root tokenlarını kalıcı preference/cookie yazmadan değiştirir; vazgeçme önceki seçimi geri getirir.

Tema değişimi network, route reload, AppShell remount, local library parse veya auth/profile/XP fetch üretmez. Custom state Tema Stüdyosu ve tek root runtime sınırında kalır. P6 çekirdeğinde cloud tema sync/import-export yoktur; bunlar aşağıdaki P6.1 katmanında eklenmiştir. Tema marketi, raw CSS, custom font/background image ve world/chart/profile palette editörleri kapsam dışıdır.

Chart palette, public `profilePaletteId`, banner/avatar sunumu ve Yin/Yang `connectionColor` ayrı sahipliklerini korur; custom app theme bu alanlara yazmaz.

## P6.1 tema import/export ve opsiyonel cloud senkronizasyonu

### Bundle formatı ve yerel aktarım

Tema aktarımının canonical biçimi `mediatracker-theme-bundle`, `version: 1` JSON nesnesidir. Bundle yalnız custom tema ana girdilerini, güvenli metadata'yı ve isteğe bağlı aktif custom tema referansını taşır. Türetilmiş semantic tokenlar, cookie snapshot, preset registry, layout/startup/chart/profile tercihleri ve `connectionColor` dosyaya yazılmaz. Import sonrasında tokenlar mevcut saf P6 üreticisiyle yeniden türetilir.

Import 256 KB ile sınırlıdır. JSON plain-object, format/version, allowlist alanları, 1–20 tema, güvenli `ct_*` kimliği, 1–40 karakter ad, ISO tarih ve canonical HEX kurallarıyla doğrulanır. Raw CSS, URL, gradient, alpha, `style`, `className`, `backgroundImage` ve prototype-pollution anahtarları reddedilir. Geçerli ve bozuk kayıtların birlikte bulunduğu bundle önizlemede aday bazında ayrılır; yalnız kullanıcı tarafından onaylanan geçerli kayıtlar yazılır.

ID çakışması sessiz overwrite üretmez: kullanıcı **Atla**, **Mevcut temayı değiştir** veya **Yeni kopya olarak ekle** seçer. İsim eşitliği tek başına overwrite nedeni değildir. Bundle içindeki aktif tema ancak kullanıcı ayrı “Dosyada seçili olan temayı uygula” seçeneğini açarsa appearance preference ve ilk-paint cookie snapshot'ına uygulanır. Export/import tamamen local canonical katalog üzerinden çalışır ve network gerektirmez.

### Private cloud modeli ve revision concurrency

`20260722130000_theme_cloud_sync.sql`, yalnız kullanıcıya ait `user_theme_preferences` tablosunu ekler. Tablo canonical aktif tema seçimini, custom tema listesini, schema version ve artan revision değerini saklar; türetilmiş CSS tokenı veya cookie snapshot saklamaz. RLS select'i `user_id = auth.uid()` ile sınırlar. Direct client mutation izni yoktur; save/delete yalnız authenticated, fixed-search-path RPC sınırından geçer ve kullanıcı kimliği `auth.uid()` içinden alınır.

`save_theme_sync_state` client'ın verdiği `expectedRevision` ile mevcut revision'ı karşılaştırır. Eşleşmeyen yazım genel hata yerine conflict sonucu üretir; client daha yeni cloud durumunu inceleme, birleştirme veya açık onayla cihazı kullanma seçeneği sunar. API route private/no-store yanıt verir, payload'ı TypeScript runtime katmanında da doğrular ve SQL/stack trace sızdırmaz. Public profil loader'ları bu tabloyu okumaz.

### Cihaz tercihi, ilk sync ve offline davranış

Senkronizasyon açık/kapalı tercihi ve revision/pending/error metadata'sı `mediaTracker:personal:v1:<user-scope>:themeCloudSync` içinde kullanıcı bazlıdır ve varsayılan kapalıdır. Eski `mediaTracker:themeCloudSync:v1` revision/error değerleri migrate edilmez. Girişsiz kullanıcı import/export kullanabilir fakat guest cloud sync yapamaz. İlk etkinleştirmede local/cloud sayıları karşılaştırılır: cihaz, bulut, birleştir veya vazgeç kararı alınmadan iki dolu katalog birbirini ezmez.

Birleştirme stable ID üzerinden yapılır. Tek taraftaki kayıt eklenir, aynı ID ve aynı içerik tek kalır, aynı ID ve farklı içerikte yerel kayıt ID'sini korurken cloud kayıt yeni güvenli ID ile “Bulut Kopyası” olur. 20 tema sınırı merge öncesi ve sırasında korunur. Aktif tema uyuşmazlığı ayrıca görünür conflict olarak raporlanır.

Tema mutasyonu önce localStorage ve root runtime'a uygulanır. Cloud save başarısızlığı local temayı geri almaz, aktif temayı Obsidyen'e düşürmez ve uygulama açılışını bekletmez; cihaz tercihi pending/error durumunu saklar. Kaydedilmiş tema veya aktif seçim değişiklikleri kısa debounce ile toplu gönderilebilir; RGB draft keystroke'ları ve geçici preview senkronize edilmez. Ayrıntılı dosya formatı, conflict örnekleri ve manuel doğrulama için [THEME_IMPORT_EXPORT_AND_SYNC.md](./THEME_IMPORT_EXPORT_AND_SYNC.md) belgesine bakın.

## Gelecek aşamalar

- **D4 Product Polish / Performance / UX Reliability:** Tamamlandı; açık tema yüzey kimlikleri, theme-aware SVG mask logo, responsive başlık/rozetler, ayar collapsible'ları, monokrom grafik erişilebilirliği ve browser smoke kabulü tamamlandı.

- **P1 Tema motoru:** Tamamlandı; root runtime, cookie mirror, aktif tema/accent UI ve shared semantic uyumluluk eklendi.
- **P2 Birleşik profil ve ProfileHero:** Tamamlandı; canonical shell, `/profile`, ortak hero, cloud presentation ve local fallback/cache bağlandı.
- **P3.1 Ortak sayfa tasarım sistemi:** Tamamlandı; sosyal feature sayfaları, progression ve profil alt modülleri ortak hero/section/stat/filter/state diline geçirildi.
- **P5B Grafik, yoğunluk, efekt ve başlangıç:** Tamamlandı; chart palette UI/runtime, root density/effects ve ayrı startup preference bağlandı.
- **P5A Dashboard ve panel düzeni:** Tamamlandı; stable widget registry, local-first görünürlük/sıra ve erişilebilir Ayarlar editörü bağlandı.
- **P4 Ana sayfa ve kütüphane refactor'ı:** Tamamlandı; composition root, feature sınırları, saf library selector'ları, command/modal orchestration ve lazy tab sınırları [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) içinde tanımlandı.

## Bilinçli sınırlamalar

- Client preference modellerinde ham CSS ve sınırsız renk seçici yoktur.
- P1'de tema seçimi aktiftir; bütün `zinc` sınıfları mekanik olarak dönüştürülmemiştir.
- P2 migration uygulanmış kabul edilir; P3.0 transform migration'ı için remote Supabase işlemi veya migration apply yapılmamıştır.
- Dashboard internal sekmeleri route'a taşınmamıştır; P4 yalnız mevcut `/?tab=` sözleşmesini koruyarak feature sınırlarını ayırmıştır.
- Public profil modüllerinin veri/visibility davranışı yeniden tasarlanmamış; P3.1 yalnız ortak surface ve state dilini uygular.
- Tema marketi ve public tema paylaşımı yoktur. P6.1 import/export ile private, opsiyonel cloud sync sağlar; remote kullanılabilirlik ilgili server migration/RPC sözleşmesinin hedef ortamda bulunmasına bağlıdır.
