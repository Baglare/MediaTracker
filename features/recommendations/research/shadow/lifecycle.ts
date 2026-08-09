import "server-only";

import { runGroundedResearchShadow } from "./orchestrator";
import type { PostResponseTaskScheduler } from "./scheduler";
import { GROUNDED_RESEARCH_SHADOW_POLICY_VERSION, GROUNDED_RESEARCH_SHADOW_TIMEOUT_MS, type GroundedResearchShadowContext, type GroundedResearchShadowResult } from "./types";

export interface GroundedResearchShadowLifecycleDependencies {
  run?: typeof runGroundedResearchShadow;
  onResult?: (result: GroundedResearchShadowResult) => void;
}

interface ScheduledGroundedResearchShadowSnapshot {
  context: GroundedResearchShadowContext;
  requestId: string;
  deadlineMs: number;
  policyVersion: typeof GROUNDED_RESEARCH_SHADOW_POLICY_VERSION;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export function createGroundedResearchShadowSnapshot(input: {
  context: GroundedResearchShadowContext;
  requestId: string;
}): Readonly<ScheduledGroundedResearchShadowSnapshot> {
  return deepFreeze({
    context: structuredClone(input.context),
    requestId: input.requestId,
    deadlineMs: GROUNDED_RESEARCH_SHADOW_TIMEOUT_MS,
    policyVersion: GROUNDED_RESEARCH_SHADOW_POLICY_VERSION,
  });
}

export function scheduleGroundedResearchShadow(input: {
  enabled: boolean;
  scheduler: PostResponseTaskScheduler;
  context?: GroundedResearchShadowContext;
  requestId: string;
}, dependencies: GroundedResearchShadowLifecycleDependencies = {}): boolean {
  if (!input.enabled || !input.context || input.context.candidates.length === 0) return false;
  const snapshot = createGroundedResearchShadowSnapshot({ context: input.context, requestId: input.requestId });
  const run = dependencies.run ?? runGroundedResearchShadow;
  input.scheduler.schedule(async () => {
    try {
      const result = await run({ ...snapshot.context, requestId: snapshot.requestId }, { overallTimeoutMs: snapshot.deadlineMs });
      dependencies.onResult?.(result);
    } catch {
      // The scheduler owns this promise; no raw error leaves the lifecycle boundary.
    }
  });
  return true;
}
