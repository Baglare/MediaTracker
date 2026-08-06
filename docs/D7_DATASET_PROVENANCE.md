# D7 Dataset Provenance Contract

Durum: D7-0 saf domain/codec sözleşmesi. Dataset kaydı içermez ve provider/model ağı kullanmaz.

## Kod yüzeyi

`features/recommendations/evaluation/dataset/`:

- `types.ts`: source policy, manifest, record provenance, candidate text, annotation ve verifier output tipleri.
- `codec.ts`: fail-closed runtime codec, bounded text ve probability validation.
- `provenance.ts`: training/publication policy yardımcıları ve retained-field yasağı.
- `validation.ts`: package-level provenance, license, publication, duplicate ve split leakage invariant'ları.

`tests/recommendation-d7-dataset-contract.test.ts` yalnız sentetik küçük nesnelerle sözleşmeyi doğrular; gerçek eser metni veya provider response'u içermez.

## DatasetSourcePolicy

Her kaynak manifest'te benzersiz `sourceId` ile tanımlanır:

- `sourceType`: provider API, synthetic, human rewritten, open licensed, internal fixture veya model/dataset registry.
- `useClass`: `runtime_only`, `evaluation_snapshot_allowed`, `annotation_reference_only`, `training_allowed`, `training_requires_permission`, `prohibited_or_unresolved`.
- `allowedUses`: runtime reference, annotation, evaluation, training, internal research, publication.
- `licenseStatus`: confirmed, conditional veya unresolved.
- `attribution`, `retention`, `redistribution`, `notes`.

`allowedUses` policy'yi genişletemez. `training` yalnız `useClass=training_allowed` ve `licenseStatus=confirmed` iken açılır. Publishable artifact yalnız confirmed license, publication izni ve redistribution hakkı açık source policy kullanır.

## DatasetManifest

Manifest zorunlu olarak version/schema version, dataset ID, canonical ISO timestamps, purpose, aspect/media kapsamı, exact record count, source policies, split policy, annotation/license policy version'ları, SHA-256 content hash ve `draft|internal_only|publishable` release status taşır.

Split policy `franchise_group_aware`dır. Yüzdeler toplamı 100'dür; `leakageGroupId` ve exact provider identity birlikte group key'dir. Gold test set `goldTestFrozen=true` ile threshold tuning ve active learning dışında tutulur.

## DatasetRecordProvenance

Her record tam bir provenance kaydı olmadan package codec'ten geçmez:

- `recordId`, `sourceId`, `sourceType`, bounded `sourceReference`.
- Gerekliyse doğrulanmış `exactProviderIdentity`; canonical key provider + media type + external ID'den türetilir.
- `capturedAt` ve `contentOrigin`: synthetic, human rewritten, open licensed veya provider runtime reference.
- Record-level allowed uses, attribution ve license evidence.
- Retained/excluded fields ve transformation notes.
- `containsPersonalData=false` literal invariant'ı.
- Pseudonymous `rev_*` reviewer ve review status.

Provider runtime reference exact identity olmadan kabul edilmez. Title/year/author benzerliği identity değildir. Runtime reference retained field listesi description, synopsis, overview, plot, raw payload, image/poster/banner veya kişisel alan taşıyamaz.

## CandidateTextBundle

Model girdisi yalnız candidate içeriğini taşır:

- Opsiyonel title (en çok 300 karakter).
- Sentetik, bağımsız insan-yazımı veya açık lisanslı short summary (en çok 600 karakter).
- Genre/tag/rank/keyword, format/status, language/country ve provider coverage metadata.

User rating, favorite, progress, note, feedback, profile identity veya raw prompt alanları contract'ta yoktur; unknown-field policy ile reddedilir.

## AspectAnnotationRecord

Annotation record version, annotation/record ID, registered aspect ID, beş label, annotation confidence, short-summary offset span'leri veya bounded evidence note, contradiction note, pseudonymous `ann_*` annotator, round, guideline version, label source ve adjudication state taşır.

- `insufficient_evidence` ile `absent` farklı enum değerleridir.
- Annotation confidence model confidence değildir.
- `finalLabel` yalnız `adjudicationStatus=resolved` sonrasında yazılabilir.
- Aynı record/aspect/annotator/round duplicate'tir; farklı annotator ve round'lar korunur.
- Evidence span metni kopyalamaz; yalnız bounded short summary içinde offset taşır.

## AspectVerifierOutput

Verifier output registered aspect ID, dört ordinal probability, predicted level, calibrated confidence, abstention, model/input schema version ve bounded warnings taşır.

- Probability değerleri finite `0..1`, toplam `1±0.0001` olmalıdır.
- Abstain halinde `predictedLevel=null` ve `abstentionReason` zorunludur.
- Non-abstain halinde predicted level zorunlu, abstention reason yasaktır.
- Unknown/abstain absent değildir.
- `mock` veya `hash` model version semantic output olarak reddedilir.

## Package-level invariant'lar

Codec sonrası validation şu kapıları uygular:

1. Manifest `recordCount` gerçek benzersiz record sayısıyla eşleşir.
2. Her record için tam bir provenance vardır; orphan veya duplicate provenance yoktur.
3. Provenance source ID/type ve allowed use manifest source policy'yi aşmaz.
4. Unresolved/conditional/non-training source train split'e giremez.
5. Aynı franchise/leakage group veya exact provider identity farklı split'lere ayrılamaz.
6. Annotation record/aspect manifest kapsamındadır; duplicate ve out-of-bounds span reddedilir.
7. Publishable artifact bütün source policy'ler için publication/redistribution ve approved provenance review ister.

## Artifact, revocation ve paylaşım

- İlk gerçek pilot/gold set private artifact olmalıdır; repository'ye yalnız schema, sentetik test ve data card şablonu girer.
- Public export ayrı manifest/hash üretir; internal-only source veya reviewer operasyon notlarını taşımaz.
- Source terms, contributor revocation veya provenance hatası dataset version'ını invalid eder; in-place sessiz düzeltme yerine yeni manifest/hash üretilir.
- Model artifact normal Git history'ye girmez. D7-2 kararı sonrasında boyuta göre private release artifact veya Git LFS; checksum ve model card zorunludur.
- Dataset/model card source policy version, intended use, exclusions, known limitations, deletion ve reproduction environment bilgilerini taşır.
