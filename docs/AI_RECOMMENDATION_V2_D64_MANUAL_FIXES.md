# AI Recommendation V2 — D6-4 Manuel Kabul Düzeltmeleri

> Kapsam: D6-5.1. Registry ID'leri, deterministik sort tuple'ı, provider kimlik politikası ve Global Search/Release Calendar davranışı değiştirilmemiştir.

## Manuel test bulguları ve kök nedenler

| Bulgu | Kök neden | Düzeltme |
|---|---|---|
| Incidental aşk üçgeni primary'de kaldı ve pozitif fit etiketi oldu | Eşiksiz avoid `significant` varsayılıyordu; `passed` avoid kararı request-fit/fit/açıklama tarafından pozitif karar gibi okunuyordu | Merkezi default `incidental`; medium/high ihlal hard reject, low confidence risk; avoid bütün pozitif score/label/reason yollarından çıkarıldı |
| Romance must aday bulamadı, raw conditional code göründü | Onaylı structured request retrieval'a taşınmıyor, candidate arama eski message/intent'e bağlı kalıyordu; warning doğrudan basılıyordu | Structured request provider plan guardrail'ı ve AniList structured discover filtresi; merkezi Türkçe warning mapper |
| Romance kanıtsız yüksek puanlı aday listeye girdi | Prefer hard must olmadığı için explicit request coverage sıfır adaylar yalnız quality tie-break ile kalabiliyordu | En az bir explicit pozitif aspect varsa en az bir supporting incidental+ ilişki zorunlu minimum relevance kapısı |
| Uzun başlık dar sütuna düştü | Poster, title ve fit badge aynı flex başlık satırında yarışıyordu | Badge ayrı satır; `min-width:0`, normal word-break, iki satır clamp ve hover/focus-within açılımı |

## Avoid semantiği

- Default `rejectAtLevel=incidental`; codec legacy/session eşiksiz avoid kaydını bu değere canonicalize eder.
- Balanced ve strict modlarda incidental+ medium/high evidence primary'yi reddeder. Low confidence evidence risk olarak kalabilir.
- Exploratory aynı primary kuralını korur; kanıtlı ihlal yalnız ayrı near-match listesine girebilir.
- Avoid evidence `requestFit`, `evidenceConfidence`, fit etiketi, olumlu explanation/evidence chip veya aspect kaynaklı personal-fit bonusu üretmez.
- `love_triangle`, `fanservice`, `sexual_content`, `violence_gore` ve `disturbing_content` aynı merkezi policy'den geçer.

## Romance retrieval ve minimum relevance

Onaylı request, provider planına target/preference/avoid guardrail uygular. AniList için registry `core + strong` pozitif aspect label'ı genre discover filtresine çevrilir; romance `Romance` olur. Episode `lte` objective değeri AniList'in strict-less-than parametresine güvenli biçimde `value + 1` olarak taşınır. Relaxed retrieval must genre'ını korur; final hard filter gevşemez. AniList genre ve ranked tag claim'leri mevcut merkezi alias mapper üzerinden `romance` aspect'ine ulaşır.

Explicit pozitif aspect bulunan istekte candidate'ın en az bir explicit aspect için `incidental|significant|primary`, `confidence!=unknown` ve supporting evidence taşıması gerekir. Bu gate general/aspectsiz isteğe uygulanmaz; profile, popularity ve community score coverage üretmez. Kakegurui-benzeri yüksek community/unknown-romance fixture primary dışındadır.

## Kart ve kullanıcı metni

- Fit etiketi yalnız karşılanmış pozitif constraint, doğrulanmış objective veya bounded personal-fit sinyalinden gelir; fallback `Yeni keşif`tir.
- Generic “Doğrulanmış metadata eşleşmesi” kaldırıldı.
- Community puanı `AniList topluluk puanı: 7.0/10` biçiminde provider ve ölçekle gösterilir; AI relevance skoru değildir.
- Warning, rejection ve no-result constraint adları merkezi mapper ile Türkçedir. Makine kodları yalnız internal debug'da kalabilir.
- Aktif kart iki satır title clamp, hover/focus-within expansion ve ayrı badge satırı kullanır; 1280/1366 iki, 1536/1920 yeterli alanda üç sütun, 375 px tek sütundur.

## Repo-geneli güvenli dead-code audit'i

`app`, `components`, `features`, `hooks` ve `lib` altında 419 TypeScript/TSX dosyası; lint ve text import/call-site taramasıyla incelendi.

| Sınıf | Sonuç |
|---|---|
| A — kesin kullanılmayan | İkinci `recommendation-result-card/list`, kullanılmayan `RecommendationWorkspace` wrapper'ı ve call-site'sız `normalizedExactTitle` kaldırıldı. Generic metadata fit etiketi ve tekrar “Yeni keşif” context rozeti temizlendi. |
| B — compatibility-only | V1 session/request/response hydration, unscoped V1 feedback API, legacy scorer/hybrid/embedding zinciri, mock safe fallback, `searchCandidates`/candidate-idea verification, Quick Add ve Discover korundu. |
| C — aktif | Provider retrieval planning, candidate search, evidence pipeline/cache, deterministic engine, explanation, structured UI, Feedback V2 ve engine transparency üretim call site'ına sahiptir. |
| D — belirsiz/dış contract | Next.js route/page entrypoint'leri, D7 evaluation export'ları ve dinamik/barrel tüketim ihtimali olan genel repo yardımcıları silinmedi. |

Legacy additive zincir deterministik gate sonrasında authoritative değildir; fakat V1 compatibility ve safe fallback karşılaştırma yolu olarak küçük cleanup kapsamında kaldırılmadı. V1 regex extraction, unstructured request compatibility nedeniyle aktiftir; ikinci V2 aspect listesi oluşturulmadı.

## Doğrulama sınırı

Fixture/unit testleri policy ve UI sözleşmesini doğrular. Browser fixture smoke canlı provider kalitesi değildir. Canlı AniList/TMDB/OMDb/verifier kabulü yalnız ilgili flag/env ile ayrıca raporlanır.

İlgili belgeler: [Ranking](AI_RECOMMENDATION_V2_RANKING.md), [UI ve Feedback](AI_RECOMMENDATION_V2_UI_AND_FEEDBACK.md), [Manuel testler](AI_RECOMMENDATION_V2_MANUAL_TESTS.md), [Migration planı](AI_RECOMMENDATION_V2_MIGRATION_PLAN.md).
