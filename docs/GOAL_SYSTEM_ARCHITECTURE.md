# Goal System Mimarisi

Bu belge D5-1–D5-5 sonucundaki Goal System sınırlarını tek yerde özetler. Ayrıntılı sözleşmeler: [domain](./GOAL_SYSTEM_DOMAIN.md), [yerel kalıcılık](./GOAL_SYSTEM_LOCAL_PERSISTENCE.md), [evaluation](./GOAL_SYSTEM_EVALUATION.md), [Cloud](./GOAL_SYSTEM_CLOUD_SYNC.md) ve [Portable Backup](./PORTABLE_BACKUP_FORMAT.md).

## Katmanlar

1. **Goal definition:** `features/goals/domain` içindeki strict, versioned modeldir. Yalnız kimlik, başlık, origin, scope, metric, schedule, lifecycle ve timestamp taşır. `currentValue`, yüzde, attainment veya completion sonucu taşımaz.
2. **Owner-scoped local aggregate:** `goals` personal-data domain'i guest ve her authenticated owner için ayrı `current/temp/backup` anahtarları, runtime codec, safe-write ve quarantine kullanır. Repository doğrulanmış local write tamamlanmadan Cloud operation başlatmaz.
3. **Evaluation read-model:** Mevcut MediaItem ve ProgressLog snapshot'ından yeniden üretilir. Lifecycle kullanıcı kararını; attainment türetilmiş dönem sonucunu ifade eder. Evaluation hiçbir store, backup veya Cloud payload'ına yazılmaz.
4. **Suggestions:** Yalnız tamamlanmış 4 hafta/3 ay pencerelerindeki trusted contribution'lardan bounded median hedef üretir. En az üç katkılı dönem gerekir. Öneri ephemeral'dır; yalnız kullanıcı onayı `origin=suggested` aktif Goal oluşturur.
5. **Portable Backup V3:** V2 import uyumluluğunu korur ve yalnız Goal definition taşır. Exact-copy media remap kesin `mediaRecordId` haritasını kullanır; farklı aynı-ID payload açık conflict'tir. Queue, revision, conflict ve evaluation portable değildir.
6. **Goal Cloud V1:** Ayrı owner-scoped tablo, operation ledger ve RPC kullanır. Durable queue local-first çalışır; revision/CAS, idempotent operation ID ve tombstone sessiz overwrite'i engeller. Cloud metadata Goal domaininden ayrı sidecar'dadır.

## Trusted ProgressLog politikası

`amount` toplanmaz; `previousProgress → newProgress` transition'ı kullanılır. Aynı ID aynı payload bir kez, farklı payload hiç sayılmaz. `added`, malformed, detached ve incompatible log contribution değildir. Zincir kopukluğu son güvenilir state'i korur ve konservatif undercount üretir. Guest aynı-snapshot coalescing yapabilir; authenticated owner'da pending dahil her yeni transition yeni ID alır. Gönderilmiş/acknowledged log düzeltmesi yeni UUID'li `manual_adjust` kaydıdır.

Completion kanıtı `complete`, sonra `manual_adjust`, sonra diğer güvenilir threshold transition sırasındadır. Current status ayrıca `completed` olmalıdır. Logsuz/imported completion tarih uydurularak sayılmaz; aynı medya bir dönemde en fazla bir contribution üretir.

## Reaktivite ve hesaplama yapısı

Owner snapshot'ı bir kez `mediaById`, `mediaIdsByType` ve `logsByMediaId` indekslerine dönüştürülür. Her Goal bütün ham log listesini yeniden taramaz; yalnız scope'a giren medya zincirlerini değerlendirir. Snapshot cache'i hook instance/owner ile sınırlıdır. Progress mutation, import veya Cloud-local merge yeni local snapshot oluşturur ve navigation ya da Cloud round-trip beklemeden evaluation'ı yeniler. Tema ve collapsible state evaluator bağımlılığı değildir.

## Conflict ve rollout

Conflict alan bazında otomatik birleştirilmez. Kullanıcı Cloud sürümünü kabul eder, yereli güncel revision üzerine CAS ile yeniden yollar, yeni UUID'li domain-valid kopya saklar veya işlemi blocked bırakır. Remote tombstone kabulü local tanımı kaldırır; local delete conflict'i definition snapshot taşıyan tombstone ile yeniden denenir. Çok-adımlı conflict çözümü başarısızsa önceki Goal/queue/sidecar snapshot'ı geri yüklenir.

Goal rollout mevcut Cloud durumuna eklenir: `goalSchemaStage=absent|v1` ve `goalV1Enabled`. Flag kapalıyken Goal local çalışır. Flag açık fakat şema hazır değilse yalnız Goal sync fail-closed durur; Media Cloud Sync devam eder. `20260803120000_goal_cloud_v1_additive.sql` production'a uygulanmamıştır. D2C.1 cutover, Goal preflight/migration/post-check ve feature enable sırası D8 kapısıdır.

Kabul adımları için [manuel testler](./GOAL_SYSTEM_MANUAL_TESTS.md), kısa anlatım için [demo scripti](./GOAL_SYSTEM_DEMO_SCRIPT.md) kullanılır.
