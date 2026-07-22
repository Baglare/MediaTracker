# Kişiselleştirme Mimarisi

## Amaç

Bu belge MediaTracker'ın temel uygulama görünümünü, dünya vurgusunu, cihaz tercihlerini ve public profil sunumunu birbirinden ayıran P0 sınırlarını ve bunları aktif hâle getiren P1 tema motorunu tanımlar. P1 bir sayfa redesign turu değildir; mevcut hiyerarşiyi koruyarak Obsidyen, Porselen, Okyanus ve Sistem seçeneklerini çalışır hâle getirir.

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

Public profil görsel kimliğidir: palette, banner mode/position, overlay, avatar frame, surface style ve motif intensity. Bu model P0'da yalnız tip ve runtime normalization katmanıdır; veritabanına yazılmaz ve editör UI'ına eklenmez.

### Connection color

`connectionColor` Yin/Yang sosyal bağlantı gösterimine aittir. `profilePaletteId` public profil görsel kimliğidir. `accentMode` kullanıcının kendi uygulama görünümüdür. Bu üç alan birbirinin yerine kullanılmaz.

### Chart palette

Chart palette tamamlanan, devam eden, planlanan, duraklatılan ve bırakılan durumları için segment, aktif satır yüzeyi, metin ve dot tonu tanımlar. `standard` mevcut Right Rail renklerini temsil eder. `followWorldCompletedColor`, tamamlanan renginin dünya tokenını izlediğini açıkça belirtir. P0 chart palette seçimi için UI eklemez.

## Veri sahipliği

| Alan | Sahiplik | Görünürlük | Fallback |
| --- | --- | --- | --- |
| App appearance | Local-only `localStorage` | Private/device | Obsidyen default |
| Kütüphane filtreleri | Local-only mevcut UI preferences | Private/device | Mevcut filtre defaultları |
| Yerel profil | Local-only mevcut profile preferences | Private/device | Güvenli yerel varsayılan |
| Sosyal profil identity | Cloud-backed | Public/protected/personal politikasına bağlı | Eksik alanda yerel identity |
| Profile presentation | Gelecekte cloud-backed | Public | P0 sade default |
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

- **Identity:** Kim olduğu; cloud→local→fallback önceliği.
- **Presentation:** Public profilinin nasıl göründüğü; kimlik ve ilişki renginden bağımsız.
- **Self view:** Yerel fallback kullanabilir; banner eklenmez.
- **Public view:** Yetkilendirilmiş cloud identity kullanır; yerel data URL sızdırmaz.

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

## Gelecek aşamalar

- **P1 Tema motoru:** Tamamlandı; root runtime, cookie mirror, aktif tema/accent UI ve shared semantic uyumluluk eklendi.
- **P2 Birleşik profil ve ProfileHero:** Identity resolver'ı self/public yüzeylerine bağlama, presentation persistence tasarımı.
- **P3 Grafik ve düzen kişiselleştirmesi:** Chart palette ve layout seçeneklerini UI/persistence ile bağlama.
- **P4 Ortak sayfa tasarım sistemi ve ana sayfa refactor'ı:** Semantik yüzey primitive'leriyle kontrollü sayfa dönüşümü.

## Bilinçli sınırlamalar

- Client preference modellerinde ham CSS ve sınırsız renk seçici yoktur.
- P1'de tema seçimi aktiftir; bütün `zinc` sınıfları mekanik olarak dönüştürülmemiştir.
- DB migration, remote Supabase değişikliği ve public profil değişikliği yoktur.
- Self-profile banner, yeni profil edit formu, birleşik `ProfileHero` ve chart palette UI yoktur.
- P2 birleşik profil/ProfileHero; P3 chart palette ve düzen seçimi olarak ayrı kalır.
