# Production Cloud V2 Cutover

Bu belge D8 kapsamında yapılacak D2C.1 salt-okunur audit, backup ve production cutover sırasını tanımlar. Proje kilometre taşı kaydına göre D2B.0 ve D2B.1 production veritabanına uygulanmıştır; D2C.1 uygulanmamıştır. Production bağlantısı, migration uygulaması veya backup alma işlemi bu dokümantasyon paketinin parçası değildir.

## Salt-okunur audit

Önce `supabase/d2c3_production_inventory.sql`, ardından `supabase/d2c3_production_preflight.sql` production SQL Editor veya salt-okunur database rolüyle çalıştırılır. Her iki dosya `begin transaction read only` ile başlar ve `rollback` ile biter.

Çıktı güvenli bir incident klasörüne tarih ve project-ref ile kaydedilir; raw kullanıcı satırı alınmaz. Paket şunları raporlar:

- repository migration zinciri ile `supabase_migrations.schema_migrations` farkı;
- `profiles`, `media_items`, `progress_logs` kolon, PK/FK/unique/check, index, trigger, RLS policy ve grant envanteri;
- production'ın `legacy_core`, `d2b1_additive`, `d2c1_enforced` veya drifted fazda olması;
- owner içi duplicate ID, cross-owner aynı ID ve orphan/cross-owner progress aggregate sayıları;
- external source bazında duplicate grup dağılımı ve Canonical Identity V2 backfill uygunluk sayıları;
- `row_pk`, `log_pk`, revision, tombstone, operation ledger ve V2 RPC varlığı;
- legacy `anon`/`authenticated` direct DML grant'leri;
- tablo satır sayıları ve `profile-assets` bucket metadata varlığı.

Personal note, title, external ID, auth user ID, raw payload, token veya secret rapora yazılmaz. `NOTICE` olarak dönen V2 sayımları da yalnız aggregate değer taşır.

## Go/no-go blocker'ları

| Bulgu | Karar |
| --- | --- |
| Core tablo veya migration history tablosu yok | Dur; doğru project-ref ve baseline doğrulanır |
| Repository history ile production history farklı | Repair çalıştırma; önce her recorded/missing sürümü gerçek schema nesneleriyle karşılaştır |
| Beklenmeyen PK/FK/RLS/policy/trigger drift'i | Migration uygulama; ayrı drift çözüm planı hazırla |
| Owner içinde duplicate media/progress ID | D2C.1 bloke |
| Orphan veya cross-owner progress | D2C.1 bloke |
| Null/geçersiz `row_pk`, `log_pk` veya revision | D2C.1 bloke |
| D2B.1 hedeflerinin yalnız bir kısmı mevcut | D2B.1'i tekrar çalıştırma; partial-state incelemesi yap |
| D2C.1 sonrası legacy direct DML grant'i | Cutover başarısız; V2 mutation trafiğini durdur ve roll-forward hazırla |
| Backup veya restore testi doğrulanmadı | Production migration bloke |

Static repository riski: D2B.1 öncesi global `id` PK ve external unique index vardır; legacy direct upsert/hard-delete CAS ve tombstone'u bypass eder. D2C.1 direct DML ile uyumlu değildir ve commit sonrasında legacy flag rollback'i güvenli değildir. Production'ın gerçek fazı yalnız audit çıktısıyla doğrulanabilir.

## Backup seçenekleri

### 1. Supabase Dashboard/platform backup

- **Schema/data:** Platform backup/PITR snapshot'ının tamamlanma zamanı ve restore point ID kaydedilir. Planın retention ve restore kapsamı Dashboard'dan doğrulanır.
- **Roles/auth/storage:** Database içindeki auth ve storage metadata kapsamı plan bazında doğrulanır. Storage object byte'ları database backup'ı sayılmaz; `profile-assets` için ayrı object inventory/export gerekir. Managed platform rollerinin restore davranışı ayrıca doğrulanır.
- **Restore testi:** Production'a değil, izole disposable test project'e restore edilir; row count, fingerprint, RLS ve iki-user smoke karşılaştırılır.
- **Secret:** Dashboard erişimi MFA ile sınırlandırılır; recovery bağlantısı veya token dokümana/loga konmaz.
- **Adlandırma/saklama:** `mediatracker-prod-pre-d2b1-YYYYMMDDTHHMMSSZ-platform.json` manifestinde project-ref, restore point ve audit checksum tutulur. Şifreli, erişim kontrollü saklama kullanılır.
- **Doğrulama:** Platform durumu, restore denemesi ve manifest SHA-256 birlikte onaylanır.

### 2. Native `pg_dump` ile direct connection

- **Schema/data:** Uyumlu PostgreSQL client sürümüyle ayrı schema-only SQL ve custom-format data dump alınır. Connection string yalnız process environment/secret manager üzerinden verilir; komut satırı geçmişine yazılmaz.
- **Roles:** Yetki varsa `pg_dumpall --roles-only` ayrı alınır. Managed/Supabase rollerine erişim yoksa bu eksik açıkça manifestte belirtilir.
- **Auth/storage:** Direct DB yetkisi izin veriyorsa auth/storage metadata dump kapsamına alınır. Storage bucket object byte'ları ayrıca export/inventory edilir.
- **Restore testi:** Boş izole PostgreSQL/Supabase test ortamında önce roles, sonra schema, sonra data restore edilir; error log, row count ve RLS smoke saklanır.
- **Adlandırma/saklama:** `.schema.sql`, `.data.dump`, `.roles.sql`, `.storage-manifest.json` ve `.sha256` aynı `mediatracker-prod-pre-d2b1-<UTC>` prefix'ini kullanır. Dosyalar şifrelenir.
- **Doğrulama:** Her artefact için SHA-256, non-zero boyut, `pg_restore --list` ve gerçek restore testi gerekir.

### 3. Docker sonrası `supabase db dump`

- **Schema/data:** Supabase CLI'nin repository ile pinlenen sürümü ve Docker engine doğrulanır; schema, data ve roles ayrı artefact olarak alınır. Varsayılan exclude/include davranışı komut çalıştırılmadan önce staging'de doğrulanır.
- **Roles/auth/storage:** CLI dump'ın auth/storage schema ve managed role kapsamı sürüme göre manifestte açıkça kaydedilir. Object bytes yine ayrı export edilir.
- **Restore testi:** Aynı CLI/Docker sürümüyle boş local stack veya disposable test project restore edilir; migration history ve row fingerprint karşılaştırılır.
- **Secret:** DB password/link bilgisi yalnız ephemeral environment veya secret manager'dadır; `.env`, shell history ve artefact içine yazılmaz.
- **Adlandırma/saklama:** `mediatracker-prod-pre-d2b1-<UTC>-supabase-{schema,data,roles}` ve SHA-256 manifesti kullanılır.
- **Doğrulama:** CLI exit code tek başına yeterli değildir; dump listesi, checksum ve restore smoke zorunludur.

Docker bulunmadığı varsayımıyla ilk tercih doğrulanmış platform backup/PITR, bağımsız ikinci kanıt ise erişim varsa native `pg_dump` olur. Tek backup yöntemi yeterli kabul edilmez.

## Production cutover sırası

1. Read-only inventory ve preflight çalıştır; project-ref, history ve schema fazını doğrula.
2. Platform backup/PITR ve seçilen bağımsız dump artefact'ını oluştur.
3. Checksum, dump listesi ve izole restore testiyle backup'ı doğrula.
4. Migration history/schema farklarını tek tek değerlendir; otomatik `migration repair` kullanma.
5. Uygulanmış D2B.0/D2B.1 şemasını post-verification ile doğrula; migration'ları yeniden çalıştırma.
6. Runtime rollout guard içeren V2 destekli release adayını kontrollü ortamda doğrula.
7. Kontrollü cohort'ta V2 feature flag'i aç; adapter/schema kartını ve conflict sonuçlarını izle.
8. Legacy direct DML trafiğinin sıfırlandığını kanıtla; eski sekmeler için bakım/reload gate aç.
9. D2C.1 preflight'i tekrar çalıştır; yalnız D8 go/no-go onayından sonra enforcement migration ve post-verification uygula.
10. İki kullanıcıyla media/progress, RLS, CAS, idempotency, tombstone/restore ve owner-switch smoke'u tamamla.

## Incident ve roll-forward

D2B.1 additive fazında, V2 trafik başlamadıysa flag kontrollü biçimde kapatılabilir; schema nesneleri silinmez. D2C.1 commit edildikten sonra legacy client'a dönülmez. Mutation dispatch durdurulur, durable queue ve operation ledger korunur, audit/post-verification yeniden alınır ve düzeltici roll-forward hazırlanır. Cross-owner aynı record ID oluştuktan sonra global `id` PK'ye destructive rollback yapılmaz.

Bu plan [Cloud Media Schema V2 Migration Runbook](./CLOUD_MEDIA_SCHEMA_V2_MIGRATION_RUNBOOK.md) ve [Roadmap](./ROADMAP.md) ile birlikte değerlendirilir.
