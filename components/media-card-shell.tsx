import type { ReactNode } from "react";

export function MediaCardShell({ children, className = "", accentClassName }: {
  children: ReactNode;
  className?: string;
  accentClassName?: string;
}) {
  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-gradient-to-b from-[var(--app-card-bg)] to-[var(--app-surface-1)] transition-all duration-300 hover:border-[color-mix(in_srgb,var(--w-primary)_38%,var(--app-border-strong))] hover:shadow-lg hover:shadow-[var(--app-shadow)] motion-safe:hover:-translate-y-0.5 ${className}`}>
      <div aria-hidden className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accentClassName ?? "from-transparent via-[var(--w-primary)] to-transparent"} opacity-40 transition-opacity group-hover:opacity-90`} />
      {children}
    </div>
  );
}
