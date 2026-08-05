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

## D6-5.1 relevance regresyonları

1. `love_triangle` constraint'ini **Kaçınılacak** yap. Varsayılan eşik “İkincil ve üzerini çıkar” olmalı; incidental+medium aday primary'ye girmemeli ve “Aşk üçgeni eşleşmesi” etiketi oluşmamalı.
2. Yalnız romance must + exploratory çalıştır. Güçlü/ranked Romance evidence primary, incidental kanıt near-match olabilir; tamamen unknown aday gösterilmemeli. `conditional_must_requires_evidence:romance` yerine Türkçe açıklama görünmeli.
3. Romance prefer isteğinde romance evidence'i bulunmayan yüksek community-score adayın yalnız puanıyla listeye girmediğini doğrula.
4. Community değerinin `AniList topluluk puanı: 7.0/10` gibi açık provider/ölçek taşıdığını doğrula.
5. “A Dark Rabbit Has Seven Lives Picture Drama”, “Thunderbolt Fantasy: Sword Travels in the East”, “Is It Wrong to Try to Pick Up Girls in a Dungeon?” ve uzun kitap/TV sezon başlıklarını poster, fit badge, evidence ve aksiyonlarla kontrol et. Başlık iki satır olmalı; hover veya keyboard focus sırasında açılmalı ve kelimeler karakter karakter bölünmemeli.

## Feedback ve takip

1. Bir öneride **İlgilenmiyorum** de; kartın reason seçmeden gizlendiğini doğrula.
2. Neden seç; dialog Escape, Tab focus trap ve focus return davranışını kontrol et.
3. Gizlenen adayı geri al ve confirmation ile feedback reset'i dene.
4. “Daha kısa olsun”, “Romantizmi daha güçlü olsun”, “Aşk üçgeni olanları çıkar”, “Bunlar yerine manga öner” takiplerini sırayla çözümle; önceki explicit must'ın açıkça değiştirilmedikçe kaldığını doğrula.
5. **Yeni konu** ile taslak/near-match/context'in temizlendiğini, owner feedback'inin kaldığını doğrula.

## D6-5.2 Romance evidence ve mesaj regresyonu

1. “Anime önerisi istiyorum. Güçlü romantizm öğeleri olsun ama aşk üçgeni olmasın.” isteğini çözümle. Romance minimum seviyesi **Yalnız ana unsur**, love triangle **Kaçınılacak** görünmeli.
2. Romance seviyesini **Belirgin veya ana unsur** yapıp Balanced çalıştır. Genre-only `significant/medium` fixture primary olabilir; Strict aynı medium-confidence fixture'ı elemelidir.
3. Exploratory + **Yalnız ana unsur** ile significant/incidental romance fixture'larının yalnız near-match'te ve gerçek ihlal metniyle gösterildiğini; unknown/popüler fixture'ın gösterilmediğini doğrula.
4. Parse → Önerileri bul → retry → reload akışında kullanıcı iletisinin bir kez göründüğünü doğrula. Aynı cümleyi yeni bir gönderim olarak tekrar yazmanın ayrı mesaj olduğunu kontrol et.
5. Near-match kartında kapak, okunabilir başlık, medya/provider, confidence, Quick Add/Discover ve İlgilenmiyorum aksiyonlarını; ham tag rank/score/reason code olmadığını kontrol et.

## Owner, responsive ve hata

1. Owner A taslağı açıkken Owner B'ye geç; eski taslak/sonucun tek frame görünmediğini doğrula.
2. 1280×720, 1366×768, 1536×864, 1920×1080 ve 375×812 viewport'larında overflow kontrolü yap.
3. Provider unavailable ile hard-constraint empty state'ini ayır; sistemin koşulu otomatik gevşetmediğini doğrula.
4. Abort edilen eski request'in yeni owner/state'e uygulanmadığını; hydration/request loop ve console error olmadığını doğrula.

Son çalıştırma kaydı ve canlı/fixture ayrımı [AI Recommendation V2 Acceptance](AI_RECOMMENDATION_V2_ACCEPTANCE.md) belgesine yazılır. Demo akışı [AI Recommendation V2 Demo Script](AI_RECOMMENDATION_V2_DEMO_SCRIPT.md) içindedir.
