import type { UserProgression } from "@/lib/user-progression";

export function ProfileProgressionSummary({ progression }: { progression: UserProgression }) {
  const worlds = [
    { key: "east", label: "Doğu", value: progression.worldCounts.east, color: "bg-amber-400" },
    { key: "screen", label: "Kadraj", value: progression.worldCounts.screen, color: "bg-cyan-400" },
    { key: "arch", label: "Arşiv", value: progression.worldCounts.arch, color: "bg-orange-400" },
  ] as const;
  const max = Math.max(1, ...worlds.map((world) => world.value));
  return (
    <section className="app-card rounded-2xl border p-4 sm:p-5">
      <h2 className="text-sm font-semibold">Dünya dağılımı</h2>
      <div className="mt-4 space-y-3">{worlds.map((world) => <div key={world.key}><div className="mb-1 flex justify-between text-xs"><span>{world.label}</span><span className="tabular-nums text-[var(--app-text-muted)]">{world.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-3)]"><div className={`h-full rounded-full ${world.color}`} style={{ width: `${world.value ? Math.max(5, Math.round(world.value / max * 100)) : 0}%` }} /></div></div>)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--app-border)] pt-4 text-sm sm:grid-cols-4"><div><p className="text-xs text-[var(--app-text-muted)]">Toplam XP</p><strong>{progression.totalXp}</strong></div><div><p className="text-xs text-[var(--app-text-muted)]">Seviye</p><strong>{progression.level}</strong></div><div><p className="text-xs text-[var(--app-text-muted)]">Tier</p><strong>{progression.tier}</strong></div><div><p className="text-xs text-[var(--app-text-muted)]">Baskın dünya</p><strong>{progression.dominantWorld}</strong></div></div>
    </section>
  );
}
