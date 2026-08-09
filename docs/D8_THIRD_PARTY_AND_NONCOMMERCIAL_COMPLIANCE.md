# D8 third-party ve non-commercial compliance envanteri

Doğrulama tarihi: 2026-08-09. Bu belge hukuk görüşü değildir; release öncesi ürün/operasyon kontrol listesidir. Yalnız resmi kaynaklar kullanılmıştır.

| Servis | Rol ve release contract'ı | Attribution / retention / AI sınırı | Durum |
| --- | --- | --- | --- |
| AniList | Anime/manga arama | [Terms](https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use): non-commercial kullanım; ticari eşik/lisans, backup/hoarding ve rakip tracker kısıtları var. [Rate limit](https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/rate-limiting): 429 `Retry-After`; sayfa geçici 30 rpm degraded limit bildiriyor. Kalıcı katalog kopyası yapılmamalı. | Ticari release için blocker; mevcut fail-soft arama low-volume kalmalı. |
| TVMaze | Dizi arama/takvim | [API](https://www.tvmaze.com/api): CC BY-SA attribution/link; en az 20 çağrı/10 sn/IP, 429 backoff; output 60 dk, image URL'leri uzun süre cachelenebilir. Ticari kullanım ayrı lisans gerektirebilir. | Attribution mevcut; lisans modeli release öncesi doğrulanmalı. |
| TMDB | Film arama/takvim | [FAQ](https://developer.themoviedb.org/docs/faq): non-commercial attribution ile; commercial lisans ayrı. About/Credits'te TMDB notice ve resmi logo gerekir. | Exact notice eklendi; onaylı TMDB logo asset'i yok, release blocker. |
| OMDb | Film fallback | [Legal](https://www.omdbapi.com/legal.htm): kişisel/non-commercial; ticari kullanım yasak. | Ticari release blocker; fallback kapatılmalı veya lisans alınmalı. |
| Open Library | Kitap arama | [API](https://openlibrary.org/developers/api): human-facing low-volume, cache, tanımlayıcı User-Agent; varsayılan 1 rps, tanımlı istemci 3 rps. [Licensing](https://openlibrary.org/developers/licensing): kayıt/katkı bazlı haklar değişebilir. | Server User-Agent desteği eklendi; gerçek contact env release kapısı. |
| Wikimedia / Wikipedia / Wikidata | D7 bounded research evidence | [Wikimedia Terms](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use), [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing): Wikipedia metni ağırlıkla CC BY-SA attribution/share-alike; dosya bazlı lisans değişir; Wikidata CC0. Revision-bound citation korunur, transient passage/prompt persist edilmez. | Research default disabled; açılırsa citation/attribution zorunlu. |
| OpenAI | Planning/extraction/discovery | [Data use](https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/): API verisi varsayılan olarak training için kullanılmaz; opt-in ayrıdır. Raw prompt/response persist edilmez. | Admin-only + explicit model/key; DPA/region review release kapısı. |
| Groq | Planning/extraction/discovery | [Data](https://console.groq.com/docs/your-data): inference içeriği varsayılan retention dışı; abuse/reliability kayıtları ve metadata koşulları vardır, ZDR sunulur. [Agreement](https://console.groq.com/docs/legal/services-agreement): explicit izin olmadan training yok. | ZDR/retention seçimi ve hesap sözleşmesi doğrulanmalı. |
| OpenRouter | Provider router/discovery | [Privacy](https://openrouter.ai/docs/guides/privacy/data-collection), [ZDR](https://openrouter.ai/docs/guides/features/zdr): endpoint/provider bazlı logging ve retention değişir; ZDR routing ayrıca uygulanır. | ZDR-compatible endpoint zorunlu değilse production rollout blocker. |
| Google Gemini | Opsiyonel provider | [Gemini API Terms](https://ai.google.dev/gemini-api/terms): paid/unpaid data treatment ve bölgesel koşullar farklıdır. | Paid service + region/account contract doğrulanmadan açma. |
| Supabase | Auth/Postgres/Storage | [Terms](https://supabase.com/terms), [DPA](https://supabase.com/legal/dpa): controller configuration, region, retention ve subprocessors deployment sahibi tarafından doğrulanır. | Staging/prod ayrımı ve DPA/backup/PITR review kapısı. |
| Vercel | Next.js hosting | [Legal](https://vercel.com/legal), [DPA](https://vercel.com/legal/dpa): runtime/log/analytics yapılandırması ve kişisel veri sorumluluğu deploy sahibindedir. | Region/log retention/env secret review kapısı. |
| Lucide | UI iconları | [ISC/MIT license notice](https://github.com/lucide-icons/lucide/blob/main/LICENSE). | Dağıtım license notice envanterinde korunmalı. |

Uygulamadaki Ayarlar veri kaynakları alanı TVMaze/AniList/Open Library/TMDB ve OMDb bağlantılarını gösterir. Provider response veya kullanıcı prompt'u telemetry/persistence'e yazılmamalı; sadece safe code, süre, provider, attempt/call sayısı tutulabilir. Exact fiyat doğrulanmadığı için para tahmini yapılmaz; çağrı/token bütçesi kullanılır.

## Release blocker özeti

- Ticari dağıtım niyeti varsa AniList, TVMaze, TMDB ve özellikle OMDb lisans kararı kapanmadan release edilmez.
- Resmi TMDB logo/brand asset'i ve dağıtım license-notice yüzeyi tamamlanmalı.
- OpenRouter ZDR/provider retention, Gemini paid-data bölgesi, Supabase/Vercel DPA-region-log retention deployment sahibi tarafından onaylanmalı.
- Research production'da disabled kalır; active açma citation, rate/cost ve cross-instance limiter/cache kararına bağlıdır.
