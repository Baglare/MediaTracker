<!-- knowledge-compiler-adapter-v1
{"adapter_contract":"codex-agents-v1","generated_body_sha256":"ad3d2dce0fdceb2606966c19d7fc2d9841c8312a5df984a8edcf04134f044f4f","generator":"knowledge-compiler","generator_version":"adapter-compiler-v4","project_id":"media-tracker","routing_sha256":"dd9da39d21503aa1a2c9f6a9a08c21d7b8f980fd0efebda956d55e74046f530d","source_structured_contract_sha256":"4b53fdac17e35b692556b071a8a1dda67d2719718cda1624cbb02e138255b678","target":"codex"}
-->

# Generated Codex Instructions: MediaTracker: grounded-research

Generated from validated `.ai/project.md` authority and automation/map routing. Do not edit by hand.

Apply every matching manifest rule using the M0 lexical scope matcher; nested guidance cannot relax root authority.

## Task operations

Inherit root AGENTS authority and operations. Routing owner: grounded-research. Relevant tests: tests/recommendation-d7-r6b-final.test.ts. These paths are repository-relative; resolve them from the repository root.

## Critical rules

- `deterministic-recommendation-authority` (`features/recommendations/**`, error): Recommendation V2 owns candidate identity, eligibility and final deterministic ranking; research and LLM output cannot invent candidates or override hard constraints.
- `grounded-research-security` (`features/recommendations/research/**`, error): Keep exact identity/revision-bound provenance, validated source/URL/network boundaries, bounded inputs and fail-closed public citations; missing evidence is not absence.
