"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import {
  createManualReleaseEvent,
  updateManualReleaseEvent,
  type ManualReleaseEventInput,
} from "@/features/calendar/domain/manual-release-calendar";
import { isReleaseEligible } from "@/features/calendar/domain/release-calendar";
import type {
  ManualReleaseEvent,
  ManualReleaseEventKind,
  MediaItem,
  MediaReleaseSchedule,
} from "@/lib/types";

type Precision = MediaReleaseSchedule["precision"];

const EVENT_KINDS: Array<{ value: ManualReleaseEventKind; label: string }> = [
  { value: "episode", label: "Bölüm" },
  { value: "season_premiere", label: "Sezon prömiyeri" },
  { value: "movie_release", label: "Film yayını" },
  { value: "publication", label: "Yayın / basım" },
  { value: "manual", label: "Diğer" },
];
const PRECISIONS: Array<{ value: Precision; label: string }> = [
  { value: "exact_datetime", label: "Kesin tarih ve saat" },
  { value: "date_only", label: "Gün" },
  { value: "month_only", label: "Ay" },
  { value: "year_only", label: "Yıl" },
  { value: "tba", label: "Tarih açıklanmadı" },
];

function localDateTimeInput(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${parts}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function initialScheduleValue(schedule: MediaReleaseSchedule | undefined): string {
  if (!schedule) return "";
  switch (schedule.precision) {
    case "exact_datetime":
      return localDateTimeInput(schedule.dateTime);
    case "date_only":
      return schedule.date;
    case "month_only":
      return schedule.month;
    case "year_only":
      return String(schedule.year);
    case "tba":
      return "";
  }
}

function scheduleFromInput(
  precision: Precision,
  value: string,
): MediaReleaseSchedule | null {
  if (precision === "tba") return { precision: "tba" };
  if (!value) return null;
  if (precision === "exact_datetime") {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? { precision, dateTime: date.toISOString() }
      : null;
  }
  if (precision === "date_only") return { precision, date: value };
  if (precision === "month_only") return { precision, month: value };
  const year = Number(value);
  return Number.isInteger(year) ? { precision, year } : null;
}

export function ManualReleaseEventDialog({
  mediaList,
  initialMedia,
  editingEvent,
  onSave,
  onClose,
}: {
  mediaList: MediaItem[];
  initialMedia?: MediaItem;
  editingEvent?: ManualReleaseEvent;
  onSave: (item: MediaItem) => boolean;
  onClose: () => void;
}) {
  const eligibleMedia = useMemo(
    () => mediaList.filter(isReleaseEligible),
    [mediaList],
  );
  const [mediaId, setMediaId] = useState(initialMedia?.id ?? eligibleMedia[0]?.id ?? "");
  const [eventKind, setEventKind] = useState<ManualReleaseEventKind>(
    editingEvent?.eventKind ?? "manual",
  );
  const [title, setTitle] = useState(editingEvent?.title ?? "");
  const [precision, setPrecision] = useState<Precision>(
    editingEvent?.schedule.precision ?? "date_only",
  );
  const [scheduleValue, setScheduleValue] = useState(
    initialScheduleValue(editingEvent?.schedule),
  );
  const [note, setNote] = useState(editingEvent?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const selectedMedia = mediaList.find((item) => item.id === mediaId);

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!selectedMedia) nextErrors.mediaId = "Kütüphaneden bir medya seç.";
    if (!title.trim()) nextErrors.title = "Başlık boş olamaz.";
    const schedule = scheduleFromInput(precision, scheduleValue);
    if (!schedule) nextErrors.schedule = "Seçilen kesinliğe uygun tarih gir.";
    if (note.length > 1000) nextErrors.note = "Not en fazla 1000 karakter olabilir.";
    if (Object.keys(nextErrors).length > 0 || !selectedMedia || !schedule) {
      setErrors(nextErrors);
      return;
    }
    const input: ManualReleaseEventInput = {
      eventKind,
      title: title.trim(),
      schedule,
      note: note.trim() || undefined,
    };
    const result = editingEvent
      ? updateManualReleaseEvent(selectedMedia, editingEvent.id, input)
      : createManualReleaseEvent(selectedMedia, input);
    if (!result.ok) {
      setErrors(Object.fromEntries(
        result.issues.map((entry) => [entry.path.split(".").at(-1) ?? "form", entry.message]),
      ));
      return;
    }
    if (!onSave(result.item)) {
      setErrors({ form: "Yerel kayıt tamamlanamadı; cloud kuyruğu başlatılmadı." });
      return;
    }
    onClose();
  };

  const dateInput = precision === "exact_datetime"
    ? "datetime-local"
    : precision === "date_only"
      ? "date"
      : precision === "month_only"
        ? "month"
        : "number";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-release-title"
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
          <h2 id="manual-release-title" className="text-base font-semibold text-[var(--app-text-primary)]">
            {editingEvent ? "Manuel yayını düzenle" : "Manuel yayın ekle"}
          </h2>
          <button
            type="button"
            aria-label="Manuel yayın penceresini kapat"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--app-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <label className="block text-xs text-[var(--app-text-secondary)]">
            Bağlı medya
            <select
              value={mediaId}
              disabled={Boolean(editingEvent)}
              onChange={(event) => setMediaId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm"
            >
              <option value="">Medya seç</option>
              {eligibleMedia.map((media) => (
                <option key={media.id} value={media.id}>{media.title}</option>
              ))}
            </select>
            {errors.mediaId && <span className="mt-1 block text-[11px] text-[var(--app-danger)]">{errors.mediaId}</span>}
          </label>
          <label className="block text-xs text-[var(--app-text-secondary)]">
            Olay türü
            <select
              value={eventKind}
              onChange={(event) => setEventKind(event.target.value as ManualReleaseEventKind)}
              className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm"
            >
              {EVENT_KINDS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--app-text-secondary)]">
            Başlık
            <input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm"
            />
            {errors.title && <span className="mt-1 block text-[11px] text-[var(--app-danger)]">{errors.title}</span>}
          </label>
          <label className="block text-xs text-[var(--app-text-secondary)]">
            Tarih kesinliği
            <select
              value={precision}
              onChange={(event) => {
                setPrecision(event.target.value as Precision);
                setScheduleValue("");
              }}
              className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm"
            >
              {PRECISIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {precision !== "tba" && (
            <label className="block text-xs text-[var(--app-text-secondary)]">
              Tarih
              <input
                type={dateInput}
                value={scheduleValue}
                min={precision === "year_only" ? "1" : undefined}
                max={precision === "year_only" ? "9999" : undefined}
                onChange={(event) => setScheduleValue(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm"
              />
              {errors.schedule && <span className="mt-1 block text-[11px] text-[var(--app-danger)]">{errors.schedule}</span>}
            </label>
          )}
          <label className="block text-xs text-[var(--app-text-secondary)]">
            Not (opsiyonel)
            <textarea
              value={note}
              maxLength={1000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5 w-full resize-y rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm"
            />
            {errors.note && <span className="mt-1 block text-[11px] text-[var(--app-danger)]">{errors.note}</span>}
          </label>
          {errors.form && <p role="alert" className="text-xs text-[var(--app-danger)]">{errors.form}</p>}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs">
            Vazgeç
          </button>
          <button type="button" onClick={submit} className="rounded-lg bg-[var(--app-accent)] px-3 py-2 text-xs font-semibold text-white">
            {editingEvent ? "Değişiklikleri kaydet" : "Manuel yayın oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}

