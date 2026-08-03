"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Target } from "lucide-react";

import ConfirmDialog from "@/components/confirm-dialog";
import PageHeader from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GoalRepositoryError, type CreateGoalInput } from "@/features/goals/data/goal-repository";
import { GoalCard } from "@/features/goals/components/goal-card";
import { GoalFormDialog } from "@/features/goals/components/goal-form-dialog";
import type { Goal, GoalLifecycle } from "@/features/goals/domain/types";
import { useGoals } from "@/features/goals/hooks/use-goals";
import { useAuth } from "@/hooks/use-auth";
import { useMediaLibrary } from "@/hooks/use-media-library";

const TABS: Array<{ id: GoalLifecycle; label: string }> = [
  { id: "active", label: "Aktif hedefler" },
  { id: "cancelled", label: "İptal edilenler" },
  { id: "archived", label: "Arşivlenenler" },
];

type PendingAction = { kind: "cancel" | "archive" | "reactivate" | "delete"; goal: Goal };

export function GoalsPageClient() {
  const auth = useAuth();
  const ownerId = auth.loading ? undefined : auth.user?.id ?? null;
  const library = useMediaLibrary(ownerId);
  const goals = useGoals(ownerId, library.mediaList);
  const [tab, setTab] = useState<GoalLifecycle>("active");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string>();
  const visibleGoals = useMemo(() => goals.goals.filter((goal) => goal.lifecycle === tab), [goals.goals, tab]);

  const run = useCallback((operation: () => void) => {
    try {
      operation();
      setError(undefined);
      return true;
    } catch (caught) {
      setError(caught instanceof GoalRepositoryError ? caught.message : "Hedef işlemi tamamlanamadı.");
      return false;
    }
  }, []);

  const save = (input: CreateGoalInput) => {
    const success = run(() => {
      if (editing === "new") goals.mutations.create(input);
      else if (editing) goals.mutations.update(editing.id, input);
    });
    if (success) setEditing(null);
  };

  const confirm = () => {
    if (!pending) return;
    const success = run(() => {
      if (pending.kind === "cancel") goals.mutations.cancel(pending.goal.id);
      if (pending.kind === "archive") goals.mutations.archive(pending.goal.id);
      if (pending.kind === "reactivate") goals.mutations.reactivate(pending.goal.id);
      if (pending.kind === "delete") goals.mutations.delete(pending.goal.id);
    });
    if (success) setPending(null);
  };

  const confirmCopy = pending?.kind === "delete"
    ? { title: "Hedefi kalıcı olarak sil", message: "Bu hedef tanımı fiziksel olarak silinecek. İptal ve arşiv durumları silme değildir.", label: "Kalıcı sil" }
    : pending?.kind === "cancel"
      ? { title: "Hedefi iptal et", message: "Hedef aktif değerlendirme kapsamından çıkarılacak.", label: "İptal et" }
      : pending?.kind === "archive"
        ? { title: "Hedefi arşivle", message: "Hedef arşivlenen tanımlar arasında saklanacak.", label: "Arşivle" }
        : { title: "Hedefi yeniden etkinleştir", message: "Hedef yeniden aktif lifecycle durumuna alınacak.", label: "Etkinleştir" };

  return (
    <div>
      <PageHeader icon={Target} title="Hedefler" subtitle="Manuel hedef tanımlarını yönet." actions={
        <button type="button" onClick={() => setEditing("new")} disabled={!goals.ready || !library.isLoaded} className="app-primary-action inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"><Plus className="h-4 w-4" />Hedef oluştur</button>
      } />
      <div role="tablist" aria-label="Hedef yaşam döngüsü" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`rounded-lg border px-3 py-2 text-xs font-medium ${tab === item.id ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] text-[var(--app-selected-text)]" : "border-[var(--app-border)] bg-[var(--app-surface-1)] text-[var(--app-text-secondary)]"}`}>{item.label} <span className="ml-1 tabular-nums">{goals.goals.filter((goal) => goal.lifecycle === item.id).length}</span></button>)}
      </div>
      {(error || goals.error) && <p role="alert" className="mb-4 rounded-lg border border-[var(--app-danger)] bg-[var(--app-danger-soft)] p-3 text-xs text-[var(--app-danger)]">{error ?? goals.error}</p>}
      {!goals.ready || !library.isLoaded ? (
        <p className="text-sm text-[var(--app-text-muted)]">Hedefler yükleniyor…</p>
      ) : visibleGoals.length === 0 ? (
        <EmptyState icon={<Target className="h-5 w-5" />} title={`${TABS.find((item) => item.id === tab)?.label} boş`} description="Bu yaşam döngüsü durumunda kayıtlı hedef tanımı yok." primaryAction={tab === "active" ? <button type="button" onClick={() => setEditing("new")} className="app-primary-action rounded-lg px-3 py-2 text-xs font-semibold">Hedef oluştur</button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleGoals.map((goal) => <GoalCard key={goal.id} goal={goal} mediaItems={library.mediaList} onEdit={() => setEditing(goal)} onCancel={() => setPending({ kind: "cancel", goal })} onArchive={() => setPending({ kind: "archive", goal })} onReactivate={() => setPending({ kind: "reactivate", goal })} onDelete={() => setPending({ kind: "delete", goal })} />)}
        </div>
      )}
      {editing && <GoalFormDialog goal={editing === "new" ? undefined : editing} mediaItems={library.mediaList} onSubmit={save} onClose={() => setEditing(null)} />}
      <ConfirmDialog isOpen={Boolean(pending)} title={confirmCopy.title} message={confirmCopy.message} confirmLabel={confirmCopy.label} onConfirm={confirm} onCancel={() => setPending(null)} />
    </div>
  );
}
