import { afterEach, describe, expect, it, vi } from "vitest";
import { runSemanticVerifier } from "@/features/recommendations/evidence";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import type { CandidateProviderEvidenceSnapshot } from "@/features/recommendations/providers/types";

const snapshot: CandidateProviderEvidenceSnapshot = {
  schemaVersion: 1,
  candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: "tmdb", primaryExternalId: "55", mediaType: "movie" }),
  objectiveMetadata: { mediaType: "movie", genres: ["Fantasy"] }, rawEvidenceClaims: [], providerCoverage: { tmdb: "available" }, missingFields: [], fetchedAt: "2026-08-04T00:00:00.000Z", cacheStatus: "miss", warnings: [],
};

afterEach(() => vi.unstubAllEnvs());

describe("D6-3 semantic verifier modes", () => {
  it("structured_only modunda fetch yapmaz", async () => {
    const fetchImpl = vi.fn();
    const result = await runSemanticVerifier({ mode: "structured_only", snapshots: new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]), fetchImpl: fetchImpl as typeof fetch });
    expect(result).toMatchObject({ status: "structured_only", effectiveMode: "structured_only" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("local endpoint yoksa hata yerine unavailable ve structured fallback bildirir", async () => {
    const result = await runSemanticVerifier({ mode: "local_enhanced", snapshots: new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]) });
    expect(result).toMatchObject({ status: "unavailable", effectiveMode: "structured_only" });
  });

  it("verifier JSON contract'ını doğrular ve yalnız public candidate metadata yollar", async () => {
    vi.stubEnv("AI_LOCAL_SEMANTIC_VERIFIER_URL", "http://local-verifier/verify");
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(JSON.stringify(body)).not.toContain("personalNotes");
      expect(body.candidate.identity.primaryExternalId).toBe("55");
      return new Response(JSON.stringify({ claims: [{ aspectId: "fantasy", score: 0.7, confidence: "medium", explanation: "Synopsis fantasy world evidence." }, { aspectId: "not_real", score: 9, confidence: "high" }] }), { status: 200 });
    });
    const result = await runSemanticVerifier({ mode: "local_enhanced", snapshots: new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]), fetchImpl: fetchImpl as typeof fetch });
    expect(result.status).toBe("available");
    expect(result.evidenceByCandidateKey.get(snapshot.candidateIdentity.canonicalKey)?.supporting.fantasy).toHaveLength(1);
  });
});
