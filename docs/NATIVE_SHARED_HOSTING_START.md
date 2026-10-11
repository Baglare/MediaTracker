# TürkHosting shared hosting: test bağlantısı

2026-10-11. `rapor-20261010.txt` okundu. Sağlayıcı raporu canlı uygulama
kanıtı değildir. Yeni rol/database istemiyoruz; gerçek DB/Auth/RLS/deploy
henüz doğrulanmadı. Bu belge mevcut yapı için önceki dedicated provisioning
şartnamesinin yerini alır; tarihsel kanıtlar korunur.

`NATIVE_ROLE_PROFILE=hosting-test|hosting-production` ayrımı korunur.
`NATIVE_HOSTING_CAPABILITY=shared-managed` açıkça seçilir; eksik değer eski
`dedicated` sözleşmesidir. Geçersiz değer ve local+shared reddedilir.
Tarihsel SQL, local checksum'lar ve hosted 001–008 checksum'ları değişmez.
Hosted 009 rol eşlemesi ve checksum'ı güncellenmiştir; güncel manifest
`nativeMigrationManifest(profile)` ve `native-hosting-migration-state.json` ile eşleşir.
2026-10-11 kullanıcı bildirimi: gerçek mt_p4_test üzerinde 001–009 uygulandı ve
009 ledger checksum'ı doğrulandı. Bu kaynak incelemesinde DB bağlantısı yapılmadı;
Auth/RLS/runtime/recovery kabulü ayrıca doğrulanmalıdır.

Shared profil BYPASSRLS, ayrı restore DB, database ACL/CONNECT izolasyonu veya
pg_hba yönetimi istemez. Database sahibi sağlayıcıdır. PUBLIC TEMP kabul
edilir; runtime search_path içinde pg_temp açıkça sondadır. Runtime hedef
DB/uygulama şemalarında CREATE, owner/ops üyeliği, SET auth_access veya
superuser/BYPASSRLS kabul edilmez. Şema sahipliği/üyelik grafiği/PUBLIC ACL
kontrolleri, TLS verify-full, Auth/session, RLS/FORCE RLS, private dosyalar,
limiter, CSRF/CSP ve migration transaction/history/lock korunur.
Başka DB'lere CONNECT varlığı o DB'ye bağlanma yetkisi değildir; exact
URL/rol/database/fingerprint sınırı korunur. Native backup/restore shared
profilde bağlantı öncesinde reddedilir; eksik dump başarı sayılamaz.

## 1. Erişim ve operatör kodu

Plesk → Websites & Domains → baglare.com.tr → Hosting & DNS / Hosting Access:
mevcut sistem kullanıcısı ve SSH erişimini bulun. SSH host'unu TürkHosting
hizmet detaylarından alın; DB loopback adresi SSH host'u değildir. Node 24
executable yolunu Plesk Node.js ekranından alın, `node --version` ile doğrulayın.
`mt_test_migrator` parolasını mevcut sağlayıcı tesliminden/destekten güvenle
alın; Plesk/Production parolasıyla karıştırmayın. Secret'ı sohbet/Git/loga koymayın.

Güncel kaynak dosyalarını public/document root DIŞINDA ayrı operatör dizinine
yükleyin; mevcut Passenger uygulamasını değiştirmeyin. Repo-relative yapıyla:

Hazırlanan `mediatracker-test-preflight.zip` aşağıdaki dosyaları ve checksum
manifest'ini içerir; secret, Windows dependency veya runtime artifact içermez.
Plesk File Manager ile ev dizininde yeni `mt-p4-operator-20261011` klasörüne
yükleyip orada açın. SSH terminalinde bu klasöre geçin. Mevcut doğrulanmış Linux
artifact'ın gerçek dizinini File Manager'dan bulun; pg varlığını kontrol ederek
yalnız yeni operatör dizininde aşağıdaki linki oluşturun:

```bash
test -f /GERCEK_LINUX_ARTIFACT_DIZINI/node_modules/pg/package.json && ln -s /GERCEK_LINUX_ARTIFACT_DIZINI/node_modules ./node_modules
```

`GERCEK_LINUX_ARTIFACT_DIZINI` yerine mevcut artifact'ın tam dizinini yazın;
örnek yol tahmin ederek çalıştırmayın. Artifact içeriği değişmez.

- scripts: native-hosting-preflight.mjs, native-ops-target.mjs,
  native-hosting-contract.mjs, native-migration-runner.mjs, native-migrations.mjs,
  native-hosting-sql.mjs.
- lib/backend: native-roles.mjs, postgres-tls.mjs, native-migration-state.json.
- database/native: mevcut 001–009 SQL dosyaları.

`pg` ve bağımlılıkları mevcut doğrulanmış Linux artifact'ın node_modules
ağacından çözülmelidir; Windows node_modules yüklemeyin. Operatör dizinini
artifact'ın kopyasında oluşturabilir veya private operatör dizininden mevcut
node_modules'a kontrollü link verebilirsiniz. Operatör kaynak paketi runtime
build artifact'ı değildir. Ağır/yeni dependency kurulumu gerekmez.

## 2. Secret dosyası — sunucuda Bash

Shell trace kapalı olsun. Dosya sistem kullanıcısının ev dizininde, Git ve
uygulama dışında oluşturulur; eski dosya üzerine yazılmaz. Parola gizli
terminal girişinden alınır, URL encoding yapılır.

```bash
set +x
umask 077
read -r -s -p 'mt_test_migrator parolası: ' mt_password
printf '\n'
MT_SETUP_PASSWORD="$mt_password" node --input-type=module <<'NODE'
import { mkdirSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
try {
  if (!process.env.MT_SETUP_PASSWORD) throw new Error();
  const config = join(realpathSync(homedir()), '.config');
  const dir = join(config, 'mediatracker');
  for (const p of [config, dir]) {
    mkdirSync(p, { recursive: true, mode: 0o700 });
    if (!lstatSync(p).isDirectory() || lstatSync(p).isSymbolicLink()) throw new Error();
  }
  const u = new URL('postgresql://mt_test_migrator@127.0.0.1:5433/mt_p4_test');
  u.password = encodeURIComponent(process.env.MT_SETUP_PASSWORD);
  writeFileSync(join(dir, 'hosting-test.env'), [
    'NATIVE_ROLE_PROFILE=hosting-test', 'NATIVE_HOSTING_CAPABILITY=shared-managed',
    'NATIVE_OPS_ENVIRONMENT=disposable', 'NATIVE_OPS_ROLE_KIND=migrator',
    'NATIVE_OPS_SSL_MODE=verify-full',
    'NATIVE_OPS_SSL_CA_FILE=/var/www/vhosts/baglare.com.tr/.postgresql/root.crt',
    'NATIVE_OPS_DATABASE_URL=' + u.href,
  ].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('OPERATOR_ENV_CREATED');
} catch { console.error('OPERATOR_ENV_NOT_CREATED'); process.exitCode = 1; }
NODE
unset mt_password
```

Dosyayı `cat` etmeyin, `source` etmeyin, Plesk runtime env'ine taşımayın.
Secret dosyası/terminal/env erişimi yalnız ilgili sistem kullanıcısında olmalıdır.

## 3. Salt-okunur bağlantı komutu

Operatör kaynak dizininden:

```bash
node --env-file="$HOME/.config/mediatracker/hosting-test.env" scripts/native-hosting-preflight.mjs --connect
```

Yalnız `mt_p4_test` / `mt_test_migrator`, loopback:5433 ve verify-full kabul
edilir. Sorgular READ ONLY transaction içindedir, ROLLBACK ile kapanır.
Production'a bağlantı yoktur; katalogdan CONNECT/CREATE/TEMP bilgisi okunur.
Çıktı: fingerprint, şema sahipliği, üyelikler, efektif yetkiler, boşluk,
ledger kontrolü, bekleyen 001–009, sözleşme PASS/FAIL. Secret/ham SQL hatası yoktur.
Çıktıyı paylaşın. Hedef/boşluk/plan değerlendirildikten sonra migration için
AYRI onay alınır; şimdi `--apply` çalıştırmayın. Production migration yasaktır.

## Recovery ve yayın

[Plesk restore](https://docs.plesk.com/en-US/obsidian/cli-linux/using-command-line-utilities/pleskrestore-restoration-from-backup.73928/)
PostgreSQL hedeflerini destekler; bu, özel 5433 instance'ın backup'a dahil
olduğunu kanıtlamaz. Backup Manager'da gerçek DB'nin kapsamı, beş şema/Better
Auth/ledger, public dışındaki private storage, ortak quiescence ve test hedefinde
sağlayıcı restore kanıtı gerekir. Yeni restore DB şartı yoktur; aynı test DB'yi
üzerine yazan rehearsal ancak AYRI açık onayla yapılır. RLS kapatılmaz.

Recovery doğrulanana kadar gerçek hesap/kayıt, kişisel veri kabulü ve Cloud
Sync açılmaz. Misafir/local-first ziyaretçi yayını ayrıca mümkündür. Mevcut
signup/Auth ve provider policy korunur: TVMaze koşullu, Open Library uygun
User-Agent/contact ile; TMDB/AniList/yeni OMDb/ücretli AI/research kapalı.
Supabase fallback korunur.

Test deploy mevcut Linux pipeline'ını kullanır. Yeni SHA'da CI/artifact PASS
olmadan bu değişiklikler doğrulanmış Linux artifact sayılamaz. Passenger,
storage ve canonical HTTPS origin korunur. Test runtime için profile
hosting-test, capability shared-managed ve mt_test_runtime URL gerekir;
operatör env kullanılmaz. Tam proxy overwrite/direct-access kanıtı olmadan
TRUSTED_INGRESS_MODE=unconfigured kalır. DB hazır değilken readiness 503 doğru
sonuçtur; homepage/liveness DB/Auth/RLS kabulü değildir.

## Bu oturumun yerel doğrulaması

- Full Vitest: 216 dosya / 3166 PASS, 57 mevcut SKIP; maxWorkers=4, offline.
- Full Node: 322 PASS / 28 FAIL; tüm kalan hatalar Windows symlink/FIFO
  artifact testlerindedir. Shared/hosting/TLS/migration/ops testleri PASS.
- Next typegen, TypeScript noEmit ve native production build: PASS; synthetic
  env ve offline ağ koruması kullanıldı. Build tracing uyarıları mevcut;
  Windows build Linux artifact/ABI kanıtı değildir.
- Kaynak lint: PASS (0 hata, 1 mevcut uyarı); .codex/dist taraması hariç.
  Varsayılan geniş lint bu generated ağaçlarda uzadığı için durduruldu.
- git diff --check: PASS. Lokal ci-checks yerel env dosyaları nedeniyle
  clean-checkout şartında reddedildi; mevcut secret dosyaları değiştirilmedi.
- Gerçek PostgreSQL, SSH, deploy, backup/restore: NOT_RUN. Public HTTPS/live/
  ready sorguları bu ortamdan yanıt alınamadığı için UNVERIFIED; site kapalı
  sonucu çıkarılamaz. Commit/push/Production işlemi yapılmadı.
- Configured Vault context bu oturumda sonuç vermedi; sonlandırıldı. Canonical
  Vault değişikliği/aday yazımı veya otomatik sync yapılmadı.
