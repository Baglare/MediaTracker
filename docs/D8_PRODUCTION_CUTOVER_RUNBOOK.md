# D8 production cutover runbook

Bu runbook D8-4A gerçek staging migration, two-owner/RLS ve admin/non-admin AI kapıları geçtikten sonra hazırlanmıştır. Production uygulaması yine ayrı D8-4B yetkisi, backup ve change-window onayı gerektirir. Gerçek ref, URL, key veya fixture credential belgeye yazılmaz.

1. **Change-window ownership:** Gerçek operator, teknik sorumlu, onaylı tarih/saat, iletişim ve stop/continue yetkisi ayrı erişim kontrollü kayıtta doğrulanır. Placeholder kabul edilmez.
2. **Current production evidence:** Cutover öncesi Production artifact SHA/alias, migration ledger, Cloud stage/epoch ve masked Supabase/Vercel target snapshot'ı alınır.
3. **Backup verification:** DB PITR/backup durumu, restore erişimi, sorumlu ve zaman damgası doğrulanır. Storage object metadata/path aggregate'i ve asset restore/retention yaklaşımı ayrıca kaydedilir; DB backup'ın Storage binary'lerini kapsadığı varsayılmaz.
4. **Target verification:** Production ref iki bağımsız kaynakla doğrulanır; staging ref'ten farklılığı ve CLI/database/Auth/Storage hedefi masked olarak kaydedilir.
5. **Supabase Security Advisor:** Exact Production project review sonucu kaydedilir; unresolved blocker/major varsa ilerleme durur.
6. **Signup gate:** Supabase Auth provider boundary'de public signup disabled doğrulanır; direct signup denemesi güvenli deny olmalıdır. Mevcut hesap girişi ve guest/local-first korunur.
7. **Maintenance mode:** Cloud mutation UI bakım/cutover moduna alınır; queue drain ve aktif istemci epoch'u kontrol edilir.
8. **Preflight:** Migration ledger, duplicate timestamp, owner-null/duplicate/orphan aggregate, PK/FK conflict, RLS/RPC grants, `SECURITY DEFINER` search path ve storage policy kontrolleri çalıştırılır. `embedding_cache` yalnız aggregate olarak incelenir; raw preview/prompt yazdırılmaz.
9. **Additive migrations:** Ledger'a göre eksik D2B.1 baseline ve D8 public profile theme additive migration uygulanır. Theme default `hidden` ve mevcut kullanıcıların public olmadığı post-check edilir.
10. **D2C.1:** Kontrollü lock penceresinde owner-scoped fiziksel PK, legacy mutation kapanışı ve RPC-only mutation contract'ı uygulanır.
11. **D2C.1 post-check:** PK/FK, grant, RLS, queue/revision/idempotency/tombstone ve aggregate bütünlük doğrulanır.
12. **Goal Cloud V1:** Yalnız D2C.1 RPC prerequisite'i geçtikten sonra additive Goal schema/RPC/RLS uygulanır.
13. **Final DB post-check:** Goal owner isolation, migration ledger, public profile RPC projection ve exact current avatar/banner path ile sınırlı storage policy doğrulanır. `20260810120000_d8_profile_asset_visibility_hardening.sql` ledger'da bulunmadan profile asset rollout açılmaz.
14. **Env iki kişi review:** [D8 env matrix](D8_RELEASE_ENV_MATRIX.md) satırları Preview'dan kopyalanmadan Production scope'unda bağımsız doğrulanır. Service-role, test/staging/fixture/local-ML/live-smoke ve paid AI key'leri bulunmaz. Open Library gerçek contact yoksa provider disabled seçilir.
15. **Env/flag transition:** Önce schema stage/epoch, sonra deployment, en son Cloud feature flags. İlk release için `AI_SERVER_ACCESS_MODE=disabled`, `D7_RESEARCH_ROLLOUT_MODE=disabled`, `D7_RESEARCH_SHADOW_ENABLED=0`, `D7_RESEARCH_PUBLIC_CITATIONS_ENABLED=0`, `D7_RESEARCH_EVIDENCE_CACHE_ENABLED=0` ve `MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE=off` zorunludur. Goal/media flag'i post-check öncesi açılmaz.
16. **Deployment:** Yalnız onaylı temiz immutable SHA Production'a alınır; migration sürecinden ayrı yetki ve kayıt kullanılır.
17. **Post-deploy smoke:** [D8 post-deploy checklist](D8_POST_DEPLOY_SMOKE_CHECKLIST.md) uygulanır.
18. **Decision:** Hata sınıfına göre önce feature flag/maintenance rollback'i; schema için [rollback/fail-forward planı](D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD.md) izlenir.

## Zorunlu durdurma koşulları

Operator/change-window yokluğu, target ayrımı kanıtlanamaması, signup'ın açık kalması, privacy/operator kapısının kapanmaması, Security Advisor blocker'ı, backup/PITR/Storage planı belirsizliği, owner-null/duplicate/orphan, migration drift, unexpected direct DML grant, D2C.1 lock bütçesi aşımı veya post-check failure durumunda ilerleme durur. Production üzerinde reset veya otomatik destructive cleanup yapılmaz.

Staging rehearsal'da remote migration başarılıyken Supabase CLI local catalog cache'i Docker bulunmadığı için warning verdi. Production kararı remote ledger/post-check'e dayanır; bu warning migration failure olarak sınıflandırılmaz, fakat CLI exit code ve remote ledger birlikte kaydedilir.
