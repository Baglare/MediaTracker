# Local Data Integrity Scanner

## Kapsam

D1D.1 scanner, yalnız aktif owner'ın local medya veri grafiğini salt-okunur
olarak inceler. Network çağrısı, repair, silme, remap, queue flush veya
quarantine yazımı yapmaz. `MediaItem` ve `ProgressLog` runtime codec'lerini;
identity, alias, redirect, duplicate review ve merge journal codec'lerini
yeniden kullanır. Unknown veya unresolved kayıtlar tarama girdisinde ve görünür
kütüphanede korunur.

Scanner `lib/local-data-integrity.ts`, owner geçişi ve stale async sonuç koruması
`hooks/use-local-data-integrity.ts`, Settings sunumu ise
`components/local-data-integrity-panel.tsx` sınırındadır.

## Salt-okunur kaynaklar

Media/progress current slotları `inspectScopedLocalData`, personal-data
registry'leri `inspectPersonalData` ile okunur. Bu inspector'lar canonical
envelope ve domain codec'lerini kullanır; hydration reader'larından farklı
olarak migration, restore, quarantine veya backup yazmaz.

Tarama girdileri:

- owner-scoped media ve progress-log envelope'ları;
- Canonical Identity V2 ve identity alias registry;
- record redirect ve duplicate review registry;
- merge journal;
- recommendation local link projection'ı;
- durable cloud sync queue.

Scanner active owner scope'u açık girdi olarak alır. Guest, User A ve User B
raporları aynı memory veya storage kaynağı olarak kabul edilmez. Auth geçişinde
önceki rapor maskelenir; generation token'ı eski async sonucu reddeder.

## Issue modeli

Her issue deterministik `integrity:v1:<domain>:<code>:<fingerprint>` ID'si,
domain, severity, güvenli record/log ID listesi, kısa evidence,
repairability ve öneri taşır. Record sırası fingerprint'i değiştirmez; aynı
issue tek kez raporlanır.

Severity:

- `critical`: owner karışması, recovery gerektiren journal, ID/alias/log
  collision veya okunamayan kritik current.
- `error`: kırık graph referansı, geçersiz identity/envelope veya orphan upsert.
- `warning`: unresolved identity, exact duplicate adayı, güvenli redirect/log
  adayı veya grup slot çakışması.
- `info`: stale review kararı ya da kısa süreli in-progress journal.

Repairability:

- `safe`: gelecekte deterministik biçimde doğrulanabilecek stale projection
  veya birebir duplicate kayıt.
- `requires-confirmation`: kullanıcı/provider kanıtı gerektiren ilişki ve
  çakışmalar.
- `manual-only`: owner/collision/recovery durumu; otomatik repair güvenli değil.

## Tespit edilen issue sınıfları

- Geçersiz veya duplicate `MediaItem.id`.
- Missing, unresolved, invalid veya key-mismatch Canonical Identity V2.
- Exact identity collision.
- Alias collision, chain, cycle, invalid/orphan target.
- Redirect chain, cycle, source-still-present veya missing target.
- Orphan, duplicate veya conflicting `ProgressLog.id`/payload.
- Series metadata için missing group ID ve duplicate group slot.
- Missing/foreign/invalid recommendation local link.
- Stale duplicate review decision.
- Owner-mismatch, stuck veya recovery-required merge journal.
- Invalid/foreign veya orphan cloud queue upsert.
- Envelope version, owner, status ve codec uyuşmazlığı.

Tarama bucket/map tabanlıdır. Record ID, identity, log ID ve group slot
kontrollerinde bütün koleksiyonu ikili karşılaştırmaz. Duplicate adaylığında
mevcut index/bucket kullanan scanner yeniden kullanılır.

## Privacy

Rapor ve UI personal note, AI içeriği, raw provider payload, secret/token veya
raw auth UID taşımaz. UI record ID'yi mümkün olduğunda güvenli başlık özetiyle
eşler; owner için yalnız `guest`/`user` sınıfı raporda bulunur. Source
fingerprint veri değişimini doğrulamak içindir ve UI'da gösterilmez.

## D1D.2 kontrollü repair

Scanner salt-okunur kalır. D1D.2 repair coordinator
`lib/local-data-integrity-repair.ts`, scanner issue ID'sini ve kaynak
fingerprint'ini yeniden doğruladıktan sonra yalnız tek seçili `safe` issue için
deterministik bir plan üretir. Preview değişecek alanları ve etkilenen
record/log/group sayılarını gösterir; kullanıcı açıkça onaylamadan yazma
başlamaz. Varsayılan veya arka plan “hepsini düzelt” akışı yoktur.

Desteklenen safe repair'ler:

- stale duplicate review kararını silmek;
- collision/cycle içermeyen alias veya record redirect chain'ini unique terminal
  hedefe flatten etmek;
- aynı group slotundaki duplicate explicit `orderIndex` değerlerinden
  deterministik sonraki değerleri temizlemek;
- recommendation local link veya orphan log `mediaId` değerini mevcut valid
  record redirect üzerinden remap etmek;
- alanları valid Canonical Identity V2 kaydında yalnız türetilmiş `key`
  mismatch'ini düzeltmek;
- mevcut duplicate merge coordinator ile in-progress merge journal recovery'si.

Her işlem owner-scoped `integrityRepairJournal` içine versioned plan ve minimal
before/after patch yazar. Domain değişiklikleri mevcut temp/current/backup
safe-write protokolünü kullanır ve read-back/rescan ile doğrulanır. Hata halinde
before patch geri uygulanır; bu da doğrulanamazsa journal
`recovery-required` kalır. Son tamamlanan repair, sonuç fingerprint'i
değişmemişse geri alınabilir. Undo başka owner'a uygulanmaz ve merge-journal
recovery'sini yeniden yarım duruma döndürmez.

Corrupt alias/redirect current slotu genel writer tarafından hâlâ korunur.
Repair writer yalnız canonical codec'in collision/cycle içermeyen repairable
chain olarak kanıtladığı eski snapshot'ı backup'a alıp doğrulanmış flattened
değerle değiştirebilir.

## Manual-only sınırı

Unresolved/invalid manual identity, exact identity collision, alias/redirect
collision veya cycle, conflicting duplicate log payload, redirectsiz belirsiz
orphan log, owner mismatch, corrupt media envelope ve invalid cloud queue
operasyonu değiştirilmez. Cross-source identity tahmini, record silme, duplicate
merge, XP/social side effect ve network/cloud mutation repair coordinator'ın
dışındadır.

## UI davranışı

Settings içindeki **Veri Bütünlüğü** paneli severity/domain sayaçlarını,
yeniden tarama aksiyonunu, issue kodunu, güvenli ilişki özetini ve
repairability etiketini gösterir. Sağlıklı durumda boş sonuç; critical
recovery durumunda belirgin uyarı gösterilir. Panel taramanın salt-okunur
olduğunu belirtir. Yalnız `safe` issue'larda “Düzeltmeyi hazırla”, before/after
preview, tek-issue onayı, sonuç/recovery durumu ve uygun son işlem için undo
gösterilir. Personal note, AI içeriği, raw provider payload ve owner UID preview
ve journal metadata'sına yazılmaz.

## Manuel smoke

1. Sağlıklı owner kütüphanesinde paneli aç ve boş durumu doğrula.
2. Test ortamında orphan log veya duplicate ID fixture'ı yükleyip yeniden tara.
3. Medya/log/registry/queue raw fingerprint'lerinin tarama öncesi ve sonrası
   aynı kaldığını doğrula.
4. User A'dan User B'ye hızlı geçişte A raporunun görünmediğini doğrula.
5. Corrupt registry/envelope fixture'ında quarantine veya current write
   oluşmadığını ve recovery uyarısının göründüğünü doğrula.
6. Issue özetinde personal note, provider payload ve owner UID olmadığını
   kontrol et.
7. Bir safe issue için preview'u aç; yalnız seçili issue'nun değiştiğini,
   read-back sonrası issue'nun kaybolduğunu ve medya/log/XP sayısının
   değişmediğini doğrula.
8. Repair sonrası ilgili kaydı değiştirip undo'nun stale fingerprint nedeniyle
   bloke olduğunu doğrula.

Bu repository turunda gerçek tarayıcı ve iki hesap smoke'u otomatik
çalıştırılmaz; unit/static testler browser veya cloud kanıtı değildir.

## Sonraki sınır

Collision/unresolved/manual-only repair, quarantine yönetimi ve kullanıcı
kararı isteyen graph dönüşümleri sonraki D1D/D1F kapsamındadır. Cloud
revision/tombstone ve cross-device bütünlük D2; merkezi backup/restore D1E
kapsamındadır.
