import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  compact = false,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-dashed border-[var(--app-border-strong)] bg-[var(--app-subtle-highlight)] text-center ${compact ? "p-5" : "px-5 py-9"}`}>
      {icon && <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--app-surface-3)] text-[var(--app-text-secondary)]">{icon}</div>}
      <h3 className="text-sm font-semibold text-[var(--app-text-primary)]">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[var(--app-text-muted)]">{description}</p>
      {(primaryAction || secondaryAction) && <div className="mt-4 flex flex-wrap justify-center gap-2">{primaryAction}{secondaryAction}</div>}
    </div>
  );
}
