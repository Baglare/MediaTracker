import type {
  DuplicateCandidateGroup,
} from "./duplicate-scanner";
import type { LocalOwnerScope } from "./local-owner-scope";
import type { StorageWriteResult } from "./local-data-storage";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "./personal-data-storage";

export const DUPLICATE_REVIEW_REGISTRY_VERSION = 1 as const;

export type DuplicateReviewDecisionValue =
  | "ignored"
  | "deferred"
  | "not-duplicate";

export type DuplicateReviewStatus = "open" | DuplicateReviewDecisionValue;

export interface DuplicateReviewDecision {
  candidateFingerprint: string;
  decision: DuplicateReviewDecisionValue;
  scanVersion: number;
  recordIds: string[];
  evidenceFingerprint: string;
  decidedAt: string;
}

export interface DuplicateReviewRegistry {
  version: 1;
  decisions: DuplicateReviewDecision[];
}

export interface DuplicateCandidateReview {
  candidate: DuplicateCandidateGroup;
  decision: DuplicateReviewStatus;
  decidedAt?: string;
}

const DECISIONS = new Set<DuplicateReviewDecisionValue>([
  "ignored",
  "deferred",
  "not-duplicate",
]);
const CANDIDATE_FINGERPRINT = /^dup:v1:(?:exact|strong|probable):[0-9a-f]{8}:[0-9a-f]{8}$/;
const EVIDENCE_FINGERPRINT = /^ev:v1:[0-9a-f]{8}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRecordIds(values: unknown[]): string[] | null {
  if (
    values.length < 2
    || values.length > 50
    || values.some(
      (entry) => typeof entry !== "string" || entry.trim().length < 1 || entry.length > 220,
    )
  ) return null;
  const normalized = [...new Set(values as string[])].sort((left, right) =>
    left.localeCompare(right, "en"));
  return normalized.length === values.length ? normalized : null;
}

export const duplicateReviewRegistryCodec: PersonalDataCodec<DuplicateReviewRegistry> = (
  value,
) => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.decisions)) {
    return {
      ok: false,
      code: "duplicate_review_registry_invalid",
      message: "Duplicate review registry formati gecersiz.",
    };
  }
  const decisions: DuplicateReviewDecision[] = [];
  const seen = new Set<string>();
  for (const raw of value.decisions) {
    if (
      !isRecord(raw)
      || typeof raw.candidateFingerprint !== "string"
      || !CANDIDATE_FINGERPRINT.test(raw.candidateFingerprint)
      || typeof raw.decision !== "string"
      || !DECISIONS.has(raw.decision as DuplicateReviewDecisionValue)
      || raw.scanVersion !== 1
      || !Array.isArray(raw.recordIds)
      || typeof raw.evidenceFingerprint !== "string"
      || !EVIDENCE_FINGERPRINT.test(raw.evidenceFingerprint)
      || typeof raw.decidedAt !== "string"
      || !Number.isFinite(Date.parse(raw.decidedAt))
      || seen.has(raw.candidateFingerprint)
    ) {
      return {
        ok: false,
        code: "duplicate_review_record_invalid",
        message: "Duplicate review karar kaydi gecersiz.",
      };
    }
    const recordIds = normalizeRecordIds(raw.recordIds);
    if (!recordIds) {
      return {
        ok: false,
        code: "duplicate_review_record_ids_invalid",
        message: "Duplicate review record listesi gecersiz.",
      };
    }
    seen.add(raw.candidateFingerprint);
    decisions.push({
      candidateFingerprint: raw.candidateFingerprint,
      decision: raw.decision as DuplicateReviewDecisionValue,
      scanVersion: 1,
      recordIds,
      evidenceFingerprint: raw.evidenceFingerprint,
      decidedAt: raw.decidedAt,
    });
  }
  return {
    ok: true,
    value: {
      version: DUPLICATE_REVIEW_REGISTRY_VERSION,
      decisions: decisions.sort((left, right) =>
        left.candidateFingerprint.localeCompare(right.candidateFingerprint, "en")),
    },
  };
};

export function emptyDuplicateReviewRegistry(): DuplicateReviewRegistry {
  return { version: DUPLICATE_REVIEW_REGISTRY_VERSION, decisions: [] };
}

export function readDuplicateReviewRegistry(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike | null,
): PersonalDataReadResult<DuplicateReviewRegistry> {
  return readPersonalData(
    scope,
    "duplicateReviewDecisions",
    duplicateReviewRegistryCodec,
    storage,
  );
}

export function writeDuplicateReviewRegistry(
  scope: LocalOwnerScope,
  registry: DuplicateReviewRegistry,
  storage?: PersonalStorageLike | null,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "duplicateReviewDecisions",
    registry,
    duplicateReviewRegistryCodec,
    storage,
  );
}

export function createDuplicateReviewDecision(
  candidate: DuplicateCandidateGroup,
  decision: DuplicateReviewDecisionValue,
  decidedAt = new Date().toISOString(),
): DuplicateReviewDecision {
  return {
    candidateFingerprint: candidate.fingerprint,
    decision,
    scanVersion: candidate.scanVersion,
    recordIds: [...candidate.recordIds].sort((left, right) => left.localeCompare(right, "en")),
    evidenceFingerprint: candidate.evidenceFingerprint,
    decidedAt,
  };
}

export function updateDuplicateReviewRegistry(
  registry: DuplicateReviewRegistry,
  candidate: DuplicateCandidateGroup,
  decision: DuplicateReviewDecisionValue,
  decidedAt = new Date().toISOString(),
): DuplicateReviewRegistry {
  const next = createDuplicateReviewDecision(candidate, decision, decidedAt);
  return {
    version: DUPLICATE_REVIEW_REGISTRY_VERSION,
    decisions: [
      ...registry.decisions.filter(
        (entry) => entry.candidateFingerprint !== candidate.fingerprint,
      ),
      next,
    ].sort((left, right) =>
      left.candidateFingerprint.localeCompare(right.candidateFingerprint, "en")),
  };
}

export function persistDuplicateReviewDecision(
  scope: LocalOwnerScope,
  candidate: DuplicateCandidateGroup,
  decision: DuplicateReviewDecisionValue,
  storage?: PersonalStorageLike | null,
): StorageWriteResult {
  const read = readDuplicateReviewRegistry(scope, storage);
  if (read.status !== "missing" && read.status !== "valid") {
    return {
      ok: false,
      code: "verification_failed",
      message: "Duplicate review registry recovery gerektiriyor; mevcut veri overwrite edilmedi.",
      recoverable: true,
    };
  }
  return writeDuplicateReviewRegistry(
    scope,
    updateDuplicateReviewRegistry(
      read.status === "valid" ? read.data : emptyDuplicateReviewRegistry(),
      candidate,
      decision,
    ),
    storage,
  );
}

function decisionMatchesCandidate(
  decision: DuplicateReviewDecision,
  candidate: DuplicateCandidateGroup,
): boolean {
  return (
    decision.candidateFingerprint === candidate.fingerprint
    && decision.scanVersion === candidate.scanVersion
    && decision.evidenceFingerprint === candidate.evidenceFingerprint
    && decision.recordIds.length === candidate.recordIds.length
    && decision.recordIds.every((recordId, index) => recordId === candidate.recordIds[index])
  );
}

export function applyDuplicateReviewDecisions(
  candidates: readonly DuplicateCandidateGroup[],
  registry: DuplicateReviewRegistry,
): DuplicateCandidateReview[] {
  const decisions = new Map(
    registry.decisions.map((entry) => [entry.candidateFingerprint, entry]),
  );
  return candidates.map((candidate) => {
    const stored = decisions.get(candidate.fingerprint);
    return stored && decisionMatchesCandidate(stored, candidate)
      ? { candidate, decision: stored.decision, decidedAt: stored.decidedAt }
      : { candidate, decision: "open" };
  });
}
