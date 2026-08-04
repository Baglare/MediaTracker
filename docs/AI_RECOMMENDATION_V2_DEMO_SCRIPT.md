# AI Recommendation V2 — 4–6 Dakikalık Demo

## Hazırlık

- AI Advisor'ı aç; **Kaynak API'leriyle öner** modunu ancak ilgili provider env'i hazırsa seç.
- Canlı provider yoksa demoyu parse/edit/şeffaflık ve önceden hazırlanmış sentetik UI fixture'ıyla anlat; bunu canlı kalite sonucu diye sunma.

## Akış

**0:00–0:45 — Doğal dil ve yapılandırılmış istek**  
“Güçlü romantizmi olan, 13 bölümden kısa fantastik anime öner; aşk üçgeni olmasın.” yazıp **İsteği çözümle**. Provider/model çağrısı olmadan anime, romance must, length ≤13, fantasy prefer ve love-triangle avoid özetini göster.

**0:45–1:40 — Kullanıcı kontrolü**  
Romantizm rol/seviye düzenlemesini, 43-aspect registry aramasını ve objektif yıl/süre filtresini göster. Enum veya sahte yüzde yerine Türkçe seviye/kanıt dili kullanıldığını vurgula.

**1:40–2:25 — Strictness**  
Katı, Dengeli ve Keşifçi açıklamalarını göster. Explicit must'ın üçünde de primary için korunduğunu; strictness değişince eski sonuçların client'ta sahte yeniden sıralanmadığını anlat.

**2:25–3:20 — Deterministik sonuç ve kanıt**  
**Önerileri bul**. Kartta exact provider identity, grounded reason, bölüm sayısı ve kanıt confidence özetini göster. Ham score, tag-rank yüzdesi veya “% uygun” bulunmadığını; LLM'nin final sırayı belirlemediğini belirt.

**3:20–4:05 — Near-match**  
Keşifçi modda varsa ayrı ve en fazla üç yakın eşleşmeyi aç. Karşılanmayan must koşulunun gizlenmediğini, primary listeyle identity duplicate olmadığını göster.

**4:05–4:45 — Reason-level feedback**  
Bir exact candidate'ı gizle, neden dialog'undan ilgili aspect/objective nedenini seç ve geri al. Bunun provider/media type geneline kör ceza veya profile must üretmediğini anlat.

**4:45–5:30 — Mimari kapanış**  
Akışı tek cümlede özetle: versioned request codec → provider verified identity → structured evidence → hard filter → deterministik tuple → grounded explanation. D6'nın sözleşme baseline'ı, D7'nin insan etiketli değerlendirme/kalibrasyon, D8'in production gate aşaması olduğunu açıkla.

Demo sonrası teknik kanıt için [D6 Kabul Raporu](AI_RECOMMENDATION_V2_ACCEPTANCE.md) ve [Evaluation Contract](AI_RECOMMENDATION_EVALUATION_CONTRACT.md) açılır.
