# D8 release-candidate acceptance

Durum tarihi: 2026-08-10. Sonuç: **PASS — D8-4A staging acceptance tamamlandı.** Production veritabanı, Auth, Storage ve deploy hedefi kullanılmadı.

## Canlı staging kapıları

- Masked hard gate; explicit cutover/migration iznini, staging ve production hedeflerinin farklılığını, app/test/DB hedef eşleşmesini, staging anon/service-role doğrulamasını ve iki farklı gerçek Auth fixture kullanıcısını doğruladı. Secret, credential veya tam project ref kaydedilmedi.
- Mevcut staging şeması **B — eski fakat forward-migratable** sınıfındaydı. Owner-null, duplicate owner/ID, orphan ve PK/FK conflict aggregate kontrolleri temizdi.
- User A'nın mevcut `app_metadata` alanları korunarak yalnız server contract'ının beklediği admin claim'i atandı. Taze oturumda A admin, B non-admin kaldı; B/guest forged body ile yetki kazanamadı.
- Remote ledger'a göre D2C.1 önceden uygulanmıştı. D8 public profile theme ve Goal Cloud V1 additive migration'ları dependency sırasıyla uygulandı; ardından profile asset path-scope hardening migration'ı uygulandı. Tüm post-check'lerde pending migration sıfırdı. CLI'nin local catalog cache için verdiği Docker-yok warning'i remote uygulamayı etkilemedi.
- D2C.1 live kabulü owner-scoped fiziksel PK/FK, RPC-only mutation, RLS, revision CAS, idempotency ve tombstone/restore davranışlarını iki owner ile doğruladı. Goal Cloud V1 CRUD/replay/owner isolation/tombstone kabulü geçti.
- Public profile hidden, preset-only, current preset ve validated custom projection'ları geçti; düşük kontrastlı custom publish reddedildi, private/internal alan sızmadı ve cross-owner update PostgreSQL/RLS tarafından reddedildi.
- Asset live kabulünde eski storage policy'nin profil görünürlüğünü path'e bağlamadığı bulundu. Yeni policy non-owner erişimini yalnız güncel `avatar_path`/`banner_path` ile sınırlar; unreferenced ve temizlenmiş path signed URL erişimi reddedilir. Upload/update/delete/invalidation ve cleanup geçti.
- AI capability live kabulünde A için admin/server-provider true, B ve guest için false döndü. B/guest forged OpenAI/admin/research request'i `403 ai_server_provider_forbidden` aldı. A'nın tek bounded smoke isteği OpenAI'ye bir çağrı yaptı ve beş öneri döndürdü; capability/response secret sızdırmadı. Research rollout disabled kaldı.
- TMDB, OMDb, TVMaze, AniList ve Open Library internal proxy'leri POST JSON ile güvenli 200 döndürdü; kullanıcı sorgusu URL'ye taşınmadı ve provider boş sonucu diğer kaynakları bozmadı.

## Browser ve cleanup

- Public profil 320×568, 375×812, 390×844, 1366×768 ve 1536×864 boyutlarında horizontal overflow üretmedi. Custom tema yalnız profile wrapper'ında kaldı; header scope dışında ve route-leave sonrası root temizdi.
- User B browser oturumunda server-provider/research butonları ve OpenAI kontrolü disabled kaldı. Keşif sonuçları 375 px'te taşmadı; URL yalnız UI `tab` durumunu taşıdı, arama metnini taşımadı. Console/hydration error görülmedi.
- Credential redaction nedeniyle tarayıcı aracına fixture parola taşınmadı; A/B session ve account isolation live API/RLS testleriyle, account-switch görünürlük davranışı hedefli cache testleriyle doğrulandı.
- Bu rehearsal için oluşturulan geçici profile/asset verileri deterministik temizlendi. User A staging admin fixture olarak bırakıldı; production'a metadata yazılmadı.

## RC doğrulama

- D8-4A hedefli regresyon seti: 5 dosya, 40 test geçti.
- Full suite: 178 dosya ve 2.306 test geçti; 18 dosya ve 55 conditional live/key-gated test skip kaldı.
- Lint ve production build geçti. Build yalnız mevcut archived annotation NFT trace warning'ini üretti; yeni warning yok.
- `git diff --check`, migration timestamp, secret-value ve yerel Markdown link kontrolleri temiz geçti.

## Release politikası ve kalan production kapıları

- Production başlangıcı `AI_SERVER_ACCESS_MODE=admin_only` ve `D7_RESEARCH_ROLLOUT_MODE=disabled` kalır. Process-local limiter/cache cross-instance garanti değildir.
- TMDB resmi onaylı logo asset'i, production provider User-Agent/contact değeri, OMDb commercial/lisans kararı ve production backup/target/change-window onayı D8-4B kapılarıdır.
- Production cutover yalnız [runbook](D8_PRODUCTION_CUTOVER_RUNBOOK.md), [fail-forward planı](D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD.md) ve [post-deploy checklist](D8_POST_DEPLOY_SMOKE_CHECKLIST.md) ile ayrı yetkilendirilir.
