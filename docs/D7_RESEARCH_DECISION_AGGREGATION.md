# D7-R3B Deterministic Research Decision Aggregation

Tarih: 2026-08-09  
Durum: Saf claim/decision aggregation hazır; Recommendation V2 eligibility mapping'i R4'e ertelenmiştir.

## Model observation ile persisted claim ayrımı

Model claim metni, citation veya decision üretmez. Strict ve grounded assessment'tan claim'i yalnız kod oluşturur:

- presence → `support` + assessment level;
- explicit negative statement → `contradict` + null level;
- irrelevant/insufficient → claim yok;
- citation ID yoksa claim yok.

`paraphrasedClaim` code-controlled Türkçe template'tir; passage quote'u persist edilmez. Claim ID packet/aspect/polarity/level/citations/unit IDs üzerinden deterministic hash'tir.

## Confidence ve source bağımsızlığı

Model confidence yalnız girdilerden biridir. Source registry trust cap uygulanır: tek Wikipedia encyclopedia kaynağı model `high` dese bile overall claim/decision en fazla `medium` olur. Tek low-confidence `primary`, decision seviyesinde `significant`a düşürülür. Aynı `sourceId` altındaki enwiki/trwiki veya birden çok passage independent source sayısını artırmaz; URL sayısı source count, publisher/source ID sayısı independent count'tur.

## Decision tablosu

| Validated claims | Decision | Level | Reason |
| --- | --- | --- | --- |
| Support var, contradict yok | `supported` | en güçlü bounded level | `direct_source_support` |
| Explicit-absence contradict var, support yok | `contradicted` | `null` | `explicit_source_contradiction` |
| Support ve contradict birlikte | `unknown` | `null` | `conflicting_sources` |
| Claim yok | `unknown` | `null` | `passage_insufficient` |

Decision exact packet version scope'unu ve 7 günlük bounded expiry'yi taşır. Provider/config/network/refusal/schema/grounding failure decision üretmez ve negative-cache edilmez.

## R4 sınırı

R3B `must`, `avoid`, `prefer`, minimum level, primary eligibility, near-match veya final ranking görmez. Bunların deterministic mapping'i yalnız R4'te, D6 authority korunarak ve unknown hiçbir zaman absent sayılmadan yapılacaktır.

