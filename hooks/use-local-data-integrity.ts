"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  executeIntegrityRepair,
  prepareIntegrityRepair,
  readIntegrityRepairJournal,
  recoverPendingIntegrityRepair,
  undoLastIntegrityRepair,
  type IntegrityRepairJournal,
  type IntegrityRepairPlan,
} from "@/lib/local-data-integrity-repair";
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
  repairPlan: IntegrityRepairPlan | null;
  repairJournal: IntegrityRepairJournal | null;
  repairMessage: string | null;
  prepareRepair: (issueId: string) => boolean;
  cancelRepair: () => void;
  confirmRepair: () => boolean;
  undoLastRepair: () => boolean;
  recoverRepair: () => boolean;
}

export function useLocalDataIntegrity(
  scope: LocalOwnerScope | null,
  mediaItems: readonly MediaItem[],
  progressLogs: readonly ProgressLog[],
): LocalDataIntegrityController {
  const scopeKey = scope?.key ?? null;
  const generationRef = useRef(0);
  const scopeRef = useRef<LocalOwnerScope | null>(scope);
  const [hydratedOwnerKey, setHydratedOwnerKey] = useState<string | null>(null);
  const [status, setStatus] = useState<LocalDataIntegrityStatus>("pending");
  const [report, setReport] = useState<LocalDataIntegrityReport | null>(null);
  const [nonce, setNonce] = useState(0);
  const [repairPlan, setRepairPlan] = useState<IntegrityRepairPlan | null>(null);
  const [repairJournal, setRepairJournal] = useState<IntegrityRepairJournal | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);

  useEffect(() => {
    const generation = ++generationRef.current;
    const previousScopeKey = scopeRef.current?.key ?? null;
    const ownerChanged = previousScopeKey !== scopeKey;
    scopeRef.current = scope;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- owner switch must mask the previous report synchronously.
    setHydratedOwnerKey(null);
    setStatus("pending");
    setReport(null);
    setRepairPlan(null);
    setRepairJournal(null);
    if (ownerChanged) setRepairMessage(null);
    if (!scope) return;

    const timer = window.setTimeout(() => {
      const mediaEnvelope = inspectScopedLocalData<MediaItem[]>(
        scope,
        "media-library",
      );
      const progressEnvelope = inspectScopedLocalData<ProgressLog[]>(
        scope,
        "progress-logs",
      );
      const next = scanLocalDataIntegrity({
        scope,
        mediaItems: mediaEnvelope.data ?? mediaItems,
        progressLogs: progressEnvelope.data ?? progressLogs,
        mediaEnvelope,
        progressEnvelope,
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
      const repairRead = readIntegrityRepairJournal(scope);
      setReport(next);
      setHydratedOwnerKey(scope.key);
      setRepairJournal(repairRead.status === "valid" ? repairRead.data : null);
      setStatus(
        next.issues.some((issue) => issue.severity === "critical")
        || (repairRead.status === "valid"
          && repairRead.data.state === "recovery-required")
        || (repairRead.status !== "missing" && repairRead.status !== "valid")
        ? "recovery-required"
        : "ready",
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
      generationRef.current += 1;
    };
  }, [mediaItems, nonce, progressLogs, scope, scopeKey]);

  const prepareRepairAction = useCallback((issueId: string) => {
    const activeScope = scopeRef.current;
    if (!activeScope || !report || hydratedOwnerKey !== activeScope.key) return false;
    const prepared = prepareIntegrityRepair(
      activeScope,
      issueId,
      report.sourceFingerprint,
    );
    if (!prepared.ok) {
      setRepairMessage(prepared.message);
      return false;
    }
    setRepairPlan(prepared.plan);
    setRepairMessage(null);
    return true;
  }, [hydratedOwnerKey, report]);

  const confirmRepair = useCallback(() => {
    const activeScope = scopeRef.current;
    if (!activeScope || !repairPlan || repairPlan.ownerScope !== activeScope.key) {
      return false;
    }
    const result = executeIntegrityRepair(activeScope, repairPlan);
    if (!result.ok) {
      setRepairMessage(result.message);
      setNonce((value) => value + 1);
      return false;
    }
    setRepairJournal(result.journal);
    setRepairPlan(null);
    setRepairMessage("Integrity repair başarıyla uygulandı ve read-back doğrulandı.");
    setNonce((value) => value + 1);
    return true;
  }, [repairPlan]);

  const undoLastRepair = useCallback(() => {
    const activeScope = scopeRef.current;
    if (!activeScope) return false;
    const result = undoLastIntegrityRepair(activeScope);
    setRepairMessage(result.ok
      ? "Son integrity repair güvenli biçimde geri alındı."
      : result.message);
    if (result.ok) setRepairJournal(result.journal);
    setRepairPlan(null);
    setNonce((value) => value + 1);
    return result.ok;
  }, []);

  const recoverRepair = useCallback(() => {
    const activeScope = scopeRef.current;
    if (!activeScope) return false;
    const result = recoverPendingIntegrityRepair(activeScope);
    if (!result) {
      setRepairMessage("Bekleyen integrity repair recovery işlemi yok.");
      return false;
    }
    setRepairMessage(result.ok
      ? "Bekleyen integrity repair before state'e geri alındı."
      : result.message);
    if (result.ok) setRepairJournal(result.journal);
    setRepairPlan(null);
    setNonce((value) => value + 1);
    return result.ok;
  }, []);

  const ownerVisible = isHydratedOwnerVisible(scopeKey, hydratedOwnerKey);
  return {
    status: ownerVisible ? status : "pending",
    report: ownerVisible ? report : null,
    rescan: () => setNonce((value) => value + 1),
    repairPlan: ownerVisible ? repairPlan : null,
    repairJournal: ownerVisible ? repairJournal : null,
    repairMessage: ownerVisible ? repairMessage : null,
    prepareRepair: prepareRepairAction,
    cancelRepair: () => setRepairPlan(null),
    confirmRepair,
    undoLastRepair,
    recoverRepair,
  };
}
