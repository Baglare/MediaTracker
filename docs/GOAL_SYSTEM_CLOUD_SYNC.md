# Goal System D5-4 — Backup ve Cloud Sync

## Kalıcı sınır

Cloud ve Portable Backup yalnız `Goal` tanımını taşır. `GoalEvaluation`, `currentValue`, yüzde, attainment, öneri geçmişi, queue, revision, conflict ve tombstone portable değildir. Evaluation her Cloud/local birleşiminden sonra yerel medya ve ProgressLog snapshot'ından yeniden türetilir.

## Portable Backup V3

V3, V2 domain'lerine `goals` ekler; V2 import desteği korunur. Goal codec tek doğrulama otoritesidir. Bozuk Goal uyarıyla dışlanır, sağlam kayıtlar korunur. Aynı ID + aynı payload `skip-same`, farklı payload `goal_id_conflict` üretir. Exact-copy media remap yalnız import planındaki kesin `mediaRecordId` haritasını kullanır; title/canonical/fuzzy remap yoktur. Eksik hedef Goal'u düşürmez. Transaction ve undo Goal store ile Goal queue snapshot'ını da kapsar.

## Owner-scoped Goal Cloud V1

Additive migration `20260803120000_goal_cloud_v1_additive.sql`, `public.goals`, `public.goal_sync_operations` ve `apply_cloud_goal_v1` ekler. RLS owner SELECT sağlar; authenticated doğrudan DML kapalıdır. RPC auth owner, operation hash, exact expected revision CAS, monoton revision ve tombstone uygular. Makine sonuçları `applied`, `idempotent_replay`, `revision_conflict`, `deleted_conflict`, `operation_id_reused`, `invalid_payload` değerleridir.

Revision ve last-sync `goalCloudState`, durable işlemler `goalCloudQueue` owner-scoped personal-data sidecar'larında tutulur; Goal domainine veya backup'a girmez. Yerel write önce tamamlanır, sonra upsert/tombstone enqueue edilir. Queue/ağ hatası yerel Goal'u geri almaz. Dispatch başlamamış aynı Goal işlemi coalesce edilebilir; dispatch başladıysa ayrı operation kalır. Retry bounded'dır.

Yerel olarak oluşturulup ilk upsert gönderilmeden silinen bir Goal'un tombstone operation'ı son geçerli definition snapshot'ını taşır. RPC bu snapshot'ı yalnız silinmiş server satırı oluşturmak için kullanır; portable backup'a Cloud tombstone veya revision olarak yansımaz. Böylece başka bir stale istemci aynı ID'yi sonradan sessizce yeniden oluşturamaz.

Conflict çözümü sessiz field merge yapmaz: Cloud sürümünü kullan, güncel revision üzerine yereli yeniden yaz, yereli yeni UUID'li kopya sakla veya ertele. Yeni kopya origin'i korur, yeni timestamp alır.

Mevcut gelişmiş Cloud veri yüzeyi Goal için de açık preview/count sağlar. Cloud → Yerel merge aynı payload'ı geçer, farklı payload'ı açık conflict olarak durdurur; replace onay ve dispatch guard ister. Yerel → Cloud mevcut tanımları revision-aware durable kuyruğa alır. Remote tombstone local-only Goal'u sessizce silmez.

## ProgressLog değişmezliği

D2C.1 RPC aynı ID + aynı payload'ı idempotent `unchanged`, farklı payload'ı `immutable_log_conflict` yapıyor; ek ProgressLog SQL migration'ı gerekmedi. Guest logu tek kütüphane snapshot'ı içinde coalesce edilebilir. Authenticated kütüphane ve queue ayrı safe-write anahtarları olduğundan cross-key atomiklik garanti edilemez; pending olsa bile aynı ID yeniden yazılmaz ve yeni UUID üretilir. `dispatchStartedAt` veya acknowledged revision sonrasında da ID değişmez; düzeltme yeni UUID'li `manual_adjust` logudur. Import/merge aynı payload'ı idempotent, farklı payload'ı conflict kabul eder.

## Rollout

`NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED` ve `NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE=absent|v1` Goal tarafını additive biçimde açar. Flag açık ama stage `v1` değilse yalnız Goal sync fail-closed durur ve yerel veri korunur. Media Cloud Sync etkilenmez. Migration production'a uygulanmadı. D2C.1 cutover ve Goal migration preflight/apply/post-verification sırası D8'e aittir.

Bağlantılar: [domain](./GOAL_SYSTEM_DOMAIN.md), [yerel kalıcılık](./GOAL_SYSTEM_LOCAL_PERSISTENCE.md), [evaluation](./GOAL_SYSTEM_EVALUATION.md), [portable format](./PORTABLE_BACKUP_FORMAT.md).
