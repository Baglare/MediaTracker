import { describe, expect, it } from "vitest";
import { extractStructuredConstraints } from "@/features/recommendations/intent/constraint-extractor";
import { resolveRecommendationReferences } from "@/features/recommendations/intent/reference-policy";

describe("D6-3 structured constraint extraction", () => {
  it("Türkçe must/prefer/avoid ve length koşullarını registry üzerinden çıkarır", () => {
    const result = extractStructuredConstraints({
      message: "Güçlü romantizmi olan, 13 bölümden kısa fantastik anime öner; aşk üçgeni olmasın.",
      targetMediaTypes: ["anime"],
    });
    expect(result.issues).toEqual([]);
    expect(result.aspectConstraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }),
      expect.objectContaining({ aspectId: "fantasy", role: "prefer" }),
      expect.objectContaining({ aspectId: "love_triangle", role: "avoid", source: "explicit", rejectAtLevel: "significant" }),
    ]));
    expect(result.objectiveConstraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "media_type", value: "anime", role: "must" }),
      expect.objectContaining({ field: "length", unit: "episode", operator: "lte", value: 13, role: "must" }),
    ]));
  });

  it("profile planning sinyalini explicit constraint üzerine yazmaz", () => {
    const result = extractStructuredConstraints({ message: "romantizm olmasın", targetMediaTypes: ["tv"], planningPreferenceSignals: ["romance"] });
    expect(result.aspectConstraints.filter((item) => item.aspectId === "romance")).toEqual([
      expect.objectContaining({ role: "avoid", source: "explicit" }),
    ]);
  });

  it("desteklenmeyen hard aspect'i prefer'e düşürüp warning üretir", () => {
    const result = extractStructuredConstraints({ message: "güçlü oyun sistemi olan dizi istiyorum", targetMediaTypes: ["tv"] });
    expect(result.aspectConstraints).toContainEqual(expect.objectContaining({ aspectId: "game_system", role: "prefer" }));
    expect(result.warnings).toContain("must_downgraded_unsupported:game_system");
  });

  it("verified reference için exact provider identity ister; title-only unresolved kalır", () => {
    const resolved = resolveRecommendationReferences({
      intent: { kind: "reference_based", references: ["Anchor"], targetTypes: ["movie"], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false },
      mediaItems: [], candidates: [],
    });
    expect(resolved.references).toEqual([{ state: "unresolved", titleText: "Anchor" }]);
  });
});
