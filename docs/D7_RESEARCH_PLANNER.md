# D7-R1 Bounded Research Planner

Tarih: 8 Ağustos 2026
Durum: Saf deterministic plan contract'ı ve fixture testleri hazır; hiçbir operation çalıştırılmaz.

## Input sınırı

`ResearchCandidateInput`; exact candidate identity, `ResearchVersionScope`, media type, pre-research rank, hard-objective eligibility, unresolved constraints ve bounded structured evidence summary taşır. Message, title-query, profile, popularity, quality, owner, rating, progress, note ve feedback alanı yoktur; unknown/nested özel alan codec'te reddedilir.

## Başlangıç budget

| Alan | Limit |
| --- | ---: |
| `maxCandidates` | 8 |
| `maxAspectsPerCandidate` | 3 |
| `maxResearchJobs` | 12 |
| `maxExternalSearchOperations` | 6 |
| `maxConcurrentOperations` | 2 |
| `totalTimeoutMs` | 8.000 |

Planner network çalıştırmaz. İlk altı job search operation rezervasyonu alabilir; kalan bounded job'lar cache/direct-source-only planlanabilir. Gerçek execution semantics D7-R2 orchestrator contract'ında netleşir.

## Priority

1. explicit must;
2. explicit avoid;
3. explicit prefer;
4. inferred must/avoid/prefer;
5. profile constraints varsayılan olarak skip.

Aynı role/source içinde düşük `preResearchRank` önce gelir. Popularity/quality priority alanı değildir. Stable tie-break `scopeKey + aspectId` kullanır.

## Skip ve coalescing

Job üretilmez:

- structured evidence decisive ise;
- exact identity/version scope invalid ise;
- candidate objective hard filter'da elendiyse;
- aspect candidate media type'ını desteklemiyorsa veya research mode `none/unsupported` ise;
- profile source ise;
- candidate/aspect veya global budget aşıldıysa.

Aynı `scopeKey + aspectId` bir kez job olur; duplicate `duplicate_candidate_aspect` olarak raporlanır. Stable cache key ileride in-flight request coalescing anahtarıdır.

## Output

`ResearchPlan`: version, ordered jobs, skipped items, exact budget, estimated search operations, warnings ve policy version. Aynı input aynı planı üretir.

Her `ResearchJob`; exact candidate scope, aspect/role/minimum level, numeric priority, izinli source class'ları, per-job bounded budget, stable cache key ve research policy version taşır. Kişisel kullanıcı verisi taşımaz.

İlgili belgeler: [Domain Contract](D7_RESEARCH_DOMAIN_CONTRACT.md), [Cache Policy](D7_RESEARCH_CACHE_POLICY.md), [Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md).

