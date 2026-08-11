# D8 production cutover runbook

Bu runbook D8-4A gerçek staging migration, two-owner/RLS ve D8-4A.5E Security Advisor/privacy audit'i sonrasında hazırlanmıştır. Production uygulaması yine ayrı D8-4B yetkisi, backup ve change-window onayı gerektirir. Gerçek ref, URL, key veya fixture credential belgeye yazılmaz.

Known approved RC baseline: branch `develop`, HEAD `3a847701e5161186cfb16ade0e625666120c5e29`, upstream `origin/test`; approved commit temizdir ve aynı SHA remote branch'te bulunur. D8-4B-A.1/A.2 operasyon belgesi değişiklikleri çalışma ağacında ayrıca tutulur ve deploy artifact'ını değiştirmez. 2026-08-11 read-only Vercel kanıtında current Production deployment `main` branch'indeki `c6e877dd58000449586845f93af056e6c4c067b1` SHA'sıdır. Production Supabase ledger/schema/security, backup capability, Auth policy ve Vercel env presence A.2'de read-only sorgulandı; hiçbir Production değeri değiştirilmedi. D8-4B release artifact'ı current hardening'i içeren, operator tarafından onaylanmış temiz committed `3a847701e5161186cfb16ade0e625666120c5e29` SHA'sıdır.

Repo/deployed-artifact farkından türetilen minimum expected pending migration sırası aşağıdadır; gerçek pending kümesi Production ledger'ın D8-4B read-only doğrulamasına tabidir:

1. `20260728120000_owner_scoped_primary_key_enforcement.sql`
2. `20260803120000_goal_cloud_v1_additive.sql`
3. `20260809120000_d8_public_profile_theme.sql`
4. `20260810120000_d8_profile_asset_visibility_hardening.sql`
5. `20260811120000_d8_security_advisor_hardening.sql`

Ledger'da zaten bulunan migration tekrar uygulanmaz; beklenmeyen gap/drift stop condition'dır.

## D8-4B-A.2 read-only baseline

- Approved code RC: `3a847701e5161186cfb16ade0e625666120c5e29`; `origin/test` aynı SHA'dır. Current Production `main` SHA'sı `c6e877dd58000449586845f93af056e6c4c067b1` ve bu commit RC'nin doğrusal atasıdır.
- Vercel canonical Production URL: `https://media-tracker-pi-two.vercel.app`. Production user-defined env sayısı A.2 preflight anında sıfırdır; [exact 19-value planı](D8_RELEASE_ENV_MATRIX.md#d8-4b-exact-production-value-planı) D8-4B-B mutation adımıdır.
- Production Supabase target fingerprint `227403b3cd`, staging fingerprint `84c9d12522`; linked CLI target Production ile eşleşir. Project URL fingerprint `fbfe801aeb`, legacy anon/public key fingerprint `fd1d9d7578` olarak iki kişi doğrulanır; gerçek değer kaydedilmez.
- Ledger 19 local / 14 applied / exact 5 pending'dir. WAL-G açık, PITR kapalı ve listelenebilir managed backup yoktur. `profile-assets` baseline'ı 4 obje / 2.131.570 byte'tır; cutover anında yeniden ölçülür.
- Public signup disabled, anonymous sign-in disabled, existing email sign-in enabled read-only public Auth settings ile doğrulanmıştır.

## Cloud env transition ve deployment sırası

`NEXT_PUBLIC_*` değerleri build-time client bundle'a gömülür. Vercel env değişikliği mevcut deployment'ı değiştirmez; aynı approved SHA ile her state transition için yeni Production deployment gerekir. Üç deployment'ın epoch değeri `d8-v1-3a847701`, minimum client sürümü `d2c2` olarak sabit kalır.

1. **[PRODUCTION ENV + DEPLOY MUTATION] Maintenance-on deploy:** 19 env Production scope'una atanır; media stage `d2b1`, media V2 `true`, Goal stage `absent`, Goal V1 `false`, maintenance `true`. Exact RC deploy edilir. `/api/cloud/rollout` maintenance göstermeden migration başlamaz.
2. **[READ ONLY] Drain/precheck:** Açık istemcilerin remote maintenance state'i gördüğü ve yeni Cloud mutation göndermediği doğrulanır; ledger/data guards yeniden alınır.
3. **[PRODUCTION DB MUTATION] Migrations:** Exact beş pending migration ledger-aware CLI ile dependency sırasında uygulanır.
4. **[READ ONLY] Post-check:** PK/FK, Goal, public theme, asset policy, grants/search path/embedding denial ve ledger doğrulanır.
5. **[PRODUCTION ENV + DEPLOY MUTATION] Stage/feature deploy:** maintenance `true` kalırken media stage `d2c1`, media V2 `true`, Goal stage `v1`, Goal V1 `true` atanır ve aynı RC yeniden deploy edilir. Cloud/Goal bounded smoke geçmelidir.
6. **[PRODUCTION ENV + DEPLOY MUTATION] Maintenance-off deploy:** Yalnız maintenance `false` yapılır ve aynı RC yeniden deploy edilir. Epoch değişmez; final smoke sonrası window kapanır.

Her deployment SHA'sı exact RC ile eşleşmezse, maintenance endpoint'i beklenen state'i döndürmezse veya Vercel Production scope'unda forbidden env bulunursa durulur.

## Executable backup package

Backup bu A.2 aşamasında çalıştırılmaz. D8-4B-B yetkisinden sonra aşağıdaki PowerShell bloğu repo root'unda çalıştırılır. Linked target fingerprint kontrolü Production dışı hedefi reddeder; output yeni ve repo dışı olmalıdır.

```powershell
$ErrorActionPreference = 'Stop'
$expectedRc = '3a847701e5161186cfb16ade0e625666120c5e29'
$expectedProductionRefFingerprint = '227403b3cd'
$backupRoot = [IO.Path]::GetFullPath('C:\MediaTracker-Production-Backup')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = [IO.Path]::GetFullPath((Join-Path $backupRoot ($stamp + '-pre-v1')))

if (-not $backupDir.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Backup path escaped the approved root.'
}
if (Test-Path -LiteralPath $backupDir) { throw 'Backup directory already exists; overwrite refused.' }
if ((git rev-parse origin/test).Trim() -ne $expectedRc) { throw 'origin/test no longer matches the approved RC.' }
$linkedRef = (Get-Content supabase\.temp\project-ref -Raw).Trim()
$sha = [Security.Cryptography.SHA256]::Create()
$linkedHash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($linkedRef))).Replace('-', '').Substring(0, 10).ToLowerInvariant()
if ($linkedHash -ne $expectedProductionRefFingerprint) { throw 'Linked Supabase target fingerprint is not Production.' }

New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
npx.cmd --yes supabase@latest db dump --linked --role-only --file (Join-Path $backupDir 'roles.sql')
if ($LASTEXITCODE -ne 0) { throw 'roles dump failed' }
npx.cmd --yes supabase@latest db dump --linked --schema public --file (Join-Path $backupDir 'schema.sql')
if ($LASTEXITCODE -ne 0) { throw 'schema dump failed' }
npx.cmd --yes supabase@latest db dump --linked --schema public --data-only --use-copy --file (Join-Path $backupDir 'data.sql')
if ($LASTEXITCODE -ne 0) { throw 'data dump failed' }
npx.cmd --yes supabase@latest db dump --linked --schema supabase_migrations --file (Join-Path $backupDir 'migration-history-schema.sql')
if ($LASTEXITCODE -ne 0) { throw 'migration history schema dump failed' }
npx.cmd --yes supabase@latest db dump --linked --schema supabase_migrations --data-only --use-copy --file (Join-Path $backupDir 'migration-history-data.sql')
if ($LASTEXITCODE -ne 0) { throw 'migration history data dump failed' }
npx.cmd --yes supabase@latest storage cp --linked --experimental --recursive 'ss:///profile-assets' (Join-Path $backupDir 'profile-assets')
if ($LASTEXITCODE -ne 0) { throw 'profile-assets download failed' }

Copy-Item -LiteralPath 'docs\D8_PRODUCTION_CUTOVER_RUNBOOK.md' -Destination (Join-Path $backupDir 'README-cutover.md') -ErrorAction Stop
Copy-Item -LiteralPath 'docs\D8_PRODUCTION_ROLLBACK_AND_FAIL_FORWARD.md' -Destination (Join-Path $backupDir 'README-restore-notes.md') -ErrorAction Stop

$manifestRows = Get-ChildItem -LiteralPath $backupDir -Recurse -File | Sort-Object FullName | ForEach-Object {
  [pscustomobject]@{
    path = $_.FullName.Substring($backupDir.Length + 1)
    bytes = $_.Length
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
$manifestRows | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $backupDir 'manifest.sha256.json') -Encoding utf8NoBOM
Write-Output ('BACKUP_DIR=' + $backupDir)
Write-Output ('ARTIFACT_COUNT=' + @($manifestRows).Count)
```

Bu komutlar public application schema/data ve migration ledger'ını ayrı korur; Supabase-managed Auth/Storage internal tablolarını veya Storage vector tablolarını data dump'a almaz. Storage binary'leri yalnız `profile-assets` recursive download ile korunur. Password, connection string, key veya full project ref komut satırına yazılmaz.

### Backup başarı kriterleri

- Her komut exit `0`; `roles.sql`, `schema.sql`, `data.sql`, iki migration-history SQL ve iki README dosyası non-zero.
- Migration-history data içinde cutover öncesi 14 applied version bulunur; pending beş version backup anında henüz bulunmaz.
- SQL dosyaları okunabilir plain text'tir; disposable non-production restore rehearsal parse/restore kanıtı olmadan Production restore-ready iddiası yapılmaz.
- Live `profile-assets` count/byte aggregate yeniden alınır. Local downloaded file count live count'a, toplam bytes live aggregate'e eşit olmalıdır; baseline yalnız 4 / 2.131.570'dır.
- `manifest.sha256.json` her artifact için relative path, byte ve SHA-256 içerir; manifest yeniden hesaplanarak eşleşir.
- Backup klasörü `C:\MediaTracker-Production-Backup\<timestamp>-pre-v1\` altında ve repo dışındadır; `.gitignore` değişikliği yapılmaz.
- Disposable restore yalnız yeni/boş non-production Supabase project veya izole PostgreSQL hedefinde, `psql --single-transaction --set ON_ERROR_STOP=1` ile roles → schema → data → migration history sırasında denenir. Production restore ayrı incident authorization olmadan çalıştırılmaz.

## Signup cutover check

1. Dashboard → Production Supabase project → Authentication → Sign In / Providers ekranında yeni kullanıcı signup kapalı, anonymous sign-ins kapalı, email sign-in açık olarak iki kişi doğrulanır.
2. Public `/auth/v1/settings` yeniden okunur. `disable_signup=true` ve `external.anonymous_users=false` görülmeden deny smoke yapılmaz.
3. Config kanıtlandıktan sonra cryptographically random local-part kullanan, operatöre ait olmayan disposable `example.invalid` adresiyle tek signup isteği gönderilir. Beklenen sonuç stable rejection ve Auth users count değişmemesidir.
4. İstek success dönerse, session/user id üretirse veya Auth users count artarsa **STOP**; oluşan hesabı otomatik silme veya testi tekrarlama yoktur. Operator Dashboard'da doğru kaydı inceleyip incident/fail-forward kararı verir.

## Five-migration execution package

Uygulama komutu yalnız explicit D8-4B-B Production DB yetkisinden sonra `npx.cmd --yes supabase@latest migration up --linked` olur. CLI version selector sunmadığı için beş dosya ledger-aware tek komutta sırasıyla uygulanır; first failure'da durur. Dosyaları ledger dışında `db query --file` ile çalıştırmak yasaktır.

| Migration | Pre-check | Post-check | Stop condition | Fail-forward |
| --- | --- | --- | --- | --- |
| `20260728120000_owner_scoped_primary_key_enforcement.sql` | Legacy PK `id`; row/log physical UUID present; null/duplicate/orphan/cross-owner aggregate `0`; maintenance active | PK `row_pk`/`log_pk`; owner-aware FK; direct user-role DML revoked; sync RPC auth-only | Data guard non-zero, unexpected lock/blocker, preflight definition drift veya lock budget aşımı | Transaction failure rollback; commit sonrası maintenance açık, destructive down yok, owner-safe narrow fix/backup decision |
| `20260803120000_goal_cloud_v1_additive.sql` | `goals`/`goal_sync_operations` absent; no conflicting function/table | İki table + RLS + owner policy + authenticated apply RPC; replay/tombstone/owner isolation | Existing incompatible object, RLS/grant mismatch | Goal flag false, schema korunur, additive fix |
| `20260809120000_d8_public_profile_theme.sql` | Üç theme column absent; existing unified profile RPC signature expected | Columns/checks/helpers; theme default `hidden`; public read/auth mutation grants | Constraint violation, snapshot validator veya RPC signature drift | Theme hidden/feature gated, narrow additive function fix |
| `20260810120000_d8_profile_asset_visibility_hardening.sql` | Current old asset policy/helper shape expected; Storage inventory captured | Exact current avatar/banner path only; owner upload/update/delete; unreferenced path denied | Public/private asset regression veya unexpected policy drift | Maintenance remains; narrow policy/helper fail-forward, broad wildcard restore yok |
| `20260811120000_d8_security_advisor_hardening.sql` | 57 anon/62 auth definer exec; mutable `set_updated_at`; embedding global policies/privileges confirmed | 7 anon PUBLIC_READ, 43 auth; fixed search path; embedding anon/auth denied; ledger applied | Legitimate RPC denial, unexplained grant, policy or postcheck failure | Maintenance remains; only reviewed role-specific grant/policy fix, broad grants not restored |

## Security Advisor postcheck

Migration sonrasında exact Production Advisor yeniden çalıştırılır ve CSV export alınır. Beklenen risk sınıfı 7 legitimate anon `PUBLIC_READ`, 43 legitimate authenticated ve leaked-password platform limitation'dır; final toplam önceden PASS sayılmaz. Yeni `ERROR`, yeni warning category, broad table access, mutable search path veya beklenmeyen anon mutation finding'i **STOP** durumudur. Export category counts ve audit matrix diff'i change-window kaydına eklenir.

## Change-window record template

| Field | Value |
| --- | --- |
| Date | `MANUAL` |
| Start time | `MANUAL` |
| Operator | Batuhan Parıltı |
| RC SHA | `3a847701e5161186cfb16ade0e625666120c5e29` |
| Production current SHA | `c6e877dd58000449586845f93af056e6c4c067b1` |
| Backup path | `C:\MediaTracker-Production-Backup\<timestamp>-pre-v1\` |
| Preflight result | `PASS / STOP + evidence` |
| Migration start/end | `MANUAL` |
| Advisor result | `counts + export fingerprint` |
| Env result | `19 present / forbidden absent / two-person review` |
| Deploy result | `three deployment SHA/state records` |
| Smoke result | `PASS / FAIL + checklist` |
| Rollback/fail-forward decision | `decision + owner + reason` |
| Close time | `MANUAL` |

Technical privacy package ve operator/contact `CLOSED` kalır. `MANUAL_LEGAL_REVIEW_REQUIRED` bu task'ta kapanmaz; D8-4B-B başlamadan operator sonucu açıkça `CLOSED` veya `OPERATOR_RISK_ACCEPTED` olarak kaydeder. Bu kayıt hukuki uyum garantisi değildir.

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
