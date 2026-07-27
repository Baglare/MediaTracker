# Frontend Architecture

## Amaç ve feature sınırları

P4, `app/page.tsx` dosyasını uygulamanın bütün işlerini yapan bir client component olmaktan çıkarıp composition root hâline getirir. URL tab çözümleme, ortak local library controller'ı, feature seçimi, modal host ve Right Rail bağlantısı bu kökte kalır. Görsel tasarım, local-first veri davranışı ve `/?tab=` URL sözleşmesi değişmez.

Feature sınırları:

- `features/dashboard`: Dashboard ve aktivite sunumu. Dashboard widget kimlikleri sabittir; P5 görünürlük/sıra adapter'ı bu kimlikleri kullanabilir.
- `features/library`: Saf filtre/group/sort selector'ları, kişisel kütüphane read modelleri, library presentation, medya command'ları ve tek overlay host.
- `features/discovery`: Dış kaynak veri dönüşümleri, TVmaze cache/related-part çözümü, global ve kaynak bazlı arama sunumu.
- `features/calendar`: Takvim read modeli ve sunumu.
- `features/settings`: Appearance, auth, cloud sync ve local veri araçlarının ayar kompozisyonu.

Shared `components/ui`, `components/app-shell`, `lib/personalization`, `lib/storage` ve domain tiplerinin mevcut sorumlulukları korunur. Feature'lar birbirlerinin internal state'ine erişmez; ihtiyaç duyulan dar tipler ve callback'ler composition root üzerinden bağlanır.

## Composition root

`app/page.tsx`:

1. `useSearchParams` ve `parseDashboardTab` ile aktif internal tabı çözer.
2. `useMediaLibrary` ile tek local-first source state'i alır.
3. `useMediaCommands`, `useLibraryViewModel` ve `useDiscoveryController` sınırlarını bağlar.
4. Aktif feature'ı seçer.
5. `MediaCommandHost` ve gerektiğinde `RightRail` render eder.

Sayfa içinde doğrudan `localStorage`, `/api` fetch'i, filtre/group algoritması veya modal markup'ı bulunmaz. AppShell root layout'ta kalıcıdır; feature geçişleri ikinci shell üretmez.

## Media identity domain sınırı

`MediaItem.id` local record kimliğidir; UI selection, edit/delete, grup üyeliği ve `ProgressLog.mediaId` bu değeri kullanır. `MediaItem.identity` ise `lib/media-identity.ts` tarafından üretilen ve doğrulanan Canonical Media Identity V2'dir. Component'ler source/namespace key string'i üretmez; manual/discovery/cloud/import kayıtları codec ve identity helper sınırından geçer.

XP ve social remote sözleşmeleri D1C.1'de legacy canonical key'i korur. Local recommendation lookup V2 ve owner-scoped compatibility alias registry ile dual-read yapabilir. Identity değişikliği record ID ilişkilerini, cloud tablo kolonlarını veya remote idempotency key'lerini sessizce değiştiremez. Ayrıntılar [CANONICAL_MEDIA_IDENTITY.md](./CANONICAL_MEDIA_IDENTITY.md) belgesindedir.

Duplicate adaylığı `lib/duplicate-scanner.ts` içindeki saf ve local-only domain
sınırıdır. Component'ler title normalization, confidence veya alias bridge
üretmez. `hooks/use-duplicate-review.ts` aktif owner hydration/generation
kontrolünü ve versioned karar registry'sini koordine eder;
`components/duplicate-review-panel.tsx` yalnız güvenli özetleri gösterir.
Scanner media/log/alias state'ini değiştiremez ve XP/social/cloud side-effect
üretemez.

D1C.2B merge sınırı `lib/duplicate-merge.ts` içindedir: kullanıcı kontrollü
planlama, güncel-state doğrulaması, multi-domain journal, rollback/recovery ve
bounded undo burada koordine edilir. UI raw storage key veya remote mutation
bilmez; durable cloud queue yalnız local domain yazıları doğrulandıktan sonra
hazırlanır. `lib/media-identity-aliases.ts` mantıksal identity alias'larını,
`lib/media-record-redirects.ts` ise local record ID redirect'lerini ayrı tutar.
Ayrıntılar [DUPLICATE_MERGE_AND_RECOVERY.md](./DUPLICATE_MERGE_AND_RECOVERY.md)
belgesindedir.

D1D.1 integrity sınırı `lib/local-data-integrity.ts` içindeki saf scanner ve
salt-okunur storage inspector'larıdır. Settings paneli codec, registry veya
queue formatını yeniden yorumlamaz; owner generation doğrulaması geçmiş
hesabın raporunu maskeler. Scanner hiçbir domain state'i değiştirmez ve
repair/network side-effect üretmez. Ayrıntılar
[LOCAL_DATA_INTEGRITY_SCANNER.md](./LOCAL_DATA_INTEGRITY_SCANNER.md)
belgesindedir.

## Library data flow

```text
storage adapters
  -> useMediaLibrary (source state + local-first mutations)
  -> pure selectors/read models
  -> feature components
  -> user command
  -> useMediaCommands / useMediaLibrary
  -> persistence + XP/social/cloud outboxes
```

`useMediaLibrary` media listesi ve progress loglarının sahibi olmaya devam eder. Local persistence, XP outbox, social outbox ve sync-manager side effect'leri burada bulunur. UI bu adapter ayrıntılarını bilmez.

## Derived selectors

`features/library/domain/selectors.ts` arama, dünya, tür, durum, sort, grouping ve devam edilenler read modelini hesaplar. `personal-selectors.ts` favori, planlanan, ilerleme, puan, not ve istatistik görünümlerini üretir. `features/calendar/domain/selectors.ts` takvim gruplamasını üretir.

Selector sözleşmesi:

- input'u mutate etmez;
- React import etmez;
- storage veya network çağrısı yapmaz;
- state setter çalıştırmaz;
- aynı input için aynı domain sonucunu üretir.

## Commands ve modal orchestration

`useMediaCommands` add, edit, detail, quick-add, group ve confirm durumlarını tek `MediaOverlayState` union'ında tutar. Böylece aynı anda çakışan birden çok modal state'i oluşmaz. `MediaCommandHost` yalnız aktif overlay'i render eder ve büyük editor/modal bileşenlerini dynamic import eder.

Command hook domain mutationlarını `useMediaLibrary` API'sine delege eder. Modal component'leri persistence, XP veya social outbox bilmez. Grup değişiklikleri önce `applyManualGroupAction` ile saf hesaplanır, ardından tek commit ile uygulanır.

## Persistence ve side effect'ler

- `lib/storage` versioned media/progress envelope adapter'ını dışa açar; runtime codec, dual-read migration, quarantine ve current/temp/backup protokolü domain storage katmanında kalır.
- `useMediaLibrary` tipli hydration durumunu korur ve mutation'larda önce doğrulanmış local snapshot'ı, sonra XP/social/cloud side effect'lerini uygular.
- Discovery network çağrıları yalnız `useDiscoveryController` ve mevcut search component'lerinde kalır.
- Browser online listener'ları sahip oldukları hook içinde kurulup temizlenir.
- Selector ve presentation component'leri side effect üretmez.

Local storage write başarısızsa mutation React source state'e kabul edilmez ve hiçbir cloud/XP/social işi üretilmez. Outbox hatası ise doğrulanmış local mutation'ı geri almaz. Aynı mutation için persistence/outbox sorumluluğu ikinci bir feature hook'unda çoğaltılmaz. Ayrıntılı format ve recovery sözleşmesi [LOCAL_DATA_FORMAT_AND_RECOVERY.md](./LOCAL_DATA_FORMAT_AND_RECOVERY.md) belgesindedir.

## Server/client sınırı ve performans

Ana ekran local-first ve interaktif olduğu için composition root client component'tir. Buna rağmen Settings, Discovery, Calendar, kişisel library görünümleri, AI Advisor ve medya modal/editörleri aktif olana kadar dynamic import ile bekler. Dashboard ilk yüklemede Settings veya modal editör kodunu doğrudan import etmez.

Bu sınırlar:

- kalıcı AppShell'i değiştirmez;
- profil hero-first/editor lazy loading davranışına dokunmaz;
- server component'in kendi API route'una fetch atmasına yol açmaz;
- kart başına yeni profile/auth isteği oluşturmaz.

Statik import testleri bundle benchmark veya ölçülmüş hız iddiası değildir.

## Tema ve P6 extensibility

Feature component'leri tema kimliği switch'i taşımaz; `--app-*` ve `--w-*` semantic tokenlarını tüketir. Base theme ve world registry source of truth olmaya devam eder. Bu nedenle yeni hazır tema veya doğrulanmış custom token seti eklemek feature component değişikliği gerektirmemelidir.

P4, RGB/HEX seçici, custom theme UI, Tozpembe veya Orman teması eklemez. P6 kontrast denetimi registry/token katmanına eklenebilir.

## P5A widget composition ve görünürlük

Dashboard'un gerçek sunum bölümleri ve Right Rail widget'ları `lib/personalization/widget-registry.ts` içindeki stable domain kimlikleriyle tanımlanır. `useLayoutPreferences` yalnız versioned layout hydration, visibility, reorder ve reset işlemlerini yönetir; medya selector'ı, Supabase, tema, chart palette, density veya effects bilmez. `app/page.tsx` dar preference listelerini ilgili feature'a geçirir; component render eşlemesi registry'nin domain metadata'sına gömülmez.

Dashboard görünür widget'ları ortak responsive grid içinde preference sırasıyla yerleştirir; feature config'teki desktop span bilgisi persistence alanı değildir. Sağ panel aynı modelin `rightRail` yüzeyini tüketir ve dünya scope selector'larını korur. Görünür widget kalmazsa kontrollü özelleştirme durumu gösterilir. Eski Right Rail storage modeli yalnız migration adapter'ı olarak kalır; yeni UI ikinci bir preference kaynağı yazmaz.

Bu sınır P5B'deki chart/density/effects alanlarının ve P6'daki custom theme registry'sinin layout sırası ile birleşmesini engeller. Widget kimlikleri tema adı veya component export adı değildir.

## Test stratejisi

- Saf selector testleri arama, dünya, durum, sort, grouping ve continue davranışını kilitler.
- Command testleri tek overlay ve grup mutation güvenliğini karakterize eder.
- Statik mimari sözleşmeler composition root'un storage/network/modal ayrıntılarını taşımadığını kontrol eder.
- Mevcut navigasyon, AppShell, tema, profil, social, XP ve sync testleri regresyon katmanı olarak korunur.

Statik mimari kontroller runtime performans ölçümü veya tarayıcı görsel regresyon testi değildir.

## Bilinçli sınırlamalar

- Internal tab URL'leri route'a çevrilmemiştir.
- `useMediaLibrary` mevcut local-first domain controller'ı olarak korunmuştur; yeni repository/command bus/factory sistemi kurulmamıştır.
- Dashboard ve MediaCard görsel olarak yeniden tasarlanmamıştır.
- Chart palette, density/effects ve custom theme UI kapsam dışıdır; widget görünürlük ve sırası P5A ile eklenmiştir.
- Bu tur DB migration, dependency, remote işlem veya cloud veri modeli değişikliği içermez.

İlgili belgeler: [PAGE_DESIGN_SYSTEM.md](./PAGE_DESIGN_SYSTEM.md) ve [PERSONALIZATION_ARCHITECTURE.md](./PERSONALIZATION_ARCHITECTURE.md).
