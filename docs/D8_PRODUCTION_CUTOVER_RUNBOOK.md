# D8 production cutover runbook

Bu runbook yalnız D8-4A gerçek staging migration, two-owner/RLS, admin/non-admin AI ve full RC kapıları tamamen geçtiğinde kullanılabilir. Gerçek ref, URL, key veya fixture credential belgeye yazılmaz.

1. **Backup verification:** PITR/backup durumu, restore erişimi, sorumlu ve zaman damgası doğrulanır.
2. **Target verification:** Production ref iki bağımsız kaynakla doğrulanır; staging ref'ten farklılığı ve CLI/database hedefi masked olarak kaydedilir.
3. **Maintenance mode:** Cloud mutation UI bakım/cutover moduna alınır; queue drain ve aktif istemci epoch'u kontrol edilir.
4. **Preflight:** Migration ledger, duplicate timestamp, owner-null/duplicate/orphan aggregate, PK/FK conflict, RLS, RPC ve storage policy kontrolleri çalıştırılır.
5. **Additive migrations:** Gerekli D2B.1 baseline ve D8 public profile theme additive migration uygulanır. Theme default `hidden` ve mevcut kullanıcıların public olmadığı post-check edilir.
6. **D2C.1:** Kontrollü lock penceresinde owner-scoped fiziksel PK, legacy mutation kapanışı ve RPC-only mutation contract'ı uygulanır.
7. **D2C.1 post-check:** PK/FK, grant, RLS, queue/revision/idempotency/tombstone ve aggregate bütünlük doğrulanır.
8. **Goal Cloud V1:** Yalnız D2C.1 RPC prerequisite'i geçtikten sonra additive Goal schema/RPC/RLS uygulanır.
9. **Final DB post-check:** Goal owner isolation, migration ledger, public profile RPC projection ve storage policies doğrulanır.
10. **Env/flag transition:** Önce schema stage/epoch, sonra deployment, en son feature flags. `AI_SERVER_ACCESS_MODE=admin_only`; `D7_RESEARCH_ROLLOUT_MODE=disabled`. Goal/media flag'i post-check öncesi açılmaz.
11. **Deployment:** Onaylı immutable artifact production'a alınır; migration sürecinden ayrı yetki ve kayıt kullanılır.
12. **Post-deploy smoke:** [D8 post-deploy checklist](D8_POST_DEPLOY_SMOKE_CHECKLIST.md) uygulanır.
13. **Decision:** Hata sınıfına göre önce feature flag/maintenance rollback'i; schema için [rollback/fail-forward planı](D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD.md) izlenir.

## Zorunlu durdurma koşulları

Target ayrımı kanıtlanamaması, backup/PITR belirsizliği, owner-null/duplicate/orphan, migration drift, unexpected direct DML grant, D2C.1 lock bütçesi aşımı veya post-check failure durumunda ilerleme durur. Production üzerinde reset veya otomatik destructive cleanup yapılmaz.
