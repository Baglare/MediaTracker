import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST as interpretPost } from "@/app/api/ai/interpret/route";
import { ASPECT_IDS } from "@/features/recommendations/domain/aspect-registry";
import { decodeRecommendationRequestV2, RECOMMENDATION_REQUEST_LIMITS, type RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import { evaluateConstraintEligibility } from "@/features/recommendations/domain/policies";
import { patchRecommendationRequest } from "@/features/recommendations/intent/request-patch";
import { compareScoredCandidates } from "@/features/recommendations/ranking/scorer";
import type { ScoredRecommendationCandidate } from "@/features/recommendations/ranking/types";
import { decodeRecommendationFeedbackEventV2 } from "@/features/recommendations/feedback";
import { aiSessionCodec } from "@/lib/ai/local-state";
import { buildInterpretReferencePayload, buildRecommendationMediaPayload } from "@/features/recommendations/ui/request-payload";
import { PROVIDER_ENRICHMENT_CONCURRENCY, PROVIDER_ENRICHMENT_MAX_CANDIDATES, PROVIDER_ENRICHMENT_TIMEOUT_MS } from "@/features/recommendations/providers/pipeline";
import { PROVIDER_EVIDENCE_CACHE_MAX_ENTRIES } from "@/features/recommendations/providers/evidence-cache";
import { SEMANTIC_VERIFIER_CONCURRENCY, SEMANTIC_VERIFIER_TIMEOUT_MS, SEMANTIC_VERIFIER_TOP_N } from "@/features/recommendations/evidence/semantic-verifier";

function request(overrides: Partial<RecommendationRequestV2> = {}): RecommendationRequestV2 {
  return { version: 2, queryText: "Güçlü romantizmi olan kısa fantastik anime öner; aşk üçgeni olmasın.", targetMediaTypes: ["anime"], aspectConstraints: [{ id: "romance:must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }, { id: "fantasy:must", kind: "aspect", aspectId: "fantasy", role: "must", source: "explicit", minimumLevel: "significant" }, { id: "triangle:avoid", kind: "aspect", aspectId: "love_triangle", role: "avoid", source: "explicit", rejectAtLevel: "significant" }], objectiveConstraints: [{ id: "type:anime", kind: "objective", field: "media_type", operator: "eq", value: "anime", role: "must", source: "explicit" }, { id: "length", kind: "objective", field: "length", unit: "episode", operator: "lte", value: 13, role: "must", source: "explicit" }, { id: "status", kind: "objective", field: "release_status", operator: "eq", value: "finished", role: "must", source: "explicit" }], strictness: "strict", references: [{ state: "unresolved", titleText: "Örnek" }], profileSignalsEnabled: true, semanticVerifierMode: "structured_only", locale: "tr-TR", ...overrides };
}

describe("D6-5 request security and interpretation acceptance", () => {
  it("keeps 43 registry ids and applies bounded request collections", () => {
    expect(ASPECT_IDS).toHaveLength(43);
    expect(new Set(ASPECT_IDS).size).toBe(43);
    const tooMany = decodeRecommendationRequestV2({ ...request(), references: Array.from({ length: RECOMMENDATION_REQUEST_LIMITS.references + 1 }, (_, index) => ({ state: "unresolved", titleText: `ref-${index}` })) });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.issues.map((entry) => entry.code)).toContain("references_limit_exceeded");
  });

  it("rejects conflicting objective constraints and unsafe hard aspect payloads", () => {
    const conflict = decodeRecommendationRequestV2({ ...request(), objectiveConstraints: [{ id: "year-a", kind: "objective", field: "release_year", operator: "gte", value: 2000, role: "must", source: "explicit" }, { id: "year-b", kind: "objective", field: "release_year", operator: "lte", value: 2020, role: "must", source: "explicit" }] });
    expect(conflict.ok).toBe(false);
    const unsafe = decodeRecommendationRequestV2({ ...request(), aspectConstraints: [{ id: "unsafe", kind: "aspect", aspectId: "disturbing_content", role: "must", source: "explicit", minimumLevel: "significant" }] });
    expect(unsafe.ok).toBe(false);
  });

  it("handles malformed JSON, unknown fields and invalid strictness without provider work", async () => {
    const malformed = await interpretPost(new Request("http://localhost/api/ai/interpret", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    const unknown = await interpretPost(new Request("http://localhost/api/ai/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "anime öner", __proto_marker__: true }) }));
    expect(unknown.status).toBe(400);
    const strictness = await interpretPost(new Request("http://localhost/api/ai/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "anime öner", strictness: "loose" }) }));
    expect(strictness.status).toBe(400);
    expect(readFileSync("app/api/ai/interpret/route.ts", "utf8")).not.toMatch(/candidate-search|prepareProvider|fetch\(/i);
  });
});

describe("D6-5 follow-up patch acceptance", () => {
  it.each([
    ["Fantastik şart değil", (next: RecommendationRequestV2) => next.aspectConstraints.some((item) => item.aspectId === "fantasy" && item.role === "prefer")],
    ["Aşk üçgeni olabilir", (next: RecommendationRequestV2) => !next.aspectConstraints.some((item) => item.aspectId === "love_triangle")],
    ["Bunlar yerine manga öner", (next: RecommendationRequestV2) => next.targetMediaTypes[0] === "manga" && !next.objectiveConstraints.some((item) => item.field === "length" && item.unit === "episode")],
    ["Devam edenler de olabilir", (next: RecommendationRequestV2) => !next.objectiveConstraints.some((item) => item.field === "release_status")],
    ["Katı olmasın", (next: RecommendationRequestV2) => next.strictness === "balanced"],
  ])("patches %s without silently dropping unrelated explicit musts", (message, assertion) => {
    const result = patchRecommendationRequest(request(), message);
    expect(result.request).not.toBeNull();
    expect(assertion(result.request!)).toBe(true);
    expect(result.request!.aspectConstraints.some((item) => item.aspectId === "romance" && item.role === "must")).toBe(true);
  });

  it("makes New Topic an explicit ephemeral reset and keeps unresolved references unresolved", () => {
    expect(patchRecommendationRequest(request(), "Yeni konu")).toMatchObject({ resetRequested: true, request: null });
    const next = patchRecommendationRequest(request(), "Romantizmi daha güçlü olsun");
    expect(next.request?.references).toEqual([{ state: "unresolved", titleText: "Örnek" }]);
  });
});

describe("D6-5 strictness, deterministic order and privacy acceptance", () => {
  it("preserves explicit must in every strictness and only exploratory can produce a near-match", () => {
    const constraint = request().aspectConstraints[0];
    for (const strictness of ["strict", "balanced", "exploratory"] as const) {
      const decision = evaluateConstraintEligibility({ constraint, evidence: null, strictness });
      expect(decision.passed).toBe(false);
    }
  });

  it("reproduces stable identity tie ordering across 20 input permutations", () => {
    const scored = ["b", "a", "c"].map((key) => ({ deterministicSortKey: [1, 0, 1, 0, 1, key] })) as unknown as ScoredRecommendationCandidate[];
    for (let index = 0; index < 20; index += 1) {
      const input = index % 2 ? [...scored].reverse() : [scored[1], scored[2], scored[0]];
      expect(input.sort(compareScoredCandidates).map((item) => item.deterministicSortKey[5])).toEqual(["a", "b", "c"]);
    }
  });

  it("minimizes interpretation and recommendation payload personal fields", () => {
    const item = { id: "local-1", title: "Private", type: "anime", status: "watching", coverImage: "", currentProgress: 5, totalProgress: 12, userRating: 9, rating: 9, favorite: true, tags: ["özel"], personalNotes: "secret note", releaseCalendar: { version: 1, manualEvents: [], hiddenProviderEventKeys: [] }, externalSource: "anilist", externalId: "1" } as const;
    expect(buildInterpretReferencePayload([item])).toEqual([{ title: "Private", type: "anime", externalSource: "anilist", externalId: "1" }]);
    const payload = buildRecommendationMediaPayload([item], { ratings: false, favorites: false, progress: false, notes: false, profile: false })[0];
    expect(payload).not.toHaveProperty("personalNotes");
    expect(payload).not.toHaveProperty("userRating");
    expect(payload).not.toHaveProperty("favorite");
    expect(payload).not.toHaveProperty("tags");
    expect(payload).not.toHaveProperty("releaseCalendar");
    expect(payload.currentProgress).toBe(0);
  });

  it("locks request budgets to the D6 contract", () => {
    expect([PROVIDER_ENRICHMENT_MAX_CANDIDATES, PROVIDER_ENRICHMENT_CONCURRENCY, PROVIDER_ENRICHMENT_TIMEOUT_MS]).toEqual([8, 3, 2500]);
    expect([SEMANTIC_VERIFIER_TOP_N, SEMANTIC_VERIFIER_CONCURRENCY, SEMANTIC_VERIFIER_TIMEOUT_MS]).toEqual([8, 2, 1800]);
    expect(PROVIDER_EVIDENCE_CACHE_MAX_ENTRIES).toBe(256);
  });
});

describe("D6-5 feedback and session compatibility", () => {
  const feedback = { version: 2, id: "f", action: "dismissed", candidateIdentity: { kind: "provider", provider: "anilist", externalId: "1", mediaType: "anime" }, resultKind: "near_match", reasonCode: "already_known", aspectIds: [], constraintKeys: [], createdAt: "2026-08-04T00:00:00.000Z" };
  it("rejects unknown or personal feedback metadata fields", () => {
    expect(decodeRecommendationFeedbackEventV2(feedback).ok).toBe(true);
    expect(decodeRecommendationFeedbackEventV2({ ...feedback, metadata: { personalNotes: "secret" } }).ok).toBe(false);
    expect(decodeRecommendationFeedbackEventV2({ ...feedback, __proto_marker__: true }).ok).toBe(false);
  });
  it("hydrates V1 sessions and preserves validated V2 draft/near-match fields", () => {
    const old = aiSessionCodec({ version: 1, sessions: [{ id: "old", prompt: "anime", assistantMessage: "ok", createdAt: "2026-08-04T00:00:00.000Z", recommendations: [] }] });
    expect(old.ok).toBe(true);
    const current = aiSessionCodec({ version: 1, sessions: [{ id: "v2", prompt: "anime", assistantMessage: "ok", createdAt: "2026-08-04T00:00:00.000Z", recommendations: [], nearMatches: [{ id: "n" }], structuredRequestV2: request() }] });
    expect(current.ok && current.value.sessions[0]).toMatchObject({ nearMatches: [{ id: "n" }], structuredRequestV2: { version: 2 } });
  });
});
