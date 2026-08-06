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
| D6 — AI Recommendation V2 | D6.6-1R tamamlandı; final live kabul bekliyor | Domain/provider/evidence/deterministik ranking/editable UI/Feedback V2, parser/capability hardening ve ranked-tag structured retrieval tamamlandı; canlı kalite garantisi değildir. |
| D6.6-1 — Parser/capability/evidence hardening | Tamamlandı (yerel/test) | Türkçe morphology-aware parser, 43 evidence strategy, ranked-tag policy, capability validation, evidence-before-personal sıra ve weighted explicit coverage ([sözleşme](AI_RECOMMENDATION_V2_D661_CAPABILITY_AND_PARSER.md)) |
| D6.6-1R — Ranked-tag retrieval düzeltmesi | Tamamlandı (yerel/test) | Canonical AniList tag mapping, minimum-rank strict/relaxed discovery, title-fallback guard ve candidate-pool kalite kapısı ([sözleşme](AI_RECOMMENDATION_V2_D661R_RANKED_TAG_RETRIEVAL.md)) |
| D6.6-2 — Live provider reliability ve final D6 kabulü | Planlandı | Gerçek provider snapshot drift'i, rate-limit/fallback, latency ve live result trace; `D6_PROVIDER_LIVE_SMOKE` bu aşamada çalıştırılacak. |
| D7 — Yeni aspect verifier | Planlandı | Human-labeled gold set, calibrated ordinal aspect verifier, abstention/fail-soft ve deterministic baseline benchmark'ı; model final recommendation seçmez ([plan](D7_ASPECT_VERIFIER_PLAN.md)) |
| D8 — Release ve deployment (release candidate) | Planlandı | Frontend release candidate, operasyonel doğrulama, D2C.1 production cutover ve Goal Cloud V1 production migration/flag rollout |

## Opsiyonel backlog

Push/e-posta bildirimleri, ICS veya Google Calendar aktarımı, streaming availability ve AI ile tarih tahmini fikir havuzundadır. Bunlar D8 release kabulünün zorunlu parçası değildir.
