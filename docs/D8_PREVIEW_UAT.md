# D8 Preview manual UAT

Bu paket D8-4A staging PASS sonrasındaki Vercel Preview kullanıcı kabulünü yönetir. Preview yalnız staging Supabase ile çalışır; production DB/Auth/Storage veya Vercel Production bu belgenin kapsamında değildir.

## Release sınıflandırması

| Sınıf | Durum |
| --- | --- |
| A — Preview/UAT öncesi blocker | Repo/runtime blocker bulunmadı. D8-4A.5B teknik kapısında protected Preview, staging target, env adı/scope sınırı, Media `d2c1`, Goal `v1`, guest capability ve dev-route 404 doğrulandı. P-01–P-03 kullanıcı kabulüyle, P-04 ise FIX1 sonrası canlı Preview teknik kabulüyle geçti. |
| B — UAT sırasında doğrulanacak | Aşağıdaki kullanıcı yolculukları, gerçek UI, Network ve console üzerinden elle kabul edilir. |
| C — Production öncesine bırakılan | Belgenin sonundaki 16 maddelik mandatory hold queue; D8-4B öncesi tamamlanmalıdır. |
| D — Opsiyonel backlog | Push/e-posta bildirimi ve benzeri ROADMAP backlog'u; mandatory hold ile birleştirilmez. |

## Başlangıç ve kanıt kuralları

1. Preview deployment source SHA'sını kaydet; freeze SHA'sını içerdiğini ve sonrasında yalnız audit edilmiş D8-4A.5 belge/test hazırlığı bulunduğunu doğrula. UAT'yi production alias/domain yerine raporlanan immutable Preview deployment URL'sinde yürüt. Ek runtime değişikliği varsa ilgili regresyonlar yeniden geçmeden UAT başlatma.
2. Vercel Preview env'lerini [D8 env matrisi](D8_RELEASE_ENV_MATRIX.md) ile yalnız isim/scope seviyesinde kontrol et; masked staging/production hedef ayrımını kaydet.
3. Staging User A (admin), User B (normal), ayrı tarayıcı profili ve guest/private pencere hazırla. Credential'ı forma yalnız test sırasında gir; ekran görüntüsü/log içine alma.
4. Önce `P-*`, sonra guest/auth/cloud, en son provider/conditional research sırasını uygula. Her satırda tek sonuç seç ve kanıt bağlantısını ayrı, erişimi kısıtlı UAT kaydında tut.
5. Console veya Network export'u paylaşmadan önce token, cookie, email, user ID, query ve response body redaction yap. Expected 401/403 ile gerçek 5xx'i ayır.

`Sonuç` alanı her senaryo için: **☐ PASS ☐ FAIL ☐ BLOCKED**. Seviye, senaryo başarısızlığının varsayılan triage sınıfıdır.

## P — Preview preflight

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | BLOCKER | Preview URL hazır | Guest | Ana sayfayı aç, hard refresh yap | HTTPS yüklenir; CSP/header hatası, hydration veya blank screen yok | ☒ PASS ☐ FAIL ☐ BLOCKED |
| P-02 | BLOCKER | Env review erişimi | Ops | Preview env scope'unu masked karşılaştır | Supabase hedefi staging; production target ve test credential Preview runtime'da yok | ☒ PASS ☐ FAIL ☐ BLOCKED |
| P-03 | BLOCKER | Preview build | Guest | `/dev/recommendation-annotation` ve `/api/dev/recommendation-annotation` aç | Production-mode Preview'da ikisi de güvenli 404; local dosya içeriği yok | ☒ PASS ☐ FAIL ☐ BLOCKED |
| P-04 | MAJOR | DevTools açık | Guest | Ana sayfa, `/people`, bir public profil ve `/api/ai/capabilities` kontrol et | Security headers/no-store contract korunur; key/model/raw role/user ID görünmez | ☒ PASS ☐ FAIL ☐ BLOCKED |

## A — Guest ve local-first

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| G-01 | BLOCKER | Temiz browser profile | Guest | Uygulamayı aç, demo/local moda devam et | Auth zorunlu olmadan temel kütüphane kullanılabilir; cloud kapalı görünür | ☒ PASS ☐ FAIL ☐ BLOCKED |
| G-02 | BLOCKER | Guest local mode | Guest | Medya ekle, düzenle, ilerleme kaydı ekle ve sil | CRUD hemen UI'a yansır; yanlış cloud çağrısı veya veri kaybı yok | ☒ PASS ☐ FAIL ☐ BLOCKED |
| G-03 | BLOCKER | G-02 verisi | Guest | Hard refresh ve sekmeyi kapat/aç | Local state doğru scope'ta geri gelir; demo veri kullanıcı verisini ezmez | ☒ PASS ☐ FAIL ☐ BLOCKED |
| G-04 | MAJOR | Local veri mevcut | Guest | Portable export al; ayrı temiz profile additive import yap | Önizleme/count anlaşılır; import bounded ve additive; mevcut kayıt sessizce silinmez | ☒ PASS ☐ FAIL ☐ BLOCKED |

## B — Authentication ve account switch

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | BLOCKER | User A fixture | User A | Sign in yap ve sayfayı yenile | Session cookie ile oturum korunur; capability A'yı admin tanır | ☐ PASS ☐ FAIL ☐ BLOCKED |
| AUTH-02 | BLOCKER | A oturumu açık | User A | Sign out yap, protected yüzeyleri aç | Owner state hemen temizlenir; guest başka sahibin verisini görmez | ☐ PASS ☐ FAIL ☐ BLOCKED |
| AUTH-03 | BLOCKER | A ve B fixture | A→B→guest→A | Sırayla giriş/çıkış ve refresh yap | Önceki owner medya/goal/profile/avatar/banner/theme bir frame bile görünmez | ☐ PASS ☐ FAIL ☐ BLOCKED |
| AUTH-04 | MAJOR | Aktif A/B session | User A/B | Oturumu beklet, focus/hard refresh ile token refresh davranışını gözle | Silent refresh çalışır veya güvenli yeniden giriş ister; infinite auth retry yok | ☐ PASS ☐ FAIL ☐ BLOCKED |

> FIX3 durumu: **AUTH-01 — MANUAL RETEST READY.** Staging User A admin metadata'sı minimal merge ile düzeltildi ve fresh-session A/B/Guest capability matrisi geçti. Manuel tarayıcı oturumunda sign-out/sign-in yaparak AUTH-01 yeniden doğrulanmalıdır; senaryo kullanıcı kabulüne kadar PASS işaretlenmemiştir.

## C — Cloud Media V2

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| CM-01 | BLOCKER | Local-only kayıt + A session | User A | Local→cloud aktarımı başlat | Önizleme/count doğru; owner A'ya yazılır; local kayıt korunur | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CM-02 | BLOCKER | Cloud-only A kaydı | User A | Cloud→local download/merge yap | Additive merge; ID/ilerleme ilişkisi korunur; sessiz overwrite yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CM-03 | BLOCKER | Cloud ready | User A | Medya add/update/progress/delete zinciri yap | Revision artar; tombstone ve UI sonucu tutarlı; direct legacy mutation yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CM-04 | MAJOR | Bekleyen queue üretilebilir | User A | Birkaç hızlı mutation yap, queue/status ve flush gözle | Duplicate gönderim kullanıcıya çift kayıt üretmez; flush bounded tamamlanır | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CM-05 | BLOCKER | DevTools offline | User A | Offline mutation yap, refresh etmeden online dön | Queue korunur ve online dönüşte flush olur; veri kaybı/infinite retry yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CM-06 | BLOCKER | İki session aynı owner | User A | Aynı kaydı iki session'da değiştirip conflict üret | Conflict açıkça gösterilir; seçim/merge sonrası revision doğru, iki tarafın verisi görünür | ☐ PASS ☐ FAIL ☐ BLOCKED |

## D — Goal Cloud V1

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| GOAL-01 | BLOCKER | Goal Cloud ready | User A | Yeni hedef oluştur | Yerel UI ve cloud kaydı aynı owner/revision ile oluşur | ☐ PASS ☐ FAIL ☐ BLOCKED |
| GOAL-02 | BLOCKER | Aktif hedef | User A | Hedefi ve progress'i güncelle | Progress doğru hesaplanır; CAS/revision conflict sessizce ezilmez | ☐ PASS ☐ FAIL ☐ BLOCKED |
| GOAL-03 | MAJOR | Tamamlanabilir hedef | User A | Hedefi complete yap | Completion durumu ve ilgili UI/XP davranışı tek kez uygulanır | ☐ PASS ☐ FAIL ☐ BLOCKED |
| GOAL-04 | BLOCKER | Hedef mevcut | User A | Hedefi sil | Tombstone üretilir; refresh/merge sonrası geri dirilmez | ☐ PASS ☐ FAIL ☐ BLOCKED |
| GOAL-05 | BLOCKER | GOAL-01..04 tamam | User A | Sign out/in ve ikinci session'da hedefleri aç | Aynı owner görünümü tutarlı; User B hiçbir A hedefi görmez | ☐ PASS ☐ FAIL ☐ BLOCKED |

## E — Profile ve social

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| SOC-01 | BLOCKER | A profile editor | User A | Public visibility kaydet, guest olarak profile git | Public alanlar görünür; owner-private alan yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| SOC-02 | BLOCKER | Protected visibility | User B/Guest | A profilini bağlantılı ve bağlantısız kullanıcıyla aç | Yalnız policy'nin izin verdiği viewer görür; UI gizleme değil server deny | ☐ PASS ☐ FAIL ☐ BLOCKED |
| SOC-03 | BLOCKER | Personal visibility | User B/Guest | A profilini aç | Owner dışı viewer private içerik/snapshot alamaz | ☐ PASS ☐ FAIL ☐ BLOCKED |
| SOC-04 | MAJOR | A/B profile mevcut | User A | User search ile B'yi bul | Doğru kullanıcı/identity; private field veya gereksiz user ID yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| SOC-05 | MAJOR | Follow policy uygun | User A/B | Follow veya request gönder, kabul/ret gerekiyorsa tamamla, sonra unfollow | Relationship ve butonlar iki hesapta tutarlı; notification bounded oluşur | ☐ PASS ☐ FAIL ☐ BLOCKED |
| SOC-06 | BLOCKER | A/B ilişkisi mevcut | User B | A'yı block et; A'dan profil/interaction dene; sonra unblock | Block server-side uygulanır; eski relationship yanlışlıkla geri gelmez | ☐ PASS ☐ FAIL ☐ BLOCKED |
| SOC-07 | MAJOR | Social activity üretildi | User A/B | Feed ve notification center'ı aç, read/refresh yap | Doğru owner/viewer event'i görünür; duplicate/infinite polling veya private payload yok | ☐ PASS ☐ FAIL ☐ BLOCKED |

> Preview regression durumu: **SOC-06 block enforcement PASS; unblock UI MANUAL RETEST PENDING.** SOC-07 başlatılmadı.

## F — Avatar ve banner

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| ASSET-01 | MAJOR | Geçerli bounded image | User A | Avatar ve banner upload yap | Validation geçer, preview/görsel güncellenir; path owner scope'tadır | ☐ PASS ☐ FAIL ☐ BLOCKED |
| ASSET-02 | MAJOR | Asset mevcut | User A | Avatar/banner replace yap | Revision/path değişir; eski signed URL yeniden kullanılmaz | ☐ PASS ☐ FAIL ☐ BLOCKED |
| ASSET-03 | MAJOR | Asset mevcut | User A | Refresh ve profile gir/çık/gir | Geçerli cache hit; gereksiz summary/signed URL waterfall yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| ASSET-04 | BLOCKER | A asset mevcut | A→B | Account switch yap | A görseli B'de flash etmez; B A'nın unreferenced path'ini alamaz | ☐ PASS ☐ FAIL ☐ BLOCKED |
| ASSET-05 | MAJOR | Asset mevcut | User A | Avatar/banner delete yap ve public URL'yi yeniden dene | UI fallback'e döner; cleared path non-owner için reddedilir | ☐ PASS ☐ FAIL ☐ BLOCKED |

## G — Public theme

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| THEME-01 | BLOCKER | Visibility hidden | Guest | A public profilini aç | Snapshot yok; visitor kendi temasını görür | ☐ PASS ☐ FAIL ☐ BLOCKED |
| THEME-02 | MAJOR | Explicit preset seçildi | Guest | `preset_only` profili aç | Yalnız seçilen preset görünür; custom/internal ID yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| THEME-03 | MAJOR | Current preset aktif | Guest | `current_theme` profili aç | Validated preset snapshot profile scope'ta uygulanır | ☐ PASS ☐ FAIL ☐ BLOCKED |
| THEME-04 | MAJOR | Valid custom + text colors | Guest | Custom published profili aç | Semantic tokenlar okunabilir; raw CSS/url/var yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| THEME-05 | BLOCKER | Düşük kontrast custom draft | User A/Guest | Publish/activate dene; sonra profilden başka sayfaya git | Publish/activate engellenir; sidebar/topbar ve route-leave visitor temasında kalır | ☐ PASS ☐ FAIL ☐ BLOCKED |

## H — Discover

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| DISC-01 | MAJOR | TMDB configured | User B | Film ara, sonuç aç/ekle | POST JSON; sorgu URL'de yok; film contract korunur | ☐ PASS ☐ FAIL ☐ BLOCKED |
| DISC-02 | MAJOR | TVMaze/TMDB available | User B | TV dizisi ara | Kaynaklar fail-soft birleşir; duplicate/yanlış type yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| DISC-03 | MAJOR | AniList available | User B | Anime ve manga ara | Type/country ayrımı ve sonuç kartları doğru | ☐ PASS ☐ FAIL ☐ BLOCKED |
| DISC-04 | MAJOR | Open Library available | User B | Kitap ara | Book kimliği/cover fallback ve plain-text açıklama doğru | ☐ PASS ☐ FAIL ☐ BLOCKED |
| DISC-05 | MAJOR | Sonuçsuz sorgu | User B | Provider boş sonuç üret | Kullanıcı dostu boş state; diğer provider'lar çökmez | ☐ PASS ☐ FAIL ☐ BLOCKED |
| DISC-06 | MAJOR | Bir provider request block/timeout | User B | Tek provider'ı fail ettirerek global arama yap | Güvenli provider error; diğer kaynak sonuçları kalır; raw upstream hata yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| DISC-07 | MAJOR | 320/375 px + uzun fixture | User B | Uzun title/10k description ve missing cover kartlarını kontrol et | 2 mobile/3 desktop line contract, sabit action alanı, horizontal overflow yok | ☐ PASS ☐ FAIL ☐ BLOCKED |

## I — Recommendation V2 ve AI Advisor

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| REC-01 | BLOCKER | Local library | Guest/User B | Library-only deterministic öneri iste | Provider çağrısı olmadan deterministik sonuç/boş state; final ranking LLM değildir | ☐ PASS ☐ FAIL ☐ BLOCKED |
| REC-02 | MAJOR | Provider unavailable fixture | Admin | Source API/provider önerisi dene | Safe fallback veya açık unavailable state; sessiz ücretli fallback/infinite retry yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| REC-03 | BLOCKER | User B session | User B | OpenAI/client admin/research flag forge et | Capability false; 403; provider/research call count sıfır | ☐ PASS ☐ FAIL ☐ BLOCKED |
| REC-04 | BLOCKER | User A admin | User A | Capability ve OpenAI kontrolünü aç | Admin true; server provider seçenekleri policy'ye uygun; secret/model sızmaz | ☐ PASS ☐ FAIL ☐ BLOCKED |
| REC-05 | MAJOR | Admin provider UAT configured | User A | Bounded provider-backed öneri iste | Latency/error görünür ve bounded; sonuç gerekçesi anlaşılır; hatalı öneri raporlanabilir | ☐ PASS ☐ FAIL ☐ BLOCKED |
| REC-06 | MAJOR | Öneri sonuçları | User A/B | Like/dislike/not-interested ve tekrar öneri akışını kullan | Feedback kaydı/UI count güncellenir; sonraki deterministik karar açıklanabilir | ☐ PASS ☐ FAIL ☐ BLOCKED |
| REC-07 | MAJOR | Evidence/citation içeren kayıtlı session fixture | User A/B | Transparency, evidence ve citation disclosure'ı aç | Source, evidence strength ve fallback ayrımı erişilebilir; unsupported claim kesinlik gibi sunulmaz | ☐ PASS ☐ FAIL ☐ BLOCKED |

## J — Grounded Research conditional UAT

Production/Preview RC başlangıcında research disabled kalır. Bu üç senaryo bu turda çalıştırılmaz. Daha sonra ayrı onay, staging-only provider bütçesi, explicit kısa pencere ve test biter bitmez disabled'a geri dönüş ile uygulanır.

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| RES-01 | MAJOR | Kontrollü conditional research window | User A | Known-positive exact-title/evidence senaryosu çalıştır | Revision-bound citation ve grounded disclosure; deterministik final authority korunur | ☐ PASS ☐ FAIL ☐ BLOCKED |
| RES-02 | MAJOR | No-evidence fixture | User A | Kanıt bulunmayan zorunlu aspect iste | Unsupported sonuç baseline/no-result olur; sahte citation yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| RES-03 | MAJOR | Provider error fixture | User A | Discovery/extraction provider error üret | Safe fallback; raw response/prompt persist edilmez; bounded timeout/retry | ☐ PASS ☐ FAIL ☐ BLOCKED |

## K — Calendar

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| CAL-01 | MAJOR | Bilinen airing/release medya | User B | Ajanda ve ay görünümünde tarihi bul | Provider event doğru gün/type/title ile görünür | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CAL-02 | MAJOR | Manuel event desteği | User B | Manuel event ekle/düzenle/sil | Owner-local event doğru görünür ve provider event'i bozmaz | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CAL-03 | MAJOR | Timezone farklı sistem | User B | Gece yarısı sınırındaki event'i kontrol et | Yerel timezone/gün hesaplaması tutarlı; bir gün kayma yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| CAL-04 | MAJOR | Cache dolu, provider block | User B | Refresh/refetch ve provider failure üret | Bounded refetch; geçerli stale cache korunur; raw provider error yok | ☐ PASS ☐ FAIL ☐ BLOCKED |

## L — Responsive yüzeyler

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| RESP-01 | MAJOR | 320×568 | Guest/User B | Navigation, profil, modal/dialog, AI, Discover, Goal, Calendar turu | Horizontal overflow yok; ana action ve focus erişilebilir | ☐ PASS ☐ FAIL ☐ BLOCKED |
| RESP-02 | MAJOR | 375×812 | Guest/User B | Aynı yüzeyleri ve public header'ı dolaş | Header/action wrap kontrollü; profile theme shell'e sızmaz | ☐ PASS ☐ FAIL ☐ BLOCKED |
| RESP-03 | MAJOR | 390×844 | User A/B | Account switch, asset/theme editor ve conflict UI aç | Dialog/keyboard/focus görünür; içerik viewport dışına kilitlenmez | ☐ PASS ☐ FAIL ☐ BLOCKED |
| RESP-04 | MAJOR | ≥1366×768 | User A/B | Tüm ana yüzeyleri desktop shell'de dolaş | Mobil düzeltmeler desktop layout'u bozmaz; card/action hizası stabil | ☐ PASS ☐ FAIL ☐ BLOCKED |

## M — Error surface

| ID | Seviye | Ön koşul | Kullanıcı | Yapılacak işlem | Beklenen sonuç / UI / Network | Sonuç |
| --- | --- | --- | --- | --- | --- | --- |
| ERR-01 | BLOCKER | DevTools console | Tümü | Her ana akışta console/hydration loglarını izle | Beklenmeyen error, hydration mismatch veya unhandled rejection yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| ERR-02 | MAJOR | Network block/timeout | Tümü | Auth dışı bir API isteğini başarısız yap | UI güvenli hata/yeniden dene sunar; infinite retry yok | ☐ PASS ☐ FAIL ☐ BLOCKED |
| ERR-03 | BLOCKER | 401/403 üretilebilir | Guest/User B | Protected ve server-provider endpointlerini dene | Expected deny kullanıcıya anlamlı; gerçek 5xx ile karışmaz | ☐ PASS ☐ FAIL ☐ BLOCKED |
| ERR-04 | BLOCKER | Response/console inspection | Tümü | Capability, provider, cloud ve profile hatalarını incele | Secret, key/model config, raw SQL/provider response, prompt/passage veya private owner field görünmez | ☐ PASS ☐ FAIL ☐ BLOCKED |

## UAT sonuç politikası

### RELEASE BLOCKER

Veri kaybı; başka kullanıcı verisinin görünmesi; auth/RLS bypass; secret sızıntısı; Cloud verisinin bozulması; temel CRUD'un çalışmaması; production migration güvenliğini etkileyen problem. UAT durur, D8-4B açılmaz.

### MAJOR

Ana özelliğin ciddi bozulması; kritik mobil kullanım problemi; önemli AI/Cloud/Profile/Goal akışının yanlış çalışması. İlgili grup durur ve düzeltilmeden UAT kapanmaz.

### MINOR

Kozmetik, küçük copy veya nadir layout problemi. Owner ve hedef sürüm kaydıyla release'i durdurmadan planlanabilir.

D8-4B giriş kriteri: **RELEASE BLOCKER = 0 ve MAJOR = 0**. BLOCKED senaryo, kanıtlanmış PASS değildir; gerekli environment/fixture sağlanıp yeniden çalıştırılır.

## D8-4B öncesi mandatory hold queue

Bu liste opsiyonel backlog değildir. Hiçbir madde bu aşamada tamamlanmış sayılmaz veya implement edilmez.

| # | Zorunlu kapı | Kapanış kanıtı | Durum |
| --- | --- | --- | --- |
| 1 | AniList public-production şartı/permission değerlendirmesi; gerekirse fail-closed feature flag | Yazılı kullanım kararı ve config contract | ☐ NOT STARTED |
| 2 | OMDb production kararı; lisans uygun değilse key boş/disabled | Lisans/disable kararı | ☐ NOT STARTED |
| 3 | TMDB approved logo ve attribution | Onaylı asset + UI kontrolü | ☐ NOT STARTED |
| 4 | TVMaze attribution / CC BY-SA notice | Görünür attribution ve source link | ☐ NOT STARTED |
| 5 | Open Library gerçek User-Agent/contact | Production env review + request smoke | ☐ NOT STARTED |
| 6 | Public signup ilk release'te açık/kapalı nihai kararı | Auth config/runbook kararı | ☐ NOT STARTED |
| 7 | KVKK/privacy/aydınlatma ve gerekiyorsa yurt dışı aktarım değerlendirmesi | Yetkili privacy/legal onayı | ☐ NOT STARTED |
| 8 | Persistent embedding cache `text_preview` ve `personalNotes` privacy yüzeyi; kapatma veya privacy-safe tasarım | Threat/privacy review + test | ☐ NOT STARTED |
| 9 | Production runtime `SUPABASE_SERVICE_ROLE_KEY` ihtiyacını kaldırma/minimize etme | Import/runtime/env kanıtı | ☐ NOT STARTED |
| 10 | Canonical tek admin claim ve MFA/AAL2 zorunluluğu değerlendirmesi | Auth security kararı | ☐ NOT STARTED |
| 11 | SQL/RPC/`SECURITY DEFINER`/RLS adversarial security audit | Bulgular ve blocker closure | ☐ NOT STARTED |
| 12 | Supabase Security Advisor review | Review kaydı ve kabul edilen bulgular | ☐ NOT STARTED |
| 13 | Ayrı OpenAI production project/key, düşük budget/limit, monitoring ve rotation | Ops runbook + masked smoke | ☐ NOT STARTED |
| 14 | Küçük read-only Admin/Ops paneli yapılıp yapılmayacağı kararı | Scope/security kararı | ☐ NOT STARTED |
| 15 | Local `.env.local`, Vercel Preview ve Vercel Production env matrisini satır satır kesinleştirme | İki kişi env review | ☐ NOT STARTED |
| 16 | Production backup, target verification ve change-window kapısı | PITR/backup kanıtı + onaylı pencere | ☐ NOT STARTED |
