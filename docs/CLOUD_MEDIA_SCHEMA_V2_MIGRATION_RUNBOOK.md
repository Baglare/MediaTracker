# Cloud Media Schema V2 Migration Runbook

Bu belge D2B.1 additive migration paketinin rollback/roll-forward sınırını tanımlar. Paket boş test projesinde doğrulanmıştır; production'a uygulanmamıştır.

## Uygulama sırası

1. Staging/production üzerinde `supabase/d2b1_cloud_media_v2_preflight.sql` read-only çalıştırılır.
2. Preflight row count, owner-record fingerprint, orphan/cross-owner ilişki ve RLS çıktıları saklanır.
3. `20260727120000_cloud_media_schema_v2_additive.sql` tek transaction olarak uygulanır.
4. `supabase/d2b1_cloud_media_v2_post_migration.sql` read-only çalıştırılır.
5. Preflight/post row count ve owner-record fingerprint değerleri eşleştirilir.
6. RPC CAS, idempotency, tombstone ve RLS smoke testleri ayrı staging kullanıcılarıyla tamamlanmadan client dual-write açılmaz.

## Roll-forward

- Migration mevcut PK, FK, external unique index, kolon ve direct table yolunu korur.
- `row_pk`/`log_pk`, owner + record ID'den immutable generated UUID olarak deterministik üretilir. Mevcut `updated_at` trigger'larını çalıştıran toplu data update yapılmaz.
- Canonical identity kolonları nullable kalır ve unique değildir.
- Revision trigger'ı legacy insert/update için de revision'ı server tarafında üretir; CAS garantisi yalnız yeni RPC yolunda vardır.
- Yeni RPC stabil operation ID'yi owner-scoped ledger'da saklar. Aynı operation ID + aynı request aynı sonucu döndürür; farklı request reddedilir.
- Media/progress delete yeni RPC'de tombstone'dur. Eski direct hard-delete yolu bu fazda uyumluluk için açıktır.

## Rollback

Client dual-write açılmadan önce migration transaction'ı hata verirse PostgreSQL bütün paketi geri alır. Migration başarıyla commit edildikten sonra otomatik destructive down migration çalıştırılmamalıdır.

Geri dönüş gerekirse:

1. Yeni RPC çağrıları durdurulur ve yeni client özelliği kapatılır.
2. Operation ledger, tombstone ve canonical kolonlarının kullanılıp kullanılmadığı read-only doğrulanır.
3. Eski client read/write yolu kullanılmaya devam eder; additive kolonlar güvenle yok sayılır.
4. Tombstone veya operation kaydı oluşmuşsa kolonlar, ledger veya revision bilgisi silinmez. Sorun düzeltilerek roll-forward tercih edilir.
5. Ancak staging kanıtı, sıfır V2 operation ve doğrulanmış snapshot varsa ayrı, açıkça onaylanan bir cleanup migration düşünülebilir. Bu D2B.1 paketinde cleanup/drop yoktur.

## Bilinen geçiş sınırları

- Global `id` PK bu fazda korunur; aynı record ID'nin iki owner altında birlikte saklanması enforcement/PK geçişine kadar mümkün değildir. Yeni RPC bunu `record_id_unavailable` conflict'i olarak döndürür.
- Existing `(user_id,external_source,external_id)` unique index korunur; exact provider duplicate upload'ı bu fazda hâlâ engellenebilir.
- Legacy direct upsert expected revision göndermez; trigger revision üretse de stale-write conflict'i yalnız yeni RPC önler.
- Legacy direct delete hard-delete yapabilir ve tombstone protokolünü bypass eder.
- Generated `lib/supabase/types.ts`, client mapper ve queue payload sözleşmesi migration uygulanıp doğrulanmadan değiştirilmez.
- XP/social/recommendation canonical key sözleşmeleri bu paketin dışındadır.

## D2B.2A istemci adapter'ı

- `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED=true` yalnız kontrollü test/rollout ortamında V2 transport'u açar. Varsayılan kapalıdır ve mevcut PostgREST upsert/hard-delete yolu çalışmayı sürdürür.
- Queue envelope sürümü `2` ve key biçimi `mediaTracker:queue:v2:<owner-scope>:cloudSync` olur. Eski owner-scoped v1 array ilk okumada doğrulanarak V2 envelope'a kopyalanır; kaynak silinmez.
- V2 queue öğesi stabil `operationId`, `expectedRevision`, `transport` ve server conflict özetini taşır. Dispatch başlamış işlem coalescing ile yeni bir operation'a dönüştürülmez.
- Media işlemleri `apply_media_item_sync_operation`, progress upsert işlemleri `apply_progress_log_sync_operation` RPC'sine gider. Canonical identity payload'dadır; local record ID ayrı `p_record_id` argümanıdır.
- Revision yalnız doğrulanmış RPC sonucundan owner-scoped `cloudMediaV2State` alanına yazılır. `revision_mismatch`, `tombstoned`, `record_id_unavailable` ve `media_target_unavailable` local kaydı değiştirmeden queue öğesini bloklar.
- Network/sonucu bilinmeyen hata queue öğesini aynı operation ID ile retryable bırakır. Guest RPC çağırmaz; owner generation kontrolü stale sonucu yeni hesaba uygulamaz.
- Conflict çözüm UI'si, otomatik local/cloud merge ve legacy yolun kapatılması bu fazın dışındadır.
