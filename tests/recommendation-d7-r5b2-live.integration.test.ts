import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { RESEARCH_ACQUISITION_POLICY_VERSION } from "@/features/recommendations/research/acquisition/types";
import { acquireResearchSources } from "@/features/recommendations/research/acquisition/orchestrator";
import { RESEARCH_POLICY_VERSION } from "@/features/recommendations/research/cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "@/features/recommendations/research/domain/source-registry";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { buildGroundedEvidenceUnits } from "@/features/recommendations/research/extraction/domain/evidence-units";
import { buildGroundedEvidenceWorkingSet } from "@/features/recommendations/research/extraction/prompt/working-set";
import { SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES } from "@/features/recommendations/research/network/response-limits";
import type { SecureResearchHttpClient, SecureResearchHttpRequest, SecureResearchHttpResponse } from "@/features/recommendations/research/network/types";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";

const LIVE = process.env.D7_R5B2_DOCUMENT_LIVE_SMOKE === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && Boolean(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

class RecordingResearchHttpClient implements SecureResearchHttpClient {
  private readonly inner = new SecureResearchHttpClientImpl();
  readonly extractResponseBytes: number[] = [];

  async request(input: SecureResearchHttpRequest): Promise<SecureResearchHttpResponse> {
    const response = await this.inner.request(input);
    if ((new URL(input.url).searchParams.get("prop") ?? "").split("|").includes("extracts")) this.extractResponseBytes.push(response.bytesRead);
    return response;
  }

  snapshotTelemetry() {
    return this.inner.snapshotTelemetry();
  }
}

function bucket(value: number, first: number, second: number): string {
  if (value <= first) return `at_or_under_${Math.round(first / 1024)}k`;
  if (value <= second) return `${Math.round(first / 1024)}k_to_${Math.round(second / 1024)}k`;
  return `over_${Math.round(second / 1024)}k`;
}

describe.skipIf(!LIVE)("D7-R5B.2 conditional extended Wikipedia document live", () => {
  it("tracked exact identities keep full-document acquisition bounded", async () => {
    const cases = [
      { id: "steins", identity: createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] }), aspectId: "romance" as const },
      { id: "imdb_fixture", identity: createVerifiedCandidateIdentity({ primaryProvider: "omdb", primaryExternalId: "tt0137523", mediaType: "movie", secondaryIds: [{ kind: "imdb", externalId: "tt0137523" }] }), aspectId: "character_driven" as const },
    ];
    const rows: Array<{ id: string; status: string; responseBucket: string; extractBucket: string; normalizedBucket: string; packetCharacters: number; passages: number; sentUnits: number; sentCharacters: number; oversized: boolean }> = [];

    for (const item of cases) {
      const versionScope = createResearchVersionScope({ identity: item.identity, scopeKind: "work" });
      const httpClient = new RecordingResearchHttpClient();
      const direct = await researchDirectWikimediaSource({ identity: item.identity, versionScope, httpClient, environment: process.env });
      const oversized = direct.warnings.some((warning) => /oversized/.test(warning));
      if (direct.status !== "document_ready" || !direct.wikimediaIdentity) {
        rows.push({ id: item.id, status: direct.status, responseBucket: oversized ? "over_96k" : "unavailable", extractBucket: oversized ? "over_64k" : "unavailable", normalizedBucket: "unavailable", packetCharacters: 0, passages: 0, sentUnits: 0, sentCharacters: 0, oversized });
        continue;
      }
      const bytes = Buffer.byteLength(direct.documents[0].boundedText, "utf8");
      const acquired = await acquireResearchSources({
        version: 1, candidateIdentity: item.identity, versionScope, wikimediaIdentity: direct.wikimediaIdentity,
        aspectId: item.aspectId, role: "must", minimumLevel: "significant",
        directDocuments: [{ document: direct.documents[0], citation: direct.citations[0] }], discoveredSources: [],
        maxDocuments: 2, maxPassages: 8, maxPacketCharacters: 12_000,
        requestId: `d7-r5b2-${item.id}`, researchPolicyVersion: RESEARCH_POLICY_VERSION,
        sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION,
      }, { httpClient, environment: process.env });
      if (acquired.status !== "packet_ready") throw new Error(`d7_r5b2_packet_unavailable:${item.id}:${acquired.status}:${acquired.warnings.join(",")}`);
      const units = await buildGroundedEvidenceUnits({ packet: acquired.packet, maxUnits: 64 });
      const workingSet = buildGroundedEvidenceWorkingSet({ packet: acquired.packet, eligibleUnits: units.eligibleUnits });
      rows.push({
        id: item.id, status: direct.status,
        responseBucket: bucket(httpClient.extractResponseBytes.at(-1) ?? 0, 64 * 1024, 96 * 1024),
        extractBucket: bytes <= 24_000 ? "at_or_under_24k" : bytes <= WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES ? "24k_to_64k" : "over_64k",
        normalizedBucket: bucket(acquired.packet.documents[0].normalizedCharacterCount, 24_000, 64 * 1024),
        packetCharacters: acquired.packet.passages.reduce((total, passage) => total + passage.text.length, 0),
        passages: acquired.packet.passages.length, sentUnits: workingSet.sentUnitCount,
        sentCharacters: workingSet.sentCharacters, oversized,
      });
    }

    console.info(`[D7-R5B.2 live] cases=${rows.length} ready=${rows.filter((row) => row.status === "document_ready").length} oversized=${rows.filter((row) => row.oversized).length} response_buckets=${rows.map((row) => `${row.id}:${row.responseBucket}`).join(",")} extract_buckets=${rows.map((row) => `${row.id}:${row.extractBucket}`).join(",")} normalized_buckets=${rows.map((row) => `${row.id}:${row.normalizedBucket}`).join(",")} passages=${rows.map((row) => `${row.id}:${row.passages}`).join(",")} packet_chars=${rows.map((row) => `${row.id}:${row.packetCharacters}`).join(",")} sent_units=${rows.map((row) => `${row.id}:${row.sentUnits}`).join(",")} sent_chars=${rows.map((row) => `${row.id}:${row.sentCharacters}`).join(",")}`);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === "steins")).toMatchObject({ status: "document_ready", extractBucket: "at_or_under_24k", oversized: false });
    const imdb = rows.find((row) => row.id === "imdb_fixture");
    expect(imdb).toBeDefined();
    if (imdb?.extractBucket === "24k_to_64k") expect(imdb).toMatchObject({ status: "document_ready", oversized: false });
    else expect(imdb).toMatchObject({ oversized: true, packetCharacters: 0, passages: 0, sentUnits: 0 });
    for (const row of rows.filter((item) => item.status === "document_ready")) {
      expect(row.packetCharacters).toBeLessThanOrEqual(12_000);
      expect(row.passages).toBeLessThanOrEqual(8);
      expect(row.sentUnits).toBeLessThanOrEqual(16);
      expect(row.sentCharacters).toBeLessThanOrEqual(6_000);
    }
  }, 60_000);
});
