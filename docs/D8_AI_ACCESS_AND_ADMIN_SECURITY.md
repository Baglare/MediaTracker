# D8-1 AI Erişimi ve Admin Güvenliği

## Güven sınırı

Server-funded provider yetkisi yalnız Supabase `auth.getUser()` ile sunucuda doğrulanan kullanıcının `app_metadata` alanından çözülür. `role: "admin"`, `roles` içinde `admin` veya `is_admin: true` kabul edilir. Request body, header, query parametresi, client state, `localStorage` ve düzenlenebilir `user_metadata` yetki kaynağı değildir.

Public `AiEntitlement` read-model yalnız şu boolean alanları taşır: `authenticated`, `isAdmin`, `canUseDeterministicAdvisor`, `canUseServerProviders`, `canUseOpenAi`, `canUseGroundedResearch`. User ID, raw role claim, key/key durumu, model veya provider config gönderilmez.

## Policy

`AI_SERVER_ACCESS_MODE` değerleri:

- `disabled`: varsayılan; server-funded provider ve Grounded Research kapalıdır.
- `admin_only`: release için önerilen mod; yalnız server-verified admin kullanabilir.
- `authenticated`: doğrulanmış her oturum kullanabilir.

Geçersiz veya eksik değer `disabled` olur. Supabase config/auth hatası guest olarak fail-closed değerlendirilir. DB tablosu veya migration gerekmemiştir.

`/api/ai/recommend` library-only deterministik yolu guest dahil kullanılabilir. `source-apis` ve `web` mevcut mimaride provider planlamasına eriştiği için `canUseServerProviders` gerektirir. Gate provider listesi oluşturulmadan, Grounded Research veya başka network işi başlamadan önce çalışır. Body içindeki `useOpenAIProvider`, admin/role ve research sinyalleri entitlement'ı genişletemez. OpenAI, Gemini, OpenRouter, Groq ve Grounded Research aynı maliyetli-provider sınırındadır; yetki yokken ücretli fallback yapılmaz.

`/api/ai/capabilities` read-model'i `Cache-Control: no-store` ile döner. AI Danışman OpenAI seçeneğini ve dış araştırma modlarını capability'ye göre kapatır; sunucu kontrolü her durumda authoritative kalır.

## Operasyon

Bu belge D8-1 tamamlandığı andaki `admin_only` önerisini kaydeder. D8-4A.5D canonical ilk-release kararı bunu supersede eder: Production v1 `AI_SERVER_ACCESS_MODE=disabled` ile başlar; admin claim/MFA ve provider enablement `POST_RELEASE_GATE`tir. Production DB veya deploy yapılmamıştır.
