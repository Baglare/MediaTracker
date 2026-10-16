# Native V1 — Provider, KVKK ve retention kaynak kapanışı

## Güncel kapanış kararı — 16 Ekim 2026

Bu bölüm aşağıdaki tarihli aday değerlendirmelerinin güncel karşılığıdır; tarihsel
PASS/NOT_RUN kayıtları değişmez. Production v1.015 / SHA
`21d1f8ab14acec051a95ae84fa8b46bfbd23a60f`, migration 015, LIVE/READY 200,
maintenance=false, epoch `v1-21d1f8ab14ac` ve test hesabı silme 10/10 PASS
**OPERATOR_REPORTED** girdilerdir; bu çalışmada Production bağlantısı yapılmadı.
Auth/uygulama/Storage kalıntısının bulunmadığı bildirimi yalnız o hesaba aittir;
yedekler, Gmail, diğer kullanıcılar ve yeni aday SHA için kabul değildir.

Veri sorumlusu mevcut aydınlatmada gerçek kişi **Batuhan Parıltı**; iletişim
**mediatracker.contact@gmail.com**. Ücretsiz, reklamsız, aboneliksiz bireysel
portfolyo hizmeti olması KVKK yükümlülüklerini kaldırmaz. Better Auth/PG/Passenger
yazılımdır; ayrı bir yabancı SaaS alıcısı olarak sınıflandırılmaz. Native dağıtımda
Supabase/Vercel eski/fallback mimaridir. TürkHosting'in Türkiye, günlük yedek ve
yaklaşık dört haftalık rotasyon yazılı yanıtı kabul edilen operatör kanıtıdır;
yeniden sorulmaz, SMTP/Gmail/offsite'a genişletilmez.

### Faaliyet, amaç ve hukuki dayanak kararı

Madde 4 gereklilik/ölçülülük, madde 7 silme, madde 8/9 aktarım koşulları bütün
satırlarda ayrıca geçerlidir. Aşağıdaki kayıt uygulanabilir dayanak ve sınırını
belirler; profesyonel hukuk onayı veya tüm aktarım güvencelerinin tamamlandığı
iddiası değildir. Ücretsiz hizmette de kullanıcının talep ettiği hizmet ilişkisinin
ifası değerlendirilir; reklam, pazarlama, model eğitimi veya satış amacı yoktur.

| Faaliyet / veri | Amaç ve yöntem | Dayanak ve sınırı | Yer, alıcı ve silme koşulu |
| --- | --- | --- | --- |
| Hesap, e-posta/ad/UUID, parola özeti, oturum/doğrulama/reset | Form ve aynı-origin Auth ile hesap/giriş sağlama | 5/2(c), talep edilen hesabın ifasına gerekli alanlar; güvenlik alt amacı 5/2(f) | TürkHosting Türkiye / özel native_auth PostgreSQL; SMTP ayrı satırda. Hesap silme Auth-last; token geçerliliği fiziksel silme süresi değildir |
| Yerel medya/ilerleme/rating/favori/not/etiket/hedef/XP, recovery/queues | Kullanıcı girdisi, import, tarayıcı storage; takip ve bütünlük | 5/2(c), talep edilen yerel işlev; sunucuya hiç iletilmeyen kayıt sunucu envanterinde var sayılmaz | Kullanıcının tarayıcısı; kayıt/site verisi temizleme, indirilen export ve çevrimdışı cihaz ayrı |
| Cloud medya/hedef/operasyon/revizyon/tombstone | Kullanıcının açtığı eşitleme, çatışma ve tekrar işleme koruması | 5/2(c), istenen eşitleme; özellik açma genel açık rıza değildir | Aynı-origin sunucu/native DB; owner kontrollü erasure. Güvenli replay ufku yokken yaşa göre journal/tombstone purge yok |
| Profil/avatar/banner/tema/username/görünürlük | Form/upload ve seçilen yayın | 5/2(c), profil işlevi; 5/2(d) yalnız kişinin alenileştirme amacıyla uyumlu alanın yayını | TürkHosting native DB/özel filesystem, yetkili/görünürlük kapsamındaki ziyaretçiler; tercihle kaldırma ve hesap silme. URL expiry dosya silme değildir |
| Takip/engel/aktivite/yorum/mesaj/tavsiye/bildirim/XP/rapor | Etkileşim ve otomatik olay; sosyal hizmet/şikâyet değerlendirme | 5/2(c) hizmet; kötüye kullanım 5/2(f) dengelemesi; somut uyuşmazlık kanıtı 5/2(e) | Native DB ve yetkili katılımcılar. Katılımcı kaybı/hold incelemesi, kontrollü detach; başkasının içeriğine blanket cascade yok |
| Görünüm/tercih/tema çerezi ve opsiyonel sync | Seçilen görünümü uygulama | 5/2(c), kullanıcı tercihinin ifası; pazarlama izleme amacı yok | Çoğunlukla browser, sync varsa native DB. Çerez expiry ile tüm yerel kopyalar silinmez |
| Deterministik öneri girdisi/seçilmiş bağlam/feedback | İstek ve hesaplama, oturum sürdürme | 5/2(c), talep edilen öneriyle sınırlı | Tarayıcı ve gerektiğinde native sunucu; AI/research/kalıcı embedding kapalı. Yerel-first bütün işlemlerin cihazda kaldığı anlamına gelmez |
| Limiter/Auth sayaç/IP/UA ve safe app log | Otomatik güvenlik/erişim kontrolü | 5/2(f): kötüye kullanımı önlemek için sınırlı metadata, ham serbest metin yok, erişim sınırlı; madde 12 gereği gerekli güvenlikte 5/2(ç). Somut delil 5/2(e) ayrı | Native DB/Türkiye hosting logları; TTL/cleanup aşağıdaki native envanterde. Pseudonymous özet anonim sayılmaz; kesin hosting log süresi dış kanıt |
| DB/dosya yedekleri | Hizmet bütünlüğü/kurtarma, otomatik veya operatör kopyası | 5/2(f): erişimi kısıtlı, gerekli kurtarma kopyası; süresiz saklamaya gerekçe değil. Hak kanıtı 5/2(e) yalnız sınırlı kayıt | Hosting Türkiye; bağımsız kopyalar ayrı envanter. Restore öncesi erasure uzlaştırması zorunlu; rotasyon tek başına son kopya silme kanıtı değil |
| Olağan destek iletişim/metin | E-posta ve operatör yardımı | 5/2(c), talep edilen hizmet desteği; uyuşmazlık istisnası 5/2(e) | Gmail/yetkili operatör; kapanıştan 90 gün, manuel imha |
| KVKK talebi/ölçülü doğrulama/yanıt ve imha kanıtı | E-posta, insan incelemesi; madde 11/13 hak kullanımı | 5/2(ç), başvuruya yanıt yükümlülüğü; gerekli uyuşmazlık kanıtı 5/2(e) | Gmail ve erişim sınırlı özel kayıt; kapanıştan 12 ay, fazla ek/export daha erken imha. 30 günlük yanıt saati ayrı |
| Provider sorgu/medya kimliği ve cover URL | Katalog arama/ayrıntı/takvim ve resim istekleri | 5/2(c) yalnız istenen kataloğa gerekli veri; serbest sorgu kişisel olabilir. Doğrudan opsiyonel CDN aktarımında gereklilik otomatik kabul edilmez | Sunucu API ve browser CDN ayrı; aşağıdaki aktarım matrisi. Upstream saklama bilinmiyor; madde 9 kapanmadı |

Meşru menfaat dengesi: sınırlı güvenlik ve kurtarma hizmetin korunmasına yöneliktir;
ham sorgu/not/credential loglamak veya süresiz kullanıcı takibi bu kapsamda değildir.
Erişim operatörle sınırlı, mevcut redaction/owner kontrolü ve bounded cleanup korunur;
log süresi belirsizliği ayrıca kapatılmalıdır. Alternatif daha az veriyle sağlanıyorsa
o yöntem seçilir. Kullanıcı madde 11 haklarını kullanabilir.

**Madde 6:** ürün özel nitelikli veri istemez; olağan medya seçimi kendiliğinden
bu sınıfta değildir. Serbest metin sağlığa/inanca vb. ilişkin veri içerebilir.
5/2(c)/(f) buna yetmez. Tesadüfen gelen gereksiz hassas ekler yayılmaz ve
minimize edilir; somut hak işlemi için gerekli ise 6/3(d), kişinin açıkça
alenileştirme amacıyla uyumlu ise 6/3(ç), başka şart yoksa ayrı özgür/belirli
6/3(a) açık rıza ve Kurulun yeterli önlemleri değerlendirilmeden tutulmaz.
Genel zorunlu checkbox veya hizmete bağlı blanket rıza eklenmedi.

### VERBİS gerekçeli kayıt

**CONDITIONAL / MANUAL_OPERATOR_FACTS**. Resmî [2025/1572 ve 2025/2393 uygulama
duyurusu](https://www.kvkk.gov.tr/Icerik/8577/kisisel-verileri-koruma-kurulunun-04-09-2025-tarihli-ve-2025-1572-sayili-kararinin-uygulama-esaslarina-iliskin-kamuoyu-duyurusu)
16 Ekim 2026'da kontrol edildi. Ana faaliyeti özel nitelikli veri işleme olmayanlar
için çalışan <50, bilanço <100 milyon TL; böyle veri işleyen ana faaliyet için
çalışan <10, bilanço <10 milyon TL. Bilanço esasına göre defter tutanlarda iki
koşul birlikte, tutmayanlarda yalnız çalışan kriteri esas alınır.
MediaTracker'ın açıklanan medya takip amacı ilk gruba uygundur; rastlantısal
hassas serbest metin ana faaliyeti sağlık hizmeti yapmaz. Ancak gerçek kişinin
diğer faaliyetleri, yıllık çalışan sayısı, defter usulü ve varsa bilançosu
bildirilmedi. Bunları sıfır varsaymadan özel karar kaydına doğrulanmış yıl/kaynak,
uygulanabilir istisna ve imza/tarih girilir; değişiklikte/yıllık gözden geçirilir.
Ücretsiz portfolyo tek başına istisna değildir. Kişisel/aile faaliyeti istisnası
halka açık barındırılan hizmete otomatik uygulanmaz. İstisna varsa yalnız Sicil
kaydı içindir; aydınlatma, güvenlik, haklar ve aktarım yükümlülükleri sürer.

### Alıcı ve madde 9 aktarım matrisi

| Akış / veri | Alıcı, rol ve ülke | Amaç / mekanizma / karar |
| --- | --- | --- |
| Destek/KVKK e-postası, adres/metin/ek | Gmail/Google posta altyapısı; hizmete göre veri işleyen ve kendi amaçları için bağımsız sorumlu rolü doğrulanmalı; kesin ülke/alt işleyen UNKNOWN, olası yabancı işleme | Gmail adresi korunur. Düzenli mailbox hizmeti arızi aktarım sayılmaz; yeterlilik kapsamı veya uygulanabilir uygun güvence kanıtı yok: EXTERNAL_BLOCKER. Kullanıcının kendisinin mail göndermesi sonraki depolama/yanıt aktarımını otomatik meşrulaştırmaz. Kimlik/export eklerini Gmail'de biriktirme |
| Auth doğrulama/reset; alıcı adresi ve süreli bağlantı | Gerçek NATIVE_SMTP_HOST operatör yapılandırması; kaynak sadece TLS sözleşmesini doğrular. Sağlayıcı/tüzel kişi, kuyruk/log/backup ve ülke UNKNOWN; Gmail olduğu varsayılmaz | Kritik Auth açık kalır. Yerel Türkiye işleme teyit edilirse bu bacakta madde 9 yok; dış işleme varsa yeterlilik/uygun güvence gerekir. TLS/GDPR DPA tek başına yeterli değil. EXTERNAL_BLOCKER |
| TVMaze API: query/show ID, server IP ve UA | TVMaze API/CDN; katalog hizmeti alıcısı, log amaçları için bağımsız sorumlu rolü incelenmeli; fiilî ülke/alt işleyen UNKNOWN | Etkinlik/attribution korunur. User IP/cookie/email/not upstream'e kasten eklenmez; kişisel içerik taşıyan serbest query yine aktarım olabilir. Kişisel olmayan katalog ID+server egress için son kullanıcı aktarımı varsayılmaz. Kişisel query/direct CDN için madde 9 kanıtı yok: EXTERNAL_BLOCKER |
| Open Library search/cover ve uygulama UA contact | Internet Archive/Open Library; ABD kuruluşu, bütün sunucu ülkeleri doğrulanmadı; API bağımsız alıcı | Gerçek contact UA teknik kapıdır, aktarım onayı değildir. UA'da yayımlanan operatör contact'ı da kişisel veri olabilir. Onay/kapsam yoksa Production UA unset ile kapalı tut (manuel kitap ekleme açık); enablement POST_RELEASE_GATE |
| Browser-direct img IP/UA/zaman/path, olası referrer | `static.tvmaze.com`, `covers.openlibrary.org`; legacy `image.tmdb.org`, `s4.anilist.co`, `m.media-amazon.com`, `ia.media-imdb.com`; ayrıca kullanıcı kayıt URL'leri. Ülkeler/CDN uçları UNKNOWN | `components/media-card.tsx` unoptimized Image; `next.config.ts` optimizer allowlist'i doğrudan URL çağrısını engellemez. API kapalıyken legacy resim isteği sürebilir. Lisans, GDPR SCC veya kullanıcıya genel uyarı madde 9 güvencesi değildir: EXTERNAL_BLOCKER |
| Hosting uygulama/DB/files/log/vendor backup | TürkHosting, Türkiye; operatörün yazılı yanıtı | Bildirilen kapsamda yurt içi; madde 8, hizmet sözleşmesi/erişim-güvenlik şartları. Kesin log retention/private file backup tutarlılığı ayrı |
| Bağımsız backup/export kopyaları | Operatörün kopya konumu, erişenleri ve ülkesi özel envanterde | Şifreleme tek başına aktarım mekanizması değil. Gerçek hedef görülmedi: MANUAL_ACTION; yurt dışıysa madde 9 ayrıca |

Madde 9 sırası: 5/6 şartı + kapsamı karşılayan güncel yeterlilik kararı; yoksa
ilgili kişinin hak/etkili başvuru imkânı ve uygun güvence (örn. doğru taraf/rol
için Kurul standart sözleşmesi, gerekli bildirim; taahhütname+Kurul izni veya
uygulanabilir diğer kanuni yöntem). Standart sözleşme imzadan itibaren **5 iş
günü** içinde bildirilir. Düzenli hizmeti 9/6 arızi istisnasına veya genel rızaya
dayandırma. EU SCC/Google genel şartları Türk standart sözleşmesi yerine geçmez.
Sağlayıcı sözleşme kabul etti/sicile bildirildi/yeterlilik var iddiası yapılmadı.
Resmî [aktarılma rehberi](https://www.kvkk.gov.tr/Icerik/8143/Kisisel-Verilerin-Yurt-Disina-Aktarilmasi-Rehberi)
ve [standart sözleşme duyurusu](https://www.kvkk.gov.tr/Icerik/8170/Yurt-Disina-Kisisel-Veri-Aktariminda-Kullanilacak-Standart-Sozlesmelerde-Dikkat-Edilmesi-Gereken-Hususlara-Iliskin-Kamuoyu-Duyurusu).

Sağlayıcı kaynakları: [Google aktarım çerçeveleri](https://policies.google.com/privacy/frameworks?hl=en_GB),
[TVMaze API/lisans](https://www.tvmaze.com/api), [Open Library API](https://openlibrary.org/developers/api)
ve [Open Library/Internet Archive ilişkisi](https://openlibrary.org/help/faq/about).
Bu genel sayfalar operatör adına imzalanmış Türk KVKK aktarım güvencesi değildir.

**Sınırlama seçeneği:** Open Library kanıt yokken mevcut UA gate ile kapatılabilir.
Opsiyonel doğrudan dış resimleri same-origin/data/blob ile sınırlandırmak (kapak
yerine mevcut fallback) IP aktarımını durdurur; mevcut resim/katalog davranışını
değiştirdiği için bu pakette sessizce uygulanmadı. Same-origin proxy ancak sınırlı
allowlist/SSRF/size/time kontrolü ve cache/lisans incelemesiyle ayrıca değerlendirilir;
otomatik KVKK çözümü sayılmaz. `no-referrer` yalnız referrer'ı azaltır, IP aktarımını
çözmez. TVMaze etkin ve Auth çalışır kalması talimatı korunur; bunlar için istenen
kanıtın yokluğu release engeli olarak dürüstçe bırakılır. Yeni rıza UI'sı düzenli
madde 9 aktarımını kendiliğinden çözmeyeceğinden eklenmedi.

### Yayın kararı

Kaynak metin/prosedür/test kapanışı ile hukuki ve hosting kabulü ayrıdır. Güncel
engeller ve tek yayın kontrol listesi [işletim belgesinin 16 Ekim ekindedir](V1_CLOSURE_OPERATIONS.md#kvkk-final-kapanış--16-ekim-2026).
Dayanak için resmî [Kanun](https://www.kvkk.gov.tr/Icerik/6649/Personal-Data-Protection-Law),
[özel nitelikli veri](https://www.kvkk.gov.tr/Icerik/2051/Ozel-Nitelikli-Kisisel-Veriler)
ve [aydınlatma](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-)
16 Ekim 2026'da incelendi; Türkçe kanun aslı esas alınır.

Güncel ek — 2026-10-14: aşağıdaki 2026-10-09 envanter, test ve UNKNOWN kayıtları
tarihli kanıttır. Bölüm 4, operatörün bildirdiği TürkHosting yazılı yanıtları ve
mevcut signup adayını uzlaştırır; önceki synthetic/live statülerini değiştirmez.

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

## 4. Final privacy / public signup uzlaştırması — 2026-10-14

İncelenen temiz kaynak: `release/v1-hardening`,
`aaf95f030e57d45ff73680d6888fe38ece7e394b`. Bu ek bir hukuk onayı değildir.
`VERIFIED_SOURCE` kaynakta doğrulanan davranış; `OPERATOR_REPORTED_WRITTEN`
operatörün aktardığı yazılı sağlayıcı yanıtı; `PROPOSED / LEGAL_APPROVAL_REQUIRED`
henüz onaylanmamış karar anlamındadır. Ana hold tablosu 06E'dir.

### Yeniden kullanılacak kanıt ve hosting sınırı

05A/05B veri haritası/aydınlatma/hak başvurusu; 05C/05D export, bağımlılık ve
retention sınıfları; 05E/05F barrier, Auth-last, katılımcı/residual ve ops sınırları
korunur. Supabase/GoTrue/Storage/Vercel kanıtı eski veya fallback hedef içindir.
Aktif native karşılıklar `lib/backend/privacy.ts`, `scripts/native-privacy-ops.mjs`,
`database/native/008_privacy_lifecycle.sql`, `lib/backend/transaction.ts` ve özel
filesystem akışıdır. Native source/disposable PG18 proof ve recovery receipts
hostingde hesap silme/restore kabulü olarak yeniden etiketlenmez. Tam audit,
migration ve recovery provası bu çalışma için tekrar gerekmez.

TürkHosting'in operatörce aktarılan yazılı yanıtı: belirtilen hizmetin uygulama,
DB, dosya, log ve yedek işlemleri Türkiye'de; yabancı alt işleyen yok; yetkili
altyapı personeli Türkiye merkezli; yedek günlük, yaklaşık dört haftalık rotasyon;
web loglarında IP/zaman/istek/User-Agent bulunabilir. Bunlar
`OPERATOR_REPORTED_WRITTEN`, bağımsız doğrulanmış sözleşme/hesap kanıtı değildir.
Bu sorular yeniden genel UNKNOWN olarak açılmaz. **Kesin log retention UNKNOWN**.
Şifreleme ayrıntısı, özel dosyaların DB ile tutarlı backup kapsamı, restore-erasure
prosedürü ve sözleşmedeki roller/ihlal/erişim yükümlülükleri henüz kanıtlanmış değildir.
Yanıt Gmail, TVMaze, dış CDN, tarayıcı veya bağımsız offsite kopyalara genişletilmez.

### Amaç bazında karar matrisi

Her satırın teknik kısmı `VERIFIED_SOURCE`; TürkHosting coğrafya/rotation kısmı
`OPERATOR_REPORTED_WRITTEN`; hukuki dayanak ve onaysız saklama kriterleri
`PROPOSED / LEGAL_APPROVAL_REQUIRED`. KVKK madde 4 ölçülülük/amaç/süre,
madde 7 imha ve madde 8/9 aktarım şartları ayrıca uygulanır. Madde 5 adayları
birlikte otomatik dayanak listesi değildir; gerçek zorunluluğa göre seçim gerekir.

| Faaliyet / veri ve amaç | Aday madde 5/6 dayanağı ve gerekçe | Alıcı / aktarım | Mevcut saklama/silme ve karar sınırı |
| --- | --- | --- | --- |
| Kayıt/Auth: e-posta, görünen ad, UUID, şifre özeti, session, UA; hesap ve giriş | 5/2(c): gerekli hesap hizmeti, kurulacak/ifa edilen hizmet ilişkisi gerçekten tanımlanırsa. Güvenlik alt amacı aşağıdaki satırda. Olağan veri; 6 dayanağı varsayılmaz | Aynı-origin Better Auth → TürkHosting native DB; yazılım ayrı SaaS değildir. Hosting Türkiye bilgisi operatör bildirimi | Hesap yaşam döngüsü, yaş purge'u yok. Session 7 gün/updateAge 1 gün: geçerlilik, tüm satırların silinme garantisi değil. Onaylı sona erme/inaktif hesap kriteri ve erasure icrası gerekir |
| Cloud kütüphane/hedef: medya, not, ilerleme, ratings/favorites, goals, revision/operation/tombstone; isteğe bağlı eşitleme | 5/2(c): kullanıcının talep ettiği eşitlemeye gerekli alanlarla sınırlı; özellik seçimi tek başına açık rıza değildir. Hassas serbest metin için aşağıdaki 6 değerlendirmesi | Tarayıcı ↔ aynı-origin sunucu/native DB; backend owner UUID'yi doğrular | ACCOUNT_LIFETIME / USER_CONTROLLED. Tombstone mantıksal; güvenli offline replay ufku olmadığı için yaşa göre operation purge yok. Onaylı hesap erasure ve katılımcı/residual kontrolü; cihaz/indirilen kopyalar ayrı |
| Profil/sosyal: ad/bio, username, avatar/banner, görünürlük/tema, takip/engel, mesaj/yorum, notifications/XP; yayın/etkileşim | 5/2(c): gerekli hizmet işlemleri; 5/2(d): yalnız kişinin alenileştirme amacıyla uyumlu yayın. Tüm özel/sosyal içeriğe alenileştirme dayanağı uygulanmaz. İsteğe bağlı işlemler için şart yoksa ayrı 5/1 rıza veya sınırlama değerlendirilir | Hosting DB/özel dosyalar → görünürlük/ilişki yetkili ziyaretçi/katılımcılar; cihaz ülke/bağımsız kopyaları bilinmez | Özellik/hesap yaşam döngüsü. Bağımsız katılımcı metni/XP korunur veya policy ile detach; blanket cascade yok. Rapor/uyuşmazlık hold'u kapsam/gerekçe/bitiş ve inceleme sahibi gerektirir |
| Güvenlik/log/limit: route/code/time/request ID, pseudonymous özet, Auth sayaçları, hosting IP/UA/request; kötüye kullanım/erişim koruması | 5/2(f): zorunluluk ve hak dengesi belgelenirse; 5/2(ç): madde 12 güvenlik yükümlülüğüne gerçekten gerekli kapsam; somut uyuşmazlık kanıtı 5/2(e). Genel loglama yetkisi değildir | Native DB/safe app events; hosting log erişimi Türkiye bilgisi bildirildi; IP/header client kimlik yetkisi değildir | App receipt 60 sn/bucket 16 dk, bounded cleanup max 500 trafik/job'a bağlı. Auth signup 5/saat/login 3/10 sn; sayaç geçerliliği retention değil. Hosting log kesin süre UNKNOWN; amaç, erişim ve minimum süre vendor+legal kararı |
| Yedek/hesap silme: DB/Auth/içerik + özel dosyalar; kurtarma ve doğrulanmış erasure | 5/2(c) veya gereklilik/dengeleme ile 5/2(f): hizmet sürekliliği. Yedek otomatik süresiz hold değildir; somut hak kanıtına 5/2(e) ayrı kapsam | Hosting backup Türkiye/daily/~4 hafta operatör bildirimi. Bağımsız şifreli offsite hedef/erişim/lokasyon/kopyalar ayrı; şifreleme aktarım dayanağı yerine geçmez | Erasure lock → session revoke → app/participant/XP/files → residual/barrier → Auth-last. Hosting rotasyon son kopya tarihi garantisi değil; offsite retention onaysız. Restore karantinasında silinmiş hesap listesi/gerekli minimal kayıtla tekrar silme, erişim açmadan residual doğrulama prosedürü ve gerçek kabul gerekir |
| Destek/hak talebi: iletişim, gerekli kimlik kanıtı, metin/ek, yanıt/export; yardım ve hak kullanımı | Olağan destek 5/2(c) hizmete gerekli ise; Article 11/13 başvurusu 5/2(ç); gerekli uyuşmazlık kanıtı 5/2(e). Talep dışı ek veri tutulmaz | Kullanıcı → Gmail/yetkili operatör. Önceki mailbox erişim/MFA/alma/yanıt teyidi korunur; Gmail region/alt işleyen/aktarımı hosting yanıtına dahil değildir | Alınma ve en geç 30 günlük yanıt takibi retention süresi değildir. Ek/export minimizasyonu; kapanış sonrası silme/hold ölçütü, erişim/yedek handler ve güvenli teslim kararı gerekir. Doğrulanmamış e-posta tek başına sahiplik kanıtı değildir |
| Provider/görsel: sorgu/show ID, server egress/UA; browser IP/UA/path/time/referrer; katalog ve cover gösterme | Talep edilen katalog hizmetine zorunluysa 5/2(c); otomatik dış görsel için zorunluluk ayrıca gerekçelendirilir. Şart yoksa ayrı özgür 5/1 rıza ya da aktarımı sınırlama; genel privacy kabulü yetmez. Madde 9 ayrıca | TVMaze; UA gate ile koşullu Open Library; browser-direct TVMaze/OpenLibrary ve legacy TMDB/AniList/Amazon/IMDb CDN. Özel notlar ordinary lookup payload'ı değildir; serbest sorgu kişisel olabilir | Process cache 5 dk/64 entry, browser Calendar 12 saat stale. Upstream log/recipient copy süreleri UNKNOWN. Kapalı metadata API eski görsel çağrısını engellemez; legal recipient/transfer ve TVMaze ShareAlike kapsamı açık |

**Madde 6 istisnası:** özellikler hassas veri istemez; free-text/not/bio/rapor/ek
özel nitelikli veri içerebilir. Madde 5/2(c)/(f) bu veriye otomatik uygulanamaz.
2024 değişikliği sonrası 6/3(a) ancak ayrı geçerli açık rıza varsa; 6/3(ç) ancak
kişinin alenileştirme iradesiyle uyumlu, 6/3(d) ancak somut hakkın
tesisi/kullanılması/korunmasına gerekli kapsamda adaydır. Diğer şartlar ürün için
varsayılmaz. Gereksiz hassas veriyi istememe/minimizasyon ve uygulanabilir Kurul
önlemleri korunur; gerçek işleme için hukuk kararı gerekir.

### Asgari operatör ve dış kanıt kararları

- Mevcut veri sorumlusu/contact literalini, amaç başına dayanağı ve final Article 10
  metnini onayla; somut VERBİS kriterlerine göre karar ver, muafiyet varsayma.
- İçerik/inaktif hesap, social report/hold, Auth expired satır, log, mailbox/ek/export,
  hosting son kopya ve bağımsız offsite için amaç/bitiş/tetikleyici, icra sahibi,
  erişim/hold incelemesi ve restore-erasure sorumlusu belirle. Sabit gün uydurulmadı;
  onaylı kriter dışında kullanıcı purge'u/migration eklenmedi.
- Hosting'in cevaplanmış ülke/subprocessor/erişim/daily/~4 hafta sorularını tekrarlama;
  kesin log rotasyonu, backup dosya kapsamı/tutarlılığı, erişim/şifreleme ve
  sözleşme/restore-erasure kanıtını tamamla. Offsite envanterini ayrı doğrula.
- Gmail, etkin API ve gerçekten gösterilen CDN için alıcı rolü/kişisel veri kapsamı
  ve varsa madde 9 mekanizmasını somutlaştır. Güncel sistemde yeterlilik veya uygun
  güvence gerekir; devamlı hizmet aktarımı otomatik arızi sayılmaz. İmzalanmamış
  standart sözleşme, sırf DPA/EU SCC veya şifreleme kabul kanıtı değildir.
- TVMaze ShareAlike kayıt/dönüştürme/yayın/export kapsamını kararlaştır; Open Library
  onaylanmadıysa UA unset/kapalı kararıyla enablement'i post-release bırak.

Kaynaklar 2026-10-14 resmî KVKK üzerinden kontrol edildi:
[Kanun, güncel 5/6/9; Türkçe asıl üstün](https://www.kvkk.gov.tr/Icerik/6649/Personal-Data-Protection-Law),
[madde 5](https://www.kvkk.gov.tr/Icerik/2050/Kisisel-Veriler),
[güncel özel nitelikli veri](https://www.kvkk.gov.tr/Icerik/2051/Ozel-Nitelikli-Kisisel-Veriler),
[aydınlatma ve ayrı rıza](https://www.kvkk.gov.tr/Icerik/6765/AYDINLATMA-YUKUMLULUGUNUN-YERINE-GETIRILMESI-HAKKINDA-KAMUOYU-DUYURUSU),
[yurt dışı aktarım](https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim).
Değerlendirme profesyonel hukuk onayı yerine geçmez. Signup teknik güvenlik ve
öncelikli açılış engelleri [native signup release](NATIVE_PUBLIC_SIGNUP_RELEASE.md)
belgesindedir. Bu çalışmanın kontrolleri final raporda ayrı kaydedilir; tarihli
05/06/PG18 sonuçları değiştirilmez. Vault retrieval yine `VAULT_GIT_INVALID`;
canonical yazı/apply veya tahmini aday yolu yoktur.
