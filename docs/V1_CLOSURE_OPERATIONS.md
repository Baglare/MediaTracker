# Production v1 closure — 2026-10-15

## KVKK final kapanış — 16 Ekim 2026

Bu güncel ek, belgenin aşağısındaki tarihli P014/NOT_RUN ve önceki Production
SHA kayıtlarının yerine tarihsel sonuç yazmaz. Görev girdisi: Production v1.015,
SHA `21d1f8ab14acec051a95ae84fa8b46bfbd23a60f`, migration 015 uygulanmış;
LIVE/READY 200, maintenance false, epoch `v1-21d1f8ab14ac`; gerçek test hesabı
silme 10/10 PASS, Auth/app/Storage kalıntısı yok: **OPERATOR_REPORTED**.
Bu çalışma Production DB, Plesk veya Gmail'e bağlanmaz; mevcut export ve silme
öncesi backup'ları korur. Yeni adayın CI sonucu ayrıca kaydedilir.

### Talep işletimi (manuel)

Sorumlu: mevcut veri sorumlusu Batuhan Parıltı. Kanal:
`mediatracker.contact@gmail.com`; değiştirilmez. Kayıtlar GitHub/issues/PR/log
ve Vault'a girmez; erişimi sınırlı şifreli operatör alanında tutulur.

1. Gmail > Gelen Kutusu: ilk alım zamanı/timezone, benzersiz rastgele case ID,
   talep türü, kapsam, sorumlu, **received_at +30 gün** due date, doğrulama
   durumu ve yanıt/closure tarihlerini özel takip kaydına gir. Spam klasörünü de
   kontrol et. Eksik bilgi istemek saati yeniden başlatmaz; gün 20 ve 27'de
   manuel takip yap. Alındı yanıtı kimlik doğrulandığı anlamına gelmez.
2. Kayıtlı e-postayı ve talep sahibini ölçülü doğrula: verified hesapta yeni
   doğrulanmış oturum/hesap içi işlem veya kayıtlı adrese bağımsız doğrulama.
   E-posta From alanı, gönderilmiş UUID, ekran görüntüsü tek başına yeterli değil.
   Şifre/token/cookie isteme. Gerekli formal unsurlar için mevcut 05B başvuru
   prosedürünü uygula; gereksiz kimlik kartı taraması toplama. Hesapsız/eşleşmeyen
   talep intake olarak kaydedilir; güvenli doğrulama yolu kurulur, veri açıklanmaz.
3. Kapsamı ayır: native DB/Auth/Storage, browser ve indirilen export, Gmail,
   hosting log/backup, üçüncü alıcı. Somut yasal hold varsa gerekçe/kapsam/bitiş
   ve review tarihini kaydet. Yanıt hakkını hold bahanesiyle erteleme.
4. Export için mevcut `exportNativeAccount`/native privacy operator araçlarını
   kullan; owner ve alıcıyı yeniden doğrula, başka katılımcı verisini incele.
   Teslim tercihinde aynı-origin authenticated export öne çıkar. Operatör dosyası
   gerekiyorsa şifreli, tek alıcı, süreli teslim ve anahtar ayrı doğrulanmış kanal;
   Gmail'e açık JSON/backup veya kalıcı public link ekleme. Güvenli kanal yoksa
   dosyayı göndermeden önce kanal düzenle ve 30 gün içinde gerekçeli yanıt ver.
   Teslim tarihi/sonucu ve kopya kaldırma tarihini kaydet; payload'ı kayda kopyalama.
5. Silme: exact target/hesap ve ayrı operator icra yetkisiyle önce plan/katılımcı
   etkisi/hold; lifecycle kilidi, session revoke, application/XP/participant cleanup,
   özel dosya temizliği, residual kontrolü ve **Auth-last** mevcut akışını kullan.
   Bilinmeyen referans, symlink, dosya kalıntısı veya participant onayı eksikse STOP;
   kapsamı genişleten SQL/cascade/rol gevşetme yok. Bu görev icra yetkisi vermez.
6. Sonucu en geç 30 gün içinde yazılı/elektronik yanıtla: tamamlanan kapsam,
   kısmi ret ve somut gerekçe, cihaz/vendor/yedek sınırları; ilgili alıcılara
   düzeltme/silme bildirimini gerektiği ölçüde takip et. Kurula şikâyet yolu ve
   kanuni süreleri (yanıtı öğrenmeden 30, her hâlde başvurudan 60 gün) açıkla.
7. Case closure, işlem ve imha kanıtlarını özel kayda ekle. Destek kapanış+90 gün,
   KVKK başvuru/yanıt kapanış+12 ay; fazla kimlik/export eki daha erken.
   Aylık Gmail/özel kopya incelemesinde süresi dolanı kaldır, Gmail Çöp Kutusu ve
   indirilmiş kopyaları kontrol et. İmha kaydı en az 3 yıl; backup reconciliation
   register'ı restore riski bitene kadar ayrı kalır. Bunlar kanunen aynı süre değildir.

### Restore karantinası ve silme uzlaştırması

Bu prosedür operatörün yayın önkoşuludur; yeni otomatik runtime restore sistemi
kurulmadı. `tests/privacy-restore-reconciliation.test.ts` yalnız sentetik model
regresyonudur, PG18 veya gerçek backup kabulü değildir.

1. Silme tamamlanınca restore edilen DB'nin **dışında**, erişimi sınırlı bağımsız
   minimal register tut: eski account UUID, completed_at, case ID, silme kapsamı,
   kanıt hash/ref, ilgili backup kümesi ve review tarihi. Email/not/şifre/token yok.
   Dosya hash'i tek başına doğruluk kanıtı değil; yetkili bağımsız son sürüm kaydı
   ve kopya bütünlüğü gerekir. Register da yedeklenir; eski DB ile geri sarılmaz.
2. Herhangi bir restore öncesi source SHA, ledger **015 dahil**, fingerprint,
   backup oluşturma zamanı ve DB+dosya tutarlılığını doğrula. Kaynak hash/fingerprint
   uyuşmazlığı, eksik register veya backup kapsamı bilinmiyorsa **STOP**.
3. Yetkili izole PG18 hedef/boş özel storage, internet/public ingress ve SMTP/provider
   çıkışı kapalı olarak restore et. Production bağlantı değerleri kullanılmaz.
   Uygulamayı/mail işlerini halka açma; eski session/cookie/reset/doğrulama
   kayıtlarının kullanılabilirliğini engelle. Tüm restore oturumları ve bekleyen
   token'ları yetkili prosedürle geçersizleştir; yeniden giriş ve taze işlem gerektir.
4. Backup zamanından önce/sonra ayırıp kayıt kaçırmamak için **register'daki tüm
   silinen UUID'leri** restored snapshot ile karşılaştır. Native privacy plan ve
   mevcut guarded erasure ile kalanları tekrar işle; mevcut Auth yoksa dahi app/
   asset kalıntısını kontrol et. Participant etkisi ayrıca onaylı olmalı. UUID'yi
   email'e bakıp başka/yeni hesaba eşleme; yeniden kayıt farklı UUID'dir.
5. Auth/session/token, bütün app/Cloud/revision/participant referansları, filesystem
   ve staged assets için yokluğu doğrula; bilinmeyen residual=FAIL. Bağımsız A/B
   owner okuma/yazma izolasyonu ve Cloud eski epoch/replay davranışını doğrula.
   Eski client queue/import/export kullanıcı kontrollü yeniden yükleme riski
   ayrıca bildirilir; backend erasure bütün cihaz kopyalarını yok etmez.
6. Her UUID PASS ve dosya/role/ledger/oturum kontrolleri tamamlanmadan service açma.
   Hash/fingerprint, zaman, case refs ve PASS/FAIL özetini kaydet; içerik kaydetme.
   Yeni temiz backup oluşturulması ve eski kopyaların emekliye ayrılması ayrı
   kontrollü adımdır; orijinal delili sessizce silme. Başarısız kısmi işlemde
   karantina ve write barrier korunur; tekrar çalıştırıp yeniden doğrula.

Mevcut silinmiş Production test hesabının export ve silme öncesi backup'ları bu
register/kopya envanterine özel olarak eklenir; **bu görevde silinmez**. Konum,
ülke, oluşturma zamanı/hash, erişim, encryption ve retention review operatörce
özel kayda girilir. Kimlik ve backup adı/yolu PR'a yazılmaz.

### Veri ihlali müdahalesi

Sorumlu veri sorumlusudur; hosting olayı operatöre gecikmeksizin iletir. Tespit
kaynağı ve **öğrenme anı** özel olay kaydına girilir; salt şüphe ve doğrulanmış
yetkisiz elde etme ayrılır. Erişimi daralt, ilgili token/credential'ı yetkili
prosedürle iptal et, salt gerekli log/delili koru; kanıtı yok edecek toplu cleanup
yapma. Etkilenen kişi/veri/adet/olası sonuç, zaman aralığı, alıcı ve alınan önlemleri
belirle; sır veya kullanıcı içeriğini GitHub'a taşıma.

Kanuni olmayan elde etme varsa madde 12/5 ve [2019/10 Kurul
kararı](https://www.kvkk.gov.tr/Icerik/5362/Veri-Ihlali-Bildirimi) gereği öğrenmeden
itibaren gecikmeksizin, **en geç 72 saat** içinde Kurula bildirim: resmî sayfa >
Veri İhlali Bildirim Formu (İnternet). Bütün ayrıntı yoksa mevcut bilgiyle bildir,
eksikleri aşamalı tamamla; gecikme varsa sebebini açıkla. Etkilenenler belirlenince
makul en kısa sürede doğrudan güvenli iletişim; ulaşılamıyorsa uygun web duyurusu.
GDPR'daki risk eşiğini otomatik Türk bildirim muafiyeti sayma. Bildirmeme kararı
gerekçesi/kanıtı da kaydedilir. Sonrasında kök neden, erişim/backup değerlendirmesi,
bildirim receipt'leri, düzeltme doğrulaması ve kapanış kaydı; plan her olay sonrası
ve düzenli gözden geçirilir. Bu görevde olay veya resmî bildirim yapılmadı.

### Paket doğrulaması

16 Ekim 2026 yerel, secretsiz kaynak kopyası ve `scripts/ci-offline.mjs` dış ağ
engeliyle: hedefli privacy/route/restore 25 PASS; typegen ve typecheck PASS;
lint PASS (iki mevcut uyarı); tam Vitest **3615 PASS / 58 koşullu SKIP**;
ek Node testleri **194 PASS**; CI politika testleri **122 PASS**. Offline Supabase
ve sentetik Native production build PASS. Windows sandbox link/junction engeli
ilk denemeyi başarısız yaptı; aynı kontrollere izin verilen yerel çalıştırmada
PASS alındı, test/ürün korumaları değiştirilmedi. Bu Windows build'ler Linux
artifact veya host ABI kabulü değildir.

Runtime npm audit: 0 vulnerability. Full audit: mevcut
`V1-SEC-EXCEPTION-001` kapsamında beş dev-only High / sıfır Critical doğrulandı,
son tarih 2026-11-03; yeni exception/upgrade yok. Repository/migration/test integrity
ve secret signature kontrolü ile `git diff --check` PASS. Canlı testler/GUI/browser
smoke/gerçek restore NOT RUN; tarihli operatör silme kanıtı ayrı kalır. PR exact-head
CI sonucu PR checks üzerinden ayrıca doğrulanır; burada önceden PASS yazılmaz.
Vault read-only context `VAULT_GIT_INVALID` döndürdü; kalıcı kararlar bu mevcut
belgelere işlendi, canonical Vault yazısı veya sync yapılmış sayılmadı.

### Tek güncel KVKK yayın kapısı ve operatör kontrol listesi

Bu tablo yalnız bu paketin güncel KVKK kararını tutar; aşağıdaki tarihsel genel
release sonuçlarını yeniden açmaz. **KVKK_RELEASE_READY = NO**: kaynak/CI PASS
olsa da dış aktarım kanıtı ve formal kanal/işletim olguları tamamlanmış değildir.

| Sınıf | Kapanış için somut işlem |
| --- | --- |
| EXTERNAL_BLOCKER | Gmail için gerçek alıcı/rol/ülke ve uygulanabilir madde 9 güvencesini sağlayıcı/hukuk incelemesiyle belgele. Genel Google DPA veya EU SCC yeterli kabul edilmez; adres değişmez |
| EXTERNAL_BLOCKER | Plesk > Websites & Domains > ilgili domain > Node.js > Environment Variables içinde **yalnız NATIVE_SMTP_HOST ve FROM metadata'sını** özel olarak kontrol et; parolayı/kalan env'yi kopyalama. Hostun gerçek hizmet sözleşmesi, işlem/queue/log/backup ülkesi ve varsa madde 9 güvencesi alınır; Auth'u kapatma |
| EXTERNAL_BLOCKER | Etkin TVMaze sorgu/direct CDN ve legacy dış görseller için kişisel veri/ülke/aktarımı belgelemek veya opsiyonel resimleri durdurma seçeneğine karar vermek gerekir; lisans/attribution aktarım yerine geçmez |
| MANUAL_ACTION | VERBİS çalışan/defter/bilanço/ana faaliyet bilgisini özel gerekçeli karara işle. Mevcut gerçek kişi/contact doğrulanır; uygulanabilir alternatif formal başvuru kanalı/tebligat bilgisi yoksa eksikliği gider; adres/telefon uydurma |
| MANUAL_ACTION | Gmail > Ayarlar > Filtreler ve Engellenen Adresler / Yönlendirme: yetkisiz yönlendirme yokluğunu kontrol et; Google Hesabı > Güvenlik: erişim/MFA kontrolü. Case due-date takibi, 90 gün/12 ay imha ve hold kayıtlarını başlat. Bu menüler hesaba göre değişebilir; erişilmiş sayılmaz |
| MANUAL_ACTION | Plesk > Websites & Domains > Logs > Log Rotation: gerçek dönem/boyut/kopya sayısı/erişim; Tools & Settings veya abonelik > Backup Manager: son-success, DB ve private-storage kapsam/tutarlılık, şifreleme/restore yetkisi. Redakte metadata kaydet; full log/user data alma |
| MANUAL_ACTION | Korunan test export/pre-delete backup/offsite envanteri, bağımsız erasure register ve izole gerçek restore uzlaştırma kabulünü tamamla; bu paket dosya veya DB açmaz |
| POST_RELEASE_GATE | Open Library kanıt yoksa UA unset; TVMaze etkin, TMDB/AniList/yeni OMDb/paid AI/research kapalı. Disabled sağlayıcılar için yeni key/servis yok |

**Tek Production yayın sırası (operatör):**

1. Yukarıdaki ilgili dış/manual kapıları kapat; PR exact-head CI başarılı ve son
   inceleme tamam olmadan merge/release-ready yok. Bu dalın normal PR CI'si
   validate+PG18 proof çalıştırır; Linux artifact yalnız uygun main push'ta üretilir.
2. Merge sonrası exact main SHA CI ve native Linux artifact/job sonuçlarını doğrula;
   artifact manifest/host Node ABI eşleşmesi gerekir. Windows yerel build hosting
   artifact kabulü değildir. Bu PR yeni migration içermez; **015'i yeniden apply etme**.
3. Ayrı kontrollü yayın penceresinde mevcut Plesk/Passenger release prosedürüyle
   hedef/domain/storage/DB fingerprint, ledger=015, coherent backup ve rollback
   SHA/artifact'ını doğrula. Bu paket deployment yetkisi veya uygulaması değildir.
4. Onaylı exact artifact'ı ayrı release dizinine koy, mevcut env/permissions/storage
   sözleşmesini koru; freeze/epoch ve Passenger restart adımlarını mevcut native
   production runbook'una göre uygula. Plesk menüsü veya restart otomasyonu bu
   görevde çalıştırılmadı; sırf doküman yayımlamak için DB silme/cleanup yapma.
5. LIVE/READY, epoch/maintenance, kayıt/giriş/doğrulama/reset, `/privacy` kayıt/altbilgi
   erişimi ve Cloud bounded smoke yap; gerçek mail teslimi ve görsel/network davranışı
   operatör kontrolü. Hata varsa aynı 015 ledger ile uyumlu önceki artifact'a kontrollü
   rollback veya fail-forward; migration downgrade yok. Zaman/SHA/sonucu kaydet.

This current overlay does not rewrite dated acceptance records. Production SHA
`f50efbe370778d0757ca665f97e28989554cb282` is operator supplied; this work makes no
Production request, deployment, restart, migration, backup or configuration change.
The operator confirms public signup and required email verification are open.
Source defaults remain fail-closed; an enabled flag is not legal approval.

## Delivery and branches

[Phase 2 PR #1](https://github.com/Baglare/MediaTracker/pull/1) contains the TMDB
preparation, README/ROADMAP corrections and main CI contract. Its head is
`fc912874605bff9570be0b2a746172503e447c18`; [CI 38777636367](https://github.com/Baglare/MediaTracker/actions/runs/38777636367)
passed (3609 tests, 58 conditional skips). These are PR/source results, not main
Linux artifact, PG18, recovery or hosting acceptance. Do not duplicate that patch.

The initial merge hold was cleared on 2026-10-16 by operator-supplied read-only
evidence: Plesk Git Depolari has no connected repository; GitHub Settings has no
webhooks; Production uses an independent Plesk/Passenger release installation.
Repository Actions were rechecked and contain no Production deployment step.
**MAIN_MERGE = AUTHORIZED_GITHUB_ONLY** under that evidence and the operator's
explicit sequential merge instruction. The panel evidence is operator supplied,
not an API inspection claim. No Plesk setting or webhook was changed. Stop if an
unexpected deployment trigger appears; GitHub acceptance never authorizes deploy,
restart, freeze or Production migration.

PR #1 merged as `29e8414ab2bbc4989599b829077c8a6ca8a59cfb`.
[Main CI 38814228183](https://github.com/Baglare/MediaTracker/actions/runs/38814228183)
passed Release validation, real disposable PG18 proof/recovery (including separate
receipt verification), and Linux artifact generation/upload. These are main/source
CI results, not hosting or real-backup acceptance. PR #2 must merge current main
without rewriting history, pass its new PR checks, and then receive the same full
main checks after its separately authorized merge. Skipped jobs do not count.
The Production release stays independent and unchanged by these GitHub operations.

Keep `release/v1-hardening`: CI preserves that supported ref alongside main.
Keep `develop` and `test`: no deletion is
needed for v1, and remote preview/recovery dependencies are not proven absent.
No branch is renamed or removed.

## Closure security evidence — 2026-10-16

The scoped `lib/auth` review found a reset/sign-in race in the baseline: an old
password verification could resume after reset deleted sessions and then insert
a new session. A deterministic synthetic HTTP/memory-adapter test reproduced it
before the patch (200 instead of the required 401). The closure patch binds each
request's verified credential hash to a final canonical credential read **after**
session insertion. A changed hash revokes the new session and withholds cookies
and the successful body. A reset occurring later deletes the already inserted
session. No new hashing, migration, schema or dependency is introduced.

Regression coverage includes reset to a different/same plaintext password,
replacement-password success, concurrent distinct users, cross-origin signout
denial and revocation of only the signed-out session. Independent source review
found no surviving bypass in that candidate. Source/synthetic evidence is not
Production or real PostgreSQL concurrency acceptance; the fix is not deployed.
Existing owner-RLS, privacy/Auth-last, CSRF and limiter contracts are preserved.

Local typecheck, lint (two existing warnings) and synthetic offline native build
passed. Full Windows and Linux CI regression: 3602 passed, 58 conditional skips.
Initial Windows copies failed due to link permissions and `dist`/Git context;
those attempts are not PASS. A secret-free copy with correct path/Git context and
link permissions completed the full suite without weakening any assertion.
The initial closure CI is [run 38810924982](https://github.com/Baglare/MediaTracker/actions/runs/38810924982);
the final PR head must independently pass after the runner update.

After the operator started Docker, the existing local PG18 image was verified.
The PostgreSQL proof runner needed the same attested `docker-exec` transport on
Windows already used by recovery; Linux keeps TCP. Its 72 targeted regression
checks pass. The corrected disposable runner completed P1/P2/release with all
14 migrations, fresh/upgrade, independent connections, owner RLS/CAS/tombstones,
guest/authenticated quotas and synthetic dump/restore. Recovery ledger, content,
ownership/ACL, private-file hashes and post-restore two-user isolation passed;
`live` remains `NOT_RUN`. Use the source/fingerprint-bound receipt for the final
commit, not an intermediate working-tree receipt. No existing real backup was
opened, recreated or restored. These local results do not run the main-only Linux
artifact job or establish Production acceptance.

Runtime dependency audit in CI: zero vulnerabilities. The existing full-audit
exception `V1-SEC-EXCEPTION-001` covers five dev-only High entries (zero Critical),
expires 2026-11-03 and must be reviewed/removed when an upstream fix is available;
it is not a clean full dependency audit or a new exception granted by this task.

## Maintenance and monitoring — prepared, not installed

Reuse `scripts/native-maintenance.mjs`; do not create a second cleanup service.
Offline inventory: `node scripts/native-maintenance.mjs` (no connection).
In a future authorized private operator session, use `--connect --job inspect`
and `--connect --job cleanup` **without `--apply`** to inspect/plan. Required role,
target fingerprint, ledger and TLS checks must pass. Do not copy runtime credentials
or print connection variables. The source defaults to a 500-item bounded plan.
Apply requires separate authorization for the exact target, storage root and batch;
it uses an advisory lock, rejects release freeze, validates asset intents and stale
temporary files, and calls the existing limiter-expiry cleanup. Unknown paths,
symlinks, participant loss and privacy barriers are stop conditions. Ordinary cleanup
is not account erasure. Never schedule freeze/unfreeze or privacy erasure as cleanup.

Proposed operator schedule: inspect daily, review the bounded plan weekly and after
capacity alerts; choose an apply window only after reviewing load and rollback.
This is an operational proposal, not measured capacity or a retention commitment.
No cron/Plesk Scheduled Task has been created or asserted to exist.

Configure a future external monitor with no auth cookie, provider calls or request
body. `GET /api/health/live` returns only `alive`; it proves process liveness.
`GET /api/health/ready` returns `ready`/200 or `unavailable`/503 with no-store; it
checks native configuration, required storage directories and database readiness.
These routes exist in source; their deployed availability is LIVE_UNVERIFIED.
Suggested initial policy: liveness every 5 minutes; readiness every 15 minutes;
timeout 10 seconds; alert after 3 consecutive failures, notify recovery once.
Rate/backoff readiness probes if database load rises. Do not automatically restart,
deploy or restore in response. Operator: correlate sanitized error codes and hosting
capacity; record timestamps/status only, never URLs carrying tokens or user content.
Monitoring/alert delivery is MANUAL_ACTION_REQUIRED, not an active service.

## Backup and isolated restore

Supported host answers: daily hosting backups and approximately four-week rotation;
hosting processing in Türkiye, no foreign hosting subprocessor, Türkiye-based
authorized infrastructure access. These are operator-reported written answers.
Do not ask them again as unanswered gates. The operator also reports the post-014
encrypted backup was verified and copied off-server. Preserve it; do not recreate,
open, copy, delete or re-encrypt it in this task.

Still unverified: current Plesk automatic-task success, selected subscription/DB/
private-storage coverage, DB/file coherence, restore permissions, encryption/access
for hosting copies, log rotation and retention/access of independent offsite copies.
Read-only operator evidence should include redacted backup settings and last-success
time, selected databases/private files and restore capabilities. A backup filename
or four-week policy does not establish recoverability or freshness.

Use the existing [recovery operator package](NATIVE_SHARED_RECOVERY_OPERATOR.md)
and `scripts/native-recovery-proof.mjs`; its historical migration counts are not
authority for a newer ledger. For a future isolated rehearsal:

1. Obtain a dedicated disconnected PG18 target, separate roles, empty storage and
   explicit authorization to handle the chosen copy. Deny outbound SMTP/providers,
   public ingress and Production connection values. Prefer synthetic fixtures.
2. Pin the recovery-source fingerprint, exact migration manifest (including 014),
   envelope/authentication digest and independent expected fingerprint. Missing or
   mismatched proof is STOP. Do not alter a proof to match the current source.
3. With local Docker Linux engine and an already local `postgres:18-alpine` image,
   `node scripts/native-recovery-proof.mjs --proof` creates synthetic two-user
   dump/restore evidence. It does not prove restoration of the real hosting copy.
   No pull/build or Production fallback is permitted. Missing tooling is NOT_RUN.
4. For a real copy, follow the existing private input/unseal workflow only under
   separate exact-copy authorization. Compare ledger, schema/ACL/FORCE RLS,
   full content and private-file hashes; verify A/B read/write denial and normal
   owner reads, session/reset/revocation and asset permissions on the isolated target.
5. Reconcile approved erasures after the backup timestamp before any use of restored
   data. Record source SHA, fingerprint, timestamps and individual outcomes without
   account content; preserve sealed original evidence. Cleanup only runner-owned
   disposable resources. Any unknown field leaves restore acceptance PARTIAL.

No real restore is performed here. No suitable authorized isolated real-copy target
or decryption authority was supplied. Never test restoration over Production.

## Privacy and provider decision ledger

**MANUAL_ACTION_REQUIRED**: operator/legal approval of each processing purpose and
Article 5 basis; Article 9 mechanism for Gmail/providers/CDNs and other foreign
recipients; Article 10 notice completeness; VERBİS applicability; formal request
channel coverage. [KVKK's notice requirements](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-)
are the reference, not a claim of compliance. Existing manual request procedure and
its 30-day response tracking remain applicable. Collect only necessary identity
evidence; never ask users for passwords, cookies or full unnecessary ID copies.

| Data/lifecycle | Current technical position | Decision still required |
| --- | --- | --- |
| Browser library/exports | Owner-scoped local data and downloaded copies; logout is not erasure | User-controlled copies and offline-device limits disclosed |
| Account/Cloud/social/assets | Existing operator export and Auth-last guarded deletion; no self-service full erase UI | Purpose-specific retention, participant/legal-hold policy and completion evidence |
| Sessions/tokens/limiter | Technical expiry and bounded cleanup exist | Expiry is not a legal retention basis or physical-delete proof |
| Hosting logs/support mailbox | Sanitized app errors; hosting may retain IP/time/UA; email support is separate | Actual log/support retention, access and destruction criteria; no invented days |
| Hosting/offsite backups | Host daily/~4 weeks; post-014 encrypted offsite copy operator reported | Last-copy erasure, independent-copy retention and restore reconciliation |

Provider review uses official sources checked 2026-10-15; no key is requested or used:

| Provider | Decision and evidence |
| --- | --- |
| TMDB | Keep `disabled_by_policy`. PR #1 branding/provenance preparation is not enablement. Written permission covers the asked deterministic, non-revenue use only; ambiguous retention answer does not extend six months. [Official FAQ](https://developer.themoviedb.org/docs/faq) requires approved branding/notice. [Terms page](https://www.themoviedb.org/api-terms-of-use) was inaccessible to the review tool; preserve the prior terms review and recheck the account's actual contract before enablement. |
| TVMaze | Keep existing enabled integration/attribution and source links. [API licensing](https://www.tvmaze.com/api#licensing) specifies CC BY-SA. Review redistribution/transformations and exported metadata ShareAlike requirements; existing access is not blanket legal approval. |
| Open Library | Existing real User-Agent/contact gate remains. [Official API guidance](https://openlibrary.org/developers/api) asks application registration and identified frequent requests; review applicable content/image rights and load limits before activation. Leave production unset pending that evidence; manual books remain available. |
| AniList | Keep disabled. [Current terms](https://docs.anilist.co/guide/terms-of-use) prohibit competing anime/manga trackers; free/noncommercial status alone is insufficient. No authorization was supplied. |
| OMDb | Keep new public search disabled; retain existing legacy compatibility. [Official terms](https://www.omdbapi.com/legal.htm) restrict personal/noncommercial use and redistribution. No new key or paid plan is needed while disabled. |

Smallest future TMDB lifecycle: retain independently authored user progress/ratings/
notes and stable application identity separately from provider fields; store genuine
provider provenance plus fetchedAt/expiresAt and remove/refetch provider fields by
six calendar months at the latest (a conservative earlier deadline is acceptable).
Re-obtaining metadata must not merely reset the age of the old payload. Do not
relabel TMDB descriptions, titles or images as manual user data. This is a design,
not an implemented migration or authorization to retain identifiers indefinitely.
Offline devices, Cloud revisions/tombstones, export/import/restore and backup expiry
must all enforce the same deletion semantics without losing user-authored records.
That full lifecycle is not established; **TMDB_ENABLEMENT = POST_RELEASE_GATE**.
Neither a TTL on transient search nor a periodic refresh alone closes that gate.

For portfolio/demo text and synthetic screenshot guidance see [portfolio kit](V1_PORTFOLIO_KIT.md).
