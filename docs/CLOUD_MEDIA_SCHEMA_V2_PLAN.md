# Cloud Media Schema V2 Planı

Bu belge D2A salt-okunur denetiminin sonucudur. Kanıtlar yalnız repository içindeki `supabase/schema.sql`, `supabase/migrations/`, `lib/supabase/`, local sync queue ve ilgili XP/social/recommendation kodundan gelir. Canlı Supabase projesine bağlanılmadı; production şeması, policy'leri, veri dağılımı ve uygulanmış migration listesi **doğrulanamadı**.

## 1. Mevcut tablo ve sync haritası

| Alan | Repository'de doğrulanan yapı | Mevcut akış |
| --- | --- | --- |
| `public.media_items` | `supabase/schema.sql`: global `id text primary key`; `user_id -> auth.users`; owner RLS; `(user_id, external_source, external_id)` partial unique; `deleted_at` mevcut | `toMediaRow()` local `MediaItem.id` değerini row `id` olarak yazar. `uploadMediaItems()` `onConflict: "id"` ile upsert eder. `fetchMediaItems()` yalnız `deleted_at is null` satırları indirir. |
| `public.progress_logs` | Global `id text primary key`; `user_id -> auth.users`; `media_id -> media_items.id on delete set null`; owner RLS | `toProgressLogRow()` `ProgressLog.mediaId` değerini `media_id` olarak yazar. Upload `onConflict: "id"` kullanır. Log ve media ayrı çağrılarda yazılır. |
| Silme | `media_items.deleted_at` kolonu var; istemci tombstone yazmıyor | `deleteMediaItem()` owner + `id` filtresiyle fiziksel `.delete()` yapar. `clearCloudData()` logları, sonra medyaları hard-delete eder. |
| Download/merge | Revision, operation ID veya server conflict kararı yok | Download tam cloud snapshot döndürür. Manuel merge `externalSource + externalId`, ardından record ID ile local-first ekleme yapar; alan/revision merge'i yapmaz. |
| Durable queue | `mediaTracker:queue:v1:<owner>:cloudSync`; owner-scoped; entity + record ID bazında coalescing | Queue ID ve `dispatchStartedAt` durable'dır; aktif owner/generation stale sonucu engeller. Queue operation ID cloud repository/RPC'ye gönderilmez. Remote idempotency yalnız aynı row ID için upsert/delete semantiğine dayanır. |
| Canonical Identity V2 | Local `MediaItem.identity`; `v2:<source>:<namespace>:<stable-id>` | `toMediaRow()` identity alanını ve private identity metadata'sını özellikle göndermez. `fromMediaRow()` external alanlardan veya legacy record ID'den yeniden türetir. |

`lib/supabase/types.ts` gerçek generated çıktı değil, kendi başlığında belirtildiği üzere elle tutulan minimal bir taslaktır. `Relationships: []` olması `schema.sql` içindeki progress FK'sini yansıtmaz. Ayrıca mevcut `supabase/migrations/` altında `media_items` veya `progress_logs` oluşturan/değiştiren bir migration bulunamadı; bu iki tablonun production'a hangi sırayla ve hangi sürümle uygulandığı repository'den kanıtlanamıyor.

## 2. Bulunan riskler

- Global media/log PK'leri aynı local record ID'nin iki farklı owner altında bulunmasını engeller. RLS satırı gizlese de PK çakışmasını çözmez; `onConflict: "id"` owner kimliğini conflict target'a dahil etmez.
- `(user_id, external_source, external_id)` unique index'i aynı provider kaynağına ait exact duplicate local record'ların cloud'a birlikte çıkmasına izin vermez. Canonical Identity V2 için benzer bir unique constraint eklenmemelidir.
- Progress FK yalnız `media_id` üstündedir; `progress_logs.user_id` ile hedef `media_items.user_id` eşitliği constraint olarak kodlanmamıştır.
- Media ve log upload'ları transaction değildir. Media başarılı, log başarısız olabilir; manuel replace/download da eşzamanlı local değişiklikleri revision kontrolü olmadan ezebilir.
- `updated_at` server trigger ile değişse de istemci expected revision göndermez. Son yazan kazanır; stale cihaz yeni veriyi sessizce ezebilir.
- Hard delete tombstone bırakmaz. Offline/eski cihazdaki upsert silinen kaydı yeniden oluşturabilir.
- Queue ID sunucuya ulaşmadığı için crash sonrası retry'nin aynı logical operation olduğunu server kanıtlayamaz. Aynı payload upsert'i çoğunlukla idempotent olsa da side-effect veya conflict sonucu için operation ledger yoktur.
- Canonical identity cloud'a yazılmadığından namespace ayrımı, manual UUID ve unresolved durumu round-trip'te korunamaz. Özellikle legacy/manual cloud kaydı `row.id` tabanlı identity'ye yeniden türetilebilir.
- XP `buildSafeMediaSnapshot()` ve social `mediaToSocialSnapshot()` hâlâ deprecated `canonicalMediaKey()` legacy anahtarını kullanır. `xp_media_entitlements` PK'si ve `social_recommendations.canonical_media_key`/dedupe sözleşmeleri buna bağlıdır. Recommendation local eşleme V2 + alias + legacy fallback yapar; remote sözleşme legacy'dir.
- Local dosyalar production row sayıları, mevcut PK/unique ihlalleri, orphan loglar, aktif RLS policy'leri, eski client sürümleri ve sorgu planları hakkında kanıt sağlamaz.

## 3. Önerilen hedef kolon, constraint, index ve RLS

İlk migration yalnız additive olmalı; mevcut `id`, FK ve API yolu korunmalıdır.

### `media_items`

- `row_pk uuid` — önce nullable/default'lı additive kolon; backfill ve doğrulama sonrasında fiziksel PK adayı.
- Mevcut `id text` — `MediaItem.id`, yani record ID olarak kalır. Hedef benzersizlik `unique (user_id, id)` olur; global PK ancak bütün consumer'lar geçtikten sonra kaldırılır.
- Nullable identity kolonları: `canonical_version smallint`, `canonical_key text`, `canonical_source text`, `canonical_namespace text`, `canonical_stable_id text`, `identity_status text`.
- `revision bigint`, server tarafından artırılan monotonic sürüm.
- Mevcut `deleted_at` tombstone olarak kullanılır; ek olarak `last_operation_id text` ve server-controlled `updated_at`.
- Canonical alanlar için “hepsi null/unresolved veya tutarlı V2 seti” check'i. Key client'tan körlemesine kabul edilmemeli; mutation RPC source/namespace/stable ID'den beklenen key'i doğrulamalıdır.

Indexler:

- Unique `(user_id, id)`; canonical identity için **non-unique** partial `(user_id, canonical_key) where canonical_key is not null`.
- `(user_id, deleted_at, updated_at)` ve incremental sync için `(user_id, revision)`.
- Mevcut external lookup index'i non-unique kalabilir; `media_items_user_external_unique` enforcement aşamasında doğrulanmış biçimde non-unique index'e dönüştürülmelidir.

### `progress_logs`

- `log_pk uuid` fiziksel PK adayı; mevcut `id text` owner-scoped log record ID olarak kalır.
- Unique `(user_id, id)`.
- `media_id` local record ilişkisi olarak korunur; hedef composite FK `(user_id, media_id) -> media_items(user_id, id)`.
- Append-only sözleşme server'da uygulanmalı: aynı owner/log ID + aynı payload idempotent, farklı payload conflict. Ürün log delete'i destekleyecekse `revision`, `deleted_at`, `last_operation_id` aynı tombstone protokolünü kullanmalıdır.

### RLS ve mutation sınırı

- Media, progress ve operation ledger tablolarında `auth.uid() = user_id` select/insert/update/delete kontrolleri ayrı ayrı doğrulanmalıdır.
- Owner değiştiren update yasak olmalı. Progress composite FK owner bütünlüğünü RLS'ye bırakmamalıdır.
- Server-authoritative mutation RPC tercihen security-invoker olmalı. Security-definer gerekirse `search_path` sabitlenmeli, `auth.uid()` ve bütün owner parametreleri fonksiyon içinde doğrulanmalıdır.
- Migration sonrası `lib/supabase/types.ts` CLI ile yeniden üretilmeli; elle eklenen alanlar production kanıtı sayılmamalıdır.

Canonical key üzerinde unique constraint yoktur: farklı record ID'li exact duplicate kayıtlar bilinçli olarak mümkündür ve D1C duplicate/merge katmanında yönetilir.

## 4. Media ve progress ilişki modeli

Record ID ile canonical identity ayrı tutulur:

- `media_items.id` local/cross-device record instance kimliğidir.
- `canonical_key` logical media identity'dir ve non-unique'tir.
- `progress_logs.media_id` canonical key'e değil record ID'ye bağlanır.
- Hedef composite FK owner + record bağını doğrular; media tombstone olduğunda log ilişkisi korunur. Hard delete yalnız retention süresi ve doğrulanmış purge sonrasında düşünülebilir.
- Additive geçişte eski `progress_logs.media_id -> media_items.id` FK korunur; aynı-owner backfill doğrulanmadan composite FK enforcement yapılmaz.

Record merge/redirect, XP entitlement consolidation veya progress log remap bu cloud schema planının parçası değildir.

## 5. Revision ve tombstone semantiği

Önerilen tek mutation kapısı, örneğin `apply_media_sync_operation`, şu girdileri alır: stable client `operation_id`, record ID, operation türü, payload ve `expected_revision`.

- Create: record yoksa revision 1 oluşturur; aynı operation tekrarında önceki sonucu döndürür.
- Update: yalnız `expected_revision = current revision` ise uygular ve revision artırır; değilse server mevcut row/revision ile explicit conflict döndürür.
- Delete: hard delete yerine `deleted_at` yazar, payload'ı gerekli minimum düzeye indirir ve revision artırır.
- Restore: tombstone'u yalnız güncel revision ve explicit restore operation ile kaldırır. Stale upsert tombstone'u canlandıramaz.
- Download: aktif ve tombstone satırlarını revision cursor ile döndürür; client tombstone'u local delete/redirect politikasına uygular.
- Purge: ayrı retention ve bütün client watermark stratejisi kanıtlanmadan çalışmaz.

Server `updated_at`, `revision` ve operation sonucu için authoritative olmalıdır; client timestamp tek başına conflict çözmez.

## 6. Queue ve idempotency uyumu

Owner-scoped durable queue ve generation guard korunabilir. Gerekli uyarlamalar:

- Mevcut queue item ID veya bundan türetilen stabil `operation_id` remote RPC'ye gönderilir; retry aynı ID ve payload hash ile yapılır.
- Yeni owner + entity + record coalescing devam eder, fakat dispatch başlamış operation sessizce başka operation'a dönüştürülmez.
- Owner-scoped `media_sync_operations` ledger'ında unique `(user_id, operation_id)` tutulur. Aynı ID + aynı payload hash önceki sonucu döndürür; aynı ID + farklı hash reddedilir.
- Queue ancak durable server sonucu alındıktan sonra silinir. Network sonucu belirsizse aynı operation ID ile retry yapılır.
- Upsert-before-delete sırası merge/import gibi çoklu planlarda korunur; queue durability network'ten önce gelir.
- Guest queue remote'a gönderilmez. Owner generation kontrolü, stale async sonucun yeni owner state'ini etkilemesini engellemeye devam eder.

Operation ledger side-effect idempotency sağlar; canonical identity unique constraint veya client timestamp bunun yerine kullanılamaz.

D2B.2A ile bu sözleşme opt-in istemci adapter'ına bağlanır. Queue schema v2, stabil `operationId`, enqueue anındaki `expectedRevision` ve `transport` bilgisini durable tutar. Server sonucu runtime codec ile doğrulanmadan revision güncellenmez veya queue öğesi silinmez. Controlled conflict queue'da bloklu kalır; local media/progress state'i sessizce overwrite ya da delete edilmez. Feature flag varsayılanı kapalı olduğundan production legacy yolu bu fazda değişmez.

## 7. Aşamalı rollout

1. **Additive schema:** Nullable identity/revision/operation kolonlarını, fiziksel UUID adaylarını, operation ledger'ı ve non-unique indexleri ekle. Eski PK/FK/unique ve istemci yolu korunur.
2. **Dual-read/write:** Yeni RPC opt-in adapter ile başlar; legacy PostgREST yolu fallback olarak kalır. Queue V2 envelope'a dual-read migration yapar. Generated type'lar gerçek bağlı şemadan ayrıca yenilenir; elle tutulan tipler generated kanıtı sayılmaz. Read yeni alanları tercih edip eski row'ları legacy fallback ile açar; eski client hard-delete davranışı ayrıca izlenir.
3. **Backfill:** `row_pk/log_pk`, `revision` ve owner-record alanlarını batch'lerle doldur. External identity yalnız source + namespace güvenilir biçimde türetilebiliyorsa yazılır. Manual/unresolved identity uydurulmaz; sonraki doğrulanmış client upload'ı beklenir. Progress ilişkisi yalnız aynı-owner join ile backfill edilir.
4. **Doğrulama:** Null/duplicate dağılımları, cross-owner FK ihlalleri, external unique çakışmaları, tombstone geri doğma senaryosu, operation replay ve RLS testleri çalıştırılır. Eski/yeni okuma sonuçları sayım değil içerik fingerprint'i ile karşılaştırılır.
5. **Enforcement:** `(user_id,id)` unique ve composite progress FK doğrulanır; revision/RPC zorunlu yapılır. External unique non-unique'e çevrilir. Fiziksel PK geçişi ancak bütün FK ve client'lar hazırsa yapılır.
6. **Eski yolun kaldırılması:** Queue drain ve minimum client sürümü kanıtlandıktan sonra doğrudan PostgREST `onConflict:"id"` ve hard-delete kapatılır. Eski kolon/FK'ler en az bir geri dönüş penceresi boyunca tutulur.

XP/social remote key migration, recommendation remote sözleşme değişikliği ve entitlement consolidation bu rollout'a dahil değildir.

## 8. Rollback ve veri kaybı riskleri

- Additive kolonlar eski client tarafından yok sayılabildiği için ilk aşama geri alınabilir; destructive PK/FK/index değişiklikleri aynı migration'a konmamalıdır.
- Eski client hard-delete yapabiliyorsa tombstone garantisi delinmiş olur. Enforcement öncesi minimum client sürümü veya server'da eski doğrudan delete'i engelleyen kontrollü geçiş gerekir.
- Backfill identity tahmini manual UUID'yi veya TMDB/AniList namespace'ini yanlış seçerse kalıcı yanlış eşleme yaratır; belirsiz satır null/unresolved kalmalıdır.
- `media_items_user_external_unique` erken kaldırılırsa eski UI'nın varsaydığı duplicate engeli değişir; erken korunursa local exact duplicate upload'ı başarısız olur. Geçiş ölçümlü yapılmalıdır.
- Global PK'yi erken kaldırmak mevcut progress FK, PostgREST `onConflict` ve eski client'ları kırar. Önce yeni unique/FK doğrulanmalı, sonra PK geçişi yapılmalıdır.
- Tombstone bilgisini rollback sırasında hard-delete etmek veri kaybı ve stale cihazdan geri doğma riski taşır. Rollback yeni kolonları okumayı durdurabilir ama tombstone/operation ledger verisini silmemelidir.
- Production şeması, veri hacmi ve aktif client dağılımı canlı bağlantı olmadan doğrulanamadığından uygulama migration'ı öncesi ayrı read-only production audit zorunludur.

## 9. Uygulama testleri ve manuel cloud smoke

Otomatik testler:

- Migration contract: additive kolonlar, canonical non-unique index, owner-record unique, composite progress FK ve bütün RLS policy'leri.
- Mapper dual-read/write: legacy row, valid V2, manual UUID, unresolved identity ve unknown-column compatibility.
- RPC: create/update/delete/restore revision success; stale revision conflict; aynı operation replay; aynı ID/farklı payload reddi.
- Tombstone: offline stale upsert'in kaydı geri getirmemesi.
- Queue: crash/retry aynı operation ID; unknown network sonucu; owner switch stale completion; guest flush yok.
- Cross-owner: aynı record/log ID iki owner'da güvenli; başka owner row'una read/write/delete yok; progress cross-owner FK reddi.
- Exact duplicate: aynı canonical key, farklı record ID birlikte saklanır.
- XP/social/recommendation regression: legacy key, entitlement sayıları, dedupe ve remote payload sözleşmeleri değişmez.

Migration uygulama aşamasındaki manuel cloud smoke:

1. Ayrı staging Supabase projesinde mevcut şema/veri snapshot'ı ve generated type diff'i alınır.
2. User A/B aynı record ID'yi, aynı canonical key'i ve farklı payload'ı ayrı ayrı yazar; owner izolasyonu doğrulanır.
3. İki cihaz aynı revision'ı düzenler; biri başarılı, diğeri explicit conflict alır.
4. Cihaz A siler, cihaz B offline eski upsert'i yollar; tombstone geri doğmaz.
5. Network yanıtı kesilerek aynı operation ID retry edilir; tek logical sonuç oluşur.
6. Media/log kısmi hata, composite FK ve log idempotency senaryoları denenir.
7. RLS select/insert/update/delete ve RPC authorization testleri anon, doğru user ve yabancı user ile çalıştırılır.
8. Rollback penceresinde eski client read yolu ve yeni client dual-read karşılaştırılır.

Bu smoke adımlarının hiçbiri D2A sırasında çalıştırılmadı; canlı/staging veritabanı durumu **doğrulanamadı**.
