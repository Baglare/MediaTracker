# D8-2 — Profil tema, asset ve Keşif sağlamlaştırması

## Public tema gizlilik sözleşmesi

Public tema paylaşımı opt-in ve varsayılan olarak `hidden` durumundadır. Mevcut hesaplar migration sonrasında otomatik olarak tema yayımlamaz.

- `hidden`: Public RPC tema snapshot’ı döndürmez; ziyaretçinin uygulama teması kullanılır.
- `preset_only`: Profil sahibi açıkça seçtiği hazır temanın güvenli snapshot’ını yayımlar. `system` public preset değildir.
- `current_theme`: Aktif hazır tema veya doğrulanmış aktif özel tema yayımlanır.

`PublicProfileThemeSnapshot` yalnız sürüm, `preset|custom` kaynağı, renk şeması, revision/zaman ve sabit 21 semantic renk token’ını taşır. Özel tema ID’si, raw CSS, sınıf/style metni, `url()`, `var()`, görsel URL’si veya key/model/owner verisi taşımaz. Client-derived token kabul edilmez; server custom girdilerini tekrar normalize eder, tokenları mevcut türeticiyle üretir ve kritik kontrast kontrolünü yeniden çalıştırır. Decode bilinmeyen alan, eksik token veya hex olmayan değerde fail-closed davranır.

Snapshot değişkenleri yalnız `SocialProfileView` kök wrapper’ına inline CSS variables olarak uygulanır. ProfileHero, PageSection ve ProfileGrid bu scope’tan miras alır; app shell, sidebar, topbar ve başka route’lar değişmez. Snapshot yoksa veya bozuksa wrapper ziyaretçi temasına doğal olarak düşer.

## Metin rengi ve kontrast

Custom theme definition v2, `auto|custom` metin modu ile `textPrimary`, `textSecondary`, `textMuted` girdilerini destekler. V1 kayıtları local/cloud/import codec’lerinde v2 `auto` olarak normalize edilir; bundle allowlist’i yeni alanlarla genişletilmiştir ve compact first-paint cookie v4 custom renkleri round-trip ederken v3 okumaya devam eder.

Kritik eşikler primary/secondary ve accent üzeri metinde 4.5:1, focus göstergesinde 3:1’dir; muted metin mevcut erişilebilirlik politikasındaki 3:1 sınırını korur. Kritik hata tema aktivasyonunu ve public yayını engeller; draft kaydı ve otomatik düzeltme akışı korunur. Obsidian `accentContrast` tokenı 4.5:1 şartını karşılayacak biçimde düzeltildi; tüm preset’ler hedefli testten geçer.

## Avatar ve banner cache sözleşmesi

Own-profile bootstrap `/profile` başlangıç route’unda da çalışır ve pathname değişimine bağlı değildir. Memory cache owner/resource anahtarlı ve concurrent istekleri coalesce eder. Aynı veri schema v1, owner, resource, `fetchedAt` ve `expiresAt` ile yalnız `sessionStorage` içinde tutulur; signed URL/blob için yeni `localStorage` kaydı yoktur. TTL 240 saniyedir; süresi dolmuş URL gösterilmez. Owner değişiminde görünür state önce owner ID ile eşleştirilir; logout eski görünür state’i temizler. Upload/delete sonrası memory ve session cache mevcut event/update akışıyla yenilenir.

Server signed URL cache anahtarı bucket, asset kind, tam path ve revision’dan oluşur. En çok 256 process-local entry tutulur; 300 saniyelik signed URL için 240 saniye TTL uygulanır ve aynı anahtarın concurrent üretimi coalesce edilir. Path/revision değişimi doğal miss üretir; upload/delete eski path’i invalidate eder. Hatalar negative-cache edilmez. Cache instance-local’dır; distributed cache D8-3 rollout kararıdır. Viewer relationship ve profil visibility sonuçları global cache’e alınmaz.

## Keşif açıklama sözleşmesi

Global, AniList, TVMaze ve TMDB sonuç kartları ortak `SearchResultDescription` kullanır. Open Library kartında açıklama alanı bulunmadığından mevcut metadata düzeni korunur. Ortak normalizer script/style/iframe bloklarını ve markup’ı kaldırır, güvenli HTML entity’lerini plain text’e çevirir, kontrol karakterlerini temizler ve çıktıyı 2.000 karakterle sınırlar. `dangerouslySetInnerHTML` kullanılmaz.

Kart açıklaması mobilde en çok iki, `sm` ve üstünde en çok üç satırdır; line-clamp yanında max-height, overflow-hidden ve anywhere wrapping uygulanır. Kart kökleri `min-w-0`/overflow sınırı ve semantic app surface/text tokenları kullanır; action alanı `shrink-0` kalır.

## D8-1 preflight ve rollout

Search/provider proxy upstream timeout’u 8 saniye olarak korunur. `/api/ai/recommend` üzerinde blanket 8 saniyelik timeout yoktur; provider planlama 25 saniye ve active grounded research 12 saniye stage bütçesini korur. Production payload builder’ın 1.000 media item, progress log, settings, structured request ve feedback alanlarını içeren normal fixture’ı 1 MiB AI sınırının altında kabul edilir; 1 MiB üzerindeki payload 413 ile reddedilir. Search limitleri değiştirilmemiştir.

`20260809120000_d8_public_profile_theme.sql` additive migration’dır. `profile_theme_visibility` varsayılanı `hidden` olur, owner-only save RPC yeni alanları yazar ve public RPC yalnız yayımlanmış snapshot’ı döndürür. Doğrudan RPC çağrısı da tam root/token allowlist’i, hex biçimi, preset-revision eşleşmesi ve aynı kritik kontrast eşikleriyle fail-closed doğrulanır. Bu çalışma migration’ı hiçbir veritabanına uygulamaz; preflight, staging apply/RLS doğrulaması ve production rollout ayrı D8 kapısıdır.
