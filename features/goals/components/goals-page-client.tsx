"use client";

import { useCallback, useMemo, useState } from "react";
import { EyeOff, Plus, Target } from "lucide-react";

import ConfirmDialog from "@/components/confirm-dialog";
import PageHeader from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GoalRepositoryError, type CreateGoalInput } from "@/features/goals/data/goal-repository";
import { GoalCard } from "@/features/goals/components/goal-card";
import { GoalFormDialog } from "@/features/goals/components/goal-form-dialog";
import type { Goal, GoalLifecycle } from "@/features/goals/domain/types";
import type { GeneratedGoalSuggestion } from "@/features/goals/evaluation";
import { useGoalEvaluations } from "@/features/goals/hooks/use-goal-evaluations";
import { useGoals } from "@/features/goals/hooks/use-goals";
import { useAuth } from "@/hooks/use-auth";
import { useMediaLibrary } from "@/hooks/use-media-library";
import { GoalCloudConflictPanel } from "@/features/goals/components/goal-cloud-conflict-panel";

const TABS: Array<{ id: GoalLifecycle; label: string }> = [
  { id: "active", label: "Aktif hedefler" },
  { id: "cancelled", label: "İptal edilenler" },
  { id: "archived", label: "Arşivlenenler" },
];

type PendingAction = { kind: "cancel" | "archive" | "reactivate" | "delete"; goal: Goal };

function suggestionScopeLabel(item: GeneratedGoalSuggestion): string {
  return item.suggestion.scope.kind === "library"
    ? "Tüm kütüphane"
    : item.suggestion.scope.kind === "media_type"
      ? item.suggestion.scope.mediaType
      : "";
}

function suggestionMetricLabel(item: GeneratedGoalSuggestion): string {
  const metric = item.suggestion.metric;
  if (metric.kind === "completed_media") return `${metric.targetValue} tamamlanan medya`;
  const unit = metric.unit === "episode" ? "bölüm" : metric.unit === "chapter" ? "chapter" : "sayfa";
  return `${metric.targetValue} ${unit}`;
}

export function GoalsPageClient() {
  const auth = useAuth();
  const ownerId = auth.loading ? undefined : auth.user?.id ?? null;
  const library = useMediaLibrary(ownerId);
  const goals = useGoals(ownerId, library.mediaList);
  const [tab, setTab] = useState<GoalLifecycle>("active");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string>();
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  const visibleGoals = useMemo(() => goals.goals.filter((goal) => goal.lifecycle === tab), [goals.goals, tab]);
  const readModels = useGoalEvaluations({
    ownerKey: goals.ownerScope?.key ?? null,
    ready: goals.ready && library.isLoaded,
    goals: goals.goals,
    mediaItems: library.mediaList,
    progressLogs: library.progressLogs,
  });
  const visibleSuggestions = useMemo(() => {
    const ownerKey = goals.ownerScope?.key ?? "pending";
    return readModels.suggestions.filter((item) => !dismissedSuggestions.has(`${ownerKey}:${item.suggestion.suggestionId}`));
  }, [dismissedSuggestions, goals.ownerScope?.key, readModels.suggestions]);

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

  const hideSuggestion = (item: GeneratedGoalSuggestion) => {
    const ownerKey = goals.ownerScope?.key ?? "pending";
    setDismissedSuggestions((current) => new Set(current).add(`${ownerKey}:${item.suggestion.suggestionId}`));
  };

  const approveSuggestion = (item: GeneratedGoalSuggestion) => {
    const success = run(() => goals.mutations.approveSuggestion(item.suggestion));
    if (success) hideSuggestion(item);
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
      <GoalCloudConflictPanel ownerScope={goals.ownerScope} />
      {tab === "active" && visibleSuggestions.length > 0 && (
        <section aria-labelledby="goal-suggestions-title" className="mb-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
          <h2 id="goal-suggestions-title" className="text-sm font-semibold text-[var(--app-text-primary)]">Önerilen hedefler</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
            {visibleSuggestions.map((item) => (
              <article key={item.suggestion.suggestionId} className="min-w-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-3">
                <h3 className="break-words text-sm font-medium text-[var(--app-text-primary)]">{item.suggestion.title}</h3>
                <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{suggestionMetricLabel(item)} · {item.suggestion.schedule.kind === "weekly" ? "Haftalık" : "Aylık"}</p>
                <p className="mt-1 break-words text-xs text-[var(--app-text-muted)]">{suggestionScopeLabel(item)}</p>
                <p className="mt-2 text-xs text-[var(--app-text-secondary)]">{item.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => approveSuggestion(item)} className="app-primary-action inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"><Plus className="h-3.5 w-3.5" />Hedef olarak ekle</button>
                  <button type="button" onClick={() => hideSuggestion(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs text-[var(--app-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><EyeOff className="h-3.5 w-3.5" />Şimdilik gizle</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {!goals.ready || !library.isLoaded ? (
        <p className="text-sm text-[var(--app-text-muted)]">Hedefler yükleniyor…</p>
      ) : visibleGoals.length === 0 ? (
        <EmptyState icon={<Target className="h-5 w-5" />} title={`${TABS.find((item) => item.id === tab)?.label} boş`} description="Bu yaşam döngüsü durumunda kayıtlı hedef tanımı yok." primaryAction={tab === "active" ? <button type="button" onClick={() => setEditing("new")} className="app-primary-action rounded-lg px-3 py-2 text-xs font-semibold">Hedef oluştur</button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleGoals.map((goal) => <GoalCard key={goal.id} goal={goal} mediaItems={library.mediaList} evaluation={goal.lifecycle === "active" ? readModels.byGoalId.get(goal.id) : undefined} onEdit={() => setEditing(goal)} onCancel={() => setPending({ kind: "cancel", goal })} onArchive={() => setPending({ kind: "archive", goal })} onReactivate={() => setPending({ kind: "reactivate", goal })} onDelete={() => setPending({ kind: "delete", goal })} />)}
        </div>
      )}
      {editing && <GoalFormDialog goal={editing === "new" ? undefined : editing} mediaItems={library.mediaList} onSubmit={save} onClose={() => setEditing(null)} />}
      <ConfirmDialog isOpen={Boolean(pending)} title={confirmCopy.title} message={confirmCopy.message} confirmLabel={confirmCopy.label} onConfirm={confirm} onCancel={() => setPending(null)} />
    </div>
  );
}
