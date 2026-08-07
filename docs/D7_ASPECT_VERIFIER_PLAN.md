# D7 Aspect Verifier Planı — D7-R0 Pivot Kaydı

Tarih: 8 Ağustos 2026
Durum: **Arşivlendi. Aspect Verifier / human annotation release hattı aktif değildir.**

## Kesin karar

Önceki D7-0..D7-5 planı, human-labeled gold dataset ve calibrated ordinal model üzerinden Recommendation V2'nin semantic evidence boşluğunu kapatmayı hedefliyordu. Bu plan doğru bir evaluation problemi tanımlasa da release için yanlış katmanı çözüyordu: runtime'da eksik olan şey genel bir model skoru değil, unresolved hard constraint için exact identity'ye bağlı, citation'lı ve source revision'ı izlenebilir kanıttır.

D7'nin aktif ana hattı [Grounded Aspect Research Engine](D7_GROUNDED_RESEARCH_ARCHITECTURE.md) olmuştur.

Değişmez ürün kararları:

1. D6 Deterministic Recommendation V2 authoritative kalır.
2. LLM candidate seçmez ve final ranking yapmaz.
3. Human gold dataset, yeni annotation ve model training release blocker değildir.
4. Annotation workspaces/tooling silinmez; archived calibration/evaluation artifact olarak korunur.
5. Missing evidence hiçbir model veya search provider tarafından `absent` sayılmaz.
6. Retrieval sonrası unresolved explicit `must`/`avoid`, hard filter'dan hemen önce bounded targeted research alabilir.
7. ML yalnız [opsiyonel post-release distillation/student model](D7_ML_DEFERRED_PLAN.md) olarak kalır.

## Arşivlenen D7 işleri

- 40–60 work, 6-aspect independent-human ana pilot.
- En az %20 double annotation ve agreement/adjudication release kapısı.
- 120–200 work gold dataset hedefi.
- TF-IDF, frozen multilingual encoder ve ordinal head baseline'ları.
- Calibration/abstention model service ve `/v2/aspect/verify` production entegrasyonu.
- Human gold ile threshold tuning'i D7/D8 release önkoşulu yapma.

D7-1B calibration mini-pilot historical internal artifact olarak korunur; gold/training/evaluation kalite datası ilan edilmez. Private workspace'lerde yeni annotation yapılması beklenmez. Mevcut artifact'lar silinmez, taşınmaz veya rewrite edilmez.

## Aktif D7-R0 belge seti

- [Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md): retrieval, research rescue, extraction, deterministic integration, cache ve aşamalar.
- [Research Source Policy](D7_RESEARCH_SOURCE_POLICY.md): AniList, Wikidata, Wikipedia, OpenAI, Brave, Gemini ve storage kararları.
- [Research Security Model](D7_RESEARCH_SECURITY_MODEL.md): allowlist, SSRF, sanitization, injection isolation, limit ve citation validation.
- [Research Acceptance Cases](D7_RESEARCH_ACCEPTANCE_CASES.md): Steins;Gate, Kakegurui, political intrigue, love triangle ve character-driven senaryoları.
- [ML Deferred Plan](D7_ML_DEFERRED_PLAN.md): post-release opsiyonel student/distillation rolü.

## Yeni aşamalar

| Aşama | Kapsam | Production etkisi |
| --- | --- | --- |
| D7-R0 | Read-only audit ve kesin contract/docs | Yok |
| D7-R1 | Saf research domain/source registry/planner/cache port'u ve fixture'lar | Yok |
| D7-R2 | Wikidata/MediaWiki direct evidence ve security/citation katmanı | Shadow/fixture |
| D7-R3 | OpenAI Responses web_search, optional Brave ve bounded orchestrator | Feature flag/shadow |
| D7-R4 | Deterministic evidence merge + acceptance/telemetry | Kontrollü opt-in |
| D7-R5 | Live/source/security/fail-soft final acceptance | D8 release gate adayı |

## D7-R1 giriş koşulları

- 43-aspect capability matrisi queryable/research-required sınıflarını versionlamalıdır.
- Exact candidate identity ile version/season isolation research key'ine dahil olmalıdır.
- Source allowlist, trust class, direct-vs-search storage ayrımı ve policy version sabitlenmelidir.
- No-source→unknown, citation-bound verdict, contradiction ve provider-unavailable codec'leri tanımlanmalıdır.
- Research budget, concurrency, timeout, coalescing ve telemetry contract'ları fixture'a çevrilebilir olmalıdır.
- D6 ranking/hard-filter constant'ları ve regression fixture'ları baseline olarak korunmalıdır.

## D8 etkisi

D8 human gold, model artifact veya training beklemez. Grounded research acceptance yetişirse kontrollü feature gate ile alınır; yetişmezse D6 structured-only authoritative yoluyla release mümkündür. Source compliance, secret/rate-limit operasyonu, cache retention/invalidation ve live fail-soft yalnız research özelliği açılacaksa D8 kapısıdır.
