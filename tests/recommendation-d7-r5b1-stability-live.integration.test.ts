import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { acquireResearchSources } from "@/features/recommendations/research/acquisition/orchestrator";
import { RESEARCH_ACQUISITION_POLICY_VERSION } from "@/features/recommendations/research/acquisition/types";
import { RESEARCH_POLICY_VERSION } from "@/features/recommendations/research/cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "@/features/recommendations/research/domain/source-registry";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import type { GroundedExtractionRateLimitTelemetry, GroundedExtractionResult } from "@/features/recommendations/research/extraction/domain/types";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import { SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";
import { createGroundedExtractionPacket, createGroundedExtractionRequest } from "@/features/recommendations/research/testing/extraction-fixtures";

const LIVE = process.env.D7_R5B1_EXTRACTION_STABILITY_LIVE_SMOKE === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && process.env.D7_RESEARCH_LIVE_SMOKE === "1"
  && process.env.D7_RESEARCH_EXTRACTION_PROVIDER === "groq"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_ENABLED === "1"
  && process.env.GROQ_RESEARCH_EXTRACTION_MODEL === "openai/gpt-oss-20b"
  && Boolean(process.env.GROQ_API_KEY)
  && Boolean(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

function durationBucket(ms: number) { return ms < 1_000 ? "under_1s" : ms < 3_000 ? "1_to_3s" : ms < 6_000 ? "3_to_6s" : "over_6s"; }
function resetMs(value: string | undefined) {
  if (!value) return 0;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(value);
  return match ? Number(match[1] ?? 0) * 3_600_000 + Number(match[2] ?? 0) * 60_000 + Number(match[3] ?? 0) * 1_000 : /^\d+ms$/.test(value) ? Number(value.slice(0, -2)) : 0;
}
function boundedWait(telemetry: GroundedExtractionRateLimitTelemetry | undefined, remainingWallMs: number) {
  const requested = Math.max(telemetry?.retryAfterMs ?? 0, resetMs(telemetry?.resetTokens), resetMs(telemetry?.resetRequests));
  return Math.min(30_000, Math.max(0, remainingWallMs - 1_000), requested);
}

async function collectValidRuns(requestFactory: (attempt: number) => Promise<Parameters<typeof extractGroundedResearch>[0]>) {
  const started = Date.now();
  const results: GroundedExtractionResult[] = [];
  let totalAttempts = 0;
  let validModelResponses = 0;
  while (totalAttempts < 5 && validModelResponses < 3 && Date.now() - started < 120_000) {
    const result = await extractGroundedResearch(await requestFactory(totalAttempts), { environment: process.env });
    results.push(result); totalAttempts += 1;
    if (result.status === "claims_extracted" || result.status === "no_claims_extracted") validModelResponses += 1;
    if (result.status === "rate_limited" && validModelResponses < 3) {
      const waitMs = boundedWait(result.telemetry.rateLimit, 120_000 - (Date.now() - started));
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return { results, totalAttempts, validModelResponses, wallMs: Date.now() - started, capacityBlocked: validModelResponses < 3 };
}

function summary(run: Awaited<ReturnType<typeof collectValidRuns>>) {
  const valid = run.results.filter((result) => result.status === "claims_extracted" || result.status === "no_claims_extracted");
  return {
    totalAttempts: run.totalAttempts, validModelResponses: run.validModelResponses, capacityBlocked: run.capacityBlocked,
    supported: valid.filter((result) => result.status === "claims_extracted" && result.decision?.status === "supported").length,
    noClaims: valid.filter((result) => result.status === "no_claims_extracted").length,
    groundingInvalid: run.results.filter((result) => result.status === "grounding_invalid").length,
    outputInvalid: run.results.filter((result) => result.status === "output_invalid").length,
    rateLimited: run.results.filter((result) => result.status === "rate_limited").length,
    providerUnavailable: run.results.filter((result) => result.status === "provider_unavailable").length,
    timeout: run.results.filter((result) => result.status === "budget_exhausted").length,
    refusal: run.results.filter((result) => result.status === "refusal").length,
    warnings: [...new Set(run.results.flatMap((result) => result.warnings))].join(",") || "none",
    levels: valid.map((result) => result.decision?.level ?? "none").join(",") || "none",
    failureCodes: [...new Set(run.results.map((result) => result.telemetry.groundingFailureCode).filter(Boolean))].join(",") || "none",
    durations: run.results.map((result) => durationBucket(result.telemetry.durationMs)).join(","),
    packetUnits: run.results[0]?.telemetry.evidenceUnitCount ?? 0, sentUnits: run.results[0]?.telemetry.sentEvidenceUnitCount ?? 0,
    packetCharacters: run.results[0]?.telemetry.packetEvidenceCharacters ?? 0, sentCharacters: run.results[0]?.telemetry.sentEvidenceCharacters ?? 0,
    lexicalRetained: run.results[0]?.telemetry.lexicalUnitsRetained ?? 0, contextRetained: run.results[0]?.telemetry.contextUnitsRetained ?? 0,
  };
}

describe.skipIf(!LIVE)("D7-R5B.1 conditional compacted Groq stability live", () => {
  it("collects three grounded-valid synthetic responses", async () => {
    const packet = await createGroundedExtractionPacket();
    const run = await collectValidRuns((attempt) => createGroundedExtractionRequest({ packet, requestId: `d7-r5b1-synthetic-${attempt}` }));
    const result = summary(run);
    console.info(`[D7-R5B.1 live] synthetic attempts=${result.totalAttempts} valid=${result.validModelResponses} support=${result.supported} no_claims=${result.noClaims} grounding_invalid=${result.groundingInvalid} output_invalid=${result.outputInvalid} rate_limited=${result.rateLimited} unavailable=${result.providerUnavailable} timeout=${result.timeout} refusal=${result.refusal} warnings=${result.warnings} capacity=${result.capacityBlocked ? "blocked" : "ready"} duration_buckets=${result.durations}`);
    expect(result).toMatchObject({ validModelResponses: 3, supported: 3, groundingInvalid: 0, outputInvalid: 0, capacityBlocked: false });
  }, 125_000);

  it("collects three grounded-valid responses from one real Steins;Gate packet", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const versionScope = createResearchVersionScope({ identity, scopeKind: "work" });
    const httpClient = new SecureResearchHttpClientImpl();
    const direct = await researchDirectWikimediaSource({ identity, versionScope, httpClient, environment: process.env });
    expect(direct.status).toBe("document_ready");
    if (direct.status !== "document_ready" || !direct.wikimediaIdentity) throw new Error("r5b1_direct_unavailable");
    const acquired = await acquireResearchSources({ version: 1, candidateIdentity: identity, versionScope, wikimediaIdentity: direct.wikimediaIdentity, aspectId: "romance", role: "must", minimumLevel: "significant", directDocuments: [{ document: direct.documents[0], citation: direct.citations[0] }], discoveredSources: [], maxDocuments: 2, maxPassages: 8, maxPacketCharacters: 10_000, requestId: "d7-r5b1-acquire", researchPolicyVersion: RESEARCH_POLICY_VERSION, sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION }, { httpClient, environment: process.env });
    expect(acquired.status).toBe("packet_ready");
    if (acquired.status !== "packet_ready") throw new Error("r5b1_packet_unavailable");
    const run = await collectValidRuns((attempt) => createGroundedExtractionRequest({ packet: acquired.packet, requestId: `d7-r5b1-steins-${attempt}` }));
    const result = summary(run);
    console.info(`[D7-R5B.1 live] steins qid=${direct.wikimediaIdentity.wikidataEntityId} revision=${direct.documents[0].revisionId} attempts=${result.totalAttempts} valid=${result.validModelResponses} support=${result.supported} no_claims=${result.noClaims} grounding_invalid=${result.groundingInvalid} output_invalid=${result.outputInvalid} rate_limited=${result.rateLimited} unavailable=${result.providerUnavailable} timeout=${result.timeout} refusal=${result.refusal} warnings=${result.warnings} failure_codes=${result.failureCodes} capacity=${result.capacityBlocked ? "blocked" : "ready"} levels=${result.levels} duration_buckets=${result.durations} packet_units=${result.packetUnits} sent_units=${result.sentUnits} packet_chars=${result.packetCharacters} sent_chars=${result.sentCharacters} lexical_retained=${result.lexicalRetained} context_retained=${result.contextRetained}`);
    expect(result).toMatchObject({ validModelResponses: 3, groundingInvalid: 0, outputInvalid: 0, capacityBlocked: false });
  }, 125_000);
});
