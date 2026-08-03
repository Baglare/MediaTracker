"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { createUserOwnerScope } from "@/lib/local-owner-scope";
import {
  decideLegacyPersonalOwnership,
  inspectLegacyPersonalData,
  type LegacyPersonalDataCandidate,
  type PersonalOwnershipDecision,
} from "@/lib/personal-data-ownership";

const LABELS = {
  profile: "Yerel profil",
  themes: "Özel temalar",
  ai: "Yapay zekâ geçmişi",
} as const;

export function PersonalDataOwnershipPanel() {
  const auth = useAuth();
  const scope = useMemo(
    () => auth.user ? createUserOwnerScope(auth.user.id) : null,
    [auth.user],
  );
  const [candidates, setCandidates] = useState<LegacyPersonalDataCandidate[]>([]);
  const [message, setMessage] = useState<string>();

  const refresh = () => {
    setCandidates(scope ? inspectLegacyPersonalData(scope, window.localStorage) : []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage candidate hydration
    setCandidates(scope ? inspectLegacyPersonalData(scope, window.localStorage) : []);
  }, [scope]);

  if (!scope || candidates.length === 0) return null;

  const decide = (
    candidate: LegacyPersonalDataCandidate,
    decision: PersonalOwnershipDecision,
  ) => {
    const result = decideLegacyPersonalOwnership(
      scope,
      candidate,
      decision,
      window.localStorage,
    );
    setMessage(result.ok
      ? "Karar kaydedildi. İlgili bölüm bir sonraki yüklemede yeni sahip verisini kullanacak."
      : result.message ?? "Karar kaydedilemedi; kaynak veri korunuyor.");
    refresh();
  };

  return (
    <CollapsibleSection
      storageKey="legacy-personal-data"
      title="Eski kişisel yerel veriler bulundu"
      description="Bu veriler hesap ad alanları eklenmeden önce oluşturulmuş. Her veri alanı için sahipliği ayrı seç; hiçbiri bu hesaba otomatik atanmaz."
      badge={<span className="rounded-md border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] text-[var(--app-text-secondary)]">{candidates.length} kayıt grubu</span>}
      icon={<ShieldCheck className="h-5 w-5 text-[var(--app-accent-strong)]" />}
      className="app-panel rounded-2xl border p-[var(--app-panel-padding)] lg:col-span-2"
      contentClassName="border-t border-[var(--app-border)] pt-4"
    >
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {candidates.map((candidate) => (
          <article
            key={`${candidate.domain}:${candidate.fingerprint}`}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-4"
          >
            <h3 className="text-sm font-semibold text-[var(--app-text-primary)]">
              {LABELS[candidate.domain]}
            </h3>
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">
              {candidate.recordCount} kayıt · {candidate.deferred
                ? "karar ertelendi, kaynak ve yedek korunuyor"
                : "ham yedek hazırlanacak"}
            </p>
            {candidate.hasSensitiveConsent && (
              <p className="mt-2 text-xs text-[var(--app-warning)]">
                Eski not izni bulundu; hesaba aktarımda yeniden kapalı başlatılır.
              </p>
            )}
            {candidate.destinationHasData && (
              <p className="mt-2 text-xs text-[var(--app-warning)]">
                Hedef dolu; otomatik değiştirme veya birleştirme yapılmaz.
              </p>
            )}
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                disabled={candidate.destinationHasData}
                onClick={() => decide(candidate, "assigned_to_user")}
                className="min-h-10 rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-[var(--app-accent-contrast)] disabled:cursor-not-allowed disabled:bg-[var(--app-disabled-bg)]"
              >
                Bu hesap için kullan
              </button>
              <button
                type="button"
                onClick={() => decide(candidate, "assigned_to_guest")}
                className="min-h-10 rounded-lg border border-[var(--app-border-strong)] px-3 text-xs"
              >
                Misafir verisi olarak sakla
              </button>
              <button
                type="button"
                onClick={() => decide(candidate, "deferred")}
                className="min-h-10 rounded-lg border border-[var(--app-border)] px-3 text-xs"
              >
                Şimdilik ertele
              </button>
              <button
                type="button"
                onClick={() => decide(candidate, "backup_only")}
                className="min-h-10 rounded-lg px-3 text-xs text-[var(--app-text-muted)]"
              >
                Yalnız yedek olarak koru
              </button>
            </div>
          </article>
        ))}
      </div>
      {message && <p className="mt-3 text-xs text-[var(--app-text-muted)]">{message}</p>}
    </CollapsibleSection>
  );
}
