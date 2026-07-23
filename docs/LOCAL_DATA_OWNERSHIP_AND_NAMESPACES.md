# Local Data Ownership and Namespaces

## Kapsam

D1B.2A, media library, progress log, cloud sync queue ve recommendation local link verilerini açık owner scope'larına ayırır. Local profile, avatar data URL fallback'i, custom theme kataloğu ve AI state D1B.2B kapsamındadır. Appearance, density/effects, dashboard layout ve startup tab bu aşamada bilinçli olarak device-scoped kalır.

## Owner scope modeli

- Signed-out kullanım: `guest`
- Authenticated kullanım: Supabase `auth.uid()` ile üretilen `user:<id>`
- Storage anahtarında: `guest` veya allowlist doğrulamasından geçmiş `user-<id>`

Kullanıcı adı, e-posta veya serbest metin scope kimliği olarak kullanılmaz. UUID gizli kabul edilmez; izolasyon doğru key ve envelope-owner eşleşmesine dayanır.

## Key formatı

| Veri | Key |
|---|---|
| Media | `mediaTracker:data:v2:<scope>:media` |
| Progress log | `mediaTracker:data:v2:<scope>:progressLogs` |
| Cloud queue | `mediaTracker:queue:v1:<scope>:cloudSync` |
| Recommendation link | `mediaTracker:cache:v1:<scope>:recommendationLinks` |

Media ve log current/temp/backup slotları aynı scope içinde kalır. Component'ler key string'i üretmez; `buildLocalDataKeys`, `buildSyncQueueKey` ve `buildRecommendationLinksKey` kullanılır.

## Envelope owner

Scoped envelope schema v2 şu metadata'yı taşır:

```json
{
  "format": "mediatracker-local-data",
  "domain": "media-library",
  "schemaVersion": 2,
  "writerVersion": "D1B.2A",
  "ownerScope": "user:<auth.uid>",
  "datasetOrigin": "user",
  "writtenAt": "2026-07-23T10:00:00.000Z",
  "recordCount": 0,
  "records": []
}
```

Key scope ile `ownerScope` uyuşmazlığı `owner_mismatch` sonucudur. Bu veri corrupt sayılmaz, açılmaz, başka scope'a fallback yapılmaz ve üzerine yazılmaz.

`datasetOrigin` değerleri `demo`, `user` ve `legacy` olarak sınırlıdır.

## Auth transition

Auth yüklenirken owner scope bilinmez ve library hydration başlamaz. Scope değiştiğinde:

1. Cloud queue flush kapatılır.
2. Önceki visible media/log state render sözleşmesinde gizlenir.
3. Yeni scope yüklenir ve codec/integrity doğrulanır.
4. Hydration generation hâlâ güncelse state açılır.
5. Yalnız doğrulanmış yeni owner side-effect flush edebilir.

Bu sıra A → B, B → logout ve rapid switch sırasında eski owner'ın tek frame görünmesini veya stale async sonucun yeni state'i ezmesini engeller.

## Guest scope ve demo politikası

Guest library normal local-first kullanımdır ve reload sonrası korunur. Guest queue cloud'a flush edilmez ve login olan kullanıcıya otomatik etiketlenmez.

Demo snapshot yalnız missing guest namespace için oluşturulur. Authenticated missing namespace gerçek empty library açar. Demo origin cloud queue veya XP full-sync üretmez ve ownership gate'e gerçek kullanıcı verisi olarak sunulmaz.

İlk gerçek guest mutasyonunda dataset `user` origin'e çevrilir. Değişmemiş demo kayıtları çıkarılır; eklenen veya gerçekten değiştirilen kayıtlar korunur.

## Legacy ownership gate

D1B.1 global envelope ve `media-tracker-list` / `media-tracker-logs` kaynakları silinmez.

- Signed-out açılışta geçerli unscoped veri raw backup sonrası guest scope'a safe-write ile kopyalanabilir.
- Authenticated açılışta gerçek unscoped veri otomatik atanmaz; minimal ownership gate gösterilir.
- Hedef user namespace doluysa record-level merge yapılmaz.

Kararlar versioned ve user-scope'a özeldir:

- `assigned_to_guest`
- `assigned_to_user`
- `deferred`
- `kept_existing_user_data`

Deferred karar her açılışta blocking prompt üretmez; ana library ekranındaki uyarıdan yeniden açılabilir. Global kaynak ve ownership raw backup korunur.

## Queue isolation

Cloud queue öğesinde `ownerScope` zorunludur. User queue öğesi ayrıca aynı Supabase user ID'yi taşımalıdır. Coalescing scope + entity + entity ID sınırında yapılır.

Ownerless legacy queue ilk kullanıcıya verilmez; raw payload quarantine kaydında korunur. Logout queue'yu silmez. Guest adoption sırasında guest queue yeniden etiketlenmez; kullanıcı onaylı sahiplenmede doğrulanmış current snapshot'tan yeni user-owned sync planı oluşturulur.

Scope değişimi devam eden eski flush'ın sonucunu eski queue'ya uygular; yeni owner'ın queue/state durumunu değiştirmez.

## XP ve social outbox

XP ve social outbox öğeleri `userId` ile eşleşmeden flush edilmez. Foreign öğeler current kullanıcı tarafından işlenmez. Owner alanı eksik veya geçersiz legacy öğeler ilk kullanıcıya adopt edilmez; D1D'de incelenmek üzere ayrı quarantine kaydında korunur.

Global XP/social outbox key'leri bu aşamada değiştirilmemiştir; idempotency ve foreign-user retention davranışı korunur.

## Recommendation local links

Cloud recommendation kaydı değişmez. Yalnız cihazdaki recommendation → local media projection kaydı user scope key'ine taşınmıştır. A, B ve guest scope'ları birbirinin “kütüphaneye bağlandı” durumunu devralmaz.

## Device-scoped kalan tercihler

Bu aşamada aşağıdakiler cihaz ayarıdır ve auth değişiminde resetlenmez:

- Base appearance
- Density ve effects
- Dashboard layout
- Startup tab

Bu karar, D1B.2B'ye bırakılan kişisel verilerle aynı değildir.

## D1B.2B planı

- Local profile preference ve avatar data URL fallback'i
- Custom theme kataloğu ve theme cloud sync metadata'sı
- AI advisor session, feedback ve preference state'i
- Diğer kişisel local cache'lerin ownership sınıflandırması

## D2 sınırları

Supabase composite primary key, revision, tombstone, field-level merge ve conflict motoru bu local namespace aşamasına eklenmemiştir.

## Manuel testler

1. Guest olarak gerçek medya ekle.
2. User A ile giriş yap; ownership gate'in otomatik atama yapmadığını doğrula.
3. Veriyi User A'ya ata ve F5 sonrası korunduğunu doğrula.
4. Logout sonrası guest namespace'i kontrol et.
5. User B ile giriş yap; User A verisinin görünmediğini doğrula.
6. A ve B'ye aynı external ID'li medya ekleyip queue anahtarlarının ayrıldığını doğrula.
7. A → B hızlı geçişinde eski library flash'ı olmadığını gözle.
8. User A'ya dönüp media/log verisinin korunduğunu doğrula.
9. Salt demo guest snapshot'ının cloud/XP queue üretmediğini kontrol et.

## Bilinen sınırlamalar

- Web Storage gerçek transaction ve cross-tab lock sunmaz.
- Ownership gate record-level merge yapmaz.
- Quarantine retention ve merkezi inceleme D1D/D1F kapsamındadır.
- Foreign XP/social outbox öğeleri otomatik silinmez; uzun süre birikebilir.
- Browser iki-hesap smoke testi unit testlerin yerine geçmez ve ayrıca raporlanmalıdır.
