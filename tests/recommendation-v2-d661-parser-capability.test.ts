import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ASPECT_IDS,
  ASPECT_REGISTRY,
  decodeRecommendationRequestV2,
  evaluateConstraintEvidenceCapability,
  evaluateRequestEvidenceCapabilities,
} from "@/features/recommendations/domain";
import type { AspectConstraint } from "@/features/recommendations/domain";
import { matchAspectPhrases } from "@/features/recommendations/intent/aspect-phrase-matcher";
import { extractStructuredConstraints } from "@/features/recommendations/intent/constraint-extractor";

function extract(message: string) {
  return extractStructuredConstraints({ message, targetMediaTypes: ["anime"] });
}

function constraint(aspectId: AspectConstraint["aspectId"], role: AspectConstraint["role"] = "must"): AspectConstraint {
  return role === "avoid"
    ? { id: `c:${aspectId}`, kind: "aspect", aspectId, role, source: "explicit", rejectAtLevel: "incidental" }
    : { id: `c:${aspectId}`, kind: "aspect", aspectId, role, source: "explicit", minimumLevel: "significant" };
}

describe("D6.6-1 Turkish morphology-aware aspect matching", () => {
  it.each([
    ["politik entrika", "political_intrigue"],
    ["politik entrikanın", "political_intrigue"],
    ["politik entrikası", "political_intrigue"],
    ["politik entrikaya", "political_intrigue"],
    ["romantizmi", "romance"],
    ["romantizmin", "romance"],
    ["fantastiğin", "fantasy"],
    ["fantastikliği", "fantasy"],
    ["fanservice’i", "fanservice"],
    ["aşk üçgeninden", "love_triangle"],
    ["karakter odaklı", "character_driven"],
    ["karakter odaklılığın", "character_driven"],
    ["güç gelişiminin", "power_progression"],
    ["yavaş tempolu", "slow_paced"],
    ["karanlık tonun", "dark"],
  ] as const)("%s biçimini %s olarak tanır", (phrase, aspectId) => {
    expect(matchAspectPhrases(phrase).matches.map((match) => match.aspectId)).toContain(aspectId);
  });

  it.each([
    ["politika hakkında belgesel", "political_intrigue"],
    ["romantik komedi", "love_triangle"],
    ["karakter tasarımı güçlü", "character_driven"],
    ["okul sahnesi var", "academy"],
    ["güçlü ana karakter", "power_progression"],
  ] as const)("%s ifadesinden %s false-positive üretmez", (message, aspectId) => {
    expect(extract(message).aspectConstraints.some((item) => item.aspectId === aspectId)).toBe(false);
  });

  it.each([
    ["politik entrikanın ana unsurlardan biri olduğu fantastik anime", "political_intrigue", "must", "significant"],
    ["politik entrikası güçlü bir anime", "political_intrigue", "must", "primary"],
    ["biraz politik entrika olabilir", "political_intrigue", "prefer", "incidental"],
    ["politik entrika olmasın", "political_intrigue", "avoid", undefined],
    ["romantizmi güçlü", "romance", "must", "primary"],
    ["fantastiğin baskın olduğu", "fantasy", "must", "primary"],
    ["fanservice’i az", "fanservice", "avoid", undefined],
    ["karakter odaklı bir drama", "character_driven", "prefer", "incidental"],
    ["yavaş tempolu ama umutlu", "slow_paced", "prefer", "incidental"],
    ["aşk üçgeninden kaçın", "love_triangle", "avoid", undefined],
  ] as const)("%s rol ve merkeziyetini üretir", (message, aspectId, role, minimumLevel) => {
    const result = extract(message);
    const found = result.aspectConstraints.find((item) => item.aspectId === aspectId);
    expect(found).toMatchObject({ role });
    if (minimumLevel) expect(found).toMatchObject({ minimumLevel });
  });

  it("aynı aspect için çelişkili cümleleri issue olarak taşır", () => {
    const result = extract("Politik entrika istiyorum ama politik entrika olmasın.");
    expect(result.issues).toContain("aspect_constraint_conflict:political_intrigue");
    expect(result.aspectConstraints.some((item) => item.aspectId === "political_intrigue")).toBe(false);
  });
});

describe("D6.6-1 evidence capability policy", () => {
  it("43 aspect'in strategy dağılımını ve completeness'ini sabitler", () => {
    expect(ASPECT_IDS).toHaveLength(43);
    const counts = ASPECT_IDS.reduce<Record<string, number>>((out, id) => {
      out[ASPECT_REGISTRY[id].defaultEvidenceStrategy] = (out[ASPECT_REGISTRY[id].defaultEvidenceStrategy] ?? 0) + 1;
      return out;
    }, {});
    expect(counts).toEqual({ exact_taxonomy: 13, ranked_tag: 21, semantic_required: 9 });
  });

  it("political_intrigue + AniList için ranked tag desteği verir", () => {
    expect(evaluateConstraintEvidenceCapability({ constraint: constraint("political_intrigue"), targetMediaTypes: ["anime"], semanticVerifierMode: "structured_only" })).toMatchObject({ status: "ranked_tag_supported", providers: ["anilist"], canUseAsMust: true });
  });

  it("character_driven structured-only modunda semantic verifier gerektirir", () => {
    expect(evaluateConstraintEvidenceCapability({ constraint: constraint("character_driven"), targetMediaTypes: ["anime"], semanticVerifierMode: "structured_only" })).toMatchObject({ status: "requires_semantic_verifier", canUseAsMust: false });
  });

  it("gerçek local verifier seçilebiliyorsa semantic hard constraint'i etkinleştirir", () => {
    expect(evaluateConstraintEvidenceCapability({ constraint: constraint("character_driven"), targetMediaTypes: ["anime"], semanticVerifierMode: "local_enhanced", availableVerifierModes: ["local_enhanced"] })).toMatchObject({ status: "requires_semantic_verifier", canUseAsMust: true });
  });

  it("Open Library subject-only Fantasy hard must'ı soft-only sayar", () => {
    expect(evaluateConstraintEvidenceCapability({ constraint: constraint("fantasy"), targetMediaTypes: ["book"], semanticVerifierMode: "structured_only" })).toMatchObject({ status: "soft_only", providers: ["openlibrary"], canUseAsMust: false, canUseAsPrefer: true });
  });

  it("Fantasy + AniList için structured taxonomy desteği verir", () => {
    expect(evaluateConstraintEvidenceCapability({ constraint: constraint("fantasy"), targetMediaTypes: ["anime"], semanticVerifierMode: "structured_only" })).toMatchObject({ status: "structured_supported", canUseAsMust: true });
  });

  it("unsupported target/provider kombinasyonunu açıklar", () => {
    expect(evaluateConstraintEvidenceCapability({ constraint: constraint("fanservice"), targetMediaTypes: ["book"], semanticVerifierMode: "structured_only" })).toMatchObject({ status: "unsupported_for_target", providers: [], canUseAsMust: false, canUseAsPrefer: false });
  });

  it("semantic prefer'i blocker yapmaz; aynı hard role için validation issue üretir", () => {
    const base = {
      version: 2 as const, queryText: "karakter odaklı anime", targetMediaTypes: ["anime"] as const,
      objectiveConstraints: [], strictness: "balanced" as const, references: [], profileSignalsEnabled: false,
      semanticVerifierMode: "structured_only" as const, locale: "tr-TR",
    };
    expect(evaluateRequestEvidenceCapabilities({ request: { ...base, aspectConstraints: [constraint("character_driven", "prefer")] } }).issues).toEqual([]);
    expect(evaluateRequestEvidenceCapabilities({ request: { ...base, aspectConstraints: [constraint("character_driven", "must")] } }).issues[0]?.code).toBe("constraint_evidence_semantic_verifier_required");
  });

  it("onaylanmış minimumLevel değerini codec içinde yeniden tahmin etmez", () => {
    const decoded = decodeRecommendationRequestV2({ version: 2, queryText: "politik entrika", targetMediaTypes: ["anime"], aspectConstraints: [{ ...constraint("political_intrigue"), minimumLevel: "primary" }], objectiveConstraints: [], strictness: "balanced", references: [], profileSignalsEnabled: false, semanticVerifierMode: "structured_only", locale: "tr-TR" });
    expect(decoded.ok && decoded.value.aspectConstraints[0].minimumLevel).toBe("primary");
  });

  it("recommendation route'un client capability bilgisini güvenlik kaynağı saymadığını sabitler", () => {
    const route = readFileSync("app/api/ai/recommend/route.ts", "utf8");
    expect(route).toContain("evaluateRequestEvidenceCapabilities");
    expect(route).toContain("structured_request_capability_invalid");
    expect(route).toContain("availableSemanticVerifierModes()");
  });
});
