import { describe, expect, it } from "vitest";
import {
  buildResearchEvidenceHandoff,
  canResearchDecisionDriveHardConstraint,
  countIndependentResearchSources,
  createResearchVersionScope,
  isSearchDiscoveryAdapter,
  mapResearchDecisionToDeterministicSignal,
  RESEARCH_SOURCE_REGISTRY,
  researchScopeKey,
  validateAspectResearchDecision,
  validatePersistedResearchCitation,
  validatePersistedResearchClaim,
  validateResearchSourceRegistry,
  validateResearchVersionScope,
} from "@/features/recommendations/research";
import { researchClaim, researchDecision, researchIdentity, wikipediaCitation, workScope } from "./fixtures/recommendations-v2/grounded-research";

describe("D7-R1 exact version scope", () => {
  it("work, season, installment ve edition scope üretir", () => {
    const anime = researchIdentity();
    const movie = researchIdentity({ provider: "tmdb", externalId: "603", mediaType: "movie" });
    const book = researchIdentity({ provider: "openlibrary", externalId: "/works/OL1W", mediaType: "book", editionId: "OL1M" });
    expect(createResearchVersionScope({ identity: anime, scopeKind: "work" })).toMatchObject({ scopeKind: "work", sourceIdentityVerified: true });
    expect(createResearchVersionScope({ identity: anime, scopeKind: "season", seasonNumber: 1 })).toMatchObject({ scopeKind: "season", seasonNumber: 1 });
    expect(createResearchVersionScope({ identity: movie, scopeKind: "installment", installmentKey: "movie-603" })).toMatchObject({ scopeKind: "installment", installmentKey: "movie-603" });
    expect(createResearchVersionScope({ identity: book, scopeKind: "edition", editionKey: "OL1M" })).toMatchObject({ scopeKind: "edition", editionKey: "OL1M" });
  });

  it("invalid field kombinasyonu, unverifed edition ve fuzzy canonical key'i reddeder", () => {
    const anime = researchIdentity();
    expect(() => createResearchVersionScope({ identity: anime, scopeKind: "season", seasonNumber: 0 })).toThrow("research_scope_season_fields_invalid");
    expect(() => createResearchVersionScope({ identity: anime, scopeKind: "edition", editionKey: "title-guess" })).toThrow("research_scope_edition_fields_invalid");
    const scope = workScope(anime);
    expect(validateResearchVersionScope({ identity: anime, scope: { ...scope, canonicalKey: "title:Steins Gate", scopeKey: researchScopeKey({ scopeKind: "work", canonicalKey: "title:Steins Gate" }) } })).toMatchObject({ ok: false });
  });

  it("exact relation resolver olmadan parent scope kabul etmez", () => {
    const identity = researchIdentity();
    const unrelatedParent = researchIdentity({ externalId: "parent-1" });
    expect(() => createResearchVersionScope({ identity, scopeKind: "season", seasonNumber: 1, parentIdentity: unrelatedParent })).toThrow("research_scope_parent_relation_unavailable");
    expect(validateResearchVersionScope({ identity, scope: { ...workScope(identity), parentCanonicalKey: unrelatedParent.canonicalKey } })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "research_scope_parent_relation_unverified" })]),
    });
  });

  it("scope key stable ve raw kullanıcı metninden bağımsızdır", () => {
    const scope = workScope();
    expect(scope.scopeKey).toBe(workScope().scopeKey);
    expect(scope.scopeKey).not.toContain("romantik anime öner");
  });
});

describe("D7-R1 source, citation ve decision", () => {
  it("registry valid; search adapter source değildir", () => {
    expect(validateResearchSourceRegistry()).toMatchObject({ ok: true });
    expect(Object.keys(RESEARCH_SOURCE_REGISTRY)).not.toContain("openai_web_search");
    expect(Object.keys(RESEARCH_SOURCE_REGISTRY)).not.toContain("brave_search");
    expect(isSearchDiscoveryAdapter("openai_web_search")).toBe(true);
  });

  it("Wikipedia revision/attribution ister, Wikidata CC0 metadata'yı korur", () => {
    expect(validatePersistedResearchCitation(wikipediaCitation())).toMatchObject({ ok: true });
    expect(validatePersistedResearchCitation(wikipediaCitation({ revisionId: undefined }))).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_citation_revision_required" })]) });
    expect(RESEARCH_SOURCE_REGISTRY.wikidata).toMatchObject({ licenseClass: "cc0", trustTier: "high", enabled: true });
  });

  it("supported/contradicted claim citation olmadan ve uzun claim ile reddedilir", () => {
    expect(validatePersistedResearchClaim({ claim: researchClaim({ citationIds: [] }), citations: [] })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_claim_citation_required" })]) });
    expect(validatePersistedResearchClaim({ claim: { ...researchClaim(), paraphrasedClaim: "x".repeat(281) }, citations: [wikipediaCitation()] })).toMatchObject({ ok: false });
    expect(validatePersistedResearchClaim({ claim: researchClaim({ polarity: "support", level: null }), citations: [wikipediaCitation()] })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_claim_support_level_required" })]) });
  });

  it("unknown citation olmadan mümkündür; supported ve contradicted explicit claim ister", () => {
    const identity = researchIdentity();
    const unknown = researchDecision({ status: "unknown", reasonCode: "no_source_found" });
    expect(validateAspectResearchDecision({ decision: unknown, claims: [], citations: [], identity })).toMatchObject({ ok: true });
    expect(validateAspectResearchDecision({ decision: researchDecision(), claims: [], citations: [], identity })).toMatchObject({ ok: false });
  });

  it("independent source sayımı publisher bazlıdır ve tek low trust hard karar vermez", () => {
    const citation = wikipediaCitation();
    const claim = researchClaim();
    expect(countIndependentResearchSources({ claimIds: [claim.claimId], claims: [claim], citations: [citation] })).toEqual({ sourceCount: 1, independentSourceCount: 1 });
    const decision = researchDecision();
    expect(canResearchDecisionDriveHardConstraint({ decision, claims: [claim], citations: [citation] })).toBe(true);
    expect(canResearchDecisionDriveHardConstraint({ decision: { ...decision, status: "unknown", level: null, confidence: "none", supportingClaimIds: [], reasonCode: "source_quality_insufficient" }, claims: [], citations: [] })).toBe(false);
  });

  it("deterministic handoff unknown must'ı primary'ye geçirmez ve avoid presence'i reject eder", () => {
    expect(mapResearchDecisionToDeterministicSignal({ decision: researchDecision({ status: "unknown" }), role: "must", minimumLevel: "significant" })).toMatchObject({ primaryEligible: false, nearMatchEligible: true, mustSatisfied: false });
    expect(mapResearchDecisionToDeterministicSignal({ decision: researchDecision({ aspectId: "love_triangle", status: "supported", level: "significant" }), role: "avoid", minimumLevel: "significant" })).toMatchObject({ primaryEligible: false, avoidTriggered: true });
    const identity = researchIdentity();
    const handoff = buildResearchEvidenceHandoff({ candidateIdentity: identity, versionScope: workScope(identity), decisions: [researchDecision({ status: "unknown" })], claims: [], citations: [], researchStatus: "complete" });
    expect(handoff.unresolvedAspects).toEqual(["romance"]);
  });
});
