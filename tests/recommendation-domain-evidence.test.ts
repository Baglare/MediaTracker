import { describe, expect, it } from "vitest";
import {
  createUnknownAspectEvidence,
  decodeAspectEvidence,
} from "@/features/recommendations/domain";

function providerClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: "claim-1",
    sourceKind: "provider_tag_rank",
    scope: "candidate_metadata",
    provider: "anilist",
    field: "tags.Romance.rank",
    value: 88,
    normalizedValue: 0.88,
    reliability: 0.9,
    explanation: "AniList tag rank",
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  const claim = providerClaim();
  return {
    aspectId: "romance",
    strength: 0.8,
    level: "primary",
    confidence: "high",
    sources: [claim],
    supportingEvidence: [claim],
    contradictoryEvidence: [],
    verifierMode: "structured_only",
    warnings: [],
    ...overrides,
  };
}

describe("Recommendation V2 evidence codec", () => {
  it("structured provider evidence'i doğrular", () => {
    const decoded = decodeAspectEvidence(evidence());
    expect(decoded).toMatchObject({ ok: true, value: { aspectId: "romance", level: "primary" } });
  });

  it("semantic verifier evidence'ini structured evidence'dan tür düzeyinde ayırır", () => {
    const claim = {
      id: "remote-1",
      sourceKind: "remote_llm_verifier",
      scope: "candidate_metadata",
      field: "overview",
      reliability: 0.75,
    };
    expect(decodeAspectEvidence(evidence({
      sources: [claim],
      supportingEvidence: [claim],
      verifierMode: "remote_enhanced",
    }))).toMatchObject({ ok: true });
    expect(decodeAspectEvidence(evidence({
      sources: [claim],
      supportingEvidence: [claim],
      verifierMode: "structured_only",
    }))).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "semantic_evidence_mode_mismatch" })]) });
  });

  it("contradictory evidence supporting evidence'i silmeden korur", () => {
    const supporting = providerClaim();
    const contradictory = providerClaim({ id: "claim-2", sourceKind: "provider_genre", field: "genres", value: "Drama" });
    const decoded = decodeAspectEvidence(evidence({
      confidence: "medium",
      sources: [supporting, contradictory],
      supportingEvidence: [supporting],
      contradictoryEvidence: [contradictory],
      warnings: ["Provider kanıtları çelişiyor."],
    }));
    expect(decoded).toMatchObject({
      ok: true,
      value: { supportingEvidence: [{ id: "claim-1" }], contradictoryEvidence: [{ id: "claim-2" }] },
    });
  });

  it("unsupported provider aspect'i absent yapmaz", () => {
    const claim = providerClaim({
      sourceKind: "provider_metadata",
      provider: "openlibrary",
      field: "subjects",
      value: "Fanservice",
    });
    expect(decodeAspectEvidence(evidence({
      aspectId: "fanservice",
      strength: 0.1,
      level: "absent",
      confidence: "medium",
      sources: [claim],
      supportingEvidence: [claim],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "unsupported_aspect_must_be_unknown" })]),
    });
  });

  it("unknown için strength uydurmaz", () => {
    expect(createUnknownAspectEvidence("romance")).toEqual({
      aspectId: "romance",
      strength: null,
      level: "unknown",
      confidence: "unknown",
      sources: [],
      supportingEvidence: [],
      contradictoryEvidence: [],
      verifierMode: "structured_only",
      warnings: [],
    });
    expect(decodeAspectEvidence(evidence({
      strength: null,
      level: "unknown",
      confidence: "unknown",
      sources: [],
      supportingEvidence: [],
    }))).toMatchObject({ ok: true });
  });

  it("boş evidence ile high confidence üretmez", () => {
    expect(decodeAspectEvidence(evidence({
      sources: [],
      supportingEvidence: [],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "high_confidence_without_evidence" })]),
    });
  });

  it.each(["hash_embedding", "mock_embedding"])("%s kaynağını semantic evidence saymaz", (sourceKind) => {
    const claim = providerClaim({ sourceKind });
    expect(decodeAspectEvidence(evidence({ sources: [claim], supportingEvidence: [claim] }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "evidence_source_forbidden" })]),
    });
  });

  it("user feedback'i provider metadata yerine personal-fit ile sınırlar", () => {
    const claim = {
      id: "feedback-1",
      sourceKind: "user_feedback",
      scope: "personal_fit",
      value: "liked",
    };
    expect(decodeAspectEvidence(evidence({
      sources: [claim],
      supportingEvidence: [claim],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "personal_fit_not_aspect_evidence" })]),
    });
  });

  it("sources dışında supporting claim ve aynı claim'in çelişkili rolünü reddeder", () => {
    const source = providerClaim();
    const outside = providerClaim({ id: "outside" });
    expect(decodeAspectEvidence(evidence({
      sources: [source],
      supportingEvidence: [outside],
      contradictoryEvidence: [outside],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "evidence_claim_not_in_sources" }),
        expect.objectContaining({ code: "evidence_claim_role_conflict" }),
      ]),
    });
  });
});
