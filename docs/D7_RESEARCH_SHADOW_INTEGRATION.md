# D7-R4A Grounded Research Shadow Integration

## Konum ve amaç

D7-R4A, structured evidence sonrasında hâlâ çözülemeyen açık `must` ve `avoid` koşullarını Grounded Research zincirine server-only shadow iş olarak verir. D6 deterministic V2 authoritative kalır: shadow sonucu candidate eligibility, score, sıralama, near-match veya public recommendation response'una uygulanmaz.

## Feature flag ve akış

`D7_RESEARCH_SHADOW_ENABLED=1` yalnız server process'inde shadow çağrısını açar. Varsayılan `0` iken shadow context oluşturulmaz; planner, provider ve network çağrısı yapılmaz. Açık akış existing planner → exact Wikimedia direct source → gerekirse tek allowlist'li discovery → secure acquisition/passage packet → grounded extraction → deterministic decision/handoff sırasını yeniden kullanır.

Shadow girdisi yalnız doğrulanmış candidate identity/version scope, public title/year snapshot, structured constraint ve evidence özetini içerir. Owner/user kimliği, library içeriği, rating, favorite, progress, note, feedback, raw kullanıcı mesajı, konuşma ve profil özeti research servisine taşınmaz.

## Uygunluk sınırı

Yalnız `source=explicit`, `role=must|avoid`, structured sonucu `unknown|partial`, verified external identity ve exact work scope taşıyan; objective filter ve exact library exclusion sonrasında kalan adaylar iş üretir. `prefer`, inferred/profile constraint, decisive structured evidence, elenmiş aday ve çözülemeyen identity/scope araştırılmaz.

## Bütçe

Bir request için en fazla iki candidate, candidate başına bir aspect, toplam iki iş ve iki eşzamanlı operasyon vardır. Overall shadow deadline 16 saniyedir. Existing adapter retry politikalarının üstüne retry eklenmez; aynı candidate/aspect planner tarafından coalesce edilir. Bu değerler varsayılan kapalı shadow gözlem bütçesidir, production latency garantisi değildir.

## Hypothetical sonuç ve fail-soft

Existing deterministic research handoff policy, shadow decision'ı `would_satisfy_must`, `would_fail_must`, `would_reject_avoid`, `would_clear_avoid`, `would_remain_unknown` veya `no_effect` olarak sınıflar. Internal read-model passage, document, evidence unit, raw claim text veya URL taşımaz.

Disabled/config-unavailable, provider veya source failure, invalid grounding, no-claim, unknown, timeout, parent abort ve budget exhaustion baseline recommendation'ı değiştirmez ve route'u 500 yapmaz. Provider/network hata ayrıntıları public response'a aktarılmaz.

## R4B

R4B; explicit feature flags ile live provider acceptance, full regression/build, stage latency/budget ölçümü ve internal telemetry sink kararını tamamlayacaktır. Shadow sonuçlarının authoritative eligibility/ranking'e uygulanması R4A kapsamında değildir.
