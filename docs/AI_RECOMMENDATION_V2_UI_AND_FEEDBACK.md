# AI Recommendation V2 — UI ve Feedback V2

> Durum: D6-4 uygulandı ve D6-5'te session hydration, request abort, payload minimizasyonu ve follow-up fixture'larıyla stabilize edildi. D6-3 deterministik sıralama kararı değişmedi.

## İki aşamalı istek

`POST /api/ai/interpret`, `analyzeIntent` ile aynı saf V1→V2 adapter'ı kullanır; candidate retrieval, provider, model veya web çağrısı yapmaz. UI önce `RecommendationRequestV2` taslağını gösterir. Arama ancak kullanıcı **Önerileri bul** dediğinde `/api/ai/recommend` isteğiyle başlar. Server `structuredRequestV2` payload'ını yeniden codec'ten geçirir; geçersiz payload `structured_request_invalid` ile reddedilir. Onaylı structured request, message ile farklıysa domain kararlarının kaynağıdır.

Takip mesajları önceki taslağa patch uygulanarak çözülür. Eski explicit must korunur; aynı aspect için açık kullanıcı değişikliği yeni explicit constraint olur. Göreli “daha kısa” isteği önceki sayısal limit yoksa clarification üretir. **Yeni konu** taslağı, sonuçları, near-match ve geçici dialog'u temizler; kalıcı owner feedback'ini temizlemez.

## Düzenlenebilir istek

UI `features/recommendations/ui` altında bölünmüştür. Aspect seçici doğrudan 43 kayıtlı `ASPECT_REGISTRY` kaynağını ve Türkçe/İngilizce alias'ları kullanır. Rol değişimi, duplicate/unsafe rol, `profile + must`, objektif sayı/aralık ve medya/uzunluk uyumu domain codec/policy ile doğrulanır. Enum'lar kullanıcıya çevrilmiş etiketlerle gösterilir; strength/confidence yüzdesi veya ham scorer puanı gösterilmez.

Strictness owner-scoped AI preferences state'inde version 2 olarak saklanır; version 1 kayıtlar `balanced` ile hydrate edilir. Strictness/draft değişikliği eski sonucu client'ta yeniden sıralamaz; sonuç stale kabul edilip temizlenir.

## Sonuçlar ve near-match

Primary öneriler mevcut Quick Add/Discover contract'ını korur ve yalnız satisfied evidence özetini taşır. `exploratory` modunda must ihlali olan fakat güvenilir avoid ihlali olmayan adaylar en fazla üç öğelik ayrı `nearMatches` read-model'inde döner. Strict/balanced modda veya boş listede bölüm render edilmez. İhlal edilen constraint açıkça gösterilir; near-match primary listeye karışmaz.

## Feedback V2 ve owner scope

`RecommendationFeedbackEventV2` version, exact provider/library identity, action, result kind, reason code, aspect IDs, constraint keys ve bounded metadata taşır. Raw prompt, personal note ve title-only identity içermez. V1 event'leri hydrate edilmeye devam eder; tek bozuk V2 event owner state'inin kalanını düşürmez ve liste 1000 event ile sınırlıdır.

Dismissal exact identity ile hemen uygulanır; reason dialog iptal/kapatılırsa `not_interested_now` kaydedilir. Reason etkileri aspect/objective kapsamlı ve bounded'dır: `already_known` ile `not_interested_now` exact-only, `too_long` length soft signal, `ongoing_not_wanted` release-status soft signal, tone reason yalnız kanıtlı tone aspect'leri içindir. Hiçbir feedback provider/type geneline kör ceza veya profile must üretmez.

## Şeffaflık ve erişilebilirlik

Şeffaflık alanı deterministik final sıra, kaynaklar, verifier modu, profil/toggle durumu ve must-first politikasını açıklar. Secret, raw debug, prompt, note ve vector göstermez. Strictness radio semantiği; aspect combobox ilişkileri; chip remove label'ları; collapsible `aria-expanded/controls`; dialog focus trap, Escape ve focus return sözleşmeleri uygulanır.

## D6-5 sonucu ve D7'ye kalanlar

- D6-5 kod/test/browser sonucu [D6 Kabul Raporu](AI_RECOMMENDATION_V2_ACCEPTANCE.md) içindedir.
- D7'ye human-labeled gold set, provider snapshot corpus'u, kalite metrik raporu ve threshold/verifier kalibrasyonu kalır.
