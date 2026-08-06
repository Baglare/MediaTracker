# AI Recommendation V2 — D6.6-1 Capability ve Türkçe Parser

> Durum: Parser, evidence capability, ranked-tag aggregation, weighted coverage ve deterministik priority hardening uygulanmıştır. Ranked-tag constraint'in provider retrieval bağlantısı [D6.6-1R](AI_RECOMMENDATION_V2_D661R_RANKED_TAG_RETRIEVAL.md) içinde tamamlanmıştır. Bu çalışma canlı provider kalite kabulü değildir; `D6_PROVIDER_LIVE_SMOKE` D6.6-2'ye aittir.

## Read-only audit sonucu

| Alan | Doğrulanan kök neden | D6.6-1 kararı |
|---|---|---|
| Alias çözümleme | Extractor normalize edilmiş bütün alias'a dar bir sabit suffix regex'i bağlıyordu; `entrikanın`, `entrikası`, `entrikaya` kapsam dışıydı. | Registry phrase'lerini kullanan longest-match ve kontrollü token suffix çözümleme. |
| Role/merkeziyet | 24 karakterlik context'teki herhangi bir `güçlü` primary üretebiliyor; önemli/significant ve incidental ifadeler merkezi değildi. | Ortak role/centrality sinyalleri; `ana tema=primary`, `ana unsurlardan biri=significant`, `arka planda/incidental=prefer`. |
| Follow-up | Ortak extractor çağrısından sonra romance/fantasy/love-triangle özel regex patch'leri uygulanıyordu. | Follow-up ilk yorumla aynı matcher/extractor'ı kullanır; aspect özel production regex'i yoktur. |
| Evidence | Narrative/relationship/tone claim'leri source capability ayrımı olmadan genel noisy-or hesabına giriyordu. | Registry'de 43 aspect için `defaultEvidenceStrategy` ve provider override. |
| Semantic sınırlama | `semanticVerifier=required_for_hard_decision` olsa da structured claim strength üretebiliyor; editör capability göstermiyordu. | Semantic-required structured claim yok sayılır; saf capability read-model ve kullanıcı aksiyonları gösterilir. |
| AniList rank | Rank yalnız lineer `0.50–1.00` faktörüydü; narrative aspect bandı yoktu. | Merkezi ranked-tag bantları; rank ham yüzde veya ekran süresi değildir. |
| Ranking | Tuple `requestFit → personalFit → evidenceConfidence` idi. | `requestFit → evidenceConfidence → personalFit → quality → novelty → identity`. |
| Coverage | Explicit pozitif aspect'lerden yalnız birinin eşleşmesi binary kapıyı açıyordu; ağırlıklı açıklama yoktu. | Gate hâlâ en az bir explicit doğrulanmış eşleşmedir; breakdown weighted coverage taşır. |

## Türkçe morphology-aware phrase matcher

[`turkish-normalizer.ts`](../features/recommendations/intent/turkish-normalizer.ts) NFKC, `tr-TR` lowercase, normalize apostrophe, noktalama sınırı ve whitespace canonicalization uygular. [`aspect-phrase-matcher.ts`](../features/recommendations/intent/aspect-phrase-matcher.ts) yalnız registry ID/label/alias phrase'lerinden pattern üretir ve en uzun phrase'i önce seçer.

Desteklenen kontrollü ekler:

- belirtme: `ı/i/u/ü`, `yı/yi/yu/yü`
- yönelme: `a/e`, `ya/ye`
- bulunma/ayrılma: `da/de/ta/te`, `dan/den/tan/ten`
- ilgi/iyelik: `ın/in/un/ün`, `nın/nin/nun/nün`, `sı/si/su/sü`
- çoğul/türetim: `lar/ler`, `lı/li/lu/lü`, `lık/lik/luk/lük`

Suffix en fazla üç kontrollü adım soyulur ve yalnız sonuç registry token'ına eşitse kabul edilir. `ğ→k` restorasyonu yalnız bu exact eşleşme için kullanılır. Kısa token suffix çözümü ancak çok sözcüklü alias içindeyken etkinleşir. Genel kök tahmini, sözlük, fuzzy veya başlık eşleşmesi yapılmaz.

Koruma örnekleri: `politika` political intrigue değildir; `romantik komedi` love triangle değildir; `karakter` tek başına character-driven değildir; `okul sahnesi` academy değildir; `güçlü ana karakter` power progression değildir.

## Role ve merkeziyet

- Must: `zorunlu`, `olmalı`, `istiyorum`, `arıyorum`, `içersin/içermeli`, `merkezinde olsun`, `ana tema olsun`, `temel unsurlardan biri olsun`.
- Prefer: `tercih ederim`, `mümkünse`, `olabilir`, `biraz`, `arka planda`, `hafifçe`, `olsa iyi olur`.
- Avoid: `olmasın`, `istemiyorum`, `içermesin`, `kaçın`, `fazla olmasın`, `mümkün olduğunca az`, `hariç tut`.
- Primary: `ana tema`, `hikâyenin merkezinde`, `temel odağı`, `baskın tema/olduğu`, `ağırlıklı`, `odak noktası`.
- Significant: `belirgin`, `önemli bir tema`, `ana unsurlardan biri`, `güçlü biçimde yer alan`, `yoğun biçimde`, `kayda değer`, `etkili bir unsur`.
- Incidental/prefer: `biraz`, `arka planda`, `hafif`, `kırıntı düzeyinde`, `yan unsur`.

D6-5.2 uyumluluğu için `güçlü`, yalnız matched aspect phrase'e doğrudan komşuysa primary kabul edilir; aynı clause içindeki başka bir “güçlü” sözcüğü yeterli değildir. Aynı aspect farklı clause'larda çelişkili rol üretirse constraint seçilmez ve clarification issue taşınır. Kullanıcının editörde onayladığı `minimumLevel` recommendation server'ında yeniden tahmin edilmez.

## 43 aspect evidence strategy

| Strategy | Sayı | Aspect'ler |
|---|---:|---|
| `exact_taxonomy` | 13 | romance, action, adventure, comedy, drama, mystery, horror, fantasy, sci_fi, slice_of_life, supernatural, psychological, historical |
| `ranked_tag` | 21 | political_intrigue, power_progression, revenge, survival, found_family, coming_of_age, academy, time_travel, game_system, isekai, antihero, love_triangle, enemies_to_lovers, friendship_focus, family_focus, dark, tragic, violence_gore, fanservice, sexual_content, disturbing_content |
| `semantic_required` | 9 | slow_burn, cozy, emotional, hopeful, slow_paced, fast_paced, character_driven, plot_driven, episodic |
| `soft_only` default | 0 | Provider override olarak kullanılır. |

Provider strategy farkları:

- AniList exact genre ve ranked tags kullanır.
- Ranked-tag aspect'lerinde TVMaze/TMDB/OMDb/Open Library `soft_only` override'dır; TMDB keyword AniList rank gibi yorumlanmaz.
- Exact-taxonomy aspect'lerinde Open Library `soft_only` override'dır; subject exact provider genre değildir.
- Provider `unsupported` mapping'i strategy'den bağımsız olarak contribution ve capability üretmez.

## Capability read-model

[`evidence-capability.ts`](../features/recommendations/domain/evidence-capability.ts) `structured_supported`, `ranked_tag_supported`, `requires_semantic_verifier`, `soft_only` veya `unsupported_for_target` sonucu; provider listesi, reason code, kullanıcı metni ve role izinlerini üretir.

Explicit hard constraint sessizce prefer'e çevrilmez. Interpret draft capability bilgisini ve gerçekten yapılandırılmış verifier mode'larını döndürür. Editör tercihe çevirme, kaldırma ve yalnız endpoint yapılandırılmışsa local/remote verifier seçme aksiyonu sağlar. Recommendation route aynı policy'yi server'da yeniden çalıştırır; geçersiz hard constraint `structured_request_capability_invalid` kontrollü 422 cevabıdır. Client capability payload'ı güvenlik kaynağı değildir.

D6.6-1R ile `ranked_tag_supported` yalnız hedef provider/media türünde queryable canonical retrieval mapping varsa verilir. Strategy sahibi fakat mapping'i olmayan ranked-tag constraint soft-only/mapping-missing capability gösterir; hard request title-search'e gönderilmez.

D6.6-2 coverage ayrımı geniş/bileşik ranked aspect'leri daha dürüst sınıflandırır: `power_progression`, `found_family`, `coming_of_age`, `antihero`, `enemies_to_lovers`, `friendship_focus`, `family_focus`, `dark`, `disturbing_content` mapping yoksa `requires_semantic_verifier`; kalan mapping'siz ranked aspect'ler evidence-only/soft-only kalır. Tam matris [Ranked-Tag Provider Coverage](AI_RECOMMENDATION_RANKED_TAG_COVERAGE.md) belgesindedir.

## Ranked-tag ve soft evidence policy

| AniList tag rank | Level/confidence başlangıcı |
|---:|---|
| `85–100` | significant/high; primary yalnız farklı provider/field veya gerçek semantic claim gibi ikinci güçlü bağımsız kanıtla |
| `60–84` | significant/high |
| `40–59` | significant/medium |
| `20–39` | incidental/low |
| `<20` | contribution dışı; aspect unknown kalabilir |
| missing tag/rank | unknown; absent değildir |

Aynı provider/source/field/normalized value duplicate sayılmaz. Farklı tag adları bounded birleşir fakat aynı AniList tag alanı ikinci bağımsız kanıt sayılmaz. Contradiction confidence'ı bir kademe düşürür. Provider support cap korunur. Popularity/community score contribution üretmez.

TMDB tek mapped keyword en fazla incidental/low; aynı aspect'e map olan iki farklı keyword significant/medium üretebilir. Open Library subject-only partial/low kalır ve hard must capability sağlamaz. Semantic-required aspect gerçek verifier sonucu yoksa unknown'dır; hash/mock embedding semantic claim değildir.

Exact taxonomy için D6-5.2/D6-5.3 sözleşmesi değişmez: strong exact genre `significant/medium`, orta tag ile `significant/high`, güçlü tag ile `primary/high`, düşük tag-only `incidental`, claim yoksa `unknown`.

## Deterministik ranking ve coverage

Hard eligibility önce çalışır. Primary sort key:

1. request fit
2. evidence confidence
3. personal fit
4. quality signal
5. novelty
6. stable provider identity

Diversity rerank request fit ve evidence confidence eşitliğini bozamaz. LLM final sıraya girmez.

Coverage ağırlıkları: explicit must `2.0` (raporlama), explicit prefer `1.0`, inferred prefer `0.5`; profile ve avoid `0`. `matchedWeight`, `totalWeight`, `coverage`, matched/unmatched explicit aspect listeleri ve `meetsMinimum` taşınır. Explicit pozitif aspect yoksa gate uygulanmaz. Varsa en az bir explicit doğrulanmış eşleşme şartı korunur; yüzde-50 hard gate eklenmez. Weighted coverage request fit breakdown'ına girer, popularity veya profile açığı kapatamaz.

## Sınırlar

Yeni provider, model, dependency, DB/migration/RPC veya rollout değişikliği yoktur. Global Search, Release Calendar, MediaCard, SeriesGroupCard ve grid başlık düzeni değişmez. Legacy embedding/hybrid/ml-service dosyaları silinmez ve D6.6-1 deterministic final ranking yoluna bağlanmaz. D7 modeli bu aşamada eğitilmez veya çalıştırılmaz.
