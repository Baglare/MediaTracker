# D7-1A Annotation Tool Architecture

Tarih: 6 Ağustos 2026  
Durum: Local-development araç ve sözleşme tamamlandı; gerçek pilot/gold veri yoktur.

## Güvenlik sınırı

Araç `/dev/recommendation-annotation`, API ise `/api/dev/recommendation-annotation` altındadır. Public navigation'a bağlanmaz ve admin paneli değildir. UI ve API aynı server-side policy'yi kullanır:

| Koşul | Sonuç |
| --- | --- |
| `NODE_ENV=production` | Her durumda 404 |
| `D7_ANNOTATION_TOOL_ENABLED` değeri `1` değil | 404 |
| Host `localhost`, `127.0.0.1` veya `::1` değil | 404 |
| Development + flag `1` + loopback host | İzin |

Red response yalnız `not_found` taşır; policy nedeni, private root veya filesystem hatası açıklanmaz. Flag `NEXT_PUBLIC_` değildir. Server page guard `notFound()`, API guard aynı saf access policy'sini uygular. Route Node runtime, `force-dynamic` ve `private, no-store` response kullanır.

## Katmanlar

- `annotation-tool/domain`: workspace/task/annotation/adjudication/revocation/import/export tipleri, strict codec, bounded ID ve 12-aspect sabitleri.
- `annotation-tool/storage`: root containment, symlink kontrolü, process-local workspace lock, checksum, backup ve atomic dosya kalıcılığı.
- `annotation-tool/server`: access/response guard, workflow servisleri ve repository orchestration.
- `annotation-tool/ui`: yalnız dev API read-model tüketen responsive annotation arayüzü.
- App route dosyaları yalnız guard ve dispatcher taşır; filesystem/domain mantığı taşımaz.

UI hiçbir provider endpoint'ine istek atmaz. Server'da AniList, TVMaze, TMDB, OMDb veya Open Library adapter'ı import edilmez. Model, embedding, recommendation ranking, DB veya Supabase bağlantısı yoktur.

## API görevleri

Tek guarded endpoint ince bir action dispatcher'dır: workspace list/create/read, import preview/apply, deterministic task generation, revision-controlled annotation save/update, adjudication, revocation, validation, sanitised export, backup ve explicit status transition. Request body 5 MB ile sınırlıdır; malformed body 400, büyük body 413, stale revision 409 olur.

Client path, filename veya extension gönderemez. Server yalnız bounded workspace ID kabul eder ve sabit dosya adlarını kendisi seçer.

## Workspace dosyaları

Her workspace yalnız şu sabit dosyalara sahiptir:

```text
workspaces/<workspaceId>/
  workspace.json
  records.json
  tasks.json
  annotations.json
  adjudications.json
  revocations.json
  audit-log.ndjson
  checksums.json
```

`workspace.json` D7 manifesti, status, seçili registry aspect'leri ve policy/guideline versionlarını taşır. Record dosyası codec'ten geçmiş candidate + provenance + exact/synthetic identity ve literal `personalData=false` taşır. Audit log summary, evidence note, path, prompt, secret veya kişisel kimlik kopyalamaz.

## Atomic persistence

Her mutation workspace bazlı process-local lock içindedir. Yazma akışı:

1. Current state ve checksum okunur; corrupt current overwrite edilmez.
2. Yeni değer codec'ten geçer ve server-chosen temp dosyaya yazılır.
3. File handle sync edilir; temp geri okunup byte ve SHA-256 doğrulanır.
4. Current dosya doğrulanmış bounded backup'a kopyalanır.
5. Windows uyumu için current aynı volume'da server-generated previous adına taşınır; temp final ada rename edilir.
6. Final read-back doğrulanır; hata olursa previous current konumuna geri alınır.
7. Temp/previous temizlenir, checksum manifesti yenilenir.

Backup'lar workspace başına en fazla 10'dur; en eski lexical timestamp/sequence adına göre silinir. Testler yalnız OS temporary directory kullanır. Normal D7-1A test veya demo akışı repo içindeki private root'a gerçek workspace yazmaz.

## UI ve erişilebilirlik

Masaüstü task/record/form üçlü düzeni; mobil tek kolon düzeni kullanır. Aspect adı/açıklaması 43-aspect registry'den gelir. Raw provider payload, private path, gerçek annotator kimliği veya model prediction gösterilmez.

Label ve confidence alanları radio semantics, ilişkili label, screen-reader progress ve alan açıklaması taşır. Kısayollar `1..5`, `Shift+1..3`, `Ctrl+S`, `N`, `P` şeklindedir; input/textarea/select/contenteditable odağında tetiklenmez. Sürekli her tuşta autosave yoktur; explicit submit kullanılır.

## Fixture ve test sınırı

`tests/fixtures/recommendations-v2/annotation-tool/` altında 10 tamamen kurgusal kısa kayıt ve iki çelişkili sentetik annotation bulunur. Bu artifact yalnız UI demo, contract test ve browser smoke içindir; training/gold dataset değildir.

İlgili politikalar: [Private Artifact Policy](D7_PRIVATE_ARTIFACT_POLICY.md), [Annotation Workflow](D7_ANNOTATION_WORKFLOW.md), [Dataset Provenance](D7_DATASET_PROVENANCE.md).
