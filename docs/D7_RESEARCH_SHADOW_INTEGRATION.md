# D7-R4A Grounded Research Shadow Integration

## Konum ve amaç

D7-R4A, structured evidence sonrasında hâlâ çözülemeyen açık `must` ve `avoid` koşullarını Grounded Research zincirine server-only shadow iş olarak verir. D6 deterministic V2 authoritative kalır: shadow sonucu candidate eligibility, score, sıralama, near-match veya public recommendation response'una uygulanmaz.

## Feature flag ve post-response akış

`D7_RESEARCH_SHADOW_ENABLED=1` yalnız server process'inde shadow çağrısını açar. Varsayılan `0` iken task schedule edilmez; planner, provider ve network çağrısı yapılmaz. Route başarılı deterministic response yolunda tek top-level işi Next.js `after()` ile kaydeder. Promise sahipsiz bırakılmaz ve task rejection scheduler sınırında fail-soft tutulur; kullanıcı response'u shadow tamamlanmasını beklemez.

Açık akış existing planner → exact Wikimedia direct source → gerekirse tek allowlist'li discovery → secure acquisition/passage packet → grounded extraction → deterministic decision/handoff sırasını yeniden kullanır.

## Engine/composition ayrımı

Deterministic engine framework, environment, provider/network, shadow orchestrator veya scheduler import etmez. Aynı hesaplamada authoritative public response ile bounded shadow seed üretir. Feature flag, provider config ve `after()` scheduling yalnız route/server composition katmanındadır. Clarification, validation ve error early-return yolları shadow task üretmez.

Schedule öncesinde seed `structuredClone` ile request yaşam döngüsünden koparılır ve recursively freeze edilir. Snapshot yalnız doğrulanmış candidate identity/version scope, public title/year snapshot, structured constraint/evidence özeti, internal request ID, 16 saniye deadline ve policy version içerir. Request/Response, body stream, headers, cookies, AbortSignal, owner/user kimliği, library içeriği, rating, favorite, progress, note, feedback, raw kullanıcı mesajı, konuşma, profil özeti ve secret closure'a taşınmaz.

## Uygunluk sınırı

Yalnız `source=explicit`, `role=must|avoid`, structured sonucu `unknown|partial`, verified external identity ve exact work scope taşıyan; objective filter ve exact library exclusion sonrasında kalan adaylar iş üretir. `prefer`, inferred/profile constraint, decisive structured evidence, elenmiş aday ve çözülemeyen identity/scope araştırılmaz.

## Bütçe

Bir request için en fazla iki candidate, candidate başına bir aspect, toplam iki iş ve iki eşzamanlı operasyon vardır. Overall shadow deadline 16 saniyedir. Existing adapter retry politikalarının üstüne retry eklenmez; aynı candidate/aspect planner tarafından coalesce edilir. Bu değerler varsayılan kapalı shadow gözlem bütçesidir, production latency garantisi değildir.

## Hypothetical sonuç ve fail-soft

Existing deterministic research handoff policy, shadow decision'ı `would_satisfy_must`, `would_fail_must`, `would_reject_avoid`, `would_clear_avoid`, `would_remain_unknown` veya `no_effect` olarak sınıflar. Internal read-model passage, document, evidence unit, raw claim text veya URL taşımaz.

Disabled/config-unavailable, provider veya source failure, invalid grounding, no-claim, unknown, timeout, parent abort ve budget exhaustion baseline recommendation'ı değiştirmez ve route'u 500 yapmaz. Provider/network hata ayrıntıları public response'a aktarılmaz.

## R5C cache ve internal transparency

`D7_RESEARCH_EVIDENCE_CACHE_ENABLED=1`, exact scope/aspect ve policy versions ile owner-independent bounded process cache'i açar. Valid hit direct/discovery/acquisition/extraction'ı tekrar çalıştırmadan cached decision'ı aynı handoff mapper ile hypothetical sonuca çevirir. Cache flag kapalıyken port erişimi yoktur. Capacity/provider/security/grounding failure negative-cache edilmez.

Internal `ResearchShadowTransparencySummary` cache/stage durumu, bounded decision/source/citation sayıları, hypothetical effect, provider ve duration bucket taşır. Title, URL, raw claim, passage, unit, prompt/response veya private veri taşımaz; public response/UI/DB yüzeyine çıkmaz. Process-local cache cold start'ta boşalabilir; shared persistence D8 kapısıdır. Ayrıntılar: [R5C cache contract](D7_RESEARCH_EVIDENCE_CACHE_AND_TRANSPARENCY.md).

## R4B canlı kabul ve latency gözlemi

`D7_R4_SHADOW_LIVE_SMOKE=1` normal suite dışında explicit canlı kapıdır. 2026-08-09 son Steins;Gate örneğinde exact AniList identity → direct Wikimedia → acquisition → Groq extraction zinciri `complete` oldu: `n=1`, planning `1 ms`, direct source `1967 ms`, discovery `0 ms`, acquisition `13 ms`, extraction `678 ms`, total `2660 ms`; timeout oluşmadı ve 16 saniye bütçe içinde kaldı. Extraction `no_claims_extracted`, deterministic decision `unknown` ve hypothetical effect `would_remain_unknown` oldu; bu geçerli fail-soft sonuçtur. Bu tek örnek performans garantisi değildir.

Canlı sonuç internal stage status ve bounded telemetry üretti; passage, citation, evidence unit veya provider response public yüzeye çıkmadı. Research kararı authoritative eligibility/ranking'e uygulanmadı. Active integration R5/R6 güvenlik, kalite ve source acceptance kapılarından önce kapalı kalır.
