# Goal System 3–5 Dakikalık Demo

## 0:00–0:40 — Tanım ve local-first sınır

Hedefler sayfasını açın. Goal'un yalnız başlık, kapsam, metrik, program ve lifecycle tanımı taşıdığını söyleyin. İlerleme/yüzde Goal'a kaydedilmez; mevcut medya ve güvenilir aktivite loglarından yeniden hesaplanır. Guest ve hesap verilerinin owner-scoped local store'larda ayrıldığını kısaca gösterin.

## 0:40–1:40 — Manuel hedef ve anlık evaluation

Bir TV/media-type, haftalık episode hedefi oluşturun. Kütüphaneden ilgili medyaya `+1` uygulayın ve sayfa değiştirmeden kartın `currentValue`, yüzde ve kalan miktarı güncellediğini gösterin. `amount` yerine `previousProgress → newProgress` geçişinin kullanıldığını; negatif manuel düzeltmenin sonucu azaltabildiğini belirtin.

## 1:40–2:30 — Tamamlanma ve öneri

Completed-media hedefini gösterin. Yalnız status değil, dönem içi güçlü completion transition'ı gerektiğini açıklayın. Geçmiş fixture uygunsa “Önerilen hedefler” bölümündeki bounded istatistiksel öneriyi açın; kullanıcının “Hedef olarak ekle” onayı olmadan Goal oluşmadığını gösterin. Onay sonrası `origin=suggested` aktif hedefin listeye geldiğini belirtin.

## 2:30–3:20 — Backup V3

Portable Backup preview açın. V2 import uyumluluğu ve V3 Goal definition roundtrip'ini anlatın. Evaluation, suggestion geçmişi, Cloud revision/queue/conflict ve tombstone metadata'nın export edilmediğini; exact media ID remap ve açık Goal ID conflict kararını vurgulayın.

## 3:20–4:30 — Cloud ve conflict mimarisi

Goal Cloud flag kapalı/şema absent durumunda local kullanımın sürdüğünü gösterin. Ayrı owner-scoped `goals` tablosu, durable queue, stable operation ID, revision/CAS ve tombstone sözleşmesini kısa bir akış olarak anlatın. Fixture conflict kartında Cloud sürümünü kullan, yereli güncel revision üzerine yaz, yeni UUID'li kopya veya ertele seçeneklerini gösterin; sessiz field merge yapılmadığını belirtin.

## Kapanış

D5 kod/test/local kabul kapsamının tamamlandığını; production migration, iki hesaplı canlı RLS testi, D2C.1 cutover ve deployment'ın D8 rollout kapısı olduğunu açıkça söyleyin. “Production-ready” veya migration uygulanmış iddiası kullanmayın.
