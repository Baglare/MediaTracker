# Release Calendar Domain (D3-1)

## Mevcut audit özeti

- `features/calendar/components/calendar-feature.tsx` bugün progress log, planlanan
  kayıt ve aktif kayıt özetini gösteriyor. Gerçek yayın akışı için yalnız bir
  placeholder var; bu aşamada UI davranışı değiştirilmedi.
- `features/calendar/domain/selectors.ts` yalnız mevcut activity read-model'ini
  üretir. Yeni release selector'ları bu sözleşmeden bağımsız ve saf tutuldu.
- `MediaItem` içinde `seasonNumber`, `seriesGroupId`, Canonical Identity V2 ve
  provider `externalSource/externalId` alanları bulunuyor. Bunlar güvenli sezon
  çözümü için yeterli; hard blocker yok.
- `lib/series-group.ts` içindeki genel legacy inference, TVMaze sezon başlığını
  regex ile okuyabiliyor. Release Calendar resolver'ı bu fonksiyonu çağırmaz;
  title ve `originalTitle` sezon veya medya eşleştirmesinde kullanılmaz.
- TVMaze details route'u episode listesini sunucuda çekse de istemciye yalnız
  aggregate alanlar (`seasonBreakdown`, `nextAirDate`) döndürüyor. AniList yalnız
  `nextAiringEpisode`, TMDB mevcut detay yolu film, Open Library/OMDb ise takvim
  için yetersiz veya kısmi tarih verisi sağlıyor.
- Owner-scoped local storage bugün media/progress envelope'ları, codec,
  quarantine ve safe-write sağlar. Portable backup/import aynı core domain'leri
  taşır. Release event için persistence domain'i henüz yoktur.
- Supabase mapping ve durable Cloud V2 queue media/progress sözleşmeleridir.
  Release event kolonu, RPC'si veya queue entity'si yoktur ve D3-1 bunları
  değiştirmez.

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
- D3-1 provider implementasyonu, API çağrısı, cache persistence, manuel CRUD ve
  yeni takvim UI'ı içermez.

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

## D3-2 provider veri gereksinimleri

- TVMaze: stable show/season/episode ID, season number, episode number, airdate,
  varsa timezone içeren airtime ve iptal/erteleme durumu.
- AniList: stable media ID, episode number ve `airingAt`; her AniList kaydı kendi
  canonical entity'si olarak ele alınmalı, başlıkla sezon bridge yapılmamalı.
- TMDB: movie release region/type bilgisi; TV desteği eklenecekse show ID ile
  explicit season number birlikte taşınmalı.
- Open Library: work/edition ayrımı korunarak güvenilir publication precision.
- OMDb: IMDb ID ve ham tarih metninin güvenilir precision'a dönüştürülebildiğine
  dair açık provider kuralı.
- Provider normalize çıktısı her zaman `decodeReleaseEvent` doğrulamasından
  geçmeli; raw provider payload persisted event'e kopyalanmamalı.

## Açık riskler ve sonraki sınır

- Exact datetime değerinin kullanıcı timezone'unda hangi takvim gününde
  gösterileceği D3-2'de açık ürün politikası gerektirir. D3-1 deterministik olarak
  provider ISO değerindeki takvim bölümünü kullanır.
- Mevcut provider route'ları tam release stream sağlamaz. D3-2, cache TTL,
  rate-limit, retry ve stale veri politikasını tasarlamalıdır.
- Otomatik cache ile kalıcı manuel event aynı storage envelope'a konmamalıdır.
  Manuel event persistence, owner scope, safe-write, quarantine ve portable
  backup/import sözleşmeleri D3-2 veya sonraki kalıcı veri aşamasında ayrıca
  eklenmelidir.
- Release event'ler Cloud V2 media/progress queue'ya eklenmemeli; cloud sahipliği
  için ayrı karar verilene kadar local-only kalmalıdır.
- Başlık tabanlı legacy series inference'ın takvim dışında kullanılmaya devam
  etmesi mevcut davranıştır; takvim domain'ine sızmasını engelleyen regresyon
  testi vardır.

## Manuel smoke

1. Mevcut Takvim ekranında activity, planlanan ve aktif kayıt bölümlerinin aynı
   kaldığını doğrula.
2. `completed` ve `dropped` kayıtların release selector sonucunda bulunmadığını
   kontrol et.
3. Aynı TVMaze show'un iki sezon kaydına farklı structured season identity verip
   olayların sezonlar arasında sızmadığını doğrula.
4. Date-only olayı farklı sistem timezone'larında aynı takvim gününde göster.
5. Bu aşamada network isteği, yeni localStorage key'i veya Cloud V2 queue işlemi
   oluşmadığını doğrula.

## D3-2 otomatik provider ve cache uygulaması

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
