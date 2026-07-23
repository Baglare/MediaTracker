import type { ReactNode } from "react";

export type StatCardTone = "neutral" | "accent" | "success" | "warning" | "danger" | "world";

const TONE_CLASSES: Readonly<Record<StatCardTone, string>> = {
  neutral: "border-[var(--app-border)]",
  accent: "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]",
  success: "border-[var(--app-action-success-border)] bg-[var(--app-action-success-bg)]",
  warning: "border-[color-mix(in_srgb,var(--app-warning)_38%,transparent)] bg-[var(--app-warning-soft)]",
  danger: "border-[color-mix(in_srgb,var(--app-danger)_38%,transparent)] bg-[var(--app-danger-soft)]",
  world: "border-[var(--w-border)] bg-[var(--w-soft)]",
};

export function StatCard({
  label,
  value,
  supportingText,
  icon,
  status,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  supportingText?: string;
  icon?: ReactNode;
  status?: ReactNode;
  tone?: StatCardTone;
}) {
  return (
    <article className={`density-card rounded-2xl border bg-[var(--app-card-bg)] ${TONE_CLASSES[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--app-text-muted)]">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--app-text-primary)]">{value}</p>
        </div>
        {icon && <span className="text-[var(--app-accent-strong)]">{icon}</span>}
      </div>
      {(supportingText || status) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-muted)]">
          {supportingText && <span>{supportingText}</span>}
          {status}
        </div>
      )}
    </article>
  );
}
