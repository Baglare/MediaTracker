# D8 staging cutover ve operasyon planı

Doğrulama tarihi: 2026-08-09. Bu plan production veritabanına veya deploy hedefine yazma yetkisi vermez.

## Hedef güvenliği

Canlı rehearsal ancak `D8_STAGING_CUTOVER_ENABLED=1`, `D8_STAGING_MIGRATION_ALLOWED=1`, farklı ve açık staging/production project ref'leri, staging ref'ine bağlı `D8_STAGING_DATABASE_URL` ve gerekli fixture'larla yapılır. Scriptler URL/parola/ref değerlerini yazdırmaz; hedef ayrımı ad tahminiyle yapılmaz. Bu audit sırasında kapılar ve credentials mevcut değildi, dolayısıyla DB/auth/provider live adımları çalıştırılmadı.

## Dependency tabanlı sıra

1. D2B.1 additive Cloud Media V2 hazırlığı (`20260727120000`); duplicate/orphan/legacy veri preflight'i.
2. D8 public profile theme additive migration (`20260809120000`); varsayılan `hidden`, mevcut kullanıcıyı public yapmayan backfill ve public RPC projection doğrulaması.
3. D2C.1 preflight, maintenance kapısı ve fingerprint; ardından kısa kontrollü lock penceresinde owner-scoped fiziksel PK enforcement (`20260728120000`). Bu adım non-additive ve rollback yerine fail-forward gerektirir.
4. D2C.1 post-check; legacy direct mutation grant'lerinin kapalı ve sync RPC'lerinin mevcut olduğunu doğrulama.
5. Goal Cloud V1 (`20260803120000`). Dosya additive olsa da `apply_progress_log_sync_operation` prerequisite'i nedeniyle D2C.1 sonrasındadır.
6. Goal/RLS/two-owner post-check; önce schema stage, sonra feature flag. Flag rollback'i DB rollback'inden önce gelir.

Her aşamada: migration history/precondition, duplicate-invalid owner/orphan sayıları, RLS, function/policy varlığı ve revision/idempotency/tombstone contract'ı kontrol edilir. D2C.1 tablo lock'u ve PK/FK değişimi bakım penceresi ister. Theme ve Goal additive nesneleri flag kapalıyken geri alınmak yerine fail-forward bırakılır; D2C.1 için eski mutation yolunu yeniden açmak güvenli rollback değildir.

## Araçlar ve rehearsal

- `node scripts/d8-staging-preflight.mjs d2c1|goal|final`
- `node scripts/d8-staging-postcheck.mjs d2c1|goal`
- `node scripts/d8-staging-rollback-check.mjs`

Araçlar salt-okunur SQL çalıştırır ve `psql` yoksa işlem yapmadan durur. Migration uygulaması yalnız mevcut Supabase migration zinciriyle ve explicit staging izniyle yapılır; shell argümanında secret taşınmaz. Two-owner testlerinde mevcut `SUPABASE_TEST_*` contract'ı kullanılır, credential tracked dosyaya yazılmaz.

## AI/research production başlangıç politikası

Başlangıç: `AI_SERVER_ACCESS_MODE=admin_only`, `D7_RESEARCH_ROLLOUT_MODE=disabled`. Mevcut korumalar user rate limit, request/provider timeout, bounded retry, provider başına attempt/concurrency ve request içi call-count telemetry sağlar. Raw prompt/provider response persist edilmez. Fiyat kod içine gömülmez; doğrulanmış fiyat yoksa token/call bütçesiyle fail-closed işletilir.

Seçenek sırası: disabled en düşük maliyet/429 riski; admin-only shadow gözlem sağlar ama latency/maliyet üretir; admin-only active yalnız citation gate ve düşük hacimde kabul edilebilir; geniş active + shared cache/limiter olmadan release edilmez. Process-local limiter/cache instance'lar arasında duplicate çağrı veya ortak bütçe garantisi vermez. Bu turda DB tabanlı limiter/evidence cache eklenmedi: request yoluna yeni DB availability/latency bağımlılığı ve cleanup/row-growth operasyonu eklemek release rehearsal için küçük güvenli değişiklik değildir. Post-release backlog'tur.

429 durumunda request içi bounded retry ve fail-soft baseline korunur; üretim operasyonunda provider bazlı alarm/cooldown gerekir. Distributed circuit breaker bulunmadığı için research disabled ve server-funded provider admin-only kalır.

## D8-4 kapısı

Explicit staging üzerinde preflight → additive theme → D2C.1 dry-run/cutover → Goal migration → post-check → two-owner/public viewer/account-switch → admin/non-admin/guest AI → avatar upload/delete → provider smoke sırası tamamlanmalı. Ardından production env review, backup/PITR teyidi, bakım penceresi, rollback/fail-forward sahibi ve deploy onayı gerekir.
