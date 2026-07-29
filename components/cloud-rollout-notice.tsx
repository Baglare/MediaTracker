"use client";

import type { CloudRolloutContract } from "@/lib/cloud-rollout";

export default function CloudRolloutNotice({
  contract,
}: {
  contract: CloudRolloutContract;
}) {
  if (contract.status === "ready") return null;
  return (
    <section
      role="alert"
      className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100"
    >
      <p className="font-semibold">
        {contract.status === "maintenance"
          ? "Cloud medya bakımı"
          : contract.requiresReload
            ? "Uygulama yenilemesi gerekiyor"
            : "Cloud medya senkronizasyonu durduruldu"}
      </p>
      <p className="mt-1 text-xs leading-5 text-amber-200/90">
        {contract.message}
      </p>
      {contract.requiresReload && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-semibold text-zinc-950"
        >
          Uygulamayı yenile
        </button>
      )}
    </section>
  );
}
