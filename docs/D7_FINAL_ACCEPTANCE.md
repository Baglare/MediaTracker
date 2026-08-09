# D7 Final Acceptance

## Final architecture

D7, Recommendation V2'nin deterministik D6 motorunu authoritative tutar. `disabled` varsayılanında research/network yoktur; `shadow` yalnız post-response internal karşılaştırma üretir; `active` ise baseline deterministic pass, bounded grounded research, validated handoff merge ve temiz immutable input ile ikinci deterministic pass uygular. LLM yalnız supplied passage üzerinde claim observation yapar; eligibility veya final sıralama yapmaz.

## Retrieval rescue

Audit, researchable `romance must/significant` AniList genre filtresinin Steins;Gate'i research aday havuzundan önce eleyebildiğini doğruladı. Active ve public-citation kapıları birlikte açıkken iki bounded structured pass kullanılır: normal pass bütün güçlü queryable filtreleri korur; rescue pass yalnız explicit, hard, semantic verification isteyen exact-taxonomy constraint'i kaldırır. Objective/library sınırları, diğer queryable must'lar ve verified identity zorunluluğu korunur. `time_travel` mevcut registry'de evidence-only olduğundan hayalî provider query mapping üretilmez. Rescue adayı research kararı olmadan primary listeye geçemez.

## Acceptance cases

- Steins;Gate + science fiction + time travel + romance: rescue pool exact AniList identity'yi korur; gerçek exact-QID Wikimedia document ve Groq grounded extraction `supported/significant+` üretir; ikinci deterministic pass primary sonucu revision-bound public evidence ile kabul eder.
- Kakegurui-benzeri romance omission: popularity/title telafi etmez; claim yoksa unknown kalır, sahte evidence üretilmez ve `no_verified_match` notice gösterilebilir.
- Love-triangle avoid presence: validated supported evidence final deterministic pass'te adayı eler; rejected item/citation yayınlanmaz, bounded exclusion notice yayınlanır.
- Explicit absence avoid: validated contradicted/explicit-absence evidence riski temizleyebilir ve primary item public source summary taşıyabilir.
- Provider timeout/429/unavailable: raw hata sızmaz, baseline response korunur ve `research_unavailable` notice üretilebilir.

## Live result and cache

2026-08-09 conditional live kabulünde Wikimedia exact source + Groq `openai/gpt-oss-20b` ile Steins;Gate active akışı geçti. Aynı process'teki iki koşu da `active_applied` döndü; ikinci koşu process cache `hit` oldu, extraction toplam bir kez çağrıldı ve public evidence revision-bound Wikipedia URL'si taşıdı. Tek örnek latency veya production capacity garantisi değildir.

## Public transparency

Outcome değiştiren result public-safe citation üretemezse active merge fail-closed bırakılır. Primary item yalnız bounded `researchEvidence` taşır. Rejected/no-result tarafında optional `researchOutcomeNotice`; candidate listesi, URL, passage, claim metni, provider/model/cache veya teknik hata olmadan registry label ve kullanıcı-dostu sonucu gösterir. Legacy response/session kayıtlarında her iki alanın da eksik olması geçerlidir; malformed alan kendi başına düşürülür.

## Known limitations and D8 blockers

Rollout varsayılan `disabled` kalır ve production deploy yapılmamıştır. Process cache instance/cold-start kapsamlıdır. D8 öncesinde persistent cross-instance cache kararı, operasyonel rate-limit/maliyet gözlemi, migration/cutover planı, security acceptance, production flag matrisi ve kontrollü deploy kapıları kapanmalıdır. Yeni source domain izin/retention audit'i olmadan açılmaz.
