"use client";

import { Archive, Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";

import type { Goal, GoalAttainment, GoalEvaluation, GoalEvaluationWarning } from "@/features/goals/domain/types";
import type { MediaItem, MediaType } from "@/lib/types";

const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  movie: "Film", tv: "Dizi", anime: "Anime", manga: "Manga", manhwa: "Manhwa",
  manhua: "Manhua", book: "Kitap", light_novel: "Light novel", web_novel: "Web novel", visual_novel: "Visual novel",
};
const LIFECYCLE_LABELS = { active: "Aktif", cancelled: "İptal edildi", archived: "Arşivlendi" } as const;
const ATTAINMENT_LABELS: Record<GoalAttainment, string> = {
  not_started: "Henüz başlamadı",
  in_progress: "Devam ediyor",
  reached: "Hedefe ulaşıldı",
  expired: "Süresi doldu",
  inactive_target: "Bağlı medya bulunamadı",
};
const WARNING_LABELS: Record<GoalEvaluationWarning, string> = {
  media_missing: "Bağlı medya artık kütüphanede bulunmuyor.",
  detached_logs_ignored: "Silinmiş medyaya ait aktiviteler hesaba katılmadı.",
  incompatible_unit: "Hedef birimiyle uyumsuz aktiviteler hesaba katılmadı.",
  insufficient_history: "Tamamlanma tarihini kanıtlayan yeterli aktivite geçmişi yok.",
  timezone_invalid: "Dönem, geçerli bir timezone ile çözümlenemedi.",
  conflicting_log_payload: "Aynı kimlikte çelişkili aktiviteler hesaba katılmadı.",
  progress_chain_discontinuity: "Tutarsız ilerleme zincirinin belirsiz bölümü hesaba katılmadı.",
};

function scopeLabel(goal: Goal, media?: MediaItem): string {
  if (goal.scope.kind === "library") return "Tüm kütüphane";
  if (goal.scope.kind === "media_type") return MEDIA_TYPE_LABELS[goal.scope.mediaType];
  return media?.title ?? goal.scope.title ?? goal.scope.mediaRecordId;
}

function metricLabel(goal: Goal): string {
  if (goal.metric.kind === "completed_media") return `${goal.metric.targetValue} tamamlanan medya`;
  const label = goal.metric.unit === "episode" ? "bölüm" : goal.metric.unit === "chapter" ? "chapter" : "sayfa";
  return `${goal.metric.targetValue} ${label}`;
}

function scheduleLabel(goal: Goal): string {
  if (goal.schedule.kind === "one_time") return `Tek seferlik · ${goal.schedule.startsOn} – ${goal.schedule.endsOn}`;
  const period = goal.schedule.kind === "weekly" ? "Haftalık" : "Aylık";
  return `${period} · ${goal.schedule.startsOn}${goal.schedule.endsOn ? ` – ${goal.schedule.endsOn}` : ""} · ${goal.schedule.timeZone}`;
}

export function GoalCard({
  goal,
  mediaItems,
  evaluation,
  onEdit,
  onCancel,
  onArchive,
  onReactivate,
  onDelete,
}: {
  goal: Goal;
  mediaItems: readonly MediaItem[];
  evaluation?: GoalEvaluation;
  onEdit: () => void;
  onCancel: () => void;
  onArchive: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const mediaScope = goal.scope.kind === "media" ? goal.scope : undefined;
  const media = mediaScope ? mediaItems.find((item) => item.id === mediaScope.mediaRecordId) : undefined;
  const mediaMissing = Boolean(mediaScope && !media);
  const buttonClass = "inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]";
  return (
    <article className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-4 shadow-[0_8px_24px_var(--app-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-[var(--app-text-primary)]">{goal.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-surface-1)] px-2 py-0.5">{goal.origin === "manual" ? "Manuel" : "Öneriden onaylandı"}</span>
            <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-surface-1)] px-2 py-0.5">{LIFECYCLE_LABELS[goal.lifecycle]}</span>
          </div>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div><dt className="text-[var(--app-text-muted)]">Kapsam</dt><dd className="mt-0.5 text-[var(--app-text-primary)]">{scopeLabel(goal, media)}</dd></div>
        <div><dt className="text-[var(--app-text-muted)]">Metrik</dt><dd className="mt-0.5 text-[var(--app-text-primary)]">{metricLabel(goal)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[var(--app-text-muted)]">Program</dt><dd className="mt-0.5 text-[var(--app-text-primary)]">{scheduleLabel(goal)}</dd></div>
        {goal.schedule.kind !== "one_time" && <div className="sm:col-span-2"><dt className="text-[var(--app-text-muted)]">Timezone</dt><dd className="mt-0.5 text-[var(--app-text-primary)]">{goal.schedule.timeZone}</dd></div>}
      </dl>
      {goal.lifecycle === "active" && evaluation && (
        <section aria-label="Hedef ilerlemesi" className="mt-4 min-w-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-3">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-[var(--app-text-primary)]">{evaluation.currentValue} / {evaluation.targetValue}</span>
            <span className="text-[var(--app-text-secondary)]">{ATTAINMENT_LABELS[evaluation.attainment]}</span>
          </div>
          <div role="progressbar" aria-label={`${goal.title} ilerlemesi`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(evaluation.progressPercent)} className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--app-surface-3)]">
            <div className="h-full rounded-full bg-[var(--app-accent)] transition-[width]" style={{ width: `${evaluation.progressPercent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-[var(--app-text-muted)]">
            <span>%{Math.round(evaluation.progressPercent)} · Kalan {evaluation.remainingValue}</span>
            <span>{evaluation.periodStart} – {evaluation.periodEnd}</span>
          </div>
          {evaluation.warnings.length > 0 && (
            <ul aria-label="Hedef değerlendirme uyarıları" className="mt-3 space-y-1.5 text-xs text-[var(--app-warning)]">
              {evaluation.warnings.map((warning) => <li key={warning}>{WARNING_LABELS[warning]}</li>)}
            </ul>
          )}
        </section>
      )}
      {goal.lifecycle !== "active" && mediaMissing && <p role="status" className="mt-3 rounded-lg border border-[var(--app-warning)] bg-[var(--app-warning-soft)] px-3 py-2 text-xs text-[var(--app-warning)]">Bağlı medya bulunamadı</p>}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--app-border)] pt-3">
        {goal.lifecycle === "active" && <button type="button" onClick={onEdit} className={buttonClass}><Pencil className="h-3.5 w-3.5" />Düzenle</button>}
        {goal.lifecycle === "active" && <button type="button" onClick={onCancel} className={buttonClass}><Ban className="h-3.5 w-3.5" />İptal et</button>}
        {goal.lifecycle !== "archived" && <button type="button" onClick={onArchive} className={buttonClass}><Archive className="h-3.5 w-3.5" />Arşivle</button>}
        {goal.lifecycle !== "active" && <button type="button" onClick={onReactivate} className={buttonClass}><RotateCcw className="h-3.5 w-3.5" />Yeniden etkinleştir</button>}
        <button type="button" onClick={onDelete} className={`${buttonClass} text-[var(--app-danger)]`}><Trash2 className="h-3.5 w-3.5" />Sil</button>
      </div>
    </article>
  );
}
