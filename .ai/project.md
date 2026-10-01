---
{"critical_rules":[{"id":"cloud-authorization-boundary","kind":"invariant","scope":"supabase/**","severity":"error","statement":"Preserve owner authorization/RLS, revision/idempotency/tombstone contracts and immutable event behavior; production migrations require explicit target and rollback acceptance."},{"id":"deterministic-recommendation-authority","kind":"invariant","scope":"features/recommendations/**","severity":"error","statement":"Recommendation V2 owns candidate identity, eligibility and final deterministic ranking; research and LLM output cannot invent candidates or override hard constraints."},{"id":"grounded-research-security","kind":"invariant","scope":"features/recommendations/research/**","severity":"error","statement":"Keep exact identity/revision-bound provenance, validated source/URL/network boundaries, bounded inputs and fail-closed public citations; missing evidence is not absence."},{"id":"installed-nextjs-guidance","kind":"validation","scope":"**","severity":"error","statement":"Before framework-specific changes read the relevant installed guide in node_modules/next/dist/docs and heed deprecation notices.","validation_id":"installed-nextjs-guidance"},{"id":"owner-local-first-integrity","kind":"invariant","scope":"lib/**","severity":"error","statement":"Preserve guest/user owner isolation, stale async guards and verified local mutations when optional cloud side effects fail."},{"id":"server-provider-gates","kind":"invariant","scope":"app/api/**","severity":"error","statement":"Enforce server-verified authorization and fail-closed provider/research capability gates; do not expose service-role or provider credentials."}],"manifest_version":1,"project_id":"media-tracker","project_name":"MediaTracker","schema":"project-ai-manifest-v1"}
---
# Purpose

Local-first personal media tracking web application with optional Supabase sync/social, goals, XP, calendar, personalization and deterministic Recommendation V2.

# Repository Map

- local-data-integrity: lib/local-data-storage.ts, lib/local-data-ownership.ts, lib/local-data-integrity.ts, lib/portable-backup.ts, lib/media-identity.ts
- cloud-sync-auth: lib/supabase, lib/sync-manager.ts, lib/sync-queue.ts, lib/cloud-media-v2-client.ts, supabase
- library-dashboard: features/library, features/dashboard, app/page.tsx
- discovery-provider-policy: features/discovery, lib/providers, app/api
- release-calendar: features/calendar
- goals: features/goals
- recommendation-ranking: features/recommendations/domain, features/recommendations/intent, features/recommendations/evidence, features/recommendations/ranking, features/recommendations/orchestration, features/recommendations/providers, features/recommendations/ui
- grounded-research: features/recommendations/research
- social-xp: lib/social, lib/xp
- personalization-settings: lib/personalization, features/settings
- release-validation: scripts, package.json, vitest.config.ts

# Architecture

Next.js App Router composition uses features for library, discovery, calendar, dashboard, goals, settings and recommendations. lib owns owner-scoped persistence, integrity/portable backup, cloud queues, provider boundaries, social and personalization. Recommendation V2 owns eligibility/ranking; grounded research acquires exact-identity cited evidence and may feed a gated deterministic final pass. Supabase is an optional extension, not the local library source of truth.

# Validation Notes

npx tsc --noEmit and directly related Vitest files are meaningful for executable changes; package.json has no typecheck script. Live Supabase, browser, full regression and production cutover are separate explicit gates. Read the installed Next.js guides in node_modules/next/dist/docs before framework-specific changes; heed deprecations. docs/ROADMAP.md and D8 release acceptance/runbook distinguish code completion from Production acceptance.

# Sensitive Areas

Preserve guest/user owner namespaces, stale-async guards, immutable progress/XP and queue operation/revision identities. Server authorization/RLS enforce access; API/provider/research gates fail closed. No automatic production migration/deployment or secret export.

# Non-goals

No mandatory cloud dependency, LLM final ranker, research-generated candidate identity or automatic Production release. Legacy ML/annotation tooling is not the active production decision authority.
