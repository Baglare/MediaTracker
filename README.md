# MediaTracker

MediaTracker; film, dizi, anime, manga, manhwa, manhua, novel ve kitap takibi için geliştirilmiş local-first bir medya takip uygulamasıdır. Proje Next.js 16 App Router, React 19, TypeScript ve Tailwind CSS 4 üzerine kuruludur.

Uygulamanın ana veri kaynağı tarayıcıdaki owner-scoped yerel depolamadır. Supabase yapılandırılırsa hesap, kontrollü Cloud aktarımı ve kuyruk tabanlı senkronizasyon devreye girer; yapılandırılmazsa uygulama yerel modda çalışmaya devam eder. Proje henüz public frontend olarak yayınlanmamıştır.

## Mevcut Durum

- App Router sayfaları ile sekmeli ana uygulamayı birleştiren Next.js uygulaması.
- Varsayılan kullanım yerel moddur; medya ve ilerleme verisi owner-scoped biçimde tarayıcıda saklanır.
- Supabase opsiyoneldir: auth, manuel Cloud upload/download/merge, owner-scoped sync queue, revision/idempotency ve conflict akışları vardır.
- AI Danışman opsiyoneldir: varsayılan mock provider ile çalışır, API anahtarları verilirse gerçek provider kullanılabilir.
- Python tabanlı ML servisi opsiyoneldir: embedding skoru için kullanılabilir; yoksa yerel mock embedding fallback'i çalışır.

### Geliştirme aşamaları

| Aşama | Durum |
| --- | --- |
| D1 — Veri bütünlüğü ve portable backup | Tamamlandı |
| D2 — Cloud Sync geliştirme ve testleri | Tamamlandı |
| D2B.0 / D2B.1 production veritabanı | Uygulandı |
| D2C.1 production cutover | D8 release aşamasına bırakıldı |
| D3 — Release Calendar | Tamamlandı |
| D4 — Product Polish / Performance / UX Reliability | Tamamlandı |

Ayrıntılı sıra ve sonraki aşamalar: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Teknik Kazanımlar

- Offline-first veri mimarisi ve `localStorage` tabanlı persistence.
- Versioned JSON import/export, kontrollü additive import, checksum, rollback/undo ve portable backup akışı.
- Supabase auth, manuel Cloud aktarım, owner-scoped sync queue, V2 revision/idempotency/tombstone ve conflict akışı.
- Local-first kütüphaneden ayrılmış cloud sosyal profil, kullanıcı arama ve takip/engel temeli.
- TMDB, OMDb, TVmaze, AniList ve Open Library entegrasyonları için normalize edilmiş medya modeli.
- AI destekli öneri pipeline'ı, embedding tabanlı benzerlik skoru, provider fallback sistemi ve feedback-aware recommendation flow.
- Ana sayfada medya domain durumu, kalıcı kullanıcı tercihleri ve sekme render orkestrasyonu ayrıştırılmış modüler yapı.
- React/Next.js state yönetimi, TypeScript tip güvenliği ve responsive dashboard tasarımı.

## Özellikler

- Dashboard, kütüphane, keşfet, takvim, ilerleme, izleme listesi, favoriler, puanlar, notlar, istatistikler, profil, AI Danışman, aktivite ve ayarlar sekmeleri.
- Medya türleri:
  - Film ve dizi
  - Anime
  - Manga, manhwa, manhua
  - Kitap
  - Light novel, web novel, visual novel
- İlerleme takibi:
  - `+1`, tamamla ve manuel düzenleme akışları
  - Aktivite logları
  - Devam edilen, tamamlanan, duraklatılan, bırakılan ve planlanan içerikler
- Kişisel alanlar:
  - 0-10 kullanıcı puanı
  - Favori işareti
  - Etiketler
  - Kişisel notlar
- Release Calendar:
  - TV sezonları için TVMaze, anime için AniList ve filmler için TMDB kaynaklı 90 günlük yayın ajandası
  - Aynı normalize olay kümesini kullanan ajanda ve Pazartesi başlangıçlı aylık görünüm
  - Medyaya bağlı kalıcı manuel yayınlar ile stabil provider olaylarını gizleme/geri getirme
  - Aynı D3 veri kümesinden beslenen, sağ panelde ve dar Dashboard görünümünde en fazla üç olayı gösteren “Yakında” özeti
  - Owner-scoped, 12 saat TTL ve stale-while-revalidate otomatik cache; provider cache portable backup veya cloud payload değildir
  - Mimari ve doğrulama ayrıntıları: [`docs/RELEASE_CALENDAR_ARCHITECTURE.md`](docs/RELEASE_CALENDAR_ARCHITECTURE.md)
- Kütüphane organizasyonu:
  - Dünya filtresi: Doğu, Kadraj, Arşiv
  - Durum, tür, sıralama ve grid/list görünümü
  - TVmaze sezon grupları
  - AniList relation tabanlı güvenli seri gruplama
  - Manuel grup yönetimi
- Keşfet:
  - Global arama paneli
  - Film için TMDB birincil, OMDb fallback
  - Dizi için TVmaze
  - Anime/manga/manhwa/manhua/novel için AniList
  - Kitap için Open Library
- Veri yönetimi:
  - Versioned portable JSON yedeği ve SHA-256 bütünlük kontrolü
  - Salt-okunur dosya inceleme ve kullanıcı onaylı additive import
  - Journal, read-back, rollback ve sınırlı undo
  - Duplicate inceleme/birleştirme ve yerel veri bütünlüğü taraması
  - Basit JSON içe/dışa aktarma ve yerel örnek verileri yönetme
  - Format ayrıntıları: [`docs/PORTABLE_BACKUP_FORMAT.md`](docs/PORTABLE_BACKUP_FORMAT.md)
- Cloud:
  - Supabase email/password auth
  - Yerel -> Cloud aktarım
  - Cloud -> Yerel indirme
  - Cloud verisini yerel veriyle birleştirme
  - Mutasyonlar için owner-scoped sync queue, online flush ve reaktif `queue → in-flight → ready` durum özeti
  - Cloud Media V2 için revision, operation idempotency, tombstone ve kontrollü conflict çözümü
  - Uyuşmayan veya doğrulanamayan rollout sözleşmesinde local kullanımı koruyup Cloud mutation'ı fail-closed durdurma
  - Özel temalar için güvenli JSON import/export ve kullanıcı onaylı, revision kontrollü opsiyonel cloud senkronizasyonu
  - Tema aktarım/senkronizasyon ayrıntıları: [`docs/THEME_IMPORT_EXPORT_AND_SYNC.md`](docs/THEME_IMPORT_EXPORT_AND_SYNC.md)
- Kişiselleştirme:
  - Merkezi preset/custom tema token registry'si; cihaz teması, dünya vurgusu, grafik paleti ve profil sunumunu ayrı modellerde tutma
  - Birbirinden ayrışan Porselen, Tozpembe, Lavanta, Kutup ve Sepya açık tema yüzeyleri
  - Tek SVG mask varlığından üretilen açık/koyu temaya uyumlu logo
  - Dashboard/sağ panel düzeni, yoğunluk, efekt ve başlangıç görünümü tercihleri
  - Erişilebilir collapsible ayarlar ve ayırt edilebilir monokrom grafik paleti
  - Mimari ayrıntılar: [`docs/PERSONALIZATION_ARCHITECTURE.md`](docs/PERSONALIZATION_ARCHITECTURE.md)
- Sosyal profil:
  - `/u/[username]` public/protected/personal profil route’u ve `/people` kullanıcı araması
  - Asimetrik takip/istek, karşılıklı Yin/Yang durumu ve engelleme RPC’leri
  - Kontrollü profil grid’i, avatar/banner ve yalnızca açıkça seçilen vitrin/istatistik/progression/not snapshot’ları
  - Kurulum, görünürlük ve manuel test ayrıntıları: [`docs/SOCIAL_PROFILE_FOUNDATION.md`](docs/SOCIAL_PROFILE_FOUNDATION.md)
  - `/feed` accepted takiplerden kronolojik aktivite, tek seviye yorum, spoiler ve sınırlı tepki
  - `/recommendations` yapılandırılmış medya önerisi; cevap/ilerleme yaşam döngüsü ve cihaz bazlı local library link’i
  - `/notifications` tercihli cloud bildirim merkezi, unread badge ve kontrollü polling
  - Faz 2 veri/RPC/outbox ayrıntıları: [`docs/SOCIAL_INTERACTIONS_AND_RECOMMENDATIONS.md`](docs/SOCIAL_INTERACTIONS_AND_RECOMMENDATIONS.md)
- AI Danışman:
  - Kütüphane profiline göre öneri
  - Puanlara, favorilere, ilerlemeye ve notlara göre öneri
  - Dünya kapsamı: karışık, Doğu, Kadraj, Arşiv veya her dünyadan bir öneri
  - Kaynak API'leriyle aday doğrulama
  - Provider fallback akışı
  - Provider, embedding, fallback, aday, kaynak, feedback ve persistent cache durumunu secret göstermeden özetleyen teknik durum alanı
  - Öneri gerekçeleri, kütüphane/devam/keşif bağlamı ve feedback etkisi etiketleri
  - AI oturum geçmişi; sonraki isteğin sıralamasına katılan ilgilenmiyorum geri bildirimi
  - Tekrarlanabilir demo akışları için [`docs/AI_RECOMMENDATION_DEMO.md`](docs/AI_RECOMMENDATION_DEMO.md)

## Teknoloji

- Next.js `16.2.4`
- React `19.2.4`
- TypeScript
- Tailwind CSS 4
- Supabase SSR / Supabase JS
- lucide-react
- FastAPI tabanlı opsiyonel ML servisi
- sentence-transformers tabanlı opsiyonel embedding modeli

## Klasör Yapısı

```text
media-tracker/
  app/                    Next.js App Router sayfaları ve API route'ları
  app/api/                TMDB, OMDb, TVmaze, AniList, Open Library ve AI endpoint'leri
  components/             UI bileşenleri
  hooks/                  Client hook'ları
  lib/                    Domain tipleri, storage, sync, AI, Supabase ve API yardımcıları
  lib/ai/                 AI Danışman pipeline'ı, provider'lar ve scoring katmanı
  lib/social/             Sosyal profil domain, doğrulama, görünürlük ve server loader katmanı
  lib/supabase/           Supabase client, repository, mapping ve cloud actions
  ml-service/             Opsiyonel FastAPI embedding servisi
  public/                 Placeholder ve statik görseller
  supabase/schema.sql     Supabase tablo, index, RLS ve cache şeması
  docs/                   Proje içi plan/dokümantasyon
  design_references/      Tasarım referansları; runtime kodu değildir
```

## Hızlı Başlangıç

1. Proje klasörüne gir:

```bash
cd "C:\Takip Programı\media-tracker"
```

2. Bağımlılıkları kur:

```bash
npm install
```

3. Ortam dosyasını hazırla:

```bash
copy .env.example .env.local
```

4. İlk deneme için `.env.local` dosyasını boş bırakabilirsin. Bu durumda uygulama yerel modda açılır.

5. Geliştirme sunucusunu başlat:

```bash
npm run dev
```

6. Tarayıcıda aç:

```text
http://localhost:3000
```

## ML Servisi ile Başlatma

Embedding tabanlı benzerlik skorunu gerçek modelle çalıştırmak istersen Python servisini de açman gerekir.

1. Python sanal ortamını kur:

```bash
cd "C:\Takip Programı\media-tracker\ml-service"
py -3.12 -m venv .venv
.\.venv\Scripts\activate
python -m pip install -r requirements.txt
```

2. Kök klasöre dön:

```bash
cd "C:\Takip Programı\media-tracker"
```

3. Hazır Windows başlatıcısını çalıştır:

```bash
start-dev.bat
```

Bu betik iki terminal açar:

- ML Service: `http://127.0.0.1:8001`
- Next.js Web: `npm run dev`

ML servis sağlık kontrolü:

```text
http://127.0.0.1:8001/health
```

## Ortam Değişkenleri

Temel kullanım için hiçbir değişken zorunlu değildir. Aşağıdaki değişkenler ilgili özellikleri açar veya güçlendirir.

| Değişken | Zorunlu mu? | Kullanım |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Hayır | Supabase auth, cloud aktarım ve persistent embedding cache bağlantısı için |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Hayır | Supabase client bağlantısı için |
| `NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE` | Hayır | Cloud şema fazı: local varsayılan `legacy`; D2B.1 ortamı için kontrollü `d2b1` |
| `NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED` | Hayır | Cloud Media V2 adapter'ını açıkça etkinleştirir; varsayılan `false` |
| `NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE` | Hayır | Bakım sırasında Cloud mutation dispatch'ini durdurur |
| `NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH` | Hayır | Açık istemcilerde deployment değişimini ve kontrollü reload gereksinimini tanımlar |
| `NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION` | Hayır | Minimum uyumlu istemci sözleşmesini tanımlar |
| `SUPABASE_SERVICE_ROLE_KEY` | Hayır | Yalnızca server-side persistent embedding cache erişimi için |
| `TMDB_READ_ACCESS_TOKEN` | Hayır | Film araması ve TMDB Release Calendar için server-side token |
| `OMDB_API_KEY` | Hayır | Film aramasında OMDb fallback ve detay kaynağı |
| `AI_PROVIDER` | Hayır | `mock`, `auto`, `openai`, `gemini`, `openrouter`, `groq` |
| `OPENAI_API_KEY` | Hayır | OpenAI uyumlu provider |
| `OPENAI_MODEL` | Hayır | Varsayılan: `gpt-5.4-mini` |
| `GEMINI_API_KEY` | Hayır | Gemini provider |
| `GEMINI_MODEL` | Hayır | Varsayılan: `gemini-2.0-flash` |
| `OPENROUTER_API_KEY` | Hayır | OpenRouter provider |
| `OPENROUTER_MODEL` | Hayır | Varsayılan: `openrouter/free` |
| `GROQ_API_KEY` | Hayır | Groq provider |
| `GROQ_MODEL` | Hayır | Varsayılan: `llama-3.1-8b-instant` |
| `NEXT_PUBLIC_APP_URL` | Hayır | OpenRouter header bilgisi için |
| `MEDIA_TRACKER_ML_SERVICE_URL` | Hayır | Python embedding servisi URL'si. Örnek: `http://127.0.0.1:8001` |
| `MEDIA_TRACKER_EMBEDDING_MODEL` | Hayır | Varsayılan: `sentence-transformers/all-MiniLM-L6-v2` |
| `MEDIA_TRACKER_EMBEDDING_CACHE` | Hayır | `off` verilirse embedding cache kapanır |
| `MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE` | Hayır | `off` verilirse Supabase tabanlı embedding cache kapanır |

Güvenlik notu: `SUPABASE_SERVICE_ROLE_KEY` yalnızca server-side kullanılmalı; client component'e, API yanıtına veya loglara eklenmemeli ve `NEXT_PUBLIC_` prefix'i almamalıdır. Persistent embedding cache için opsiyoneldir. Anahtar yoksa persistent cache hata vermeden devre dışı kalır; bellek içi cache, mock fallback ve ana offline-first uygulama çalışmaya devam eder. `.env.local` ve gerçek anahtarlar Git'e gönderilmemelidir.

## Supabase Kurulumu

Cloud özelliklerini kullanmak istiyorsan:

1. Supabase projesi oluştur.
2. Yeni yerel/disposable kurulumda repository migration zincirini kendi izole ortamında doğrula. Production veritabanında D2B.0 ve D2B.1 uygulanmıştır; D2C.1 enforcement/cutover yapılmamıştır ve D8'e bırakılmıştır. Production işlemleri README kapsamı değildir; operasyonel sıra için [`docs/PRODUCTION_CLOUD_V2_CUTOVER.md`](docs/PRODUCTION_CLOUD_V2_CUTOVER.md) kullanılır.
3. Supabase Project Settings -> API bölümünden URL ve anon key değerlerini al.
4. `.env.local` içine şunları ekle:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# Opsiyonel, yalnızca server-side persistent embedding cache için:
SUPABASE_SERVICE_ROLE_KEY=...
```

5. Uygulamayı yeniden başlat.
6. Ayarlar sekmesinden giriş/kayıt ve cloud veri durumunu kontrol et.

Cloud davranışı:

- Supabase yoksa uygulama yerel modda kalır.
- Supabase varsa auth paneli aktif olur.
- Yerel veri yine arayüzün ana kaynağıdır.
- Cloud upload, download ve merge işlemleri kullanıcı onayıyla yapılır.
- Giriş yapılmış ve online durumdaysan yerel mutasyonlar sync queue üzerinden cloud'a gönderilir; ağ veya oturum yoksa bekleyen işlemler kuyrukta kalır.
- Sync kartı pending, canlı in-flight, retryable/blocked, adapter/rollout ve son sonuç durumlarını aynı reaktif snapshot'tan gösterir.
- Rollout sözleşmesi bakım, sürüm veya bilinmeyen şema nedeniyle hazır değilse Cloud mutation gönderimi durur; yerel veri ve yerel kullanım etkilenmez.
- Cloud'dan otomatik real-time pull yoktur; indirme ve birleştirme manuel aksiyonlarla yapılır.

Local D2B.1 geliştirme örneği `.env.example` içindedir. D2C.1'i uygulanmış gibi gösterecek environment değeri veya production komutu bu README'de verilmez.

## Veri Saklama

Tarayıcıda kullanılan önemli localStorage anahtarları:

- `media-tracker-list`: medya listesi
- `media-tracker-logs`: ilerleme logları
- `mediaTracker:uiPreferences`: filtre ve görünüm tercihleri
- `mediaTracker:profilePreferences`: profil tercihleri
- `media-tracker-right-rail-preferences`: sağ panel tercihleri
- `media-tracker-sync-queue`: sync kuyruğu
- `media-tracker-ai-settings`: AI Danışman ayarları
- `media-tracker-ai-sessions`: AI oturum geçmişi
- `media-tracker-ai-active-session`: aktif AI oturumu
- `media-tracker-ai-recommendation-feedback`: AI öneri geri bildirimleri

## Kullanılabilir Komutlar

```bash
npm run dev
```

Geliştirme sunucusunu başlatır.

```bash
npm run build
```

Production build alır.

```bash
npm run start
```

Build sonrası production sunucusunu başlatır.

```bash
npm run lint
```

ESLint kontrollerini çalıştırır.

```bash
npm run test
npm run test:run
```

Vitest'i izleme modunda veya tek seferlik test paketi olarak çalıştırır.

## API Route'ları

- `GET /api/tmdb/search?q=...`
- `GET /api/tmdb/details?id=...`
- `GET /api/omdb/search?q=...`
- `GET /api/omdb/details?id=...`
- `GET /api/tvmaze/search?q=...`
- `GET /api/tvmaze/details?id=...`
- `GET /api/anilist/search?q=...&category=...`
- `GET /api/anilist/details?id=...&type=...`
- `GET /api/openlibrary/search?q=...`
- `GET /api/calendar/tvmaze?showId=...&season=...`
- `GET /api/calendar/anilist?mediaId=...`
- `GET /api/calendar/tmdb?movieId=...`
- `POST /api/ai/recommend`

Dış API anahtarları server-side route'larda kullanılır; tarayıcıya token gönderilmez.
Release Calendar route'ları yalnız yapılandırılmış provider kimliklerini kabul eder;
başlık eşleştirmesi yapmaz ve sonuçları önümüzdeki 90 günle sınırlar. TMDB release
takvimi için `TMDB_READ_ACCESS_TOKEN` gerekir. AniList ve TVMaze public API'leri
anahtarsızdır; provider erişilemezse geçerli stale cache gösterilmeye devam eder.

Release Calendar yerel-first çalışır. Otomatik provider olayları yeniden
üretilebilir cache'tir; manuel olaylar ve gizleme kararları ilgili `MediaItem`
metadata'sında kalıcı kullanıcı verisi olarak saklanır. Push bildirimi, harici
takvim export'u ve geçmiş/future horizon dışı arşiv bu sürümün kapsamında değildir.

## Opsiyonel ML Servisi

`ml-service/` FastAPI tabanlı küçük bir embedding servisidir.

Endpoint'ler:

- `GET /health`: servis durumunu döner.
- `POST /embed`: verilen input listesinden embedding vector üretir.

Next.js tarafı `MEDIA_TRACKER_ML_SERVICE_URL` doluysa bu servisi kullanır. Servis kapalıysa veya hata verirse uygulama local mock embedding fallback'i ile devam eder.

## Geliştirme Notları

- Next.js 16 ve React 19 kullanıldığı için render-phase state update kurallarına dikkat edilmelidir.
- `localStorage` hidrasyonu mount effect'lerinde yapılır.
- Mutasyon akışlarında state güncellemesi ve sync queue yan etkileri ayrı tutulmalıdır.
- `app/page.tsx` composition root olarak kalır; medya mutasyonları hook'ta, kalıcı tercihler ayrı hook'ta ve ortak sekme blokları orchestration component'inde tutulur.
- Yeni medya kaynağı eklenirse normalizer, global search, AI candidate source union'ları ve UI label'ları birlikte güncellenmelidir.
- AniList otomatik gruplama title benzerliğiyle yapılmaz; güvenli relation verisi kullanılır.
- Bilinmeyen total progress için sahte `1` fallback'i yerine kaynağın semantiğine uygun değer korunmalıdır.

## Mimari Belgeler

- [Frontend mimarisi](docs/FRONTEND_ARCHITECTURE.md)
- [Yerel veri formatı ve recovery](docs/LOCAL_DATA_FORMAT_AND_RECOVERY.md)
- [Yerel veri bütünlüğü scanner/repair](docs/LOCAL_DATA_INTEGRITY_SCANNER.md)
- [Portable Backup V2](docs/PORTABLE_BACKUP_FORMAT.md)
- [Cloud Media V2 planı](docs/CLOUD_MEDIA_SCHEMA_V2_PLAN.md)
- [Cloud migration/cutover runbook](docs/CLOUD_MEDIA_SCHEMA_V2_MIGRATION_RUNBOOK.md)
- [Release Calendar mimarisi](docs/RELEASE_CALENDAR_ARCHITECTURE.md)
- [Kişiselleştirme mimarisi](docs/PERSONALIZATION_ARCHITECTURE.md)
- [D4 genel bakış ve kabul](docs/D4_OVERVIEW.md)
- [Roadmap](docs/ROADMAP.md)

## Bilinen Sınırlamalar

- Public frontend deployment henüz yapılmamıştır; repository bir production URL iddia etmez.
- D2C.1 owner-scoped fiziksel primary key enforcement ve production cutover D8 aşamasındadır.
- Cloud'dan otomatik realtime pull yoktur; download/merge kullanıcı aksiyonudur.
- Release Calendar otomatik provider ufku 90 gündür. Push/e-posta, ICS/Google Calendar ve streaming availability zorunlu kapsamda değildir.
- TMDB takvim/film verisi token olmadan kullanılamaz; provider erişilemezse geçerli stale Release Calendar cache'i korunabilir.
- Contract/unit testleri canlı Supabase, RLS veya production deployment kanıtı değildir.

## Roadmap Özeti

D1–D4 tamamlandı. Sıradaki ürün aşamaları D5 hedef sistemi, D6 AI Recommendation V2, D7 ML/değerlendirme ve D8 release/deployment + D2C.1 production cutover'dır. Opsiyonel fikirler D8 kabulünün zorunlu maddesi değildir; güncel ayrıntı [`docs/ROADMAP.md`](docs/ROADMAP.md) içindedir.

## Sorun Giderme

### Uygulama yerel modda açılıyor

Bu normaldir. Supabase değişkenleri boşsa uygulama sadece tarayıcı verisini kullanır.

### Film araması sonuç vermiyor

`TMDB_READ_ACCESS_TOKEN` yoksa TMDB devre dışı kalır ve OMDb fallback denenir. OMDb için `OMDB_API_KEY` de yoksa film araması sınırlı kalır.

### AI Danışman gerçek provider kullanmıyor

`AI_PROVIDER` varsayılan olarak `mock` davranır. Gerçek provider için `AI_PROVIDER` ve ilgili API key değerini `.env.local` içine ekleyip sunucuyu yeniden başlat.

### Embedding provider `local_mock` görünüyor

Bu, Python ML servisi kullanılmadığında beklenen davranıştır. Gerçek embedding için ML servisini başlat ve `MEDIA_TRACKER_ML_SERVICE_URL` değerini ayarla.

### Supabase giriş var ama cloud sayıları gelmiyor

`supabase/schema.sql` çalıştırılmamış olabilir veya RLS/policy ayarları eksik olabilir. Supabase URL ve anon key değerlerini de kontrol et.

## Kullanım Akışı

1. Uygulamayı aç.
2. Keşfet sekmesinden içerik ara veya manuel medya ekle.
3. Kütüphanem sekmesinde filtrele, sırala ve grupları düzenle.
4. Medya kartlarından ilerleme, puan, favori ve not bilgilerini güncelle.
5. Aktivite ve istatistik sekmelerinden ilerlemeni takip et.
6. İstersen Ayarlar sekmesinden JSON yedeği al.
7. Supabase yapılandırdıysan cloud aktarım veya birleştirme işlemlerini onayla.
8. AI Danışman sekmesinden kütüphanene göre öneri al.
