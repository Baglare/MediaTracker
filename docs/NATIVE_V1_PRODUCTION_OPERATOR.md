# TürkHosting v1: tek sıralı production uygulaması

Bu akış yeni hosting/mimari kurmaz. Her hata sonraki adımı durdurur. Production
erişimi bu Codex oturumunda yoktur; komutlar operatörün Plesk SSH terminalindedir.
Parola/env/dump/kullanıcı satırı çıktısı paylaşılmaz. `set -x`, `cat *.env`, env
dump, test parolası veya test DB dump'ı kullanılmaz.

## 1. Kanıt ve dosyalar

12 Ekim 2026 kullanıcı bildirimi: test DB 001–011, gerçek Auth/RLS/HTTP Cloud Sync
PASS; gerçek hosting yedeği indirme + AES-GCM unseal + izole yerel PG18 restore
PASS. Gerçek yedekte iki kullanıcı izolasyonu NOT_RUN; önceki sentetik izolasyon
PASS. Bunlar production kabulü değildir. Tarihsel NOT_RUN belgeleri değiştirilmez.
Bu oturumda eski SHA `4fa5d1e342dd54878088f55112945e36fa563565` CI'nin üç işi PASS,
site live/ready 200 doğrulandı. HTTP readiness aktif DB adını kanıtlamaz.

Bu sürüm 001–011 checksum'larını korur; `012_public_signup.sql` yalnız Auth user
INSERT izni ekler. 003 initialize/lifecycle/freeze trigger'ları, owner/RLS,
FORCE RLS ve kapalı üyelik grafiği değişmez. Yeni kayıt varsayılan kapalıdır.
`NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED=true` için teknik kabul + aşağıdaki gerçek
belge/kararlar gerekir; build ve runtime değeri aynı olmalıdır. Yeni SHA'ya bağlı
CI artifact'ı kullanılır. Yeni kaynak/migration fingerprint'i eski recovery
kanıtıyla aynı değildir; eski PASS kaydı korunur, yeni kayda dönüştürülmez.

Yeni operator source arşivi, `.sha256`, Linux artifact `.tar.gz` ve `.sha256` ile
ABI raporunu Plesk üzerinden **özel operator dizinine** yükleyin. Web köküne env,
operator source veya yedek koymayın. CI run sayfasından artifact'ın tam yeni SHA
ile başarılı `Release validation`, `Experimental native Linux artifact` işlerine
ait olduğunu doğrulayın. Windows artifact veya dirty-tree artifact kullanılmaz.

```bash
set -Eeuo pipefail
umask 077
trap 'printf "%s\n" "STOP: sonraki asamaya gecmeyin; veri/env silmeyin." >&2' ERR
NODE=/opt/plesk/node/24/bin/node
BASE="$HOME/mt-p4-recovery-20261012"
test -d "$BASE" && test -f "$HOME/.postgresql/root.crt"
"$NODE" --version
# Teslimdeki RELEASE.json dosyasını özel BASE dizinine yükleyin.
SHA=$("$NODE" -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).candidateSha' "$BASE/RELEASE.json")
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]]
cd "$BASE"
sha256sum -c "mediatracker-operator-$SHA.tar.sha256"
sha256sum -c "mediatracker-native-linux-${SHA:0:12}.tar.gz.sha256"
OPS="$HOME/mt-v1-operator-$SHA"
RELEASE="$HOME/mt-v1-release-$SHA"
test ! -e "$OPS" && test ! -e "$RELEASE"
mkdir -m 700 "$OPS" "$RELEASE"
tar -xf "mediatracker-operator-$SHA.tar" -C "$OPS"
tar -xzf "mediatracker-native-linux-${SHA:0:12}.tar.gz" -C "$RELEASE"
# Teslimdeki güncel talimatlar documentation overlay'dir; executable kaynak/artifact değişmez.
cp -p "$BASE/OPERATOR.md" "$OPS/docs/NATIVE_V1_PRODUCTION_OPERATOR.md"
# Recovery dizini yalnız overlay olabilir: lock ve dependency ağacı ayrı yerlerde olabilir.
read -r -p 'Plesk mevcut uygulama root mutlak yolu: ' ACTIVE_RELEASE
# Yalnız mevcut uygulama/recovery ve mt-* operator dizinlerinde sınırlı envanter.
for root in "$BASE" "$ACTIVE_RELEASE" "$HOME"/mt-*; do
  [[ -d "$root" ]] || continue
  find "$root" -maxdepth 2 \( -name node_modules -type d -print -prune \) -o \( -name package-lock.json -type f -print \)
done
read -r -p 'Envanterdeki gercek package-lock.json mutlak yolu: ' LOCK_FILE
read -r -p 'Envanterdeki gercek node_modules mutlak yolu: ' MODULES_DIR
[[ "$LOCK_FILE" = /* && "$MODULES_DIR" = /* && -f "$LOCK_FILE" && -d "$MODULES_DIR" ]]
MODULES_DIR=$(realpath "$MODULES_DIR")
cmp "$LOCK_FILE" "$OPS/package-lock.json"
# Seçilen mevcut ağacın doğrudan operator bağımlılıkları lock ile eşleşmeli.
"$NODE" --input-type=module - "$LOCK_FILE" "$MODULES_DIR" <<'JS'
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const lock=JSON.parse(fs.readFileSync(process.argv[2]));
const modules=fs.realpathSync(process.argv[3]);
const require=createRequire(path.join(modules,'__operator_check__.cjs'));
for(const name of ['pg','sharp','better-auth','next']) {
  let entry=require.resolve(name),directory=path.dirname(entry),actual;
  while(directory!==path.dirname(directory)) {
    const file=path.join(directory,'package.json');
    if(fs.existsSync(file)){const p=JSON.parse(fs.readFileSync(file));if(p.name===name){actual=p;break;}}
    directory=path.dirname(directory);
  }
  assert.equal(actual?.version,lock.packages['node_modules/'+name]?.version,'dependency version mismatch: '+name);
  assert(actual?.version,'dependency missing: '+name);
}
console.log('EXISTING_OPERATOR_DEPENDENCIES_MATCH_LOCK');
JS
cp -a "$MODULES_DIR" "$OPS/node_modules"
cd "$OPS"
"$NODE" scripts/native-package.mjs verify "$RELEASE"
"$NODE" scripts/native-artifact-check.mjs "$RELEASE" "$BASE/production-abi-$SHA.json"
"$NODE" --input-type=module - "$RELEASE" "$SHA" <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {nativeMigrationManifest} from './scripts/native-migrations.mjs';
const m=JSON.parse(fs.readFileSync(process.argv[2]+'/deployment-manifest.json'));
assert.equal(m.sourceGitSha,process.argv[3]);assert.equal(m.dirtyWorktree,false);
assert.equal(m.buildPlatform,'linux');
assert.deepEqual(m.migrations,nativeMigrationManifest().map(({name,checksum})=>({name,checksum})));
console.log('SHA_ARTIFACT_MIGRATION_MATCH_PASS');
JS
```

Operator arşivi Git kaynaklarıdır; secret, `.git`, `.codex`, node_modules veya
yedek içermez. BASE içinde lock/node_modules yokluğu tek başına engel değildir;
gerçek mevcut yollar yukarıdaki sınırlı envanterle bulunur ve ayrı doğrulanır.
Bu oturumda sunucu envanteri çalıştırılmadı. Mevcut locked dependency seti uyuşmazsa DURUN; sunucuda build veya
rastgele package kurulumu yapmayın. Yeni Linux artifact offline CI'da üretilir.

## 2. Özel production env ve her bağlantının bağımsız hedefi

Mevcut production env dosyaları varsa **onları kullanın**. Aşağıdaki hazırlayıcı
yalnız eksik dosyayı oluşturur; mevcut dosyayı overwrite etmez. Runtime template
mevcut özel runtime env'in yoludur, parola aktarım kaynağı değildir. Yeni dosyada
üç bağımsız secret üretilir, provider UA kaldırılır (Open Library kapalı), ingress
unconfigured ve kayıt false tutulur. Native/Cloud build flags korunur. Var olan
production secret'larını yeniden üretmeyin. CA private key değildir.

```bash
CONFIG="$HOME/mt-v1-production-private"
mkdir -p "$CONFIG"; chmod 700 "$CONFIG"
read -r -p 'Mevcut ozel runtime env dosyasi: ' TEMPLATE
test -f "$TEMPLATE"
# Gerekirse gerçek mevcut production dosya yollarına atayın.
RUNTIME_ENV="$CONFIG/runtime.env"
MIGRATOR_ENV="$CONFIG/migrator.env"
PRIVACY_ENV="$CONFIG/privacy.env"
BACKUP_ENV="$CONFIG/backup.env"
prepare_env() {
  local kind=$1 output=$2 password
  if [[ -f "$output" ]]; then return; fi
  read -r -s -p "$kind production parolasi (test parolasi degil): " password
  printf '\n'
  printf '%s' "$password" | "$NODE" scripts/native-production-env.mjs "$kind" "$TEMPLATE" "$output"
  unset password
}
prepare_env runtime "$RUNTIME_ENV"
prepare_env migrator "$MIGRATOR_ENV"
prepare_env privacy_login "$PRIVACY_ENV"
prepare_env backup "$BACKUP_ENV"
chmod 600 "$RUNTIME_ENV" "$MIGRATOR_ENV" "$PRIVACY_ENV" "$BACKUP_ENV"
"$NODE" --env-file="$MIGRATOR_ENV" scripts/native-production-preflight.mjs operator > "$CONFIG/migrator-inspection.json"
"$NODE" --env-file="$PRIVACY_ENV" scripts/native-production-preflight.mjs operator > "$CONFIG/privacy-inspection.json"
"$NODE" --env-file="$BACKUP_ENV" scripts/native-production-preflight.mjs operator > "$CONFIG/backup-inspection.json"
"$NODE" --env-file="$RUNTIME_ENV" scripts/native-production-preflight.mjs runtime > "$CONFIG/runtime-inspection.json"
for kind in migrator privacy backup runtime; do
  "$NODE" -p 'JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1])).target,null,2)' "$CONFIG/$kind-inspection.json"
done
```

Dört sonuçta DB `mediatracker_prod`, host/server `127.0.0.1`, port 5433, major 18
ve aynı DB OID olmalıdır. Roller sırasıyla `mt_prod_migrator`,
`mt_prod_privacy_login`, `mt_prod_backup`, `mt_prod_runtime`; her login kendi
fingerprint'ine sahiptir. Kapalı graph başarısızsa TürkHosting'den **yalnız
sözleşmeyle farklı olan mevcut role/üyelik/grant ayarını** düzeltmesini isteyin.
BYPASSRLS, hosting restore DB veya database ownership değişikliği istemeyin.
Grafik kontrolünde modelde tanımlı NOLOGIN/restore rol kaydı eksikse runner durur;
bu hiçbir restore DB veya restore yetkisi kullanma izni değildir.

```bash
fp() { "$NODE" -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).target.fingerprint' "$CONFIG/$1-inspection.json"; }
MIGRATOR_FP=$(fp migrator); PRIVACY_FP=$(fp privacy); BACKUP_FP=$(fp backup); RUNTIME_FP=$(fp runtime)
# Identity alanlarını gerçek Plesk/TurkHosting hedefiyle doğruladıktan sonra bu pinler kullanılır.
# Başlangıçtan itibaren gerçek production verisi varsa/UNKNOWN ise burası STOP'tur.
"$NODE" - "$CONFIG/migrator-inspection.json" "$CONFIG/backup-inspection.json" <<'JS'
const fs=require('fs');const reports=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
if(!reports.some(r=>r.data==='EMPTY')||reports.some(r=>r.data==='PRESENT'))throw Error('STOP_PRODUCTION_DATA_PRESERVATION_TRANSFER_DECISION');
console.log('EMPTY_PRODUCTION_TARGET_CONFIRMED');
JS
```

Ledger yoksa runner bütün managed schema'ları boş doğrular. Ledger varsa backup
login 010/011 kapsaması altında hiçbir satır içeriği yazdırmadan tablo doluluğunu
kontrol eder. Eski/kısmi schema yüzünden sayım yapılamazsa UNKNOWN'dır. Veri varsa
koruma/yedek ve kullanıcı/şifre/asset taşıma kararı gelmeden migration yoktur.
Test hesapları, test dump'ı veya test storage production'a kopyalanmaz.

## 3. Mevcut uygulamayı koruma ve Plesk durdurma

Downtime ve migration'dan **önce** yeni source-bound proof'u offline doğrulayın.
Eski PASS kaydını düzenlemeyin; uyuşmazlıkta siteyi durdurmadan burada durun.

```bash
PROOF="$BASE/PG18_RECOVERY_PROOF_627f0b6fb6db_20261012_PASS.json"
PROOF_FP=84834be6936e442ac40c809b61897e080eb99c254c0044274ecc674140b6ed11
PROOF_FILE="$PROOF" PROOF_PIN="$PROOF_FP" "$NODE" --input-type=module - <<'JS'
import {assertRecoveryProof} from './scripts/native-recovery-proof-contract.mjs';
await assertRecoveryProof({'recovery-proof':process.env.PROOF_FILE,'recovery-proof-fingerprint':process.env.PROOF_PIN},{});
console.log('CURRENT_SOURCE_RECOVERY_GATE_PASS');
JS
```

Plesk'te mevcut application root, startup `app.cjs`, Node yolu, tüm runtime env
ve scheduled task durumunu özel operator kaydına alın. Env görüntülerini chat'e
göndermeyin. Mevcut env dosyasını özel CONFIG içine `cp -p` ile yedekleyin; Plesk
env ayrıca panelin gerçek export/backup yöntemiyle korunur. Önce çalışan release
ve aktif DB adını panelde doğrulayın; bunları tahmin etmeyin.

Plesk üzerinden scheduled yazıcıları durdurun, ardından Node/Passenger uygulamasını
durdurun. Açık diğer operator/migrator/Auth/dosya yazıcılarını kapatın. Worker
kalmadığını gerçek süreç/Plesk durumu üzerinden kontrol edin. Site açıkken
`ALL_WORKERS_AND_OPERATORS_STOPPED` kullanmayın. `touch tmp/restart.txt` durdurma
kanıtı değildir. Aktif eski test DB/storage'nın kabul edilmiş şifreli off-host
yedeği saklanır; production'a aktarılmaz. Durdurma başarısızsa devam etmeyin.

## 4. Yalnız eksik migration'lar, production backup ve offsite

```bash
NATIVE_OPS_EXPECTED_FINGERPRINT="$MIGRATOR_FP" "$NODE" --env-file="$MIGRATOR_ENV" scripts/native-migration-runner.mjs --connect
NATIVE_OPS_EXPECTED_FINGERPRINT="$MIGRATOR_FP" "$NODE" --env-file="$MIGRATOR_ENV" scripts/native-migration-runner.mjs --connect --apply --confirmation "MIGRATE production $MIGRATOR_FP"
NATIVE_OPS_EXPECTED_FINGERPRINT="$MIGRATOR_FP" "$NODE" --env-file="$MIGRATOR_ENV" scripts/native-migration-runner.mjs --connect
NATIVE_OPS_EXPECTED_FINGERPRINT="$BACKUP_FP" "$NODE" --env-file="$BACKUP_ENV" scripts/native-recovery-preflight.mjs --connect
NATIVE_OPS_EXPECTED_FINGERPRINT="$PRIVACY_FP" "$NODE" --env-file="$PRIVACY_ENV" scripts/native-maintenance.mjs --connect --job inspect > "$CONFIG/state.json"
REVISION=$("$NODE" -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).state.revision' "$CONFIG/state.json")
NATIVE_OPS_EXPECTED_FINGERPRINT="$PRIVACY_FP" "$NODE" --env-file="$PRIVACY_ENV" scripts/native-maintenance.mjs --connect --apply --job freeze --revision "$REVISION" --confirmation "MAINTAIN production $PRIVACY_FP"
```

Runner yalnız eksik prefix'i uygular: 001–011 ardından 012; ledger/checksum/lock ve
transaction korumaları aynen kalır. Herhangi bir FAIL sonrası yeniden apply etmeden
read-only ledger durumunu inceleyin. Down migration/veri silme yapılmaz.

**Yeni kaynak için recovery gate:** `native-recovery-proof-contract.mjs` source
ve migration fingerprint'ini doğrular. Eski PASS JSON'un fingerprint'ini değiştirmek
yasaktır. Yeni manifest için bağımsız yerel PG18 sentetik proof gereklidir; eski
gerçek restore testini tekrar ettirmek gerekmez. Bu yeni gate henüz PASS değilse
production backup/cutover burada durur; backup kontrolü atlanmaz.

```bash
read -r -p 'Ozel 32-byte AES key dosyasi (anahtar yazmayin): ' KEY_FILE
test -f "$PROOF" && test -f "$KEY_FILE"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
PLAIN="$BASE/production-$STAMP-plain"
SEALED="$BASE/production-$STAMP-sealed"
STORAGE=$("$NODE" --env-file="$RUNTIME_ENV" -p 'process.env.NATIVE_STORAGE_ROOT')
mkdir -p "$STORAGE"; chmod 700 "$STORAGE"
NATIVE_OPS_EXPECTED_FINGERPRINT="$BACKUP_FP" "$NODE" --env-file="$BACKUP_ENV" scripts/native-recovery.mjs backup --connect --apply --storage "$STORAGE" --output "$PLAIN" --quiesced ALL_WORKERS_AND_OPERATORS_STOPPED --confirmation "BACKUP production $BACKUP_FP" --recovery-proof "$PROOF" --recovery-proof-fingerprint "$PROOF_FP" > "$CONFIG/backup-result.json"
NATIVE_RECOVERY_KEY_FILE="$KEY_FILE" "$NODE" scripts/native-recovery-seal.mjs seal "$PLAIN" "$SEALED" > "$CONFIG/seal-result.json"
SEALED_FP=$("$NODE" -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).fingerprint' "$CONFIG/seal-result.json")
```

**Mevcut manuel offsite yöntemi:** sealed dizinin tamamını güvenli mevcut indirme
yöntemiyle operatör bilgisayarına indirin. Anahtarı yedekten ayrı saklayın.
Sunucudaki SEALED fingerprint'ini bağımsız güvenilir kanaldan sabitleyin; indirilen
dosyanın yanındaki manifest'i tek başına pin otoritesi saymayın. SSH/SCP hedefi
zorunlu değildir. Bilgisayardaki özel ACL/retention ve anahtar erişimini doğrulayın.

Aşağıdaki kontroller **yerel bilgisayarda**, bu SHA'nın operator kaynaklarıyla
PowerShell'de çalışır; dosya yollarını okuyarak alın, içerik/anahtar yazdırmayın:

```powershell
$sealedCopy = Read-Host 'İndirilen sealed dizinin mutlak yolu'
$localPlain = Read-Host 'Henüz var olmayan özel unseal hedefi'
$env:NATIVE_RECOVERY_KEY_FILE = Read-Host 'Ayrı saklanan key dosyasının mutlak yolu'
$sealedPin = Read-Host 'Bağımsız sabitlenmiş SEALED fingerprint'
node scripts/native-recovery-seal.mjs unseal $sealedCopy $localPlain $sealedPin
if ($LASTEXITCODE -ne 0) { throw 'STOP: offsite unseal doğrulanmadı' }
node scripts/native-recovery.mjs verify --input $localPlain
if ($LASTEXITCODE -ne 0) { throw 'STOP: offsite backup doğrulanmadı' }
```

Başarılı `UNSEALED_VERIFIED`/verify sonucunu ve doğru yedek fingerprint'ini özel
operator kaydında saklayın; yeni production yedeğinin manuel offsite kabulünü SSH
akışına dönmeden önce doğrulayın. Bu işlem **manuel indirme ve yerel doğrulamadır**;
otomatik offsite aktarımı veya otomatik backup kurulmuş değildir. Önceki gerçek
yedek restore PASS farklı yedeğe aktarılmaz. İsterseniz doğrulanmış SSH/SCP ile
aktarabilirsiniz; aynı bağımsız pin ve unseal/verify kapıları yine geçerlidir.
Doğrulama/anahtar eksikse site geçişini yapmayın. Plaintext, başarısız kopya veya
mevcut veriyi otomatik silmeyin.

## 5. Runtime geçişi ve açılış

Runtime env'ini `validateReleaseEnvironment` ile okuyup yalnız valid boolean sonucu
raporlayın; özel env dosyasını yazdırmayın. `NATIVE_STORAGE_ROOT` yukarıdaki özel
production storage ile eşleşmeli, test dosyalarını içermemeli. Runtime env'de hiçbir
NATIVE_OPS/PG*/test/fixture/privacy/recovery secret bulunmamalıdır. Cloud public flags
CI build'in `d2c1/true`, `v1/true` değerleriyle eşleşir. Kayıt false/unset; AI/api
kapalı politikaları korunur. Production DB URL yalnız `mt_prod_runtime` login'idir.

```bash
RUNTIME_ENV_FILE="$RUNTIME_ENV" "$NODE" --env-file="$RUNTIME_ENV" --input-type=module - <<'JS'
import fs from 'node:fs';import {parseEnv} from 'node:util';
import {validateReleaseEnvironment} from './scripts/ops/release-policy.mjs';
const env=parseEnv(fs.readFileSync(process.env.RUNTIME_ENV_FILE,'utf8'));
if(!validateReleaseEnvironment(env,'PRODUCTION').valid||env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED==='true')throw Error('STOP_RUNTIME_ENV');
if(env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE!=='d2c1'||env.NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED!=='true'||env.NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE!=='v1'||env.NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED!=='true')throw Error('STOP_BUILD_FLAGS');
console.log('PRODUCTION_RUNTIME_ENV_PASS_SIGNUP_CLOSED');
JS
```

Plesk'te application root'u yeni RELEASE, startup'ı `app.cjs`, Node'u mevcut 24
yoluna ve env'i doğrulanmış **runtime-only** dosyaya karşılık gelen değerlere ayarlayın.
Operator env hiçbir zaman Passenger'a girmez. Mevcut application root/env kaydı
geri dönüş içindir; data rollback veya otomatik unfreeze yetkisi değildir.

Önce frozen state'i privacy login ile tekrar inspect edin. Backup/offsite/env/artifact
kontrolleri başarılıysa o andaki revision ile `native-maintenance ... --job unfreeze
--revision ... --apply --confirmation "MAINTAIN production $PRIVACY_FP"` çalıştırın.
Ardından Plesk'te Node uygulamasını başlatın. Failure halinde kapalı tutun, backup ve
env'i koruyun; veri silmeden incident/fail-forward kararı alın.

## 6. Gerçek production kabulü ve zamanlama

```bash
curl --fail --silent --show-error https://mediatracker.baglare.com.tr/api/health/live
curl --fail --silent --show-error https://mediatracker.baglare.com.tr/api/health/ready
NATIVE_RUNTIME_EXPECTED_FINGERPRINT="$RUNTIME_FP" "$NODE" --env-file="$RUNTIME_ENV" scripts/native-production-preflight.mjs runtime
```

Bu üç adım giriş/Cloud/izolasyon PASS değildir. Test-only hosting/Auth acceptance
scriptlerini production'a zorla çalıştırmayın. Kayıt kapalı ve production boşken
giriş/iki kullanıcı kabulü **NOT_RUN** kalır. Gerçek yeni kullanıcı admission'ı için
hukuk/tedarikçi kapıları kapanınca `NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED=true` ile aynı
locked CI build'i yeniden üretin; runtime aynı değerle geçsin. Sonra geçici A/B
kabul hesaplarıyla gerçek signup/login/logout/restart, owner A Cloud yaz/oku/CAS,
B oturumundan A kimliğiyle okuma/yazma reddi, anonim ret ve iki owner ayrımı ölçülür.
Özel HTTP cookie/body verisi loglanmaz; sadece PASS/FAIL kaydı tutulur. Mevcut
privacy operator'ın exact UUID/email onayı ve export-before-delete prosedürüyle
iki geçici hesabı temizleyin; residual/Auth-last tamamlanmadan sahte kullanıcı
kalmadı demeyin. Public signup açık olmasa bile gerçek production kabulü için test
hesabı oluşturmak ayrı kontrollü yöntem gerektirir; mevcut boş-test-only harness'in
hedef kontrolleri gevşetilmez. Bu gate burada NOT_RUN olarak görünür.

Bakım önce production privacy login'le `native-maintenance --connect` planı ve bir
bounded cleanup apply (storage + pin + MAINTAIN confirmation) başarılı olduktan
sonra zamanlanır. Plesk Scheduled Tasks'ta mevcut worker modelinden bağımsız
`flock -n "$CONFIG/maintenance.lock" timeout 240s ...native-maintenance...` kullanın;
500-intent/500-temp/500-limiter sınırları korunur. `nextCursor` ile sonraki tarama
devam eder, sona gelince sıfır; freeze sırasında job başarısız olur, unfreeze etmez.
Privacy erasure cron'a konmaz. Backup için ayrı maintenance window: job'ları ve
Passenger'ı gerçekten durdur → freeze → backup → seal → offsite roundtrip verify
→ kontrollü unfreeze/start. Mevcut panel tam stop/start otomasyonu doğrulanmadan
quiesced otomatik backup cron'u kurmayın. Mevcut manuel offsite indirme/unseal
yöntemi geçerlidir; otomatik backup/offsite schedule bu yöntemle kurulmuş sayılmaz.
Maintenance apply yapılmadıysa schedule NOT_RUN kalır.

## Kalan gerçek belge/kararlar (tek liste)

- Kaynakta Batuhan Parıltı ve contact mailbox mevcut. Eksik: amaç bazlı hukuki
  dayanak/aydınlatma kabulü, uygulanabilir madde 9 mekanizması ve VERBİS kararı.
- TürkHosting asıl/DB/backup/log/destek lokasyonu, alt işleyen/sözleşme ve
  log/yedek/başvuru retention, erişim, silinen hesap restore reconciliation kararları.
- TVMaze türetilmiş/kaydedilen/export/public metadata için lisans/ShareAlike yorumu.
  Open Library bu hazırlıkta kapalıdır; kapalı AniList/TMDB/OMDb/AI açılışı v1 engeli
  değildir. UA verilirse Open Library use-case kayıt/uygunluk kanıtı gerekir.
- Production erişim sonuçları: dört login + fingerprint, doluluk/koruma/taşıma
  kararı (yalnız veri varsa) ve yeni production yedeğinin manuel offsite doğrulaması.
  Bu teslimdeki 627f0b6 source-bound PG18 sentetik recovery kanıtı PASS ve pinlidir.
- Production giriş/Cloud Sync/iki kullanıcı izolasyonu ve geçici hesap cleanup
  kabulü; bunlar eski test PASS veya readiness 200 ile kapanmaz.
