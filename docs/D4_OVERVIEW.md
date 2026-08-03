# D4 Genel Bakış

## Amaç

D4; MediaTracker'ın mevcut local-first ve opsiyonel Cloud mimarisini değiştirmeden performans, durum doğruluğu, erişilebilirlik ve responsive kullanım güvenilirliğini tamamlar. Yeni veri modeli veya provider sistemi eklemez.

## Aşamalar

- **D4-1 — Performans ve state:** Cloud sync durumunu reaktif snapshot'a bağladı; queue → in-flight → ready geçişlerini görünür kıldı; aynı flush sırasında eklenen işlemleri bounded batch ile tüketti. Profil `summary` ve `hero` isteklerine owner-scoped, 5 dakika TTL'li bellek cache'i ve request coalescing ekledi. Dünya metriğinin Cloud allocation XP ile local medya adedi kaynaklarını ayırdı.
- **D4-2 — UI ve tema:** Ayar yoğunluğunu ortak erişilebilir collapsible primitive ile azalttı; medya/seri kartı başlıklarını responsive hâle getirdi; sınıflandırma rozetlerini tek politikada topladı. Açık tema kimliklerini semantic yüzey tokenlarıyla ayırdı, SVG mask logoyu tema uyumlu yaptı, D3 read-model'inden “Yakında” özetini ekledi ve monokrom grafiği ayırt edilebilir hâle getirdi.
- **D4-3 — Stabilizasyon:** Başlık hover davranışını gerçek başlık alanı genişlemesi olarak geri getirdi; subtype chip, açık tema, Yolculuk ve Dashboard kontrastlarını güçlendirdi. Tema/personalization alt bölümlerinde collapsible kapsamını genişletti ve beş hedef viewport'ta browser smoke yaptı.

## Ana teknik kararlar

- Cloud UI, `useSyncExternalStore` tabanlı tek `SyncSnapshot` kaynağını tüketir. Rollout sözleşmesi doğrulanamazsa mutation dispatch fail-closed durur; local kullanım devam eder.
- Profil cache anahtarı `ownerId + summary|hero` bileşimidir. Cache process belleğindedir; blob/base64 taşımaz ve upload/save sonrası ilgili owner kaydı güncellenir veya geçersizleştirilir.
- Tema kimliği preset token registry'den gelir; feature component'leri preset adına göre renk seçmez. Mevcut custom tema girdileri migration yapılmadan korunur.
- Release Calendar'ın otomatik provider cache'i yeniden üretilebilir veridir. Manuel olaylar ve gizleme kararları `MediaItem.releaseCalendar` kullanıcı verisidir. “Yakında” aynı D3 read-model'ini tüketir; ikinci fetch/cache sistemi değildir.
- Local dünya dağılımı medya adedi, Cloud profil dünya dağılımı allocation XP'dir. Dünya XP toplamının global XP'ye eşit olması gerekmez.

## Ölçülen önce / sonra

- Aynı owner/resource için eşzamanlı profil istekleri iki ayrı istek yerine tek in-flight promise paylaşır; TTL içindeki tekrar ek ağ isteği üretmez.
- Aktif flush sırasında eklenen uygun işlem sonraki dış eylemi beklemek yerine bounded ikinci batch'e alınır.
- Medya ve seri başlıkları varsayılan iki satırdır; fine-pointer hover/focus ile gerçek başlık alanı altı satıra kadar genişleyebilir. Tooltip başlığın yerine geçmez.
- 1280×720, 1366×768, 1536×864, 1920×1080 ve 375×812 browser smoke sırasında belge düzeyinde yatay taşma ve console error/warning görülmedi.

## Belgeler

- Performans ve state ayrıntıları: [D4_PERFORMANCE_AND_STATE_AUDIT.md](./D4_PERFORMANCE_AND_STATE_AUDIT.md)
- UI, tema ve erişilebilirlik kararları: [D4_UI_THEME_POLISH.md](./D4_UI_THEME_POLISH.md)
- Tek kabul özeti ve doğrulama sınırları: [D4_STABILIZATION_AND_ACCEPTANCE.md](./D4_STABILIZATION_AND_ACCEPTANCE.md)

## Kalan düşük riskler

- Browser smoke gerçek viewport ve taşma/console kontrollerini kapsadı; otomasyon sürücüsü fine-pointer `:hover` durumunu görsel olarak etkinleştiremedi. Uzun başlıklı gerçek fixture ile kısa manuel hover kontrolü yararlıdır.
- Statik kontrat ve unit testleri canlı Supabase/RLS, production deployment veya cihazlar arası gerçek ağ kanıtı değildir.

