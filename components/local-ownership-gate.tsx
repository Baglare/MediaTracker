"use client";

import type { LocalOwnershipCandidate } from "@/lib/local-data-ownership";

export function LocalOwnershipGate({
  candidate,
  accountLabel,
  onAssignToUser,
  onKeepAsGuest,
  onKeepCurrent,
  onDefer,
  message,
}: {
  candidate: LocalOwnershipCandidate;
  accountLabel: string;
  onAssignToUser: () => void;
  onKeepAsGuest: () => void;
  onKeepCurrent: () => void;
  onDefer: () => void;
  message?: string | null;
}) {
  return (
    <section
      className="mx-auto max-w-2xl rounded-3xl border border-[var(--app-warning)] bg-[var(--app-warning-soft)] p-6"
      aria-labelledby="local-ownership-title"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-warning)]">
        Yerel veri sahipliği
      </p>
      <h1 id="local-ownership-title" className="mt-2 text-xl font-semibold">
        Eski yerel kütüphane bulundu
      </h1>
      <p className="mt-3 text-sm leading-6 text-[var(--app-text-secondary)]">
        Bu tarayıcıda hesaplara ayrılmadan önce oluşturulmuş bir kütüphane bulundu.
        Verinin hangi profile ait olduğunu seçmelisin.
      </p>
      <dl className="mt-5 grid gap-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-bg)] p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[var(--app-text-muted)]">Kaynak</dt>
          <dd className="mt-1 text-sm font-medium">Eski yerel kayit</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--app-text-muted)]">Medya</dt>
          <dd className="mt-1 text-sm font-medium">{candidate.mediaCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--app-text-muted)]">İlerleme kaydı</dt>
          <dd className="mt-1 text-sm font-medium">{candidate.progressLogCount}</dd>
        </div>
      </dl>
      {candidate.destinationHasData && (
        <p className="mt-4 text-sm text-[var(--app-warning)]">
          {accountLabel} kütüphanesi dolu. Bu aşamada kayıt bazlı merge yapılmaz.
        </p>
      )}
      {candidate.guestDestinationHasData && (
        <p className="mt-2 text-sm text-[var(--app-warning)]">
          Guest kütüphanesi de dolu; eski veri guest verisinin üzerine yazılamaz.
        </p>
      )}
      {message && <p role="alert" className="mt-4 text-sm text-[var(--app-danger)]">{message}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        {!candidate.destinationHasData && (
          <button type="button" onClick={onAssignToUser} className="app-primary-action rounded-xl px-4 py-2 text-sm font-medium">
            Bu hesapta kullan
          </button>
        )}
        {candidate.destinationHasData && (
          <button type="button" onClick={onKeepCurrent} className="app-primary-action rounded-xl px-4 py-2 text-sm font-medium">
            Mevcut hesap verisini kullan
          </button>
        )}
        <button
          type="button"
          disabled={candidate.guestDestinationHasData}
          onClick={onKeepAsGuest}
          className="rounded-xl border border-[var(--app-border-strong)] px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Guest olarak sakla
        </button>
        <button type="button" onClick={onDefer} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm">
          Şimdilik karar verme
        </button>
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--app-text-muted)]">
        Global kaynak ve raw backup korunur. Bu ekranda kişisel not içeriği gösterilmez.
      </p>
    </section>
  );
}

export function DeferredOwnershipNotice({ onReopen }: { onReopen: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-warning)] bg-[var(--app-warning-soft)] p-3 text-sm">
      <span>Eski yerel kütüphanenin sahiplik kararı ertelendi; kaynak veri korunuyor.</span>
      <button
        type="button"
        onClick={onReopen}
        className="rounded-lg border border-[var(--app-warning)] px-3 py-1.5 font-medium"
      >
        Kararı yeniden aç
      </button>
    </div>
  );
}
