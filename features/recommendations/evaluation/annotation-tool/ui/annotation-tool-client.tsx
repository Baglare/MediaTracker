"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AnnotationConfidence, AspectAnnotationLabel } from "../../dataset";
import { ANNOTATION_CONFIDENCE_UI, ANNOTATION_LABEL_UI } from "../domain/constants";
import type {
  AnnotationImportPreview,
  AnnotationToolReadModel,
  AnnotationValidationIssue,
} from "../domain/types";
import { isEditableShortcutTarget, resolveAnnotationShortcut } from "./shortcuts";

const API = "/api/dev/recommendation-annotation";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "İşlem tamamlanamadı.");
  return data;
}

function issueTone(issue: AnnotationValidationIssue): string {
  return issue.severity === "critical" ? "border-rose-500/40 bg-rose-500/10"
    : issue.severity === "warning" ? "border-amber-500/40 bg-amber-500/10"
      : "border-sky-500/30 bg-sky-500/10";
}

export function AnnotationToolClient() {
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [newWorkspaceId, setNewWorkspaceId] = useState("synthetic-demo");
  const [actorId, setActorId] = useState("ann_internal_01");
  const [model, setModel] = useState<AnnotationToolReadModel | null>(null);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [label, setLabel] = useState<AspectAnnotationLabel>("insufficient_evidence");
  const [confidence, setConfidence] = useState<AnnotationConfidence>("low");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [contradictionNote, setContradictionNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importRaw, setImportRaw] = useState("");
  const [importPreview, setImportPreview] = useState<AnnotationImportPreview | null>(null);
  const [validation, setValidation] = useState<readonly AnnotationValidationIssue[]>([]);
  const [exportPreview, setExportPreview] = useState("");

  const loadList = useCallback(async () => {
    const result = await requestJson<{ workspaceIds: string[] }>(API);
    setWorkspaceIds(result.workspaceIds);
    return result.workspaceIds;
  }, []);

  const loadWorkspace = useCallback(async (id: string) => {
    const result = await requestJson<AnnotationToolReadModel>(`${API}?workspaceId=${encodeURIComponent(id)}`);
    setWorkspaceId(id);
    setModel(result);
    setValidation(result.validation);
    setActiveTaskId((current) => result.tasks.some((task) => task.taskId === current) ? current : result.tasks[0]?.taskId ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const listed = await requestJson<{ workspaceIds: string[] }>(API);
        if (cancelled) return;
        setWorkspaceIds(listed.workspaceIds);
        const first = listed.workspaceIds[0];
        if (!first) return;
        const result = await requestJson<AnnotationToolReadModel>(`${API}?workspaceId=${encodeURIComponent(first)}`);
        if (cancelled) return;
        setWorkspaceId(first);
        setModel(result);
        setValidation(result.validation);
        setActiveTaskId(result.tasks[0]?.taskId ?? "");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Workspace listesi yüklenemedi.");
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  const tasks = useMemo(() => model?.tasks ?? [], [model?.tasks]);
  const activeTask = tasks.find((task) => task.taskId === activeTaskId) ?? null;
  const activeIndex = activeTask ? tasks.indexOf(activeTask) : -1;
  const activeRecord = model?.records.find((entry) => entry.record.recordId === activeTask?.recordId) ?? null;
  const activeAspect = model?.aspects.find((entry) => entry.id === activeTask?.aspectId) ?? null;
  const activeAnnotation = model?.annotations.find((entry) => entry.active
    && entry.annotation.recordId === activeTask?.recordId
    && entry.annotation.aspectId === activeTask?.aspectId
    && entry.annotation.annotationRound === activeTask?.annotationRound
    && entry.annotation.annotatorId === actorId) ?? null;
  const completed = tasks.filter((task) => ["annotated", "adjudicated"].includes(task.status)).length;
  const progress = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  const post = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => requestJson<T>(API, { method: "POST", body: JSON.stringify(body) }), []);

  const save = useCallback(async () => {
    if (!activeTask || !model) return;
    setBusy(true);
    try {
      const result = await post<AnnotationToolReadModel>({
        action: "save_annotation",
        workspaceId: model.workspace.workspaceId,
        annotatorId: actorId,
        recordId: activeTask.recordId,
        aspectId: activeTask.aspectId,
        annotationRound: activeTask.annotationRound,
        label,
        confidence,
        evidenceNote,
        contradictionNote,
        guidelineVersion: model.workspace.guidelineVersion,
        expectedRevision: activeAnnotation?.revision ?? 0,
      });
      setModel(result);
      setValidation(result.validation);
      setMessage("Annotation güvenli biçimde kaydedildi.");
    } catch (error) {
      setMessage(error instanceof Error && error.message === "annotation_revision_conflict"
        ? "Kayıt başka bir revision ile değişti; workspace yeniden yükleniyor."
        : error instanceof Error ? error.message : "Annotation kaydedilemedi.");
      await loadWorkspace(model.workspace.workspaceId).catch(() => undefined);
    } finally { setBusy(false); }
  }, [activeAnnotation, activeTask, actorId, confidence, contradictionNote, evidenceNote, label, loadWorkspace, model, post]);

  const selectTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    const task = tasks.find((entry) => entry.taskId === taskId);
    const existing = model?.annotations.find((entry) => entry.active
      && entry.annotation.recordId === task?.recordId
      && entry.annotation.aspectId === task?.aspectId
      && entry.annotation.annotationRound === task?.annotationRound
      && entry.annotation.annotatorId === actorId);
    setLabel(existing?.annotation.label ?? "insufficient_evidence");
    setConfidence(existing?.annotation.confidence ?? "low");
    setEvidenceNote(existing?.annotation.evidenceNotes[0] ?? "");
    setContradictionNote(existing?.annotation.contradictionNotes[0] ?? "");
  }, [actorId, model?.annotations, tasks]);

  const move = useCallback((delta: number) => {
    if (tasks.length === 0) return;
    const next = Math.min(tasks.length - 1, Math.max(0, activeIndex + delta));
    selectTask(tasks[next]?.taskId ?? "");
  }, [activeIndex, selectTask, tasks]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;
      const shortcut = resolveAnnotationShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut.kind === "label") setLabel(shortcut.value);
      if (shortcut.kind === "confidence") setConfidence(shortcut.value);
      if (shortcut.kind === "save") void save();
      if (shortcut.kind === "next") move(1);
      if (shortcut.kind === "previous") move(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [move, save]);

  const conflictTask = useMemo(() => model?.tasks.find((task) => task.status === "conflict") ?? null, [model]);
  const conflictAnnotations = useMemo(() => conflictTask ? model?.annotations.filter((entry) => entry.active
    && entry.annotation.recordId === conflictTask.recordId
    && entry.annotation.aspectId === conflictTask.aspectId
    && entry.annotation.annotationRound === conflictTask.annotationRound) ?? [] : [], [conflictTask, model]);

  async function createWorkspace() {
    setBusy(true);
    try {
      const result = await post<AnnotationToolReadModel>({ action: "create_workspace", workspaceId: newWorkspaceId, actorId });
      setModel(result); setWorkspaceId(result.workspace.workspaceId); setValidation(result.validation); setMessage("Draft workspace oluşturuldu.");
      await loadList();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Workspace oluşturulamadı."); }
    finally { setBusy(false); }
  }

  async function previewImport() {
    if (!model) return;
    try {
      const bundle = JSON.parse(importRaw) as unknown;
      const preview = await post<AnnotationImportPreview>({ action: "preview_import", workspaceId, bundle });
      setImportPreview(preview);
      setMessage("Import önizlemesi hazır; mutation için açık onay gerekir.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import önizlenemedi."); }
  }

  async function applyImportConfirmed() {
    if (!model || !importPreview) return;
    setBusy(true);
    try {
      const result = await post<AnnotationToolReadModel>({ action: "apply_import", workspaceId, actorId, confirmed: true, bundle: JSON.parse(importRaw) });
      setModel(result); setValidation(result.validation); setImportPreview(null); setMessage("Onaylanan kayıtlar import edildi.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import uygulanamadı."); }
    finally { setBusy(false); }
  }

  async function generateTasks() {
    if (!model) return;
    setBusy(true);
    try {
      const result = await post<AnnotationToolReadModel>({ action: "generate_tasks", workspaceId, actorId, selection: { mode: "all_selected" }, requiredAnnotationCount: 1 });
      setModel(result); setValidation(result.validation); setActiveTaskId(result.tasks[0]?.taskId ?? ""); setMessage("Deterministik sparse-compatible task listesi oluşturuldu.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Task üretilemedi."); }
    finally { setBusy(false); }
  }

  async function runValidation() {
    if (!model) return;
    try { setValidation(await post<AnnotationValidationIssue[]>({ action: "validate", workspaceId, actorId })); setMessage("Workspace lint tamamlandı."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Validation çalışmadı."); }
  }

  async function exportBundle(purpose: string) {
    if (!model) return;
    try {
      const result = await post<unknown>({ action: "export", workspaceId, actorId, purpose });
      const raw = JSON.stringify(result, null, 2);
      setExportPreview(raw);
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${workspaceId}-${purpose}.json`; anchor.click(); URL.revokeObjectURL(url);
      setMessage("Sanitised internal-only export hazırlandı.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export hazırlanamadı."); }
  }

  async function adjudicateConflict() {
    if (!model || !conflictTask || conflictAnnotations.length < 2) return;
    try {
      const result = await post<AnnotationToolReadModel>({
        action: "adjudicate", workspaceId, taskId: conflictTask.taskId,
        comparedAnnotationIds: conflictAnnotations.map((entry) => entry.annotation.annotationId),
        finalLabel: label, finalConfidence: confidence, adjudicatorId: actorId,
        rationale: contradictionNote || "Sentetik demo conflict'i guideline ile çözüldü.",
        adjudicatorWasAnnotator: conflictAnnotations.some((entry) => entry.annotation.annotatorId === actorId),
      });
      setModel(result); setValidation(result.validation); setMessage("Conflict adjudicate edildi; iki kaynak annotation korunuyor.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Adjudication kaydedilemedi."); }
  }

  async function revokeActiveRecord() {
    if (!model || !activeRecord) return;
    try {
      const result = await post<AnnotationToolReadModel>({
        action: "revoke", workspaceId, createdBy: actorId, scope: "record", targetId: activeRecord.record.recordId,
        reasonCode: "manual_withdrawal", note: "Local D7-1A manual revocation.",
        actions: ["exclude_from_training", "exclude_from_evaluation", "exclude_from_export"],
      });
      setModel(result); setValidation(result.validation); setMessage("Revocation eklendi; kayıt export/evaluation/training dışında.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Revocation kaydedilemedi."); }
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 p-3 text-zinc-100 md:p-6" data-testid="annotation-tool">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">D7-1A · local development</p><h1 className="text-2xl font-semibold">Aspect Annotation Workspace</h1><p className="text-sm text-zinc-400">Provider fetch, model prediction ve kişisel veri yoktur.</p></div>
          <div className="text-right text-sm"><p>Durum: <strong>{model?.workspace.status ?? "workspace yok"}</strong></p><p aria-live="polite">İlerleme: {completed}/{tasks.length} (%{progress})</p></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">Workspace<select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2" value={workspaceId} onChange={(event) => void loadWorkspace(event.target.value)}><option value="">Seç</option>{workspaceIds.map((id) => <option key={id}>{id}</option>)}</select></label>
          <label className="text-sm">Yeni workspace ID<input className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2" value={newWorkspaceId} onChange={(event) => setNewWorkspaceId(event.target.value)} /></label>
          <label className="text-sm">Pseudonymous annotator<input className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2" value={actorId} onChange={(event) => setActorId(event.target.value)} /></label>
          <button className="self-end rounded bg-violet-600 px-3 py-2 font-medium disabled:opacity-50" disabled={busy} onClick={() => void createWorkspace()}>Draft oluştur</button>
          <button className="self-end rounded border border-zinc-700 px-3 py-2 disabled:opacity-50" disabled={!model || busy} onClick={() => void generateTasks()}>Task üret</button>
        </div>
        {message && <p role="status" className="mt-3 rounded border border-zinc-700 bg-zinc-950 p-2 text-sm">{message}</p>}
      </header>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.5fr)_minmax(280px,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
          <h2 className="mb-2 font-semibold">Görevler</h2>
          <div className="max-h-[64vh] space-y-1 overflow-y-auto">
            {tasks.map((task) => <button key={task.taskId} className={`w-full rounded border p-2 text-left text-sm ${task.taskId === activeTaskId ? "border-violet-400 bg-violet-500/15" : "border-zinc-800 bg-zinc-950"}`} onClick={() => selectTask(task.taskId)}><span className="block truncate font-medium">{model?.records.find((entry) => entry.record.recordId === task.recordId)?.titleSnapshot ?? task.recordId}</span><span className="text-xs text-zinc-400">{model?.aspects.find((entry) => entry.id === task.aspectId)?.labelTr} · {task.status}</span></button>)}
            {tasks.length === 0 && <p className="text-sm text-zinc-500">Henüz task yok.</p>}
          </div>
        </aside>

        <article className="min-w-0 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div><p className="text-xs uppercase text-zinc-500">Kısa ve bounded kayıt</p><h2 className="break-words text-xl font-semibold">{activeRecord?.titleSnapshot ?? "Task seçin"}</h2><p className="text-sm text-zinc-400">{activeRecord?.record.candidate.format ?? "—"} · {activeRecord?.record.candidate.language ?? "—"}/{activeRecord?.record.candidate.country ?? "—"}</p></div>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 text-sm leading-6">{activeRecord?.record.candidate.shortSummary ?? "Kısa özet yok."}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Genres</dt><dd className="break-words">{activeRecord?.record.candidate.genres.join(", ") || "—"}</dd></div><div><dt className="text-zinc-500">Tags + rank</dt><dd className="break-words">{activeRecord?.record.candidate.tags.map((tag) => `${tag.name}${tag.rank === undefined ? "" : ` (${tag.rank})`}`).join(", ") || "—"}</dd></div><div><dt className="text-zinc-500">Keywords</dt><dd className="break-words">{activeRecord?.record.candidate.keywords.join(", ") || "—"}</dd></div><div><dt className="text-zinc-500">Provenance / kullanım</dt><dd>{activeRecord ? `${activeRecord.provenance.contentOrigin} · ${activeRecord.provenance.allowedUses.join(", ")}` : "—"}</dd></div></dl>
          <div className="rounded-xl border border-zinc-700 p-3"><p className="font-semibold">{activeAspect?.labelTr ?? "Aspect"}</p><p className="text-sm text-zinc-400">{activeAspect?.descriptionTr}</p><p className="mt-1 text-xs text-zinc-500">Absent, yalnız tag yokluğu değildir; insufficient evidence absent değildir.</p></div>
          <div className="flex justify-between"><button className="rounded border border-zinc-700 px-3 py-2" onClick={() => move(-1)} disabled={activeIndex <= 0}>P · Önceki</button><button className="rounded border border-zinc-700 px-3 py-2" onClick={() => move(1)} disabled={activeIndex < 0 || activeIndex >= tasks.length - 1}>N · Sonraki</button></div>
        </article>

        <form className="min-w-0 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset><legend className="mb-2 font-semibold">Aspect seviyesi</legend><div className="space-y-2">{(Object.keys(ANNOTATION_LABEL_UI) as AspectAnnotationLabel[]).map((value, index) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded border border-zinc-800 p-2"><input type="radio" name="annotation-label" value={value} checked={label === value} onChange={() => setLabel(value)} /><span>{index + 1}. {ANNOTATION_LABEL_UI[value]}</span></label>)}</div></fieldset>
          <fieldset><legend className="mb-2 font-semibold">Annotation confidence</legend><div className="flex flex-wrap gap-3">{(Object.keys(ANNOTATION_CONFIDENCE_UI) as AnnotationConfidence[]).map((value, index) => <label key={value} className="flex items-center gap-2"><input type="radio" name="annotation-confidence" value={value} checked={confidence === value} onChange={() => setConfidence(value)} /><span>Shift+{index + 1} {ANNOTATION_CONFIDENCE_UI[value]}</span></label>)}</div></fieldset>
          <label className="block text-sm" htmlFor="evidence-note">Kısa evidence note<textarea id="evidence-note" aria-describedby="evidence-help" className="mt-1 min-h-20 w-full rounded border border-zinc-700 bg-zinc-950 p-2" maxLength={280} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} /><span id="evidence-help" className="text-xs text-zinc-500">En fazla 280 karakter; uzun provider alıntısı yok.</span></label>
          <label className="block text-sm" htmlFor="contradiction-note">Çelişki notu<textarea id="contradiction-note" className="mt-1 min-h-16 w-full rounded border border-zinc-700 bg-zinc-950 p-2" maxLength={280} value={contradictionNote} onChange={(event) => setContradictionNote(event.target.value)} /></label>
          <button className="w-full rounded bg-emerald-600 px-3 py-2 font-semibold disabled:opacity-50" type="submit" disabled={!activeTask || busy}>Ctrl+S · Kaydet</button>
        </form>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><h2 className="font-semibold">Versioned local bundle import</h2><p className="text-sm text-zinc-400">Dosya yalnız tarayıcıda okunur; server provider fetch yapmaz.</p><input className="my-3 block w-full text-sm" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setImportRaw); }} /><textarea aria-label="Import JSON" className="min-h-36 w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs" value={importRaw} onChange={(event) => setImportRaw(event.target.value)} /><div className="mt-2 flex gap-2"><button className="rounded border border-zinc-700 px-3 py-2" onClick={() => void previewImport()}>Önizle</button><button className="rounded bg-violet-600 px-3 py-2 disabled:opacity-50" disabled={!importPreview || importPreview.invalid > 0 || importPreview.duplicateConflict > 0} onClick={() => void applyImportConfirmed()}>Onayla ve import et</button></div>{importPreview && <p className="mt-2 text-sm">Toplam {importPreview.total}; geçerli {importPreview.valid}; bozuk {importPreview.invalid}; same-skip {importPreview.duplicateSame}; conflict {importPreview.duplicateConflict}; unresolved {importPreview.unresolvedLicense}; revoked {importPreview.revoked}.</p>}</div>
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Workspace validation</h2><button className="rounded border border-zinc-700 px-3 py-1" onClick={() => void runValidation()}>Yenile</button></div><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{validation.map((entry, index) => <div key={`${entry.code}-${index}`} className={`rounded border p-2 text-sm ${issueTone(entry)}`}><strong>{entry.severity === "critical" ? "Kritik" : entry.severity === "warning" ? "Uyarı" : "Bilgi"}</strong><p>{entry.messageTr}</p><code className="text-xs text-zinc-400">{entry.code}</code></div>)}</div></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><h2 className="font-semibold">Conflict / adjudication</h2>{conflictTask ? <><p className="my-2 text-sm">{conflictTask.taskId}: {conflictAnnotations.map((entry) => `${entry.annotation.annotatorId}=${ANNOTATION_LABEL_UI[entry.annotation.label]}/${ANNOTATION_CONFIDENCE_UI[entry.annotation.confidence]}`).join(" · ")}</p><button className="rounded bg-amber-600 px-3 py-2" onClick={() => void adjudicateConflict()}>Mevcut form label&apos;i ile adjudicate et</button></> : <p className="mt-2 text-sm text-zinc-500">Çözülmemiş label conflict yok.</p>}</div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><h2 className="font-semibold">Revocation</h2><p className="my-2 text-sm text-zinc-400">Aktif kaydı training/evaluation/export dışında bırakır; kayıt silinmez.</p><button className="rounded bg-rose-700 px-3 py-2 disabled:opacity-50" disabled={!activeRecord} onClick={() => void revokeActiveRecord()}>Aktif kaydı revoke et</button></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><h2 className="font-semibold">Sanitised export</h2><div className="mt-2 flex flex-wrap gap-2"><button className="rounded border border-zinc-700 px-3 py-2" onClick={() => void exportBundle("annotation_only")}>Annotation-only</button><button className="rounded border border-zinc-700 px-3 py-2" onClick={() => void exportBundle("evaluation_candidate")}>Evaluation candidate</button></div>{exportPreview && <p className="mt-2 text-xs text-zinc-500">Internal-only JSON browser download hazırlandı ({exportPreview.length} karakter).</p>}</div>
      </section>
    </main>
  );
}
