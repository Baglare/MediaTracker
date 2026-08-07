import { describe, expect, it } from "vitest";
import {
  createResearchVersionScope,
  mapResearchDecisionToDeterministicSignal,
  planResearch,
  validateAspectResearchDecision,
} from "@/features/recommendations/research";
import { constraint, researchCandidate, researchClaim, researchDecision, researchIdentity, wikipediaCitation, workScope } from "./fixtures/recommendations-v2/grounded-research";

describe("D7-R1 grounded research acceptance fixtures", () => {
  it("Steins;Gate: yalnız unresolved romance job olur ve citation-bound significant claim must'ı karşılayabilir", () => {
    const identity = researchIdentity({ externalId: "9253" });
    const candidate = researchCandidate({ identity, scope: workScope(identity), constraints: [
      constraint({ aspectId: "sci_fi", currentStructuredDecision: "decisive_supported" }),
      constraint({ aspectId: "time_travel", currentStructuredDecision: "decisive_supported" }),
      constraint({ aspectId: "romance", currentStructuredDecision: "unknown" }),
    ] });
    expect(planResearch({ candidates: [candidate] }).jobs.map((job) => job.aspectId)).toEqual(["romance"]);
    const citation = wikipediaCitation({ canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate" });
    const claim = researchClaim({ aspectId: "romance" });
    const decision = researchDecision({ scope: candidate.versionScope, aspectId: "romance", status: "supported", level: "significant" });
    expect(validateAspectResearchDecision({ decision, claims: [claim], citations: [citation], identity })).toMatchObject({ ok: true });
    expect(mapResearchDecisionToDeterministicSignal({ decision, role: "must", minimumLevel: "significant" })).toMatchObject({ mustSatisfied: true, primaryEligible: true });
  });

  it("Kakegurui-like: no source unknown kalır; popularity must'ı geçiremez", () => {
    const candidate = researchCandidate({ constraints: [constraint({ aspectId: "romance" })] });
    expect(planResearch({ candidates: [candidate] }).jobs).toHaveLength(1);
    const decision = researchDecision({ scope: candidate.versionScope, aspectId: "romance", status: "unknown", reasonCode: "no_source_found" });
    expect(mapResearchDecisionToDeterministicSignal({ decision, role: "must", minimumLevel: "significant" })).toMatchObject({ mustSatisfied: false, primaryEligible: false, nearMatchEligible: true });
  });

  it("political intrigue: Politics partial centrality research significant/primary claim üretebilir", () => {
    const candidate = researchCandidate({ constraints: [constraint({ aspectId: "political_intrigue", currentStructuredDecision: "partial" })] });
    expect(planResearch({ candidates: [candidate] }).jobs).toMatchObject([{ aspectId: "political_intrigue" }]);
    const decision = researchDecision({ scope: candidate.versionScope, aspectId: "political_intrigue", level: "primary" });
    expect(mapResearchDecisionToDeterministicSignal({ decision, role: "must", minimumLevel: "significant" })).toMatchObject({ mustSatisfied: true });
  });

  it("love triangle avoid: presence reject; omission/no-source absent değildir", () => {
    const supported = researchDecision({ aspectId: "love_triangle", status: "supported", level: "significant" });
    expect(mapResearchDecisionToDeterministicSignal({ decision: supported, role: "avoid", minimumLevel: "significant" })).toMatchObject({ avoidTriggered: true, primaryEligible: false });
    const omitted = researchDecision({ aspectId: "love_triangle", status: "unknown", reasonCode: "passage_insufficient" });
    expect(mapResearchDecisionToDeterministicSignal({ decision: omitted, role: "avoid", minimumLevel: "significant" })).toMatchObject({ avoidTriggered: false, explicitAbsenceEvidence: false, reason: "research_avoid_unknown" });
  });

  it("character-driven: yetersiz passage unknown, güvenilir direct claim significant olur", () => {
    const candidate = researchCandidate({ constraints: [constraint({ aspectId: "character_driven" })] });
    expect(planResearch({ candidates: [candidate] }).jobs).toHaveLength(1);
    const insufficient = researchDecision({ scope: candidate.versionScope, aspectId: "character_driven", status: "unknown", reasonCode: "passage_insufficient" });
    expect(mapResearchDecisionToDeterministicSignal({ decision: insufficient, role: "must", minimumLevel: "significant" }).primaryEligible).toBe(false);
    const supported = researchDecision({ scope: candidate.versionScope, aspectId: "character_driven", status: "supported", level: "significant" });
    expect(mapResearchDecisionToDeterministicSignal({ decision: supported, role: "must", minimumLevel: "significant" }).primaryEligible).toBe(true);
  });

  it("season ve edition scope kanıt sızıntısını engeller", () => {
    const anime = researchIdentity();
    const season1 = createResearchVersionScope({ identity: anime, scopeKind: "season", seasonNumber: 1 });
    const season2 = createResearchVersionScope({ identity: anime, scopeKind: "season", seasonNumber: 2 });
    expect(season1.scopeKey).not.toBe(season2.scopeKey);
    const book = researchIdentity({ provider: "openlibrary", externalId: "/works/OL1W", mediaType: "book", editionId: "OL1M" });
    expect(createResearchVersionScope({ identity: book, scopeKind: "work" }).scopeKey).not.toBe(createResearchVersionScope({ identity: book, scopeKind: "edition", editionKey: "OL1M" }).scopeKey);
  });
});

