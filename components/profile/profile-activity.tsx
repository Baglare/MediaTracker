import { Activity } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageSection } from "@/components/ui/page-section";
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
    <PageSection title="Son Aktiviteler" description="En yeni ilerleme kayıtları" count={recent.length}>
      {recent.length === 0 ? <EmptyState compact title="Henüz aktivite yok" description="Kütüphane ilerleme hareketlerin burada görünecek." icon={<Activity className="h-5 w-5" aria-hidden="true"/>}/> : <div className="space-y-2">{recent.map((log) => <article key={log.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-3"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-medium">{log.mediaTitle}</p><span className="shrink-0 rounded-full bg-[var(--app-surface-3)] px-2 py-0.5 text-[10px] text-[var(--app-text-muted)]">{ACTION_LABELS[log.action]}</span></div><p className="mt-1 truncate text-xs text-[var(--app-text-muted)]">{new Date(log.createdAt).toLocaleDateString("tr-TR")}{log.detail ? ` · ${log.detail}` : ""}</p></article>)}</div>}
    </PageSection>
  );
}
