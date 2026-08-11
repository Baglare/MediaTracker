# D8 production cutover runbook

Bu runbook D8-4A gerçek staging migration, two-owner/RLS ve D8-4A.5E Security Advisor/privacy audit'i sonrasında hazırlanmıştır. Production uygulaması yine ayrı D8-4B yetkisi, backup ve change-window onayı gerektirir. Gerçek ref, URL, key veya fixture credential belgeye yazılmaz.

Known repo baseline: branch `develop`, HEAD `edde5f8ab5bfc429668fc277a735b9d9d43272b9`, upstream `origin/test`; bu çalışma ağacı değişiklikleri henüz clean committed release SHA değildir. 2026-08-11 read-only Vercel kanıtında current Production deployment `main` branch'indeki `c6e877dd58000449586845f93af056e6c4c067b1` SHA'sıdır. Production Supabase ledger/schema stage ve final env değerleri bu task'ta sorgulanmadı veya değiştirilmedi. D8-4B release artifact'ı current hardening'i içeren, operator tarafından onaylanmış temiz committed SHA olmalıdır; exact intended SHA henüz `BLOCKED_MANUAL`dır.

Repo/deployed-artifact farkından türetilen minimum expected pending migration sırası aşağıdadır; gerçek pending kümesi Production ledger'ın D8-4B read-only doğrulamasına tabidir:

1. `20260728120000_owner_scoped_primary_key_enforcement.sql`
2. `20260803120000_goal_cloud_v1_additive.sql`
3. `20260809120000_d8_public_profile_theme.sql`
4. `20260810120000_d8_profile_asset_visibility_hardening.sql`
5. `20260811120000_d8_security_advisor_hardening.sql`

Ledger'da zaten bulunan migration tekrar uygulanmaz; beklenmeyen gap/drift stop condition'dır.

1. **Change-window ownership:** Gerçek operator, teknik sorumlu, onaylı tarih/saat, iletişim ve stop/continue yetkisi ayrı erişim kontrollü kayıtta doğrulanır. Placeholder kabul edilmez.
2. **[READ ONLY] Current production evidence:** Cutover öncesi Production branch/artifact SHA/alias, migration ledger, Cloud stage/epoch ve masked Supabase/Vercel target snapshot'ı alınır. Intended release branch/SHA ile deployed SHA ilişkisi yazılı kaydedilir.
3. **[READ ONLY] Backup verification:** DB PITR/backup durumu, restore erişimi, sorumlu ve zaman damgası doğrulanır. Storage object metadata/path aggregate'i ve asset restore/retention yaklaşımı ayrıca kaydedilir; DB backup'ın Storage binary'lerini kapsadığı varsayılmaz.
4. **[READ ONLY] Target verification:** Production ref iki bağımsız kaynakla doğrulanır; staging ref'ten farklılığı ve CLI/database/Auth/Storage hedefi masked olarak kaydedilir.
5. **[READ ONLY] Supabase Security Advisor baseline:** 2026-08-11 export'u 123 WARN/0 ERROR'dır. CSV ve [audit matrix](D8_SECURITY_ADVISOR_AUDIT.md) hash/tarih kaydı alınır; beklenmeyen yeni finding varsa ilerleme durur.
6. **[READ ONLY] Privacy/legal gate:** Public `/privacy`, operator/contact ve deletion runbook gözden geçirilir; `MANUAL_LEGAL_REVIEW_REQUIRED` kapanış onayı kaydedilmeden ilerlenmez.
7. **[PRODUCTION AUTH MUTATION — EXPLICIT D8-4B AUTHORIZATION REQUIRED] Signup gate:** Supabase Auth provider boundary'de public signup disabled doğrulanır; direct signup denemesi güvenli deny olmalıdır. Mevcut hesap girişi ve guest/local-first korunur.
8. **[PRODUCTION ENV MUTATION — EXPLICIT D8-4B AUTHORIZATION REQUIRED] Maintenance mode:** Cloud mutation UI bakım/cutover moduna alınır; queue drain ve aktif istemci epoch'u kontrol edilir.
9. **[READ ONLY] Final preflight:** Migration ledger, duplicate timestamp, owner-null/duplicate/orphan aggregate, PK/FK conflict, RLS/RPC grants, `SECURITY DEFINER` search path ve storage policy kontrolleri çalıştırılır. `embedding_cache` yalnız aggregate olarak incelenir; raw preview/prompt yazdırılmaz.
10. **[PRODUCTION DB MUTATION — EXPLICIT D8-4B AUTHORIZATION REQUIRED] Additive migrations:** Ledger'da eksik minimum expected migration'lar dependency sırasıyla uygulanır. D2C.1 lock bütçesi aşılırsa stop; tekrar uygulama veya reset yoktur.
11. **[READ ONLY] D2C.1/Goal/profile post-check:** PK/FK, grant, RLS, queue/revision/idempotency/tombstone, A/B owner isolation, Goal Cloud ve aggregate bütünlük doğrulanır. Theme default `hidden`; exact current avatar/banner path policy zorunludur.
12. **[READ ONLY] Security hardening post-check:** Internal helper/trigger user-role EXECUTE yok; public 7/auth 43 intended matrix doğru; `set_updated_at` fixed search path; `embedding_cache` anon/auth table/policy erişimi yok. Migration ledger kaydı doğrulanır.
13. **[READ ONLY] Security Advisor rerun:** Exact Production project yeniden export edilir. Beklenen 51 warning'den sapma açıklanır; unexplained veya broad access finding'i stop condition'dır.
14. **[READ ONLY] Env iki kişi review:** [D8 env matrix](D8_RELEASE_ENV_MATRIX.md) satırları Preview'dan kopyalanmadan Production scope'unda bağımsız doğrulanır. Service-role, test/staging/fixture/local-ML/live-smoke ve paid AI key'leri bulunmaz. Open Library UA value class doğrulanır.
15. **[PRODUCTION ENV MUTATION — EXPLICIT D8-4B AUTHORIZATION REQUIRED] Env/flag transition:** Önce schema stage/epoch, sonra deployment, en son Cloud feature flags. `AI_SERVER_ACCESS_MODE=disabled`, research flag'leri disabled/`0`, persistent cache `off`, AniList/TMDB disabled ve Open Library UA zorunludur. Goal/media flag'i post-check öncesi açılmaz.
16. **[PRODUCTION DEPLOYMENT — EXPLICIT D8-4B AUTHORIZATION REQUIRED] Deployment:** Yalnız onaylı temiz immutable SHA Production'a alınır; migration sürecinden ayrı yetki ve kayıt kullanılır.
17. **[READ/BOUNDED TEST] Post-deploy smoke:** [D8 post-deploy checklist](D8_POST_DEPLOY_SMOKE_CHECKLIST.md) uygulanır: Guest/local-first, existing sign-in, direct signup deny, public profile, TVMaze/Open Library Dune, Calendar, asset/banner, disabled AI/research/cache, Cloud/Goal, `/privacy`, console/hydration ve safe-error leakage.
18. **[DECISION] Rollback/fail-forward:** Hata sınıfına göre önce feature flag/maintenance rollback'i; schema için [rollback/fail-forward planı](D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD.md) izlenir. Owner data integrity belirsizliğinde destructive rollback yok; kontrollü fail-forward tercih edilir.

## Zorunlu durdurma koşulları

Operator/change-window yokluğu, target ayrımı kanıtlanamaması, signup'ın açık kalması, privacy/operator kapısının kapanmaması, Security Advisor blocker'ı, backup/PITR/Storage planı belirsizliği, owner-null/duplicate/orphan, migration drift, unexpected direct DML grant, D2C.1 lock bütçesi aşımı veya post-check failure durumunda ilerleme durur. Production üzerinde reset veya otomatik destructive cleanup yapılmaz.

Staging rehearsal'da remote migration başarılıyken Supabase CLI local catalog cache'i Docker bulunmadığı için warning verdi. Production kararı remote ledger/post-check'e dayanır; bu warning migration failure olarak sınıflandırılmaz, fakat CLI exit code ve remote ledger birlikte kaydedilir.
