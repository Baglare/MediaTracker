# D4-2 UI ve Tema İyileştirmeleri

## Daraltılabilir bölümler

Seyrek kullanılan ayar ve bakım alanları `CollapsibleSection` üzerinden açılır. Düğme; `aria-expanded`, `aria-controls`, görünür yön ikonu ve klavye davranışı taşır. Açık/kapalı seçim aynı tarayıcı oturumu boyunca korunur. Kritik veri durumu içeren bölüm otomatik açılır ve metin rozetiyle uyarır.

Varsayılan kapalı alanlar: eski kişisel yerel veri ayrıntıları, düzen/panel listeleri, başlangıç tercihi, gelişmiş Cloud veri işlemleri, gelişmiş veri yönetimi ve yedek/içe aktarma ayrıntıları, tekrarlanan kayıt incelemesi ve tema/preset araçları. Hesap özeti, temel Cloud durumu ve etkin tema özeti görünür kalır.

## Kart başlığı ve sınıflandırma

Medya ve seri başlıkları iki satır alan ayırır; aksiyonlar başlık genişliğini paylaşmaz. Üç kolonlu kart düzeni `2xl` eşiğine taşındı; 1280–1535 px aralığında iki kolon korunur.

Her medya ana tür rozeti taşır. Alt tür yalnız yapılandırılmış `subType`, sağlayıcı `format` alanı veya ayrıştırıcı medya türü yeni bilgi veriyorsa gösterilir. `Film + Film`, `Dizi + Dizi` ve `Kitap + Kitap` bastırılır; başlıktan veya bulanık metinden alt tür üretilmez. Kadraj ve Arşiv kayıtlarında güvenilir ek metadata yoksa sahte alt tür gösterilmez.

## Açık tema kimlikleri

- Porselen: sıcak fildişi zemin, kırık beyaz yüzey, çini mavisi ve kontrollü turkuaz.
- Tozpembe: toz pembe zemin, pembe-krem kart, koyu gül kurusu vurgu.
- Lavanta: soğuk lavanta zemin, açık lila yüzey, koyu erik vurgu.
- Kutup: buz mavisi zemin, sisli mavi-beyaz yüzey, petrol/turkuaz vurgu.
- Sepya: korunan parşömen kimliği, ayrıştırılmış kart/input katmanları ve güçlü terracotta-mürekkep kontrastı.

Preset kimliği merkezi tema kayıt defterindeki background, surface, elevated, border, input, hover, selected, focus ve durum tokenlarından gelir. Hazır temayı özel temaya kopyalama güncel temel girdileri kullanır; mevcut özel tema kayıtları değiştirilmez. Önizleme şeridi gerçek background, surface2, accent ve secondaryAccent değerlerini gösterir.

## Logo, yayın özeti ve metrikler

Marka SVG’si CSS mask olarak tek varlıktan tüketilir. Koyu temada açık metin rengi, açık temada mürekkep rengi; Porselen’de çini mavisi kullanılır. Tema veya sistem tercihi değişince yeniden yükleme gerekmez.

“Yakında” özeti D3 `useReleaseCalendar` read-model’ini tek çağrı noktasından tüketir. Masaüstünde sağ panelde, sağ panelin görünmediği boyutlarda Dashboard üstünde en fazla üç olayı gösterir. Gizli sağlayıcı olayları mevcut D3 seçicisinde elenir; tamamlanan/bırakılan medya özetten ayrıca çıkarılır. Widget kendi yenileme, filtre veya sağlayıcı isteği katmanını kurmaz.

Cloud dünya değerleri “Dünya XP dağılımı” ve XP birimiyle; yerel fallback “Kütüphane dünya dağılımı” ve medya birimiyle gösterilir. Bilinmeyen kaynak nötr “birim” kullanır.

Monokrom palet beş ayrı charcoal/slate/silver aydınlık basamağı kullanır. Grafik ile açıklama noktaları aynı renk kaydını tüketir; donut dilimleri arasında görünür boşluk ve yanında metin/legend bulunur.

## D4-3 tarayıcı smoke listesi

- 1280×720, 1366×768, 1536×864 ve 1920×1080: uzun anime/kitap/TV sezon başlıkları, iki satır ve aksiyon alanı.
- 375×812: kart taşması, Dashboard “Yakında” özeti, daraltılabilir bölüm klavye odağı.
- Tüm açık temalar: background/surface katmanları, input, hover, selected, focus, danger/success/warning ve logo kontrastı.
- Sistem teması açık/koyu geçişi: logo ve preset çözümlemesi yeniden yüklemesiz değişmeli.
- Takvim ile “Yakında” özeti aynı olay kümesini ve owner değişiminde doğru izolasyonu göstermeli.
- Monokrom donut/legend eşleşmesi hem açık hem koyu temada görsel olarak doğrulanmalı.
