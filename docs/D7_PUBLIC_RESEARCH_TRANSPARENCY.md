# D7-R6A2 Public Research Transparency

## Rollout gate

`D7_RESEARCH_PUBLIC_CITATIONS_ENABLED=1` server-only kapısı active rollout için zorunludur. `active` seçiliyken kapı kapalıysa planner/provider/network zinciri başlamaz ve baseline D6 response kullanılır. `disabled` ve `shadow` modlarında public research alanı üretilmez. Active karar public-safe citation'a dönüştürülemezse final active response bütünüyle bırakılır ve baseline fail-closed döner.

## Public read-model

Recommendation item üzerindeki optional `researchEvidence` yalnız `version=1`, `research_verified`, registry label'lı affected aspect ve en fazla üç public source taşır. Finding yalnız `supported` veya `explicit_absence`; level yalnız incidental/significant/primary; confidence yalnız low/medium olabilir. `high` source trust cap nedeniyle public modelde medium'a indirilir. Alanın eski session/response kayıtlarında bulunmaması geçerlidir; malformed alan yalnız kendisi düşürülerek item korunur.

## Source security

Mapper yalnız validated decision, claim, citation ve changed-outcome provenance tüketir. URL yeniden HTTPS, exact enabled registry host, credentials/port/IP-literal ve bounded URL policy'sinden geçer. Revision isteyen Wikipedia citation'ı `oldid` ile exact revision ID'yi bağlamalıdır. Search-provider URL'leri, redirect wrapper'lar, disabled source'lar ve ham discovered URL'ler reddedilir. Canonical URL ile dedupe uygulanır; aynı publisher source count'u şişirmez.

## UI and persistence boundary

Yalnız final primary listede `rescued_candidate` veya `cleared_avoid` sonucu taşıyan kart “Araştırmayla doğrulandı” badge'i gösterir. “Kaynaklı doğrulama” gerçek button, `aria-expanded`, `aria-controls`, keyboard davranışı, focus-visible stili ve güvenli external link kullanır. UI aspect finding/level/confidence ve attribution gösterir; passage, quote, snippet, claim metni, provider/model, cache, prompt, response veya internal outcome göstermez. Session codec yalnız doğrulanmış public read-modeli saklar ve raw research alanlarını atar.

## Rejected and no-result notice

Optional `researchOutcomeNotice` yalnız active + public citations akışında `no_verified_match`, `candidates_excluded_by_research` veya `research_unavailable` durumunu taşır. En fazla üç registry aspect label'ı ve bounded candidate count bulunabilir. Candidate title/listesi, URL, passage, claim, provider/model/cache, internal enum veya teknik hata taşınmaz. Shadow/disabled sonuçlarında alan yoktur; legacy absence geçerlidir ve malformed notice güvenli biçimde düşürülür.

UI notice'ı erişilebilir `status`/`aria-live` alanında gösterir ve 375 px genişlikte `break-words`/`min-w-0` sınırını korur. Rejected candidate'a item veya citation yayınlanmaz. Gerçek active kabul sonucu [D7 final acceptance](D7_FINAL_ACCEPTANCE.md) belgesindedir.
