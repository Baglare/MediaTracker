# Native V1 — Provider, KVKK ve retention kaynak kapanışı

2026-10-09. `CURRENT_SOURCE_FACT` / `SOURCE_READY`; hukuki onay veya Production kabulü değildir.
Başlangıç: `release/v1-hardening`, temiz çalışma ağacı, HEAD `2a922a7889e115e7e93b47aa319fe3845c9e108a`.
Bu kayıt native ilk sürüm için güncel alan sözleşmesidir. Tek ana hold tablosu
[06E](V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md) olarak kalır. 05A/05B/05D/05E'nin
tarihli Supabase/Vercel envanteri ve test sonuçları tarihsel/fallback kanıtıdır;
native hedefin aktif alıcılarını veya canlı kabulünü tek başına tanımlamaz.

## 1. Kesinleşmiş ilk sürüm ürün/teknik politikaları

### API sağlayıcıları

| Sağlayıcı | Native V1 kararı | Kaynak sınırı / ayrı kabul |
| --- | --- | --- |
| TVMaze | Mevcut attribution ve distributed rate limiting ile etkin kalır | `lib/providers/release-policy.ts`; search/details/Calendar uçları ve attribution testleri korunur. Lisans yorumu ve alıcı/aktarım değerlendirmesi manuel kalır |
| Open Library | Yalnız geçerli `MEDIA_TRACKER_PROVIDER_USER_AGENT` ile teknik olarak açılabilir | `lib/api/provider-identity.ts` tam `MediaTracker/<sürüm> (<e-posta>)` biçimini doğrular. Bu kontrol mailbox sahipliği, uygulama kaydı veya kullanım uygunluğu onayı değildir |
| AniList / TMDB / OMDb yeni public API | Kapalı | AniList/TMDB env ile açılamaz; OMDb yeni araması kapalı, eski kayıtlar korunur. Yeni etkinleştirme `POST_RELEASE_GATE` |
| Ücretli AI / araştırma / kalıcı embedding cache | Kapalı | Mevcut disabled/off release sözleşmesi korunur; deterministik öneri işlemi seçilen bağlamı uygulama sunucusunda işleyebilir |

TVMaze API verisi CC BY-SA koşullarına tabidir; uygulamada TVMaze'a güvenli kaynak
bağlantıları bulunur. Arama, ayrıntı, kayıtlı medya, Calendar, public profil ve
portable v3 provenance kapsamı `tests/v1-tvmaze-attribution.test.ts` ile korunur.
Attribution testi ShareAlike hukuki kabulü değildir. Yerel/Cloud'a kaydedilen veya
normalize edilen katalog verisi, sezonlara bölünmüş/türetilmiş metadata, başka
kataloglarla birleşim, public profil projeksiyonları ve kullanıcıya verilen
portable/hesap export'ları için hangi paylaşımın uyarlama/veritabanı dağıtımı
sayıldığı, hangi materyale aynı lisansın uygulanacağı ve bildirim kapsamı ayrıca
yorumlanmalıdır. Bu değerlendirme bütün uygulama kodunun otomatik olarak aynı
lisansa girdiği ya da tek kaynak linkinin her kullanım için yeterli olduğu iddiası
kurmaz. Mevcut endpoint veya attribution davranışı değiştirilmez.
[Resmî TVMaze API, Licensing/Rate limiting/Images](https://www.tvmaze.com/api).

Open Library insan tarafından tetiklenen kitap keşfi içindir; toplu veri backend'i
ve yüksek trafikli ticari altyapı kullanımı uygunluk incelemesi gerektirir. Resmî
sayfa uygulama/use-case kaydı, tanımlayıcı User-Agent/e-posta ve cache kullanımını
ister. Mevcut bounded search, beş dakikalık process cache ve limiter korunur;
otomatik Work enrichment eklenmez. **Açık kayıt ve manuel kullanım uygunluğu
kanıtı olmadan Production'da Open Library etkinleştirmesi önerilmez.** Native
release env'de geçerli UA verilmesi teknik olarak API'yi açtığından bu değer ancak
bu kapılar kapanırsa seçilmelidir; aksi halde UA unset bırakılarak mevcut gate ile
Open Library kapalı tutulur. TVMaze UA olmadan da capability olarak etkindir.
Yeni onay env'i veya ikinci bir policy sistemi eklenmez.
[Resmî Open Library API, Registering Your Application/Usage Guidelines](https://openlibrary.org/developers/api).

### Native veri akışı ve alıcı matrisi

Bu matris `BACKEND_PROVIDER=native` hedefini anlatır; Production cutover yapılmış
değildir. Better Auth bir sunucu kütüphanesi, Plesk/Passenger çalışma katmanlarıdır;
isimleri ayrı bir SaaS alıcısına otomatik veri aktarımı kanıtı değildir. Alıcıların
veri işleyen/veri sorumlusu rolleri sözleşme ve hukuk incelemesi gerektirir.
**Bu çalışmada hiçbir alıcı için hesap/işlem bazlı ülke veya region doğrulanmadı.**
Alan adı, loopback DB adresi ve TürkHosting markası Türkiye içinde işleme kanıtı
değildir. Aşağıdaki UNKNOWN değerleri hukuka aykırılık hükmü de değildir.

| Alıcı / işleme katmanı | Veri türü ve aktarım yönü | Amaç | Varsayılan etkinlik / tetikleyici | Kanıtlanmış ülke/region | Eksik hukuki/operasyonel kanıt |
| --- | --- | --- | --- | --- | --- |
| Better Auth + native PostgreSQL | Tarayıcı → aynı-origin Auth → `native_auth`: e-posta, UUID, şifre işlemesi/özeti, session/token/expiry, UA; şema IP alanı içerir, gerçek dolumu ingress kabulüne bağlıdır. Sunucu → `app`: profil, seçilen Cloud medya/not/ilerleme/hedef, sosyal/XP/tema, limiter takma adlı özet/receipt | Giriş/oturum, kullanıcı eylemleri, eşitleme ve güvenlik | Native seçilmiş hedefte mevcut sign-in; public signup kapalı. Cloud opt-in; sosyal/profil kullanıma bağlı. Better Auth ayrı hosted servis olarak çağrılmaz | UNKNOWN; `127.0.0.1` ülke bilgisi değildir | DB TLS/roller/RLS/Auth/concurrency canlı kabulü; veri merkezi/DB/DR lokasyonu, erişim rolleri, işleme dayanakları ve sözleşme |
| TürkHosting / Plesk / Passenger ve ağ/log altyapısı | Tarayıcı → sunucu: IP/header/cookie, route, sorgu, yükleme/sosyal girdisi ve deterministik öneri bağlamı; sunucu → DB/dosya/API | Uygulama barındırma ve istek işleme | Native hedefte sayfa/API ziyaretleri; deployment henüz kabul edilmedi | UNKNOWN; önceki kullanıcı bildirimli probe ve kapasite gözlemleri region ispatlamaz | Asıl alıcı/alt işleyen, veri merkezi ve uzaktan destek lokasyonu, sözleşme, platform log alanları/erişim/süreler; trusted ingress ve kaynak kapasitesi kabulü |
| Özel dosya depolaması | Sunucu → `NATIVE_STORAGE_ROOT`: yeniden kodlanan avatar/banner, owner path, geçici dosya; DB'de intent/current reference. Yetkili sunucu → tarayıcı teslimi | Profil dosyası saklama/gösterme | Yükleme/değiştirme/silme eylemleri; public mount yok, aynı-origin erişim denetimi var | UNKNOWN; root izolasyonu/restart probe'u coğrafya kanıtı değildir | Gerçek permissions, crash/cleanup kabulü, yetkili erişim, fiziksel silme ve hosting sözleşmesi |
| PostgreSQL + özel dosya backup/DR alıcıları | DB/Auth/uygulama kayıtları ve dosyalar → operatör/hosting yedek hedefi; restore → karantinadaki hedef | Kurtarma | Operasyonel; Plesk seçenekleri incelenmiş, gerçek kapsam/otomatik job burada doğrulanmamış | UNKNOWN; ana sunucu ile yedek aynı lokasyonda varsayılmaz | DB ve dosya birlikte tutarlılık, şifreleme/anahtar/erişim, bağımsız hedef/alt işleyen, retention/rotation, restore provası ve silinen hesap uzlaştırması |
| Gmail / yetkili operatör | Başvuran → mailbox: gönderen/e-posta, konu/metin/ekler, gerekli kimlik doğrulama; operatör → başvuran: yanıt/gerekli export | Destek ve ilgili kişi talebi | Kullanıcı e-posta gönderirse; uygulama arka planda Gmail'a veri göndermez, Auth e-posta servisi olarak yapılandırılmış değildir | UNKNOWN; posta depolama/backup/destek lokasyonu kanıtı yok | Kullanıcı erişim/MFA/alma/yanıtlama doğruladı; kalan: yetkili/yedek handler, güvenli export, süre takibi, attachment minimizasyonu, retention/legal hold, Google alıcı/aktarım kanıtı |
| TVMaze API | Sunucu → API: sorgu/show kimliği, egress IP ve varsa operatör UA; API → sunucu: katalog/Calendar metadata. Browser-user IP header'ı kaynakta upstream'e iletilmez | Arama/ayrıntı/takvim | Etkin; kullanıcı/Calendar işlemleri. Özel kütüphane ve notlar ordinary lookup payload'ı değildir | UNKNOWN; API hostu depolama/log/alt işleyen region'u kanıtlamaz | Lisans/ShareAlike kullanım yorumu, alıcı rolü, log/region koşulları ve kişisel veri aktarımı kapsamına göre madde 9 kararı |
| Koşullu Open Library API | Sunucu → API: sorgu, UA'daki operatör e-postası ve egress metadata; API → sunucu: kitap metadata | İnsan odaklı katalog araması | UA teknik gate + yukarıdaki manuel release kabulü; kanıt yoksa Production önerisi kapalı | UNKNOWN | Use-case kayıt kanıtı, kullanım uygunluğu kararı; alıcı/region/log ve uygulanabilir madde 9 kanıtı |
| Tarayıcıdan doğrudan kapak/CDN alıcıları | Tarayıcı → `static.tvmaze.com`, `covers.openlibrary.org`, eski kayıtlar için `image.tmdb.org`, `s4.anilist.co`, `m.media-amazon.com`, `ia.media-imdb.com`: IP, UA, zaman, görsel yolu ve referrer politikasına göre origin | Seçilen/yüklenen yüzeyde görsel gösterme | İlgili görsel render'ında otomatik; metadata API kapalı olsa da eski kapaklar çağrılabilir. Host listesi izin/kaynak envanteri, her hostun her kullanıcıda çağrıldığı iddiası değildir | UNKNOWN; CDN edge/log/backup region'u kanıtlanmadı | Her kullanılan host için gerçek rol/koşul/region/log ve aktarım değerlendirmesi; uygulama proxy'sinden geçiyor varsayılmamalı |
| Tarayıcı ve kullanıcı indirmeleri | Girdi/import → owner-scoped localStorage/sessionStorage/cookie: medya/not/ilerleme/hedef, tercihler/tema, AI oturumu/feedback, kuyruk/cache/recovery; export → kullanıcının dosyası | Yerel takip/tercih ve kurtarma | Guest/local-first mevcut; salt yerel içerik kendiliğinden Cloud'a yüklenmez. Sunucu önerisi, görsel ve kullanıcı tarafından açılan Cloud ayrı akışlardır | Cihaz ülkesine dair kanıt yok; salt cihaz saklaması ayrı harici backend alıcısı değildir | Kullanıcının browser sync/cihaz backup kopyaları; kontrol kapsamı ve cihaz verisi/indirilen kopya silme sınırları |
| Profil ziyaretçileri / sosyal katılımcılar | Yetkili görünürlük projeksiyonu → diğer kullanıcı tarayıcısı: public profil/tema/istatistik, izinli sosyal içerik ve mesajlar | İstenen yayın ve sosyal etkileşim | Görünürlük/ilişki/katılım koşullarıyla | UNKNOWN; alıcı cihazları belirlenmemiştir | Diğer katılımcının bağımsız içeriği/aldığı kopyalar için hak ve silme politikası; blanket cross-owner silme yok |

Native normal Auth/DB/limiter/asset yolları Supabase SDK/Storage/Vault transport'u
kurmaz; fallback adapter'ları kaynakta korunur. Supabase Auth/Postgres/Storage ve
Vercel runtime native Production'ın aktif alıcısı diye listelenmez. Supabase
seçilmiş ayrı deployment ve önceki hesap/log/backup kopyaları için 05A/05B/05E
sözleşmesi hâlâ geçerlidir; native geçiş bunları silmiş sayılmaz. Vercel'e erişim
olmadığı da eski deployment geçmişi bakımından iddia edilmez. Native env'de
Supabase/Vercel runtime config yasağı mevcut runbook'ta korunur. Supabase signed
URL'nin 300 saniyelik geçerliliği native dosya teslim TTL'i değildir.

### Saklama ve silme politikası

[05D teknik sınıfları ve cleanup modeli](V1_HARDENING_05D_RETENTION_AND_CLEANUP.md)
korunur. Oradaki 53-entry inventory tarihli Supabase machine inventory'sidir;
native Auth/asset tablolarının aynı sayıya dahil olduğu iddia edilmez.
`ACCOUNT_LIFETIME` amaç/teknik sınıftır; onaylanmış yasal süre değildir.

| Alan | Mevcut sınıf / teknik davranış | Silme sınırı ve eksik politika |
| --- | --- | --- |
| Hesap ve kullanıcı içerikleri | ACCOUNT_LIFETIME / USER_CONTROLLED; Better Auth user/account/session/verification ve uygulama profil/medya/ilerleme/not/hedef/tema | Yaşa göre purge yok. Native lifecycle yazıları kilitler, session revoke, uygulama/participant/XP/dosya residual kontrolünden sonra Auth-last; canlı rol/concurrency/final silme kanıtı açık |
| Cloud tombstone / operation / idempotency | ACCOUNT_LIFETIME; CAS/revision/replay kimliği ve silindi işareti korunur | Sonlu güvenli offline replay ufku kanıtlanmadı; genel yaş purge'u yok. Mantıksal silme fiziksel DELETE değildir; yedek/eski client geri getirme riski ayrı |
| XP ve sosyal veriler | ACCOUNT_LIFETIME; rapor/uyuşmazlık için LEGAL_HOLD_OR_REVIEW; immutable/dedupe semantiği | Onaylı lifecycle DELETE/DETACH/ANONYMIZE/RETAIN_NON_IDENTIFYING politikasını kullanır; başka katılımcının bağımsız cevabı/XP'si korunur. Genel periyodik prune ve yasal gün sayısı yok |
| Güvenlik limiter kayıtları | SECURITY_TTL / SHORT_OPERATIONAL_TTL; native DB bucket/receipt expiry ve bounded cleanup | Takma adlı özet anonim sayılmaz. Sona erme fiziksel temizleme değildir. Better Auth'un ayrı database `rateLimit` tablosu `lastRequest`/count taşır; business limiter cleanup'ı onu silmez. Kurulu Auth adapter'ı başarılı window reset'te kendi expired satırlarını prune eder; trafiksiz hedefte kesin physical purge garantisi yok |
| Tarayıcı yerel verileri | USER_CONTROLLED; recovery/quarantine/import journal için LEGAL_HOLD_OR_REVIEW | Logout veri silmez; current CRUD bütün legacy/recovery/queue/cache/download kopyalarını temizlemez. TTL'li browser cache stale kalabilir |
| Gmail destek/gizlilik kayıtları | LEGAL_HOLD_OR_REVIEW / MAILBOX_RETENTION=OPERATOR_POLICY_REQUIRED | Kullanıcı erişim/MFA/alma/yanıtlama teyidi süre onayı değildir. Kimlik eki/export minimizasyonu, closure kanıtı, retention ve hukuki hold operatör tarafından belirlenmeli |
| Hosting logları | VENDOR_CONTROLLED / UNKNOWN; safe logger ayrı, hosting/proxy/network logları ayrı | Ham IP/header vendor logunda olabilir. Kaynak allowlist'i vendor log silmesini ispatlamaz; alanlar/erişim/rotation/süreler belirsiz |
| PostgreSQL ve özel dosya yedekleri | VENDOR_CONTROLLED / UNKNOWN; mevcut native recovery planı, frozen restore ve postcheck | Plesk seçenek incelemesi gerçek backup veya restore kabulü değildir. Account erase tüm backup/DR kopyalarından kaldırma değildir; dönem/erişim/son kopya expiry ve restore'da silinmiş hesap reconciliation ayrıca onaylanmalı |
| Harici API/CDN kayıtları | VENDOR_CONTROLLED / UNKNOWN | Process cache expiry veya app account erase upstream log/CDN/diğer alıcı kopyalarını silmez; alıcı koşulları ve hak talebi kapsamı ayrı |

Kaynakta doğrulanan süreler (yeni yasal süre veya otomatik kullanıcı purge'u değildir):

| Kaynak | Gerçek süre / sınır | Anlamı ve fiziksel silme farkı |
| --- | --- | --- |
| `lib/api/openlibrary-search-cache.ts` | 5 dakika; en çok 64 entry | Process cache kullanılabilirliği; expired entry okumada, kapasite eviction yazmada kalkar. Query hash'i gizlilik/anonymization garantisi değildir |
| `features/calendar/data/release-cache.ts` | 12 saat | Browser release cache stale eşiği; 90 günlük provider horizon retention değildir |
| `lib/social/own-profile-cache.ts` | 4 dakika | Memory/session snapshot geçerliliği; okunmayan session key anında temizlenmeyebilir |
| `lib/social/server.ts` | Signed URL 300 saniye; cache 240.000 ms, max 256 | Supabase fallback contract; native aynı-origin dosya route'u bearer URL değildir, her teslim live reference/visibility denetiminden geçer; binary silme süresi değil |
| `lib/personalization/appearance-cookie.ts` | Max-Age 31.536.000 saniye | Yenilenebilen görünüm cookie süresi; localStorage/tema/hesap/backup silme süresi değil |
| `lib/auth/native-options.ts` + kurulu Better Auth 1.7.7 `dist/context/create-context.mjs`, `dist/api/routes/session.mjs` | Override edilmeyen session expiry 604.800 saniye (7 gün); updateAge 86.400 saniye; cookieCache kapalı, deferSessionRefresh açık | Auth session geçerliliği/yenileme; `native_auth.session.expiresAt` var. Expired session get-session POST işleminde silinebilir; GET bu defer ayarında fiziksel silmez. Tüm okunmayan session/verification kayıtları için scheduler/purge garantisi değil |
| Aynı Better Auth context / native options + `dist/api/rate-limiter/index.mjs` | Default rate-limit window 10 saniye, max 100; database storage | Flow-specific kurallar farklı olabilir. Başarılı eski-window reset'te longest configured/observed window öncesi `lastRequest` satırları silinir; traffic-driven prune kesin maksimum retention değildir |
| `lib/api/rate-limit-identity.ts`, `lib/api/distributed-rate-limit.ts` | Identity epoch 86.400 saniye, önceki epoch ilk 60 saniye; envelope max 10 saniye | Identity dönüşümü/signed request freshness; kullanıcı kaydı veya bucket physical retention değil |
| `database/native/006_distributed_limiter.sql` | Receipt 60 saniye; bucket 16 dakika; quota window 60 saniye | Expiry/replay/quota semantiği; bucket pencere yenilenirken expiry yenilenir |
| Aynı native SQL `cleanup_v1` / `scripts/native-maintenance.mjs` | Paylaşılan batch max 500; bir sonraki cleanup eligibility +1 dakika | Traffic-driven veya açık operator job fiziksel DELETE; quiet target/backlog expired satır bırakabilir. Cron scheduler probe PASS, gerçek bakım job'u NOT_RUN; yeni job kurulmadı |
| `database/native/007_filesystem_assets.sql`, `009_deployment_operations.sql`, `scripts/native-maintenance.mjs` | Staging/unreferenced intent için 1 saat güvenlik lease'i; temp mtime 1 saat eşiği, durable DB intent recheck; scan/candidate batch 500 | Geç upload IO ile yarışmayı önler. `cleanup` durumundaki eski asset ayrı eligible; bu bir saat aktif avatar/banner saklama süresi veya kesin orphan purge deadline'ı değildir |

Auth verification/account token expiry kolonları tek bir genel retention süresi
tanımlamaz. Username reservation, sosyal abuse pencereleri ve cooldown zamanları
da kayıt silme süresi değildir. Yasal onayı olmayan alanlara 30/90/180 günlük süre
atanmadı; yeni migration, purge job veya otomatik hesap/içerik silme eklenmedi.

## 2. Mevcut kanıtla kapatılabilen kaynak/dokümantasyon işleri

- `NATIVE_V1_PROVIDER_POLICY_SOURCE = CLOSED`: TVMaze enabled, Open Library teknik
  UA gate ile manuel kayıt/uygunluk ayrımı, disabled API/AI ve legacy CDN ayrımı açık.
- `NATIVE_V1_PRIVACY_DATA_FLOW_SOURCE = CLOSED`: native Auth/DB/hosting/dosya/backup,
  Gmail/API/browser/CDN akışları, ülke UNKNOWN ve kanıt boşlukları ayrıştırıldı.
- `NATIVE_V1_RETENTION_TECHNICAL_SOURCE = CLOSED`: 05D modeli korundu; native Auth,
  limiter/dosya ve fallback signed URL farkları ile gerçek TTL'ler kaydedildi.
- 06E master tablosu native applicability ve kullanıcı bildirimli mailbox teyidiyle
  düzeltildi; 05E tarihli tablosu native güncel matrise yönlendirildi; native hosting
  runbook'undaki UA satırı tek başına Production enablement önerisi olmaktan çıkarıldı.
- `app/privacy/page.tsx` native/Supabase seçimini zaten yapar; doğrudan CDN,
  bilinmeyen region/log/backup süreleri ve henüz tamamlanmamış Production geçişini
  doğru ayırır. Somut yanlışlık bulunmadığından public sayfa/kod/testler değiştirilmedi.

Kanıt: [05A](V1_HARDENING_05A_PRIVACY_DATA_MAP.md),
[05B](V1_HARDENING_05B_PRIVACY_NOTICE_AND_REQUESTS.md),
[05D](V1_HARDENING_05D_RETENTION_AND_CLEANUP.md),
[05E](V1_HARDENING_05E_PRIVACY_RELEASE_GATE.md),
[P1](NATIVE_BACKEND_P1_FOUNDATION.md), [P2/P2B](NATIVE_BACKEND_P2_MIGRATION.md),
[P3](NATIVE_BACKEND_P3_DEPLOYMENT.md), [P4](NATIVE_BACKEND_P4_HOSTING_PROOF.md),
[native runbook](NATIVE_HOSTING_DEPLOYMENT_RUNBOOK.md), public privacy sayfası ve
yukarıdaki kaynak dosyaları. P1'in deferred listesi fazın tarihli durumudur; P2B
source completion onu native domain implementation açısından ilerletmiştir.
P4 ingress source incelemesi/regresyon tamamlanması host proxy tuple'ının canlı
kabulü anlamına gelmez. Mailbox erişim/MFA/alma/yanıt teyidi bu görevdeki kullanıcı
beyanıdır; Codex mailbox/hosting hesabına girmedi. Plesk seçenek/kapasite incelemesi
tekrar edilmedi. TürkHosting destek talepleri gönderilmiş, DB/ingress yanıtı bekleniyor.

Doğrulama: mevcut hedefli provider/attribution/privacy testleri, synthetic retention
ve native privacy/env testleri ile yerel doküman link/contract/whitespace kontrolleri.
Çalıştırılan sonuçlar görev raporunda ve aşağıdaki validation kaydında ayrıdır;
tarihsel test/CI sonuçları değiştirilmez. Bu üç konunun **kaynak hazırlığı tamamdır**;
`PRODUCTION_READY` veya hukuk onayı verilmez.

2026-10-09 yerel validation kaydı:

- PASS: mevcut Vitest seçimi — `v1-tvmaze-attribution`, `v1-openlibrary`,
  `d8-discovery-provider-release-policy`, `v1-hardening-05b-privacy-notice`,
  `d8-privacy-route`: 5 dosya / 155 test; 0 fail/skip.
- PASS: mevcut Node seçimi — `privacy-retention-ops`, `native-privacy-ops`,
  `native-release-policy`: 15 test; 0 fail/skip. Synthetic/source kanıtıdır.
- PASS: dört değişen belgenin yerel link/hygiene/whitespace kontrolleri ve
  `git diff --check`; yeni belgenin üç bölüm yapısı, 05E tarihsel tablolarının ve
  06E tarihsel validation metninin byte-content karşılaştırması (newline normalize).
- Her iki test seçimi mevcut `scripts/ci-offline.mjs` preload'u ile dış ağ kapalı
  yürütüldü. İlk Vitest denemesi sandbox temp rename EPERM nedeniyle test toplamadan
  durdu; workspace içindeki ignored temp ile aynı testler/assertion'lar PASS oldu.
- Kod değişmedi: typecheck/lint, full suite/build/browser/E2E NOT_RUN. DB/Auth/RLS,
  ingress, backup/restore ve gerçek silme LIVE_UNVERIFIED; bu görevde çalıştırılmadı.

## 3. Manuel hukuk, tedarikçi veya canlı altyapı kanıtı isteyen işler

Bu liste 06E hold satırlarının kapanış kanıtını açıklar; ikinci master status tablosu
değildir. Tamamlanmış source/test işleri tekrar uygulama görevi değildir.

1. TVMaze için yukarıdaki kaydetme/dönüştürme/yayın/export kullanımlarına ilişkin
   ShareAlike kapsamı ve attribution yeterliliği hukuk/operatör kararı.
2. Open Library etkinleştirilecekse use-case kayıt kaydı ve manuel uygunluk kararı;
   aksi halde mevcut UA gate ile Production kapalı kararı. Geçerli e-posta veya
   geçmiş Preview araması bu kanıtların yerine geçmez; başvuru yapılmadı.
3. Gerçek veri sorumlusu bilgileri, amaç bazında işleme/hukuki dayanak ve madde 10
   metni onayı; alıcı rolleri, sözleşmeler, asıl/backup/log/destek region'ları ve alt
   işleyen kanıtları. **Türkiye içinde işleme veya onaylanmış dayanak iddiası yok.**
4. Aktif Gmail/API/CDN ve gerekirse hosting/backup akışları için kişisel veri ve
   yurt dışı aktarım kapsamını belirleyen alıcı bazlı madde 9 kararı, uygulanabilir
   mekanizmanın somut kanıtı/formal işlem kaydı. Olağan hizmet akışı otomatik arızi
   sayılmaz; DPA veya EU SCC tek başına Türk madde 9 kabulü değildir.
   [KVKK yurt dışı aktarım açıklaması](https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim).
5. VERBİS için gerçek operatörün faaliyet/çalışan/mali bilanço bilgileri ve geçerli
   istisna/kayıt kararı. Resmî kriterlerin varlığı MediaTracker'ın muafiyet kanıtı
   değildir; kullanıcı verisi veya operatör finansal kaydı incelenmedi.
   [KVKK VERBİS istisna duyurusu](https://www.kvkk.gov.tr/Icerik/8388/KAMUOYU-DUYURUSU).
6. Hesap/içerik/sosyal rapor, mailbox/ek/export, hosting log ve DB/dosya yedeği için
   amaca uygun süre, hold, erişim, physical deletion ve backup son kopya sınırının
   operatör/hukuk onayı; silinmiş hesap restore reconciliation kabulü. Mevcut
   replay/immutability engelleri yasal süre kararıyla atlanamaz.
7. PostgreSQL TLS/rol ve trusted ingress destek yanıtları sonrası: yanıtı doğrulanmış
   config/target kabulüne dönüştürme; native DB/RLS/Better Auth/concurrency/privacy,
   gerçek bakım/limiter ve dosya cleanup, DB+dosya backup/restore provası, hosted
   signup deny/env/kapasite ve bounded smoke kanıtı. Bir destek yanıtı bunları PASS
   yapmaz; Supabase GoTrue/Storage/Advisor eski hedef için kalır, native kabul yerine
   koşulmaz. Native grants/RLS/function/search_path karşılığı ayrıca doğrulanır.
8. Ardından clean committed SHA/CI/artifact, kesin Production hedefi/env, gerçek
   kullanıcı/şifre/asset migration planı, backup/change window/rollback ve ayrı P5
   cutover yetkisi. Kaynak kapanışı bu işlemleri yetkilendirmez.

Bu çalışmada gerçek kişisel veri/mailbox/hosting erişimi, DB/SSH/Plesk işlemi,
API enablement, provider kayıt/başvuru, migration/deploy/commit/push yapılmadı.
Vault read-only context `VAULT_GIT_INVALID` döndürdü; canonical veya tahmini aday
yoluna yazı/commit/push yapılmadı. Bu belge kalıcı karar kaydıdır; Vault sync yapılmış
sayılmaz.
