<!-- knowledge-compiler-adapter-v1
{"adapter_contract":"codex-agents-v1","generated_body_sha256":"fafc2b36df112cf9d9711ce94a387164794963708baeffcc6a5e94599228c902","generator":"knowledge-compiler","generator_version":"adapter-compiler-v2","project_id":"media-tracker","routing_sha256":"5ff1d00e7c37223fec6f256130db91554b59fbca7cd7bf57ea53e75a87fa5a51","source_structured_contract_sha256":"4b53fdac17e35b692556b071a8a1dda67d2719718cda1624cbb02e138255b678","target":"codex"}
-->

# Generated Codex Instructions: MediaTracker

Generated from validated `.ai/project.md` authority and automation/map routing. Do not edit by hand.

Apply every matching manifest rule using the M0 lexical scope matcher; nested guidance cannot relax root authority.

## Task operations

Read `.ai/project.md`, `.ai/automation.json` and only relevant domains from `.ai/project-map.json`. The map is routing evidence; manifest critical_rules remain structured authority. Inspect mapped files first and expand through actual dependencies.

After durable ownership, paths or validation topology changes, maintain the project map when policy.project_map permits, then run `kc adapters tree-build . --target codex` when policy.agents permits. When durable project knowledge changes and policy enables sync, author an inert autopilot plan, run `kc autopilot check` then `kc autopilot apply`. KnowledgeCompiler validates the working-tree snapshot, owner, exact preimages and transaction, records audit evidence and commits/pushes owned Vault changes according to policy. Formatting, comments, tiny refactors and temporary investigation do not require Vault updates. Ambiguity fails closed; 81 is exceptional manual fallback. 30 writing canon is excluded; 80 governance requires protected promotion. Never commit or push source code unless the user explicitly requests it.

Autopilot enabled: true. Routing domains: local-data-integrity, cloud-sync-auth, library-dashboard, discovery-provider-policy, release-calendar, goals, recommendation-ranking, grounded-research, social-xp, personalization-settings, release-validation.

## Critical rules

- `cloud-authorization-boundary` (`supabase/**`, error): Preserve owner authorization/RLS, revision/idempotency/tombstone contracts and immutable event behavior; production migrations require explicit target and rollback acceptance.
- `deterministic-recommendation-authority` (`features/recommendations/**`, error): Recommendation V2 owns candidate identity, eligibility and final deterministic ranking; research and LLM output cannot invent candidates or override hard constraints.
- `grounded-research-security` (`features/recommendations/research/**`, error): Keep exact identity/revision-bound provenance, validated source/URL/network boundaries, bounded inputs and fail-closed public citations; missing evidence is not absence.
- `installed-nextjs-guidance` (`**`, error): Before framework-specific changes read the relevant installed guide in node_modules/next/dist/docs and heed deprecation notices.
- `owner-local-first-integrity` (`lib/**`, error): Preserve guest/user owner isolation, stale async guards and verified local mutations when optional cloud side effects fail.
- `server-provider-gates` (`app/api/**`, error): Enforce server-verified authorization and fail-closed provider/research capability gates; do not expose service-role or provider credentials.
