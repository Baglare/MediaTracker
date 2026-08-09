import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import type { GroundedExtractionProviderPort } from "@/features/recommendations/research/extraction/providers/port";
import {
  createGroundedExtractionPacket,
  createGroundedExtractionRequest,
  SYNTHETIC_NO_ROMANCE,
} from "@/features/recommendations/research/testing/extraction-fixtures";

type StableStatus = "claims_extracted" | "no_claims_extracted" | "output_invalid" | "grounding_invalid";

const ENVIRONMENT: NodeJS.ProcessEnv = {
  D7_RESEARCH_EXTRACTION_PROVIDER: "groq",
  D7_GROQ_GROUNDED_EXTRACTION_ENABLED: "1",
  GROQ_API_KEY: "test-secret",
  GROQ_RESEARCH_EXTRACTION_MODEL: "openai/gpt-oss-20b",
};

function evidenceGapClass(input: { leadOnlyRequested: boolean; fullDocumentUnderLimit: boolean; evidenceOutsideLead: boolean }) {
  return input.leadOnlyRequested && input.fullDocumentUnderLimit && input.evidenceOutsideLead ? "lead_only_document" : "other";
}

function aggregateRuns(statuses: readonly StableStatus[]) {
  const invalidOutputCount = statuses.filter((status) => status === "output_invalid" || status === "grounding_invalid").length;
  return { runCount: statuses.length, invalidOutputCount, activeRolloutBlocked: invalidOutputCount > 0 };
}

function documentSizeBucket(bytes: number) {
  if (bytes < 12_000) return "under_12kb";
  if (bytes <= 24_000) return "12_to_24kb";
  return "over_24kb";
}

function controlledAdapter(finding: "support" | "insufficient"): GroundedExtractionProviderPort {
  return {
    providerId: "groq",
    async extract(input) {
      const unit = input.modelInput.evidenceUnits[0];
      const assessment = finding === "support"
        ? { passageId: unit.passageId, finding: "supports_presence" as const, level: "significant" as const, confidence: "high" as const, evidenceUnitIds: [unit.unitId], basis: "affects_character_decisions" as const }
        : { passageId: unit.passageId, finding: "insufficient" as const, level: null, confidence: "low" as const, evidenceUnitIds: [], basis: "context_insufficient" as const };
      return { status: "success", providerId: "groq", modelId: input.model, output: { version: 1, assessments: [assessment] }, telemetry: { durationMs: 1, retryCount: 0, rateLimitCount: 0, responseBytes: 1 }, warnings: [] };
    },
  };
}

describe("D7-R5B coverage and stability diagnostics", () => {
  it("R5A gap'i lead_only_document olarak sınıflandırır", () => {
    expect(evidenceGapClass({ leadOnlyRequested: true, fullDocumentUnderLimit: true, evidenceOutsideLead: true })).toBe("lead_only_document");
  });

  it("Steins;Gate-shaped anchor significant support'u medium source cap ile korur", async () => {
    const packet = await createGroundedExtractionPacket({ text: "The opening establishes a scientific conflict. Two central characters later recognize mutual romantic feelings, and their relationship changes a decisive action in the main plot." });
    const result = await extractGroundedResearch(await createGroundedExtractionRequest({ packet }), { environment: ENVIRONMENT, adapters: { groq: controlledAdapter("support") } });
    expect(result).toMatchObject({ status: "claims_extracted", decision: { status: "supported", level: "significant", confidence: "medium" } });
  });

  it("Kakegurui-like omission'ı absence/support yapmadan unknown tutar", async () => {
    const packet = await createGroundedExtractionPacket({ title: "Popular gambling story", text: SYNTHETIC_NO_ROMANCE });
    const result = await extractGroundedResearch(await createGroundedExtractionRequest({ packet }), { environment: ENVIRONMENT, adapters: { groq: controlledAdapter("insufficient") } });
    expect(result).toMatchObject({ status: "no_claims_extracted", claims: [], decision: { status: "unknown", reasonCode: "passage_insufficient" } });
  });

  it("three-run aggregation invalid schema/grounding çıktısını rollout blocker yapar", () => {
    expect(aggregateRuns(["claims_extracted", "claims_extracted", "claims_extracted"])).toEqual({ runCount: 3, invalidOutputCount: 0, activeRolloutBlocked: false });
    expect(aggregateRuns(["claims_extracted", "grounding_invalid", "claims_extracted"])).toMatchObject({ invalidOutputCount: 1, activeRolloutBlocked: true });
    expect(aggregateRuns(["output_invalid", "claims_extracted", "claims_extracted"])).toMatchObject({ invalidOutputCount: 1, activeRolloutBlocked: true });
  });

  it("document byte bucket sınırlarını deterministik sınıflandırır", () => {
    expect([documentSizeBucket(11_999), documentSizeBucket(12_000), documentSizeBucket(24_000), documentSizeBucket(24_001)]).toEqual(["under_12kb", "12_to_24kb", "12_to_24kb", "over_24kb"]);
  });

  it("runtime patch eser hardcode'u veya source-expansion adapter'ı taşımaz", () => {
    const adapter = readFileSync(join(process.cwd(), "features/recommendations/research/adapters/wikipedia/document-adapter.ts"), "utf8");
    expect(adapter).not.toMatch(/Steins;Gate|Kakegurui|Q20590069/);
    for (const source of ["fandom", "reddit", "myanimelist", "tmdb", "trakt"]) {
      expect(existsSync(join(process.cwd(), "features/recommendations/research/adapters", source))).toBe(false);
    }
  });
});
