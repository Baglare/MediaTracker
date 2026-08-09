import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { aiSessionCodec } from "@/lib/ai/local-state";
import { buildPublicResearchEvidenceSummary } from "@/features/recommendations/research/active/public-evidence";
import { decodePublicResearchEvidenceSummary, sanitizeRecommendationResearchEvidence } from "@/features/recommendations/research/active/public-codec";
import { resolveResearchRolloutExecution } from "@/features/recommendations/research/shadow/config";
import { buildResearchEvidenceHandoff } from "@/features/recommendations/research/domain/decisions";
import type { ActiveResearchProvenanceSidecar } from "@/features/recommendations/research/active/types";
import { researchCandidate, researchClaim, researchDecision, wikipediaCitation } from "./fixtures/recommendations-v2/grounded-research";

function mapped(input: { outcome?: ActiveResearchProvenanceSidecar["whetherResearchChangedOutcome"]; status?: "supported" | "contradicted"; citationOverrides?: Parameters<typeof wikipediaCitation>[0]; confidence?: "low" | "medium" | "high" } = {}) {
  const candidate = researchCandidate(); const status = input.status ?? "supported";
  const citation = wikipediaCitation(input.citationOverrides);
  const claim = researchClaim({ polarity: status === "supported" ? "support" : "contradict", level: status === "supported" ? "significant" : null });
  const decision = { ...researchDecision({ status }), ...(input.confidence ? { confidence: input.confidence } : {}) };
  const handoff = buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [decision], claims: [claim], citations: [citation], researchStatus: "complete" });
  const provenance: ActiveResearchProvenanceSidecar = { candidateIdentity: candidate.identity, aspectId: "romance", decisionStatus: status, decisionLevel: decision.level, citationIds: [citation.citationId], sourceCount: 1, cacheStatus: "miss", whetherResearchChangedOutcome: input.outcome ?? (status === "supported" ? "rescued_candidate" : "cleared_avoid") };
  return buildPublicResearchEvidenceSummary({ handoff, provenance });
}

describe("D7-R6A2 public research evidence", () => {
  it("active yalnız public citation flag ile açılır; disabled/shadow/conflict fail-closed kalır", () => {
    expect(resolveResearchRolloutExecution({ D7_RESEARCH_ROLLOUT_MODE: "active" } as NodeJS.ProcessEnv)).toMatchObject({ activeResearchAllowed: false });
    expect(resolveResearchRolloutExecution({ D7_RESEARCH_ROLLOUT_MODE: "active", D7_RESEARCH_PUBLIC_CITATIONS_ENABLED: "1" } as NodeJS.ProcessEnv)).toMatchObject({ activeResearchAllowed: true });
    expect(resolveResearchRolloutExecution({ D7_RESEARCH_ROLLOUT_MODE: "shadow", D7_RESEARCH_PUBLIC_CITATIONS_ENABLED: "1" } as NodeJS.ProcessEnv)).toMatchObject({ activeResearchAllowed: false });
    expect(resolveResearchRolloutExecution({ D7_RESEARCH_ROLLOUT_MODE: "disabled", D7_RESEARCH_PUBLIC_CITATIONS_ENABLED: "1" } as NodeJS.ProcessEnv)).toMatchObject({ activeResearchAllowed: false });
    expect(resolveResearchRolloutExecution({ D7_RESEARCH_ROLLOUT_MODE: "active", D7_RESEARCH_SHADOW_ENABLED: "1", D7_RESEARCH_PUBLIC_CITATIONS_ENABLED: "1" } as NodeJS.ProcessEnv)).toMatchObject({ activeResearchAllowed: false, conflict: true });
  });

  it("supported significant/primary ve explicit absence bounded Türkçe registry label üretir", () => {
    expect(mapped()?.affectedAspects[0]).toMatchObject({ label: "Romantizm", finding: "supported", level: "significant", confidence: "medium" });
    const primaryCandidate = researchCandidate(); const citation = wikipediaCitation(); const claim = researchClaim({ level: "primary" }); const decision = researchDecision({ level: "primary" });
    const handoff = buildResearchEvidenceHandoff({ candidateIdentity: primaryCandidate.identity, versionScope: primaryCandidate.versionScope, decisions: [decision], claims: [claim], citations: [citation], researchStatus: "complete" });
    expect(buildPublicResearchEvidenceSummary({ handoff, provenance: { candidateIdentity: primaryCandidate.identity, aspectId: "romance", decisionStatus: "supported", decisionLevel: "primary", citationIds: [citation.citationId], sourceCount: 1, cacheStatus: "hit", whetherResearchChangedOutcome: "rescued_candidate" } })?.affectedAspects[0].level).toBe("primary");
    expect(mapped({ status: "contradicted" })?.affectedAspects[0]).toMatchObject({ finding: "explicit_absence", level: null });
  });

  it("high confidence public'te medium cap olur; no-change gösterilmez", () => {
    expect(mapped({ confidence: "high" })?.affectedAspects[0].confidence).toBe("medium");
    expect(mapped({ outcome: "no_change" })).toBeNull();
  });

  it("invalid, disabled veya provider/search URL ve revision bağı eksik citation fail-closed reddedilir", () => {
    expect(mapped({ citationOverrides: { canonicalUrl: "https://api.openai.com/v1/responses" } })).toBeNull();
    expect(mapped({ citationOverrides: { canonicalUrl: "http://en.wikipedia.org/wiki/Example" } })).toBeNull();
    expect(mapped({ citationOverrides: { canonicalUrl: "https://en.wikipedia.org/wiki/Example" } })).toBeNull();
    expect(decodePublicResearchEvidenceSummary({
      version: 1,
      status: "research_verified",
      affectedAspects: mapped()?.affectedAspects,
      sources: [{ sourceId: "wikipedia", url: "https://en.wikipedia.org/w/index.php?title=Example&oldid=12345&utm_source=test", attribution: "Wikipedia contributors" }],
    })).toBeNull();
    expect(mapped({ citationOverrides: { sourceId: "editorial" as never, canonicalUrl: "https://example.com/x", licenseClass: "unknown" as never } })).toBeNull();
  });

  it("source canonical URL ile dedupe edilir, üçle cap olur ve publisher count şişmez", () => {
    const candidate = researchCandidate();
    const citations = [1, 2, 3, 4].map((index) => wikipediaCitation({ citationId: `c${index}`, canonicalUrl: `https://${index % 2 ? "en" : "tr"}.wikipedia.org/w/index.php?title=Example&oldid=${12000 + index}`, revisionId: String(12000 + index) }));
    const claim = researchClaim({ citationIds: citations.map((item) => item.citationId) });
    const decision = { ...researchDecision(), sourceCount: 4, independentSourceCount: 1 };
    const handoff = buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [decision], claims: [claim], citations, researchStatus: "complete" });
    const summary = buildPublicResearchEvidenceSummary({ handoff, provenance: { candidateIdentity: candidate.identity, aspectId: "romance", decisionStatus: "supported", decisionLevel: "significant", citationIds: citations.map((item) => item.citationId), sourceCount: 4, cacheStatus: "miss", whetherResearchChangedOutcome: "rescued_candidate" } });
    expect(summary?.sources).toHaveLength(3); expect(summary?.affectedAspects[0].sourceCount).toBe(1);
    const duplicateCitation = { ...citations[0], citationId: "duplicate" };
    const duplicateClaim = researchClaim({ citationIds: [citations[0].citationId, duplicateCitation.citationId] });
    const duplicateHandoff = buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [{ ...researchDecision(), sourceCount: 2, independentSourceCount: 1 }], claims: [duplicateClaim], citations: [citations[0], duplicateCitation], researchStatus: "complete" });
    expect(buildPublicResearchEvidenceSummary({ handoff: duplicateHandoff, provenance: { candidateIdentity: candidate.identity, aspectId: "romance", decisionStatus: "supported", decisionLevel: "significant", citationIds: [citations[0].citationId, duplicateCitation.citationId], sourceCount: 2, cacheStatus: "miss", whetherResearchChangedOutcome: "rescued_candidate" } })?.sources).toHaveLength(1);
  });

  it("claim-citation bağı kopuksa public mapper sonuç üretmez", () => {
    const candidate = researchCandidate(); const claim = researchClaim({ citationIds: ["missing"] });
    const handoff = buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [researchDecision()], claims: [claim], citations: [], researchStatus: "complete" });
    expect(buildPublicResearchEvidenceSummary({ handoff, provenance: { candidateIdentity: candidate.identity, aspectId: "romance", decisionStatus: "supported", decisionLevel: "significant", citationIds: [], sourceCount: 1, cacheStatus: "miss", whetherResearchChangedOutcome: "rescued_candidate" } })).toBeNull();
  });

  it("codec legacy absence kabul eder, malformed evidence'ı düşürür ve raw fields'i persistence'tan siler", () => {
    expect(decodePublicResearchEvidenceSummary(undefined)).toBeNull();
    const valid = mapped(); expect(decodePublicResearchEvidenceSummary(valid)).toEqual(valid);
    const sanitized = sanitizeRecommendationResearchEvidence({ id: "r", researchEvidence: { version: 9 }, passage: "raw", providerResponse: { raw: true } });
    expect(sanitized).toEqual({ id: "r" });
    const session = aiSessionCodec({ version: 1, sessions: [{ id: "s", createdAt: "2026-08-09T00:00:00.000Z", prompt: "p", assistantMessage: "a", recommendations: [{ id: "r", researchEvidence: valid, passage: "raw" }] }] });
    expect(session.ok).toBe(true);
    if (session.ok) expect(session.value.sessions[0].recommendations).toEqual([{ id: "r", researchEvidence: valid }]);
  });

  it("public model claim/passage/provider/cache/internal outcome taşımaz", () => {
    const json = JSON.stringify(mapped());
    expect(json).not.toMatch(/paraphrasedClaim|passage|prompt|providerId|model|cacheStatus|hypothetical|citationId|revisionId/i);
  });
});
