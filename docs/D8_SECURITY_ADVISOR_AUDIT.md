# D8-4A.5E Production Security Advisor audit

Audit tarihi: 2026-08-11. Kaynak: Production Supabase Security Advisor CSV export'u, current migrations/schema, RPC consumers ve testler. Production üzerinde sorgu, migration veya mutation yapılmadı.

## Export baseline

- Satır: **123**; `ERROR`: **0**; `WARN`: **123**.
- `authenticated_security_definer_function_executable`: **62**.
- `anon_security_definer_function_executable`: **57**.
- `rls_policy_always_true`: **2**.
- `function_search_path_mutable`: **1**.
- `auth_leaked_password_protection`: **1**.
- Benzersiz SECURITY DEFINER adı: **62**. Anon/auth overlap: **57**. Yalnız authenticated export edilen beş ad: `apply_media_item_sync_operation`, `apply_progress_log_sync_operation`, `delete_theme_sync_state`, `get_theme_sync_state`, `save_theme_sync_state`.

Verilen beklenen sayılarla fark yoktur. CSV metadata'sı fonksiyon imzası taşımadığı için aşağıdaki imzalar migration zincirinden çözülmüştür. Overload bulunan iki adda final ledger durumu açıkça gösterilir; `20260811120000_d8_security_advisor_hardening.sql` prerequisite migration'lardan sonra çalışır.

## Sınıflandırma ve rol sözleşmesi

Kısaltmalar: `A=anon`, `H=authenticated`, `—=runtime rolü yok`. “CSV ACL” Production export'un kanıtladığı etkin roller; “source intent” mevcut migration/runtime sözleşmesidir. Her mutation owner/actor'ı `auth.uid()` ile üretir veya katılımcılığı doğrular. `PUBLIC_READ` satırları yalnız public/profile/module policy projection'ı döndürür.

| Fonksiyon | CSV ACL / source intent | Sınıf | Caller identity ve owner authorization | Public visibility | Final roller / değişiklik / gerekçe |
| --- | --- | --- | --- | --- | --- |
| `public.apply_media_item_sync_operation(text,text,text,bigint,jsonb)` | H / H | AUTHENTICATED_MUTATION | `auth.uid()` owner; owner PK, CAS, idempotency, tombstone | — | H / no anon grant; Cloud Media RPC contract |
| `public.apply_progress_log_sync_operation(text,text,text,bigint,jsonb)` | H / H | AUTHENTICATED_MUTATION | `auth.uid()` owner; owner media relation, immutable log/CAS | — | H / no anon grant; Cloud progress RPC |
| `public.delete_theme_sync_state()` | H / H | AUTHENTICATED_MUTATION | `auth.uid()` owner row delete | — | H / explicit deny A |
| `public.get_social_person_summary(uuid)` | A,H / H | AUTHENTICATED_READ | Viewer=`auth.uid()`; block and visible-profile check | Public/protected target only | H / revoke A; relationship-aware result |
| `public.get_social_profile(text)` | A,H / A,H | PUBLIC_READ | Viewer optional; owner resolved by username | personal/block/module visibility enforced | A,H / intentional public profile RPC |
| `public.get_social_recommendation_detail(uuid)` | A,H / H | AUTHENTICATED_READ | `auth.uid()` must be sender or recipient | — | H / revoke A; participant-private thread |
| `public.get_theme_sync_state()` | H / H | AUTHENTICATED_READ | `auth.uid()` owner row | — | H / private theme bundle |
| `public.get_unified_social_profile(text)` | A,H / A,H | PUBLIC_READ | Delegates to public-profile projection | same public/personal/block/module policy | A,H / intentional public route payload |
| `public.get_xp_dashboard(integer)` | A,H / H | AUTHENTICATED_READ | Owner=`auth.uid()` | — | H / revoke A; private event breakdown |
| `public.get_xp_public_summary(uuid)` | A,H / A,H | PUBLIC_READ | Target user; calls public profile projection | progression/badges module visibility | A,H / intentional public XP summary |
| `public.list_profile_activity(uuid,integer)` | A,H / A,H | PUBLIC_READ | Target owner; viewer=`auth.uid()` optional | activity/profile visibility helper | A,H / intentional public module read |
| `public.list_social_blocks()` | A,H / H | AUTHENTICATED_READ | Owner=`auth.uid()` | — | H / revoke A; private block list |
| `public.list_social_connections(uuid,text,text,integer,integer)` | A,H / A,H | PUBLIC_READ | Target owner; pending only for self | profile/follow-module visibility and blocks | A,H / public followers/following projection |
| `public.list_social_feed(timestamptz,uuid,integer)` | A,H / H | AUTHENTICATED_READ | Viewer=`auth.uid()`; followed/self scope | per-event/profile visibility | H / revoke A; personalized feed |
| `public.list_social_notifications(timestamptz,uuid,integer)` | A,H / H | AUTHENTICATED_READ | Recipient=`auth.uid()` | — | H / revoke A |
| `public.list_social_recommendations(text,text,timestamptz,uuid,integer)` | A,H / H | AUTHENTICATED_READ | Sender/recipient=`auth.uid()` | — | H / revoke A |
| `public.save_theme_sync_state(bigint,jsonb,jsonb)` | H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; revision CAS and payload validator | — | H / explicit deny A |
| `public.search_social_profiles(text,integer,integer)` | A,H / A,H | PUBLIC_READ | Viewer optional | public/protected only; block filter | A,H / intentional bounded public search |
| `public.social_block(uuid)` | A,H / H | AUTHENTICATED_MUTATION | Blocker=`auth.uid()`; self-block denied | — | H / revoke A |
| `public.social_can_view_activity_row(uuid,text,uuid)` | A,H / — | INTERNAL_ONLY | Trusted caller supplies evaluated viewer | Implements profile/block/follow visibility | — / helper called inside definer/RLS paths |
| `public.social_can_view_module(uuid,text,uuid)` | A,H / — | INTERNAL_ONLY | Trusted caller supplies evaluated viewer | Implements public/protected/module policy | — / no direct runtime contract |
| `public.social_comment(uuid,uuid,text,boolean,text)` | A,H / H | AUTHENTICATED_MUTATION | Author=`auth.uid()`; target visibility validated | Target activity must be viewable | H / revoke A |
| `public.social_comment_action(text,uuid,text,boolean)` | A,H / H | AUTHENTICATED_MUTATION | Author/activity owner checks | — | H / revoke A |
| `public.social_delete_activity(uuid)` | A,H / H | AUTHENTICATED_MUTATION | Actor=`auth.uid()` | — | H / revoke A |
| `public.social_ensure_activity_module()` | A,H / — | INTERNAL_ONLY | Trigger row identity | — | — / trigger only |
| `public.social_follow(uuid)` | A,H / H | AUTHENTICATED_MUTATION | Follower=`auth.uid()`; target/block/profile checks | target public/protected | H / revoke A |
| `public.social_follow_action(text,uuid)` | A,H / H | AUTHENTICATED_MUTATION | Relationship side bound to `auth.uid()` | — | H / revoke A |
| `public.social_get_preferences()` | A,H / H | AUTHENTICATED_READ | Owner=`auth.uid()` | — | H / revoke A |
| `public.social_insert_notification(uuid,uuid,text,text,uuid,jsonb,text)` | A,H / — | INTERNAL_ONLY | Called after trusted actor/recipient checks | block/preference filtering | — / internal write helper |
| `public.social_insert_recommendation_message(uuid,uuid,text,text,boolean)` | A,H / — | INTERNAL_ONLY | Trusted wrapper supplies author after participant check | — | — / internal helper; direct author impersonation removed |
| `public.social_is_blocked(uuid,uuid)` | A,H / — | INTERNAL_ONLY | Trusted caller provides pair | Returns only policy boolean | — / helper only |
| `public.social_notification_action(text,uuid,text,uuid)` | A,H / H | AUTHENTICATED_MUTATION | Recipient=`auth.uid()` | — | H / revoke A |
| `public.social_notification_allowed(uuid,text)` | A,H / — | INTERNAL_ONLY | Trusted notification pipeline | preference boolean only | — / helper only |
| `public.social_profile_asset_visible(text,uuid)` | A,H / — | INTERNAL_ONLY | Legacy overload lacks exact asset-name binding | profile/block only | — / revoke legacy overload |
| `public.social_profile_asset_visible(text,text,uuid)` | prerequisite sonrası A,H / A,H | PUBLIC_READ | Viewer optional; owner/path arguments checked | exact current avatar/banner + profile/block policy | A,H / only final exact-path overload granted |
| `public.social_publish_activity(text,text,jsonb,integer,text,text,text)` | A,H / H | AUTHENTICATED_MUTATION | Actor=`auth.uid()`; profile/payload/rate checks | chosen bounded visibility | H / revoke A |
| `public.social_react(uuid,uuid,text)` | A,H / H | AUTHENTICATED_MUTATION | Reactor=`auth.uid()`; one visible target | target visibility validated | H / revoke A |
| `public.social_recommendation_transition(uuid,text,text,boolean,text,text)` | A,H / H | AUTHENTICATED_MUTATION | Sender/recipient transition checks | — | H / revoke A |
| `public.social_replace_showcase(text,jsonb)` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()` | publication later module-gated | H / revoke A |
| `public.social_report(uuid,uuid,text,text)` | A,H / H | AUTHENTICATED_MUTATION | Reporter=`auth.uid()`; target visibility validated | target must be visible | H / revoke A |
| `public.social_save_preferences(text,jsonb)` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()` | — | H / revoke A |
| `public.social_save_profile(text,text,text,text,text,text,text,text)` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; username lock/reservation | saves own visibility | H / compatibility RPC retained |
| `public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric)` | A,H / — | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; called by final wrapper | — | — / legacy internal overload |
| `public.social_save_unified_profile(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,jsonb)` | prerequisite sonrası A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; theme allowlist/contrast + base save | controls published snapshot | H / only final 25-arg contract granted |
| `public.social_send_recommendation(uuid,jsonb,text,text)` | A,H / H | AUTHENTICATED_MUTATION | Sender=`auth.uid()`; recipient permission/block checks | — | H / revoke A |
| `public.social_send_recommendation_message(uuid,text,text)` | A,H / H | AUTHENTICATED_MUTATION | Author=`auth.uid()`; helper verifies participant | — | H / revoke A |
| `public.social_share_note(text,text,text,text,text,boolean,text,boolean)` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; explicit confirmation | bounded chosen visibility | H / revoke A |
| `public.social_unblock(uuid)` | A,H / H | AUTHENTICATED_MUTATION | Blocker=`auth.uid()` | — | H / revoke A |
| `public.social_unshare_note(uuid)` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()` | — | H / revoke A |
| `public.xp_apply_adjustment(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean)` | A,H / — | INTERNAL_ONLY | Trusted XP pipeline supplies user | — | — / arbitrary-user adjustment not a user RPC |
| `public.xp_apply_event(uuid,text,text,text,text,text,text,jsonb,jsonb,boolean)` | A,H / — | INTERNAL_ONLY | Trusted XP pipeline supplies user | — | — / event allocator helper |
| `public.xp_award_recommendation_completion(uuid)` | A,H / — | INTERNAL_ONLY | Trigger reads verified recommendation parties | — | — / trigger helper |
| `public.xp_convert_legacy_local_state(uuid)` | A,H / — | INTERNAL_ONLY | Called with `auth.uid()` by sync wrapper | — | — / arbitrary-user direct call removed |
| `public.xp_evaluate_quests(uuid)` | A,H / — | INTERNAL_ONLY | Called from trusted XP mutation | — | — / arbitrary-user helper |
| `public.xp_profile_entitlement_trigger()` | A,H / — | INTERNAL_ONLY | Trigger row owner | — | — / trigger only |
| `public.xp_recommendation_event_trigger()` | A,H / — | INTERNAL_ONLY | Trigger row recommendation | — | — / trigger only |
| `public.xp_recommendation_feedback_trigger()` | A,H / — | INTERNAL_ONLY | Trigger row author/recommendation | — | — / trigger only |
| `public.xp_reconcile_entitlement(uuid,text,text,boolean,text,text,jsonb,jsonb)` | A,H / — | INTERNAL_ONLY | Called by owner-bound sync/trigger pipeline | — | — / arbitrary-user direct call removed |
| `public.xp_reconcile_media_state(uuid,jsonb)` | A,H / — | INTERNAL_ONLY | Called with `auth.uid()` by sync wrapper | — | — / validates minimized state, no notes |
| `public.xp_repair_selected_title(uuid)` | A,H / — | INTERNAL_ONLY | Called after trusted XP revoke | — | — / arbitrary-user helper |
| `public.xp_select_badges(text[])` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; earned-only selection | selected badges may be public-module data | H / revoke A |
| `public.xp_select_title(text)` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; earned-title check | selected title follows profile policy | H / revoke A |
| `public.xp_showcase_trigger()` | A,H / — | INTERNAL_ONLY | Legacy trigger helper; active trigger replaced | — | — / no direct role |
| `public.xp_sync_media_states(jsonb,boolean)` | A,H / H | AUTHENTICATED_MUTATION | Owner=`auth.uid()`; batch bounds, privacy denylist | — | H / revoke A |

Toplam: `PUBLIC_READ=7`, `AUTHENTICATED_READ=9`, `AUTHENTICATED_MUTATION=27`, `INTERNAL_ONLY=19`, `OPS_ONLY=0`. `OPS_ONLY=0`, çünkü export'taki hiçbir fonksiyon için tanımlı doğrudan operational runtime sözleşmesi bulunmadı.

## Diğer bulgular ve migration etkisi

- `public.set_updated_at()` uyarısı geçerlidir: mevcut gövde `now()` ve `new.updated_at` kullanır fakat sabit search path yoktur. Migration `search_path=pg_catalog` atar, trigger davranışını değiştirmez ve user rollerinden doğrudan EXECUTE'i kaldırır.
- Production export'taki `embedding_cache_insert_global` ve `embedding_cache_update_global` policy'leri unrestricted write sağlar. RLS açık kalır; dört legacy global policy drop edilir ve tablo privilege'ları `PUBLIC`, `anon`, `authenticated` rollerinden tamamen revoke edilir. Tablo drop edilmez; service-role-only gelecekteki server adapter uyumluluğu korunur.
- `auth_leaked_password_protection` **ACCEPTED_PLATFORM_LIMITATION** olarak sınıflandırılır. Public signup disabled, mevcut release hesaplarında güçlü ve benzersiz credential zorunlu, capability erişilebilir olduğunda leaked-password protection açılması post-release kontrolüdür. Tek başına D8-4B blocker değildir.

## Beklenen Advisor görünümü

Production current export: **123 WARN**. Onaylı migration D8-4B'de uygulanıp Advisor yeniden çalıştırıldığında tahmini görünüm:

- anon SECURITY DEFINER: `57 → 7`;
- authenticated SECURITY DEFINER: `62 → 43`;
- permissive embedding policies: `2 → 0`;
- mutable search path: `1 → 0`;
- leaked-password platform warning: `1 → 1`.

Toplam tahmini: **51 WARN**. Kalan 50 SECURITY DEFINER uyarısı Advisor'ın generic rol uyarısıdır: 7 public-read fonksiyon iki role, 36 authenticated read/mutation fonksiyonu yalnız authenticated role açıktır. Bunlar least-privilege incelemesi yapılmış intentional RPC contract'larıdır. Kalan bir platform uyarısı yukarıdaki compensating controls ile kabul edilir. Production'da migration uygulanmadan bu tahmin “temizlendi” veya PASS sayılmaz.

## Staging uygulama kanıtı

`20260811120000_d8_security_advisor_hardening.sql` 2026-08-11 tarihinde masked hard gate'in Production ref ayrımını doğruladığı Test/Staging Supabase hedefine uygulandı; remote ledger local/remote timestamp eşleşmesini gösterdi. Canlı regresyonda Guest public search ve XP projection, authenticated social/theme RPC, internal helper'ın API yüzeyinden gizlenmesi, anon/authenticated `embedding_cache` SELECT/INSERT/UPDATE/DELETE denial, Cloud Media ve Goal Cloud User A/B owner isolation geçti. Bu kanıt Production ledger veya Production Advisor sonucu değildir.
