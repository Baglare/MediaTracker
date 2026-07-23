import type { ReactNode } from "react";

export type StatusBadgeTone = "neutral" | "accent" | "info" | "success" | "warning" | "danger" | "world";

const TONE_CLASSES: Readonly<Record<StatusBadgeTone, string>> = {
  neutral: "border-[var(--app-border-strong)] bg-[var(--app-surface-3)] text-[var(--app-text-secondary)]",
  accent: "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] text-[var(--app-selected-text)]",
  info: "border-sky-500/35 bg-sky-500/10 text-sky-300",
  success: "border-[var(--app-action-success-border)] bg-[var(--app-action-success-bg)] text-[var(--app-action-success-text)]",
  warning: "border-amber-500/35 bg-[var(--app-warning-soft)] text-amber-300",
  danger: "border-rose-500/35 bg-[var(--app-danger-soft)] text-[var(--app-danger)]",
  world: "border-[var(--w-border)] bg-[var(--w-soft)] text-[var(--w-primary-strong)]",
};

export function StatusBadge({
  children,
  tone = "neutral",
  icon,
  label,
}: {
  children: ReactNode;
  tone?: StatusBadgeTone;
  icon?: ReactNode;
  label?: string;
}) {
  return (
    <span aria-label={label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {icon}
      {children}
    </span>
  );
}
