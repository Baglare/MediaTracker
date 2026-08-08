import "server-only";

import { createHash } from "node:crypto";
import { RESEARCH_POLICY_VERSION } from "../cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "../domain/source-registry";
import { OpenAiWebSearchDiscoveryAdapter } from "./adapters/openai/adapter";
import { readOpenAiWebDiscoveryEnvironment, type OpenAiWebDiscoveryEnvironment } from "./adapters/openai/config";
import { decodeResearchDiscoveryRequest } from "./codec";
import {
  deriveResearchDiscoverySourcePolicy,
  requestMatchesResearchDiscoverySourcePolicy,
  resolveDiscoveredResearchUrl,
} from "./domain-policy";
import type { SearchDiscoveryPort } from "./port";
import { buildResearchDiscoveryQueries } from "./query-builder";
import {
  OPENAI_WEB_DISCOVERY_ADAPTER_ID,
  emptyResearchDiscoveryTelemetry,
  type DiscoveredResearchSource,
  type ResearchDiscoveryRequest,
  type ResearchDiscoveryResult,
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
    finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

export interface ResearchDiscoveryOrchestratorDependencies {
  port?: SearchDiscoveryPort;
  readEnvironment?: () => OpenAiWebDiscoveryEnvironment;
  now?: () => number;
}

function emptyResult(status: ResearchDiscoveryResult["status"], warnings: readonly string[], attemptedQueries: readonly string[] = []): ResearchDiscoveryResult {
  return { status, sources: [], attemptedQueries, adapter: OPENAI_WEB_DISCOVERY_ADAPTER_ID, telemetry: emptyResearchDiscoveryTelemetry(), warnings };
}

function fingerprint(parts: readonly string[]): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

export class ResearchDiscoveryOrchestrator {
  private readonly pending = new Map<string, Promise<ResearchDiscoveryResult>>();
  private readonly semaphore = new DiscoverySemaphore();
  private readonly readEnvironment: () => OpenAiWebDiscoveryEnvironment;
  private readonly now: () => number;

  constructor(private readonly dependencies: ResearchDiscoveryOrchestratorDependencies = {}) {
    this.readEnvironment = dependencies.readEnvironment ?? (() => readOpenAiWebDiscoveryEnvironment());
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
    const environment = this.readEnvironment();
    if (!environment.valid) return emptyResult("disabled", environment.warnings, queries);
    const key = fingerprint([
      request.versionScope.scopeKey, request.aspectId, request.role, request.minimumLevel ?? "",
      request.researchPolicyVersion, ...policy.allowedDomains, ...queries,
    ]);
    const active = this.pending.get(key);
    if (active) {
      const result = await active;
      return { ...result, telemetry: { ...result.telemetry, coalescedCount: result.telemetry.coalescedCount + 1 } };
    }
    const operation = this.semaphore.run(() => this.execute({ request, queries, policy, environment, queryFingerprint: key }));
    this.pending.set(key, operation);
    try { return await operation; }
    finally { this.pending.delete(key); }
  }

  private async execute(input: {
    request: ResearchDiscoveryRequest;
    queries: readonly string[];
    policy: NonNullable<ReturnType<typeof deriveResearchDiscoverySourcePolicy>>;
    environment: OpenAiWebDiscoveryEnvironment;
    queryFingerprint: string;
  }): Promise<ResearchDiscoveryResult> {
    const port = this.dependencies.port ?? new OpenAiWebSearchDiscoveryAdapter(input.environment);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_OPERATION_TIMEOUT_MS);
    const startedAt = this.now();
    try {
      const result = await port.discover({
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
      if (result.status !== "completed") {
        const status = result.status === "budget_exhausted" ? "budget_exhausted" : "adapter_unavailable";
        return { status, sources: [], attemptedQueries: input.queries, adapter: port.adapterId, telemetry: result.telemetry, warnings: result.warnings };
      }
      const sources: DiscoveredResearchSource[] = [];
      const seen = new Set<string>();
      let rejected = 0;
      let rejectedDomain = 0;
      for (const candidate of result.urls) {
        const resolved = resolveDiscoveredResearchUrl({ url: candidate.url, policy: input.policy });
        if (!resolved.ok) {
          rejected += 1;
          rejectedDomain += resolved.domainRejected ? 1 : 0;
          continue;
        }
        if (seen.has(resolved.canonicalUrl)) continue;
        seen.add(resolved.canonicalUrl);
        sources.push({
          version: 1,
          sourceId: resolved.sourceId,
          canonicalUrl: resolved.canonicalUrl,
          hostname: resolved.hostname,
          discoveryAdapter: OPENAI_WEB_DISCOVERY_ADAPTER_ID,
          discoveryRank: sources.length,
          discoveredAt: new Date(this.now()).toISOString(),
          queryFingerprint: input.queryFingerprint,
          sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
          warnings: [],
        });
        if (sources.length >= input.request.maxSources) break;
      }
      const telemetry = {
        ...result.telemetry,
        durationMs: Math.max(result.telemetry.durationMs, this.now() - startedAt),
        acceptedSourceCount: sources.length,
        rejectedSourceCount: rejected,
        rejectedDomainCount: rejectedDomain,
      };
      return {
        status: sources.length > 0 ? "sources_discovered" : "no_source_discovered",
        sources,
        attemptedQueries: input.queries,
        adapter: port.adapterId,
        telemetry,
        warnings: result.warnings,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const defaultResearchDiscoveryOrchestrator = new ResearchDiscoveryOrchestrator();

export function discoverResearchSources(value: unknown): Promise<ResearchDiscoveryResult> {
  return defaultResearchDiscoveryOrchestrator.discover(value);
}
