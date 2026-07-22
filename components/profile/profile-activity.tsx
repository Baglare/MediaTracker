import type { ProgressLog } from "@/lib/types";

const ACTION_LABELS: Record<ProgressLog["action"], string> = {
  increment: "İlerleme",
  complete: "Tamamlandı",
  manual_adjust: "Düzenleme",
  added: "Eklendi",
};

export function ProfileActivity({ logs }: { logs: ProgressLog[] }) {
  const recent = logs.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);
  return (
    <section className="app-card rounded-2xl border p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-sm font-semibold">Son Aktiviteler</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">En yeni ilerleme kayıtları</p></div><span className="text-xs text-[var(--app-text-muted)]">{recent.length}</span></div>
      {recent.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--app-border)] px-4 py-8 text-center text-sm text-[var(--app-text-muted)]">Henüz aktivite yok.</p> : <div className="space-y-2">{recent.map((log) => <article key={log.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-medium">{log.mediaTitle}</p><span className="shrink-0 rounded-full bg-[var(--app-surface-3)] px-2 py-0.5 text-[10px] text-[var(--app-text-muted)]">{ACTION_LABELS[log.action]}</span></div><p className="mt-1 truncate text-xs text-[var(--app-text-muted)]">{new Date(log.createdAt).toLocaleDateString("tr-TR")}{log.detail ? ` · ${log.detail}` : ""}</p></article>)}</div>}
    </section>
  );
}

