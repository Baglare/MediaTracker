# D8 release-candidate acceptance

Durum tarihi: 2026-08-10. Sonuç: **BLOCKED — D8-4A complete değildir.** Production veritabanı ve deploy hedefi kullanılmadı.

## Staging hard gate

Masked local preflight şu koşulları doğruladı: cutover ve migration izinleri explicit açık, staging/production ref sınıfları mevcut ve farklı, uygulama Supabase URL'si staging ref ile eşleşiyor, DB hedefi direct veya pooler kimliği üzerinden staging ref'e bağlı ve uygulama anon/service-role değerleri mevcut.

Bloklayan koşullar:

- `SUPABASE_TEST_URL` yok; staging URL eşleşmesi doğrulanamıyor.
- `SUPABASE_TEST_ANON_KEY` yok.
- User A/User B fixture e-posta ve parola contract'ı yok; iki farklı staging kullanıcısı kanıtlanamıyor.
- Bu statik kapılar geçmediği için service-role değerinin staging Auth API'de read-only doğrulaması yapılmadı.

Sonuç olarak remote DB bağlantısı, Auth Admin metadata değişikliği, migration, asset upload/delete ve remote fixture mutation yapılmadı. Mevcut staging schema A/B/C/D olarak sınıflandırılamadı; `remote_uninspected_hard_gate_blocked` sınıfındadır.

## Yerel acceptance

- Staging target parser Supabase direct host ve transaction/session pooler kullanıcı kimliği biçimlerini destekler; production ref aynı identity içinde görülürse fail-closed reddeder.
- Entitlement contract yalnız server-verified `app_metadata` admin claim'ini kabul eder. Admin bootstrap, iki-owner RLS, public theme/assets ve AI live acceptance hard gate nedeniyle çalıştırılmadı.
- Production başlangıç politikası `AI_SERVER_ACCESS_MODE=admin_only`, `D7_RESEARCH_ROLLOUT_MODE=disabled` olarak kalır.
- Internal discovery contract POST JSON, no-store, content-type/body/origin/rate/timeout sınırlarını korur.

Doğrulama sonucu:

- Hedefli D8/cloud/theme/provider seti: 9 dosya, 85 test geçti.
- Full suite: 177 dosya ve 2.297 test geçti; conditional live/key-gated 18 dosya ve 55 test skip oldu.
- Lint ve production build geçti. Build yalnız mevcut archived annotation NFT trace warning'ini üretti; yeni warning yok.
- Browser smoke 320×568, 375×812, 390×844, 1366×768 ve 1536×864 boyutlarında horizontal overflow üretmedi; discovery URL'sine sorgu taşınmadı ve console/hydration error görülmedi.
- TMDB, AniList, TVMaze, Open Library ve OMDb local POST proxy smoke'ları güvenli HTTP 200 döndürdü; kullanılan bounded sorgu için sonuç yoktu.
- Secret/ref karşılaştırmalı tarama, local Markdown linkleri, migration timestamp, dependency, generated junk ve private annotation artifact kontrolleri temiz geçti.

## Compliance gate

- TMDB notice görünür; fakat resmi onaylı TMDB logo asset'i yoktur ve release blocker'dır.
- OMDb varsayılan key olmadan kapalıdır; ticari kullanım kararı/lisansı yoksa production'da key sağlanmamalıdır.
- Open Library ve TVMaze server çağrıları bounded printable `MEDIA_TRACKER_PROVIDER_USER_AGENT` kullanabilir; production contact değeri ayrıca sağlanmalıdır.
- Wikimedia/Wikidata research default disabled'dır; açılırsa revision-bound citation ve attribution zorunludur.

## D8-4A'yı yeniden çalıştırma kapısı

Tracked dosyaya yazmadan local secret store'da staging ile eşleşen `SUPABASE_TEST_*` değerleri sağlanmalı. Ardından `node scripts/d8-staging-hard-gate.mjs` tüm kontrolleri true göstermeli; bundan önce hiçbir remote adım yapılmamalıdır.
