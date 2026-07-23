"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export function ErrorState({
  title = "Bir sorun oluştu",
  description,
  onRetry,
  retryLabel = "Tekrar dene",
  compact = false,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}) {
  return (
    <div role="alert" className={`rounded-2xl border border-[color-mix(in_srgb,var(--app-danger)_38%,transparent)] bg-[var(--app-danger-soft)] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-danger)]" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--app-text-primary)]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--app-text-secondary)]">{description}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] px-3 py-2 text-xs font-medium text-[var(--app-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {retryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
