# TMDB — Faz 2 güvenli hazırlık

2026-10-15. Yerel kaynak hazırlığı; TMDB live API erişimi tüm ortamlarda `disabled_by_policy` olarak kalır. Yeni env/token/logo erişim açmaz. Production, DB, SMTP ve tarihsel operasyon kanıtları bu çalışmanın dışındadır.

## İzin kapsamı

Operatörün ilettiği yazılı yanıtlarda, metadata'yı dönemsel yenilemenin yeterli olup olmadığı **veya** kalıcı saklamanın ek izin gerektirip gerektirmediği sorusuna verilen “Yes” belirsizdir; altı ayı aşan veya süresiz saklama izni değildir. Deterministik önerinin şartları ihlal edip etmediğine verilen “No”, yalnız sorulan deterministik kullanım kapsamındadır. Attribution, onaylı logo, kaynak bağlantıları ve teknik korumalarla non-commercial developer lisansı sorusuna verilen “Yes”, gelir elde edilmeyen kullanım içindir. Yetkili, uygulama içi satın alma, reklam veya abonelik geliri başladığında commercial plana geçilmesi gerektiğini ayrıca belirtmiştir. Bu yanıtlar AI/ML, embedding, eğitim veya validation izni değildir.

Resmî kaynaklar: [API şartları](https://www.themoviedb.org/api-terms-of-use), [FAQ](https://developer.themoviedb.org/docs/faq), [onaylı logolar](https://www.themoviedb.org/about/logos-attribution). API şartlarının doğrudan web erişimi inceleme sırasında kısıtlıydı; erişilebilen resmî indeks metni altı aylık cache sınırını içeriyordu. Enablement öncesinde güncel şartlar tekrar incelenmelidir.

## Uygulanan sınırlar

- Search `POST /api/tmdb/search` (`query`, isteğe bağlı `mediaType=movie|tv`); details `GET /api/tmdb/details?id=…&mediaType=movie|tv`; Calendar `GET /api/calendar/tmdb?movieId=…`. Mevcut input/capability/limiter/token/upstream sırası korunur; gerçek policy bu yolları upstream'den önce reddeder.
- Discovery TMDB Quick Add ve global-search eklemesi, details isteğinden veya eski minimal-result fallback'inden önce durur. Bu sayede geçici sonuç yeni kalıcı kütüphane metadata'sına çevrilmez. Legacy map/decode/edit ve mevcut kayıtlar değiştirilmez. Bu bir genel Cloud/import/restore silme motoru değildir.
- Deterministik library-only öneri korunur. Bilinen TMDB kaynak/kimlik işaretli kütüphane ile model destekli öneri, planning başlamadan reddedilir. Embedding payload'ları provider ve cache okumalarından önce elenir; mock fallback de kapsam içindedir. Structured-only evidence korunur; TMDB veya TMDB ile birleşmiş bilinen evidence semantic verifier'a gönderilmez.
- Dataset paketi, sentetik olmayan TMDB exact-provider provenance'ını split veya generic training izninden bağımsız reddeder. Sentetik contract fixture'ları gerçek sağlayıcı içeriği sayılmaz. Etiketsiz metnin kaynağı bu kontrollerle ispatlanamaz; kapsamlı provenance mimarisi bu fazda kurulmaz.
- Settings → Uygulama Bilgisi, API kapalıyken de logo ve zorunlu İngilizce bildirimi gösterir. Legacy kaynak bağlantısı, üçüncü taraf homepage yerine doğrulanmış sayısal ID ile TMDB movie/TV sayfasına gider.

## Logo

`public/attribution/tmdb.svg`, resmî sayfadaki **Primary short (blue)** SVG'nin değiştirilmemiş kopyasıdır: [kaynak dosya](https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg).
SHA-256: `5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4`. Oran/renk değişmez, uygulama markasından daha az belirgin gösterilir. Logo, özel bir TMDB ürün onayı iddiası değildir.

## Saklama ve enablement açık sınırı

Yeni acquisition kapalı, yeni Discovery persistence engellidir. Altı aylık lifecycle motoru bu fazda **uygulanmamıştır**. Gelecekte provider alanları kullanıcı notu/puanı/ilerlemesinden ayrılmalı; gerçek acquisition zamanı korunmalı; altı ayı geçmeyen son kullanma tarihi belirlenmeli; süre dolmadan bounded yenileme denenmeli; başarısızlık süreyi uzatmamalı ve son tarihte metadata/türetilmiş cache silinmelidir. Legacy okuma veya başarısız fetch yeni acquisition sayılmaz. Güncel kısa cache TTL'leri hukuki saklama kabulü değildir.

Offline cihazlar, mevcut Cloud/export/restore ve backup kopyaları için tamamlanmış retention kanıtı yoktur; bu turda bunlar değiştirilmez. Kaynağını yitirmiş birleşik veri ve serbest metin için genel AI isolation garantisi verilmez. Bu açıklar çözülmeden TMDB Production enablement yapılmaz. Hiçbir API anahtarı gerekli değildir.
