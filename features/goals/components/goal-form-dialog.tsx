"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { decodeGoal } from "@/features/goals/domain/codec";
import { isValidIanaTimeZone } from "@/features/goals/domain/dates";
import { progressUnitsForMediaType, validateResolvedMediaCompatibility } from "@/features/goals/domain/policies";
import { GOAL_TITLE_MAX_LENGTH, type Goal, type GoalMetric, type GoalSchedule, type GoalScope } from "@/features/goals/domain/types";
import type { CreateGoalInput } from "@/features/goals/data/goal-repository";
import type { MediaItem, MediaType } from "@/lib/types";

const MEDIA_TYPES: Array<{ value: MediaType; label: string }> = [
  { value: "movie", label: "Film" }, { value: "tv", label: "Dizi" },
  { value: "anime", label: "Anime" }, { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" }, { value: "manhua", label: "Manhua" },
  { value: "book", label: "Kitap" }, { value: "light_novel", label: "Light novel" },
  { value: "web_novel", label: "Web novel" }, { value: "visual_novel", label: "Visual novel" },
];

type MetricChoice = "episode" | "chapter" | "page" | "completed_media";
type ScopeChoice = GoalScope["kind"];
type ScheduleChoice = GoalSchedule["kind"];

const METRIC_LABELS: Record<MetricChoice, string> = {
  episode: "Bölüm", chapter: "Chapter", page: "Sayfa", completed_media: "Tamamlanan medya",
};

function dateToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function metricChoice(metric: Goal["metric"] | undefined): MetricChoice {
  return metric?.kind === "progress" ? metric.unit : "completed_media";
}

function compatibleMetrics(scopeKind: ScopeChoice, mediaType: MediaType): MetricChoice[] {
  if (scopeKind === "library") return ["episode", "chapter", "page", "completed_media"];
  return [...progressUnitsForMediaType(mediaType), "completed_media"];
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className="mt-1 block text-[11px] text-[var(--app-danger)]">{message}</span> : null;
}

export function GoalFormDialog({
  goal,
  mediaItems,
  onSubmit,
  onClose,
}: {
  goal?: Goal;
  mediaItems: readonly MediaItem[];
  onSubmit: (input: CreateGoalInput) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialMediaScope = goal?.scope.kind === "media" ? goal.scope : undefined;
  const initialMedia = initialMediaScope
    ? mediaItems.find((item) => item.id === initialMediaScope.mediaRecordId)
    : undefined;
  const [title, setTitle] = useState(goal?.title ?? "");
  const [scopeKind, setScopeKind] = useState<ScopeChoice>(goal?.scope.kind ?? "library");
  const [mediaType, setMediaType] = useState<MediaType>(
    goal?.scope.kind === "media_type" ? goal.scope.mediaType : initialMedia?.type ?? "tv",
  );
  const [mediaRecordId, setMediaRecordId] = useState(initialMediaScope?.mediaRecordId ?? "");
  const [metric, setMetric] = useState<MetricChoice>(metricChoice(goal?.metric));
  const [targetValue, setTargetValue] = useState(String(goal?.metric.targetValue ?? 1));
  const [scheduleKind, setScheduleKind] = useState<ScheduleChoice>(goal?.schedule.kind ?? "one_time");
  const [startsOn, setStartsOn] = useState(goal?.schedule.startsOn ?? dateToday());
  const [endsOn, setEndsOn] = useState(goal?.schedule.endsOn ?? dateToday());
  const [timeZone, setTimeZone] = useState(goal && goal.schedule.kind !== "one_time" ? goal.schedule.timeZone : browserTimeZone());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const selectedMedia = mediaItems.find((item) => item.id === mediaRecordId);
  const preservingMissingMedia = !selectedMedia && initialMediaScope?.mediaRecordId === mediaRecordId;
  const effectiveMediaType = scopeKind === "media" ? selectedMedia?.type ?? initialMedia?.type ?? mediaType : mediaType;
  const metricOptions = useMemo(() => {
    const compatible = compatibleMetrics(scopeKind, effectiveMediaType);
    if (scopeKind === "media" && !selectedMedia && goal?.scope.kind === "media") {
      return Array.from(new Set([metricChoice(goal.metric), ...compatible]));
    }
    return compatible;
  }, [effectiveMediaType, goal, scopeKind, selectedMedia]);
  const effectiveMetric = metricOptions.includes(metric) ? metric : metricOptions[0];
  const singleMediaCompletion = scopeKind === "media" && effectiveMetric === "completed_media";

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled])',
    ) ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    const numericTarget = singleMediaCompletion ? 1 : Number(targetValue);
    if (!title.trim()) nextErrors.title = "Başlık boş olamaz.";
    if (title.trim().length > GOAL_TITLE_MAX_LENGTH) nextErrors.title = `Başlık en fazla ${GOAL_TITLE_MAX_LENGTH} karakter olabilir.`;
    if (!Number.isSafeInteger(numericTarget) || numericTarget <= 0) nextErrors.targetValue = "Hedef miktarı pozitif tam sayı olmalıdır.";
    if (scopeKind === "media" && !selectedMedia && !preservingMissingMedia) nextErrors.mediaRecordId = "Kütüphaneden exact bir medya kaydı seç.";
    if (scheduleKind !== "one_time" && !isValidIanaTimeZone(timeZone)) nextErrors.timeZone = "Geçerli bir IANA timezone gir.";

    const scope: GoalScope = scopeKind === "library"
      ? { kind: "library" }
      : scopeKind === "media_type"
        ? { kind: "media_type", mediaType }
        : { kind: "media", mediaRecordId };
    const metricValue: GoalMetric = effectiveMetric === "completed_media"
      ? { kind: "completed_media", targetValue: numericTarget }
      : { kind: "progress", unit: effectiveMetric, targetValue: numericTarget };
    const schedule: GoalSchedule = scheduleKind === "one_time"
      ? { kind: "one_time", startsOn, endsOn }
      : scheduleKind === "weekly"
        ? { kind: "weekly", startsOn, weekStartsOn: "monday", timeZone, ...(endsOn ? { endsOn } : {}) }
        : { kind: "monthly", startsOn, timeZone, ...(endsOn ? { endsOn } : {}) };
    const instant = new Date(Math.max(Date.now(), Date.parse(goal?.updatedAt ?? "") || 0)).toISOString();
    const decoded = decodeGoal({
      id: goal?.id ?? "00000000-0000-4000-8000-000000000001",
      title,
      origin: goal?.origin ?? "manual",
      scope,
      metric: metricValue,
      schedule,
      lifecycle: goal?.lifecycle ?? "active",
      createdAt: goal?.createdAt ?? instant,
      updatedAt: instant,
    });
    if (!decoded.ok) {
      for (const issue of decoded.issues) {
        if (issue.path.includes("title")) nextErrors.title ??= issue.message;
        else if (issue.path.includes("targetValue")) nextErrors.targetValue ??= issue.message;
        else if (issue.path === "metric") nextErrors.metric ??= issue.message;
        else if (issue.path.startsWith("schedule")) nextErrors.schedule ??= issue.message;
      }
    } else if (scope.kind === "media" && !preservingMissingMedia) {
      const policy = validateResolvedMediaCompatibility(decoded.value, mediaItems);
      if (!policy.ok) nextErrors.metric = policy.message;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSubmit({ title: title.trim(), scope, metric: metricValue, schedule });
  };

  const fieldClass = "mt-1.5 w-full rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-3 py-2 text-sm text-[var(--app-text-primary)]";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="goal-form-title" aria-describedby="goal-form-description" className="fixed inset-0 z-[80] grid place-items-center bg-[var(--app-overlay)] p-4">
      <div ref={dialogRef} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
          <h2 id="goal-form-title" className="font-semibold">{goal ? "Hedefi düzenle" : "Hedef oluştur"}</h2>
          <button type="button" aria-label="Hedef formunu kapat" onClick={onClose} className="rounded-lg p-2 focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><X className="h-4 w-4" /></button>
        </div>
        <p id="goal-form-description" className="sr-only">Manuel hedef tanımını oluştur veya düzenle.</p>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="sm:col-span-2 text-xs">Başlık
            <input value={title} maxLength={GOAL_TITLE_MAX_LENGTH} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "goal-title-error" : undefined} className={fieldClass} />
            <FieldError id="goal-title-error" message={errors.title} />
          </label>
          <label className="text-xs">Kapsam
            <select value={scopeKind} onChange={(event) => {
              const next = event.target.value as ScopeChoice;
              setScopeKind(next);
              const nextType = next === "media" ? selectedMedia?.type ?? mediaType : mediaType;
              const nextMetrics = compatibleMetrics(next, nextType);
              if (!nextMetrics.includes(metric)) setMetric(nextMetrics[0]);
              setErrors({});
            }} className={fieldClass}>
              <option value="library">Tüm kütüphane</option><option value="media_type">Medya türü</option><option value="media">Belirli medya</option>
            </select>
          </label>
          {scopeKind === "media_type" && <label className="text-xs">Medya türü
            <select value={mediaType} onChange={(event) => {
              const next = event.target.value as MediaType;
              setMediaType(next);
              const nextMetrics = compatibleMetrics("media_type", next);
              if (!nextMetrics.includes(metric)) setMetric(nextMetrics[0]);
            }} className={fieldClass}>{MEDIA_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </label>}
          {scopeKind === "media" && <label className="text-xs">Bağlı medya
            <select value={mediaRecordId} onChange={(event) => {
              const nextId = event.target.value;
              setMediaRecordId(nextId);
              const nextMedia = mediaItems.find((item) => item.id === nextId);
              if (nextMedia) {
                const nextMetrics = compatibleMetrics("media", nextMedia.type);
                if (!nextMetrics.includes(metric)) setMetric(nextMetrics[0]);
              }
            }} aria-invalid={Boolean(errors.mediaRecordId)} aria-describedby={errors.mediaRecordId ? "goal-media-error" : undefined} className={fieldClass}>
              <option value="">Medya seç</option>
              {!selectedMedia && initialMediaScope && <option value={initialMediaScope.mediaRecordId}>Bağlı medya bulunamadı</option>}
              {mediaItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select><FieldError id="goal-media-error" message={errors.mediaRecordId} />
          </label>}
          <label className="text-xs">Metrik
            <select value={effectiveMetric} onChange={(event) => setMetric(event.target.value as MetricChoice)} aria-invalid={Boolean(errors.metric)} aria-describedby={errors.metric ? "goal-metric-error" : undefined} className={fieldClass}>
              {metricOptions.map((item) => <option key={item} value={item}>{METRIC_LABELS[item]}</option>)}
            </select><FieldError id="goal-metric-error" message={errors.metric} />
          </label>
          <label className="text-xs">Hedef miktarı
            <input type="number" min={1} step={1} disabled={singleMediaCompletion} value={singleMediaCompletion ? "1" : targetValue} onChange={(event) => setTargetValue(event.target.value)} aria-invalid={Boolean(errors.targetValue)} aria-describedby={errors.targetValue ? "goal-target-error" : undefined} className={fieldClass} />
            <FieldError id="goal-target-error" message={errors.targetValue} />
          </label>
          <label className="text-xs">Program
            <select value={scheduleKind} onChange={(event) => {
              const next = event.target.value as ScheduleChoice;
              setScheduleKind(next);
              if (!goal) setEndsOn(next === "one_time" ? startsOn : "");
            }} className={fieldClass}>
              <option value="one_time">Tek seferlik</option><option value="weekly">Haftalık</option><option value="monthly">Aylık</option>
            </select>
          </label>
          <label className="text-xs">Başlangıç
            <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} aria-invalid={Boolean(errors.schedule)} aria-describedby={errors.schedule ? "goal-schedule-error" : undefined} className={fieldClass} />
          </label>
          <label className="text-xs">{scheduleKind === "one_time" ? "Bitiş" : "Bitiş (opsiyonel)"}
            <input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} aria-invalid={Boolean(errors.schedule)} aria-describedby={errors.schedule ? "goal-schedule-error" : undefined} className={fieldClass} />
            <FieldError id="goal-schedule-error" message={errors.schedule} />
          </label>
          {scheduleKind !== "one_time" && <label className="text-xs">Timezone
            <input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} aria-invalid={Boolean(errors.timeZone)} aria-describedby={errors.timeZone ? "goal-timezone-error" : undefined} className={fieldClass} />
            <FieldError id="goal-timezone-error" message={errors.timeZone} />
          </label>}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs">Vazgeç</button>
          <button type="button" onClick={submit} className="app-primary-action rounded-lg px-3 py-2 text-xs font-semibold">{goal ? "Kaydet" : "Oluştur"}</button>
        </div>
      </div>
    </div>
  );
}
