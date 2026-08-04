# D4 Stabilizasyon ve Kabul

Bu belge D4'ün tek kabul özetidir. Performans gerekçeleri [D4_PERFORMANCE_AND_STATE_AUDIT.md](./D4_PERFORMANCE_AND_STATE_AUDIT.md), UI ve tema kararları [D4_UI_THEME_POLISH.md](./D4_UI_THEME_POLISH.md) içinde ayrıntılıdır.

## Kabul edilen sözleşmeler

### Cloud, profil ve metrik

- Sync snapshot queue, canlı in-flight, retryable/blocked, adapter, rollout ve son sonuç durumlarını reaktif yayımlar.
- Aktif flush sırasında yeni uygun işlem bounded sonraki batch'te tüketilir; başarısız işlem sıkı retry döngüsüne girmez.
- Rollout sözleşmesi bilinmiyor, bakımda veya reload gerektiriyorsa Cloud mutation fail-closed durur; local-first kullanım sürer.
- Profil cache'i owner-scoped `ownerId + summary|hero` anahtarını, 5 dakika TTL'yi ve aynı anahtar için request coalescing'i kullanır. Blob/base64 cache'e yazılmaz; upload/save ilgili kaydı günceller veya geçersizleştirir.
- Cloud dünya metriği allocation XP, local fallback medya adedidir. Birim ve kaynak kullanıcıya açıkça gösterilir.

### UI, tema ve takvim

- Seyrek ayar/bakım alanları ortak `CollapsibleSection` kullanır; `aria-expanded`, `aria-controls`, görünür durum, klavye odağı, session state ve reduced-motion sözleşmeleri korunur. Kritik hata ilgili bölümü görünür tutar.
- Medya/seri başlığı varsayılan iki satırdır; fine-pointer hover/focus sırasında gerçek alan genişler. Favori, poster, aksiyon ve rozetler başlığı tek harfe sıkıştırmaz.
- Ana tür her kayıtta gösterilir; alt tür yalnız yapılandırılmış ve yeni bilgi taşıyorsa görünür. Tekrarlanan veya tahmin edilen alt tür yoktur.
- Açık presetler background, panel, card, elevated, input, border, hover ve selected katmanlarında ayrışır. Koyu presetlerin kimliği korunur; custom tema verisi migration olmadan değiştirilmez.
- Marka tek SVG mask varlığını kullanır ve tema tokenından yeterli kontrastlı renk alır.
- “Yakında” aynı D3 Release Calendar hook/read-model'ini tüketir, en fazla üç uygun olay gösterir ve ayrı provider isteği/cache'i oluşturmaz.
- Monokrom palette beş ayırt edilebilir nötr basamak kullanır; grafik segmenti ile legend aynı kayıt değerini tüketir ve ayrım yalnız renge bırakılmaz.

## Otomatik doğrulama

Canonical komutlar:

```bash
npm run lint
npm run test:run
npm run build
git diff --check
```

Test sayısı bu belgede sabitlenmez; güncel sonuç `npm run test:run` çıktısıdır. Contract testleri kaynak yapısını, token sözleşmelerini, filtreleri ve state geçişlerini doğrular; tek başına görsel browser veya canlı Cloud kanıtı sayılmaz.

## Browser smoke

D4-3 sırasında 1280×720, 1366×768, 1536×864, 1920×1080 ve 375×812 boyutları yerel uygulamada kontrol edildi. Ana belge genişliği viewport'u aşmadı; Dashboard/“Yakında”, kart başlıkları, subtype chip'leri, açık tema yüzeyleri, Yolculuk/özet kartları ve settings collapsible yapısı incelendi. Console error/warning görülmedi.

Browser smoke ile contract testleri ayrı kanıtlardır. Fine-pointer hover görsel tetiklenmesi otomasyon sürücüsünde oluşmadığı için 2 → 6 satır CSS davranışı contract testiyle doğrulandı; uzun gerçek başlıkla manuel hover kontrolü düşük riskli kalan adımdır.

## D4 kapanış kararı

D4 kod, test ve yerel browser kabul kapsamı tamamlanmıştır. Bu karar deployment, production Supabase cutover veya canlı iki hesaplı Cloud smoke iddiası içermez. D2C.1 production cutover [ROADMAP.md](./ROADMAP.md) uyarınca D8 aşamasındadır.

D4 sonrasında D5-2 kapsamında yapılan açık-tema preset rötuşları ayrı contract testleriyle korunur; bunlar doğrulanmış bir “D4-4” production veya rollout aşaması olarak sunulmaz.
