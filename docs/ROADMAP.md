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
| D7 — Yeni aspect verifier | D7-0 tamamlandı; D7-1..D7-5 planlandı | Human-labeled gold set, calibrated ordinal aspect verifier, abstention/fail-soft ve deterministic baseline benchmark'ı; model final recommendation seçmez ([plan](D7_ASPECT_VERIFIER_PLAN.md)) |
| D7-0 — Veri/lisans/provenance/annotation contract | Tamamlandı (contract/docs/test) | Provider ve source kullanım policy'si, provenance/manifest/annotation/verifier codec'leri, 12-aspect MVP, sampling/split, ordinal/calibration planı ve legacy ML migration audit'i tamamlandı; model/data indirme, toplama veya training yapılmadı ([plan](D7_ASPECT_VERIFIER_PLAN.md)) |
| D7-1A — Annotation tool ve private artifact | Tamamlandı (local tool/contract/test) | Server-side dev+flag+loopback guard, private ignored root, atomic checksum/backup, import/task/revision/adjudication/revocation/export/validation ve sentetik fixture; gerçek pilot/gold yok ([architecture](D7_ANNOTATION_TOOL_ARCHITECTURE.md)) |
| D7-1B — Pilot annotation ve agreement | Calibration mini-pilot tamam; D7-1B.1 hardening tamamlandı | 10-record/27-task calibration-only pilot, assistance provenance, gerçek manifest hash lifecycle, task-derived 8-aspect scope ve per-aspect input sufficiency raporu tamamlandı ([rapor](D7_1B_CALIBRATION_PILOT_REPORT.md)). Sonraki adım 40–60 work, 6-aspect independent-human ana pilot ve en az %20 double annotation; D7-2 başlamadı. |
| D7-2 — Model baselines | D7-1B sonrasına bloklu | TF-IDF ve frozen multilingual encoder baseline, ordinal heads ve offline runner; production ranking/eligibility değişmez |
| D7-3..D7-5 — Verifier integration/acceptance | Planlandı | Calibration/abstention + local API v2; yalnız kanıtlı aspect integration ve final benchmark. Deterministic V2 final authority kalır. |
| D8 — Release ve deployment (release candidate) | Planlandı | Frontend release candidate, operasyonel doğrulama, D2C.1 production cutover ve Goal Cloud V1 production migration/flag rollout |

## Opsiyonel backlog

Push/e-posta bildirimleri, ICS veya Google Calendar aktarımı, streaming availability ve AI ile tarih tahmini fikir havuzundadır. Bunlar D8 release kabulünün zorunlu parçası değildir.
