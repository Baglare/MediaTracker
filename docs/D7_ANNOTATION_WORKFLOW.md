# D7-1A Annotation Workflow ve D7-1B Sparse Hazırlık

> **D7-R0 durum notu (8 Ağustos 2026):** Bu workflow archived calibration/evaluation tooling kaydıdır; aktif D7 release yolu değildir. Mevcut private workspaces korunur. D7-1B ana pilotu veya başka yeni annotation yapılması beklenmez. Aktif yol: [D7 Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md).

Tarih: 8 Ağustos 2026
Durum: Local tool workflow arşivlendi; yeni pilot annotation/label üretimi planlanmıyor.

## Başlatma

Local `.env.local` içinde:

```dotenv
D7_ANNOTATION_TOOL_ENABLED=1
D7_ANNOTATION_DATA_DIR=private/recommendation-ml
```

`npm run dev` sonrasında yalnız loopback host üzerinden `/dev/recommendation-annotation` açılır. Production'da flag açık olsa bile UI/API 404 verir. Tool public navigation'da yoktur.

## 1. Workspace

Workspace ID 3–48 karakter, lowercase/digit/hyphen formatındadır. Yeni workspace `draft` olur ve registry'den gelen 12 MVP aspect'i seçer: romance, fantasy, action, comedy, political intrigue, power progression, love triangle, fanservice, dark, slow burn, character driven ve plot driven. Revenge, academy, horror ve mystery daha sonra explicit ayarla eklenebilir.

Status sırası: `draft`, `internal_pilot`, `annotation_in_progress`, `ready_for_adjudication`, explicit/manual `gold_candidate`, `frozen`, `revoked`. Tool kendiliğinden gold candidate yapmaz. Frozen annotation mutation'ı reddeder; revocation her zaman mümkündür.

## 2. Import preview ve onay

Tool provider fetch yapmaz. Yalnız version 1 local JSON bundle alınır. Codec exact/synthetic identity, candidate/provenance, literal personalData=false, bounded summary, düz metin, checksum ve source policy version doğrular.

Import önce salt-okunur preview üretir: total, valid, invalid, duplicate-same, duplicate-conflict, unresolved license, revoked ve task üretilebilecek kayıt. Kullanıcı açıkça “Onayla ve import et” demeden mutation yapılmaz. Aynı identity + aynı payload skip-same; farklı payload conflict'tir ve sessiz overwrite edilmez.

## 3. Task üretimi

Deterministik seçenekler bütün seçili aspect'ler, registry aspect grubu, explicit record/aspect listesi veya explicit aspect/record filtresidir. D7-1A akıllı sampling yapmaz. Duplicate record/aspect/round atlanır. Sıra priority descending, record ID, aspect ID ve round'dur.

UI iki açık mod sunar:

- **Tüm seçili aspect'ler:** `record × selected aspect` toplamını ve mevcut task'lar düşüldükten sonra oluşacak yeni sayıyı önceden gösterir. 50'den fazla yeni task için ayrı checkbox onayı olmadan mutation göndermez. Mevcut `all_selected` backend davranışı korunur.
- **Sparse explicit plan:** Version 1 local JSON dosyası veya textarea kullanır. Yalnız `version`, `workspaceId`, `pairs`; her pair içinde yalnız `recordId`, `aspectId` kabul edilir. En fazla 1000 pair, duplicate olmama, aktif workspace eşleşmesi, mevcut record ve registry + selected aspect şartları preview'da doğrulanır. Unknown alan fail-closed'dur.

Sparse preview toplam pair, benzersiz record/aspect, duplicate, geçersiz record/aspect, mevcut task ve oluşturulabilir task sayılarını gösterir; mutation yapmaz. Kullanıcı ayrıca “Sparse task'ları üret” demeden API çağrısı yapılmaz. UI doğrulaması ergonomiktir; server mevcut `generate_tasks` + `{ mode: "explicit", pairs }` akışında record/aspect/immutability ve duplicate-skip kurallarının source of truth'u kalır.

Private D7-1B planı `private/recommendation-ml/imports/aspect-pilot-anime-v1-task-plan.json` konumundadır ve Git'e girmez. Yalnız task ataması taşır; label, confidence, expected result, provider tag/rank veya annotation cevabı içermez.

Default round 1 ve required count 1'dir. Gold validation/test subset D7-1B'de count 2 yapabilir.

## 4. Annotation

Annotator gerçek ad/e-posta yerine 3–32 karakter pseudonymous internal ID kullanır. Beş label: Yok, İkincil, Belirgin, Ana unsur ve Yetersiz kanıt. Annotation confidence model confidence değildir. Evidence/contradiction notu 280 karakterdir ve uzun provider alıntısı taşımaz.

Save task/workspace mutable, record/aspect/annotator geçerli ve revision güncel ise çalışır. Stale revision 409 verir ve client current state'i yeniden yükler. Update eski annotation'ı silmez; inactive/superseded history tutar. Her annotator/task/round için tek active revision vardır.

Tek annotator pilot `internal_pilot` kalır. Yeni human save için `assistanceMode` explicit seçilir: `independent_human` veya `assisted_human`. Eski kayıtta alan yoksa read-model `unknown_legacy` üretir; ham legacy dosya otomatik migration için rewrite edilmez. Aynı kişinin ikinci revision/geçişi bağımsız annotation değildir. Gold validation/test için taskların en az yüzde 20'sinde iki farklı insan annotator ID ve yalnız `independent_human` annotation gerekir. Assisted, unknown legacy, AI/model veya synthetic contract annotation agreement sayılmaz.

## 5. Conflict ve adjudication

İki bağımsız active annotation aynı label ise agreement; label farklıysa conflict'tir. Confidence farkı tek başına conflict değildir. `insufficient_evidence` ile başka her label conflict'tir.

Adjudication iki kaynak annotation ID'sini, final label/confidence, pseudonymous adjudicator ve bounded rationale'ı saklar. Kaynak annotation'lar silinmez. Adjudicator kaynak annotator'lardan biriyse limitation flag'i korunur; üçüncü kişi tercih edilir ama zorunlu değildir.

## 6. Revocation

Revocation source policy, source reference, record veya workspace kapsamındadır. License/permission/provenance/personal-data/contamination/manual withdrawal nedenleri ve training/evaluation/export/internal-only action'ları taşır. Aktif revocation task ve export filtrelerine uygulanır; etkilenen record ID'leri raporlanır. Düzeltme silme değildir; replacement/reversal record eski ID'yi referanslar.

## 7. Validation ve export

Validation critical, warning ve info issue'ları Türkçe mesaj + stable code olarak üretir. Manifest dataset hash mismatch critical'dir. Assistance unknown/assisted, independent double coverage eksikliği, conflict ve input sufficiency warning'dir. Coverage yalnız non-excluded task aspect'lerinde ölçülür; selected olup task planına girmeyen aspect info'dur. Her task aspect'i için annotation/insufficient sayısı ve oranı raporlanır; `n >= 3` ve oran `>= %50` ise `annotation_aspect_input_insufficient` üretilir.

Candidate export browser download olarak verilebilir; private path gösterilmez. `annotation_only` assistance provenance ile bütün active kayıtları audit için koruyabilir. Training/evaluation/adjudicated label setleri assisted veya unknown legacy annotation kabul etmez ve limitation raporlar. Export manifest hash'i current workspace dataset hash'idir; top-level export hash'i export bundle bütünlüğünü kanıtlayan ayrı değerdir.

Metadata reconcile önce salt-okunur preview verir. Explicit apply, current `workspace.json` için atomic bounded backup oluşturur; manifest content hash'i recompute eder ve task varsa manifest aspect kapsamını non-excluded task aspect'lerine getirir. Annotation label/confidence/note dosyası rewrite edilmez.

## D7-1B operatör adımları

1. Private root ve yedekleme/erişim kararını verin.
2. Pilot annotator pseudonym'lerini atayın; mümkünse ikinci bağımsız insanı belirleyin.
3. Yalnız izinli sentetik/insan-yazımı kısa bundle hazırlayın; checksum/provenance validation çalıştırın.
4. 40–60 unique work için başlangıçta `romance`, `fantasy`, `political_intrigue`, `power_progression`, `love_triangle`, `character_driven` task planını preview ile doğrulayın; explicit üretim için ayrıca onay verin.
5. En az yüzde 20 double-annotation subset'i seçin; conflict'leri adjudicate edin.
6. Guideline sorunlarını belgeleyin; gold_candidate durumuna otomatik geçmeyin.

Etiket semantiği için [Annotation Guidelines](D7_ANNOTATION_GUIDELINES.md), storage sınırı için [Private Artifact Policy](D7_PRIVATE_ARTIFACT_POLICY.md) kullanılır.
