import type { ReactNode } from "react";

export function FilterToolbar({
  search,
  filters,
  sort,
  actions,
  label = "Filtreler",
}: {
  search?: ReactNode;
  filters?: ReactNode;
  sort?: ReactNode;
  actions?: ReactNode;
  label?: string;
}) {
  return (
    <div aria-label={label} className="app-toolbar flex flex-col gap-3 rounded-2xl border border-[var(--app-border)] p-3 lg:flex-row lg:items-center">
      {search && <div className="min-w-0 flex-1">{search}</div>}
      {filters && <div className="min-w-0 overflow-x-auto">{filters}</div>}
      {sort}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
