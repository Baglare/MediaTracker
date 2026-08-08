# MediaTracker Roadmap

| Aşama | Durum | Kapsam |
| --- | --- | --- |
| D1 — Veri bütünlüğü | Tamamlandı | Owner scope, format/recovery, duplicate inceleme ve birleştirme, integrity scanner/repair, portable backup ve kontrollü additive import |
| D2 — Cloud Sync geliştirme | Tamamlandı | Owner-scoped queue, V2 revision/idempotency/tombstone istemcisi, conflict UI, reaktif durum ve fail-closed rollout |
| D2B.0 / D2B.1 production DB | Tamamlandı | Progress ilişki onarımı ve additive Cloud Media V2 şeması production veritabanına uygulandı |
| D2C.1 production cutover | D8'e bırakıldı | Owner-scoped fiziksel PK enforcement, legacy mutation yolunun kapatılması ve kontrollü production cutover |
| D3 — Release Calendar | Tamamlandı | TVMaze/AniList/TMDB, ajanda/ay, owner cache, manuel olaylar, provider olayı gizleme ve “Yakında” özeti |
| D4 — Product Polish / Performance / UX Reliability | Tamamlandı | Reaktif Cloud state, profil cache, metrik doğruluğu, responsive kartlar, ayar yoğunluğu, tema/logo ve grafik erişilebilirliği |
| D5 — Hedef sistemi | Tamamlandı (yerel/test) | Goal domain, owner-scoped CRUD, trusted-log evaluation, suggestions, Portable V3 ve Goal Cloud V1 istemci/migration paketi; production rollout D8'de |
| D6 — AI Recommendation V2 | Tamamlandı (contract/fixture/public live) | Domain/provider/evidence/deterministik ranking/editable UI/Feedback V2, parser/capability hardening, ranked-tag retrieval ve public-provider contract kabulü tamamlandı; genel AI kalite garantisi değildir. |
| D6.6-1 — Parser/capability/evidence hardening | Tamamlandı (yerel/test) | Türkçe morphology-aware parser, 43 evidence strategy, ranked-tag policy, capability validation, evidence-before-personal sıra ve weighted explicit coverage ([sözleşme](AI_RECOMMENDATION_V2_D661_CAPABILITY_AND_PARSER.md)) |
| D6.6-1R — Ranked-tag retrieval düzeltmesi | Tamamlandı (yerel/test) | Canonical AniList tag mapping, minimum-rank strict/relaxed discovery, title-fallback guard ve candidate-pool kalite kapısı ([sözleşme](AI_RECOMMENDATION_V2_D661R_RANKED_TAG_RETRIEVAL.md)) |
| D6.6-2 — Live provider reliability ve final D6 kabulü | Tamamlandı; key-gated kapılar açık | AniList/TVMaze/Open Library public live geçti; rate-limit/drift/fail-soft/cache/latency sözleşmeleri sağlamlaştırıldı. TMDB/OMDb key-gated canlı kapıları açık ([kabul](AI_RECOMMENDATION_V2_FINAL_ACCEPTANCE.md)). |
| D7 — Grounded Aspect Research Engine | D7-R2C.1 canlı discovery kapısı tamamlandı | Exact identity, citation-bound direct Wikimedia ve allowlisted ephemeral multi-provider discovery; Groq live-verified, D6 deterministic V2 authority kalır ([mimari](D7_GROUNDED_RESEARCH_ARCHITECTURE.md)) |
| D7-R0 — Research architecture/source/security/acceptance | Tamamlandı (docs/contract) | Candidate retrieval, Wikidata/MediaWiki/OpenAI/Brave source kararı, bounded orchestration, supplied-passage extraction, persistence/security ve acceptance contract'ları; production davranışı değişmedi ([pivot](D7_ASPECT_VERIFIER_PLAN.md)) |
| D7-R1 — Research domain ve fixture foundation | Tamamlandı (saf contract/test) | 43-aspect capability matrisi, exact identity/versionScope, [domain contract](D7_RESEARCH_DOMAIN_CONTRACT.md), [source registry](D7_RESEARCH_SOURCE_REGISTRY.md), [planner](D7_RESEARCH_PLANNER.md), [cache port/policy](D7_RESEARCH_CACHE_POLICY.md), citation/no-source fixture'ları; network/route entegrasyonu yok |
| D7-R2A — Secure network + direct Wikimedia | Tamamlandı (internal/conditional live) | [Pinned DNS/HTTPS](D7_RESEARCH_NETWORK_FOUNDATION.md), [exact Wikidata external-ID verification](D7_WIKIDATA_IDENTITY_RESOLUTION.md), [revision-bound Wikipedia document/citation](D7_WIKIPEDIA_DIRECT_SOURCE.md); route/LLM entegrasyonu yok |
| D7-R2A.1 — Live DNS compatibility | Tamamlandı (live gate) | OS-compatible all-address lookup + pinned HTTPS; Wikimedia live smoke 3/3 kapandı ([live smoke](D7_RESEARCH_LIVE_SMOKE.md)) |
| D7-R2B — OpenAI allowlisted source discovery | Tamamlandı (internal/conditional live) | [Stable Responses `web_search`](D7_OPENAI_WEB_DISCOVERY.md), [strict discovery contract](D7_RESEARCH_DISCOVERY_CONTRACT.md), Wikipedia-only server allowlist, ephemeral output; Brave deferred, route/claim yok |
| D7-R2C — Multi-provider discovery | Tamamlandı (internal/conditional live) | [Provider registry/seçim](D7_MULTI_PROVIDER_DISCOVERY.md), Groq Compound ve forced-Exa OpenRouter beta adapter'ları; ortak registry/URL revalidation, ephemeral-only, route/claim yok |
| D7-R2C.1 — Multi-provider discovery live acceptance | Tamamlandı (Groq live-verified) | Strict Steins;Gate/Wikipedia kapısı Groq ile geçti; OpenAI ve OpenRouter explicit research model eksikliği nedeniyle live-unverified, production selector değişmedi ([live smoke](D7_RESEARCH_LIVE_SMOKE.md)) |
| D7-R2D — Source expansion/direct community-review adapters | Planlandı; izin audit kapılı | [Source expansion matrix](D7_RESEARCH_SOURCE_EXPANSION_MATRIX.md); yeni source ancak automated access/attribution/retention/AI inference izni kapanırsa |
| D7-R3 — Direct discovered-source acquisition + grounded claim extraction | Planlandı | Secure direct acquisition, supplied passages, strict JSON/citation, contradiction/centrality ve no-source→unknown |
| D7-R4 — Deterministic integration | Planlandı | Research evidence merge, must/prefer/avoid/unknown/near-match/no-result; LLM ranking yok |
| D7-R5 — Runtime security/cache/UI citation | Planlandı | SSRF/sanitization/rate-limit/timeout, source revision invalidation, telemetry ve public citation read-model |
| D7-R6 — Grounded research final acceptance | Planlandı | Live source compliance, fail-soft, cache retention/invalidation ve acceptance cases; D8 research feature gate adayı |
| D7 annotation/calibration araçları | Arşivlendi; artifact'lar korunuyor | Development/evaluation tooling; aktif release yolu değil, private workspaces korunur ve yeni annotation beklenmez ([tool](D7_ANNOTATION_TOOL_ARCHITECTURE.md)) |
| D7 ML / Aspect Verifier | Post-release opsiyonel backlog | Human gold/training release blocker değil; yalnız citation'lı evidence sonrası optional distillation/student shadow rolü ([deferred plan](D7_ML_DEFERRED_PLAN.md)) |
| D8 — Release ve deployment (release candidate) | Planlandı | Frontend release candidate, operasyonel doğrulama, D2C.1 production cutover ve Goal Cloud V1 production migration/flag rollout |

## Opsiyonel backlog

Push/e-posta bildirimleri, ICS veya Google Calendar aktarımı, streaming availability ve AI ile tarih tahmini fikir havuzundadır. Bunlar D8 release kabulünün zorunlu parçası değildir.
