import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { resolveExactWikidataIdentity } from "@/features/recommendations/research/adapters/wikidata/identity-resolver";
import { isMeaningfulWikimediaUserAgent } from "@/features/recommendations/research/network/environment";
import { SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";

const USER_AGENT = process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT;
const LIVE = process.env.D7_RESEARCH_LIVE_SMOKE === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && isMeaningfulWikimediaUserAgent(USER_AGENT);

describe.skipIf(!LIVE)("D7-R2A conditional Wikimedia live smoke", () => {
  it("Steins;Gate AniList exact identity'den revision-bound bounded direct document alır", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const result = await researchDirectWikimediaSource({
      identity, versionScope: createResearchVersionScope({ identity, scopeKind: "work" }),
      httpClient: new SecureResearchHttpClientImpl(), environment: process.env,
    });
    expect(result.status, `Controlled Wikimedia live failure: ${result.status} ${result.warnings.join(",")}`).toBe("document_ready");
    expect(result.documents[0]).toMatchObject({ sourceId: "wikipedia", retention: "transient_only" });
    expect(result.documents[0].boundedText.length).toBeGreaterThan(0);
    expect(result.documents[0].boundedText.length).toBeLessThanOrEqual(24_000);
    expect(result.documents[0].contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.citations[0].revisionId).toBe(result.documents[0].revisionId);
  });

  it("IMDb exact property lookup yapar; title search kullanmaz", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "omdb", primaryExternalId: "tt0137523", mediaType: "movie", secondaryIds: [{ kind: "imdb", externalId: "tt0137523" }] });
    const client = new SecureResearchHttpClientImpl();
    const result = await resolveExactWikidataIdentity({
      identity, versionScope: createResearchVersionScope({ identity, scopeKind: "work" }),
      httpClient: client, userAgent: USER_AGENT as string,
    });
    expect(result.status, `Controlled IMDb Wikidata failure: ${result.status} ${result.warnings.join(",")}`).toBe("verified");
    if (result.status === "verified") expect(result.identity.matchedPropertyId).toBe("P345");
  });

  it("olmayan exact AniList ID için not-found döner ve fuzzy fallback yapmaz", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "999999999999999999", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "999999999999999999" }] });
    const result = await resolveExactWikidataIdentity({
      identity, versionScope: createResearchVersionScope({ identity, scopeKind: "work" }),
      httpClient: new SecureResearchHttpClientImpl(), userAgent: USER_AGENT as string,
    });
    expect(result.status, `Controlled no-result failure: ${result.status} ${result.warnings.join(",")}`).toBe("identity_not_found");
  });
});
