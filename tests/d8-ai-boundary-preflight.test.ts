import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn(async () => null) }));

import { AI_REQUEST_MAX_BYTES, readStrictJsonObject, UPSTREAM_TIMEOUT_MS } from "@/lib/api/request-security";
import { buildRecommendationMediaPayload, RECOMMENDATION_MEDIA_PAYLOAD_LIMIT } from "@/features/recommendations/ui/request-payload";

describe("D8-1 timeout/body regression preflight", () => {
  it("keeps 8s on search proxies without a blanket recommendation timeout", () => {
    expect(UPSTREAM_TIMEOUT_MS).toBe(8_000);
    const recommend = readFileSync("app/api/ai/recommend/route.ts", "utf8");
    const research = readFileSync("features/recommendations/research/shadow/types.ts", "utf8");
    expect(recommend).not.toContain("fetchWithTimeout");
    expect(recommend).toContain("PROVIDER_TIMEOUT_MS = 25000");
    expect(research).toContain("GROUNDED_RESEARCH_ACTIVE_TIMEOUT_MS = 12_000");
  });

  it("accepts a maximum normal library payload and rejects an actually oversized body", async () => {
    const media = Array.from({ length: RECOMMENDATION_MEDIA_PAYLOAD_LIMIT }, (_, index) => ({ id: `id-${index}`, title: `Bounded title ${index}`, type: "movie", status: "completed", currentProgress: 1, totalProgress: 1, coverImage: "", tags: ["drama", "mystery"], personalNotes: "bounded note", userRating: 8 }));
    const body = {
      message: "bounded recommendation request",
      mediaItems: buildRecommendationMediaPayload(media as never, { ratings: true, favorites: true, progress: true, notes: true, profile: true }),
      progressLogs: Array.from({ length: 1_000 }, (_, index) => ({ mediaId: `id-${index}`, date: "2026-08-09", progress: 1 })),
      settings: { useProfile: true, useRatings: true, useFavorites: true, useProgress: true, useNotes: true },
      structuredRequestV2: { version: 1, targetMediaTypes: ["movie"], aspectConstraints: [], objectiveConstraints: [], strictness: "balanced" },
      recommendationFeedback: [], recommendationFeedbackV2: [],
    };
    const encoded = JSON.stringify(body);
    expect(new TextEncoder().encode(encoded).byteLength).toBeLessThan(AI_REQUEST_MAX_BYTES);
    const accepted = await readStrictJsonObject(new Request("http://localhost/api/ai/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: encoded }), new Set(Object.keys(body)), AI_REQUEST_MAX_BYTES);
    expect(accepted.ok).toBe(true);
    const oversized = await readStrictJsonObject(new Request("http://localhost/api/ai/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "x".repeat(AI_REQUEST_MAX_BYTES + 1) }) }), new Set(["message"]), AI_REQUEST_MAX_BYTES);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.response.status).toBe(413);
  });
});
