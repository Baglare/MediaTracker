# Native PostgreSQL P4 — Nihai hosting kurulum şartnamesi

Tarih: 2026-10-10. Kapsam: PostgreSQL 18.6, TürkHosting tarafından önceden
oluşturulan roller/şemalar ve özel CA ile TLS `verify-full`.

Bu belge kaynak uyarlamasının provisioning sözleşmesidir. Hosting üzerinde
çalıştırılmış SQL veya kabul kanıtı değildir. Gerçek migration/Auth/RLS,
bakım, dump/restore ve Production kabulü **LIVE_UNVERIFIED** kalır.
Tarihsel P4 kanıtları silinmez; önceki TLS testi yeni destek yanıtıyla tarihsel
duruma geçmiştir. Sağlayıcının TLS açıklaması kullanıcı tarafından aktarılmıştır.

## TürkHosting'e gönderilecek yanıt

Merhaba,

PostgreSQL 18.6 için TLS, özel CA, test/Production ayrımı ve önceden provisioning
desteğini doğruladığınız için teşekkür ederiz. Uygulama, aşağıdaki kapalı rol
profillerine uyarlanmıştır. İlk önerideki sekiz rol tek başına yeterli değildir:
her ortam için ayrıca `database_owner`, `ledger_owner`, `backup` ve `restore`
gerekiyor. Şema sahibi roller ile veritabanı/ledger sahiplerini ayırmamız;
FORCE RLS altında eksiksiz yedekleme, ownership/ACL koruyan restore ve ortamlar
arası CONNECT izolasyonu içindir. Lütfen yalnız ilk sekiz rolü oluşturmayınız.

Test ana veritabanı `mt_p4_test`, Production ana veritabanı `mediatracker_prod`
olacaktır. Restore provası için ayrı ve boş `mt_p4_test_restore` ve
`mediatracker_prod_restore` veritabanlarına ihtiyaç vardır; ikinci isim de
**disposable kurtarma hedefidir**, Production uygulamasının çalışacağı hedef
değildir. Bu veritabanlarını veya mevcut test veritabanını silmeyiniz.
Mevcut hedefin boşluğu doğrulanamazsa işlemi durdurup bize bildiriniz.

Aşağıdaki tam rol listesi, PostgreSQL 18 üyelik seçenekleri, şema sahiplikleri,
CONNECT/CREATE ve TLS politikasıyla provisioning yapılmasını rica ediyoruz.
Hiçbir test rolüne Production rol üyeliği verilmemelidir. Runtime login'e
owner/migrator/privacy/backup/restore/limiter üyeliği ve hiçbir database veya
şemada CREATE verilmemelidir. Runtime yalnız Auth access yetkilerini
`INHERIT TRUE, SET FALSE, ADMIN FALSE` ile kullanacaktır.

Database/role/schema oluşturma, rol üyelikleri, rol özellikleri, database/public
ACL'leri ve CA dosyasının güvenli teslimi sizin tarafınızdan yapılacaktır.
Biz fingerprint ve salt-okunur kontrollerden sonra uygulama migration'larını,
tablo/fonksiyon grant'larını, Auth/RLS/bakım ve izole backup/restore testlerini
çalıştıracağız. Migration login'i için CREATEROLE veya SUPERUSER istemiyoruz.
Uygulama için extension gerekmiyor; ileride extension ihtiyacı olursa ayrıca
sizin desteğinize başvuracağız.

Bağlantı `127.0.0.1:5433`, SSL mode `verify-full`, CA dosyası
`/var/www/vhosts/baglare.com.tr/.postgresql/root.crt` olacaktır. SAN olarak
`127.0.0.1`, `::1`, `localhost`; bildirilen sertifika bitiş yılı 2031 esas
alınmıştır. Sertifika zinciri, dosya izinleri ve Production endpoint'i ayrıca
doğrulanacaktır. Production'ın da aynı TLS sözleşmesini desteklemesini rica
ediyoruz; endpoint farklıysa gerçek endpoint ve SAN bilgisini bildiriniz.

Backup ve restore login'leri için aşağıdaki dar kullanım sınırlarıyla BYPASSRLS
gereklidir. Bu yetkiyi sağlayamıyorsanız eksiksiz dump/restore'u sizin yürüttüğünüz
bir operasyon olarak ayrıca netleştirmeliyiz; RLS'yi kaldırarak veya eksik dump'ı
başarılı sayarak devam etmeyeceğiz. Bağlantı limitleri, rol/ACL katalog çıktıları,
CA teslimi ve boş hedef kontrolünün sonucunu şifresiz bir rapor olarak;
login parolalarını ayrı, güvenli kanal üzerinden paylaşmanızı rica ediyoruz.

Bu talep provisioning içindir; Production migration/deploy/cutover yetkisi vermez.

## Veritabanları ve sahiplik

| Veritabanı | Profil / kullanım | Sahip | CONNECTION LIMIT |
|---|---|---|---|
| `mt_p4_test` | `hosting-test`, disposable P4 uygulama | `mt_test_database_owner` | 15 |
| `mediatracker_prod` | `hosting-production`, Production uygulama | `mt_prod_database_owner` | 15 |
| `mt_p4_test_restore` | `hosting-test`, boş disposable restore | `mt_test_database_owner` | 6 |
| `mediatracker_prod_restore` | `hosting-production`, boş disposable restore | `mt_prod_database_owner` | 6 |

Database owner NOLOGIN'dir ve hiçbir uygulama rolü ona üye olmaz. Böylece
schema owner üyeliği database owner yetkisi kazandırmaz. `public` sahibi
`pg_database_owner` olarak kalır; bu rolün fiili üyesi yalnız database owner'dır.

Ana veritabanında CONNECT yalnız kendi ortamındaki runtime, migrator,
privacy_login ve backup login'lerine verilir. Restore login'inin ana veritabanına
CONNECT izni yoktur. Restore veritabanında CONNECT yalnız ilgili restore
login'ine verilir. PUBLIC CONNECT/CREATE/TEMPORARY kaldırılır. Önceki veya
ilgisiz login'lerin bu dört hedefteki CONNECT grant'ları da kaldırılır.
Test ve Production hedeflerinin ACL'leri iki yönde kontrol edilir.
Paylaşımlı sunucudaki diğer müşterilerin database ACL'leri değiştirilmez;
bu uygulama login'lerinin başka hedeflere erişimi ayrıca sağlayıcı pg_hba
politikasıyla sınırlandırılmalıdır.

Ana database üzerinde hiçbir uygulama login'ine CREATE veya TEMPORARY verilmez.
Restore database üzerinde yalnız restore login'i ve `owner`, `auth_owner`,
`limiter`, `ledger_owner` NOLOGIN rollerine CREATE verilir. Bu, pg_restore'un
şemaları oluşturup sahiplerini koruması için gereklidir; bu rollerin ana
database üzerinde CREATE izni yoktur.

## Tam rol listesi ve özellikler

Tüm roller: NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION.
Yalnız backup ve restore: BYPASSRLS. Diğer bütün roller: NOBYPASSRLS.
Yalnız runtime: INHERIT. Diğer roller: NOINHERIT; aşağıdaki üyeliklerin
`inherit_option` değerleri PostgreSQL 18'de açıkça ayarlanır.

| Test rolü | Production rolü | LOGIN | CONNECTION LIMIT |
|---|---|---|---|
| `mt_test_runtime` | `mt_prod_runtime` | evet | 5 |
| `mt_test_migrator` | `mt_prod_migrator` | evet | 2 |
| `mt_test_privacy_login` | `mt_prod_privacy_login` | evet | 2 |
| `mt_test_backup` | `mt_prod_backup` | evet | 2 |
| `mt_test_restore` | `mt_prod_restore` | evet | 2 |
| `mt_test_owner` | `mt_prod_owner` | hayır | -1 |
| `mt_test_auth_owner` | `mt_prod_auth_owner` | hayır | -1 |
| `mt_test_auth_access` | `mt_prod_auth_access` | hayır | -1 |
| `mt_test_privacy_operator` | `mt_prod_privacy_operator` | hayır | -1 |
| `mt_test_limiter` | `mt_prod_limiter` | hayır | -1 |
| `mt_test_database_owner` | `mt_prod_database_owner` | hayır | -1 |
| `mt_test_ledger_owner` | `mt_prod_ledger_owner` | hayır | -1 |

Her login için ayrı yüksek entropili SCRAM parolası; runtime parolası ops
ortamına kopyalanmaz. Owner rolleri için parola gerekmez. Backup/restore
parolaları web runtime'a veya repository'ye konmaz; yalnız kontrollü işlem
penceresinde kullanılır. Limitler kişi başına değil role başına küreseldir.
Runtime pool default 2, en fazla 5'tir; Passenger worker sayısıyla toplamını
rol/database limitlerine göre operatör yönetir. Bu limitler kapasite kabulü değildir.

## PostgreSQL 18 üyelik grafiği

Tabloda adlar ortam öneki olmadan yazılmıştır. Her satır yalnız kendi
`mt_test_` veya `mt_prod_` ortamında uygulanır. Her üyelikte ADMIN FALSE.
Listede olmayan üyelik yoktur; özellikle database_owner'a üyelik verilmez.

| Üye | Verilen rol | INHERIT | SET |
|---|---|---|---|
| runtime | auth_access | TRUE | FALSE |
| migrator | owner, auth_owner, limiter, ledger_owner | FALSE | TRUE |
| privacy_login | privacy_operator | TRUE | FALSE |
| backup | privacy_operator | FALSE | FALSE |
| restore | privacy_operator | FALSE | FALSE |
| restore | owner, auth_owner, limiter, ledger_owner | TRUE | TRUE |

Backup'ın privacy üyeliği yalnız SQL içindeki MEMBER kontrolünü sağlar;
privacy fonksiyonlarının tamamını devralmaz ve SET ROLE yapamaz. Migration
009 ona yalnız freeze ve backup doğrulama fonksiyonlarının EXECUTE izinlerini
verir. Restore'un owner yetkilerini devralması ownership/ACL restore için
gereklidir; ayrı database ve login ile sınırlanır. Privacy login owner değildir.
Migrator PRIVACY yetkisi almaz; web runtime hiçbir bakım rolüne geçemez.

PostgreSQL 18 üyelik semantiği ve FORCE RLS/dump davranışı için:
[Role Membership](https://www.postgresql.org/docs/18/role-membership.html),
[CREATE ROLE](https://www.postgresql.org/docs/18/sql-createrole.html),
[Row Security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

## Şemalar

Ana veritabanında hosting aşağıdaki **boş** şemaları önceden oluşturur.
Şema mevcut ama sahibi yanlışsa veya içinde herhangi bir tablo, sequence,
view, type, function ya da başka nesne varsa bootstrap reddedilir.
Mevcut ledger varsa boşluk aranmaz; sıralı history ve checksum doğrulanır.

| Şema | Test sahibi | Production sahibi |
|---|---|---|
| app | mt_test_owner | mt_prod_owner |
| native_auth | mt_test_auth_owner | mt_prod_auth_owner |
| private_rate_limit | mt_test_limiter | mt_prod_limiter |
| private_privacy_ops | mt_test_owner | mt_prod_owner |
| native_migrations | mt_test_ledger_owner | mt_prod_ledger_owner |

`native_migrations` başlangıç önerisindeki migrator yerine ledger_owner'a
aittir: restore login'inin primary CONNECT sahibi migrator'a üye olması gerekmez.
Hosting, migrator'a bu şemada yalnız USAGE verir; ledger oluşturma/insert
işlemleri runner tarafından SET ROLE ledger_owner ile yapılır.
PUBLIC ve runtime'ın bu şemada CREATE/ledger DML izni yoktur.

Restore database'lerinde bu beş şema **önceden oluşturulmaz**. Yalnız boş
`public` ve sistem şemaları bulunur; pg_restore şemaları dump'tan oluşturur.
Şemaların önceden yaratılması pg_restore'un CREATE SCHEMA adımıyla çakışır.
Restore hedefi kirlendiyse uygulama temizlemez; yeniden boş hedef hazırlanması
ayrı hosting işlemidir. Bu çalışma hiçbir mevcut database'i silmez.

`public` üzerinde PUBLIC ve uygulama rolleri için CREATE yoktur. Önceki
runtime'a doğrudan verilen CREATE kaldırılmalıdır. public'te uygulama/extension
nesnesi bulunmaz. Yerleşik UUID/SQL özellikleri yeterlidir; pgcrypto gerekmez.

## Sağlayıcının uygulayacağı kurulum sırası

1. PostgreSQL 18.6 ve TLS/CA/SAN doğrulaması; database/rol isimlerinde çakışma
   ve mevcut veri kontrolü. Mevcut hedefi silmeyin veya otomatik yeniden oluşturmayın.
2. Yukarıdaki 24 rolü tam özellik/limitlerle oluşturun. CREATEROLE/BYPASSRLS
   ayarlarını yalnız sağlayıcı yapar. Parolaları güvenli kanaldan teslim edin.
3. Üyelik grafiğini PostgreSQL 18 seçenekleriyle kurun. Örnekler:

   ```sql
   GRANT mt_test_auth_access TO mt_test_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
   GRANT mt_test_owner TO mt_test_migrator WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
   GRANT mt_test_privacy_operator TO mt_test_privacy_login WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
   GRANT mt_test_privacy_operator TO mt_test_backup WITH ADMIN FALSE, INHERIT FALSE, SET FALSE;
   GRANT mt_test_owner TO mt_test_restore WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
   ```

   Aynı seçeneklerle grafikteki **bütün** satırları her iki ortam için uygulayın;
   bu örnekler tek başına tam provisioning değildir.
4. Dört database'i yukarıdaki owner/limitlerle hazırlayın. Mevcut `mt_p4_test`
   boş ve ayrıca doğrulanmışsa DBA ownership/ACL düzeltmesini kaydederek
   kullanabilir; bilinmeyen veya dolu hedefte durulur. PUBLIC CONNECT, CREATE,
   TEMPORARY ve eski/unlisted rollerin grant'larını kaldırın. Yukarıdaki
   ana/restore database CONNECT ve CREATE matrisini uygulayın.
5. Yalnız ana database'lerde beş boş şemayı tam owner ile oluşturun. Her
   managed şemada PUBLIC ACL'lerini kaldırın. Migrator'a native_migrations
   USAGE verin. `public` sahibi pg_database_owner; public CREATE grant'larını kaldırın.
6. Runtime rolüne search_path=native_auth,pg_catalog; statement_timeout=5s;
   lock_timeout=2s; idle_in_transaction_session_timeout=10s ayarlayın.
   Login parolası değişimi için gerekirse sağlayıcı işlemi uygulayın; migrator
   rolü diğer login'lerin parolasını değiştirmek üzere CREATEROLE almaz.
7. CA dosyasını normal PEM dosyası olarak, symlink olmadan ve private key
   içermeden sunun. Uygulama/CLI kullanıcısı okuyabilsin; başka kullanıcılar
   dosyayı veya üst dizinleri değiştiremesin. CA yenilemesinde operatörle
   koordineli değişim yapın. PostgreSQL client araçları (`pg_dump`, `pg_restore`)
   için sürüm 18 ve PATH erişimi sağlayın.
8. Aşağıdaki salt-okunur katalog çıktılarıyla provisioning'i raporlayın.
   Public CREATE, ortamlar arası CONNECT ve beklenmeyen üyelikler varsa
   kabul başarısızdır. Extension kurmayın veya test/Production verisi aktarmayın.

## Bizim uygulayacağımız işlemler

1. Ayrı CLI ortamında doğru profil/login/database/TLS seçilir. İlk
   `--connect` yalnız fingerprint ve katalog incelemesidir. Fingerprint
   bağımsız doğrulanmadan NATIVE_OPS_EXPECTED_FINGERPRINT doldurulmaz.
2. Migration planı/history kontrolü ve daha sonra yalnız yetkili hedefte
   `native-migration-runner.mjs --connect --apply --confirmation
   "MIGRATE <environment> <fingerprint>"` kullanılır. Hosting için tarihsel
   `native-migrations.mjs` psql çıktısı kullanılmaz; o yerel provisioning planıdır.
3. Runner boş şema ownership/rol grafiğini doğrular; CREATE ROLE/SCHEMA veya
   ALTER ROLE yürütmez. Advisory session lock, migration başına transaction,
   atomik ledger insert ve sıralı checksum kontrolü korunur. Rollback sonrası
   retry aynı planı kullanır; profile veya SQL değişimi checksum drift olarak reddedilir.
4. 001–009 uygulama tabloları/fonksiyonları, dar grants, RLS/FORCE RLS,
   Auth erişimi, limiter ve privacy/bakım fonksiyonlarını kurar. Limiter'ın
   app CREATE yetkisi yalnız 006 transaction'ında verilir ve geri alınır.
   Backup'ın SELECT/freeze grant'ları 009 ile kurulur; runtime'a geniş DML yoktur.
5. Test ortamında Better Auth, Cloud/Goals/Social/XP/Themes, limiter, A/B ve
   anonymous RLS, privacy Auth-last, bakım, backup/restore kabulü yapılır.
   Production migration/deploy ayrı açık yetki gerektirir.

## TLS ve environment sözleşmesi

Web runtime yalnız ilgili profilin runtime login'ini kabul eder. DATABASE_URL
query/hash içeremez; sslmode URL parametresiyle bypass yoktur. Örneğin test:

```text
NATIVE_ROLE_PROFILE=hosting-test
DATABASE_URL=postgresql://mt_test_runtime:<private-password>@127.0.0.1:5433/mt_p4_test
DATABASE_SSL_MODE=verify-full
DATABASE_SSL_CA_FILE=/var/www/vhosts/baglare.com.tr/.postgresql/root.crt
```

Production: profil hosting-production, login mt_prod_runtime, database
mediatracker_prod. `local` profil yalnız loopback ve tarihsel `mt_*` modeli
içindir; hosting database/rol isimlerini reddeder. Runtime NODE_ENV=production
olması Plesk test uygulamasının Production database'e bağlı olduğu anlamına gelmez.

Ops aynı NATIVE_ROLE_PROFILE'i kullanır; NATIVE_OPS_ROLE_KIND
`migrator`, `privacy_login`, `backup` veya `restore` olur. Ayrı
NATIVE_OPS_DATABASE_URL, NATIVE_OPS_SSL_MODE=verify-full,
NATIVE_OPS_SSL_CA_FILE ve doğrulanmış NATIVE_OPS_EXPECTED_FINGERPRINT gerekir.
Test ana hedefi için NATIVE_OPS_ENVIRONMENT=disposable; Production ana
hedefi için production; iki restore hedefi için disposable kullanılır.
Kind, login ve database birbirine sabit bağlanmıştır; restore primary'e gidemez.

Bu ayarlar server-only'dir; NEXT_PUBLIC_ karşılıkları yoktur. Ops parolaları
web process'e taşınmaz. Better Auth origin/secrets, limiter anahtarları,
private storage ve v1 disabled/provider politikaları mevcut runbook'a göre korunur.

Node bağlantısı özel CA zincirini ve gerçek URL hostname/IP kimliğini
doğrular; rejectUnauthorized daima true'dur. Eksik/bozuk/süresi dolmuş CA,
symlink veya private key reddedilir. Yanlış zincir/SAN handshake'i başarısız
olur. CLI child process'e PGSSLMODE=verify-full ve PGSSLROOTCERT aynı CA
path'iyle verilir. Production/hosting plaintext alternatifi yoktur.

## Privacy ve bakım

Privacy login yalnız privacy_operator üzerinden mevcut SECURITY DEFINER
fonksiyonlarını kullanır; doğrudan owner/RLS bypass veya Auth tablo DML almaz.
Cleanup, account write barrier, staged deletion, filesystem doğrulama ve
Auth-last sırası korunur. Hosting privacy işi doğrulanmış gerçek operator
client'ına bağlıdır; JSON fingerprint taklidi yeterli değildir. Yerel Docker
privacy işinde mevcut runner-owned disposable capability kontrolü aynen kalır.
Destructive privacy işleminde operator fingerprint teyidine ek olarak testte
`ERASE DISPOSABLE <uuid>`, Production'da `ERASE PRODUCTION <uuid>` ve mevcut
participant-loss onayı gerekir. CLI çıktısına export/UUID/email dökülmez.
Cron scheduler kanıtı gerçek bakım yetkisi/başarısı değildir.

## Backup/restore sınırları

pg_dump tam veriyi almak için row_security=off kullanır. FORCE RLS altında
yalnız schema owner üyeliği yeterli değildir; ayrı backup login BYPASSRLS
ve beş managed şemada SELECT alır. pg_read_all_data gibi bütün cluster'a
yayılan bir rol verilmez. Backup doğrudan INSERT/UPDATE/DELETE/CREATE almaz;
yalnız write freeze/ops doğrulama fonksiyonlarına EXECUTE alır.

Backup: uygulama yazmaları freeze edilir; bütün worker, cron ve diğer ops
işleri durdurulur; custom PostgreSQL dump + bütün private filesystem birlikte
alınır; dosya checksum'ları, ledger, referanslar, RLS ve lifecycle doğrulanır.
Hosted dump boş `public` şemasını dışlar; diğer bütün database içeriği dump'a
girer. Preflight public veya beklenmeyen user schema nesnesi bulursa reddeder.
Database/role/global ACL'ler ve boş public sahipliği provisioning kaydıdır;
pg_dumpall/global-role backup değildir. Sertifika/parolalar dump manifestine eklenmez.
Eksik dump veya pg_dump hatası başarı olarak raporlanmaz. Database ve
private dosyalar önceki rollback mekanizmasının yerine geçmez.
Mevcut recovery sınırları toplam 2 GiB / 10.000 dosya ve child PostgreSQL
aracı için 180 saniyedir; aşımda işlem başarısız olur, kısmi backup başarılı
sayılmaz. Daha büyük veri bu kaynak sınırlarıyla doğrulanmış değildir.

Restore: yalnız belirtilen boş disposable database + boş private storage.
Restore login BYPASSRLS ve yalnız schema owner/ledger_owner üyeliklerini
devralır; primary CONNECT/migrator/database_owner üyeliği yoktur.
`pg_restore --exit-on-error --single-transaction` ownership/ACL'leri korur;
--no-owner/--no-acl/--enable-row-security kullanılmaz. Kaynak profile ait
backup başka role profile'a restore edilemez. Restore sonrası graph,
schema/database ownership, runtime CREATE/üyelik, FORCE RLS, güvenli
SECURITY DEFINER search_path, ledger/checksum, dosya referansları ve freeze
yeniden doğrulanır. Sonuç RESTORED_FROZEN kalır; trafik açılmaz.
Backup erased hesapları geri getirebilir: privacy reconciliation yapılmadan
unfreeze yoktur. Restore başarısızlığı hedefi temizlemez; yeniden deneme için
boş hedefin sağlayıcı tarafından ayrıca hazırlanması gerekir.

## Kurulum sonrası salt-okunur kabul sorguları

Her database'de ayrı çalıştırılır. Sonuçlar yukarıdaki tablo/grafikle birebir
karşılaştırılır; ad hoc grant eklenerek başarısız kontrol atlatılmaz.

```sql
SELECT current_database(),session_user,current_user,
       current_setting('server_version_num'),inet_server_addr(),inet_server_port();
SELECT ssl,version,cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid();
SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,
       rolcreaterole,rolreplication,rolconnlimit
FROM pg_roles WHERE rolname LIKE 'mt\_test\_%' ESCAPE '\'
                  OR rolname LIKE 'mt\_prod\_%' ESCAPE '\' ORDER BY rolname;
SELECT member.rolname AS member,role.rolname AS role,
       m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member
JOIN pg_roles role ON role.oid=m.roleid
WHERE member.rolname LIKE 'mt\_test\_%' ESCAPE '\'
   OR member.rolname LIKE 'mt\_prod\_%' ESCAPE '\' ORDER BY 1,2;
SELECT datname,pg_get_userbyid(datdba) AS owner,datconnlimit,datacl
FROM pg_database WHERE datname IN
 ('mt_p4_test','mediatracker_prod','mt_p4_test_restore','mediatracker_prod_restore');
SELECT r.rolname,d.datname,
 has_database_privilege(r.oid,d.oid,'CONNECT') AS connect,
 has_database_privilege(r.oid,d.oid,'CREATE') AS create,
 has_database_privilege(r.oid,d.oid,'TEMP') AS temporary
FROM pg_roles r CROSS JOIN pg_database d
WHERE (r.rolname LIKE 'mt\_test\_%' ESCAPE '\' OR r.rolname LIKE 'mt\_prod\_%' ESCAPE '\')
  AND d.datname IN ('mt_p4_test','mediatracker_prod','mt_p4_test_restore','mediatracker_prod_restore');
SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl
FROM pg_namespace WHERE nspname IN
 ('app','native_auth','private_rate_limit','private_privacy_ops','native_migrations','public');
SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('app','native_auth','private_rate_limit','private_privacy_ops','native_migrations');
SELECT n.nspname,p.proname,pg_get_userbyid(p.proowner) AS owner,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('app','native_auth','private_rate_limit','private_privacy_ops');
-- Migration sonrası, migrator/ops login'iyle:
SELECT name,checksum FROM native_migrations.ledger ORDER BY name;
```

Katalog okumaları TLS istemcisinin SAN/CA doğrulamasının yerine geçmez.
Ops `--connect` ek olarak tam graph, üyelik seçenekleri, runtime güvenlik
ve ownership sözleşmesini fail-closed kontrol eder. Migration checksum'ları
profilin `native-hosting-migration-state.json` kaydıyla karşılaştırılır.
Gerçek A/B/anonymous RLS/Auth ve tam backup/restore provasını yalnız bu
salt-okunur katalog çıktılarıyla kapatmayın.

## Yerel doğrulama ve açık kanıtlar

Başlangıç branch `release/v1-hardening`, HEAD
`e8424e970673b81cb3e20c1653ad39ca0ef211b6`; başlangıç çalışma ağacı temizdi.
001–009 tarihsel SQL dosyaları ve yerel migration checksum'ları değişmedi.

| Kontrol | Sonuç ve sınır |
|---|---|
| Full Vitest, 4 worker | PASS: 3166; mevcut SKIP: 57; 216 dosya PASS / 19 dosya SKIP. Timeout/assertion değiştirilmedi. İlk default worker çalıştırmasında eski env JSON drift'i, ikinci eşzamanlı çalıştırmada 5s timeout görüldü; env sözleşmesi güncellendi ve worker sayısı azaltılarak full tekrar geçti. |
| Hedefli Node: hosting/migration/privacy/recovery/TLS | PASS: 35/35. Hosting SQL/RLS yürütülmedi; bootstrap ve round-trip testleri sentetik client/tool kullanır. |
| Gerçek loopback TLS | PASS: geçici OpenSSL CA + leaf; DNS localhost, IP 127.0.0.1 ve IPv6 SAN; yanlış CA/hostname ve eksik/bozuk CA reddedildi. Gerçek PostgreSQL protokolü/hosting TLS kabulü değildir. |
| Full Node | 347 test: 319 PASS, 28 FAIL, 0 SKIP. 28 hata native artifact testlerinde Windows symlink EPERM / FIFO için mkfifo yokluğu; testler gevşetilmedi veya atlanmadı. |
| Typecheck | PASS: tsc --noEmit --incremental false. İlk çalıştırmada tsbuildinfo yazma engeli; yeni rol eşlemesinin TS tipi düzeltildikten sonra son typecheck geçti. |
| Source lint | PASS: 955 tracked/non-ignored kaynak dosyası, 0 error / 9 warning (8 ignored reference dosyası uyarısı, 1 mevcut social navigation uyarısı). |
| Varsayılan npm run lint | FAIL: mevcut .codex/dist üretilmiş dosyaları da tarıyor; 9927 error / 173835 warning. Lint config değiştirilmedi; source lint ayrıca çalıştırıldı. |
| Native Windows build | PASS: sentetik local native profile + ci-offline network guard; gerçek env değerleri bastırıldı. Node/Edge ve tracing uyarıları mevcut. İlk build TS rol tipi hatasında durmuş, düzeltme sonrası build geçmiştir. |
| Hosted execution snapshot / git diff --check | PASS. |
| Yeni disposable gerçek PostgreSQL 18 SQL/RLS | NOT_RUN: Docker Desktop CLI/context bulundu fakat yerel dockerDesktopLinuxEngine pipe'ı yok; daemon başlatılmadı. |
| Native Linux artifact/ABI | NOT_RUN: Ubuntu'da Node ve local Docker socket erişimi yok; kurulum yapılmadı. |
| TürkHosting / mevcut DB / Production | NOT_RUN; hiçbir bağlantı, SQL, deploy, migration, cutover veya veri işlemi yapılmadı. |

Supabase fallback/rollback ve sağlayıcı politikaları korunur. Gerçek PostgreSQL
18 disposable ve hosted P4 kabulü yerel mock/TLS kanıtından ayrıdır; P5_READY=NO.
Sağlayıcı rol/ACL/TLS provisioning'ini, Production endpoint/SAN ve client 18
araçlarını teslim etmelidir. Bunun ardından yalnız ayrıca yetkili disposable
hedefte gerçek migration/Auth/RLS, privacy/bakım ve tam dump/restore kabulü
açıktır. Ingress/capacity dahil önceki diğer P4 kabul kapıları kapatılmış sayılmaz.

## Değiştirilen dosyalar

| Alan | Dosyalar |
|---|---|
| Runtime rol/TLS/readiness | lib/backend/native-roles.mjs; postgres-tls.mjs; native-config.ts; postgres.ts; transaction.ts; deployment-config.mjs; native-hosting-migration-state.json |
| Migration/provisioning sözleşmesi | scripts/native-hosting-sql.mjs; native-hosting-contract.mjs; native-migrations.mjs; native-migration-runner.mjs; native-ops-target.mjs |
| Ops/recovery/privacy | scripts/native-recovery.mjs; native-maintenance.mjs; native-privacy-ops.mjs; privacy-account-model.mjs |
| Env sözleşmesi | .env.example; scripts/ops/release-policy.mjs; docs/V1_HARDENING_06_ENV_CONTRACT.json |
| Testler | tests/native-hosting-compatibility.test.mjs; native-hosting-config.test.ts; native-postgres-tls.test.mjs |
| Dokümanlar | docs/NATIVE_P4_FINAL_HOSTING_PROVISIONING.md; NATIVE_HOSTING_DEPLOYMENT_RUNBOOK.md; NATIVE_BACKEND_P4_HOSTING_PROOF.md |

Kalıcı rol/sahiplik değişikliği için mevcut canonical `MediaTracker - Sistem
Mimarisi` notu incelendi; repo içindeki inert Vault güncelleme önerisi hazırlandı.
Canonical/Vault mutation, KnowledgeCompiler apply, AGENTS değişikliği ve
commit/push yapılmadı. Bu öneri uygulanmış Vault gerçeği değildir.
