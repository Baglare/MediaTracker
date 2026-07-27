"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  scanDuplicateCandidates,
  type DuplicateCandidateGroup,
  type DuplicateScanResult,
} from "@/lib/duplicate-scanner";
import {
  applyDuplicateReviewDecisions,
  emptyDuplicateReviewRegistry,
  persistDuplicateReviewDecision,
  readDuplicateReviewRegistry,
  type DuplicateCandidateReview,
  type DuplicateReviewDecisionValue,
  type DuplicateReviewRegistry,
} from "@/lib/duplicate-review-registry";
import {
  emptyMediaIdentityAliasRegistry,
  readMediaIdentityAliasRegistry,
} from "@/lib/media-identity-aliases";
import {
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
  type LocalOwnerScope,
} from "@/lib/local-owner-scope";
import type { MediaItem } from "@/lib/types";

type DuplicateReviewLoadStatus = "pending" | "ready" | "recovery-required";

export interface DuplicateReviewController {
  status: DuplicateReviewLoadStatus;
  reviews: DuplicateCandidateReview[];
  suppressedCount: number;
  scannedAt: string | null;
  warning: string | null;
  decide: (
    candidate: DuplicateCandidateGroup,
    decision: DuplicateReviewDecisionValue,
  ) => boolean;
  rescan: () => void;
}

const EMPTY_SCAN: DuplicateScanResult = {
  candidates: [],
  suppressed: [],
  scannedRecordCount: 0,
  scanVersion: 1,
};

export function useDuplicateReview(
  scope: LocalOwnerScope | null,
  mediaItems: readonly MediaItem[],
): DuplicateReviewController {
  const scopeKey = scope?.key ?? null;
  const generationRef = useRef(0);
  const scopeRef = useRef<LocalOwnerScope | null>(scope);
  const registryRef = useRef<DuplicateReviewRegistry>(emptyDuplicateReviewRegistry());
  const [hydratedOwnerKey, setHydratedOwnerKey] = useState<string | null>(null);
  const [status, setStatus] = useState<DuplicateReviewLoadStatus>("pending");
  const [scan, setScan] = useState<DuplicateScanResult>(EMPTY_SCAN);
  const [reviews, setReviews] = useState<DuplicateCandidateReview[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    scopeRef.current = scope;
    registryRef.current = emptyDuplicateReviewRegistry();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- owner switch must mask previous scan synchronously.
    setHydratedOwnerKey(null);
    setStatus("pending");
    setScan(EMPTY_SCAN);
    setReviews([]);
    setScannedAt(null);
    setWarning(null);
    if (!scope) return;

    const timer = window.setTimeout(() => {
      const aliasRead = readMediaIdentityAliasRegistry(scope);
      const registryRead = readDuplicateReviewRegistry(scope);
      const aliases = aliasRead.status === "valid"
        ? aliasRead.data
        : emptyMediaIdentityAliasRegistry();
      const registry = registryRead.status === "valid"
        ? registryRead.data
        : emptyDuplicateReviewRegistry();
      const result = scanDuplicateCandidates(mediaItems, aliases, {
        ownerScope: scope.key,
      });
      if (!isCurrentOwnerGeneration(generation, generationRef.current)) return;
      registryRef.current = registry;
      setScan(result);
      setReviews(applyDuplicateReviewDecisions(result.candidates, registry));
      setScannedAt(new Date().toISOString());
      setHydratedOwnerKey(scope.key);
      const recoveryMessages = [
        aliasRead.status !== "missing" && aliasRead.status !== "valid"
          ? "Identity alias registry okunamadığı için alias evidence kullanılmadı."
          : "",
        registryRead.status !== "missing" && registryRead.status !== "valid"
          ? "Duplicate karar registry'si recovery gerektiriyor; karar yazımı durduruldu."
          : "",
      ].filter(Boolean);
      setWarning(recoveryMessages.join(" "));
      setStatus(
        registryRead.status === "missing" || registryRead.status === "valid"
          ? "ready"
          : "recovery-required",
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
      generationRef.current += 1;
    };
  }, [mediaItems, nonce, scope, scopeKey]);

  const decide = useCallback((
    candidate: DuplicateCandidateGroup,
    decision: DuplicateReviewDecisionValue,
  ) => {
    const activeScope = scopeRef.current;
    if (
      !activeScope
      || activeScope.key !== candidate.ownerScope
      || hydratedOwnerKey !== activeScope.key
      || status !== "ready"
    ) return false;
    const result = persistDuplicateReviewDecision(activeScope, candidate, decision);
    if (!result.ok) {
      setWarning(result.message);
      return false;
    }
    const nextRegistry = {
      ...registryRef.current,
      decisions: [
        ...registryRef.current.decisions.filter(
          (entry) => entry.candidateFingerprint !== candidate.fingerprint,
        ),
        {
          candidateFingerprint: candidate.fingerprint,
          decision,
          scanVersion: candidate.scanVersion,
          recordIds: [...candidate.recordIds],
          evidenceFingerprint: candidate.evidenceFingerprint,
          decidedAt: result.writtenAt,
        },
      ],
    };
    registryRef.current = nextRegistry;
    setReviews(applyDuplicateReviewDecisions(scan.candidates, nextRegistry));
    setWarning(null);
    return true;
  }, [hydratedOwnerKey, scan.candidates, status]);

  const ownerVisible = isHydratedOwnerVisible(scopeKey, hydratedOwnerKey);
  return {
    status: ownerVisible ? status : "pending",
    reviews: ownerVisible ? reviews : [],
    suppressedCount: ownerVisible ? scan.suppressed.length : 0,
    scannedAt: ownerVisible ? scannedAt : null,
    warning: ownerVisible ? warning : null,
    decide,
    rescan: () => setNonce((value) => value + 1),
  };
}
