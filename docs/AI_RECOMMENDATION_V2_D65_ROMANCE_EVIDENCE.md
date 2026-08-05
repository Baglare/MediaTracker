# AI Recommendation V2 — D6-5.2 Romance Evidence

> Durum: D6-5.2 sözleşmesi uygulanmıştır. Bu çalışma sentetik contract fixture'larını doğrular; D7 insan etiketli threshold kalibrasyonu değildir.

## Kök neden

Gerçek akışta parser `romance:must:explicit` üretip onaylanmış request'i route ve AniList structured discover'a taşıyordu. AniList `Romance` genre ve tag claim'leri evidence sidecar'a ulaşıyor ve registry üzerinden `romance` aspect'ine eşleniyordu. Sorun iki sonraki karardaydı:

1. Genre katkısı `0.55 × 0.90 = 0.495` kaldığı için `significant` eşiğinin hemen altında `incidental` oluyordu.
2. Balanced eligibility, tek fakat registry'de strong destekli structured genre claim'inin `medium` confidence sonucunu kabul etmiyordu.

Bu nedenle retrieval veya seçilen OpenAI/Gemini sağlayıcısı kök neden değildi. LLM yalnız retrieval planning yapabilir; onaylı structured request guardrail'i ve final deterministic eligibility/ranking provider seçimine göre değişmez.

## Parser ve minimumLevel UX

- “Güçlü romantizm”, “romantizm ağırlıklı” ve “romantizm ana tema” `minimumLevel=primary` üretir.
- Genel bir must veya UI'dan yeni must için merkezi varsayılan `significant`tır.
- Legacy/session must constraint'inde seviye yoksa versioned codec `significant` ile canonicalize eder.
- UI bu değerleri **Belirgin veya ana unsur** ve **Yalnız ana unsur** olarak gösterir; raw enum basmaz.
- “Romantizmi daha güçlü olsun” patch'i existing request'teki romance constraint'ini explicit `primary` yapar.

## Structured-only AniList romance politikası

Sabitler yalnız [`aggregation.ts`](../features/recommendations/evidence/aggregation.ts) içindeki merkezi policy'dedir:

| Structured claim | Sonuç başlangıcı | Confidence |
|---|---|---|
| Yalnız AniList Romance genre | `significant` tabanı | En fazla `medium` |
| Genre + orta romance tag rank | güçlü `significant` tabanı | Bağımsız alanlarla `high` olabilir |
| Genre + yüksek romance tag rank | `primary` tabanı | Bağımsız alanlarla `high` olabilir |
| Yalnız düşük rank romance tag | Genel bounded hesap; tipik `incidental` | Claim'e göre low/medium |
| Romance claim yok | `unknown`, strength `null` | `unknown` |

Tag rank provider relevance sinyalidir; ekran süresi, doğruluk yüzdesi veya kullanıcıya gösterilecek romantizm yüzdesi değildir. Genre ve tag aynı provider'dan gelse de farklı alanlardır; duplicate field/value claim'i confidence şişirmez. Contradiction supporting evidence'i silmez, confidence'ı düşürür.

Balanced mod registry'de `strong` destekli, reliability'si yeterli structured genre baseline'ını kabul eder. Strict mod varsayılan high-confidence şartını korur. Popularity, community score ve personal fit romance evidence değildir.

## Evidence trace ve eligibility

[`RecommendationEvidenceTrace`](../features/recommendations/evidence/trace.ts) candidate exact identity, title snapshot, tek constraint, en fazla 12 raw/mapped claim, aggregation sonucu, eligibility kararı ve failed rule taşır. Trace test/debug contract'ıdır; normal `AiRecommendResponse` içine eklenmez, personal note veya secret taşımaz.

Exploratory primary koşulunu gevşetmez. `primary` istenirken `significant/incidental` aday bounded near-match olabilir; romance `unknown` aday popularity nedeniyle near-match'e alınmaz. Love-triangle avoid ihlali primary'den çıkar ve olumlu fit/açıklama üretmez.

## No-result ayrımı

Makine-okunur nedenler provider adayı yok, identity doğrulanmadı, romance strength, confidence, avoid, objective ve request coverage durumlarını ayırır. UI raw kodu göstermez. Romance merkeziyetinde elenen havuz için “Romantizm için istenen merkeziyet düzeyini karşılayan doğrulanmış aday bulunamadı.” metni ve hangi constraint'in `primary → significant` veya `must → prefer` yapılacağına ilişkin açık aksiyon gösterilir.

## Duplicate mesaj ve near-match kartı

Duplicate kullanıcı iletisinin nedeni interpret success ve recommendation submit'in aynı mesajı ayrı ayrı history'ye eklemesiydi. Tek sahiplik interpret aşamasına verildi. Stable event ID aynı async event'in tekrarını engeller; aynı metni farklı ID ile gerçekten yeniden yazmak mümkündür. Recommendation retry yeni user mesajı üretmez; session hydration mevcut ID'leri korur.

Primary ve near-match kartları ortak header layout'unu kullanır. Near-match kapak, iki satırlı genişleyebilir başlık, medya/provider, ayrı **Yakın eşleşme** etiketi, karşılanan/karşılanmayan constraint, confidence özeti, Quick Add/Discover ve dismissal aksiyonunu taşır. Ham score/tag rank/reason code gösterilmez.

## D7'ye kalan

`0.55/0.68/0.78` başlangıç tabanları ve `40/75` tag-rank bantları sentetik contract davranışını sabitler; kalite garantisi değildir. Gerçek provider snapshot'ları ve en az iki annotator'lü gold set olmadan threshold/weight optimizasyonu yapılmaz.

## Doğrulama — 5 Ağustos 2026

- Lint ve production build temiz geçti.
- Tam suite: 131 dosya; 126 passed, 5 conditional skip. 1646 testin 1612'si passed, 34'ü skip. D6-5.2 ile 11 yeni test eklendi.
- Production browser: parse sonucu primary minimum, editable significant minimum ve avoid eşiği doğru; reload sonrası tek kullanıcı mesajı ve seçilen seviye korundu.
- 1280×720, 1366×768, 1536×864, 1920×1080 ve 375×812 viewport'larında yatay overflow/raw enum/console error görülmedi.
- Near-match/result fixture contract'ı geçti; canlı provider sonucu olarak sayılmadı.
- `D6_PROVIDER_LIVE_SMOKE` kapalıydı; live AniList trace skip edildi. Test sırasında provider/model/web/DB isteği yapılmadı.
