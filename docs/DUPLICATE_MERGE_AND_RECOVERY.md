# Duplicate Merge and Recovery

Bu belge D1C.2B kullanıcı kontrollü local merge sözleşmesini tanımlar. Scanner
adaylığı merge izni değildir; hiçbir candidate otomatik uygulanmaz.

## Merge eligibility

`lib/duplicate-merge.ts` plan oluşturmadan ve uygulamadan önce aktif owner'ı,
candidate/evidence fingerprint'ini, seçili record varlığını, identity alias
registry'yi ve ilişkili domain snapshot'ını yeniden okur.

- Exact candidate için de açık seçim ve son onay gerekir.
- Strong candidate için doğrulanmış evidence korunur; canonical identity ayrıca
  seçilir.
- Probable candidate ek olarak “aynı medyayı temsil ediyor” onayı ister.
- Stale fingerprint, owner mismatch, alias/redirect collision, farklı payload
  taşıyan aynı log ID ve çözümlenmemiş alan conflict'i merge'i bloke eder.
- Open Library work/edition, show/season, namespace/type/yıl conflict'i scanner'ın
  hard-conflict politikasıyla tekrar kontrol edilir.

## Connected-component alt küme güvenliği

Üç veya daha fazla record içeren candidate bütünü varsayılan seçilmez. Kullanıcı
en az iki record'dan oluşan alt kümeyi açıkça işaretler. Seçilen bütün çiftler
yeniden sınıflandırılır; transitive A-B-C bağlantısı A-C eşitliği sayılmaz.

## Survivor record ve canonical identity

`survivorRecordId` local instance kimliğidir ve değişmez. Progress loglar,
recommendation linkleri ve local redirect'ler bu ID'ye bağlanır.

`canonicalIdentityKey` ayrı seçimdir. Valid external V2 identity, manual/legacy
identity'den önce önerilir ama kullanıcı seçimi olmadan uygulanmaz. Identity
seçildiğinde onun `externalSource`/`externalId` teknik alanları birlikte korunur;
survivor record başka kayıt olabilir.

## Field survivorship

Scalar conflict'lerde başlangıç seçimi survivor değeridir ve UI'da görünür.
Rating, progress, status veya tarih için max/newest/longest heuristiği yoktur.
Liste alanları yalnız açık `union` seçimiyle birleştirilir.

Kişisel not değerleri candidate listesinde ve receipt'te gösterilmez. Farklı
notlar merge'i alan kararı verilene kadar bloke eder; UI içerikleri ancak ayrı
“İçeriği açıkça göster” aksiyonundan sonra gösterir. Provider raw payload
whitelist dışında taşınmaz.

Mevcut `MediaItem` modeli tek `seriesGroupId` tutar. Aynı group içindeki duplicate
üyelik survivor üzerinde tekleşir; diğer üyeler ve sıraları değişmez. Seçili
kayıtlar iki farklı group ID taşıyorsa ilişki kaybetmemek için merge bloke edilir.

## Identity alias ve record redirect

`mediaIdentityAliases` registry kaybeden V2 identity, legacy canonical key ve
record ID alias'larını doğrudan seçilen canonical V2 key'e flatten eder. Alias
chain/cycle bırakılmaz ve başka identity'ye ait mapping overwrite edilmez.

`mediaRecordRedirects` ayrı owner-scoped registry'dir:

```text
oldRecordId -> survivorRecordId
```

Bu registry local instance ilişkileri içindir; canonical identity alias ile aynı
kavram değildir. Direct mapping, chain flattening, collision/cycle reddi,
temp/current/backup ve runtime codec kullanır.

## Progress log ve local link remap

Kaybeden record'ların `ProgressLog.mediaId` alanı survivor ID'ye çevrilir. Log
ID, timestamp ve payload korunur; remap yeni XP veya social activity üretmez.
Aynı log ID aynı payload ise tek mantıksal kayıt korunabilir; farklı payload
merge blocker'dır.

Owner-scoped recommendation local linkleri survivor ID'ye remap edilir ve
recommendation başına tek link kalır. Remote recommendation snapshot formatı
değişmez.

## XP koruma politikası

Merge coordinator XP API, entitlement storage veya XP outbox çağırmaz. Plan ve
receipt bütün pre-merge legacy XP compatibility key'lerini yalnız referans
olarak saklar. Merged item yeni bir legacy key üretecekse işlem bloke edilir.
Bu nedenle merge:

- yeni grant/entitlement oluşturmaz;
- revoke/restore üretmez;
- XP toplamını değiştirmez;
- existing outbox payload sözleşmesini değiştirmez.

Delete/re-add davranışı identity alias flattening ve mevcut compatibility
resolver üzerinden aynı entitlement semantiğini sürdürür.

## Transaction journal

`duplicateMergeJournal` owner-scoped personal-data domain'idir. Journal tek son
merge için bounded before/after snapshot ve receipt tutar.

Durumlar:

```text
prepared -> applying -> local-committed -> completed
                                      \-> sync-pending
applying/local-committed -> rolling-back -> rolled-back
                                        \-> recovery-required
```

Uygulama sırası:

1. Güncel state ve plan yeniden doğrulanır.
2. Before snapshot `prepared` journal'a safe-write edilir.
3. Media/log snapshot, identity aliases, record redirects ve local links yazılır.
4. Authenticated owner cloud operasyonları durable queue'ya yazılır.
5. Bütün domain'ler runtime codec ve read-back fingerprint ile doğrulanır.
6. Journal local commit/receipt durumuna geçer.
7. Network flush ancak bundan sonra tetiklenir.

Her local write veya queue persistence hatasında remote çağrı yapılmaz. Before
snapshot geri yüklenir ve doğrulanır. Rollback de doğrulanamazsa journal
`recovery-required` kalır; UI başarı göstermez. Startup recovery incomplete
journal'ı yalnız eşleşen owner için idempotent rollback eder.

## Cloud queue ve owner transition

Guest merge cloud operasyonu üretmez. Authenticated merge mevcut owner-scoped
queue'ya survivor upsert, remapped log upsert ve loser delete yazar. Sıra upsert
önce, delete sonra olacak şekilde planlanır. Queue operation ID'leri merge
operation ID'sinden deterministik türetilir.

Queue network hatasında local merge korunur ve `sync-pending` gösterilir.
Generation/owner izolasyonu mevcut sync manager tarafından sürdürülür. UI
doğrudan remote mutation yapmaz ve bilinmeyen cloud kolonu göndermez.

Cloud revision, tombstone ve composite primary key bulunmadığından cross-device
concurrent merge garantisi yoktur; bu D2 sınırıdır.

## Undo

Yalnız aktif owner'ın en son tamamlanmış merge'i undo edilebilir. Current local
domain fingerprint'i merge receipt'indeki sonuçla eşleşmiyorsa post-merge edit
koruması undo'yu bloke eder.

Undo media, log, alias, redirect ve local link state'ini before snapshot'tan
read-back doğrulamasıyla geri getirir. Authenticated owner için compensating
upsert'ler mevcut durable queue'ya yazılır. XP grant/revoke/restore üretilmez.
İkinci undo idempotent sonuç verir.

Cross-device undo revision/tombstone olmadan garanti edilmez. Raw snapshot ve
personal note içerikleri UI'da gösterilmez.

## Social ve recommendation sınırı

Merge social activity üretmez, remote activity/shared-note/showcase payload'ını
yeniden yazmaz ve idempotency key değiştirmez. Tarihsel remote snapshot'lar
olduğu gibi kalır. Recommendation remote modeli değişmez.

## Manuel testler

1. İki duplicate record'a farklı log ve aynı group üyeliği ekle.
2. Candidate'dan yalnız iki kaydı seç; survivor, identity ve alanları belirle.
3. XP toplamını not edip merge'i uygula.
4. Tek survivor, korunmuş log ID'leri, group ve recommendation linkini doğrula.
5. Offline durumda `sync-pending`, reload sonrası journal/receipt kalıcılığını
   kontrol et.
6. Online olunca mevcut queue flush'ını doğrula.
7. Son merge'i undo et; record/log/link/alias/redirect state'inin döndüğünü
   kontrol et.
8. Merge sonrası survivor'ı düzenle; stale undo'nun bloke olduğunu gör.
9. User A → User B geçişinde journal/receipt izolasyonunu doğrula.

