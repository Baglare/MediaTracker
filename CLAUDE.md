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

Next.js 16 App Router + React 19 + Tailwind 4 üzerine kurulu, **offline-first**, tek-sayfalık (sekmeli) bir medya takip uygulaması. Tek route var: `app/page.tsx`. Tüm UI sekmeleri (Dashboard / Kütüphanem / Keşfet / Aktivite / Ayarlar) burada koşullu render ile yönetiliyor.

### Veri akışı: localStorage öncelikli, Supabase opsiyonel

İki kaynak var, ama **localStorage tek "source of truth"**. Supabase aktifken bile UI hâlâ `mediaList`/`progressLogs` React state'inden render olur; Supabase yalnızca arka planda kuyruktan flush edilir.

- **localStorage anahtarları** ([lib/storage.ts](lib/storage.ts), [lib/sync-queue.ts](lib/sync-queue.ts)):
  - `media-tracker-list` — `MediaItem[]`
  - `media-tracker-logs` — `ProgressLog[]`
  - `media-tracker-sync-queue` — `SyncQueueItem[]`
- Mount'ta `app/page.tsx` storage'tan okur. Sonraki tüm değişikliklerde otomatik yazma için bir `useEffect`.
- Supabase env yoksa veya kullanıcı giriş yapmadıysa hiçbir cloud çağrısı tetiklenmez.

### Sync mimarisi

[lib/sync-manager.ts](lib/sync-manager.ts) singleton bir orchestrator'dır. Mutasyon noktaları (`app/page.tsx` içindeki `handleIncrement`, `handleComplete`, `handleSaveMedia`, `handleDeleteRequest`, `handleToggleFavorite`, `addProgressLog`) lokal state'i güncellerken **aynı zamanda** kuyruğa item düşürür:

- `enqueueMediaUpsert(item)` / `enqueueMediaDelete(id)` / `enqueueProgressLog(log)`
- Coalescing: aynı `entity` + aynı `payload.id` için bekleyen kayıt yenisiyle değiştirilir.
- Online + login varsa anında `flush()`. Aksi halde queue bekler.
- `flush()`: snapshot alır, item başına `processItem` çağırır → `lib/supabase/cloud-repository.ts`'in `uploadMediaItems`/`uploadProgressLogs`/`deleteMediaItem` fonksiyonlarını kullanır. Başarılı id'ler kuyruktan silinir; başarısızlarda `retryCount++` ve `lastError` set edilir.
- `window`'un `online`/`offline` event'leri otomatik flush tetikler.
- UI subscribe için `useSyncStatus()` hook'u (`useSyncExternalStore` üzerine kurulu).

**Cloud→local yönü** (`CloudTransferPanel`'in download/merge butonları, `DataManagementPanel` import'u, `handleResetRequest` mock geri yükleme) sync queue'ya **yazmaz** — yoksa loop olur.

### Supabase katmanı

[lib/supabase/](lib/supabase/) altında dört dosya:
- `client.ts` — `createBrowserClient`, env yoksa `null` (cache'li).
- `server.ts` — `createServerClient` async helper (şu an UI'dan tüketilmiyor; auth eklendiğinde devreye girer).
- `status.ts` — `isSupabaseConfigured()` env kontrolü.
- `types.ts` — Elle yazılmış `Database` tipi. `Relationships: []` her tabloda zorunlu (`postgrest-js` `GenericTable` shape'i için). Generated type değil — schema değişirse manuel güncellenmeli.
- `mapping.ts` — `MediaItem ↔ media_items row` ve `ProgressLog ↔ progress_logs row` çevrimi. **Raw spread yok**, metadata için explicit `METADATA_KEYS` whitelist'i. `cover_url` null ise `/placeholders/{type}.svg` fallback.
- `cloud-repository.ts` — `ensure(userId)` discriminated union ile narrowing yapar; tüm fonksiyonlar `CloudResult<T>` döner.

### Şema (Supabase)

[supabase/schema.sql](supabase/schema.sql). **Önemli:** `media_items.id` ve `progress_logs.id` `text` (yerel `tvmaze-123`, `anilist-456`, `log-...` gibi string id'leri korumak için), `user_id` `uuid`. RLS her tablo için `auth.uid() = user_id` üzerinden. `progress_logs.detail` kolonu **yoktur** — yerel-only alan; upload'a gönderilmez. `media_items.metadata jsonb` kaynak-spesifik alanları (TVmaze/AniList/OpenLibrary) tutar.

### Auth

[hooks/use-auth.ts](hooks/use-auth.ts) `useAuth()` Supabase env yoksa `configured=false`/`user=null` ile sessizce çalışır. Auth UI yalnızca [components/auth-panel.tsx](components/auth-panel.tsx) (e-posta + şifre, kayıtta tekrar). Tüm hata mesajları Türkçe (`translateAuthError`).

### Aktivite log birleştirme

[app/page.tsx](app/page.tsx)'in `addProgressLog` fonksiyonu `increment` ve `manual_adjust` için 1 saatlik pencerede aynı medyaya art arda gelen logları birleştirir (`amount` toplanır, `newProgress` güncellenir, log id'si değişmez → coalescing ile sync upsert tek kalır). `complete` ve `added` birleştirilmez.

## React 19 / Next.js 16 dikkat noktaları

- **`react-hooks/set-state-in-effect`** lint kuralı aktif. Effect içinde sync setState etmek hata. Localstorage hidrasyonu için `eslint-disable-next-line react-hooks/set-state-in-effect` ile yorum gerekli olduğu yerlerde kullanıldı (örn. `app/page.tsx`'in mount-only effect'i).
- **`react-hooks/refs`** kuralı render sırasında `ref.current` okumayı yasaklar. `useAuth` bunu önlemek için `useState` lazy init ile client kontrolü yapar.
- **Modal state reset** kalıbı: `useEffect` ile prop-driven reset yerine "render sırasında prev-prop karşılaştırması" — bkz. `media-modal.tsx`, `quick-add-modal.tsx`.
- Server component'lerde `cookies()` artık async; `lib/supabase/server.ts` buna göre yazılmış.

## Modal sistemi

Üç modal app/page.tsx tarafından koordine ediliyor:
- `MediaModal` — manuel ekle/düzenle (akıllı form, türe göre alanlar).
- `MediaDetailModal` — detay görünümü; `detailMediaId` state'i ile mediaList'ten her zaman güncel item çekilir (`useMemo`).
- `QuickAddModal` — Global Search/external sonuç ekleme. TVmaze çok-sezonlu sonuçlar için iki mod: "Tek Kayıt" (birleşik) / "Sezonları Ayrı Ekle" (sezon checkbox'ları + "Tümünü Seç").

## Dış kaynak entegrasyonları

API route'ları proxy görevi görür (`app/api/{tvmaze,anilist,openlibrary,tmdb}/...`). UI'daki "Global Search" + üç ayrı arama paneli (TVmaze, AniList, Open Library) bu route'ları çağırır. TMDB pasif (UI'dan erişim yok ama route var).

`next.config.ts` bu kaynakların image hostname'lerini `remotePatterns` olarak whitelist'ler — yeni bir görsel kaynağı eklendiğinde buraya da eklenmeli.

## Dosya hiyerarşisi (özet)

```
app/             — page.tsx (tek route) + api/* (proxy)
components/     — UI parçaları (modal, panel, kart, header, dashboard)
hooks/          — useAuth, useSyncStatus
lib/            — storage, types, progress, dashboard-stats, mock-media, sync-manager, sync-queue, backup
lib/supabase/   — client, server, status, types, mapping, cloud-repository
supabase/       — schema.sql (RLS + index + trigger)
docs/           — supabase-offline-sync-plan.md
```

## Bilinçli olarak yapılmayanlar

- Test runner yok.
- `progress_logs.detail` cloud'a yazılmaz; yerel-only.
- Sync queue cross-user temizlenmez (giriş değişiminde queue'da bekleyen item olursa yeni user'a yazılır — RLS yine korur ama dikkat edilmeli).
- Cloud realtime/auto-pull yok — sadece yerel→cloud push otomatik. Cloud→local yalnızca `CloudTransferPanel` butonlarıyla manuel.
