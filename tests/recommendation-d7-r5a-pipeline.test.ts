import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { buildGroundedEvidenceUnits } from "@/features/recommendations/research/extraction/domain/evidence-units";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import type { GroundedExtractionProviderPort } from "@/features/recommendations/research/extraction/providers/port";
import { scorePassageLexicalRelevance } from "@/features/recommendations/research/passages/relevance";
import {
  createGroundedExtractionPacket,
  createGroundedExtractionRequest,
  SYNTHETIC_NO_ROMANCE,
} from "@/features/recommendations/research/testing/extraction-fixtures";

const ENVIRONMENT: NodeJS.ProcessEnv = {
  D7_RESEARCH_EXTRACTION_PROVIDER: "groq",
  D7_GROQ_GROUNDED_EXTRACTION_ENABLED: "1",
  GROQ_API_KEY: "test-secret",
  GROQ_RESEARCH_EXTRACTION_MODEL: "openai/gpt-oss-20b",
};

describe("D7-R5A evidence-gap regression", () => {
  it("explicit relationship phrases receive lexical priority and stay inside packet budget", async () => {
    const filler = Array.from({ length: 12 }, (_, index) => `Section ${index + 1} describes laboratory procedures and scheduling constraints without a relationship claim.`).join("\n\n");
    const evidence = "The two fictional leads acknowledge mutual romantic feelings. Their relationship then changes a critical decision in the central conflict.";
    const packet = await createGroundedExtractionPacket({ text: `${filler}\n\n${evidence}\n\n${filler}` });
    const selected = packet.passages.find((passage) => passage.text.includes("mutual romantic feelings"));
    expect(scorePassageLexicalRelevance({ text: evidence, aspectId: "romance" })).toMatchObject({ score: expect.any(Number), matchedTerms: expect.arrayContaining(["romantic"]) });
    expect(selected).toMatchObject({ selectionReason: "lexical_relevance" });
    expect(packet.passages.reduce((total, passage) => total + passage.text.length, 0)).toBeLessThanOrEqual(10_000);
  });

  it("bounded evidence units preserve adjacent short-sentence context", async () => {
    const packet = await createGroundedExtractionPacket({ text: "They confess. They kiss, and their mutual romantic relationship affects the next decision." });
    const units = await buildGroundedEvidenceUnits({ packet, maxUnits: 64 });
    expect(units.eligibleUnits.some((unit) => unit.text.includes("They confess.") && unit.text.includes("They kiss"))).toBe(true);
  });

  it("unrelated affection wording does not become a romance lexical hit", () => {
    expect(scorePassageLexicalRelevance({ text: "The researcher describes a lifelong love of science and careful laboratory work.", aspectId: "romance" })).toEqual({ score: 0, matchedTerms: [] });
  });

  it("real-page-shaped supplied evidence produces citation-bound significant support without title rules", async () => {
    const packet = await createGroundedExtractionPacket({
      title: "Generic serialized work",
      text: "The opening establishes a scientific conflict and several difficult choices.\n\nTwo central characters later recognize mutual romantic feelings. They kiss, and the relationship affects a decisive action in the main plot.\n\nThe conclusion resolves the scientific conflict.",
    });
    const request = await createGroundedExtractionRequest({ packet });
    const adapter: GroundedExtractionProviderPort = {
      providerId: "groq",
      async extract(input) {
        const unit = input.modelInput.evidenceUnits.find((item) => item.text.includes("mutual romantic feelings"));
        if (!unit) throw new Error("fixture_relevant_unit_missing");
        return { status: "success", providerId: "groq", modelId: input.model, output: { version: 1, assessments: [{ passageId: unit.passageId, finding: "supports_presence", level: "significant", confidence: "high", evidenceUnitIds: [unit.unitId], basis: "affects_character_decisions" }] }, telemetry: { durationMs: 1, retryCount: 0, rateLimitCount: 0, responseBytes: 1 }, warnings: [] };
      },
    };
    const result = await extractGroundedResearch(request, { environment: ENVIRONMENT, adapters: { groq: adapter } });
    expect(result).toMatchObject({ status: "claims_extracted", decision: { status: "supported", level: "significant", confidence: "medium" } });
    const adapterSource = readFileSync(join(process.cwd(), "features/recommendations/research/adapters/wikipedia/document-adapter.ts"), "utf8");
    expect(adapterSource).not.toMatch(/Steins;Gate|Q20590069/);
  });

  it("omission remains unknown and never synthesizes absence", async () => {
    const request = await createGroundedExtractionRequest({ packet: await createGroundedExtractionPacket({ text: SYNTHETIC_NO_ROMANCE }) });
    const adapter: GroundedExtractionProviderPort = {
      providerId: "groq",
      async extract(input) {
        return { status: "success", providerId: "groq", modelId: input.model, output: { version: 1, assessments: [{ passageId: input.modelInput.evidenceUnits[0].passageId, finding: "insufficient", level: null, confidence: "low", evidenceUnitIds: [], basis: "context_insufficient" }] }, telemetry: { durationMs: 1, retryCount: 0, rateLimitCount: 0, responseBytes: 1 }, warnings: [] };
      },
    };
    const result = await extractGroundedResearch(request, { environment: ENVIRONMENT, adapters: { groq: adapter } });
    expect(result).toMatchObject({ status: "no_claims_extracted", claims: [], decision: { status: "unknown" } });
  });
});
