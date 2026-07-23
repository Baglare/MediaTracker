import type { ReactNode } from "react";

export function SectionHeading({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text-primary)]">
          {icon}
          {title}
        </h2>
        {description && <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
