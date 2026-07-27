"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, GitMerge, ShieldAlert } from "lucide-react";
import {
  buildDuplicateMergePlanForCurrentState,
  executeDuplicateMerge,
  prepareDuplicateMergeForCurrentState,
  type DuplicateMergePlan,
  type DuplicateMergePreparation,
  type FieldMergeSelection,
} from "@/lib/duplicate-merge";
import type { DuplicateCandidateGroup } from "@/lib/duplicate-scanner";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import { flush } from "@/lib/sync-manager";
import type { MediaItem } from "@/lib/types";

interface DuplicateMergeWorkflowProps {
  ownerScope: LocalOwnerScope;
  candidate: DuplicateCandidateGroup;
  mediaList: MediaItem[];
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: "Başlık",
    type: "Tür",
    status: "Durum",
    currentProgress: "İlerleme",
    totalProgress: "Toplam ilerleme",
    rating: "Puan",
    userRating: "Kullanıcı puanı",
    personalNotes: "Kişisel not",
    releaseYear: "Yayın yılı",
    coverImage: "Kapak",
    genres: "Türler",
    tags: "Etiketler",
    authors: "Yazarlar",
    languages: "Diller",
    subjects: "Konular",
    isbn: "ISBN",
  };
  return labels[field] ?? field;
}

export default function DuplicateMergeWorkflow({
  ownerScope,
  candidate,
  mediaList,
}: DuplicateMergeWorkflowProps) {
  const [open, setOpen] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [preparation, setPreparation] = useState<DuplicateMergePreparation | null>(null);
  const [survivorRecordId, setSurvivorRecordId] = useState("");
  const [canonicalIdentityKey, setCanonicalIdentityKey] = useState("");
  const [fieldSelections, setFieldSelections] = useState<Record<string, FieldMergeSelection>>({});
  const [revealedSensitiveFields, setRevealedSensitiveFields] = useState<Set<string>>(new Set());
  const [probableConfirmed, setProbableConfirmed] = useState(false);
  const [explicitConfirmed, setExplicitConfirmed] = useState(false);
  const [plan, setPlan] = useState<DuplicateMergePlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemById = useMemo(
    () => new Map(mediaList.map((item) => [item.id, item])),
    [mediaList],
  );

  function toggleRecord(recordId: string) {
    setSelectedRecordIds((current) =>
      current.includes(recordId)
        ? current.filter((entry) => entry !== recordId)
        : [...current, recordId]);
    setPreparation(null);
    setPlan(null);
  }

  function prepare() {
    setError(null);
    setMessage(null);
    const result = prepareDuplicateMergeForCurrentState(
      ownerScope,
      candidate,
      selectedRecordIds,
    );
    if (!result.ok) {
      setError(result.blocker.message);
      return;
    }
    setPreparation(result.preparation);
    if (result.preparation.blockers.length > 0) {
      setError(result.preparation.blockers.map((entry) => entry.message).join(" "));
      return;
    }
    const survivor = result.preparation.survivorOptions[0]?.id ?? "";
    setSurvivorRecordId(survivor);
    setCanonicalIdentityKey(result.preparation.suggestedCanonicalIdentityKey ?? "");
    setFieldSelections(Object.fromEntries(
      result.preparation.fieldConflicts.map((conflict) => [
        String(conflict.field),
        { kind: "record", recordId: survivor } satisfies FieldMergeSelection,
      ]),
    ));
    setPlan(null);
  }

  function validatePlan() {
    if (!preparation) return;
    setError(null);
    setMessage(null);
    const result = buildDuplicateMergePlanForCurrentState(ownerScope, candidate, {
      selectedRecordIds,
      survivorRecordId,
      canonicalIdentityKey,
      fieldSelections,
      probableConfirmed,
      explicitMergeConfirmed: explicitConfirmed,
    });
    if (!result.ok) {
      setPlan(null);
      setError(result.blockers.map((entry) => entry.message).join(" "));
      return;
    }
    setPlan(result.plan);
    setMessage("Plan güncel local state ile doğrulandı. Uygulamadan önce son özeti kontrol et.");
  }

  function applyMerge() {
    if (!plan) return;
    setError(null);
    const result = executeDuplicateMerge(ownerScope, plan, {
      triggerSync: () => {
        void flush();
      },
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(
      result.state === "sync-pending"
        ? "Local merge tamamlandı; cloud işlemleri durable queue içinde bekliyor."
        : "Local merge tamamlandı ve read-back doğrulandı.",
    );
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/25"
      >
        <GitMerge className="h-3.5 w-3.5" />
        Birleştirmeyi hazırla
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Kayıt seçimi otomatik yapılmaz. Birleştirme kaybeden local kayıtları kaldırır,
              ilişkilerini survivor kayda taşır. XP korunacak; bu işlem XP toplamını değiştirmez.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-zinc-300">
              1. Birleştirilecek alt kümeyi seç
            </legend>
            {candidate.recordIds.map((recordId) => {
              const item = itemById.get(recordId);
              return (
                <label
                  key={recordId}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-800 p-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedRecordIds.includes(recordId)}
                    onChange={() => toggleRecord(recordId)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-zinc-200">
                      {item?.title ?? "Eksik kayıt"}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {item?.identity?.key ?? recordId}
                    </span>
                  </span>
                </label>
              );
            })}
            <button
              type="button"
              onClick={prepare}
              disabled={selectedRecordIds.length < 2}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Seçimi doğrula
            </button>
          </fieldset>

          {preparation && preparation.blockers.length === 0 && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-zinc-400">
                  2. Survivor local kayıt
                  <select
                    value={survivorRecordId}
                    onChange={(event) => {
                      const recordId = event.target.value;
                      setSurvivorRecordId(recordId);
                      setPlan(null);
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-200"
                  >
                    {preparation.survivorOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.title} ({item.id})</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-zinc-400">
                  3. Canonical identity
                  <select
                    value={canonicalIdentityKey}
                    onChange={(event) => {
                      setCanonicalIdentityKey(event.target.value);
                      setPlan(null);
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-200"
                  >
                    {preparation.canonicalIdentityOptions.map((identity) => (
                      <option key={identity.key} value={identity.key}>{identity.key}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-300">4. Alan çakışmalarını çöz</p>
                {preparation.fieldConflicts.map((conflict) => {
                  const key = String(conflict.field);
                  const revealed = revealedSensitiveFields.has(key);
                  const selection = fieldSelections[key];
                  return (
                    <div key={key} className="rounded-lg border border-zinc-800 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-zinc-300">{fieldLabel(key)}</p>
                        {conflict.sensitive && !revealed && (
                          <button
                            type="button"
                            onClick={() => setRevealedSensitiveFields((current) =>
                              new Set([...current, key]))}
                            className="text-[10px] text-amber-300 underline"
                          >
                            İçeriği açıkça göster
                          </button>
                        )}
                      </div>
                      <select
                        value={selection?.kind === "union"
                          ? "__union__"
                          : selection?.recordId ?? survivorRecordId}
                        onChange={(event) => {
                          const value = event.target.value;
                          setFieldSelections((current) => ({
                            ...current,
                            [key]: value === "__union__"
                              ? { kind: "union", recordIds: selectedRecordIds }
                              : { kind: "record", recordId: value },
                          }));
                          setPlan(null);
                        }}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
                      >
                        {conflict.recordIds.map((recordId) => (
                          <option key={recordId} value={recordId}>
                            {itemById.get(recordId)?.title ?? recordId}
                            {" — "}
                            {conflict.sensitive && !revealed
                              ? "gizli içerik"
                              : conflict.sensitive
                                ? String(
                                    (itemById.get(recordId) as unknown as Record<string, unknown>)
                                      ?.[key] ?? "Boş",
                                  ).slice(0, 160)
                                : conflict.summaries[recordId]}
                          </option>
                        ))}
                        {conflict.collection && (
                          <option value="__union__">Seçili kayıtların açık union’ı</option>
                        )}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-[11px] leading-5 text-zinc-400">
                <p>Taşınacak log: {preparation.relationshipSummary.progressLogCountBefore}</p>
                <p>
                  Etkilenen grup: {
                    new Set(Object.values(preparation.relationshipSummary.groupMemberships).flat()).size
                  }
                </p>
                <p>
                  Korunacak legacy XP anahtarı: {
                    new Set(Object.values(preparation.relationshipSummary.xpCompatibilityKeys)).size
                  }
                </p>
                <p>
                  Cloud: {ownerScope.kind === "guest"
                    ? "Guest için işlem üretilmez"
                    : "Upsert/delete durable queue'ya yazılır"}
                </p>
              </div>

              {candidate.classification === "probable" && (
                <label className="flex gap-2 text-xs text-amber-200">
                  <input
                    type="checkbox"
                    checked={probableConfirmed}
                    onChange={(event) => {
                      setProbableConfirmed(event.target.checked);
                      setPlan(null);
                    }}
                  />
                  Bu kayıtların aynı medyayı temsil ettiğini doğruluyorum.
                </label>
              )}
              <label className="flex gap-2 text-xs text-rose-200">
                <input
                  type="checkbox"
                  checked={explicitConfirmed}
                  onChange={(event) => {
                    setExplicitConfirmed(event.target.checked);
                    setPlan(null);
                  }}
                />
                Kaybeden kayıtların kaldırılacağını ve ilişkilerin survivor kayda taşınacağını onaylıyorum.
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={validatePlan}
                  disabled={!explicitConfirmed
                    || (candidate.classification === "probable" && !probableConfirmed)}
                  className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
                >
                  5. Planı yeniden doğrula
                </button>
                <button
                  type="button"
                  onClick={applyMerge}
                  disabled={!plan}
                  className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  6. Merge’i uygula
                </button>
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="flex gap-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {message && (
            <div className="flex gap-2 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
