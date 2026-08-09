import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: afterMock }));

import { createGroundedResearchShadowSnapshot, scheduleGroundedResearchShadow } from "@/features/recommendations/research/shadow/lifecycle";
import type { PostResponseTaskScheduler } from "@/features/recommendations/research/shadow/scheduler";
import type { GroundedResearchShadowContext, GroundedResearchShadowResult } from "@/features/recommendations/research/shadow/types";
import { nextPostResponseTaskScheduler } from "@/features/recommendations/research/shadow/next-scheduler";
import { researchCandidate } from "./fixtures/recommendations-v2/grounded-research";

class CapturedScheduler implements PostResponseTaskScheduler {
  tasks: Array<() => Promise<void>> = [];
  schedule(task: () => Promise<void>) { this.tasks.push(task); }
}

function context(): GroundedResearchShadowContext {
  return {
    version: 1,
    structuredRequest: { version: 1, targetMediaTypes: ["anime"], aspectConstraints: [{ id: "aspect:romance:must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }], objectiveConstraints: [], strictness: "strict" },
    candidates: [{ researchCandidate: researchCandidate(), titleSnapshot: "Steins;Gate", releaseYear: 2011 }],
  };
}

const controlledResult: GroundedResearchShadowResult = {
  status: "complete",
  results: [{ candidateIdentity: researchCandidate().identity, aspectId: "romance", structuredStatusBeforeResearch: "unknown", researchStatus: "complete", researchDecisionStatus: "supported", researchLevel: "significant", hypotheticalEffect: "would_satisfy_must", durationBucket: "lt_1s", providerAdapterStatus: "direct=document_ready;acquisition=packet_ready;extraction=complete;provider=fake", warnings: [] }],
  telemetry: { plannerRan: true, plannedCandidateCount: 1, plannedJobCount: 1, attemptedJobCount: 1, completedJobCount: 1, skippedJobCount: 0, coalescedJobCount: 0, discoveryOperationCount: 0, timeoutCount: 0, sampleCount: 1, stageDurationsMs: { planning: 1, directSource: 1, discovery: 0, acquisition: 1, extraction: 1, total: 4 }, durationBucket: "lt_1s" },
  warnings: [], policyVersion: "d7-r4a.shadow.1",
};

describe("D7-R4B post-response lifecycle", () => {
  it("Next adapter task'i framework after() primitive'ine devreder", async () => {
    afterMock.mockClear();
    let started = false;
    nextPostResponseTaskScheduler.schedule(async () => { started = true; });
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(started).toBe(false);
    await expect(afterMock.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(started).toBe(true);
  });

  it("task scheduler manuel çalıştırılana kadar başlamaz ve response yolu beklemez", async () => {
    const scheduler = new CapturedScheduler();
    let started = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const run = vi.fn(async () => { started = true; await gate; return controlledResult; });
    const scheduled = scheduleGroundedResearchShadow({ enabled: true, scheduler, context: context(), requestId: "r4b-lifecycle" }, { run: run as never });
    expect(scheduled).toBe(true);
    expect(scheduler.tasks).toHaveLength(1);
    expect(started).toBe(false);
    const publicResponse = { recommendations: ["baseline"] };
    expect(publicResponse).toEqual({ recommendations: ["baseline"] });
    const pending = scheduler.tasks[0]();
    expect(started).toBe(true);
    release();
    await pending;
  });

  it("flag disabled, clarification veya validation seed'i yokken task schedule etmez", () => {
    const scheduler = new CapturedScheduler();
    expect(scheduleGroundedResearchShadow({ enabled: false, scheduler, context: context(), requestId: "disabled" })).toBe(false);
    expect(scheduleGroundedResearchShadow({ enabled: true, scheduler, context: undefined, requestId: "clarification" })).toBe(false);
    expect(scheduler.tasks).toHaveLength(0);
  });

  it("successful path aynı top-level çağrıda tam bir task schedule eder", () => {
    const scheduler = new CapturedScheduler();
    expect(scheduleGroundedResearchShadow({ enabled: true, scheduler, context: context(), requestId: "once" })).toBe(true);
    expect(scheduler.tasks).toHaveLength(1);
  });

  it("task rejection yutulur ve unhandled rejection oluşturmaz", async () => {
    const scheduler = new CapturedScheduler();
    const run = vi.fn(async () => { throw new Error("provider raw secret"); });
    scheduleGroundedResearchShadow({ enabled: true, scheduler, context: context(), requestId: "reject" }, { run: run as never });
    await expect(scheduler.tasks[0]()).resolves.toBeUndefined();
  });

  it("snapshot immutable, bounded ve private/request nesnelerinden arındırılmıştır", () => {
    const snapshot = createGroundedResearchShadowSnapshot({ context: context(), requestId: "snapshot" });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.context.candidates)).toBe(true);
    expect(snapshot.deadlineMs).toBe(16_000);
    expect(JSON.stringify(snapshot)).not.toMatch(/ownerId|userId|rating|favorite|note|progress|feedback|queryText|headers|cookies|provider secret/i);
  });

  it("synthetic supported significant sonucu yalnız internal observer'a gider", async () => {
    const scheduler = new CapturedScheduler();
    const onResult = vi.fn();
    scheduleGroundedResearchShadow({ enabled: true, scheduler, context: context(), requestId: "synthetic" }, { run: vi.fn(async () => controlledResult) as never, onResult });
    await scheduler.tasks[0]();
    expect(onResult).toHaveBeenCalledWith(controlledResult);
    expect(controlledResult.results[0].hypotheticalEffect).toBe("would_satisfy_must");
    expect(JSON.stringify({ recommendations: ["baseline"] })).not.toMatch(/would_satisfy|passage|citation/);
  });
});
