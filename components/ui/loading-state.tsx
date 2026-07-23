export function LoadingState({
  label = "Yükleniyor…",
  compact = false,
  rows = 3,
}: {
  label?: string;
  compact?: boolean;
  rows?: number;
}) {
  return (
    <div role="status" aria-busy="true" className={`rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-bg)] ${compact ? "p-4" : "p-5"}`}>
      <span className="sr-only">{label}</span>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="h-3 rounded-full bg-[var(--app-surface-3)] motion-safe:animate-pulse" style={{ width: `${Math.max(42, 88 - index * 13)}%` }} />
        ))}
      </div>
    </div>
  );
}
