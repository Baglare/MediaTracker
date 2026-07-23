# MediaTracker Sayfa Tasarım Sistemi

## Tasarım hedefi

P3.1, ana feature sayfalarını aynı MediaTracker tasarım ailesinde buluşturur. Amaç bütün sayfaları aynı kart şablonuna çevirmek değil; spacing, container, yüzey hiyerarşisi, başlık, filtre, durum ve erişilebilirlik kararlarını ortaklaştırırken Feed, Öneriler, Bildirimler, Kullanıcı Ara, İlerleme ve profil modüllerinin ürün kimliğini korumaktır.

Canonical `AppShell` sayfa kabuğudur. Bu dokümandaki primitive'ler sidebar, topbar, auth, veri yükleme veya feature business logic'i taşımaz.

## Primitive'ler

- `PageHero`: breadcrumb, eyebrow, başlık, açıklama, ikon, aksiyon ve özet alanını sağlar. `neutral`, `east`, `screen`, `arch`, `social` ve `progression` tonlarını destekler.
- `PageSection`: bölüm başlığı, açıklama, count, sağ aksiyon ve içerik yüzeyini birleştirir.
- `SectionHeading`: panel oluşturmadan bölüm başlığı gereken yerler içindir.
- `StatCard`: label, değer, destek metni, ikon ve semantic/world tone sunar. Renk kritik bilginin tek taşıyıcısı değildir.
- `SegmentedTabs`: controlled value, `tablist` semantiği, `aria-selected`, ok/Home/End tuşları ve taşabilen mobil düzen sağlar.
- `FilterToolbar`: arama, filtre, sort ve aksiyon slotlarını responsive bir yüzeyde düzenler; feature filtre state'ini sahiplenmez.
- `ContextualActions`: ilgili link ve aksiyonların tutarlı wrap/focus düzenidir.
- `EmptyState`: boşluğun nedenini ve mümkün olan sonraki aksiyonu anlatır.
- `ErrorState`: beklenen veri hatasını empty state'ten ayırır ve isteğe bağlı retry sunar.
- `LoadingState`: gerçek veri sınırına ait `aria-busy` skeleton'ıdır.
- `StatusBadge`: neutral, accent, info, success, warning, danger ve world durumlarını merkezi sunar; domain label'ını değiştirmez.

## Kullanım kuralları

- Feature verisi ve mutation kararları primitive'lere taşınmaz.
- Sunum-only primitive'ler Server Component uyumlu kalır. Yalnız klavye kontrollü `SegmentedTabs` ve callback kullanan retry yüzeyleri client sınırıdır.
- Aynı sayfada iç içe gereksiz panel/card katmanları kurulmaz.
- Lifecycle, notification severity, error ve success renkleri base accent'e zorlanmaz.
- Public profil palette'i yalnız profil alanlarında kalır; app base theme'i değiştirmez.

## Surface hierarchy

Hiyerarşi:

1. `--app-bg`: uygulama arka planı
2. `--app-hero-bg`: sayfa üst alanı
3. `--app-panel-bg`: section ve toolbar
4. `--app-card-bg`: feature kartı
5. `--app-surface-2/3`: nested item ve seçili/hover katmanı

`--app-card-hover`, `--app-section-divider` ve `--app-subtle-highlight` rolleri bu hiyerarşiyi tamamlar. Obsidyen mevcut koyu karakterini, Porselen kırık beyaz/stone ayrımını, Okyanus lacivert yüzey derinliğini korur.

## Theme integration

CSS gerçek yüzey renklerinin source of truth'udur. Primitive'ler yalnız semantic `--app-*` ve gerektiğinde `--w-*` tokenlarını tüketir. Component içinde Obsidyen/Porselen/Okyanus switch tablosu bulunmaz.

Porselen'de panel ve kart sınırları birbirinden ayrılır; muted metin görünür kalır. Okyanus'ta panel, kart ve nested item aynı lacivert blokta birleşmez. Obsidyen'de mevcut zinc tabanlı yoğunluk korunur.

## World identity

`WORLD_THEME_REGISTRY` dünya adı, renk, ikon ve motif anahtarlarının source of truth'udur.

- Doğu: sıcak altın, lake/kırmızı ve kontrollü slash/mürekkep izi.
- Kadraj: sinema mavisi, kontrollü kırmızı, lens halkası ve film şeridi.
- Arşiv: parşömen altını, mum mührü ve kitap/raf çizgileri.
- Nötr: dünya bağlamı olmayan uygulama yüzeyleri.

Motifler dekoratiftir, `pointer-events: none` ve `aria-hidden` kullanır; metni kapatmaz, sürekli animasyon çalıştırmaz. World tone yalnız PageHero, dünya kartı, world stat/progress ve uygun empty-state vurgusuna uygulanır.

## Feature-specific exceptions

- Feed yorum/reply ilişkisini ve reaction toolbar'ını korur.
- Öneriler response/progress lifecycle renklerini ve compact/expanded kart davranışını korur.
- Bildirimler daha yoğun liste yapısı, okunmuş/okunmamış metni ve badge senkronizasyonunu korur.
- Kullanıcı Ara profil keşfi, avatar transform ve relationship aksiyonlarını korur.
- İlerleme oyunlaştırılmış XP yapısını, dünya/branch/görev/rozet ayrımını korur.
- ProfileHero yeniden tasarlanmaz; alt modüller ortak section/state dilini kullanır.

## Loading, error ve empty

Route `loading.tsx` sınırları AppShell'i değiştirmez. PageHero ile hafif skeleton, gerçek içerik geldiğinde yerini feature'a bırakır. Client veri hataları `ErrorState`, sonuç bulunmaması `EmptyState` ile gösterilir. Raw SQL, secret veya viewer-specific teknik hata kullanıcıya basılmaz.

## Contextual navigation

- Feed aktörü ve öneri tarafları `/u/[username]` profilini açar.
- Notification entity link'leri canonical `notificationHref` resolver'ını kullanır.
- People kartları public profile gider.
- Progression, profil görünümüne geri dönüş sunar.
- Self public profile edit aksiyonu `/profile?mode=edit` kullanır.

Mevcut güvenli media-detail route/adapter bulunmayan snapshot'lar için sahte URL oluşturulmaz.

## Responsive

PageHero aksiyonları wrap olur. Segmented tabs yatay taşabilir ve klavye ile gezilebilir. FilterToolbar küçük ekranda dikey, büyük ekranda yataydır. Stat kartları 1/2/4 kolon düzenine çıkar. Feed reply çizgileri mobilde daha dar girinti kullanır; recommendation ve notification aksiyonları wrap olur.

## Accessibility

Heading hiyerarşisi, breadcrumb nav, `role=tablist/tab`, `aria-selected`, `aria-expanded`, `aria-busy`, okunmamış “Yeni” metni ve `focus-visible` yüzükleri ortak sözleşmedir. Renk, unread/selected/connection/status bilgisinin tek kaynağı değildir. Motifler screen reader ağacından çıkarılır. Reduced-motion altında ortak yüzey geçişleri kapanır.

## Yoğunluk ve efekt kuralları

Ortak spacing, `--app-page-gap`, `--app-section-gap`, `--app-panel-padding`, `--app-card-padding`, `--app-control-gap` ve `--app-list-row-padding` tokenlarından gelir. `data-density="compact"` yalnız bu aralıkları kontrollü azaltır. Primitive veya feature bileşenleri tema adına ya da density değerine göre ayrı class tablosu kurmaz; `app-section`, `app-toolbar`, `density-card` ve `density-list-row` rollerini kullanır. Font boyutu, poster oranı, modal form alanı ve minimum erişilebilir kontrol hedefi density ile küçültülmez.

`data-effects` dekoratif sunumu yönetir. Kapalı mod motif/glow ve gereksiz hover hareketini kaldırır; Hafif mevcut dengeli sunumdur; Tam yalnız statik glow ve tek seferlik geçişleri belirginleştirir. Focus, loading ve durum geri bildirimi efekt tercihiyle kapatılmaz. `prefers-reduced-motion` her seviyeden önceliklidir ve loop animasyonu tasarım sistemine kabul edilmez.

## Performance sınırları

- AppShell route sayfalarında yeniden render edilmez.
- Primitive'ler auth/profile/XP fetch yapmaz.
- Kart başına profil sorgusu eklenmez.
- Existing profile editor dynamic import ve XP request dedupe sınırları korunur.
- Motifler CSS tabanlıdır; resim, canvas, timer veya loop animasyonu kullanmaz.
- Server component kendi `/api` route'una HTTP isteği atmaz.

## Sonraki migration planı

P3.1 Feed, Öneriler, Bildirimler, Kullanıcı Ara, İlerleme ve profil alt modüllerini ortak dile taşıdı. P4, Dashboard/Kütüphane composition ve domain sınırlarını görsel redesign yapmadan ayırdı. P5A widget görünürlüğü/sırasını, P5B ise chart palette ile ortak density/effects tokenlarını bağladı. Feature veri akışı, selector, command ve lazy-loading kuralları için [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md); preference ayrımları için [PERSONALIZATION_ARCHITECTURE.md](./PERSONALIZATION_ARCHITECTURE.md) belgesine bakın.
