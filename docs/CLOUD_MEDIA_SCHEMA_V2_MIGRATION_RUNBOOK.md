# Cloud Media Schema V2 Migration Runbook

Bu belge D2B.1 additive migration paketinin rollback/roll-forward sınırını ve D8'de yapılacak D2C.1 production cutover hazırlığını tanımlar. Proje kilometre taşı kaydına göre D2B.0 ve D2B.1 production veritabanına uygulanmıştır; tekrar uygulanmamalıdır. D2C.1 production'a uygulanmamıştır ve D8 release aşamasına bırakılmıştır. Bu dokümantasyon turunda canlı DB doğrulaması yapılmamıştır.

## D2B.1 tarihsel uygulama/doğrulama sırası

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

## D2B.2B conflict UI ve rollout

- Cloud Sync kartı owner-scoped queue'dan `pending`, `in-flight`, `retryable`, `blocked`, son sync/hata ve aktif `legacy | v2` adapter bilgisini gösterir. Logout/account switch önceki owner özetini göstermez.
- `revision_mismatch`: remote revision/özet açıkça yenilenir. Kullanıcı cloud sürümünü local kabul edebilir, güncel revision üzerinden yeni logical operation oluşturabilir veya blocked işlemi erteleyebilir. Mevcut operation ID'nin payload/revision anlamı değiştirilmez.
- `tombstoned`: local kayıt otomatik canlandırılmaz. Kullanıcı silmeyi local kabul edebilir veya güncel server revision ile explicit `restore` operation oluşturabilir.
- `media_target_unavailable`: doğrulanmış local parent media önce queue'ya eklenir; progress yeni logical operation olarak hemen arkasına yazılır. Parent yoksa işlem blocked kalır.
- `record_id_unavailable`: additive fazın global PK sınırı olarak manual-only gösterilir. Otomatik record ID rewrite veya merge yapılmaz.
- Bilinmeyen server conflict reason'ı runtime adapter tarafından `unknown` generic blocked sonucuna düşürülür; raw payload/stack/SQL kullanıcıya gösterilmez.
- Blocked öğeler otomatik flush/retry dışında kalır. Network hataları retryable kalır ve aynı operation ID ile mevcut retry davranışını sürdürür.
- `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED` varsayılanı kapalıdır. UI flag açmaz; kapalı ortamda yalnız `Legacy` adapter görünür. Test ortamında V2 için environment değişkeni `true` verilir.
- Production rollout sırası: test/staging canlı client testi, sınırlı opt-in cohort, blocked/retryable gözlemi, rollback flag doğrulaması ve ancak sonra ayrı production kararıdır. Legacy yol bu fazda kaldırılmaz.

## D2C.1 uygulama sırası

D2C.1 global `id` primary key sınırını kaldırdığı için additive D2B.1 kadar geriye uyumlu değildir. Migration yalnız aşağıdaki V2 client gate tamamlandıktan sonra uygulanabilir:

1. `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED=true` kontrollü production rollout ile doğrulanır.
2. Aktif istemcilerin media/progress mutation trafiğinin V2 RPC yolundan geldiği gözlemlenir.
3. Legacy adapter ile direct PostgREST upsert/hard-delete durdurulur. UI'da adapter durumu `v2` olmalıdır.
4. `supabase/d2c1_owner_scoped_pk_preflight.sql` read-only çalıştırılır; owner-record fingerprint, row count, duplicate ve orphan/cross-owner sonuçları saklanır.
5. Veritabanının point-in-time recovery ayarı doğrulanır ve migration öncesi backup/snapshot referansı kaydedilir.
6. `20260728120000_owner_scoped_primary_key_enforcement.sql` bakım penceresinde tek transaction olarak uygulanır.
7. `supabase/d2c1_owner_scoped_pk_post_migration.sql` çalıştırılır; preflight/post row count ve fingerprint değerleri karşılaştırılır.
8. İki authenticated test kullanıcısı aynı record ID ile ayrı media ve progress kayıtları oluşturur. RLS izolasyonu, CAS revision, tombstone, restore ve aynı operation ID retry tekrar doğrulanır.

Migration `media_items.row_pk` ve mevcut adıyla `progress_logs.log_pk` kolonlarını fiziksel primary key yapar. `(user_id,id)` unique constraint'leri owner içindeki record kimliğini korur. Progress ilişkisi yalnız `(user_id,media_id) -> media_items(user_id,id)` üzerinden yürür. Canonical identity index'i non-unique kalır; exact duplicate kayıtlar desteklenmeye devam eder.

Migration direct `INSERT/UPDATE/DELETE` yetkilerini `anon` ve `authenticated` rollerinden kaldırır; mevcut owner-scoped `SELECT` ve `auth.uid()` tabanlı RLS korunur. V2 security-definer RPC'leri owner + record ID ile doğru satırı çözer. Bu nedenle migration uygulandıktan sonra legacy adapter'a production flag ile geri dönmek güvenli rollback değildir.

## D2C.1 rollback ve roll-forward sınırı

- Transaction commit etmeden hata oluşursa constraint ve RPC değişiklikleri atomik geri alınır.
- Commit sonrasında aynı record ID farklı owner'larda kullanılabilir. Global `id` PK'ye otomatik dönüş bu kayıtları temsil edemez; destructive down migration yoktur.
- Sorun halinde V2 mutation trafiği kontrollü biçimde durdurulur, queue ve operation ledger korunur, read-only erişim sürdürülür ve düzeltici roll-forward migration hazırlanır.
- Revision, tombstone ve idempotency ledger satırları silinmez veya yeniden numaralandırılmaz.
- Production flag migration sonrasında legacy'ye çevrilmez. Uygulama rollback'i gerekiyorsa V2 RPC sözleşmesini koruyan önceki istemci sürümü kullanılmalıdır.
- Canlı DB uygulaması, backup/PITR kanıtı ve iki kullanıcı smoke sonucu bu repository paketinin dışında operasyonel onay gerektirir.

## D8 production cutover — D2C.1 enforcement

Production geçişi aşağıdaki sıradan sapmadan yapılır:

1. Production migration geçmişi doğrulanır; uygulanmış D2B.0/D2B.1 kayıtları ve D2C.1 read-only preflight sonuçları proje referansı ile arşivlenir.
2. PITR/backup geri yükleme noktası oluşturulur ve erişilebilirliği doğrulanır.
3. D2B.1 additive şema yeniden uygulanmadan post-verification ile doğrulanır.
4. Rollout guard içeren uygulama `NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE=d2b1` sözleşmesiyle kontrollü release adayı olarak doğrulanır.
5. `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED=true` kontrollü rollout ile açılır; production varsayılanı repository içinde değiştirilmez.
6. İki kullanıcıyla media/progress, RLS, CAS conflict, tombstone ve restore smoke'u çalıştırılır.
7. Legacy direct DML trafiğinin kalmadığı gözlem/DB audit kanıtıyla doğrulanır.
8. Bakım penceresi açılır, `NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE=true` yayınlanır, deployment epoch değiştirilir ve D2C.1 uygulanır.
9. D2C.1 post-verification ile row count/fingerprint ve iki kullanıcı smoke'u yeniden doğrulanır; uygulama `schemaStage=d2c1`, V2 açık ve bakım kapalı deploy edilir.
10. Incident halinde legacy flag'e dönülmez. Queue/ledger korunur, mutation durdurulur ve V2 sözleşmesini koruyan roll-forward uygulanır.

Runtime uyumluluk matrisi `legacy+legacy`, `d2b1+legacy`, `d2b1+v2` ve `d2c1+v2` kombinasyonlarını kabul eder. `legacy+v2`, bilinmeyen stage ve özellikle `d2c1+legacy` fail-closed davranır. D2C.1 şemasında flag yanlışlıkla kapalı olsa bile yeni mutation legacy transport olarak oluşturulmaz; V2 queue item olarak korunur ve uygulama yenilenene kadar dispatch edilmez.

`/api/cloud/rollout` yalnız public stage, maintenance, deployment epoch ve minimum client sürümünü `no-store` olarak döndürür. Açık sekmeler bunu periyodik doğrular. Bakım veya epoch/client değişiminde sync durur; kullanıcı kontrollü yenileme mesajı görür. Rollout guard'dan eski sekmeler D2C.1 öncesi ayrıca bakım/reload ve legacy trafik drain kontrolü gerektirir.

Canlı test komutları yalnız açık `SUPABASE_TEST_*` değişkenleriyle çalışır ve `SUPABASE_TEST_URL`, `NEXT_PUBLIC_SUPABASE_URL` veya `SUPABASE_PRODUCTION_URL` ile aynı origin ise reddedilir. Operatör ayrıca dashboard project ref'ini preflight çıktısındaki beklenen ref ile elle eşleştirmelidir. Anon key dışında secret/service-role client bundle'a veya test çıktısına konmaz.

Network nedeniyle rollout sözleşmesi doğrulanamazsa local kullanım sürer fakat cloud mutation dispatch edilmez. UI yalnız kontrollü hata kodu/mesajı gösterir; raw SQL, stack trace, operation payload, personal note ve owner UID gösterilmez. Guest local-first davranışı, XP ve social queue'ları bu gate'in dışındadır.
