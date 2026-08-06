# D7 Private Artifact Policy

Tarih: 6 Ağustos 2026  
Durum: D7-1A teknik policy; gerçek dataset/model artifact oluşturulmadı.

## Varsayılan private root

```text
private/recommendation-ml/
  workspaces/
  exports/
  backups/
  model-artifacts/
  logs/
```

Yalnız `/private/recommendation-ml/` Git ignore kapsamındadır. Tüm `private/` ağacı ignore edilmez. `D7_ANNOTATION_DATA_DIR` ile alternatif local root verilebilir; client bu yolu göremez veya değiştiremez.

Gerçek annotation, import, export, backup, log ve model artifact public Git'e girmez. Normal Git history'ye model dosyası konmaz. D7-2'de artifact boyutu/lisansı belirlendikten sonra private release artifact veya Git LFS kararı ayrıca verilir.

## Repo içinde kalabilenler

- Annotation tool source code ve saf sözleşmeler.
- Tamamen sentetik, kurgusal, bounded test fixture'ları.
- Machine-readable issue kodları ve kişisel veri içermeyen test çıktıları.
- Data/license/provenance/guideline dokümantasyonu.

Repo içinde kalamaz: gerçek eser synopsis/description, raw provider payload, görsel, katalog mirror, gerçek kullanıcı note/rating/favorite/progress/feedback/prompt, e-posta/UUID/profil, gerçek annotator kimliği, API key/secret veya gerçek private artifact.

## Saklama ve bütünlük

- Workspace source policy retention'ı kayıt bazında uygulanır; revocation yeni immutable kayıtla belgelenir.
- Checksum mismatch/corrupt state overwrite edilmez. Last-good backup ayrı kalır.
- Workspace başına en fazla 10 backup korunur.
- Audit log yalnız ID, event type, bounded sayaç ve timestamp taşır.
- Provider terms değişirse ilgili source policy/source reference/record/workspace revocation ile training/evaluation/export dışında bırakılır.
- Frozen workspace annotation mutation kabul etmez; revocation kabul eder.
- Revocation silinmez. Düzeltme, önceki ID'yi referanslayan replacement/reversal record'dur.

## Export policy

Export türleri workspace backup, annotation-only, adjudicated labels, training candidate ve evaluation candidate'dır. D7-1A yalnız candidate contract üretir; gerçek training dataset veya publishable gold üretmez.

Her export manifest, included record IDs, annotation/adjudication, provenance, source policy, revocation özeti, limitation, purpose, timestamp ve SHA-256 taşır. Varsayılan `internal_only`dir. Unresolved/non-training kaynak training candidate dışında; active revocation kapsamı ilgili export dışında kalır. Personal-data flag true ise fail; unresolved conflict evaluation candidate exportunu bloklar. Tek annotator limitation manifestte açık kalır.

## D7-1B'ye geçiş şartı

Kullanıcı private root'un cihaz yedeği/erişim politikasını belirlemeli, pseudonymous annotator oturumlarını oluşturmalı ve ikinci bağımsız insan annotator bulunabilirliğini netleştirmelidir. Pilot yalnız izinli sentetik veya bağımsız insan-yazımı kısa özetlerle başlar. Provider metni/corpus eklemek için ilgili resmî izin/provenance kararı ayrıca gerekir.
