import type { ReactNode } from "react";

export function ContextualActions({ children, label = "İlgili işlemler" }: { children: ReactNode; label?: string }) {
  return (
    <div aria-label={label} className="flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}
