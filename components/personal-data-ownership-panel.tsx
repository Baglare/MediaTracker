"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { createUserOwnerScope } from "@/lib/local-owner-scope";
import {
  decideLegacyPersonalOwnership,
  inspectLegacyPersonalData,
  type LegacyPersonalDataCandidate,
  type PersonalOwnershipDecision,
} from "@/lib/personal-data-ownership";

const LABELS = {
  profile: "Yerel profil",
  themes: "Ozel temalar",
  ai: "AI gecmisi",
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
      ? "Karar kaydedildi. Aktif feature bir sonraki hydration'da yeni owner verisini kullanacak."
      : result.message ?? "Karar kaydedilemedi; kaynak veri korunuyor.");
    refresh();
  };

  return (
    <section className="app-panel rounded-2xl border p-[var(--app-panel-padding)] lg:col-span-2">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[var(--app-text-primary)]">
            Eski kisisel yerel veriler bulundu
          </h2>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            Bu veriler hesap namespace&apos;leri eklenmeden once olusturulmus. Her domain icin
            sahipligi ayri sec; hicbiri bu hesaba otomatik atanmaz.
          </p>
        </div>
      </div>
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
              {candidate.recordCount} kayit · {candidate.deferred
                ? "karar ertelendi, kaynak ve backup korunuyor"
                : "raw backup hazirlanacak"}
            </p>
            {candidate.hasSensitiveConsent && (
              <p className="mt-2 text-xs text-[var(--app-warning)]">
                Eski not izni bulundu; hesaba aktarimda yeniden kapali baslatilir.
              </p>
            )}
            {candidate.destinationHasData && (
              <p className="mt-2 text-xs text-[var(--app-warning)]">
                Hedef dolu; otomatik replace veya merge yapilmaz.
              </p>
            )}
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                disabled={candidate.destinationHasData}
                onClick={() => decide(candidate, "assigned_to_user")}
                className="min-h-10 rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-[var(--app-accent-contrast)] disabled:cursor-not-allowed disabled:bg-[var(--app-disabled-bg)]"
              >
                Bu hesap icin kullan
              </button>
              <button
                type="button"
                onClick={() => decide(candidate, "assigned_to_guest")}
                className="min-h-10 rounded-lg border border-[var(--app-border-strong)] px-3 text-xs"
              >
                Guest olarak sakla
              </button>
              <button
                type="button"
                onClick={() => decide(candidate, "deferred")}
                className="min-h-10 rounded-lg border border-[var(--app-border)] px-3 text-xs"
              >
                Simdilik ertele
              </button>
              <button
                type="button"
                onClick={() => decide(candidate, "backup_only")}
                className="min-h-10 rounded-lg px-3 text-xs text-[var(--app-text-muted)]"
              >
                Yalniz backup olarak koru
              </button>
            </div>
          </article>
        ))}
      </div>
      {message && <p className="mt-3 text-xs text-[var(--app-text-muted)]">{message}</p>}
    </section>
  );
}
