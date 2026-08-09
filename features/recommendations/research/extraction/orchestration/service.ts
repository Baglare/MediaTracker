import "server-only";

import { decodeGroundedExtractionRequest } from "../domain/codec";
import { buildGroundedEvidenceUnits } from "../domain/evidence-units";
import type { GroundedExtractionProviderId, GroundedExtractionResult } from "../domain/types";
import { validateGroundedExtractionProvenance } from "../domain/provenance";
import { buildMinimizedGroundedModelInput } from "../prompt/input-builder";
import { GroqGroundedExtractionAdapter } from "../providers/groq/adapter";
import { OpenAiGroundedExtractionAdapter } from "../providers/openai/adapter";
import { OpenRouterGroundedExtractionAdapter } from "../providers/openrouter/adapter";
import type { GroundedExtractionProviderPort } from "../providers/port";
import { readGroundedExtractionSelectionEnvironment, selectGroundedExtractionProviders } from "../providers/selection";
import { emptyGroundedExtractionTelemetry } from "../telemetry";
import { aggregateGroundedExtraction } from "./aggregator";
import { validateProviderGroundedObservation } from "./extractor";

export interface GroundedExtractionDependencies {
  environment?: NodeJS.ProcessEnv;
  adapters?: Partial<Record<GroundedExtractionProviderId, GroundedExtractionProviderPort>>;
  now?: () => Date;
  signal?: AbortSignal;
}
const pending = new Map<string, Promise<GroundedExtractionResult>>();
class GroundedExtractionSemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 2) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    try { return await operation(); }
    finally { this.active -= 1; this.waiters.shift()?.(); }
  }
}
const extractionSemaphore = new GroundedExtractionSemaphore();
function defaults(): Record<GroundedExtractionProviderId, GroundedExtractionProviderPort> { return { groq: new GroqGroundedExtractionAdapter(), openai: new OpenAiGroundedExtractionAdapter(), openrouter: new OpenRouterGroundedExtractionAdapter() }; }
function failure(status: GroundedExtractionResult["status"], warnings: readonly string[], telemetry = emptyGroundedExtractionTelemetry(), providerId?: GroundedExtractionProviderId, modelId?: string): GroundedExtractionResult { return { status, ...(providerId ? { providerId } : {}), ...(modelId ? { modelId } : {}), assessments: [], claims: [], telemetry, warnings }; }

async function execute(value: unknown, dependencies: GroundedExtractionDependencies): Promise<GroundedExtractionResult> {
  const decoded = await decodeGroundedExtractionRequest(value);
  if (!decoded.ok) return failure("output_invalid", decoded.issues.map((item) => item.code));
  const request = decoded.value;
  const units = await buildGroundedEvidenceUnits({ packet: request.packet, maxUnits: request.maxEvidenceUnits });
  const telemetry = emptyGroundedExtractionTelemetry(); telemetry.evidenceUnitCount = units.eligibleUnits.length;
  if (units.eligibleUnits.length === 0) {
    const aggregated = await aggregateGroundedExtraction({ request, output: { version: 1, assessments: [] }, units: [], now: dependencies.now });
    return { status: "no_claims_extracted", assessments: [], claims: [], decision: aggregated.decision, telemetry, warnings: ["grounded_evidence_units_insufficient"] };
  }
  const environment = readGroundedExtractionSelectionEnvironment(dependencies.environment);
  const selected = selectGroundedExtractionProviders(environment);
  if (selected.length === 0) return failure("disabled", [...environment.warnings, ...Object.values(environment.providers).flatMap((item) => item.warnings)], telemetry);
  const providerId = selected[0]; const configuration = environment.providers[providerId];
  telemetry.attemptedProviders = [providerId];
  if (configuration.model && !configuration.modelSupported) return failure("model_unsupported", configuration.warnings, telemetry, providerId, configuration.model);
  if (!configuration.valid || !configuration.key || !configuration.model) return failure("disabled", configuration.warnings, telemetry, providerId, configuration.model ?? undefined);
  const adapters = { ...defaults(), ...dependencies.adapters }; const adapter = adapters[providerId];
  const modelInput = buildMinimizedGroundedModelInput({ request, units: units.eligibleUnits });
  const startedAt = (dependencies.now ?? (() => new Date()))(); telemetry.requestCount = 1;
  const adapterResult = await adapter.extract({ modelInput, apiKey: configuration.key, model: configuration.model, maxAssessments: request.maxOutputAssessments, signal: dependencies.signal });
  telemetry.retryCount = adapterResult.telemetry.retryCount; telemetry.rateLimitCount = adapterResult.telemetry.rateLimitCount; telemetry.responseBytes = adapterResult.telemetry.responseBytes; telemetry.durationMs = adapterResult.telemetry.durationMs; telemetry.timeoutCount = adapterResult.status === "budget_exhausted" ? 1 : 0; if (adapterResult.telemetry.requestId) telemetry.requestId = adapterResult.telemetry.requestId;
  if (adapterResult.status !== "success") return failure(adapterResult.status, adapterResult.warnings, telemetry, providerId, adapterResult.modelId);
  const grounded = validateProviderGroundedObservation({ request, output: adapterResult.output, units: units.units, excludedUnitIds: units.excludedUnitIds });
  if (!grounded.ok) return failure("grounding_invalid", grounded.issues.map((item) => item.code), telemetry, providerId, adapterResult.modelId);
  telemetry.assessmentCount = grounded.value.assessments.length;
  const aggregated = await aggregateGroundedExtraction({ request, output: grounded.value, units: units.eligibleUnits, now: dependencies.now }); telemetry.claimCount = aggregated.claims.length;
  const completedAt = (dependencies.now ?? (() => new Date()))();
  const provenance = { providerId, modelId: adapterResult.modelId, schemaVersion: request.schemaVersion, extractorPolicyVersion: request.extractorPolicyVersion, packetContentHash: request.packet.packetContentHash, extractionStartedAt: startedAt.toISOString(), extractionCompletedAt: completedAt.toISOString(), assessmentCount: grounded.value.assessments.length, validEvidenceUnitCount: units.eligibleUnits.length, responseStatus: aggregated.claims.length > 0 ? "validated" as const : "no_claims" as const, warnings: adapterResult.warnings };
  if (!validateGroundedExtractionProvenance(provenance).ok) return failure("output_invalid", ["grounded_provenance_invalid"], telemetry, providerId, adapterResult.modelId);
  return { status: aggregated.claims.length > 0 ? "claims_extracted" : "no_claims_extracted", providerId, modelId: adapterResult.modelId, assessments: grounded.value.assessments, claims: aggregated.claims, decision: aggregated.decision, provenance, telemetry, warnings: adapterResult.warnings };
}

export async function extractGroundedResearch(value: unknown, dependencies: GroundedExtractionDependencies = {}): Promise<GroundedExtractionResult> {
  const candidate = value && typeof value === "object" ? value as { packet?: { packetContentHash?: unknown }; aspectDefinition?: { aspectId?: unknown }; extractorPolicyVersion?: unknown } : {};
  const env = readGroundedExtractionSelectionEnvironment(dependencies.environment); const selectedProvider = selectGroundedExtractionProviders(env)[0]; const providerKey = selectedProvider ?? "disabled"; const model = selectedProvider ? env.providers[selectedProvider].model ?? "" : "";
  const key = JSON.stringify([candidate.packet?.packetContentHash ?? "invalid", candidate.aspectDefinition?.aspectId ?? "invalid", providerKey, model, candidate.extractorPolicyVersion ?? "invalid"]);
  const active = pending.get(key); if (active) { const result = await active; return { ...result, telemetry: { ...result.telemetry, coalescedCount: result.telemetry.coalescedCount + 1 } }; }
  const operation = extractionSemaphore.run(() => execute(value, dependencies)); pending.set(key, operation); try { return await operation; } finally { pending.delete(key); }
}
