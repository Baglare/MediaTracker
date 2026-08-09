import "server-only";

import { SecureResearchHttpClientImpl } from "../network/secure-http-client";
import type { SecureResearchHttpClient } from "../network/types";
import { researchDirectWikimediaSource } from "../orchestration/direct-source-research";
import { discoverResearchSources } from "../discovery/orchestrator";
import { acquireResearchSources } from "../acquisition/orchestrator";
import { RESEARCH_ACQUISITION_POLICY_VERSION } from "../acquisition/types";
import { extractGroundedResearch } from "../extraction/orchestration/service";
import { buildGroundedAspectDefinition } from "../extraction/domain/provenance";
import { GROUNDED_EXTRACTION_MAX_ASSESSMENTS, GROUNDED_EXTRACTION_MAX_EVIDENCE_UNITS, GROUNDED_EXTRACTION_POLICY_VERSION, GROUNDED_EXTRACTION_SCHEMA_VERSION } from "../extraction/domain/types";
import { buildResearchEvidenceHandoff, canResearchDecisionDriveHardConstraint, mapResearchDecisionToDeterministicSignal } from "../domain/decisions";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "../domain/source-registry";
import type { AspectResearchDecision, PersistedResearchCitation, PersistedResearchClaim, ResearchConstraintRequest } from "../domain/types";
import { RESEARCH_POLICY_VERSION } from "../cache/key";
import { planResearch } from "../planning/planner";
import type { ResearchBudget, ResearchJob, ResearchPlan } from "../domain/types";
import { decodeGroundedResearchShadowInput } from "./codec";
import { isGroundedResearchShadowEnabled } from "./config";
import {
  GROUNDED_RESEARCH_SHADOW_MAX_ASPECTS_PER_CANDIDATE,
  GROUNDED_RESEARCH_SHADOW_MAX_CANDIDATES,
  GROUNDED_RESEARCH_SHADOW_MAX_CONCURRENCY,
  GROUNDED_RESEARCH_SHADOW_MAX_JOBS,
  GROUNDED_RESEARCH_SHADOW_POLICY_VERSION,
  GROUNDED_RESEARCH_SHADOW_TIMEOUT_MS,
  type GroundedResearchShadowInput,
  type GroundedResearchShadowResult,
  type GroundedResearchShadowTelemetry,
  type ResearchShadowCandidateResult,
  type ResearchShadowDurationBucket,
  type ResearchShadowHypotheticalEffect,
} from "./types";

const SHADOW_PLANNER_BUDGET: Readonly<ResearchBudget> = Object.freeze({
  maxCandidates: GROUNDED_RESEARCH_SHADOW_MAX_CANDIDATES,
  maxAspectsPerCandidate: GROUNDED_RESEARCH_SHADOW_MAX_ASPECTS_PER_CANDIDATE,
  maxResearchJobs: GROUNDED_RESEARCH_SHADOW_MAX_JOBS,
  maxExternalSearchOperations: 2,
  maxConcurrentOperations: GROUNDED_RESEARCH_SHADOW_MAX_CONCURRENCY,
  totalTimeoutMs: 8_000,
});

export interface GroundedResearchShadowDependencies {
  environment?: NodeJS.ProcessEnv;
  plan?: typeof planResearch;
  directResearch?: typeof researchDirectWikimediaSource;
  discover?: typeof discoverResearchSources;
  acquire?: typeof acquireResearchSources;
  extract?: typeof extractGroundedResearch;
  httpClient?: SecureResearchHttpClient;
  now?: () => Date;
  monotonicNow?: () => number;
  overallTimeoutMs?: number;
}

function emptyTelemetry(): GroundedResearchShadowTelemetry {
  return { plannerRan: false, plannedCandidateCount: 0, plannedJobCount: 0, attemptedJobCount: 0, completedJobCount: 0, skippedJobCount: 0, coalescedJobCount: 0, discoveryOperationCount: 0, timeoutCount: 0, durationBucket: "lt_1s" };
}

function durationBucket(ms: number): ResearchShadowDurationBucket {
  return ms < 1_000 ? "lt_1s" : ms < 4_000 ? "1_4s" : ms < 8_000 ? "4_8s" : ms < 16_000 ? "8_16s" : "gte_16s";
}

function safeWarnings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => /^[a-z0-9_.:-]{1,80}$/i.test(value) ? value : "shadow_warning_redacted"))].slice(0, 8);
}

function result(status: GroundedResearchShadowResult["status"], telemetry: GroundedResearchShadowTelemetry, results: readonly ResearchShadowCandidateResult[] = [], warnings: readonly string[] = []): GroundedResearchShadowResult {
  return { status, results, telemetry, warnings: safeWarnings(warnings), policyVersion: GROUNDED_RESEARCH_SHADOW_POLICY_VERSION };
}

function eligibleConstraint(constraint: ResearchConstraintRequest): boolean {
  return constraint.source === "explicit"
    && (constraint.role === "must" || constraint.role === "avoid")
    && (constraint.currentStructuredDecision === "unknown" || constraint.currentStructuredDecision === "partial");
}

export function mapShadowHypotheticalEffect(decision: AspectResearchDecision | undefined, constraint: ResearchConstraintRequest, claims: readonly PersistedResearchClaim[], citations: readonly PersistedResearchCitation[]): ResearchShadowHypotheticalEffect {
  if (!decision || decision.status === "unknown") return "would_remain_unknown";
  const hardDecisionAllowed = canResearchDecisionDriveHardConstraint({ decision, claims, citations });
  const signal = mapResearchDecisionToDeterministicSignal({ decision, role: constraint.role, minimumLevel: constraint.minimumLevel, hardDecisionAllowed });
  if (constraint.role === "must") return signal.mustSatisfied ? "would_satisfy_must" : "would_fail_must";
  if (signal.avoidTriggered) return "would_reject_avoid";
  if (signal.explicitAbsenceEvidence) return "would_clear_avoid";
  return "no_effect";
}

function createDeadline(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false;
  const parentAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason); else parent?.addEventListener("abort", parentAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error("research_shadow_deadline")); }, timeoutMs);
  return { signal: controller.signal, timedOut: () => timedOut, cleanup: () => { clearTimeout(timer); parent?.removeEventListener("abort", parentAbort); } };
}

function stageStatus(input: { direct: string; discovery?: string; acquisition?: string; extraction?: string; provider?: string }): string {
  return [`direct=${input.direct}`, input.discovery ? `discovery=${input.discovery}` : null, input.acquisition ? `acquisition=${input.acquisition}` : null, input.extraction ? `extraction=${input.extraction}` : null, input.provider ? `provider=${input.provider}` : null].filter(Boolean).join(";").slice(0, 240);
}

async function runJob(input: { job: ResearchJob; context: GroundedResearchShadowInput["candidates"][number]; requestId: string; signal: AbortSignal }, dependencies: GroundedResearchShadowDependencies): Promise<{ result: ResearchShadowCandidateResult; discoveryUsed: boolean; completed: boolean }> {
  const startedAt = (dependencies.monotonicNow ?? Date.now)();
  const warnings: string[] = [];
  const constraint = input.context.researchCandidate.unresolvedConstraints.find((item) => item.aspectId === input.job.aspectId && item.role === input.job.role) as ResearchConstraintRequest;
  const httpClient = dependencies.httpClient ?? new SecureResearchHttpClientImpl();
  const directResearch = dependencies.directResearch ?? researchDirectWikimediaSource;
  const discover = dependencies.discover ?? discoverResearchSources;
  const acquire = dependencies.acquire ?? acquireResearchSources;
  const extract = dependencies.extract ?? extractGroundedResearch;
  let directStatus = "not_attempted"; let discoveryStatus: string | undefined; let acquisitionStatus: string | undefined; let extractionStatus: string | undefined; let provider: string | undefined;
  try {
    if (input.signal.aborted) throw new Error("research_shadow_aborted");
    const direct = await directResearch({ identity: input.context.researchCandidate.identity, versionScope: input.context.researchCandidate.versionScope, httpClient, environment: dependencies.environment, now: dependencies.now });
    directStatus = direct.status; warnings.push(...direct.warnings);
    if (input.signal.aborted) throw new Error("research_shadow_aborted");
    const directDocuments = direct.status === "document_ready"
      ? direct.documents.flatMap((document, index) => direct.citations[index] ? [{ document, citation: direct.citations[index] }] : [])
      : [];
    let discoveredSources: Awaited<ReturnType<typeof discoverResearchSources>>["sources"] = [];
    let discoveryUsed = false;
    if (directDocuments.length === 0 && direct.wikimediaIdentity && input.job.budget.maxExternalSearchOperations > 0) {
      discoveryUsed = true;
      const discovery = await discover({
        version: 1, candidateIdentity: input.context.researchCandidate.identity, versionScope: input.context.researchCandidate.versionScope,
        titleSnapshot: input.context.titleSnapshot, ...(input.context.releaseYear ? { releaseYear: input.context.releaseYear } : {}),
        mediaType: input.context.researchCandidate.mediaType, aspectId: input.job.aspectId, role: input.job.role,
        ...(input.job.minimumLevel ? { minimumLevel: input.job.minimumLevel } : {}), allowedSourceIds: ["wikipedia"], allowedDomains: ["wikipedia.org"],
        maxSources: 5, requestId: `${input.requestId}:discovery`, researchPolicyVersion: RESEARCH_POLICY_VERSION,
      });
      discoveryStatus = discovery.status; warnings.push(...discovery.warnings); discoveredSources = discovery.sources;
      if (input.signal.aborted) throw new Error("research_shadow_aborted");
    }
    if (!direct.wikimediaIdentity || (directDocuments.length === 0 && discoveredSources.length === 0)) {
      const duration = Math.max(0, (dependencies.monotonicNow ?? Date.now)() - startedAt);
      return { discoveryUsed, completed: false, result: { candidateIdentity: input.context.researchCandidate.identity, aspectId: input.job.aspectId, structuredStatusBeforeResearch: constraint.currentStructuredDecision as "partial" | "unknown", researchStatus: discoveryStatus ?? directStatus, researchDecisionStatus: "unavailable", researchLevel: null, hypotheticalEffect: "would_remain_unknown", durationBucket: durationBucket(duration), providerAdapterStatus: stageStatus({ direct: directStatus, discovery: discoveryStatus }), warnings: safeWarnings(warnings) } };
    }
    const acquisition = await acquire({
      version: 1, candidateIdentity: input.context.researchCandidate.identity, versionScope: input.context.researchCandidate.versionScope,
      wikimediaIdentity: direct.wikimediaIdentity, aspectId: input.job.aspectId, role: input.job.role,
      ...(input.job.minimumLevel ? { minimumLevel: input.job.minimumLevel } : {}), directDocuments, discoveredSources,
      maxDocuments: 2, maxPassages: 8, maxPacketCharacters: 10_000, requestId: `${input.requestId}:acquisition`,
      researchPolicyVersion: RESEARCH_POLICY_VERSION, sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
      acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION,
    }, { httpClient, environment: dependencies.environment, now: dependencies.now, monotonicNow: dependencies.monotonicNow });
    acquisitionStatus = acquisition.status; warnings.push(...acquisition.warnings);
    if (input.signal.aborted) throw new Error("research_shadow_aborted");
    if (acquisition.status !== "packet_ready" || !acquisition.packet) {
      const duration = Math.max(0, (dependencies.monotonicNow ?? Date.now)() - startedAt);
      return { discoveryUsed, completed: false, result: { candidateIdentity: input.context.researchCandidate.identity, aspectId: input.job.aspectId, structuredStatusBeforeResearch: constraint.currentStructuredDecision as "partial" | "unknown", researchStatus: acquisition.status, researchDecisionStatus: "unavailable", researchLevel: null, hypotheticalEffect: "would_remain_unknown", durationBucket: durationBucket(duration), providerAdapterStatus: stageStatus({ direct: directStatus, discovery: discoveryStatus, acquisition: acquisitionStatus }), warnings: safeWarnings(warnings) } };
    }
    const extraction = await extract({ version: 1, packet: acquisition.packet, aspectDefinition: buildGroundedAspectDefinition(input.job.aspectId), extractorPolicyVersion: GROUNDED_EXTRACTION_POLICY_VERSION, schemaVersion: GROUNDED_EXTRACTION_SCHEMA_VERSION, requestId: `${input.requestId}:extraction`, maxEvidenceUnits: GROUNDED_EXTRACTION_MAX_EVIDENCE_UNITS, maxOutputAssessments: GROUNDED_EXTRACTION_MAX_ASSESSMENTS }, { environment: dependencies.environment, now: dependencies.now, signal: input.signal });
    extractionStatus = extraction.status; provider = extraction.providerId; warnings.push(...extraction.warnings);
    const handoff = extraction.decision
      ? buildResearchEvidenceHandoff({ candidateIdentity: input.context.researchCandidate.identity, versionScope: input.context.researchCandidate.versionScope, decisions: [extraction.decision], claims: extraction.claims, citations: acquisition.packet.citations, researchStatus: "complete" })
      : undefined;
    const duration = Math.max(0, (dependencies.monotonicNow ?? Date.now)() - startedAt);
    return { discoveryUsed, completed: Boolean(handoff), result: { candidateIdentity: input.context.researchCandidate.identity, aspectId: input.job.aspectId, structuredStatusBeforeResearch: constraint.currentStructuredDecision as "partial" | "unknown", researchStatus: extraction.status, researchDecisionStatus: handoff?.aspectDecisions[0]?.status ?? "unavailable", researchLevel: handoff?.aspectDecisions[0]?.level ?? null, hypotheticalEffect: mapShadowHypotheticalEffect(handoff?.aspectDecisions[0], constraint, handoff?.claims ?? [], handoff?.citations ?? []), durationBucket: durationBucket(duration), providerAdapterStatus: stageStatus({ direct: directStatus, discovery: discoveryStatus, acquisition: acquisitionStatus, extraction: extractionStatus, provider }), warnings: safeWarnings(warnings) } };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "research_shadow_job_failed");
    const duration = Math.max(0, (dependencies.monotonicNow ?? Date.now)() - startedAt);
    return { discoveryUsed: Boolean(discoveryStatus), completed: false, result: { candidateIdentity: input.context.researchCandidate.identity, aspectId: input.job.aspectId, structuredStatusBeforeResearch: constraint.currentStructuredDecision as "partial" | "unknown", researchStatus: input.signal.aborted ? "budget_exhausted" : "adapter_unavailable", researchDecisionStatus: "unavailable", researchLevel: null, hypotheticalEffect: "would_remain_unknown", durationBucket: durationBucket(duration), providerAdapterStatus: stageStatus({ direct: directStatus, discovery: discoveryStatus, acquisition: acquisitionStatus, extraction: extractionStatus, provider }), warnings: safeWarnings(warnings) } };
  }
}

export async function runGroundedResearchShadow(value: unknown, dependencies: GroundedResearchShadowDependencies = {}): Promise<GroundedResearchShadowResult> {
  const telemetry = emptyTelemetry(); const startedAt = (dependencies.monotonicNow ?? Date.now)();
  if (!isGroundedResearchShadowEnabled(dependencies.environment)) return result("disabled", telemetry);
  if (value && typeof value === "object" && (value as { signal?: AbortSignal }).signal?.aborted) return result("aborted", telemetry, [], ["research_shadow_parent_aborted"]);
  const decoded = decodeGroundedResearchShadowInput(value);
  if (!decoded.ok) return result("invalid_input", telemetry, [], decoded.issues.map((item) => item.code));
  const input = decoded.value;
  const eligibleCandidates = input.candidates.map((item) => ({ ...item, researchCandidate: { ...item.researchCandidate, unresolvedConstraints: item.researchCandidate.unresolvedConstraints.filter(eligibleConstraint) } })).filter((item) => item.researchCandidate.unresolvedConstraints.length > 0);
  const planner = dependencies.plan ?? planResearch; telemetry.plannerRan = true;
  const plan: ResearchPlan = planner({ candidates: eligibleCandidates.map((item) => item.researchCandidate), budget: SHADOW_PLANNER_BUDGET });
  telemetry.plannedCandidateCount = new Set(plan.jobs.map((job) => job.candidateScope.scopeKey)).size; telemetry.plannedJobCount = plan.jobs.length; telemetry.coalescedJobCount = plan.skipped.filter((item) => item.reason === "duplicate_candidate_aspect").length;
  if (plan.jobs.length === 0) { telemetry.durationBucket = durationBucket(Math.max(0, (dependencies.monotonicNow ?? Date.now)() - startedAt)); return result("no_jobs", telemetry, [], plan.warnings); }
  const contexts = new Map(eligibleCandidates.map((item) => [item.researchCandidate.versionScope.scopeKey, item]));
  const deadline = createDeadline(input.signal, Math.min(GROUNDED_RESEARCH_SHADOW_TIMEOUT_MS, dependencies.overallTimeoutMs ?? GROUNDED_RESEARCH_SHADOW_TIMEOUT_MS));
  const completed = new Map<number, Awaited<ReturnType<typeof runJob>>>();
  const operations = plan.jobs.map(async (job, index) => { const context = contexts.get(job.candidateScope.scopeKey); if (!context) return; telemetry.attemptedJobCount += 1; const jobResult = await runJob({ job, context, requestId: `${input.requestId}:${index}`, signal: deadline.signal }, dependencies); completed.set(index, jobResult); });
  const all = Promise.all(operations); void all.catch(() => undefined);
  const aborted = new Promise<"aborted">((resolve) => deadline.signal.addEventListener("abort", () => resolve("aborted"), { once: true }));
  const completion = await Promise.race([all.then(() => "complete" as const), aborted]);
  deadline.cleanup();
  const jobResults = [...completed.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
  telemetry.completedJobCount = jobResults.filter((item) => item.completed).length; telemetry.skippedJobCount = telemetry.plannedJobCount - telemetry.completedJobCount; telemetry.discoveryOperationCount = jobResults.filter((item) => item.discoveryUsed).length;
  const elapsed = Math.max(0, (dependencies.monotonicNow ?? Date.now)() - startedAt); telemetry.durationBucket = durationBucket(elapsed);
  if (completion === "aborted") { telemetry.timeoutCount = deadline.timedOut() ? 1 : 0; return result(deadline.timedOut() ? "budget_exhausted" : "aborted", telemetry, jobResults.map((item) => item.result), [deadline.timedOut() ? "research_shadow_deadline" : "research_shadow_parent_aborted"]); }
  return result(telemetry.completedJobCount === telemetry.plannedJobCount ? "complete" : "partial", telemetry, jobResults.map((item) => item.result), plan.warnings);
}
