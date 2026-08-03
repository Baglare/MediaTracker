# Release Calendar Domain

Bu belge D3-1'de belirlenen domain invariant'larını ve tamamlanmış D3 uygulamasının sınırlarını açıklar. Provider/cache/UI kabulünün canonical özeti [RELEASE_CALENDAR_ARCHITECTURE.md](./RELEASE_CALENDAR_ARCHITECTURE.md), manuel doğrulama [RELEASE_CALENDAR_MANUAL_TESTS.md](./RELEASE_CALENDAR_MANUAL_TESTS.md) içindedir.

## Güncel uygulama özeti

- Ajanda ve Pazartesi başlangıçlı aylık görünüm aynı normalize `ReleaseEvent`
  read-model'ini kullanır.
- Tek provider politikası `tv → TVMaze`, `anime → AniList`, `movie → TMDB`
  eşlemesidir; başlık veya fuzzy text üzerinden provider/sezon çözülmez.
- `MediaItem` içinde `seasonNumber`, `seriesGroupId`, Canonical Identity V2 ve
  provider `externalSource/externalId` alanları bulunuyor. Bunlar güvenli sezon
  çözümü için kullanılır.
- `lib/series-group.ts` içindeki genel legacy inference, TVMaze sezon başlığını
  regex ile okuyabiliyor. Release Calendar resolver'ı bu fonksiyonu çağırmaz;
  title ve `originalTitle` sezon veya medya eşleştirmesinde kullanılmaz.
- Otomatik provider olayları owner-scoped, 12 saat TTL'li ve
  stale-while-revalidate davranan yeniden üretilebilir cache'tir.
- Manuel olaylar ile provider olaylarını gizleme kararları
  `MediaItem.releaseCalendar` altında kalıcı kullanıcı verisidir. Portable backup
  bunları taşır; otomatik provider cache'ini taşımaz.
- Sağ panel ve dar Dashboard'daki “Yakında” özeti aynı D3 hook/read-model'ini
  kullanır; ikinci provider fetch veya cache sistemi kurmaz.

## Domain kararları

- Takip edilen status değerleri `watching`, `reading`, `planning` ve `paused`;
  `completed` ile `dropped` hiçbir release event üretmez.
- `MediaItem.id` local kayıt ilişkisidir. Event `mediaRecordId` ile bu kayda
  bağlanır; varsa Canonical Identity V2 ayrıca `mediaIdentityKey` olarak taşınır.
- TV kayıtlarında event ancak kayıt için yapılandırılmış biçimde çözülen
  `TvSeasonIdentity` ile birebir eşleşirse seçilir. Completed bir sezon gelecekteki
  sezonları temsil etmez.
- Sezon çözümü yalnız explicit `seasonNumber`, valid provider canonical identity,
  `seriesGroupId` veya yapılandırılmış TVMaze season external ID kullanır.
- Provider kaynaklı olaylar `reproducible_cache`, manuel olaylar
  `persistent_user_data` olarak açıkça ayrılır.

## Tarih ve selector invariant'ları

- Tarih kesinliği discriminated union'dır:
  `exact_datetime`, `date_only`, `month_only`, `year_only`, `tba`.
- `date_only` bir `Date` veya UTC instant'a çevrilmez. Gün aralığı hesabı saf
  sivil-takvim gün numarası ile yapılır; timezone kaynaklı gün kayması yaratmaz.
- Agenda aralıkları çakışmaz: bugün, 1-7, 8-30 ve 31-90 gün. Geçmiş ve 90 gün
  sonrası agenda dışında kalır.
- Gün kesinliği olmayan `month_only`, `year_only` ve `tba` olayları agenda'nın
  TBA bölümünde kalır. Aylık selector `month_only` olayını ilgili ayda gösterebilir.
- Sıralama locale bağımsız, deterministik ve input sırasından bağımsızdır.
- Agenda ile ilerideki aylık görünüm aynı `ReleaseEvent` modeli, tarih çıkarımı
  ve deterministik sıralama fonksiyonlarını kullanır.
- Runtime codec bilinmeyen event version/type/precision, malformed tarih,
  canonical key, origin veya sezon kimliğini geçersiz sayar; issue üretmeden
  sessiz kabul etmez.

## Provider veri gereksinimleri

- TVMaze: stable show/season/episode ID, season number, episode number, airdate,
  varsa timezone içeren airtime ve iptal/erteleme durumu.
- AniList: stable media ID, episode number ve `airingAt`; her AniList kaydı kendi
  canonical entity'si olarak ele alınmalı, başlıkla sezon bridge yapılmamalı.
- TMDB: film release region/type bilgisi.
- Open Library: work/edition ayrımı korunarak güvenilir publication precision.
- OMDb: IMDb ID ve ham tarih metninin güvenilir precision'a dönüştürülebildiğine
  dair açık provider kuralı.
- Provider normalize çıktısı her zaman `decodeReleaseEvent` doğrulamasından
  geçmeli; raw provider payload persisted event'e kopyalanmamalı.

## Bilinen sınırlar

- Otomatik provider ufku 90 gündür; geçmiş yayın arşivi değildir.
- Exact datetime kullanıcının IANA timezone'undaki güne çevrilir; date-only
  literal takvim günü olarak kalır.
- TMDB takvimi server-side token olmadan çalışmaz. AniList ve TVMaze public API
  kullanır; provider hatasında geçerli stale cache korunabilir.
- Provider cache Cloud/backup kapsamı dışındadır. Manuel/gizli olay verisi medya
  metadata'sı olarak mevcut Cloud V2 revision/conflict akışını kullanabilir.
- Başlık tabanlı legacy series inference'ın takvim dışında kullanılmaya devam
  etmesi mevcut davranıştır; takvim domain'ine sızmasını engelleyen regresyon
  testi vardır.
- Push/e-posta, ICS/Google Calendar, streaming availability ve AI tarih tahmini
  D3 kabul kapsamı değildir; opsiyonel backlog'dur.

## Manuel smoke

1. Ajanda ve ay görünümünün aynı filtrelenmiş event kümesini kullandığını doğrula.
2. `completed` ve `dropped` kayıtların release selector sonucunda bulunmadığını
   kontrol et.
3. Aynı TVMaze show'un iki sezon kaydına farklı structured season identity verip
   olayların sezonlar arasında sızmadığını doğrula.
4. Date-only olayı farklı sistem timezone'larında aynı takvim gününde göster.
5. Manuel event/gizleme kararının backup'a girdiğini, otomatik provider cache'inin
   girmediğini doğrula.

Tam akış [RELEASE_CALENDAR_MANUAL_TESTS.md](./RELEASE_CALENDAR_MANUAL_TESTS.md) içindedir.

## Otomatik provider ve cache uygulaması

- Provider eşlemesi tekildir: `tv → TVMaze`, `anime → AniList`,
  `movie → TMDB`. Cross-provider veya başlık tabanlı eşleştirme yapılmaz.
- Server route'ları yalnız güvenli release alanlarını döndürür:
  - TVMaze: show/sezon ile filtrelenmiş episode ID, sezon, bölüm ve yayın zamanı.
  - AniList: stable schedule ID, episode ve önümüzdeki 90 gündeki `airingAt`.
  - TMDB: bölge, yayın zamanı/türü ve provider genel yayın tarihi.
- TMDB bölgesi explicit tercih mevcutsa onu, ardından bölge alt etiketi taşıyan
  browser locale değerini kullanır. Hiçbiri provider sonucunda yoksa yalnız genel
  yayın tarihine döner; görünmez US/TR varsayımı yoktur.
- Exact datetime provider anı olarak korunur ve agenda gruplaması browser
  timezone'una göre yapılır. Date-only literal sivil tarih olarak kalır.
- Provider boş sonuç döndürdüğünde TBA üretilmez. TVMaze'de tarihi olmayan episode
  kaydının gelecekte olduğu kanıtlanamadığı için otomatik TBA'ya çevrilmez.
- Otomatik cache key'i
  `mediaTracker:personal:v1:<owner-storage-key>:releaseCalendarCache`,
  personal-data envelope schema v1 ve release cache value version 1 kullanır.
- TTL 12 saattir. Stale veri gösterilirken arka planda yenileme yapılır; başarısız
  provider eski geçerli cache'i bozmaz. Corrupt current raw payload quarantine
  edildikten sonra yeniden üretilebilir cache slotu güvenli biçimde kurulabilir.
- Aynı anda en fazla üç provider isteği çalışır. Network/5xx ve 429 sınırlı olarak
  en fazla üç attempt ile denenir; `Retry-After` dikkate alınır. Permanent 4xx
  retry edilmez.
- Release cache Cloud V2 queue'ya ve portable backup/export'a dahil değildir.
  Owner değişiminde state owner key ile maskelenir ve eski async generation
  sonucu yeni owner görünümüne uygulanmaz.
