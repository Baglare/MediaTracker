# D7-R5A Research Evidence Gap Audit

## Kök neden

Birincil sınıf `document_truncated_before_evidence` olarak doğrulandı. AniList `9253`, Wikidata `Q20590069`, `enwiki` sitelink'i, `Steins;Gate (TV series)` sayfası, page ID `31089414`, revision ID `1362674487` ve `work` scope zinciri doğruydu. Ancak MediaWiki extract isteği hem `exintro=1` hem `exchars=24000` gönderdiği için adapter yalnız yaklaşık 1.200 karakterlik lead metni alıyordu.

Exact revision için bu iki provider-side sınır kaldırıldığında bounded plaintext 11.660 karakter oldu; kontrollü audit terimleriyle ilgili kanıtın belgede bulunduğu, segmentlendiği ve lexical passage olarak seçildiği doğrulandı. Normalization, segmentation, packet budget ve evidence-unit katmanları kanıtı kaybetmiyordu.

## Minimal düzeltme

Wikipedia Action API isteğinden `exintro` ve `exchars` kaldırıldı. Exact QID/page/revision doğrulaması, HTTPS/pinned network policy, revision-bound citation ve adapter'ın mevcut 24.000-byte fail-closed response limiti değişmedi. Genel HTML fetch, title/fuzzy fallback, yeni source veya aspect/model threshold değişikliği eklenmedi.

Bu düzeltme eser adına özel değildir: exact-QID Wikipedia direct document kullanan her aday aynı revision-bound full plaintext politikasından yararlanır. Limitten büyük sayfalar sessizce kesilmez; mevcut güvenlik politikasıyla fail-soft kalır.

## Gerçek kabul

Canlı kabulte full document içinde bounded audit eşleşmesi, bir relevant/lexical segment, seçilmiş passage ve modele ulaşan eligible evidence unit doğrulandı. Groq strict grounded output bir support claim üretti; deterministic karar `supported/significant` ve Wikipedia confidence cap nedeniyle `medium` oldu. İlk tekrar çalıştırmada provider çıktısı `grounding_invalid`, sonraki aynı bounded kabulte geçerliydi; kaynak veya contract politikası bu tekil model varyansı için gevşetilmedi.

Packet, passage, evidence unit, prompt ve provider response transient kaldı; public recommendation response ve D6 deterministic kararı değişmedi.

## R5B'ye kalanlar

Bu hedef vaka yeni source gerektirmeden çözüldü. R5B'de kaynak genişletme ancak Wikipedia'nın gerçekten yetersiz olduğu ayrı acceptance vakaları ve izin/retention audit'i için değerlendirilmelidir. Büyük exact-revision sayfaları için section-aware bounded acquisition ihtiyacı ayrı bir politika değişikliği olarak ele alınmalıdır.
