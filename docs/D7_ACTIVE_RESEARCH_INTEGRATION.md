# D7-R6A1 Active Research Integration

## Rollout modes

`D7_RESEARCH_ROLLOUT_MODE` server-only olarak `disabled`, `shadow` veya `active` kabul eder ve varsayılanı `disabled`dır. Yeni değişken yoksa `D7_RESEARCH_SHADOW_ENABLED=1` eski shadow davranışını korur. `active` ile legacy shadow aynı anda açılırsa resolver fail-closed `disabled` döner; research çağrısı yapılmaz.

## Deterministic flow

Active akış iki saf deterministic koşudan oluşur: önce değişmemiş D6 baseline üretilir; ardından yalnız exact identity/version scope taşıyan, objective ve library kapılarından geçmiş, explicit `must`/`avoid` koşulu structured evidence ile `unknown` kalmış en fazla üç aday araştırılır. Validated `ResearchEvidenceHandoff`, mevcut hard-constraint mapper ile immutable evidence/constraint sidecar'a çevrilir ve engine temiz input üzerinde baştan çalıştırılır. Eligibility, near-match ve sıralama yalnız ikinci deterministic koşudan gelir; LLM ranking yapmaz.

## Budget and failure policy

Active stage en fazla üç aday, aday başına bir aspect, toplam üç job, concurrency 2 ve 12 saniye hard deadline kullanır. Öncelik explicit must, explicit avoid, baseline sıra ve stable identity şeklindedir. Provider/config/cache/acquisition/extraction/grounding/timeout/abort hataları public 500 üretmez; doğrulanmamış veya unknown sonuç merge edilmez ve baseline korunur.

## Internal provenance

Internal sidecar candidate identity, aspect, bounded decision/citation kimlikleri, source count, cache status ve `rescued_candidate`, `rejected_candidate`, `cleared_avoid` veya `no_change` outcome değerini taşır. URL, passage, evidence unit, claim metni, prompt, provider cevabı veya kullanıcı verisi taşımaz; public API, UI ve DB'ye yazılmaz.

## Public boundary

Shadow modu `after()` post-response lifecycle'ını korur; active mod shadow schedule etmez ve final deterministic koşuyu response öncesinde await eder. Public Recommendation V2 şeması bu aşamada değişmez. Citation read-model ve UI D7-R6A2 kapsamındadır.
