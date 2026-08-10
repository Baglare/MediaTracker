# D8-1 API Request Boundary

## Search proxy sözleşmesi

TMDB, OMDb, TVMaze, AniList, Open Library ve sosyal kullanıcı araması browser/internal search istekleri yalnız `POST` ve `Content-Type: application/json` kabul eder. Kullanıcı metni internal URL query string'ine yazılmaz:

```json
{ "query": "aranacak metin" }
```

TMDB `mediaType`; AniList `category`, `genres`, `tags`, `episodesLte`, `minimumTagRank` ve `sort` için bounded allowlist uygular. AniList structured discovery'de `query` opsiyoneldir. Exact-ID/detail ve release-calendar read endpoint'leri değiştirilmemiştir.

Ortak sınırlar:

- unknown-field rejection;
- trim, boş sorgu reddi ve 200 karakter merkezi query limiti;
- 4 KiB body limiti ve yalnız JSON content type;
- browser isteklerinde same-origin `Origin` kontrolü;
- doğrulanmış Supabase user ID'si, anonymous akışta bounded IP fallback ile dakikada 60 process-local istek;
- upstream için 8 saniye timeout;
- tüm response'larda `Cache-Control: no-store`;
- stable public error code'ları ve free-text/secret içermeyen server logları.

AI POST route'ları aynı origin/content-type doğrulamasını, 1 MiB body limitini ve process-local user/guest rate limitini kullanır.

## Header tabanı

Global header contract CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`), `Referrer-Policy: strict-origin-when-cross-origin`, camera/microphone/geolocation kapalı `Permissions-Policy`, `X-Content-Type-Options: nosniff` ve defense-in-depth `X-Frame-Options: DENY` içerir. Supabase connect/image ve mevcut provider image hostları allowlist'te korunur; development HMR izinleri yalnız development modunda eklenir.

## Kalan rollout kapısı

Rate limiter process-local'dır; birden fazla instance toplam limiti paylaşmaz ve restart ile sıfırlanır. Staging origin/header/browser kabulü D8-4A'da geçti; distributed limiter ve production CDN/body/origin doğrulaması D8-4B mandatory hold/runbook kapısında kalır. Dependency veya production config değişikliği bu belge kapsamında yapılmamıştır.
