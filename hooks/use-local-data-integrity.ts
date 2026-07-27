"use client";

import { useEffect, useRef, useState } from "react";
import {
  scanLocalDataIntegrity,
  type LocalDataIntegrityReport,
} from "@/lib/local-data-integrity";
import { inspectScopedLocalData } from "@/lib/local-data-storage";
import { inspectPersonalData } from "@/lib/personal-data-storage";
import {
  mediaIdentityAliasRegistryCodec,
} from "@/lib/media-identity-aliases";
import {
  mediaRecordRedirectRegistryCodec,
} from "@/lib/media-record-redirects";
import {
  duplicateReviewRegistryCodec,
} from "@/lib/duplicate-review-registry";
import { duplicateMergeJournalCodec } from "@/lib/duplicate-merge";
import { inspectRecommendationLinksForScope } from "@/lib/social/local-social";
import { inspectSyncQueue } from "@/lib/sync-queue";
import {
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
  type LocalOwnerScope,
} from "@/lib/local-owner-scope";
import type { MediaItem, ProgressLog } from "@/lib/types";

export type LocalDataIntegrityStatus =
  | "pending"
  | "ready"
  | "recovery-required";

export interface LocalDataIntegrityController {
  status: LocalDataIntegrityStatus;
  report: LocalDataIntegrityReport | null;
  rescan: () => void;
}

export function useLocalDataIntegrity(
  scope: LocalOwnerScope | null,
  mediaItems: readonly MediaItem[],
  progressLogs: readonly ProgressLog[],
): LocalDataIntegrityController {
  const scopeKey = scope?.key ?? null;
  const generationRef = useRef(0);
  const [hydratedOwnerKey, setHydratedOwnerKey] = useState<string | null>(null);
  const [status, setStatus] = useState<LocalDataIntegrityStatus>("pending");
  const [report, setReport] = useState<LocalDataIntegrityReport | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- owner switch must mask the previous report synchronously.
    setHydratedOwnerKey(null);
    setStatus("pending");
    setReport(null);
    if (!scope) return;

    const timer = window.setTimeout(() => {
      const next = scanLocalDataIntegrity({
        scope,
        mediaItems,
        progressLogs,
        mediaEnvelope: inspectScopedLocalData<MediaItem[]>(
          scope,
          "media-library",
        ),
        progressEnvelope: inspectScopedLocalData<ProgressLog[]>(
          scope,
          "progress-logs",
        ),
        aliases: inspectPersonalData(
          scope,
          "mediaIdentityAliases",
          mediaIdentityAliasRegistryCodec,
        ),
        redirects: inspectPersonalData(
          scope,
          "mediaRecordRedirects",
          mediaRecordRedirectRegistryCodec,
        ),
        duplicateReviews: inspectPersonalData(
          scope,
          "duplicateReviewDecisions",
          duplicateReviewRegistryCodec,
        ),
        mergeJournal: inspectPersonalData(
          scope,
          "duplicateMergeJournal",
          duplicateMergeJournalCodec,
        ),
        recommendationLinks: inspectRecommendationLinksForScope(scope),
        syncQueue: inspectSyncQueue(scope),
      });
      if (!isCurrentOwnerGeneration(generation, generationRef.current)) return;
      setReport(next);
      setHydratedOwnerKey(scope.key);
      setStatus(next.issues.some((issue) => issue.severity === "critical")
        ? "recovery-required"
        : "ready");
    }, 0);
    return () => {
      window.clearTimeout(timer);
      generationRef.current += 1;
    };
  }, [mediaItems, nonce, progressLogs, scope, scopeKey]);

  const ownerVisible = isHydratedOwnerVisible(scopeKey, hydratedOwnerKey);
  return {
    status: ownerVisible ? status : "pending",
    report: ownerVisible ? report : null,
    rescan: () => setNonce((value) => value + 1),
  };
}
