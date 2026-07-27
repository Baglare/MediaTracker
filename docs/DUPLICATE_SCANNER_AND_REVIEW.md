# Duplicate Scanner and Review

## Amaç ve sınır

D1C.2A, aktif owner'ın local kütüphanesinde aynı içeriği temsil etme ihtimali
bulunan kayıtları açıklanabilir sinyallerle tarar. Tarama read-only'dir:
MediaItem, ProgressLog, grup, alias, XP, recommendation, social veya cloud
verisini değiştirmez.

Bu aşamada merge, survivor seçimi, record silme, log remap veya remote işlem
yoktur.

## Mevcut duplicate kontrol noktaları

| Nokta | Bugünkü ölçüt | Davranış | Yanlış pozitif riski | D1C.2A kararı |
|---|---|---|---|---|
| Discovery / Quick Add | Aynı source + external ID | Ekleme engellenir veya sezon kilitlenir | Namespace bağlamı eksikse orta | Mevcut davranış korunur |
| Manuel ekleme | Local record ID | Aynı başlığa özel engel yok | Başlık tabanlı engel olsaydı yüksek | Scanner sonradan inceleme adayı üretir |
| Backup merge | Source + external ID; record ID çakışırsa yeni ID | Provider duplicate atlanır | Cross-source duplicate kaçabilir | Import semantiği değiştirilmez |
| Recommendation adapter | V2, source/external ID ve local link fallback | Aynı local kayıt tekrar eklenmez | Alias collision durumunda dikkat gerekir | Dual-read değiştirilmez |
| D1C.1 codec | Aynı valid V2 key | Exact collision issue üretir | Düşük | Tek exact candidate group'a bağlanır |
| XP / social | Legacy canonical key | Remote dedupe ve entitlement | Cross-source kayıtlar ayrı kalabilir | Yalnız preview; key değişmez |
| Cloud download | Local V2 identity türetir | Local scanner girdisi olur | Legacy unresolved kayıt olabilir | Scanner local-only çalışır |

Mevcut ekleme uyarıları ve import skip davranışı sessizce kaldırılmamıştır.

## Duplicate sınıflandırması

### Exact

Farklı `MediaItem.id` değerleri aynı doğrulanmış Canonical Identity V2 key'ini
taşıyorsa tek exact group oluşur. Aynı manuel UUID de exact'tir. Invalid veya
unresolved identity exact sayılmaz.

### Strong

Canonical identity farklı olsa bile şu doğrulanmış bridge'lerden biri varsa
strong aday oluşabilir:

- TMDB metadata'sındaki doğrulanmış IMDb ID ile OMDb IMDb external ID eşleşmesi;
- normalize edilmiş geçerli ISBN eşleşmesi;
- collision içermeyen compatibility legacy/record alias eşleşmesi.

Repository'de kanıt bulunmayan TMDB/OMDb, Open Library work/edition veya diğer
cross-source ilişkileri uydurulmaz.

### Probable

Normalize başlık veya güvenli alternative/native başlık eşleşmesi ile aynı
media type probable aday oluşturabilir. Eşleşen yıl ve creator metadata'sı
confidence sıralamasını güçlendirir. Probable sonuç canonical identity veya
alias üretmez.

### Suppressed conflicts

Movie/TV, anime/manga, show/season, aynı source içindeki farklı namespace veya
açık yayın yılı çelişkisi yanlış pozitif korumasıyla bastırılır. Strong verified
identifier, yalnız yıl metadata'sı çelişiyorsa güçlü kalabilir; type ve namespace
çelişkisi her zaman bastırılır.

## Candidate group modeli

`DuplicateCandidateGroup` ikili karşılaştırmaya kilitli değildir. Aynı sınıftaki
pair edge'leri deterministik connected-component gruplarına çevrilir. Üç veya
daha fazla aynı identity/title kaydı tek group olabilir.

Model:

- raw owner UID'yi UI'da göstermeyen owner scope;
- sıralanmış record ID listesi;
- `exact`, `strong` veya `probable` sınıfı;
- internal confidence;
- açıklanabilir evidence listesi;
- scan version;
- candidate ve evidence fingerprint.

Fingerprint FNV-1a tabanlı stabil non-security hash kullanır. Record/evidence
sırasından bağımsızdır. Owner fingerprint'e yazılmaz; karar izolasyonu
owner-scoped storage key ile sağlanır.

## Evidence kodları

- `EXACT_CANONICAL_IDENTITY`
- `VERIFIED_EXTERNAL_ID_MATCH`
- `LEGACY_ALIAS_MATCH`
- `RECORD_ALIAS_MATCH`
- `NORMALIZED_TITLE_MATCH`
- `ALTERNATIVE_TITLE_MATCH`
- `RELEASE_YEAR_MATCH`
- `RELEASE_YEAR_CONFLICT`
- `MEDIA_TYPE_MATCH`
- `MEDIA_TYPE_CONFLICT`
- `CREATOR_MATCH`
- `SEASON_CONTEXT_MATCH`
- `SOURCE_NAMESPACE_CONFLICT`
- `MANUAL_IDENTITY_MATCH`
- `COVER_ONLY_MATCH`

Cover, description ve genre tek başına candidate bucket oluşturmaz. Alias
collision taşıyan alias strong/exact yükseltme yapmaz.

## Confidence politikası

Confidence yalnız deterministik sıralama ve test politikasıdır. UI sahte bir
yüzde göstermez:

- exact: “Kesin kimlik eşleşmesi”;
- strong: “Güçlü aday”;
- probable: “Olası aday”.

Verified bridge yıl çelişkisinde daha düşük strong confidence alır. Probable
aday, başlık + type gerektirir; eşleşen yıl/creator confidence'ı artırır.

## Normalization sınırları

Başlık normalizasyonu NFKC Unicode normalize, locale bağımsız lowercase,
trim, tekrarlanan whitespace ve temel punctuation/symbol farklarını kapsar.
Persisted başlık değiştirilmez.

Transliteration, AI/embedding similarity, açıklama özeti, genre kombinasyonu
ve article kaldırma uygulanmaz. `Part 1/Part 2` ve cilt numaraları korunur.

## Index ve performans

Scanner önce şu bucket'ları kurar:

- valid V2 canonical key;
- doğrulanmış IMDb/ISBN;
- normalize primary title;
- normalize alternative/native title;
- collision-free alias bridge.

Yalnız ortak bucket içindeki kayıtlar karşılaştırılır. Tek record bucket aday
üretmez; aynı pair ve group tekrar üretilmez. Tarama network kullanmaz ve UI
tarafında bir sonraki event-loop turuna bırakılır.

## Owner scope ve auth transition

Guest, User A ve User B aynı scanner kodunu fakat farklı aktif library snapshot
ve personal-data key'lerini kullanır. Owner değişiminde önceki sonuçlar
senkron olarak maskelenir. Async tarama generation token ile doğrulanmadan UI'a
yazılmaz. Logout sonrası authenticated result guest olarak gösterilmez.

## Review decision registry

`duplicateReviewDecisions` owner-scoped personal-data domain'idir. Persisted
kararlar:

- `ignored`
- `deferred`
- `not-duplicate`

`open` türetilmiş durumdur ve yazılmaz. Karar candidate fingerprint, scan
version, sıralı record ID listesi ve evidence fingerprint taşır. Evidence veya
üyelik değişirse eski karar uygulanmaz. Silinen candidate için karar dormant
kalır.

Registry media title, note, overview, provider payload veya owner UID özeti
saklamaz. Temp/current/backup, codec, owner check ve read-back verification
kullanır. Corrupt registry quarantine edilir ve recovery kararı olmadan
overwrite edilmez.

## İnceleme UI

Settings içindeki “Tekrarlanan Kayıt İncelemesi” paneli:

- açık exact/strong/probable sayaçları;
- tarama zamanı ve bastırılmış conflict sayısı;
- record title/type/year/source/namespace;
- progress, log ve grup özeti;
- evidence açıklamaları;
- “Şimdilik ertele”, “Aynı medya değil” ve “Yok say” kararları

gösterir.

Personal note, overview, raw provider payload, AI verisi ve raw owner UID
candidate listesinde gösterilmez. Otomatik merge/delete/düzeltme aksiyonu
yoktur. D1C.2B kontrollü merge akışı yalnız explicit alt küme ve alan
kararlarından sonra açılır.

## Merge preview foundation

`DuplicateMergePreview` yalnız read-only ilişki özeti üretir:

- record başına progress log sayısı;
- grup kimliği/başlığı;
- legacy XP compatibility key'i;
- merge executor ve survivor seçimi bulunmadığını belirten blocked reason'lar.

Preview survivor seçmez, alan birleştirmez ve side-effect üretmez.

## XP, recommendation, social ve cloud sınırı

- XP entitlement/outbox/grant/revoke/restore değişmez.
- Recommendation local dual-read ve link registry değişmez.
- Social payload, activity, dedupe ve idempotency key değişmez.
- Scanner/decision cloud'a gönderilmez.
- `media_items` için kolon veya DB migration eklenmez.
- TMDB'nin mevcut detail yanıtındaki doğrulanmış `imdbId`, strong evidence için
  güvenli local/cloud metadata whitelist'inde korunur; remote schema değişmez.

## D1C.2B entegrasyonu

D1C.2B candidate veya review kararını merge komutu olarak yorumlamaz. Kullanıcı
ayrıca alt küme, survivor record, canonical identity ve bütün alan conflict'lerini
seçer. Executor candidate/evidence fingerprint'ini güncel local state ile tekrar
hesaplar. Journal, rollback, cloud queue ve bounded undo sözleşmesi
[DUPLICATE_MERGE_AND_RECOVERY.md](./DUPLICATE_MERGE_AND_RECOVERY.md)
belgesindedir.

## Manuel testler

1. Aynı external identity'li iki local fixture ile tek exact group oluştuğunu
   doğrula.
2. Media/log/XP sayılarının tarama öncesi ve sonrası değişmediğini kontrol et.
3. Farklı yıllı aynı başlıkların exact/probable değil suppressed olduğunu gör.
4. Bir adayı “Aynı medya değil” işaretle ve reload sonrası kararı doğrula.
5. Evidence oluşturacak alanı değiştir; eski kararın uygulanmadığını kontrol et.
6. User A → User B → logout geçişlerinde sonuç ve karar izolasyonunu doğrula.
