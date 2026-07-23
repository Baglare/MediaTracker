import type { ReactNode } from "react";

interface PageSectionProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  count?: number;
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
}

export function PageSection({
  title,
  description,
  action,
  count,
  children,
  className = "",
  as: Component = "section",
}: PageSectionProps) {
  const labelled = Boolean(title);
  return (
    <Component className={`app-section rounded-2xl border border-[var(--app-border)] ${className}`}>
      {(title || description || action || count !== undefined) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title && (
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text-primary)]">
                {title}
                {count !== undefined && (
                  <span className="rounded-full bg-[var(--app-surface-3)] px-2 py-0.5 text-[11px] font-normal tabular-nums text-[var(--app-text-muted)]">
                    {count}
                  </span>
                )}
              </h2>
            )}
            {description && <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div aria-label={labelled ? title : undefined}>{children}</div>
    </Component>
  );
}
