# Goal System D5-3 — Evaluation ve Öneri Sözleşmesi

D5-4 immutable-after-dispatch ve Cloud CAS sözleşmesi: [Goal System Cloud Sync](./GOAL_SYSTEM_CLOUD_SYNC.md).

Bu belge [Goal domain modelini](./GOAL_SYSTEM_DOMAIN.md) ve [owner-scoped yerel Goal store'unu](./GOAL_SYSTEM_LOCAL_PERSISTENCE.md) tamamlayan, yalnız okuma amaçlı evaluation katmanını tanımlar. `GoalEvaluation` localStorage, portable backup, Cloud queue veya Supabase'e yazılmaz; her medya/log snapshot'ından yeniden türetilir.

## Trusted ProgressLog politikası

Evaluator önce owner snapshot'ı için media ID, media type, log createdAt ve unit indeksleri kurar. Her Goal için bütün log dizisini yeniden taramaz.

- Aynı `ProgressLog.id` ve aynı payload tekrar ederse tek kayıt kabul edilir.
- Aynı ID farklı payload taşıyorsa iki payload da contribution dışıdır; array sırası veya son-gelen-kazanır uygulanmaz ve `conflicting_log_payload` üretilir.
- `amount` hiçbir progress veya completion hesabında toplanmaz. `increment`, `complete` ve `manual_adjust` için delta yalnız `newProgress - previousProgress` olarak okunur.
- `manual_adjust` geriye düzeltmeyse negatif delta üretir. Dönem toplamı sonunda `currentValue` sıfırın altına düşmez.
- `added` yalnız chain başlangıç snapshot'ı olabilir; dönem içinde kazanılmış progress veya completion değildir.
- Negatif, sonlu olmayan veya geçersiz timestamp taşıyan progress geçişleri kabul edilmez.
- Exact `mediaId` ile mevcut MediaItem'a bağlanmayan detached log katkı vermez ve ilgili scope/dönemde `detached_logs_ignored` üretir. Title, canonical snapshot veya fuzzy eşleşme ile yeniden bağlama yapılmaz.
- Goal unit'inden farklı log contribution dışıdır ve `incompatible_unit` üretir. AniList `format=MOVIE` kayıtları episode hedefinde değerlendirilmez.

## Deterministik transition reducer

Her medya zinciri `createdAt`, eşit timestamp halinde stabil `id` ile sıralanır. İlk geçerli transition zincir için anchor kabul edilir. Sonraki transition'ın `previousProgress` değeri son kabul edilen `newProgress` ile aynı değilse transition dışarıda bırakılır; beklenen state ilerletilmez ve `progress_chain_discontinuity` üretilir. Daha sonraki bir transition son güvenilir state'e yeniden bağlanırsa zincir oradan devam edebilir.

Bu politika kopuk segmentleri körlemesine toplamaz. Belirsiz branch'i atarak overcount yerine konservatif undercount tercih eder. Kabul edilen pozitif ve negatif transition ID'leri benzersiz, deterministik listelenir. Gerçek `currentValue` target'ı aşabilir; `progressPercent` read modelde 0–100 clamp edilir ve `remainingValue` sıfırın altına düşmez.

## Completed-media kanıtı

Bir medya dönem içinde en fazla bir kez sayılır. Güçlü kanıt önceliği:

1. Eşiği dönem içinde aşan geçerli `complete` transition'ı.
2. Eşiği dönem içinde aşan geçerli `manual_adjust` transition'ı.
3. Eşiği dönem içinde aşan diğer güvenilir progress transition'ı.

Eşik, mevcut MediaItem'ın pozitif `totalProgress` değeridir. Güçlü kanıta ek olarak current `status=completed` olmalıdır. Status daha sonra completed dışına düzeltilirse geçmiş completion contribution'ı yeniden hesaplamada düşer.

`added`, yalnız current status, completion tarihi olmayan imported completed kayıt, dış snapshot, title veya note kanıt değildir. Current status completed olduğu halde güçlü tarih kanıtı yoksa medya sayılmaz ve `insufficient_history` üretilir; tahmini tarih oluşturulmaz. Film ve visual novel completion hedefleri de aynı politikayı kullanır. Silinmiş exact media hedefi `inactive_target`; library/media_type hedeflerinde yalnız mevcut exact kayıtlar sayılır.

## Dönem, timezone ve attainment

Date-only sınırlar literal Gregorian `YYYY-MM-DD` olarak kalır. Weekly dönem Pazartesi-Pazar, monthly dönem IANA timezone'un yerel takvim ayıdır. Civil-date aritmetiği leap year ve Aralık/Ocak geçişini; instant-to-date dönüşümü DST'yi destekler. Sabit `7×24 saat`, 30 gün veya sessiz UTC fallback yoktur. Geçersiz timezone kontrollü `timezone_invalid` üretir.

Evaluation yalnız `now` instant'ına kadar oluşmuş kanıtı sayar; kartta programın tam period başlangıç/bitiş sınırı gösterilir. Attainment precedence:

1. Exact hedef medya yoksa `inactive_target`.
2. Dönem başlamadıysa `not_started`.
3. Target karşılandıysa `reached`.
4. Dönem bitti ve target karşılanmadıysa `expired`.
5. Diğer durumda `in_progress`.

Lifecycle bundan ayrıdır. `cancelled` ve `archived` Goal tanımını korur; evaluator sonucu lifecycle'a yazmaz, reached Goal'ı tamamlandı alanıyla güncellemez ve expired Goal'ı otomatik arşivlemez.

## Evaluation orchestration ve reaktivite

Snapshot hazırlama `O(media + logs + logs log logs)` maliyetindedir; her media zinciri bir kez sıralanır. Goal değerlendirmesi yalnız scope'a giren media indeksleri ve onların zincirleri üzerinde çalışır. Aynı snapshot/context read model'i bütün Goal'lar tarafından paylaşılır; global veya owner'lar arası mutable cache yoktur.

Hook owner değişiminde eski media/log/Goal snapshot'ını görünür kılmaz. Local mutation, import, replace veya log listesi değişimi yeni snapshot ve evaluation üretir; Cloud round-trip beklenmez. Tema ve collapsible state'i evaluator dependency'si değildir.

## Otomatik öneriler

Öneriler ephemeral `GoalSuggestion` üretir; kullanıcı “Hedef olarak ekle” demeden Goal store'a yazılmaz. D5-3 yalnız `library` ve `media_type` scope'larında weekly/monthly progress ve completed-media önerileri üretir.

- Weekly eğitim penceresi içinde bulunulan hafta hariç son 4 tamamlanmış haftadır.
- Monthly eğitim penceresi içinde bulunulan ay hariç son 3 tamamlanmış yerel takvim ayıdır.
- En az 3 tamamlanmış dönemde pozitif, trusted contribution yoksa öneri oluşmaz.
- Target pozitif tam sayıya aşağı yuvarlanan median ile belirlenir ve metric/schedule bazlı güvenli üst-alt sınırlarla clamp edilir. Ham ortalama kullanılmaz.
- Aynı scope + metric türü/unit + schedule türünde active Goal varsa öneri bastırılır.
- Sıra deterministiktir ve en fazla 3 öneri gösterilir.
- Reason yalnız geçmiş hızına göre makul öneri olduğunu açıklar; başarı garantisi veya cezalandırıcı dil içermez.
- “Şimdilik gizle” owner anahtarıyla ayrılmış component-session state'idir; yeni persistent dismiss store yoktur.

Onay mevcut `approveGoalSuggestion` domain sınırı ve local Goal repository üzerinden `origin=suggested`, `lifecycle=active` Goal üretir. Evaluation veya öneri state'i Goal envelope'ına eklenmez.

## D5-4 Cloud gereksinimleri

Guest local bir-saatlik mutation merge'i tek kütüphane snapshot'ında kalır. Authenticated owner için local kütüphane ve Cloud queue iki ayrı safe-write anahtarı olduğundan D5-4 aynı ID coalescing'i kapatır ve her yeni transition için yeni ID üretir. Cloud V2 gönderilmiş veya replay edilen bir ID için immutable payload sözleşmesini uygular:

- Server'da aynı owner + log ID için payload immutability sağlamalı.
- Aynı payload retry'ını idempotent kabul etmeli, farklı payload'ı `immutable_log_conflict` olarak bloklamalı.
- Authenticated pending/dispatch/ack durumlarının tamamında local düzeltme yeni log ID üretir.
- Goal aggregate için ayrı owner-scoped tablo/RPC, revision/CAS, stable operation ID ve delete tombstone eklemeli.
- Goal conflict payload'ında türetilmiş evaluation alanları taşımamalı.

Portable backup/import ve Cloud Goal queue formatları D5-3'te değiştirilmemiştir.

D5-4 uygulaması için [Goal Cloud Sync](./GOAL_SYSTEM_CLOUD_SYNC.md) belgesine bakın. Evaluation hâlâ hiçbir persistence/Cloud payload'ına yazılmaz.
