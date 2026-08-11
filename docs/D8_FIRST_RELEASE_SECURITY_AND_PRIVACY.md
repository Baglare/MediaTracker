# D8 first-release security ve factual data inventory

Durum tarihi: 2026-08-11. Bu belge hukuk görüşü veya mevzuata uyum garantisi değildir. Kod/migration kaynaklı mevcut veri akışını ve D8-4A.5D source audit sonucunu kaydeder. Production üzerinde sorgu, migration veya mutation yapılmadı.

## Security audit sonucu

| Alan | Sınıf | Kanıt/sonuç |
| --- | --- | --- |
| Public signup | BLOCKER → düzeltildi | UI toggle ve browser `signUp` yolu kaldırıldı. Supabase Auth provider ayarının Production'da disabled doğrulanması manuel kapıdır. |
| Persistent embedding cache | MAJOR → düzeltildi | Service-role/config varlığı artık cache'i açmaz; yalnız exact `MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE=on` opt-in kabul edilir. `text_preview` yeni satırlara yazılmaz. Production `off` ve service-role forbidden'dır. |
| `SECURITY DEFINER` search path | SAFE | Migration/schema içindeki tüm definer fonksiyonlarında explicit `search_path` veya eşdeğer sabitleme bulundu; dinamik `EXECUTE`/`format` kalıbı bulunmadı. |
| Caller-controlled owner IDs | SAFE | Cloud Media, Goal, theme, profile ve sosyal mutation RPC'leri owner'ı `auth.uid()` ile bağlar; target ID ilişki nesnesidir, owner yetkisi değildir. |
| Cloud Media D2C.1 | SAFE | Owner-scoped fiziksel PK/FK, RPC-only mutation, CAS revision, operation idempotency ve tombstone contract'ları korunur. |
| Goal Cloud V1 | SAFE | `auth.uid()` owner scope, select-only table grant, RPC mutation, revision/idempotency/tombstone contract'ı korunur. |
| Public profile/theme | SAFE | Owner-only save, viewer-policy projection, default hidden, allowlisted snapshot ve private/internal alan stripping korunur. |
| Social/feed/notification | SAFE | Participant/owner RLS ve auth-bound RPC'ler; helper/trigger fonksiyonları public execute'dan revoke edilmiştir. |
| Storage profile assets | SAFE | Insert/update/delete owner folder scope'lu; anon/auth select yalnız profilde referanslanan current avatar/banner path için görünürdür. |
| Geniş `using (true)` | SAFE | Yalnız public, değişmez XP quest/badge definition okuma tablolarında bulundu; owner verisi için kullanılmıyor. |

Source audit yeni migration gerektiren BLOCKER/MAJOR üretmedi. Supabase Security Advisor, remote production policy drift ve gerçek Production grants ayrı `BLOCKED_MANUAL` kapısıdır; source audit bunun yerine geçmez.

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
| Provider search query | Kalıcı local kayıt hedefi değil | Hayır | Bounded POST JSON proxy sırasında transient | TVMaze/Open Library; disabled provider'lar çağrılmaz | Hayır | Kalıcı app kaydı yok; hosting/provider log retention disclosure gerekir |
| Dormant AI prompt/context | Session/local AI state olabilir | Recommendation feedback dışında prompt persistence hedefi yok | Disabled policy altında provider çağrısı başlamaz | İlk release'te yok | AI session contract'a bağlı | Paid/research disabled; raw prompt/passage/response persistence yasak |
| Embedding cache | Bellek içi process cache olabilir | Persistent cache explicit on ise vector/hash; v1 off | Server-only adapter | Opsiyonel local ML | Hayır | v1 read/write yok; olası eski `embedding_cache` satırları D8-4B preflight'ta aggregate incelenir |
| Hosting/security metadata | Tarayıcı/network cache | Supabase/Vercel platform logları | IP, request metadata, safe error/telemetry | Supabase/Vercel | Uygulama export'unda değil | Vendor retention ve deletion yetkili privacy incelemesine bağlı |

## Privacy closure sınırı

- Factual export bugün library/progress ve theme/goal sözleşmelerini kapsar; Auth, profile assets ve tüm sosyal/notification verisini tek paket halinde kapsayan account export yoktur.
- Uygulamada self-service account-wide deletion yoktur. Owner CRUD/tombstone ve asset delete, Auth hesabı ile tüm ilişkili verinin silinmesiyle aynı şey değildir.
- Gerçek operator/contact, privacy/aydınlatma, vendor/foreign processing, retention ve hesap/veri silme talep yolu repository'den doğrulanamaz. Sonuç `MANUAL_OPERATOR_INFORMATION_REQUIRED` ve kanonik tabloda `BLOCKED_EXTERNAL`dır; placeholder eklenmemiştir.
- Public signup kapalı hedeflenir; mevcut hosted hesaplar için privacy yükümlülükleri devam eder.
