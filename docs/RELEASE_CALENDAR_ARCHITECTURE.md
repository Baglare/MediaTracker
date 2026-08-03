# Release Calendar Mimarisi

## Kapsam ve kabul sözleşmesi

Release Calendar, kütüphanedeki uygun kayıtların otomatik ve manuel yayınlarını
tek normalize `ReleaseEvent` akışında birleştirir. Aşağıdaki tablo D3 kabul
kriterlerinin güncel kod ve test kanıtını özetler.

| Kriter | Kod kanıtı | Test kanıtı |
| --- | --- | --- |
| `watching`, `reading`, `planning`, `paused` izlenir | `releaseEligibilityPolicy` | `release-calendar-domain.test.ts` status matrisi |
| `completed` ve `dropped` görünmez | `isReleaseEligible`, `buildReleaseCalendarViewItems` | domain, cache ve manual testleri |
| TV yalnız resolved sezonunu üretir | `resolveTvSeasonIdentity`, `normalizeTvmazeReleaseEvents` | provider sezon izolasyonu testleri |
| Başlıktan sezon/medya çözülmez | resolver yalnız structured alanları okur | title-derived sezon regresyon testi |
| Tek provider eşlemesi | `releaseProviderForMedia` | provider supports/mapping testleri |
| Otomatik olay cache, manuel olay kullanıcı verisidir | `ReleaseEventOrigin`, `MediaItem.releaseCalendar` | codec, backup ve mapping testleri |
| Ajanda ve ay aynı event kümesidir | `filteredItems` iki selector'a girer | month/UI parity testleri |
| `date_only` literal günü korur | `getReleaseEventCalendarDate` | timezone ve month testleri |
| `exact_datetime` yerel güne çevrilir | IANA timezone seçeneği | pozitif/negatif offset ve DST testleri |
| Boş provider sonucu TBA değildir | provider normalizer'ları boş liste döndürür | provider empty-result testi |
| Stabil ID olmayan provider olayı gizlenmez | `buildHiddenProviderEventKey` | manual calendar testleri |
| Provider cache backup/cloud dışındadır | personal cache domain'i, backup allowlist'i | cache ve portable backup testleri |

## Domain modeli

`features/calendar/domain/release-calendar.ts`, tarih kesinliğini
`exact_datetime`, `date_only`, `month_only`, `year_only` ve `tba` discriminated
union'ı olarak doğrular. Provider veya manuel her olay runtime codec'ten geçer.
`date_only` hiçbir noktada UTC `Date` nesnesine çevrilmez. Exact datetime anı
korunur; takvim günü `Intl.DateTimeFormat` ve açık IANA timezone ile hesaplanır.

TV sezon identity resolver'ı yalnız `seasonNumber`, Canonical Identity V2,
`seriesGroupId` ve structured TVMaze external ID kullanır. `title`,
`originalTitle` veya serbest metin regex'i çözüm girdisi değildir.

## Provider adapter akışı

Akış `MediaItem → releaseProviderForMedia → /api/calendar/* → normalize → codec`
şeklindedir.

- `tv → TVMaze`: show ID ve sezon zorunludur; yalnız istenen sezonun önümüzdeki
  90 gündeki episode kayıtları döner.
- `anime → AniList`: canonical AniList anime ID zorunludur; airing schedule en
  fazla üç sayfa ve 90 gün ile sınırlıdır.
- `movie → TMDB`: canonical TMDB movie ID zorunludur; explicit region, browser
  locale region ve provider general date sırası uygulanır.

Route'lar sabit upstream origin kullanır; serbest URL kabul etmez. Numeric ID
doğrulaması upstream çağrıdan önce yapılır. İstekler sekiz saniyede abort edilir,
yalnız allowlist alanları cevaplanır ve `Retry-After` aktarılır. Client adapter
network/5xx/429 için en fazla üç attempt yapar; permanent 4xx retry edilmez.
TMDB token yalnız server route'unda okunur ve response/cache metadata'sına girmez.

## Cache ve owner scope

Otomatik cache anahtarı
`mediaTracker:personal:v1:<owner-storage-key>:releaseCalendarCache` biçimindedir.
Value version `1`, TTL 12 saattir. Personal-data safe-write, read-back ve
quarantine mekanizması kullanılır. Stale veri gösterilirken yenileme yapılır;
başarısız yenileme eski geçerli entry'yi korur.

Global provider concurrency üçtür. Aynı owner/media/provider fingerprint'i için
eşzamanlı refresh çağrıları tek in-flight isteği paylaşır. Entry başına en fazla
256 olay ve cache'te en fazla 2.000 media entry kabul edilir. Owner geçişinde
görünür state owner key ile maskelenir; generation kontrolü stale async sonucu
reddeder. Status veya UI filtresi cache'i silmez; uygunluk görünüm aşamasında
uygulanır. Ay navigasyonu ve filtreler network refresh çağırmaz.

Cache portable backup, Cloud V2 media payload, sync queue, manual event metadata
veya Supabase mapping kapsamına girmez.

## Manuel kalıcılık ve Cloud V2

Kalıcı kullanıcı verisi `MediaItem.releaseCalendar` value version `1` altında
`manualEvents` ve `hiddenProviderEventKeys` olarak tutulur. Manual event stabil
UUID, bağlı `mediaId`, schedule, `createdAt` ve `updatedAt` taşır. CRUD mevcut
`saveMedia` mutation yolunu kullanır; doğrudan localStorage veya Supabase yazmaz.

Cloud mapping bu namespaced alanı mevcut media `metadata` JSONB içinde whitelist
ile roundtrip eder ve diğer metadata alanlarını korur. Authenticated mutation
mevcut Cloud V2 revision/queue/conflict akışına girer; stale revision otomatik
merge edilmez. Portable backup manuel olayları ve hidden key'leri taşır; additive
import aynı içerikte idempotenttir ve record-ID remap'i embedded `mediaId` alanına
uygular. Provider cache hiçbir zaman bu akışlara katılmaz.

## UI ve erişilebilirlik

Ajanda varsayılandır; aylık grid aynı filtrelenmiş event kümesini kullanır. Grid
Pazartesi başlar, bugün–90 gün aralığında gezinir, hücre başına üç olay gösterir
ve fazlasını `+N` ile özetler. TBA olayları grid dışında kalır.

Görünüm ve tür seçimleri `aria-pressed`, günler `aria-selected` ve
`aria-current` taşır. Ay/gün navigasyonu klavyeyi destekler. Manuel event modalı
ilk kontrole odaklanır, Tab odağını içeride tutar, Escape ile kapanır ve kapatınca
odağı tetikleyiciye döndürür. Form hataları ilgili alanlara `aria-describedby`
ve `aria-invalid` ile bağlanır. Motion sınıfları reduced-motion tercihini korur.

## Bilinen sınırlar

- Otomatik provider ufku 90 gündür; geçmiş yayın arşivi değildir.
- TMDB release takvimi token olmadan kullanılamaz.
- Browser locale yalnız geçerli region alt etiketi taşıyorsa bölge seçimine girer.
- Manual event conflict'i bağımsız field merge değildir; media kaydının mevcut
  Cloud V2 conflict akışını kullanır.
- Push/e-posta bildirimi, ICS/Google Calendar ve streaming platform availability
  bu kapsamda yoktur.

Manuel kabul akışı için `RELEASE_CALENDAR_MANUAL_TESTS.md`, kısa portfolyo anlatımı
için `RELEASE_CALENDAR_DEMO_SCRIPT.md` kullanılır.
