# MediaTracker

MediaTracker; film, dizi, anime, manga, manhwa, manhua, novel ve kitap takibi için geliştirilmiş offline-first bir medya takip uygulamasıdır. Proje Next.js 16 App Router, React 19, TypeScript ve Tailwind CSS 4 üzerine kuruludur.

Uygulamanın ana veri kaynağı tarayıcıdaki `localStorage` alanıdır. Supabase yapılandırılırsa hesap, cloud aktarım ve senkron hazırlıkları devreye girer; yapılandırılmazsa uygulama yerel modda çalışmaya devam eder.

## Mevcut Durum

- Tek sayfalık, sekmeli Next.js uygulaması.
- Varsayılan kullanım yerel moddur; veri tarayıcıda saklanır.
- Supabase opsiyoneldir: auth, manuel cloud upload/download/merge ve sync queue altyapısı vardır.
- AI Danışman opsiyoneldir: varsayılan mock provider ile çalışır, API anahtarları verilirse gerçek provider kullanılabilir.
- Python tabanlı ML servisi opsiyoneldir: embedding skoru için kullanılabilir; yoksa yerel mock embedding fallback'i çalışır.

## Teknik Kazanımlar

- Offline-first veri mimarisi ve `localStorage` tabanlı persistence.
- JSON import/export, merge/replace veri yönetimi ve tarayıcı içi yedekleme akışı.
- Supabase auth, manuel cloud aktarım ve sync queue hazırlığı.
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
  - JSON dışa aktarma
  - JSON içe aktarma
  - Merge veya replace modu
  - Mock verilere sıfırlama
- Cloud:
  - Supabase email/password auth
  - Yerel -> Cloud aktarım
  - Cloud -> Yerel indirme
  - Cloud verisini yerel veriyle birleştirme
  - Mutasyonlar için sync queue ve online durumda flush altyapısı
  - Özel temalar için güvenli JSON import/export ve kullanıcı onaylı, revision kontrollü opsiyonel cloud senkronizasyonu
  - Tema aktarım/senkronizasyon ayrıntıları: [`docs/THEME_IMPORT_EXPORT_AND_SYNC.md`](docs/THEME_IMPORT_EXPORT_AND_SYNC.md)
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
| `SUPABASE_SERVICE_ROLE_KEY` | Hayır | Yalnızca server-side persistent embedding cache erişimi için |
| `TMDB_READ_ACCESS_TOKEN` | Hayır | Film aramasında TMDB birincil kaynak |
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
2. Yeni kurulumda `supabase/schema.sql` dosyasındaki SQL'i Supabase SQL Editor içinde çalıştır. Mevcut projede 14 haneli migration’ları sırayla uygula; opsiyonel tema senkronizasyonu için `supabase/migrations/20260722130000_theme_cloud_sync.sql` dosyası da uygulanmalıdır. Bu tur migration’ı uzak projeye otomatik uygulamaz.
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
- Cloud'dan otomatik real-time pull yoktur; indirme ve birleştirme manuel aksiyonlarla yapılır.

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
- `POST /api/ai/recommend`

Dış API anahtarları server-side route'larda kullanılır; tarayıcıya token gönderilmez.

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
