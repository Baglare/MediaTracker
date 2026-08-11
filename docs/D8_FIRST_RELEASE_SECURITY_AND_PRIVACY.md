# D8 first-release security ve factual data inventory

Durum tarihi: 2026-08-11. Bu belge hukuk görüşü veya mevzuata uyum garantisi değildir. Kod/migration kaynaklı mevcut veri akışını ve D8-4A.5E audit sonucunu kaydeder. Veri sorumlusu/operator **Batuhan Parıltı**, public privacy/contact kanalı **mediatracker.contact@gmail.com** adresidir. Production üzerinde sorgu, migration veya mutation yapılmadı.

## Security audit sonucu

| Alan | Sınıf | Kanıt/sonuç |
| --- | --- | --- |
| Public signup | BLOCKER → düzeltildi | UI toggle ve browser `signUp` yolu kaldırıldı. Supabase Auth provider ayarının Production'da disabled doğrulanması manuel kapıdır. |
| Persistent embedding cache | Production BLOCKER → Staging PASS | Source adapter yalnız exact `on` ile açılır, `text_preview` yazmaz ve v1 `off`/service-role forbidden'dır. Production export iki permissive write policy'si gösterdi; additive migration Test/Staging'de policy/table client erişimini kapattı ve anon/auth deny canlı geçti. |
| `SECURITY DEFINER` grants | Production BLOCKER → Staging PASS | CSV'deki 62 isim gövde ve consumer bazında sınıflandırıldı. 7 public-read, 9 authenticated-read, 27 authenticated-mutation explicit grant alır; 19 internal fonksiyon runtime rolü almaz. Staging Guest/auth/internal denial regresyonu geçti. Ayrıntı: [Security Advisor audit](D8_SECURITY_ADVISOR_AUDIT.md). |
| `set_updated_at` search path | MAJOR → Staging PASS | CSV warning'i geçerli. `search_path=pg_catalog` ile trigger semantiği değişmeden sabitlendi; static contract ve migration post-check geçti. |
| Caller-controlled owner IDs | SAFE | Cloud Media, Goal, theme, profile ve sosyal mutation RPC'leri owner'ı `auth.uid()` ile bağlar; target ID ilişki nesnesidir, owner yetkisi değildir. |
| Cloud Media D2C.1 | SAFE | Owner-scoped fiziksel PK/FK, RPC-only mutation, CAS revision, operation idempotency ve tombstone contract'ları korunur. |
| Goal Cloud V1 | SAFE | `auth.uid()` owner scope, select-only table grant, RPC mutation, revision/idempotency/tombstone contract'ı korunur. |
| Public profile/theme | SAFE | Owner-only save, viewer-policy projection, default hidden, allowlisted snapshot ve private/internal alan stripping korunur. |
| Social/feed/notification | SAFE | Participant/owner RLS ve auth-bound RPC'ler; helper/trigger fonksiyonları public execute'dan revoke edilmiştir. |
| Storage profile assets | SAFE | Insert/update/delete owner folder scope'lu; anon/auth select yalnız profilde referanslanan current avatar/banner path için görünürdür. |
| Geniş `using (true)` | Production BLOCKER → Staging PASS | XP definition SELECT policy'leri intentional public read'dir. Production `embedding_cache` INSERT/UPDATE global policy'leri onaylı migration ile kaldırılacaktır; Test/Staging tablosu user rollerine tamamen kapatıldı. |
| Leaked-password protection | ACCEPTED_PLATFORM_LIMITATION | Plan capability'si mevcut değilse fake-enable/upgrade yapılmaz. Signup disabled ve mevcut release hesaplarında güçlü benzersiz credential compensating control'dür; capability açıldığında post-release etkinleştirilir. |

Production CSV source audit'in göremediği gerçek grant/policy drift'ini kanıtladı. `20260811120000_d8_security_advisor_hardening.sql` bu farkı Test/Staging'de kapattı ve canlı owner/grant/RLS regresyonu geçti. Production Advisor migration D8-4B'de uygulanıp tekrar çalıştırılmadan `BLOCKED_MANUAL` kalır.

## Service-role sınıflandırması

| Kullanım | Sınıf | İlk sürüm kararı |
| --- | --- | --- |
| `lib/ai/persistent-embedding-cache.ts` | production-runtime-adapter, fakat özellik disabled | `server-only`; explicit `on` olmadan client yaratmaz. Production env'de service-role bulunmaz. |
| `scripts/d8-staging-hard-gate.mjs` | ops/script-only | Yalnız kontrollü staging hard gate; web runtime'a taşınmaz. |
| Live/integration ve env-loader testleri | test-only | Fixture secret store/local runner; Preview/Production runtime'a taşınmaz. |
| Diğer app/lib yolları | obsolete/yok | Başka service-role tüketicisi bulunmadı. |

## Factual veri envanteri

| Veri sınıfı | Local-only | Supabase stored | Vercel/runtime processed | Third-party query | Exportable | Deletable/mevcut sınır |
| --- | --- | --- | --- | --- | --- | --- |
| Auth/e-posta/session | Hayır | Supabase Auth | Cookie/session doğrulama | Supabase | Uygulama backup'ında değil | Kullanıcı self-delete UI yok; operator destek yolu gerekir |
| Profil/username/avatar/banner | Local profile preference + session cache | `profiles`, profile tabloları, Storage | Signed URL ve projection | Supabase | Media backup'ına dahil değil | Owner editor asset delete var; tam hesap silme yolu ayrıca gerekir |
| Library/history/progress/rating/favorite/personal notes | Local-first storage | Cloud Media açık owner için media/progress | API/RPC payload | Supabase | Portable backup JSON | Yerel CRUD ve cloud tombstone; account-wide deletion akışı belgelenmeli |
| Goals | Local-first | Goal Cloud açık owner için goal + operation ledger | Sync RPC payload | Supabase | Portable Goal contract | Local delete + cloud tombstone |
| Social graph/feed/comments/recommendations/notifications/reports | Hayır | Social/RPC tabloları | Route/RPC payload | Supabase | Uygulama export'unda kapsamlı değil | UI aksiyonları kısmi; account-wide deletion/operator yolu gerekir |
| Theme/preferences | Cookie/localStorage/session | Theme Cloud ve profile public snapshot | Sync/profile route | Supabase | Theme bundle import/export | Local reset, cloud owner delete RPC; public snapshot profile save ile gizlenir |
| Provider search query | Kalıcı local kayıt hedefi değil | Hayır | Bounded POST JSON proxy sırasında transient | TVMaze/Open Library; disabled provider'lar çağrılmaz | Hayır | Kalıcı app kaydı yok; provider/platform log koşulları kendi sözleşmelerine bağlıdır |
| Dormant AI prompt/context | Session/local AI state olabilir | Recommendation feedback dışında prompt persistence hedefi yok | Disabled policy altında provider çağrısı başlamaz | İlk release'te yok | AI session contract'a bağlı | Paid/research disabled; raw prompt/passage/response persistence yasak |
| Embedding cache | Bellek içi process cache olabilir | Persistent cache explicit on ise vector/hash; v1 off | Server-only adapter | Opsiyonel local ML | Hayır | v1 read/write yok; olası eski `embedding_cache` satırları D8-4B preflight'ta aggregate incelenir |
| Hosting/security metadata | Tarayıcı/network cache | Supabase/Vercel platform logları | IP, request metadata, safe error/telemetry | Supabase/Vercel | Uygulama export'unda değil | Vendor retention ve deletion yetkili privacy incelemesine bağlı |

## First-release privacy/aydınlatma paketi

- Public, auth gerektirmeyen `/privacy` route'u local-first yapı, Supabase hesap/Cloud/social verisi, library/progress/rating/favorite/note/goal, avatar/banner, theme/preferences, TVMaze/Open Library sorguları, Vercel runtime, disabled AI, export ve delete sınırlarını açıklar.
- Operator ve public contact doğrulanmıştır: **Batuhan Parıltı**, **mediatracker.contact@gmail.com**. Başka kişisel e-posta, adres, telefon, şirket veya vergi kimliği yayımlanmaz.
- TVMaze ve Open Library aktif first-release provider olarak açıklanır. AniList/TMDB/OMDb aktif Production processor olarak sunulmaz; server-funded AI ve Grounded Research disabled'dır.
- Factual export library/progress ve seçilen portable theme/goal domainlerini kapsar; Auth, profile assets ve tüm social/notification verisini tek paket halinde kapsayan account export yoktur.
- “Mock verilere sıfırla” tam local delete değildir. Kayıtlar tek tek silinebilir; tam site-local cleanup tarayıcı site-data kontrolüyle yapılır. Kullanıcı önce portable export alabilir.
- Uygulamada self-service account-wide deletion yoktur. Cloud/account talepleri public contact'a, hesap e-postasından iletilir. Owner CRUD/tombstone ve asset delete, Auth hesabı ile tüm ilişkili verinin silinmesiyle aynı şey değildir.
- Supabase/Vercel/provider teknik veri akışı belgelenmiştir. Gerçek region/foreign-transfer hukuki dayanağı repo/config tarafından doğrulanmadığı için **MANUAL_LEGAL_REVIEW_REQUIRED**; mevzuata uyum iddiası yapılmaz.
- Public signup disabled hedeflenir; mevcut hosted hesaplar için privacy yükümlülükleri devam eder.

## Operator deletion request runbook

1. Talebi yalnız **mediatracker.contact@gmail.com** üzerinden al; requester'ın hesap e-postasıyla güvenli eşleşmesini doğrula ve başka kullanıcı bilgisi isteme/açıklama.
2. Kapsamı yazılı netleştir: erişim/export, yalnız uygulama verisi, profil assetleri veya Auth hesabıyla tam silme. Export istenmişse silmeden önce owner-scoped veriyi güvenli kanalla hazırla.
3. Yetkili Supabase dashboard/ops yolunda yalnız doğrulanan owner'ın application row'larını; social/profile/theme/media/progress/goal/XP/operation kayıtlarını FK/cascade ve ledger etkileriyle inceleyerek sil.
4. `profile-assets` içindeki yalnız aynı owner klasöründeki avatar/banner objelerini sil; path ve object count'u doğrula, başka owner prefix'ine dokunma.
5. Tam hesap silme istenmişse application/asset cleanup sonrası yetkili Auth admin yoluyla doğru Auth hesabını sil. Bu UI/runtime service-role işi değildir.
6. Row/object/Auth aggregate post-check yap, talep ve sonucu secret/user UUID yayımlamadan kaydet, requester'a tamamlanan kapsamı bildir.
