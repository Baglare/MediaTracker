# MediaTracker Supabase + Offline-first Sync Plan

Bu doküman MediaTracker'ın Supabase'e geçişinin yol haritasını özetler. Şu an yalnızca **hazırlık altyapısı** mevcuttur; aktif yazma/okuma akışı henüz devrede değildir.

## Çalışma Modları

### 1. Local Mode (mevcut, varsayılan)
- Kullanıcı giriş yapmadan uygulamayı kullanır.
- Tüm veriler `localStorage` üzerinde tutulur.
- Supabase env değişkenleri tanımlı olmasa bile uygulama tam çalışır.

### 2. Cloud Mode (gelecek)
- Kullanıcı Supabase üzerinden giriş yapar.
- Veriler Supabase'e yazılır ve oradan okunur.
- İlk girişte "Yerel verileri hesabıma aktar" seçeneği sunulur (migration).

### 3. Offline Sync Mode (gelecek)
- Kullanıcı giriş yapmış ama internet erişimi yok.
- Değişiklikler `localStorage`'a yazılmaya devam eder.
- Aynı zamanda `sync-queue` içine alınır (`media-tracker-sync-queue`).
- İnternet geri geldiğinde queue Supabase'e flush edilir.

## Conflict Policy (V1)

- **media_items**: `updated_at` daha yeni olan kazanır (last-write-wins).
- **progress_logs**: append-only; `id` bazlı duplicate engellenir, içerik değişmez.
- **tags**: V1'de last-write-wins. İleride union/merge stratejisi düşünülebilir.

## Sync Queue Yapısı

`SyncQueueItem` tipi (bkz. `lib/types.ts`):

```ts
{
  id: string;
  entity: "media_item" | "progress_log";
  operation: "upsert" | "delete";
  payload: unknown;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}
```

Helper'lar (`lib/sync-queue.ts`):
- `loadSyncQueue()`, `saveSyncQueue()`
- `enqueueSyncOperation()`, `clearSyncQueue()`, `getPendingSyncCount()`

> Şu anda **hiçbir akıştan kuyruğa yazma yapılmıyor.** Mevcut storage flow korunmuş durumda.

## Migration Akışı (Planlanan)

1. Kullanıcı giriş yapar.
2. Ayarlar sekmesinde "Yerel verileri hesabıma aktar" butonu görünür.
3. Onay sonrası `mediaItems` ve `progressLogs` Supabase'e batch upsert edilir.
4. Başarılı sonrası local mod `cloud` moduna geçer.
5. localStorage anahtarları korunur (rollback ihtimaline karşı).

## Aşamalı Yol Haritası

| Faz | Kapsam | Durum |
|-----|--------|-------|
| 0   | Supabase client/types/sync-queue iskeleti, SQL şema, RLS taslakları | ✅ Bu PR |
| 1   | Auth (Supabase OAuth/magic link) ekranı | ⏳ |
| 2   | Cloud read/write akışı, repository katmanı | ⏳ |
| 3   | Local → Cloud migration butonu | ⏳ |
| 4   | Offline sync queue flush worker | ⏳ |
| 5   | Conflict resolution UI | ⏳ |

## Şu An Bilinçli Olarak Yapılmayanlar

- Auth UI (login/register) eklenmedi.
- Supabase'e veri yazma/okuma yapılmıyor.
- Mevcut localStorage flow değiştirilmedi.
- Sync queue hiçbir yerden çağrılmıyor.
- API route'ları değiştirilmedi.
