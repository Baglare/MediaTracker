import { PageSection } from "@/components/ui/page-section";
import { StatCard } from "@/components/ui/stat-card";
import type { UserProgression } from "@/lib/user-progression";

export function ProfileProgressionSummary({ progression }: { progression: UserProgression }) {
  const metricSource = progression.worldMetric === "xp"
    ? "xp"
    : progression.worldMetric === "media_count"
      ? "media_count"
      : "unknown";
  const worldLabels = { east: "Doğu", screen: "Kadraj", arch: "Arşiv", mixed: "Karma" } as const;
  const tierLabels = { basic: "Başlangıç", refined: "Gelişmiş", elite: "Seçkin", master: "Usta" } as const;
  const worlds = [
    { key: "east", label: "Doğu", value: progression.worldCounts.east },
    { key: "screen", label: "Kadraj", value: progression.worldCounts.screen },
    { key: "arch", label: "Arşiv", value: progression.worldCounts.arch },
  ] as const;
  const max = Math.max(1, ...worlds.map((world) => world.value));
  return (
    <PageSection
      title={metricSource === "xp"
        ? "Dünya XP dağılımı"
        : metricSource === "media_count"
          ? "Kütüphane dünya dağılımı"
          : "Dünya dağılımı"}
      description={metricSource === "xp"
        ? "Değerler dünyalara ayrılan XP miktarıdır. Dünya toplamı; sosyal, bonus ve sistem XP'sini içeren genel XP ile eşit olmak zorunda değildir."
        : metricSource === "media_count"
          ? "Değerler kütüphanendeki medya kayıtlarının dünyalara göre adedidir; XP değildir."
          : "Dağılım kaynağı doğrulanamadı; değerler kaynak birimi belirtilmeden gösterilir."}
    >
      <div className="space-y-3">{worlds.map((world) => <div key={world.key} data-world={world.key}><div className="mb-1 flex justify-between text-xs"><span>{world.label}</span><span className="tabular-nums text-[var(--app-text-muted)]">{world.value}{metricSource === "xp" ? " XP" : metricSource === "media_count" ? " medya" : " birim"}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-3)]"><div className="h-full rounded-full bg-[var(--w-primary)]" style={{ width: `${world.value ? Math.max(5, Math.round(world.value / max * 100)) : 0}%` }} /></div></div>)}</div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--app-section-divider)] pt-4 sm:grid-cols-4"><StatCard label="Toplam XP" value={progression.totalXp}/><StatCard label="Seviye" value={progression.level}/><StatCard label="Tier" value={tierLabels[progression.tier]}/><StatCard label="Baskın dünya" value={worldLabels[progression.dominantWorld]}/></div>
    </PageSection>
  );
}
