import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import { DEFAULT_AI_SETTINGS, aiFeedbackCodec, aiPreferencesCodec } from "@/lib/ai/local-state";
import { decodeRecommendationFeedbackEventV2 } from "@/features/recommendations/feedback";
import { interpretRecommendationRequest } from "@/features/recommendations/intent/interpret-request";
import { patchRecommendationRequest } from "@/features/recommendations/intent/request-patch";

const validFeedback = {
  version: 2,
  id: "rfv2-1",
  action: "dismissed",
  candidateIdentity: { kind: "provider", provider: "anilist", externalId: "1", mediaType: "anime" },
  resultKind: "primary",
  reasonCode: "love_triangle",
  aspectIds: ["love_triangle"],
  constraintKeys: ["aspect:love_triangle"],
  createdAt: "2026-08-04T10:00:00.000Z",
};

describe("Recommendation Feedback V2", () => {
  it("requires exact provider or library identity", () => {
    expect(decodeRecommendationFeedbackEventV2(validFeedback).ok).toBe(true);
    const invalid = decodeRecommendationFeedbackEventV2({ ...validFeedback, candidateIdentity: { kind: "provider", provider: "anilist", mediaType: "anime" } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.issues.map((issue) => issue.code)).toContain("feedback_provider_identity_invalid");
  });

  it("keeps reason scope explicit and rejects unknown aspects", () => {
    expect(decodeRecommendationFeedbackEventV2({ ...validFeedback, aspectIds: ["made_up"] }).ok).toBe(false);
    const decoded = decodeRecommendationFeedbackEventV2(validFeedback);
    expect(decoded.ok && decoded.value).toMatchObject({ reasonCode: "love_triangle", resultKind: "primary", aspectIds: ["love_triangle"] });
  });

  it("hydrates V1 feedback and preferences into bounded V2-compatible state", () => {
    const feedback = aiFeedbackCodec({ version: 1, dismissedSignals: {}, recommendationEvents: [], recommendationEventsV2: [validFeedback, { broken: true }] });
    expect(feedback.ok && feedback.value.recommendationEventsV2).toHaveLength(1);
    const preferences = aiPreferencesCodec({ version: 1, settings: {}, dataToggles: {} });
    expect(preferences.ok && preferences.value.recommendationStrictness).toBe("balanced");
  });
});

describe("two-stage structured request", () => {
  it("creates a draft without candidates or provider retrieval", () => {
    const message = "Güçlü romantizmi olan, 13 bölümden kısa fantastik anime öner; aşk üçgeni olmasın.";
    const result = interpretRecommendationRequest({ message, intent: analyzeIntent(message), settings: DEFAULT_AI_SETTINGS, mediaItems: [] });
    expect(result.request?.targetMediaTypes).toEqual(["anime"]);
    expect(result.request?.aspectConstraints.some((constraint) => constraint.aspectId === "romance")).toBe(true);
    expect(result.request?.aspectConstraints.some((constraint) => constraint.aspectId === "love_triangle" && constraint.role === "avoid")).toBe(true);
  });

  it("patches an existing request and preserves old explicit must constraints", () => {
    const base = interpretRecommendationRequest({ message: "Romantizmi güçlü fantastik anime öner", intent: analyzeIntent("Romantizmi güçlü fantastik anime öner"), settings: DEFAULT_AI_SETTINGS, mediaItems: [] }).request!;
    const patched = patchRecommendationRequest(base, "Aşk üçgeni olanları çıkar");
    expect(patched.request?.aspectConstraints.some((constraint) => constraint.aspectId === "romance" && constraint.role === "must")).toBe(true);
    expect(patched.request?.aspectConstraints.some((constraint) => constraint.aspectId === "love_triangle" && constraint.role === "avoid")).toBe(true);
  });

  it("requires clarification for a relative length patch without a prior limit", () => {
    const base = interpretRecommendationRequest({ message: "Fantastik anime öner", intent: analyzeIntent("Fantastik anime öner"), settings: DEFAULT_AI_SETTINGS, mediaItems: [] }).request!;
    expect(patchRecommendationRequest(base, "Daha kısa olsun")).toMatchObject({ request: null, needsClarification: true });
  });

  it("keeps the interpretation endpoint free of provider, model and web retrieval", () => {
    const source = readFileSync("app/api/ai/interpret/route.ts", "utf8");
    expect(source).not.toMatch(/candidate-search|prepareProvider|openai|gemini|webResearch|fetch\(/i);
    expect(source).toContain("interpretRecommendationRequest");
  });
});

describe("V2 UI contracts", () => {
  it("uses registry-driven aspect search and radio strictness semantics", () => {
    const aspect = readFileSync("features/recommendations/ui/aspect-constraint-editor.tsx", "utf8");
    const strictness = readFileSync("features/recommendations/ui/strictness-selector.tsx", "utf8");
    expect(aspect).toMatch(/ASPECT_IDS|ASPECT_REGISTRY|role="combobox"|role="option"/);
    expect(strictness).toMatch(/type="radio"|balanced|exploratory/);
  });

  it("keeps near matches separate, exploratory-only and capped", () => {
    const source = readFileSync("features/recommendations/ui/near-match-section.tsx", "utf8");
    expect(source).toContain('strictness !== "exploratory"');
    expect(source).toMatch(/slice\(0, 3\)/);
    expect(source).toContain("Karşılanmayan");
  });

  it("provides dialog and collapsible accessibility contracts", () => {
    const dialog = readFileSync("features/recommendations/ui/feedback-reason-dialog.tsx", "utf8");
    const evidence = readFileSync("features/recommendations/ui/evidence-summary.tsx", "utf8");
    expect(dialog).toMatch(/role="dialog"|aria-modal="true"|Escape|previous\.current\?\.focus/);
    expect(evidence).toMatch(/aria-expanded|aria-controls/);
  });

  it("sends confirmed structured request and V2 feedback to recommendation route", () => {
    const advisor = readFileSync("components/ai-advisor.tsx", "utf8");
    const route = readFileSync("app/api/ai/recommend/route.ts", "utf8");
    expect(advisor).toMatch(/structuredRequestV2: structuredRequest|recommendationFeedbackV2/);
    expect(route).toMatch(/decodeRecommendationRequestV2|structured_request_invalid/);
  });
});
