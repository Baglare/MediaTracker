import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildResearchEvidenceCacheKey } from "@/features/recommendations/research/cache/key";
import { validateResearchEvidenceCacheEntry } from "@/features/recommendations/research/cache/policy";
import type { GroundedExtractionProviderPort } from "@/features/recommendations/research/extraction/providers/port";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import { createGroundedExtractionPacket, createGroundedExtractionRequest } from "@/features/recommendations/research/testing/extraction-fixtures";

function environment(model = "openai/gpt-oss-20b"): NodeJS.ProcessEnv {
  return { D7_RESEARCH_EXTRACTION_PROVIDER: "groq", D7_GROQ_GROUNDED_EXTRACTION_ENABLED: "1", GROQ_API_KEY: "test-secret", GROQ_RESEARCH_EXTRACTION_MODEL: model };
}

function successfulAdapter(finding: "supports_presence" | "supports_explicit_absence" | "irrelevant" | "insufficient" = "supports_presence"): GroundedExtractionProviderPort {
  return {
    providerId: "groq",
    async extract(input) {
      const unit = input.modelInput.evidenceUnits[0];
      const assessment = finding === "supports_presence"
        ? { passageId: unit.passageId, finding, level: "significant" as const, confidence: "high" as const, evidenceUnitIds: [unit.unitId], basis: "affects_character_decisions" as const }
        : finding === "supports_explicit_absence"
          ? { passageId: unit.passageId, finding, level: null, confidence: "medium" as const, evidenceUnitIds: [unit.unitId], basis: "explicit_absence_statement" as const }
          : { passageId: unit.passageId, finding, level: null, confidence: "low" as const, evidenceUnitIds: [], basis: finding === "irrelevant" ? "unrelated_context" as const : "context_insufficient" as const };
      return { status: "success", providerId: "groq", modelId: input.model, output: { version: 1, assessments: [assessment] }, telemetry: { durationMs: 12, retryCount: 0, rateLimitCount: 0, responseBytes: 120 }, warnings: [] };
    },
  };
}

describe("D7-R3B extraction service", () => {
  it("validated observation'dan deterministic claim, decision and bounded provenance creates", async () => {
    const request = await createGroundedExtractionRequest();
    const result = await extractGroundedResearch(request, { environment: environment(), adapters: { groq: successfulAdapter() }, now: () => new Date("2026-08-09T12:00:00.000Z") });
    expect(result).toMatchObject({ status: "claims_extracted", providerId: "groq", modelId: "openai/gpt-oss-20b", decision: { status: "supported", level: "significant", confidence: "medium", independentSourceCount: 1 }, telemetry: { attemptedProviders: ["groq"], requestCount: 1, claimCount: 1 } });
    expect(result.claims[0]).toMatchObject({ polarity: "support", confidence: "medium", citationIds: [request.packet.citations[0].citationId], extractionMethod: "grounded_llm" });
    expect(result.provenance).toMatchObject({ providerId: "groq", packetContentHash: request.packet.packetContentHash, responseStatus: "validated" });
    expect(JSON.stringify(result.claims)).not.toContain(request.packet.passages[0].text);
  });

  it.each(["irrelevant", "insufficient"] as const)("%s produces no claim and passage_insufficient", async (finding) => {
    const result = await extractGroundedResearch(await createGroundedExtractionRequest(), { environment: environment(), adapters: { groq: successfulAdapter(finding) } });
    expect(result).toMatchObject({ status: "no_claims_extracted", claims: [], decision: { status: "unknown", reasonCode: "passage_insufficient" }, provenance: { responseStatus: "no_claims" } });
  });

  it("unknown evidence-unit output is rejected all-or-nothing", async () => {
    const adapter: GroundedExtractionProviderPort = { providerId: "groq", async extract(input) { const unit = input.modelInput.evidenceUnits[0]; return { status: "success", providerId: "groq", modelId: input.model, output: { version: 1, assessments: [{ passageId: unit.passageId, finding: "supports_presence", level: "significant", confidence: "high", evidenceUnitIds: ["sha256:unknown"], basis: "affects_plot" }] }, telemetry: { durationMs: 1, retryCount: 0, rateLimitCount: 0, responseBytes: 1 }, warnings: [] }; } };
    const result = await extractGroundedResearch(await createGroundedExtractionRequest(), { environment: environment(), adapters: { groq: adapter } });
    expect(result).toMatchObject({ status: "grounding_invalid", claims: [] });
    expect(result).not.toHaveProperty("decision");
  });

  it("disabled/missing config and unsupported model create no fake unknown evidence", async () => {
    const request = await createGroundedExtractionRequest();
    const disabled = await extractGroundedResearch(request, { environment: { D7_RESEARCH_EXTRACTION_PROVIDER: "disabled" } });
    const unsupported = await extractGroundedResearch(request, { environment: environment("groq/compound-mini") });
    expect(disabled).toMatchObject({ status: "disabled", claims: [] });
    expect(unsupported).toMatchObject({ status: "model_unsupported", claims: [], providerId: "groq" });
    expect(disabled).not.toHaveProperty("decision");
    expect(unsupported).not.toHaveProperty("decision");
  });

  it("same packet/aspect/provider/model call is coalesced", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const base = successfulAdapter();
    const adapter: GroundedExtractionProviderPort = { providerId: "groq", extract: vi.fn(async (input) => { await gate; return base.extract(input); }) };
    const request = await createGroundedExtractionRequest();
    const first = extractGroundedResearch(request, { environment: environment(), adapters: { groq: adapter } });
    const second = extractGroundedResearch(request, { environment: environment(), adapters: { groq: adapter } });
    release();
    const results = await Promise.all([first, second]);
    expect(adapter.extract).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.status)).toEqual(["claims_extracted", "claims_extracted"]);
    expect(results.some((result) => result.telemetry.coalescedCount === 1)).toBe(true);
  });

  it("global extraction concurrency never exceeds two", async () => {
    let active = 0; let peak = 0; let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let reportTwoStarted!: () => void;
    const twoStarted = new Promise<void>((resolve) => { reportTwoStarted = resolve; });
    const base = successfulAdapter();
    const adapter: GroundedExtractionProviderPort = { providerId: "groq", async extract(input) { active += 1; peak = Math.max(peak, active); if (active === 2) reportTwoStarted(); await gate; try { return await base.extract(input); } finally { active -= 1; } } };
    const requests = await Promise.all(["9101", "9102", "9103"].map(async (revisionId) => createGroundedExtractionRequest({ packet: await createGroundedExtractionPacket({ revisionId }) })));
    const operations = requests.map((request) => extractGroundedResearch(request, { environment: environment(), adapters: { groq: adapter } }));
    await twoStarted;
    expect(peak).toBe(2);
    release();
    await expect(Promise.all(operations)).resolves.toHaveLength(3);
    expect(peak).toBe(2);
  });
});

describe("D7-R3B persistence boundary", () => {
  it("final claims/citations/decision/provenance are cache-codec valid; raw extraction artifacts are rejected", async () => {
    const request = await createGroundedExtractionRequest();
    const result = await extractGroundedResearch(request, { environment: environment(), adapters: { groq: successfulAdapter() }, now: () => new Date("2026-08-09T12:00:00.000Z") });
    if (!result.decision || !result.provenance) throw new Error("fixture_result_incomplete");
    const entry = { key: buildResearchEvidenceCacheKey({ versionScope: request.packet.versionScope, aspectId: request.packet.aspectId, extractionPolicyVersion: request.extractorPolicyVersion }), decision: result.decision, claims: result.claims, citations: request.packet.citations, extractionProvenance: result.provenance, createdAt: result.decision.researchedAt, expiresAt: result.decision.expiresAt, sourceRevisionFingerprint: `${request.packet.citations[0].sourceId}:${request.packet.citations[0].revisionId}`, cacheStatus: "fresh" as const, warnings: [] };
    expect(validateResearchEvidenceCacheEntry(entry)).toMatchObject({ ok: true });
    for (const field of ["packet", "passages", "evidenceUnits", "modelInput", "modelOutput", "rawModelResponse", "reasoning"] as const) expect(validateResearchEvidenceCacheEntry({ ...entry, [field]: { text: "forbidden" } } as never)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_cache_transient_payload_forbidden" })]) });
    expect(validateResearchEvidenceCacheEntry({ ...entry, extractionProvenance: { ...result.provenance, rawModelResponse: "forbidden" } } as never)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "grounded_provenance_unknown_field" })]) });
  });
});
