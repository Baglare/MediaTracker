"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock3,
  CopyCheck,
  Eye,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useDuplicateReview } from "@/hooks/use-duplicate-review";
import {
  buildDuplicateMergePreview,
  summarizeDuplicateCandidate,
} from "@/lib/duplicate-scanner";
import type { DuplicateReviewStatus } from "@/lib/duplicate-review-registry";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { MediaItem, ProgressLog } from "@/lib/types";

interface DuplicateReviewPanelProps {
  ownerScope: LocalOwnerScope | null;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
}

const STATUS_LABELS: Record<DuplicateReviewStatus, string> = {
  open: "İncelenmedi",
  deferred: "Ertelendi",
  ignored: "Yok sayıldı",
  "not-duplicate": "Aynı medya değil",
};

function sourceLabel(item: MediaItem): string {
  if (item.identity) return `${item.identity.source} / ${item.identity.namespace}`;
  if (item.externalSource) return `${item.externalSource} / çözümlenemedi`;
  return "manuel / çözümlenemedi";
}

export default function DuplicateReviewPanel({
  ownerScope,
  mediaList,
  progressLogs,
}: DuplicateReviewPanelProps) {
  const controller = useDuplicateReview(ownerScope, mediaList);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);

  const openReviews = useMemo(
    () => controller.reviews.filter((review) => review.decision === "open"),
    [controller.reviews],
  );
  const visibleReviews = useMemo(
    () => controller.reviews.filter((review) =>
      showReviewed
      || review.decision === "open"
      || review.decision === "deferred"),
    [controller.reviews, showReviewed],
  );
  const counts = {
    exact: openReviews.filter((review) => review.candidate.classification === "exact").length,
    strong: openReviews.filter((review) => review.candidate.classification === "strong").length,
    probable: openReviews.filter((review) => review.candidate.classification === "probable").length,
  };
  const itemById = useMemo(
    () => new Map(mediaList.map((item) => [item.id, item])),
    [mediaList],
  );

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-zinc-800/50 bg-zinc-900/50 px-4 py-3 transition-colors hover:border-zinc-700/50"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
            <CopyCheck className="h-4 w-4 text-violet-300" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-zinc-200">
              Tekrarlanan Kayıt İncelemesi
            </span>
            <p className="text-[11px] text-zinc-500">
              {controller.status === "pending"
                ? "Aktif kütüphane güvenli biçimde taranıyor"
                : `${openReviews.length} açık inceleme adayı`}
            </p>
          </div>
        </div>
        {isExpanded
          ? <ChevronUp className="h-4 w-4 text-zinc-500" />
          : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-4 rounded-xl border border-zinc-800/30 bg-zinc-900/30 p-4">
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <p className="text-xs leading-5 text-violet-200">
              Bu aşama yalnız olası tekrarları tespit eder. Kayıtlar otomatik olarak değiştirilmez.
            </p>
          </div>

          {controller.warning && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {controller.warning}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {[
              ["Kesin", counts.exact, "text-rose-300"],
              ["Güçlü", counts.strong, "text-amber-300"],
              ["Olası", counts.probable, "text-sky-300"],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <p className={`text-lg font-semibold ${color}`}>{value}</p>
                <p className="text-[11px] text-zinc-500">{label} açık aday</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {controller.scannedAt
                ? `Şimdi tarandı (${new Date(controller.scannedAt).toLocaleTimeString("tr-TR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })})`
                : "Tarama bekleniyor"}
            </div>
            <button
              type="button"
              onClick={controller.rescan}
              disabled={controller.status === "pending"}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Yeniden tara
            </button>
          </div>

          {controller.suppressedCount > 0 && (
            <p className="text-[11px] text-zinc-600">
              {controller.suppressedCount} çelişkili eşleşme yanlış pozitif korumasıyla bastırıldı.
            </p>
          )}

          {controller.status === "pending" ? (
            <div className="rounded-xl border border-zinc-800 p-4 text-center text-sm text-zinc-500">
              Aktif owner kütüphanesi taranıyor…
            </div>
          ) : visibleReviews.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
              <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
              <p className="text-sm text-emerald-200">İncelenecek tekrarlanan kayıt bulunmadı.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleReviews.map(({ candidate, decision }) => {
                const summary = summarizeDuplicateCandidate(candidate);
                const preview = buildDuplicateMergePreview(candidate, mediaList, progressLogs);
                const detailsOpen = expandedCandidate === candidate.id;
                return (
                  <article
                    key={candidate.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-zinc-200">{summary.label}</p>
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                            {summary.recordCount} kayıt
                          </span>
                          {decision !== "open" && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                              {STATUS_LABELS[decision]}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                          {summary.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedCandidate(detailsOpen ? null : candidate.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-zinc-800/70 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        İncele
                      </button>
                    </div>

                    {detailsOpen && (
                      <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
                        <div className="space-y-2">
                          {candidate.recordIds.map((recordId) => {
                            const item = itemById.get(recordId);
                            if (!item) return null;
                            const groups = preview.relationships.groupMemberships[recordId];
                            return (
                              <div
                                key={recordId}
                                className="grid gap-1 rounded-lg bg-zinc-900/60 p-3 text-xs sm:grid-cols-[1fr_auto]"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-zinc-200">{item.title}</p>
                                  <p className="mt-1 text-[11px] text-zinc-500">
                                    {item.type}
                                    {item.releaseYear ? ` • ${item.releaseYear}` : ""}
                                    {` • ${sourceLabel(item)}`}
                                  </p>
                                  {groups.length > 0 && (
                                    <p className="mt-1 truncate text-[11px] text-zinc-600">
                                      Grup: {groups.join(" / ")}
                                    </p>
                                  )}
                                </div>
                                <div className="text-left text-[11px] text-zinc-500 sm:text-right">
                                  <p>İlerleme: {item.currentProgress}/{item.totalProgress}</p>
                                  <p>Log: {preview.relationships.progressLogCounts[recordId]}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div>
                          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                            Eşleşme kanıtları
                          </p>
                          <ul className="space-y-1">
                            {candidate.evidence.map((item) => (
                              <li
                                key={`${candidate.id}:${item.code}`}
                                className="text-[11px] leading-5 text-zinc-400"
                              >
                                <span className="font-medium text-zinc-300">{item.code}</span>
                                {" — "}
                                {item.description}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => controller.decide(candidate, "deferred")}
                            className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20"
                          >
                            Şimdilik ertele
                          </button>
                          <button
                            type="button"
                            onClick={() => controller.decide(candidate, "not-duplicate")}
                            className="rounded-lg bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/20"
                          >
                            Aynı medya değil
                          </button>
                          <button
                            type="button"
                            onClick={() => controller.decide(candidate, "ignored")}
                            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
                          >
                            Yok say
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {controller.reviews.some((review) =>
            review.decision === "ignored" || review.decision === "not-duplicate") && (
            <button
              type="button"
              onClick={() => setShowReviewed((value) => !value)}
              className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              {showReviewed ? "Karar verilenleri gizle" : "Karar verilenleri göster"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
