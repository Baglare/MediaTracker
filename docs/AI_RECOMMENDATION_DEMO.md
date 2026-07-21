# AI Öneri Sistemi Demo ve Değerlendirme Rehberi

Bu belge AI Danışman'ın mevcut davranışını tekrarlanabilir biçimde göstermeyi amaçlar. Bir kalite benchmark'ı veya gerçek kullanıcı çalışması değildir.

## Sistem nasıl çalışıyor?

1. Kullanıcı mesajı ve seçilen dünya kapsamı güvenli bir öneri niyetine dönüştürülür.
2. Yerel kütüphanedeki puan, favori, ilerleme, etiket ve izin verilmiş notlardan bir profil çıkarılır.
3. Seçilen medya kaynaklarından adaylar toplanır.
4. Adaylar kaynak API kimlikleriyle doğrulanır; doğrulanamayan kayıtlar son önerilere alınmaz.
5. Text similarity, hybrid skor ve varsa embedding similarity birlikte değerlendirilir.
6. Daha önceki ekleme, devam etme ve “ilgilenmiyorum” geri bildirimleri skora uygulanır.
7. Yapılandırılmış provider adayları sıralar; provider kullanılamazsa deterministik mock fallback devreye girer.
8. Sonuçlar gerekçe, uygunluk etiketi ve güvenli öneri motoru metadata'sıyla gösterilir.

## Demo senaryoları

### 1. Yarım kalmış içeriğe devam

- Örnek veri: Kütüphaneye toplam bölümü bilinen, durumu `watching`/`reading` olan ve ilerlemesi sıfırdan büyük bir içerik ekle.
- İstek: “Bu akşam kısa sürede devam edebileceğim bir şey öner.”
- Beklenen davranış: Kütüphanedeki uygun içerik “Devam önerisi” veya “Yarım bıraktığın içeriğe devam” bağlamıyla öne çıkar.
- Teknik durum: Provider, embedding modu, değerlendirilen aday sayısı, kullanılan kaynaklar ve feedback durumu görünür.
- Başarı kriteri: Sonuç kütüphanedeki doğru kayda bağlanır; gerekçe mevcut ilerleme sinyalini açıklar.

### 2. Yüksek puan ve favoriden yeni keşif

- Örnek veri: Aynı tür veya temada en az iki içeriği yüksek puanla; birini favori yap. Keşif kaynağından kütüphanede olmayan doğrulanmış adaylar bulunabilsin.
- İstek: “Yüksek puan verdiğim içeriklere benzeyen yeni bir şey öner.”
- Beklenen davranış: Benzer tür/tema sinyali taşıyan yeni adaylar sıralamada yükselir ve “Yeni keşif” olarak işaretlenir.
- Teknik durum: Kullanılan kaynaklar ve aday sayısı, yapılandırmaya göre gerçek provider veya Mock, Python servisi varsa `Python ML service`, yoksa `Local mock embedding` gösterir.
- Başarı kriteri: Öneri kütüphanede değildir, kaynak kimliği doğrulanmıştır ve gerekçe yüksek puan/favori profil sinyaline dayanır.

### 3. “İlgilenmiyorum” sonrası değişen sıra

- Örnek veri: İlk istekte birbiriyle benzer en az iki doğrulanmış aday üretecek kütüphane profili hazırla.
- İstek: Önce “Bana yeni bir film öner”, ardından ilk adayda “İlgilenmiyorum” ve aynı isteği tekrar çalıştır.
- Beklenen davranış: Feedback yerel feedback kaydına eklenir; sonraki isteğe gönderilir. Aynı aday elenir, benzer aday ise negatif sinyalle aşağı sıralanabilir.
- Teknik durum: “Feedback uygulandı” bilgisi ve olay sayısı görünür; provider/embedding bilgileri secret içermez.
- Başarı kriteri: Tekrarlanan istek feedback olmadan alınan sonuçla aynı kalmaz; negatif adayın geri gelmemesi veya sırasının anlamlı biçimde gerilemesi gözlenir.

## Mock ve gerçek mod farkı

- Mock provider, API anahtarı veya dış LLM olmadan deterministik sıralama ve demo akışı sağlar. Gerçek bir dil modeli veya gerçek ML çıkarımı gibi sunulmamalıdır.
- Gerçek LLM provider, doğrulanmış aday kümesi üzerinde model tabanlı sıralama ve metin üretimi ekler; aday doğrulama sınırını kaldırmaz.
- Python embedding servisi genel amaçlı bir sentence-transformers modeliyle semantik benzerlik sinyali ekler.
- Servis yoksa local mock embedding, provider key'i yoksa mock provider çalışır. Persistent cache anahtarı yoksa yalnızca persistent cache kapanır; offline-first ana uygulama ve AI fallback devam eder.
- Teknik durum alanı kullanılan yolu bildirir; API key, service role key, prompt, ham hata veya stack trace göstermez.

## Sınırlamalar

- Öneri kalitesi geniş bir benchmark veya karşılaştırmalı metrik setiyle ölçülmedi.
- Harici API'lerin kapsamı, erişilebilirliği ve metadata kalitesi aday sonuçlarını etkileyebilir.
- Feedback modeli sınırlı sayıdaki basit kullanıcı eylemine dayanır; uzun dönemli tercih öğrenimi değildir.
- Embedding modeli genel amaçlıdır ve medya alanına özel eğitilmemiştir.
- Gerçek kullanıcı çalışması, A/B testi veya kişiselleştirme doğruluk iddiası yoktur.

## Portfolyoda nasıl anlatılmalı?

- Ürün kapsamı, mimari sınırlar ve güvenilirlik kararları geliştirici tarafından yönetildi.
- AI araçları tasarım ve geliştirme desteği olarak kullanıldı.
- Öneri sistemi deterministik profil/feedback sinyalleriyle model tabanlı provider ve embedding sinyallerini birleştirir.
- Offline-first çalışma, doğrulanmış aday sınırı ve kontrollü fallback ürün güvenilirliği için tasarlandı.
- “AI bütün uygulamayı yaptı”, “kullanıcının zevkini tamamen öğrenir” veya “kusursuz kişiselleştirme” gibi doğrulanmamış ifadeler kullanılmamalıdır.
