# AI Recommendation V2 — D6-4 Manuel Testleri

## Hazırlık

1. AI Advisor'ı guest owner ile aç; console ve Network panelini temizle.
2. Aynı senaryoyu authenticated Owner A ve Owner B ile owner izolasyonu için tekrarla.
3. Live provider kabulü yapılacaksa ayrıca `D6_PROVIDER_LIVE_SMOKE=1` kullan; fixture sonucu live kanıt sayılmaz.

## Ana akış

1. “Güçlü romantizmi olan, 13 bölümden kısa fantastik anime öner; aşk üçgeni olmasın.” yaz ve **İsteği çözümle** de.
2. Network'te yalnız `/api/ai/interpret` çağrıldığını; provider/model çağrısı olmadığını doğrula.
3. Özette anime, romance must, length ≤13 ve love triangle avoid alanlarını doğrula; constraint ekle/sil/rol değiştir.
4. Katı, Dengeli, Keşifçi seçimlerini klavye ile değiştir. Seçim sonrası eski sonuçların client-side yeniden sıralanmadığını doğrula.
5. **Önerileri bul** de; primary kartta ham score/tag rank/yüzde olmadığını, Quick Add/Discover'ın çalıştığını doğrula.
6. Keşifçi modda near-match varsa ayrı, kapalı bölümde ve en fazla üç sonuç olduğunu; must ihlalinin açık yazıldığını doğrula.

## Feedback ve takip

1. Bir öneride **İlgilenmiyorum** de; kartın reason seçmeden gizlendiğini doğrula.
2. Neden seç; dialog Escape, Tab focus trap ve focus return davranışını kontrol et.
3. Gizlenen adayı geri al ve confirmation ile feedback reset'i dene.
4. “Daha kısa olsun”, “Romantizmi daha güçlü olsun”, “Aşk üçgeni olanları çıkar”, “Bunlar yerine manga öner” takiplerini sırayla çözümle; önceki explicit must'ın açıkça değiştirilmedikçe kaldığını doğrula.
5. **Yeni konu** ile taslak/near-match/context'in temizlendiğini, owner feedback'inin kaldığını doğrula.

## Owner, responsive ve hata

1. Owner A taslağı açıkken Owner B'ye geç; eski taslak/sonucun tek frame görünmediğini doğrula.
2. 1280×720, 1366×768, 1536×864, 1920×1080 ve 375×812 viewport'larında overflow kontrolü yap.
3. Provider unavailable ile hard-constraint empty state'ini ayır; sistemin koşulu otomatik gevşetmediğini doğrula.
4. Abort edilen eski request'in yeni owner/state'e uygulanmadığını; hydration/request loop ve console error olmadığını doğrula.

Son çalıştırma kaydı ve canlı/fixture ayrımı [AI Recommendation V2 Acceptance](AI_RECOMMENDATION_V2_ACCEPTANCE.md) belgesine yazılır. Demo akışı [AI Recommendation V2 Demo Script](AI_RECOMMENDATION_V2_DEMO_SCRIPT.md) içindedir.
