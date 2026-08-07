import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS = [
  "docs/AI_RECOMMENDATION_V2_ARCHITECTURE.md",
  "docs/AI_RECOMMENDATION_V2_DOMAIN.md",
  "docs/AI_ASPECT_TAXONOMY.md",
  "docs/AI_PROVIDER_EVIDENCE_MATRIX.md",
  "docs/AI_RECOMMENDATION_V2_PROVIDER_ENRICHMENT.md",
  "docs/AI_RECOMMENDATION_V2_RANKING.md",
  "docs/AI_RECOMMENDATION_V2_UI_AND_FEEDBACK.md",
  "docs/AI_RECOMMENDATION_V2_MANUAL_TESTS.md",
  "docs/AI_RECOMMENDATION_V2_D64_MANUAL_FIXES.md",
  "docs/AI_RECOMMENDATION_V2_MIGRATION_PLAN.md",
  "docs/AI_RECOMMENDATION_V2_ACCEPTANCE.md",
  "docs/AI_RECOMMENDATION_V2_DEMO_SCRIPT.md",
  "docs/AI_RECOMMENDATION_EVALUATION_CONTRACT.md",
  "docs/AI_RECOMMENDATION_V2_D661_CAPABILITY_AND_PARSER.md",
  "docs/AI_RECOMMENDATION_V2_D661R_RANKED_TAG_RETRIEVAL.md",
  "docs/AI_RECOMMENDATION_V2_D662_LIVE_PROVIDER_RELIABILITY.md",
  "docs/AI_RECOMMENDATION_RANKED_TAG_COVERAGE.md",
  "docs/AI_RECOMMENDATION_V2_FINAL_ACCEPTANCE.md",
  "docs/D7_ASPECT_VERIFIER_PLAN.md",
  "docs/ROADMAP.md",
] as const;

describe("D6 documentation consolidation", () => {
  it("keeps every relative Markdown link resolvable", () => {
    const broken: string[] = [];
    for (const file of DOCS) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1].replace(/^<|>$/g, "").split("#")[0];
        if (!target || /^(https?:|mailto:)/.test(target)) continue;
        if (!existsSync(resolve(dirname(file), target))) broken.push(`${file} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("closes D6 without claiming quality or production readiness", () => {
    const acceptance = readFileSync("docs/AI_RECOMMENDATION_V2_ACCEPTANCE.md", "utf8");
    const roadmap = readFileSync("docs/ROADMAP.md", "utf8");
    expect(acceptance).toContain("D6-0–D6.6-1");
    expect(acceptance).toContain("production-ready iddiası değildir");
    expect(acceptance).toContain("D6_PROVIDER_LIVE_SMOKE");
    expect(roadmap).toContain("D6.6-2 — Live provider reliability ve final D6 kabulü");
    expect(roadmap).toContain("D7 — Grounded Aspect Research Engine");
    const coverage = readFileSync("docs/AI_RECOMMENDATION_RANKED_TAG_COVERAGE.md", "utf8");
    expect(coverage).toContain("mapped_queryable` (2)");
    expect(coverage).toContain("evidence_only` (10)");
    expect(coverage).toContain("semantic_confirmation_required` (9)");
    expect(coverage).not.toContain("production-ready AI");
  });
});
