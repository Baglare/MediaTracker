import { describe, expect, it } from "vitest";
import {
  canonicalizeAspectConstraints,
  decodeAspectConstraint,
  decodeObjectiveConstraint,
  decodeRecommendationRequestV2,
  type AspectConstraint,
} from "@/features/recommendations/domain";

const mustRomance = {
  kind: "aspect",
  id: "aspect-romance",
  aspectId: "romance",
  role: "must",
  source: "explicit",
  minimumLevel: "significant",
  minimumConfidence: "medium",
} as const;

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    queryText: "Güçlü romantizmi olan kısa bir anime öner.",
    targetMediaTypes: ["anime", "anime"],
    aspectConstraints: [mustRomance],
    objectiveConstraints: [{
      kind: "objective",
      id: "length-episodes",
      role: "must",
      source: "explicit",
      field: "length",
      unit: "episode",
      operator: "lte",
      value: 13,
    }],
    strictness: "balanced",
    references: [{
      state: "verified",
      titleSnapshot: "Reference Anime",
      mediaType: "anime",
      provider: "anilist",
      externalId: "101",
    }],
    profileSignalsEnabled: true,
    semanticVerifierMode: "structured_only",
    locale: "tr-TR",
    ...overrides,
  };
}

describe("Recommendation V2 constraint codec", () => {
  it.each([
    ["must", "explicit", { minimumLevel: "significant" }],
    ["prefer", "inferred", { minimumLevel: "incidental" }],
    ["avoid", "profile", { rejectAtLevel: "significant", rationale: "Kullanıcı bu aspect'i tekrar tekrar reddetti." }],
  ] as const)("%s/%s aspect constraint'i doğrular", (role, source, extra) => {
    expect(decodeAspectConstraint({
      kind: "aspect", id: `${role}-${source}`, aspectId: "romance", role, source, ...extra,
    })).toMatchObject({ ok: true });
  });

  it("profile + must kombinasyonunu reddeder", () => {
    expect(decodeAspectConstraint({ ...mustRomance, source: "profile" })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "profile_must_forbidden" })]),
    });
  });

  it("profile avoid için açık rationale zorunlu kılar", () => {
    expect(decodeAspectConstraint({
      kind: "aspect", id: "profile-avoid", aspectId: "romance", role: "avoid", source: "profile", rejectAtLevel: "significant",
    })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "profile_avoid_rationale_required" })]),
    });
  });

  it("bilinmeyen aspect ID'yi reddeder", () => {
    expect(decodeAspectConstraint({ ...mustRomance, aspectId: "not_registered" })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "aspect_id_unknown" })]),
    });
  });

  it("exact duplicate'i canonical olarak tekilleştirir", () => {
    const result = canonicalizeAspectConstraints([mustRomance, mustRomance] as AspectConstraint[]);
    expect(result).toMatchObject({ ok: true, value: [mustRomance] });
  });

  it("aynı aspect için çelişkili duplicate'i reddeder", () => {
    const result = canonicalizeAspectConstraints([
      mustRomance,
      { kind: "aspect", id: "avoid-romance", aspectId: "romance", role: "avoid", source: "explicit", rejectAtLevel: "significant" },
    ] as AspectConstraint[]);
    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "aspect_constraint_conflict" })],
    });
  });

  it.each(["episode", "chapter", "page", "minute"])("%s length unit'ini destekler", (unit) => {
    expect(decodeObjectiveConstraint({
      kind: "objective", id: `length-${unit}`, role: "must", source: "explicit",
      field: "length", unit, operator: "lte", value: 12,
    })).toMatchObject({ ok: true });
  });

  it("negatif sınır ve ters between aralığını reddeder", () => {
    expect(decodeObjectiveConstraint({
      kind: "objective", id: "negative", role: "must", source: "explicit",
      field: "length", unit: "episode", operator: "lte", value: -1,
    })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "constraint_value_invalid" })]) });
    expect(decodeObjectiveConstraint({
      kind: "objective", id: "reversed", role: "must", source: "explicit",
      field: "release_year", operator: "between", min: 2025, max: 2000,
    })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "constraint_range_reversed" })]) });
  });
});

describe("RecommendationRequestV2 codec", () => {
  it("valid request'i decode eder ve duplicate target MediaType'ı tekilleştirir", () => {
    expect(decodeRecommendationRequestV2(validRequest())).toMatchObject({
      ok: true,
      value: {
        version: 2,
        targetMediaTypes: ["anime"],
        strictness: "balanced",
        references: [{ state: "verified", provider: "anilist", externalId: "101" }],
      },
    });
  });

  it.each(["strict", "balanced", "exploratory"])("%s strictness değerini kabul eder", (strictness) => {
    expect(decodeRecommendationRequestV2(validRequest({ strictness }))).toMatchObject({ ok: true });
  });

  it("invalid version, unknown field ve boş query'yi reddeder", () => {
    expect(decodeRecommendationRequestV2(validRequest({ version: 1 }))).toMatchObject({
      ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "request_version_unsupported" })]),
    });
    expect(decodeRecommendationRequestV2({ ...validRequest(), extra: true })).toMatchObject({
      ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "unknown_field" })]),
    });
    expect(decodeRecommendationRequestV2(validRequest({ queryText: "  " }))).toMatchObject({
      ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "request_query_invalid" })]),
    });
  });

  it("title-only verified reference'i reddeder, unresolved reference'i ayrı kabul eder", () => {
    expect(decodeRecommendationRequestV2(validRequest({
      references: [{ state: "verified", titleSnapshot: "Title", mediaType: "anime" }],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "reference_provider_invalid" })]),
    });
    expect(decodeRecommendationRequestV2(validRequest({
      references: [{ state: "unresolved", titleText: "adı belirsiz anime" }],
    }))).toMatchObject({ ok: true, value: { references: [{ state: "unresolved" }] } });
  });

  it("media type ile anlamsız length unit kombinasyonunu reddeder", () => {
    expect(decodeRecommendationRequestV2(validRequest({ targetMediaTypes: ["book"] }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "length_media_type_incompatible" })]),
    });
  });

  it("malformed constraint'i varsayılanla geçiştirmez", () => {
    expect(decodeRecommendationRequestV2(validRequest({
      aspectConstraints: [{ ...mustRomance, minimumLevel: "very_strong" }],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "minimum_level_invalid" })]),
    });
  });
});
