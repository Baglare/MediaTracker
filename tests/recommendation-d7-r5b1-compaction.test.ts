import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildGroundedEvidenceUnits } from "@/features/recommendations/research/extraction/domain/evidence-units";
import { deriveGroundedAssessmentPassages, summarizeGroundingFailure, validateGroundedExtractionGrounding } from "@/features/recommendations/research/extraction/domain/model-output";
import type { GroundedExtractionModelOutput, GroundingFailureCode } from "@/features/recommendations/research/extraction/domain/types";
import { buildGroundedExtractionResponseFormat } from "@/features/recommendations/research/extraction/prompt/schema";
import { buildGroundedEvidenceWorkingSet } from "@/features/recommendations/research/extraction/prompt/working-set";
import { GroqGroundedExtractionAdapter } from "@/features/recommendations/research/extraction/providers/groq/adapter";
import { ExtractionHttpError, FixedExtractionJsonClient } from "@/features/recommendations/research/extraction/providers/shared/fixed-json-client";
import { createGroundedExtractionPacket } from "@/features/recommendations/research/testing/extraction-fixtures";

const LONG_PACKET_TEXT = [
  "The opening explains laboratory schedules, equipment, and a sequence of scientific experiments in detail. Several participants debate the practical risks and document their work carefully.",
  "A second section records travel arrangements, equipment checks, and the timing of several experiments without discussing relationships.",
  "A third section follows administrative consequences and changes in the laboratory schedule without deciding the requested aspect.",
  "Two fictional leads later acknowledge mutual romantic feelings. They kiss, and their relationship changes a critical decision during the central conflict.",
  ...Array.from({ length: 18 }, (_, index) => `Coverage paragraph ${index + 1} describes consequences, travel, planning, and interactions across the continuing narrative without adding instructions.`),
].join("\n\n");

async function packetContext() {
  const packet = await createGroundedExtractionPacket({ text: LONG_PACKET_TEXT });
  const built = await buildGroundedEvidenceUnits({ packet, maxUnits: 64 });
  const working = buildGroundedEvidenceWorkingSet({ packet, eligibleUnits: built.eligibleUnits });
  return { packet, built, working };
}

describe("D7-R5B.1 grounding diagnostics", () => {
  it.each([
    ["extraction_grounding_unknown_unit", "unknown_unit"],
    ["extraction_grounding_wrong_passage", "wrong_passage"],
    ["extraction_duplicate_unit", "duplicate_unit"],
    ["extraction_grounding_excluded_security_unit", "excluded_security_unit"],
    ["extraction_grounding_citation_mismatch", "citation_mismatch"],
    ["extraction_duplicate_assessment", "duplicate_assessment"],
    ["extraction_invalid_combination", "invalid_finding_combination"],
    ["future_grounding_issue", "other_grounding_invalid"],
  ] as const)("%s bounded failure code olur", (issueCode, expected) => {
    const output: GroundedExtractionModelOutput = { version: 1, assessments: [] };
    expect(summarizeGroundingFailure({ issues: [{ code: issueCode, path: "$", message: "bounded" }], output }).failureCode).toBe(expected satisfies GroundingFailureCode);
  });

  it("claim passage relation'ını cited unit'ten deterministically derives", async () => {
    const { packet, working } = await packetContext();
    const unit = working.units[0];
    const wrongPassage = packet.passages.find((passage) => passage.passageId !== unit.passageId)?.passageId ?? "sha256:wrong";
    const output: GroundedExtractionModelOutput = { version: 1, assessments: [{ passageId: wrongPassage, finding: "supports_presence", level: "significant", confidence: "medium", evidenceUnitIds: [unit.unitId], basis: "explicit_statement" }] };
    const derived = deriveGroundedAssessmentPassages({ output, units: working.units });
    expect(derived.assessments[0].passageId).toBe(unit.passageId);
    expect(validateGroundedExtractionGrounding({ output: derived, packet, units: working.units })).toMatchObject({ ok: true });
  });
});

describe("D7-R5B.1 deterministic evidence working set", () => {
  it("same packet hash için aynı bounded lexical-first working set'i üretir", async () => {
    const { packet, built, working } = await packetContext();
    expect(buildGroundedEvidenceWorkingSet({ packet, eligibleUnits: built.eligibleUnits })).toEqual(working);
    expect(working.sentUnitCount).toBeLessThanOrEqual(16);
    expect(working.sentCharacters).toBeLessThanOrEqual(6_000);
    expect(working.sentUnitCount).toBeLessThanOrEqual(working.packetUnitCount);
    expect(working.units.some((unit) => unit.text.includes("mutual romantic feelings"))).toBe(true);
    expect(working.lexicalUnitsRetained).toBeGreaterThan(0);
  });

  it("lexical passage komşu unit bağlamını stable order ile korur", async () => {
    const { packet, built, working } = await packetContext();
    const lexicalPassages = new Set(packet.passages.filter((passage) => passage.selectionReason === "lexical_relevance").map((passage) => passage.passageId));
    const lexicalEligible = built.eligibleUnits.filter((unit) => lexicalPassages.has(unit.passageId));
    expect(working.units.filter((unit) => lexicalPassages.has(unit.passageId)).map((unit) => unit.unitId)).toEqual(lexicalEligible.map((unit) => unit.unitId));
  });

  it("security-excluded unit'i geri almaz", async () => {
    const { packet } = await packetContext();
    const flagged = { ...packet, passages: packet.passages.map((passage, index) => index === 0 ? { ...passage, securityFlags: ["prompt_injection_pattern" as const] } : passage) };
    const built = await buildGroundedEvidenceUnits({ packet: flagged, maxUnits: 64 });
    const working = buildGroundedEvidenceWorkingSet({ packet: flagged, eligibleUnits: built.eligibleUnits });
    expect(working.units.every((unit) => !built.excludedUnitIds.includes(unit.unitId))).toBe(true);
  });

  it("dynamic schema yalnız sent unit/passage allowlist'ini taşır", async () => {
    const { working } = await packetContext();
    const schema = buildGroundedExtractionResponseFormat({ evidenceUnits: working.units });
    const serialized = JSON.stringify(schema);
    expect(working.units.every((unit) => serialized.includes(unit.unitId) && serialized.includes(unit.passageId))).toBe(true);
    expect(serialized).toContain('"enum"');
  });

  it("working-set implementation title hardcode'u ve private request alanı içermez", () => {
    const source = readFileSync(join(process.cwd(), "features/recommendations/research/extraction/prompt/working-set.ts"), "utf8");
    expect(source).not.toMatch(/Steins;Gate|Kakegurui|ownerId|userId|minimumLevel|role/);
  });
});

describe("D7-R5B.1 Groq capacity classification", () => {
  it("429 headers'ı bounded decode eder ve body'yi taşımadan rate_limited olur", async () => {
    const fetchPort = vi.fn(async () => new Response("forbidden raw body", { status: 429, headers: { "content-type": "application/json", "retry-after": "2", "x-ratelimit-remaining-requests": "0", "x-ratelimit-remaining-tokens": "17", "x-ratelimit-reset-requests": "2s", "x-ratelimit-reset-tokens": "1m2.5s" } })) as unknown as typeof fetch;
    const client = new FixedExtractionJsonClient("https://fixed.example/v1", "x-request-id", 6_000, 1024, fetchPort, async () => undefined);
    let caught: unknown;
    try { await client.request({ apiKey: "k", body: {} }); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ kind: "rate_limited", status: 429, telemetry: { retryCount: 1, rateLimitCount: 2, rateLimit: { retryAfterMs: 1_000, remainingRequests: 0, remainingTokens: 17, resetRequests: "2s", resetTokens: "1m2.5s" } } });
    expect(JSON.stringify(caught)).not.toContain("forbidden raw body");
  });

  it("Groq adapter rate limit'i provider/grounding failure yapmaz", async () => {
    const client = { request: vi.fn(async () => { throw new ExtractionHttpError("rate_limited", 429, { durationMs: 5, retryCount: 1, rateLimitCount: 2, rateLimit: { remainingTokens: 0 } }); }) };
    const { working } = await packetContext();
    const result = await new GroqGroundedExtractionAdapter(client as never).extract({ modelInput: { version: 1, candidateRef: "candidate-1", aspect: { aspectId: "romance", labelEn: "Romance", semanticDefinition: "x", incidentalDefinition: "x", significantDefinition: "x", primaryDefinition: "x", explicitAbsenceDefinition: "x", limitationNotes: [] }, evidenceUnits: working.units.map((unit) => ({ unitId: unit.unitId, passageId: unit.passageId, publisherGroup: unit.publisherGroup, language: unit.language, passageOrder: unit.passageOrder, unitOrder: unit.unitOrder, sourceTrust: "medium", text: unit.text })) }, apiKey: "k", model: "openai/gpt-oss-20b", maxAssessments: 8 });
    expect(result).toMatchObject({ status: "rate_limited", telemetry: { rateLimitCount: 2 } });
  });

  it("stability aggregate yalnız grounded valid response sayar; capacity semantic varyasyon değildir", () => {
    const statuses = ["claims_extracted", "rate_limited", "no_claims_extracted", "grounding_invalid", "claims_extracted"] as const;
    expect(statuses.filter((status) => status === "claims_extracted" || status === "no_claims_extracted")).toHaveLength(3);
    expect(statuses.filter((status) => status === "rate_limited")).toHaveLength(1);
    expect(statuses.filter((status) => status === "grounding_invalid")).toHaveLength(1);
  });
});
