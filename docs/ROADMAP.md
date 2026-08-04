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
| D6 — AI Recommendation V2 | D6-4 tamamlandı; D6-5 başlamadı | D6-0 audit, D6-1 domain, D6-2 provider evidence, D6-3 deterministik ranking ve D6-4 editable request/strictness/near-match/Feedback V2 tamamlandı; V1 response ve Quick Add compatibility korunuyor ([domain](AI_RECOMMENDATION_V2_DOMAIN.md), [provider](AI_RECOMMENDATION_V2_PROVIDER_ENRICHMENT.md), [ranking](AI_RECOMMENDATION_V2_RANKING.md), [UI ve feedback](AI_RECOMMENDATION_V2_UI_AND_FEEDBACK.md), [manuel test](AI_RECOMMENDATION_V2_MANUAL_TESTS.md), [plan](AI_RECOMMENDATION_V2_MIGRATION_PLAN.md)) |
| D7 — ML ve değerlendirme | Planlandı | Offline değerlendirme, ölçüm ve model/embedding deneyleri |
| D8 — Release ve deployment | Planlandı | Frontend yayınlama, operasyonel doğrulama, D2C.1 production cutover ve Goal Cloud V1 production migration/flag rollout |

## Opsiyonel backlog

Push/e-posta bildirimleri, ICS veya Google Calendar aktarımı, streaming availability ve AI ile tarih tahmini fikir havuzundadır. Bunlar D8 release kabulünün zorunlu parçası değildir.
