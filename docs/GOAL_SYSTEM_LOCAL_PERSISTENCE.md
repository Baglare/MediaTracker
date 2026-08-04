# Goal System D5-2 — Yerel Kalıcılık ve Manuel Yönetim

D5 birleşik görünüm: [Goal System Mimarisi](./GOAL_SYSTEM_ARCHITECTURE.md). D5-4 owner-scoped Cloud sidecar/queue ve Portable V3: [Goal System Cloud Sync](./GOAL_SYSTEM_CLOUD_SYNC.md).

Bu belge D5-1 [Goal domain sözleşmesinin](./GOAL_SYSTEM_DOMAIN.md) owner-scoped yerel uygulamasını tanımlar. Goal tanımı kalıcıdır; ilerleme sonucu değildir.

## Owner-scoped key ve envelope

Goal store mevcut personal-data altyapısında `goals` domain'i olarak kayıtlıdır. Current key:

`mediaTracker:personal:v1:<guest|user-{id}>:goals`

Personal-data dış envelope'i `format`, `domain`, `schemaVersion`, `writerVersion`, `ownerScope`, `writtenAt` ve `value` alanlarını taşır. `value` içindeki Goal store envelope'i:

```text
schemaVersion: 1
owner: guest | user:<id>
savedAt: ISO instant
goals: Goal[]
```

Guest ile authenticated owner ayrı key ve owner doğrulaması kullanır. Login/logout veya hesap değişiminde önceki owner snapshot'ı yeni owner hydration tamamlanana kadar gösterilmez. Guest hedefleri kullanıcı hesabına otomatik taşınmaz.

## Safe-write, codec ve corruption

Yazma sırası mevcut `current/temp/backup` sözleşmesini kullanır: temp yazımı, codec/read-back doğrulaması, geçerli current'ın backup'a alınması, current promotion ve temp temizliği. Promotion doğrulanamazsa önceki current geri yüklenir.

D5-1 `decodeGoal` her Goal kaydı için tek doğrulama otoritesidir. Store alternatif veya zayıf Goal tipi tanımlamaz. Store envelope'i de strict allowlist, owner ve ISO `savedAt` doğrulaması yapar.

Bozuk current raw payload `mediaTracker:quarantine:personal:goals:<timestamp>` altında kanıt olarak saklanır. Geçerli temp/backup recovery slotu varsa okunur. Yalnız bazı Goal kayıtları bozuksa geçerli, benzersiz UUID taşıyan kayıtlar kurtarılır; bozuk kayıtlar sessizce kabul edilmez. Kullanıcının sonraki başarılı mutation'ı, karantina kararından sonra doğrulanmış snapshot'ı atomik olarak current'a yazar.

## Repository ve lifecycle işlemleri

Repository `listGoals`, `getGoal`, `createGoal`, `updateGoal`, `cancelGoal`, `archiveGoal`, `reactivateGoal` ve `deleteGoal` işlemlerini sunar.

- Manuel create her zaman `origin=manual`, `lifecycle=active`, stabil UUID ve aynı `createdAt/updatedAt` ile başlar.
- Suggested kayıt yalnız D5-1 `approveGoalSuggestion` sınırından üretilebilir.
- Update `id`, `origin`, `lifecycle` ve `createdAt` alanlarını korur; `updatedAt` her başarılı mutation'da monoton ilerler.
- Cancel, archive ve reactivate ayrı lifecycle geçişleridir; attainment sonucu değildir.
- Delete fiziksel silmedir ve açık confirmation ister. D5-4 Cloud senkronu eklenirse bu işlem için tombstone ve revision sözleşmesi zorunludur.
- Codec/policy/media çözümü başarısızsa storage yazılmaz; duplicate ID overwrite edilmez.

## Exact media ilişkisi ve eksik medya

`scope.kind=media` create/update sırasında exact `mediaRecordId` ile mevcut kütüphane kaydına çözülür. Title, fuzzy eşleşme veya canonical snapshot fallback olarak kullanılmaz. Title ve canonical key yalnız görüntü/tutarlılık snapshot'ıdır.

Bağlı medya sonradan silinirse Goal kaydı korunur ve kartta “Bağlı medya bulunamadı” uyarısı görünür. Başka medyaya otomatik bağlanmaz. Media status değişikliği Goal tanımını silmez, iptal etmez ve Goal store'u yeniden yazmaz. D5-3 evaluator bu durumu `inactive_target`/`media_missing` sözleşmesiyle ele alacaktır.

## UI kapsamı ve evaluation ayrımı

`/goals` sayfası aktif, iptal ve arşiv listelerini; manuel create/edit; confirmation üzerinden lifecycle değişiklikleri ve fiziksel delete'i sunar. Form D5-1 scope/metric/date/timezone policy'lerini kullanır. Film ve visual novel progress birimi sunmaz; belirli medya + `completed_media` hedefi `targetValue=1` olur.

Goal kartları tanımın yanında [D5-3 evaluation sözleşmesinden](./GOAL_SYSTEM_EVALUATION.md) gelen gerçek, ephemeral ilerlemeyi gösterir. `currentValue`, yüzde, attainment veya dönem sonucu Goal store'da saklanmaz.

## D5-4'e bırakılan persistence kapsamı

Portable backup/import formatı D5-2'de değiştirilmedi. Goal export/import, additive ID conflict politikası ve media ID remap uygulaması D5-4'e aittir. Aynı Goal ID + aynı payload skip; aynı ID + farklı payload controlled conflict olmalıdır.

Cloud queue entity'si, Supabase tablo/RPC/RLS ve migration eklenmedi. D5-4 additive ayrı Goal tablosu, owner scope, revision/CAS, idempotent operation ID ve delete tombstone eklemelidir. MediaItem metadata Goal aggregate deposu olarak kullanılmamalıdır.

## D5-3 sonucu ve D5-4'e kalan kararlar

D5-3 aşağıdaki kararları [GOAL_SYSTEM_EVALUATION.md](./GOAL_SYSTEM_EVALUATION.md) içinde tamamlamıştır:

1. Completion contribution için güçlü dönem transition'ı ve current completed status birlikte gerekir.
2. `added`-completed/logsuz import sayılmaz; `insufficient_history` üretir.
3. Conflicting ID ve detached log contribution dışıdır; ID listesi deterministiktir.
4. Evaluation ve suggestion state'i bu local store'a yazılmaz.

D5-4 portable backup/import ile ayrı Cloud Goal aggregate'ını eklerken bu store envelope'ına türetilmiş sayaç koymamalıdır; immutable Cloud log/CAS ve fiziksel delete tombstone kararı da D5-4'e aittir.

## D5-4 uygulama notu

D5-4 bu ertelenen kapsamı [Portable V3 ve Goal Cloud V1](./GOAL_SYSTEM_CLOUD_SYNC.md) sözleşmesiyle ekledi. Goal envelope v1 değişmedi; revision/queue ayrı owner-scoped sidecar'dadır ve portable değildir.
