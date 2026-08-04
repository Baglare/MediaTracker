# Goal System D5-1 — Audit ve Domain Kararları

D5 birleşik görünüm: [Goal System Mimarisi](./GOAL_SYSTEM_ARCHITECTURE.md). D5-4 backup/Cloud uygulaması: [Goal System Cloud Sync](./GOAL_SYSTEM_CLOUD_SYNC.md).

## Kapsam ve sonuç

D5-1 read-only audit'i domain çekirdeğini engelleyen bir hard blocker bulmadı. Bu aşama yalnız `features/goals/domain` altında saf model, codec, tarih/policy helper'ları ve read-model sözleşmesini tanımlar. UI, localStorage kaydı, portable backup formatı, Cloud queue entity'si, Supabase schema/RPC ve öneri motoru eklenmez.

Zaman-sınırlı `completed_media` değerlendirmesi için D5-3 riski vardır: mevcut veride her tamamlanmanın tarihi ve action semantiği homojen değildir. Bu eksiklik domain modelini engellemez; evaluator `insufficient_history` üretebilmelidir.

## ProgressLog audit'i

Log üretiminin ana yolu `hooks/use-media-library.ts` içindeki `appendProgressLog` fonksiyonudur:

| Action | Üretildiği işlem | `amount` güvenilirliği | `previousProgress/newProgress` güvenilirliği |
| --- | --- | --- | --- |
| `increment` | Film-benzeri olmayan medyada increment komutu | Nominal buton artışıdır; total'e clamp edilen son adımda gerçek delta'dan büyük olabilir. Merge sırasında nominal amount'lar toplanır. | Normal mutation için state geçişini güvenilir gösterir. |
| `complete` | Tamamla komutu; yalnız `currentProgress < totalProgress` ise loglanır | Log varsa `newProgress - previousProgress` olarak güvenilirdir. Logun bulunmaması tamamlanma olmadığını kanıtlamaz. | Log varsa güvenilir state geçişidir. |
| `manual_adjust` | Edit/save ile `currentProgress` değişirse | Mutlak farktır; yön bilgisini taşımaz. | Yön dahil gerçek değişimi gösteren güvenilir alanlardır. |
| `added` | Yeni MediaItem kaydı | Ekleme anındaki current progress snapshot'ıdır; dönem içinde kazanılan ilerleme veya tamamlanma olayı değildir. | `0 → imported/current` snapshot'ıdır; tarihsel progress olayı olarak tek başına kullanılamaz. |

Ek bulgular:

- `manual_adjust` yeni değeri codec/UI yollarında sıfırın altına inmez; fakat `newProgress < previousProgress` ile negatif yönlü bir düzeltmeyi temsil edebilir. Bu nedenle evaluator `amount` toplamak yerine geçiş yönünü okumalıdır.
- Normal komut yolunda `complete.amount` yalnız kalan farktır; önceki increment amount'larını tekrar içermez. Son increment total'e ulaştığında status otomatik `completed` olur ve ayrıca `complete` logu oluşmaz. Buna rağmen import/replay/merge nedeniyle action amount'larını körlemesine toplamak güvenli değildir.
- Standart film formu `totalProgress=1` kullanır. Tamamla komutu çoğunlukla `complete: 0 → 1` üretir. Film doğrudan completed eklenirse `added`, edit ile completed yapılırsa `manual_adjust` oluşabilir; import/cloud state'i hiç tamamlanma logu taşımayabilir. Anime film de film-benzeri komut davranışına sahiptir.
- Aynı log ID replay edilebilir. Guest store'daki bir saatlik aynı-action merge'i tek snapshot içinde mevcut ID'yi güncelleyebilir. D5-4, authenticated owner'da local kütüphane ile Cloud kuyruğu arasında gerçek cross-key atomiklik olmadığı için aynı-ID merge'ini kapatır; yeni transition yeni ID alır. Local codec duplicate ID'yi koleksiyon seviyesinde reddetmez; additive import aynı ID+aynı payload'ı skip, aynı ID+farklı payload'ı conflict yapar. Cloud V2 aynı payload'ı idempotent, farklı payload'ı immutable conflict kabul eder.
- Ayrı bir kullanıcı-facing progress-log silme komutu bulunmadı. Replace import/cloud conflict çözümü log listesini azaltabilir; portable additive import silmez. Media silme local logları silmez ve onları detached bırakır. Duplicate merge exact record-ID remap tablosuyla logları yeni media ID'ye taşır.
- Hedef ilerlemesi her okumada mevcut, benzersiz log kümesi ve MediaItem state'inden yeniden hesaplanmalıdır. Log silme/import sonrası azaltılacak ayrı bir Goal sayacı yoktur.
- Detached log hiçbir Goal'a katkı vermemelidir. Exact media ilişkisi çözülemeyen kayıtlar yok sayılır ve `detached_logs_ignored` eklenir. `media` scope kesinlikle title/canonical/fuzzy fallback kullanmaz; `media_type` ve library hesapları da orphan snapshot'a güvenmemelidir.
- `MediaItem.status` `completed` dışına alınırsa completed-media sonucu yeniden hesaplamada düşebilir. Current status tamamlanmış görünse bile dönem içi tamamlanma tarihi güvenilir logla kanıtlanamıyorsa recurring/one-time dönem evaluator'ı `insufficient_history` vermelidir.

Dashboard yalnız status sayıları, log adedi ve current/total progress snapshot'larını kullanır. Legacy progression benzersiz log ID sayısını XP'ye ekler; XP V2 ise MediaItem desired state ve reversible entitlement kullanır. Goal MVP hiçbir XP grant/revoke veya dashboard/profile progression davranışı üretmez.

`MediaType` on literal içerir; `MediaStatus.completed` tamamlanmanın current-state sinyalidir. Series/season ayrı nested aggregate değildir: sezonlar ayrı MediaItem kayıtları olabilir ve `seriesGroupId`, `seriesRelationType`, `seasonNumber`, `orderIndex` ile ilişkilendirilir; `seasonBreakdown` yalnız metadata snapshot'ıdır. Bu nedenle seri başlığı veya sezon adı Goal kimliği olamaz, exact MediaItem record ilişkisi korunur.

## Goal aggregate ve model

Goal ayrı aggregate'tir:

- Medyadan bağımsız `library` ve `media_type` scope'ları vardır.
- Aynı medyaya birden fazla hedef bağlanabilir.
- Goal lifecycle, schedule ve conflict revision'ı MediaItem lifecycle'ından farklıdır.
- Media silme, merge ve import işlemleri Goal için açık remap/eksik-hedef kararı gerektirir.
- Media metadata whitelist'i Goal alanlarını kapsamaz; metadata'ya gömmek Cloud mapping, backup ve conflict sözleşmesini dolaylı ve kırılgan yapar.

Kalıcı `Goal` alanları: `id`, `title`, `origin`, `scope`, `metric`, `schedule`, `lifecycle`, `createdAt`, `updatedAt`. Domain document sürümü `1`'dir. `currentValue`, `progressPercent`, `completed`, `completedAt`, `currentPeriodStart` ve `currentPeriodEnd` kalıcı değildir.

`origin` manuel hedef ile kullanıcı tarafından onaylanmış sistem önerisinin kaynağını ayırır. `GoalSuggestion` lifecycle taşımayan ephemeral bir öneri sözleşmesidir; yalnız explicit `approveGoalSuggestion` sınırı onu `origin=suggested` aktif Goal'a dönüştürür. D5-1 öneri üretim motoru tanımlamaz.

Lifecycle yalnız kullanıcının hedef kaydı üzerindeki kararını taşır: `active`, `cancelled`, `archived`. Attainment türetilmiş sonuçtur: `not_started`, `in_progress`, `reached`, `expired`, `inactive_target`. Cancelled/archived tanımlar aktif UI listesinden çıkarılır; lifecycle attainment değerine dönüştürülmez. `reached`, loglar veya MediaItem state'i değişirse tekrar hesaplanabilir; lifecycle'a yazılmaz.

## Scope ve metric matrisi

| Scope | `progress` | `completed_media` |
| --- | --- | --- |
| `library` | Unit ile uyumlu bağlı loglar toplanabilir | Exact bağlı ve dönem kanıtı olan completed MediaItem kayıtları sayılabilir |
| `media_type` | Scope MediaType ile unit uyumlu olmalı | Desteklenir; movie hedeflerinin genel yolu budur |
| `media` | Exact `mediaRecordId` ile çözülen medyanın tipi unit ile uyumlu olmalı | Desteklenir; tek medya için `targetValue=1` zorunludur |

Unit kararı mevcut ürün codec semantiğine göre şöyledir:

| MediaType | Progress unit |
| --- | --- |
| `tv`, `anime` | `episode` |
| `manga`, `manhwa`, `manhua` | `chapter` |
| `book` | `page` |
| `light_novel`, `web_novel` | `chapter` |
| `movie`, `visual_novel` | Progress unit yok; `completed_media` kullanılır |

`lib/progress.ts` bilinmeyen/default türleri episode'a düşürürken local codec light/web novel için chapter, visual novel için movie fallback'i kullanır. Goal policy sessiz default üretmez: güvenilir ürün semantiği olmayan kombinasyonu reddeder. Anime `format=MOVIE` için D5-3 resolved MediaItem sınıflandırmasını dikkate almalı ve `completed_media` istemelidir.

Media scope kimliği `mediaRecordId`'dir. `canonicalMediaKey` opsiyonel snapshot/tutarlılık sinyali, `title` yalnız gösterim snapshot'ıdır. Başlık, fuzzy eşleşme, aynı isim veya canonical snapshot hedef bulmak için kullanılmaz.

## Tarih ve timezone

- Tarih-only sınırlar kanonik `YYYY-MM-DD` olarak korunur ve JavaScript `Date` ile parse edilmez.
- Calendar-day aritmetiği saf Gregorian civil-date hesabıdır; host timezone nedeniyle gün kayması oluşmaz.
- Recurring instant → yerel gün dönüşümü yalnız doğrulanmış IANA timezone ile yapılır. Geçersiz timezone kontrollü `timezone_invalid` döndürür; sessiz UTC fallback yoktur.
- Haftalık dönem Pazartesi-Pazar, aylık dönem timezone'un yerel takvim ayıdır.
- İlk/son recurring dönem `startsOn`/`endsOn` sınırlarına inclusive olarak kırpılır.
- Leap year, Aralık/Ocak geçişi ve DST instant dönüşümü desteklenir.
- `one_time` schedule timezone taşımaz; çağıran katman değerlendirme gününü date-only olarak verir.

## Runtime codec ve read model

Codec strict allowlist kullanır; bilinmeyen Goal alanları reddedilir. Goal ID stabil UUID, title 1-200 karakter, target pozitif güvenli tam sayı, timestamp'ler timezone taşıyan ISO instant olmalıdır. Scope/metric, tarih aralığı, weekly Monday ve IANA timezone invariant'ları persistence katmanından bağımsız doğrulanır. Versioned `GoalDocument` duplicate Goal ID kabul etmez.

`GoalEvaluation` D5-3 sınırıdır. `currentValue` target'ı aşabilir; `progressPercent` 0-100 clamp edilir, `remainingValue` sıfırın altına inmez. `contributingLogIds` benzersiz ve deterministik sıralıdır. D5-3 `conflicting_log_payload` ve `progress_chain_discontinuity` warning'lerini eklemiş, gerçek trusted-log politikasını [GOAL_SYSTEM_EVALUATION.md](./GOAL_SYSTEM_EVALUATION.md) içinde uygulamıştır.

## Owner-scoped local persistence kararı

D5-2 bu kararı [GOAL_SYSTEM_LOCAL_PERSISTENCE.md](./GOAL_SYSTEM_LOCAL_PERSISTENCE.md) sözleşmesiyle uyguladı:

- Registry domain'i: `goals`.
- Önerilen current key: `mediaTracker:personal:v1:<guest|user-{id}>:goals`.
- Envelope mevcut `mediatracker-personal-data` owner scope, `current/temp/backup`, temp read-back ve rollback davranışını kullanır.
- Envelope `value`, owner ve `savedAt` taşıyan versioned Goal store document'ını taşır; her kayıt D5-1 domain codec'iyle doğrulanır ve domain codec doğrudan localStorage'a bağlı değildir.
- Malformed current overwrite edilmez. Raw kayıt `mediaTracker:quarantine:personal:goals:<timestamp>` altında karantinaya alınır; guest ve account owner verileri birbirine yeniden etiketlenmez.
- Account switch sırasında eski owner verisi hydration tamamlanmadan görünmez. Guest Goal'ları login ile otomatik kullanıcı Goal'ına dönüşmez; mevcut explicit ownership kararı uygulanır.

## Portable backup ve additive import kararı

Portable V2 şu anda strict domain listesi, manifest count/schema ve checksum kullanır; `goals` eklemek format/codec değişikliği gerektirir. D5-1 formatı değiştirmez. Sonraki aşama eski V2 okumayı koruyan yeni bir format sürümü veya açıkça uyumlu schema genişlemesi tanımlamalıdır.

Additive import politikası:

- Aynı Goal ID + byte/canonical olarak aynı payload: `skip-same`.
- Aynı Goal ID + farklı payload: kullanıcı kararı gerektiren conflict; otomatik overwrite, merge veya yeni ID üretme yok.
- Import media record-ID remap tablosu varsa `scope.mediaRecordId` aynı exact tabloyla remap edilir.
- Canonical/title snapshot kimlik değildir; eksik media target bunlarla tahmin edilmez. Target domain import edilmemişse Goal exclude/bloklanır ve raporlanır.
- Import sonrası tüm GoalEvaluation değerleri yeniden üretilir; taşınan sayaç yoktur.

## Cloud ve D5-4 migration kararı

Cloud sync istenecekse ayrı owner-scoped `goals` tablosu ve Goal'a özel RPC gereklidir. MediaItem metadata uygun değildir: library/media_type hedeflerini temsil edemez, bir MediaItem'a çok hedefi ve bağımsız lifecycle/revision'ı güvenli yönetemez, media silme/remap ile Goal verisini yanlışlıkla kaybettirir ve mapping whitelist'ini aggregate deposuna dönüştürür.

D5-4 migration additive olabilir ve olmalıdır: yeni tablo, RLS, owner+goal ID unique/PK, revision, tombstone, stable operation ID ledger davranışı ve CAS RPC eklenir; mevcut D2B.1/D2C.1 migration/rollout dosyaları değiştirilmez. Preflight/postflight, owner-aware relationship ve roll-forward yaklaşımı mevcut runbook desenini izler.

Queue/conflict sözleşmesi mevcut Cloud V2 ilkeleriyle uyumludur:

- Yeni `goal` entity'si ancak D5-4'te versioned queue codec'e eklenir.
- Her retry aynı stable operation ID ve `expectedRevision` taşır.
- Revision mismatch/tombstone otomatik overwrite etmez; queue item blocked conflict olarak kalır.
- Offline local mutation önce safe-write ile kalıcı olur; remote hata local Goal'ı geri almaz.
- Goal payload'ı türetilmiş evaluation/sayaç taşımaz. Media/progress değişiklikleri Goal config revision'ını artırmaz; evaluator local authoritative snapshot'tan yeniden çalışır.

## D5-4 öncesi açık riskler

D5-3 evaluation için hard blocker bulunmamıştır. Completion/status precedence'i, logsuz import, duplicate/conflicting ID ve anime-movie kararları [evaluation sözleşmesinde](./GOAL_SYSTEM_EVALUATION.md) kesinleştirilmiştir. D5-4'e kalan riskler:

1. Dispatch edilmiş log ID payload'ının local bir-saatlik merge ile değiştirilmesinin engellenmesi veya yeni ID'ye ayrılması.
2. Cloud immutable-log conflict'inin owner-scoped CAS/idempotency ile çözülmesi.
3. Goal aggregate için ayrı Cloud revision, RPC ve tombstone sözleşmesi.

Bu riskler ikinci kalıcı sayaç eklenerek çözülmemelidir.
