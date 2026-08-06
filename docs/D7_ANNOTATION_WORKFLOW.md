# D7-1A Annotation Workflow

Tarih: 6 Ağustos 2026  
Durum: Local tool workflow hazır; pilot annotation D7-1B'de başlayacaktır.

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

Default round 1 ve required count 1'dir. Gold validation/test subset D7-1B'de count 2 yapabilir.

## 4. Annotation

Annotator gerçek ad/e-posta yerine 3–32 karakter pseudonymous internal ID kullanır. Beş label: Yok, İkincil, Belirgin, Ana unsur ve Yetersiz kanıt. Annotation confidence model confidence değildir. Evidence/contradiction notu 280 karakterdir ve uzun provider alıntısı taşımaz.

Save task/workspace mutable, record/aspect/annotator geçerli ve revision güncel ise çalışır. Stale revision 409 verir ve client current state'i yeniden yükler. Update eski annotation'ı silmez; inactive/superseded history tutar. Her annotator/task/round için tek active revision vardır.

Tek annotator pilot `internal_pilot` kalır. Aynı kişinin ikinci revision/geçişi bağımsız annotation değildir. Gold validation/test için taskların en az yüzde 20'sinde iki farklı insan annotator ID ve bağımsız annotation gerekir. AI/LLM pre-label D7-1A'da yoktur ve gelecekte human count'a giremez.

## 5. Conflict ve adjudication

İki bağımsız active annotation aynı label ise agreement; label farklıysa conflict'tir. Confidence farkı tek başına conflict değildir. `insufficient_evidence` ile başka her label conflict'tir.

Adjudication iki kaynak annotation ID'sini, final label/confidence, pseudonymous adjudicator ve bounded rationale'ı saklar. Kaynak annotation'lar silinmez. Adjudicator kaynak annotator'lardan biriyse limitation flag'i korunur; üçüncü kişi tercih edilir ama zorunlu değildir.

## 6. Revocation

Revocation source policy, source reference, record veya workspace kapsamındadır. License/permission/provenance/personal-data/contamination/manual withdrawal nedenleri ve training/evaluation/export/internal-only action'ları taşır. Aktif revocation task ve export filtrelerine uygulanır; etkilenen record ID'leri raporlanır. Düzeltme silme değildir; replacement/reversal record eski ID'yi referanslar.

## 7. Validation ve export

Validation critical, warning ve info issue'ları Türkçe mesaj + stable code olarak üretir. Critical: provenance/license/personal-data/exact identity/checksum/duplicate/revoked/annotation/split sorunları. Warning: single annotator, düşük double coverage, conflict, coverage ve excessive insufficient evidence. Info: progress ve aspect dağılımı.

Candidate export browser download olarak verilebilir; private path gösterilmez. Evaluation candidate unresolved conflict'i kabul etmez. Bütün exportlar internal-only ve checksum'lıdır; gerçek training/gold artifact iddiası taşımaz.

## D7-1B operatör adımları

1. Private root ve yedekleme/erişim kararını verin.
2. Pilot annotator pseudonym'lerini atayın; mümkünse ikinci bağımsız insanı belirleyin.
3. Yalnız izinli sentetik/insan-yazımı kısa bundle hazırlayın; checksum/provenance validation çalıştırın.
4. 40–60 unique work ve 6–8 aspect pilot task listesini sampling planına göre dışarıda belirleyip explicit import edin.
5. En az yüzde 20 double-annotation subset'i seçin; conflict'leri adjudicate edin.
6. Guideline sorunlarını belgeleyin; gold_candidate durumuna otomatik geçmeyin.

Etiket semantiği için [Annotation Guidelines](D7_ANNOTATION_GUIDELINES.md), storage sınırı için [Private Artifact Policy](D7_PRIVATE_ARTIFACT_POLICY.md) kullanılır.
