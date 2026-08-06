# AI Recommendation V2 — D6.6-1R Ranked-Tag Retrieval

> Durum: D6.6-1 parser/capability sözleşmesi korunarak explicit ranked-tag `must` constraint'leri AniList structured discovery yoluna bağlandı. Bu belge canlı provider kalite kabulü değildir; koşullu smoke ve final kabul D6.6-2'ye aittir.

## Read-only audit ve kök neden

| Nokta | D6.6-1 öncesi gerçek davranış | D6.6-1R kararı |
|---|---|---|
| İlk aday havuzu | `structuredRequestV2`, ilk `searchCandidatesWithDebug` çağrısına taşınmıyordu; provider planındaki metinler AniList title search olarak çalışıyordu. | Onaylı structured request her retrieval çağrısına taşınır ve explicit ranked-tag must varsa havuz sahipliği structured tag yoluna geçer. |
| AniList structured filtre | `extractAniListStructuredFilters` yalnız core/strong aspect'leri `labelEn` üzerinden genre'a çeviriyordu. `political_intrigue` narrative olduğu için sorguya girmiyordu. | Registry'deki provider retrieval mapping'i canonical genre/tag değerini sağlar; UI label provider taxonomy değildir. |
| Relaxed pass | Structured filtre boşsa veya aday azsa tag'i kaldırabilen generic/title yolları çalışabiliyordu. | Hard ranked tag strict ve relaxed pass'te korunur; relaxed yalnız minimum rank'ı `40`tan `20`ye indirir. |
| Planning ownership | LLM/provider retrieval planı doğrulanmış ranked-tag constraint'ten önce title fikirleri üretebiliyordu. | Plan yalnız yardımcıdır. Structured tag pass çalışmadan generic title fallback yoktur; tag yolu havuzun sahibiyse ek source/web pass de çalışmaz. |
| Geç doğrulama | `FANTASY`, `Fantasy` veya başka doğrulanabilir başlıklar havuza girip ancak evidence aşamasında eleniyordu. | Requested canonical tag kaynağı/evidence'i olmayan aday evidence pipeline sonrasındaki havuz kapısında deterministik elenir. |

Gerçek çağrı zinciri:

`POST /api/ai/recommend → structuredRequestV2 codec → capability server policy → provider planning → retrieval guardrails → getCandidates → searchCandidatesWithDebug → ranked-tag mapping → /api/anilist/search discover → AniList tag_in + minimumTagRank → provider evidence sidecar → ranked-tag candidate-pool gate → hard eligibility → deterministic ranking`

LLM arama planı üretebilir; structured tag retrieval kaynak gerçeğidir ve LLM final ranking kullanılmaz.

## Provider retrieval mapping

Registry entry'sindeki opsiyonel `providerRetrievalMappings`, evidence strategy'den ayrı retrieval yeteneğini ifade eder:

```ts
interface AspectProviderRetrievalMapping {
  provider: RecommendationProvider;
  strategy: "exact_taxonomy" | "ranked_tag";
  canonicalGenres?: readonly string[];
  canonicalTags?: readonly string[];
  minimumRankPolicy?: { strict: number; relaxed: number };
  supportedMediaTypes: readonly RecommendationMediaType[];
  queryable: boolean;
  warning?: string;
}
```

D6.6-1R'de doğrulanmış ranked-tag mapping'leri:

| Aspect | UI label | AniList canonical tag | Strict | Relaxed |
|---|---|---|---:|---:|
| `political_intrigue` | Political Intrigue | `Politics` | 40 | 20 |
| `revenge` | Revenge | `Revenge` | 40 | 20 |

`Politics`, AniList taxonomy adıdır; `labelEn=Political Intrigue` otomatik tag adı sayılmaz. Canonical adlar AniList'in [GraphQL query sözleşmesi](https://github.com/AniList/docs/blob/master/docs/reference/query.md) ve provider taxonomy sayfalarıyla doğrulanır. Mapping bulunmayan ranked-tag aspect capability'de `ranked_tag_supported` göstermez ve hard request generic title search'e düşmez. 43 aspect ID'si ve strategy dağılımı değişmez; her aspect'e yapay retrieval mapping eklenmez.

Exact-taxonomy AniList genre mapping'leri aynı registry alanını kullanır. Provider mapping UI alias'ından, parser alias'ından ve evidence label'ından ayrı provider verisidir.

## AniList structured tag pass'leri

Tek explicit ranked-tag must için:

1. Strict pass: hedef category, canonical tag, mapping policy `minimumTagRank=40`, objective filtreler, adult filtresi, deterministic sort ve bounded per-page.
2. Strict havuz üç adaydan azsa relaxed pass: aynı canonical tag, `minimumTagRank=20`.
3. Relaxed pass tag'i veya hard constraint'i kaldırmaz. Rank `20–39` adayları yalnız mevcut evidence/strictness policy izin verirse exploratory near-match olabilir.
4. İki pass de sonuçsuzsa generic title veya LLM candidate-idea havuzu açılmaz.

Birden fazla ranked-tag must için en fazla dört constraint/category query çalışır. AniList tag kesişiminin schema davranışına güvenilmez; bounded ayrı pass union'ı alınır. Union'daki adayların bütün must koşullarını karşılaması post-evidence hard eligibility'de zorunludur. Prefer recall'a yardımcı olabilir fakat hard must'ın önüne geçmez. Avoid pozitif retrieval veya coverage üretmez.

AniList route'u backward-compatible `q` aramasını korur; discover modu yalnız allowlist `genre/genres`, `tag/tags`, integer `minimumTagRank`, objective filter, category ve bounded sort kabul eder. Unsupported tag kontrollü `400` üretir; upstream GraphQL ayrıntısı kullanıcıya taşınmaz. Global Search ve Release Calendar yolları değişmez.

## Candidate pool kalite kapısı

Explicit ranked-tag-only hard request'te adayın:

- requested canonical tag pass'inden gelmesi; veya
- enrichment snapshot'ında requested aspect'e map olan finite AniList tag rank `>=20` taşıması

gerekir. Exact provider identity, title eşleşmesi, popularity veya community score bu koşulun yerine geçmez. Missing tag `unknown`dır; `absent` değildir. Gate, ranked-tag hard constraint içermeyen genel önerileri etkilemez.

## No-result ve kullanıcı metni

| İç neden | Kullanıcı metni |
|---|---|
| mapping missing | Bu özellik için seçilen kaynakta doğrudan arama desteği bulunmuyor. |
| tag query no candidates | Seçilen içerik etiketini taşıyan doğrulanmış aday bulunamadı. |
| provider unavailable | İçerik etiketi sorgusu şu anda kullanılamıyor; koşul karşılanmadı olarak işaretlenmedi. |
| below rank | Adaylar bulundu ancak ilgili özellik istenen belirginlik düzeyinin altında kaldı. |
| confidence/avoid/objective failure | İlgili kanıt, kaçınma veya objektif filtre açıklaması gösterilir. |

Raw tag adı, GraphQL hata metni, internal reason code veya aday trace'i normal kullanıcı response'una girmez.

## Telemetry

Aggregate debug telemetry; constraint/query/candidate sayaçlarını, strict/relaxed sayıları, title fallback sayısını, requested tag evidence'i olmayan adayları ve primary/near-match sayılarını taşır. Aday bazlı `retrievalPass`, mapping, returned evidence, rank band ve eligibility yalnız server içi `internal` map'te tutulur ve serialize edilmez.

## Regresyon ve sınırlar

Sentetik fixture'lar Politics rank `86`, `63`, `45`, `28`, missing tag, yüksek popularity, alakasız title, provider error, mapping missing, below-rank, duplicate strict/relaxed aday ve iki ranked-tag must union/eligibility davranışını kapsar. D6.6-1 parser/capability; Romance, Fantasy ve love-triangle; deterministic tuple ve threshold sözleşmeleri korunur.

`D6_PROVIDER_LIVE_SMOKE=1` olmadıkça gerçek provider çağrısı yapılmaz. Koşullu test sabit başlık/ilk sonuç/rank/sonuç sayısı varsaymadan canonical tag, strict/relaxed rank, finite `0–100` tag evidence'i ve provider identity kontrol eder. D6.6-2'de AniList `Politics`/`Revenge`, TVMaze ve Open Library public canlı kapıları geçti; request budget, drift ve fail-soft ayrıntıları [D6.6-2 Reliability](AI_RECOMMENDATION_V2_D662_LIVE_PROVIDER_RELIABILITY.md) belgesindedir.
