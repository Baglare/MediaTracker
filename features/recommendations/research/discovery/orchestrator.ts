import "server-only";

import { createHash } from "node:crypto";
import { RESEARCH_POLICY_VERSION } from "../cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "../domain/source-registry";
import { GroqWebSearchDiscoveryAdapter } from "./adapters/groq/adapter";
import { OpenAiWebSearchDiscoveryAdapter } from "./adapters/openai/adapter";
import type { OpenAiWebDiscoveryEnvironment } from "./adapters/openai/config";
import { OpenRouterWebSearchDiscoveryAdapter } from "./adapters/openrouter/adapter";
import { decodeResearchDiscoveryRequest } from "./codec";
import {
  deriveResearchDiscoverySourcePolicy,
  requestMatchesResearchDiscoverySourcePolicy,
  resolveDiscoveredResearchUrl,
} from "./domain-policy";
import type { SearchDiscoveryPort } from "./port";
import { buildResearchDiscoveryQueries } from "./query-builder";
import {
  readResearchDiscoverySelectionEnvironment,
  selectResearchDiscoveryProviders,
  type ResearchDiscoveryProviderEnvironment,
  type ResearchDiscoverySelectionEnvironment,
} from "./selection";
import {
  emptyResearchDiscoveryTelemetry,
  type DiscoveredResearchSource,
  type ResearchDiscoveryProviderId,
  type ResearchDiscoveryRequest,
  type ResearchDiscoveryResult,
  type ResearchDiscoveryTelemetry,
} from "./types";

const DISCOVERY_CONCURRENCY = 2;
const DISCOVERY_OPERATION_TIMEOUT_MS = 5_000;

class DiscoverySemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= DISCOVERY_CONCURRENCY) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    try { return await operation(); }
    finally { this.active -= 1; this.waiters.shift()?.(); }
  }
}

export interface ResearchDiscoveryOrchestratorDependencies {
  ports?: Partial<Record<ResearchDiscoveryProviderId, SearchDiscoveryPort>>;
  port?: SearchDiscoveryPort;
  readSelectionEnvironment?: () => ResearchDiscoverySelectionEnvironment;
  /** R2B test/backward-compatibility injection; applies only to OpenAI. */
  readEnvironment?: () => OpenAiWebDiscoveryEnvironment;
  now?: () => number;
}

function emptyResult(
  status: ResearchDiscoveryResult["status"],
  warnings: readonly string[],
  attemptedQueries: readonly string[] = [],
  attemptedProviders: readonly ResearchDiscoveryProviderId[] = [],
): ResearchDiscoveryResult {
  return {
    status, sources: [], attemptedQueries, provider: null, adapter: null,
    attemptedProviders, telemetry: emptyResearchDiscoveryTelemetry(), warnings,
  };
}

function fingerprint(parts: readonly string[]): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

function mergeTelemetry(left: ResearchDiscoveryTelemetry, right: ResearchDiscoveryTelemetry): ResearchDiscoveryTelemetry {
  return {
    ...left,
    requestCount: left.requestCount + right.requestCount,
    durationMs: left.durationMs + right.durationMs,
    rateLimits: left.rateLimits + right.rateLimits,
    retryCount: left.retryCount + right.retryCount,
    timeouts: left.timeouts + right.timeouts,
    responseBytes: left.responseBytes + right.responseBytes,
    webSearchCallCount: left.webSearchCallCount + right.webSearchCallCount,
    rawSourceUrlCount: left.rawSourceUrlCount + right.rawSourceUrlCount,
    acceptedSourceCount: left.acceptedSourceCount + right.acceptedSourceCount,
    rejectedSourceCount: left.rejectedSourceCount + right.rejectedSourceCount,
    rejectedDomainCount: left.rejectedDomainCount + right.rejectedDomainCount,
    malformedItemCount: left.malformedItemCount + right.malformedItemCount,
    coalescedCount: left.coalescedCount + right.coalescedCount,
    ...(right.httpStatusClass ? { httpStatusClass: right.httpStatusClass } : {}),
    ...(right.requestId ? { requestId: right.requestId } : {}),
    ...(right.providerId ? { providerId: right.providerId } : {}),
  };
}

export class ResearchDiscoveryOrchestrator {
  private readonly pending = new Map<string, Promise<ResearchDiscoveryResult>>();
  private readonly semaphore = new DiscoverySemaphore();
  private readonly now: () => number;

  constructor(private readonly dependencies: ResearchDiscoveryOrchestratorDependencies = {}) {
    this.now = dependencies.now ?? Date.now;
  }

  async discover(value: unknown): Promise<ResearchDiscoveryResult> {
    const decoded = decodeResearchDiscoveryRequest(value);
    if (!decoded.ok) return emptyResult("invalid_request", decoded.issues.map((item) => item.code));
    const request = decoded.value;
    if (request.researchPolicyVersion !== RESEARCH_POLICY_VERSION) return emptyResult("invalid_request", ["research_policy_version_mismatch"]);
    const policy = deriveResearchDiscoverySourcePolicy(request);
    if (!policy || policy.allowedDomains.length === 0 || !requestMatchesResearchDiscoverySourcePolicy(request, policy)) {
      return emptyResult("source_policy_blocked", [policy ? "discovery_request_policy_mismatch" : "no_allowed_domains"]);
    }
    let queries: readonly string[];
    try { queries = buildResearchDiscoveryQueries(request); }
    catch (error) { return emptyResult("invalid_request", [error instanceof Error ? error.message : "discovery_query_invalid"]); }
    if (queries.length === 0 || queries.length > 2) return emptyResult("invalid_request", ["discovery_query_budget_invalid"]);

    const environment = this.selectionEnvironment();
    if (this.dependencies.port && this.dependencies.readEnvironment && !environment.providers.openai.valid) {
      return emptyResult("disabled", environment.providers.openai.warnings, queries);
    }
    const providerIds = this.dependencies.port
      ? [this.dependencies.port.providerId]
      : selectResearchDiscoveryProviders(environment, request.role);
    if (providerIds.length === 0) return emptyResult("disabled", [...environment.warnings, "research_discovery_no_enabled_provider"], queries);

    const key = fingerprint([
      request.versionScope.scopeKey, request.aspectId, request.role, request.minimumLevel ?? "",
      request.researchPolicyVersion, environment.mode, ...providerIds, ...policy.allowedDomains, ...queries,
    ]);
    const active = this.pending.get(key);
    if (active) {
      const result = await active;
      return { ...result, telemetry: { ...result.telemetry, coalescedCount: result.telemetry.coalescedCount + 1 } };
    }
    const operation = this.semaphore.run(() => this.execute({ request, queries, policy, environment, providerIds, queryFingerprint: key }));
    this.pending.set(key, operation);
    try { return await operation; }
    finally { this.pending.delete(key); }
  }

  private selectionEnvironment(): ResearchDiscoverySelectionEnvironment {
    if (this.dependencies.readSelectionEnvironment) return this.dependencies.readSelectionEnvironment();
    const environment = readResearchDiscoverySelectionEnvironment();
    if (!this.dependencies.readEnvironment) return environment;
    return { ...environment, mode: "openai", providers: { ...environment.providers, openai: this.dependencies.readEnvironment() } };
  }

  private createPort(providerId: ResearchDiscoveryProviderId, environment: ResearchDiscoveryProviderEnvironment): SearchDiscoveryPort {
    if (this.dependencies.port?.providerId === providerId) return this.dependencies.port;
    const injected = this.dependencies.ports?.[providerId];
    if (injected) return injected;
    if (providerId === "openai") return new OpenAiWebSearchDiscoveryAdapter(environment as ConstructorParameters<typeof OpenAiWebSearchDiscoveryAdapter>[0]);
    if (providerId === "groq") return new GroqWebSearchDiscoveryAdapter(environment as ConstructorParameters<typeof GroqWebSearchDiscoveryAdapter>[0]);
    return new OpenRouterWebSearchDiscoveryAdapter(environment as ConstructorParameters<typeof OpenRouterWebSearchDiscoveryAdapter>[0]);
  }

  private async execute(input: {
    request: ResearchDiscoveryRequest;
    queries: readonly string[];
    policy: NonNullable<ReturnType<typeof deriveResearchDiscoverySourcePolicy>>;
    environment: ResearchDiscoverySelectionEnvironment;
    providerIds: readonly ResearchDiscoveryProviderId[];
    queryFingerprint: string;
  }): Promise<ResearchDiscoveryResult> {
    const attemptedProviders: ResearchDiscoveryProviderId[] = [];
    const warnings: string[] = [...input.environment.warnings];
    let aggregateTelemetry = emptyResearchDiscoveryTelemetry();
    for (const providerId of input.providerIds) {
      const providerEnvironment = input.environment.providers[providerId];
      if (!providerEnvironment.valid && !this.dependencies.port && !this.dependencies.ports?.[providerId]) {
        warnings.push(...providerEnvironment.warnings);
        if (input.environment.mode !== "auto") return emptyResult("disabled", warnings, input.queries, attemptedProviders);
        continue;
      }
      const port = this.createPort(providerId, providerEnvironment);
      attemptedProviders.push(providerId);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DISCOVERY_OPERATION_TIMEOUT_MS);
      let result: Awaited<ReturnType<SearchDiscoveryPort["discover"]>>;
      try {
        result = await port.discover({
          queries: input.queries,
          allowedDomains: input.policy.allowedDomains,
          maxSources: input.request.maxSources,
          requestId: input.request.requestId,
          candidate: {
            title: input.request.titleSnapshot,
            ...(input.request.releaseYear ? { releaseYear: input.request.releaseYear } : {}),
            mediaType: input.request.mediaType,
            versionScope: input.request.versionScope,
          },
          aspect: {
            aspectId: input.request.aspectId,
            role: input.request.role,
            ...(input.request.minimumLevel ? { minimumLevel: input.request.minimumLevel } : {}),
          },
          signal: controller.signal,
        });
      } catch {
        result = {
          providerId,
          status: "unavailable",
          rawUrlSignals: [],
          telemetry: { ...emptyResearchDiscoveryTelemetry(), providerId },
          warnings: [`${providerId}_discovery_unhandled_failure`],
        };
      } finally {
        clearTimeout(timeout);
      }
      aggregateTelemetry = mergeTelemetry(aggregateTelemetry, result.telemetry);
      warnings.push(...result.warnings);
      if (result.status === "budget_exhausted") {
        return { ...emptyResult("budget_exhausted", warnings, input.queries, attemptedProviders), provider: providerId, adapter: port.adapterId, telemetry: aggregateTelemetry };
      }
      if (result.status !== "completed") {
        if (input.environment.mode === "auto") continue;
        return { ...emptyResult("adapter_unavailable", warnings, input.queries, attemptedProviders), provider: providerId, adapter: port.adapterId, telemetry: aggregateTelemetry };
      }

      const sources: DiscoveredResearchSource[] = [];
      const seen = new Set<string>();
      let rejected = 0;
      let rejectedDomain = 0;
      for (const candidate of result.rawUrlSignals) {
        const resolved = resolveDiscoveredResearchUrl({ url: candidate.url, policy: input.policy });
        if (!resolved.ok) { rejected += 1; rejectedDomain += resolved.domainRejected ? 1 : 0; continue; }
        if (seen.has(resolved.canonicalUrl)) continue;
        seen.add(resolved.canonicalUrl);
        sources.push({
          version: 1,
          sourceId: resolved.sourceId,
          canonicalUrl: resolved.canonicalUrl,
          hostname: resolved.hostname,
          discoveryAdapter: port.adapterId,
          discoveryRank: sources.length,
          discoveredAt: new Date(this.now()).toISOString(),
          queryFingerprint: input.queryFingerprint,
          sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
          warnings: [],
        });
        if (sources.length >= input.request.maxSources) break;
      }
      aggregateTelemetry = {
        ...aggregateTelemetry,
        providerId,
        acceptedSourceCount: sources.length,
        rejectedSourceCount: aggregateTelemetry.rejectedSourceCount + rejected,
        rejectedDomainCount: aggregateTelemetry.rejectedDomainCount + rejectedDomain,
      };
      return {
        status: sources.length > 0 ? "sources_discovered" : "no_source_discovered",
        sources,
        attemptedQueries: input.queries,
        provider: providerId,
        adapter: port.adapterId,
        attemptedProviders,
        telemetry: aggregateTelemetry,
        warnings,
      };
    }
    return {
      ...emptyResult(attemptedProviders.length > 0 ? "adapter_unavailable" : "disabled", warnings, input.queries, attemptedProviders),
      telemetry: aggregateTelemetry,
    };
  }
}

const defaultResearchDiscoveryOrchestrator = new ResearchDiscoveryOrchestrator();

export function discoverResearchSources(value: unknown): Promise<ResearchDiscoveryResult> {
  return defaultResearchDiscoveryOrchestrator.discover(value);
}
