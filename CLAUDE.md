@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Önemli:** `AGENTS.md` (yukarıdan import) Next.js'in eğitim verisinden farklı olduğunu söyler. API/dosya yapısı sürprizleri için `node_modules/next/dist/docs/` altındaki ilgili rehbere bak. Üstte verilen `AGENTS.md` notu hâlâ geçerli.

## Komutlar

```bash
npm run dev      # Geliştirme sunucusu
npm run build    # Production build (TypeScript dahil tip kontrolü yapar)
npm run lint     # ESLint
npm run start    # Build sonrası prod sunucu
npx tsc --noEmit # Build'siz salt tip kontrolü
```

Test runner kurulu değil — manuel test yolu `npm run dev` veya `npm run build` üzerinden ilerler. Lint+TS+build geçmesi pratikte gerekli minimum.

## Mimari

Next.js 16 App Router + React 19 + Tailwind 4 üzerine kurulu, **offline-first**, tek-sayfalık (sekmeli) bir medya takip uygulaması. Tek route var: `app/page.tsx`. Tüm UI sekmeleri (Dashboard / Kütüphanem / Keşfet / Aktivite / AI Danışman / Ayarlar) burada koşullu render ile yönetiliyor.

### Veri akışı: localStorage öncelikli, Supabase opsiyonel

İki kaynak var, ama **localStorage tek "source of truth"**. Supabase aktifken bile UI hâlâ `mediaList`/`progressLogs` React state'inden render olur; Supabase yalnızca arka planda kuyruktan flush edilir.

- **localStorage anahtarları** ([lib/storage.ts](lib/storage.ts), [lib/sync-queue.ts](lib/sync-queue.ts)):
  - `media-tracker-list` — `MediaItem[]`
  - `media-tracker-logs` — `ProgressLog[]`
  - `media-tracker-sync-queue` — `SyncQueueItem[]`
- Mount'ta `app/page.tsx` storage'tan okur. Sonraki tüm değişikliklerde otomatik yazma için bir `useEffect`.
- Supabase env yoksa veya kullanıcı giriş yapmadıysa hiçbir cloud çağrısı tetiklenmez.

### Sync mimarisi

[lib/sync-manager.ts](lib/sync-manager.ts) singleton bir orchestrator'dır. Mutasyon noktaları (`app/page.tsx` içindeki `handleIncrement`, `handleComplete`, `handleSaveMedia`, `handleDeleteRequest`, `handleToggleFavorite`, `addProgressLog`, `handleCommitGroupAction`, `handleAddFromAniList` relation patch'leri) lokal state'i güncellerken **aynı zamanda** kuyruğa item düşürür:

- `enqueueMediaUpsert(item)` / `enqueueMediaDelete(id)` / `enqueueProgressLog(log)`
- Coalescing: aynı `entity` + aynı `payload.id` için bekleyen kayıt yenisiyle değiştirilir.
- Online + login varsa anında `flush()`. Aksi halde queue bekler.
- `flush()`: snapshot alır, item başına `processItem` çağırır → `lib/supabase/cloud-repository.ts`'in `uploadMediaItems`/`uploadProgressLogs`/`deleteMediaItem` fonksiyonlarını kullanır. Başarılı id'ler kuyruktan silinir; başarısızlarda `retryCount++` ve `lastError` set edilir.
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

Örnekler: [app/page.tsx](app/page.tsx) `handleCommitGroupAction`, `handleAddFromAniList` (relation patches). Yeni bir batch güncelleme yazarken bu kalıba uy.

### Supabase katmanı

[lib/supabase/](lib/supabase/) altında dört dosya:
- `client.ts` — `createBrowserClient`, env yoksa `null` (cache'li).
- `server.ts` — `createServerClient` async helper (şu an UI'dan tüketilmiyor; auth eklendiğinde devreye girer).
- `status.ts` — `isSupabaseConfigured()` env kontrolü.
- `types.ts` — Elle yazılmış `Database` tipi. `Relationships: []` her tabloda zorunlu (`postgrest-js` `GenericTable` shape'i için). Generated type değil — schema değişirse manuel güncellenmeli.
- `mapping.ts` — `MediaItem ↔ media_items row` ve `ProgressLog ↔ progress_logs row` çevrimi. **Raw spread yok**, metadata için explicit `METADATA_KEYS` whitelist'i. `cover_url` null ise `/placeholders/{type}.svg` fallback.
- `cloud-repository.ts` — `ensure(userId)` discriminated union ile narrowing yapar; tüm fonksiyonlar `CloudResult<T>` döner.

**Yeni metadata alanı eklerken**: hem [lib/types.ts](lib/types.ts) `MediaItem` interface'ine alan eklenmeli, hem de [lib/supabase/mapping.ts](lib/supabase/mapping.ts) içindeki `METADATA_KEYS` listesine adı yazılmalı. Aksi halde alan cloud'a sızmaz, round-trip sırasında kaybolur. Örnek: V3'te `anilistRelations` her iki yere de eklendi.

### Şema (Supabase)

[supabase/schema.sql](supabase/schema.sql). **Önemli:** `media_items.id` ve `progress_logs.id` `text` (yerel `tvmaze-123`, `anilist-456`, `log-...` gibi string id'leri korumak için), `user_id` `uuid`. RLS her tablo için `auth.uid() = user_id` üzerinden. `progress_logs.detail` kolonu **yoktur** — yerel-only alan; upload'a gönderilmez. `media_items.metadata jsonb` kaynak-spesifik alanları (TVmaze/AniList/OpenLibrary/OMDb) tutar.

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

- **`react-hooks/set-state-in-effect`** lint kuralı aktif. Effect içinde sync setState etmek hata. Localstorage hidrasyonu için `eslint-disable-next-line react-hooks/set-state-in-effect` ile yorum gerekli olduğu yerlerde kullanıldı (örn. `app/page.tsx`'in mount-only effect'i).
- **`react-hooks/refs`** kuralı render sırasında `ref.current` okumayı yasaklar. `useAuth` bunu önlemek için `useState` lazy init ile client kontrolü yapar.
- **Modal state reset** kalıbı: `useEffect` ile prop-driven reset yerine "render sırasında prev-prop karşılaştırması" — bkz. `media-modal.tsx`, `quick-add-modal.tsx`, `manual-group-modal.tsx`.
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

## AI Danışman

[components/ai-advisor.tsx](components/ai-advisor.tsx) UI + [lib/ai/](lib/ai/) provider abstraction (`openai-compatible-provider`, settings, types). [app/api/ai/recommend/route.ts](app/api/ai/recommend/route.ts) proxy. AI sekmesi dışına çıkıldığında `aiResetSignal` artırılır → component aktif sohbeti sıfırlar (render sırasında setState etmeden, modal-style prop-karşılaştırma kalıbıyla).

## Dosya hiyerarşisi (özet)

```
app/             — page.tsx (tek route) + api/{tvmaze,anilist,openlibrary,omdb,tmdb,ai}/...
components/      — UI parçaları (modal, panel, kart, header, dashboard, ai-advisor)
hooks/           — useAuth, useSyncStatus
lib/             — storage, types, progress, dashboard-stats, mock-media, sync-manager,
                   sync-queue, backup, series-group, global-search-types,
                   {anilist,omdb,openlibrary,tmdb,tvmaze}{-types}.ts
lib/ai/          — AI provider (openai-compatible) + settings/types
lib/supabase/    — client, server, status, types, mapping, cloud-repository
supabase/        — schema.sql (RLS + index + trigger)
docs/            — supabase-offline-sync-plan.md
```

## Bilinçli olarak yapılmayanlar

- Test runner yok.
- `progress_logs.detail` cloud'a yazılmaz; yerel-only.
- Sync queue cross-user temizlenmez (giriş değişiminde queue'da bekleyen item olursa yeni user'a yazılır — RLS yine korur ama dikkat edilmeli).
- Cloud realtime/auto-pull yok — sadece yerel→cloud push otomatik. Cloud→local yalnızca `CloudTransferPanel` butonlarıyla manuel.
- AniList için **title benzerliği** ile otomatik gruplama yok — sadece persist edilmiş `anilistRelations` id eşleşmesi kullanılır. "Frieren Season 2" gibi kayıtlar relation verisi olmadan gruplanmaz.
- AniList relation tipleri için whitelist dar tutulmuştur: `PREQUEL`, `SEQUEL`, `PARENT`, `SIDE_STORY`. `ADAPTATION` (manga↔anime), `ALTERNATIVE`, `SPIN_OFF`, `CHARACTER`, `SUMMARY`, `COMPILATION`, `SOURCE`, `OTHER`, `CONTAINS` **yanlış pozitif riski** nedeniyle dışarıda. Genişletmeden önce iyi düşün.
- `handleSaveMedia`'nın merge davranışı (`{...exists, ...new}`) override yapar; bu yüzden Quick Add ve manuel grup akışları ayrı defansif yollarla locked/existing item'ları submit'e sızdırmaz. Yeni bir ekleme akışı yazarken aynı korumayı uygula.
- Manuel grup işlemleri yalnızca `SERIES_KEYS` whitelist'i (`seriesGroupId`, `seriesGroupTitle`, `seriesRelationType`, `seasonNumber`, `orderIndex`) yazar; diğer alanlara dokunmaz. Yeni bir series-only patch noktası eklerken aynı whitelist + render-phase kuralını uygula.
- Sahte `totalProgress = 1` fallback'i AniList normalizer'da yok (V3.2). Yeni bir kaynak normalizer'ı yazarken "bilinmiyorsa 0" semantiğine uy.
