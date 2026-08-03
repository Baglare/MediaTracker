# D4 Performans ve State Denetimi

## Kanıtlanan sorunlar

- Cloud queue enqueue ve flush adımları subscription yayınlıyordu; ancak aktif flush sırasında eklenen yeni bir işlem batch sonunda otomatik olarak yeniden drain edilmiyordu. Bu kayıt gerçekte kuyrukta kalıyor ve sonraki mutation, manuel sync veya owner hydration bekliyordu.
- Kalıcı `dispatchStartedAt` crash/idempotency işaretidir. UI bunu canlı `in-flight` saydığı için tamamlanmış fakat retry bekleyen operasyonlar yanlış sınıflanabiliyordu.
- Shell profile summary, profil hero ve editör farklı `no-store` istekleri kullanıyordu. Summary/avatar için aynı anda mount olan consumer'lar arasında request coalescing veya session TTL yoktu.
- Profildeki `worldCounts` iki kaynaktan gelebiliyor: local fallback'te medya adedi, XP V2 summary'de dünyaya allocation edilmiş XP. Tek başlık bu iki metriği ayırmıyordu ve enum değerleri kullanıcıya ham gösteriliyordu.

## Yapılan düzeltmeler

- Sync manager canlı dispatch ID'lerini process belleğinde ayrı izler; durable dispatch marker retry/crash semantiğini korur.
- Bir flush sırasında eklenen yeni ve denenmemiş operasyonlar aynı owner/adapter için sonraki bounded batch'te drain edilir. Başarısız operasyonlar agresif döngüye sokulmaz.
- Manuel Cloud aktarımları aynı sync snapshot/read-model'e başarı, hata ve son sync zamanı bildirir.
- Owner-scoped bellek içi profile cache `ownerId + resource(summary|hero)` anahtarı kullanır. TTL 5 dakikadır; aynı anahtarın eşzamanlı isteği tek promise ile coalesce edilir. Var olan görsel hemen gösterilir, stale kaynak arka planda yenilenir.
- Avatar/banner upload ve profil save akışları ilgili owner cache'ini günceller. Cache localStorage'a blob/base64 yazmaz; logout ve account switch'te UI yalnız aktif owner anahtarını okur.
- Dünya kartı metriği kaynağa göre açıkça `medya` veya `XP` olarak etiketler. XP dünya toplamı; sosyal, sistem, bonus veya legacy correction nedeniyle global XP'ye eşit olmak zorunda değildir.
- Local fallback XP hesabı aynı `ProgressLog.id` replay'ini bir kez sayar; XP V2 tarafındaki server-authoritative idempotency semantiği değiştirilmedi.

## Önce / sonra

- Aynı owner summary'sini eşzamanlı isteyen iki consumer: en fazla 2 istekten 1 isteğe.
- TTL içinde profile route remount: yeniden summary/hero isteği yerine 0 ek istek.
- Aktif flush sırasında enqueue: navigasyon/sonraki mutation bekleyen queue yerine otomatik ikinci batch.
- Retry bekleyen durable marker: `in-flight + retryable` yerine yalnız `retryable`.

## Kalan riskler ve sınırlar

- Cache process/session belleğindedir; tam reload sonrası browser HTTP cache'i `no-store` nedeniyle yeniden istek gerekir. Signed URL süresi server tarafından 5 dakika olduğu için TTL bununla sınırlıdır.
- Profil editörünün tam veri endpoint'i yalnız edit modunda ayrı yüklenmeye devam eder; summary cache'e hassas editor payload'ı konmaz.
- Browser profiler ve gerçek iki hesap/Supabase smoke bu statik ve unit doğrulama turunda koşulmadı.
- Seri kartı, akordeon, logo/taxonomy rozeti, yaklaşan yayın widget'ı ve grafik paleti D4-2 kapsamında kalır.
