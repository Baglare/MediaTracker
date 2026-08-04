import { isAspectId, type AspectId } from "../domain/aspect-registry";
import type { EvidenceClaim } from "../domain/evidence";
import type { EvidenceConfidence, SemanticVerifierMode } from "../domain/types";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import type { SemanticEvidenceBundle } from "./aggregation";

export const SEMANTIC_VERIFIER_TOP_N = 8;
export const SEMANTIC_VERIFIER_CONCURRENCY = 2;
export const SEMANTIC_VERIFIER_TIMEOUT_MS = 1800;

export type SemanticVerifierStatus = "structured_only" | "available" | "unavailable" | "partial";

interface SemanticClaimPayload {
  aspectId: string;
  score: number;
  confidence: EvidenceConfidence;
  polarity?: "supporting" | "contradictory";
  explanation?: string;
}

export interface SemanticVerifierRunResult {
  requestedMode: SemanticVerifierMode;
  effectiveMode: SemanticVerifierMode;
  status: SemanticVerifierStatus;
  evidenceByCandidateKey: ReadonlyMap<string, SemanticEvidenceBundle>;
  warnings: readonly string[];
}

function endpointFor(mode: SemanticVerifierMode): string | null {
  if (mode === "local_enhanced") return process.env.AI_LOCAL_SEMANTIC_VERIFIER_URL?.trim() || null;
  if (mode === "remote_enhanced") return process.env.AI_REMOTE_SEMANTIC_VERIFIER_URL?.trim() || null;
  return null;
}

function publicMetadata(snapshot: CandidateProviderEvidenceSnapshot) {
  return {
    identity: snapshot.candidateIdentity,
    objectiveMetadata: snapshot.objectiveMetadata,
    claims: snapshot.rawEvidenceClaims.map(({ id, sourceKind, provider, field, value, normalizedValue }) => ({ id, sourceKind, provider, field, value, normalizedValue })),
  };
}

function parseClaims(value: unknown, mode: Exclude<SemanticVerifierMode, "structured_only">, candidateKey: string): SemanticEvidenceBundle | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { claims?: unknown }).claims)) return null;
  const supporting: Partial<Record<AspectId, EvidenceClaim[]>> = {};
  const contradictory: Partial<Record<AspectId, EvidenceClaim[]>> = {};
  for (const raw of (value as { claims: unknown[] }).claims) {
    if (!raw || typeof raw !== "object") continue;
    const claim = raw as Partial<SemanticClaimPayload>;
    if (!isAspectId(claim.aspectId) || typeof claim.score !== "number" || !Number.isFinite(claim.score) || claim.score < 0 || claim.score > 1) continue;
    if (!claim.confidence || !["high", "medium", "low", "unknown"].includes(claim.confidence)) continue;
    const sourceKind = mode === "local_enhanced" ? "local_semantic_verifier" : "remote_llm_verifier";
    const evidence: EvidenceClaim = {
      id: `${candidateKey}:${sourceKind}:${claim.aspectId}`,
      sourceKind,
      scope: "candidate_metadata",
      field: "semantic_verifier",
      value: claim.score,
      normalizedValue: claim.score,
      reliability: claim.confidence === "high" ? 0.82 : claim.confidence === "medium" ? 0.68 : 0.45,
      explanation: claim.explanation?.slice(0, 240),
    };
    const target = claim.polarity === "contradictory" ? contradictory : supporting;
    (target[claim.aspectId] ??= []).push(evidence);
  }
  return { mode, supporting, contradictory, warnings: [] };
}

async function verifyOne(input: {
  endpoint: string;
  mode: Exclude<SemanticVerifierMode, "structured_only">;
  snapshot: CandidateProviderEvidenceSnapshot;
  fetchImpl: typeof fetch;
}): Promise<SemanticEvidenceBundle | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEMANTIC_VERIFIER_TIMEOUT_MS);
  try {
    const response = await input.fetchImpl(input.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: 1, candidate: publicMetadata(input.snapshot) }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseClaims(await response.json(), input.mode, input.snapshot.candidateIdentity.canonicalKey);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runSemanticVerifier(input: {
  mode: SemanticVerifierMode;
  snapshots: ReadonlyMap<string, CandidateProviderEvidenceSnapshot>;
  fetchImpl?: typeof fetch;
}): Promise<SemanticVerifierRunResult> {
  if (input.mode === "structured_only") {
    return { requestedMode: input.mode, effectiveMode: "structured_only", status: "structured_only", evidenceByCandidateKey: new Map(), warnings: [] };
  }
  const endpoint = endpointFor(input.mode);
  if (!endpoint) {
    return { requestedMode: input.mode, effectiveMode: "structured_only", status: "unavailable", evidenceByCandidateKey: new Map(), warnings: ["semantic_verifier_unavailable"] };
  }
  const entries = [...input.snapshots.entries()].slice(0, SEMANTIC_VERIFIER_TOP_N);
  const evidence = new Map<string, SemanticEvidenceBundle>();
  let cursor = 0;
  let failures = 0;
  await Promise.all(Array.from({ length: Math.min(SEMANTIC_VERIFIER_CONCURRENCY, entries.length) }, async () => {
    while (cursor < entries.length) {
      const [key, snapshot] = entries[cursor++];
      const result = await verifyOne({ endpoint, mode: input.mode as Exclude<SemanticVerifierMode, "structured_only">, snapshot, fetchImpl: input.fetchImpl ?? fetch });
      if (result) evidence.set(key, result);
      else failures += 1;
    }
  }));
  return {
    requestedMode: input.mode,
    effectiveMode: input.mode,
    status: failures === 0 ? "available" : evidence.size > 0 ? "partial" : "unavailable",
    evidenceByCandidateKey: evidence,
    warnings: failures > 0 ? [`semantic_verifier_failures:${failures}`] : [],
  };
}
