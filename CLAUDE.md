<!-- This file is for local development tooling and is not part of the product documentation. -->

@AGENTS.md

# Local Development Tooling Notes

This file records implementation constraints, maintenance notes, and internal checkpoint labels for developers working in this repository. Public product documentation lives in `README.md` and `docs/`.

> **Önemli:** `AGENTS.md` (yukarıdan import) bu projedeki Next.js sürümüne dikkat çeker. API/dosya yapısı sürprizleri için `node_modules/next/dist/docs/` altındaki ilgili rehbere bak. Üstte verilen `AGENTS.md` notu hâlâ geçerli.

## Komutlar

```bash
npm run dev      # Geliştirme sunucusu
npm run build    # Production build (TypeScript dahil tip kontrolü yapar)
npm run lint     # ESLint
npm run start    # Build sonrası prod sunucu
npm run test     # Vitest watch
npm run test:run # Vitest tek seferlik paket
npx tsc --noEmit # Build'siz salt tip kontrolü
```

Vitest test runner kuruludur. D4 sonrası temel doğrulama `npm run lint`, `npm run test:run`, `npm run build` ve `git diff --check` sırasıdır; browser smoke ile contract testleri ayrı kanıttır. `eslint.config.mjs` `design_references/**` yolunu kapsam dışı bırakır (R19); o klasördeki JSX prototype snapshot'larını düzenlemeye gerek yok.

## Mimari

Next.js 16 App Router + React 19 + Tailwind 4 üzerine kurulu, **local-first** bir medya takip uygulaması. `app/page.tsx` sekmeli ana composition root'tur; sosyal profil, akış, öneriler, bildirimler, kişiler ve progression için ayrı App Router sayfaları da vardır. Feature sınırları `features/dashboard`, `features/library`, `features/discovery`, `features/calendar` ve `features/settings` altında ayrılmıştır.

### Veri akışı: localStorage öncelikli, Supabase opsiyonel

İki kaynak var, ama **localStorage tek "source of truth"**. Supabase aktifken bile UI hâlâ `mediaList`/`progressLogs` React state'inden render olur; Supabase yalnızca arka planda kuyruktan flush edilir.

- **Yerel veri adapter'ları** ([lib/storage.ts](lib/storage.ts), [lib/personal-data-storage.ts](lib/personal-data-storage.ts), [lib/sync-queue.ts](lib/sync-queue.ts)) owner-scoped/versioned envelope kullanır. Aşağıdaki düz anahtarlar legacy import/uyumluluk kaynağıdır:
  - `media-tracker-list` — legacy `MediaItem[]`
  - `media-tracker-logs` — legacy `ProgressLog[]`
  - `media-tracker-sync-queue` — legacy queue kaynağı; güncel queue owner-scoped'dur
  - `mediaTracker:uiPreferences` — R18 UI tercihleri (aşağıya bak)
- Hydration ve yazma `useMediaLibrary` ile domain storage adapter'larında koordine edilir; component'ler raw storage formatını yeniden yorumlamaz.
- Supabase env yoksa veya kullanıcı giriş yapmadıysa hiçbir cloud çağrısı tetiklenmez.

### Sync mimarisi

[lib/sync-manager.ts](lib/sync-manager.ts) singleton orchestrator'dır. Domain mutation noktaları local state doğrulandıktan sonra owner-scoped kuyruğa item düşürür:

- `enqueueMediaUpsert(item)` / `enqueueMediaDelete(id)` / `enqueueProgressLog(log)`
- Coalescing: aynı `entity` + aynı `payload.id` için bekleyen kayıt yenisiyle değiştirilir.
- Online + login varsa anında `flush()`. Aksi halde queue bekler.
- `flush()`: rollout contract hazırsa aktif `legacy | v2` adapter ile işler. V2 yolu stabil operation ID, expected revision, CAS, tombstone ve controlled conflict sonucunu korur. Başarılı id'ler kuyruktan silinir; retryable/blocked sonuçlar durable kalır.
- `SyncSnapshot` pending, process-memory in-flight, retryable, blocked, adapter, rollout ve son sonuç alanlarını tek reaktif kaynakta toplar. Aynı flush sırasında eklenen uygun item bounded sonraki batch'te tüketilir.
- `window`'un `online`/`offline` event'leri otomatik flush tetikler.
- UI subscribe için `useSyncStatus()` hook'u (`useSyncExternalStore` üzerine kurulu).

**Cloud→local yönü** (`CloudTransferPanel`'in download/merge butonları, `DataManagementPanel` import'u, `handleResetRequest` mock geri yükleme) sync queue'ya **yazmaz** — yoksa loop olur.

### Render-phase update kuralı (kritik)

React 19'da `setX(prev => ...)` fonksiyonel updater'ı render fazında da çalıştırılabilir. İçine `enqueueMediaUpsert` gibi external store yan etkisi koymak `Cannot update a component (CloudModeBadge) while rendering a different component (HomePage)` hatasına yol açar (`useSyncStatus` aboneliklerini tetikler).

**Standart güvenli kalıp:**

```ts
// 1) Saf compute (closure'daki güncel state üzerinden)
const touched: MediaItem[] = [];
const nextList = mediaList.map((it) => /* ... */);

// 2) Değer ile commit — functional updater DEĞİL
setMediaList(nextList);

// 3) Yan etkiler render dışında, event handler bağlamında
for (const m of touched) enqueueMediaUpsert(m);
```

Örnekler: [app/page.tsx](app/page.tsx) `handleCommitGroupAction`, `handleAddFromAniList` (relation patches), `handleUpdateRating` (R18.3). Yeni bir batch güncelleme yazarken bu kalıba uy.

### Supabase katmanı

`lib/supabase/` altındaki başlıca sınırlar:
- `client.ts` — `createBrowserClient`, env yoksa `null` (cache'li).
- `server.ts` — `createServerClient` async helper (şu an UI'dan tüketilmiyor; auth eklendiğinde devreye girer).
- `status.ts` — `isSupabaseConfigured()` env kontrolü.
- `types.ts` — Elle yazılmış `Database` tipi. `Relationships: []` her tabloda zorunlu (`postgrest-js` `GenericTable` shape'i için). Generated type değil — schema değişirse manuel güncellenmeli.
- `mapping.ts` — `MediaItem ↔ media_items row` ve `ProgressLog ↔ progress_logs row` çevrimi. **Raw spread yok**, metadata için explicit `METADATA_KEYS` whitelist'i. `cover_url` null ise `/placeholders/{type}.svg` fallback.
- `cloud-repository.ts` — `ensure(userId)` discriminated union ile narrowing yapar; tüm fonksiyonlar `CloudResult<T>` döner.

**Yeni metadata alanı eklerken**: hem [lib/types.ts](lib/types.ts) `MediaItem` interface'ine alan eklenmeli, hem de [lib/supabase/mapping.ts](lib/supabase/mapping.ts) içindeki `METADATA_KEYS` listesine adı yazılmalı. Aksi halde alan cloud'a sızmaz, round-trip sırasında kaybolur. Örnek: V3'te `anilistRelations` her iki yere de eklendi.

### Şema (Supabase)

[supabase/schema.sql](supabase/schema.sql) legacy/core başlangıç şemasıdır; migration zinciri güncel sözleşmenin parçasıdır. Proje durumuna göre D2B.0 ve D2B.1 production'a uygulanmıştır; D2C.1 owner-scoped fiziksel PK enforcement D8'e bırakılmıştır. `progress_logs.detail` cloud'a yazılmaz; `media_items.metadata jsonb` allowlist ile kaynak-spesifik ve Release Calendar kullanıcı metadata'sını taşır.

### Auth

[hooks/use-auth.ts](hooks/use-auth.ts) `useAuth()` Supabase env yoksa `configured=false`/`user=null` ile sessizce çalışır. Auth UI yalnızca [components/auth-panel.tsx](components/auth-panel.tsx) (e-posta + şifre, kayıtta tekrar). Tüm hata mesajları Türkçe (`translateAuthError`).

### Aktivite log birleştirme

[app/page.tsx](app/page.tsx)'in `addProgressLog` fonksiyonu `increment` ve `manual_adjust` için 1 saatlik pencerede aynı medyaya art arda gelen logları birleştirir (`amount` toplanır, `newProgress` güncellenir, log id'si değişmez → coalescing ile sync upsert tek kalır). `complete` ve `added` birleştirilmez.

## Series Group sistemi

[lib/series-group.ts](lib/series-group.ts) tüm grup mantığının kalbi. Üç farklı grup id şeması:
- `tvmaze:{showId}` — TVmaze sezon kayıtları için otomatik.
- `anilist-series:{minAniListId}` — AniList relation chain'inde minimum id ile stabil üretilir.
- `manual-series:{base36-time}-{rand}` — kullanıcının manuel oluşturduğu gruplar.

Üç şemanın da çakışmaması garanti.

### Ana fonksiyonlar

- **`groupMediaItems(items)`** — Kütüphanem render'ında kullanılır. Aynı `seriesGroupId`'ye sahip item'ları `MediaItemGroup` altında toplar (`orderIndex` → `seasonNumber` → `title.localeCompare("tr")` öncelikli sıralı). Tekil item'lar `isGroup: false` ile döner. UI tarafı `items.length >= 2` ise gerçek grup kartı render eder.
- **`withInferredSeriesGroup(item)`** — Sadece **explicit alanlar yoksa** TVmaze "X - Sezon N" başlık/externalId paterninden veya AniList format'ından türetir. Var olan değerlerin üstüne yazmaz.
- **`resolveAniListSeriesGroup(newItem, library)`** — V3. AniList relation eşleşmesi varsa stabil grup id üretir + mevcut item'lara güvenli series-only patch önerir. Sadece **SAFE** relationType (`PREQUEL`, `SEQUEL`, `PARENT`, `SIDE_STORY`) + aynı `rawType` (anime↔anime, manga↔manga). **Title benzerliği KESİNLİKLE kullanılmaz** — bu kasıtlı.
- **`getTvmazeShowExternalId / getTvmazeSeasonNumber / getTvmazeSeasonExternalId`** — TVmaze sezon kayıtlarının show id ve sezon numarasını parse eder. `lockedSeasonIds` üretiminde de bunlar kullanılır.

### UI

[components/series-group-card.tsx](components/series-group-card.tsx) açılır/kapanır kart. Önemli kalıplar:
- Grup yüzdesi child item'ların `currentProgress / totalProgress` toplamından hesaplanır (`computeGroupProgress`) — completed sayısına bağlı **değil**.
- "Devam: X" label üretirken `orderIndex` veya `releaseYear` ASLA "Parça X" olarak gösterilmez (V3.1 bug fix). `seasonNumber` varsa kullan; yoksa `seriesRelationType`'tan rol etiketi (Film/OVA/ONA/Special vb.); ona da yoksa kısa item title.
- Grup-seviyesi aksiyonlar: "Sezon Ekle" (TVmaze missing seasons), "Grubu Düzenle" (manuel grup modalını açar).

## Manuel Grup Yönetimi (V4)

[components/manual-group-modal.tsx](components/manual-group-modal.tsx) 4 modlu modal:
- **Yeni grup** — başlık + opsiyonel relationType/seasonNumber/orderIndex.
- **Gruba ekle** — mevcut gruplardan seç.
- **Başlık değiştir** — gruptaki tüm item'ların `seriesGroupTitle` alanını günceller.
- **Gruptan çıkar** — series alanlarını siler.

Commit ([app/page.tsx](app/page.tsx) `handleCommitGroupAction`) yalnızca `SERIES_KEYS` whitelist'i yazar:

```ts
const SERIES_KEYS = [
  "seriesGroupId",
  "seriesGroupTitle",
  "seriesRelationType",
  "seasonNumber",
  "orderIndex",
] as const;
```

`currentProgress / totalProgress / status / userRating / favorite / tags / personalNotes / externalSource / externalId / anilistRelations` ve diğer tüm alanlar **kesinlikle** dokunulmaz. Render-phase update kuralı (yukarı bak) burada katı uygulanır.

## Bilinmeyen total semantiği (V3.2)

`totalProgress === 0` artık "**bilinmiyor**" anlamına gelir. Sahte `1` fallback'i kaldırıldı.

- AniList normalizer (`getAniListTotalProgress`) episodes/chapters yoksa **0** döner.
- UI: [components/media-card.tsx](components/media-card.tsx), [components/media-detail-modal.tsx](components/media-detail-modal.tsx) `hasKnownTotal = totalProgress > 0` türetir. Bilinmeyen total → count `"X / ?? bölüm"`, yüzde yerine `—`, progress bar sabit %50 zinc placeholder (gradient değil → bilinen total'dan ayırt edilir). `isFinished` sadece bilinen totalde `true`.
- `handleIncrement` (app/page.tsx): bilinmeyen totalde clamp yok, status auto-completed yapmaz, kullanıcı serbest artırır.
- `handleComplete`: bilinmeyen totalde `currentProgress`'i değiştirmez; sadece `status="completed"`. Bilinen totalde eski davranış (totale çek).
- Grup yüzdesi (`computeGroupProgress`) sadece `totalProgress > 0` olan child'ları toplama dahil eder; %50 placeholder grup hesabına **katılmaz**.
- [components/media-modal.tsx](components/media-modal.tsx): totalProgress `min={0}`, label'da "(bilinmiyorsa 0 yazılmalıdır)" ipucu. Movie hâlâ `tp=1` zorunlu.

## Movie-like davranış

[lib/progress.ts](lib/progress.ts) `isMovieLike(item)` helper'ı:
- `type === "movie"` veya
- `type === "anime"` + `externalSource === "anilist"` + `format === "MOVIE"`

UI bunlar için bölüm/dakika progress bloğunu **gizler**; ana aksiyon "İzlendi Olarak İşaretle". `handleIncrement` movie-like için early return.

## React 19 / Next.js 16 dikkat noktaları

- **`react-hooks/set-state-in-effect`** lint kuralı aktif. Effect içinde sync setState etmek hata. Üç tip çözüm var (kullanıma göre):
  1. **Hidrasyon** (mount-only localStorage okuma): `eslint-disable-next-line react-hooks/set-state-in-effect` yorum gerekir (örn. `app/page.tsx`'in mediaList + UI prefs hidrasyon effect'leri).
  2. **Prop-driven reset** (örn. ai-advisor `resetSignal`): **modal-style prev-prop karşılaştırması** — render içinde `lastResetSignal` izleme state'iyle setState'leri guard'layıp çalıştır; **ref + timer mutasyonları ayrı bir useEffect**'e taşı ki kural tetiklenmesin (R19'da bu kalıba geçildi).
  3. **Async resolve** (örn. global-search status haritası): async callback içinde setState ⇒ kural tetiklenmiyor; ama **boş input → harita temizleme** kısmı render-phase guard'a taşınmalı (R19 fix'i).
- **`react-hooks/refs`** kuralı render sırasında `ref.current` okuma/yazmayı yasaklar. `useAuth` bunu önlemek için `useState` lazy init ile client kontrolü yapar.
- **`react-hooks/exhaustive-deps`** — `useCallback`/`useMemo` deps'ine `function` declaration referansı koyma her render'da yeni referans olduğundan uyarı verir. Sarmalamak çoğu zaman doğru, ancak **TDZ veya React Compiler `react-hooks/preserve-manual-memoization`** çakışması olabilir (örn. `app/page.tsx` `getTvmazeItemsForShow`). Bu durumda hoisted `function` formu bırakılır, uyarı kabul edilir; davranış etkisi pratikte yok.
- **Modal state reset** kalıbı: `useEffect` ile prop-driven reset yerine "render sırasında prev-prop karşılaştırması" — bkz. `media-modal.tsx`, `quick-add-modal.tsx`, `manual-group-modal.tsx`, `ai-advisor.tsx` (R19).
- Server component'lerde `cookies()` artık async; `lib/supabase/server.ts` buna göre yazılmış.
- Render-phase update kuralı (yukarıda ayrı bölüm) — özellikle batch state update + sync queue enqueue kombinasyonlarında.

## Modal sistemi

Dört modal app/page.tsx tarafından koordine ediliyor + bir ortak ConfirmDialog:
- `MediaModal` — manuel ekle/düzenle (akıllı form, türe göre alanlar, totalProgress=0 → bilinmiyor).
- `MediaDetailModal` — detay görünümü; `detailMediaId` state'i ile mediaList'ten her zaman güncel item çekilir (`useMemo`). Movie-like için progress bloğu gizli.
- `QuickAddModal` — Global Search/external sonuç ekleme. TVmaze çok-sezonlu sonuçlar için iki mod: "Tek Kayıt" (birleşik) / "Sezonları Ayrı Ekle" (sezon checkbox'ları + "Tümünü Seç").
- `ManualGroupModal` — V4 manuel grup yönetimi (yukarı bak).

### QuickAddModal TVmaze locked seasons (V2.1/V2.2 — kritik)

- `lockedSeasonIds` **`item.id`** (`tvmaze-{showId}-season-{N}`) formatında geçirilir — `externalId` formatı **değil**. (V2.2 bug fix'i; eskiden externalId verilince modal eşleşme bulamıyor, ekli sezonlar locked görünmüyor, submit'te override oluyordu.)
- Locked sezonlar UI'da `checked + disabled` görünür ama `selectedSeasonIds` set'inde tutulmaz.
- Eksik sezonlar **unchecked** başlar (V2.1) — kullanıcı bilinçli seçer.
- "Tümünü Seç" sadece `availableSeasons` üstünden çalışır.
- Submit gating: en az 1 yeni eksik sezon seçilmeden Ekle butonu disabled.
- [app/page.tsx](app/page.tsx) `onSave` defense-in-depth: `mediaList`'te zaten olan id'ler skip edilir → mevcut sezonun status/progress/rating override edilmez. (`handleSaveMedia` merge davranışı `{...exists, ...new}` yapıyor; bu yüzden locked item'lar submit'e sızmamalı.)

## Dış kaynak entegrasyonları

API route'ları proxy görevi görür:
- `app/api/tvmaze/{search,details}` — Diziler.
- `app/api/anilist/{search,details}` — Anime/manga/manhwa/manhua. Details endpoint'i V3'te `relations { edges { relationType, node { id, type, format, episodes, title, startDate } } }` döner; search etmez (arama hızlı kalır).
- `app/api/openlibrary/search` — Kitaplar.
- `app/api/omdb/{search,details}` — Filmler (IMDb metadata).
- `app/api/tmdb/search` — Pasif (UI'dan erişim yok ama route var).
- `app/api/ai/recommend` — AI Danışman provider proxy.

[components/global-search.tsx](components/global-search.tsx) bu kaynakların 4'ünü paralel sorgular, kategori başına `PER_CATEGORY_LIMIT = 9` sonuç gösterir. AniList relations sadece details endpoint'inden geldiği için global-search "Ekle" akışı önce `/api/anilist/details` çağırır → relations ile birlikte normalize edilmiş sonucu `handleAddFromAniList`'e geçirir; hata olursa search raw'ına sessizce geri düşer.

`next.config.ts` bu kaynakların image hostname'lerini `remotePatterns` olarak whitelist'ler — yeni bir görsel kaynağı eklendiğinde buraya da eklenmeli.

## AI Danışman (R34–R40)

[components/ai-advisor.tsx](components/ai-advisor.tsx) UI + [lib/ai/](lib/ai/) (provider abstraction, profile builder, intent analyzer, candidate search, rule-based scorer) + [app/api/ai/recommend/route.ts](app/api/ai/recommend/route.ts) proxy. V2 mimarisi single chat panel'den **öneri ve analiz merkezi**ne çevrildi.

### İstek payload akışı (request shape)

`AiRecommendRequest` ([lib/ai/types.ts](lib/ai/types.ts)) alanları:

- `message` — kullanıcı prompt'u (R34 mod kartları `buildModePrompt` ile zenginleştirir; "neden somut veriyle açıkla" cümlesi sabit eklenir).
- `mediaItems` / `progressLogs` — ham kütüphane payload'u.
- `settings: AiSettings` — `useProfile`, `useRecentActivity`, `usePersonalNotes`, `useWebResearch`, `deepResearch`, `useOpenAIProvider` ve R35'te eklenen opsiyonel `includeRatings` / `includeFavorites` / `includeProgress`. Default-true semantiği (`flag()` helper) eski payload'larla geriye uyumlu.
- `researchMode?: "library-only" | "source-apis" | "web"` — R37. Sadece `source-apis` gerçek aday çekme tetikler; `web` şu an `useWebResearch` flag'ine mapping (gerçek web search yok).
- `scopeMode?: "mixed" | "east" | "screen" | "arch" | "one-per-world"` — R37. AI Danışman UI chip'leri ile kaynak seçimi daraltılır.
- `dismissed?: { title, externalSource?, externalId?, mediaType? }[]` — R39 session-level feedback. Backend aday havuzundan eşleşenleri eler; kalıcı değil, sadece request bağlamında.
- `activeContext` / `recentContext` — follow-up merge için (R19).

### Aday havuzu pipeline'ı (kritik sıra)

Route'un (`recommend/route.ts`) candidate işleme sırası:

1. `searchCandidatesWithDebug` — mevcut planner/refine/deterministic-taste yolu (değişmedi).
2. **R37 source-api merge** — `researchMode === "source-apis"` ise [lib/ai/candidate-search.ts](lib/ai/candidate-search.ts)'in `searchSourceApiCandidates` aggregator'ı tetiklenir. Scope → kaynak haritası: `east` → AniList (anime/manga/manhwa/manhua), `screen` → TMDB (movie) + TVMaze (tv), `arch` → OpenLibrary. TMDB → OMDb otomatik fallback (TMDB boş dönerse). Aggregator çıktısı dedupe ile mevcut havuza eklenir.
3. **R39 feedback suppression** — `dismissedKeys` (`source:id`) ve `dismissedTitles` (normalize) setleriyle filtre; debug satırı `r39_feedback_suppressed:n=K`.
4. **R37.2 policy filter** — üç katmanlı hard-reject:
   - `source-apis` modunda `source === "library"` adaylar elenir (library_based intent zaten erken çıkış yaptığı için çakışma yok).
   - `intent.targetTypes` non-empty ise farklı türler elenir.
   - `scopeMode` east/screen/arch ise kapsam dışı türler elenir.
   - Reddedilenler `policyRejected` listesine somut gerekçe ile ("Kütüphanende zaten var", "İstenen tür ile uyuşmuyor", "Doğu kapsamına uymuyor") yazılır; final response'a merge edilir.
5. `libIndex` build + **R36 rule-based scorer** ([lib/ai/candidate-scorer.ts](lib/ai/candidate-scorer.ts)) — yüksek puanlılara/favorilere benzerlik, scope/world uyumu, dropped/paused cezası, mood keyword eşleşmeleri, AniList community score tiebreaker. Her aday `score: number` + `scoreReasons: string[]` alır; library-dışı kaynak adayı libIndex'te varsa hard-reject ("Zaten listende olduğu için elendi").
6. Provider ranking (`runRankingWithProviders`) — `describeCandidates` her aday satırına `· ön-skor:N` ve `nedenler: ...` ekler; sistem prompt'u "Adaylar kurallı şekilde ön-skorlandı; reason'ı bu nedenlere bağla" talimatını içerir.

Source-apis modunda toplam aday 0 kalırsa: `r37_source_candidates_empty` debug satırı, library fallback'e **düşülmez**, kullanıcıya "Kaynak API'lerinden <scope> kapsamı için uygun yeni aday bulamadım" mesajı.

### LibraryProfile yapısı (R35)

[lib/ai/profile-builder.ts](lib/ai/profile-builder.ts) ham kütüphaneyi modele boca etmez; sinyal odaklı özet üretir. Gruplar ve top-N limitleri:

- `highRated` (8) — `userRating >= 7`, descending.
- `favorites` (8), `dropped` (5), `paused` (5), `planned` (5), `completed` (5).
- `inProgress` (8) — watching/reading veya `currentProgress > 0` (completed/dropped/planning/paused dışı).
- `recentActivity` (10) — `progressLogs`'tan timestamp-desc.
- `notes` (5) — `personalNotes.slice(0, 240)`.
- `topGenres` (8), `topTags` (8) — count-desc.
- `averageRating: { value, count }` — `userRating` set edilmiş eserlerden 0.1 hassasiyetli.
- `worldDistribution: { east, screen, arch }` — type'tan dünya haritalaması.

**Toggle gating**: `includeRatings === false` → `highRated = []`, `averageRating = undefined`. `includeFavorites === false` → `favorites = []`. `includeProgress === false` → `inProgress`/`completed`/`planned`/`paused`/`dropped` hepsi `[]`. `useRecentActivity === false` → `recentActivity = []`. `usePersonalNotes === false` → `notes = undefined`.

`summarizeProfile(profile)` her grubu **yalnızca doluysa** prompt'a yazar (yokluğun özellik gibi algılanmasını engeller); boş kütüphanede "Kütüphane boş..." güvenli özet.

### AniList structured discover (R37.1)

[app/api/anilist/search/route.ts](app/api/anilist/search/route.ts) `q` yoksa **discover modu**na geçer: `genres`, `tags`, `episodesLte`, `sort` CSV paramları → GraphQL `media(genre_in, tag_in, episodes_lesser, sort)`. Mevcut `q + category` davranışı bire bir korundu.

Candidate-search'ün `extractAniListStructuredFilters(intent, message)` helper'ı mood/length intentlerini AniList sözlüğüne haritalar (chill → `Slice of Life, Comedy` + `Iyashikei, Heartwarming`; karanlık → `Psychological, Thriller` + `Dark Fantasy`; "kısa/short" → `episodesLesser=14`; "13 bölüm altı" → `episodesLesser=14` vb). İki pass:
- **Strict** — tüm signals + tags + ep cap.
- **Relaxed** — sadece ilk genre, tag yok, ep cap yok.

`searchSourceApiCandidates` AniList pair'leri için mood/length sinyali varsa strict çağırır; 0 sonuç ise relaxed otomatik. Hiç sinyal yoksa eski title-search davranışı.

Debug satırları: `r37_anilist_discover_strict:filters=... hits=N` / `r37_anilist_discover_relaxed:...` / `r37_anilist_title_search:queries=K`.

### AiCandidate.source / AiRecommendation.externalSource

R37'de **`"tmdb"`** literal'ı union'a eklendi (eski union: `tvmaze | anilist | openlibrary | omdb | library`). Providers' JSON schema'sı + planner whitelist'i (`normalizePlanShape`) + label helper'ları (`TMDB`) + client mirror — hepsi senkronize. Yeni bir kaynak eklerken bu beş yere de yansıt.

### Öneri kartı (R38)

Kart yapısı:
- Üst row: cover (yoksa `Sparkles` ikon fallback) + başlık + `mediaType · source · year` + fit chip.
- **"Neden önerildi"** kutucuğu — `rec.candidate?.scoreReasons` (R36) varsa 3 maddeye kadar bullet; yoksa `rec.reason` cümle sınırlarında bölünüp 110 karakterde `…` ile kırpılır. Ham debug görünümü yok.
- Risk satırı (`AlertTriangle` ikon, amber) + community signal.
- Meta footer: `score X.X  ·  source:externalId` mono font.
- Aksiyon satırı `flex flex-wrap`:
  - **Listeye Ekle** (canAdd) / **Listede** / **Keşfet'te Ara** (canAdd=false → `onOpenDiscover` callback).
  - **Buna benzer** — `buildSimilarPrompt(rec)` ile chat'e send (dismissed state'i bypass eder).
  - **İlgilenmiyorum** / **Geri al** — `dismissedSignals` state'i toggle; R39'a yansır.

### Session feedback suppression (R39)

`dismissedSignals: Record<recId, DismissedSignal>` — local feedback. `handleDismissRec` tam sinyali (title/externalSource/externalId/mediaType) saklar; `runApi` payload'a `dismissed: Object.values(...)` olarak geçer. Backend filtre (yukarıda akış #3) bu adayları eler ve hiç LLM'e gönderilmez. **"Buna benzer öner" dismissed bypass etmez** — kaynak rec backend'de zaten elenir, benzer adaylar farklı id/title ile döner; UI'da dismissed karta da basılabilir.

### Oturum kalıcılığı (R40) — kritik davranış

**AI sekmesinden çıkıp dönmek oturumu kapatmaz.** `handleTabChange` artık `aiResetSignal` artırmıyor (state'in kendisi kaldırıldı; advisor'a `resetSignal={0}` sabit gider, modal-style reset koluna asla girmez). Oturum yalnızca **"Konuyu kapat"** butonuyla temizlenir (eski `"Yeni konu"` etiketi birleşik tek-davranışa standartlaştı).

LocalStorage key'leri (AI tarafı):
- `media-tracker-ai-settings` — AiSettings.
- `media-tracker-ai-sessions` — Geçmiş oturumlar (max 8, R19).
- `media-tracker-ai-data-toggles` — R34/R35 veri toggle'ları.
- `media-tracker-ai-advisor-prefs` — `scopeMode` + `researchMode`.
- **`media-tracker-ai-active-session`** — R40 snapshot (`v: 1`). İçerik: `messages`, `recommendations`, `rejected`, `addedIds`, `dismissedSignals`, `pendingClarification`, `debugInfo`, `activeContext`. Boş state save effect'i `removeItem` çağırır; "Konuyu kapat" tüm state'i sıfırlayınca snapshot otomatik silinir.

### Keşfet prefill (R40)

`onOpenDiscover(rec)` AiAdvisor → app/page.tsx → `discoverPrefill: { query, category, token }` state'i + `handleTabChange("discover")`. GlobalSearch monoton-artan `token` ile prev-prop guard çalıştırır → `setQuery`/`setCategory` render fazında, `setTimeout(handleSearch, 0)` ile defer auto-search (set-state-in-effect ihlalinden kaçınma). `mediaType → GlobalSearchCategory`: movie→movie, tv→tv, anime→anime, manga/manhwa/manhua→manga, light_novel/web_novel/visual_novel→novel, book→book. Manuel Keşfet kullanımı (prop verilmediğinde) bozulmaz.

### UI elemanları

- **Mod kartları** (R34): 6 sabit kart (Öneri Al · Kütüphane Analizi · Puanlarıma Göre · Favorilerime Göre · Yarım Kalanlar · Her Dünyadan Öner). Karta basınca `buildModePrompt(mode, scope, research, toggles)` → mevcut `handleSend` akışı.
- **Scope chip'leri** (5): Karışık · Doğu · Kadraj · Arşiv · Her dünyadan bir öneri.
- **Araştırma modu** (3): Sadece kütüphanem · Kaynak API'leriyle öner · Web araştırması.
- **Sağ panel**: "Kullanılacak veriler" (Puanlar/Favoriler/İlerleme/Notlar/Son aktiviteler) + "Gelişmiş" (kişisel notlar, derin araştırma, OpenAI provider).

### Yeni bir mod / kaynak / scope eklerken kontrol listesi

- `MODE_CARDS` / `SCOPE_OPTIONS` / `RESEARCH_OPTIONS` array'lerine ekle.
- Yeni media kaynağı (örn. başka bir API): `AiCandidate.source` + `AiRecommendation.externalSource` union'larını client + server'da senkronla; providers' JSON schema enum'larını + `normalizePlanShape` whitelist'lerini + `sourceLabel` switch'lerini güncelle; `searchSourceApiCandidates` `planForScope`'una pair ekle.
- Yeni scope: `eastTypes`/`screenTypes`/`archTypes` set'lerini route'ta güncelle; `searchSourceApiCandidates`'in scope filtresini ve UI haritalamalarını (`onOpenDiscover` switch) eşle.
- Yeni AniList mood/length sözlüğü: `extractAniListStructuredFilters` koşullarına ekle; relaxed fallback'in tetiklenebileceğini test et.


## UI Shell ve Layout (R1–R8 redesign + R17/R18.5.1 polish)

Eski tek-üst-nav layout'u (kaldırılan `AppHeader`) dashboard-style shell ile değiştirildi. `app/page.tsx` hâlâ tek route ve tüm tab'ları koşullu render ediyor, ama dış kabuk artık üç sütun:

```
┌─ AppSidebar (lg+, w-64) ─┬─ AppTopbar (sticky, h-14) ──────────────┐
│                          ├─ main (px responsive, min-w-0) ─────────┤
│  nav sections + Settings │                                   │RightRail│
│                          │                                   │(xl+, 18rem)│
└──────────────────────────┴───────────────────────────────────┴────────┘
```

### Shell overflow + sticky kuralı (R18.5.1 — kritik)

Outer shell `<div>`'i **`overflow-x-clip`** kullanır, `overflow-x-hidden` DEĞİL. `hidden` bir **CSS scroll container** oluşturur; bu durumda sidebar/rail'ın `sticky top-0` davranışı viewport yerine bu container'a anchor olur ve sticky efektif olarak static gibi davranır. `overflow: clip` scroll container kurmadan taşmayı kırpar — sticky çalışmaya devam eder. Yeni shell-level overflow guard eklerken **`clip` kullan**.

### Shell componentleri ([components/app-{sidebar,topbar}.tsx](components/app-sidebar.tsx), [components/right-rail.tsx](components/right-rail.tsx))

- **`AppSidebar`** — `hidden lg:flex sticky top-0 h-screen w-64 ... flex-col`, iç nav `flex-1 min-h-0 overflow-y-auto`. Ghost item'lar (`calendar`, `progress`, `watchlist`, `favorites`, `ratings`, `notes`, `stats`) `disabled + cursor-not-allowed`; `onChange` sadece `REAL_TABS = {dashboard, library, discover, ai, activity, settings}` üyeleri için tetiklenir. Yeni "Yakında" sayfa eklerken `REAL_TABS` setini büyütmeyi unutma.
- **`AppTopbar`** — `sticky top-0 z-40`. lg+ breadcrumb (`MediaTracker › <TabLabel>`) + `CloudModeBadge`. lg altında mevcut `AppTabs` fallback olarak topbar'ın altında render edilir. Yeni tab eklerken `app-topbar.tsx`'in `TAB_LABELS` map'ine de eklenmeli.
- **`RightRail`** — `hidden xl:flex sticky top-0 h-screen w-[18rem] ... overflow-y-auto`. Salt okuma; parent'tan `mediaList`, `progressLogs`, `stats: DashboardStats`, `themeFilter` (R15 — dünya bazlı widget hesapları), `onOpenDetail` prop'larıyla beslenir. Widget'lar (`OverallWidget`, `DailyGoalWidget`, `SuggestionWidget`, `ActivityWidget`, `UpcomingWidget`) içeride memo'lu türetimler yapar. **Ayarlar sekmesinde `activeTab !== "settings"` koşulu ile gizlenir** — settings bağlam-dışıydı; main column rail kaybolunca tüm xl genişliği alır.
- **Page surface dialect:** `rounded-2xl border-zinc-800/60 bg-zinc-900/30` panel + amber-400/80 accent. Yeni panel/widget yazarken bu üçlüyü kullan.

### Z-index hiyerarşisi

Yeni overlay/popover eklerken bu sıralamaya uy:
- Modal'lar (`confirm-dialog`, `manual-group-modal`, `media-modal`, `quick-add-modal`): `z-[100]`
- `MediaDetailModal`: `z-50`
- `WorldTransition` macro overlay: `z-[45]`
- `AppTopbar`: `z-40`
- MediaCard favori ribbon ve rating popover: `z-30` (kart-içi stacking; topbar/modal'ların altında)
- MediaCard title hover-expansion: `hover:z-40`

## Dünya (World) sistemi (R9–R16)

Eski "Tema" konsepti R9'da **Dünya**'ya yeniden isimlendirildi. State adları (`themeFilter`, `eastSubFilter`, `EastSubFilter`, `ThemeFilter`) ve internal değerler (`"all"`/`"east"`/`"screen"`/`"library"`) **korundu** — sadece UI label'ı ve sekme adları yenilendi.

### `data-world` scope (R10)

`app/page.tsx`'in kök `<div>`'i `data-world={worldAttr}` taşır; `themeFilter` → world key eşlemesi:
- `all` → `neutral`
- `east` → `east`
- `screen` → `screen`
- `library` → `arch`
- **Ayarlar sekmesinde her zaman `neutral`** (settings bağlam-dışı).

[app/globals.css](app/globals.css) `[data-world="..."]` selector'ları altında `--w-primary`, `--w-primary-strong`, `--w-soft` token'larını set eder. Yeni dünya-aware öğe yazarken hardcoded amber/blue/parchment kullanma; bu token'lardan beslen (`text-[var(--w-primary-strong)]`, `bg-[var(--w-soft)]`, `ring-[color-mix(in_srgb,var(--w-primary)_40%,transparent)]`).

### Bileşenler

- **`WorldSwitcher`** ([components/media-filters.tsx](components/media-filters.tsx)) — Dünya seçim segmented control. LibraryControlBar üst slot'unda yaşar. Aktif Dünya `--w-*` token'larına bağlanır → "Tümü"de nötr zinc, dünya seçili iken o dünyanın tonu.
- **`StatusFilterRow`** ([components/media-filters.tsx](components/media-filters.tsx)) — Durum filtre satırı. R18.1'de `WorldSwitcher`'dan ayrıldı, WorldHero'nun **altına** ayrı satır olarak yerleşir.
- **`WorldHero`** ([components/world-hero.tsx](components/world-hero.tsx)) — `themeFilter ∈ {east, screen, library}` iken render edilir; `all`/`settings` için hiç render edilmez. Sub-pill'ler:
  - Doğu: Anime/Manga/Novel → `eastSubFilter`
  - Kadraj: Film/Dizi → `typeFilter`
  - Arşiv: Kitap → `typeFilter`
  R14 mikro animasyonları (`r14-hero-*-enter` keyframe'leri) **yalnızca dünya değişiminde** `key={worldKey}` remount yoluyla oynar; sub-pill seçimi entrance'ı re-trigger ETMEZ.
- **`WorldTransition`** ([components/world-transition.tsx](components/world-transition.tsx)) — R13.2 macro overlay. `pointer-events-none fixed inset-0 z-[45]`, **sadece `worldTransition` token bumplandığında** oynar (Dünya değişimi event'inde, başka tetik yok). `handleThemeFilterChange` içinde bumplanır; sekme geçişi, medya ekleme, settings'e giriş tetiklemez.

### Filtre mimarisi (R18.1)

Kütüphanem üst kontrol alanı şu yapıdadır:
1. `LibraryControlBar` — search input + Medya Ekle butonu + altında `WorldSwitcher`
2. `WorldHero` (sadece `themeFilter !== "all"`) — alt kategori pill'leri
3. `StatusFilterRow` — bağımsız durum filtresi satırı
4. İçerik bölümleri

**R18.1 değişikliği**: Eski `MediaFilters`'taki "Tür" bloğu **tamamen kaldırıldı**. Tür seçimi artık yalnızca WorldHero alt pill'leri üzerinden yapılır (Doğu→`eastSubFilter`, Kadraj/Arşiv→`typeFilter`). LibraryControlBar artık sadece `themeFilter`/`onThemeChange` taşır.

### Filtre-tema bağımlılıkları (`handleThemeFilterChange` — değişmedi)

Tema değişiminde yan filtreleri konsolide eder:
- `east` dışına çıkış → `eastSubFilter = "all"`
- `east` → `typeFilter = "all"`
- `screen` → `typeFilter` sadece `"all" | "movie" | "tv"` kalır
- `library` → `typeFilter` sadece `"all" | "book"` kalır

Aynı kurallar R18 `normalizeUIPreferences` (lib/storage.ts) içinde de uygulanır — eski/uyumsuz snapshot'la dönen kullanıcı görmediği bir filtreye sabitlenmiş kalmaz. Birini değiştirirken diğerini de güncelle.

## UI Preferences localStorage (R18 + R18.2)

[lib/storage.ts](lib/storage.ts) `loadUIPreferences()` / `saveUIPreferences()` / `normalizeUIPreferences()`. Key: **`mediaTracker:uiPreferences`**. Tek JSON objesi.

Saklanan alanlar:
- `themeFilter`, `eastSubFilter`, `typeFilter`, `statusFilter` — filtre durumu
- `librarySort`, `libraryView` — Kütüphanem (tekil) bölümü kontrolleri
- `continueSectionOpen`, `seriesSectionOpen` — R18.2 collapsible section durumları

**Saklanmayanlar (bilinçli)**: `activeTab`, `searchQuery`, modal state, selected detail.

### Hidrasyon davranışı (kritik)

`app/page.tsx`'in mount-only effect'i `loadUIPreferences()` çağırıp 8 setter'ı **doğrudan** çalıştırır — `handleThemeFilterChange` üzerinden DEĞİL. Bu kasıtlı: `handleThemeFilterChange` `worldTransition` token'ını bumplar, hidrasyon sırasında bu çağrılırsa **mount'ta WorldTransition oynar** (istenmez). Persist effect'i `uiPrefsLoaded` flag'iyle guard'lanır — default değerlerin gerçek snapshot'ı ezmesini engeller.

### Validation

`normalizeUIPreferences` alan-alan whitelist set'leriyle (`THEME_FILTER_VALUES`, `EAST_SUB_VALUES`, `MEDIA_TYPE_VALUES`, `STATUS_VALUES`, `SORT_VALUES`, `VIEW_VALUES`) validate eder. Boolean alanlar (`continueSectionOpen`, `seriesSectionOpen`) typeof === "boolean" kontrolü. Geçersiz/eksik alan → default. Sonra theme↔type tutarlılığı uygulanır (yukarıdaki `handleThemeFilterChange` kurallarıyla aynı).

## Kütüphanem dashboard section layout

`activeTab === "library"` bloğu `filteredMedia`'yı **üç ayrı section**'a böler. Pipeline aşağıdaki sırada `app/page.tsx` içinde tek bir IIFE'de hesaplanır:

1. **Devam Ettiklerim** (R18.2: collapsible, default açık) — `filteredMedia` üzerinden `status ∈ {watching, reading}` veya `currentProgress > 0 && status ∉ {completed, dropped}`; son `progressLogs` timestamp'ine göre sırala, ilk 6. **Bilinçli karar:** burada görünen item alt section'larda da tekrar görünebilir (üstte öne çıkar, listede kalır). React key çakışmasını engellemek için bu section `key={\`continue-${item.id}\`}` prefix'i kullanır.
2. **Seri Koleksiyonlarım** (R18.2: collapsible, default açık) — `groupMediaItems(filteredMedia)` çıktısının `isGroup && items.length >= 2` olan kısmı; `SeriesGroupCard` ile render.
3. **Kütüphanem (tekil)** (R18.2: **collapsible değil**, her zaman açık) — kalan singleton item'lar. **Yalnızca bu section** `librarySort` ve `libraryView` state'lerinden etkilenir.

`SectionHead` (page.tsx'te inline) `collapsible` + `isOpen` + `onToggle` prop'ları alır; collapsible varyantta header satırının kendisi `<button>` olur (ChevronDown rotation animasyonu `motion-safe:transition-transform`).

### `LibraryControlBar` + `LibrarySectionControls` ([components/library-control-bar.tsx](components/library-control-bar.tsx))

- **`LibraryControlBar`** (R18.1 sonrası): arama, "Medya Ekle", `WorldSwitcher`. Sadece `themeFilter`/`onThemeChange` taşır. "Tür" ve "Durum" blokları kaldırıldı (Tür → WorldHero pill'leri, Durum → ayrı `StatusFilterRow`).
- **`LibrarySectionControls`** (named export): kompakt sort dropdown + grid/list toggle. **Kütüphanem section header'ının `actions` slot'una** gömülür. `Devam Ettiklerim` ve `Seri Koleksiyonlarım` `actions` geçmediği için bu kontroller orada görünmez.
- **Sort:** `recent` (mediaList index, reverse), `lastActivity` (progressLogs timestamp), `title` (`localeCompare("tr")`), `progress` (ratio; `totalProgress=0` → `-1` → sona), `rating` (`userRating ?? -1` → sona). Veri mutate etmez; her zaman `slice().sort(...)`.
- **View:** `grid` → `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`; `list` → `grid-cols-1 gap-3` (yine `MediaCard`).

### PageHeader ([components/page-header.tsx](components/page-header.tsx))

Dashboard / Keşfet / AI Danışman / Aktivite / Ayarlar tab'larının başına gelen ortak başlık bandı (amber ikon kutusu + zinc-50 başlık + subtitle + bottom border). **Kütüphanem'de PageHeader yok** — control bar + section heads zaten yapıyı kuruyor, topbar breadcrumb'ı "Kütüphanem" diyor; dördüncü "Kütüphanem" yazısı görsel gürültü olurdu. Yeni tab eklerken: `<PageHeader icon={...} title="..." subtitle="..." />` ile başla.

## MediaCard görsel sistemi (R18.3–R18.6)

[components/media-card.tsx](components/media-card.tsx) modernize edildi. Kart prop arayüzü:

```ts
interface MediaCardProps {
  item: MediaItem;
  onIncrement: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenDetail: (item: MediaItem) => void;
  onAddRelatedParts?: (item: MediaItem) => void;
  relatedPartsLabel?: string;
  canAddRelatedParts?: boolean;
  onOpenGroupEdit?: (item: MediaItem) => void;
  onUpdateRating?: (id: string, rating: number | null) => void; // R18.3
}
```

### Hızlı puanlama (R18.3 / R18.6)

- **Trigger**: cover top-left'te frosted pill (`pl-1.5 pr-2 h-[22px] rounded-full`). Puanı varsa amber ★ + sayı; puansız + `canRate` ise **icon-only** (R18.6: "Puanla" text'i gürültü yaratıyordu) hover-reveal `opacity-0 group-hover:opacity-100`.
- **Popover** (`z-30`): `absolute top-full left-0 mt-1.5 w-[11rem]` — cover sol-üstüne anchor olduğu için kart sağ kenarına sıkışıp 1–10 grid'i kesilmez. 5×2 grid + opsiyonel "Puanı Temizle" (yalnızca `hasRating` iken).
- ESC + outside click (`mousedown`) + `stopPropagation` listener'ları `useEffect`'te.
- `handleUpdateRating(id, rating: number | null)` — `handleToggleFavorite` kalıbının aynısı: validate (0–10 integer veya null), short-circuit, sync queue enqueue.
- **Threading**: `onUpdateRating` `SeriesGroupCard` ve `EnhancedDashboard` üzerinden tüm MediaCard call site'lara geçirilir.

### Favori corner ribbon (R18.5 + R18.5.1)

- Kartın **sağ-üst köşesinde** clip-path flag şekli (`polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%)`), `absolute top-0 right-4 w-6 h-9 z-30`. Cover'da DEĞİL.
- Pasif: zinc gradient + içe ring (silik outline, görünür). Aktif: rose gradient + drop-shadow glow.
- İçindeki ikon **`Heart`** (R18.5.1 fix — başlangıçta yanlışlıkla `Bookmark` ikonuydu). Aktifte `fill-current scale-110` snap; `motion-safe:transition-transform duration-200`.
- `stopPropagation` — detay açmaz.
- Title row'a `pr-7` reserve → ribbon çakışmaz.

### Aksiyon cluster

Title row sağında frosted şerit (`rounded-lg ring-1 ring-zinc-800/70 bg-zinc-950/70 backdrop-blur-sm`), `opacity-0 group-hover:opacity-100 focus-within:opacity-100`. İçeride: Detay (Info) / Düzenle (Pencil) / Grup Düzenle (Layers, opsiyonel) / Sil (Trash2). **Favori bu cluster'da YOK** (ribbon'da yaşıyor — R18.5'ten itibaren).

### Bottom action bar

Frosted footer (`bg-zinc-950/40 backdrop-blur-sm`). Movie-like için tek buton "İzlendi Olarak İşaretle"; aksi halde "+N bölüm" / "Tamamla" iki buton + dikey self-stretch divider. Disabled state: `isCompleted` / `isFinished` koşullarına bağlı.

### SeriesGroupCard featured-collection (R3)

[components/series-group-card.tsx](components/series-group-card.tsx) tek `palette` objesinden tüm renkleri çeker: Doğu ailesi (`resolveThemeAccent` → `groupAccent`) varsa amber, aksi halde violet/fuchsia fallback. Üst gradient şerit, progress bar, sezon ekle/grubu düzenle butonları, expanded iç hiyerarşi çizgisi ve dashed "Sezon/Parça Ekle" slot'u hepsi aynı paletten beslenir. Yeni accent yolu eklerken `palette` objesini genişlet — class string'lerini cardın içinde dağıtma. Child MediaCard'lara `onUpdateRating` passthrough geçer.

## Dosya hiyerarşisi (özet)

```
app/             — page.tsx (tek route) + api/{tvmaze,anilist,openlibrary,omdb,tmdb,ai}/...
components/      — UI parçaları (modal, panel, kart, ai-advisor)
                   shell: app-sidebar, app-topbar, app-tabs (mobil fallback),
                          right-rail, page-header, library-control-bar
                   world: world-hero, world-transition, media-filters
                          (WorldSwitcher + StatusFilterRow)
hooks/           — useAuth, useSyncStatus
lib/             — storage (UI prefs dahil), types, progress, dashboard-stats,
                   mock-media, sync-manager, sync-queue, backup, series-group,
                   global-search-types, {anilist,omdb,openlibrary,tmdb,tvmaze}{-types}.ts
lib/ai/          — provider (openai-compatible / gemini / mock) + settings/types +
                   profile-builder (R35) + intent-analyzer + candidate-search
                   (title + R37.1 AniList structured discover + R37 source-api
                   aggregator) + candidate-scorer (R36 rule-based)
lib/supabase/    — client, server, status, types, mapping, cloud-repository
supabase/        — schema.sql (RLS + index + trigger)
docs/            — supabase-offline-sync-plan.md
design_references/ — sadece görsel/layout referans; runtime'da kullanılmaz; lint kapsamı dışı (R19)
```

## Bilinçli olarak yapılmayanlar

- Vitest test runner vardır; güncel scriptler `package.json` içindedir.
- `progress_logs.detail` cloud'a yazılmaz; yerel-only.
- Sync queue owner-scoped'dur; guest veya başka owner item'ı aktif kullanıcıya otomatik gönderilmez. Generation guard stale async sonucu yeni owner state'ine uygulamaz.
- Cloud realtime/auto-pull yok — sadece yerel→cloud push otomatik. Cloud→local yalnızca `CloudTransferPanel` butonlarıyla manuel.
- AniList için **title benzerliği** ile otomatik gruplama yok — sadece persist edilmiş `anilistRelations` id eşleşmesi kullanılır. "Frieren Season 2" gibi kayıtlar relation verisi olmadan gruplanmaz.
- AniList relation tipleri için whitelist dar tutulmuştur: `PREQUEL`, `SEQUEL`, `PARENT`, `SIDE_STORY`. `ADAPTATION` (manga↔anime), `ALTERNATIVE`, `SPIN_OFF`, `CHARACTER`, `SUMMARY`, `COMPILATION`, `SOURCE`, `OTHER`, `CONTAINS` **yanlış pozitif riski** nedeniyle dışarıda. Genişletmeden önce iyi düşün.
- `handleSaveMedia`'nın merge davranışı (`{...exists, ...new}`) override yapar; bu yüzden Quick Add ve manuel grup akışları ayrı defansif yollarla locked/existing item'ları submit'e sızdırmaz. Yeni bir ekleme akışı yazarken aynı korumayı uygula.
- Manuel grup işlemleri yalnızca `SERIES_KEYS` whitelist'i (`seriesGroupId`, `seriesGroupTitle`, `seriesRelationType`, `seasonNumber`, `orderIndex`) yazar; diğer alanlara dokunmaz. Yeni bir series-only patch noktası eklerken aynı whitelist + render-phase kuralını uygula.
- Sahte `totalProgress = 1` fallback'i AniList normalizer'da yok (V3.2). Yeni bir kaynak normalizer'ı yazarken "bilinmiyorsa 0" semantiğine uy.
- WorldTransition macro overlay **sadece `handleThemeFilterChange` token bumpı ile** oynar; başka tetikleyici eklenmez. Sayfa açılışında hidrasyon setter'ları doğrudan kullanılır, handler üzerinden değil.
- Title benzerliği ile favorit/rating türetme yok — kullanıcı eylemiyle değişir.
- AI Danışman'da gerçek web search yok (R37 `web` modu UI-only, sadece `useWebResearch` flag'i provider'a iletilir).
- AI feedback yerel, owner-scoped recommendation state'inde korunur; Cloud/social veriyle otomatik paylaşılmaz.
- AI sekme değişiminde **otomatik reset yok** (R40). Aktif oturum localStorage'a (`media-tracker-ai-active-session`) yazılır; yalnızca "Konuyu kapat" / `handleNewTopic` temizler. Yeni bir sekme ekleyip AI state'i reset etmek isterseniz açıkça `handleNewTopic()` çağırın — eski `aiResetSignal` mekanizması yok.
- AI source-apis modunda **library fallback'e düşülmez** (R37.2) — 0 aday → kullanıcıya net mesaj + `r37_source_candidates_empty` debug satırı; library-based intent ise zaten erken çıkış yapar (farklı kod yolu).
