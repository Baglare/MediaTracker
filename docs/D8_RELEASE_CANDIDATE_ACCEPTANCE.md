# D8 release-candidate acceptance

Durum tarihi: 2026-08-11. Sonuç: **PASS — D8-4A staging acceptance ve C1-C3 Preview kullanıcı smoke kabulü tamamlandı.** D8-4A.5D first-release hardening kod ve belge kapılarını konsolide eder; production veritabanı, Auth, Storage, env veya deploy hedefi kullanılmadı.

## D8-4A.5 release freeze

D8-4A'nın başarıyla doğrulanan kod/migration baseline'ı `1d0a3c939e97a88a7f6d8ab457aa6b80587cc57c` SHA'sıdır. Bu SHA sonrası D8-4B production cutover'a kadar yalnız release blocker, veri kaybı, auth/security, privacy, ciddi UX, deployment/runtime veya compliance blocker düzeltmeleri kabul edilir; yeni ürün özelliği alınmaz.

D8-4A.5 kapsamındaki UAT, env matrisi, freeze belgesi ve contract testleri baseline sonrası release hazırlığıdır; D8-4A live kanıtını geriye dönük değiştirmez. D8-4A.5B'de current HEAD için Vercel Preview hazır bulundu; staging Supabase target'ı, Preview env adı/scope sınırı, Cloud Media `d2c1`, Goal Cloud `v1`, production-mode dev-route 404 ve Deployment Protection teknik olarak doğrulandı. C1 Discovery/provider, C2 public profile theme ve C3 asset/Calendar/release-polish kullanıcı smoke kabulü tamamlandı. İşaretlenmemiş geniş senaryolar [D8 Preview UAT](D8_PREVIEW_UAT.md) belgesinde `EXTENDED_QA` olarak korunur; kanıtsız PASS değildir.

Preview readiness audit'inde repo/runtime blocker bulunmadı: production-mode annotation UI/API fail-closed 404, service-role import'u server-only, request same-origin kontrolü deployment origin'iyle uyumlu, server candidate URL çözümü `VERCEL_URL` fallback'li ve Cloud Media/Goal stage uyuşmazlıkları fail-closed'dur. Preview teknik kapısı geçmiştir; 69 manuel senaryonun yürütülmesi dış kabul kapısı olarak kalır.

D8-4A.5C2 profile-theme hardening'i public snapshot version/DB contract'ını değiştirmeden route-local scope'u hedefledi. Canlı UAT, persisted custom snapshot decoder'ının eksik runtime rollerini Obsidyen/Porselen tabanından tamamladığı için geçerli owner custom snapshot'ını düşürdüğünü gösterdi; source-string testleri gerçek SSR DOM/persisted snapshot round-trip'ini çalıştırmadığından bunu kaçırdı. C3 decoder ve renderer'ı aynı deterministik semantic türetmeye bağladı ve gerçek SSR marker/style testi ekledi. Fresh Preview'da custom ve preset owner snapshot'ları raw SSR ile hydrated DOM'da doğrulandı; Guest/User A/User B RPC projection fingerprint'i viewer'dan bağımsız kaldı. User B fixture'ındaki eski Obsidyen public preset'i fail-closed staging kontrolü altında beklenen Porselen preset'ine getirildi. Snapshot v1/21-token contract'ı ve production schema değişmedi.

D8-4A.5 doğrulaması: hedefli Preview/security/cloud/profile/recommendation/calendar setinde 12 dosya ve 105 test; full suite'te 179 dosya ve 2.311 test geçti. 18 dosya/55 conditional live-key-gated test skip kaldı; yeni normal skip yok. Lint ve production build geçti; build yalnız mevcut archived annotation NFT trace warning'ini üretti. `git diff --check`, local link ve secret-pattern kontrolleri temiz geçti.

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

- İlk Production release server-funded AI olmadan başlar: `AI_SERVER_ACCESS_MODE=disabled`, `D7_RESEARCH_ROLLOUT_MODE=disabled`, shadow/citation/evidence-cache flag'leri `0` ve persistent embedding cache `off` kalır. Deterministik kütüphane danışmanı korunur; process-local limiter/cache cross-instance garanti değildir.
- AniList ve TMDB ilk sürümde fail-closed disabled olduğu için enablement işleri `POST_RELEASE_GATE` sınıfındadır. Open Library ancak gerçek production contact'lı User-Agent ile açılabilir; aksi halde production'da disabled seçilir. OMDb yeni public provider olarak kapalıdır ve yalnız legacy veri uyumluluğu korunur; TVMaze attribution ile açıktır.
- Production cutover yalnız [runbook](D8_PRODUCTION_CUTOVER_RUNBOOK.md), [fail-forward planı](D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD.md) ve [post-deploy checklist](D8_POST_DEPLOY_SMOKE_CHECKLIST.md) ile ayrı yetkilendirilir.

## D8-4A.5D kanonik production hold tablosu

Bu tablo tek kanonik hold kaynağıdır. Durumlar yalnız `CLOSED`, `BLOCKED_EXTERNAL`, `BLOCKED_MANUAL`, `POST_RELEASE_GATE` ve `NOT_APPLICABLE` sınıflarını kullanır. Ayrıntılı kod kanıtı [first-release security/privacy audit](D8_FIRST_RELEASE_SECURITY_AND_PRIVACY.md) ve env kapsamı [release env matrix](D8_RELEASE_ENV_MATRIX.md) içindedir.

| Kapı | Durum | D8-4B blocker | Kapanış/sonraki kanıt |
| --- | --- | --- | --- |
| C1-C3 kullanıcı smoke kabulü | `CLOSED` | Hayır | Discovery/provider, public profile theme ve asset/Calendar smoke kabulü; kalan geniş senaryolar `EXTENDED_QA` |
| Repo signup UI/action | `CLOSED` | Hayır | Signup control ve browser `signUp` aksiyonu yok; guest/local-first ve mevcut hesap girişi korunur |
| Production Supabase Auth signup ayarı | `BLOCKED_MANUAL` | Evet | D8-4B öncesi dashboard/provider boundary'de yeni kullanıcı kaydı disabled olduğu doğrulanır ve direct signup deny smoke kaydedilir |
| AI/research/persistent cache v1 politikası | `CLOSED` | Hayır | Paid AI/research disabled; persistent cache yalnız exact `on` ile açılır, v1 `off`; serbest `text_preview` yazılmaz |
| Production runtime service-role ihtiyacı | `CLOSED` | Hayır | App/lib içinde tek referans disabled persistent-cache adapter'ıdır; Production env'de key forbidden |
| SQL/RPC/`SECURITY DEFINER`/RLS/Storage source audit | `CLOSED` | Hayır | Explicit search path, grants, owner scope, RPC mutation ve exact asset-path policy audit'i; yeni blocker/major yok |
| Production Supabase Security Advisor | `BLOCKED_MANUAL` | Evet | Exact Production project üzerinde review, bulgu sınıflandırması ve blocker closure kaydı |
| Privacy/operator/deletion/disclosure paketi | `BLOCKED_EXTERNAL` | Evet | Gerçek operator/contact, privacy/aydınlatma, vendor/yurt dışı aktarım, hesap-veri silme talep yolu ve yetkili inceleme; placeholder yok |
| Open Library Production User-Agent | `BLOCKED_MANUAL` | Evet | Gerçek contact içeren UA atanır ve bounded smoke yapılır **veya** provider Production'da disabled seçilir |
| Production target/backup/env/change-window | `BLOCKED_MANUAL` | Evet | Exact targets, current SHA, DB/PITR+Storage planı, ledger, iki kişi env review, operator ve onaylı pencere |
| TVMaze attribution | `CLOSED` | Hayır | CC BY-SA notice ve canonical result/source link mevcut |
| OMDb yeni public kullanım | `CLOSED` | Hayır | Search/fallback disabled; legacy `externalSource: "omdb"` decode/import/display korunur |
| AniList Production enablement | `POST_RELEASE_GATE` | Hayır | Disabled kalır; yazılı izin sonrası ayrı enablement |
| TMDB Production enablement | `POST_RELEASE_GATE` | Hayır | Disabled kalır; approved logo/notice/non-commercial readiness sonrası ayrı enablement |
| Production AI key/budget/monitoring | `POST_RELEASE_GATE` | Hayır | İlk sürümde key provision edilmez; AI enablement ayrı release gate'idir |
| Canonical admin claim ve MFA/AAL2 | `POST_RELEASE_GATE` | Hayır | Aktif v1 privileged kullanıcı yüzeyi yok; AI/admin enablement öncesi ele alınır |
| Admin/Ops panel | `NOT_APPLICABLE` | Hayır | v1 kararı yeni panel yapmamak; explicit ops scriptleri ve dashboard kullanılır |

**D8-4B öncesi gerçek blocker sayısı: 5.** Bunlar signup provider ayarı, privacy/operator paketi, Open Library enable/disable kararı, Security Advisor ve production target/backup/env/change-window kapılarıdır.

## D8-4A.5D validation ve Preview

- Kod-side hardening hedefli seti 18 dosya/174 test geçti. Full suite 184 dosya/2.350 test PASS; 18 dosya/55 conditional live-key-gated test SKIP kaldı, yeni deterministic skip yok.
- Lint, production build ve `git diff --check` geçti. Build yalnız daha önce kayıtlı archived annotation NFT trace warning'ini üretti.
- Secret/local-absolute-path, Markdown link ve tracked temp/diagnostic taramaları geçti; dependency değişmedi.
- Dirty çalışma ağacından yalnız tanı amaçlı immutable Preview oluşturuldu: `https://media-tracker-bxlbcl1cd-baglares-projects.vercel.app`. Bu artifact temiz committed RC SHA yerine geçmez ve Production'a promote edilmedi.
- Protected Preview teknik smoke: home 200; CSP/nosniff/frame/referrer header'ları; dev page/API 404; guest server-provider/research false; TVMaze/Open Library enabled, AniList/TMDB/OMDb disabled; Cloud/profile server config ve public-theme marker PASS. Referans client chunk'larında signup toggle ve `auth.signUp` bulunmadı.
- Hydrated Settings UI ve mevcut kullanıcı sign-in smoke'u Deployment Protection login duvarını credential ile aşmadan otomatikleştirilemedi; önceki kabul edilen Auth/C1-C3 kullanıcı smoke kanıtı korunur. Production Supabase Auth direct signup deny D8-4B manuel kapısıdır.
