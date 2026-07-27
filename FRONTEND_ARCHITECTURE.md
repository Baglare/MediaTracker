# Frontend Architecture

Bu dosya yalnız frontend domain sınırlarını özetler; ayrıntılı veri sözleşmeleri
`docs/` altındaki ilgili belgelerdedir.

## Media identity ve duplicate domain'i

- `MediaItem.id` local record instance kimliğidir. UI selection, edit/delete,
  ProgressLog ve denormalized group ilişkileri bu ID'yi kullanır.
- `MediaItem.identity` Canonical Identity V2'dir. XP/recommendation/social
  compatibility consumer'ları kontrollü migration tamamlanana kadar legacy
  anahtarlarını kullanabilir.
- `lib/duplicate-scanner.ts` saf, local-only ve read-only candidate/evidence
  üretir. Storage, network, XP veya social side-effect üretmez.
- `lib/duplicate-merge.ts` planlama, eligibility, multi-domain journal,
  rollback/recovery ve bounded undo koordinatörüdür. Component'ler raw storage
  key veya remote mutation bilmez.
- `lib/media-identity-aliases.ts` mantıksal identity alias'larını,
  `lib/media-record-redirects.ts` local record ID redirect'lerini ayrı tutar.
- Cloud queue ancak bütün local domain yazıları doğrulandıktan sonra durable
  hale gelir; network flush en son başlar.

UI sınırı `components/duplicate-review-panel.tsx` ve
`components/duplicate-merge-workflow.tsx` içindedir. UI candidate'ı merge izni
saymaz; güncel state doğrulaması domain coordinator tarafından tekrarlanır.

Detaylar:

- [Canonical Media Identity](./docs/CANONICAL_MEDIA_IDENTITY.md)
- [Duplicate Scanner and Review](./docs/DUPLICATE_SCANNER_AND_REVIEW.md)
- [Duplicate Merge and Recovery](./docs/DUPLICATE_MERGE_AND_RECOVERY.md)
- [Local Data Format and Recovery](./docs/LOCAL_DATA_FORMAT_AND_RECOVERY.md)
