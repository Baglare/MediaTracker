import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { acquireResearchSources } from "@/features/recommendations/research/acquisition/orchestrator";
import { RESEARCH_ACQUISITION_POLICY_VERSION } from "@/features/recommendations/research/acquisition/types";
import { RESEARCH_POLICY_VERSION } from "@/features/recommendations/research/cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "@/features/recommendations/research/domain/source-registry";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { buildGroundedEvidenceUnits } from "@/features/recommendations/research/extraction/domain/evidence-units";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import { SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";
import { createGroundedExtractionPacket, createGroundedExtractionRequest } from "@/features/recommendations/research/testing/extraction-fixtures";

const LIVE = process.env.D7_R5B_STABILITY_LIVE_SMOKE === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && process.env.D7_RESEARCH_LIVE_SMOKE === "1"
  && process.env.D7_RESEARCH_EXTRACTION_PROVIDER === "groq"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_ENABLED === "1"
  && process.env.GROQ_RESEARCH_EXTRACTION_MODEL === "openai/gpt-oss-20b"
  && Boolean(process.env.GROQ_API_KEY)
  && Boolean(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

type ExtractionRun = Awaited<ReturnType<typeof extractGroundedResearch>>;

function durationBucket(durationMs: number) {
  if (durationMs < 1_000) return "under_1s";
  if (durationMs < 3_000) return "1_to_3s";
  if (durationMs < 6_000) return "3_to_6s";
  return "over_6s";
}

function validRun(result: ExtractionRun) {
  return result.status === "claims_extracted" || result.status === "no_claims_extracted";
}

function runSummary(results: readonly ExtractionRun[]) {
  return {
    schemaValid: results.filter(validRun).length,
    groundingValid: results.filter(validRun).length,
    support: results.filter((result) => result.status === "claims_extracted" && result.decision?.status === "supported").length,
    invalid: results.filter((result) => result.status === "output_invalid" || result.status === "grounding_invalid").length,
    providerUnavailable: results.filter((result) => result.status === "provider_unavailable").length,
    rateLimits: results.filter((result) => result.status === "rate_limited").length,
    warnings: [...new Set(results.flatMap((result) => result.warnings))].join(",") || "none",
    statuses: results.map((result) => result.status).join(","),
    levels: results.map((result) => result.decision?.level ?? "none").join(","),
    durations: results.map((result) => durationBucket(result.telemetry.durationMs)).join(","),
  };
}

async function acquirePacket(input: {
  identity: ReturnType<typeof createVerifiedCandidateIdentity>;
  aspectId: "romance" | "character_driven";
  httpClient: SecureResearchHttpClientImpl;
  requestId: string;
}) {
  const versionScope = createResearchVersionScope({ identity: input.identity, scopeKind: "work" });
  const direct = await researchDirectWikimediaSource({ identity: input.identity, versionScope, httpClient: input.httpClient, environment: process.env });
  if (direct.status !== "document_ready" || !direct.wikimediaIdentity) return { direct } as const;
  const acquired = await acquireResearchSources({ version: 1, candidateIdentity: input.identity, versionScope, wikimediaIdentity: direct.wikimediaIdentity, aspectId: input.aspectId, role: "must", minimumLevel: "significant", directDocuments: [{ document: direct.documents[0], citation: direct.citations[0] }], discoveredSources: [], maxDocuments: 2, maxPassages: 8, maxPacketCharacters: 10_000, requestId: input.requestId, researchPolicyVersion: RESEARCH_POLICY_VERSION, sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION }, { httpClient: input.httpClient, environment: process.env });
  return { direct, acquired } as const;
}

describe.skipIf(!LIVE)("D7-R5B conditional coverage and Groq stability live", () => {
  it("same synthetic packet remains strict/grounding-valid across three runs", async () => {
    const syntheticPacket = await createGroundedExtractionPacket();
    const syntheticResults: ExtractionRun[] = [];
    for (let index = 0; index < 3; index += 1) {
      syntheticResults.push(await extractGroundedResearch(await createGroundedExtractionRequest({ packet: syntheticPacket, requestId: `d7-r5b-synthetic-${index}` }), { environment: process.env }));
    }

    const synthetic = runSummary(syntheticResults);
    console.info(`[D7-R5B live] synthetic runs=3 schema_valid=${synthetic.schemaValid} grounding_valid=${synthetic.groundingValid} support=${synthetic.support} invalid=${synthetic.invalid} unavailable=${synthetic.providerUnavailable} rate_limits=${synthetic.rateLimits} statuses=${synthetic.statuses} warnings=${synthetic.warnings} duration_buckets=${synthetic.durations}`);
    expect(synthetic).toMatchObject({ schemaValid: 3, groundingValid: 3, support: 3, invalid: 0 });
  }, 30_000);

  it("same Steins;Gate packet remains strict/grounding-valid across three runs", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const httpClient = new SecureResearchHttpClientImpl();
    const prepared = await acquirePacket({ identity, aspectId: "romance", httpClient, requestId: "d7-r5b-steins-packet" });
    expect(prepared.direct.status).toBe("document_ready");
    if (!("acquired" in prepared) || prepared.acquired.status !== "packet_ready" || !prepared.direct.wikimediaIdentity) throw new Error("r5b_steins_packet_unavailable");
    const steinsUnits = await buildGroundedEvidenceUnits({ packet: prepared.acquired.packet, maxUnits: 64 });
    const steinsResults: ExtractionRun[] = [];
    for (let index = 0; index < 3; index += 1) {
      steinsResults.push(await extractGroundedResearch(await createGroundedExtractionRequest({ packet: prepared.acquired.packet, requestId: `d7-r5b-steins-${index}` }), { environment: process.env }));
    }

    const steins = runSummary(steinsResults);
    console.info(`[D7-R5B live] steins qid=${prepared.direct.wikimediaIdentity.wikidataEntityId} revision=${prepared.direct.documents[0].revisionId} runs=3 schema_valid=${steins.schemaValid} grounding_valid=${steins.groundingValid} support=${steins.support} invalid=${steins.invalid} unavailable=${steins.providerUnavailable} rate_limits=${steins.rateLimits} statuses=${steins.statuses} warnings=${steins.warnings} levels=${steins.levels} duration_buckets=${steins.durations} passages=${prepared.acquired.packet.passages.length} units=${steinsUnits.eligibleUnits.length}`);
    expect(steins).toMatchObject({ schemaValid: 3, groundingValid: 3, invalid: 0 });
    expect(steinsResults.every((result) => !Object.hasOwn(result, "rawResponse") && !Object.hasOwn(result, "reasoning"))).toBe(true);
  }, 70_000);

  it("tracked exact identities produce bounded aggregate Wikimedia coverage", async () => {
    const cases = [
      { id: "steins", identity: createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] }), aspectId: "romance" as const },
      { id: "imdb_fixture", identity: createVerifiedCandidateIdentity({ primaryProvider: "omdb", primaryExternalId: "tt0137523", mediaType: "movie", secondaryIds: [{ kind: "imdb", externalId: "tt0137523" }] }), aspectId: "character_driven" as const },
    ];
    const rows: Array<{ id: string; exact: boolean; page: boolean; status: string; byteBucket: string; characterBucket: string; passages: number; units: number }> = [];
    for (const item of cases) {
      const prepared = await acquirePacket({ identity: item.identity, aspectId: item.aspectId, httpClient: new SecureResearchHttpClientImpl(), requestId: `d7-r5b-coverage-${item.id}` });
      const direct = prepared.direct;
      let passages = 0;
      let units = 0;
      if ("acquired" in prepared && prepared.acquired.status === "packet_ready") {
        passages = prepared.acquired.packet.passages.length;
        units = (await buildGroundedEvidenceUnits({ packet: prepared.acquired.packet, maxUnits: 64 })).eligibleUnits.length;
      }
      const text = direct.status === "document_ready" ? direct.documents[0].boundedText : "";
      const bytes = text ? Buffer.byteLength(text, "utf8") : 0;
      const oversized = direct.warnings.some((warning) => warning.includes("oversized"));
      rows.push({ id: item.id, exact: Boolean(direct.wikimediaIdentity), page: direct.telemetry.revisionFetched, status: direct.status, byteBucket: oversized ? "over_24kb" : bytes < 12_000 ? "under_12kb" : "12_to_24kb", characterBucket: oversized ? "over_24k" : text.length < 12_000 ? "under_12k" : "12k_to_24k", passages, units });
    }
    const oversized = rows.filter((row) => row.byteBucket === "over_24kb").length;
    console.info(`[D7-R5B live] coverage cases=${rows.length} exact=${rows.filter((row) => row.exact).length} page_available=${rows.filter((row) => row.page).length} ready=${rows.filter((row) => row.status === "document_ready").length} oversized=${oversized} unavailable=${rows.filter((row) => !["document_ready", "security_rejected"].includes(row.status)).length} byte_buckets=${rows.map((row) => `${row.id}:${row.byteBucket}`).join(",")} character_buckets=${rows.map((row) => `${row.id}:${row.characterBucket}`).join(",")} passages=${rows.reduce((total, row) => total + row.passages, 0)} units=${rows.reduce((total, row) => total + row.units, 0)}`);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.exact)).toBe(true);
  }, 45_000);
});
