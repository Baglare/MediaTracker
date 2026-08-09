# D8 release environment matrix

| Grup / env | Zorunluluk ve varsayılan | Staging sınıfı | Production önerisi | Görünürlük | Fail davranışı |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloud için birlikte gerekli | staging project | production project | public | eksik/uyumsuzsa local mode |
| `SUPABASE_SERVICE_ROLE_KEY` | yalnız privileged server işi | staging secret | secret manager | server secret | yoksa privileged iş kapalı |
| `NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE`, `...V2_ENABLED` | default `legacy`/false | migration sonrası kademeli | D2C.1 post-check sonrası | public | conflict fail-closed/reload/maintenance |
| Goal schema/flag değişkenleri | default `absent`/false | Goal post-check sonrası | kontrollü cutover | public | cloud Goal kapalı, local korunur |
| `AI_SERVER_ACCESS_MODE` | default `disabled` | `admin_only` smoke | `admin_only` | server | unknown = disabled |
| Provider key/model değişkenleri | provider seçilirse gerekli | staging secret/model | secret manager, explicit model | server secret/config | provider unavailable; ücretli fallback yok |
| `D7_RESEARCH_ROLLOUT_MODE` | default `disabled` | önce disabled, explicit smoke | `disabled` | server | conflict = disabled |
| Discovery/extraction provider ve enable flag'leri | ikili explicit opt-in | key-gated | disabled başlangıç | server | adapter/network çağrısı yok |
| `D7_RESEARCH_PUBLIC_CITATIONS_ENABLED` | active için gerekli | explicit | research disabled iken 0 | server | active baseline'a düşer |
| `D7_RESEARCH_EVIDENCE_CACHE_ENABLED` | optional process cache | 0/1 smoke | yalnız admin low-volume | server | cache miss; correctness değişmez |
| API rate/body/timeout bütçeleri | code-bounded | aynı contract | aynı contract | server | 413/429/timeout safe error |
| `MEDIA_TRACKER_PROVIDER_USER_AGENT` | düzenli OL/TVMaze kullanımında gerekli | test contact | gerçek ürün URL/contact | server config | header eklenmez; compliance rollout blocker |
| `D8_STAGING_*` | staging rehearsal için explicit | yalnız staging | production runtime'a koyma | server/local secret | script DB'ye bağlanmaz |
| `SUPABASE_TEST_*` | conditional two-owner smoke | disposable fixtures | production hesabı yasak | local secret | test skip/fail-closed |
| `D7_*_LIVE_SMOKE` | conditional provider smoke | tek tek explicit | normal runtime'da 0 | server/local | live ağ çağrısı yok |

Çelişkili kombinasyonlar (aynı staging/production ref, active research + legacy shadow flag, feature flag + uyumsuz schema stage, eksik provider key/model) fail-closed olmalıdır. Gerçek değerler bu belgede veya tracked dosyalarda tutulmaz.
